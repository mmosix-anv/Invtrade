"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.metadata = void 0;
const passwords_1 = require("@b/utils/passwords");
const db_1 = require("@b/db");
const affiliate_1 = require("@b/utils/affiliate");
const utils_1 = require("../utils");
const error_1 = require("@b/utils/error");
const console_1 = require("@b/utils/console");
const cache_1 = require("@b/utils/cache");
// --- Helper: Sanitize Names ---
/**
 * Sanitizes user-provided names for backend storage:
 * - Removes all HTML tags
 * - Removes dangerous characters
 * - Only allows letters (unicode), spaces, hyphens, apostrophes, periods
 * - Trims and limits to 64 chars
 */
function sanitizeName(name) {
    if (typeof name !== "string")
        return "";
    // Remove HTML tags
    let sanitized = name.replace(/<.*?>/g, "");
    // Remove dangerous characters
    sanitized = sanitized.replace(/[&<>"'/\\;:]/g, "");
    // Allow only unicode letters, spaces, hyphens, apostrophes, and dots
    sanitized = sanitized.replace(/[^\p{L} \-'.]/gu, "");
    // Trim and limit length
    sanitized = sanitized.trim().slice(0, 64);
    return sanitized;
}
exports.metadata = {
    summary: "Registers a new user",
    operationId: "registerUser",
    tags: ["Auth"],
    description: "Registers a new user and returns a session token",
    requiresAuth: false,
    logModule: "REGISTER",
    logTitle: "User registration",
    requestBody: {
        required: true,
        content: {
            "application/json": {
                schema: {
                    type: "object",
                    properties: {
                        firstName: {
                            type: "string",
                            description: "First name of the user",
                        },
                        lastName: {
                            type: "string",
                            description: "Last name of the user",
                        },
                        email: {
                            type: "string",
                            format: "email",
                            description: "Email of the user",
                        },
                        password: {
                            type: "string",
                            description: "Password of the user",
                        },
                        ref: {
                            type: "string",
                            description: "Referral code",
                        },
                        recaptchaToken: {
                            type: "string",
                            description: "Recaptcha token if enabled",
                            nullable: true, // Always make it nullable in schema
                        },
                    },
                    required: [
                        "firstName",
                        "lastName",
                        "email",
                        "password",
                        // Don't require it in schema, validate in handler
                    ],
                },
            },
        },
    },
    responses: {
        200: {
            description: "User registered successfully",
            content: {
                "application/json": {
                    schema: {
                        type: "object",
                        properties: {
                            message: {
                                type: "string",
                                description: "Success message",
                            },
                            cookies: {
                                type: "object",
                                properties: {
                                    accessToken: {
                                        type: "string",
                                        description: "Access token",
                                    },
                                    sessionId: {
                                        type: "string",
                                        description: "Session ID",
                                    },
                                    csrfToken: {
                                        type: "string",
                                        description: "CSRF token",
                                    },
                                },
                            },
                        },
                    },
                },
            },
        },
        400: {
            description: "Invalid request (e.g., email already in use)",
            content: {
                "application/json": {
                    schema: {
                        type: "object",
                        properties: {
                            message: {
                                type: "string",
                                description: "Error message",
                            },
                        },
                    },
                },
            },
        },
    },
};
exports.default = async (data) => {
    const { body, ctx, headers } = data;
    let { firstName, lastName } = body;
    const { email, password, ref, recaptchaToken } = body;
    // Use x-forwarded-host for proxied requests (ngrok, etc.), fallback to host/origin
    const hostname = (headers === null || headers === void 0 ? void 0 : headers["x-forwarded-host"]) || (headers === null || headers === void 0 ? void 0 : headers.host) || (headers === null || headers === void 0 ? void 0 : headers.origin) || "";
    try {
        ctx === null || ctx === void 0 ? void 0 : ctx.step("Validating registration data");
        if (!email || !password || !firstName || !lastName) {
            ctx === null || ctx === void 0 ? void 0 : ctx.fail("Missing required registration fields");
            throw (0, error_1.createError)({
                statusCode: 400,
                message: "All fields are required",
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
        // --- Input Sanitization ---
        ctx === null || ctx === void 0 ? void 0 : ctx.step("Sanitizing user input");
        firstName = sanitizeName(firstName);
        lastName = sanitizeName(lastName);
        if (!firstName || !lastName) {
            ctx === null || ctx === void 0 ? void 0 : ctx.fail("Invalid name(s) after sanitization");
            throw (0, error_1.createError)({ statusCode: 400, message: "Invalid name(s)" });
        }
        // Email uniqueness check
        ctx === null || ctx === void 0 ? void 0 : ctx.step(`Checking if email ${email} is available`);
        const existingUser = await db_1.models.user.findOne({ where: { email } });
        if (existingUser && existingUser.email) {
            const verifyEmailEnabled = (await cacheManager.getSetting("verifyEmailStatus")) === "true";
            if (!existingUser.emailVerified &&
                verifyEmailEnabled) {
                ctx === null || ctx === void 0 ? void 0 : ctx.step("User exists but email not verified, resending verification");
                await (0, utils_1.sendEmailVerificationToken)(existingUser.id, existingUser.email);
                ctx === null || ctx === void 0 ? void 0 : ctx.success("Verification email resent");
                return {
                    message: "User already registered but email not verified. Verification email sent.",
                };
            }
            ctx === null || ctx === void 0 ? void 0 : ctx.fail("Email already in use");
            throw (0, error_1.createError)({ statusCode: 400, message: "Email already in use" });
        }
        // Password policy check
        ctx === null || ctx === void 0 ? void 0 : ctx.step("Validating password policy");
        if (!(0, passwords_1.validatePassword)(password)) {
            ctx === null || ctx === void 0 ? void 0 : ctx.fail("Password does not meet requirements");
            throw (0, error_1.createError)({ statusCode: 400, message: "Invalid password format" });
        }
        ctx === null || ctx === void 0 ? void 0 : ctx.step("Hashing password");
        const hashedPassword = await (0, passwords_1.hashPassword)(password);
        // Upsert roles as needed
        ctx === null || ctx === void 0 ? void 0 : ctx.step("Setting up user role");
        await db_1.models.role.upsert({ name: "User" });
        const roleName = process.env.NEXT_PUBLIC_DEMO_STATUS === "true" ? "Admin" : "User";
        await db_1.models.role.upsert({ name: roleName });
        // Fetch the role to get its ID
        const role = await db_1.models.role.findOne({ where: { name: roleName } });
        if (!role)
            throw (0, error_1.createError)({ statusCode: 500, message: "Role not found after upsert." });
        // Create the user (with sanitized names)
        ctx === null || ctx === void 0 ? void 0 : ctx.step("Creating new user account");
        const newUser = await db_1.models.user.create({
            firstName,
            lastName,
            email,
            password: hashedPassword,
            roleId: role.id,
            emailVerified: false,
            settings: {
                email: true,
                sms: false,
                push: false,
            },
        });
        if (!newUser.email) {
            ctx === null || ctx === void 0 ? void 0 : ctx.fail("Error creating user");
            throw (0, error_1.createError)({
                statusCode: 500,
                message: "Error creating user",
            });
        }
        // Referral code
        if (ref) {
            ctx === null || ctx === void 0 ? void 0 : ctx.step(`Processing referral code: ${ref}`);
            try {
                await (0, affiliate_1.handleReferralRegister)(ref, newUser.id);
            }
            catch (error) {
                ctx === null || ctx === void 0 ? void 0 : ctx.step("Failed to process referral code", "warn");
                console_1.logger.error("AUTH", "Error handling referral registration", error);
            }
        }
        // Email verification logic
        const verifyEmailEnabled = (await cacheManager.getSetting("verifyEmailStatus")) === "true";
        if (verifyEmailEnabled) {
            ctx === null || ctx === void 0 ? void 0 : ctx.step("Sending email verification");
            await (0, utils_1.sendEmailVerificationToken)(newUser.id, newUser.email);
            ctx === null || ctx === void 0 ? void 0 : ctx.success(`User ${email} registered, verification email sent`);
            return {
                message: "Registration successful, please verify your email",
            };
        }
        else {
            ctx === null || ctx === void 0 ? void 0 : ctx.step("Generating session tokens");
            const result = await (0, utils_1.returnUserWithTokens)({
                user: newUser,
                message: "You have been registered successfully",
            });
            ctx === null || ctx === void 0 ? void 0 : ctx.success(`User ${email} registered and logged in`);
            return result;
        }
    }
    catch (error) {
        ctx === null || ctx === void 0 ? void 0 : ctx.fail(error.message || "Registration failed");
        throw error;
    }
};
