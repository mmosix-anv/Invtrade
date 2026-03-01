"use strict";
/**
 * Binary Settings Cache
 *
 * Provides caching for binary trading settings to reduce database queries.
 * Settings are cached in memory with a configurable TTL.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.BinarySettingsCache = exports.binarySettingsCache = void 0;
exports.getBinarySettings = getBinarySettings;
exports.invalidateBinarySettingsCache = invalidateBinarySettingsCache;
const db_1 = require("@b/db");
const utils_1 = require("@b/api/admin/finance/binary/settings/utils");
class BinarySettingsCache {
    constructor(ttlMs = 60000) {
        this.cache = null;
        this.lastFetch = 0;
        this.fetchPromise = null;
        this.TTL = ttlMs; // Default 1 minute cache
    }
    /**
     * Get binary settings from cache or database
     */
    async get() {
        // Return cached value if still valid
        if (this.cache && Date.now() - this.lastFetch < this.TTL) {
            return this.cache;
        }
        // If already fetching, wait for that promise
        if (this.fetchPromise) {
            return this.fetchPromise;
        }
        // Fetch from database
        this.fetchPromise = this.fetchFromDB();
        try {
            const settings = await this.fetchPromise;
            this.cache = settings;
            this.lastFetch = Date.now();
            return settings;
        }
        finally {
            this.fetchPromise = null;
        }
    }
    /**
     * Fetch settings from database
     */
    async fetchFromDB() {
        try {
            const settingsRecord = await db_1.models.settings.findOne({
                where: { key: "binarySettings" },
            });
            if (settingsRecord === null || settingsRecord === void 0 ? void 0 : settingsRecord.value) {
                try {
                    const parsed = JSON.parse(settingsRecord.value);
                    return (0, utils_1.mergeWithDefaults)(parsed);
                }
                catch (parseError) {
                    console.error("Failed to parse binary settings:", parseError);
                    return utils_1.DEFAULT_BINARY_SETTINGS;
                }
            }
            return utils_1.DEFAULT_BINARY_SETTINGS;
        }
        catch (error) {
            console.error("Failed to fetch binary settings from DB:", error);
            return utils_1.DEFAULT_BINARY_SETTINGS;
        }
    }
    /**
     * Invalidate the cache, forcing a refresh on next get()
     */
    invalidate() {
        this.cache = null;
        this.lastFetch = 0;
    }
    /**
     * Force refresh the cache immediately
     */
    async refresh() {
        this.invalidate();
        return this.get();
    }
    /**
     * Check if cache is currently valid
     */
    isValid() {
        return this.cache !== null && Date.now() - this.lastFetch < this.TTL;
    }
    /**
     * Get cache age in milliseconds
     */
    getAge() {
        if (!this.cache)
            return Infinity;
        return Date.now() - this.lastFetch;
    }
}
exports.BinarySettingsCache = BinarySettingsCache;
// Export singleton instance
exports.binarySettingsCache = new BinarySettingsCache();
/**
 * Helper function to get settings (convenience wrapper)
 */
async function getBinarySettings() {
    return exports.binarySettingsCache.get();
}
/**
 * Helper function to invalidate cache
 */
function invalidateBinarySettingsCache() {
    exports.binarySettingsCache.invalidate();
}
