"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.metadata = void 0;
const db_1 = require("@b/db");
const utils_1 = require("../../utils");
const errors_1 = require("@b/utils/schema/errors");
const error_1 = require("@b/utils/error");
const wallet_1 = require("@b/api/(ext)/ecosystem/utils/wallet");
const wallet_2 = require("@b/services/wallet");
exports.metadata = {
    summary: "Withdraw liquidity from AI Market Maker pool",
    operationId: "withdrawFromMarketMakerPool",
    tags: ["Admin", "AI Market Maker", "Pool"],
    description: "Withdraws liquidity from an AI Market Maker pool back to the admin\'s wallet. The withdrawal can be in either base or quote currency. Can only be performed when the market maker is paused or stopped. Updates pool balance and TVL accordingly.",
    logModule: "ADMIN_MM",
    logTitle: "Withdraw from Market Maker Pool",
    parameters: [
        {
            index: 0,
            name: "marketId",
            in: "path",
            required: true,
            description: "ID of the AI Market Maker",
            schema: { type: "string" },
        },
    ],
    requestBody: {
        required: true,
        content: {
            "application/json": {
                schema: utils_1.poolWithdrawSchema,
            },
        },
    },
    responses: {
        200: {
            description: "Pool withdrawal completed successfully",
            content: {
                "application/json": {
                    schema: {
                        type: "object",
                        properties: {
                            ...utils_1.aiMarketMakerPoolSchema,
                            wallet: {
                                type: "object",
                                properties: {
                                    currency: {
                                        type: "string",
                                        description: "Currency symbol",
                                    },
                                    balanceAfter: {
                                        type: "number",
                                        description: "Admin wallet balance after withdrawal",
                                    },
                                },
                            },
                        },
                    },
                },
            },
        },
        400: errors_1.badRequestResponse,
        401: errors_1.unauthorizedResponse,
        404: (0, errors_1.notFoundResponse)("AI Market Maker Pool"),
        500: errors_1.serverErrorResponse,
    },
    requiresAuth: true,
    permission: "edit.ai.market-maker.pool",
};
exports.default = async (data) => {
    var _a;
    const { params, body, user, ctx } = data;
    const { currency, amount } = body;
    if (!(user === null || user === void 0 ? void 0 : user.id)) {
        throw (0, error_1.createError)(401, "Unauthorized");
    }
    if (amount <= 0) {
        throw (0, error_1.createError)(400, "Amount must be greater than 0");
    }
    ctx === null || ctx === void 0 ? void 0 : ctx.step("Fetch market maker with pool and market info");
    const marketMaker = await db_1.models.aiMarketMaker.findByPk(params.marketId, {
        include: [
            {
                model: db_1.models.aiMarketMakerPool,
                as: "pool",
            },
            {
                model: db_1.models.ecosystemMarket,
                as: "market",
            },
        ],
    });
    if (!marketMaker) {
        throw (0, error_1.createError)(404, "AI Market Maker not found");
    }
    const pool = marketMaker.pool;
    if (!pool) {
        throw (0, error_1.createError)(404, "Pool not found for this market maker");
    }
    const market = marketMaker.market;
    if (!market) {
        throw (0, error_1.createError)(404, "Ecosystem market not found");
    }
    ctx === null || ctx === void 0 ? void 0 : ctx.step("Validate market maker is not active");
    // Check if market maker is active
    if (marketMaker.status === "ACTIVE") {
        throw (0, error_1.createError)(400, "Cannot withdraw from active market maker. Please pause or stop it first.");
    }
    ctx === null || ctx === void 0 ? void 0 : ctx.step("Validate pool balance");
    // Check available balance in pool
    const currentPoolBalance = currency === "BASE"
        ? Number(pool.baseCurrencyBalance)
        : Number(pool.quoteCurrencyBalance);
    if (amount > currentPoolBalance) {
        throw (0, error_1.createError)(400, `Insufficient pool balance. Available: ${currentPoolBalance}, Requested: ${amount}`);
    }
    // Determine which currency to use based on BASE or QUOTE
    const currencySymbol = currency === "BASE" ? market.currency : market.pair;
    // Get admin's ecosystem wallet for the currency
    const adminWallet = await (0, wallet_1.getWalletByUserIdAndCurrency)(user.id, currencySymbol);
    if (!adminWallet) {
        throw (0, error_1.createError)(404, `Wallet not found for ${currencySymbol}`);
    }
    ctx === null || ctx === void 0 ? void 0 : ctx.step("Execute withdrawal transaction");
    // Execute withdrawal within a transaction
    const result = await db_1.sequelize.transaction(async (transaction) => {
        // 1. Update pool balance
        const updateData = {};
        let balanceField;
        if (currency === "BASE") {
            balanceField = "baseCurrencyBalance";
            updateData.baseCurrencyBalance = currentPoolBalance - amount;
        }
        else {
            balanceField = "quoteCurrencyBalance";
            updateData.quoteCurrencyBalance = currentPoolBalance - amount;
        }
        // Calculate new TVL with proper null checks
        const baseBalance = currency === "BASE"
            ? updateData.baseCurrencyBalance
            : Number(pool.baseCurrencyBalance) || 0;
        const quoteBalance = currency === "QUOTE"
            ? updateData.quoteCurrencyBalance
            : Number(pool.quoteCurrencyBalance) || 0;
        const targetPrice = Number(marketMaker.targetPrice) || 0;
        updateData.totalValueLocked = baseBalance * targetPrice + quoteBalance;
        // 2. Update pool
        await pool.update(updateData, { transaction });
        // 3. Add to admin wallet using wallet service
        const creditResult = await wallet_2.walletService.credit({
            idempotencyKey: `admin_ai_mm_pool_withdraw_${pool.id}_${currency}`,
            userId: user.id,
            walletId: adminWallet.id,
            walletType: adminWallet.type,
            currency: currencySymbol,
            amount: amount,
            operationType: "AI_INVESTMENT_ROI",
            description: `Withdraw ${amount} ${currencySymbol} from AI Market Maker Pool`,
            metadata: {
                poolId: pool.id,
                marketMakerId: marketMaker.id,
                marketSymbol: market.symbol,
                currencyType: currency,
                action: "WITHDRAW",
            },
            transaction,
        });
        // 4. Log withdrawal in history
        await db_1.models.aiMarketMakerHistory.create({
            marketMakerId: marketMaker.id,
            action: "WITHDRAW",
            details: {
                currency,
                currencySymbol,
                amount,
                balanceBefore: currentPoolBalance,
                balanceAfter: updateData[balanceField],
                tvlAfter: updateData.totalValueLocked,
                toWallet: adminWallet.id,
                userId: user.id,
            },
            priceAtAction: marketMaker.targetPrice,
            poolValueAtAction: updateData.totalValueLocked,
        }, { transaction });
        return {
            pool: await db_1.models.aiMarketMakerPool.findByPk(pool.id, { transaction }),
            walletBalance: creditResult.newBalance,
        };
    });
    ctx === null || ctx === void 0 ? void 0 : ctx.success("Withdrawal completed successfully");
    // Return updated pool with wallet info
    return {
        ...(_a = result.pool) === null || _a === void 0 ? void 0 : _a.toJSON(),
        wallet: {
            currency: currencySymbol,
            balanceAfter: result.walletBalance,
        },
    };
};
