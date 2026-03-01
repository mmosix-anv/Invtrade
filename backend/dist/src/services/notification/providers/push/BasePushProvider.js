"use strict";
/**
 * Base Push Notification Provider
 * Abstract class for all push notification providers
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.BasePushProvider = void 0;
const console_1 = require("@b/utils/console");
/**
 * BasePushProvider - Abstract class for push notification providers
 */
class BasePushProvider {
    constructor(name, config) {
        this.name = name;
        this.config = config || this.loadConfigFromEnv();
    }
    /**
     * Filter valid tokens
     */
    filterValidTokens(tokens) {
        return tokens.filter((token) => this.validateToken(token));
    }
    /**
     * Truncate notification text
     */
    truncateText(text, maxLength) {
        if (text.length <= maxLength) {
            return text;
        }
        return text.substring(0, maxLength - 3) + "...";
    }
    /**
     * Build notification payload
     */
    buildPayload(data, platformOptions) {
        return {
            notification: {
                title: this.truncateText(data.title, 65), // FCM limit
                body: this.truncateText(data.body, 240), // FCM limit
                image: data.imageUrl,
                icon: data.icon,
            },
            data: data.data || {},
            android: (platformOptions === null || platformOptions === void 0 ? void 0 : platformOptions.android) || {},
            apns: (platformOptions === null || platformOptions === void 0 ? void 0 : platformOptions.ios)
                ? {
                    payload: {
                        aps: {
                            badge: platformOptions.ios.badge,
                            sound: platformOptions.ios.sound || "default",
                            contentAvailable: platformOptions.ios.contentAvailable,
                            mutableContent: platformOptions.ios.mutableContent,
                        },
                    },
                }
                : undefined,
            webpush: (platformOptions === null || platformOptions === void 0 ? void 0 : platformOptions.web)
                ? {
                    notification: {
                        icon: platformOptions.web.icon,
                        badge: platformOptions.web.badge,
                        vibrate: platformOptions.web.vibrate,
                    },
                }
                : undefined,
        };
    }
    /**
     * Log message
     */
    log(message, data) {
        if (data !== undefined) {
            console_1.logger.info(`Push:${this.name}`, message, data);
        }
        else {
            console_1.logger.info(`Push:${this.name}`, message);
        }
    }
    /**
     * Log error
     */
    logError(message, error) {
        console_1.logger.error(`Push:${this.name}`, message, error instanceof Error ? error : new Error(JSON.stringify(error)));
    }
}
exports.BasePushProvider = BasePushProvider;
