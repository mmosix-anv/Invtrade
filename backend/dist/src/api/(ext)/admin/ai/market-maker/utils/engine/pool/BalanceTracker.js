"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.BalanceTracker = void 0;
const db_1 = require("@b/db");
const tvl_1 = require("../../helpers/tvl");
const error_1 = require("@b/utils/error");
/**
 * BalanceTracker - Tracks real-time balance for a single pool
 *
 * Handles:
 * - Current balance tracking
 * - Reserved balance for open orders
 * - Available balance calculation
 * - Balance sync with database
 */
class BalanceTracker {
    constructor(marketMakerId) {
        // Current balances
        this.baseCurrencyBalance = 0;
        this.quoteCurrencyBalance = 0;
        // Reserved for open orders
        this.reservedBase = 0;
        this.reservedQuote = 0;
        // Initial balances (for P&L calculation)
        this.initialBaseBalance = 0;
        this.initialQuoteBalance = 0;
        // Last sync time
        this.lastSyncTime = null;
        // Current price for TVL calculation
        this.currentPrice = 0;
        this.marketMakerId = marketMakerId;
    }
    /**
     * Set current price for accurate TVL calculation
     */
    setCurrentPrice(price) {
        this.currentPrice = price;
    }
    /**
     * Sync balance from database
     */
    async syncFromDatabase() {
        try {
            const pool = await db_1.models.aiMarketMakerPool.findOne({
                where: { marketMakerId: this.marketMakerId },
            });
            if (pool) {
                this.baseCurrencyBalance = parseFloat(pool.baseCurrencyBalance) || 0;
                this.quoteCurrencyBalance = parseFloat(pool.quoteCurrencyBalance) || 0;
                this.initialBaseBalance = parseFloat(pool.initialBaseBalance) || 0;
                this.initialQuoteBalance = parseFloat(pool.initialQuoteBalance) || 0;
                this.lastSyncTime = new Date();
            }
        }
        catch (error) {
            // Keep cached values on error
        }
    }
    /**
     * Get current balance
     */
    async getBalance() {
        // Ensure we have recent data
        if (!this.lastSyncTime || Date.now() - this.lastSyncTime.getTime() > 60000) {
            await this.syncFromDatabase();
        }
        // Calculate TVL using centralized helper with actual price
        const totalValueLocked = (0, tvl_1.calculateTVL)({
            baseBalance: this.baseCurrencyBalance,
            quoteBalance: this.quoteCurrencyBalance,
            currentPrice: this.currentPrice,
        });
        return {
            baseCurrency: this.baseCurrencyBalance,
            quoteCurrency: this.quoteCurrencyBalance,
            totalValueLocked,
        };
    }
    /**
     * Get available balance (total - reserved)
     */
    getAvailableBalance() {
        return {
            base: Math.max(0, this.baseCurrencyBalance - this.reservedBase),
            quote: Math.max(0, this.quoteCurrencyBalance - this.reservedQuote),
        };
    }
    /**
     * Reserve balance for an order
     */
    reserve(currency, amount) {
        const available = this.getAvailableBalance();
        if (currency === "base") {
            if (available.base < amount) {
                return false;
            }
            this.reservedBase += amount;
        }
        else {
            if (available.quote < amount) {
                return false;
            }
            this.reservedQuote += amount;
        }
        return true;
    }
    /**
     * Release reserved balance
     */
    release(currency, amount) {
        if (currency === "base") {
            this.reservedBase = Math.max(0, this.reservedBase - amount);
        }
        else {
            this.reservedQuote = Math.max(0, this.reservedQuote - amount);
        }
    }
    /**
     * Deposit funds
     */
    async deposit(currency, amount) {
        if (currency === "base") {
            this.baseCurrencyBalance += amount;
        }
        else {
            this.quoteCurrencyBalance += amount;
        }
    }
    /**
     * Withdraw funds
     */
    async withdraw(currency, amount) {
        const available = this.getAvailableBalance();
        if (currency === "base") {
            if (available.base < amount) {
                throw (0, error_1.createError)({ statusCode: 400, message: "Insufficient base currency balance" });
            }
            this.baseCurrencyBalance -= amount;
        }
        else {
            if (available.quote < amount) {
                throw (0, error_1.createError)({ statusCode: 400, message: "Insufficient quote currency balance" });
            }
            this.quoteCurrencyBalance -= amount;
        }
    }
    /**
     * Check if withdrawal is possible
     */
    async canWithdraw(currency, amount) {
        const available = this.getAvailableBalance();
        if (currency === "base") {
            return available.base >= amount;
        }
        else {
            return available.quote >= amount;
        }
    }
    /**
     * Rebalance pool to target ratio
     */
    async rebalance(targetRatio = 0.5) {
        // targetRatio is the percentage of base currency (0.5 = 50/50)
        const total = this.baseCurrencyBalance + this.quoteCurrencyBalance;
        this.baseCurrencyBalance = total * targetRatio;
        this.quoteCurrencyBalance = total * (1 - targetRatio);
    }
    /**
     * Apply trade (update balances after trade execution)
     */
    applyTrade(side, amount, price, fee = 0) {
        const cost = amount * price;
        if (side === "BUY") {
            // Buying base currency: add base, subtract quote
            this.baseCurrencyBalance += amount;
            this.quoteCurrencyBalance -= cost + fee;
        }
        else {
            // Selling base currency: subtract base, add quote
            this.baseCurrencyBalance -= amount;
            this.quoteCurrencyBalance += cost - fee;
        }
    }
    /**
     * Get initial balances
     */
    getInitialBalances() {
        return {
            base: this.initialBaseBalance,
            quote: this.initialQuoteBalance,
        };
    }
    /**
     * Get reserved amounts
     */
    getReserved() {
        return {
            base: this.reservedBase,
            quote: this.reservedQuote,
        };
    }
}
exports.BalanceTracker = BalanceTracker;
exports.default = BalanceTracker;
