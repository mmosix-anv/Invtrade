"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.updateSpotWalletBalance = updateSpotWalletBalance;
exports.creditSpotWallet = creditSpotWallet;
exports.debitSpotWallet = debitSpotWallet;
exports.holdSpotFunds = holdSpotFunds;
exports.releaseSpotFunds = releaseSpotFunds;
const wallet_1 = require("@b/services/wallet");
const error_1 = require("@b/utils/error");
/**
 * Updates spot wallet balance based on deposit, withdrawal, or refund
 * Uses the centralized WalletService for atomic, idempotent operations
 *
 * @param userId - User ID
 * @param currency - Currency code
 * @param amount - Transaction amount
 * @param fee - Transaction fee
 * @param type - Transaction type (DEPOSIT, WITHDRAWAL, REFUND_WITHDRAWAL)
 * @param ctx - Optional logging context
 * @param idempotencyKey - REQUIRED idempotency key for duplicate prevention
 * @returns Updated wallet object or Error
 */
async function updateSpotWalletBalance(userId, currency, amount, fee, type, ctx, idempotencyKey = "") {
    var _a, _b, _c, _d, _e, _f, _g, _h;
    try {
        (_a = ctx === null || ctx === void 0 ? void 0 : ctx.step) === null || _a === void 0 ? void 0 : _a.call(ctx, `Processing ${type} for user ${userId}, currency ${currency}`);
        if (!idempotencyKey) {
            throw new Error("idempotencyKey is required for updateSpotWalletBalance");
        }
        switch (type) {
            case "DEPOSIT": {
                const netAmount = amount - fee;
                (_b = ctx === null || ctx === void 0 ? void 0 : ctx.step) === null || _b === void 0 ? void 0 : _b.call(ctx, `Deposit: crediting ${netAmount} (amount: ${amount}, fee: ${fee})`);
                const result = await wallet_1.walletService.credit({
                    idempotencyKey,
                    userId,
                    walletType: "SPOT",
                    currency,
                    amount: netAmount,
                    operationType: "DEPOSIT",
                    fee,
                    description: `Deposit of ${amount} ${currency} (fee: ${fee})`,
                    metadata: { originalAmount: amount, fee, type: "DEPOSIT" },
                });
                (_c = ctx === null || ctx === void 0 ? void 0 : ctx.success) === null || _c === void 0 ? void 0 : _c.call(ctx, `Successfully deposited ${netAmount} ${currency}`);
                return {
                    id: result.walletId,
                    userId,
                    currency,
                    type: "SPOT",
                    balance: result.newBalance,
                    inOrder: result.newInOrder,
                };
            }
            case "WITHDRAWAL": {
                const totalDebit = amount + fee;
                (_d = ctx === null || ctx === void 0 ? void 0 : ctx.step) === null || _d === void 0 ? void 0 : _d.call(ctx, `Withdrawal: debiting ${totalDebit} (amount: ${amount}, fee: ${fee})`);
                const result = await wallet_1.walletService.debit({
                    idempotencyKey,
                    userId,
                    walletType: "SPOT",
                    currency,
                    amount: totalDebit,
                    operationType: "WITHDRAW",
                    fee,
                    description: `Withdrawal of ${amount} ${currency} (fee: ${fee})`,
                    metadata: { originalAmount: amount, fee, type: "WITHDRAWAL" },
                });
                (_e = ctx === null || ctx === void 0 ? void 0 : ctx.success) === null || _e === void 0 ? void 0 : _e.call(ctx, `Successfully withdrew ${amount} ${currency}`);
                return {
                    id: result.walletId,
                    userId,
                    currency,
                    type: "SPOT",
                    balance: result.newBalance,
                    inOrder: result.newInOrder,
                };
            }
            case "REFUND_WITHDRAWAL": {
                const refundAmount = amount + fee;
                (_f = ctx === null || ctx === void 0 ? void 0 : ctx.step) === null || _f === void 0 ? void 0 : _f.call(ctx, `Refund: crediting ${refundAmount} (amount: ${amount}, fee: ${fee})`);
                const result = await wallet_1.walletService.credit({
                    idempotencyKey,
                    userId,
                    walletType: "SPOT",
                    currency,
                    amount: refundAmount,
                    operationType: "REFUND_WITHDRAWAL",
                    description: `Withdrawal refund of ${amount} ${currency} (fee refund: ${fee})`,
                    metadata: { originalAmount: amount, fee, type: "REFUND_WITHDRAWAL" },
                });
                (_g = ctx === null || ctx === void 0 ? void 0 : ctx.success) === null || _g === void 0 ? void 0 : _g.call(ctx, `Successfully refunded ${refundAmount} ${currency}`);
                return {
                    id: result.walletId,
                    userId,
                    currency,
                    type: "SPOT",
                    balance: result.newBalance,
                    inOrder: result.newInOrder,
                };
            }
            default:
                throw (0, error_1.createError)({ statusCode: 400, message: `Unknown operation type: ${type}` });
        }
    }
    catch (error) {
        (_h = ctx === null || ctx === void 0 ? void 0 : ctx.fail) === null || _h === void 0 ? void 0 : _h.call(ctx, error.message);
        // Convert WalletError to standard Error for backwards compatibility
        if (error instanceof wallet_1.WalletError) {
            const err = new Error(error.message);
            err.code = error.code;
            err.statusCode = error.statusCode;
            throw err;
        }
        throw error;
    }
}
/**
 * Credit a SPOT wallet
 * @deprecated Use walletService.credit() directly for new code
 */
async function creditSpotWallet(userId, currency, amount, description, idempotencyKey, metadata) {
    if (!idempotencyKey) {
        throw new Error("idempotencyKey is required for creditSpotWallet");
    }
    const result = await wallet_1.walletService.credit({
        idempotencyKey,
        userId,
        walletType: "SPOT",
        currency,
        amount,
        operationType: "DEPOSIT",
        description,
        metadata,
    });
    return {
        id: result.walletId,
        balance: result.newBalance,
        inOrder: result.newInOrder,
    };
}
/**
 * Debit a SPOT wallet
 * @deprecated Use walletService.debit() directly for new code
 */
async function debitSpotWallet(userId, currency, amount, description, idempotencyKey, metadata) {
    if (!idempotencyKey) {
        throw new Error("idempotencyKey is required for debitSpotWallet");
    }
    const result = await wallet_1.walletService.debit({
        idempotencyKey,
        userId,
        walletType: "SPOT",
        currency,
        amount,
        operationType: "WITHDRAW",
        description,
        metadata,
    });
    return {
        id: result.walletId,
        balance: result.newBalance,
        inOrder: result.newInOrder,
    };
}
/**
 * Hold funds in a SPOT wallet (move from balance to inOrder)
 * @deprecated Use walletService.hold() directly for new code
 */
async function holdSpotFunds(userId, currency, amount, reason, idempotencyKey, metadata) {
    if (!idempotencyKey) {
        throw new Error("idempotencyKey is required for holdSpotFunds");
    }
    const result = await wallet_1.walletService.hold({
        idempotencyKey,
        userId,
        walletType: "SPOT",
        currency,
        amount,
        reason,
        metadata,
    });
    return {
        id: result.walletId,
        balance: result.newBalance,
        inOrder: result.newInOrder,
    };
}
/**
 * Release held funds in a SPOT wallet (move from inOrder back to balance)
 * @deprecated Use walletService.release() directly for new code
 */
async function releaseSpotFunds(userId, currency, amount, reason, idempotencyKey, metadata) {
    if (!idempotencyKey) {
        throw new Error("idempotencyKey is required for releaseSpotFunds");
    }
    const result = await wallet_1.walletService.release({
        idempotencyKey,
        userId,
        walletType: "SPOT",
        currency,
        amount,
        reason,
        metadata,
    });
    return {
        id: result.walletId,
        balance: result.newBalance,
        inOrder: result.newInOrder,
    };
}
