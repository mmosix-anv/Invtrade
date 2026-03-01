"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.OscillationStrategy = void 0;
/**
 * OscillationStrategy - Creates wave-like price patterns
 *
 * This strategy:
 * - Creates natural-looking price oscillations
 * - Maintains volatility even when at target
 * - Uses sine-wave patterns with randomization
 * - Keeps price within defined range
 */
class OscillationStrategy {
    constructor() {
        this.name = "oscillation";
        // Track oscillation phase for each market
        this.phases = new Map();
        this.lastUpdate = new Map();
    }
    calculate(currentPrice, targetPrice, config) {
        const current = Number(currentPrice) / 1e18;
        const target = Number(targetPrice) / 1e18;
        // Get or initialize phase
        const phaseKey = `${current}_${target}`;
        let phase = this.phases.get(phaseKey) || Math.random() * Math.PI * 2;
        const lastTime = this.lastUpdate.get(phaseKey) || Date.now();
        // Update phase based on time elapsed
        const elapsed = Date.now() - lastTime;
        const phaseIncrement = this.getPhaseIncrement(config.aggressionLevel);
        phase += (elapsed / 1000) * phaseIncrement;
        // Store updated phase
        this.phases.set(phaseKey, phase);
        this.lastUpdate.set(phaseKey, Date.now());
        // Calculate oscillation using sine wave
        const amplitude = this.getAmplitude(config.aggressionLevel);
        const oscillation = Math.sin(phase) * amplitude;
        // Add random noise for natural look
        const noise = (Math.random() - 0.5) * amplitude * 0.2;
        // Calculate direction based on oscillation
        const direction = oscillation + noise > 0 ? "BUY" : "SELL";
        // Calculate price adjustment
        const priceAdjustment = Math.abs(oscillation + noise);
        // Check if price is within range
        const rangeLow = config.priceRangeLow;
        const rangeHigh = config.priceRangeHigh;
        // If near range boundaries, push back toward center
        if (current <= rangeLow * 1.02 && direction === "SELL") {
            return {
                shouldTrade: true,
                direction: "BUY",
                priceAdjustment: amplitude,
                sizeMultiplier: 1.2,
                confidence: 0.8,
                reason: "Near lower range boundary, pushing up",
            };
        }
        if (current >= rangeHigh * 0.98 && direction === "BUY") {
            return {
                shouldTrade: true,
                direction: "SELL",
                priceAdjustment: amplitude,
                sizeMultiplier: 1.2,
                confidence: 0.8,
                reason: "Near upper range boundary, pushing down",
            };
        }
        // Calculate confidence based on oscillation strength
        const confidence = Math.abs(Math.sin(phase)) * 0.8;
        return {
            shouldTrade: true,
            direction,
            priceAdjustment,
            sizeMultiplier: 0.8, // Smaller trades for oscillation
            confidence,
            reason: `Oscillation ${direction} (phase: ${(phase % (Math.PI * 2)).toFixed(2)})`,
        };
    }
    /**
     * Get oscillation amplitude based on aggression
     */
    getAmplitude(aggression) {
        switch (aggression) {
            case "AGGRESSIVE":
                return 0.3; // 0.3% amplitude
            case "MODERATE":
                return 0.15; // 0.15% amplitude
            case "CONSERVATIVE":
            default:
                return 0.08; // 0.08% amplitude
        }
    }
    /**
     * Get phase increment (controls oscillation speed)
     */
    getPhaseIncrement(aggression) {
        switch (aggression) {
            case "AGGRESSIVE":
                return 0.5; // Faster oscillation
            case "MODERATE":
                return 0.3;
            case "CONSERVATIVE":
            default:
                return 0.15; // Slower oscillation
        }
    }
}
exports.OscillationStrategy = OscillationStrategy;
exports.default = OscillationStrategy;
