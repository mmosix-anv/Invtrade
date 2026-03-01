"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TimingGenerator = void 0;
/**
 * TimingGenerator - Generates human-like timing patterns
 *
 * Simulates:
 * - Reaction delays (humans don't react instantly)
 * - Time-of-day patterns (more active during trading hours)
 * - Fatigue patterns (slower decisions after long sessions)
 * - Burst patterns (multiple quick trades followed by pauses)
 */
class TimingGenerator {
    constructor(baseDelayMs = 1000, maxDelayMs = 10000) {
        // State tracking
        this.lastActionTime = 0;
        this.actionsInBurst = 0;
        this.burstStartTime = 0;
        this.sessionStartTime = Date.now();
        // Pattern configuration
        this.burstThreshold = 5; // Actions before burst fatigue
        this.burstCooldownMs = 30000; // 30s cooldown after burst
        this.fatigueOnsetMs = 3600000; // 1 hour before fatigue starts
        this.baseDelayMs = baseDelayMs;
        this.maxDelayMs = maxDelayMs;
        this.sessionStartTime = Date.now();
    }
    /**
     * Generate next action delay with human-like variation
     */
    getNextDelay() {
        const now = Date.now();
        // Base delay with gaussian-like distribution
        let delay = this.generateGaussianDelay();
        // Apply time-of-day modifier
        delay *= this.getTimeOfDayModifier();
        // Apply burst pattern modifier
        delay *= this.getBurstModifier(now);
        // Apply fatigue modifier
        delay *= this.getFatigueModifier();
        // Apply random micro-variations (human inconsistency)
        delay *= 0.8 + Math.random() * 0.4; // ±20% variation
        // Clamp to bounds
        delay = Math.max(this.baseDelayMs, Math.min(this.maxDelayMs, delay));
        // Update state
        this.lastActionTime = now;
        this.updateBurstState(now);
        return Math.floor(delay);
    }
    /**
     * Generate delay for specific action type
     */
    getDelayForAction(actionType) {
        const baseDelay = this.getNextDelay();
        // Different actions have different typical delays
        const actionMultipliers = {
            PLACE_ORDER: 1.0, // Normal delay
            CANCEL_ORDER: 0.5, // Faster (panic or quick decision)
            CHECK_MARKET: 0.3, // Very fast (just looking)
            MODIFY_ORDER: 1.2, // Slower (requires thought)
        };
        return Math.floor(baseDelay * (actionMultipliers[actionType] || 1));
    }
    /**
     * Check if it's an appropriate time to trade
     */
    isGoodTimeToTrade() {
        const hourModifier = this.getTimeOfDayModifier();
        // If hour modifier is very low, probably not a good time
        if (hourModifier < 0.3) {
            return Math.random() < 0.1; // Only 10% chance during off-hours
        }
        // Check if we're in post-burst cooldown
        if (this.actionsInBurst >= this.burstThreshold) {
            const timeSinceBurstStart = Date.now() - this.burstStartTime;
            if (timeSinceBurstStart < this.burstCooldownMs) {
                return Math.random() < 0.2; // 20% chance during cooldown
            }
        }
        return true;
    }
    /**
     * Get probability of taking action right now
     */
    getActionProbability() {
        const timeSinceLastAction = Date.now() - this.lastActionTime;
        // Probability increases with time since last action
        // Using a logistic curve
        const halfLife = this.baseDelayMs * 2;
        const probability = 1 / (1 + Math.exp(-(timeSinceLastAction - halfLife) / halfLife));
        // Modify by current conditions
        return probability * this.getTimeOfDayModifier() * (1 / this.getFatigueModifier());
    }
    /**
     * Generate "thinking time" before a decision
     */
    getThinkingTime(complexity) {
        const baseThinking = {
            SIMPLE: 500, // 0.5s
            NORMAL: 2000, // 2s
            COMPLEX: 5000, // 5s
        };
        const base = baseThinking[complexity];
        // Add human variation
        const variation = base * (0.5 + Math.random()); // 50-150% of base
        // Add random "distraction" delays occasionally
        const distraction = Math.random() < 0.1 ? Math.random() * 3000 : 0;
        return Math.floor(variation + distraction);
    }
    /**
     * Reset session (simulates taking a break)
     */
    resetSession() {
        this.sessionStartTime = Date.now();
        this.actionsInBurst = 0;
        this.burstStartTime = 0;
    }
    // ============================================
    // Private Methods
    // ============================================
    /**
     * Generate delay with gaussian-like distribution
     * Uses Box-Muller transform
     */
    generateGaussianDelay() {
        const u1 = Math.random();
        const u2 = Math.random();
        // Box-Muller transform
        const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
        // Scale to our range (mean at baseDelay * 2, std at baseDelay)
        const mean = this.baseDelayMs * 2;
        const std = this.baseDelayMs;
        return Math.abs(mean + z * std);
    }
    /**
     * Get time-of-day activity modifier
     * Simulates that humans are more active during certain hours
     */
    getTimeOfDayModifier() {
        const hour = new Date().getUTCHours();
        // Activity pattern (0 = low, 1 = high)
        // Peak during US/EU trading overlap (13-17 UTC)
        const activityPattern = {
            0: 0.3, // Night
            1: 0.2,
            2: 0.2,
            3: 0.2,
            4: 0.3,
            5: 0.4, // Asia morning
            6: 0.5,
            7: 0.6,
            8: 0.7, // EU morning
            9: 0.8,
            10: 0.9,
            11: 0.9,
            12: 0.8, // EU lunch
            13: 1.0, // US opens
            14: 1.0,
            15: 1.0,
            16: 0.9,
            17: 0.8,
            18: 0.7,
            19: 0.6,
            20: 0.5,
            21: 0.4, // US evening
            22: 0.4,
            23: 0.3,
        };
        return activityPattern[hour] || 0.5;
    }
    /**
     * Get burst pattern modifier
     * Humans often trade in bursts followed by pauses
     */
    getBurstModifier(now) {
        // If we've been acting quickly, add delay (fatigue/pause)
        if (this.actionsInBurst >= this.burstThreshold) {
            const timeSinceBurstStart = now - this.burstStartTime;
            if (timeSinceBurstStart < this.burstCooldownMs) {
                // During cooldown, significantly increase delay
                return 3.0 + Math.random() * 2; // 3-5x slower
            }
            // Cooldown over, reset burst counter
            this.actionsInBurst = 0;
        }
        return 1.0;
    }
    /**
     * Update burst state tracking
     */
    updateBurstState(now) {
        const timeSinceLast = now - this.lastActionTime;
        // If action came quickly, it's part of a burst
        if (timeSinceLast < this.baseDelayMs * 3) {
            if (this.actionsInBurst === 0) {
                this.burstStartTime = now;
            }
            this.actionsInBurst++;
        }
        else {
            // Long gap, reset burst
            this.actionsInBurst = 1;
            this.burstStartTime = now;
        }
    }
    /**
     * Get fatigue modifier
     * Humans slow down after extended activity
     */
    getFatigueModifier() {
        const sessionDuration = Date.now() - this.sessionStartTime;
        if (sessionDuration < this.fatigueOnsetMs) {
            return 1.0; // No fatigue yet
        }
        // Gradually increase delay with fatigue
        // Max 2x slower after 4 hours
        const fatigueHours = (sessionDuration - this.fatigueOnsetMs) / 3600000;
        return 1.0 + Math.min(1.0, fatigueHours * 0.33);
    }
    /**
     * Get current timing stats
     */
    getStats() {
        return {
            sessionDurationMs: Date.now() - this.sessionStartTime,
            actionsInBurst: this.actionsInBurst,
            lastActionAgo: Date.now() - this.lastActionTime,
            currentModifier: this.getTimeOfDayModifier() *
                this.getBurstModifier(Date.now()) *
                this.getFatigueModifier(),
        };
    }
}
exports.TimingGenerator = TimingGenerator;
exports.default = TimingGenerator;
