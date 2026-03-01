"use strict";
/**
 * Public Binary Settings API
 *
 * Returns binary trading settings for the trading interface.
 * This is a read-only endpoint that doesn't require admin permissions.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.metadata = void 0;
const binary_settings_cache_1 = require("@b/utils/binary-settings-cache");
exports.metadata = {
    summary: "Get Binary Trading Settings",
    description: "Returns binary trading configuration for the trading interface",
    operationId: "getBinarySettings",
    tags: ["Binary", "Settings"],
    responses: {
        200: {
            description: "Binary settings retrieved successfully",
            content: {
                "application/json": {
                    schema: {
                        type: "object",
                        properties: {
                            settings: {
                                type: "object",
                                description: "Binary trading settings",
                            },
                        },
                    },
                },
            },
        },
    },
};
exports.default = async (data) => {
    const settings = await (0, binary_settings_cache_1.getBinarySettings)();
    // Return a sanitized version of settings (hide admin-only fields if needed)
    const publicSettings = {
        global: {
            enabled: settings.global.enabled,
            practiceEnabled: settings.global.practiceEnabled,
            maxConcurrentOrders: settings.global.maxConcurrentOrders,
            maxDailyOrders: settings.global.maxDailyOrders,
            cooldownSeconds: settings.global.cooldownSeconds,
            orderExpirationBuffer: settings.global.orderExpirationBuffer,
            cancelExpirationBuffer: settings.global.cancelExpirationBuffer,
        },
        display: settings.display, // Include display settings (chartType, etc.)
        orderTypes: settings.orderTypes,
        durations: settings.durations,
        cancellation: settings.cancellation,
    };
    return {
        settings: publicSettings,
    };
};
