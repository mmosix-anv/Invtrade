"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.RiskManager = void 0;
const console_1 = require("@b/utils/console");
const VolatilityMonitor_1 = require("./VolatilityMonitor");
const LossProtection_1 = require("./LossProtection");
const CircuitBreaker_1 = require("./CircuitBreaker");
const cache_1 = require("@b/utils/cache");
/**
 * RiskManager - Central risk management for AI market maker
 *
 * Coordinates:
 * - VolatilityMonitor: Tracks market volatility
 * - LossProtection: Monitors losses and stops trading
 * - CircuitBreaker: Emergency controls
 */
class RiskManager {
    constructor(engine) {
        // Global settings cache
        this.globalSettings = null;
        this.lastSettingsLoad = null;
        this.settingsRefreshIntervalMs = 60000; // 1 minute
        this.engine = engine;
        this.volatilityMonitor = new VolatilityMonitor_1.VolatilityMonitor();
        this.lossProtection = new LossProtection_1.LossProtection();
        this.circuitBreaker = new CircuitBreaker_1.CircuitBreaker();
    }
    /**
     * Check global risk conditions
     * Called on each engine tick
     */
    async checkGlobalRisk() {
        var _a, _b, _c, _d;
        try {
            // Refresh settings if needed
            await this.refreshSettings();
            // Check if trading is enabled
            if (this.globalSettings && !this.globalSettings.tradingEnabled) {
                return {
                    canTrade: false,
                    reason: "Trading is disabled globally",
                    riskLevel: "CRITICAL",
                };
            }
            // Check maintenance mode
            if ((_a = this.globalSettings) === null || _a === void 0 ? void 0 : _a.maintenanceMode) {
                return {
                    canTrade: false,
                    reason: "System is in maintenance mode",
                    riskLevel: "CRITICAL",
                };
            }
            // Check global pause
            if ((_b = this.globalSettings) === null || _b === void 0 ? void 0 : _b.globalPauseEnabled) {
                return {
                    canTrade: false,
                    reason: "Global pause is enabled",
                    riskLevel: "HIGH",
                };
            }
            // Check circuit breaker
            if (this.circuitBreaker.isTripped()) {
                return {
                    canTrade: false,
                    reason: this.circuitBreaker.getTripReason(),
                    riskLevel: "CRITICAL",
                };
            }
            // Check global loss limits (only if stop loss is enabled)
            if (((_c = this.globalSettings) === null || _c === void 0 ? void 0 : _c.stopLossEnabled) !== false) {
                const lossCheck = await this.lossProtection.checkGlobalLoss(((_d = this.globalSettings) === null || _d === void 0 ? void 0 : _d.maxDailyLossPercent) || 10);
                if (!lossCheck.canTrade) {
                    return {
                        canTrade: false,
                        reason: lossCheck.reason,
                        riskLevel: "HIGH",
                    };
                }
            }
            // All checks passed
            return {
                canTrade: true,
                riskLevel: this.calculateOverallRiskLevel(),
            };
        }
        catch (error) {
            console_1.logger.error("RISK_MANAGER", "Risk check failed", error);
            // On error, be conservative
            return {
                canTrade: false,
                reason: "Risk check failed",
                riskLevel: "HIGH",
            };
        }
    }
    /**
     * Assess risk for a specific trade
     */
    async assessTradeRisk(marketId, side, amount, price) {
        var _a;
        try {
            // Check volatility for this market
            const volatility = await this.volatilityMonitor.getVolatility(marketId);
            const threshold = ((_a = this.globalSettings) === null || _a === void 0 ? void 0 : _a.defaultVolatilityThreshold) || 5;
            if (volatility > threshold * 2) {
                return {
                    approved: false,
                    reason: `Extreme volatility: ${volatility.toFixed(2)}%`,
                };
            }
            // If volatility is high but not extreme, reduce order size
            if (volatility > threshold) {
                const reductionFactor = Math.max(0.5, 1 - (volatility - threshold) / threshold);
                return {
                    approved: true,
                    adjustedAmount: BigInt(Math.floor(Number(amount) * reductionFactor)),
                    reason: `Reduced size due to volatility: ${volatility.toFixed(2)}%`,
                };
            }
            // Check market-specific loss limits
            const marketLoss = await this.lossProtection.getMarketLoss(marketId);
            if (marketLoss > 5) {
                // More than 5% loss on this market
                return {
                    approved: false,
                    reason: `Market loss limit exceeded: ${marketLoss.toFixed(2)}%`,
                };
            }
            return { approved: true };
        }
        catch (error) {
            console_1.logger.error("RISK_MANAGER", "Trade assessment failed", error);
            return {
                approved: false,
                reason: "Trade assessment failed",
            };
        }
    }
    /**
     * Report a trade result for tracking
     */
    async reportTradeResult(marketId, pnl, isLoss) {
        await this.lossProtection.recordTrade(marketId, pnl, isLoss);
        // Check if we need to trip circuit breaker
        if (isLoss) {
            const consecutiveLosses = this.lossProtection.getConsecutiveLosses(marketId);
            if (consecutiveLosses >= 5) {
                this.circuitBreaker.trip(`5 consecutive losses on market ${marketId}`);
            }
        }
    }
    /**
     * Trip the circuit breaker manually
     */
    tripCircuitBreaker(reason) {
        this.circuitBreaker.trip(reason);
    }
    /**
     * Reset the circuit breaker
     */
    resetCircuitBreaker() {
        this.circuitBreaker.reset();
    }
    /**
     * Get current risk level
     */
    getRiskLevel() {
        return this.calculateOverallRiskLevel();
    }
    /**
     * Get risk statistics
     */
    getStats() {
        return {
            riskLevel: this.calculateOverallRiskLevel(),
            circuitBreakerStatus: this.circuitBreaker.isTripped() ? "TRIPPED" : "OK",
            globalVolatility: this.volatilityMonitor.getGlobalVolatility(),
            globalLossPercent: this.lossProtection.getGlobalLossPercent(),
        };
    }
    // ============================================
    // Private Methods
    // ============================================
    /**
     * Refresh global settings from CacheManager (centralized settings)
     */
    async refreshSettings() {
        // Only refresh if cache is stale
        if (this.lastSettingsLoad &&
            Date.now() - this.lastSettingsLoad.getTime() < this.settingsRefreshIntervalMs) {
            return;
        }
        try {
            const cacheManager = cache_1.CacheManager.getInstance();
            // Get settings from centralized settings table via CacheManager
            const [tradingEnabled, globalPauseEnabled, maintenanceMode, maxDailyLossPercent, defaultVolatilityThreshold, stopLossEnabled,] = await Promise.all([
                cacheManager.getSetting("aiMarketMakerEnabled"),
                cacheManager.getSetting("aiMarketMakerGlobalPauseEnabled"),
                cacheManager.getSetting("aiMarketMakerMaintenanceMode"),
                cacheManager.getSetting("aiMarketMakerMaxDailyLossPercent"),
                cacheManager.getSetting("aiMarketMakerDefaultVolatilityThreshold"),
                cacheManager.getSetting("aiMarketMakerStopLossEnabled"),
            ]);
            this.globalSettings = {
                maxDailyLossPercent: parseFloat(maxDailyLossPercent) || 5,
                defaultVolatilityThreshold: parseFloat(defaultVolatilityThreshold) || 10,
                tradingEnabled: tradingEnabled !== false,
                maintenanceMode: maintenanceMode === true,
                globalPauseEnabled: globalPauseEnabled === true,
                stopLossEnabled: stopLossEnabled !== false,
            };
            this.lastSettingsLoad = new Date();
        }
        catch (error) {
            // Use cached settings on error, or defaults if no cache
            if (!this.globalSettings) {
                this.globalSettings = {
                    maxDailyLossPercent: 5,
                    defaultVolatilityThreshold: 10,
                    tradingEnabled: true,
                    maintenanceMode: false,
                    globalPauseEnabled: false,
                    stopLossEnabled: true,
                };
            }
        }
    }
    /**
     * Calculate overall risk level based on all factors
     */
    calculateOverallRiskLevel() {
        if (this.circuitBreaker.isTripped()) {
            return "CRITICAL";
        }
        const globalLoss = this.lossProtection.getGlobalLossPercent();
        const globalVol = this.volatilityMonitor.getGlobalVolatility();
        if (globalLoss > 8 || globalVol > 15) {
            return "HIGH";
        }
        if (globalLoss > 4 || globalVol > 8) {
            return "MEDIUM";
        }
        return "LOW";
    }
}
exports.RiskManager = RiskManager;
exports.default = RiskManager;
