"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.BotManager = void 0;
const BotFactory_1 = require("./BotFactory");
const console_1 = require("@b/utils/console");
const error_1 = require("@b/utils/error");
/**
 * BotManager - Manages bot lifecycle and execution
 *
 * Handles:
 * - Starting/stopping bots
 * - Managing bot groups per market
 * - Executing bot trading loops
 * - Collecting bot statistics
 */
class BotManager {
    constructor() {
        this.marketGroups = new Map();
        this.orderManagers = new Map();
        // Configuration
        this.minLoopInterval = 1000; // 1 second minimum
        this.maxConcurrentTrades = 3; // Max concurrent trades per loop
        this.factory = BotFactory_1.BotFactory.getInstance();
    }
    static getInstance() {
        if (!BotManager.instance) {
            BotManager.instance = new BotManager();
        }
        return BotManager.instance;
    }
    /**
     * Initialize bots for a market
     */
    async initializeMarket(marketConfig, orderManager) {
        const { marketId } = marketConfig;
        // Don't reinitialize if already exists
        if (this.marketGroups.has(marketId)) {
            console_1.logger.info("BOT_MANAGER", `Market ${marketId} already initialized`);
            return;
        }
        // Create bots for market
        const bots = this.factory.createBotsForMarket(marketConfig);
        // Initialize each bot with order manager
        for (const bot of bots) {
            bot.setOrderManager(orderManager);
        }
        // Store bot group
        this.marketGroups.set(marketId, {
            marketId,
            bots,
            isRunning: false,
            loopInterval: null,
        });
        // Store order manager reference
        this.orderManagers.set(marketId, orderManager);
        console_1.logger.info("BOT_MANAGER", `Initialized ${bots.length} bots for market ${marketId}`);
    }
    /**
     * Start all bots for a market
     */
    async startMarket(marketId) {
        const group = this.marketGroups.get(marketId);
        if (!group) {
            throw (0, error_1.createError)({ statusCode: 404, message: `Market ${marketId} not initialized` });
        }
        if (group.isRunning) {
            console_1.logger.info("BOT_MANAGER", `Market ${marketId} already running`);
            return;
        }
        // Start each bot
        for (const bot of group.bots) {
            await bot.start();
        }
        group.isRunning = true;
        // Start trading loop
        this.startTradingLoop(marketId);
        console_1.logger.info("BOT_MANAGER", `Started ${group.bots.length} bots for market ${marketId}`);
    }
    /**
     * Stop all bots for a market
     */
    async stopMarket(marketId) {
        const group = this.marketGroups.get(marketId);
        if (!group) {
            return;
        }
        // Stop trading loop
        if (group.loopInterval) {
            clearInterval(group.loopInterval);
            group.loopInterval = null;
        }
        // Stop each bot
        for (const bot of group.bots) {
            await bot.stop();
        }
        group.isRunning = false;
        console_1.logger.info("BOT_MANAGER", `Stopped bots for market ${marketId}`);
    }
    /**
     * Pause all bots for a market
     */
    async pauseMarket(marketId) {
        const group = this.marketGroups.get(marketId);
        if (!group)
            return;
        for (const bot of group.bots) {
            await bot.pause();
        }
        console_1.logger.info("BOT_MANAGER", `Paused bots for market ${marketId}`);
    }
    /**
     * Resume all bots for a market
     */
    async resumeMarket(marketId) {
        const group = this.marketGroups.get(marketId);
        if (!group)
            return;
        for (const bot of group.bots) {
            await bot.resume();
        }
        console_1.logger.info("BOT_MANAGER", `Resumed bots for market ${marketId}`);
    }
    /**
     * Remove market and cleanup
     */
    async removeMarket(marketId) {
        const group = this.marketGroups.get(marketId);
        // Ensure interval is cleared before removing to prevent memory leaks
        if (group === null || group === void 0 ? void 0 : group.loopInterval) {
            clearInterval(group.loopInterval);
            group.loopInterval = null;
        }
        await this.stopMarket(marketId);
        // Clear all references to allow garbage collection
        if (group) {
            group.bots = [];
        }
        this.marketGroups.delete(marketId);
        this.orderManagers.delete(marketId);
        console_1.logger.info("BOT_MANAGER", `Removed market ${marketId}`);
    }
    /**
     * Add a single bot to a market
     */
    async addBot(marketId, bot) {
        const group = this.marketGroups.get(marketId);
        if (!group) {
            throw (0, error_1.createError)({ statusCode: 404, message: `Market ${marketId} not initialized` });
        }
        const orderManager = this.orderManagers.get(marketId);
        if (orderManager) {
            bot.setOrderManager(orderManager);
        }
        group.bots.push(bot);
        if (group.isRunning) {
            await bot.start();
        }
        console_1.logger.info("BOT_MANAGER", `Added bot ${bot.getBotId()} to market ${marketId}`);
    }
    /**
     * Remove a specific bot
     */
    async removeBot(marketId, botId) {
        const group = this.marketGroups.get(marketId);
        if (!group)
            return;
        const botIndex = group.bots.findIndex((b) => b.getBotId() === botId);
        if (botIndex === -1)
            return;
        const bot = group.bots[botIndex];
        await bot.stop();
        group.bots.splice(botIndex, 1);
        console_1.logger.info("BOT_MANAGER", `Removed bot ${botId} from market ${marketId}`);
    }
    /**
     * Get all bots for a market
     */
    getBots(marketId) {
        var _a;
        return ((_a = this.marketGroups.get(marketId)) === null || _a === void 0 ? void 0 : _a.bots) || [];
    }
    /**
     * Get specific bot
     */
    getBot(marketId, botId) {
        const group = this.marketGroups.get(marketId);
        return group === null || group === void 0 ? void 0 : group.bots.find((b) => b.getBotId() === botId);
    }
    /**
     * Get statistics for all bots in a market
     */
    getMarketStats(marketId) {
        const group = this.marketGroups.get(marketId);
        if (!group)
            return [];
        return group.bots.map((bot) => ({
            botId: bot.getBotId(),
            personality: bot.getPersonality(),
            status: bot.getStatus(),
            totalTrades: bot.getTotalTrades(),
            successfulTrades: bot.getSuccessfulTrades(),
            failedTrades: bot.getFailedTrades(),
            winRate: bot.getWinRate(),
            lastTradeTime: bot.getLastTradeTime(),
            pnl: bot.getPnL(),
        }));
    }
    /**
     * Get aggregate statistics for a market
     */
    getAggregateStats(marketId) {
        const stats = this.getMarketStats(marketId);
        const totalBots = stats.length;
        const activeBots = stats.filter((s) => s.status === "ACTIVE").length;
        const totalTrades = stats.reduce((sum, s) => sum + s.totalTrades, 0);
        const totalPnL = stats.reduce((sum, s) => sum + s.pnl, 0);
        const avgWinRate = totalBots > 0
            ? stats.reduce((sum, s) => sum + s.winRate, 0) / totalBots
            : 0;
        return {
            totalBots,
            activeBots,
            totalTrades,
            totalPnL,
            avgWinRate,
        };
    }
    /**
     * Execute trading decisions for all ready bots
     */
    async executeTradingRound(marketId, context) {
        const group = this.marketGroups.get(marketId);
        if (!group || !group.isRunning) {
            return [];
        }
        const decisions = [];
        let tradesExecuted = 0;
        // Shuffle bots to avoid same order every time
        const shuffledBots = [...group.bots].sort(() => Math.random() - 0.5);
        for (const bot of shuffledBots) {
            // Check concurrent trade limit
            if (tradesExecuted >= this.maxConcurrentTrades) {
                break;
            }
            // Check if bot can trade
            if (!bot.canTrade()) {
                continue;
            }
            try {
                // Get bot's trade decision
                const decision = bot.decideTrade(context);
                decisions.push(decision);
                // Execute if bot wants to trade
                if (decision.shouldTrade) {
                    const success = await bot.executeTrade(decision);
                    if (success) {
                        tradesExecuted++;
                    }
                }
            }
            catch (error) {
                console_1.logger.error("BOT_MANAGER", "Error executing trade", error instanceof Error ? error : new Error(String(error)));
            }
        }
        return decisions;
    }
    /**
     * Check if market is running
     */
    isMarketRunning(marketId) {
        var _a;
        return ((_a = this.marketGroups.get(marketId)) === null || _a === void 0 ? void 0 : _a.isRunning) || false;
    }
    /**
     * Get all active markets
     */
    getActiveMarkets() {
        return Array.from(this.marketGroups.entries())
            .filter(([, group]) => group.isRunning)
            .map(([marketId]) => marketId);
    }
    // ============================================
    // Private Methods
    // ============================================
    /**
     * Start the trading loop for a market
     */
    startTradingLoop(marketId) {
        const group = this.marketGroups.get(marketId);
        if (!group)
            return;
        // Calculate optimal loop interval based on bot types
        const interval = this.calculateLoopInterval(group.bots);
        group.loopInterval = setInterval(async () => {
            if (!group.isRunning)
                return;
            try {
                // Get current market context from order manager
                const orderManager = this.orderManagers.get(marketId);
                if (!orderManager)
                    return;
                const context = await this.buildMarketContext(marketId, orderManager);
                await this.executeTradingRound(marketId, context);
            }
            catch (error) {
                console_1.logger.error("BOT_MANAGER", "Error in trading loop", error instanceof Error ? error : new Error(String(error)));
            }
        }, interval);
    }
    /**
     * Calculate optimal loop interval based on bot personalities
     */
    calculateLoopInterval(bots) {
        if (bots.length === 0)
            return this.minLoopInterval;
        // Get minimum cooldown among all bots
        const minCooldown = Math.min(...bots.map((bot) => bot.getCooldownTime()));
        // Loop at half the minimum cooldown (to catch bots as they become ready)
        return Math.max(this.minLoopInterval, Math.floor(minCooldown / 2));
    }
    /**
     * Build market context for bot decisions
     */
    async buildMarketContext(marketId, orderManager) {
        var _a, _b, _c, _d, _e;
        // Get current price from order manager (use any to access optional methods)
        const om = orderManager;
        const currentPrice = ((_a = om.getCurrentPrice) === null || _a === void 0 ? void 0 : _a.call(om)) || BigInt(0);
        const targetPrice = ((_b = om.getTargetPrice) === null || _b === void 0 ? void 0 : _b.call(om)) || currentPrice;
        // Get order book data
        const orderbook = ((_c = om.getOrderbook) === null || _c === void 0 ? void 0 : _c.call(om)) || {
            bids: [],
            asks: [],
            spread: 0,
            midPrice: Number(currentPrice) / 1e18,
        };
        // Calculate volatility (placeholder - should be from actual data)
        const volatility = 0;
        // Determine recent trend
        const recentTrend = "SIDEWAYS";
        return {
            currentPrice,
            targetPrice,
            priceRangeLow: Number(currentPrice) * 0.9, // Default 10% below
            priceRangeHigh: Number(currentPrice) * 1.1, // Default 10% above
            volatility,
            recentTrend,
            spreadBps: orderbook.spread * 10000, // Convert to basis points
            recentVolume: BigInt(0),
            orderbook: {
                bestBid: ((_d = orderbook.bids[0]) === null || _d === void 0 ? void 0 : _d.price)
                    ? BigInt(Math.floor(orderbook.bids[0].price * 1e18))
                    : BigInt(0),
                bestAsk: ((_e = orderbook.asks[0]) === null || _e === void 0 ? void 0 : _e.price)
                    ? BigInt(Math.floor(orderbook.asks[0].price * 1e18))
                    : BigInt(0),
            },
        };
    }
    /**
     * Shutdown all markets
     */
    async shutdown() {
        const markets = Array.from(this.marketGroups.keys());
        for (const marketId of markets) {
            await this.stopMarket(marketId);
        }
        this.marketGroups.clear();
        this.orderManagers.clear();
        console_1.logger.info("BOT_MANAGER", "Shutdown complete");
    }
}
exports.BotManager = BotManager;
exports.default = BotManager;
