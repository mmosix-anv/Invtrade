"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TradeExecutor = void 0;
const console_1 = require("@b/utils/console");
const queries_1 = require("../scylla/queries");
const db_1 = require("@b/db");
const index_ws_1 = require("../../market/index.ws");
const uuid_1 = require("uuid");
/**
 * TradeExecutor - Executes trades for AI market making
 *
 * Handles:
 * - AI-to-AI trades (matching buy/sell bots internally)
 * - Real liquidity order placement
 * - Price impact calculations
 * - Trade recording
 */
class TradeExecutor {
    constructor(config, orderManager) {
        // Trade statistics
        this.aiTradesExecuted = 0;
        this.realOrdersPlaced = 0;
        this.totalVolume = BigInt(0);
        this.config = config;
        this.orderManager = orderManager;
    }
    /**
     * Execute an AI-to-AI trade
     * This is a direct trade between two bots - no persistent orders created
     * Since bots trade with each other internally, we just record the trade
     */
    async executeAiTrade(params) {
        try {
            const activeBots = this.config.bots.filter((b) => b.status === "ACTIVE");
            if (activeBots.length < 2) {
                console_1.logger.warn("AI_MM", `Need at least 2 active bots for AI trades on ${this.config.symbol}`);
                return false;
            }
            // Select two different bots for the trade
            const [buyBot, sellBot] = this.selectTradingBots(activeBots, params.direction);
            // Explicit null checks - both bots must be available for AI-to-AI trading
            if (!buyBot || !sellBot) {
                console_1.logger.warn("AI_MM", `Cannot execute AI trade for ${this.config.symbol}: ` +
                    `insufficient bots available (buyBot: ${buyBot ? 'available' : 'null'}, sellBot: ${sellBot ? 'available' : 'null'})`);
                return false;
            }
            // Verify bots are different entities
            if (buyBot.id === sellBot.id) {
                console_1.logger.warn("AI_MM", "Cannot execute AI trade: same bot selected for both sides");
                return false;
            }
            // Use the target price directly (passed from MarketInstance)
            const tradePriceNum = params.targetPrice;
            const tradePrice = BigInt(Math.floor(tradePriceNum * 1e18));
            const tradeAmountNum = Number(params.amount) / 1e18;
            // For AI-to-AI trades, we don't need to create persistent orders
            // Just generate UUIDs for tracking purposes in the trade record
            const buyOrderId = (0, uuid_1.v4)();
            const sellOrderId = (0, uuid_1.v4)();
            // Record the trade directly (no order creation needed)
            await (0, queries_1.insertBotTrade)({
                marketId: this.config.marketId,
                buyBotId: buyBot.id,
                sellBotId: sellBot.id,
                buyOrderId,
                sellOrderId,
                price: tradePrice,
                amount: params.amount,
            });
            // Sync to ecosystem for UI display
            await (0, queries_1.syncOrderbookFromAiTrade)(this.config.symbol, tradePriceNum, tradeAmountNum, params.direction);
            await (0, queries_1.syncCandlesFromAiTrade)(this.config.symbol, tradePriceNum, tradeAmountNum);
            // Sync trade to recent trades display
            await (0, queries_1.syncTradeToEcosystem)(this.config.symbol, tradePriceNum, tradeAmountNum, params.direction);
            // Update local statistics
            this.aiTradesExecuted++;
            this.totalVolume += params.amount;
            // Update database statistics
            await this.updateDatabaseStats(buyBot.id, sellBot.id, tradeAmountNum, tradePriceNum);
            console_1.logger.info("AI_MM", `AI trade executed: ${this.config.symbol} ` +
                `${params.direction} ${tradeAmountNum.toFixed(4)} @ ${tradePriceNum.toFixed(8)} ` +
                `| Buyer: ${buyBot.name} | Seller: ${sellBot.name}`);
            // Broadcast trade event to WebSocket clients
            if (process.env.NODE_ENV === "development") {
                console_1.logger.debug("AI_MM", `Broadcasting TRADE event for market ${this.config.id}`);
            }
            (0, index_ws_1.broadcastAiMarketMakerEvent)(this.config.id, {
                type: "TRADE",
                data: {
                    tradeId: buyOrderId, // Using order ID as trade reference
                    symbol: this.config.symbol,
                    side: params.direction,
                    price: tradePriceNum,
                    amount: tradeAmountNum,
                    buyBotId: buyBot.id,
                    buyBotName: buyBot.name,
                    sellBotId: sellBot.id,
                    sellBotName: sellBot.name,
                    timestamp: new Date().toISOString(),
                },
            });
            // Broadcast bot activity for both bots involved in the trade
            (0, index_ws_1.broadcastBotActivity)(this.config.id, {
                botId: buyBot.id,
                botName: buyBot.name,
                action: "AI_TRADE",
                details: {
                    side: "BUY",
                    price: tradePriceNum,
                    amount: tradeAmountNum,
                    counterpartyBotId: sellBot.id,
                    counterpartyBotName: sellBot.name,
                },
            });
            (0, index_ws_1.broadcastBotActivity)(this.config.id, {
                botId: sellBot.id,
                botName: sellBot.name,
                action: "AI_TRADE",
                details: {
                    side: "SELL",
                    price: tradePriceNum,
                    amount: tradeAmountNum,
                    counterpartyBotId: buyBot.id,
                    counterpartyBotName: buyBot.name,
                },
            });
            return true;
        }
        catch (error) {
            console_1.logger.error("AI_MM", "AI trade execution error", error);
            return false;
        }
    }
    /**
     * Update database statistics after a trade
     */
    async updateDatabaseStats(buyBotId, sellBotId, tradeAmount, tradePrice) {
        var _a;
        try {
            const now = new Date();
            const tradeValue = tradeAmount * tradePrice;
            // Update in-memory bot stats (for accurate bot selection)
            const buyBot = this.config.bots.find((b) => b.id === buyBotId);
            if (buyBot) {
                buyBot.dailyTradeCount++;
                buyBot.lastTradeAt = now;
            }
            const sellBot = this.config.bots.find((b) => b.id === sellBotId);
            if (sellBot) {
                sellBot.dailyTradeCount++;
                sellBot.lastTradeAt = now;
            }
            // Update in-memory market maker stats
            this.config.currentDailyVolume += tradeAmount;
            // Update database bot trade counts and volume
            // For AI-to-AI trades, we track in dailyTradeCount and totalVolume
            // Note: realTradesExecuted/profitableTrades are reserved for real user trades
            await db_1.models.aiBot.increment({ dailyTradeCount: 1, totalVolume: tradeValue }, { where: { id: buyBotId } });
            await db_1.models.aiBot.update({ lastTradeAt: now }, { where: { id: buyBotId } });
            await db_1.models.aiBot.increment({ dailyTradeCount: 1, totalVolume: tradeValue }, { where: { id: sellBotId } });
            await db_1.models.aiBot.update({ lastTradeAt: now }, { where: { id: sellBotId } });
            // Update market maker currentDailyVolume in database
            await db_1.models.aiMarketMaker.increment("currentDailyVolume", {
                by: tradeAmount,
                where: { id: this.config.id },
            });
            // Update pool balances based on trade direction
            // AI-to-AI trades are internal, but we track balances for accuracy
            // BUY: increase base, decrease quote
            // SELL: decrease base, increase quote
            if (this.config.pool) {
                const cost = tradeAmount * tradePrice;
                // For AI-to-AI trades, we simulate the pool acting as counterparty
                // The pool "sells" when bots buy, and "buys" when bots sell
                // This keeps the pool balanced and reflects market activity
                const baseChange = tradeAmount;
                const quoteChange = cost;
                // Update in-memory pool state (for accurate calculations)
                // Note: In AI-to-AI trades, the pool doesn't actually change since
                // one bot buys from another. But we update pool values to reflect
                // the "virtual" market state for the target price maintenance.
                // Pool balances are more for tracking total activity than actual holdings.
                // Update database pool (for persistence)
                // We don't actually change balances for AI-to-AI trades since
                // they are internal - the bots trade with each other, not the pool
                // Pool balance changes only happen with real user trades
            }
            // Get pool value for history record
            const poolValue = ((_a = this.config.pool) === null || _a === void 0 ? void 0 : _a.totalValueLocked) || 0;
            // Record TRADE action in history
            await db_1.models.aiMarketMakerHistory.create({
                marketMakerId: this.config.id,
                action: "TRADE",
                details: {
                    botId: buyBotId,
                    side: "BUY",
                    amount: tradeAmount,
                    size: tradeAmount, // Alias for amount (some analytics use 'size')
                    volume: tradeAmount, // Alias for amount (some analytics use 'volume')
                    price: tradePrice,
                    triggeredBy: "SYSTEM",
                },
                priceAtAction: tradePrice,
                poolValueAtAction: poolValue,
            });
        }
        catch (error) {
            // Log but don't fail the trade if stats update fails
            console_1.logger.error("AI_MM", "Stats update error", error);
        }
    }
    /**
     * Place a real liquidity order (in ecosystem)
     */
    async placeRealLiquidityOrder(params) {
        try {
            // Filter for active bots that haven't hit their daily trade limit
            const availableBots = this.config.bots.filter((b) => b.status === "ACTIVE" && b.dailyTradeCount < b.maxDailyTrades);
            if (availableBots.length === 0) {
                console_1.logger.debug("AI_MM", `Cannot place real order for ${this.config.symbol}: ` +
                    `no bots available (all at daily limit or inactive)`);
                return false;
            }
            // Select a bot for this order
            const bot = availableBots[Math.floor(Math.random() * availableBots.length)];
            // For real liquidity, place orders slightly away from current price to create spread
            // Dynamic spread based on volatility - higher volatility = wider spread
            const spreadFactor = this.calculateDynamicSpread(params.direction, params.volatility);
            const orderPriceNum = params.targetPrice * spreadFactor;
            const orderPrice = BigInt(Math.floor(orderPriceNum * 1e18));
            // Create the order
            const orderId = await this.orderManager.createOrder({
                botId: bot.id,
                side: params.direction,
                type: "LIMIT",
                price: orderPrice,
                amount: params.amount,
                purpose: "LIQUIDITY",
                isRealLiquidity: true,
            });
            if (!orderId) {
                return false;
            }
            // Update statistics
            this.realOrdersPlaced++;
            const orderAmountNum = Number(params.amount) / 1e18;
            console_1.logger.info("AI_MM", `Real liquidity order placed: ${this.config.symbol} ` +
                `${params.direction} ${orderAmountNum.toFixed(4)} @ ${orderPriceNum.toFixed(8)}`);
            // Broadcast order event to WebSocket clients
            (0, index_ws_1.broadcastAiMarketMakerEvent)(this.config.id, {
                type: "ORDER",
                data: {
                    orderId,
                    symbol: this.config.symbol,
                    side: params.direction,
                    price: orderPriceNum,
                    amount: orderAmountNum,
                    botId: bot.id,
                    botName: bot.name,
                    orderType: "REAL_LIQUIDITY",
                    timestamp: new Date().toISOString(),
                },
            });
            // Broadcast bot activity
            (0, index_ws_1.broadcastBotActivity)(this.config.id, {
                botId: bot.id,
                botName: bot.name,
                action: "REAL_ORDER_PLACED",
                details: {
                    side: params.direction,
                    price: orderPriceNum,
                    amount: orderAmountNum,
                    reason: "Providing real liquidity to ecosystem",
                },
            });
            return true;
        }
        catch (error) {
            console_1.logger.error("AI_MM", "Real liquidity order placement error", error);
            return false;
        }
    }
    /**
     * Calculate dynamic spread based on volatility
     * Higher volatility = wider spread for risk management
     *
     * @param direction - Order direction (BUY or SELL)
     * @param volatility - Current volatility percentage (0-100)
     * @returns Spread factor (e.g., 0.998 for BUY, 1.002 for SELL)
     */
    calculateDynamicSpread(direction, volatility) {
        // Base spread: 0.1% (0.001) - minimum spread
        const baseSpread = 0.001;
        // Calculate additional spread based on volatility
        // For every 1% of volatility, add 0.05% to spread (up to a max)
        const vol = volatility || 0;
        const volatilitySpread = Math.min(vol * 0.0005, 0.005); // Max 0.5% additional spread
        // Total spread
        const totalSpread = baseSpread + volatilitySpread;
        // Apply spread in the appropriate direction
        // BUY orders go below market price, SELL orders go above
        if (direction === "BUY") {
            return 1 - totalSpread; // e.g., 0.999 for low vol, 0.994 for high vol
        }
        else {
            return 1 + totalSpread; // e.g., 1.001 for low vol, 1.006 for high vol
        }
    }
    /**
     * Select two bots for trading
     * Returns [buyBot, sellBot]
     */
    selectTradingBots(bots, direction) {
        if (bots.length < 2) {
            return [null, null];
        }
        // Filter for available bots (not at daily limit)
        const availableBots = bots.filter((b) => b.dailyTradeCount < b.maxDailyTrades);
        if (availableBots.length < 2) {
            return [null, null];
        }
        // Shuffle bots for randomness
        const shuffled = [...availableBots].sort(() => Math.random() - 0.5);
        // Select bots based on personality preferences
        let buyBot = null;
        let sellBot = null;
        // First pass: Try to select bots based on personality preferences
        for (const bot of shuffled) {
            // Look for a buy bot (accumulators prefer buying)
            if (!buyBot && ["ACCUMULATOR", "SCALPER", "MARKET_MAKER"].includes(bot.personality)) {
                buyBot = bot;
                continue;
            }
            // Look for a sell bot (distributors prefer selling)
            if (!sellBot && bot.id !== (buyBot === null || buyBot === void 0 ? void 0 : buyBot.id) && ["DISTRIBUTOR", "SWING"].includes(bot.personality)) {
                sellBot = bot;
            }
            // Stop if we have both
            if (buyBot && sellBot) {
                break;
            }
        }
        // Second pass: If we don't have both bots, pick any available ones
        if (!buyBot || !sellBot) {
            for (const bot of shuffled) {
                if (!buyBot) {
                    buyBot = bot;
                }
                else if (!sellBot && bot.id !== buyBot.id) {
                    sellBot = bot;
                    break;
                }
            }
        }
        // Final validation
        if (!buyBot || !sellBot || buyBot.id === sellBot.id) {
            return [null, null];
        }
        return [buyBot, sellBot];
    }
    /**
     * Determine order purpose based on direction
     */
    determinePurpose(direction) {
        // If price needs to go up, we're buying to push price
        // If price needs to go down, we're selling to push price
        return "PRICE_PUSH";
    }
    /**
     * Add human-like randomization to order timing and size
     */
    addHumanBehavior(baseAmount, bot) {
        // Add variance based on bot configuration (clamped to max 0.5 for safety)
        const variance = Math.min(bot.orderSizeVariance, 0.5);
        const randomFactor = 1 - variance + Math.random() * variance * 2;
        // Add small random delays would be done at execution time
        // This method handles size variance
        return BigInt(Math.floor(Number(baseAmount) * randomFactor));
    }
    /**
     * Get execution statistics
     */
    getStats() {
        return {
            aiTradesExecuted: this.aiTradesExecuted,
            realOrdersPlaced: this.realOrdersPlaced,
            totalVolume: (Number(this.totalVolume) / 1e18).toFixed(8),
        };
    }
}
exports.TradeExecutor = TradeExecutor;
exports.default = TradeExecutor;
