"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MarketMakerBot = void 0;
const BaseBot_1 = require("../BaseBot");
/**
 * MarketMakerBot - Provides liquidity on both sides
 *
 * Characteristics:
 * - Places both bid and ask orders
 * - Maintains spread
 * - Neutral position tendency
 * - High order frequency
 * - Focus on capturing spread
 */
class MarketMakerBot extends BaseBot_1.BaseBot {
    constructor(config) {
        super({
            ...config,
            personality: "MARKET_MAKER",
            tradeFrequency: "HIGH",
        });
        // Market maker specific settings
        this.targetSpreadBps = 15; // 0.15% target spread
        this.minSpreadBps = 5; // 0.05% minimum spread
        this.maxInventoryImbalance = 0.3; // Max 30% position imbalance
        // Inventory tracking
        this.baseInventory = BigInt(0);
        this.quoteInventory = BigInt(0);
        this.lastQuotedBid = BigInt(0);
        this.lastQuotedAsk = BigInt(0);
    }
    /**
     * Market maker decision logic - provide two-sided liquidity
     */
    decideTrade(context) {
        if (!this.canTrade()) {
            return { shouldTrade: false, reason: "Cannot trade" };
        }
        const currentPriceNum = Number(context.currentPrice) / 1e18;
        // Calculate inventory imbalance
        const imbalance = this.calculateInventoryImbalance();
        // If imbalanced, favor the side that reduces imbalance
        if (Math.abs(imbalance) > this.maxInventoryImbalance) {
            return this.rebalanceInventory(context, imbalance);
        }
        // Alternate between bid and ask
        const placeBid = Math.random() < 0.5;
        if (placeBid) {
            return this.placeBidOrder(context, currentPriceNum);
        }
        else {
            return this.placeAskOrder(context, currentPriceNum);
        }
    }
    /**
     * Place bid order
     */
    placeBidOrder(context, currentPrice) {
        // Calculate bid price (below current price by half spread)
        const spreadPercent = this.targetSpreadBps / 10000;
        const bidPrice = currentPrice * (1 - spreadPercent / 2);
        // Add some randomization
        const randomOffset = (Math.random() - 0.5) * spreadPercent * 0.2;
        const finalBidPrice = bidPrice * (1 + randomOffset);
        const price = BigInt(Math.floor(finalBidPrice * 1e18));
        const amount = this.calculateOrderSize(context);
        this.lastQuotedBid = price;
        return {
            shouldTrade: true,
            side: "BUY",
            price,
            amount,
            purpose: "SPREAD_MAINTENANCE",
            confidence: 0.8,
            reason: `Market making: bid at ${finalBidPrice.toFixed(8)}`,
        };
    }
    /**
     * Place ask order
     */
    placeAskOrder(context, currentPrice) {
        // Calculate ask price (above current price by half spread)
        const spreadPercent = this.targetSpreadBps / 10000;
        const askPrice = currentPrice * (1 + spreadPercent / 2);
        // Add some randomization
        const randomOffset = (Math.random() - 0.5) * spreadPercent * 0.2;
        const finalAskPrice = askPrice * (1 + randomOffset);
        const price = BigInt(Math.floor(finalAskPrice * 1e18));
        const amount = this.calculateOrderSize(context);
        this.lastQuotedAsk = price;
        return {
            shouldTrade: true,
            side: "SELL",
            price,
            amount,
            purpose: "SPREAD_MAINTENANCE",
            confidence: 0.8,
            reason: `Market making: ask at ${finalAskPrice.toFixed(8)}`,
        };
    }
    /**
     * Rebalance inventory when imbalanced
     */
    rebalanceInventory(context, imbalance) {
        const currentPriceNum = Number(context.currentPrice) / 1e18;
        // If positive imbalance (too much base), sell
        // If negative imbalance (too much quote), buy
        const side = imbalance > 0 ? "SELL" : "BUY";
        // More aggressive pricing for rebalancing
        const urgencyOffset = Math.abs(imbalance) * 0.001; // Up to 0.03%
        let price;
        if (side === "BUY") {
            price = currentPriceNum * (1 + urgencyOffset); // Pay up to buy
        }
        else {
            price = currentPriceNum * (1 - urgencyOffset); // Accept less to sell
        }
        const amount = this.calculateOrderSize(context);
        const rebalanceAmount = BigInt(Math.floor(Number(amount) * Math.abs(imbalance)));
        return {
            shouldTrade: true,
            side,
            price: BigInt(Math.floor(price * 1e18)),
            amount: rebalanceAmount,
            purpose: "LIQUIDITY",
            confidence: 0.9,
            reason: `Rebalancing inventory (${(imbalance * 100).toFixed(1)}% imbalance)`,
        };
    }
    /**
     * Calculate inventory imbalance
     * Returns: positive = too much base, negative = too much quote
     */
    calculateInventoryImbalance() {
        const totalBase = Number(this.baseInventory);
        const totalQuote = Number(this.quoteInventory);
        if (totalBase === 0 && totalQuote === 0) {
            return 0;
        }
        // Simplified imbalance calculation
        const total = totalBase + totalQuote;
        if (total === 0)
            return 0;
        return (totalBase - totalQuote) / total;
    }
    /**
     * Calculate order size - smaller for market making
     */
    calculateOrderSize(context) {
        // Market makers use smaller order sizes to manage inventory
        const baseSize = this.config.avgOrderSize * 0.6;
        const variedSize = this.addVariance(baseSize, 0.2);
        return BigInt(Math.floor(variedSize * 1e18));
    }
    /**
     * Calculate price with spread consideration
     */
    calculatePrice(context, side) {
        const currentPriceNum = Number(context.currentPrice) / 1e18;
        const spreadPercent = this.targetSpreadBps / 10000;
        let price;
        if (side === "BUY") {
            price = currentPriceNum * (1 - spreadPercent / 2);
        }
        else {
            price = currentPriceNum * (1 + spreadPercent / 2);
        }
        return BigInt(Math.floor(price * 1e18));
    }
    /**
     * Update inventory after trade
     */
    updateInventory(side, amount, cost) {
        if (side === "BUY") {
            this.baseInventory += amount;
            this.quoteInventory -= cost;
        }
        else {
            this.baseInventory -= amount;
            this.quoteInventory += cost;
        }
    }
    /**
     * Short cooldown - market makers are very active
     */
    getCooldownTime() {
        return 5000; // 5 seconds
    }
    /**
     * Get market making stats
     */
    getMarketMakingStats() {
        const bidNum = Number(this.lastQuotedBid) / 1e18;
        const askNum = Number(this.lastQuotedAsk) / 1e18;
        const spread = bidNum > 0 ? ((askNum - bidNum) / bidNum) * 10000 : 0;
        return {
            baseInventory: (Number(this.baseInventory) / 1e18).toFixed(8),
            quoteInventory: (Number(this.quoteInventory) / 1e18).toFixed(8),
            imbalance: this.calculateInventoryImbalance(),
            lastBid: bidNum.toFixed(8),
            lastAsk: askNum.toFixed(8),
            spread, // in bps
        };
    }
}
exports.MarketMakerBot = MarketMakerBot;
exports.default = MarketMakerBot;
