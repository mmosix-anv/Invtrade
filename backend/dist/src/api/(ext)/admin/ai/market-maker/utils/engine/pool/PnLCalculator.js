"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PnLCalculator = void 0;
const db_1 = require("@b/db");
const tvl_1 = require("../../helpers/tvl");
/**
 * PnLCalculator - Calculates profit and loss for pools
 *
 * Tracks:
 * - Unrealized P&L (based on current vs initial TVL with price consideration)
 * - Realized P&L (from completed trades)
 * - Daily/weekly/monthly aggregations
 */
class PnLCalculator {
    constructor() {
        // P&L tracking by market maker
        this.unrealizedPnL = new Map();
        this.realizedPnL = new Map();
        // Price tracking for accurate P&L
        this.initialPrices = new Map();
        this.currentPrices = new Map();
        // Daily aggregations
        this.dailyPnL = new Map();
    }
    /**
     * Set initial price for a market maker (call when starting)
     */
    setInitialPrice(marketMakerId, price) {
        if (!this.initialPrices.has(marketMakerId)) {
            this.initialPrices.set(marketMakerId, price);
        }
    }
    /**
     * Update current price for a market maker
     */
    updateCurrentPrice(marketMakerId, price) {
        this.currentPrices.set(marketMakerId, price);
    }
    /**
     * Calculate P&L for a market maker using TVL-based calculation
     */
    async calculatePnL(marketMakerId, balanceTracker) {
        try {
            const currentBalance = await balanceTracker.getBalance();
            const initialBalance = balanceTracker.getInitialBalances();
            // Get prices for accurate TVL calculation
            const initialPrice = this.initialPrices.get(marketMakerId) || 1;
            const currentPrice = this.currentPrices.get(marketMakerId) || initialPrice;
            // Calculate P&L using TVL helper (accounts for price changes)
            const pnlResult = (0, tvl_1.calculatePnLFromTVL)(initialBalance.base, initialBalance.quote, currentBalance.baseCurrency, currentBalance.quoteCurrency, initialPrice, currentPrice);
            this.unrealizedPnL.set(marketMakerId, pnlResult.absolutePnL);
            // Update database
            await this.updatePnLInDatabase(marketMakerId);
        }
        catch (error) {
            // Ignore calculation errors
        }
    }
    /**
     * Record a P&L event
     */
    recordPnL(marketMakerId, pnl, isRealized) {
        if (isRealized) {
            const current = this.realizedPnL.get(marketMakerId) || 0;
            this.realizedPnL.set(marketMakerId, current + pnl);
            // Track daily
            this.recordDailyPnL(marketMakerId, pnl);
        }
        else {
            // Unrealized is recalculated, not accumulated
            this.unrealizedPnL.set(marketMakerId, pnl);
        }
    }
    /**
     * Get P&L for a market maker
     */
    async getPnL(marketMakerId) {
        const unrealized = this.unrealizedPnL.get(marketMakerId) || 0;
        const realized = this.realizedPnL.get(marketMakerId) || 0;
        return {
            unrealized,
            realized,
            total: unrealized + realized,
        };
    }
    /**
     * Get daily P&L history
     */
    getDailyPnL(marketMakerId, days = 7) {
        const daily = this.dailyPnL.get(marketMakerId) || [];
        return daily.slice(-days);
    }
    /**
     * Get aggregate P&L for period
     */
    getAggregatePnL(marketMakerId, period) {
        const daily = this.dailyPnL.get(marketMakerId) || [];
        let days;
        switch (period) {
            case "day":
                days = 1;
                break;
            case "week":
                days = 7;
                break;
            case "month":
                days = 30;
                break;
        }
        const recentPnL = daily.slice(-days);
        return recentPnL.reduce((sum, pnl) => sum + pnl, 0);
    }
    /**
     * Reset daily tracking (called at start of new day)
     */
    resetDaily() {
        // Move current day to history and reset
        for (const [marketMakerId] of this.realizedPnL) {
            const todayPnL = this.realizedPnL.get(marketMakerId) || 0;
            this.recordDailyPnL(marketMakerId, todayPnL);
        }
        this.realizedPnL.clear();
    }
    // ============================================
    // Private Methods
    // ============================================
    /**
     * Record daily P&L
     */
    recordDailyPnL(marketMakerId, pnl) {
        const daily = this.dailyPnL.get(marketMakerId) || [];
        daily.push(pnl);
        // Keep only last 30 days
        if (daily.length > 30) {
            daily.shift();
        }
        this.dailyPnL.set(marketMakerId, daily);
    }
    /**
     * Update P&L in database
     */
    async updatePnLInDatabase(marketMakerId) {
        try {
            const unrealized = this.unrealizedPnL.get(marketMakerId) || 0;
            const realized = this.realizedPnL.get(marketMakerId) || 0;
            await db_1.models.aiMarketMakerPool.update({
                unrealizedPnL: unrealized,
                realizedPnL: realized,
            }, { where: { marketMakerId } });
        }
        catch (error) {
            // Ignore database update errors
        }
    }
}
exports.PnLCalculator = PnLCalculator;
exports.default = PnLCalculator;
