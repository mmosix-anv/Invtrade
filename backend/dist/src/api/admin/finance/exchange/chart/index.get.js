"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.metadata = void 0;
// /api/admin/finance/exchange/chart - Get chart data statistics
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const db_1 = require("@b/db");
const query_1 = require("@b/utils/query");
const error_1 = require("@b/utils/error");
const cacheDirPath = path_1.default.resolve(process.cwd(), "data", "chart");
exports.metadata = {
    summary: "Get chart data statistics for all markets",
    operationId: "getChartStatistics",
    tags: ["Admin", "Exchange", "Chart"],
    responses: {
        200: {
            description: "Chart statistics for all markets",
            content: {
                "application/json": {
                    schema: {
                        type: "object",
                        properties: {
                            markets: {
                                type: "array",
                                items: {
                                    type: "object",
                                    properties: {
                                        symbol: { type: "string" },
                                        currency: { type: "string" },
                                        pair: { type: "string" },
                                        status: { type: "boolean" },
                                        intervals: {
                                            type: "object",
                                            additionalProperties: {
                                                type: "object",
                                                properties: {
                                                    candleCount: { type: "number" },
                                                    fileSize: { type: "number" },
                                                    oldestCandle: { type: "number" },
                                                    newestCandle: { type: "number" },
                                                    gaps: { type: "number" },
                                                },
                                            },
                                        },
                                    },
                                },
                            },
                            totalMarkets: { type: "number" },
                            totalCacheSize: { type: "number" },
                        },
                    },
                },
            },
        },
        401: query_1.unauthorizedResponse,
        500: query_1.serverErrorResponse,
    },
    requiresAuth: true,
    permission: "view.exchange.chart",
};
const INTERVALS = ["1m", "5m", "15m", "30m", "1h", "2h", "4h", "6h", "12h", "1d", "3d", "1w"];
function decompress(data) {
    const zlib = require("zlib");
    return JSON.parse(zlib.gunzipSync(data).toString());
}
function getIntervalMs(interval) {
    const map = {
        "1m": 60000,
        "3m": 180000,
        "5m": 300000,
        "15m": 900000,
        "30m": 1800000,
        "1h": 3600000,
        "2h": 7200000,
        "4h": 14400000,
        "6h": 21600000,
        "8h": 28800000,
        "12h": 43200000,
        "1d": 86400000,
        "3d": 259200000,
        "1w": 604800000,
    };
    return map[interval] || 60000;
}
function countGaps(candles, intervalMs) {
    if (!Array.isArray(candles) || candles.length < 2)
        return 0;
    let gaps = 0;
    for (let i = 1; i < candles.length; i++) {
        const expectedTime = candles[i - 1][0] + intervalMs;
        if (candles[i][0] > expectedTime + intervalMs) {
            gaps++;
        }
    }
    return gaps;
}
exports.default = async (data) => {
    try {
        // Get all enabled markets
        const markets = await db_1.models.exchangeMarket.findAll({
            where: { status: true },
            attributes: ["id", "currency", "pair", "status"],
            raw: true,
        });
        let totalCacheSize = 0;
        const marketStats = [];
        for (const market of markets) {
            const symbol = `${market.currency}/${market.pair}`;
            const symbolDir = path_1.default.join(cacheDirPath, market.currency, market.pair);
            const intervals = {};
            for (const interval of INTERVALS) {
                const cacheFilePath = path_1.default.join(symbolDir, `${interval}.json.gz`);
                if (fs_1.default.existsSync(cacheFilePath)) {
                    try {
                        const stats = fs_1.default.statSync(cacheFilePath);
                        const compressedData = fs_1.default.readFileSync(cacheFilePath);
                        const candles = decompress(compressedData);
                        totalCacheSize += stats.size;
                        if (Array.isArray(candles) && candles.length > 0) {
                            const intervalMs = getIntervalMs(interval);
                            intervals[interval] = {
                                candleCount: candles.length,
                                fileSize: stats.size,
                                oldestCandle: candles[0][0],
                                newestCandle: candles[candles.length - 1][0],
                                gaps: countGaps(candles, intervalMs),
                            };
                        }
                    }
                    catch (err) {
                        intervals[interval] = {
                            candleCount: 0,
                            fileSize: 0,
                            oldestCandle: null,
                            newestCandle: null,
                            gaps: 0,
                            error: "Failed to read cache file",
                        };
                    }
                }
            }
            marketStats.push({
                id: market.id,
                symbol,
                currency: market.currency,
                pair: market.pair,
                status: market.status,
                intervals,
            });
        }
        return {
            markets: marketStats,
            totalMarkets: markets.length,
            totalCacheSize,
            intervals: INTERVALS,
        };
    }
    catch (error) {
        throw (0, error_1.createError)({ statusCode: 500, message: `Failed to get chart statistics: ${error.message}` });
    }
};
