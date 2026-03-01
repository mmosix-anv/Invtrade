"use strict";
/**
 * Binary Options Payout Optimizer
 *
 * This module implements mathematically-optimized payout calculations for binary options.
 * The goal is to create fair but platform-profitable settings based on:
 *
 * 1. BREAK-EVEN MATHEMATICS:
 *    - Break-even win rate = OTM% / (ITM% + OTM%)
 *    - For 80% payout with no rebate: 100 / (100 + 80) = 55.55% required win rate
 *    - Random guess has 50% win rate, so platform has 5.55% edge
 *
 * 2. DURATION-BASED RISK:
 *    - Shorter durations = higher volatility = more random = closer to 50% outcomes
 *    - Longer durations = price trends more predictable = skilled traders win more
 *    - Solution: Lower payouts for longer durations, higher for very short (risky for traders)
 *
 * 3. BARRIER DISTANCE:
 *    - Closer barriers = harder to profit = lower trader win rate = higher payout allowed
 *    - Farther barriers = easier to profit = higher trader win rate = lower payout needed
 *
 * 4. ORDER TYPE RISK PROFILES:
 *    - RISE_FALL: Pure direction bet, ~50% random chance
 *    - HIGHER_LOWER: Barrier adds complexity, varies by distance
 *    - TOUCH_NO_TOUCH: TOUCH is harder (must hit exactly), NO_TOUCH easier
 *    - TURBO: Short-term, high volatility, more random
 *
 * KEY FORMULAS:
 *
 * Platform Edge = (Required Win Rate - Actual Win Rate) × Average Trade Size
 *
 * Optimal Payout = ((100 / Target_Break_Even_Rate) - 100)
 *   Where Target_Break_Even_Rate = 50% + Desired_Platform_Edge
 *
 * Example: 8% platform edge → 58% break-even → Payout = (100/0.58 - 100) = 72.4%
 *
 * Sources:
 * - https://www.binarytrading.com/break-even-ratios-in-binary-trading/
 * - https://www.tradingpedia.com/binary-options-academy/payout/
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.calculateOptimalPayout = calculateOptimalPayout;
exports.calculateBreakEvenRate = calculateBreakEvenRate;
exports.calculatePlatformEdge = calculatePlatformEdge;
exports.getDurationCategory = getDurationCategory;
exports.optimizeRiseFallPayout = optimizeRiseFallPayout;
exports.optimizeBarrierPayout = optimizeBarrierPayout;
exports.generateOptimizedBarrierLevels = generateOptimizedBarrierLevels;
exports.generateOptimizedDuration = generateOptimizedDuration;
exports.generateOptimizedSettings = generateOptimizedSettings;
exports.calculateExpectedPlatformProfit = calculateExpectedPlatformProfit;
exports.analyzePayoutOptimization = analyzePayoutOptimization;
exports.getPayoutSummaryTable = getPayoutSummaryTable;
// ============================================================================
// CONFIGURATION CONSTANTS
// ============================================================================
/**
 * Platform edge percentages by duration category
 * These represent the percentage above 50% that the break-even rate should be
 * Higher edge = more platform profit, but too high drives away traders
 */
const PLATFORM_EDGE_BY_DURATION = {
    // Ultra-short (30s - 1 min): High volatility, appears like gambling
    // Traders can't predict well, but they feel the risk - moderate edge acceptable
    ULTRA_SHORT: 8, // 58% break-even needed
    // Short (2-5 min): Still volatile, some analysis possible
    // Slight edge to platform, traders feel some control
    SHORT: 7, // 57% break-even needed
    // Medium (10-30 min): Trends become more predictable
    // Skilled traders can beat randomness - lower payouts compensate
    MEDIUM: 9, // 59% break-even needed
    // Long (1 hour+): Technical analysis works well
    // Lower payouts because skilled traders have real edge
    LONG: 10, // 60% break-even needed
};
/**
 * Risk multipliers by order type
 * Represents how much the base payout should be adjusted
 * Values > 1 mean higher payout allowed, < 1 means lower payout
 */
const ORDER_TYPE_RISK_MULTIPLIER = {
    // RISE_FALL: Pure 50/50 bet direction, baseline
    RISE_FALL: 1.0,
    // HIGHER_LOWER: Barrier adds complexity, depends on distance
    // Close barriers harder for trader, far barriers easier
    HIGHER_LOWER: 0.95,
    // TOUCH: Must touch exact level - harder for trader = higher payout allowed
    TOUCH: 1.15,
    // NO_TOUCH: Must NOT touch level - easier for trader = lower payout
    NO_TOUCH: 0.85,
    // CALL_PUT: Similar to HIGHER_LOWER but with strike prices
    CALL_PUT: 0.92,
    // TURBO: Ultra-short, high volatility, more random
    TURBO: 0.90,
};
/**
 * Barrier distance impact on win probability
 * Maps distance percentage to estimated trader win probability
 *
 * Logic:
 * - Very close barriers (0.05%): ~35% chance price moves that far
 * - Close barriers (0.1-0.2%): ~40-45% chance
 * - Medium barriers (0.3-0.5%): ~50-55% chance (nearly guaranteed)
 * - Far barriers (1%+): ~60-70% chance (abuse territory)
 */
const BARRIER_WIN_PROBABILITY = {
    0.03: 0.30, // 30% win rate - very hard
    0.05: 0.35, // 35% win rate - hard
    0.1: 0.42, // 42% win rate - challenging
    0.15: 0.47, // 47% win rate - moderate
    0.2: 0.52, // 52% win rate - slightly easy
    0.3: 0.58, // 58% win rate - easy
    0.5: 0.65, // 65% win rate - very easy
    1.0: 0.75, // 75% win rate - near guaranteed
    2.0: 0.85, // 85% win rate - abuse level
    5.0: 0.95, // 95% win rate - effectively guaranteed
};
// ============================================================================
// CORE CALCULATION FUNCTIONS
// ============================================================================
/**
 * Calculate optimal payout for a given target break-even rate
 *
 * Formula: Payout% = (100 / BreakEvenRate) - 100
 *
 * Example:
 * - 55% break-even: (100 / 0.55) - 100 = 81.8% payout
 * - 60% break-even: (100 / 0.60) - 100 = 66.7% payout
 */
function calculateOptimalPayout(breakEvenRate) {
    if (breakEvenRate <= 0.5) {
        // Break-even at 50% or below means payout >= 100%, which is unsustainable
        return 100; // Cap at 100%
    }
    if (breakEvenRate >= 1) {
        return 0; // Impossible to profit
    }
    const payout = (100 / breakEvenRate) - 100;
    return Math.round(payout * 10) / 10; // Round to 1 decimal
}
/**
 * Calculate required break-even rate for a given payout
 *
 * Formula: BreakEvenRate = 100 / (100 + Payout%)
 */
function calculateBreakEvenRate(payoutPercent) {
    return 100 / (100 + payoutPercent);
}
/**
 * Calculate platform edge (advantage over random trading)
 *
 * Formula: Edge = BreakEvenRate - 0.5 (assuming 50% random win rate)
 */
function calculatePlatformEdge(payoutPercent) {
    const breakEvenRate = calculateBreakEvenRate(payoutPercent);
    return (breakEvenRate - 0.5) * 100; // Return as percentage
}
/**
 * Get the duration category for a given duration in minutes
 */
function getDurationCategory(minutes) {
    if (minutes <= 1)
        return "ULTRA_SHORT";
    if (minutes <= 5)
        return "SHORT";
    if (minutes <= 30)
        return "MEDIUM";
    return "LONG";
}
/**
 * Interpolate win probability for a barrier distance
 */
function interpolateWinProbability(distancePercent) {
    const distances = Object.keys(BARRIER_WIN_PROBABILITY)
        .map(Number)
        .sort((a, b) => a - b);
    // Find surrounding points for interpolation
    let lower = distances[0];
    let upper = distances[distances.length - 1];
    for (let i = 0; i < distances.length - 1; i++) {
        if (distancePercent >= distances[i] && distancePercent <= distances[i + 1]) {
            lower = distances[i];
            upper = distances[i + 1];
            break;
        }
    }
    if (distancePercent <= lower) {
        return BARRIER_WIN_PROBABILITY[lower];
    }
    if (distancePercent >= upper) {
        return BARRIER_WIN_PROBABILITY[upper];
    }
    // Linear interpolation
    const lowerProb = BARRIER_WIN_PROBABILITY[lower];
    const upperProb = BARRIER_WIN_PROBABILITY[upper];
    const ratio = (distancePercent - lower) / (upper - lower);
    return lowerProb + (upperProb - lowerProb) * ratio;
}
// ============================================================================
// OPTIMIZER FUNCTIONS
// ============================================================================
/**
 * Calculate optimal payout for RISE_FALL based on duration
 */
function optimizeRiseFallPayout(durationMinutes) {
    const category = getDurationCategory(durationMinutes);
    const platformEdge = PLATFORM_EDGE_BY_DURATION[category];
    const breakEvenRate = (50 + platformEdge) / 100;
    const basePayout = calculateOptimalPayout(breakEvenRate);
    // Apply RISE_FALL multiplier
    return Math.round(basePayout * ORDER_TYPE_RISK_MULTIPLIER.RISE_FALL);
}
/**
 * Calculate optimal payout for a barrier level
 * Takes into account barrier distance and duration
 */
function optimizeBarrierPayout(distancePercent, durationMinutes, orderType, side) {
    // Get estimated trader win probability for this barrier distance
    const estimatedWinRate = interpolateWinProbability(distancePercent);
    // Get duration-based platform edge
    const category = getDurationCategory(durationMinutes);
    const basePlatformEdge = PLATFORM_EDGE_BY_DURATION[category];
    // Calculate target break-even based on trader's advantage
    // If trader has 60% win rate, we need higher break-even to compensate
    const adjustedBreakEven = Math.max(0.51, estimatedWinRate + (basePlatformEdge / 100));
    // Calculate base payout
    let payout = calculateOptimalPayout(adjustedBreakEven);
    // Apply order type multiplier
    if (orderType === "TOUCH_NO_TOUCH") {
        const multiplier = side === "TOUCH"
            ? ORDER_TYPE_RISK_MULTIPLIER.TOUCH
            : ORDER_TYPE_RISK_MULTIPLIER.NO_TOUCH;
        payout *= multiplier;
    }
    else if (orderType === "HIGHER_LOWER") {
        payout *= ORDER_TYPE_RISK_MULTIPLIER.HIGHER_LOWER;
    }
    else if (orderType === "TURBO") {
        payout *= ORDER_TYPE_RISK_MULTIPLIER.TURBO;
    }
    // Clamp to reasonable range
    return Math.max(30, Math.min(200, Math.round(payout)));
}
/**
 * Generate optimized barrier levels for a given order type
 */
function generateOptimizedBarrierLevels(orderType, durationMinutes = 5) {
    const levels = [];
    // Define barrier distances based on order type
    const distances = orderType === "TURBO"
        ? [0.03, 0.05, 0.08, 0.1] // Turbo: very tight barriers
        : orderType === "TOUCH_NO_TOUCH"
            ? [0.1, 0.2, 0.3, 0.5] // Touch: moderate barriers
            : [0.1, 0.2, 0.3, 0.5, 1.0]; // Higher/Lower: wider range
    const labels = {
        0.03: "Tight",
        0.05: "Close",
        0.08: "Near",
        0.1: "Near",
        0.2: "Medium",
        0.3: "Standard",
        0.5: "Far",
        1.0: "Very Far",
    };
    distances.forEach((distance, index) => {
        const payout = optimizeBarrierPayout(distance, durationMinutes, orderType);
        levels.push({
            id: `${orderType.toLowerCase()}_${index}`,
            label: `${labels[distance] || "Level"} (${distance}%)`,
            distancePercent: distance,
            profitPercent: payout,
            enabled: true,
        });
    });
    return levels;
}
/**
 * Generate optimized duration configuration
 */
function generateOptimizedDuration(minutes) {
    const category = getDurationCategory(minutes);
    const platformEdge = PLATFORM_EDGE_BY_DURATION[category];
    const breakEvenRate = (50 + platformEdge) / 100;
    const basePayout = calculateOptimalPayout(breakEvenRate);
    // Calculate per-type profit adjustments relative to base
    const adjustments = {};
    // RISE_FALL is baseline (0 adjustment)
    adjustments["RISE_FALL"] = 0;
    // HIGHER_LOWER slightly lower due to barrier advantage
    adjustments["HIGHER_LOWER"] = Math.round((ORDER_TYPE_RISK_MULTIPLIER.HIGHER_LOWER - 1) * 100);
    // TOUCH_NO_TOUCH: no adjustment at duration level (handled by barrier)
    adjustments["TOUCH_NO_TOUCH"] = 0;
    // CALL_PUT similar to HIGHER_LOWER
    adjustments["CALL_PUT"] = Math.round((ORDER_TYPE_RISK_MULTIPLIER.CALL_PUT - 1) * 100);
    // TURBO: only available for short durations
    if (minutes <= 5) {
        adjustments["TURBO"] = Math.round((ORDER_TYPE_RISK_MULTIPLIER.TURBO - 1) * 100);
    }
    return {
        id: `duration_${minutes}m`,
        minutes,
        enabled: true,
        orderTypeOverrides: {
            RISE_FALL: { enabled: true, profitAdjustment: adjustments["RISE_FALL"] },
            HIGHER_LOWER: { enabled: true, profitAdjustment: adjustments["HIGHER_LOWER"] },
            TOUCH_NO_TOUCH: { enabled: true, profitAdjustment: adjustments["TOUCH_NO_TOUCH"] },
            CALL_PUT: { enabled: true, profitAdjustment: adjustments["CALL_PUT"] },
            TURBO: { enabled: minutes <= 5, profitAdjustment: adjustments["TURBO"] || 0 },
        },
    };
}
/**
 * Generate complete optimized settings
 * This creates a balanced configuration that favors the platform
 * while remaining fair to traders
 */
function generateOptimizedSettings() {
    // Standard duration set
    const durationMinutes = [1, 2, 3, 5, 10, 15, 30, 60];
    // Generate optimized durations
    const durations = durationMinutes.map(generateOptimizedDuration);
    // Calculate base payouts for each type (using 5-minute as reference)
    const referenceDuration = 5;
    const riseFallPayout = optimizeRiseFallPayout(referenceDuration);
    return {
        orderTypes: {
            RISE_FALL: {
                enabled: true,
                profitPercentage: riseFallPayout, // ~72%
                tradingModes: { demo: true, live: true },
            },
            HIGHER_LOWER: {
                enabled: false, // Requires barrier configuration
                profitPercentage: Math.round(riseFallPayout * 0.95), // ~68%
                barrierLevels: generateOptimizedBarrierLevels("HIGHER_LOWER", referenceDuration),
                tradingModes: { demo: true, live: true },
            },
            TOUCH_NO_TOUCH: {
                enabled: false,
                profitPercentage: Math.round(riseFallPayout * 1.1), // ~79% (TOUCH side)
                touchProfitMultiplier: 1.15,
                noTouchProfitMultiplier: 0.85,
                barrierLevels: generateOptimizedBarrierLevels("TOUCH_NO_TOUCH", referenceDuration),
                tradingModes: { demo: true, live: true },
            },
            CALL_PUT: {
                enabled: false,
                profitPercentage: Math.round(riseFallPayout * 0.92), // ~66%
                strikeLevels: [
                    { id: "cp_atm", label: "At The Money (0.1%)", distancePercent: 0.1, profitPercent: 65, enabled: true },
                    { id: "cp_near", label: "Near (0.2%)", distancePercent: 0.2, profitPercent: 58, enabled: true },
                    { id: "cp_far", label: "Far (0.5%)", distancePercent: 0.5, profitPercent: 48, enabled: true },
                ],
                tradingModes: { demo: true, live: true },
            },
            TURBO: {
                enabled: false,
                profitPercentage: Math.round(riseFallPayout * 0.9), // ~65%
                barrierLevels: generateOptimizedBarrierLevels("TURBO", 1), // 1 minute reference
                payoutPerPointRange: { min: 0.1, max: 10 },
                maxDuration: 5,
                allowTicksBased: true,
                tradingModes: { demo: true, live: true },
            },
        },
        durations,
    };
}
// ============================================================================
// ANALYTICS FUNCTIONS
// ============================================================================
/**
 * Calculate expected platform profit for given settings
 * Returns profit as percentage of total volume
 */
function calculateExpectedPlatformProfit(settings) {
    var _a, _b;
    const byDuration = {};
    const byOrderType = {};
    // Calculate edge for each duration
    for (const duration of settings.durations.filter(d => d.enabled)) {
        const basePayout = settings.orderTypes.RISE_FALL.profitPercentage;
        const adjustment = ((_b = (_a = duration.orderTypeOverrides) === null || _a === void 0 ? void 0 : _a["RISE_FALL"]) === null || _b === void 0 ? void 0 : _b.profitAdjustment) || 0;
        const effectivePayout = basePayout + (basePayout * adjustment / 100);
        byDuration[duration.minutes] = calculatePlatformEdge(effectivePayout);
    }
    // Calculate edge for each order type
    for (const [type, config] of Object.entries(settings.orderTypes)) {
        if (config.enabled) {
            byOrderType[type] = calculatePlatformEdge(config.profitPercentage);
        }
    }
    // Calculate weighted average (assuming equal distribution)
    const edges = Object.values(byOrderType).filter(e => !isNaN(e));
    const overallEdge = edges.length > 0
        ? edges.reduce((sum, e) => sum + e, 0) / edges.length
        : 0;
    return { overallEdge, byDuration, byOrderType };
}
/**
 * Analyze settings and provide recommendations
 */
function analyzePayoutOptimization(settings) {
    const analysis = [];
    const warnings = [];
    const recommendations = [];
    const profit = calculateExpectedPlatformProfit(settings);
    // Overall edge analysis
    if (profit.overallEdge < 5) {
        warnings.push(`Low platform edge (${profit.overallEdge.toFixed(1)}%). Consider lowering payouts.`);
    }
    else if (profit.overallEdge > 15) {
        warnings.push(`High platform edge (${profit.overallEdge.toFixed(1)}%). May discourage traders.`);
    }
    else {
        analysis.push(`Healthy platform edge of ${profit.overallEdge.toFixed(1)}%`);
    }
    // Check for barrier abuse potential
    for (const [type, config] of Object.entries(settings.orderTypes)) {
        if (!config.enabled)
            continue;
        if ("barrierLevels" in config) {
            const barriers = config.barrierLevels || [];
            for (const barrier of barriers) {
                if (barrier.enabled && barrier.distancePercent > 1 && barrier.profitPercent > 60) {
                    warnings.push(`${type}: Barrier "${barrier.label}" has abuse potential (${barrier.distancePercent}% distance with ${barrier.profitPercent}% profit)`);
                    recommendations.push(`Reduce profit for ${type} barrier "${barrier.label}" to below 50%`);
                }
            }
        }
    }
    // Check duration payouts
    for (const duration of settings.durations.filter(d => d.enabled)) {
        const category = getDurationCategory(duration.minutes);
        const expectedEdge = PLATFORM_EDGE_BY_DURATION[category];
        const actualEdge = profit.byDuration[duration.minutes] || 0;
        if (actualEdge < expectedEdge - 2) {
            recommendations.push(`${duration.minutes}min: Consider lowering payout (current edge: ${actualEdge.toFixed(1)}%, recommended: ${expectedEdge}%)`);
        }
    }
    // Summary
    if (warnings.length === 0) {
        analysis.push("Settings appear balanced for platform profitability");
    }
    return { analysis, warnings, recommendations };
}
/**
 * Quick summary table for documentation/display
 */
function getPayoutSummaryTable() {
    const rows = [];
    rows.push("| Duration | Category | Platform Edge | Optimal Payout | Break-Even |");
    rows.push("|----------|----------|---------------|----------------|------------|");
    const durations = [1, 2, 5, 10, 30, 60];
    for (const mins of durations) {
        const category = getDurationCategory(mins);
        const edge = PLATFORM_EDGE_BY_DURATION[category];
        const breakEven = 50 + edge;
        const payout = calculateOptimalPayout(breakEven / 100);
        rows.push(`| ${mins}min | ${category} | ${edge}% | ${payout}% | ${breakEven}% |`);
    }
    return rows.join("\n");
}
