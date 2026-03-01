"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.metadata = void 0;
const utils_1 = require("@b/api/admin/system/utils");
const security_1 = require("@b/utils/security");
const license_validator_1 = require("@b/utils/security/license-validator");
exports.metadata = {
    summary: "Gets the current license status",
    operationId: "getLicenseStatus",
    tags: ["Admin", "System"],
    logModule: "ADMIN_SYS",
    logTitle: "Get License Status",
    responses: {
        200: {
            description: "License status retrieved successfully",
            content: {
                "application/json": {
                    schema: {
                        type: "object",
                        properties: {
                            productId: {
                                type: "string",
                                description: "The product ID",
                            },
                            productName: {
                                type: "string",
                                description: "The product name",
                            },
                            licenseStatus: {
                                type: "string",
                                description: "Current license status",
                                enum: ["active", "expired", "revoked", "invalid", "not_found", "not_activated"],
                            },
                            isValid: {
                                type: "boolean",
                                description: "Whether the license is valid",
                            },
                            securityLevel: {
                                type: "number",
                                description: "Current security level (0-4)",
                            },
                            envatoLicense: {
                                type: "object",
                                description: "Detected Envato license file info (if available)",
                                properties: {
                                    purchaseCode: { type: "string" },
                                    itemId: { type: "string" },
                                    licensee: { type: "string" },
                                    purchaseDate: { type: "string" },
                                },
                            },
                            message: {
                                type: "string",
                                description: "Status message",
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
};
exports.default = async (data) => {
    var _a, _b, _c;
    const { ctx } = data;
    ctx === null || ctx === void 0 ? void 0 : ctx.step("Getting product info");
    // Get product info
    const product = await (0, utils_1.getProduct)();
    const productId = product.productId || product.id;
    ctx === null || ctx === void 0 ? void 0 : ctx.step(`Product ID: ${productId}`);
    // Get security status
    ctx === null || ctx === void 0 ? void 0 : ctx.step("Getting security status");
    let securityStatus = (0, security_1.getSecurityStatus)();
    ctx === null || ctx === void 0 ? void 0 : ctx.step(`Security level: ${securityStatus.securityLevel}, License valid: ${securityStatus.licenseValid}`);
    // Get validator to check for license files
    ctx === null || ctx === void 0 ? void 0 : ctx.step("Checking for license files");
    const validator = (0, license_validator_1.getValidator)(productId);
    // Check for Envato license.txt file
    const envatoInfo = await validator.getEnvatoLicenseInfo();
    // If cached status shows invalid, try to revalidate
    // This handles the case where activation succeeded but cache wasn't updated
    if (!securityStatus.licenseValid) {
        ctx === null || ctx === void 0 ? void 0 : ctx.step("License not valid in cache, attempting fresh validation");
        // Force revalidation to check if there's a valid .lic file
        const freshResult = await validator.forceRevalidate();
        if (freshResult.valid) {
            ctx === null || ctx === void 0 ? void 0 : ctx.step("Fresh validation succeeded, updating security manager");
            // Update the security manager with the new status
            await security_1.SecurityManager.getInstance().revalidate();
            // Get the updated status
            securityStatus = (0, security_1.getSecurityStatus)();
            ctx === null || ctx === void 0 ? void 0 : ctx.step(`Updated security level: ${securityStatus.securityLevel}, License valid: ${securityStatus.licenseValid}`);
        }
        else {
            ctx === null || ctx === void 0 ? void 0 : ctx.step(`Fresh validation failed: ${freshResult.status} - ${freshResult.message}`);
        }
    }
    // Build response
    const response = {
        productId,
        productName: product.name || "Invtrade",
        productVersion: product.version,
        licenseStatus: ((_a = securityStatus.license) === null || _a === void 0 ? void 0 : _a.status) || "not_found",
        isValid: securityStatus.licenseValid,
        securityLevel: securityStatus.securityLevel,
        initialized: securityStatus.initialized,
    };
    // Add Envato license info if found (only if not already activated)
    if (envatoInfo && !securityStatus.licenseValid) {
        ctx === null || ctx === void 0 ? void 0 : ctx.step(`Envato license found: ${envatoInfo.purchaseCode.substring(0, 8)}...`);
        response.envatoLicense = {
            purchaseCode: envatoInfo.purchaseCode,
            itemId: envatoInfo.itemId,
            itemTitle: envatoInfo.itemTitle,
            licensee: envatoInfo.licensee,
            purchaseDate: envatoInfo.purchaseDate,
            licenseType: envatoInfo.licenseType,
        };
        response.message = "Envato license file detected. Click 'Activate' to activate your license.";
    }
    else if (!securityStatus.licenseValid) {
        ctx === null || ctx === void 0 ? void 0 : ctx.warn("No license found");
        response.message = "No license found. Please enter your Envato purchase code to activate.";
    }
    else {
        ctx === null || ctx === void 0 ? void 0 : ctx.success("License is active and valid");
        response.message = "License is active and valid.";
    }
    // Add expiration info if available
    if ((_b = securityStatus.license) === null || _b === void 0 ? void 0 : _b.expiresAt) {
        response.expiresAt = securityStatus.license.expiresAt;
    }
    // Add features if available
    if ((_c = securityStatus.license) === null || _c === void 0 ? void 0 : _c.features) {
        response.features = securityStatus.license.features;
    }
    return response;
};
