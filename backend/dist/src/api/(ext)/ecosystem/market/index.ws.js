"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.metadata = void 0;
exports.clearOrderbookCache = clearOrderbookCache;
exports.forceOrderbookBroadcast = forceOrderbookBroadcast;
const Websocket_1 = require("@b/handler/Websocket");
const matchingEngine_1 = require("@b/api/(ext)/ecosystem/utils/matchingEngine");
const queries_1 = require("@b/api/(ext)/ecosystem/utils/scylla/queries");
const db_1 = require("@b/db");
const console_1 = require("@b/utils/console");
exports.metadata = {
    logModule: "ECOSYSTEM",
    logTitle: "Market WebSocket connection"
};
class UnifiedEcosystemMarketDataHandler {
    constructor() {
        this.activeSubscriptions = new Map(); // symbol -> Map<type, subscriptionPayload>
        this.intervalMap = new Map(); // symbol -> interval
        this.lastTickerData = new Map(); // symbol -> last ticker data
        this.lastOrderbookData = new Map(); // symbol -> last orderbook hash
        this.engine = null;
    }
    static getInstance() {
        if (!UnifiedEcosystemMarketDataHandler.instance) {
            UnifiedEcosystemMarketDataHandler.instance = new UnifiedEcosystemMarketDataHandler();
        }
        return UnifiedEcosystemMarketDataHandler.instance;
    }
    async initializeEngine() {
        if (!this.engine) {
            this.engine = await matchingEngine_1.MatchingEngine.getInstance();
        }
    }
    async fetchAndBroadcastData(symbol, subscriptionMap, isInitialFetch = false) {
        try {
            await this.initializeEngine();
            const fetchPromises = Array.from(subscriptionMap.entries()).map(async ([type, payload]) => {
                try {
                    switch (type) {
                        case "orderbook":
                            const orderbook = await (0, queries_1.getOrderBook)(symbol);
                            // On initial fetch, always broadcast. Otherwise, only if data changed
                            const orderbookHash = JSON.stringify(orderbook);
                            const lastOrderbookHash = this.lastOrderbookData.get(symbol);
                            if (isInitialFetch || lastOrderbookHash !== orderbookHash) {
                                this.lastOrderbookData.set(symbol, orderbookHash);
                                // Build stream key matching frontend subscription (includes limit if present)
                                const streamKey = payload.limit ? `orderbook:${payload.limit}` : 'orderbook';
                                Websocket_1.messageBroker.broadcastToSubscribedClients(`/api/ecosystem/market`, payload, { stream: streamKey, data: orderbook });
                            }
                            break;
                        case "trades":
                            try {
                                const limit = payload.limit || 50;
                                const trades = await (0, queries_1.getRecentTrades)(symbol, limit);
                                // Only broadcast if there are actual trades
                                if (trades && trades.length > 0) {
                                    Websocket_1.messageBroker.broadcastToSubscribedClients(`/api/ecosystem/market`, payload, { stream: "trades", data: trades });
                                }
                            }
                            catch (tradesError) {
                                console_1.logger.error("ECO_WS", `Error fetching trades for ${symbol}`, tradesError);
                            }
                            break;
                        case "ticker":
                            const ticker = await this.engine.getTicker(symbol);
                            // On initial fetch, always broadcast. Otherwise, only if data changed
                            const lastTicker = this.lastTickerData.get(symbol);
                            const tickerChanged = !lastTicker ||
                                lastTicker.last !== ticker.last ||
                                lastTicker.baseVolume !== ticker.baseVolume ||
                                lastTicker.quoteVolume !== ticker.quoteVolume ||
                                lastTicker.change !== ticker.change;
                            if (isInitialFetch || tickerChanged) {
                                this.lastTickerData.set(symbol, ticker);
                                Websocket_1.messageBroker.broadcastToSubscribedClients(`/api/ecosystem/market`, payload, { stream: "ticker", data: ticker });
                            }
                            break;
                        case "ohlcv":
                            try {
                                const interval = payload.interval || "1m";
                                const limit = payload.limit || 100;
                                const ohlcv = await (0, queries_1.getOHLCV)(symbol, interval, limit);
                                // Only broadcast if there's OHLCV data
                                if (ohlcv && ohlcv.length > 0) {
                                    Websocket_1.messageBroker.broadcastToSubscribedClients(`/api/ecosystem/market`, payload, { stream: "ohlcv", data: ohlcv });
                                }
                            }
                            catch (ohlcvError) {
                                console_1.logger.error("ECO_WS", `Error fetching OHLCV for ${symbol}`, ohlcvError);
                            }
                            break;
                    }
                }
                catch (error) {
                    console_1.logger.error("ECO_WS", `Error fetching ${type} data for ${symbol}`, error);
                }
            });
            await Promise.allSettled(fetchPromises);
        }
        catch (error) {
            console_1.logger.error("ECO_WS", `Error in fetchAndBroadcastData for ${symbol}`, error);
        }
    }
    startDataFetching(symbol) {
        // Clear existing interval if any
        if (this.intervalMap.has(symbol)) {
            clearInterval(this.intervalMap.get(symbol));
        }
        // Start new interval for this symbol
        const interval = setInterval(async () => {
            const subscriptionMap = this.activeSubscriptions.get(symbol);
            if (subscriptionMap && subscriptionMap.size > 0) {
                await this.fetchAndBroadcastData(symbol, subscriptionMap);
            }
        }, 2000); // Fetch every 2 seconds
        this.intervalMap.set(symbol, interval);
    }
    async addSubscription(symbol, payload) {
        // Validate that the symbol exists in the database and is enabled
        if (!symbol) {
            console_1.logger.warn("ECO_WS", "No symbol provided in ecosystem subscription request");
            return;
        }
        const [currency, pair] = symbol.split("/");
        if (!currency || !pair) {
            console_1.logger.warn("ECO_WS", `Invalid symbol format: ${symbol}. Expected format: CURRENCY/PAIR`);
            return;
        }
        const market = await db_1.models.ecosystemMarket.findOne({
            where: {
                currency,
                pair,
                status: true // Only allow enabled markets
            }
        });
        if (!market) {
            console_1.logger.warn("ECO_WS", `Ecosystem market ${symbol} not found in database or is disabled. Skipping subscription.`);
            return;
        }
        const type = payload.type;
        // Add this subscription to the symbol's subscription map
        if (!this.activeSubscriptions.has(symbol)) {
            const newMap = new Map();
            newMap.set(type, payload);
            this.activeSubscriptions.set(symbol, newMap);
            // Start data fetching for this symbol
            this.startDataFetching(symbol);
        }
        else {
            // Add/update the subscription with the full payload
            this.activeSubscriptions.get(symbol).set(type, payload);
        }
        // Immediately fetch and send initial data for the new subscription
        const singleSubscriptionMap = new Map();
        singleSubscriptionMap.set(type, payload);
        await this.fetchAndBroadcastData(symbol, singleSubscriptionMap, true); // true = isInitialFetch
    }
    removeSubscription(symbol, type) {
        if (this.activeSubscriptions.has(symbol)) {
            this.activeSubscriptions.get(symbol).delete(type);
            // If no more data types for this symbol, remove the symbol entirely
            if (this.activeSubscriptions.get(symbol).size === 0) {
                this.activeSubscriptions.delete(symbol);
                // Clear the interval
                if (this.intervalMap.has(symbol)) {
                    clearInterval(this.intervalMap.get(symbol));
                    this.intervalMap.delete(symbol);
                }
            }
        }
    }
    stop() {
        // Clear all intervals
        this.intervalMap.forEach((interval) => clearInterval(interval));
        this.intervalMap.clear();
        this.activeSubscriptions.clear();
    }
    /**
     * Clear the cached orderbook data for a symbol
     * This forces the next fetch to broadcast fresh data
     */
    clearOrderbookCache(symbol) {
        this.lastOrderbookData.delete(symbol);
        console_1.logger.debug("ECO_WS", `Cleared orderbook cache for ${symbol}`);
    }
    /**
     * Force an immediate orderbook broadcast for a symbol
     * Bypasses the hash comparison cache
     */
    async forceOrderbookBroadcast(symbol) {
        try {
            // Clear the cache first
            this.clearOrderbookCache(symbol);
            // Get the subscription map for this symbol
            const subscriptionMap = this.activeSubscriptions.get(symbol);
            if (!subscriptionMap) {
                console_1.logger.debug("ECO_WS", `No active subscriptions for ${symbol}, skipping forced broadcast`);
                return;
            }
            // Create a minimal subscription map with just orderbook
            const orderbookPayload = subscriptionMap.get("orderbook");
            if (orderbookPayload) {
                const orderbook = await (0, queries_1.getOrderBook)(symbol);
                const orderbookHash = JSON.stringify(orderbook);
                this.lastOrderbookData.set(symbol, orderbookHash);
                const streamKey = orderbookPayload.limit ? `orderbook:${orderbookPayload.limit}` : 'orderbook';
                Websocket_1.messageBroker.broadcastToSubscribedClients(`/api/ecosystem/market`, orderbookPayload, { stream: streamKey, data: orderbook });
                console_1.logger.debug("ECO_WS", `Forced orderbook broadcast for ${symbol}`);
            }
        }
        catch (error) {
            console_1.logger.error("ECO_WS", `Failed to force orderbook broadcast for ${symbol}`, error);
        }
    }
}
// Export helper functions for external use
function clearOrderbookCache(symbol) {
    UnifiedEcosystemMarketDataHandler.getInstance().clearOrderbookCache(symbol);
}
async function forceOrderbookBroadcast(symbol) {
    await UnifiedEcosystemMarketDataHandler.getInstance().forceOrderbookBroadcast(symbol);
}
exports.default = async (data, message) => {
    const { ctx } = data;
    ctx === null || ctx === void 0 ? void 0 : ctx.step("Processing market WebSocket message");
    // Parse the incoming message if it's a string.
    if (typeof message === "string") {
        message = JSON.parse(message);
    }
    const { action, payload } = message;
    const { type, symbol } = payload || {};
    if (!type || !symbol) {
        console_1.logger.error("ECO_WS", "Invalid message structure: type or symbol is missing");
        ctx === null || ctx === void 0 ? void 0 : ctx.fail("Invalid message structure: missing type or symbol");
        return;
    }
    const handler = UnifiedEcosystemMarketDataHandler.getInstance();
    if (action === "SUBSCRIBE") {
        ctx === null || ctx === void 0 ? void 0 : ctx.step(`Subscribing to ${type} for ${symbol}`);
        await handler.addSubscription(symbol, payload);
        ctx === null || ctx === void 0 ? void 0 : ctx.success(`Subscribed to ${type} for ${symbol}`);
    }
    else if (action === "UNSUBSCRIBE") {
        ctx === null || ctx === void 0 ? void 0 : ctx.step(`Unsubscribing from ${type} for ${symbol}`);
        handler.removeSubscription(symbol, type);
        ctx === null || ctx === void 0 ? void 0 : ctx.success(`Unsubscribed from ${type} for ${symbol}`);
    }
};
