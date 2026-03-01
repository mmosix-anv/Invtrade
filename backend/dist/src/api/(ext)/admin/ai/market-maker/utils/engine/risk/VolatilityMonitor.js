"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.VolatilityMonitor = void 0;
const queries_1 = require("../../scylla/queries");
/**
 * VolatilityMonitor - Tracks market volatility
 *
 * Monitors price changes across different timeframes
 * and provides volatility assessments for risk management.
 */
class VolatilityMonitor {
    constructor() {
        // Volatility cache by market
        this.volatilityCache = new Map();
        // Global volatility (average across markets)
        this.globalVolatility = 0;
        // Cache TTL in milliseconds
        this.cacheTtlMs = 30000; // 30 seconds
    }
    /**
     * Get volatility for a specific market
     */
    async getVolatility(marketId, minutesWindow = 60) {
        // Check cache
        const cached = this.volatilityCache.get(marketId);
        if (cached && Date.now() - cached.timestamp.getTime() < this.cacheTtlMs) {
            return cached.value;
        }
        // Calculate fresh volatility
        try {
            const volatility = await (0, queries_1.calculateVolatility)(marketId, minutesWindow);
            // Cache result
            this.volatilityCache.set(marketId, {
                value: volatility,
                timestamp: new Date(),
            });
            // Update global volatility
            this.updateGlobalVolatility();
            return volatility;
        }
        catch (error) {
            // Return cached value or 0 on error
            return (cached === null || cached === void 0 ? void 0 : cached.value) || 0;
        }
    }
    /**
     * Get global volatility (average across all tracked markets)
     */
    getGlobalVolatility() {
        return this.globalVolatility;
    }
    /**
     * Check if volatility is high for a market
     */
    async isVolatilityHigh(marketId, threshold) {
        const volatility = await this.getVolatility(marketId);
        return volatility > threshold;
    }
    /**
     * Get volatility across multiple timeframes
     */
    async getMultiTimeframeVolatility(marketId) {
        const [min1, min5, min15, hour1] = await Promise.all([
            (0, queries_1.calculateVolatility)(marketId, 1),
            (0, queries_1.calculateVolatility)(marketId, 5),
            (0, queries_1.calculateVolatility)(marketId, 15),
            (0, queries_1.calculateVolatility)(marketId, 60),
        ]);
        return { min1, min5, min15, hour1 };
    }
    /**
     * Update global volatility based on cached values
     */
    updateGlobalVolatility() {
        if (this.volatilityCache.size === 0) {
            this.globalVolatility = 0;
            return;
        }
        let sum = 0;
        let count = 0;
        for (const [, cached] of this.volatilityCache) {
            // Only include recent values
            if (Date.now() - cached.timestamp.getTime() < this.cacheTtlMs * 2) {
                sum += cached.value;
                count++;
            }
        }
        this.globalVolatility = count > 0 ? sum / count : 0;
    }
    /**
     * Clear volatility cache for a market
     */
    clearCache(marketId) {
        if (marketId) {
            this.volatilityCache.delete(marketId);
        }
        else {
            this.volatilityCache.clear();
        }
        this.updateGlobalVolatility();
    }
}
exports.VolatilityMonitor = VolatilityMonitor;
exports.default = VolatilityMonitor;
