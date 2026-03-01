"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CircuitBreaker = void 0;
const console_1 = require("@b/utils/console");
/**
 * CircuitBreaker - Emergency stop mechanism
 *
 * Provides emergency controls to immediately halt trading
 * when critical conditions are detected.
 */
class CircuitBreaker {
    constructor() {
        this.tripped = false;
        this.tripReason = "";
        this.tripTime = null;
        this.cooldownPeriodMs = 30 * 60 * 1000; // 30 minutes default
        // Trip history
        this.tripHistory = [];
    }
    /**
     * Trip the circuit breaker
     */
    trip(reason) {
        if (this.tripped) {
            return; // Already tripped
        }
        this.tripped = true;
        this.tripReason = reason;
        this.tripTime = new Date();
        // Record in history
        this.tripHistory.push({
            reason,
            time: new Date(),
        });
        // Keep only last 10 trips
        if (this.tripHistory.length > 10) {
            this.tripHistory = this.tripHistory.slice(-10);
        }
        console_1.logger.error("AI_MM", `Circuit breaker TRIPPED: ${reason}`);
    }
    /**
     * Reset the circuit breaker
     */
    reset() {
        this.tripped = false;
        this.tripReason = "";
        this.tripTime = null;
        console_1.logger.info("AI_MM", "Circuit breaker reset");
    }
    /**
     * Check if circuit breaker is tripped
     */
    isTripped() {
        // Auto-reset after cooldown period
        if (this.tripped && this.tripTime) {
            const elapsed = Date.now() - this.tripTime.getTime();
            if (elapsed >= this.cooldownPeriodMs) {
                console_1.logger.info("AI_MM", "Circuit breaker auto-reset after cooldown");
                this.reset();
            }
        }
        return this.tripped;
    }
    /**
     * Get trip reason
     */
    getTripReason() {
        return this.tripReason;
    }
    /**
     * Get trip time
     */
    getTripTime() {
        return this.tripTime;
    }
    /**
     * Get remaining cooldown time in milliseconds
     */
    getRemainingCooldown() {
        if (!this.tripped || !this.tripTime) {
            return 0;
        }
        const elapsed = Date.now() - this.tripTime.getTime();
        const remaining = this.cooldownPeriodMs - elapsed;
        return Math.max(0, remaining);
    }
    /**
     * Set cooldown period
     */
    setCooldownPeriod(ms) {
        this.cooldownPeriodMs = ms;
    }
    /**
     * Get trip history
     */
    getTripHistory() {
        return [...this.tripHistory];
    }
    /**
     * Get status
     */
    getStatus() {
        return {
            tripped: this.tripped,
            reason: this.tripReason,
            tripTime: this.tripTime,
            remainingCooldown: this.getRemainingCooldown(),
        };
    }
}
exports.CircuitBreaker = CircuitBreaker;
exports.default = CircuitBreaker;
