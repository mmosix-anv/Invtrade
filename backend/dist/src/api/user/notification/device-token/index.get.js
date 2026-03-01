"use strict";
/**
 * Get Device Tokens
 * GET /api/user/notification/device-token
 *
 * Get all registered device tokens for the user
 */
Object.defineProperty(exports, "__esModule", { value: true });
const notification_1 = require("@b/services/notification");
exports.default = async (data) => {
    const { user } = data;
    if (!(user === null || user === void 0 ? void 0 : user.id)) {
        throw new Error("Unauthorized");
    }
    // Get all device tokens
    const tokens = await (0, notification_1.getDeviceTokens)(user.id);
    return {
        tokens: tokens.map((t) => ({
            deviceId: t.deviceId,
            platform: t.platform,
            createdAt: t.createdAt,
            lastUsed: t.lastUsed,
            // Don't expose full token for security
            tokenPreview: t.token.substring(0, 20) + "...",
        })),
        count: tokens.length,
    };
};
