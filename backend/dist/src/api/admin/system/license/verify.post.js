"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.metadata = void 0;
const utils_1 = require("@b/api/admin/system/utils");
exports.metadata = {
    summary: "Verifies the license for a product",
    operationId: "verifyProductLicense",
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
                            description: "Product ID whose license to verify",
                        },
                        purchaseCode: {
                            type: "string",
                            description: "Purchase code for the product",
                        },
                        envatoUsername: {
                            type: "string",
                            description: "Envato username of the purchaser",
                        },
                    },
                    required: ["productId"],
                },
            },
        },
    },
    responses: {
        200: {
            description: "License verified successfully",
            content: {
                "application/json": {
                    schema: {
                        type: "object",
                        properties: {
                            message: {
                                type: "string",
                                description: "Confirmation message indicating successful verification",
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
    // requiresAuth: true,
    logModule: "ADMIN_SYS",
    logTitle: "Verify license",
};
exports.default = async (data) => {
    const { ctx } = data;
    ctx === null || ctx === void 0 ? void 0 : ctx.step("Validating license details");
    ctx === null || ctx === void 0 ? void 0 : ctx.step("Verifying license with Envato");
    const result = await (0, utils_1.verifyLicense)(data.body.productId, data.body.purchaseCode, data.body.envatoUsername);
    ctx === null || ctx === void 0 ? void 0 : ctx.success("License verified successfully");
    return result;
};
