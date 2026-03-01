"use strict";
/**
 * Binary Trading Settings - Types, Defaults, and Utilities
 *
 * This module provides comprehensive configuration for binary trading features,
 * including order types, barrier levels, durations, and risk management.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.BINARY_PRESETS = exports.AGGRESSIVE_PRESET = exports.CONSERVATIVE_PRESET = exports.DEFAULT_BINARY_SETTINGS = void 0;
exports.validateBinarySettings = validateBinarySettings;
exports.generateWarnings = generateWarnings;
exports.findBarrierLevel = findBarrierLevel;
exports.findStrikeLevel = findStrikeLevel;
exports.calculateBarrierPrice = calculateBarrierPrice;
exports.calculateStrikePrice = calculateStrikePrice;
exports.getProfitForLevel = getProfitForLevel;
exports.isOrderTypeEnabled = isOrderTypeEnabled;
exports.getEnabledBarrierLevels = getEnabledBarrierLevels;
exports.getEnabledStrikeLevels = getEnabledStrikeLevels;
exports.getEnabledDurations = getEnabledDurations;
exports.isDurationEnabledForType = isDurationEnabledForType;
exports.mergeWithDefaults = mergeWithDefaults;
// ============================================================================
// DEFAULT SETTINGS
// ============================================================================
/**
 * Default barrier levels for HIGHER_LOWER orders
 *
 * MATHEMATICAL BASIS:
 * - Break-even rate = 100 / (100 + Payout%)
 * - Optimal Payout = (100 / Target_Break_Even) - 100
 * - Platform needs break-even > 50% to profit
 *
 * BARRIER DISTANCE IMPACT:
 * - Close barriers (0.1%): ~42% trader win rate → can offer higher payout (68%)
 * - Near barriers (0.2%): ~52% trader win rate → moderate payout (54%)
 * - Medium barriers (0.3%): ~58% trader win rate → lower payout (45%)
 * - Far barriers (0.5%+): >65% trader win rate → very low payout or disabled
 *
 * Farther barriers are EASIER for traders to win because:
 * 1. Barrier is easier to hit (for HIGHER/LOWER direction bets)
 * 2. More room for price to naturally move toward the barrier
 * 3. Less precision needed in timing
 */
const DEFAULT_HIGHER_LOWER_BARRIERS = [
    {
        id: "hl_close",
        label: "Close (0.1%)",
        distancePercent: 0.1,
        profitPercent: 68, // ~42% win rate → 59.6% break-even → platform edge 9.6%
        enabled: true,
    },
    {
        id: "hl_near",
        label: "Near (0.2%)",
        distancePercent: 0.2,
        profitPercent: 54, // ~52% win rate → 64.9% break-even → platform edge ~12.9%
        enabled: true,
    },
    {
        id: "hl_medium",
        label: "Medium (0.3%)",
        distancePercent: 0.3,
        profitPercent: 45, // ~58% win rate → 69% break-even → platform edge ~11%
        enabled: true,
    },
    {
        id: "hl_far",
        label: "Far (0.5%)",
        distancePercent: 0.5,
        profitPercent: 35, // ~65% win rate → 74% break-even → platform edge ~9%
        enabled: false, // Disabled by default - high abuse potential
    },
];
/**
 * Default barrier levels for TOUCH_NO_TOUCH orders
 *
 * TOUCH_NO_TOUCH MECHANICS:
 * - TOUCH: Price must HIT the barrier level at some point before expiry
 * - NO_TOUCH: Price must NOT hit the barrier level before expiry
 *
 * TOUCH is HARDER to win because:
 * - Price must move a specific distance AND hit exact level
 * - Requires precise movement, not just direction
 * - Far barriers are nearly impossible to touch
 *
 * NO_TOUCH is EASIER to win because:
 * - Price just needs to stay within a range
 * - Natural market noise helps avoid touching
 * - Far barriers are almost guaranteed to not touch
 *
 * Therefore: TOUCH pays higher, NO_TOUCH pays lower
 * The multipliers (touchProfitMultiplier, noTouchProfitMultiplier) adjust these payouts
 */
const DEFAULT_TOUCH_BARRIERS = [
    {
        id: "tn_close",
        label: "Close (0.1%)",
        distancePercent: 0.1,
        profitPercent: 95, // Base payout - TOUCH at 0.1% is achievable (~35% chance)
        enabled: true,
    },
    {
        id: "tn_near",
        label: "Near (0.2%)",
        distancePercent: 0.2,
        profitPercent: 120, // Higher payout - TOUCH at 0.2% is harder (~25% chance)
        enabled: true,
    },
    {
        id: "tn_medium",
        label: "Medium (0.3%)",
        distancePercent: 0.3,
        profitPercent: 150, // Much higher - TOUCH at 0.3% is quite hard (~15% chance)
        enabled: true,
    },
];
/**
 * Default strike levels for CALL_PUT orders
 *
 * CALL_PUT MECHANICS:
 * - CALL: Wins if price is ABOVE strike price at expiry
 * - PUT: Wins if price is BELOW strike price at expiry
 *
 * Strike distance affects win probability:
 * - ATM (0.1%): Near current price, ~50% chance - fair bet
 * - Near OTM (0.2%): Slightly against trader, ~45% chance
 * - OTM (0.5%): Significantly against trader, ~35% chance
 *
 * Traditional options pricing: ITM options cost more, OTM options are cheaper
 * In binary terms: OTM positions should offer higher payouts (like lottery tickets)
 */
const DEFAULT_CALL_PUT_STRIKES = [
    {
        id: "cp_atm",
        label: "At The Money (0.1%)",
        distancePercent: 0.1,
        profitPercent: 72, // ~50% win rate → 58.1% break-even → 8.1% platform edge
        enabled: true,
    },
    {
        id: "cp_near",
        label: "Near (0.2%)",
        distancePercent: 0.2,
        profitPercent: 62, // ~45% win rate → 61.7% break-even → higher platform edge
        enabled: true,
    },
    {
        id: "cp_otm",
        label: "Out of Money (0.5%)",
        distancePercent: 0.5,
        profitPercent: 48, // ~35% win rate → 67.6% break-even → platform protected
        enabled: true,
    },
];
/**
 * Default barrier levels for TURBO orders
 *
 * TURBO MECHANICS:
 * - Very short duration (30 seconds to 5 minutes)
 * - High volatility in short timeframe
 * - Price movements are more random/noise-driven
 * - Traders have less time to analyze
 *
 * TURBO RISK PROFILE:
 * - Ultra-short = high volatility = outcomes closer to random 50/50
 * - But traders FEEL the risk is high, so they accept lower payouts
 * - Platform can offer moderate payouts and still profit
 *
 * Barrier distances are TIGHTER for TURBO because:
 * - Shorter time = less price movement expected
 * - 0.05% in 30 seconds is proportionally similar to 0.5% in 1 hour
 */
const DEFAULT_TURBO_BARRIERS = [
    {
        id: "turbo_tight",
        label: "Tight (0.03%)",
        distancePercent: 0.03,
        profitPercent: 75, // ~30% win rate at this tight level → high payout ok
        enabled: true,
    },
    {
        id: "turbo_normal",
        label: "Normal (0.05%)",
        distancePercent: 0.05,
        profitPercent: 65, // ~35% win rate → moderate payout
        enabled: true,
    },
    {
        id: "turbo_wide",
        label: "Wide (0.1%)",
        distancePercent: 0.1,
        profitPercent: 52, // ~42% win rate → lower payout
        enabled: true,
    },
];
/**
 * Default durations available for trading
 *
 * DURATION-BASED PAYOUT OPTIMIZATION:
 *
 * Each duration has a different risk profile that affects optimal payouts:
 *
 * ULTRA-SHORT (1-2 min):
 * - High volatility, outcomes close to random
 * - Traders can't apply meaningful analysis
 * - Platform edge: ~8% (58% break-even needed)
 * - Higher base payout acceptable (traders accept gambling-like odds)
 *
 * SHORT (3-5 min):
 * - Some patterns visible, still volatile
 * - Basic momentum analysis possible
 * - Platform edge: ~7% (57% break-even needed)
 *
 * MEDIUM (10-30 min):
 * - Trends become predictable
 * - Technical analysis works better
 * - Platform edge: ~9% (59% break-even needed)
 * - Lower payouts compensate for skilled traders
 *
 * LONG (60+ min):
 * - Full technical analysis applicable
 * - Skilled traders have significant edge
 * - Platform edge: ~10% (60% break-even needed)
 * - Lowest payouts to protect platform
 *
 * Profit adjustments are relative percentages applied to base payout:
 * - Negative values reduce payout (longer/easier durations)
 * - Positive values increase payout (shorter/harder durations)
 */
const DEFAULT_DURATIONS = [
    {
        id: "d_1m",
        minutes: 1,
        enabled: true,
        orderTypeOverrides: {
            RISE_FALL: { enabled: true, profitAdjustment: 5 }, // Bonus for ultra-short
            HIGHER_LOWER: { enabled: true, profitAdjustment: 3 },
            TOUCH_NO_TOUCH: { enabled: true, profitAdjustment: 5 },
            CALL_PUT: { enabled: true, profitAdjustment: 3 },
            TURBO: { enabled: true, profitAdjustment: 0 }, // TURBO baseline
        },
    },
    {
        id: "d_2m",
        minutes: 2,
        enabled: true,
        orderTypeOverrides: {
            RISE_FALL: { enabled: true, profitAdjustment: 3 },
            HIGHER_LOWER: { enabled: true, profitAdjustment: 2 },
            TOUCH_NO_TOUCH: { enabled: true, profitAdjustment: 3 },
            CALL_PUT: { enabled: true, profitAdjustment: 2 },
            TURBO: { enabled: true, profitAdjustment: -2 },
        },
    },
    {
        id: "d_3m",
        minutes: 3,
        enabled: true,
        orderTypeOverrides: {
            RISE_FALL: { enabled: true, profitAdjustment: 0 },
            HIGHER_LOWER: { enabled: true, profitAdjustment: 0 },
            TOUCH_NO_TOUCH: { enabled: true, profitAdjustment: 0 },
            CALL_PUT: { enabled: true, profitAdjustment: 0 },
            TURBO: { enabled: true, profitAdjustment: -5 },
        },
    },
    {
        id: "d_5m",
        minutes: 5,
        enabled: true,
        orderTypeOverrides: {
            RISE_FALL: { enabled: true, profitAdjustment: 0 },
            HIGHER_LOWER: { enabled: true, profitAdjustment: -2 },
            TOUCH_NO_TOUCH: { enabled: true, profitAdjustment: 0 },
            CALL_PUT: { enabled: true, profitAdjustment: -2 },
            TURBO: { enabled: true, profitAdjustment: -8 }, // TURBO less attractive at 5min
        },
    },
    {
        id: "d_10m",
        minutes: 10,
        enabled: true,
        orderTypeOverrides: {
            RISE_FALL: { enabled: true, profitAdjustment: -3 },
            HIGHER_LOWER: { enabled: true, profitAdjustment: -5 },
            TOUCH_NO_TOUCH: { enabled: true, profitAdjustment: -3 },
            CALL_PUT: { enabled: true, profitAdjustment: -5 },
            TURBO: { enabled: false, profitAdjustment: 0 }, // TURBO disabled for 10min+
        },
    },
    {
        id: "d_15m",
        minutes: 15,
        enabled: true,
        orderTypeOverrides: {
            RISE_FALL: { enabled: true, profitAdjustment: -5 },
            HIGHER_LOWER: { enabled: true, profitAdjustment: -7 },
            TOUCH_NO_TOUCH: { enabled: true, profitAdjustment: -5 },
            CALL_PUT: { enabled: true, profitAdjustment: -7 },
            TURBO: { enabled: false, profitAdjustment: 0 },
        },
    },
    {
        id: "d_30m",
        minutes: 30,
        enabled: true,
        orderTypeOverrides: {
            RISE_FALL: { enabled: true, profitAdjustment: -8 },
            HIGHER_LOWER: { enabled: true, profitAdjustment: -10 },
            TOUCH_NO_TOUCH: { enabled: true, profitAdjustment: -8 },
            CALL_PUT: { enabled: true, profitAdjustment: -10 },
            TURBO: { enabled: false, profitAdjustment: 0 },
        },
    },
    {
        id: "d_1h",
        minutes: 60,
        enabled: true,
        orderTypeOverrides: {
            RISE_FALL: { enabled: true, profitAdjustment: -12 },
            HIGHER_LOWER: { enabled: true, profitAdjustment: -15 },
            TOUCH_NO_TOUCH: { enabled: true, profitAdjustment: -12 },
            CALL_PUT: { enabled: true, profitAdjustment: -15 },
            TURBO: { enabled: false, profitAdjustment: 0 },
        },
    },
];
/**
 * Default binary settings - Balanced preset with only RISE_FALL enabled
 *
 * PAYOUT OPTIMIZATION SUMMARY:
 *
 * Break-even formula: BE% = 100 / (100 + Payout%)
 *
 * Target platform edges:
 * - RISE_FALL: 8% edge → 58% break-even → 72% payout
 * - HIGHER_LOWER: 8-12% edge (barrier-dependent)
 * - TOUCH_NO_TOUCH: Variable (TOUCH is harder, higher payout)
 * - CALL_PUT: 8-10% edge
 * - TURBO: 9% edge (high volatility compensates)
 *
 * Duration adjustments further modify these base payouts:
 * - 1-2 min: +3% to +5% (ultra-short, more random)
 * - 3-5 min: baseline (0%)
 * - 10-30 min: -3% to -10% (trends predictable)
 * - 60 min+: -12% to -15% (skilled traders dominate)
 */
/**
 * Default cancellation rules
 *
 * CANCELLATION LOGIC:
 * - RISE_FALL: Simple type, allow cancellation with small penalty
 * - HIGHER_LOWER: Allow cancellation with moderate penalty
 * - TOUCH_NO_TOUCH: Disallow after barrier touch (checked separately)
 * - CALL_PUT: Allow cancellation with penalty similar to options
 * - TURBO: Generally disallow - too short and volatile
 */
const DEFAULT_CANCELLATION_SETTINGS = {
    enabled: true,
    rules: {
        RISE_FALL: {
            enabled: true,
            minTimeBeforeExpirySeconds: 30,
            penaltyPercentage: 10,
            penaltyByTimeRemaining: {
                above60Seconds: 5,
                above30Seconds: 10,
                below30Seconds: 20,
            },
        },
        HIGHER_LOWER: {
            enabled: true,
            minTimeBeforeExpirySeconds: 30,
            penaltyPercentage: 15,
            penaltyByTimeRemaining: {
                above60Seconds: 10,
                above30Seconds: 15,
                below30Seconds: 25,
            },
        },
        TOUCH_NO_TOUCH: {
            enabled: false, // Cannot cancel after barrier touch (checked separately)
            minTimeBeforeExpirySeconds: 60,
            penaltyPercentage: 20,
        },
        CALL_PUT: {
            enabled: true,
            minTimeBeforeExpirySeconds: 60,
            penaltyPercentage: 15,
            penaltyByTimeRemaining: {
                above60Seconds: 10,
                above30Seconds: 15,
                below30Seconds: 25,
            },
        },
        TURBO: {
            enabled: false, // Turbo is too short for cancellation
            minTimeBeforeExpirySeconds: 0,
            penaltyPercentage: 0,
        },
    },
};
exports.DEFAULT_BINARY_SETTINGS = {
    global: {
        enabled: true,
        practiceEnabled: true,
        maxConcurrentOrders: 10,
        maxDailyOrders: 100,
        cooldownSeconds: 3, // 3 second cooldown prevents spam
        orderExpirationBuffer: 30, // Block orders within 30 seconds of expiry
        cancelExpirationBuffer: 60, // Block cancellations within 60 seconds of expiry
    },
    display: {
        chartType: "CHART_ENGINE", // Default to Chart Engine addon (falls back to TradingView if not installed)
    },
    cancellation: DEFAULT_CANCELLATION_SETTINGS,
    orderTypes: {
        RISE_FALL: {
            enabled: true, // Only RISE_FALL enabled by default
            profitPercentage: 72, // 58.1% break-even → ~8.1% platform edge
            tradingModes: { demo: true, live: true }, // Available in both modes
        },
        HIGHER_LOWER: {
            enabled: false, // Must be manually enabled
            profitPercentage: 68, // Base (barrier levels override this)
            barrierLevels: DEFAULT_HIGHER_LOWER_BARRIERS,
            tradingModes: { demo: true, live: true },
        },
        TOUCH_NO_TOUCH: {
            enabled: false, // Must be manually enabled
            profitPercentage: 95, // Base for TOUCH (barrier levels override)
            barrierLevels: DEFAULT_TOUCH_BARRIERS,
            touchProfitMultiplier: 1.2, // TOUCH gets 20% more (harder to win)
            noTouchProfitMultiplier: 0.7, // NO_TOUCH gets 30% less (easier to win)
            tradingModes: { demo: true, live: true },
        },
        CALL_PUT: {
            enabled: false, // Must be manually enabled
            profitPercentage: 72, // Base (strike levels override this)
            strikeLevels: DEFAULT_CALL_PUT_STRIKES,
            tradingModes: { demo: true, live: true },
        },
        TURBO: {
            enabled: false, // Must be manually enabled
            profitPercentage: 65, // Base (barrier levels override this)
            barrierLevels: DEFAULT_TURBO_BARRIERS,
            payoutPerPointRange: { min: 0.1, max: 10 },
            maxDuration: 5, // Max 5 minutes for TURBO
            allowTicksBased: true,
            tradingModes: { demo: true, live: true },
        },
    },
    durations: DEFAULT_DURATIONS,
    riskManagement: {
        dailyLossLimit: 0, // 0 = disabled
        winRateAlert: 65, // Alert if user wins more than 65% (suspicious)
    },
    _preset: "balanced",
    _lastModified: new Date().toISOString(),
};
// ============================================================================
// PRESETS
// ============================================================================
/**
 * Conservative preset - Low risk, lower profits
 * Suitable for new platforms or risk-averse operators
 *
 * PAYOUT OPTIMIZATION (Conservative):
 * - Higher platform edge (10-12%) for safer margins
 * - Lower max amounts to limit exposure
 * - Fewer barrier levels to reduce complexity
 * - Only short/medium durations to limit skilled trader advantage
 */
exports.CONSERVATIVE_PRESET = {
    global: {
        enabled: true,
        practiceEnabled: true,
        maxConcurrentOrders: 5,
        maxDailyOrders: 50,
        cooldownSeconds: 5,
        orderExpirationBuffer: 45, // More conservative - 45 seconds
        cancelExpirationBuffer: 90, // More conservative - 90 seconds
    },
    display: {
        chartType: "CHART_ENGINE",
    },
    cancellation: {
        enabled: true,
        rules: {
            RISE_FALL: {
                enabled: true,
                minTimeBeforeExpirySeconds: 45,
                penaltyPercentage: 15, // Higher penalty in conservative mode
            },
            HIGHER_LOWER: {
                enabled: true,
                minTimeBeforeExpirySeconds: 45,
                penaltyPercentage: 20,
            },
            TOUCH_NO_TOUCH: {
                enabled: false,
                minTimeBeforeExpirySeconds: 90,
                penaltyPercentage: 25,
            },
            CALL_PUT: {
                enabled: true,
                minTimeBeforeExpirySeconds: 90,
                penaltyPercentage: 20,
            },
            TURBO: {
                enabled: false,
                minTimeBeforeExpirySeconds: 0,
                penaltyPercentage: 0,
            },
        },
    },
    orderTypes: {
        RISE_FALL: {
            enabled: true,
            profitPercentage: 65, // 60.6% break-even → ~10.6% platform edge (conservative)
            tradingModes: { demo: true, live: true },
        },
        HIGHER_LOWER: {
            enabled: false,
            profitPercentage: 60, // Base (barrier levels override)
            tradingModes: { demo: true, live: true },
            barrierLevels: [
                {
                    id: "hl_close",
                    label: "Close (0.1%)",
                    distancePercent: 0.1,
                    profitPercent: 62, // ~42% win rate → tight margins
                    enabled: true,
                },
                {
                    id: "hl_near",
                    label: "Near (0.2%)",
                    distancePercent: 0.2,
                    profitPercent: 48, // ~52% win rate → platform protected
                    enabled: true,
                },
                // No far barriers in conservative - too risky
            ],
        },
        TOUCH_NO_TOUCH: {
            enabled: false,
            profitPercentage: 85, // Lower than default for safety
            touchProfitMultiplier: 1.3, // TOUCH gets 30% more
            noTouchProfitMultiplier: 0.65, // NO_TOUCH gets 35% less
            tradingModes: { demo: true, live: true },
            barrierLevels: [
                {
                    id: "tn_close",
                    label: "Close (0.1%)",
                    distancePercent: 0.1,
                    profitPercent: 80, // ~35% TOUCH win rate
                    enabled: true,
                },
                {
                    id: "tn_near",
                    label: "Near (0.2%)",
                    distancePercent: 0.2,
                    profitPercent: 100, // ~25% TOUCH win rate
                    enabled: true,
                },
                // No far barriers in conservative
            ],
        },
        CALL_PUT: {
            enabled: false,
            profitPercentage: 62, // Conservative base
            tradingModes: { demo: true, live: true },
            strikeLevels: [
                {
                    id: "cp_atm",
                    label: "At The Money (0.1%)",
                    distancePercent: 0.1,
                    profitPercent: 62, // ~50% win rate
                    enabled: true,
                },
                {
                    id: "cp_near",
                    label: "Near (0.2%)",
                    distancePercent: 0.2,
                    profitPercent: 52, // ~45% win rate
                    enabled: true,
                },
                // No OTM strikes in conservative
            ],
        },
        TURBO: {
            enabled: false,
            profitPercentage: 58, // Lower turbo payout for safety
            tradingModes: { demo: true, live: true },
            barrierLevels: [
                {
                    id: "turbo_tight",
                    label: "Tight (0.03%)",
                    distancePercent: 0.03,
                    profitPercent: 65, // ~30% win rate
                    enabled: true,
                },
                {
                    id: "turbo_normal",
                    label: "Normal (0.05%)",
                    distancePercent: 0.05,
                    profitPercent: 55, // ~35% win rate
                    enabled: true,
                },
            ],
            payoutPerPointRange: { min: 0.1, max: 5 },
            maxDuration: 3,
            allowTicksBased: false,
        },
    },
    durations: [
        {
            id: "d_1m",
            minutes: 1,
            enabled: true,
            orderTypeOverrides: {
                RISE_FALL: { enabled: true, profitAdjustment: 3 },
                HIGHER_LOWER: { enabled: true, profitAdjustment: 2 },
                TOUCH_NO_TOUCH: { enabled: true, profitAdjustment: 3 },
                CALL_PUT: { enabled: true, profitAdjustment: 2 },
                TURBO: { enabled: true, profitAdjustment: 0 },
            },
        },
        {
            id: "d_3m",
            minutes: 3,
            enabled: true,
            orderTypeOverrides: {
                RISE_FALL: { enabled: true, profitAdjustment: 0 },
                HIGHER_LOWER: { enabled: true, profitAdjustment: 0 },
                TOUCH_NO_TOUCH: { enabled: true, profitAdjustment: 0 },
                CALL_PUT: { enabled: true, profitAdjustment: 0 },
                TURBO: { enabled: true, profitAdjustment: -3 },
            },
        },
        {
            id: "d_5m",
            minutes: 5,
            enabled: true,
            orderTypeOverrides: {
                RISE_FALL: { enabled: true, profitAdjustment: -3 },
                HIGHER_LOWER: { enabled: true, profitAdjustment: -4 },
                TOUCH_NO_TOUCH: { enabled: true, profitAdjustment: -3 },
                CALL_PUT: { enabled: true, profitAdjustment: -4 },
                TURBO: { enabled: false, profitAdjustment: 0 },
            },
        },
        {
            id: "d_15m",
            minutes: 15,
            enabled: true,
            orderTypeOverrides: {
                RISE_FALL: { enabled: true, profitAdjustment: -8 },
                HIGHER_LOWER: { enabled: true, profitAdjustment: -10 },
                TOUCH_NO_TOUCH: { enabled: true, profitAdjustment: -8 },
                CALL_PUT: { enabled: true, profitAdjustment: -10 },
                TURBO: { enabled: false, profitAdjustment: 0 },
            },
        },
        // No 30min+ durations in conservative - skilled traders dominate
    ],
    riskManagement: {
        dailyLossLimit: 1000,
        winRateAlert: 60, // Lower threshold - catch abuse early
    },
    _preset: "conservative",
    _lastModified: new Date().toISOString(),
};
/**
 * Aggressive preset - Higher profits, more features
 * Suitable for established platforms with good risk management
 *
 * PAYOUT OPTIMIZATION (Aggressive):
 * - Lower platform edge (5-7%) to attract more traders
 * - Higher payouts make the platform more competitive
 * - More barrier levels and durations for flexibility
 * - Risk management relies on volume over margin
 *
 * WARNING: This preset offers higher payouts which reduces platform edge.
 * Only use if you have strong volume and good risk monitoring.
 */
exports.AGGRESSIVE_PRESET = {
    global: {
        enabled: true,
        practiceEnabled: true,
        maxConcurrentOrders: 20,
        maxDailyOrders: 200,
        cooldownSeconds: 0,
        orderExpirationBuffer: 15, // More lenient - 15 seconds
        cancelExpirationBuffer: 30, // More lenient - 30 seconds
    },
    display: {
        chartType: "CHART_ENGINE",
    },
    cancellation: {
        enabled: true,
        rules: {
            RISE_FALL: {
                enabled: true,
                minTimeBeforeExpirySeconds: 15,
                penaltyPercentage: 5, // Lower penalty in aggressive mode
                penaltyByTimeRemaining: {
                    above60Seconds: 2,
                    above30Seconds: 5,
                    below30Seconds: 10,
                },
            },
            HIGHER_LOWER: {
                enabled: true,
                minTimeBeforeExpirySeconds: 15,
                penaltyPercentage: 8,
                penaltyByTimeRemaining: {
                    above60Seconds: 3,
                    above30Seconds: 8,
                    below30Seconds: 15,
                },
            },
            TOUCH_NO_TOUCH: {
                enabled: true, // Enabled in aggressive
                minTimeBeforeExpirySeconds: 30,
                penaltyPercentage: 10,
            },
            CALL_PUT: {
                enabled: true,
                minTimeBeforeExpirySeconds: 30,
                penaltyPercentage: 8,
                penaltyByTimeRemaining: {
                    above60Seconds: 3,
                    above30Seconds: 8,
                    below30Seconds: 15,
                },
            },
            TURBO: {
                enabled: true, // Enabled in aggressive with penalty
                minTimeBeforeExpirySeconds: 10,
                penaltyPercentage: 25, // High penalty for turbo cancellation
            },
        },
    },
    orderTypes: {
        RISE_FALL: {
            enabled: true,
            profitPercentage: 82, // 54.9% break-even → ~4.9% platform edge (aggressive)
            tradingModes: { demo: true, live: true },
        },
        HIGHER_LOWER: {
            enabled: true, // Enabled in aggressive preset
            profitPercentage: 78, // Base (barrier levels override)
            tradingModes: { demo: true, live: true },
            barrierLevels: [
                {
                    id: "hl_close",
                    label: "Close (0.1%)",
                    distancePercent: 0.1,
                    profitPercent: 78, // ~42% win rate → good payout for difficulty
                    enabled: true,
                },
                {
                    id: "hl_near",
                    label: "Near (0.2%)",
                    distancePercent: 0.2,
                    profitPercent: 65, // ~52% win rate
                    enabled: true,
                },
                {
                    id: "hl_medium",
                    label: "Medium (0.3%)",
                    distancePercent: 0.3,
                    profitPercent: 55, // ~58% win rate
                    enabled: true,
                },
                {
                    id: "hl_far",
                    label: "Far (0.5%)",
                    distancePercent: 0.5,
                    profitPercent: 42, // ~65% win rate → lower payout
                    enabled: true,
                },
            ],
        },
        TOUCH_NO_TOUCH: {
            enabled: false, // Still needs manual enable
            profitPercentage: 110, // Base for TOUCH
            tradingModes: { demo: true, live: true },
            barrierLevels: [
                {
                    id: "tn_close",
                    label: "Close (0.1%)",
                    distancePercent: 0.1,
                    profitPercent: 110, // ~35% TOUCH win rate
                    enabled: true,
                },
                {
                    id: "tn_near",
                    label: "Near (0.2%)",
                    distancePercent: 0.2,
                    profitPercent: 140, // ~25% TOUCH win rate
                    enabled: true,
                },
                {
                    id: "tn_medium",
                    label: "Medium (0.3%)",
                    distancePercent: 0.3,
                    profitPercent: 180, // ~15% TOUCH win rate
                    enabled: true,
                },
                {
                    id: "tn_far",
                    label: "Far (0.5%)",
                    distancePercent: 0.5,
                    profitPercent: 230, // ~10% TOUCH win rate - high risk, high reward
                    enabled: true,
                },
            ],
            touchProfitMultiplier: 1.15, // TOUCH gets 15% more
            noTouchProfitMultiplier: 0.75, // NO_TOUCH gets 25% less
        },
        CALL_PUT: {
            enabled: false,
            profitPercentage: 80, // Competitive base
            tradingModes: { demo: true, live: true },
            strikeLevels: [
                {
                    id: "cp_atm",
                    label: "At The Money (0.1%)",
                    distancePercent: 0.1,
                    profitPercent: 80, // ~50% win rate
                    enabled: true,
                },
                {
                    id: "cp_near",
                    label: "Near (0.2%)",
                    distancePercent: 0.2,
                    profitPercent: 70, // ~45% win rate
                    enabled: true,
                },
                {
                    id: "cp_otm",
                    label: "Out of Money (0.5%)",
                    distancePercent: 0.5,
                    profitPercent: 55, // ~35% win rate
                    enabled: true,
                },
            ],
        },
        TURBO: {
            enabled: false,
            profitPercentage: 75, // Higher turbo payout
            tradingModes: { demo: true, live: true },
            barrierLevels: [
                {
                    id: "turbo_tight",
                    label: "Tight (0.03%)",
                    distancePercent: 0.03,
                    profitPercent: 85, // ~30% win rate
                    enabled: true,
                },
                {
                    id: "turbo_normal",
                    label: "Normal (0.05%)",
                    distancePercent: 0.05,
                    profitPercent: 75, // ~35% win rate
                    enabled: true,
                },
                {
                    id: "turbo_wide",
                    label: "Wide (0.1%)",
                    distancePercent: 0.1,
                    profitPercent: 60, // ~42% win rate
                    enabled: true,
                },
            ],
            payoutPerPointRange: { min: 0.1, max: 20 },
            maxDuration: 5,
            allowTicksBased: true,
        },
    },
    durations: [
        {
            id: "d_1m",
            minutes: 1,
            enabled: true,
            orderTypeOverrides: {
                RISE_FALL: { enabled: true, profitAdjustment: 5 }, // Bonus for ultra-short
                HIGHER_LOWER: { enabled: true, profitAdjustment: 4 },
                TOUCH_NO_TOUCH: { enabled: true, profitAdjustment: 5 },
                CALL_PUT: { enabled: true, profitAdjustment: 4 },
                TURBO: { enabled: true, profitAdjustment: 2 },
            },
        },
        {
            id: "d_2m",
            minutes: 2,
            enabled: true,
            orderTypeOverrides: {
                RISE_FALL: { enabled: true, profitAdjustment: 3 },
                HIGHER_LOWER: { enabled: true, profitAdjustment: 2 },
                TOUCH_NO_TOUCH: { enabled: true, profitAdjustment: 3 },
                CALL_PUT: { enabled: true, profitAdjustment: 2 },
                TURBO: { enabled: true, profitAdjustment: 0 },
            },
        },
        {
            id: "d_3m",
            minutes: 3,
            enabled: true,
            orderTypeOverrides: {
                RISE_FALL: { enabled: true, profitAdjustment: 0 },
                HIGHER_LOWER: { enabled: true, profitAdjustment: 0 },
                TOUCH_NO_TOUCH: { enabled: true, profitAdjustment: 0 },
                CALL_PUT: { enabled: true, profitAdjustment: 0 },
                TURBO: { enabled: true, profitAdjustment: -3 },
            },
        },
        {
            id: "d_5m",
            minutes: 5,
            enabled: true,
            orderTypeOverrides: {
                RISE_FALL: { enabled: true, profitAdjustment: 0 },
                HIGHER_LOWER: { enabled: true, profitAdjustment: -2 },
                TOUCH_NO_TOUCH: { enabled: true, profitAdjustment: 0 },
                CALL_PUT: { enabled: true, profitAdjustment: -2 },
                TURBO: { enabled: true, profitAdjustment: -5 },
            },
        },
        {
            id: "d_10m",
            minutes: 10,
            enabled: true,
            orderTypeOverrides: {
                RISE_FALL: { enabled: true, profitAdjustment: -2 },
                HIGHER_LOWER: { enabled: true, profitAdjustment: -4 },
                TOUCH_NO_TOUCH: { enabled: true, profitAdjustment: -2 },
                CALL_PUT: { enabled: true, profitAdjustment: -4 },
                TURBO: { enabled: false, profitAdjustment: 0 },
            },
        },
        {
            id: "d_15m",
            minutes: 15,
            enabled: true,
            orderTypeOverrides: {
                RISE_FALL: { enabled: true, profitAdjustment: -4 },
                HIGHER_LOWER: { enabled: true, profitAdjustment: -6 },
                TOUCH_NO_TOUCH: { enabled: true, profitAdjustment: -4 },
                CALL_PUT: { enabled: true, profitAdjustment: -6 },
                TURBO: { enabled: false, profitAdjustment: 0 },
            },
        },
        {
            id: "d_30m",
            minutes: 30,
            enabled: true,
            orderTypeOverrides: {
                RISE_FALL: { enabled: true, profitAdjustment: -6 },
                HIGHER_LOWER: { enabled: true, profitAdjustment: -8 },
                TOUCH_NO_TOUCH: { enabled: true, profitAdjustment: -6 },
                CALL_PUT: { enabled: true, profitAdjustment: -8 },
                TURBO: { enabled: false, profitAdjustment: 0 },
            },
        },
        {
            id: "d_1h",
            minutes: 60,
            enabled: true,
            orderTypeOverrides: {
                RISE_FALL: { enabled: true, profitAdjustment: -10 },
                HIGHER_LOWER: { enabled: true, profitAdjustment: -12 },
                TOUCH_NO_TOUCH: { enabled: true, profitAdjustment: -10 },
                CALL_PUT: { enabled: true, profitAdjustment: -12 },
                TURBO: { enabled: false, profitAdjustment: 0 },
            },
        },
        {
            id: "d_4h",
            minutes: 240,
            enabled: true,
            orderTypeOverrides: {
                RISE_FALL: { enabled: true, profitAdjustment: -15 },
                HIGHER_LOWER: { enabled: true, profitAdjustment: -18 },
                TOUCH_NO_TOUCH: { enabled: true, profitAdjustment: -15 },
                CALL_PUT: { enabled: true, profitAdjustment: -18 },
                TURBO: { enabled: false, profitAdjustment: 0 },
            },
        },
    ],
    riskManagement: {
        dailyLossLimit: 0, // Disabled - rely on volume
        winRateAlert: 75, // Higher threshold for established platforms
    },
    _preset: "aggressive",
    _lastModified: new Date().toISOString(),
};
/**
 * All available presets
 */
exports.BINARY_PRESETS = {
    conservative: exports.CONSERVATIVE_PRESET,
    balanced: exports.DEFAULT_BINARY_SETTINGS,
    aggressive: exports.AGGRESSIVE_PRESET,
};
// ============================================================================
// VALIDATION FUNCTIONS
// ============================================================================
/**
 * Validate binary settings configuration
 */
function validateBinarySettings(settings) {
    const errors = [];
    const warnings = [];
    // Validate global settings
    if (settings.global.maxConcurrentOrders < 1) {
        errors.push("Max concurrent orders must be at least 1");
    }
    // Validate order types
    for (const [typeName, config] of Object.entries(settings.orderTypes)) {
        if (config.profitPercentage < 0 || config.profitPercentage > 1000) {
            errors.push(`${typeName}: Profit percentage must be between 0 and 1000`);
        }
        // Validate barrier levels for applicable types
        if ("barrierLevels" in config) {
            const barrierConfig = config;
            if (!barrierConfig.barrierLevels || barrierConfig.barrierLevels.length === 0) {
                if (config.enabled) {
                    errors.push(`${typeName}: At least one barrier level is required when enabled`);
                }
            }
            else {
                for (const level of barrierConfig.barrierLevels) {
                    if (level.distancePercent <= 0) {
                        errors.push(`${typeName}: Barrier distance must be positive`);
                    }
                    if (level.profitPercent < 0 || level.profitPercent > 1000) {
                        errors.push(`${typeName}: Barrier profit must be between 0 and 1000`);
                    }
                }
            }
        }
        // Validate strike levels for CALL_PUT
        if ("strikeLevels" in config) {
            const strikeConfig = config;
            if (!strikeConfig.strikeLevels || strikeConfig.strikeLevels.length === 0) {
                if (config.enabled) {
                    errors.push(`${typeName}: At least one strike level is required when enabled`);
                }
            }
        }
    }
    // Validate durations
    if (!settings.durations || settings.durations.length === 0) {
        errors.push("At least one duration is required");
    }
    else {
        const enabledDurations = settings.durations.filter((d) => d.enabled);
        if (enabledDurations.length === 0) {
            errors.push("At least one duration must be enabled");
        }
        for (const duration of settings.durations) {
            if (duration.minutes < 1) {
                errors.push(`Duration must be at least 1 minute`);
            }
        }
    }
    return {
        valid: errors.length === 0,
        errors,
        warnings: generateWarnings(settings),
    };
}
/**
 * Generate warnings for potentially risky configurations
 */
function generateWarnings(settings) {
    const warnings = [];
    // Check for high barrier distances (easy wins)
    const higherLowerConfig = settings.orderTypes.HIGHER_LOWER;
    if (higherLowerConfig.enabled && higherLowerConfig.barrierLevels) {
        const maxDistance = Math.max(...higherLowerConfig.barrierLevels
            .filter((l) => l.enabled)
            .map((l) => l.distancePercent));
        if (maxDistance > 2) {
            warnings.push({
                level: "danger",
                category: "Barrier Risk",
                message: `HIGHER_LOWER max barrier distance (${maxDistance}%) allows nearly guaranteed wins`,
                suggestion: "Reduce max barrier distance to 1% or less, or reduce profit for far barriers",
                field: "orderTypes.HIGHER_LOWER.barrierLevels",
            });
        }
        else if (maxDistance > 1) {
            warnings.push({
                level: "warning",
                category: "Barrier Risk",
                message: `HIGHER_LOWER barrier distance (${maxDistance}%) may be too easy`,
                suggestion: "Consider reducing profit percentage for farther barriers",
                field: "orderTypes.HIGHER_LOWER.barrierLevels",
            });
        }
    }
    // Check for high profit percentages
    const avgProfit = calculateAverageProfit(settings);
    if (avgProfit > 90) {
        warnings.push({
            level: "warning",
            category: "Profitability",
            message: `Average profit (${avgProfit.toFixed(1)}%) may not be sustainable`,
            suggestion: "Consider reducing profit percentages or adding more barrier tiers",
        });
    }
    // Check for no durations
    const enabledDurations = settings.durations.filter((d) => d.enabled);
    if (enabledDurations.length === 0) {
        warnings.push({
            level: "danger",
            category: "Configuration",
            message: "No durations are enabled - trading will not work",
            suggestion: "Enable at least one duration",
            field: "durations",
        });
    }
    // Check for missing risk limits
    if (settings.riskManagement.dailyLossLimit === 0) {
        warnings.push({
            level: "info",
            category: "Risk Management",
            message: "No daily loss limit is configured",
            suggestion: "Consider setting a daily loss limit to prevent large losses",
            field: "riskManagement",
        });
    }
    // Check TOUCH_NO_TOUCH profit
    const touchConfig = settings.orderTypes.TOUCH_NO_TOUCH;
    if (touchConfig.enabled) {
        const minTouchProfit = Math.min(...touchConfig.barrierLevels.filter((l) => l.enabled).map((l) => l.profitPercent));
        if (minTouchProfit < 150) {
            warnings.push({
                level: "info",
                category: "Configuration",
                message: `TOUCH profit (${minTouchProfit}%) is low for a difficult trade type`,
                suggestion: "TOUCH trades are harder to win - consider higher profit percentage",
                field: "orderTypes.TOUCH_NO_TOUCH",
            });
        }
    }
    // Check TURBO duration
    const turboConfig = settings.orderTypes.TURBO;
    if (turboConfig.enabled && turboConfig.maxDuration > 5) {
        warnings.push({
            level: "warning",
            category: "Configuration",
            message: `TURBO max duration (${turboConfig.maxDuration} min) is longer than typical`,
            suggestion: "Turbo trades are meant to be short (1-5 minutes)",
            field: "orderTypes.TURBO.maxDuration",
        });
    }
    // Check for all types having same profit (no differentiation)
    const enabledTypes = Object.entries(settings.orderTypes)
        .filter(([_, config]) => config.enabled)
        .map(([_, config]) => config.profitPercentage);
    if (enabledTypes.length > 1 && new Set(enabledTypes).size === 1) {
        warnings.push({
            level: "info",
            category: "Configuration",
            message: "All enabled order types have the same profit percentage",
            suggestion: "Consider differentiating profits based on trade difficulty",
        });
    }
    return warnings;
}
/**
 * Calculate average profit percentage across enabled types
 */
function calculateAverageProfit(settings) {
    const enabledConfigs = Object.values(settings.orderTypes).filter((config) => config.enabled);
    if (enabledConfigs.length === 0)
        return 0;
    const sum = enabledConfigs.reduce((acc, config) => acc + config.profitPercentage, 0);
    return sum / enabledConfigs.length;
}
// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================
/**
 * Find a barrier level by ID in any order type
 */
function findBarrierLevel(settings, orderType, levelId) {
    const config = settings.orderTypes[orderType];
    if ("barrierLevels" in config) {
        const barrierConfig = config;
        return barrierConfig.barrierLevels.find((l) => l.id === levelId) || null;
    }
    return null;
}
/**
 * Find a strike level by ID for CALL_PUT
 */
function findStrikeLevel(settings, levelId) {
    const config = settings.orderTypes.CALL_PUT;
    return config.strikeLevels.find((l) => l.id === levelId) || null;
}
/**
 * Calculate actual barrier price from current price and level
 */
function calculateBarrierPrice(currentPrice, level, isHigher) {
    const distance = currentPrice * (level.distancePercent / 100);
    return isHigher ? currentPrice + distance : currentPrice - distance;
}
/**
 * Calculate actual strike price from current price and level
 */
function calculateStrikePrice(currentPrice, level, isCall) {
    const distance = currentPrice * (level.distancePercent / 100);
    return isCall ? currentPrice + distance : currentPrice - distance;
}
/**
 * Get profit percentage for a specific barrier/strike level
 */
function getProfitForLevel(settings, orderType, levelId) {
    if (orderType === "CALL_PUT") {
        const level = findStrikeLevel(settings, levelId);
        return (level === null || level === void 0 ? void 0 : level.profitPercent) || settings.orderTypes.CALL_PUT.profitPercentage;
    }
    const level = findBarrierLevel(settings, orderType, levelId);
    return (level === null || level === void 0 ? void 0 : level.profitPercent) || settings.orderTypes[orderType].profitPercentage;
}
/**
 * Check if an order type is enabled
 */
function isOrderTypeEnabled(settings, orderType) {
    return settings.global.enabled && settings.orderTypes[orderType].enabled;
}
/**
 * Get all enabled barrier levels for an order type
 */
function getEnabledBarrierLevels(settings, orderType) {
    const config = settings.orderTypes[orderType];
    if ("barrierLevels" in config) {
        const barrierConfig = config;
        return barrierConfig.barrierLevels.filter((l) => l.enabled);
    }
    return [];
}
/**
 * Get all enabled strike levels for CALL_PUT
 */
function getEnabledStrikeLevels(settings) {
    return settings.orderTypes.CALL_PUT.strikeLevels.filter((l) => l.enabled);
}
/**
 * Get all enabled durations
 */
function getEnabledDurations(settings) {
    return settings.durations.filter((d) => d.enabled);
}
/**
 * Check if a duration is enabled for a specific order type
 */
function isDurationEnabledForType(settings, durationId, orderType) {
    var _a;
    const duration = settings.durations.find((d) => d.id === durationId);
    if (!duration || !duration.enabled)
        return false;
    const override = (_a = duration.orderTypeOverrides) === null || _a === void 0 ? void 0 : _a[orderType];
    if ((override === null || override === void 0 ? void 0 : override.enabled) === false)
        return false;
    return true;
}
/**
 * Deep merge settings with defaults
 */
function mergeWithDefaults(partial) {
    var _a, _b, _c, _d, _e;
    return {
        ...exports.DEFAULT_BINARY_SETTINGS,
        ...partial,
        global: {
            ...exports.DEFAULT_BINARY_SETTINGS.global,
            ...(partial.global || {}),
        },
        display: {
            ...exports.DEFAULT_BINARY_SETTINGS.display,
            ...(partial.display || {}),
        },
        orderTypes: {
            RISE_FALL: {
                ...exports.DEFAULT_BINARY_SETTINGS.orderTypes.RISE_FALL,
                ...(((_a = partial.orderTypes) === null || _a === void 0 ? void 0 : _a.RISE_FALL) || {}),
            },
            HIGHER_LOWER: {
                ...exports.DEFAULT_BINARY_SETTINGS.orderTypes.HIGHER_LOWER,
                ...(((_b = partial.orderTypes) === null || _b === void 0 ? void 0 : _b.HIGHER_LOWER) || {}),
            },
            TOUCH_NO_TOUCH: {
                ...exports.DEFAULT_BINARY_SETTINGS.orderTypes.TOUCH_NO_TOUCH,
                ...(((_c = partial.orderTypes) === null || _c === void 0 ? void 0 : _c.TOUCH_NO_TOUCH) || {}),
            },
            CALL_PUT: {
                ...exports.DEFAULT_BINARY_SETTINGS.orderTypes.CALL_PUT,
                ...(((_d = partial.orderTypes) === null || _d === void 0 ? void 0 : _d.CALL_PUT) || {}),
            },
            TURBO: {
                ...exports.DEFAULT_BINARY_SETTINGS.orderTypes.TURBO,
                ...(((_e = partial.orderTypes) === null || _e === void 0 ? void 0 : _e.TURBO) || {}),
            },
        },
        durations: partial.durations || exports.DEFAULT_BINARY_SETTINGS.durations,
        riskManagement: {
            ...exports.DEFAULT_BINARY_SETTINGS.riskManagement,
            ...(partial.riskManagement || {}),
        },
        _lastModified: new Date().toISOString(),
    };
}
