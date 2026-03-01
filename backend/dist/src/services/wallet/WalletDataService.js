"use strict";
/**
 * WalletDataService
 * Manages encrypted wallet data (private keys, mnemonics, etc.)
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.walletDataService = exports.WalletDataService = void 0;
const db_1 = require("@b/db");
const encrypt_1 = require("@b/utils/encrypt");
const console_1 = require("@b/utils/console");
const errors_1 = require("./errors");
const precision_1 = require("./utils/precision");
class WalletDataService {
    constructor() { }
    static getInstance() {
        if (!WalletDataService.instance) {
            WalletDataService.instance = new WalletDataService();
        }
        return WalletDataService.instance;
    }
    // ============================================
    // CREATION
    // ============================================
    /**
     * Create or update wallet data record
     */
    async create(request) {
        const { walletId, currency, chain, address, index = 0, encryptedData, transaction, } = request;
        // Check for existing
        const existing = await db_1.models.walletData.findOne({
            where: { walletId, currency, chain },
            ...(transaction && { transaction }),
        });
        if (existing) {
            // Update existing record
            await db_1.models.walletData.update({
                balance: 0,
                index,
                data: encryptedData,
            }, {
                where: { walletId, currency, chain },
                ...(transaction && { transaction }),
            });
            const updated = await db_1.models.walletData.findOne({
                where: { walletId, currency, chain },
                ...(transaction && { transaction }),
            });
            return this.toAttributes(updated);
        }
        // Create new record
        const walletData = await db_1.models.walletData.create({
            walletId,
            currency,
            chain,
            balance: 0,
            index,
            data: encryptedData,
        }, transaction ? { transaction } : undefined);
        console_1.logger.debug("WALLET_DATA", `Created wallet data for ${walletId}/${chain}`);
        return this.toAttributes(walletData);
    }
    // ============================================
    // RETRIEVAL
    // ============================================
    /**
     * Get wallet data by wallet and chain
     */
    async getByWalletAndChain(walletId, chain, transaction) {
        const data = await db_1.models.walletData.findOne({
            where: { walletId, chain },
            ...(transaction && { transaction }),
        });
        return data ? this.toAttributes(data) : null;
    }
    /**
     * Get wallet data by wallet and chain (throws if not found)
     */
    async getByWalletAndChainOrThrow(walletId, chain, transaction) {
        const data = await this.getByWalletAndChain(walletId, chain, transaction);
        if (!data) {
            throw new errors_1.WalletDataNotFoundError(walletId, chain);
        }
        return data;
    }
    /**
     * Get all wallet data for a wallet
     */
    async getAllForWallet(walletId) {
        const data = await db_1.models.walletData.findAll({
            where: { walletId },
        });
        return data.map((d) => this.toAttributes(d));
    }
    /**
     * Get decrypted wallet data
     */
    async getDecryptedData(walletId, chain) {
        const walletData = await this.getByWalletAndChain(walletId, chain);
        if (!walletData || !walletData.data) {
            return null;
        }
        try {
            return JSON.parse((0, encrypt_1.decrypt)(walletData.data));
        }
        catch (error) {
            console_1.logger.error("WALLET_DATA", `Failed to decrypt wallet data: ${error.message}`);
            throw new errors_1.EncryptionError("decrypt");
        }
    }
    /**
     * Get decrypted wallet data (throws if not found)
     */
    async getDecryptedDataOrThrow(walletId, chain) {
        const data = await this.getDecryptedData(walletId, chain);
        if (!data) {
            throw new errors_1.WalletDataNotFoundError(walletId, chain);
        }
        return data;
    }
    // ============================================
    // BALANCE UPDATES
    // ============================================
    /**
     * Update wallet data balance
     */
    async updateBalance(walletId, chain, amount, operation, transaction) {
        var _a;
        const walletData = await db_1.models.walletData.findOne({
            where: { walletId, chain },
            ...(transaction && { transaction }),
        });
        if (!walletData) {
            throw new errors_1.WalletDataNotFoundError(walletId, chain);
        }
        const currentBalance = parseFloat(((_a = walletData.balance) === null || _a === void 0 ? void 0 : _a.toString()) || "0");
        let newBalance;
        if (operation === "add") {
            newBalance = (0, precision_1.safeAdd)(currentBalance, amount, walletData.currency);
        }
        else {
            newBalance = (0, precision_1.safeSubtract)(currentBalance, amount, walletData.currency);
            if (newBalance < 0) {
                throw new errors_1.WalletError(`Insufficient balance in wallet data: ${currentBalance} < ${amount}`, "INSUFFICIENT_WALLET_DATA_BALANCE", 400);
            }
        }
        await db_1.models.walletData.update({ balance: newBalance }, {
            where: { walletId, chain },
            ...(transaction && { transaction }),
        });
        console_1.logger.debug("WALLET_DATA", `Updated balance for ${walletId}/${chain}: ${currentBalance} -> ${newBalance}`);
    }
    /**
     * Sync balance with wallet address balance
     */
    async syncBalance(walletId, chain, balance, transaction) {
        await db_1.models.walletData.update({ balance }, {
            where: { walletId, chain },
            ...(transaction && { transaction }),
        });
    }
    /**
     * Get total balance across all chains for a wallet
     */
    async getTotalBalance(walletId) {
        const result = await db_1.models.walletData.sum("balance", {
            where: { walletId },
        });
        return result || 0;
    }
    // ============================================
    // UTILITY
    // ============================================
    /**
     * Check if wallet data exists
     */
    async exists(walletId, chain) {
        const count = await db_1.models.walletData.count({
            where: { walletId, chain },
        });
        return count > 0;
    }
    /**
     * Delete wallet data
     */
    async delete(walletId, chain, transaction) {
        await db_1.models.walletData.destroy({
            where: { walletId, chain },
            ...(transaction && { transaction }),
        });
    }
    /**
     * Convert model to attributes
     */
    toAttributes(data) {
        var _a;
        const plain = data.get ? data.get({ plain: true }) : data;
        return {
            ...plain,
            balance: parseFloat(((_a = plain.balance) === null || _a === void 0 ? void 0 : _a.toString()) || "0"),
        };
    }
}
exports.WalletDataService = WalletDataService;
exports.walletDataService = WalletDataService.getInstance();
