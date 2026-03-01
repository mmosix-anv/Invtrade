"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.baseChartDataPointSchema = void 0;
exports.validateAndNormalizeTimestamps = validateAndNormalizeTimestamps;
exports.isGapFillInProgress = isGapFillInProgress;
exports.waitForGapFill = waitForGapFill;
exports.registerGapFillOperation = registerGapFillOperation;
exports.clearGapFillOperation = clearGapFillOperation;
exports.executeWithGapFillLock = executeWithGapFillLock;
exports.getCachedOHLCV = getCachedOHLCV;
exports.saveOHLCVToCache = saveOHLCVToCache;
exports.intervalToMilliseconds = intervalToMilliseconds;
exports.findGapsInCachedData = findGapsInCachedData;
exports.fillGapsWithSyntheticCandles = fillGapsWithSyntheticCandles;
exports.validateAndCleanCandles = validateAndCleanCandles;
exports.repairCandleData = repairCandleData;
// utils.ts
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const zlib_1 = __importDefault(require("zlib"));
const redis_1 = require("@b/utils/redis");
const schema_1 = require("@b/utils/schema");
const console_1 = require("@b/utils/console");
const redis = redis_1.RedisSingleton.getInstance();
const cacheDirPath = path_1.default.resolve(process.cwd(), "data", "chart");
// Ensure cache directory exists
if (!fs_1.default.existsSync(cacheDirPath)) {
    fs_1.default.mkdirSync(cacheDirPath, { recursive: true });
}
exports.baseChartDataPointSchema = {
    timestamp: (0, schema_1.baseNumberSchema)("Timestamp for the data point"),
    open: (0, schema_1.baseNumberSchema)("Opening price for the data interval"),
    high: (0, schema_1.baseNumberSchema)("Highest price during the data interval"),
    low: (0, schema_1.baseNumberSchema)("Lowest price during the data interval"),
    close: (0, schema_1.baseNumberSchema)("Closing price for the data interval"),
    volume: (0, schema_1.baseNumberSchema)("Volume of trades during the data interval"),
};
// ============================================================================
// TIMESTAMP VALIDATION
// ============================================================================
/**
 * Validates and normalizes timestamp parameters
 * Ensures timestamps are within reasonable bounds (2020 to 1 hour in future)
 */
function validateAndNormalizeTimestamps(from, to) {
    const now = Date.now();
    const minTimestamp = new Date("2020-01-01").getTime();
    const maxTimestamp = now + 3600000; // 1 hour in the future max
    // Check if timestamps are valid
    if (from > maxTimestamp || to > maxTimestamp) {
        console_1.logger.warn("CHART", `Invalid future timestamps detected: from=${from}, to=${to}, now=${now}`);
        // Likely timestamps are in seconds instead of milliseconds, or corrupted
        // Try to auto-correct if they look like they're too far in future
        if (from > maxTimestamp * 10) {
            // Timestamps might be corrupted, use default range
            const defaultFrom = now - (500 * 60000); // 500 minutes ago
            return { from: defaultFrom, to: now, isValid: false };
        }
    }
    // Ensure from is not before our minimum
    const normalizedFrom = Math.max(from, minTimestamp);
    // Ensure to is not in the future (beyond 1 minute buffer)
    const normalizedTo = Math.min(to, now + 60000);
    return {
        from: normalizedFrom,
        to: normalizedTo,
        isValid: normalizedFrom < normalizedTo,
    };
}
function getCacheKey(symbol, interval) {
    return `ohlcv:${symbol}:${interval}`;
}
function compress(data) {
    return zlib_1.default.gzipSync(JSON.stringify(data));
}
function decompress(data) {
    return JSON.parse(zlib_1.default.gunzipSync(data).toString());
}
function getCacheFilePath(symbol, interval) {
    const symbolDirPath = path_1.default.join(cacheDirPath, symbol);
    if (!fs_1.default.existsSync(symbolDirPath)) {
        fs_1.default.mkdirSync(symbolDirPath, { recursive: true });
    }
    return path_1.default.join(symbolDirPath, `${interval}.json.gz`);
}
async function loadCacheFromFile(symbol, interval) {
    const cacheFilePath = getCacheFilePath(symbol, interval);
    if (fs_1.default.existsSync(cacheFilePath)) {
        try {
            const compressedData = await fs_1.default.promises.readFile(cacheFilePath);
            const data = decompress(compressedData);
            // Validate cache data
            if (Array.isArray(data) && data.length > 0) {
                // Check if data format is valid (array of [timestamp, open, high, low, close, volume])
                const firstItem = data[0];
                if (Array.isArray(firstItem) && firstItem.length >= 5 && typeof firstItem[0] === 'number') {
                    return data;
                }
                console_1.logger.warn("CHART", `Invalid cache data format for ${symbol}/${interval}, clearing cache`);
            }
        }
        catch (error) {
            console_1.logger.warn("CHART", `Failed to load cache file for ${symbol}/${interval}: ${error}`);
        }
    }
    return [];
}
async function saveCacheToFile(symbol, interval, data) {
    const cacheFilePath = getCacheFilePath(symbol, interval);
    const compressedData = compress(data);
    await fs_1.default.promises.writeFile(cacheFilePath, compressedData);
}
// ============================================================================
// CONCURRENCY CONTROL
// ============================================================================
// Cache locks to prevent concurrent access issues
const cacheLocks = new Map();
// Gap filling locks - prevent multiple concurrent gap fill operations for same symbol/interval
const gapFillLocks = new Map();
// Track ongoing gap fill operations with timestamps to prevent duplicate work
const activeGapFills = new Map();
/**
 * Get a unique key for gap fill operations
 */
function getGapFillKey(symbol, interval) {
    return `gapfill:${symbol}:${interval}`;
}
/**
 * Check if a gap fill operation is already in progress for the given symbol/interval
 * and if it covers the requested gaps
 */
function isGapFillInProgress(symbol, interval) {
    const key = getGapFillKey(symbol, interval);
    return gapFillLocks.has(key);
}
/**
 * Wait for any ongoing gap fill operation to complete
 */
async function waitForGapFill(symbol, interval) {
    const key = getGapFillKey(symbol, interval);
    if (gapFillLocks.has(key)) {
        console_1.logger.debug("CHART", `Waiting for existing gap fill operation for ${symbol}/${interval}`);
        return await gapFillLocks.get(key) || null;
    }
    return null;
}
/**
 * Register a gap fill operation and return true if we should proceed
 * Returns false if another operation is already filling the same gaps
 */
function registerGapFillOperation(symbol, interval, gaps) {
    const key = getGapFillKey(symbol, interval);
    // Check if there's already an active operation
    const existing = activeGapFills.get(key);
    if (existing) {
        // Check if existing operation started within the last 30 seconds
        // and covers similar gaps (to prevent duplicate work)
        const isRecent = Date.now() - existing.startTime < 30000;
        if (isRecent) {
            // Check if the new gaps overlap significantly with existing gaps
            const hasOverlap = gaps.some(newGap => existing.gaps.some(existingGap => newGap.gapStart < existingGap.gapEnd && newGap.gapEnd > existingGap.gapStart));
            if (hasOverlap) {
                console_1.logger.debug("CHART", `Skipping duplicate gap fill for ${symbol}/${interval} - operation already in progress`);
                return false;
            }
        }
    }
    // Register this operation
    activeGapFills.set(key, { startTime: Date.now(), gaps });
    return true;
}
/**
 * Clear the gap fill registration when done
 */
function clearGapFillOperation(symbol, interval) {
    const key = getGapFillKey(symbol, interval);
    activeGapFills.delete(key);
}
/**
 * Execute a gap fill operation with proper locking
 * This ensures only one gap fill runs at a time per symbol/interval
 */
async function executeWithGapFillLock(symbol, interval, operation) {
    const key = getGapFillKey(symbol, interval);
    // Wait for any existing operation to complete
    if (gapFillLocks.has(key)) {
        console_1.logger.debug("CHART", `Waiting for existing gap fill lock for ${symbol}/${interval}`);
        await gapFillLocks.get(key);
    }
    // Create and store the new operation promise
    const operationPromise = operation();
    gapFillLocks.set(key, operationPromise);
    try {
        return await operationPromise;
    }
    finally {
        gapFillLocks.delete(key);
    }
}
async function getCachedOHLCV(symbol, interval, from, to) {
    const cacheKey = getCacheKey(symbol, interval);
    // Check if there's an ongoing cache operation
    if (cacheLocks.has(cacheKey)) {
        await cacheLocks.get(cacheKey);
    }
    try {
        // Try to get data from Redis with timeout
        let cachedData = await Promise.race([
            redis.get(cacheKey),
            new Promise((_, reject) => setTimeout(() => reject(new Error('Redis timeout')), 3000))
        ]).catch(() => null);
        if (!cachedData) {
            // Create a lock for file operations
            const lockPromise = loadCacheFromFileWithLock(symbol, interval, cacheKey);
            cacheLocks.set(cacheKey, lockPromise);
            try {
                const dataFromFile = await lockPromise;
                if (dataFromFile.length > 0) {
                    // Try to save to Redis with timeout
                    await Promise.race([
                        redis.set(cacheKey, JSON.stringify(dataFromFile)),
                        new Promise((_, reject) => setTimeout(() => reject(new Error('Redis SET timeout')), 3000))
                    ]).catch(() => {
                        console_1.logger.warn("CHART", `Failed to cache data in Redis for ${cacheKey}`);
                    });
                    cachedData = JSON.stringify(dataFromFile);
                }
                else {
                    return [];
                }
            }
            finally {
                cacheLocks.delete(cacheKey);
            }
        }
        const intervalCache = JSON.parse(cachedData);
        // Use binary search to find the start and end indices
        const startIndex = binarySearch(intervalCache, from);
        const endIndex = binarySearch(intervalCache, to, true);
        return intervalCache.slice(startIndex, endIndex + 1);
    }
    catch (error) {
        console_1.logger.error("CHART", `Error getting cached OHLCV for ${cacheKey}: ${error}`);
        return [];
    }
}
async function loadCacheFromFileWithLock(symbol, interval, cacheKey) {
    try {
        return await loadCacheFromFile(symbol, interval);
    }
    catch (error) {
        console_1.logger.error("CHART", `Error loading cache from file for ${cacheKey}: ${error}`);
        return [];
    }
}
function binarySearch(arr, target, findEnd = false) {
    let left = 0;
    let right = arr.length - 1;
    while (left <= right) {
        const mid = Math.floor((left + right) / 2);
        if (arr[mid][0] === target) {
            return mid;
        }
        if (arr[mid][0] < target) {
            left = mid + 1;
        }
        else {
            right = mid - 1;
        }
    }
    return findEnd ? right : left;
}
async function saveOHLCVToCache(symbol, interval, data) {
    const cacheKey = getCacheKey(symbol, interval);
    // Wait for any ongoing cache operations
    if (cacheLocks.has(cacheKey)) {
        await cacheLocks.get(cacheKey);
    }
    // Create a lock for this save operation
    const savePromise = performCacheSave(symbol, interval, data, cacheKey);
    cacheLocks.set(cacheKey, savePromise);
    try {
        await savePromise;
    }
    finally {
        cacheLocks.delete(cacheKey);
    }
}
async function performCacheSave(symbol, interval, data, cacheKey) {
    try {
        let intervalCache = [];
        // Try to get existing data with timeout
        const cachedData = await Promise.race([
            redis.get(cacheKey),
            new Promise((_, reject) => setTimeout(() => reject(new Error('Redis GET timeout')), 3000))
        ]).catch(() => null);
        if (cachedData) {
            try {
                intervalCache = JSON.parse(cachedData);
            }
            catch (error) {
                console_1.logger.warn("CHART", `Failed to parse cached data for ${cacheKey}, using empty array`);
                intervalCache = [];
            }
        }
        const updatedCache = mergeAndSortData(intervalCache, data);
        // Save to Redis with timeout
        await Promise.race([
            redis.set(cacheKey, JSON.stringify(updatedCache)),
            new Promise((_, reject) => setTimeout(() => reject(new Error('Redis SET timeout')), 3000))
        ]).catch((error) => {
            console_1.logger.warn("CHART", `Failed to save cache to Redis for ${cacheKey}: ${error}`);
        });
        // Save to file with timeout
        await Promise.race([
            saveCacheToFile(symbol, interval, updatedCache),
            new Promise((_, reject) => setTimeout(() => reject(new Error('File save timeout')), 5000))
        ]).catch((error) => {
            console_1.logger.warn("CHART", `Failed to save cache to file for ${cacheKey}: ${error}`);
        });
    }
    catch (error) {
        console_1.logger.error("CHART", `Error in performCacheSave for ${cacheKey}: ${error}`);
        throw error;
    }
}
function mergeAndSortData(existingData, newData) {
    const merged = [...existingData, ...newData];
    merged.sort((a, b) => a[0] - b[0]);
    // Remove duplicates
    return merged.filter((item, index, self) => index === 0 || item[0] !== self[index - 1][0]);
}
function intervalToMilliseconds(interval) {
    const intervalMap = {
        "1m": 60 * 1000,
        "3m": 3 * 60 * 1000,
        "5m": 5 * 60 * 1000,
        "15m": 15 * 60 * 1000,
        "30m": 30 * 60 * 1000,
        "1h": 60 * 60 * 1000,
        "2h": 2 * 60 * 60 * 1000,
        "4h": 4 * 60 * 60 * 1000,
        "6h": 6 * 60 * 60 * 1000,
        "8h": 8 * 60 * 60 * 1000,
        "12h": 12 * 60 * 60 * 1000,
        "1d": 24 * 60 * 60 * 1000,
        "3d": 3 * 24 * 60 * 60 * 1000,
        "1w": 7 * 24 * 60 * 60 * 1000,
        "1M": 30 * 24 * 60 * 60 * 1000,
    };
    return intervalMap[interval] || 0;
}
function findGapsInCachedData(cachedData, from, to, interval) {
    const gaps = [];
    const currentTimestamp = Date.now();
    const intervalMs = intervalToMilliseconds(interval);
    // Normalize the start time to interval boundary
    let currentStart = Math.floor(from / intervalMs) * intervalMs;
    // Calculate the current candle's start time (the one still in progress)
    const currentCandleStart = Math.floor(currentTimestamp / intervalMs) * intervalMs;
    // We should fetch up to the PREVIOUS completed candle, not the current one
    // So adjustedTo should be the start of the current candle (which means the last complete candle ends just before it)
    const adjustedTo = Math.min(to, currentCandleStart);
    console_1.logger.debug("CHART", `findGaps: now=${new Date(currentTimestamp).toISOString()}, currentCandleStart=${new Date(currentCandleStart).toISOString()}, adjustedTo=${new Date(adjustedTo).toISOString()}`);
    for (const bar of cachedData) {
        const barTime = bar[0];
        // Check if there's a significant gap (more than 1.5x interval)
        if (barTime > currentStart + intervalMs * 1.5) {
            gaps.push({ gapStart: currentStart, gapEnd: barTime });
        }
        currentStart = barTime + intervalMs;
    }
    // Check for gap at the end (between last cached candle and the last complete candle)
    if (currentStart < adjustedTo) {
        const gapMinutes = Math.round((adjustedTo - currentStart) / 60000);
        const lastCachedCandleTime = cachedData.length > 0 ? cachedData[cachedData.length - 1][0] : 0;
        console_1.logger.debug("CHART", `Gap at end: lastCached=${new Date(lastCachedCandleTime).toISOString()}, nextExpected=${new Date(currentStart).toISOString()}, adjustedTo=${new Date(adjustedTo).toISOString()}, gap=${gapMinutes} minutes`);
        gaps.push({ gapStart: currentStart, gapEnd: adjustedTo });
    }
    return gaps;
}
// ============================================================================
// SYNTHETIC CANDLE FILLING
// ============================================================================
/**
 * Fills gaps in candle data with synthetic candles
 * Uses the last known price for open/high/low/close with zero volume
 */
function fillGapsWithSyntheticCandles(cachedData, from, to, interval) {
    if (cachedData.length === 0) {
        return cachedData;
    }
    const intervalMs = intervalToMilliseconds(interval);
    const now = Date.now();
    // Don't fill beyond current time
    const adjustedTo = Math.min(to, now);
    const result = [];
    let lastPrice = cachedData[0][4]; // Use first candle's close price as starting point
    // Normalize start time to interval boundary
    let currentTime = Math.floor(from / intervalMs) * intervalMs;
    let dataIndex = 0;
    while (currentTime < adjustedTo && dataIndex <= cachedData.length) {
        // Check if we have real data for this timestamp
        if (dataIndex < cachedData.length) {
            const realCandle = cachedData[dataIndex];
            const realTime = realCandle[0];
            // If real candle is at current time, use it
            if (Math.abs(realTime - currentTime) < intervalMs * 0.5) {
                result.push(realCandle);
                lastPrice = realCandle[4]; // Update last price to this candle's close
                dataIndex++;
                currentTime = realTime + intervalMs;
                continue;
            }
            // If real candle is in the past (data is behind), skip to it
            if (realTime < currentTime) {
                dataIndex++;
                continue;
            }
        }
        // No real data for this time, create synthetic candle
        // Only create synthetic candles for small gaps (max 50 candles)
        const gapSize = dataIndex < cachedData.length
            ? (cachedData[dataIndex][0] - currentTime) / intervalMs
            : (adjustedTo - currentTime) / intervalMs;
        if (gapSize <= 50) {
            // Create synthetic candle: [timestamp, open, high, low, close, volume]
            result.push([
                currentTime,
                lastPrice, // open
                lastPrice, // high
                lastPrice, // low
                lastPrice, // close
                0, // volume
            ]);
        }
        currentTime += intervalMs;
        // Safety check to prevent infinite loops
        if (result.length > 10000) {
            console_1.logger.warn("CHART", `Too many candles generated, stopping at ${result.length}`);
            break;
        }
    }
    return result;
}
/**
 * Validates and cleans candle data, removing invalid entries
 */
function validateAndCleanCandles(data) {
    const now = Date.now();
    const minTimestamp = new Date("2015-01-01").getTime();
    // First pass: basic validation
    const basicValid = data.filter((candle) => {
        if (!Array.isArray(candle) || candle.length < 5)
            return false;
        const [timestamp, open, high, low, close] = candle;
        // Validate timestamp
        if (typeof timestamp !== 'number' || timestamp < minTimestamp || timestamp > now + 3600000) {
            return false;
        }
        // Validate OHLC values
        if (typeof open !== 'number' || typeof high !== 'number' ||
            typeof low !== 'number' || typeof close !== 'number') {
            return false;
        }
        // Validate OHLC relationships (high >= low, high >= open/close, low <= open/close)
        if (high < low || high < open || high < close || low > open || low > close) {
            return false;
        }
        // Check for NaN or Infinity
        if (!isFinite(open) || !isFinite(high) || !isFinite(low) || !isFinite(close)) {
            return false;
        }
        // Check for zero or negative prices
        if (open <= 0 || high <= 0 || low <= 0 || close <= 0) {
            return false;
        }
        return true;
    });
    // Second pass: detect and remove anomalous price jumps
    return removeAnomalousCandles(basicValid);
}
/**
 * Detects and removes candles with anomalous price jumps
 * An anomaly is detected by checking:
 * 1. Gap between previous candle's close and current candle's open
 * 2. Gap between current candle's close and next candle's open
 * 3. Candle's range (high-low) compared to neighbors
 */
function removeAnomalousCandles(candles) {
    if (candles.length < 3)
        return candles;
    // Sort by timestamp first
    const sorted = [...candles].sort((a, b) => a[0] - b[0]);
    // First, calculate typical price movement between consecutive candles
    const closeToOpenGaps = [];
    const candleRanges = [];
    for (let i = 1; i < sorted.length; i++) {
        const prevClose = sorted[i - 1][4];
        const currOpen = sorted[i][1];
        const gap = Math.abs(currOpen - prevClose);
        closeToOpenGaps.push(gap);
        const range = sorted[i][2] - sorted[i][3]; // high - low
        candleRanges.push(range);
    }
    // Calculate median and standard deviation for gaps
    const sortedGaps = [...closeToOpenGaps].sort((a, b) => a - b);
    const medianGap = sortedGaps[Math.floor(sortedGaps.length / 2)] || 0;
    const avgGap = closeToOpenGaps.reduce((a, b) => a + b, 0) / closeToOpenGaps.length || 0;
    // Calculate median range
    const sortedRanges = [...candleRanges].sort((a, b) => a - b);
    const medianRange = sortedRanges[Math.floor(sortedRanges.length / 2)] || 0;
    const avgRange = candleRanges.reduce((a, b) => a + b, 0) / candleRanges.length || 0;
    // Threshold: a gap is anomalous if it's more than 10x the median gap
    // or the candle range is more than 10x the median range
    const gapThreshold = Math.max(medianGap * 10, avgGap * 5);
    const rangeThreshold = Math.max(medianRange * 10, avgRange * 5);
    const result = [];
    let removedCount = 0;
    for (let i = 0; i < sorted.length; i++) {
        const current = sorted[i];
        const [timestamp, open, high, low, close] = current;
        const currentRange = high - low;
        let isAnomaly = false;
        let reason = "";
        // Check gap from previous candle's close to current open
        if (i > 0) {
            const prevClose = sorted[i - 1][4];
            const gapFromPrev = Math.abs(open - prevClose);
            if (gapThreshold > 0 && gapFromPrev > gapThreshold) {
                // Check if next candle confirms this is bad data
                // (i.e., next candle opens back near the previous close)
                if (i < sorted.length - 1) {
                    const nextOpen = sorted[i + 1][1];
                    const nextGapFromCurrent = Math.abs(nextOpen - close);
                    const nextGapFromPrev = Math.abs(nextOpen - prevClose);
                    // If next candle is closer to prev close than to current close,
                    // this candle is likely an anomaly
                    if (nextGapFromPrev < nextGapFromCurrent * 0.5) {
                        isAnomaly = true;
                        reason = `gap from prev: ${gapFromPrev.toFixed(2)} > threshold ${gapThreshold.toFixed(2)}, next candle reverts`;
                    }
                }
            }
        }
        // Check if candle range is anomalously large
        if (!isAnomaly && rangeThreshold > 0 && currentRange > rangeThreshold) {
            // Check if neighbors have similar ranges
            const neighborRanges = [];
            for (let j = Math.max(0, i - 3); j < Math.min(sorted.length, i + 4); j++) {
                if (j !== i) {
                    neighborRanges.push(sorted[j][2] - sorted[j][3]);
                }
            }
            if (neighborRanges.length > 0) {
                const avgNeighborRange = neighborRanges.reduce((a, b) => a + b, 0) / neighborRanges.length;
                if (currentRange > avgNeighborRange * 8) {
                    isAnomaly = true;
                    reason = `range ${currentRange.toFixed(2)} > 8x neighbor avg ${avgNeighborRange.toFixed(2)}`;
                }
            }
        }
        // Check for wicks that extend way beyond the body in an unrealistic way
        if (!isAnomaly) {
            const body = Math.abs(close - open);
            const upperWick = high - Math.max(open, close);
            const lowerWick = Math.min(open, close) - low;
            // If wick is more than 20x the body and more than 5x neighbor ranges, it's suspicious
            if (body > 0 && (upperWick > body * 20 || lowerWick > body * 20)) {
                const neighborRanges = [];
                for (let j = Math.max(0, i - 3); j < Math.min(sorted.length, i + 4); j++) {
                    if (j !== i) {
                        neighborRanges.push(sorted[j][2] - sorted[j][3]);
                    }
                }
                if (neighborRanges.length > 0) {
                    const avgNeighborRange = neighborRanges.reduce((a, b) => a + b, 0) / neighborRanges.length;
                    const maxWick = Math.max(upperWick, lowerWick);
                    if (maxWick > avgNeighborRange * 5) {
                        isAnomaly = true;
                        reason = `extreme wick: ${maxWick.toFixed(2)} > 5x neighbor range ${avgNeighborRange.toFixed(2)}`;
                    }
                }
            }
        }
        if (isAnomaly) {
            console_1.logger.warn("CHART", `Removing anomalous candle: time=${new Date(timestamp).toISOString()}, O=${open.toFixed(2)}, H=${high.toFixed(2)}, L=${low.toFixed(2)}, C=${close.toFixed(2)}, reason: ${reason}`);
            removedCount++;
        }
        else {
            result.push(current);
        }
    }
    if (removedCount > 0) {
        console_1.logger.info("CHART", `Removed ${removedCount} anomalous candles from dataset`);
    }
    return result;
}
/**
 * Repairs candle data by interpolating missing or bad candles
 * This should be called after validation to fill small gaps
 */
function repairCandleData(candles, interval) {
    if (candles.length < 2)
        return candles;
    const intervalMs = intervalToMilliseconds(interval);
    const sorted = [...candles].sort((a, b) => a[0] - b[0]);
    const result = [];
    for (let i = 0; i < sorted.length; i++) {
        const current = sorted[i];
        result.push(current);
        // Check for small gaps (1-3 missing candles) and interpolate
        if (i < sorted.length - 1) {
            const next = sorted[i + 1];
            const gap = next[0] - current[0];
            const missingCandles = Math.round(gap / intervalMs) - 1;
            // Only interpolate small gaps (1-3 candles)
            if (missingCandles > 0 && missingCandles <= 3) {
                const currentClose = current[4];
                const nextOpen = next[1];
                // Linear interpolation between current close and next open
                for (let j = 1; j <= missingCandles; j++) {
                    const ratio = j / (missingCandles + 1);
                    const interpolatedPrice = currentClose + (nextOpen - currentClose) * ratio;
                    const interpolatedTime = current[0] + intervalMs * j;
                    result.push([
                        interpolatedTime,
                        interpolatedPrice, // open
                        interpolatedPrice, // high
                        interpolatedPrice, // low
                        interpolatedPrice, // close
                        0, // volume (unknown)
                    ]);
                }
                console_1.logger.debug("CHART", `Interpolated ${missingCandles} missing candles between ${new Date(current[0]).toISOString()} and ${new Date(next[0]).toISOString()}`);
            }
        }
    }
    return result.sort((a, b) => a[0] - b[0]);
}
