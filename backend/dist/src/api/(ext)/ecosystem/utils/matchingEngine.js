"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.MatchingEngine = void 0;
const blockchain_1 = require("./blockchain");
const candles_1 = require("./candles");
const matchmaking_1 = require("./matchmaking");
const orderbook_1 = require("./orderbook");
const client_1 = __importStar(require("./scylla/client"));
const queries_1 = require("./scylla/queries");
const ws_1 = require("./ws");
const markets_1 = require("./markets");
const console_1 = require("@b/utils/console");
const uuid_1 = require("uuid");
const error_1 = require("@b/utils/error");
// Cache for AI market maker symbols - refreshed periodically
let aiMarketMakerSymbolsCache = new Set();
let aiMarketMakerCacheLastRefresh = 0;
const AI_MARKET_MAKER_CACHE_TTL = 60000; // 1 minute cache
/**
 * Get symbols that have active AI market makers
 * These symbols should be skipped in orderbook sync since AI market maker
 * manages orderbook entries without creating real orders
 *
 * @param forceRefresh - If true, bypass cache and fetch fresh data
 */
async function getAiMarketMakerSymbols(forceRefresh = false) {
    const now = Date.now();
    // Return cached symbols if still valid (unless forced refresh)
    if (!forceRefresh && aiMarketMakerSymbolsCache.size > 0 && now - aiMarketMakerCacheLastRefresh < AI_MARKET_MAKER_CACHE_TTL) {
        return aiMarketMakerSymbolsCache;
    }
    try {
        // Dynamic import to avoid circular dependencies
        const { models } = await Promise.resolve().then(() => __importStar(require("@b/db")));
        // Get all active AI market makers with their associated markets
        const activeMarketMakers = await models.aiMarketMaker.findAll({
            where: { status: "ACTIVE" },
            include: [{
                    model: models.ecosystemMarket,
                    as: "market",
                    attributes: ["currency", "pair"],
                }],
        });
        const symbols = new Set();
        for (const maker of activeMarketMakers) {
            if (maker.market) {
                const symbol = `${maker.market.currency}/${maker.market.pair}`;
                symbols.add(symbol);
            }
        }
        aiMarketMakerSymbolsCache = symbols;
        aiMarketMakerCacheLastRefresh = now;
        if (symbols.size > 0) {
            console_1.logger.info("ECO_ENGINE", `Found ${symbols.size} AI market maker symbols: ${Array.from(symbols).join(", ")}`);
        }
        return symbols;
    }
    catch (error) {
        // If we can't fetch AI market maker symbols, return empty set
        // This allows normal operation if AI market maker module is not available
        console_1.logger.error("ECO_ENGINE", "Failed to get AI market maker symbols", error);
        return new Set();
    }
}
function uuidToString(uuid) {
    try {
        // Handle case where uuid might already be a string
        if (typeof uuid === "string") {
            return uuid;
        }
        // Prefer cassandra-driver's toString method - it handles all UUID formats correctly
        // The uuid library's uuidStringify only accepts v4 UUIDs and fails on v1 or arbitrary UUIDs
        if (uuid && typeof uuid.toString === "function") {
            return uuid.toString();
        }
        // Fallback to buffer-based conversion using uuid library (only works for v4 UUIDs)
        if (uuid === null || uuid === void 0 ? void 0 : uuid.buffer) {
            return (0, uuid_1.stringify)(uuid.buffer);
        }
        throw (0, error_1.createError)({ statusCode: 400, message: "Invalid UUID format" });
    }
    catch (error) {
        // Return fallback - the order will be skipped if userId is all zeros
        return "00000000-0000-0000-0000-000000000000";
    }
}
class MatchingEngine {
    constructor() {
        this.orderQueue = {};
        this.marketsBySymbol = {};
        this.lockedOrders = new Set();
        this.lastCandle = {};
        this.yesterdayCandle = {};
    }
    static getInstance() {
        if (!this.instancePromise) {
            this.instancePromise = (async () => {
                const instance = new MatchingEngine();
                await instance.init();
                return instance;
            })();
        }
        return this.instancePromise;
    }
    async init() {
        await this.initializeMarkets();
        await this.initializeOrders();
        // DISABLED: Run cleanup script manually instead to fix faulty orders
        // await this.validateAndCleanOrderbook();
        await this.initializeLastCandles();
        await this.initializeYesterdayCandles();
    }
    async initializeMarkets() {
        const markets = await (0, markets_1.getEcoSystemMarkets)();
        markets.forEach((market) => {
            this.marketsBySymbol[market.symbol] = market;
            this.orderQueue[market.symbol] = [];
        });
    }
    async initializeOrders() {
        try {
            const openOrders = await (0, queries_1.getAllOpenOrders)();
            openOrders.forEach((order) => {
                var _a, _b, _c, _d, _e, _f, _g, _h;
                const createdAt = new Date(order.createdAt);
                const updatedAt = new Date(order.updatedAt);
                if (isNaN(createdAt.getTime()) || isNaN(updatedAt.getTime())) {
                    console_1.logger.error("ECO_ENGINE", "Invalid date in order", new Error("Invalid date in order"));
                    return;
                }
                if (!((_a = order.userId) === null || _a === void 0 ? void 0 : _a.buffer) || !((_b = order.id) === null || _b === void 0 ? void 0 : _b.buffer)) {
                    console_1.logger.error("ECO_ENGINE", "Invalid Uuid in order", new Error("Invalid Uuid in order"));
                    return;
                }
                const userId = uuidToString(order.userId);
                const orderId = uuidToString(order.id);
                // Skip orders with invalid user IDs (all zeros from legacy/invalid data)
                if (userId === "00000000-0000-0000-0000-000000000000") {
                    // Silently skip invalid orders - these are legacy broken data
                    return;
                }
                // Convert marketMakerId and botId from UUID objects to strings if present
                const marketMakerId = order.marketMakerId ? uuidToString(order.marketMakerId) : undefined;
                const botId = order.botId ? uuidToString(order.botId) : undefined;
                const normalizedOrder = {
                    ...order,
                    amount: BigInt((_c = order.amount) !== null && _c !== void 0 ? _c : 0),
                    price: BigInt((_d = order.price) !== null && _d !== void 0 ? _d : 0),
                    cost: BigInt((_e = order.cost) !== null && _e !== void 0 ? _e : 0),
                    fee: BigInt((_f = order.fee) !== null && _f !== void 0 ? _f : 0),
                    remaining: BigInt((_g = order.remaining) !== null && _g !== void 0 ? _g : 0),
                    filled: BigInt((_h = order.filled) !== null && _h !== void 0 ? _h : 0),
                    createdAt,
                    updatedAt,
                    userId,
                    id: orderId,
                    // AI Market Maker metadata - must be converted from UUID objects to strings
                    marketMakerId: marketMakerId !== "00000000-0000-0000-0000-000000000000" ? marketMakerId : undefined,
                    botId: botId !== "00000000-0000-0000-0000-000000000000" ? botId : undefined,
                };
                if (!this.orderQueue[normalizedOrder.symbol]) {
                    this.orderQueue[normalizedOrder.symbol] = [];
                }
                this.orderQueue[normalizedOrder.symbol].push(normalizedOrder);
            });
            await this.processQueue();
        }
        catch (error) {
            console_1.logger.error("ECO_ENGINE", "Failed to populate order queue with open orders", error);
        }
    }
    /**
     * Syncs orderbook with actual order states from Scylla
     * Removes "ghost" orderbook entries for orders that are CLOSED/CANCELLED
     * IMPORTANT: Skips symbols with active AI market maker since AI manages orderbook entries
     */
    async syncOrderbookWithOrders() {
        var _a;
        try {
            // Get symbols with active AI market maker - FORCE refresh to get latest status
            // This is critical on startup to avoid deleting AI market maker orderbook entries
            const aiMarketMakerSymbols = await getAiMarketMakerSymbols(true);
            // Fetch all orderbook entries
            const allOrderBookEntries = await (0, queries_1.fetchOrderBooks)();
            if (!allOrderBookEntries || allOrderBookEntries.length === 0) {
                return;
            }
            // Group by symbol for efficient processing
            const orderbookBySymbol = {};
            allOrderBookEntries.forEach((entry) => {
                if (!orderbookBySymbol[entry.symbol]) {
                    orderbookBySymbol[entry.symbol] = [];
                }
                orderbookBySymbol[entry.symbol].push(entry);
            });
            let ghostEntriesRemoved = 0;
            // For each symbol, check if orderbook entries match actual OPEN orders
            for (const symbol in orderbookBySymbol) {
                // Skip symbols with active AI market maker - AI manages the orderbook for these
                if (aiMarketMakerSymbols.has(symbol)) {
                    continue;
                }
                const orderbookEntries = orderbookBySymbol[symbol];
                // Get all OPEN orders for this symbol
                const openOrders = this.orderQueue[symbol] || [];
                // Create a map of price -> total remaining amount from OPEN orders
                const openOrdersByPrice = {};
                for (const order of openOrders) {
                    const priceStr = (0, blockchain_1.fromBigInt)(order.price).toString();
                    if (!openOrdersByPrice[priceStr]) {
                        openOrdersByPrice[priceStr] = { bids: BigInt(0), asks: BigInt(0) };
                    }
                    if (order.side === "BUY") {
                        openOrdersByPrice[priceStr].bids += order.remaining;
                    }
                    else {
                        openOrdersByPrice[priceStr].asks += order.remaining;
                    }
                }
                // Check each orderbook entry
                for (const entry of orderbookEntries) {
                    const priceStr = entry.price.toString();
                    const side = entry.side.toUpperCase();
                    // Convert orderbook amount to BigInt (it's stored as a decimal)
                    const orderbookAmount = (0, blockchain_1.toBigIntFloat)(Number(entry.amount));
                    const openAmount = ((_a = openOrdersByPrice[priceStr]) === null || _a === void 0 ? void 0 : _a[side === "BIDS" ? "bids" : "asks"]) || BigInt(0);
                    // Check for discrepancies between orderbook and actual open orders
                    if (orderbookAmount !== openAmount) {
                        if (openAmount === BigInt(0)) {
                            // Ghost entry: orderbook has amount but no open orders exist
                            try {
                                // Remove ghost entry from orderbook
                                const deleteQuery = `DELETE FROM ${client_1.scyllaKeyspace}.orderbook WHERE symbol = ? AND price = ? AND side = ?`;
                                await client_1.default.execute(deleteQuery, [symbol, priceStr, side], { prepare: true });
                                ghostEntriesRemoved++;
                            }
                            catch (deleteError) {
                                console_1.logger.error("ECO_ENGINE", `Failed to remove ghost entry for ${symbol}: ${deleteError.message}`);
                            }
                        }
                        else {
                            // Amount mismatch: orderbook amount doesn't match sum of open orders
                            try {
                                // Update orderbook with correct amount
                                const updateQuery = `UPDATE ${client_1.scyllaKeyspace}.orderbook SET amount = ? WHERE symbol = ? AND price = ? AND side = ?`;
                                await client_1.default.execute(updateQuery, [(0, blockchain_1.fromBigInt)(openAmount), symbol, priceStr, side], { prepare: true });
                                ghostEntriesRemoved++;
                            }
                            catch (updateError) {
                                console_1.logger.error("ECO_ENGINE", `Failed to fix amount for ${symbol}: ${updateError.message}`);
                            }
                        }
                    }
                }
                // Check for missing orderbook entries (open orders not in orderbook)
                for (const priceStr in openOrdersByPrice) {
                    const amounts = openOrdersByPrice[priceStr];
                    // Check BIDS
                    if (amounts.bids > BigInt(0)) {
                        const existingEntry = orderbookEntries.find(e => e.price.toString() === priceStr && e.side.toUpperCase() === "BIDS");
                        if (!existingEntry) {
                            try {
                                const insertQuery = `INSERT INTO ${client_1.scyllaKeyspace}.orderbook (symbol, price, side, amount) VALUES (?, ?, ?, ?)`;
                                await client_1.default.execute(insertQuery, [symbol, priceStr, "BIDS", (0, blockchain_1.fromBigInt)(amounts.bids)], { prepare: true });
                                ghostEntriesRemoved++;
                            }
                            catch (insertError) {
                                console_1.logger.error("ECO_ENGINE", `Failed to add missing BID entry for ${symbol}: ${insertError.message}`);
                            }
                        }
                    }
                    // Check ASKS
                    if (amounts.asks > BigInt(0)) {
                        const existingEntry = orderbookEntries.find(e => e.price.toString() === priceStr && e.side.toUpperCase() === "ASKS");
                        if (!existingEntry) {
                            try {
                                const insertQuery = `INSERT INTO ${client_1.scyllaKeyspace}.orderbook (symbol, price, side, amount) VALUES (?, ?, ?, ?)`;
                                await client_1.default.execute(insertQuery, [symbol, priceStr, "ASKS", (0, blockchain_1.fromBigInt)(amounts.asks)], { prepare: true });
                                ghostEntriesRemoved++;
                            }
                            catch (insertError) {
                                console_1.logger.error("ECO_ENGINE", `Failed to add missing ASK entry for ${symbol}: ${insertError.message}`);
                            }
                        }
                    }
                }
            }
            // Only log if there were issues fixed
            if (ghostEntriesRemoved > 0) {
                console_1.logger.info("ECO_ENGINE", `Fixed ${ghostEntriesRemoved} orderbook discrepancies`);
                // Refresh orderbook broadcasts
                await this.refreshOrderBooks();
            }
        }
        catch (error) {
            console_1.logger.error("ECO_ENGINE", "Orderbook sync failed", error);
        }
    }
    /**
     * Validates orderbook integrity on startup and fixes/cancels problematic orders
     * This prevents stuck orderbooks where orders exist but funds aren't properly locked
     */
    async validateAndCleanOrderbook() {
        var _a, _b, _c, _d;
        try {
            // STEP 1: Sync orderbook with actual order states (remove ghost entries)
            await this.syncOrderbookWithOrders();
            const { getUserEcosystemWalletByCurrency } = await Promise.resolve().then(() => __importStar(require("./matchmaking")));
            const { updateWalletBalance } = await Promise.resolve().then(() => __importStar(require("./wallet")));
            let totalOrdersChecked = 0;
            let ordersFixed = 0;
            let invalidOrdersCancelled = 0;
            for (const symbol in this.orderQueue) {
                // Skip invalid/undefined symbols
                if (!symbol || symbol === 'undefined' || !symbol.includes('/')) {
                    continue;
                }
                const orders = this.orderQueue[symbol];
                const [baseCurrency, quoteCurrency] = symbol.split("/");
                const invalidOrders = [];
                for (const order of orders) {
                    totalOrdersChecked++;
                    try {
                        // Skip validation for bot orders - they use pool liquidity, not user wallets
                        if (order.marketMakerId) {
                            continue;
                        }
                        const orderAmount = (0, blockchain_1.fromBigInt)((0, blockchain_1.removeTolerance)(order.remaining));
                        // For BUY orders, use the stored cost (which includes fee)
                        // Calculate proportional cost based on remaining vs total amount
                        const fillRatio = Number(order.remaining) / Number(order.amount);
                        const orderCost = (0, blockchain_1.fromBigInt)((0, blockchain_1.removeTolerance)(order.cost)) * fillRatio;
                        if (order.side === "SELL") {
                            // Check if seller has BASE tokens locked
                            const sellerWallet = await getUserEcosystemWalletByCurrency(order.userId, baseCurrency);
                            if (!sellerWallet) {
                                console_1.logger.warn("ECO_ENGINE", `Wallet not found for user ${order.userId}, currency ${baseCurrency}`);
                                invalidOrders.push(order);
                                continue;
                            }
                            const sellerInOrder = parseFloat(((_a = sellerWallet.inOrder) === null || _a === void 0 ? void 0 : _a.toString()) || "0");
                            const sellerBalance = parseFloat(((_b = sellerWallet.balance) === null || _b === void 0 ? void 0 : _b.toString()) || "0");
                            if (sellerInOrder < orderAmount) {
                                // Check if user has enough available balance to lock the funds
                                const availableBalance = sellerBalance - sellerInOrder;
                                if (availableBalance >= orderAmount) {
                                    // FIX: User has balance, just wasn't locked. Lock it now.
                                    try {
                                        const idempotencyKey = `eco_order_lock_${order.id}_${sellerWallet.id}`;
                                        await updateWalletBalance(sellerWallet, orderAmount, "subtract", idempotencyKey);
                                        ordersFixed++;
                                    }
                                    catch (lockError) {
                                        console_1.logger.error("ECO_ENGINE", `Failed to lock funds for ${symbol}: ${lockError.message}`);
                                        invalidOrders.push(order);
                                    }
                                }
                                else {
                                    // User doesn't have enough balance - invalid order
                                    invalidOrders.push(order);
                                }
                            }
                        }
                        else if (order.side === "BUY") {
                            // Check if buyer has QUOTE tokens locked
                            const buyerWallet = await getUserEcosystemWalletByCurrency(order.userId, quoteCurrency);
                            if (!buyerWallet) {
                                console_1.logger.warn("ECO_ENGINE", `Wallet not found for user ${order.userId}, currency ${quoteCurrency}`);
                                invalidOrders.push(order);
                                continue;
                            }
                            const buyerInOrder = parseFloat(((_c = buyerWallet.inOrder) === null || _c === void 0 ? void 0 : _c.toString()) || "0");
                            const buyerBalance = parseFloat(((_d = buyerWallet.balance) === null || _d === void 0 ? void 0 : _d.toString()) || "0");
                            if (buyerInOrder < orderCost) {
                                // Check if user has enough available balance to lock the funds
                                const availableBalance = buyerBalance - buyerInOrder;
                                if (availableBalance >= orderCost) {
                                    // FIX: User has balance, just wasn't locked. Lock it now.
                                    try {
                                        const idempotencyKey = `eco_order_lock_${order.id}_${buyerWallet.id}`;
                                        await updateWalletBalance(buyerWallet, orderCost, "subtract", idempotencyKey);
                                        ordersFixed++;
                                    }
                                    catch (lockError) {
                                        console_1.logger.error("ECO_ENGINE", `Failed to lock funds for ${symbol}: ${lockError.message}`);
                                        invalidOrders.push(order);
                                    }
                                }
                                else {
                                    // User doesn't have enough balance - invalid order
                                    invalidOrders.push(order);
                                }
                            }
                        }
                    }
                    catch (error) {
                        console_1.logger.error("ECO_ENGINE", `Error validating order ${order.id}: ${error.message}`);
                        invalidOrders.push(order);
                    }
                }
                // Cancel invalid orders
                if (invalidOrders.length > 0) {
                    for (const order of invalidOrders) {
                        try {
                            // Import necessary functions
                            const { cancelOrderByUuid } = await Promise.resolve().then(() => __importStar(require("./scylla/queries")));
                            // Cancel in Scylla (requires all 7 parameters)
                            await cancelOrderByUuid(order.userId, order.id, order.createdAt.toISOString(), order.symbol, order.price, order.side, order.remaining);
                            // Remove from local queue
                            const index = this.orderQueue[symbol].indexOf(order);
                            if (index > -1) {
                                this.orderQueue[symbol].splice(index, 1);
                            }
                            // Broadcast cancellation
                            await (0, ws_1.handleOrderBroadcast)({
                                ...order,
                                status: "CANCELLED",
                            });
                            invalidOrdersCancelled++;
                        }
                        catch (cancelError) {
                            console_1.logger.error("ECO_ENGINE", `Failed to cancel order for ${symbol}: ${cancelError.message}`);
                        }
                    }
                }
            }
            // Only log if there were issues
            if (ordersFixed > 0 || invalidOrdersCancelled > 0) {
                console_1.logger.info("ECO_ENGINE", `Fixed ${ordersFixed} orders, cancelled ${invalidOrdersCancelled} invalid orders`);
            }
            if (ordersFixed > 0 || invalidOrdersCancelled > 0) {
                // Refresh orderbook after cleanup
                await this.refreshOrderBooks();
                // Re-load and re-run matching engine to process the fixed orders
                if (ordersFixed > 0) {
                    // Clear the current queue
                    for (const symbol in this.orderQueue) {
                        this.orderQueue[symbol] = [];
                    }
                    // Reload all open orders from Scylla
                    const openOrders = await (0, queries_1.getAllOpenOrders)();
                    const uuidStringify = await Promise.resolve().then(() => __importStar(require("uuid"))).then(m => m.stringify);
                    openOrders.forEach((order) => {
                        var _a, _b, _c, _d, _e, _f, _g, _h;
                        const createdAt = new Date(order.createdAt);
                        const updatedAt = new Date(order.updatedAt);
                        if (isNaN(createdAt.getTime()) || isNaN(updatedAt.getTime()))
                            return;
                        if (!((_a = order.userId) === null || _a === void 0 ? void 0 : _a.buffer) || !((_b = order.id) === null || _b === void 0 ? void 0 : _b.buffer))
                            return;
                        const normalizedOrder = {
                            ...order,
                            amount: BigInt((_c = order.amount) !== null && _c !== void 0 ? _c : 0),
                            price: BigInt((_d = order.price) !== null && _d !== void 0 ? _d : 0),
                            cost: BigInt((_e = order.cost) !== null && _e !== void 0 ? _e : 0),
                            fee: BigInt((_f = order.fee) !== null && _f !== void 0 ? _f : 0),
                            remaining: BigInt((_g = order.remaining) !== null && _g !== void 0 ? _g : 0),
                            filled: BigInt((_h = order.filled) !== null && _h !== void 0 ? _h : 0),
                            createdAt,
                            updatedAt,
                            userId: uuidStringify(order.userId.buffer),
                            id: uuidStringify(order.id.buffer),
                        };
                        if (!this.orderQueue[normalizedOrder.symbol]) {
                            this.orderQueue[normalizedOrder.symbol] = [];
                        }
                        this.orderQueue[normalizedOrder.symbol].push(normalizedOrder);
                    });
                    await this.processQueue();
                }
            }
        }
        catch (error) {
            console_1.logger.error("ECO_ENGINE", "Orderbook validation failed", error);
        }
    }
    /**
     * Refreshes all orderbooks after cleanup
     */
    async refreshOrderBooks() {
        try {
            const allOrderBookEntries = await (0, queries_1.fetchOrderBooks)();
            const mappedOrderBook = {};
            allOrderBookEntries === null || allOrderBookEntries === void 0 ? void 0 : allOrderBookEntries.forEach((entry) => {
                if (!mappedOrderBook[entry.symbol]) {
                    mappedOrderBook[entry.symbol] = { bids: {}, asks: {} };
                }
                mappedOrderBook[entry.symbol][entry.side.toLowerCase()][(0, blockchain_1.removeTolerance)((0, blockchain_1.toBigIntFloat)(Number(entry.price))).toString()] = (0, blockchain_1.removeTolerance)((0, blockchain_1.toBigIntFloat)(Number(entry.amount)));
            });
            // Broadcast updated orderbooks
            for (const symbol in mappedOrderBook) {
                await (0, ws_1.handleOrderBookBroadcast)(symbol, mappedOrderBook[symbol]);
            }
        }
        catch (error) {
            console_1.logger.error("ECO_ENGINE", `Failed to refresh orderbooks: ${error}`);
        }
    }
    async initializeLastCandles() {
        try {
            const lastCandles = await (0, queries_1.getLastCandles)();
            lastCandles.forEach((candle) => {
                if (!this.lastCandle[candle.symbol]) {
                    this.lastCandle[candle.symbol] = {};
                }
                this.lastCandle[candle.symbol][candle.interval] = candle;
            });
        }
        catch (error) {
            console_1.logger.error("ECO_ENGINE", "Failed to initialize last candles", error);
        }
    }
    async initializeYesterdayCandles() {
        try {
            const yesterdayCandles = await (0, queries_1.getYesterdayCandles)();
            Object.keys(yesterdayCandles).forEach((symbol) => {
                const candles = yesterdayCandles[symbol];
                if (candles.length > 0) {
                    this.yesterdayCandle[symbol] = candles[0];
                }
            });
        }
        catch (error) {
            console_1.logger.error("ECO_ENGINE", "Failed to initialize yesterday's candles", error);
        }
    }
    async processQueue() {
        const ordersToUpdate = [];
        const orderBookUpdates = {};
        const allOrderBookEntries = await (0, queries_1.fetchOrderBooks)();
        const mappedOrderBook = {};
        allOrderBookEntries === null || allOrderBookEntries === void 0 ? void 0 : allOrderBookEntries.forEach((entry) => {
            if (!mappedOrderBook[entry.symbol]) {
                mappedOrderBook[entry.symbol] = { bids: {}, asks: {} };
            }
            mappedOrderBook[entry.symbol][entry.side.toLowerCase()][(0, blockchain_1.removeTolerance)((0, blockchain_1.toBigIntFloat)(Number(entry.price))).toString()] = (0, blockchain_1.removeTolerance)((0, blockchain_1.toBigIntFloat)(Number(entry.amount)));
        });
        const calculationPromises = [];
        for (const symbol in this.orderQueue) {
            const orders = this.orderQueue[symbol];
            if (orders.length === 0)
                continue;
            const promise = (async () => {
                const { matchedOrders, bookUpdates } = await (0, matchmaking_1.matchAndCalculateOrders)(orders, mappedOrderBook[symbol] || { bids: {}, asks: {} });
                if (matchedOrders.length === 0) {
                    return;
                }
                ordersToUpdate.push(...matchedOrders);
                orderBookUpdates[symbol] = bookUpdates;
            })();
            calculationPromises.push(promise);
        }
        await Promise.all(calculationPromises);
        if (ordersToUpdate.length === 0) {
            return;
        }
        await this.performUpdates(ordersToUpdate, orderBookUpdates);
        const finalOrderBooks = {};
        for (const symbol in orderBookUpdates) {
            const currentOrderBook = mappedOrderBook[symbol] || { bids: {}, asks: {} };
            finalOrderBooks[symbol] = (0, orderbook_1.applyUpdatesToOrderBook)(currentOrderBook, orderBookUpdates[symbol]);
        }
        const cleanupPromises = [];
        for (const symbol in this.orderQueue) {
            const promise = (async () => {
                this.orderQueue[symbol] = this.orderQueue[symbol].filter((order) => order.status === "OPEN");
            })();
            cleanupPromises.push(promise);
        }
        await Promise.all(cleanupPromises);
        this.broadcastUpdates(ordersToUpdate, finalOrderBooks);
    }
    async performUpdates(ordersToUpdate, orderBookUpdates) {
        const locked = this.lockOrders(ordersToUpdate);
        if (!locked) {
            console_1.logger.warn("ECO_ENGINE", "Couldn't obtain a lock on all orders, skipping this batch.");
            return;
        }
        const updateQueries = [];
        const orderUpdateQueries = await (0, queries_1.generateOrderUpdateQueries)(ordersToUpdate);
        updateQueries.push(...orderUpdateQueries);
        const latestOrdersForCandles = (0, candles_1.getLatestOrdersForCandles)(ordersToUpdate);
        for (const order of latestOrdersForCandles) {
            const candleQueries = await this.updateLastCandles(order);
            updateQueries.push(...candleQueries);
        }
        const orderBookQueries = (0, orderbook_1.generateOrderBookUpdateQueries)(orderBookUpdates);
        updateQueries.push(...orderBookQueries);
        if (updateQueries.length > 0) {
            try {
                await client_1.default.batch(updateQueries, { prepare: true });
            }
            catch (error) {
                console_1.logger.error("ECO_ENGINE", "Failed to batch update", error);
            }
        }
        else {
            console_1.logger.warn("ECO_ENGINE", "No queries to batch update.");
        }
        this.unlockOrders(ordersToUpdate);
    }
    async addToQueue(order) {
        if (!(0, matchmaking_1.validateOrder)(order)) {
            return;
        }
        if (!order.createdAt ||
            isNaN(new Date(order.createdAt).getTime()) ||
            !order.updatedAt ||
            isNaN(new Date(order.updatedAt).getTime())) {
            console_1.logger.error("ECO_ENGINE", "Invalid date in order", new Error("Invalid date in order"));
            return;
        }
        if (!this.orderQueue[order.symbol]) {
            this.orderQueue[order.symbol] = [];
        }
        this.orderQueue[order.symbol].push(order);
        const symbolOrderBook = await (0, orderbook_1.updateSingleOrderBook)(order, "add");
        (0, ws_1.handleOrderBookBroadcast)(order.symbol, symbolOrderBook);
        await this.processQueue();
    }
    async updateLastCandles(order) {
        let finalPrice = BigInt(0);
        let trades;
        try {
            trades = JSON.parse(order.trades);
        }
        catch (error) {
            console_1.logger.error("ECO_ENGINE", "Failed to parse trades", error);
            return [];
        }
        if (trades &&
            trades.length > 0 &&
            trades[trades.length - 1].price !== undefined) {
            finalPrice = (0, blockchain_1.toBigIntFloat)(trades[trades.length - 1].price);
        }
        else if (order.price !== undefined) {
            finalPrice = order.price;
        }
        else {
            console_1.logger.error("ECO_ENGINE", "Neither trade prices nor order price are available", new Error("Neither trade prices nor order price are available"));
            return [];
        }
        const updateQueries = [];
        if (!this.lastCandle[order.symbol]) {
            this.lastCandle[order.symbol] = {};
        }
        for (const interval of candles_1.intervals) {
            const updateQuery = await this.generateCandleQueries(order, interval, finalPrice);
            if (updateQuery) {
                updateQueries.push(updateQuery);
            }
        }
        return updateQueries;
    }
    async generateCandleQueries(order, interval, finalPrice) {
        var _a;
        let existingLastCandle = (_a = this.lastCandle[order.symbol]) === null || _a === void 0 ? void 0 : _a[interval];
        const normalizedCurrentTime = (0, ws_1.normalizeTimeToInterval)(new Date().getTime(), interval);
        const normalizedLastCandleTime = existingLastCandle
            ? (0, ws_1.normalizeTimeToInterval)(new Date(existingLastCandle.createdAt).getTime(), interval)
            : null;
        const shouldCreateNewCandle = !existingLastCandle || normalizedCurrentTime !== normalizedLastCandleTime;
        if (shouldCreateNewCandle) {
            // If no candle in memory, try to fetch from database for price continuity
            // This ensures new candles after gaps have correct open prices
            let newOpenPrice;
            if (existingLastCandle) {
                // We have a candle in memory, use its close price
                newOpenPrice = existingLastCandle.close;
            }
            else {
                // No candle in memory - fetch the most recent one from database
                const dbCandle = await (0, queries_1.getLatestCandleForSymbol)(order.symbol, interval);
                if (dbCandle) {
                    newOpenPrice = dbCandle.close;
                    // Cache it for future use
                    if (!this.lastCandle[order.symbol]) {
                        this.lastCandle[order.symbol] = {};
                    }
                    this.lastCandle[order.symbol][interval] = dbCandle;
                }
                else {
                    // No previous candle exists at all - use the trade price for the first candle
                    newOpenPrice = (0, blockchain_1.fromBigInt)(finalPrice);
                }
            }
            if (!newOpenPrice && newOpenPrice !== 0) {
                return null;
            }
            const finalPriceNumber = (0, blockchain_1.fromBigInt)(finalPrice);
            const normalizedTime = new Date((0, ws_1.normalizeTimeToInterval)(new Date().getTime(), interval));
            const newLastCandle = {
                symbol: order.symbol,
                interval,
                open: newOpenPrice,
                high: Math.max(newOpenPrice, finalPriceNumber),
                low: Math.min(newOpenPrice, finalPriceNumber),
                close: finalPriceNumber,
                volume: (0, blockchain_1.fromBigInt)(order.amount),
                createdAt: normalizedTime,
                updatedAt: new Date(),
            };
            if (!this.lastCandle[order.symbol]) {
                this.lastCandle[order.symbol] = {};
            }
            this.lastCandle[order.symbol][interval] = newLastCandle;
            return {
                query: `INSERT INTO candles (symbol, interval, "createdAt", "updatedAt", open, high, low, close, volume) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                params: [
                    order.symbol,
                    interval,
                    newLastCandle.createdAt,
                    newLastCandle.updatedAt,
                    newOpenPrice,
                    newLastCandle.high,
                    newLastCandle.low,
                    newLastCandle.close,
                    newLastCandle.volume,
                ],
            };
        }
        else {
            let updateQuery = `UPDATE candles SET "updatedAt" = ?, close = ?`;
            const now = new Date();
            const finalPriceNumber = (0, blockchain_1.fromBigInt)(finalPrice);
            const updateParams = [now, finalPriceNumber];
            const newVolume = existingLastCandle.volume + (0, blockchain_1.fromBigInt)(order.amount);
            updateQuery += ", volume = ?";
            updateParams.push(newVolume);
            if (finalPriceNumber > existingLastCandle.high) {
                updateQuery += ", high = ?";
                updateParams.push(finalPriceNumber);
                existingLastCandle.high = finalPriceNumber;
            }
            else if (finalPriceNumber < existingLastCandle.low) {
                updateQuery += ", low = ?";
                updateParams.push(finalPriceNumber);
                existingLastCandle.low = finalPriceNumber;
            }
            existingLastCandle.close = finalPriceNumber;
            existingLastCandle.volume = newVolume;
            existingLastCandle.updatedAt = now;
            this.lastCandle[order.symbol][interval] = existingLastCandle;
            updateQuery += ` WHERE symbol = ? AND interval = ? AND "createdAt" = ?`;
            updateParams.push(order.symbol, interval, existingLastCandle.createdAt);
            return {
                query: updateQuery,
                params: updateParams,
            };
        }
    }
    async broadcastUpdates(ordersToUpdate, finalOrderBooks) {
        const updatePromises = [];
        updatePromises.push(...this.createOrdersBroadcastPromise(ordersToUpdate));
        // Broadcast updates for all symbols that had trades (in finalOrderBooks)
        // instead of only symbols still in orderQueue (which may be empty after cleanup)
        for (const symbol in finalOrderBooks) {
            updatePromises.push(this.createOrderBookUpdatePromise(symbol, finalOrderBooks[symbol]));
            updatePromises.push(...this.createCandleBroadcastPromises(symbol));
        }
        await Promise.all(updatePromises);
    }
    createOrderBookUpdatePromise(symbol, finalOrderBookState) {
        return (0, ws_1.handleOrderBookBroadcast)(symbol, finalOrderBookState);
    }
    createCandleBroadcastPromises(symbol) {
        const promises = [];
        // Broadcast candles for all intervals that have been updated
        if (this.lastCandle[symbol]) {
            for (const interval in this.lastCandle[symbol]) {
                promises.push((0, ws_1.handleCandleBroadcast)(symbol, interval, this.lastCandle[symbol][interval]));
            }
        }
        promises.push((0, ws_1.handleTickerBroadcast)(symbol, this.getTicker(symbol)), (0, ws_1.handleTickersBroadcast)(this.getTickers()));
        return promises;
    }
    createOrdersBroadcastPromise(orders) {
        return orders.map((order) => (0, ws_1.handleOrderBroadcast)(order));
    }
    lockOrders(orders) {
        for (const order of orders) {
            if (this.lockedOrders.has(order.id)) {
                return false;
            }
        }
        for (const order of orders) {
            this.lockedOrders.add(order.id);
        }
        return true;
    }
    unlockOrders(orders) {
        for (const order of orders) {
            this.lockedOrders.delete(order.id);
        }
    }
    async handleOrderCancellation(orderId, symbol) {
        this.orderQueue[symbol] = this.orderQueue[symbol].filter((order) => order.id !== orderId);
        const updatedOrderBook = await (0, orderbook_1.fetchExistingAmounts)(symbol);
        (0, ws_1.handleOrderBookBroadcast)(symbol, updatedOrderBook);
        await this.processQueue();
    }
    getTickers() {
        const symbolsWithTickers = {};
        for (const symbol in this.lastCandle) {
            const ticker = this.getTicker(symbol);
            if (ticker.last !== 0) {
                symbolsWithTickers[symbol] = ticker;
            }
        }
        return symbolsWithTickers;
    }
    getTicker(symbol) {
        var _a;
        const lastCandle = (_a = this.lastCandle[symbol]) === null || _a === void 0 ? void 0 : _a["1d"];
        const previousCandle = this.yesterdayCandle[symbol];
        if (!lastCandle) {
            return {
                symbol,
                last: 0,
                baseVolume: 0,
                quoteVolume: 0,
                change: 0,
                percentage: 0,
                high: 0,
                low: 0,
            };
        }
        const last = lastCandle.close;
        const baseVolume = lastCandle.volume;
        const quoteVolume = last * baseVolume;
        let change = 0;
        let percentage = 0;
        if (previousCandle) {
            const open = previousCandle.close;
            const close = lastCandle.close;
            change = close - open;
            percentage = ((close - open) / open) * 100;
        }
        return {
            symbol,
            last,
            baseVolume,
            quoteVolume,
            percentage,
            change,
            high: lastCandle.high,
            low: lastCandle.low,
        };
    }
}
exports.MatchingEngine = MatchingEngine;
MatchingEngine.instancePromise = null;
