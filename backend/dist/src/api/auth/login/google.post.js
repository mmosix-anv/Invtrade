"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.metadata = void 0;
const google_auth_library_1 = require("google-auth-library");
const db_1 = require("@b/db");
const query_1 = require("@b/utils/query");
const utils_1 = require("../utils");
const error_1 = require("@b/utils/error");
// Constants
const CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
const EXPECTED_ISSUERS = ["accounts.google.com", "https://accounts.google.com"];
const client = new google_auth_library_1.OAuth2Client(CLIENT_ID);
exports.metadata = {
    summary: "Logs in a user with Google",
    operationId: "loginUserWithGoogle",
    tags: ["Auth"],
    description: "Logs in a user using Google and returns a session token",
    requiresAuth: false,
    logModule: "LOGIN",
    logTitle: "Google login",
    requestBody: {
        required: true,
        content: {
            "application/json": {
                schema: utils_1.userRegisterSchema,
            },
        },
    },
    responses: {
        200: {
            description: "User logged in successfully",
            content: {
                "application/json": {
                    schema: {
                        type: "object",
                        properties: utils_1.userRegisterResponseSchema,
                    },
                },
            },
        },
        500: query_1.serverErrorResponse,
    },
};
// Proper Google ID token verification, claim validation, and error handling
async function verifyGoogleIdToken(idToken) {
    try {
        const ticket = await client.verifyIdToken({
            idToken,
            audience: CLIENT_ID,
        });
        const payload = ticket.getPayload();
        if (!payload)
            throw (0, error_1.createError)({ statusCode: 401, message: "Missing payload in Google ID token" });
        // Validate required claims
        if (!payload.iss || !EXPECTED_ISSUERS.includes(payload.iss)) {
            throw (0, error_1.createError)({ statusCode: 401, message: "Invalid issuer in Google ID token" });
        }
        if (!payload.aud || payload.aud !== CLIENT_ID) {
            throw (0, error_1.createError)({ statusCode: 401, message: "Invalid audience in Google ID token" });
        }
        if (!payload.exp || Date.now() / 1000 > payload.exp) {
            throw (0, error_1.createError)({ statusCode: 401, message: "Google ID token has expired" });
        }
        // Optionally: verify 'sub', 'email_verified', etc.
        if (!payload.sub || !payload.email) {
            throw (0, error_1.createError)({ statusCode: 401, message: "Invalid Google ID token: missing user info" });
        }
        // If you use nonce, validate payload.nonce here
        return payload;
    }
    catch (error) {
        throw (0, error_1.createError)({ statusCode: 401, message: `Google authentication failed: ${error.message}` });
    }
}
exports.default = async (data) => {
    const { body, ctx } = data;
    const { token } = body;
    try {
        ctx === null || ctx === void 0 ? void 0 : ctx.step("Validating Google token");
        if (!token) {
            ctx === null || ctx === void 0 ? void 0 : ctx.fail("Missing Google token");
            throw (0, error_1.createError)({
                statusCode: 400,
                message: "Missing Google token",
            });
        }
        ctx === null || ctx === void 0 ? void 0 : ctx.step("Verifying Google ID token");
        let payload;
        try {
            payload = await verifyGoogleIdToken(token);
        }
        catch (error) {
            ctx === null || ctx === void 0 ? void 0 : ctx.fail("Invalid Google token");
            throw (0, error_1.createError)({
                statusCode: 401,
                message: error.message || "Invalid Google token",
            });
        }
        const { sub: googleId, email, given_name: firstName, family_name: lastName, } = payload;
        ctx === null || ctx === void 0 ? void 0 : ctx.step("Validating Google user data");
        if (!googleId || !email || !firstName || !lastName) {
            ctx === null || ctx === void 0 ? void 0 : ctx.fail("Incomplete user information from Google");
            throw (0, error_1.createError)({
                statusCode: 400,
                message: "Incomplete user information from Google",
            });
        }
        ctx === null || ctx === void 0 ? void 0 : ctx.step(`Looking up user: ${email}`);
        // Find user by email
        const user = await db_1.models.user.findOne({ where: { email } });
        if (!user) {
            ctx === null || ctx === void 0 ? void 0 : ctx.fail("User not found");
            throw (0, error_1.createError)({
                statusCode: 404,
                message: "User not found. Please register first.",
            });
        }
        ctx === null || ctx === void 0 ? void 0 : ctx.step("Validating user status");
        // Validate user status
        if (user.status === "BANNED") {
            ctx === null || ctx === void 0 ? void 0 : ctx.fail("Account banned");
            throw (0, error_1.createError)({
                statusCode: 403,
                message: "Your account has been banned. Please contact support.",
            });
        }
        if (user.status === "SUSPENDED") {
            ctx === null || ctx === void 0 ? void 0 : ctx.fail("Account suspended");
            throw (0, error_1.createError)({
                statusCode: 403,
                message: "Your account is suspended. Please contact support.",
            });
        }
        if (user.status === "INACTIVE") {
            ctx === null || ctx === void 0 ? void 0 : ctx.fail("Account inactive");
            throw (0, error_1.createError)({
                statusCode: 403,
                message: "Your account is inactive. Please verify your email or contact support.",
            });
        }
        ctx === null || ctx === void 0 ? void 0 : ctx.step("Checking Google provider link");
        // Check or create provider user link
        const providerUser = await db_1.models.providerUser.findOne({
            where: { providerUserId: googleId, provider: "GOOGLE" },
        });
        if (!providerUser) {
            ctx === null || ctx === void 0 ? void 0 : ctx.step("Creating Google provider link");
            await db_1.models.providerUser.create({
                provider: "GOOGLE",
                providerUserId: googleId,
                userId: user.id,
            });
        }
        ctx === null || ctx === void 0 ? void 0 : ctx.step("Generating session tokens");
        const result = await (0, utils_1.returnUserWithTokens)({
            user,
            message: "You have been logged in successfully",
        });
        ctx === null || ctx === void 0 ? void 0 : ctx.success(`User ${email} logged in with Google`);
        return result;
    }
    catch (error) {
        ctx === null || ctx === void 0 ? void 0 : ctx.fail(error.message || "Google login failed");
        throw error;
    }
};
