"use strict";
/**
 * Push Notification Channel
 * Handles push notifications via:
 * - Firebase Cloud Messaging (FCM) for mobile apps
 * - Web Push (VAPID) for browsers when FCM is not available
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.PushChannel = void 0;
const BaseChannel_1 = require("./BaseChannel");
const FCMProvider_1 = require("../providers/push/FCMProvider");
const WebPushProvider_1 = require("../providers/push/WebPushProvider");
const db_1 = require("@b/db");
/**
 * PushChannel - Push notification delivery via FCM or WebPush
 */
class PushChannel extends BaseChannel_1.BaseChannel {
    constructor() {
        super("PUSH");
        this.fcmProvider = null;
        this.webPushProvider = null;
        this.hasFCM = false;
        this.hasWebPush = false;
        this.initializeProviders();
    }
    /**
     * Initialize push providers based on available configuration
     */
    initializeProviders() {
        // Try to initialize FCM
        const hasFCMConfig = !!(process.env.FCM_PROJECT_ID ||
            process.env.FCM_SERVICE_ACCOUNT_PATH);
        if (hasFCMConfig) {
            try {
                this.fcmProvider = new FCMProvider_1.FCMProvider();
                if (this.fcmProvider.validateConfig()) {
                    this.hasFCM = true;
                }
            }
            catch (error) {
                this.logError("Failed to initialize FCM provider", error);
            }
        }
        // Try to initialize WebPush
        const hasVAPIDConfig = !!(process.env.VAPID_PUBLIC_KEY &&
            process.env.VAPID_PRIVATE_KEY);
        if (hasVAPIDConfig) {
            try {
                this.webPushProvider = new WebPushProvider_1.WebPushProvider();
                if (this.webPushProvider.validateConfig()) {
                    this.hasWebPush = true;
                }
            }
            catch (error) {
                this.logError("Failed to initialize WebPush provider", error);
            }
        }
    }
    /**
     * Send push notification
     */
    async send(operation, transaction) {
        var _a, _b, _c, _d;
        try {
            // Get user's push tokens
            const user = await db_1.models.user.findByPk(operation.userId, {
                attributes: ["settings"],
                transaction,
            });
            if (!user || !user.settings) {
                return {
                    success: false,
                    error: "User not found",
                };
            }
            // Get push tokens from user settings (both FCM and WebPush)
            const { fcmTokens, webPushTokens } = this.categorizeTokens(user.settings);
            if (fcmTokens.length === 0 && webPushTokens.length === 0) {
                return {
                    success: false,
                    error: "No push notification tokens found for user",
                };
            }
            // Prepare push notification data
            const pushData = this.preparePushData(operation);
            const platformOptions = this.preparePlatformOptions(operation);
            const results = [];
            const invalidTokens = [];
            // Send via FCM if available and has tokens
            if (this.hasFCM && this.fcmProvider && fcmTokens.length > 0) {
                pushData.tokens = fcmTokens;
                const fcmResult = await this.fcmProvider.send(pushData, platformOptions);
                results.push(fcmResult);
                if (((_b = (_a = fcmResult.metadata) === null || _a === void 0 ? void 0 : _a.invalidTokens) === null || _b === void 0 ? void 0 : _b.length) > 0) {
                    invalidTokens.push(...fcmResult.metadata.invalidTokens);
                }
            }
            // Send via WebPush if available and has tokens
            if (this.hasWebPush && this.webPushProvider && webPushTokens.length > 0) {
                pushData.tokens = webPushTokens;
                const webPushResult = await this.webPushProvider.send(pushData, platformOptions);
                results.push(webPushResult);
                if (((_d = (_c = webPushResult.metadata) === null || _c === void 0 ? void 0 : _c.invalidSubscriptions) === null || _d === void 0 ? void 0 : _d.length) > 0) {
                    invalidTokens.push(...webPushResult.metadata.invalidSubscriptions);
                }
            }
            // Remove invalid tokens
            if (invalidTokens.length > 0) {
                await this.removeInvalidTokens(operation.userId, invalidTokens, transaction);
            }
            // Aggregate results
            const successCount = results.filter((r) => r.success).length;
            const totalSuccess = results.reduce((sum, r) => { var _a; return sum + (((_a = r.metadata) === null || _a === void 0 ? void 0 : _a.successCount) || (r.success ? 1 : 0)); }, 0);
            if (successCount === 0) {
                return {
                    success: false,
                    error: results.map((r) => r.error).filter(Boolean).join("; "),
                };
            }
            return {
                success: true,
                messageId: `push-${Date.now()}`,
                metadata: {
                    fcmTokens: fcmTokens.length,
                    webPushTokens: webPushTokens.length,
                    totalSuccess,
                    results,
                },
            };
        }
        catch (error) {
            this.logError("Failed to send push notification", error);
            return {
                success: false,
                error: error.message || "Failed to send push notification",
            };
        }
    }
    /**
     * Categorize tokens by provider type
     */
    categorizeTokens(settings) {
        const fcmTokens = [];
        const webPushTokens = [];
        if (!settings) {
            return { fcmTokens, webPushTokens };
        }
        // New format: pushTokens with type information
        if (settings.pushTokens) {
            // Array format with typed entries
            if (Array.isArray(settings.pushTokens)) {
                for (const entry of settings.pushTokens) {
                    if (typeof entry === "string") {
                        // Legacy string token - check if it's a WebPush subscription
                        if (this.isWebPushSubscription(entry)) {
                            webPushTokens.push(entry);
                        }
                        else {
                            fcmTokens.push(entry);
                        }
                    }
                    else if (entry && typeof entry === "object") {
                        // Typed entry
                        if (entry.type === "webpush" && entry.token) {
                            webPushTokens.push(entry.token);
                        }
                        else if (entry.type === "fcm" && entry.token) {
                            fcmTokens.push(entry.token);
                        }
                        else if (entry.token) {
                            // Unknown type, try to detect
                            if (this.isWebPushSubscription(entry.token)) {
                                webPushTokens.push(entry.token);
                            }
                            else {
                                fcmTokens.push(entry.token);
                            }
                        }
                    }
                }
            }
            // Object format: { deviceId: { type, token } } or { deviceId: token }
            else if (typeof settings.pushTokens === "object") {
                for (const [deviceId, value] of Object.entries(settings.pushTokens)) {
                    if (typeof value === "string") {
                        if (this.isWebPushSubscription(value)) {
                            webPushTokens.push(value);
                        }
                        else {
                            fcmTokens.push(value);
                        }
                    }
                    else if (value && typeof value === "object") {
                        const entry = value;
                        if (entry.type === "webpush" && entry.token) {
                            webPushTokens.push(entry.token);
                        }
                        else if (entry.type === "fcm" && entry.token) {
                            fcmTokens.push(entry.token);
                        }
                        else if (entry.token) {
                            if (this.isWebPushSubscription(entry.token)) {
                                webPushTokens.push(entry.token);
                            }
                            else {
                                fcmTokens.push(entry.token);
                            }
                        }
                    }
                }
            }
        }
        // Also check webPushSubscriptions for backwards compatibility
        if (settings.webPushSubscriptions) {
            if (Array.isArray(settings.webPushSubscriptions)) {
                for (const sub of settings.webPushSubscriptions) {
                    const subStr = typeof sub === "string" ? sub : JSON.stringify(sub);
                    if (!webPushTokens.includes(subStr)) {
                        webPushTokens.push(subStr);
                    }
                }
            }
        }
        return { fcmTokens, webPushTokens };
    }
    /**
     * Check if a token is a WebPush subscription
     */
    isWebPushSubscription(token) {
        try {
            const parsed = JSON.parse(token);
            return (parsed &&
                typeof parsed.endpoint === "string" &&
                parsed.endpoint.startsWith("https://") &&
                parsed.keys &&
                typeof parsed.keys.p256dh === "string" &&
                typeof parsed.keys.auth === "string");
        }
        catch (_a) {
            return false;
        }
    }
    /**
     * Prepare push notification data
     */
    preparePushData(operation) {
        const data = operation.data || {};
        return {
            tokens: [], // Will be set by send method
            title: data.title || "Notification",
            body: data.pushMessage || data.message || "You have a new notification",
            data: {
                type: operation.type,
                notificationId: data.relatedId || "",
                link: data.link || "",
                ...data.pushData, // Additional custom data
            },
            imageUrl: data.imageUrl || data.pushImageUrl,
            icon: data.icon || data.pushIcon,
            badge: data.badge,
            sound: data.sound || "default",
            clickAction: data.link || data.clickAction,
            tag: data.tag || operation.type,
            priority: this.mapPriority(operation.priority),
        };
    }
    /**
     * Prepare platform-specific options
     */
    preparePlatformOptions(operation) {
        const data = operation.data || {};
        return {
            android: {
                channelId: data.androidChannelId || "default-channel",
                color: data.androidColor || "#1976D2",
                vibrate: data.vibrate !== false,
                lights: data.lights !== false,
            },
            ios: {
                badge: data.badge,
                sound: data.sound || "default",
                contentAvailable: data.contentAvailable || false,
                mutableContent: data.mutableContent || false,
            },
            web: {
                icon: data.icon || "/img/logo/android-chrome-192x192.png",
                badge: data.webBadge || "/img/logo/android-icon-96x96.png",
                vibrate: data.vibrate !== false ? [200, 100, 200] : undefined,
            },
        };
    }
    /**
     * Map notification priority to push priority
     */
    mapPriority(priority) {
        return priority === "HIGH" || priority === "URGENT" ? "high" : "normal";
    }
    /**
     * Remove invalid tokens from user settings
     */
    async removeInvalidTokens(userId, invalidTokens, transaction) {
        try {
            const user = await db_1.models.user.findByPk(userId, { transaction });
            if (!user || !user.settings) {
                return;
            }
            let updated = false;
            const settings = { ...user.settings };
            // Handle pushTokens
            if (settings.pushTokens) {
                // Array format
                if (Array.isArray(settings.pushTokens)) {
                    const originalLength = settings.pushTokens.length;
                    settings.pushTokens = settings.pushTokens.filter((entry) => {
                        const token = typeof entry === "string" ? entry : entry === null || entry === void 0 ? void 0 : entry.token;
                        return !invalidTokens.some((invalid) => (token === null || token === void 0 ? void 0 : token.includes(invalid)) || (invalid === null || invalid === void 0 ? void 0 : invalid.includes(token)));
                    });
                    if (settings.pushTokens.length !== originalLength) {
                        updated = true;
                    }
                }
                // Object format
                else if (typeof settings.pushTokens === "object") {
                    for (const [key, value] of Object.entries(settings.pushTokens)) {
                        const token = typeof value === "string" ? value : value === null || value === void 0 ? void 0 : value.token;
                        if (invalidTokens.some((invalid) => (token === null || token === void 0 ? void 0 : token.includes(invalid)) || (invalid === null || invalid === void 0 ? void 0 : invalid.includes(token)))) {
                            delete settings.pushTokens[key];
                            updated = true;
                        }
                    }
                }
            }
            // Handle webPushSubscriptions
            if (settings.webPushSubscriptions && Array.isArray(settings.webPushSubscriptions)) {
                const originalLength = settings.webPushSubscriptions.length;
                settings.webPushSubscriptions = settings.webPushSubscriptions.filter((sub) => {
                    const subStr = typeof sub === "string" ? sub : JSON.stringify(sub);
                    return !invalidTokens.some((invalid) => subStr.includes(invalid));
                });
                if (settings.webPushSubscriptions.length !== originalLength) {
                    updated = true;
                }
            }
            if (updated) {
                await user.update({ settings }, { transaction });
                this.log("Removed invalid push tokens", {
                    userId,
                    removedCount: invalidTokens.length,
                });
            }
        }
        catch (error) {
            this.logError("Failed to remove invalid tokens", error);
        }
    }
    /**
     * Validate push channel is configured
     */
    validateConfig() {
        // At least one provider must be available
        return this.hasFCM || this.hasWebPush;
    }
    /**
     * Check if FCM is available
     */
    hasFCMProvider() {
        return this.hasFCM;
    }
    /**
     * Check if WebPush is available
     */
    hasWebPushProvider() {
        return this.hasWebPush;
    }
    /**
     * Get WebPush VAPID public key for frontend
     */
    getVapidPublicKey() {
        var _a;
        return ((_a = this.webPushProvider) === null || _a === void 0 ? void 0 : _a.getPublicKey()) || null;
    }
    /**
     * Add device token to user settings
     */
    async addDeviceToken(userId, token, type = "fcm", deviceId, platform) {
        try {
            const user = await db_1.models.user.findByPk(userId);
            if (!user) {
                return false;
            }
            // Make a copy of settings to avoid mutation issues
            const settings = { ...(user.settings || {}) };
            // Initialize pushTokens if not exists
            if (!settings.pushTokens) {
                settings.pushTokens = {};
            }
            // Generate device ID if not provided
            const id = deviceId || `${type}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
            // Store with device ID
            const entry = {
                type,
                token,
                deviceId: id,
                platform,
                createdAt: new Date(),
            };
            // Check if token already exists
            if (typeof settings.pushTokens === "object" && !Array.isArray(settings.pushTokens)) {
                for (const [key, value] of Object.entries(settings.pushTokens)) {
                    const existingToken = typeof value === "string" ? value : value === null || value === void 0 ? void 0 : value.token;
                    if (existingToken === token) {
                        return true; // Token already exists
                    }
                }
                // Add or update device token
                settings.pushTokens[id] = entry;
            }
            else {
                // Convert to object format if array
                const newTokens = {};
                if (Array.isArray(settings.pushTokens)) {
                    settings.pushTokens.forEach((t, i) => {
                        if (typeof t === "string") {
                            newTokens[`legacy-${i}`] = {
                                type: this.isWebPushSubscription(t) ? "webpush" : "fcm",
                                token: t,
                            };
                        }
                        else {
                            newTokens[t.deviceId || `legacy-${i}`] = t;
                        }
                    });
                }
                newTokens[id] = entry;
                settings.pushTokens = newTokens;
            }
            await user.update({ settings });
            return true;
        }
        catch (error) {
            this.logError("Failed to add device token", error);
            return false;
        }
    }
    /**
     * Add WebPush subscription (convenience method)
     */
    async addWebPushSubscription(userId, subscription, deviceId) {
        return this.addDeviceToken(userId, JSON.stringify(subscription), "webpush", deviceId, "web");
    }
    /**
     * Remove device token from user settings
     */
    async removeDeviceToken(userId, tokenOrDeviceId) {
        try {
            const user = await db_1.models.user.findByPk(userId);
            if (!user || !user.settings || !user.settings.pushTokens) {
                return false;
            }
            const settings = { ...user.settings };
            let updated = false;
            // Object format (remove by device ID or token match)
            if (typeof settings.pushTokens === "object" && !Array.isArray(settings.pushTokens)) {
                // Try to find by device ID first
                if (settings.pushTokens[tokenOrDeviceId]) {
                    delete settings.pushTokens[tokenOrDeviceId];
                    updated = true;
                }
                else {
                    // Try to find by token value
                    for (const [key, value] of Object.entries(settings.pushTokens)) {
                        const token = typeof value === "string" ? value : value === null || value === void 0 ? void 0 : value.token;
                        if (token === tokenOrDeviceId || (token === null || token === void 0 ? void 0 : token.includes(tokenOrDeviceId))) {
                            delete settings.pushTokens[key];
                            updated = true;
                            break;
                        }
                    }
                }
            }
            // Array format
            else if (Array.isArray(settings.pushTokens)) {
                const originalLength = settings.pushTokens.length;
                settings.pushTokens = settings.pushTokens.filter((entry) => {
                    const token = typeof entry === "string" ? entry : entry === null || entry === void 0 ? void 0 : entry.token;
                    return token !== tokenOrDeviceId && !(token === null || token === void 0 ? void 0 : token.includes(tokenOrDeviceId));
                });
                updated = settings.pushTokens.length !== originalLength;
            }
            if (updated) {
                await user.update({ settings });
                this.log("Removed device token", { userId, tokenOrDeviceId });
                return true;
            }
            return false;
        }
        catch (error) {
            this.logError("Failed to remove device token", error);
            return false;
        }
    }
}
exports.PushChannel = PushChannel;
