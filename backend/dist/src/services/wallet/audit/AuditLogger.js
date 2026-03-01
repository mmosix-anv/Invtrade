"use strict";
/**
 * Audit Logger
 * Console-based logging for wallet operations
 * Transaction table serves as the source of truth for wallet history
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.auditLogger = exports.AuditLogger = void 0;
const console_1 = require("@b/utils/console");
class AuditLogger {
    constructor() { }
    static getInstance() {
        if (!AuditLogger.instance) {
            AuditLogger.instance = new AuditLogger();
        }
        return AuditLogger.instance;
    }
    /**
     * Log an audit entry to console
     * Transaction table is the source of truth - this is for debugging/monitoring
     */
    async log(entry) {
        try {
            console_1.logger.info("WALLET_AUDIT", JSON.stringify({
                timestamp: new Date().toISOString(),
                ...entry,
            }));
        }
        catch (error) {
            // Never fail the main operation due to audit logging
            console_1.logger.error("WALLET_AUDIT", `Failed to write audit log: ${error.message}`);
        }
    }
    /**
     * Log a wallet creation event
     */
    async logWalletCreated(walletId, userId, type, currency, chains) {
        await this.log({
            operation: "WALLET_CREATED",
            walletId,
            userId,
            amount: 0,
            transactionId: walletId,
            idempotencyKey: `create_${type}_${userId}_${currency}`,
            metadata: { type, currency, chains },
        });
    }
    /**
     * Log a credit operation
     */
    async logCredit(walletId, userId, amount, previousBalance, newBalance, transactionId, idempotencyKey, metadata) {
        await this.log({
            operation: "CREDIT",
            walletId,
            userId,
            amount,
            previousBalance,
            newBalance,
            transactionId,
            idempotencyKey,
            metadata,
        });
    }
    /**
     * Log a debit operation
     */
    async logDebit(walletId, userId, amount, previousBalance, newBalance, transactionId, idempotencyKey, metadata) {
        await this.log({
            operation: "DEBIT",
            walletId,
            userId,
            amount,
            previousBalance,
            newBalance,
            transactionId,
            idempotencyKey,
            metadata,
        });
    }
    /**
     * Log a hold operation
     */
    async logHold(walletId, userId, amount, previousBalance, newBalance, previousInOrder, newInOrder, transactionId, idempotencyKey, metadata) {
        await this.log({
            operation: "HOLD",
            walletId,
            userId,
            amount,
            previousBalance,
            newBalance,
            previousInOrder,
            newInOrder,
            transactionId,
            idempotencyKey,
            metadata,
        });
    }
    /**
     * Log a release operation
     */
    async logRelease(walletId, userId, amount, previousBalance, newBalance, previousInOrder, newInOrder, transactionId, idempotencyKey, metadata) {
        await this.log({
            operation: "RELEASE",
            walletId,
            userId,
            amount,
            previousBalance,
            newBalance,
            previousInOrder,
            newInOrder,
            transactionId,
            idempotencyKey,
            metadata,
        });
    }
    /**
     * Log a transfer out operation
     */
    async logTransferOut(walletId, userId, amount, previousBalance, newBalance, transactionId, idempotencyKey, toWalletId, fee, metadata) {
        await this.log({
            operation: "TRANSFER_OUT",
            walletId,
            userId,
            amount,
            previousBalance,
            newBalance,
            transactionId,
            idempotencyKey,
            metadata: { ...metadata, toWalletId, fee },
        });
    }
    /**
     * Log a transfer in operation
     */
    async logTransferIn(walletId, userId, amount, previousBalance, newBalance, transactionId, idempotencyKey, fromWalletId, metadata) {
        await this.log({
            operation: "TRANSFER_IN",
            walletId,
            userId,
            amount,
            previousBalance,
            newBalance,
            transactionId,
            idempotencyKey,
            metadata: { ...metadata, fromWalletId },
        });
    }
    /**
     * Log execute from hold operation
     */
    async logExecuteFromHold(walletId, userId, amount, previousInOrder, newInOrder, transactionId, idempotencyKey, metadata) {
        await this.log({
            operation: "EXECUTE_FROM_HOLD",
            walletId,
            userId,
            amount,
            previousInOrder,
            newInOrder,
            transactionId,
            idempotencyKey,
            metadata,
        });
    }
}
exports.AuditLogger = AuditLogger;
exports.auditLogger = AuditLogger.getInstance();
