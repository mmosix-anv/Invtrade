"use strict";
/**
 * PUT /api/admin/finance/binary/settings
 *
 * Updates the binary trading settings configuration.
 * Validates settings and returns warnings for potentially risky configurations.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.metadata = void 0;
const db_1 = require("@b/db");
const error_1 = require("@b/utils/error");
const query_1 = require("@b/utils/query");
const utils_1 = require("./utils");
const binary_settings_cache_1 = require("@b/utils/binary-settings-cache");
const cache_1 = require("@b/utils/cache");
exports.metadata = {
    summary: "Update Binary Settings",
    operationId: "updateBinarySettings",
    tags: ["Admin", "Binary", "Settings"],
    description: "Updates the binary trading settings configuration. Validates settings before saving and returns warnings for potentially risky configurations.",
    requestBody: {
        description: "Binary settings configuration to save",
        content: {
            "application/json": {
                schema: {
                    type: "object",
                    description: "Partial or complete binary settings object",
                },
            },
        },
        required: true,
    },
    responses: {
        200: {
            description: "Binary settings updated successfully",
            content: {
                "application/json": {
                    schema: {
                        type: "object",
                        properties: {
                            success: { type: "boolean" },
                            message: { type: "string" },
                            settings: {
                                type: "object",
                                description: "The saved binary trading settings",
                            },
                            validation: {
                                type: "object",
                                properties: {
                                    valid: { type: "boolean" },
                                    errors: { type: "array", items: { type: "string" } },
                                    warnings: {
                                        type: "array",
                                        items: {
                                            type: "object",
                                        },
                                    },
                                },
                            },
                        },
                    },
                },
            },
        },
        400: {
            description: "Validation failed - settings contain errors",
            content: {
                "application/json": {
                    schema: {
                        type: "object",
                        properties: {
                            message: { type: "string" },
                            errors: { type: "array", items: { type: "string" } },
                        },
                    },
                },
            },
        },
        401: query_1.unauthorizedResponse,
        500: query_1.serverErrorResponse,
    },
    requiresAuth: true,
    permission: "edit.binary.settings",
};
exports.default = async (data) => {
    var _a, _b, _c, _d, _e, _f;
    const { user, body, ctx } = data;
    if (!(user === null || user === void 0 ? void 0 : user.id)) {
        throw (0, error_1.createError)({ statusCode: 401, message: "Unauthorized" });
    }
    if (!body || typeof body !== "object") {
        throw (0, error_1.createError)({ statusCode: 400, message: "Invalid request body" });
    }
    ctx === null || ctx === void 0 ? void 0 : ctx.step("Processing binary settings update");
    try {
        // Extract binaryStatus and binaryPracticeStatus from body (separate new settings)
        const binaryStatus = (_c = (_a = body.binaryStatus) !== null && _a !== void 0 ? _a : (_b = body.global) === null || _b === void 0 ? void 0 : _b.enabled) !== null && _c !== void 0 ? _c : true;
        const binaryPracticeStatus = (_f = (_d = body.binaryPracticeStatus) !== null && _d !== void 0 ? _d : (_e = body.global) === null || _e === void 0 ? void 0 : _e.practiceEnabled) !== null && _f !== void 0 ? _f : true;
        // Merge provided settings with defaults to ensure complete configuration
        ctx === null || ctx === void 0 ? void 0 : ctx.step("Merging with default settings");
        const settings = (0, utils_1.mergeWithDefaults)(body.binarySettings || body);
        // Update timestamp
        settings._lastModified = new Date().toISOString();
        // Validate the settings
        ctx === null || ctx === void 0 ? void 0 : ctx.step("Validating settings configuration");
        const validation = (0, utils_1.validateBinarySettings)(settings);
        // If there are validation errors, reject the update
        if (!validation.valid) {
            ctx === null || ctx === void 0 ? void 0 : ctx.fail("Settings validation failed");
            throw (0, error_1.createError)({
                statusCode: 400,
                message: `Validation failed: ${validation.errors.join(", ")}`,
            });
        }
        // Save to database - save all three as separate keys
        ctx === null || ctx === void 0 ? void 0 : ctx.step("Saving settings to database");
        const settingsJson = JSON.stringify(settings);
        await Promise.all([
            db_1.models.settings.upsert({
                key: "binaryStatus",
                value: binaryStatus ? "true" : "false",
            }),
            db_1.models.settings.upsert({
                key: "binaryPracticeStatus",
                value: binaryPracticeStatus ? "true" : "false",
            }),
            db_1.models.settings.upsert({
                key: "binarySettings",
                value: settingsJson,
            }),
        ]);
        // Clear any cached settings
        ctx === null || ctx === void 0 ? void 0 : ctx.step("Clearing settings cache");
        (0, binary_settings_cache_1.invalidateBinarySettingsCache)();
        // Also clear the global cache manager (like main settings endpoint does)
        const cacheManager = cache_1.CacheManager.getInstance();
        await cacheManager.clearCache();
        ctx === null || ctx === void 0 ? void 0 : ctx.success("Binary settings updated successfully");
        return {
            success: true,
            message: "Binary settings updated successfully",
            settings,
            validation,
        };
    }
    catch (error) {
        if (error.statusCode) {
            throw error; // Re-throw validation errors
        }
        ctx === null || ctx === void 0 ? void 0 : ctx.fail(error.message || "Failed to update binary settings");
        throw (0, error_1.createError)({
            statusCode: 500,
            message: error.message || "Failed to update binary settings",
        });
    }
};
