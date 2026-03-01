"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.BotCoordinator = void 0;
const BotManager_1 = require("./BotManager");
const console_1 = require("@b/utils/console");
/**
 * BotCoordinator - Coordinates multiple bots to act as a cohesive unit
 *
 * Handles:
 * - Preventing bot conflicts (trading against each other)
 * - Coordinating price movements
 * - Balancing market pressure
 * - Maintaining spread requirements
 */
class BotCoordinator {
    constructor() {
        // Active rules per market
        this.marketRules = new Map();
        // Recent trade tracking for coordination
        this.recentTrades = new Map();
        // Market pressure tracking
        this.marketPressure = new Map();
        // Configuration
        this.antiCollisionWindowMs = 5000; // 5 second window
        this.maxPressureImbalance = 0.3; // 30% max imbalance
        this.recentTradeRetentionMs = 60000; // Keep 1 minute of trades
        this.botManager = BotManager_1.BotManager.getInstance();
    }
    static getInstance() {
        if (!BotCoordinator.instance) {
            BotCoordinator.instance = new BotCoordinator();
        }
        return BotCoordinator.instance;
    }
    /**
     * Set coordination rules for a market
     */
    setMarketRules(marketId, rules) {
        this.marketRules.set(marketId, new Set(rules));
        (0, console_1.logInfo)("bot-coordinator", `Set rules for market ${marketId}: ${rules.join(", ")}`);
    }
    /**
     * Get active rules for a market
     */
    getMarketRules(marketId) {
        return Array.from(this.marketRules.get(marketId) || []);
    }
    /**
     * Enable default coordination rules for a market
     */
    enableDefaultRules(marketId) {
        this.setMarketRules(marketId, [
            "ANTI_COLLISION",
            "VOLUME_BALANCING",
            "SPREAD_MAINTENANCE",
        ]);
    }
    /**
     * Coordinate a trade decision
     * Returns adjusted decision if needed, or rejection if trade should be blocked
     */
    coordinateTrade(marketId, botId, decision, context) {
        const rules = this.marketRules.get(marketId);
        if (!rules || rules.size === 0 || !decision.shouldTrade) {
            return { approved: true };
        }
        // Apply each rule
        for (const rule of rules) {
            const result = this.applyRule(rule, marketId, botId, decision, context);
            if (!result.approved) {
                return result;
            }
            // Use adjusted decision for subsequent rules
            if (result.adjustedDecision) {
                decision = result.adjustedDecision;
            }
        }
        return { approved: true, adjustedDecision: decision };
    }
    /**
     * Record a completed trade for coordination tracking
     */
    recordTrade(marketId, botId, side, price, amount) {
        // Initialize if needed
        if (!this.recentTrades.has(marketId)) {
            this.recentTrades.set(marketId, []);
        }
        const trades = this.recentTrades.get(marketId);
        // Add new trade
        trades.push({
            botId,
            side,
            price,
            amount,
            timestamp: Date.now(),
        });
        // Update market pressure
        this.updateMarketPressure(marketId, side, amount);
        // Clean old trades
        this.cleanOldTrades(marketId);
    }
    /**
     * Get current market pressure
     */
    getMarketPressure(marketId) {
        return this.marketPressure.get(marketId);
    }
    /**
     * Get recommended trade side based on market pressure
     */
    getRecommendedSide(marketId) {
        const pressure = this.marketPressure.get(marketId);
        if (!pressure)
            return null;
        // Recommend opposite of current pressure to balance
        if (pressure.netPressure > this.maxPressureImbalance) {
            return "SELL"; // Too much buy pressure, recommend selling
        }
        else if (pressure.netPressure < -this.maxPressureImbalance) {
            return "BUY"; // Too much sell pressure, recommend buying
        }
        return null; // Balanced
    }
    /**
     * Check if a side is allowed based on pressure limits
     */
    isSideAllowed(marketId, side) {
        const pressure = this.marketPressure.get(marketId);
        if (!pressure)
            return true;
        // Block trades that would increase imbalance beyond threshold
        if (side === "BUY" && pressure.netPressure > this.maxPressureImbalance * 1.5) {
            return false;
        }
        if (side === "SELL" && pressure.netPressure < -this.maxPressureImbalance * 1.5) {
            return false;
        }
        return true;
    }
    /**
     * Get coordination statistics for a market
     */
    getCoordinationStats(marketId) {
        const rules = this.getMarketRules(marketId);
        const trades = this.recentTrades.get(marketId) || [];
        const pressure = this.marketPressure.get(marketId) || null;
        const recommendations = [];
        if (pressure) {
            if (pressure.netPressure > this.maxPressureImbalance) {
                recommendations.push("High buy pressure - prioritize sell orders");
            }
            else if (pressure.netPressure < -this.maxPressureImbalance) {
                recommendations.push("High sell pressure - prioritize buy orders");
            }
            else {
                recommendations.push("Market pressure balanced");
            }
        }
        return {
            activeRules: rules,
            recentTradeCount: trades.length,
            pressure,
            recommendations,
        };
    }
    // ============================================
    // Private Methods
    // ============================================
    /**
     * Apply a specific coordination rule
     */
    applyRule(rule, marketId, botId, decision, context) {
        switch (rule) {
            case "ANTI_COLLISION":
                return this.applyAntiCollision(marketId, botId, decision);
            case "PRICE_COORDINATION":
                return this.applyPriceCoordination(marketId, decision, context);
            case "VOLUME_BALANCING":
                return this.applyVolumeBalancing(marketId, decision);
            case "SPREAD_MAINTENANCE":
                return this.applySpreadMaintenance(marketId, decision, context);
            default:
                return { approved: true };
        }
    }
    /**
     * Anti-collision rule: Prevent bots from trading against each other's recent orders
     */
    applyAntiCollision(marketId, botId, decision) {
        const trades = this.recentTrades.get(marketId) || [];
        const now = Date.now();
        // Check recent trades from other bots
        const recentOpposite = trades.filter((t) => t.botId !== botId &&
            t.side !== decision.side &&
            now - t.timestamp < this.antiCollisionWindowMs);
        if (recentOpposite.length > 0) {
            // Check if our trade would match against recent opposite trade
            const wouldCollide = recentOpposite.some((t) => {
                if (decision.side === "BUY") {
                    return decision.price >= t.price;
                }
                else {
                    return decision.price <= t.price;
                }
            });
            if (wouldCollide) {
                return {
                    approved: false,
                    reason: "Would collide with recent bot trade",
                };
            }
        }
        return { approved: true };
    }
    /**
     * Price coordination rule: Ensure bots don't push price too aggressively
     */
    applyPriceCoordination(marketId, decision, context) {
        if (!decision.price)
            return { approved: true };
        const currentPrice = Number(context.currentPrice) / 1e18;
        const decisionPrice = Number(decision.price) / 1e18;
        const priceDiff = Math.abs((decisionPrice - currentPrice) / currentPrice);
        // Block trades more than 1% away from current price
        if (priceDiff > 0.01) {
            // Adjust price to be within bounds
            const maxMove = currentPrice * 0.01;
            let adjustedPrice;
            if (decision.side === "BUY") {
                adjustedPrice = BigInt(Math.floor((currentPrice - maxMove) * 1e18));
            }
            else {
                adjustedPrice = BigInt(Math.floor((currentPrice + maxMove) * 1e18));
            }
            return {
                approved: true,
                adjustedDecision: {
                    ...decision,
                    price: adjustedPrice,
                },
                reason: "Price adjusted to stay within coordination bounds",
            };
        }
        return { approved: true };
    }
    /**
     * Volume balancing rule: Limit trades that would increase pressure imbalance
     */
    applyVolumeBalancing(marketId, decision) {
        const pressure = this.marketPressure.get(marketId);
        if (!pressure)
            return { approved: true };
        // Check if this trade would make imbalance worse
        const wouldWorsen = (decision.side === "BUY" && pressure.netPressure > this.maxPressureImbalance) ||
            (decision.side === "SELL" && pressure.netPressure < -this.maxPressureImbalance);
        if (wouldWorsen) {
            // Reduce order size instead of blocking
            const reducedAmount = decision.amount
                ? BigInt(Math.floor(Number(decision.amount) * 0.5))
                : undefined;
            return {
                approved: true,
                adjustedDecision: {
                    ...decision,
                    amount: reducedAmount,
                },
                reason: "Order size reduced for volume balancing",
            };
        }
        return { approved: true };
    }
    /**
     * Spread maintenance rule: Ensure minimum spread is maintained
     */
    applySpreadMaintenance(marketId, decision, context) {
        var _a, _b;
        if (!decision.price)
            return { approved: true };
        const minSpreadBps = 10; // 0.1% minimum spread
        const bestBid = ((_a = context.orderbook) === null || _a === void 0 ? void 0 : _a.bestBid) || BigInt(0);
        const bestAsk = ((_b = context.orderbook) === null || _b === void 0 ? void 0 : _b.bestAsk) || BigInt(0);
        if (bestBid === BigInt(0) || bestAsk === BigInt(0)) {
            return { approved: true };
        }
        const bidNum = Number(bestBid);
        const askNum = Number(bestAsk);
        const decisionPriceNum = Number(decision.price);
        // Check if trade would violate minimum spread
        if (decision.side === "BUY") {
            // Buy should not exceed (ask - minSpread)
            const maxBid = askNum * (1 - minSpreadBps / 10000);
            if (decisionPriceNum > maxBid) {
                return {
                    approved: true,
                    adjustedDecision: {
                        ...decision,
                        price: BigInt(Math.floor(maxBid)),
                    },
                    reason: "Bid adjusted to maintain minimum spread",
                };
            }
        }
        else {
            // Sell should not go below (bid + minSpread)
            const minAsk = bidNum * (1 + minSpreadBps / 10000);
            if (decisionPriceNum < minAsk) {
                return {
                    approved: true,
                    adjustedDecision: {
                        ...decision,
                        price: BigInt(Math.floor(minAsk)),
                    },
                    reason: "Ask adjusted to maintain minimum spread",
                };
            }
        }
        return { approved: true };
    }
    /**
     * Update market pressure tracking
     */
    updateMarketPressure(marketId, side, amount) {
        let pressure = this.marketPressure.get(marketId);
        if (!pressure) {
            pressure = {
                buyVolume: BigInt(0),
                sellVolume: BigInt(0),
                netPressure: 0,
                lastUpdate: Date.now(),
            };
        }
        if (side === "BUY") {
            pressure.buyVolume += amount;
        }
        else {
            pressure.sellVolume += amount;
        }
        // Calculate net pressure (-1 to 1)
        const total = Number(pressure.buyVolume) + Number(pressure.sellVolume);
        if (total > 0) {
            pressure.netPressure =
                (Number(pressure.buyVolume) - Number(pressure.sellVolume)) / total;
        }
        pressure.lastUpdate = Date.now();
        this.marketPressure.set(marketId, pressure);
    }
    /**
     * Clean old trades from tracking
     */
    cleanOldTrades(marketId) {
        const trades = this.recentTrades.get(marketId);
        if (!trades)
            return;
        const cutoff = Date.now() - this.recentTradeRetentionMs;
        const filtered = trades.filter((t) => t.timestamp > cutoff);
        this.recentTrades.set(marketId, filtered);
    }
    /**
     * Reset market pressure (e.g., at start of new period)
     */
    resetMarketPressure(marketId) {
        this.marketPressure.set(marketId, {
            buyVolume: BigInt(0),
            sellVolume: BigInt(0),
            netPressure: 0,
            lastUpdate: Date.now(),
        });
    }
    /**
     * Clear all coordination data for a market
     */
    clearMarket(marketId) {
        this.marketRules.delete(marketId);
        this.recentTrades.delete(marketId);
        this.marketPressure.delete(marketId);
    }
}
exports.BotCoordinator = BotCoordinator;
exports.default = BotCoordinator;
