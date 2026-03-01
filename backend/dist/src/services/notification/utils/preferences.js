"use strict";
/**
 * User Preferences Utility
 * Handles loading and filtering notifications based on user preferences
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.getUserPreferences = getUserPreferences;
exports.filterChannelsByPreferences = filterChannelsByPreferences;
exports.isNotificationTypeEnabled = isNotificationTypeEnabled;
exports.filterChannelsByPreferencesAndType = filterChannelsByPreferencesAndType;
exports.updateUserPreferences = updateUserPreferences;
exports.getUserPushTokens = getUserPushTokens;
exports.addPushToken = addPushToken;
exports.removePushToken = removePushToken;
exports.getUserContactInfo = getUserContactInfo;
exports.hasValidContactMethod = hasValidContactMethod;
const db_1 = require("@b/db");
const RedisCache_1 = require("../cache/RedisCache");
const errors_1 = require("../errors");
/**
 * Get user notification preferences
 * Checks Redis cache first, then loads from database
 */
async function getUserPreferences(userId) {
    // Try cache first
    let prefs = await RedisCache_1.redisCache.getUserPreferences(userId);
    if (!prefs) {
        // Load from database
        const user = await db_1.models.user.findByPk(userId, {
            attributes: ["settings"],
        });
        if (!user) {
            throw new errors_1.UserNotFoundError(userId);
        }
        // Parse settings from user.settings JSON field
        // Ensure we always return a valid UserNotificationSettings object
        const userSettings = user.settings || {};
        // Default notification preferences (for null/undefined values)
        // email: true, sms: false, push: false
        prefs = {
            email: userSettings.email !== undefined ? userSettings.email : true,
            sms: userSettings.sms !== undefined ? userSettings.sms : false,
            push: userSettings.push !== undefined ? userSettings.push : false,
            types: userSettings.types,
            pushTokens: userSettings.pushTokens,
        };
        // Cache it for next time (1 hour TTL)
        await RedisCache_1.redisCache.setUserPreferences(userId, prefs);
    }
    return prefs;
}
/**
 * Filter requested channels by user preferences
 * Returns only channels that user has enabled
 */
async function filterChannelsByPreferences(userId, requestedChannels) {
    // Get user preferences
    const prefs = await getUserPreferences(userId);
    // Filter channels based on preferences
    return requestedChannels.filter((channel) => {
        switch (channel) {
            case "EMAIL":
                return prefs.email === true;
            case "SMS":
                return prefs.sms === true;
            case "PUSH":
                return prefs.push === true;
            case "IN_APP":
            case "WEBSOCKET":
                return true; // Always allow in-app notifications
            default:
                return false;
        }
    });
}
/**
 * Check if user has enabled a specific notification type
 * Returns true if type is enabled or if no type preferences are set
 */
async function isNotificationTypeEnabled(userId, type) {
    const prefs = await getUserPreferences(userId);
    // If no type preferences set, allow all
    if (!prefs.types) {
        return true;
    }
    // Check specific type preference
    const typeKey = type.toLowerCase();
    return prefs.types[typeKey] !== false; // Default true if not explicitly disabled
}
/**
 * Filter channels by both preference and notification type
 */
async function filterChannelsByPreferencesAndType(userId, requestedChannels, type) {
    // Check if notification type is enabled
    const typeEnabled = await isNotificationTypeEnabled(userId, type);
    if (!typeEnabled) {
        return []; // User has disabled this notification type entirely
    }
    // Filter by channel preferences
    return await filterChannelsByPreferences(userId, requestedChannels);
}
/**
 * Update user preferences (and clear cache)
 */
async function updateUserPreferences(userId, preferences) {
    // Load current settings
    const user = await db_1.models.user.findByPk(userId);
    if (!user) {
        throw new errors_1.UserNotFoundError(userId);
    }
    // Merge with existing settings
    const currentSettings = user.settings || {};
    const newSettings = {
        ...currentSettings,
        ...preferences,
    };
    // Update in database
    await db_1.models.user.update({ settings: newSettings }, { where: { id: userId } });
    // Clear cache to force reload
    await RedisCache_1.redisCache.clearUserPreferences(userId);
}
/**
 * Get user's push tokens
 */
async function getUserPushTokens(userId) {
    const prefs = await getUserPreferences(userId);
    if (!prefs.pushTokens || !Array.isArray(prefs.pushTokens)) {
        return [];
    }
    // Return only valid, active tokens
    return prefs.pushTokens
        .filter((token) => token && token.token)
        .map((token) => token.token);
}
/**
 * Add a push token for user
 */
async function addPushToken(userId, token, deviceType) {
    const prefs = await getUserPreferences(userId);
    const pushTokens = prefs.pushTokens || [];
    // Check if token already exists
    const existingIndex = pushTokens.findIndex((t) => t.token === token);
    if (existingIndex >= 0) {
        // Update last active
        pushTokens[existingIndex].lastActive = new Date().toISOString();
    }
    else {
        // Add new token
        pushTokens.push({
            token,
            deviceType,
            lastActive: new Date().toISOString(),
        });
    }
    await updateUserPreferences(userId, { pushTokens });
}
/**
 * Remove a push token for user
 */
async function removePushToken(userId, token) {
    const prefs = await getUserPreferences(userId);
    if (!prefs.pushTokens) {
        return;
    }
    const pushTokens = prefs.pushTokens.filter((t) => t.token !== token);
    await updateUserPreferences(userId, { pushTokens });
}
/**
 * Get user's contact information for specific channel
 */
async function getUserContactInfo(userId, channel) {
    const user = await db_1.models.user.findByPk(userId, {
        attributes: ["email", "phone", "settings"],
    });
    if (!user) {
        throw new errors_1.UserNotFoundError(userId);
    }
    switch (channel) {
        case "EMAIL":
            return user.email || null;
        case "SMS":
            return user.phone || null;
        case "PUSH":
            // Return first push token if available
            const tokens = await getUserPushTokens(userId);
            return tokens.length > 0 ? tokens[0] : null;
        default:
            return null;
    }
}
/**
 * Check if user has valid contact method for channel
 */
async function hasValidContactMethod(userId, channel) {
    const contactInfo = await getUserContactInfo(userId, channel);
    return contactInfo !== null && contactInfo.length > 0;
}
