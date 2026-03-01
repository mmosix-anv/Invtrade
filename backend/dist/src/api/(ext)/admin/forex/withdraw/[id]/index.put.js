"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.metadata = void 0;
// /api/admin/transactions/[id]/update.put.ts
const query_1 = require("@b/utils/query");
const db_1 = require("@b/db");
const utils_1 = require("@b/api/finance/transaction/utils");
const emails_1 = require("@b/utils/emails");
const error_1 = require("@b/utils/error");
const utils_2 = require("../../utils");
exports.metadata = {
    summary: "Updates a Forex withdrawal transaction",
    description: "Updates a pending Forex withdrawal transaction including status, amount, fee, and description. Handles balance adjustments and sends notification emails based on status changes (COMPLETED or REJECTED).",
    operationId: "updateForexWithdrawal",
    tags: ["Admin", "Forex", "Withdraw"],
    parameters: [
        {
            index: 0,
            name: "id",
            in: "path",
            description: "The ID of the transaction to update",
            required: true,
            schema: {
                type: "string",
            },
        },
    ],
    requestBody: {
        required: true,
        description: "Updated data for the transaction",
        content: {
            "application/json": {
                schema: utils_1.transactionUpdateSchema,
            },
        },
    },
    responses: (0, query_1.updateRecordResponses)("Transaction"),
    requiresAuth: true,
    permission: "edit.forex.withdraw",
    logModule: "ADMIN_FOREX",
    logTitle: "Update forex withdrawal",
};
exports.default = async (data) => {
    const { body, params, ctx } = data;
    const { id } = params;
    const { status, amount, fee, description, referenceId, metadata: requestMetadata, } = body;
    ctx === null || ctx === void 0 ? void 0 : ctx.step("Validating data");
    ctx === null || ctx === void 0 ? void 0 : ctx.step(`Updating record ${id}`);
    const transaction = await db_1.models.transaction.findOne({
        where: { id },
    });
    if (!transaction) {
        throw (0, error_1.createError)({
            statusCode: 404,
            message: "Transaction not found",
        });
    }
    if (transaction.status !== "PENDING") {
        throw (0, error_1.createError)({
            statusCode: 400,
            message: "Only pending transactions can be updated",
        });
    }
    transaction.amount = amount;
    transaction.fee = fee;
    transaction.description = description;
    transaction.referenceId = referenceId;
    return await db_1.sequelize.transaction(async (t) => {
        const metadata = (0, utils_2.parseMetadata)(transaction.metadata);
        const cost = Number(transaction.amount) * Number(metadata.price);
        if (transaction.status === "PENDING") {
            const account = await db_1.models.forexAccount.findOne({
                where: { userId: transaction.userId, type: "LIVE" },
                transaction: t,
            });
            if (!account) {
                throw (0, error_1.createError)({
                    statusCode: 404,
                    message: "Forex account not found",
                });
            }
            const wallet = await db_1.models.wallet.findOne({
                where: { id: transaction.walletId },
                transaction: t,
            });
            if (!wallet) {
                throw (0, error_1.createError)({
                    statusCode: 404,
                    message: "Wallet not found",
                });
            }
            if (status === "REJECTED") {
                await (0, utils_2.updateForexAccountBalance)(account, cost, true, t, ctx);
            }
            else if (status === "COMPLETED") {
                await (0, utils_2.updateWalletBalance)(wallet, cost, true, t, ctx);
            }
            const user = await db_1.models.user.findOne({
                where: { id: transaction.userId },
            });
            if (user) {
                await (0, emails_1.sendForexTransactionEmail)(user, transaction, account, wallet.currency, transaction.type, ctx);
            }
        }
        if (requestMetadata) {
            metadata.message = requestMetadata.message;
        }
        transaction.metadata = JSON.stringify(metadata);
        transaction.status = status;
        await transaction.save({ transaction: t });
        return { message: "Transaction updated successfully" };
    });
};
