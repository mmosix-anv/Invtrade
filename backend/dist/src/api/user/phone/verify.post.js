"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.metadata = void 0;
const error_1 = require("@b/utils/error");
const db_1 = require("@b/db");
exports.metadata = {
    summary: "Verify phone number with code",
    operationId: "verifyPhoneNumber",
    tags: ["User", "Phone"],
    requiresAuth: true,
    logModule: "USER",
    logTitle: "Verify phone number",
    requestBody: {
        required: true,
        content: {
            "application/json": {
                schema: {
                    type: "object",
                    properties: {
                        code: {
                            type: "string",
                            description: "Verification code sent to phone",
                        },
                    },
                    required: ["code"],
                },
            },
        },
    },
    responses: {
        200: { description: "Phone verified" },
        400: { description: "Invalid or expired code" },
        401: { description: "Unauthorized" },
    },
};
exports.default = async (data) => {
    const { user, body, ctx } = data;
    if (!user) {
        ctx === null || ctx === void 0 ? void 0 : ctx.fail("User not authenticated");
        throw (0, error_1.createError)({ statusCode: 401, message: "Unauthorized" });
    }
    const { code } = body;
    ctx === null || ctx === void 0 ? void 0 : ctx.step("Retrieving user record");
    const userRecord = await db_1.models.user.findByPk(user.id);
    ctx === null || ctx === void 0 ? void 0 : ctx.step("Validating verification code");
    if (!userRecord.phoneVerificationCode ||
        !userRecord.phoneVerificationExpiresAt ||
        userRecord.phoneVerificationCode !== code ||
        new Date(userRecord.phoneVerificationExpiresAt) < new Date()) {
        ctx === null || ctx === void 0 ? void 0 : ctx.fail("Invalid or expired verification code");
        throw (0, error_1.createError)({ statusCode: 400, message: "Invalid or expired code" });
    }
    ctx === null || ctx === void 0 ? void 0 : ctx.step("Updating phone verification status");
    // Verification successful - set phone and mark as verified
    await userRecord.update({
        phone: userRecord.phoneTemp,
        phoneVerified: true,
        phoneVerificationCode: null,
        phoneVerificationExpiresAt: null,
        phoneTemp: null,
    });
    ctx === null || ctx === void 0 ? void 0 : ctx.success("Phone number verified successfully");
    return { message: "Phone number verified successfully." };
};
