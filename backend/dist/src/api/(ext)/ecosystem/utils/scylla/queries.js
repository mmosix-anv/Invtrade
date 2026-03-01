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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.query = query;
exports.getOrdersByUserId = getOrdersByUserId;
exports.getOrderByUuid = getOrderByUuid;
exports.cancelOrderByUuid = cancelOrderByUuid;
exports.getOrderbookEntry = getOrderbookEntry;
exports.createOrder = createOrder;
exports.addOrderToMatchingQueue = addOrderToMatchingQueue;
exports.getHistoricalCandles = getHistoricalCandles;
exports.getOrderBook = getOrderBook;
exports.getAllOpenOrders = getAllOpenOrders;
exports.getLastCandles = getLastCandles;
exports.getLatestCandleForSymbol = getLatestCandleForSymbol;
exports.getYesterdayCandles = getYesterdayCandles;
exports.generateOrderUpdateQueries = generateOrderUpdateQueries;
exports.fetchOrderBooks = fetchOrderBooks;
exports.updateOrderBookInDB = updateOrderBookInDB;
exports.deleteAllMarketData = deleteAllMarketData;
exports.getOrders = getOrders;
exports.rollbackOrderCreation = rollbackOrderCreation;
exports.getRecentTrades = getRecentTrades;
exports.insertTrade = insertTrade;
exports.getOHLCV = getOHLCV;
const blockchain_1 = require("../blockchain");
const client_1 = __importDefault(require("./client"));
const cassandra_driver_1 = require("cassandra-driver");
const passwords_1 = require("@b/utils/passwords");
const matchingEngine_1 = require("../matchingEngine");
const wallet_1 = require("../wallet");
const tokens_1 = require("../tokens");
const console_1 = require("@b/utils/console");
const error_1 = require("@b/utils/error");
const scyllaKeyspace = process.env.SCYLLA_KEYSPACE || "trading";
// Cache for token decimals to avoid repeated database queries
const tokenDecimalsCache = new Map();
/**
 * Get the tolerance digits for removeTolerance based on token decimals
 * Formula: toleranceDigits = 18 - decimals
 * This removes insignificant digits beyond the token's precision
 */
function getToleranceDigits(decimals) {
    return 18 - decimals;
}
/**
 * Get token decimals from symbol (e.g., "BTC/USDT" -> BTC decimals)
 * Uses cache to avoid repeated database queries
 * First checks ecosystem market metadata, then falls back to ecosystem tokens
 */
async function getSymbolDecimals(symbol) {
    var _a;
    const [baseCurrency, quoteCurrency] = symbol.split("/");
    // Check cache first
    if (tokenDecimalsCache.has(symbol)) {
        return tokenDecimalsCache.get(symbol);
    }
    try {
        // First, try to get precision from ecosystem market metadata
        // This is the primary source for custom tokens
        const { models } = await Promise.resolve().then(() => __importStar(require("@b/db")));
        const market = await models.ecosystemMarket.findOne({
            where: { currency: baseCurrency, pair: quoteCurrency },
            attributes: ["metadata"],
        });
        if (market) {
            const metadata = market.metadata;
            if (((_a = metadata === null || metadata === void 0 ? void 0 : metadata.precision) === null || _a === void 0 ? void 0 : _a.amount) !== undefined) {
                const decimals = Number(metadata.precision.amount);
                tokenDecimalsCache.set(symbol, decimals);
                return decimals;
            }
        }
        // Fallback: try to get token info from various chains
        const commonChains = ['ETH', 'BSC', 'MATIC', 'BTC', 'SOL'];
        for (const chain of commonChains) {
            try {
                const token = await (0, tokens_1.getEcosystemToken)(chain, baseCurrency);
                if (token && token.decimals !== undefined) {
                    tokenDecimalsCache.set(symbol, token.decimals);
                    return token.decimals;
                }
            }
            catch (e) {
                // Token not found on this chain, continue to next
                continue;
            }
        }
        // If not found anywhere, default to 8 decimals (common for most crypto)
        console_1.logger.warn("SCYLLA", `Could not find decimals for ${symbol}, defaulting to 8`);
        tokenDecimalsCache.set(symbol, 8);
        return 8;
    }
    catch (error) {
        console_1.logger.error("SCYLLA", `Error fetching decimals for ${symbol}`, error);
        // Default to 8 decimals
        return 8;
    }
}
async function query(q, params = []) {
    return client_1.default.execute(q, params, { prepare: true });
}
/**
 * Retrieves orders by user ID with pagination.
 * @param userId - The ID of the user whose orders are to be retrieved.
 * @param pageState - The page state for pagination. Default is null.
 * @param limit - The maximum number of orders to retrieve per page. Default is 10.
 * @returns A Promise that resolves with an array of orders and the next page state.
 */
async function getOrdersByUserId(userId) {
    const query = `
    SELECT * FROM ${scyllaKeyspace}.orders
    WHERE "userId" = ?
    ORDER BY "createdAt" DESC;
  `;
    const params = [userId];
    try {
        const result = await client_1.default.execute(query, params, { prepare: true });
        const orders = result.rows.map(mapRowToOrder);
        return orders;
    }
    catch (error) {
        console_1.logger.error("SCYLLA", `Failed to fetch orders by userId: ${error.message}`, error);
        throw (0, error_1.createError)({ statusCode: 500, message: `Failed to fetch orders by userId: ${error.message}` });
    }
}
function mapRowToOrder(row) {
    return {
        id: row.id,
        userId: row.userId,
        symbol: row.symbol,
        type: row.type,
        side: row.side,
        price: row.price,
        amount: row.amount,
        filled: row.filled,
        remaining: row.remaining,
        timeInForce: row.timeInForce,
        cost: row.cost,
        fee: row.fee,
        feeCurrency: row.feeCurrency,
        average: row.average,
        trades: row.trades,
        status: row.status,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
        // AI Market Maker fields - for pool-based liquidity
        marketMakerId: row.marketMakerId,
        botId: row.botId,
        // Wallet type for copy trading orders
        walletType: row.walletType || "ECO",
    };
}
function getOrderByUuid(userId, id, createdAt) {
    const query = `
    SELECT * FROM ${scyllaKeyspace}.orders
    WHERE "userId" = ? AND id = ? AND "createdAt" = ?;
  `;
    const params = [userId, id, createdAt];
    return client_1.default
        .execute(query, params, { prepare: true })
        .then((result) => result.rows[0])
        .then(mapRowToOrder);
}
async function cancelOrderByUuid(userId, id, createdAt, symbol, price, side, amount) {
    // IMPORTANT: First verify the order exists with this exact userId/createdAt/id combination
    // This prevents ScyllaDB from creating a new row with null fields when UPDATE is called
    // with a non-existent primary key (ScyllaDB's upsert behavior)
    const checkQuery = `
    SELECT id, symbol, status FROM ${scyllaKeyspace}.orders
    WHERE "userId" = ? AND "createdAt" = ? AND id = ?;
  `;
    const checkParams = [userId, new Date(createdAt), id];
    try {
        const checkResult = await client_1.default.execute(checkQuery, checkParams, { prepare: true });
        if (checkResult.rows.length === 0) {
            // Order doesn't exist with this userId - don't create a ghost record
            // This is expected for AI market maker orders that get filled before expiration cleanup
            // Use debug level to reduce log noise
            console_1.logger.debug("SCYLLA", `Order ${id} not found for user ${userId} at ${createdAt} - skipping cancellation (likely already filled)`);
            return;
        }
        // Verify the order is not already cancelled
        const existingOrder = checkResult.rows[0];
        if (existingOrder.status === "CANCELED" || existingOrder.status === "CLOSED") {
            console_1.logger.debug("SCYLLA", `Order ${id} is already ${existingOrder.status} - skipping`);
            return;
        }
    }
    catch (checkError) {
        console_1.logger.error("SCYLLA", `Failed to check order existence: ${checkError.message}`, checkError);
        throw checkError;
    }
    const priceFormatted = (0, blockchain_1.fromBigInt)(price);
    const orderbookSide = side === "BUY" ? "BIDS" : "ASKS";
    const orderbookAmount = await getOrderbookEntry(symbol, priceFormatted, orderbookSide);
    let orderbookQuery = "";
    let orderbookParams = [];
    if (orderbookAmount) {
        const newAmount = orderbookAmount - amount;
        if (newAmount <= BigInt(0)) {
            // Remove the order from the orderbook entirely
            orderbookQuery = `DELETE FROM ${scyllaKeyspace}.orderbook WHERE symbol = ? AND price = ? AND side = ?`;
            orderbookParams = [symbol, priceFormatted.toString(), orderbookSide];
        }
        else {
            // Update the orderbook with the reduced amount
            orderbookQuery = `UPDATE ${scyllaKeyspace}.orderbook SET amount = ? WHERE symbol = ? AND price = ? AND side = ?`;
            orderbookParams = [
                (0, blockchain_1.fromBigInt)(newAmount).toString(),
                symbol,
                priceFormatted.toString(),
                orderbookSide,
            ];
        }
    }
    else {
        // This is expected when canceling AI market maker orders - the orderbook gets rebuilt regularly
        // Only log in development to reduce noise
        if (process.env.NODE_ENV === "development") {
            console_1.logger.debug("SCYLLA", `No orderbook entry found for symbol: ${symbol}, price: ${priceFormatted}, side: ${orderbookSide}`);
        }
    }
    // Instead of deleting the order, update its status
    // Keep the remaining amount to preserve partial fill information
    const currentTimestamp = new Date();
    const updateOrderQuery = `
    UPDATE ${scyllaKeyspace}.orders
    SET status = 'CANCELED', "updatedAt" = ?
    WHERE "userId" = ? AND id = ? AND "createdAt" = ?;
  `;
    const updateOrderParams = [currentTimestamp, userId, id, new Date(createdAt)];
    const batchQueries = orderbookQuery
        ? [
            { query: orderbookQuery, params: orderbookParams },
            { query: updateOrderQuery, params: updateOrderParams },
        ]
        : [{ query: updateOrderQuery, params: updateOrderParams }];
    try {
        await client_1.default.batch(batchQueries, { prepare: true });
    }
    catch (error) {
        console_1.logger.error("SCYLLA", `Failed to cancel order and update orderbook: ${error.message}`, error);
        throw (0, error_1.createError)({ statusCode: 500, message: `Failed to cancel order and update orderbook: ${error.message}` });
    }
}
async function getOrderbookEntry(symbol, price, side) {
    const query = `
    SELECT * FROM ${scyllaKeyspace}.orderbook
    WHERE symbol = ? AND price = ? AND side = ?;
  `;
    const params = [symbol, price, side];
    try {
        const result = await client_1.default.execute(query, params, { prepare: true });
        if (result.rows.length > 0) {
            const row = result.rows[0];
            return (0, blockchain_1.toBigIntFloat)(row["amount"]);
        }
        else {
            // Orderbook entry may not exist for AI market maker orders - this is expected
            // The AI rebuilds the orderbook periodically, so entries come and go
            return null;
        }
    }
    catch (error) {
        console_1.logger.error("SCYLLA", `Failed to fetch orderbook entry: ${error.message}`, error);
        throw (0, error_1.createError)({ statusCode: 500, message: `Failed to fetch orderbook entry: ${error.message}` });
    }
}
/**
 * Creates a new order in the orders table.
 * @param order - The order object to be inserted into the table.
 * @returns A Promise that resolves when the order has been successfully inserted.
 */
async function createOrder({ userId, symbol, amount, price, cost, type, side, fee, feeCurrency, marketMakerId, botId, walletType = "ECO", }) {
    // CRITICAL VALIDATION: Prevent creating orders with null/undefined required fields
    // This prevents ScyllaDB from accepting incomplete data that creates corrupted records
    if (!userId || typeof userId !== 'string') {
        throw (0, error_1.createError)({ statusCode: 400, message: 'Cannot create order: userId is required and must be a valid string' });
    }
    if (!symbol || typeof symbol !== 'string') {
        throw (0, error_1.createError)({ statusCode: 400, message: 'Cannot create order: symbol is required and must be a valid string' });
    }
    if (!type || typeof type !== 'string') {
        throw (0, error_1.createError)({ statusCode: 400, message: 'Cannot create order: type is required and must be a valid string' });
    }
    if (!side || typeof side !== 'string') {
        throw (0, error_1.createError)({ statusCode: 400, message: 'Cannot create order: side is required and must be a valid string' });
    }
    if (!feeCurrency || typeof feeCurrency !== 'string') {
        throw (0, error_1.createError)({ statusCode: 400, message: 'Cannot create order: feeCurrency is required and must be a valid string' });
    }
    if (typeof price !== 'bigint') {
        throw (0, error_1.createError)({ statusCode: 400, message: 'Cannot create order: price is required and must be a bigint' });
    }
    if (typeof amount !== 'bigint') {
        throw (0, error_1.createError)({ statusCode: 400, message: 'Cannot create order: amount is required and must be a bigint' });
    }
    if (typeof cost !== 'bigint') {
        throw (0, error_1.createError)({ statusCode: 400, message: 'Cannot create order: cost is required and must be a bigint' });
    }
    if (typeof fee !== 'bigint') {
        throw (0, error_1.createError)({ statusCode: 400, message: 'Cannot create order: fee is required and must be a bigint' });
    }
    const currentTimestamp = new Date();
    const query = `
    INSERT INTO ${scyllaKeyspace}.orders (id, "userId", symbol, type, "timeInForce", side, price, amount, filled, remaining, cost, fee, "feeCurrency", status, "createdAt", "updatedAt", "marketMakerId", "botId", "walletType")
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
  `;
    const priceTolerance = (0, blockchain_1.removeTolerance)(price);
    const amountTolerance = (0, blockchain_1.removeTolerance)(amount);
    const costTolerance = (0, blockchain_1.removeTolerance)(cost);
    const feeTolerance = (0, blockchain_1.removeTolerance)(fee);
    const id = (0, passwords_1.makeUuid)();
    const params = [
        id,
        userId,
        symbol,
        type,
        "GTC",
        side,
        priceTolerance.toString(),
        amountTolerance.toString(),
        "0",
        amountTolerance.toString(),
        costTolerance.toString(),
        feeTolerance.toString(),
        feeCurrency,
        "OPEN",
        currentTimestamp,
        currentTimestamp,
        marketMakerId || null,
        botId || null,
        walletType,
    ];
    try {
        await client_1.default.execute(query, params, {
            prepare: true,
        });
        const newOrder = {
            id,
            userId,
            symbol,
            type,
            timeInForce: "GTC",
            side,
            price: priceTolerance,
            amount: amountTolerance,
            filled: BigInt(0),
            remaining: amountTolerance,
            cost: costTolerance,
            fee: feeTolerance,
            feeCurrency,
            average: BigInt(0),
            trades: "",
            status: "OPEN",
            createdAt: currentTimestamp,
            updatedAt: currentTimestamp,
            // AI Market Maker metadata - passed through for matching engine
            marketMakerId,
            botId,
            // Wallet type - determines which wallet to use for matching
            walletType,
        };
        // NOTE: Do NOT add to matching queue here!
        // The caller must ensure wallet balance is locked BEFORE adding to queue.
        // This prevents race conditions where matching starts before funds are locked.
        // Caller should use: addOrderToMatchingQueue(newOrder) after wallet update.
        return newOrder;
    }
    catch (error) {
        console_1.logger.error("SCYLLA", `Failed to create order: ${error.message}`, error);
        throw (0, error_1.createError)({ statusCode: 500, message: `Failed to create order: ${error.message}` });
    }
}
/**
 * Add an order to the matching engine queue.
 * IMPORTANT: Only call this AFTER the wallet balance has been locked!
 * This prevents race conditions where matching starts before funds are secured.
 */
async function addOrderToMatchingQueue(order) {
    const matchingEngine = await matchingEngine_1.MatchingEngine.getInstance();
    matchingEngine.addToQueue(order);
}
async function getHistoricalCandles(symbol, interval, from, to) {
    try {
        const query = `
      SELECT * FROM ${scyllaKeyspace}.candles
      WHERE symbol = ?
      AND interval = ?
      AND "createdAt" >= ?
      AND "createdAt" <= ?
      ORDER BY "createdAt" ASC;
    `;
        const params = [symbol, interval, new Date(from), new Date(to)];
        // Execute the query using your existing ScyllaDB client
        const result = await client_1.default.execute(query, params, { prepare: true });
        // Map the rows to Candle objects
        let candles = result.rows.map((row) => [
            row.createdAt.getTime(),
            row.open,
            row.high,
            row.low,
            row.close,
            row.volume,
        ]);
        // Import gap-filling utilities
        const { fillCandleGaps, intervalDurations, normalizeToIntervalBoundary, } = await Promise.resolve().then(() => __importStar(require("../candles")));
        const intervalDuration = intervalDurations[interval] || 60000;
        // If no candles found in requested range, look for older history
        if (candles.length === 0) {
            // Look for most recent candle before the requested range
            const lookbackQuery = `
        SELECT * FROM ${scyllaKeyspace}.candles
        WHERE symbol = ?
        AND interval = ?
        AND "createdAt" < ?
        ORDER BY "createdAt" DESC
        LIMIT 1;
      `;
            const lookbackParams = [symbol, interval, new Date(from)];
            const lookbackResult = await client_1.default.execute(lookbackQuery, lookbackParams, {
                prepare: true,
            });
            if (lookbackResult.rows.length > 0) {
                // Found an older candle - use it as base for gap filling
                const lastKnownCandle = lookbackResult.rows[0];
                const lastKnownTime = lastKnownCandle.createdAt.getTime();
                const lastKnownClose = lastKnownCandle.close;
                // Normalize the last known candle time to interval boundary
                const normalizedLastKnown = normalizeToIntervalBoundary(lastKnownTime, interval);
                // Create flat candles from last known candle to requested range
                const filledCandles = [];
                let fillTime = normalizedLastKnown + intervalDuration;
                const maxGapsToFill = 500;
                let gapsFilled = 0;
                while (fillTime <= to && gapsFilled < maxGapsToFill) {
                    filledCandles.push([
                        fillTime,
                        lastKnownClose,
                        lastKnownClose,
                        lastKnownClose,
                        lastKnownClose,
                        0,
                    ]);
                    fillTime += intervalDuration;
                    gapsFilled++;
                }
                return filledCandles;
            }
            // No history found at all - this is a new market, return empty
            return [];
        }
        // Fill gaps in existing candles
        candles = fillCandleGaps(candles, interval, from, to, 500);
        return candles;
    }
    catch (error) {
        throw (0, error_1.createError)({ statusCode: 500, message: `Failed to fetch historical candles: ${error.message}` });
    }
}
async function getOrderBook(symbol) {
    const askQuery = `
    SELECT * FROM ${scyllaKeyspace}.orderbook
    WHERE symbol = ? AND side = 'ASKS'
    LIMIT 50;
  `;
    const bidQuery = `
    SELECT * FROM ${scyllaKeyspace}.orderbook
    WHERE symbol = ? AND side = 'BIDS'
    ORDER BY price DESC
    LIMIT 50;
  `;
    const [askRows, bidRows] = await Promise.all([
        client_1.default.execute(askQuery, [symbol], { prepare: true }),
        client_1.default.execute(bidQuery, [symbol], { prepare: true }),
    ]);
    const asks = askRows.rows.map((row) => [row.price, row.amount]);
    const bids = bidRows.rows.map((row) => [row.price, row.amount]);
    return { asks, bids };
}
/**
 * Retrieves all orders with status 'OPEN'.
 *
 * NOTE: We query from the base orders table instead of open_orders materialized view
 * because the view may not include marketMakerId and botId columns if it was created
 * before those columns were added via migrations. This is a Scylla/Cassandra limitation -
 * materialized views don't auto-update when base table schema changes.
 *
 * @returns A Promise that resolves with an array of open orders.
 */
async function getAllOpenOrders() {
    // The orderbook table has a composite partition key (symbol, side), so we need to
    // include both columns in SELECT DISTINCT to comply with Scylla/Cassandra requirements.
    // We query both BIDS and ASKS sides and extract unique symbols.
    const symbolsQuery = `
    SELECT DISTINCT symbol, side FROM ${scyllaKeyspace}.orderbook;
  `;
    try {
        const symbolsResult = await client_1.default.execute(symbolsQuery, [], { prepare: true });
        // Extract unique symbols from the results (since we get symbol,side pairs)
        const uniqueSymbols = new Set();
        symbolsResult.rows.forEach(row => {
            if (row.symbol) {
                uniqueSymbols.add(row.symbol);
            }
        });
        const symbols = Array.from(uniqueSymbols);
        if (symbols.length === 0) {
            return [];
        }
        // Query orders table directly for each symbol to get all columns including marketMakerId, botId
        const allOrders = [];
        for (const symbol of symbols) {
            const query = `
        SELECT * FROM ${scyllaKeyspace}.orders
        WHERE status = 'OPEN' AND symbol = ?
        ALLOW FILTERING;
      `;
            try {
                const result = await client_1.default.execute(query, [symbol], { prepare: true });
                allOrders.push(...result.rows);
            }
            catch (err) {
                // Skip errors for individual symbols
                console_1.logger.warn("SCYLLA", `Failed to fetch open orders for symbol ${symbol}: ${err.message}`);
            }
        }
        return allOrders;
    }
    catch (error) {
        console_1.logger.error("SCYLLA", `Failed to fetch all open orders: ${error.message}`, error);
        throw (0, error_1.createError)({ statusCode: 500, message: `Failed to fetch all open orders: ${error.message}` });
    }
}
/**
 * Fetches the latest candle for each interval.
 * @param symbol - The trading pair symbol for which to fetch the candles.
 * @returns A Promise that resolves with a record containing the latest candle for each interval.
 */
/**
 * Fetches the latest candle for each interval.
 * @returns A Promise that resolves with an array of the latest candles.
 */
async function getLastCandles() {
    try {
        // Fetch the latest candle for each symbol and interval
        // The latest_candles materialized view is partitioned by (symbol, interval)
        // and ordered by createdAt DESC, so we need to get the first row per partition
        const query = `
      SELECT symbol, interval, open, high, low, close, volume, "createdAt", "updatedAt"
      FROM ${scyllaKeyspace}.latest_candles;
    `;
        const result = await client_1.default.execute(query, [], { prepare: true });
        // Group candles by symbol+interval and keep only the newest (highest createdAt)
        const latestByKey = {};
        result.rows.forEach((row) => {
            const key = `${row.symbol}:${row.interval}`;
            const candle = {
                symbol: row.symbol,
                interval: row.interval,
                open: row.open,
                high: row.high,
                low: row.low,
                close: row.close,
                volume: row.volume,
                createdAt: new Date(row.createdAt),
                updatedAt: new Date(row.updatedAt),
            };
            // Keep the newest candle for each symbol+interval
            if (!latestByKey[key] || candle.createdAt > latestByKey[key].createdAt) {
                latestByKey[key] = candle;
            }
        });
        return Object.values(latestByKey);
    }
    catch (error) {
        console_1.logger.error("SCYLLA", `Failed to fetch latest candles: ${error.message}`, error);
        throw (0, error_1.createError)({ statusCode: 500, message: `Failed to fetch latest candles: ${error.message}` });
    }
}
/**
 * Get the most recent candle for a specific symbol and interval from the database.
 * Used when creating a new candle to ensure proper open price continuity.
 */
async function getLatestCandleForSymbol(symbol, interval) {
    try {
        const query = `
      SELECT symbol, interval, open, high, low, close, volume, "createdAt", "updatedAt"
      FROM ${scyllaKeyspace}.latest_candles
      WHERE symbol = ? AND interval = ?
      LIMIT 1;
    `;
        const result = await client_1.default.execute(query, [symbol, interval], { prepare: true });
        if (result.rows.length === 0) {
            return null;
        }
        const row = result.rows[0];
        return {
            symbol: row.symbol,
            interval: row.interval,
            open: row.open,
            high: row.high,
            low: row.low,
            close: row.close,
            volume: row.volume,
            createdAt: new Date(row.createdAt),
            updatedAt: new Date(row.updatedAt),
        };
    }
    catch (error) {
        console_1.logger.error("SCYLLA", `Failed to fetch latest candle for ${symbol}/${interval}: ${error.message}`, error);
        return null;
    }
}
async function getYesterdayCandles() {
    try {
        // Calculate the date range for "yesterday"
        const endOfYesterday = new Date();
        endOfYesterday.setHours(0, 0, 0, 0);
        const startOfYesterday = new Date(endOfYesterday.getTime() - 24 * 60 * 60 * 1000);
        // Query to get candles for yesterday
        const query = `
      SELECT * FROM ${scyllaKeyspace}.latest_candles
      WHERE "createdAt" >= ? AND "createdAt" < ?;
    `;
        const result = await client_1.default.execute(query, [startOfYesterday.toISOString(), endOfYesterday.toISOString()], { prepare: true });
        const yesterdayCandles = {};
        for (const row of result.rows) {
            // Only consider candles with a '1d' interval
            if (row.interval !== "1d") {
                continue;
            }
            const candle = {
                symbol: row.symbol,
                interval: row.interval,
                open: row.open,
                high: row.high,
                low: row.low,
                close: row.close,
                volume: row.volume,
                createdAt: new Date(row.createdAt),
                updatedAt: new Date(row.updatedAt),
            };
            if (!yesterdayCandles[row.symbol]) {
                yesterdayCandles[row.symbol] = [];
            }
            yesterdayCandles[row.symbol].push(candle);
        }
        return yesterdayCandles;
    }
    catch (error) {
        console_1.logger.error("SCYLLA", `Failed to fetch yesterday's candles: ${error.message}`, error);
        throw (0, error_1.createError)({ statusCode: 500, message: `Failed to fetch yesterday's candles: ${error.message}` });
    }
}
async function generateOrderUpdateQueries(ordersToUpdate) {
    // Get unique symbols and fetch their decimals
    const symbols = [...new Set(ordersToUpdate.map(order => order.symbol))];
    const decimalsMap = new Map();
    // Fetch decimals for all unique symbols in parallel
    await Promise.all(symbols.map(async (symbol) => {
        const decimals = await getSymbolDecimals(symbol);
        decimalsMap.set(symbol, decimals);
    }));
    const queries = ordersToUpdate.map((order) => {
        const decimals = decimalsMap.get(order.symbol) || 8;
        const toleranceDigits = getToleranceDigits(decimals);
        return {
            query: `
        UPDATE ${scyllaKeyspace}.orders
        SET filled = ?, remaining = ?, status = ?, "updatedAt" = ?, trades = ?
        WHERE "userId" = ? AND "createdAt" = ? AND id = ?;
      `,
            params: [
                // Use removeTolerance with dynamic tolerance based on token decimals
                // Formula: toleranceDigits = 18 - decimals
                // This removes insignificant trailing digits beyond the token's precision
                // while preserving small values (e.g., 0.00000001 for 8-decimal tokens)
                (0, blockchain_1.removeTolerance)(order.filled, toleranceDigits).toString(),
                (0, blockchain_1.removeTolerance)(order.remaining, toleranceDigits).toString(),
                order.status,
                new Date(),
                JSON.stringify(order.trades),
                order.userId,
                order.createdAt,
                order.id,
            ],
        };
    });
    return queries;
}
async function fetchOrderBooks() {
    const query = `
    SELECT * FROM ${scyllaKeyspace}.orderbook;
  `;
    try {
        const result = await client_1.default.execute(query);
        return result.rows.map((row) => ({
            symbol: row.symbol,
            price: row.price,
            amount: row.amount,
            side: row.side,
        }));
    }
    catch (error) {
        console_1.logger.error("SCYLLA", `Failed to fetch order books: ${error.message}`, error);
        return null;
    }
}
async function updateOrderBookInDB(symbol, price, amount, side) {
    let query;
    let params;
    if (amount > 0) {
        query = `
      INSERT INTO ${scyllaKeyspace}.orderbook (symbol, price, amount, side)
      VALUES (?, ?, ?, ?);
    `;
        params = [symbol, price, amount, side.toUpperCase()];
    }
    else {
        query = `
      DELETE FROM ${scyllaKeyspace}.orderbook
      WHERE symbol = ? AND price = ? AND side = ?;
    `;
        params = [symbol, price, side.toUpperCase()];
    }
    try {
        await client_1.default.execute(query, params, { prepare: true });
    }
    catch (error) {
        console_1.logger.error("SCYLLA", `Failed to update order book: ${error.message}`, error);
    }
}
async function deleteAllMarketData(symbol) {
    // Step 1: Fetch the primary keys from the materialized view for orders
    const ordersResult = await client_1.default.execute(`
      SELECT "userId", "createdAt", id
      FROM ${scyllaKeyspace}.orders_by_symbol
      WHERE symbol = ?
      ALLOW FILTERING;
    `, [symbol], { prepare: true });
    for (const row of ordersResult.rows) {
        await cancelAndRefundOrder(row.userId, row.id, row.createdAt);
    }
    const deleteOrdersQueries = ordersResult.rows.map((row) => ({
        query: `
      DELETE FROM ${scyllaKeyspace}.orders
      WHERE "userId" = ? AND "createdAt" = ? AND id = ?;
    `,
        params: [row.userId, row.createdAt, row.id],
    }));
    // Step 2: Fetch the primary keys for candles
    const candlesResult = await client_1.default.execute(`
      SELECT interval, "createdAt"
      FROM ${scyllaKeyspace}.candles
      WHERE symbol = ?;
    `, [symbol], { prepare: true });
    const deleteCandlesQueries = candlesResult.rows.map((row) => ({
        query: `
      DELETE FROM ${scyllaKeyspace}.candles
      WHERE symbol = ? AND interval = ? AND "createdAt" = ?;
    `,
        params: [symbol, row.interval, row.createdAt],
    }));
    // Step 3: Fetch the primary keys for orderbook
    const sides = ["ASKS", "BIDS"];
    const deleteOrderbookQueries = [];
    for (const side of sides) {
        const orderbookResult = await client_1.default.execute(`
        SELECT price
        FROM ${scyllaKeyspace}.orderbook
        WHERE symbol = ? AND side = ?;
      `, [symbol, side], { prepare: true });
        const queries = orderbookResult.rows.map((row) => ({
            query: `
        DELETE FROM ${scyllaKeyspace}.orderbook
        WHERE symbol = ? AND side = ? AND price = ?;
      `,
            params: [symbol, side, row.price],
        }));
        deleteOrderbookQueries.push(...queries);
    }
    // Step 4: Combine all queries in a batch
    const batchQueries = [
        ...deleteOrdersQueries,
        ...deleteCandlesQueries,
        ...deleteOrderbookQueries,
    ];
    if (batchQueries.length === 0) {
        return;
    }
    // Step 5: Execute the batch queries
    try {
        await client_1.default.batch(batchQueries, { prepare: true });
    }
    catch (err) {
        console_1.logger.error("SCYLLA", `Failed to delete all market data: ${err.message}`, err);
    }
}
async function cancelAndRefundOrder(userId, id, createdAt) {
    const order = await getOrderByUuid(userId, id, createdAt);
    if (!order) {
        console_1.logger.warn("SCYLLA", `Order not found for UUID: ${id}`);
        return;
    }
    // Skip if order is not open or fully filled
    if (order.status !== "OPEN" || BigInt(order.remaining) === BigInt(0)) {
        return;
    }
    // Calculate refund amount based on remaining amount for partially filled orders
    const refundAmount = order.side === "BUY"
        ? (0, blockchain_1.fromBigIntMultiply)(BigInt(order.remaining) + BigInt(order.fee), BigInt(order.price))
        : (0, blockchain_1.fromBigInt)(BigInt(order.remaining) + BigInt(order.fee));
    const walletCurrency = order.side === "BUY"
        ? order.symbol.split("/")[1]
        : order.symbol.split("/")[0];
    const wallet = await (0, wallet_1.getWalletByUserIdAndCurrency)(userId, walletCurrency);
    if (!wallet) {
        console_1.logger.warn("SCYLLA", `${walletCurrency} wallet not found for user ID: ${userId}`);
        return;
    }
    // Use order ID for stable idempotency key
    const idempotencyKey = `eco_order_refund_${id}_${wallet.id}`;
    await (0, wallet_1.updateWalletBalance)(wallet, refundAmount, "add", idempotencyKey);
}
/**
 * Retrieves orders by user ID and symbol based on their status (open or non-open).
 * @param userId - The ID of the user whose orders are to be retrieved.
 * @param symbol - The symbol of the orders to be retrieved.
 * @param isOpen - A boolean indicating whether to fetch open orders (true) or non-open orders (false).
 * @returns A Promise that resolves with an array of orders.
 */
/**
 * Retrieves orders by user ID and symbol based on their status (open or non-open).
 * @param userId - The ID of the user whose orders are to be retrieved.
 * @param symbol - The symbol of the orders to be retrieved.
 * @param isOpen - A boolean indicating whether to fetch open orders (true) or non-open orders (false).
 * @returns A Promise that resolves with an array of orders.
 */
async function getOrders(userId, symbol, isOpen) {
    const query = `
    SELECT * FROM ${scyllaKeyspace}.orders_by_symbol
    WHERE symbol = ? AND "userId" = ?
    ORDER BY "createdAt" DESC;
  `;
    const params = [symbol, userId];
    try {
        const result = await client_1.default.execute(query, params, { prepare: true });
        return result.rows
            .map(mapRowToOrder)
            .filter((order) => isOpen ? order.status === "OPEN" : order.status !== "OPEN")
            .map((order) => ({
            ...order,
            amount: (0, blockchain_1.fromBigInt)(order.amount),
            price: (0, blockchain_1.fromBigInt)(order.price),
            cost: (0, blockchain_1.fromBigInt)(order.cost),
            fee: (0, blockchain_1.fromBigInt)(order.fee),
            filled: (0, blockchain_1.fromBigInt)(order.filled),
            remaining: (0, blockchain_1.fromBigInt)(order.remaining),
        }));
    }
    catch (error) {
        console_1.logger.error("SCYLLA", `Failed to fetch orders by userId and symbol: ${error.message}`, error);
        throw (0, error_1.createError)({ statusCode: 500, message: `Failed to fetch orders by userId and symbol: ${error.message}` });
    }
}
// Helper: Rollback order creation if wallet update fails after creation.
async function rollbackOrderCreation(orderId, userId, createdAt) {
    const query = `
    DELETE FROM ${scyllaKeyspace}.orders
    WHERE "userId" = ? AND "createdAt" = ? AND id = ?;
  `;
    const params = [userId, createdAt, orderId];
    await client_1.default.execute(query, params, { prepare: true });
}
/**
 * Retrieves recent trades for a given symbol by extracting them from filled/closed orders
 * @param symbol - The trading pair symbol (e.g., "BTC/USDT")
 * @param limit - Maximum number of trades to return (default: 50)
 * @returns A Promise that resolves with an array of trade objects
 */
async function getRecentTrades(symbol, limit = 50) {
    var _a, _b, _c, _d;
    try {
        // Query orders that have trades (filled or closed orders)
        // Note: orders_by_symbol has partition key (symbol, userId), so we need ALLOW FILTERING
        // to query by symbol alone. This is acceptable for trade history queries with LIMIT.
        const query = `
      SELECT id, "userId", symbol, side, price, filled, trades, "updatedAt"
      FROM ${scyllaKeyspace}.orders_by_symbol
      WHERE symbol = ?
      LIMIT ?
      ALLOW FILTERING;
    `;
        const params = [symbol, limit * 2]; // Fetch more to ensure we get enough trades
        const result = await client_1.default.execute(query, params, { prepare: true });
        // Extract and parse trades from orders
        const allTrades = [];
        for (const row of result.rows) {
            if (!row.trades || row.trades === '' || row.trades === '[]') {
                continue;
            }
            try {
                let trades;
                if (typeof row.trades === 'string') {
                    trades = JSON.parse(row.trades);
                    // Handle double-encoded JSON
                    if (!Array.isArray(trades) && typeof trades === 'string') {
                        trades = JSON.parse(trades);
                    }
                }
                else if (Array.isArray(row.trades)) {
                    trades = row.trades;
                }
                else {
                    continue;
                }
                if (!Array.isArray(trades) || trades.length === 0) {
                    continue;
                }
                // Add trades with proper formatting
                for (const trade of trades) {
                    allTrades.push({
                        id: trade.id || `${row.id}_${trade.timestamp}`,
                        price: typeof trade.price === 'bigint' ? (0, blockchain_1.fromBigInt)(trade.price) : trade.price,
                        amount: typeof trade.amount === 'bigint' ? (0, blockchain_1.fromBigInt)(trade.amount) : trade.amount,
                        side: row.side.toLowerCase(), // 'buy' or 'sell'
                        timestamp: trade.timestamp || row.updatedAt.getTime(),
                    });
                }
            }
            catch (parseError) {
                console_1.logger.error("SCYLLA", `Failed to parse trades for order ${row.id}`, parseError);
                continue;
            }
        }
        // Sort by timestamp descending (most recent first) and limit
        const sortedTrades = allTrades
            .sort((a, b) => b.timestamp - a.timestamp)
            .slice(0, limit);
        // Also fetch from dedicated trades table (includes AI trades)
        try {
            const tradesQuery = `
        SELECT id, price, amount, side, "createdAt", "isAiTrade"
        FROM ${scyllaKeyspace}.trades
        WHERE symbol = ?
        LIMIT ?
      `;
            const tradesResult = await client_1.default.execute(tradesQuery, [symbol, limit], { prepare: true });
            for (const row of tradesResult.rows) {
                sortedTrades.push({
                    id: ((_a = row.id) === null || _a === void 0 ? void 0 : _a.toString()) || `trade_${(_b = row.createdAt) === null || _b === void 0 ? void 0 : _b.getTime()}`,
                    price: row.price,
                    amount: row.amount,
                    side: ((_c = row.side) === null || _c === void 0 ? void 0 : _c.toLowerCase()) || 'buy',
                    timestamp: ((_d = row.createdAt) === null || _d === void 0 ? void 0 : _d.getTime()) || Date.now(),
                    isAiTrade: row.isAiTrade || false,
                });
            }
            // Re-sort after adding trades from dedicated table
            sortedTrades.sort((a, b) => b.timestamp - a.timestamp);
        }
        catch (tradesTableError) {
            // Trades table might not exist yet, ignore error
            console_1.logger.debug("SCYLLA", `Trades table query failed (may not exist yet): ${tradesTableError.message}`);
        }
        return sortedTrades.slice(0, limit);
    }
    catch (error) {
        console_1.logger.error("SCYLLA", `Failed to fetch recent trades for ${symbol}: ${error.message}`, error);
        throw (0, error_1.createError)({ statusCode: 500, message: `Failed to fetch recent trades: ${error.message}` });
    }
}
/**
 * Insert a trade record into the trades table
 * Used for both AI trades and real trades to display in recent trades
 *
 * @param symbol - Trading pair symbol
 * @param price - Trade price
 * @param amount - Trade amount
 * @param side - Trade side ('BUY' or 'SELL')
 * @param isAiTrade - Whether this is an AI trade
 */
async function insertTrade(symbol, price, amount, side, isAiTrade = false) {
    try {
        const query = `
      INSERT INTO ${scyllaKeyspace}.trades (symbol, "createdAt", id, price, amount, side, "isAiTrade")
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `;
        const tradeId = cassandra_driver_1.types.Uuid.random();
        const now = new Date();
        await client_1.default.execute(query, [symbol, now, tradeId, price, amount, side.toUpperCase(), isAiTrade], { prepare: true });
    }
    catch (error) {
        console_1.logger.error("SCYLLA", `Failed to insert trade for ${symbol}: ${error.message}`, error);
        // Don't throw - trade recording is not critical
    }
}
/**
 * Retrieves OHLCV (Open, High, Low, Close, Volume) data for a given symbol and interval
 * @param symbol - The trading pair symbol (e.g., "BTC/USDT")
 * @param interval - The candle interval (e.g., "1m", "5m", "1h", "1d")
 * @param limit - Maximum number of candles to return (default: 100)
 * @returns A Promise that resolves with an array of OHLCV arrays [timestamp, open, high, low, close, volume]
 */
async function getOHLCV(symbol, interval, limit = 100) {
    try {
        const query = `
      SELECT open, high, low, close, volume, "createdAt"
      FROM ${scyllaKeyspace}.candles
      WHERE symbol = ? AND interval = ?
      ORDER BY "createdAt" DESC
      LIMIT ?;
    `;
        const params = [symbol, interval, limit];
        const result = await client_1.default.execute(query, params, { prepare: true });
        // Map to OHLCV format and reverse to get chronological order
        const ohlcv = result.rows
            .map((row) => [
            row.createdAt.getTime(), // timestamp
            row.open, // open
            row.high, // high
            row.low, // low
            row.close, // close
            row.volume, // volume
        ])
            .reverse(); // Reverse to get oldest to newest
        return ohlcv;
    }
    catch (error) {
        console_1.logger.error("SCYLLA", `Failed to fetch OHLCV for ${symbol} ${interval}: ${error.message}`, error);
        throw (0, error_1.createError)({ statusCode: 500, message: `Failed to fetch OHLCV: ${error.message}` });
    }
}
