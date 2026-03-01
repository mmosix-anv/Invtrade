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
exports.getHistoricalCandles = getHistoricalCandles;
exports.getLastCandles = getLastCandles;
exports.getLatestCandleForSymbol = getLatestCandleForSymbol;
exports.getYesterdayCandles = getYesterdayCandles;
const error_1 = require("@b/utils/error");
// Safe import for ecosystem modules
let client;
let scyllaFuturesKeyspace;
let Candle;
try {
    const clientModule = require("@b/api/(ext)/ecosystem/utils/scylla/client");
    client = clientModule.default;
    scyllaFuturesKeyspace = clientModule.scyllaFuturesKeyspace;
    const queriesModule = require("@b/api/(ext)/ecosystem/utils/scylla/queries");
    Candle = queriesModule.Candle;
}
catch (e) {
    // Ecosystem extension not available
}
async function getHistoricalCandles(symbol, interval, from, to) {
    if (!client || !scyllaFuturesKeyspace) {
        throw (0, error_1.createError)({ statusCode: 503, message: "Ecosystem extension not available" });
    }
    try {
        const query = `
      SELECT * FROM ${scyllaFuturesKeyspace}.candles
      WHERE symbol = ?
      AND interval = ?
      AND "createdAt" >= ?
      AND "createdAt" <= ?
      ORDER BY "createdAt" ASC;
    `;
        const params = [symbol, interval, new Date(from), new Date(to)];
        // Execute the query using your existing ScyllaDB client
        const result = await client.execute(query, params, { prepare: true });
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
        SELECT * FROM ${scyllaFuturesKeyspace}.candles
        WHERE symbol = ?
        AND interval = ?
        AND "createdAt" < ?
        ORDER BY "createdAt" DESC
        LIMIT 1;
      `;
            const lookbackParams = [symbol, interval, new Date(from)];
            const lookbackResult = await client.execute(lookbackQuery, lookbackParams, {
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
        throw (0, error_1.createError)({
            statusCode: 500,
            message: `Failed to fetch historical futures candles: ${error.message}`,
        });
    }
}
/**
 * Fetches the latest futures candle for each interval.
 * @returns A Promise that resolves with an array of the latest futures candles.
 */
async function getLastCandles() {
    if (!client || !scyllaFuturesKeyspace) {
        throw (0, error_1.createError)({ statusCode: 503, message: "Ecosystem extension not available" });
    }
    try {
        // Fetch the latest candle for each symbol and interval
        // The latest_candles materialized view is partitioned by (symbol, interval)
        // and ordered by createdAt DESC, so we need to get the first row per partition
        const query = `
      SELECT symbol, interval, open, high, low, close, volume, "createdAt", "updatedAt"
      FROM ${scyllaFuturesKeyspace}.latest_candles;
    `;
        const result = await client.execute(query, [], { prepare: true });
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
        console.error(`Failed to fetch latest futures candles: ${error.message}`);
        throw (0, error_1.createError)({
            statusCode: 500,
            message: `Failed to fetch latest futures candles: ${error.message}`,
        });
    }
}
/**
 * Get the most recent candle for a specific symbol and interval from the database.
 * Used when creating a new candle to ensure proper open price continuity.
 */
async function getLatestCandleForSymbol(symbol, interval) {
    if (!client || !scyllaFuturesKeyspace) {
        return null;
    }
    try {
        const query = `
      SELECT symbol, interval, open, high, low, close, volume, "createdAt", "updatedAt"
      FROM ${scyllaFuturesKeyspace}.latest_candles
      WHERE symbol = ? AND interval = ?
      LIMIT 1;
    `;
        const result = await client.execute(query, [symbol, interval], { prepare: true });
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
        console.error(`Failed to fetch latest futures candle for ${symbol}/${interval}: ${error.message}`);
        return null;
    }
}
async function getYesterdayCandles() {
    if (!client || !scyllaFuturesKeyspace) {
        throw (0, error_1.createError)({ statusCode: 503, message: "Ecosystem extension not available" });
    }
    try {
        // Calculate the date range for "yesterday"
        const endOfYesterday = new Date();
        endOfYesterday.setHours(0, 0, 0, 0);
        const startOfYesterday = new Date(endOfYesterday.getTime() - 24 * 60 * 60 * 1000);
        // Query to get futures candles for yesterday
        const query = `
      SELECT * FROM ${scyllaFuturesKeyspace}.latest_candles
      WHERE "createdAt" >= ? AND "createdAt" < ?;
    `;
        const result = await client.execute(query, [startOfYesterday.toISOString(), endOfYesterday.toISOString()], { prepare: true });
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
        console.error(`Failed to fetch yesterday's futures candles: ${error.message}`);
        throw (0, error_1.createError)({
            statusCode: 500,
            message: `Failed to fetch yesterday's futures candles: ${error.message}`,
        });
    }
}
