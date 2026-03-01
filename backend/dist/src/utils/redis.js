"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.redlock = exports.redisClient = exports.RedlockSingleton = exports.RedisSingleton = void 0;
exports.default = default_1;
const ioredis_1 = require("ioredis");
const redlock_1 = __importDefault(require("redlock"));
const console_1 = require("./console");
class RedisSingleton {
    constructor() { }
    static getInstance() {
        if (!RedisSingleton.instance) {
            if (RedisSingleton.isConnecting) {
                // Wait for existing connection attempt
                return new Promise((resolve) => {
                    const checkConnection = () => {
                        if (RedisSingleton.instance) {
                            resolve(RedisSingleton.instance);
                        }
                        else {
                            setTimeout(checkConnection, 10);
                        }
                    };
                    checkConnection();
                });
            }
            RedisSingleton.isConnecting = true;
            try {
                RedisSingleton.instance = new ioredis_1.Redis({
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
                });
                // Handle connection events (errors only - success is silent)
                RedisSingleton.instance.on("error", (error) => {
                    console_1.logger.error("REDIS", `✗ Error: ${error.message}`);
                });
            }
            catch (error) {
                console_1.logger.error("REDIS", `Failed to create Redis instance: ${error}`);
                throw error;
            }
            finally {
                RedisSingleton.isConnecting = false;
            }
        }
        return RedisSingleton.instance;
    }
    // Add method to safely get with timeout
    static async safeGet(key, timeoutMs = 3000) {
        const redis = this.getInstance();
        return Promise.race([
            redis.get(key),
            new Promise((_, reject) => setTimeout(() => reject(new Error('Redis GET timeout')), timeoutMs))
        ]).catch((error) => {
            console_1.logger.error("REDIS", `GET error for key ${key}: ${error}`);
            return null;
        });
    }
    // Add method to safely set with timeout
    static async safeSet(key, value, timeoutMs = 3000) {
        const redis = this.getInstance();
        return Promise.race([
            redis.set(key, value).then(() => true),
            new Promise((_, reject) => setTimeout(() => reject(new Error('Redis SET timeout')), timeoutMs))
        ]).catch((error) => {
            console_1.logger.error("REDIS", `SET error for key ${key}: ${error}`);
            return false;
        });
    }
    // Add cleanup method
    static async cleanup() {
        if (RedisSingleton.instance) {
            try {
                await RedisSingleton.instance.quit();
            }
            catch (error) {
                console_1.logger.error("REDIS", `Error during cleanup: ${error}`);
            }
            RedisSingleton.instance = null;
        }
    }
}
exports.RedisSingleton = RedisSingleton;
RedisSingleton.isConnecting = false;
// Export a function that returns the Redis instance
function default_1() {
    return RedisSingleton.getInstance();
}
// Create and export Redlock instance for distributed locking
class RedlockSingleton {
    constructor() { }
    static getInstance() {
        if (!RedlockSingleton.instance) {
            const redisClient = RedisSingleton.getInstance();
            RedlockSingleton.instance = new redlock_1.default([redisClient], {
                // The expected clock drift; for more details see:
                // http://redis.io/topics/distlock
                driftFactor: 0.01,
                // The max number of times Redlock will attempt to lock a resource
                // before erroring.
                retryCount: 10,
                // The time in ms between attempts
                retryDelay: 200,
                // The max time in ms randomly added to retries
                // to improve performance under high contention
                retryJitter: 200,
                // The minimum remaining time on a lock before an extension is automatically
                // attempted with the `using` API.
                automaticExtensionThreshold: 500,
            });
            // Log lock events
            RedlockSingleton.instance.on('error', (error) => {
                console_1.logger.error("REDLOCK", `Error: ${error.message}`);
            });
        }
        return RedlockSingleton.instance;
    }
}
exports.RedlockSingleton = RedlockSingleton;
// Export convenience functions
exports.redisClient = RedisSingleton.getInstance();
exports.redlock = RedlockSingleton.getInstance();
