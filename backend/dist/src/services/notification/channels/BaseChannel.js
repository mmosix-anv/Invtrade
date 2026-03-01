"use strict";
/**
 * Base Channel Abstract Class
 * All notification channels must extend this class
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.BaseChannel = void 0;
const RedisCache_1 = require("../cache/RedisCache");
class BaseChannel {
    constructor(channelName) {
        this.channelName = channelName;
    }
    /**
     * Validate operation before sending
     * Can be overridden by each channel
     */
    validate(operation) {
        if (!operation.userId) {
            throw new Error("userId is required");
        }
        if (!operation.data && !operation.template) {
            throw new Error("Either data or template must be provided");
        }
    }
    /**
     * Track delivery status in Redis
     */
    async trackDelivery(notificationId, status) {
        await RedisCache_1.redisCache.trackDelivery(notificationId, this.channelName, status);
    }
    /**
     * Get channel name
     */
    getChannelName() {
        return this.channelName;
    }
    /**
     * Check if channel is available for user
     * Can be overridden by each channel
     */
    async isAvailableForUser(userId) {
        return true; // Default: available for all users
    }
    /**
     * Log channel activity
     */
    log(message, data) {
        const timestamp = new Date().toISOString();
        console.log(`[${this.channelName}] ${timestamp} - ${message}`, data ? JSON.stringify(data) : "");
    }
    /**
     * Log channel error
     */
    logError(message, error) {
        const timestamp = new Date().toISOString();
        console.error(`[${this.channelName}] ${timestamp} - ERROR: ${message}`, error);
    }
}
exports.BaseChannel = BaseChannel;
