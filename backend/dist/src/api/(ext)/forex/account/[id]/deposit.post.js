"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.metadata = void 0;
const exchange_1 = __importDefault(require("@b/utils/exchange"));
const cron_1 = require("@b/cron");
const db_1 = require("@b/db");
const error_1 = require("@b/utils/error");
const console_1 = require("@b/utils/console");
const forex_fraud_detector_1 = require("@b/api/(ext)/forex/utils/forex-fraud-detector");
const wallet_1 = require("@b/services/wallet");
const query_1 = require("@b/utils/query");
exports.metadata = {
    summary: "Deposits money into a specified Forex account",
    description: "Allows a user to deposit money from their wallet into a Forex account.",
    operationId: "depositForexAccount",
    tags: ["Forex", "Accounts"],
    rateLimit: {
        windowMs: 60000, // 1 minute
        max: 5 // 5 financial operations per minute
    },
    parameters: [
        {
            index: 0,
            name: "id",
            in: "path",
            required: true,
            schema: { type: "string", description: "Forex account ID" },
        },
    ],
    requiresAuth: true,
    logModule: "FOREX",
    logTitle: "Deposit to forex account",
    requestBody: {
        required: true,
        content: {
            "application/json": {
                schema: {
                    type: "object",
                    properties: {
                        type: { type: "string", description: "Wallet type" },
                        currency: { type: "string", description: "Currency code" },
                        chain: {
                            type: "string",
                            description: "Blockchain network",
                            nullable: true,
                        },
                        amount: { type: "number", description: "Amount to deposit" },
                    },
                    required: ["type", "currency", "amount"],
                },
            },
        },
    },
    responses: {
        201: {
            description: "Deposit successfully processed",
            content: {
                "application/json": {
                    schema: {
                        type: "object",
                        properties: {
                            message: { type: "string", description: "Success message" },
                            transaction: {
                                type: "object",
                                properties: {
                                    id: { type: "string", description: "Transaction ID" },
                                    type: { type: "string", description: "Transaction type" },
                                    status: { type: "string", description: "Transaction status" },
                                    amount: { type: "number", description: "Transaction amount" },
                                    fee: { type: "number", description: "Transaction fee" },
                                    description: {
                                        type: "string",
                                        description: "Transaction description",
                                    },
                                    metadata: {
                                        type: "object",
                                        description: "Transaction metadata",
                                    },
                                    createdAt: {
                                        type: "string",
                                        format: "date-time",
                                        description: "Transaction creation date",
                                    },
                                },
                            },
                            balance: { type: "number", description: "Wallet balance" },
                            currency: { type: "string", description: "Currency code" },
                            chain: {
                                type: "string",
                                description: "Blockchain network",
                                nullable: true,
                            },
                            type: { type: "string", description: "Deposit method type" },
                        },
                    },
                },
            },
        },
        401: query_1.unauthorizedResponse,
        404: (0, query_1.notFoundMetadataResponse)("Forex Account"),
        500: query_1.serverErrorResponse,
    },
};
exports.default = async (data) => {
    const { user, params, body, req, ctx } = data;
    if (!(user === null || user === void 0 ? void 0 : user.id)) {
        throw (0, error_1.createError)({ statusCode: 401, message: "Unauthorized" });
    }
    const { id } = params;
    const { amount, type, currency, chain } = body;
    try {
        ctx === null || ctx === void 0 ? void 0 : ctx.step("Validating deposit amount");
        if (!amount || amount <= 0)
            throw (0, error_1.createError)({ statusCode: 400, message: "Amount is required and must be greater than zero" });
        if (amount <= 0)
            throw (0, error_1.createError)({ statusCode: 400, message: "Amount must be greater than zero" });
        let updatedBalance;
        let taxAmount = 0;
        const transaction = await db_1.sequelize.transaction(async (t) => {
            var _a, _b, _c;
            ctx === null || ctx === void 0 ? void 0 : ctx.step("Verifying forex account");
            const account = await db_1.models.forexAccount.findByPk(id, {
                transaction: t,
            });
            if (!account)
                throw (0, error_1.createError)({ statusCode: 404, message: "Account not found" });
            ctx === null || ctx === void 0 ? void 0 : ctx.step("Running fraud detection checks");
            // Fraud detection check inside transaction
            const fraudCheck = await forex_fraud_detector_1.ForexFraudDetector.checkDeposit(user.id, amount, currency, ctx);
            if (!fraudCheck.isValid) {
                throw (0, error_1.createError)({
                    statusCode: 400,
                    message: fraudCheck.reason || "Deposit flagged for security review"
                });
            }
            // Validate user ownership
            if (account.userId !== user.id) {
                throw (0, error_1.createError)({ statusCode: 403, message: "Access denied: You can only deposit to your own forex accounts" });
            }
            ctx === null || ctx === void 0 ? void 0 : ctx.step(`Fetching ${type} wallet for ${currency}`);
            const wallet = await db_1.models.wallet.findOne({
                where: { userId: user.id, type, currency },
                transaction: t,
            });
            if (!wallet)
                throw (0, error_1.createError)({ statusCode: 404, message: "Wallet not found" });
            ctx === null || ctx === void 0 ? void 0 : ctx.step("Checking wallet balance");
            if (wallet.balance < amount)
                throw (0, error_1.createError)({ statusCode: 400, message: "Insufficient balance" });
            ctx === null || ctx === void 0 ? void 0 : ctx.step("Calculating transaction fees");
            let currencyData;
            switch (type) {
                case "FIAT":
                    currencyData = await db_1.models.currency.findOne({
                        where: { id: wallet.currency },
                        transaction: t,
                    });
                    if (!currencyData || !currencyData.price) {
                        await (0, cron_1.fetchFiatCurrencyPrices)();
                        currencyData = await db_1.models.currency.findOne({
                            where: { id: wallet.currency },
                            transaction: t,
                        });
                        if (!currencyData || !currencyData.price)
                            throw (0, error_1.createError)({ statusCode: 500, message: "Currency processing failed" });
                    }
                    break;
                case "SPOT":
                    {
                        currencyData = await db_1.models.exchangeCurrency.findOne({
                            where: { currency: wallet.currency },
                            transaction: t,
                        });
                        if (!currencyData || !currencyData.price) {
                            await (0, cron_1.processCurrenciesPrices)();
                            currencyData = await db_1.models.exchangeCurrency.findOne({
                                where: { currency: wallet.currency },
                                transaction: t,
                            });
                            if (!currencyData || !currencyData.price)
                                throw (0, error_1.createError)({ statusCode: 500, message: "Currency processing failed" });
                        }
                        const exchange = await exchange_1.default.startExchange(ctx);
                        const provider = await exchange_1.default.getProvider();
                        if (!exchange)
                            throw (0, error_1.createError)(500, "Exchange not found");
                        const currencies = await exchange.fetchCurrencies();
                        const isXt = provider === "xt";
                        const exchangeCurrency = Object.values(currencies).find((c) => isXt ? c.code === currency : c.id === currency);
                        if (!exchangeCurrency)
                            throw (0, error_1.createError)(404, "Currency not found");
                        let fixedFee = 0;
                        switch (provider) {
                            case "binance":
                            case "kucoin":
                                if (chain && exchangeCurrency.networks) {
                                    fixedFee =
                                        ((_a = exchangeCurrency.networks[chain]) === null || _a === void 0 ? void 0 : _a.fee) ||
                                            ((_c = (_b = exchangeCurrency.networks[chain]) === null || _b === void 0 ? void 0 : _b.fees) === null || _c === void 0 ? void 0 : _c.withdraw) ||
                                            0;
                                }
                                break;
                            default:
                                break;
                        }
                        const parsedAmount = parseFloat(amount);
                        const percentageFee = currencyData.fee || 0;
                        taxAmount = parseFloat(Math.max((parsedAmount * percentageFee) / 100 + fixedFee, 0).toFixed(2));
                    }
                    break;
                default:
                    throw (0, error_1.createError)({ statusCode: 400, message: "Invalid wallet type" });
            }
            const Total = amount + taxAmount;
            if (wallet.balance < Total) {
                throw (0, error_1.createError)({ statusCode: 400, message: "Insufficient funds" });
            }
            ctx === null || ctx === void 0 ? void 0 : ctx.step(`Deducting ${Total} ${currency} from wallet`);
            // Use wallet service for atomic, audited debit (creates transaction automatically)
            // Use stable idempotency key for proper retry detection
            const idempotencyKey = `forex_deposit_${id}_${user.id}_${amount}`;
            const debitResult = await wallet_1.walletService.debit({
                idempotencyKey,
                userId: user.id,
                walletId: wallet.id,
                walletType: type,
                currency,
                amount: Total,
                operationType: "FOREX_DEPOSIT",
                fee: taxAmount,
                description: `Deposit to Forex account ${account.accountId}`,
                metadata: {
                    forexAccountId: id,
                    accountId: account.accountId,
                    walletType: type,
                    chain: chain,
                    price: currencyData.price,
                },
                transaction: t,
            });
            updatedBalance = debitResult.newBalance;
            // Log the deposit operation
            console_1.logger.info("FOREX_DEPOSIT", `User ${user.id} deposited ${amount} ${currency} to forex account ${account.id}. Transaction ID: ${transaction.id}, Wallet Type: ${type}, Chain: ${chain || 'N/A'}`);
            return transaction;
        });
        ctx === null || ctx === void 0 ? void 0 : ctx.success(`Deposited ${amount} ${currency} to forex account ${id}${taxAmount > 0 ? ` (fee: ${taxAmount})` : ''}`);
        return {
            message: "Deposit successful",
            transaction: transaction,
            balance: updatedBalance,
            currency,
            chain,
            type,
        };
    }
    catch (error) {
        ctx === null || ctx === void 0 ? void 0 : ctx.fail(error.message || "Failed to deposit to forex account");
        // Log the error
        console_1.logger.error("FOREX_DEPOSIT_ERROR", `Forex deposit failed for user ${user.id}, account ${id}: ${error.message}. Details: amount=${amount}, currency=${currency}, type=${type}, chain=${chain || 'N/A'}`, error);
        throw error;
    }
};
