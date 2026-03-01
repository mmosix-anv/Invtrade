"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.BaseBot = void 0;
const console_1 = require("@b/utils/console");
/**
 * BaseBot - Abstract base class for all bot personalities
 *
 * Each bot personality extends this class and implements
 * its specific trading logic.
 */
class BaseBot {
    constructor(config) {
        this.status = "STOPPED";
        this.orderManager = null;
        // Trading state
        this.dailyTradeCount = 0;
        this.lastTradeTime = null;
        this.openOrderIds = new Set();
        this.consecutiveWins = 0;
        this.consecutiveLosses = 0;
        // Performance tracking
        this.totalTrades = 0;
        this.winningTrades = 0;
        this.totalPnL = 0;
        this.config = config;
    }
    // ============================================
    // Common Methods
    // ============================================
    /**
     * Initialize bot with order manager
     */
    initialize(orderManager) {
        this.orderManager = orderManager;
        this.status = "ACTIVE";
        this.resetDailyStats();
    }
    /**
     * Start the bot
     */
    start() {
        if (this.status === "STOPPED") {
            this.status = "ACTIVE";
            this.resetDailyStats();
        }
    }
    /**
     * Stop the bot
     */
    stop() {
        this.status = "STOPPED";
    }
    /**
     * Pause the bot
     */
    pause() {
        if (this.status === "ACTIVE") {
            this.status = "PAUSED";
        }
    }
    /**
     * Resume the bot
     */
    resume() {
        if (this.status === "PAUSED") {
            this.status = "ACTIVE";
        }
    }
    /**
     * Enter cooldown period
     */
    enterCooldown() {
        this.status = "COOLDOWN";
        setTimeout(() => {
            if (this.status === "COOLDOWN") {
                this.status = "ACTIVE";
            }
        }, this.getCooldownTime());
    }
    /**
     * Check if bot can trade
     */
    canTrade() {
        if (this.status !== "ACTIVE") {
            return false;
        }
        if (this.dailyTradeCount >= this.config.maxDailyTrades) {
            return false;
        }
        // Check minimum time between trades
        if (this.lastTradeTime) {
            const minInterval = this.getMinTradeInterval();
            if (Date.now() - this.lastTradeTime.getTime() < minInterval) {
                return false;
            }
        }
        return true;
    }
    /**
     * Execute a trade
     */
    async executeTrade(decision) {
        if (!this.orderManager || !decision.shouldTrade) {
            return null;
        }
        if (!decision.side || !decision.price || !decision.amount) {
            return null;
        }
        try {
            const orderId = await this.orderManager.createOrder({
                botId: this.config.id,
                side: decision.side,
                type: "LIMIT",
                price: decision.price,
                amount: decision.amount,
                purpose: decision.purpose || "LIQUIDITY",
                isRealLiquidity: false, // Bots use AI-only orders
            });
            if (orderId) {
                this.openOrderIds.add(orderId);
                this.dailyTradeCount++;
                this.totalTrades++;
                this.lastTradeTime = new Date();
            }
            return orderId;
        }
        catch (error) {
            console_1.logger.error("AI_BOT", "Failed to execute trade", error);
            return null;
        }
    }
    /**
     * Cancel an order
     */
    async cancelOrder(orderId) {
        if (!this.orderManager) {
            return false;
        }
        const success = await this.orderManager.cancelOrder(orderId);
        if (success) {
            this.openOrderIds.delete(orderId);
        }
        return success;
    }
    /**
     * Cancel all open orders
     */
    async cancelAllOrders() {
        if (!this.orderManager) {
            return;
        }
        for (const orderId of this.openOrderIds) {
            await this.cancelOrder(orderId);
        }
        this.openOrderIds.clear();
    }
    /**
     * Record trade result
     */
    recordTradeResult(pnl) {
        this.totalPnL += pnl;
        if (pnl > 0) {
            this.winningTrades++;
            this.consecutiveWins++;
            this.consecutiveLosses = 0;
        }
        else if (pnl < 0) {
            this.consecutiveLosses++;
            this.consecutiveWins = 0;
            // Enter cooldown after consecutive losses
            if (this.consecutiveLosses >= 3) {
                this.enterCooldown();
            }
        }
    }
    /**
     * Reset daily statistics
     */
    resetDailyStats() {
        this.dailyTradeCount = 0;
    }
    // ============================================
    // Getters
    // ============================================
    getId() {
        return this.config.id;
    }
    // Alias for getId() for compatibility
    getBotId() {
        return this.config.id;
    }
    getName() {
        return this.config.name;
    }
    getPersonality() {
        return this.config.personality;
    }
    getStatus() {
        return this.status;
    }
    getConfig() {
        return { ...this.config };
    }
    getOpenOrderCount() {
        return this.openOrderIds.size;
    }
    getTotalTrades() {
        return this.totalTrades;
    }
    getSuccessfulTrades() {
        return this.winningTrades;
    }
    getFailedTrades() {
        return this.totalTrades - this.winningTrades;
    }
    getWinRate() {
        return this.totalTrades > 0 ? this.winningTrades / this.totalTrades : 0;
    }
    getLastTradeTime() {
        return this.lastTradeTime ? this.lastTradeTime.getTime() : null;
    }
    getPnL() {
        return this.totalPnL;
    }
    setOrderManager(orderManager) {
        this.orderManager = orderManager;
    }
    getStats() {
        return {
            totalTrades: this.totalTrades,
            winningTrades: this.winningTrades,
            winRate: this.totalTrades > 0 ? this.winningTrades / this.totalTrades : 0,
            totalPnL: this.totalPnL,
            dailyTradeCount: this.dailyTradeCount,
            status: this.status,
        };
    }
    // ============================================
    // Protected Helper Methods
    // ============================================
    /**
     * Get minimum time between trades based on frequency
     */
    getMinTradeInterval() {
        switch (this.config.tradeFrequency) {
            case "HIGH":
                return 5000; // 5 seconds
            case "MEDIUM":
                return 30000; // 30 seconds
            case "LOW":
                return 120000; // 2 minutes
        }
    }
    /**
     * Add variance to a value
     */
    addVariance(value, variance = this.config.orderSizeVariance) {
        const factor = 1 - variance + Math.random() * variance * 2;
        return value * factor;
    }
    /**
     * Check if price is near a psychological level
     */
    isNearPsychologicalLevel(price) {
        // Check if near round numbers
        const roundLevels = [
            Math.floor(price / 1000) * 1000,
            Math.floor(price / 100) * 100,
            Math.floor(price / 10) * 10,
        ];
        for (const level of roundLevels) {
            const distance = Math.abs(price - level) / price;
            if (distance < 0.005) {
                // Within 0.5%
                return true;
            }
        }
        return false;
    }
    /**
     * Calculate trend direction from price difference
     */
    getTrendDirection(currentPrice, targetPrice) {
        const diff = (targetPrice - currentPrice) / currentPrice;
        if (Math.abs(diff) < 0.001) {
            return "SIDEWAYS";
        }
        return diff > 0 ? "UP" : "DOWN";
    }
}
exports.BaseBot = BaseBot;
exports.default = BaseBot;
