"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.LossProtection = void 0;
const db_1 = require("@b/db");
/**
 * LossProtection - Monitors losses and prevents excessive trading
 *
 * Tracks:
 * - Daily loss per market
 * - Global daily loss
 * - Consecutive losses
 * - Loss patterns
 */
class LossProtection {
    constructor() {
        // Daily loss tracking by market
        this.marketDailyLoss = new Map();
        // Consecutive loss tracking
        this.consecutiveLosses = new Map();
        // Global loss tracking
        this.globalDailyLoss = 0;
        this.globalDailyProfit = 0;
        // Last reset timestamp
        this.lastResetDate = new Date();
    }
    /**
     * Check global loss limits
     */
    async checkGlobalLoss(maxDailyLossPercent) {
        // Reset if new day
        this.checkDayReset();
        // Calculate current loss percentage
        const totalCapital = await this.getTotalCapital();
        if (totalCapital <= 0) {
            return { canTrade: true };
        }
        const lossPercent = (this.globalDailyLoss / totalCapital) * 100;
        if (lossPercent >= maxDailyLossPercent) {
            return {
                canTrade: false,
                reason: `Daily loss limit reached: ${lossPercent.toFixed(2)}% (max: ${maxDailyLossPercent}%)`,
            };
        }
        return { canTrade: true };
    }
    /**
     * Get loss percentage for a specific market
     */
    async getMarketLoss(marketId) {
        this.checkDayReset();
        const marketLoss = this.marketDailyLoss.get(marketId) || 0;
        const marketCapital = await this.getMarketCapital(marketId);
        if (marketCapital <= 0) {
            return 0;
        }
        return (marketLoss / marketCapital) * 100;
    }
    /**
     * Record a trade result
     */
    async recordTrade(marketId, pnl, isLoss) {
        this.checkDayReset();
        if (isLoss) {
            // Track loss
            const currentLoss = this.marketDailyLoss.get(marketId) || 0;
            this.marketDailyLoss.set(marketId, currentLoss + Math.abs(pnl));
            this.globalDailyLoss += Math.abs(pnl);
            // Track consecutive losses
            const consecutive = this.consecutiveLosses.get(marketId) || 0;
            this.consecutiveLosses.set(marketId, consecutive + 1);
        }
        else {
            // Track profit
            this.globalDailyProfit += pnl;
            // Reset consecutive losses
            this.consecutiveLosses.set(marketId, 0);
        }
    }
    /**
     * Get consecutive losses for a market
     */
    getConsecutiveLosses(marketId) {
        return this.consecutiveLosses.get(marketId) || 0;
    }
    /**
     * Get global loss percentage
     */
    getGlobalLossPercent() {
        // Simple estimation based on tracked loss
        // In production, this would calculate against actual capital
        const netPnl = this.globalDailyProfit - this.globalDailyLoss;
        return netPnl < 0 ? Math.abs(netPnl) / 100 : 0; // Simplified
    }
    /**
     * Should stop trading based on loss patterns
     */
    shouldStopTrading(marketId) {
        // Stop if 5+ consecutive losses
        const consecutive = this.consecutiveLosses.get(marketId) || 0;
        if (consecutive >= 5) {
            return true;
        }
        return false;
    }
    /**
     * Reset daily tracking
     */
    resetDaily() {
        this.marketDailyLoss.clear();
        this.consecutiveLosses.clear();
        this.globalDailyLoss = 0;
        this.globalDailyProfit = 0;
        this.lastResetDate = new Date();
    }
    // ============================================
    // Private Methods
    // ============================================
    /**
     * Check if we need to reset for new day
     */
    checkDayReset() {
        const now = new Date();
        if (now.getDate() !== this.lastResetDate.getDate() ||
            now.getMonth() !== this.lastResetDate.getMonth() ||
            now.getFullYear() !== this.lastResetDate.getFullYear()) {
            this.resetDaily();
        }
    }
    /**
     * Get total capital across all pools
     */
    async getTotalCapital() {
        try {
            const pools = await db_1.models.aiMarketMakerPool.findAll();
            let total = 0;
            for (const pool of pools) {
                total += parseFloat(pool.totalValueLocked) || 0;
            }
            return total;
        }
        catch (error) {
            return 0;
        }
    }
    /**
     * Get capital for a specific market
     */
    async getMarketCapital(marketId) {
        try {
            const maker = await db_1.models.aiMarketMaker.findOne({
                where: { marketId },
                include: [{ model: db_1.models.aiMarketMakerPool, as: "pool" }],
            });
            if (maker === null || maker === void 0 ? void 0 : maker.pool) {
                return parseFloat(maker.pool.totalValueLocked) || 0;
            }
            return 0;
        }
        catch (error) {
            return 0;
        }
    }
}
exports.LossProtection = LossProtection;
exports.default = LossProtection;
