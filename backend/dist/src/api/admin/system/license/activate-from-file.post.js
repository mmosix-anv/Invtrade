"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.metadata = void 0;
const utils_1 = require("@b/api/admin/system/utils");
const license_validator_1 = require("@b/utils/security/license-validator");
const Middleware_1 = require("@b/handler/Middleware");
const error_1 = require("@b/utils/error");
exports.metadata = {
    summary: "Activates the license from an Envato license file in the /lic folder",
    operationId: "activateLicenseFromFile",
    tags: ["Admin", "System"],
    requestBody: {
        required: false,
        content: {
            "application/json": {
                schema: {
                    type: "object",
                    properties: {
                        productId: {
                            type: "string",
                            description: "Product ID (optional, auto-detected)",
                        },
                    },
                },
            },
        },
    },
    responses: {
        200: {
            description: "License activated successfully from Envato file",
            content: {
                "application/json": {
                    schema: {
                        type: "object",
                        properties: {
                            message: { type: "string" },
                            productId: { type: "string" },
                            purchaseCode: { type: "string" },
                            licensee: { type: "string" },
                        },
                    },
                },
            },
        },
        400: {
            description: "No Envato license file found",
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
    logTitle: "Activate license from file",
};
exports.default = async (data) => {
    var _a;
    const { ctx } = data;
    ctx === null || ctx === void 0 ? void 0 : ctx.step("Looking for Envato license file");
    // Get product info
    const product = await (0, utils_1.getProduct)();
    const productId = ((_a = data.body) === null || _a === void 0 ? void 0 : _a.productId) || product.productId || product.id;
    // Get validator and check for Envato license
    const validator = (0, license_validator_1.getValidator)(productId);
    const envatoInfo = await validator.getEnvatoLicenseInfo();
    if (!envatoInfo) {
        throw (0, error_1.createError)({
            statusCode: 400,
            message: "No Envato license file found. Please download your license from Envato and place it in the /lic folder, or enter your purchase code manually."
        });
    }
    ctx === null || ctx === void 0 ? void 0 : ctx.step("Found Envato license file");
    ctx === null || ctx === void 0 ? void 0 : ctx.step("Activating license with Envato");
    // Activate using the purchase code from the Envato file
    const result = await (0, utils_1.activateLicense)(productId, envatoInfo.purchaseCode, envatoInfo.authorUsername || "auto");
    // Clear extension license cache so the new license takes effect immediately
    (0, Middleware_1.clearExtensionLicenseCache)();
    ctx === null || ctx === void 0 ? void 0 : ctx.success("License activated from Envato file");
    return {
        success: true,
        ...result,
        productId,
        purchaseCode: envatoInfo.purchaseCode.substring(0, 8) + "...", // Partially hide code
        licensee: envatoInfo.licensee,
    };
};
