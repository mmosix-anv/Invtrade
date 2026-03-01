"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.walletUpdateSchema = exports.walletSchema = void 0;
exports.getUserID = getUserID;
exports.updateUserWalletBalance = updateUserWalletBalance;
exports.adjustWalletBalance = adjustWalletBalance;
const db_1 = require("@b/db");
const schema_1 = require("@b/utils/schema");
const wallet_1 = require("@b/services/wallet");
const uuid_1 = require("uuid");
const error_1 = require("@b/utils/error");
async function getUserID(id, ctx) {
    var _a;
    (_a = ctx === null || ctx === void 0 ? void 0 : ctx.step) === null || _a === void 0 ? void 0 : _a.call(ctx, `Getting user ID: ${id}`);
    const user = await db_1.models.user.findOne({
        where: { id },
    });
    if (!user)
        throw (0, error_1.createError)({ statusCode: 404, message: "Invalid user UUID" });
    return user.id;
}
/**
 * Update user wallet balance using the centralized WalletService
 * Provides atomic, audited balance updates
 *
 * @param id - Wallet ID
 * @param amount - Transaction amount
 * @param fee - Transaction fee
 * @param type - Operation type (DEPOSIT, WITHDRAWAL, REFUND_WITHDRAWAL)
 * @param idempotencyKey - Optional key for duplicate prevention
 * @param adminUserId - Optional admin user ID for audit trail
 * @returns Updated wallet
 */
async function updateUserWalletBalance(id, amount, fee, type, idempotencyKey, adminUserId) {
    // Get the wallet first to get userId and currency
    const wallet = await wallet_1.walletCreationService.getWalletById(id);
    if (!wallet) {
        throw (0, error_1.createError)({ statusCode: 404, message: "Wallet not found" });
    }
    // Use stable idempotency key for proper retry detection
    const operationKey = idempotencyKey || `admin_${type.toLowerCase()}_${id}_${(0, uuid_1.v4)()}`;
    try {
        switch (type) {
            case "DEPOSIT": {
                const netAmount = amount - fee;
                const result = await wallet_1.walletService.credit({
                    idempotencyKey: operationKey,
                    userId: wallet.userId,
                    walletId: id,
                    walletType: wallet.type,
                    currency: wallet.currency,
                    amount: netAmount,
                    operationType: "DEPOSIT",
                    fee,
                    description: `Admin deposit of ${amount} ${wallet.currency} (fee: ${fee})`,
                    metadata: {
                        adminAction: true,
                        adminUserId,
                        originalAmount: amount,
                        fee,
                    },
                });
                return {
                    id: result.walletId,
                    userId: wallet.userId,
                    type: wallet.type,
                    currency: wallet.currency,
                    balance: result.newBalance,
                    inOrder: result.newInOrder,
                    status: wallet.status,
                };
            }
            case "WITHDRAWAL": {
                const totalDebit = amount + fee;
                const result = await wallet_1.walletService.debit({
                    idempotencyKey: operationKey,
                    userId: wallet.userId,
                    walletId: id,
                    walletType: wallet.type,
                    currency: wallet.currency,
                    amount: totalDebit,
                    operationType: "WITHDRAW",
                    fee,
                    description: `Admin withdrawal of ${amount} ${wallet.currency} (fee: ${fee})`,
                    metadata: {
                        adminAction: true,
                        adminUserId,
                        originalAmount: amount,
                        fee,
                    },
                });
                return {
                    id: result.walletId,
                    userId: wallet.userId,
                    type: wallet.type,
                    currency: wallet.currency,
                    balance: result.newBalance,
                    inOrder: result.newInOrder,
                    status: wallet.status,
                };
            }
            case "REFUND_WITHDRAWAL": {
                const refundAmount = amount + fee;
                const result = await wallet_1.walletService.credit({
                    idempotencyKey: operationKey,
                    userId: wallet.userId,
                    walletId: id,
                    walletType: wallet.type,
                    currency: wallet.currency,
                    amount: refundAmount,
                    operationType: "REFUND_WITHDRAWAL",
                    description: `Admin withdrawal refund of ${amount} ${wallet.currency} (fee refund: ${fee})`,
                    metadata: {
                        adminAction: true,
                        adminUserId,
                        originalAmount: amount,
                        fee,
                    },
                });
                return {
                    id: result.walletId,
                    userId: wallet.userId,
                    type: wallet.type,
                    currency: wallet.currency,
                    balance: result.newBalance,
                    inOrder: result.newInOrder,
                    status: wallet.status,
                };
            }
            default:
                throw (0, error_1.createError)({ statusCode: 400, message: `Unknown operation type: ${type}` });
        }
    }
    catch (error) {
        if (error instanceof wallet_1.WalletError) {
            throw (0, error_1.createError)({ statusCode: 400, message: error.message });
        }
        throw error;
    }
}
/**
 * Adjust wallet balance directly (admin override)
 * Use with caution - bypasses normal transaction flow
 */
async function adjustWalletBalance(id, newBalance, reason, adminUserId) {
    const wallet = await wallet_1.walletCreationService.getWalletById(id);
    if (!wallet) {
        throw (0, error_1.createError)({ statusCode: 404, message: "Wallet not found" });
    }
    const difference = newBalance - wallet.balance;
    const operationKey = `admin_adjust_${id}_${Date.now()}_${(0, uuid_1.v4)()}`;
    if (difference > 0) {
        // Credit
        await wallet_1.walletService.credit({
            idempotencyKey: operationKey,
            userId: wallet.userId,
            walletId: id,
            walletType: wallet.type,
            currency: wallet.currency,
            amount: difference,
            operationType: "ADJUSTMENT",
            description: `Admin balance adjustment: ${reason}`,
            metadata: {
                adminAction: true,
                adminUserId,
                previousBalance: wallet.balance,
                newBalance,
                reason,
            },
        });
    }
    else if (difference < 0) {
        // Debit
        await wallet_1.walletService.debit({
            idempotencyKey: operationKey,
            userId: wallet.userId,
            walletId: id,
            walletType: wallet.type,
            currency: wallet.currency,
            amount: Math.abs(difference),
            operationType: "ADJUSTMENT",
            description: `Admin balance adjustment: ${reason}`,
            metadata: {
                adminAction: true,
                adminUserId,
                previousBalance: wallet.balance,
                newBalance,
                reason,
            },
        });
    }
    return await wallet_1.walletCreationService.getWalletById(id);
}
// Reusable schema components for wallets
const id = (0, schema_1.baseStringSchema)("ID of the wallet");
const type = (0, schema_1.baseStringSchema)("Type of the wallet");
const currency = (0, schema_1.baseStringSchema)("Currency of the wallet");
const balance = (0, schema_1.baseNumberSchema)("Current balance of the wallet");
const inOrder = (0, schema_1.baseNumberSchema)("Amount currently held in orders");
const address = {
    type: "object",
    additionalProperties: true, // Assuming dynamic keys for address
    description: "Crypto address associated with the wallet",
};
const status = (0, schema_1.baseBooleanSchema)("Status of the wallet (active or inactive)");
// Base schema definition for wallet properties
const baseWalletProperties = {
    id,
    type,
    currency,
    balance,
    inOrder,
    status,
};
// Full schema for a wallet including user and transaction details
exports.walletSchema = {
    ...baseWalletProperties,
    user: {
        type: "object",
        properties: {
            id: { type: "string", description: "User ID" },
            firstName: { type: "string", description: "First name of the user" },
            lastName: { type: "string", description: "Last name of the user" },
            avatar: { type: "string", description: "Avatar URL of the user" },
        },
    },
    transactions: {
        type: "array",
        description: "List of transactions associated with the wallet",
        items: {
            type: "object",
            properties: {
                id: { type: "string", description: "Transaction ID" },
                amount: { type: "number", description: "Amount of the transaction" },
                fee: { type: "number", description: "Transaction fee" },
                type: { type: "string", description: "Type of the transaction" },
                status: { type: "string", description: "Status of the transaction" },
                createdAt: {
                    type: "string",
                    format: "date-time",
                    description: "Creation date of the transaction",
                },
                metadata: {
                    type: "object",
                    description: "Metadata of the transaction",
                },
            },
        },
    },
};
// Schema for updating a wallet
exports.walletUpdateSchema = {
    type: "object",
    properties: {
        type,
        currency,
        balance,
        inOrder,
        status,
    },
    required: [], // Allow partial updates - no fields are strictly required
    additionalProperties: false,
};
