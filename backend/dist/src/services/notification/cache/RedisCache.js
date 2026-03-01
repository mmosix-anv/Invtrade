"use strict";
/**
 * Redis Cache for Notification Service
 * Handles all Redis operations for caching, idempotency, delivery tracking, and metrics
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.redisCache = exports.RedisCache = void 0;
const ioredis_1 = __importDefault(require("ioredis"));
class RedisCache {
    constructor() {
        this.redis = new ioredis_1.default({
            host: process.env.REDIS_HOST || "localhost",
            port: parseInt(process.env.REDIS_PORT || "6379"),
            password: process.env.REDIS_PASSWORD,
            db: parseInt(process.env.REDIS_DB || "0"),
            maxRetriesPerRequest: 3,
            enableReadyCheck: true,
            connectTimeout: 5000,
            commandTimeout: 5000,
            lazyConnect: true,
            family: 4,
            keepAlive: 30000,
            retryStrategy: (times) => {
                const delay = Math.min(times * 50, 2000);
                return delay;
            },
        });
        this.redis.on("error", (error) => {
            console.error("[RedisCache] Connection error:", error);
        });
        // Silent connection - no logging needed as it's automatic
        // Redis will connect when first used
    }
    static getInstance() {
        if (!RedisCache.instance) {
            RedisCache.instance = new RedisCache();
        }
        return RedisCache.instance;
    }
    /**
     * Get Redis client instance
     */
    getClient() {
        return this.redis;
    }
    // ============================================
    // USER PREFERENCES CACHE (1 hour TTL)
    // ============================================
    /**
     * Get user preferences from cache
     */
    async getUserPreferences(userId) {
        try {
            const cached = await this.redis.get(`user:prefs:${userId}`);
            return cached ? JSON.parse(cached) : null;
        }
        catch (error) {
            console.error(`[RedisCache] Error getting user preferences for ${userId}:`, error);
            return null; // Fail gracefully, will load from DB
        }
    }
    /**
     * Set user preferences in cache (1 hour TTL)
     */
    async setUserPreferences(userId, prefs) {
        try {
            await this.redis.setex(`user:prefs:${userId}`, 3600, // 1 hour
            JSON.stringify(prefs));
        }
        catch (error) {
            console.error(`[RedisCache] Error setting user preferences for ${userId}:`, error);
            // Non-critical, continue without caching
        }
    }
    /**
     * Clear user preferences cache (when user updates settings)
     */
    async clearUserPreferences(userId) {
        try {
            await this.redis.del(`user:prefs:${userId}`);
        }
        catch (error) {
            console.error(`[RedisCache] Error clearing user preferences for ${userId}:`, error);
        }
    }
    // ============================================
    // IDEMPOTENCY CHECK (24 hour TTL)
    // ============================================
    /**
     * Check if notification already sent (by idempotency key)
     */
    async checkIdempotency(key) {
        try {
            return await this.redis.get(`notif:idem:${key}`);
        }
        catch (error) {
            console.error(`[RedisCache] Error checking idempotency for ${key}:`, error);
            return null; // Fail gracefully, will create notification
        }
    }
    /**
     * Set idempotency key (24 hour TTL)
     */
    async setIdempotency(key, notificationId) {
        try {
            await this.redis.setex(`notif:idem:${key}`, 24 * 3600, // 24 hours
            notificationId);
        }
        catch (error) {
            console.error(`[RedisCache] Error setting idempotency for ${key}:`, error);
            // Non-critical, continue
        }
    }
    // ============================================
    // DELIVERY TRACKING (30 day TTL)
    // ============================================
    /**
     * Track delivery status for a channel
     */
    async trackDelivery(notificationId, channel, status) {
        try {
            const key = `notif:delivery:${notificationId}`;
            const existing = await this.redis.get(key);
            const data = existing ? JSON.parse(existing) : {};
            data[channel] = {
                ...status,
                timestamp: new Date().toISOString(),
            };
            await this.redis.setex(key, 30 * 24 * 3600, // 30 days
            JSON.stringify(data));
        }
        catch (error) {
            console.error(`[RedisCache] Error tracking delivery for ${notificationId}:`, error);
            // Non-critical, continue
        }
    }
    /**
     * Get delivery status for a notification
     */
    async getDeliveryStatus(notificationId) {
        try {
            const data = await this.redis.get(`notif:delivery:${notificationId}`);
            return data ? JSON.parse(data) : null;
        }
        catch (error) {
            console.error(`[RedisCache] Error getting delivery status for ${notificationId}:`, error);
            return null;
        }
    }
    // ============================================
    // METRICS (1 hour TTL)
    // ============================================
    /**
     * Increment a metric counter
     */
    async incrementStat(metric, value = 1) {
        try {
            await this.redis.hincrby("notif:stats:hourly", metric, value);
            // Set expiration on the hash if it doesn't have one
            const ttl = await this.redis.ttl("notif:stats:hourly");
            if (ttl === -1) {
                await this.redis.expire("notif:stats:hourly", 3600); // 1 hour
            }
        }
        catch (error) {
            console.error(`[RedisCache] Error incrementing stat ${metric}:`, error);
            // Non-critical, continue
        }
    }
    /**
     * Get all metrics
     */
    async getStats() {
        try {
            const stats = await this.redis.hgetall("notif:stats:hourly");
            return stats || {};
        }
        catch (error) {
            console.error("[RedisCache] Error getting stats:", error);
            return {};
        }
    }
    /**
     * Get formatted metrics
     */
    async getFormattedMetrics() {
        const stats = await this.getStats();
        const sent = parseInt(stats.sent || "0");
        const failed = parseInt(stats.failed || "0");
        const total = sent + failed;
        const successRate = total > 0 ? (sent / total) * 100 : 0;
        const channels = {};
        for (const [key, value] of Object.entries(stats)) {
            if (key.startsWith("channels:")) {
                const channel = key.replace("channels:", "");
                channels[channel] = parseInt(value);
            }
        }
        return {
            sent,
            failed,
            successRate: parseFloat(successRate.toFixed(2)),
            channels,
        };
    }
    /**
     * Reset hourly stats (called by cron)
     */
    async resetHourlyStats() {
        try {
            await this.redis.del("notif:stats:hourly");
        }
        catch (error) {
            console.error("[RedisCache] Error resetting stats:", error);
        }
    }
    // ============================================
    // UTILITY METHODS
    // ============================================
    /**
     * Check if Redis is connected
     */
    async isConnected() {
        try {
            await this.redis.ping();
            return true;
        }
        catch (error) {
            return false;
        }
    }
    /**
     * Get cache hit rate for user preferences
     */
    async getCacheHitRate() {
        try {
            const info = await this.redis.info("stats");
            const matches = info.match(/keyspace_hits:(\d+)/);
            const hits = matches ? parseInt(matches[1]) : 0;
            const missesMatch = info.match(/keyspace_misses:(\d+)/);
            const misses = missesMatch ? parseInt(missesMatch[1]) : 0;
            const total = hits + misses;
            return total > 0 ? (hits / total) * 100 : 0;
        }
        catch (error) {
            console.error("[RedisCache] Error getting hit rate:", error);
            return 0;
        }
    }
    /**
     * Close Redis connection (for graceful shutdown)
     */
    async close() {
        await this.redis.quit();
    }
}
exports.RedisCache = RedisCache;
// Export singleton instance
exports.redisCache = RedisCache.getInstance();
