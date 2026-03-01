"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PoolManager = void 0;
const db_1 = require("@b/db");
const console_1 = require("@b/utils/console");
const BalanceTracker_1 = require("./BalanceTracker");
const PnLCalculator_1 = require("./PnLCalculator");
/**
 * PoolManager - Manages liquidity pools for AI market making
 *
 * Handles:
 * - Balance tracking for each pool
 * - Deposits and withdrawals
 * - P&L calculations
 * - Rebalancing
 */
class PoolManager {
    constructor() {
        // Balance trackers by market maker ID
        this.balanceTrackers = new Map();
        this.pnlCalculator = new PnLCalculator_1.PnLCalculator();
    }
    /**
     * Get or create balance tracker for a market maker
     */
    getBalanceTracker(marketMakerId) {
        let tracker = this.balanceTrackers.get(marketMakerId);
        if (!tracker) {
            tracker = new BalanceTracker_1.BalanceTracker(marketMakerId);
            this.balanceTrackers.set(marketMakerId, tracker);
        }
        return tracker;
    }
    /**
     * Get pool balance
     */
    async getBalance(marketMakerId) {
        const tracker = this.getBalanceTracker(marketMakerId);
        return tracker.getBalance();
    }
    /**
     * Deposit to pool
     */
    async deposit(marketMakerId, currency, amount) {
        try {
            const tracker = this.getBalanceTracker(marketMakerId);
            await tracker.deposit(currency, amount);
            // Update database
            await this.updatePoolInDatabase(marketMakerId);
            // Log history
            await this.logPoolAction(marketMakerId, "DEPOSIT", {
                currency,
                amount,
            });
            return true;
        }
        catch (error) {
            console_1.logger.error("AI_MM_POOL", "Failed to deposit to pool", error);
            return false;
        }
    }
    /**
     * Withdraw from pool
     */
    async withdraw(marketMakerId, currency, amount) {
        try {
            const tracker = this.getBalanceTracker(marketMakerId);
            // Check if withdrawal is allowed
            if (!await tracker.canWithdraw(currency, amount)) {
                console_1.logger.warn("AI_MM", "Insufficient balance for withdrawal");
                return false;
            }
            await tracker.withdraw(currency, amount);
            // Update database
            await this.updatePoolInDatabase(marketMakerId);
            // Log history
            await this.logPoolAction(marketMakerId, "WITHDRAW", {
                currency,
                amount,
            });
            return true;
        }
        catch (error) {
            console_1.logger.error("AI_MM_POOL", "Failed to withdraw from pool", error);
            return false;
        }
    }
    /**
     * Check if withdrawal is allowed
     */
    async canWithdraw(marketMakerId, currency, amount) {
        const tracker = this.getBalanceTracker(marketMakerId);
        // Check market maker status
        const maker = await db_1.models.aiMarketMaker.findByPk(marketMakerId);
        if (maker && maker.status === "ACTIVE") {
            return {
                allowed: false,
                reason: "Cannot withdraw while market maker is active. Please pause first.",
            };
        }
        // Check balance
        if (!await tracker.canWithdraw(currency, amount)) {
            return {
                allowed: false,
                reason: "Insufficient available balance",
            };
        }
        return { allowed: true };
    }
    /**
     * Rebalance pool
     */
    async rebalance(marketMakerId, targetRatio) {
        try {
            const tracker = this.getBalanceTracker(marketMakerId);
            await tracker.rebalance(targetRatio);
            // Update database
            await this.updatePoolInDatabase(marketMakerId);
            // Log history
            await this.logPoolAction(marketMakerId, "REBALANCE", {
                targetRatio,
            });
            return true;
        }
        catch (error) {
            console_1.logger.error("AI_MM_POOL", "Failed to rebalance pool", error);
            return false;
        }
    }
    /**
     * Update all pool balances
     */
    async updateAllBalances() {
        for (const [marketMakerId, tracker] of this.balanceTrackers) {
            try {
                await tracker.syncFromDatabase();
                await this.pnlCalculator.calculatePnL(marketMakerId, tracker);
            }
            catch (error) {
                // Ignore individual update errors
            }
        }
    }
    /**
     * Get P&L for a market maker
     */
    async getPnL(marketMakerId) {
        return this.pnlCalculator.getPnL(marketMakerId);
    }
    /**
     * Record a trade's P&L
     */
    async recordTradePnL(marketMakerId, pnl, isRealized) {
        this.pnlCalculator.recordPnL(marketMakerId, pnl, isRealized);
    }
    /**
     * Get all pool statistics
     */
    async getAllPoolStats() {
        const stats = new Map();
        for (const [marketMakerId, tracker] of this.balanceTrackers) {
            stats.set(marketMakerId, {
                balance: await tracker.getBalance(),
                pnl: await this.getPnL(marketMakerId),
            });
        }
        return stats;
    }
    // ============================================
    // Private Methods
    // ============================================
    /**
     * Update pool in database
     */
    async updatePoolInDatabase(marketMakerId) {
        try {
            const tracker = this.getBalanceTracker(marketMakerId);
            const balance = await tracker.getBalance();
            await db_1.models.aiMarketMakerPool.update({
                baseCurrencyBalance: balance.baseCurrency,
                quoteCurrencyBalance: balance.quoteCurrency,
                totalValueLocked: balance.totalValueLocked,
            }, { where: { marketMakerId } });
        }
        catch (error) {
            console_1.logger.error("AI_MM_POOL", "Failed to update pool in database", error);
        }
    }
    /**
     * Log pool action to history
     */
    async logPoolAction(marketMakerId, action, details) {
        try {
            const tracker = this.getBalanceTracker(marketMakerId);
            const balance = await tracker.getBalance();
            await db_1.models.aiMarketMakerHistory.create({
                marketMakerId,
                action,
                details,
                priceAtAction: 0,
                poolValueAtAction: balance.totalValueLocked,
            });
        }
        catch (error) {
            // Ignore history logging errors
        }
    }
}
exports.PoolManager = PoolManager;
exports.default = PoolManager;
