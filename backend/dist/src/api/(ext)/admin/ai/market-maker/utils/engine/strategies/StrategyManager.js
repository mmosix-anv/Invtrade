"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.StrategyManager = void 0;
const GradualDriftStrategy_1 = require("./GradualDriftStrategy");
const OscillationStrategy_1 = require("./OscillationStrategy");
const SupportResistanceStrategy_1 = require("./SupportResistanceStrategy");
/**
 * StrategyManager - Manages and coordinates trading strategies
 *
 * Handles:
 * - Strategy selection based on market conditions
 * - Strategy switching
 * - Combined strategy execution
 */
class StrategyManager {
    constructor() {
        this.strategies = new Map();
        this.activeStrategies = new Map(); // marketId -> strategy names
        // Initialize default strategies
        this.registerStrategy(new GradualDriftStrategy_1.GradualDriftStrategy());
        this.registerStrategy(new OscillationStrategy_1.OscillationStrategy());
        this.registerStrategy(new SupportResistanceStrategy_1.SupportResistanceStrategy());
    }
    /**
     * Register a strategy
     */
    registerStrategy(strategy) {
        this.strategies.set(strategy.name, strategy);
    }
    /**
     * Get a strategy by name
     */
    getStrategy(name) {
        return this.strategies.get(name);
    }
    /**
     * Get all available strategies
     */
    getAvailableStrategies() {
        return Array.from(this.strategies.keys());
    }
    /**
     * Set active strategies for a market
     */
    setActiveStrategies(marketId, strategyNames) {
        this.activeStrategies.set(marketId, strategyNames);
    }
    /**
     * Get active strategies for a market
     */
    getActiveStrategies(marketId) {
        return this.activeStrategies.get(marketId) || ["gradual_drift"]; // Default
    }
    /**
     * Calculate combined strategy result
     */
    calculate(marketId, currentPrice, targetPrice, config) {
        const activeNames = this.getActiveStrategies(marketId);
        const results = [];
        for (const name of activeNames) {
            const strategy = this.strategies.get(name);
            if (strategy) {
                const result = strategy.calculate(currentPrice, targetPrice, config);
                results.push(result);
            }
        }
        if (results.length === 0) {
            return {
                shouldTrade: false,
                direction: "BUY",
                priceAdjustment: 0,
                sizeMultiplier: 1,
                confidence: 0,
            };
        }
        // Combine results (weighted average)
        return this.combineResults(results);
    }
    /**
     * Select best strategy for current conditions
     */
    selectStrategy(marketId, volatility, distanceFromTarget) {
        // High volatility -> oscillation strategy
        if (volatility > 5) {
            return "oscillation";
        }
        // Far from target -> gradual drift
        if (Math.abs(distanceFromTarget) > 5) {
            return "gradual_drift";
        }
        // Near target -> support/resistance
        return "support_resistance";
    }
    /**
     * Auto-select and set strategies based on conditions
     */
    autoSelectStrategies(marketId, volatility, distanceFromTarget) {
        const primary = this.selectStrategy(marketId, volatility, distanceFromTarget);
        // Always include the primary strategy
        const strategies = [primary];
        // Add complementary strategies
        if (primary !== "oscillation" && volatility > 2) {
            strategies.push("oscillation");
        }
        this.setActiveStrategies(marketId, strategies);
    }
    // ============================================
    // Private Methods
    // ============================================
    /**
     * Combine multiple strategy results
     */
    combineResults(results) {
        if (results.length === 1) {
            return results[0];
        }
        // Weight by confidence
        let totalWeight = 0;
        let weightedPriceAdj = 0;
        let weightedSizeMultiplier = 0;
        let shouldTrade = false;
        let primaryDirection = "BUY";
        let buyVotes = 0;
        let sellVotes = 0;
        for (const result of results) {
            const weight = result.confidence;
            totalWeight += weight;
            weightedPriceAdj += result.priceAdjustment * weight;
            weightedSizeMultiplier += result.sizeMultiplier * weight;
            if (result.shouldTrade) {
                shouldTrade = true;
                if (result.direction === "BUY") {
                    buyVotes += weight;
                }
                else {
                    sellVotes += weight;
                }
            }
        }
        if (totalWeight === 0) {
            return {
                shouldTrade: false,
                direction: "BUY",
                priceAdjustment: 0,
                sizeMultiplier: 1,
                confidence: 0,
            };
        }
        primaryDirection = buyVotes >= sellVotes ? "BUY" : "SELL";
        return {
            shouldTrade,
            direction: primaryDirection,
            priceAdjustment: weightedPriceAdj / totalWeight,
            sizeMultiplier: weightedSizeMultiplier / totalWeight,
            confidence: totalWeight / results.length,
        };
    }
}
exports.StrategyManager = StrategyManager;
exports.default = StrategyManager;
