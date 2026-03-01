"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.verifyRecaptcha = exports.getUserByWalletAddress = exports.verifyResetTokenQuery = exports.sendEmailVerificationToken = exports.userInclude = exports.returnUserWithTokens = exports.userRegisterSchema = exports.userRegisterResponseSchema = void 0;
exports.verifySignature = verifySignature;
exports.validateEmail = validateEmail;
exports.getOrCreateUserRole = getOrCreateUserRole;
exports.createUser = createUser;
exports.updateUser = updateUser;
exports.createSessionAndReturnResponse = createSessionAndReturnResponse;
exports.generateNewPassword = generateNewPassword;
exports.addOneTimeToken = addOneTimeToken;
exports.getAddressFromMessage = getAddressFromMessage;
exports.getChainIdFromMessage = getChainIdFromMessage;
const error_1 = require("@b/utils/error");
const passwords_1 = require("@b/utils/passwords");
const db_1 = require("@b/db");
const token_1 = require("@b/utils/token");
const generate_password_1 = __importDefault(require("generate-password"));
const emails_1 = require("@b/utils/emails");
const viem_1 = require("viem");
const console_1 = require("@b/utils/console");
const cache_1 = require("@b/utils/cache");
async function verifySignature({ address, message, signature, chainId, projectId, }) {
    try {
        // Create a public client using viem with the specified chainId and projectId in the RPC URL.
        const publicClient = (0, viem_1.createPublicClient)({
            transport: (0, viem_1.http)(`https://rpc.walletconnect.org/v1/?chainId=${chainId}&projectId=${projectId}`),
        });
        // Verify the message signature
        const isValid = await publicClient.verifyMessage({
            message,
            address: address,
            signature: signature,
        });
        return isValid;
    }
    catch (e) {
        console_1.logger.error("AUTH", "Signature verification error", e);
        return false;
    }
}
exports.userRegisterResponseSchema = {
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
};
exports.userRegisterSchema = {
    type: "object",
    properties: {
        token: {
            type: "string",
            description: "Google OAuth token",
        },
        ref: {
            type: "string",
            description: "Referral code",
        },
    },
    required: ["token"],
};
const returnUserWithTokens = async ({ user, message }) => {
    // Prepare user data for token generation, excluding sensitive information
    const publicUser = {
        id: user.id,
        role: user.roleId,
    };
    // Generate tokens and CSRF token
    const { accessToken, refreshToken, csrfToken, sessionId } = await (0, token_1.generateTokens)(publicUser);
    await (0, token_1.createSession)(publicUser.id, publicUser.role, accessToken, csrfToken, refreshToken);
    return {
        message,
        cookies: {
            accessToken: accessToken,
            sessionId: sessionId,
            csrfToken: csrfToken,
        },
    };
};
exports.returnUserWithTokens = returnUserWithTokens;
exports.userInclude = {
    include: [
        {
            model: db_1.models.role,
            as: "role",
            attributes: ["id", "name"],
            include: [
                {
                    model: db_1.models.permission,
                    as: "permissions",
                    through: { attributes: [] },
                },
            ],
        },
        {
            model: db_1.models.twoFactor,
            attributes: ["type", "enabled"],
        },
        {
            model: db_1.models.kycApplication,
            as: "kyc",
            attributes: ["status", "level"],
        },
        {
            model: db_1.models.author,
            attributes: ["status"],
        },
    ],
};
// send email verification token
const sendEmailVerificationToken = async (userId, email) => {
    const user = await db_1.models.user.findOne({
        where: { email, id: userId },
    });
    if (!user) {
        throw (0, error_1.createError)({
            statusCode: 404,
            message: "User not found",
        });
    }
    const token = await (0, token_1.generateEmailCode)(user.id);
    try {
        await emails_1.emailQueue.add({
            emailData: {
                TO: user.email,
                FIRSTNAME: user.firstName,
                CREATED_AT: user.createdAt,
                TOKEN: token,
            },
            emailType: "EmailVerification",
        });
        return {
            message: "Email with verification code sent successfully",
        };
    }
    catch (error) {
        throw (0, error_1.createError)({
            message: error.message,
            statusCode: 500,
        });
    }
};
exports.sendEmailVerificationToken = sendEmailVerificationToken;
// verify email token
const verifyResetTokenQuery = async (token) => {
    const decodedToken = await (0, token_1.verifyResetToken)(token);
    if (!decodedToken || !decodedToken.sub) {
        throw (0, error_1.createError)({
            statusCode: 401,
            message: "Invalid or malformed token",
        });
    }
    // Check if the `jti` field matches the one-time token logic
    const jtiCheck = await addOneTimeToken(decodedToken.jti, new Date());
    if (decodedToken.jti !== jtiCheck) {
        throw (0, error_1.createError)({
            statusCode: 500,
            message: "Server error: Invalid JTI in the token",
        });
    }
    try {
        // Check if `sub.id` exists before using it
        if (!decodedToken.sub.id) {
            throw (0, error_1.createError)({
                statusCode: 401,
                message: "Malformed token: Missing sub.id",
            });
        }
        // Proceed to update the user's verification status
        await db_1.models.user.update({
            emailVerified: true,
        }, {
            where: {
                id: decodedToken.sub.id,
            },
        });
        return {
            message: "Token verified successfully",
        };
    }
    catch (error) {
        throw (0, error_1.createError)({
            statusCode: 500,
            message: `Server error: ${error.message}`,
        });
    }
};
exports.verifyResetTokenQuery = verifyResetTokenQuery;
// Get user by wallet address
const getUserByWalletAddress = async (walletAddress) => {
    const user = (await db_1.models.user.findOne({
        where: { walletAddress: walletAddress },
        include: exports.userInclude,
    }));
    if (user) {
        // Destructure to exclude the password and return the rest of the user object
        const { password, ...userWithoutPassword } = user;
        return userWithoutPassword;
    }
    return null;
};
exports.getUserByWalletAddress = getUserByWalletAddress;
function validateEmail(email) {
    const emailRegex = /^[a-zA-Z0-9._-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,4}$/;
    return emailRegex.test(email);
}
async function getOrCreateUserRole() {
    // Implementation for role retrieval/creation
    await db_1.models.role.upsert({
        name: "User",
    });
    return await db_1.models.role.findOne({
        where: {
            name: "User",
        },
    });
}
async function createUser(userData) {
    // Implementation for creating a new user
    return await db_1.models.user.create({
        firstName: userData.firstName,
        lastName: userData.lastName,
        email: userData.email,
        password: userData.hashedPassword,
        emailVerified: true,
        roleId: userData.role.id,
        settings: {
            email: true,
            sms: false,
            push: false,
        },
    });
}
async function updateUser(userId, updateData) {
    // Implementation for updating an existing user
    await db_1.models.user.update({
        firstName: updateData.firstName,
        lastName: updateData.lastName,
        password: updateData.hashedPassword,
        emailVerified: true,
    }, {
        where: { id: userId },
    });
}
async function createSessionAndReturnResponse(user) {
    // Implementation for creating session, generating tokens, and returning response
    const publicUser = {
        id: user.id,
        role: user.roleId,
    };
    const accessToken = await (0, token_1.generateAccessToken)(publicUser);
    const refreshToken = await (0, token_1.generateRefreshToken)(publicUser);
    const csrfToken = (0, token_1.generateCsrfToken)();
    const session = await (0, token_1.createSession)(user.id, user.roleId, accessToken, csrfToken, refreshToken);
    return {
        message: "You have been logged in successfully",
        cookies: {
            accessToken: accessToken,
            refreshToken: refreshToken,
            sessionId: session.sid,
            csrfToken: csrfToken,
        },
    };
}
async function generateNewPassword(id) {
    // Generate secure password consistent with password policy
    const password = generate_password_1.default.generate({
        length: 20,
        numbers: true,
        symbols: true,
        strict: true,
    });
    // Check if password passes password policy
    const isValidPassword = (0, passwords_1.validatePassword)(password);
    if (!isValidPassword) {
        return (0, error_1.createError)({
            statusCode: 500,
            message: "Server error",
        });
    }
    // Hash password
    const errorOrHashedPassword = await (0, passwords_1.hashPassword)(password);
    const hashedPassword = errorOrHashedPassword;
    try {
        await db_1.models.user.update({
            password: hashedPassword,
        }, {
            where: {
                id,
            },
        });
        return password;
    }
    catch (error) {
        throw (0, error_1.createError)({
            statusCode: 500,
            message: "Server error",
        });
    }
}
async function addOneTimeToken(tokenId, expiresAt) {
    try {
        await db_1.models.oneTimeToken.create({
            tokenId: tokenId,
            expiresAt: expiresAt,
        });
        return tokenId;
    }
    catch (error) {
        throw (0, error_1.createError)({
            statusCode: 500,
            message: "Server error",
        });
    }
}
const verifyRecaptcha = async (token, hostname) => {
    try {
        // Skip reCAPTCHA validation for ngrok domains (development only)
        // This is because ngrok URLs don't match registered reCAPTCHA domains
        if (hostname && (hostname.includes('ngrok.io') || hostname.includes('ngrok-free.dev'))) {
            console_1.logger.info("AUTH", `Skipping reCAPTCHA validation for ngrok domain: ${hostname}`);
            return { success: true };
        }
        const secretKey = process.env.NEXT_PUBLIC_GOOGLE_RECAPTCHA_SECRET_KEY;
        if (!secretKey) {
            console_1.logger.error("AUTH", "reCAPTCHA secret key not found in environment variables");
            return { success: false, error: "reCAPTCHA configuration error" };
        }
        if (!token) {
            console_1.logger.error("AUTH", "reCAPTCHA token is missing");
            return { success: false, error: "reCAPTCHA token is missing" };
        }
        // Check token length - a valid token should be substantial
        if (token.length < 100) {
            console_1.logger.error("AUTH", `reCAPTCHA token appears invalid (length: ${token.length})`);
            return { success: false, error: "Invalid reCAPTCHA token format" };
        }
        console_1.logger.debug("AUTH", `Verifying reCAPTCHA token (length: ${token.length})...`);
        const response = await fetch(`https://www.google.com/recaptcha/api/siteverify`, {
            method: "POST",
            headers: {
                "Content-Type": "application/x-www-form-urlencoded",
            },
            body: `secret=${secretKey}&response=${token}`,
        });
        const data = await response.json();
        // Log full response for debugging
        console_1.logger.debug("AUTH", `reCAPTCHA response: success=${data.success}, score=${data.score}, action=${data.action}, hostname=${data.hostname}`);
        // Skip validation for ngrok domains detected in response hostname
        if (data.hostname && (data.hostname.includes('ngrok.io') || data.hostname.includes('ngrok-free.dev'))) {
            console_1.logger.info("AUTH", `Skipping reCAPTCHA score validation for ngrok domain detected in response: ${data.hostname}`);
            return { success: true };
        }
        if (!data.success) {
            const errorCodes = data['error-codes'] || [];
            console_1.logger.error("AUTH", `reCAPTCHA verification failed - errors: ${JSON.stringify(errorCodes)}`);
            // Common error codes:
            // - timeout-or-duplicate: Token has expired or was already used
            // - invalid-input-response: Token is malformed or invalid
            // - bad-request: Request is invalid
            if (errorCodes.includes('timeout-or-duplicate')) {
                console_1.logger.warn("AUTH", "reCAPTCHA token expired or was already used - this may happen on slow connections");
                return { success: false, error: "reCAPTCHA token expired. Please try again." };
            }
            if (errorCodes.includes('invalid-input-response')) {
                return { success: false, error: "Invalid reCAPTCHA token. Please refresh and try again." };
            }
            return { success: false, error: "reCAPTCHA verification failed" };
        }
        // reCAPTCHA v3 returns a score (0.0 - 1.0)
        // 1.0 is very likely a good interaction, 0.0 is very likely a bot
        // Get threshold from settings, fallback to 0.3 for mobile-friendly default
        const cacheManager = cache_1.CacheManager.getInstance();
        const settingThreshold = await cacheManager.getSetting("googleRecaptchaScoreThreshold");
        const scoreThreshold = settingThreshold ? parseFloat(String(settingThreshold)) : 0.3;
        if (typeof data.score === 'number') {
            console_1.logger.debug("AUTH", `reCAPTCHA score: ${data.score} (threshold: ${scoreThreshold})`);
            if (data.score < scoreThreshold) {
                console_1.logger.warn("AUTH", `reCAPTCHA score too low: ${data.score} < ${scoreThreshold}`);
                return { success: false, error: `reCAPTCHA score too low (${data.score}). Please try again.` };
            }
        }
        return { success: true };
    }
    catch (error) {
        console_1.logger.error("AUTH", "reCAPTCHA verification error", error);
        return { success: false, error: "reCAPTCHA verification error. Please try again." };
    }
};
exports.verifyRecaptcha = verifyRecaptcha;
const ETH_ADDRESS_PATTERN = /0x[a-fA-F0-9]{40}/u;
const ETH_CHAIN_ID_IN_SIWE_PATTERN = /Chain ID: (?<temp1>\d+)/u;
function getAddressFromMessage(message) {
    var _a;
    return ((_a = message.match(ETH_ADDRESS_PATTERN)) === null || _a === void 0 ? void 0 : _a[0]) || "";
}
function getChainIdFromMessage(message) {
    var _a;
    return `eip155:${((_a = message.match(ETH_CHAIN_ID_IN_SIWE_PATTERN)) === null || _a === void 0 ? void 0 : _a[1]) || 1}`;
}
