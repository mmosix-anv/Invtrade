"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.metadata = void 0;
const db_1 = require("@b/db");
const error_1 = require("@b/utils/error");
const query_1 = require("@b/utils/query");
const wallet_1 = require("@b/services/wallet");
exports.metadata = {
    summary: "Deletes an AI investment",
    description: "Deletes an existing AI trading investment for the currently authenticated user.",
    operationId: "deleteInvestment",
    tags: ["AI Trading"],
    parameters: [
        {
            index: 0,
            name: "id",
            in: "path",
            required: true,
            schema: { type: "string", description: "Investment ID" },
        },
    ],
    responses: (0, query_1.deleteRecordResponses)("AI Investment"),
    logModule: "AI_INVEST",
    logTitle: "Cancel AI investment",
    requiresAuth: true,
};
exports.default = async (data) => {
    const { user, params, ctx } = data;
    ctx === null || ctx === void 0 ? void 0 : ctx.step("Validating user authentication");
    if (!(user === null || user === void 0 ? void 0 : user.id)) {
        throw (0, error_1.createError)({ statusCode: 401, message: "Unauthorized" });
    }
    const { id } = params;
    ctx === null || ctx === void 0 ? void 0 : ctx.step("Fetching user details");
    const userPk = await db_1.models.user.findByPk(user.id);
    if (!userPk) {
        throw (0, error_1.createError)({ statusCode: 404, message: "User not found" });
    }
    ctx === null || ctx === void 0 ? void 0 : ctx.step("Fetching investment details");
    const investment = await db_1.models.aiInvestment.findByPk(id);
    if (!investment) {
        throw (0, error_1.createError)({ statusCode: 404, message: "Investment not found" });
    }
    ctx === null || ctx === void 0 ? void 0 : ctx.step("Verifying investment ownership");
    if (investment.userId !== user.id) {
        throw (0, error_1.createError)({ statusCode: 403, message: "Forbidden" });
    }
    ctx === null || ctx === void 0 ? void 0 : ctx.step("Processing cancellation transaction");
    await db_1.sequelize.transaction(async (t) => {
        ctx === null || ctx === void 0 ? void 0 : ctx.step("Locating user wallet for refund");
        const wallet = await db_1.models.wallet.findOne({
            where: {
                userId: user.id,
                currency: investment.symbol.split("/")[1],
                type: investment.type,
            },
            transaction: t,
        });
        if (!wallet) {
            throw (0, error_1.createError)({ statusCode: 404, message: "Wallet not found" });
        }
        ctx === null || ctx === void 0 ? void 0 : ctx.step("Deleting investment record");
        await db_1.models.aiInvestment.destroy({
            where: { id },
            force: true,
            transaction: t,
        });
        ctx === null || ctx === void 0 ? void 0 : ctx.step("Refunding investment amount to wallet via wallet service");
        // Use stable idempotency key for proper retry detection
        const idempotencyKey = `ai_invest_cancel_${id}`;
        const currency = investment.symbol.split("/")[1];
        await wallet_1.walletService.credit({
            idempotencyKey,
            userId: user.id,
            walletId: wallet.id,
            walletType: investment.type,
            currency,
            amount: investment.amount,
            operationType: "REFUND",
            referenceId: id,
            description: `AI Investment cancelled - refund ${investment.amount} ${currency}`,
            metadata: {
                investmentId: id,
                symbol: investment.symbol,
            },
            transaction: t,
        });
        ctx === null || ctx === void 0 ? void 0 : ctx.step("Removing associated transaction");
        await db_1.models.transaction.destroy({
            where: { referenceId: id },
            force: true,
            transaction: t,
        });
    });
    ctx === null || ctx === void 0 ? void 0 : ctx.success(`Cancelled investment of ${investment.amount} ${investment.symbol.split("/")[1]} and refunded to wallet`);
    return {
        message: "Investment cancelled successfully",
    };
};
