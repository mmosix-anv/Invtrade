"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.BotFactory = void 0;
const ScalperBot_1 = require("./personalities/ScalperBot");
const SwingBot_1 = require("./personalities/SwingBot");
const AccumulatorBot_1 = require("./personalities/AccumulatorBot");
const DistributorBot_1 = require("./personalities/DistributorBot");
const MarketMakerBot_1 = require("./personalities/MarketMakerBot");
const error_1 = require("@b/utils/error");
/**
 * Default bot distribution for a market
 */
const DEFAULT_BOT_DISTRIBUTION = [
    "SCALPER",
    "SCALPER",
    "SWING",
    "ACCUMULATOR",
    "DISTRIBUTOR",
    "MARKET_MAKER",
];
/**
 * BotFactory - Creates and configures bot instances
 *
 * Handles:
 * - Creating individual bots
 * - Creating bot groups for markets
 * - Distributing resources among bots
 */
class BotFactory {
    constructor() {
        this.botCounter = 0;
    }
    static getInstance() {
        if (!BotFactory.instance) {
            BotFactory.instance = new BotFactory();
        }
        return BotFactory.instance;
    }
    /**
     * Create a single bot by personality type
     */
    createBot(config) {
        switch (config.personality) {
            case "SCALPER":
                return new ScalperBot_1.ScalperBot(config);
            case "SWING":
                return new SwingBot_1.SwingBot(config);
            case "ACCUMULATOR":
                return new AccumulatorBot_1.AccumulatorBot(config);
            case "DISTRIBUTOR":
                return new DistributorBot_1.DistributorBot(config);
            case "MARKET_MAKER":
                return new MarketMakerBot_1.MarketMakerBot(config);
            default:
                throw (0, error_1.createError)({ statusCode: 400, message: `Unknown bot personality: ${config.personality}` });
        }
    }
    /**
     * Create multiple bots for a market
     */
    createBotsForMarket(marketConfig) {
        var _a;
        const personalities = marketConfig.personalities || DEFAULT_BOT_DISTRIBUTION;
        const bots = [];
        // Calculate balance distribution based on personality
        const balanceDistribution = this.calculateBalanceDistribution(personalities);
        for (let i = 0; i < personalities.length; i++) {
            const personality = personalities[i];
            const distribution = balanceDistribution[personality];
            // Get custom config if provided
            const customConfig = ((_a = marketConfig.customBotConfigs) === null || _a === void 0 ? void 0 : _a[i]) || {};
            const botConfig = {
                id: this.generateBotId(marketConfig.marketId, personality),
                name: `${personality}-${marketConfig.symbol}-${i + 1}`,
                marketMakerId: marketConfig.marketId,
                personality,
                riskTolerance: this.getDefaultRiskTolerance(personality),
                tradeFrequency: this.getDefaultFrequency(personality),
                avgOrderSize: marketConfig.avgOrderSize * distribution.sizeMultiplier,
                orderSizeVariance: 0.2,
                preferredSpread: this.getDefaultSpread(personality),
                maxDailyTrades: this.getDefaultMaxDailyTrades(personality),
                ...customConfig,
            };
            const bot = this.createBot(botConfig);
            bots.push(bot);
        }
        return bots;
    }
    /**
     * Create a balanced set of bots (equal buy/sell pressure)
     */
    createBalancedBotSet(marketConfig) {
        // Create balanced distribution: 2 buyers, 2 sellers, 2 neutral
        const balancedPersonalities = [
            "ACCUMULATOR", // Buyer
            "SWING", // Can be buyer or seller
            "MARKET_MAKER", // Neutral
            "MARKET_MAKER", // Neutral
            "SWING", // Can be buyer or seller
            "DISTRIBUTOR", // Seller
        ];
        return this.createBotsForMarket({
            ...marketConfig,
            personalities: balancedPersonalities,
        });
    }
    /**
     * Create aggressive bot set (more activity)
     */
    createAggressiveBotSet(marketConfig) {
        const aggressivePersonalities = [
            "SCALPER",
            "SCALPER",
            "SCALPER",
            "MARKET_MAKER",
            "MARKET_MAKER",
            "SWING",
        ];
        return this.createBotsForMarket({
            ...marketConfig,
            personalities: aggressivePersonalities,
        });
    }
    /**
     * Create conservative bot set (less activity)
     */
    createConservativeBotSet(marketConfig) {
        const conservativePersonalities = [
            "SWING",
            "SWING",
            "ACCUMULATOR",
            "DISTRIBUTOR",
        ];
        return this.createBotsForMarket({
            ...marketConfig,
            personalities: conservativePersonalities,
        });
    }
    /**
     * Create single bot with specific configuration
     */
    createSingleBot(marketId, symbol, personality, baseBalance, quoteBalance, avgOrderSize) {
        const config = {
            id: this.generateBotId(marketId, personality),
            name: `${personality}-${symbol}`,
            marketMakerId: marketId,
            personality,
            riskTolerance: this.getDefaultRiskTolerance(personality),
            tradeFrequency: this.getDefaultFrequency(personality),
            avgOrderSize,
            orderSizeVariance: 0.2,
            preferredSpread: this.getDefaultSpread(personality),
            maxDailyTrades: this.getDefaultMaxDailyTrades(personality),
        };
        return this.createBot(config);
    }
    // ============================================
    // Private Methods
    // ============================================
    /**
     * Generate unique bot ID
     */
    generateBotId(marketId, personality) {
        this.botCounter++;
        const timestamp = Date.now().toString(36);
        const counter = this.botCounter.toString(36).padStart(4, "0");
        const personalityCode = personality.substring(0, 3).toUpperCase();
        return `${marketId}-${personalityCode}-${timestamp}-${counter}`;
    }
    /**
     * Get default trade frequency for personality
     */
    getDefaultFrequency(personality) {
        switch (personality) {
            case "SCALPER":
            case "MARKET_MAKER":
                return "HIGH";
            case "SWING":
                return "MEDIUM";
            case "ACCUMULATOR":
            case "DISTRIBUTOR":
                return "LOW";
            default:
                return "MEDIUM";
        }
    }
    /**
     * Get default risk tolerance for personality
     */
    getDefaultRiskTolerance(personality) {
        switch (personality) {
            case "SCALPER":
                return 0.3; // Low risk
            case "SWING":
                return 0.5; // Medium risk
            case "ACCUMULATOR":
                return 0.4;
            case "DISTRIBUTOR":
                return 0.4;
            case "MARKET_MAKER":
                return 0.6; // Higher tolerance for spread making
            default:
                return 0.5;
        }
    }
    /**
     * Get default spread preference for personality
     */
    getDefaultSpread(personality) {
        switch (personality) {
            case "SCALPER":
                return 0.001; // 0.1% tight spread
            case "SWING":
                return 0.005; // 0.5% wider spread
            case "ACCUMULATOR":
                return 0.003;
            case "DISTRIBUTOR":
                return 0.003;
            case "MARKET_MAKER":
                return 0.002; // 0.2% spread
            default:
                return 0.003;
        }
    }
    /**
     * Get default max daily trades for personality
     */
    getDefaultMaxDailyTrades(personality) {
        switch (personality) {
            case "SCALPER":
                return 200; // High frequency
            case "SWING":
                return 20; // Low frequency
            case "ACCUMULATOR":
                return 30;
            case "DISTRIBUTOR":
                return 30;
            case "MARKET_MAKER":
                return 100;
            default:
                return 50;
        }
    }
    /**
     * Calculate balance distribution based on personalities
     */
    calculateBalanceDistribution(personalities) {
        // Count each personality type
        const counts = {
            SCALPER: 0,
            SWING: 0,
            ACCUMULATOR: 0,
            DISTRIBUTOR: 0,
            MARKET_MAKER: 0,
        };
        for (const p of personalities) {
            counts[p]++;
        }
        const total = personalities.length;
        // Base distribution weights (how much each type should get)
        const weights = {
            SCALPER: { base: 0.1, quote: 0.1, size: 0.5 }, // Small allocations
            SWING: { base: 0.2, quote: 0.2, size: 1.0 }, // Medium allocations
            ACCUMULATOR: { base: 0.15, quote: 0.25, size: 0.8 }, // More quote for buying
            DISTRIBUTOR: { base: 0.25, quote: 0.15, size: 0.8 }, // More base for selling
            MARKET_MAKER: { base: 0.2, quote: 0.2, size: 0.6 }, // Balanced
        };
        // Calculate total weight
        let totalBaseWeight = 0;
        let totalQuoteWeight = 0;
        for (const p of personalities) {
            totalBaseWeight += weights[p].base;
            totalQuoteWeight += weights[p].quote;
        }
        // Normalize to percentages
        const distribution = {
            SCALPER: { basePercent: 0, quotePercent: 0, sizeMultiplier: 0.5 },
            SWING: { basePercent: 0, quotePercent: 0, sizeMultiplier: 1.0 },
            ACCUMULATOR: { basePercent: 0, quotePercent: 0, sizeMultiplier: 0.8 },
            DISTRIBUTOR: { basePercent: 0, quotePercent: 0, sizeMultiplier: 0.8 },
            MARKET_MAKER: { basePercent: 0, quotePercent: 0, sizeMultiplier: 0.6 },
        };
        for (const p of Object.keys(weights)) {
            if (counts[p] > 0) {
                // Divide by count to split among multiple bots of same type
                distribution[p] = {
                    basePercent: weights[p].base / totalBaseWeight / counts[p],
                    quotePercent: weights[p].quote / totalQuoteWeight / counts[p],
                    sizeMultiplier: weights[p].size,
                };
            }
        }
        return distribution;
    }
    /**
     * Get recommended bot count based on trading volume
     */
    getRecommendedBotCount(dailyVolume) {
        if (dailyVolume < 10000) {
            return 3; // Low volume: fewer bots
        }
        else if (dailyVolume < 100000) {
            return 5; // Medium volume
        }
        else if (dailyVolume < 1000000) {
            return 8; // High volume
        }
        else {
            return 12; // Very high volume
        }
    }
    /**
     * Get recommended personalities for market type
     */
    getRecommendedPersonalities(marketType) {
        switch (marketType) {
            case "STABLE":
                // Stable markets: more market makers, fewer swing traders
                return [
                    "MARKET_MAKER",
                    "MARKET_MAKER",
                    "SCALPER",
                    "ACCUMULATOR",
                    "DISTRIBUTOR",
                ];
            case "VOLATILE":
                // Volatile markets: more scalpers, fewer accumulators
                return [
                    "SCALPER",
                    "SCALPER",
                    "SCALPER",
                    "MARKET_MAKER",
                    "SWING",
                ];
            case "TRENDING":
                // Trending markets: swing traders and directional bots
                return [
                    "SWING",
                    "SWING",
                    "ACCUMULATOR",
                    "DISTRIBUTOR",
                    "SCALPER",
                ];
            default:
                return DEFAULT_BOT_DISTRIBUTION;
        }
    }
}
exports.BotFactory = BotFactory;
exports.default = BotFactory;
