"use strict";
/**
 * WalletService
 * Core service for all wallet balance operations
 * Provides atomic, idempotent operations with comprehensive audit logging
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.walletService = exports.WalletService = void 0;
const db_1 = require("@b/db");
const error_1 = require("@b/utils/error");
const sequelize_1 = require("sequelize");
const errors_1 = require("./errors");
const precision_1 = require("./utils/precision");
const AuditLogger_1 = require("./audit/AuditLogger");
const PrecisionCacheService_1 = require("./PrecisionCacheService");
class WalletService {
    constructor() {
        this.auditLogger = new AuditLogger_1.AuditLogger();
    }
    static getInstance() {
        if (!WalletService.instance) {
            WalletService.instance = new WalletService();
        }
        return WalletService.instance;
    }
    // ============================================
    // WALLET RETRIEVAL
    // ============================================
    /**
     * Get wallet with optional row-level locking
     */
    async getWallet(userId, type, currency, options) {
        const { transaction, lock = false, createIfMissing = false } = options || {};
        const queryOptions = {
            where: { userId, type, currency },
        };
        if (transaction) {
            queryOptions.transaction = transaction;
            if (lock) {
                queryOptions.lock = sequelize_1.Transaction.LOCK.UPDATE;
            }
        }
        let wallet = await db_1.models.wallet.findOne(queryOptions);
        if (!wallet && createIfMissing) {
            wallet = await this.createBasicWallet(userId, type, currency, transaction);
        }
        if (!wallet) {
            throw new errors_1.WalletNotFoundError(`${userId}/${type}/${currency}`);
        }
        return this.toWalletAttributes(wallet);
    }
    /**
     * Get wallet by ID with optional locking
     */
    async getWalletById(walletId, options) {
        const { transaction, lock = false } = options || {};
        const queryOptions = {
            where: { id: walletId },
        };
        if (transaction) {
            queryOptions.transaction = transaction;
            if (lock) {
                queryOptions.lock = sequelize_1.Transaction.LOCK.UPDATE;
            }
        }
        const wallet = await db_1.models.wallet.findOne(queryOptions);
        if (!wallet) {
            throw new errors_1.WalletNotFoundError(walletId);
        }
        return this.toWalletAttributes(wallet);
    }
    /**
     * Get wallet safely (returns null if not found)
     */
    async getWalletSafe(userId, type, currency, options) {
        try {
            return await this.getWallet(userId, type, currency, options);
        }
        catch (error) {
            if (error instanceof errors_1.WalletNotFoundError) {
                return null;
            }
            throw error;
        }
    }
    /**
     * Create a basic wallet (internal use)
     */
    async createBasicWallet(userId, type, currency, transaction) {
        return await db_1.models.wallet.create({
            userId,
            type,
            currency,
            balance: 0,
            inOrder: 0,
            status: true,
        }, transaction ? { transaction } : undefined);
    }
    /**
     * Convert model to WalletAttributes
     */
    toWalletAttributes(wallet) {
        var _a, _b;
        const plain = wallet.get ? wallet.get({ plain: true }) : wallet;
        return {
            ...plain,
            balance: parseFloat(((_a = plain.balance) === null || _a === void 0 ? void 0 : _a.toString()) || "0"),
            inOrder: parseFloat(((_b = plain.inOrder) === null || _b === void 0 ? void 0 : _b.toString()) || "0"),
        };
    }
    // ============================================
    // IDEMPOTENCY CHECK
    // ============================================
    /**
     * Check if operation was already processed
     */
    async checkIdempotency(idempotencyKey, transaction) {
        const existing = await db_1.models.transaction.findOne({
            where: {
                [sequelize_1.Op.or]: [
                    { id: idempotencyKey },
                    {
                        metadata: {
                            [sequelize_1.Op.like]: `%"idempotencyKey":"${idempotencyKey}"%`,
                        },
                    },
                ],
            },
            attributes: ["id"],
            ...(transaction && { transaction }),
        });
        if (existing) {
            return { isDuplicate: true, existingTransactionId: existing.id };
        }
        return { isDuplicate: false };
    }
    // ============================================
    // VALIDATION
    // ============================================
    validateAmount(amount, operation) {
        if (amount <= 0) {
            throw new errors_1.InvalidAmountError(amount, `${operation} amount must be positive`);
        }
        if (!isFinite(amount)) {
            throw new errors_1.InvalidAmountError(amount, "Amount must be a finite number");
        }
    }
    validateWalletStatus(wallet) {
        if (!wallet.status) {
            throw new errors_1.WalletDisabledError(wallet.id);
        }
    }
    // ============================================
    // OPERATION TYPE MAPPING
    // ============================================
    /**
     * Maps wallet service operation types to valid database transaction types
     * The database has a limited ENUM of allowed types, so we need to map our
     * more granular operation types to the database's accepted values.
     */
    mapOperationTypeToTransactionType(operationType) {
        const mapping = {
            // Direct mappings (operation type matches transaction type)
            DEPOSIT: "DEPOSIT",
            WITHDRAW: "WITHDRAW",
            INCOMING_TRANSFER: "INCOMING_TRANSFER",
            OUTGOING_TRANSFER: "OUTGOING_TRANSFER",
            PAYMENT: "PAYMENT",
            REFUND: "REFUND",
            BINARY_ORDER: "BINARY_ORDER",
            EXCHANGE_ORDER: "EXCHANGE_ORDER",
            INVESTMENT: "INVESTMENT",
            INVESTMENT_ROI: "INVESTMENT_ROI",
            AI_INVESTMENT: "AI_INVESTMENT",
            AI_INVESTMENT_ROI: "AI_INVESTMENT_ROI",
            INVOICE: "INVOICE",
            FOREX_DEPOSIT: "FOREX_DEPOSIT",
            FOREX_WITHDRAW: "FOREX_WITHDRAW",
            FOREX_INVESTMENT: "FOREX_INVESTMENT",
            FOREX_INVESTMENT_ROI: "FOREX_INVESTMENT_ROI",
            ICO_CONTRIBUTION: "ICO_CONTRIBUTION",
            REFERRAL_REWARD: "REFERRAL_REWARD",
            STAKING: "STAKING",
            STAKING_REWARD: "STAKING_REWARD",
            P2P_OFFER_TRANSFER: "P2P_OFFER_TRANSFER",
            P2P_TRADE: "P2P_TRADE",
            NFT_PURCHASE: "NFT_PURCHASE",
            NFT_SALE: "NFT_SALE",
            NFT_MINT: "NFT_MINT",
            NFT_BURN: "NFT_BURN",
            NFT_TRANSFER: "NFT_TRANSFER",
            NFT_AUCTION_BID: "NFT_AUCTION_BID",
            NFT_AUCTION_SETTLE: "NFT_AUCTION_SETTLE",
            NFT_OFFER: "NFT_OFFER",
            // Mapped types (operation types that don't exist in DB)
            BINARY_ORDER_WIN: "BINARY_ORDER",
            BINARY_ORDER_LOSS: "BINARY_ORDER",
            HOLD: "EXCHANGE_ORDER",
            RELEASE: "EXCHANGE_ORDER",
            TRADE_DEBIT: "EXCHANGE_ORDER",
            TRADE_CREDIT: "EXCHANGE_ORDER",
            FEE: "PAYMENT",
            REFUND_WITHDRAWAL: "REFUND",
            ADJUSTMENT: "DEPOSIT",
            STAKING_DEPOSIT: "STAKING",
            STAKING_WITHDRAW: "STAKING",
            ECO_DEPOSIT: "DEPOSIT",
            ECO_WITHDRAW: "WITHDRAW",
            ECO_REFUND: "REFUND",
            COPY_TRADING_REVERSAL: "REFUND",
            P2P_DISPUTE_RESOLVE: "P2P_TRADE",
            P2P_DISPUTE_RECEIVE: "P2P_TRADE",
            P2P_TRADE_RESOLVE: "P2P_TRADE",
            P2P_TRADE_RECEIVE: "P2P_TRADE",
            P2P_TRADE_RELEASE: "P2P_TRADE",
            P2P_TRADE_LOCK: "P2P_TRADE",
            P2P_TRADE_CANCEL: "P2P_TRADE",
            P2P_TRADE_EXPIRED: "P2P_TRADE",
            P2P_OFFER_LOCK: "P2P_OFFER_TRANSFER",
            P2P_OFFER_DELETE: "P2P_OFFER_TRANSFER",
            P2P_ADMIN_OFFER_DISABLE: "P2P_OFFER_TRANSFER",
            P2P_ADMIN_OFFER_REJECT: "P2P_OFFER_TRANSFER",
        };
        return mapping[operationType] || "PAYMENT";
    }
    // ============================================
    // CORE BALANCE OPERATIONS
    // ============================================
    /**
     * Credit (add) funds to a wallet
     * Used for: deposits, transfer-in, refunds, rewards
     * @param operation - The wallet operation details
     * @param operation.transaction - Optional external transaction. If provided, uses this transaction
     *                                instead of creating a new one. This allows the wallet operation
     *                                to be part of a larger atomic transaction.
     */
    async credit(operation) {
        this.validateAmount(operation.amount, "Credit");
        // Use external transaction if provided, otherwise create new one
        const executeInTransaction = async (t) => {
            // 1. Idempotency check
            const { isDuplicate, existingTransactionId } = await this.checkIdempotency(operation.idempotencyKey, t);
            if (isDuplicate) {
                throw new errors_1.DuplicateOperationError(operation.idempotencyKey, existingTransactionId);
            }
            // 2. Get wallet with lock
            const wallet = operation.walletId
                ? await this.getWalletById(operation.walletId, { transaction: t, lock: true })
                : await this.getWallet(operation.userId, operation.walletType, operation.currency, {
                    transaction: t,
                    lock: true,
                    createIfMissing: true,
                });
            this.validateWalletStatus(wallet);
            // 3. Calculate new balance with safe precision
            const creditAmount = (0, precision_1.roundToPrecision)(operation.amount, operation.currency);
            const previousBalance = wallet.balance;
            const newBalance = (0, precision_1.safeAdd)(previousBalance, creditAmount, operation.currency);
            // 4. Update wallet
            await db_1.models.wallet.update({ balance: newBalance }, { where: { id: wallet.id }, transaction: t });
            // 5. Create transaction record
            const txRecord = await db_1.models.transaction.create({
                userId: operation.userId,
                walletId: wallet.id,
                type: this.mapOperationTypeToTransactionType(operation.operationType),
                status: "COMPLETED",
                amount: creditAmount,
                fee: operation.fee || 0,
                description: operation.description,
                referenceId: operation.referenceId,
                metadata: JSON.stringify({
                    idempotencyKey: operation.idempotencyKey,
                    operationType: operation.operationType, // Store original operation type
                    previousBalance,
                    newBalance,
                    ...operation.metadata,
                }),
            }, { transaction: t });
            // 6. Audit log
            await this.auditLogger.logCredit(wallet.id, operation.userId, creditAmount, previousBalance, newBalance, txRecord.id, operation.idempotencyKey, operation.metadata);
            return {
                success: true,
                walletId: wallet.id,
                transactionId: txRecord.id,
                previousBalance,
                newBalance,
                previousInOrder: wallet.inOrder,
                newInOrder: wallet.inOrder,
                timestamp: new Date(),
            };
        };
        // If external transaction provided, use it directly (caller manages commit/rollback)
        // Otherwise create a new transaction for atomicity
        if (operation.transaction) {
            return executeInTransaction(operation.transaction);
        }
        return await db_1.sequelize.transaction(executeInTransaction);
    }
    /**
     * Debit (subtract) funds from a wallet
     * Used for: withdrawals, transfer-out, fees, purchases
     * @param operation - The wallet operation details
     * @param operation.transaction - Optional external transaction. If provided, uses this transaction
     *                                instead of creating a new one. This allows the wallet operation
     *                                to be part of a larger atomic transaction.
     */
    async debit(operation) {
        this.validateAmount(operation.amount, "Debit");
        // Use external transaction if provided, otherwise create new one
        const executeInTransaction = async (t) => {
            // 1. Idempotency check
            const { isDuplicate, existingTransactionId } = await this.checkIdempotency(operation.idempotencyKey, t);
            if (isDuplicate) {
                throw new errors_1.DuplicateOperationError(operation.idempotencyKey, existingTransactionId);
            }
            // 2. Get wallet with lock
            const wallet = operation.walletId
                ? await this.getWalletById(operation.walletId, { transaction: t, lock: true })
                : await this.getWallet(operation.userId, operation.walletType, operation.currency, {
                    transaction: t,
                    lock: true,
                });
            this.validateWalletStatus(wallet);
            // 3. Calculate amounts with safe precision
            const debitAmount = (0, precision_1.roundToPrecision)(operation.amount, operation.currency);
            const feeAmount = (0, precision_1.roundToPrecision)(operation.fee || 0, operation.currency);
            const totalDebit = (0, precision_1.safeAdd)(debitAmount, feeAmount, operation.currency);
            const previousBalance = wallet.balance;
            // 4. CRITICAL: Check sufficient funds
            if (previousBalance < totalDebit) {
                throw new errors_1.InsufficientFundsError(previousBalance, totalDebit, operation.currency);
            }
            // 5. Calculate new balance
            const newBalance = (0, precision_1.safeSubtract)(previousBalance, totalDebit, operation.currency);
            // 6. CRITICAL: Verify no negative balance
            if (newBalance < 0) {
                throw new errors_1.NegativeBalanceError(wallet.id, newBalance);
            }
            // 7. Update wallet
            await db_1.models.wallet.update({ balance: newBalance }, { where: { id: wallet.id }, transaction: t });
            // 8. Create transaction record
            const txRecord = await db_1.models.transaction.create({
                userId: operation.userId,
                walletId: wallet.id,
                type: this.mapOperationTypeToTransactionType(operation.operationType),
                status: "COMPLETED",
                amount: debitAmount,
                fee: feeAmount,
                description: operation.description,
                referenceId: operation.referenceId,
                metadata: JSON.stringify({
                    idempotencyKey: operation.idempotencyKey,
                    operationType: operation.operationType, // Store original operation type
                    previousBalance,
                    newBalance,
                    totalDebit,
                    ...operation.metadata,
                }),
            }, { transaction: t });
            // 9. Audit log
            await this.auditLogger.logDebit(wallet.id, operation.userId, totalDebit, previousBalance, newBalance, txRecord.id, operation.idempotencyKey, operation.metadata);
            return {
                success: true,
                walletId: wallet.id,
                transactionId: txRecord.id,
                previousBalance,
                newBalance,
                previousInOrder: wallet.inOrder,
                newInOrder: wallet.inOrder,
                timestamp: new Date(),
            };
        };
        // If external transaction provided, use it directly (caller manages commit/rollback)
        // Otherwise create a new transaction for atomicity
        if (operation.transaction) {
            return executeInTransaction(operation.transaction);
        }
        return await db_1.sequelize.transaction(executeInTransaction);
    }
    // ============================================
    // HOLD/RELEASE OPERATIONS
    // ============================================
    /**
     * Hold funds (move from balance to inOrder)
     * Used when placing orders
     * @param operation - The hold operation details
     * @param operation.transaction - Optional external transaction. If provided, uses this transaction
     *                                instead of creating a new one. This allows the wallet operation
     *                                to be part of a larger atomic transaction.
     */
    async hold(operation) {
        this.validateAmount(operation.amount, "Hold");
        // Use external transaction if provided, otherwise create new one
        const executeInTransaction = async (t) => {
            // 1. Idempotency check
            const { isDuplicate, existingTransactionId } = await this.checkIdempotency(operation.idempotencyKey, t);
            if (isDuplicate) {
                throw new errors_1.DuplicateOperationError(operation.idempotencyKey, existingTransactionId);
            }
            // 2. Get wallet with lock
            const wallet = operation.walletId
                ? await this.getWalletById(operation.walletId, { transaction: t, lock: true })
                : await this.getWallet(operation.userId, operation.walletType, operation.currency, {
                    transaction: t,
                    lock: true,
                });
            this.validateWalletStatus(wallet);
            // 3. Calculate with precision
            const holdAmount = (0, precision_1.roundToPrecision)(operation.amount, operation.currency);
            const previousBalance = wallet.balance;
            const previousInOrder = wallet.inOrder;
            // 4. Check sufficient available funds
            if (previousBalance < holdAmount) {
                throw new errors_1.InsufficientFundsError(previousBalance, holdAmount, operation.currency);
            }
            // 5. Calculate new values
            const newBalance = (0, precision_1.safeSubtract)(previousBalance, holdAmount, operation.currency);
            const newInOrder = (0, precision_1.safeAdd)(previousInOrder, holdAmount, operation.currency);
            // 6. Verify no negative
            if (newBalance < 0) {
                throw new errors_1.NegativeBalanceError(wallet.id, newBalance);
            }
            // 7. Update wallet
            await db_1.models.wallet.update({ balance: newBalance, inOrder: newInOrder }, { where: { id: wallet.id }, transaction: t });
            // 8. Create hold record
            const txRecord = await db_1.models.transaction.create({
                userId: operation.userId,
                walletId: wallet.id,
                type: this.mapOperationTypeToTransactionType(operation.operationType || "HOLD"),
                status: "COMPLETED",
                amount: holdAmount,
                fee: 0,
                description: operation.reason,
                metadata: JSON.stringify({
                    idempotencyKey: operation.idempotencyKey,
                    operationType: operation.operationType || "HOLD",
                    previousBalance,
                    newBalance,
                    previousInOrder,
                    newInOrder,
                    expiresAt: operation.expiresAt,
                    ...operation.metadata,
                }),
            }, { transaction: t });
            // 9. Audit log
            await this.auditLogger.logHold(wallet.id, operation.userId, holdAmount, previousBalance, newBalance, previousInOrder, newInOrder, txRecord.id, operation.idempotencyKey, operation.metadata);
            return {
                success: true,
                walletId: wallet.id,
                transactionId: txRecord.id,
                previousBalance,
                newBalance,
                previousInOrder,
                newInOrder,
                timestamp: new Date(),
            };
        };
        // If external transaction provided, use it directly (caller manages commit/rollback)
        // Otherwise create a new transaction for atomicity
        if (operation.transaction) {
            return executeInTransaction(operation.transaction);
        }
        return await db_1.sequelize.transaction(executeInTransaction);
    }
    /**
     * Release held funds (move from inOrder back to balance)
     * Used when cancelling orders
     * @param operation - The release operation details
     * @param operation.transaction - Optional external transaction. If provided, uses this transaction
     *                                instead of creating a new one. This allows the wallet operation
     *                                to be part of a larger atomic transaction.
     */
    async release(operation) {
        this.validateAmount(operation.amount, "Release");
        // Use external transaction if provided, otherwise create new one
        const executeInTransaction = async (t) => {
            // 1. Idempotency check
            const { isDuplicate, existingTransactionId } = await this.checkIdempotency(operation.idempotencyKey, t);
            if (isDuplicate) {
                throw new errors_1.DuplicateOperationError(operation.idempotencyKey, existingTransactionId);
            }
            // 2. Get wallet with lock
            const wallet = operation.walletId
                ? await this.getWalletById(operation.walletId, { transaction: t, lock: true })
                : await this.getWallet(operation.userId, operation.walletType, operation.currency, {
                    transaction: t,
                    lock: true,
                });
            this.validateWalletStatus(wallet);
            // 3. Calculate with precision
            const releaseAmount = (0, precision_1.roundToPrecision)(operation.amount, operation.currency);
            const previousBalance = wallet.balance;
            const previousInOrder = wallet.inOrder;
            // 4. Check sufficient held funds
            if (previousInOrder < releaseAmount) {
                throw new errors_1.InsufficientHeldFundsError(previousInOrder, releaseAmount, operation.currency);
            }
            // 5. Calculate new values
            const newBalance = (0, precision_1.safeAdd)(previousBalance, releaseAmount, operation.currency);
            const newInOrder = (0, precision_1.safeSubtract)(previousInOrder, releaseAmount, operation.currency);
            // 6. Verify no negative inOrder
            if (newInOrder < 0) {
                throw new errors_1.NegativeInOrderError(wallet.id, newInOrder);
            }
            // 7. Update wallet
            await db_1.models.wallet.update({ balance: newBalance, inOrder: newInOrder }, { where: { id: wallet.id }, transaction: t });
            // 8. Create release record
            const txRecord = await db_1.models.transaction.create({
                userId: operation.userId,
                walletId: wallet.id,
                type: this.mapOperationTypeToTransactionType(operation.operationType || "RELEASE"),
                status: "COMPLETED",
                amount: releaseAmount,
                fee: 0,
                description: operation.reason,
                metadata: JSON.stringify({
                    idempotencyKey: operation.idempotencyKey,
                    operationType: operation.operationType || "RELEASE",
                    previousBalance,
                    newBalance,
                    previousInOrder,
                    newInOrder,
                    ...operation.metadata,
                }),
            }, { transaction: t });
            // 9. Audit log
            await this.auditLogger.logRelease(wallet.id, operation.userId, releaseAmount, previousBalance, newBalance, previousInOrder, newInOrder, txRecord.id, operation.idempotencyKey, operation.metadata);
            return {
                success: true,
                walletId: wallet.id,
                transactionId: txRecord.id,
                previousBalance,
                newBalance,
                previousInOrder,
                newInOrder,
                timestamp: new Date(),
            };
        };
        // If external transaction provided, use it directly (caller manages commit/rollback)
        // Otherwise create a new transaction for atomicity
        if (operation.transaction) {
            return executeInTransaction(operation.transaction);
        }
        return await db_1.sequelize.transaction(executeInTransaction);
    }
    /**
     * Execute from held funds (deduct from inOrder)
     * Used when orders are filled
     * @param operation - The wallet operation details
     * @param operation.transaction - Optional external transaction. If provided, uses this transaction
     *                                instead of creating a new one. This allows the wallet operation
     *                                to be part of a larger atomic transaction.
     */
    async executeFromHold(operation) {
        this.validateAmount(operation.amount, "Execute");
        // Use external transaction if provided, otherwise create new one
        const executeInTransaction = async (t) => {
            // 1. Idempotency check
            const { isDuplicate, existingTransactionId } = await this.checkIdempotency(operation.idempotencyKey, t);
            if (isDuplicate) {
                throw new errors_1.DuplicateOperationError(operation.idempotencyKey, existingTransactionId);
            }
            // 2. Get wallet with lock
            const wallet = operation.walletId
                ? await this.getWalletById(operation.walletId, { transaction: t, lock: true })
                : await this.getWallet(operation.userId, operation.walletType, operation.currency, {
                    transaction: t,
                    lock: true,
                });
            this.validateWalletStatus(wallet);
            // 3. Calculate with precision
            const executeAmount = (0, precision_1.roundToPrecision)(operation.amount, operation.currency);
            const feeAmount = (0, precision_1.roundToPrecision)(operation.fee || 0, operation.currency);
            const totalExecute = (0, precision_1.safeAdd)(executeAmount, feeAmount, operation.currency);
            const previousInOrder = wallet.inOrder;
            const previousBalance = wallet.balance;
            // 4. Check sufficient held funds
            if (previousInOrder < totalExecute) {
                throw new errors_1.InsufficientHeldFundsError(previousInOrder, totalExecute, operation.currency);
            }
            // 5. Calculate new inOrder
            const newInOrder = (0, precision_1.safeSubtract)(previousInOrder, totalExecute, operation.currency);
            if (newInOrder < 0) {
                throw new errors_1.NegativeInOrderError(wallet.id, newInOrder);
            }
            // 6. Update wallet (only inOrder changes)
            await db_1.models.wallet.update({ inOrder: newInOrder }, { where: { id: wallet.id }, transaction: t });
            // 7. Create transaction record
            const txRecord = await db_1.models.transaction.create({
                userId: operation.userId,
                walletId: wallet.id,
                type: this.mapOperationTypeToTransactionType(operation.operationType),
                status: "COMPLETED",
                amount: executeAmount,
                fee: feeAmount,
                description: operation.description,
                referenceId: operation.referenceId,
                metadata: JSON.stringify({
                    idempotencyKey: operation.idempotencyKey,
                    operationType: operation.operationType, // Store original operation type
                    previousInOrder,
                    newInOrder,
                    ...operation.metadata,
                }),
            }, { transaction: t });
            // 8. Audit log
            await this.auditLogger.logExecuteFromHold(wallet.id, operation.userId, totalExecute, previousInOrder, newInOrder, txRecord.id, operation.idempotencyKey, operation.metadata);
            return {
                success: true,
                walletId: wallet.id,
                transactionId: txRecord.id,
                previousBalance,
                newBalance: previousBalance,
                previousInOrder,
                newInOrder,
                timestamp: new Date(),
            };
        };
        // If external transaction provided, use it directly (caller manages commit/rollback)
        // Otherwise create a new transaction for atomicity
        if (operation.transaction) {
            return executeInTransaction(operation.transaction);
        }
        return await db_1.sequelize.transaction(executeInTransaction);
    }
    // ============================================
    // TRANSFER OPERATIONS
    // ============================================
    /**
     * Transfer funds between wallets (atomic)
     * @param operation - The transfer operation details
     * @param operation.transaction - Optional external transaction. If provided, uses this transaction
     *                                instead of creating a new one. This allows the wallet operation
     *                                to be part of a larger atomic transaction.
     */
    async transfer(operation) {
        this.validateAmount(operation.amount, "Transfer");
        // Prevent self-transfer
        if (operation.fromUserId === operation.toUserId &&
            operation.fromWalletType === operation.toWalletType &&
            operation.fromCurrency === operation.toCurrency) {
            throw new errors_1.TransferError("Cannot transfer to the same wallet");
        }
        // Use external transaction if provided, otherwise create new one
        const executeInTransaction = async (t) => {
            // 1. Idempotency check
            const { isDuplicate, existingTransactionId } = await this.checkIdempotency(operation.idempotencyKey, t);
            if (isDuplicate) {
                throw new errors_1.DuplicateOperationError(operation.idempotencyKey, existingTransactionId);
            }
            // 2. Get both wallets with locks (order by ID to prevent deadlocks)
            const fromWallet = await this.getWallet(operation.fromUserId, operation.fromWalletType, operation.fromCurrency, { transaction: t, lock: true });
            const toWallet = await this.getWallet(operation.toUserId, operation.toWalletType, operation.toCurrency, { transaction: t, lock: true, createIfMissing: true });
            this.validateWalletStatus(fromWallet);
            this.validateWalletStatus(toWallet);
            // 3. Calculate amounts
            const transferAmount = (0, precision_1.roundToPrecision)(operation.amount, operation.fromCurrency);
            const feePercentage = operation.feePercentage || 0;
            const feeAmount = (0, precision_1.roundToPrecision)((transferAmount * feePercentage) / 100, operation.fromCurrency);
            const totalDebit = (0, precision_1.safeAdd)(transferAmount, feeAmount, operation.fromCurrency);
            // Calculate receive amount with exchange rate
            const exchangeRate = operation.exchangeRate || 1;
            const receiveAmount = (0, precision_1.roundToPrecision)(transferAmount * exchangeRate, operation.toCurrency);
            // 4. Check source wallet balance
            const fromBalance = fromWallet.balance;
            if (fromBalance < totalDebit) {
                throw new errors_1.InsufficientFundsError(fromBalance, totalDebit, operation.fromCurrency);
            }
            // 5. Calculate new balances
            const newFromBalance = (0, precision_1.safeSubtract)(fromBalance, totalDebit, operation.fromCurrency);
            const toBalance = toWallet.balance;
            const newToBalance = (0, precision_1.safeAdd)(toBalance, receiveAmount, operation.toCurrency);
            // 6. Verify no negative
            if (newFromBalance < 0) {
                throw new errors_1.NegativeBalanceError(fromWallet.id, newFromBalance);
            }
            // 7. Update both wallets
            await db_1.models.wallet.update({ balance: newFromBalance }, { where: { id: fromWallet.id }, transaction: t });
            await db_1.models.wallet.update({ balance: newToBalance }, { where: { id: toWallet.id }, transaction: t });
            // 8. Create outgoing transaction
            const fromTx = await db_1.models.transaction.create({
                userId: operation.fromUserId,
                walletId: fromWallet.id,
                type: "OUTGOING_TRANSFER",
                status: "COMPLETED",
                amount: transferAmount,
                fee: feeAmount,
                description: operation.description,
                metadata: JSON.stringify({
                    idempotencyKey: operation.idempotencyKey,
                    previousBalance: fromBalance,
                    newBalance: newFromBalance,
                    toWalletId: toWallet.id,
                    toUserId: operation.toUserId,
                    exchangeRate,
                    ...operation.metadata,
                }),
            }, { transaction: t });
            // 9. Create incoming transaction
            const toTx = await db_1.models.transaction.create({
                userId: operation.toUserId,
                walletId: toWallet.id,
                type: "INCOMING_TRANSFER",
                status: "COMPLETED",
                amount: receiveAmount,
                fee: 0,
                description: operation.description,
                metadata: JSON.stringify({
                    idempotencyKey: `${operation.idempotencyKey}_receive`,
                    previousBalance: toBalance,
                    newBalance: newToBalance,
                    fromWalletId: fromWallet.id,
                    fromUserId: operation.fromUserId,
                    exchangeRate,
                    ...operation.metadata,
                }),
            }, { transaction: t });
            // 10. Record admin profit if fee was charged
            if (feeAmount > 0 && db_1.models.adminProfit) {
                await db_1.models.adminProfit.create({
                    amount: feeAmount,
                    currency: operation.fromCurrency,
                    type: "TRANSFER",
                    transactionId: fromTx.id,
                    description: `Transfer fee from user ${operation.fromUserId}`,
                }, { transaction: t });
            }
            // 11. Audit logs
            await this.auditLogger.logTransferOut(fromWallet.id, operation.fromUserId, totalDebit, fromBalance, newFromBalance, fromTx.id, operation.idempotencyKey, toWallet.id, feeAmount, operation.metadata);
            await this.auditLogger.logTransferIn(toWallet.id, operation.toUserId, receiveAmount, toBalance, newToBalance, toTx.id, `${operation.idempotencyKey}_receive`, fromWallet.id, operation.metadata);
            return {
                fromResult: {
                    success: true,
                    walletId: fromWallet.id,
                    transactionId: fromTx.id,
                    previousBalance: fromBalance,
                    newBalance: newFromBalance,
                    previousInOrder: fromWallet.inOrder,
                    newInOrder: fromWallet.inOrder,
                    timestamp: new Date(),
                },
                toResult: {
                    success: true,
                    walletId: toWallet.id,
                    transactionId: toTx.id,
                    previousBalance: toBalance,
                    newBalance: newToBalance,
                    previousInOrder: toWallet.inOrder,
                    newInOrder: toWallet.inOrder,
                    timestamp: new Date(),
                },
                fee: feeAmount,
            };
        };
        // If external transaction provided, use it directly (caller manages commit/rollback)
        // Otherwise create a new transaction for atomicity
        if (operation.transaction) {
            return executeInTransaction(operation.transaction);
        }
        return await db_1.sequelize.transaction(executeInTransaction);
    }
    // ============================================
    // UTILITY METHODS
    // ============================================
    /**
     * Get total wallet value (balance + inOrder)
     */
    async getTotalValue(userId, type, currency) {
        const wallet = await this.getWallet(userId, type, currency);
        return (0, precision_1.safeAdd)(wallet.balance, wallet.inOrder, currency);
    }
    /**
     * Get available balance (excluding inOrder)
     */
    async getAvailableBalance(userId, type, currency) {
        const wallet = await this.getWallet(userId, type, currency);
        return wallet.balance;
    }
    /**
     * Get all wallets for a user
     */
    async getUserWallets(userId, type) {
        const where = { userId };
        if (type) {
            where.type = type;
        }
        const wallets = await db_1.models.wallet.findAll({ where });
        return wallets.map((w) => {
            var _a, _b;
            const plain = w.get({ plain: true });
            const balance = parseFloat(((_a = plain.balance) === null || _a === void 0 ? void 0 : _a.toString()) || "0");
            const inOrder = parseFloat(((_b = plain.inOrder) === null || _b === void 0 ? void 0 : _b.toString()) || "0");
            return {
                walletId: plain.id,
                userId: plain.userId,
                type: plain.type,
                currency: plain.currency,
                balance,
                inOrder,
                totalValue: balance + inOrder,
                timestamp: new Date(),
            };
        });
    }
    /**
     * Verify wallet integrity
     */
    async verifyWalletIntegrity(walletId) {
        var _a, _b;
        const wallet = await this.getWalletById(walletId);
        const transactions = await db_1.models.transaction.findAll({
            where: { walletId, status: "COMPLETED" },
        });
        let expectedBalance = 0;
        for (const tx of transactions) {
            const amount = parseFloat(((_a = tx.amount) === null || _a === void 0 ? void 0 : _a.toString()) || "0");
            const fee = parseFloat(((_b = tx.fee) === null || _b === void 0 ? void 0 : _b.toString()) || "0");
            // Check metadata to determine the actual operation type
            const metadata = typeof tx.metadata === 'string'
                ? JSON.parse(tx.metadata)
                : tx.metadata || {};
            const operationType = metadata.operationType || tx.type;
            switch (tx.type) {
                case "DEPOSIT":
                case "INCOMING_TRANSFER":
                case "REFUND":
                case "REFUND_WITHDRAWAL":
                case "TRADE_CREDIT":
                case "BINARY_ORDER_WIN":
                case "AI_INVESTMENT_ROI":
                case "STAKING_REWARD":
                    expectedBalance += amount;
                    break;
                case "WITHDRAW":
                case "OUTGOING_TRANSFER":
                case "FEE":
                case "TRADE_DEBIT":
                case "BINARY_ORDER":
                case "BINARY_ORDER_LOSS":
                case "AI_INVESTMENT":
                case "ICO_CONTRIBUTION":
                case "STAKING_DEPOSIT":
                    expectedBalance -= amount + fee;
                    break;
                case "EXCHANGE_ORDER":
                    // For EXCHANGE_ORDER, check the actual operation type in metadata
                    if (operationType === "HOLD") {
                        // HOLD decreases balance, increases inOrder
                        expectedBalance -= amount;
                    }
                    else if (operationType === "RELEASE") {
                        // RELEASE increases balance, decreases inOrder
                        expectedBalance += amount;
                    }
                    // TRADE_DEBIT and TRADE_CREDIT are handled above
                    break;
            }
        }
        const actualBalance = wallet.balance;
        const discrepancy = Math.abs(expectedBalance - actualBalance);
        return {
            isValid: discrepancy < 0.00000001,
            expectedBalance: (0, precision_1.roundToPrecision)(expectedBalance, wallet.currency),
            actualBalance,
            discrepancy,
        };
    }
    /**
     * Check if user has sufficient balance
     */
    async hasSufficientBalance(userId, type, currency, amount) {
        try {
            const wallet = await this.getWallet(userId, type, currency);
            return wallet.balance >= amount;
        }
        catch (error) {
            if (error instanceof errors_1.WalletNotFoundError) {
                return false;
            }
            throw error;
        }
    }
    // ============================================
    // ECOSYSTEM WALLET OPERATIONS
    // ============================================
    /**
     * Helper to get chain-specific precision from cache
     * Uses PrecisionCacheService to get real precision from DB
     */
    async getChainPrecision(currency, chain) {
        return await PrecisionCacheService_1.precisionCacheService.getPrecision("ECO", currency, chain);
    }
    /**
     * Update balance with chain-specific precision from cache
     */
    async updateBalancePrecision(amount, currency, chain) {
        const precision = await this.getChainPrecision(currency, chain);
        return parseFloat(amount.toFixed(precision));
    }
    /**
     * Parse wallet address JSON safely
     */
    parseAddressJson(addressStr) {
        if (typeof addressStr === "object" && addressStr !== null) {
            return addressStr;
        }
        try {
            return JSON.parse(addressStr || "{}");
        }
        catch (_a) {
            return {};
        }
    }
    /**
     * Credit funds to an ecosystem wallet (blockchain deposit)
     * Updates both wallet balance and chain-specific balance in address JSON
     * @param operation - The ecosystem wallet operation details
     */
    async ecoCredit(operation) {
        this.validateAmount(operation.amount, "Eco Credit");
        const executeInTransaction = async (t) => {
            var _a, _b;
            // 1. Idempotency check
            const { isDuplicate, existingTransactionId } = await this.checkIdempotency(operation.idempotencyKey, t);
            if (isDuplicate) {
                throw new errors_1.DuplicateOperationError(operation.idempotencyKey, existingTransactionId);
            }
            // 2. Get wallet with lock
            const walletRecord = await db_1.models.wallet.findOne({
                where: { id: operation.walletId },
                lock: sequelize_1.Transaction.LOCK.UPDATE,
                transaction: t,
            });
            if (!walletRecord) {
                throw new errors_1.WalletNotFoundError(operation.walletId);
            }
            const wallet = this.toWalletAttributes(walletRecord);
            this.validateWalletStatus(wallet);
            // 3. Parse and update address JSON with chain balance
            const addresses = this.parseAddressJson(wallet.address);
            const chain = operation.chain;
            const currency = operation.currency;
            const precisionAmount = await this.updateBalancePrecision(operation.amount, currency, chain);
            let previousChainBalance = 0;
            let newChainBalance = 0;
            if (addresses[chain]) {
                previousChainBalance = await this.updateBalancePrecision(parseFloat(((_a = addresses[chain].balance) === null || _a === void 0 ? void 0 : _a.toString()) || "0"), currency, chain);
                newChainBalance = await this.updateBalancePrecision(previousChainBalance + precisionAmount, currency, chain);
                addresses[chain].balance = newChainBalance;
            }
            // 4. Calculate new wallet balance
            const previousBalance = wallet.balance;
            const newBalance = await this.updateBalancePrecision(previousBalance + precisionAmount, currency, chain);
            // 5. Update wallet (balance + address JSON)
            await db_1.models.wallet.update({
                balance: newBalance,
                address: JSON.stringify(addresses),
            }, { where: { id: wallet.id }, transaction: t });
            // 6. Update walletData for the specific chain
            const walletData = await db_1.models.walletData.findOne({
                where: { walletId: wallet.id, chain },
                transaction: t,
            });
            if (walletData) {
                const currentWalletDataBalance = parseFloat(((_b = walletData.balance) === null || _b === void 0 ? void 0 : _b.toString()) || "0");
                const newWalletDataBalance = await this.updateBalancePrecision(currentWalletDataBalance + precisionAmount, currency, chain);
                await db_1.models.walletData.update({ balance: newWalletDataBalance }, { where: { walletId: wallet.id, chain }, transaction: t });
            }
            // 7. Create transaction record
            const fromAddress = Array.isArray(operation.fromAddress)
                ? operation.fromAddress[0] || "Unknown"
                : operation.fromAddress || "Unknown";
            const txRecord = await db_1.models.transaction.create({
                userId: operation.userId,
                walletId: wallet.id,
                type: "DEPOSIT",
                status: "COMPLETED",
                amount: precisionAmount,
                fee: operation.fee || 0,
                description: operation.description || `Deposit of ${precisionAmount} ${operation.currency} from ${fromAddress}`,
                trxId: operation.txHash,
                referenceId: operation.referenceId,
                metadata: JSON.stringify({
                    idempotencyKey: operation.idempotencyKey,
                    chain,
                    currency: operation.currency,
                    previousBalance,
                    newBalance,
                    previousChainBalance,
                    newChainBalance,
                    from: operation.fromAddress,
                    to: operation.toAddress,
                    ...operation.metadata,
                }),
            }, { transaction: t });
            // 8. Audit log
            await this.auditLogger.logCredit(wallet.id, operation.userId, precisionAmount, previousBalance, newBalance, txRecord.id, operation.idempotencyKey, { chain, previousChainBalance, newChainBalance, ...operation.metadata });
            return {
                success: true,
                walletId: wallet.id,
                transactionId: txRecord.id,
                previousBalance,
                newBalance,
                previousChainBalance,
                newChainBalance,
                chain,
                timestamp: new Date(),
            };
        };
        if (operation.transaction) {
            return executeInTransaction(operation.transaction);
        }
        return await db_1.sequelize.transaction(executeInTransaction);
    }
    /**
     * Debit funds from an ecosystem wallet (blockchain withdrawal)
     * Updates both wallet balance and chain-specific balance in address JSON
     * @param operation - The ecosystem wallet operation details
     */
    async ecoDebit(operation) {
        this.validateAmount(operation.amount, "Eco Debit");
        const executeInTransaction = async (t) => {
            var _a, _b;
            // 1. Idempotency check
            const { isDuplicate, existingTransactionId } = await this.checkIdempotency(operation.idempotencyKey, t);
            if (isDuplicate) {
                throw new errors_1.DuplicateOperationError(operation.idempotencyKey, existingTransactionId);
            }
            // 2. Get wallet with lock
            const walletRecord = await db_1.models.wallet.findOne({
                where: { id: operation.walletId },
                lock: sequelize_1.Transaction.LOCK.UPDATE,
                transaction: t,
            });
            if (!walletRecord) {
                throw new errors_1.WalletNotFoundError(operation.walletId);
            }
            const wallet = this.toWalletAttributes(walletRecord);
            this.validateWalletStatus(wallet);
            // 3. Parse and update address JSON with chain balance
            const addresses = this.parseAddressJson(wallet.address);
            const chain = operation.chain;
            const currency = operation.currency;
            const precisionAmount = await this.updateBalancePrecision(operation.amount, currency, chain);
            let previousChainBalance = 0;
            let newChainBalance = 0;
            if (addresses[chain]) {
                previousChainBalance = await this.updateBalancePrecision(parseFloat(((_a = addresses[chain].balance) === null || _a === void 0 ? void 0 : _a.toString()) || "0"), currency, chain);
                newChainBalance = await this.updateBalancePrecision(previousChainBalance - precisionAmount, currency, chain);
                // Check sufficient chain balance
                if (newChainBalance < 0) {
                    throw new errors_1.InsufficientFundsError(previousChainBalance, precisionAmount, currency);
                }
                addresses[chain].balance = newChainBalance;
            }
            else {
                throw (0, error_1.createError)({ statusCode: 404, message: `Chain ${chain} not found in wallet addresses` });
            }
            // 4. Calculate new wallet balance
            const previousBalance = wallet.balance;
            const newBalance = await this.updateBalancePrecision(previousBalance - precisionAmount, currency, chain);
            // 5. Check sufficient wallet balance
            if (newBalance < 0) {
                throw new errors_1.NegativeBalanceError(wallet.id, newBalance);
            }
            // 6. Update wallet (balance + address JSON)
            await db_1.models.wallet.update({
                balance: newBalance,
                address: JSON.stringify(addresses),
            }, { where: { id: wallet.id }, transaction: t });
            // 7. Update walletData for the specific chain
            const walletData = await db_1.models.walletData.findOne({
                where: { walletId: wallet.id, chain },
                transaction: t,
            });
            if (walletData) {
                const currentWalletDataBalance = parseFloat(((_b = walletData.balance) === null || _b === void 0 ? void 0 : _b.toString()) || "0");
                const newWalletDataBalance = await this.updateBalancePrecision(currentWalletDataBalance - precisionAmount, currency, chain);
                await db_1.models.walletData.update({ balance: newWalletDataBalance }, { where: { walletId: wallet.id, chain }, transaction: t });
            }
            // 8. Audit log (no transaction record created here - caller handles that)
            await this.auditLogger.logDebit(wallet.id, operation.userId, precisionAmount, previousBalance, newBalance, operation.idempotencyKey, // Using idempotencyKey as placeholder
            operation.idempotencyKey, { chain, previousChainBalance, newChainBalance, ...operation.metadata });
            return {
                success: true,
                walletId: wallet.id,
                transactionId: operation.idempotencyKey, // Caller creates actual transaction
                previousBalance,
                newBalance,
                previousChainBalance,
                newChainBalance,
                chain,
                timestamp: new Date(),
            };
        };
        if (operation.transaction) {
            return executeInTransaction(operation.transaction);
        }
        return await db_1.sequelize.transaction(executeInTransaction);
    }
    /**
     * Refund funds to an ecosystem wallet (failed withdrawal refund)
     * Updates both wallet balance and chain-specific balance in address JSON
     * @param operation - The ecosystem wallet operation details
     */
    async ecoRefund(operation) {
        this.validateAmount(operation.amount, "Eco Refund");
        const executeInTransaction = async (t) => {
            var _a, _b;
            // 1. Idempotency check
            const { isDuplicate, existingTransactionId } = await this.checkIdempotency(operation.idempotencyKey, t);
            if (isDuplicate) {
                throw new errors_1.DuplicateOperationError(operation.idempotencyKey, existingTransactionId);
            }
            // 2. Get wallet with lock
            const walletRecord = await db_1.models.wallet.findOne({
                where: { id: operation.walletId },
                lock: sequelize_1.Transaction.LOCK.UPDATE,
                transaction: t,
            });
            if (!walletRecord) {
                throw new errors_1.WalletNotFoundError(operation.walletId);
            }
            const wallet = this.toWalletAttributes(walletRecord);
            // 3. Parse and update address JSON with chain balance
            const addresses = this.parseAddressJson(wallet.address);
            const chain = operation.chain;
            const currency = operation.currency;
            const precisionAmount = await this.updateBalancePrecision(operation.amount, currency, chain);
            let previousChainBalance = 0;
            let newChainBalance = 0;
            if (chain && addresses[chain]) {
                previousChainBalance = await this.updateBalancePrecision(parseFloat(((_a = addresses[chain].balance) === null || _a === void 0 ? void 0 : _a.toString()) || "0"), currency, chain);
                newChainBalance = await this.updateBalancePrecision(previousChainBalance + precisionAmount, currency, chain);
                addresses[chain].balance = newChainBalance;
            }
            // 4. Calculate new wallet balance
            const previousBalance = wallet.balance;
            const newBalance = await this.updateBalancePrecision(previousBalance + precisionAmount, currency, chain);
            // 5. Update wallet (balance + address JSON)
            await db_1.models.wallet.update({
                balance: newBalance,
                address: JSON.stringify(addresses),
            }, { where: { id: wallet.id }, transaction: t });
            // 6. Update walletData for the specific chain
            if (chain) {
                const walletData = await db_1.models.walletData.findOne({
                    where: { walletId: wallet.id, chain },
                    transaction: t,
                });
                if (walletData) {
                    const currentWalletDataBalance = parseFloat(((_b = walletData.balance) === null || _b === void 0 ? void 0 : _b.toString()) || "0");
                    const newWalletDataBalance = await this.updateBalancePrecision(currentWalletDataBalance + precisionAmount, currency, chain);
                    await db_1.models.walletData.update({ balance: newWalletDataBalance }, { where: { walletId: wallet.id, chain }, transaction: t });
                }
            }
            // 7. Audit log
            await this.auditLogger.logCredit(wallet.id, operation.userId, precisionAmount, previousBalance, newBalance, operation.idempotencyKey, operation.idempotencyKey, { chain, previousChainBalance, newChainBalance, refund: true, ...operation.metadata });
            return {
                success: true,
                walletId: wallet.id,
                transactionId: operation.idempotencyKey,
                previousBalance,
                newBalance,
                previousChainBalance,
                newChainBalance,
                chain,
                timestamp: new Date(),
            };
        };
        if (operation.transaction) {
            return executeInTransaction(operation.transaction);
        }
        return await db_1.sequelize.transaction(executeInTransaction);
    }
}
exports.WalletService = WalletService;
exports.walletService = WalletService.getInstance();
