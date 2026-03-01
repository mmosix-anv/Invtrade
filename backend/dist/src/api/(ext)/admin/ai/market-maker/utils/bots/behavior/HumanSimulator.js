"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.HumanSimulator = void 0;
const TimingGenerator_1 = require("./TimingGenerator");
const SizeGenerator_1 = require("./SizeGenerator");
const PriceGenerator_1 = require("./PriceGenerator");
/**
 * HumanSimulator - Combines all human behavior generators
 *
 * Creates realistic trading behavior by combining:
 * - Timing patterns (delays, bursts, fatigue)
 * - Size variation (round numbers, scaling)
 * - Price psychology (key levels, imprecision)
 * - Emotional reactions to market events
 */
class HumanSimulator {
    constructor(baseOrderSize, traits = {}) {
        // Emotional state (changes based on recent events)
        this.emotionalState = {
            fear: 0.3,
            greed: 0.3,
            confidence: 0.5,
            frustration: 0.2,
        };
        // Trade history for pattern generation
        this.recentTrades = [];
        // Default to balanced personality
        this.traits = {
            patience: 0.5,
            riskTolerance: 0.5,
            precision: 0.5,
            consistency: 0.5,
            emotionality: 0.5,
            ...traits,
        };
        // Initialize generators with personality-adjusted settings
        this.timingGenerator = new TimingGenerator_1.TimingGenerator(this.calculateBaseDelay(), this.calculateMaxDelay());
        this.sizeGenerator = new SizeGenerator_1.SizeGenerator(baseOrderSize, baseOrderSize * 0.1, // Min 10% of base
        baseOrderSize * 5 // Max 5x base
        );
        this.priceGenerator = new PriceGenerator_1.PriceGenerator();
    }
    /**
     * Generate humanized order parameters
     */
    generateOrder(side, currentPrice, baseSize, options = {}) {
        const { urgency = 0.5, marketVolatility = 0.3, recentVolume = 1, nearSupport, nearResistance, } = options;
        // Calculate emotional adjustments
        const emotionalUrgency = this.calculateEmotionalUrgency(urgency);
        const emotionalConfidence = this.calculateEmotionalConfidence();
        // Generate delay
        const delay = this.generateDelay(emotionalUrgency);
        // Generate size
        const size = this.generateSize(baseSize, emotionalConfidence, marketVolatility);
        // Generate price
        const price = this.generatePrice(side, currentPrice, emotionalUrgency, side === "BUY" ? nearSupport : nearResistance);
        // Determine if should split order
        const shouldSplit = this.shouldSplitOrder(size, baseSize, emotionalConfidence);
        const splitCount = shouldSplit ? this.calculateSplitCount(size, baseSize) : undefined;
        return {
            price,
            size,
            delay,
            shouldSplit,
            splitCount,
            urgency: emotionalUrgency,
            confidence: emotionalConfidence,
        };
    }
    /**
     * Process market event and update emotional state
     */
    processMarketEvent(event, magnitude = 0.5) {
        // Only emotional personalities react strongly
        const emotionalResponse = magnitude * this.traits.emotionality;
        switch (event) {
            case "PRICE_SPIKE_UP":
                this.emotionalState.greed += emotionalResponse * 0.3;
                this.emotionalState.fear -= emotionalResponse * 0.1;
                break;
            case "PRICE_SPIKE_DOWN":
                this.emotionalState.fear += emotionalResponse * 0.3;
                this.emotionalState.greed -= emotionalResponse * 0.1;
                break;
            case "HIGH_VOLUME":
                this.emotionalState.confidence += emotionalResponse * 0.2;
                break;
            case "LOW_VOLUME":
                this.emotionalState.confidence -= emotionalResponse * 0.2;
                break;
            case "SPREAD_WIDENING":
                this.emotionalState.fear += emotionalResponse * 0.2;
                this.emotionalState.frustration += emotionalResponse * 0.1;
                break;
            case "TREND_REVERSAL":
                this.emotionalState.fear += emotionalResponse * 0.2;
                this.emotionalState.confidence -= emotionalResponse * 0.2;
                break;
            case "BREAKOUT":
                this.emotionalState.greed += emotionalResponse * 0.2;
                this.emotionalState.confidence += emotionalResponse * 0.1;
                break;
            case "RANGE_BOUND":
                this.emotionalState.frustration += emotionalResponse * 0.1;
                break;
        }
        // Clamp values
        this.normalizeEmotions();
        // Emotions decay over time
        this.decayEmotions();
    }
    /**
     * Record trade result for emotional tracking
     */
    recordTradeResult(side, success, pnl) {
        this.recentTrades.push({
            side,
            success,
            pnl,
            timestamp: Date.now(),
        });
        // Keep last 50 trades
        if (this.recentTrades.length > 50) {
            this.recentTrades.shift();
        }
        // Update emotions based on result
        if (success && pnl > 0) {
            this.emotionalState.confidence += 0.05 * this.traits.emotionality;
            this.emotionalState.greed += 0.03 * this.traits.emotionality;
        }
        else {
            this.emotionalState.fear += 0.05 * this.traits.emotionality;
            this.emotionalState.frustration += 0.03 * this.traits.emotionality;
        }
        this.normalizeEmotions();
        // Track in size generator
        this.sizeGenerator.recordTrade(Math.abs(pnl), side);
    }
    /**
     * Check if human would trade right now
     */
    wouldTradeNow() {
        // Check timing generator
        if (!this.timingGenerator.isGoodTimeToTrade()) {
            return Math.random() < 0.1; // Small chance anyway
        }
        // High fear reduces trading
        if (this.emotionalState.fear > 0.7) {
            return Math.random() < 0.3;
        }
        // High frustration reduces trading
        if (this.emotionalState.frustration > 0.8) {
            return Math.random() < 0.2;
        }
        // Patience affects probability
        const tradeProb = 0.5 + (1 - this.traits.patience) * 0.3;
        return Math.random() < tradeProb;
    }
    /**
     * Get current emotional state
     */
    getEmotionalState() {
        return { ...this.emotionalState };
    }
    /**
     * Get personality traits
     */
    getTraits() {
        return { ...this.traits };
    }
    /**
     * Get recent win rate
     */
    getRecentWinRate() {
        if (this.recentTrades.length === 0)
            return 0.5;
        const wins = this.recentTrades.filter((t) => t.success).length;
        return wins / this.recentTrades.length;
    }
    /**
     * Reset emotional state (simulates break/fresh start)
     */
    resetEmotions() {
        this.emotionalState = {
            fear: 0.3,
            greed: 0.3,
            confidence: 0.5,
            frustration: 0.2,
        };
        this.timingGenerator.resetSession();
    }
    // ============================================
    // Private Methods
    // ============================================
    /**
     * Calculate base delay based on personality
     */
    calculateBaseDelay() {
        // Impatient (low patience) = shorter delays
        // Patient (high patience) = longer delays
        const base = 1000; // 1 second base
        return base * (0.5 + this.traits.patience);
    }
    /**
     * Calculate max delay based on personality
     */
    calculateMaxDelay() {
        return this.calculateBaseDelay() * 10;
    }
    /**
     * Generate delay with emotional adjustment
     */
    generateDelay(urgency) {
        const baseDelay = this.timingGenerator.getNextDelay();
        // Higher urgency = shorter delay
        const urgencyMultiplier = 1 - urgency * 0.5; // 0.5x to 1x
        // Fear can cause hasty decisions OR paralysis
        let fearMultiplier = 1;
        if (this.emotionalState.fear > 0.6) {
            // Coin flip: panic (fast) or freeze (slow)
            fearMultiplier = Math.random() < 0.5 ? 0.5 : 2;
        }
        // Greed causes faster action
        const greedMultiplier = 1 - this.emotionalState.greed * 0.3;
        return Math.floor(baseDelay * urgencyMultiplier * fearMultiplier * greedMultiplier);
    }
    /**
     * Generate size with emotional adjustment
     */
    generateSize(baseSize, confidence, volatility) {
        // Use size generator
        let size = this.sizeGenerator.generateSize({
            confidence,
            urgency: this.emotionalState.greed,
            preferRound: this.traits.precision < 0.5,
        });
        // Risk tolerance affects size
        size *= 0.7 + this.traits.riskTolerance * 0.6; // 0.7x to 1.3x
        // Fear reduces size
        size *= 1 - this.emotionalState.fear * 0.3;
        // Greed increases size
        size *= 1 + this.emotionalState.greed * 0.2;
        // High volatility reduces size for conservative traders
        if (volatility > 0.5 && this.traits.riskTolerance < 0.5) {
            size *= 0.7;
        }
        return Math.max(baseSize * 0.1, size);
    }
    /**
     * Generate price with emotional adjustment
     */
    generatePrice(side, currentPrice, urgency, keyLevel) {
        const preferPsychological = this.traits.precision < 0.5;
        if (side === "BUY") {
            return this.priceGenerator.generateBuyPrice(currentPrice, {
                aggressiveness: urgency * (1 + this.emotionalState.greed * 0.5),
                preferPsychological,
                nearSupport: keyLevel,
            });
        }
        else {
            return this.priceGenerator.generateSellPrice(currentPrice, {
                aggressiveness: urgency * (1 + this.emotionalState.fear * 0.5),
                preferPsychological,
                nearResistance: keyLevel,
            });
        }
    }
    /**
     * Determine if order should be split
     */
    shouldSplitOrder(size, baseSize, confidence) {
        // Large orders often get split
        if (size > baseSize * 3) {
            return Math.random() < 0.7;
        }
        // Low confidence = more likely to split
        if (confidence < 0.3) {
            return Math.random() < 0.5;
        }
        // Patient traders split more
        if (this.traits.patience > 0.7) {
            return Math.random() < 0.4;
        }
        return Math.random() < 0.2;
    }
    /**
     * Calculate number of splits
     */
    calculateSplitCount(size, baseSize) {
        const ratio = size / baseSize;
        if (ratio > 5)
            return Math.floor(3 + Math.random() * 3); // 3-5 splits
        if (ratio > 3)
            return Math.floor(2 + Math.random() * 2); // 2-3 splits
        return 2; // Minimum 2 splits
    }
    /**
     * Calculate emotional urgency
     */
    calculateEmotionalUrgency(baseUrgency) {
        let urgency = baseUrgency;
        // Greed increases urgency
        urgency += this.emotionalState.greed * 0.2;
        // Fear can increase or decrease urgency
        if (this.emotionalState.fear > 0.5) {
            // Fight or flight
            urgency += (Math.random() - 0.5) * 0.4;
        }
        // Frustration increases urgency (wanting to "do something")
        urgency += this.emotionalState.frustration * 0.15;
        return Math.max(0, Math.min(1, urgency));
    }
    /**
     * Calculate emotional confidence
     */
    calculateEmotionalConfidence() {
        let confidence = this.emotionalState.confidence;
        // Recent win rate affects confidence
        const winRate = this.getRecentWinRate();
        confidence = confidence * 0.7 + winRate * 0.3;
        // Fear reduces confidence
        confidence -= this.emotionalState.fear * 0.3;
        // Some greed can boost confidence
        confidence += this.emotionalState.greed * 0.1;
        return Math.max(0, Math.min(1, confidence));
    }
    /**
     * Normalize emotions to 0-1 range
     */
    normalizeEmotions() {
        this.emotionalState.fear = Math.max(0, Math.min(1, this.emotionalState.fear));
        this.emotionalState.greed = Math.max(0, Math.min(1, this.emotionalState.greed));
        this.emotionalState.confidence = Math.max(0, Math.min(1, this.emotionalState.confidence));
        this.emotionalState.frustration = Math.max(0, Math.min(1, this.emotionalState.frustration));
    }
    /**
     * Decay emotions over time (regression to mean)
     */
    decayEmotions() {
        const decayRate = 0.95; // 5% decay per call
        const baseline = 0.3;
        this.emotionalState.fear =
            baseline + (this.emotionalState.fear - baseline) * decayRate;
        this.emotionalState.greed =
            baseline + (this.emotionalState.greed - baseline) * decayRate;
        this.emotionalState.confidence =
            0.5 + (this.emotionalState.confidence - 0.5) * decayRate;
        this.emotionalState.frustration =
            0.2 + (this.emotionalState.frustration - 0.2) * decayRate;
    }
    /**
     * Get simulation stats
     */
    getStats() {
        return {
            traits: this.traits,
            emotions: this.getEmotionalState(),
            recentTrades: this.recentTrades.length,
            winRate: this.getRecentWinRate(),
            timing: this.timingGenerator.getStats(),
            sizing: this.sizeGenerator.getStats(),
            pricing: this.priceGenerator.getStats(),
        };
    }
}
exports.HumanSimulator = HumanSimulator;
exports.default = HumanSimulator;
