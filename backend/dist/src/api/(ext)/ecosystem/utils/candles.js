"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.intervalDurations = exports.intervals = void 0;
exports.getLatestOrdersForCandles = getLatestOrdersForCandles;
exports.normalizeToIntervalBoundary = normalizeToIntervalBoundary;
exports.fillCandleGaps = fillCandleGaps;
exports.intervals = [
    "1m",
    "3m",
    "5m",
    "15m",
    "30m",
    "1h",
    "2h",
    "4h",
    "6h",
    "12h",
    "1d",
    "3d",
    "1w",
];
// Interval durations in milliseconds
exports.intervalDurations = {
    "1m": 60 * 1000,
    "3m": 3 * 60 * 1000,
    "5m": 5 * 60 * 1000,
    "15m": 15 * 60 * 1000,
    "30m": 30 * 60 * 1000,
    "1h": 60 * 60 * 1000,
    "2h": 2 * 60 * 60 * 1000,
    "4h": 4 * 60 * 60 * 1000,
    "6h": 6 * 60 * 60 * 1000,
    "12h": 12 * 60 * 60 * 1000,
    "1d": 24 * 60 * 60 * 1000,
    "3d": 3 * 24 * 60 * 60 * 1000,
    "1w": 7 * 24 * 60 * 60 * 1000,
};
function getLatestOrdersForCandles(orders) {
    const latestOrdersMap = {};
    orders.forEach((order) => {
        if (!latestOrdersMap[order.symbol] ||
            latestOrdersMap[order.symbol].updatedAt < order.updatedAt) {
            latestOrdersMap[order.symbol] = order;
        }
    });
    return Object.values(latestOrdersMap);
}
/**
 * Normalize a timestamp to the start of its candle period.
 * This ensures candles are aligned to proper boundaries (e.g., start of day for 1d).
 */
function normalizeToIntervalBoundary(timestamp, interval) {
    const date = new Date(timestamp);
    switch (interval) {
        case "1w":
            // Align to start of week (Sunday midnight UTC)
            const dayOfWeek = date.getUTCDay();
            date.setUTCDate(date.getUTCDate() - dayOfWeek);
            date.setUTCHours(0, 0, 0, 0);
            break;
        case "3d":
            // Align to 3-day boundary from epoch
            const epochDays3 = Math.floor(date.getTime() / (3 * 24 * 60 * 60 * 1000));
            return epochDays3 * 3 * 24 * 60 * 60 * 1000;
        case "1d":
            // Align to start of day (midnight UTC)
            date.setUTCHours(0, 0, 0, 0);
            break;
        case "12h":
            // Align to 12-hour boundary (0, 12)
            const hour12 = Math.floor(date.getUTCHours() / 12) * 12;
            date.setUTCHours(hour12, 0, 0, 0);
            break;
        case "6h":
            // Align to 6-hour boundary (0, 6, 12, 18)
            const hour6 = Math.floor(date.getUTCHours() / 6) * 6;
            date.setUTCHours(hour6, 0, 0, 0);
            break;
        case "4h":
            // Align to 4-hour boundary (0, 4, 8, 12, 16, 20)
            const hour4 = Math.floor(date.getUTCHours() / 4) * 4;
            date.setUTCHours(hour4, 0, 0, 0);
            break;
        case "2h":
            // Align to 2-hour boundary
            const hour2 = Math.floor(date.getUTCHours() / 2) * 2;
            date.setUTCHours(hour2, 0, 0, 0);
            break;
        case "1h":
            // Align to start of hour
            date.setUTCMinutes(0, 0, 0);
            break;
        case "30m":
            // Align to 30-minute boundary
            const min30 = Math.floor(date.getUTCMinutes() / 30) * 30;
            date.setUTCMinutes(min30, 0, 0);
            break;
        case "15m":
            // Align to 15-minute boundary
            const min15 = Math.floor(date.getUTCMinutes() / 15) * 15;
            date.setUTCMinutes(min15, 0, 0);
            break;
        case "5m":
            // Align to 5-minute boundary
            const min5 = Math.floor(date.getUTCMinutes() / 5) * 5;
            date.setUTCMinutes(min5, 0, 0);
            break;
        case "3m":
            // Align to 3-minute boundary
            const min3 = Math.floor(date.getUTCMinutes() / 3) * 3;
            date.setUTCMinutes(min3, 0, 0);
            break;
        case "1m":
            // Align to start of minute
            date.setUTCSeconds(0, 0);
            break;
        default:
            // For unknown intervals, just truncate to seconds
            date.setUTCMilliseconds(0);
    }
    return date.getTime();
}
/**
 * Fill gaps in candle data with empty/flat candles.
 * Candle format: [time, open, high, low, close, volume]
 *
 * IMPORTANT: This function only fills gaps BETWEEN existing candles and
 * from the last candle to the requested end time. It does NOT fill gaps
 * BEFORE the first candle because that would create fake historical data.
 *
 * This function also deduplicates candles - if multiple candles exist for the
 * same normalized time slot, they are merged (keeping the one with highest volume,
 * and combining OHLCV data appropriately).
 */
function fillCandleGaps(candles, interval, fromTime, toTime, maxGapsToFill = 500) {
    const duration = exports.intervalDurations[interval] || 60000;
    if (candles.length === 0) {
        return [];
    }
    // First, deduplicate candles by normalizing timestamps and merging duplicates
    const candlesByNormalizedTime = new Map();
    for (const candle of candles) {
        const normalizedTime = normalizeToIntervalBoundary(candle[0], interval);
        const existing = candlesByNormalizedTime.get(normalizedTime);
        if (!existing) {
            // First candle for this time slot - normalize its timestamp
            candlesByNormalizedTime.set(normalizedTime, [
                normalizedTime,
                candle[1], // open
                candle[2], // high
                candle[3], // low
                candle[4], // close
                candle[5], // volume
            ]);
        }
        else {
            // Merge with existing candle:
            // - Keep open from the first one (chronologically)
            // - Update high to max of both
            // - Update low to min of both
            // - Keep close from the latest one (this candle)
            // - Sum volumes
            existing[2] = Math.max(existing[2], candle[2]); // high
            existing[3] = Math.min(existing[3], candle[3]); // low
            existing[4] = candle[4]; // close (from latest)
            existing[5] = existing[5] + candle[5]; // volume sum
        }
    }
    // Convert map to sorted array
    const sortedCandles = Array.from(candlesByNormalizedTime.values()).sort((a, b) => a[0] - b[0]);
    const result = [];
    const normalizedTo = normalizeToIntervalBoundary(toTime, interval);
    // Process each candle and fill gaps between them
    for (let i = 0; i < sortedCandles.length; i++) {
        const currentCandle = sortedCandles[i];
        result.push(currentCandle);
        // Check if there's a gap to the next candle
        if (i < sortedCandles.length - 1) {
            const nextCandle = sortedCandles[i + 1];
            const currentTime = currentCandle[0]; // Already normalized
            const nextTime = nextCandle[0]; // Already normalized
            const timeDiff = nextTime - currentTime;
            // Only fill if there's a gap of more than 1 interval
            if (timeDiff > duration * 1.5) {
                const fillPrice = currentCandle[4]; // Use current candle's close price
                let fillTime = currentTime + duration;
                let gapsFilled = 0;
                while (fillTime < nextTime && gapsFilled < maxGapsToFill) {
                    result.push([fillTime, fillPrice, fillPrice, fillPrice, fillPrice, 0]);
                    fillTime += duration;
                    gapsFilled++;
                }
            }
        }
    }
    // Fill gap from last candle to requested end time
    const lastCandle = sortedCandles[sortedCandles.length - 1];
    const lastCandleTime = lastCandle[0]; // Already normalized
    if (lastCandleTime < normalizedTo) {
        let fillTime = lastCandleTime + duration;
        let gapsFilled = 0;
        const fillPrice = lastCandle[4]; // Use last candle's close price
        while (fillTime <= normalizedTo && gapsFilled < maxGapsToFill) {
            result.push([fillTime, fillPrice, fillPrice, fillPrice, fillPrice, 0]);
            fillTime += duration;
            gapsFilled++;
        }
    }
    // Already sorted by normalized time
    return result;
}
