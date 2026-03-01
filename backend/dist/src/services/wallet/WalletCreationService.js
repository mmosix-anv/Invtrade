"use strict";
/**
 * WalletCreationService
 * Handles creation of wallets based on type (FIAT, SPOT, ECO, FUTURES, COPY_TRADING)
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.walletCreationService = exports.WalletCreationService = void 0;
const db_1 = require("@b/db");
const console_1 = require("@b/utils/console");
const errors_1 = require("./errors");
const AddressGenerationService_1 = require("./AddressGenerationService");
const WalletDataService_1 = require("./WalletDataService");
const AuditLogger_1 = require("./audit/AuditLogger");
class WalletCreationService {
    constructor() {
        this.addressGenService = AddressGenerationService_1.AddressGenerationService.getInstance();
        this.walletDataService = WalletDataService_1.WalletDataService.getInstance();
    }
    static getInstance() {
        if (!WalletCreationService.instance) {
            WalletCreationService.instance = new WalletCreationService();
        }
        return WalletCreationService.instance;
    }
    // ============================================
    // MAIN WALLET CREATION
    // ============================================
    /**
     * Create a wallet based on type
     * Handles all wallet types with appropriate setup
     */
    async createWallet(request) {
        const { userId, type, currency, generateAddresses = true } = request;
        return await db_1.sequelize.transaction(async (t) => {
            // 1. Check if wallet already exists
            const existing = await db_1.models.wallet.findOne({
                where: { userId, type, currency },
                transaction: t,
            });
            if (existing) {
                // For ECO wallets, ensure addresses are complete
                if (type === "ECO" && generateAddresses) {
                    return await this.ensureEcoWalletComplete(existing, t);
                }
                return this.buildResult(this.toWalletAttributes(existing));
            }
            // 2. Create wallet based on type
            switch (type) {
                case "FIAT":
                    return await this.createFiatWallet(userId, currency, t);
                case "SPOT":
                    return await this.createSpotWallet(userId, currency, t);
                case "ECO":
                    return await this.createEcoWallet(userId, currency, generateAddresses, t);
                case "FUTURES":
                    return await this.createFuturesWallet(userId, currency, t);
                case "COPY_TRADING":
                    return await this.createCopyTradingWallet(userId, currency, t);
                default:
                    throw new errors_1.WalletError(`Unknown wallet type: ${type}`, "INVALID_WALLET_TYPE", 400);
            }
        });
    }
    // ============================================
    // TYPE-SPECIFIC CREATION
    // ============================================
    /**
     * Create FIAT wallet (simple, no addresses)
     */
    async createFiatWallet(userId, currency, transaction) {
        const wallet = await db_1.models.wallet.create({
            userId,
            type: "FIAT",
            currency: currency.toUpperCase(),
            balance: 0,
            inOrder: 0,
            status: true,
        }, { transaction });
        await AuditLogger_1.auditLogger.logWalletCreated(wallet.id, userId, "FIAT", currency);
        return this.buildResult(this.toWalletAttributes(wallet));
    }
    /**
     * Create SPOT wallet (for exchange trading)
     */
    async createSpotWallet(userId, currency, transaction) {
        const wallet = await db_1.models.wallet.create({
            userId,
            type: "SPOT",
            currency: currency.toUpperCase(),
            balance: 0,
            inOrder: 0,
            status: true,
        }, { transaction });
        await AuditLogger_1.auditLogger.logWalletCreated(wallet.id, userId, "SPOT", currency);
        return this.buildResult(this.toWalletAttributes(wallet));
    }
    /**
     * Create ECO wallet with multi-chain addresses
     */
    async createEcoWallet(userId, currency, generateAddresses, transaction) {
        // 1. Create base wallet
        const wallet = await db_1.models.wallet.create({
            userId,
            type: "ECO",
            currency: currency.toUpperCase(),
            balance: 0,
            inOrder: 0,
            status: true,
            address: JSON.stringify({}),
        }, { transaction });
        let addresses = {};
        const walletDataRecords = [];
        if (generateAddresses) {
            // 2. Get active tokens for this currency
            const tokens = await this.getActiveTokens(currency);
            if (tokens.length === 0) {
                console_1.logger.warn("WALLET_CREATION", `No active tokens found for currency: ${currency}, creating wallet without addresses`);
            }
            // 3. Generate addresses for each token/chain
            for (const token of tokens) {
                try {
                    const generated = await this.addressGenService.generateAddress({
                        walletId: wallet.id,
                        currency,
                        chain: token.chain,
                        contractType: token.contractType,
                        network: token.network,
                        transaction,
                    });
                    addresses[token.chain] = {
                        address: generated.address,
                        network: generated.network,
                        balance: 0,
                    };
                    // 4. Create WalletData record
                    const walletData = await this.walletDataService.create({
                        walletId: wallet.id,
                        currency,
                        chain: token.chain,
                        address: generated.address,
                        index: generated.index,
                        encryptedData: generated.encryptedData,
                        transaction,
                    });
                    walletDataRecords.push(walletData);
                }
                catch (error) {
                    console_1.logger.error("WALLET_CREATION", `Failed to generate address for ${token.chain}: ${error.message}`);
                    // Continue with other chains
                }
            }
            // 5. Update wallet with addresses
            if (Object.keys(addresses).length > 0) {
                await db_1.models.wallet.update({ address: JSON.stringify(addresses) }, { where: { id: wallet.id }, transaction });
            }
        }
        await AuditLogger_1.auditLogger.logWalletCreated(wallet.id, userId, "ECO", currency, Object.keys(addresses));
        const updatedWallet = await db_1.models.wallet.findByPk(wallet.id, { transaction });
        return this.buildResult(this.toWalletAttributes(updatedWallet), walletDataRecords, addresses);
    }
    /**
     * Create FUTURES wallet
     */
    async createFuturesWallet(userId, currency, transaction) {
        const wallet = await db_1.models.wallet.create({
            userId,
            type: "FUTURES",
            currency: currency.toUpperCase(),
            balance: 0,
            inOrder: 0,
            status: true,
        }, { transaction });
        await AuditLogger_1.auditLogger.logWalletCreated(wallet.id, userId, "FUTURES", currency);
        return this.buildResult(this.toWalletAttributes(wallet));
    }
    /**
     * Create COPY_TRADING wallet
     */
    async createCopyTradingWallet(userId, currency, transaction) {
        const wallet = await db_1.models.wallet.create({
            userId,
            type: "COPY_TRADING",
            currency: currency.toUpperCase(),
            balance: 0,
            inOrder: 0,
            status: true,
        }, { transaction });
        await AuditLogger_1.auditLogger.logWalletCreated(wallet.id, userId, "COPY_TRADING", currency);
        return this.buildResult(this.toWalletAttributes(wallet));
    }
    // ============================================
    // HELPER METHODS
    // ============================================
    /**
     * Ensure ECO wallet has all required addresses
     */
    async ensureEcoWalletComplete(wallet, transaction) {
        const tokens = await this.getActiveTokens(wallet.currency);
        let addresses = this.parseAddresses(wallet.address);
        const walletDataRecords = [];
        let updated = false;
        // Check for missing chains
        for (const token of tokens) {
            if (!addresses[token.chain]) {
                try {
                    const generated = await this.addressGenService.generateAddress({
                        walletId: wallet.id,
                        currency: wallet.currency,
                        chain: token.chain,
                        contractType: token.contractType,
                        network: token.network,
                        transaction,
                    });
                    addresses[token.chain] = {
                        address: generated.address,
                        network: generated.network,
                        balance: 0,
                    };
                    const walletData = await this.walletDataService.create({
                        walletId: wallet.id,
                        currency: wallet.currency,
                        chain: token.chain,
                        address: generated.address,
                        index: generated.index,
                        encryptedData: generated.encryptedData,
                        transaction,
                    });
                    walletDataRecords.push(walletData);
                    updated = true;
                    console_1.logger.info("WALLET_CREATION", `Added missing address for ${token.chain} to wallet ${wallet.id}`);
                }
                catch (error) {
                    console_1.logger.error("WALLET_CREATION", `Failed to add missing address for ${token.chain}: ${error.message}`);
                }
            }
        }
        if (updated) {
            await db_1.models.wallet.update({ address: JSON.stringify(addresses) }, { where: { id: wallet.id }, transaction });
        }
        const updatedWallet = await db_1.models.wallet.findByPk(wallet.id, { transaction });
        return this.buildResult(this.toWalletAttributes(updatedWallet), walletDataRecords, addresses);
    }
    /**
     * Get active tokens for a currency
     */
    async getActiveTokens(currency) {
        if (!db_1.models.ecosystemToken) {
            console_1.logger.warn("WALLET_CREATION", "EcosystemToken model not available");
            return [];
        }
        const tokens = await db_1.models.ecosystemToken.findAll({
            where: { currency, status: true },
        });
        // Filter by network environment
        return tokens.filter((token) => {
            const specialChains = ["XMR", "TON", "SOL", "TRON", "BTC", "LTC", "DOGE", "DASH"];
            if (specialChains.includes(token.chain))
                return true;
            const chainEnvVar = `${token.chain.toUpperCase()}_NETWORK`;
            const expectedNetwork = process.env[chainEnvVar];
            if (!expectedNetwork)
                return false;
            return (token.network === expectedNetwork ||
                (token.network === token.chain && expectedNetwork === "mainnet"));
        });
    }
    /**
     * Parse wallet addresses JSON
     */
    parseAddresses(address) {
        if (!address)
            return {};
        if (typeof address === "string") {
            try {
                return JSON.parse(address);
            }
            catch (_a) {
                return {};
            }
        }
        return address;
    }
    // ============================================
    // WALLET RETRIEVAL WITH AUTO-CREATION
    // ============================================
    /**
     * Get or create wallet
     */
    async getOrCreateWallet(userId, type, currency, transaction) {
        const existing = await db_1.models.wallet.findOne({
            where: { userId, type, currency },
            ...(transaction && { transaction }),
        });
        if (existing) {
            if (type === "ECO") {
                if (transaction) {
                    return await this.ensureEcoWalletComplete(existing, transaction);
                }
                return await db_1.sequelize.transaction(async (t) => {
                    return await this.ensureEcoWalletComplete(existing, t);
                });
            }
            return this.buildResult(this.toWalletAttributes(existing));
        }
        // Use provided transaction or create a new one
        if (transaction) {
            return await this.createWalletWithTransaction({ userId, type, currency }, transaction);
        }
        return await this.createWallet({ userId, type, currency });
    }
    /**
     * Create wallet with existing transaction
     */
    async createWalletWithTransaction(request, transaction) {
        const { userId, type, currency, generateAddresses = true } = request;
        // Check if wallet already exists
        const existing = await db_1.models.wallet.findOne({
            where: { userId, type, currency },
            transaction,
        });
        if (existing) {
            if (type === "ECO" && generateAddresses) {
                return await this.ensureEcoWalletComplete(existing, transaction);
            }
            return this.buildResult(this.toWalletAttributes(existing));
        }
        // Create wallet based on type
        switch (type) {
            case "FIAT":
                return await this.createFiatWallet(userId, currency, transaction);
            case "SPOT":
                return await this.createSpotWallet(userId, currency, transaction);
            case "ECO":
                return await this.createEcoWallet(userId, currency, generateAddresses, transaction);
            case "FUTURES":
                return await this.createFuturesWallet(userId, currency, transaction);
            case "COPY_TRADING":
                return await this.createCopyTradingWallet(userId, currency, transaction);
            default:
                throw new errors_1.WalletError(`Unknown wallet type: ${type}`, "INVALID_WALLET_TYPE", 400);
        }
    }
    /**
     * Get wallet by ID
     */
    async getWalletById(walletId) {
        const wallet = await db_1.models.wallet.findByPk(walletId);
        return wallet ? this.toWalletAttributes(wallet) : null;
    }
    /**
     * Get wallet by user, type, and currency
     */
    async getWallet(userId, type, currency) {
        const wallet = await db_1.models.wallet.findOne({
            where: { userId, type, currency },
        });
        return wallet ? this.toWalletAttributes(wallet) : null;
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
        return wallets.map((w) => this.toWalletAttributes(w));
    }
    // ============================================
    // UTILITY
    // ============================================
    /**
     * Convert model to attributes
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
    /**
     * Build creation result with convenience accessors
     */
    buildResult(wallet, walletData, addresses) {
        return {
            wallet,
            walletData,
            addresses,
            id: wallet.id,
            balance: wallet.balance,
        };
    }
}
exports.WalletCreationService = WalletCreationService;
exports.walletCreationService = WalletCreationService.getInstance();
