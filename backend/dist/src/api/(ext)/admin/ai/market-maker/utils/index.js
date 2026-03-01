"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.targetPriceUpdateSchema = exports.statusChangeSchema = exports.aiMarketMakerPoolStoreSchema = exports.aiMarketMakerStoreSchema = exports.pnlReportSchema = exports.marketPerformanceSchema = exports.analyticsOverviewSchema = exports.aiMarketMakerHistorySchema = exports.aiMarketMakerSettingsUpdateSchema = exports.aiMarketMakerSettingsSchema = exports.aiBotUpdateSchema = exports.aiBotSchema = exports.poolWithdrawSchema = exports.poolDepositSchema = exports.aiMarketMakerPoolSchema = exports.aiMarketMakerUpdateSchema = exports.aiMarketMakerCreateSchema = exports.aiMarketMakerSchema = void 0;
const schema_1 = require("@b/utils/schema");
// ============================================
// AI Market Maker Schema
// ============================================
const id = (0, schema_1.baseStringSchema)("ID of the AI Market Maker");
const marketId = (0, schema_1.baseStringSchema)("ID of the ecosystem market");
const status = (0, schema_1.baseEnumSchema)("Current status", ["ACTIVE", "PAUSED", "STOPPED"]);
const targetPrice = (0, schema_1.baseNumberSchema)("Target price for the market");
const priceRangeLow = (0, schema_1.baseNumberSchema)("Lower bound of price range");
const priceRangeHigh = (0, schema_1.baseNumberSchema)("Upper bound of price range");
const aggressionLevel = (0, schema_1.baseEnumSchema)("Aggression level", [
    "CONSERVATIVE",
    "MODERATE",
    "AGGRESSIVE",
]);
const maxDailyVolume = (0, schema_1.baseNumberSchema)("Maximum daily trading volume");
const currentDailyVolume = (0, schema_1.baseNumberSchema)("Current daily trading volume");
const volatilityThreshold = (0, schema_1.baseNumberSchema)("Volatility threshold for auto-pause");
const pauseOnHighVolatility = (0, schema_1.baseBooleanSchema)("Whether to pause on high volatility");
const realLiquidityPercent = (0, schema_1.baseNumberSchema)("Percentage of orders placed as real ecosystem orders (0-100)");
const createdAt = (0, schema_1.baseDateTimeSchema)("Creation timestamp");
const updatedAt = (0, schema_1.baseDateTimeSchema)("Last update timestamp");
exports.aiMarketMakerSchema = {
    id,
    marketId,
    status,
    targetPrice,
    priceRangeLow,
    priceRangeHigh,
    aggressionLevel,
    maxDailyVolume,
    currentDailyVolume,
    volatilityThreshold,
    pauseOnHighVolatility,
    realLiquidityPercent,
    createdAt,
    updatedAt,
};
exports.aiMarketMakerCreateSchema = {
    type: "object",
    properties: {
        marketId: (0, schema_1.baseStringSchema)("ID of the ecosystem market to enable AI for"),
        targetPrice: (0, schema_1.baseNumberSchema)("Initial target price"),
        priceRangeLow: (0, schema_1.baseNumberSchema)("Lower bound of price range"),
        priceRangeHigh: (0, schema_1.baseNumberSchema)("Upper bound of price range"),
        aggressionLevel: (0, schema_1.baseEnumSchema)("Aggression level", [
            "CONSERVATIVE",
            "MODERATE",
            "AGGRESSIVE",
        ]),
        maxDailyVolume: (0, schema_1.baseNumberSchema)("Maximum daily trading volume"),
        volatilityThreshold: (0, schema_1.baseNumberSchema)("Volatility threshold (0-100)"),
        pauseOnHighVolatility: (0, schema_1.baseBooleanSchema)("Pause on high volatility"),
        realLiquidityPercent: (0, schema_1.baseNumberSchema)("Real liquidity percentage (0-100)"),
    },
    required: [
        "marketId",
        "targetPrice",
        "priceRangeLow",
        "priceRangeHigh",
    ],
};
exports.aiMarketMakerUpdateSchema = {
    type: "object",
    properties: {
        targetPrice: (0, schema_1.baseNumberSchema)("Target price"),
        priceRangeLow: (0, schema_1.baseNumberSchema)("Lower bound of price range"),
        priceRangeHigh: (0, schema_1.baseNumberSchema)("Upper bound of price range"),
        aggressionLevel: (0, schema_1.baseEnumSchema)("Aggression level", [
            "CONSERVATIVE",
            "MODERATE",
            "AGGRESSIVE",
        ]),
        maxDailyVolume: (0, schema_1.baseNumberSchema)("Maximum daily trading volume"),
        volatilityThreshold: (0, schema_1.baseNumberSchema)("Volatility threshold"),
        pauseOnHighVolatility: (0, schema_1.baseBooleanSchema)("Pause on high volatility"),
        realLiquidityPercent: (0, schema_1.baseNumberSchema)("Real liquidity percentage"),
    },
};
// ============================================
// AI Market Maker Pool Schema
// ============================================
const baseCurrencyBalance = (0, schema_1.baseNumberSchema)("Base currency balance");
const quoteCurrencyBalance = (0, schema_1.baseNumberSchema)("Quote currency balance");
const initialBaseBalance = (0, schema_1.baseNumberSchema)("Initial base currency balance");
const initialQuoteBalance = (0, schema_1.baseNumberSchema)("Initial quote currency balance");
const totalValueLocked = (0, schema_1.baseNumberSchema)("Total value locked in the pool");
const unrealizedPnL = (0, schema_1.baseNumberSchema)("Unrealized profit/loss");
const realizedPnL = (0, schema_1.baseNumberSchema)("Realized profit/loss");
const lastRebalanceAt = (0, schema_1.baseDateTimeSchema)("Last rebalance timestamp");
exports.aiMarketMakerPoolSchema = {
    id,
    marketMakerId: (0, schema_1.baseStringSchema)("ID of the market maker"),
    baseCurrencyBalance,
    quoteCurrencyBalance,
    initialBaseBalance,
    initialQuoteBalance,
    totalValueLocked,
    unrealizedPnL,
    realizedPnL,
    lastRebalanceAt,
    createdAt,
    updatedAt,
};
exports.poolDepositSchema = {
    type: "object",
    properties: {
        currency: (0, schema_1.baseEnumSchema)("Currency to deposit", ["BASE", "QUOTE"]),
        amount: (0, schema_1.baseNumberSchema)("Amount to deposit"),
    },
    required: ["currency", "amount"],
};
exports.poolWithdrawSchema = {
    type: "object",
    properties: {
        currency: (0, schema_1.baseEnumSchema)("Currency to withdraw", ["BASE", "QUOTE"]),
        amount: (0, schema_1.baseNumberSchema)("Amount to withdraw"),
    },
    required: ["currency", "amount"],
};
// ============================================
// AI Bot Schema
// ============================================
const botId = (0, schema_1.baseStringSchema)("ID of the bot");
const botName = (0, schema_1.baseStringSchema)("Name of the bot");
const personality = (0, schema_1.baseEnumSchema)("Bot personality type", [
    "SCALPER",
    "SWING",
    "ACCUMULATOR",
    "DISTRIBUTOR",
    "MARKET_MAKER",
]);
const riskTolerance = (0, schema_1.baseNumberSchema)("Risk tolerance (0-1)");
const tradeFrequency = (0, schema_1.baseEnumSchema)("Trade frequency", [
    "HIGH",
    "MEDIUM",
    "LOW",
]);
const avgOrderSize = (0, schema_1.baseNumberSchema)("Average order size");
const orderSizeVariance = (0, schema_1.baseNumberSchema)("Order size variance (0-1)");
const preferredSpread = (0, schema_1.baseNumberSchema)("Preferred spread");
const botStatus = (0, schema_1.baseEnumSchema)("Bot status", ["ACTIVE", "PAUSED", "COOLDOWN"]);
const lastTradeAt = (0, schema_1.baseDateTimeSchema)("Last trade timestamp");
const dailyTradeCount = (0, schema_1.baseNumberSchema)("Daily trade count");
const maxDailyTrades = (0, schema_1.baseNumberSchema)("Maximum daily trades");
exports.aiBotSchema = {
    id: botId,
    marketMakerId: (0, schema_1.baseStringSchema)("ID of the market maker"),
    name: botName,
    personality,
    riskTolerance,
    tradeFrequency,
    avgOrderSize,
    orderSizeVariance,
    preferredSpread,
    status: botStatus,
    lastTradeAt,
    dailyTradeCount,
    maxDailyTrades,
    createdAt,
    updatedAt,
};
exports.aiBotUpdateSchema = {
    type: "object",
    properties: {
        riskTolerance: (0, schema_1.baseNumberSchema)("Risk tolerance (0-1)"),
        tradeFrequency: (0, schema_1.baseEnumSchema)("Trade frequency", [
            "HIGH",
            "MEDIUM",
            "LOW",
        ]),
        avgOrderSize: (0, schema_1.baseNumberSchema)("Average order size"),
        orderSizeVariance: (0, schema_1.baseNumberSchema)("Order size variance"),
        preferredSpread: (0, schema_1.baseNumberSchema)("Preferred spread"),
        maxDailyTrades: (0, schema_1.baseNumberSchema)("Maximum daily trades"),
    },
};
// ============================================
// AI Market Maker Settings Schema
// ============================================
const maxConcurrentBots = (0, schema_1.baseNumberSchema)("Maximum concurrent bots");
const globalPauseEnabled = (0, schema_1.baseBooleanSchema)("Global pause enabled");
const maintenanceMode = (0, schema_1.baseBooleanSchema)("Maintenance mode enabled");
const minLiquidity = (0, schema_1.baseNumberSchema)("Minimum liquidity in quote currency");
const maxDailyLossPercent = (0, schema_1.baseNumberSchema)("Maximum daily loss percentage");
const defaultVolatilityThreshold = (0, schema_1.baseNumberSchema)("Default volatility threshold");
const tradingEnabled = (0, schema_1.baseBooleanSchema)("Global trading enabled");
const stopLossEnabled = (0, schema_1.baseBooleanSchema)("Stop loss protection enabled");
exports.aiMarketMakerSettingsSchema = {
    id,
    maxConcurrentBots,
    globalPauseEnabled,
    maintenanceMode,
    minLiquidity,
    maxDailyLossPercent,
    defaultVolatilityThreshold,
    tradingEnabled,
    stopLossEnabled,
    createdAt,
    updatedAt,
};
exports.aiMarketMakerSettingsUpdateSchema = {
    type: "object",
    properties: {
        maxConcurrentBots,
        globalPauseEnabled,
        maintenanceMode,
        minLiquidity,
        maxDailyLossPercent,
        defaultVolatilityThreshold,
        tradingEnabled,
        stopLossEnabled,
    },
};
// ============================================
// AI Market Maker History Schema
// ============================================
const action = (0, schema_1.baseEnumSchema)("Action type", [
    "TRADE",
    "PAUSE",
    "RESUME",
    "REBALANCE",
    "TARGET_CHANGE",
    "DEPOSIT",
    "WITHDRAW",
    "START",
    "STOP",
    "CONFIG_CHANGE",
    "EMERGENCY_STOP",
    "AUTO_PAUSE",
]);
const details = {
    type: "object",
    description: "Action details",
};
const priceAtAction = (0, schema_1.baseNumberSchema)("Price at the time of action");
const poolValueAtAction = (0, schema_1.baseNumberSchema)("Pool value at the time of action");
exports.aiMarketMakerHistorySchema = {
    id,
    marketMakerId: (0, schema_1.baseStringSchema)("ID of the market maker"),
    action,
    details,
    priceAtAction,
    poolValueAtAction,
    createdAt,
};
// ============================================
// Analytics Schemas
// ============================================
exports.analyticsOverviewSchema = {
    type: "object",
    properties: {
        totalTVL: (0, schema_1.baseNumberSchema)("Total value locked across all pools"),
        total24hVolume: (0, schema_1.baseNumberSchema)("Total 24-hour trading volume"),
        totalPnL: (0, schema_1.baseNumberSchema)("Total profit/loss"),
        activeMarkets: (0, schema_1.baseNumberSchema)("Number of active markets"),
        totalBots: (0, schema_1.baseNumberSchema)("Total number of bots"),
        activeBots: (0, schema_1.baseNumberSchema)("Number of active bots"),
    },
};
exports.marketPerformanceSchema = {
    type: "object",
    properties: {
        priceHistory: {
            type: "array",
            items: {
                type: "object",
                properties: {
                    timestamp: (0, schema_1.baseDateTimeSchema)("Timestamp"),
                    price: (0, schema_1.baseNumberSchema)("Price"),
                    targetPrice: (0, schema_1.baseNumberSchema)("Target price"),
                },
            },
        },
        volumeHistory: {
            type: "array",
            items: {
                type: "object",
                properties: {
                    timestamp: (0, schema_1.baseDateTimeSchema)("Timestamp"),
                    volume: (0, schema_1.baseNumberSchema)("Volume"),
                },
            },
        },
        targetAchievementRate: (0, schema_1.baseNumberSchema)("Target achievement rate (0-100)"),
    },
};
exports.pnlReportSchema = {
    type: "object",
    properties: {
        daily: (0, schema_1.baseNumberSchema)("Daily P&L"),
        weekly: (0, schema_1.baseNumberSchema)("Weekly P&L"),
        monthly: (0, schema_1.baseNumberSchema)("Monthly P&L"),
        allTime: (0, schema_1.baseNumberSchema)("All-time P&L"),
        history: {
            type: "array",
            items: {
                type: "object",
                properties: {
                    date: (0, schema_1.baseDateTimeSchema)("Date"),
                    pnl: (0, schema_1.baseNumberSchema)("P&L for the day"),
                    cumulativePnl: (0, schema_1.baseNumberSchema)("Cumulative P&L"),
                },
            },
        },
    },
};
// ============================================
// Response Schemas
// ============================================
exports.aiMarketMakerStoreSchema = {
    description: "AI Market Maker created or updated successfully",
    content: {
        "application/json": {
            schema: {
                type: "object",
                properties: exports.aiMarketMakerSchema,
            },
        },
    },
};
exports.aiMarketMakerPoolStoreSchema = {
    description: "AI Market Maker Pool updated successfully",
    content: {
        "application/json": {
            schema: {
                type: "object",
                properties: exports.aiMarketMakerPoolSchema,
            },
        },
    },
};
// ============================================
// Status Change Schema
// ============================================
exports.statusChangeSchema = {
    type: "object",
    properties: {
        action: (0, schema_1.baseEnumSchema)("Status action", ["START", "PAUSE", "STOP", "RESUME"]),
    },
    required: ["action"],
};
exports.targetPriceUpdateSchema = {
    type: "object",
    properties: {
        targetPrice: (0, schema_1.baseNumberSchema)("New target price"),
    },
    required: ["targetPrice"],
};
