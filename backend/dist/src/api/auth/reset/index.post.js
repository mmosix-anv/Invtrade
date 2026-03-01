"use strict";
// /server/api/auth/reset.post.ts
Object.defineProperty(exports, "__esModule", { value: true });
exports.metadata = void 0;
const token_1 = require("@b/utils/token");
const db_1 = require("@b/db");
const error_1 = require("@b/utils/error");
const emails_1 = require("@b/utils/emails");
const utils_1 = require("../utils");
const cache_1 = require("@b/utils/cache");
exports.metadata = {
    summary: "Initiates a password reset process for a user",
    operationId: "resetPassword",
    tags: ["Auth"],
    description: "Initiates a password reset process for a user and sends an email with a reset link",
    requiresAuth: false,
    logModule: "PASSWORD",
    logTitle: "Password reset request",
    requestBody: {
        required: true,
        content: {
            "application/json": {
                schema: {
                    type: "object",
                    properties: {
                        email: {
                            type: "string",
                            format: "email",
                            description: "Email of the user",
                        },
                        recaptchaToken: {
                            type: "string",
                            description: "Recaptcha token if enabled",
                            nullable: true, // Always make it nullable in schema
                        },
                    },
                    required: [
                        "email",
                        // Don't require it in schema, validate in handler
                    ],
                },
            },
        },
    },
    responses: {
        200: {
            description: "Password reset process initiated successfully",
            content: {
                "application/json": {
                    schema: {
                        type: "object",
                        properties: {
                            status: {
                                type: "boolean",
                                description: "Indicates if the request was successful",
                            },
                            statusCode: {
                                type: "number",
                                description: "HTTP status code",
                                example: 200,
                            },
                            data: {
                                type: "object",
                                properties: {
                                    message: {
                                        type: "string",
                                        description: "Success message",
                                    },
                                },
                            },
                        },
                    },
                },
            },
        },
        400: {
            description: "Invalid request (e.g., missing email)",
        },
        404: {
            description: "User not found with the provided email",
        },
    },
};
exports.default = (data) => {
    const { body, ctx, headers } = data;
    const { email, recaptchaToken } = body;
    // Use x-forwarded-host for proxied requests (ngrok, etc.), fallback to host/origin
    const hostname = (headers === null || headers === void 0 ? void 0 : headers["x-forwarded-host"]) || (headers === null || headers === void 0 ? void 0 : headers.host) || (headers === null || headers === void 0 ? void 0 : headers.origin) || "";
    return resetPasswordQuery(email, recaptchaToken, hostname, ctx);
};
const resetPasswordQuery = async (email, recaptchaToken, hostname, ctx) => {
    try {
        ctx === null || ctx === void 0 ? void 0 : ctx.step("Validating password reset request");
        if (!email) {
            ctx === null || ctx === void 0 ? void 0 : ctx.fail("Email is required");
            throw (0, error_1.createError)({
                statusCode: 400,
                message: "Email is required",
            });
        }
        // Verify reCAPTCHA if enabled (check from settings)
        const cacheManager = cache_1.CacheManager.getInstance();
        const recaptchaEnabled = (await cacheManager.getSetting("googleRecaptchaStatus")) === "true";
        // Skip reCAPTCHA for ngrok domains (development only)
        const isNgrok = hostname && (hostname.includes('ngrok.io') || hostname.includes('ngrok-free.dev'));
        if (recaptchaEnabled && !isNgrok) {
            ctx === null || ctx === void 0 ? void 0 : ctx.step("Verifying reCAPTCHA");
            if (!recaptchaToken) {
                throw (0, error_1.createError)({
                    statusCode: 400,
                    message: "reCAPTCHA token is required",
                });
            }
            const result = await (0, utils_1.verifyRecaptcha)(recaptchaToken, hostname);
            if (!result.success) {
                throw (0, error_1.createError)({
                    statusCode: 400,
                    message: result.error || "reCAPTCHA verification failed",
                });
            }
        }
        ctx === null || ctx === void 0 ? void 0 : ctx.step(`Looking up user: ${email}`);
        const user = await db_1.models.user.findOne({ where: { email } });
        if (!user) {
            ctx === null || ctx === void 0 ? void 0 : ctx.fail("User not found");
            throw (0, error_1.createError)({
                statusCode: 404,
                message: "User not found",
            });
        }
        ctx === null || ctx === void 0 ? void 0 : ctx.step("Generating password reset token");
        const resetToken = await (0, token_1.generateResetToken)({
            user: {
                id: user.id,
            },
        });
        try {
            ctx === null || ctx === void 0 ? void 0 : ctx.step("Sending password reset email");
            await emails_1.emailQueue.add({
                emailData: {
                    TO: user.email,
                    FIRSTNAME: user.firstName,
                    LAST_LOGIN: user.lastLogin,
                    TOKEN: resetToken,
                },
                emailType: "PasswordReset",
            });
            ctx === null || ctx === void 0 ? void 0 : ctx.success(`Password reset email sent to ${email}`);
            return {
                message: "Email with reset instructions sent successfully",
            };
        }
        catch (error) {
            ctx === null || ctx === void 0 ? void 0 : ctx.fail("Failed to send password reset email");
            throw (0, error_1.createError)({
                message: error.message,
                statusCode: 500,
            });
        }
    }
    catch (error) {
        ctx === null || ctx === void 0 ? void 0 : ctx.fail(error.message || "Password reset request failed");
        throw error;
    }
};
