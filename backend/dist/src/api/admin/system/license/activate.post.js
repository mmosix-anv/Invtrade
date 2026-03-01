"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.metadata = void 0;
const utils_1 = require("@b/api/admin/system/utils");
const security_1 = require("@b/utils/security");
const Middleware_1 = require("@b/handler/Middleware");
const error_1 = require("@b/utils/error");
exports.metadata = {
    summary: "Activates the license for a product",
    operationId: "activateProductLicense",
    tags: ["Admin", "System"],
    requestBody: {
        required: true,
        content: {
            "application/json": {
                schema: {
                    type: "object",
                    properties: {
                        productId: {
                            type: "string",
                            description: "Product ID whose license to activate (optional, auto-detected from package.json)",
                        },
                        purchaseCode: {
                            type: "string",
                            description: "Envato purchase code for the product",
                        },
                        envatoUsername: {
                            type: "string",
                            description: "Envato username of the purchaser (optional, auto-detected from purchase code)",
                        },
                        notificationEmail: {
                            type: "string",
                            description: "Optional email to receive update notifications",
                        },
                    },
                    required: ["purchaseCode"],
                },
            },
        },
    },
    responses: {
        200: {
            description: "License activated successfully",
            content: {
                "application/json": {
                    schema: {
                        type: "object",
                        properties: {
                            message: {
                                type: "string",
                                description: "Confirmation message indicating successful activation",
                            },
                            productId: {
                                type: "string",
                                description: "The product ID that was activated",
                            },
                        },
                    },
                },
            },
        },
        401: {
            description: "Unauthorized, admin permission required",
        },
        500: {
            description: "Internal server error",
        },
    },
    requiresAuth: true,
    logModule: "ADMIN_SYS",
    logTitle: "Activate license",
};
exports.default = async (data) => {
    const { ctx } = data;
    const { purchaseCode, envatoUsername, notificationEmail } = data.body;
    ctx === null || ctx === void 0 ? void 0 : ctx.step("Validating license details");
    // Auto-detect product ID if not provided
    let productId = data.body.productId;
    if (!productId) {
        const product = await (0, utils_1.getProduct)();
        productId = product.productId || product.id;
    }
    if (!purchaseCode) {
        throw (0, error_1.createError)({ statusCode: 400, message: "Purchase code is required" });
    }
    ctx === null || ctx === void 0 ? void 0 : ctx.step("Activating license with Envato");
    // Use provided username or "auto" to let the API detect it
    const username = envatoUsername || "auto";
    try {
        const result = await (0, utils_1.activateLicense)(productId, purchaseCode, username, notificationEmail);
        ctx === null || ctx === void 0 ? void 0 : ctx.step("Revalidating security status");
        // Revalidate security manager to update cached license status
        // This ensures the licenseEnforcementGate allows access immediately
        await security_1.SecurityManager.getInstance().revalidate();
        // Clear extension license cache so the new license takes effect immediately
        (0, Middleware_1.clearExtensionLicenseCache)();
        ctx === null || ctx === void 0 ? void 0 : ctx.success("License activated successfully");
        return {
            success: true,
            ...result,
            productId,
        };
    }
    catch (error) {
        ctx === null || ctx === void 0 ? void 0 : ctx.fail(`Activation failed: ${error.message}`);
        // Return error with details instead of throwing
        return {
            success: false,
            message: error.message,
            productId,
        };
    }
};
