"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.metadata = void 0;
exports.getHistoricalOHLCV = getHistoricalOHLCV;
const exchange_1 = __importDefault(require("@b/utils/exchange"));
const query_1 = require("@b/utils/query");
const utils_1 = require("./utils");
const utils_2 = require("../utils");
const console_1 = require("@b/utils/console");
const error_1 = require("@b/utils/error");
exports.metadata = {
    summary: "Get Historical Chart Data",
    operationId: "getHistoricalChartData",
    tags: ["Chart", "Historical"],
    description: "Retrieves historical chart data for the authenticated user.",
    logModule: "EXCHANGE",
    logTitle: "Get Chart Data",
    parameters: [
        {
            name: "symbol",
            in: "query",
            description: "Symbol to retrieve data for.",
            required: true,
            schema: { type: "string" },
        },
        {
            name: "interval",
            in: "query",
            description: "Interval to retrieve data for.",
            required: true,
            schema: { type: "string" },
        },
        {
            name: "from",
            in: "query",
            description: "Start timestamp to retrieve data from.",
            required: true,
            schema: { type: "number" },
        },
        {
            name: "to",
            in: "query",
            description: "End timestamp to retrieve data from.",
            required: true,
            schema: { type: "number" },
        },
        {
            name: "duration",
            in: "query",
            description: "Duration to retrieve data for.",
            required: true,
            schema: { type: "number" },
        },
    ],
    responses: {
        200: {
            description: "Historical chart data retrieved successfully",
            content: {
                "application/json": {
                    schema: {
                        type: "array",
                        items: {
                            type: "object",
                            properties: utils_1.baseChartDataPointSchema,
                        },
                    },
                },
            },
        },
        401: query_1.unauthorizedResponse,
        404: (0, query_1.notFoundMetadataResponse)("Chart"),
        500: query_1.serverErrorResponse,
    },
};
// Request deduplication cache
const activeRequests = new Map();
exports.default = async (data) => {
    const { query, ctx } = data;
    // Validate required parameters
    if (!query.symbol || !query.interval || !query.from || !query.to || !query.duration) {
        throw (0, error_1.createError)({ statusCode: 400, message: 'Missing required parameters: symbol, interval, from, to, duration' });
    }
    // Validate and normalize timestamps
    const rawFrom = Number(query.from);
    const rawTo = Number(query.to);
    const { from, to, isValid } = (0, utils_1.validateAndNormalizeTimestamps)(rawFrom, rawTo);
    if (!isValid) {
        console_1.logger.warn("CHART", `Invalid timestamps received for ${query.symbol}: from=${rawFrom}, to=${rawTo}. Using normalized values: from=${from}, to=${to}`);
    }
    // Create request key for deduplication (using normalized timestamps)
    const requestKey = `${query.symbol}-${query.interval}-${from}-${to}`;
    // Check if same request is already in progress
    if (activeRequests.has(requestKey)) {
        console_1.logger.debug("CHART", `Deduplicating request for ${requestKey}`);
        return await activeRequests.get(requestKey);
    }
    ctx === null || ctx === void 0 ? void 0 : ctx.step(`Fetching chart data for ${query.symbol} (${query.interval})`);
    // Add timeout to prevent hanging requests
    const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('Request timeout after 20 seconds')), 20000);
    });
    // Create the main request promise with normalized timestamps
    const requestPromise = getHistoricalOHLCV(query.symbol, query.interval, from, to, Number(query.duration));
    // Store the request promise for deduplication
    activeRequests.set(requestKey, requestPromise);
    try {
        const result = await Promise.race([requestPromise, timeoutPromise]);
        ctx === null || ctx === void 0 ? void 0 : ctx.success(`Retrieved ${result.length} chart data points`);
        return result;
    }
    catch (error) {
        console_1.logger.error("CHART", `API error for ${requestKey}: ${error.message}`);
        throw error;
    }
    finally {
        // Clean up the active request
        activeRequests.delete(requestKey);
    }
};
async function getHistoricalOHLCV(symbol, interval, from, to, duration, maxRetries = 3, initialRetryDelay = 1000) {
    try {
        const unblockTime = await (0, utils_2.loadBanStatus)();
        const isBanned = await (0, utils_2.handleBanStatus)(unblockTime);
        // First, get cached data
        let cachedData = await (0, utils_1.getCachedOHLCV)(symbol, interval, from, to);
        // Validate and clean cached data
        cachedData = (0, utils_1.validateAndCleanCandles)(cachedData);
        const intervalMs = (0, utils_1.intervalToMilliseconds)(interval);
        const expectedBars = Math.ceil((to - from) / intervalMs);
        console_1.logger.debug("CHART", `${symbol}/${interval}: Cached ${cachedData.length} candles, expected ~${expectedBars}`);
        // If banned, return cached data only (no synthetic - just what we have)
        if (isBanned) {
            console_1.logger.info("CHART", `Exchange banned, returning cached data for ${symbol}/${interval}`);
            return cachedData;
        }
        // Use timeout for exchange initialization
        let exchange = null;
        try {
            exchange = await Promise.race([
                exchange_1.default.startExchange(),
                new Promise((_, reject) => setTimeout(() => reject(new Error('Exchange initialization timeout')), 10000))
            ]);
        }
        catch (initError) {
            console_1.logger.warn("CHART", `Exchange init failed: ${initError.message}`);
        }
        if (!exchange) {
            console_1.logger.warn("CHART", "Exchange not available, returning cached data only");
            return cachedData;
        }
        // Check if cache is recent enough (last candle should be within 2 intervals of current time)
        const lastCachedTime = cachedData.length > 0 ? cachedData[cachedData.length - 1][0] : 0;
        const cacheIsRecent = lastCachedTime > (Date.now() - intervalMs * 2);
        // Return cached data if we have enough AND it's recent
        if (cachedData.length >= expectedBars * 0.9 && cacheIsRecent) {
            console_1.logger.debug("CHART", `${symbol}/${interval}: Cache sufficient and recent, returning ${cachedData.length} candles`);
            return cachedData;
        }
        // If cache has enough data but isn't recent, still try to fill the gap at the end
        if (cachedData.length >= expectedBars * 0.9 && !cacheIsRecent) {
            console_1.logger.info("CHART", `${symbol}/${interval}: Cache has ${cachedData.length} candles but last candle is ${Math.round((Date.now() - lastCachedTime) / 60000)} minutes old. Fetching recent data.`);
        }
        // Find gaps in cached data
        const missingIntervals = (0, utils_1.findGapsInCachedData)(cachedData, from, to, interval);
        // Calculate the current candle's start time (the one still in progress)
        // We should only skip THIS candle, not any completed ones
        const currentTimestamp = Date.now();
        const currentCandleStart = Math.floor(currentTimestamp / intervalMs) * intervalMs;
        if (missingIntervals.length === 0) {
            console_1.logger.debug("CHART", `${symbol}/${interval}: No gaps found, returning cached data`);
            return cachedData;
        }
        // Check if a gap fill operation is already in progress
        if ((0, utils_1.isGapFillInProgress)(symbol, interval)) {
            console_1.logger.info("CHART", `${symbol}/${interval}: Gap fill already in progress, waiting for completion`);
            const result = await (0, utils_1.waitForGapFill)(symbol, interval);
            if (result) {
                // Return the result from the existing operation
                return result;
            }
            // If no result, re-fetch from cache after waiting
            let updatedData = await (0, utils_1.getCachedOHLCV)(symbol, interval, from, to);
            updatedData = (0, utils_1.validateAndCleanCandles)(updatedData);
            return updatedData;
        }
        // Try to register this gap fill operation
        if (!(0, utils_1.registerGapFillOperation)(symbol, interval, missingIntervals)) {
            // Another operation is already handling these gaps, wait and return cached data
            console_1.logger.info("CHART", `${symbol}/${interval}: Duplicate gap fill request, waiting for existing operation`);
            await (0, utils_1.waitForGapFill)(symbol, interval);
            let updatedData = await (0, utils_1.getCachedOHLCV)(symbol, interval, from, to);
            updatedData = (0, utils_1.validateAndCleanCandles)(updatedData);
            return updatedData;
        }
        // Execute gap filling with proper locking
        return await (0, utils_1.executeWithGapFillLock)(symbol, interval, async () => {
            try {
                // Log detailed gap information
                const totalGapMinutes = missingIntervals.reduce((sum, gap) => sum + (gap.gapEnd - gap.gapStart) / 60000, 0);
                console_1.logger.info("CHART", `${symbol}/${interval}: Found ${missingIntervals.length} gaps (${Math.round(totalGapMinutes)} min total) to fill from exchange API`);
                missingIntervals.forEach((gap, i) => {
                    console_1.logger.debug("CHART", `  Gap ${i + 1}: ${new Date(gap.gapStart).toISOString()} to ${new Date(gap.gapEnd).toISOString()} (${Math.round((gap.gapEnd - gap.gapStart) / 60000)} min)`);
                });
                // GAP FILLING - Process gaps sequentially to avoid overwhelming the exchange
                // and to prevent race conditions in cache updates
                let totalFetched = 0;
                for (const { gapStart, gapEnd } of missingIntervals) {
                    // For large gaps, fetch in multiple requests (500 candles at a time)
                    let fetchStart = gapStart;
                    let retryDelay = initialRetryDelay;
                    while (fetchStart < gapEnd) {
                        // Check ban status before each fetch
                        if (await (0, utils_2.handleBanStatus)(await (0, utils_2.loadBanStatus)())) {
                            console_1.logger.warn("CHART", `Exchange became banned during fetch, stopping`);
                            break;
                        }
                        for (let attempt = 1; attempt <= maxRetries; attempt++) {
                            try {
                                // Adjust fetchEnd to not exceed gap end or current candle start
                                // We fetch up to (but not including) the current in-progress candle
                                const adjustedFetchEnd = Math.min(gapEnd, currentCandleStart);
                                if (fetchStart >= adjustedFetchEnd) {
                                    console_1.logger.debug("CHART", `fetchStart (${new Date(fetchStart).toISOString()}) >= adjustedFetchEnd (${new Date(adjustedFetchEnd).toISOString()}), breaking`);
                                    break;
                                }
                                // Add timeout to fetchOHLCV call
                                console_1.logger.debug("CHART", `Fetching OHLCV from ${new Date(fetchStart).toISOString()}, limit 500`);
                                const data = await Promise.race([
                                    exchange.fetchOHLCV(symbol, interval, fetchStart, 500 // Fetch up to 500 candles per request
                                    ),
                                    new Promise((_, reject) => setTimeout(() => reject(new Error('fetchOHLCV timeout')), 15000))
                                ]);
                                // Log what we received
                                if (data && data.length > 0) {
                                    console_1.logger.debug("CHART", `Received ${data.length} candles: ${new Date(data[0][0]).toISOString()} to ${new Date(data[data.length - 1][0]).toISOString()}`);
                                }
                                if (data && data.length > 0) {
                                    // Validate fetched data before caching
                                    const validData = (0, utils_1.validateAndCleanCandles)(data);
                                    if (validData.length > 0) {
                                        await (0, utils_1.saveOHLCVToCache)(symbol, interval, validData);
                                        totalFetched += validData.length;
                                        // Move fetchStart to after the last fetched candle
                                        const lastCandleTime = validData[validData.length - 1][0];
                                        fetchStart = lastCandleTime + intervalMs;
                                        console_1.logger.debug("CHART", `${symbol}/${interval}: Fetched ${validData.length} candles (total: ${totalFetched})`);
                                    }
                                    else {
                                        // No valid data, move forward to avoid infinite loop
                                        fetchStart = fetchStart + intervalMs * 100;
                                    }
                                }
                                else {
                                    // No data returned, move forward to avoid infinite loop
                                    fetchStart = fetchStart + intervalMs * 100;
                                }
                                // Success, break retry loop
                                break;
                            }
                            catch (e) {
                                console_1.logger.warn("CHART", `Attempt ${attempt} failed for fetch starting at ${fetchStart}: ${e.message}`);
                                if (attempt < maxRetries) {
                                    await new Promise((resolve) => setTimeout(resolve, retryDelay));
                                    retryDelay = Math.min(retryDelay * 1.5, 5000); // Cap at 5 seconds
                                }
                                else {
                                    console_1.logger.error("CHART", `Failed to fetch data starting at ${fetchStart} after ${maxRetries} attempts, skipping chunk`);
                                    // Skip ahead to avoid infinite loop
                                    fetchStart = Math.min(fetchStart + intervalMs * 500, gapEnd);
                                }
                            }
                        }
                        // Small delay between fetches to avoid rate limiting
                        await new Promise((resolve) => setTimeout(resolve, 100));
                    }
                }
                console_1.logger.info("CHART", `${symbol}/${interval}: Total fetched ${totalFetched} candles from exchange API`);
                // Get updated cached data after fetching
                let finalData = await (0, utils_1.getCachedOHLCV)(symbol, interval, from, to);
                finalData = (0, utils_1.validateAndCleanCandles)(finalData);
                // Repair small gaps by interpolation
                finalData = (0, utils_1.repairCandleData)(finalData, interval);
                // Check if we still have significant gaps
                const remainingGaps = (0, utils_1.findGapsInCachedData)(finalData, from, to, interval);
                if (remainingGaps.length > 0) {
                    const remainingCandlesMissing = remainingGaps.reduce((sum, gap) => sum + Math.ceil((gap.gapEnd - gap.gapStart) / intervalMs), 0);
                    // Only use synthetic filling as absolute last resort for small gaps (< 5% of expected)
                    if (remainingCandlesMissing < expectedBars * 0.05) {
                        console_1.logger.info("CHART", `${symbol}/${interval}: ${remainingCandlesMissing} candles still missing (<5%), filling with synthetic`);
                        return (0, utils_1.fillGapsWithSyntheticCandles)(finalData, from, to, interval);
                    }
                    else {
                        // Don't use synthetic for large gaps - return what we have
                        console_1.logger.warn("CHART", `${symbol}/${interval}: ${remainingCandlesMissing} candles still missing (${Math.round(remainingCandlesMissing / expectedBars * 100)}%), returning partial data`);
                    }
                }
                return finalData;
            }
            finally {
                // Always clear the gap fill registration when done
                (0, utils_1.clearGapFillOperation)(symbol, interval);
            }
        });
    }
    catch (error) {
        console_1.logger.error("CHART", `Error in getHistoricalOHLCV: ${error}`);
        // Clear any lingering gap fill registration
        (0, utils_1.clearGapFillOperation)(symbol, interval);
        // Return cached data as fallback (no synthetic filling on error)
        try {
            let cachedData = await (0, utils_1.getCachedOHLCV)(symbol, interval, from, to);
            cachedData = (0, utils_1.validateAndCleanCandles)(cachedData);
            return cachedData;
        }
        catch (cacheError) {
            console_1.logger.error("CHART", `Failed to get cached data as fallback: ${cacheError}`);
            return [];
        }
    }
}
