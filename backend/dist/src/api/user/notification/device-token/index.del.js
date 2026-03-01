"use strict";
/**
 * Remove Device Token
 * DELETE /api/user/notification/device-token
 *
 * Unregister a device token for push notifications
 */
Object.defineProperty(exports, "__esModule", { value: true });
const notification_1 = require("@b/services/notification");
exports.default = async (data) => {
    const { user, body } = data;
    if (!(user === null || user === void 0 ? void 0 : user.id)) {
        throw new Error("Unauthorized");
    }
    const { token, deviceId } = body;
    if (!token && !deviceId) {
        throw new Error("Device token or device ID is required");
    }
    // Remove device token
    const success = await (0, notification_1.removeDeviceToken)(user.id, token || deviceId);
    if (!success) {
        return {
            message: "Device token not found or already removed",
        };
    }
    return {
        message: "Device token removed successfully",
    };
};
