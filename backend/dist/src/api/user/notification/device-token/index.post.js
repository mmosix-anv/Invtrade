"use strict";
/**
 * Add Device Token
 * POST /api/user/notification/device-token
 *
 * Register a device token for push notifications
 */
Object.defineProperty(exports, "__esModule", { value: true });
const notification_1 = require("@b/services/notification");
exports.default = async (data) => {
    const { user, body } = data;
    if (!(user === null || user === void 0 ? void 0 : user.id)) {
        throw new Error("Unauthorized");
    }
    const { token, deviceId, platform } = body;
    if (!token) {
        throw new Error("Device token is required");
    }
    // Add device token
    const success = await (0, notification_1.addDeviceToken)(user.id, token, deviceId, platform);
    if (!success) {
        throw new Error("Failed to add device token");
    }
    return {
        message: "Device token registered successfully",
        deviceId: deviceId || "auto-generated",
    };
};
