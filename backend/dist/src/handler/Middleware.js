"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.p2pAdminTradeRateLimit = exports.p2pAdminOfferRateLimit = exports.p2pAdminDisputeRateLimit = exports.faqQuestionRateLimit = exports.faqFeedbackRateLimit = exports.lightRateLimit = exports.moderateRateLimit = exports.strictRateLimit = exports.rateLimiters = void 0;
exports.authenticate = authenticate;
exports.handleApiVerification = handleApiVerification;
exports.csrfCheck = csrfCheck;
exports.rateLimit = rateLimit;
exports.createRateLimiter = createRateLimiter;
exports.rolesGate = rolesGate;
exports.licenseEnforcementGate = licenseEnforcementGate;
exports.createFeatureLicenseGate = createFeatureLicenseGate;
exports.reloadBlockchainProductIds = reloadBlockchainProductIds;
exports.reloadExchangeProductId = reloadExchangeProductId;
exports.clearExtensionLicenseCache = clearExtensionLicenseCache;
exports.reloadExtensionProductIds = reloadExtensionProductIds;
const redis_1 = require("../utils/redis");
const token_1 = require("@b/utils/token");
const console_1 = require("@b/utils/console");
const db_1 = require("@b/db");
const error_1 = require("@b/utils/error");
const security_1 = require("@b/utils/security");
const promises_1 = __importDefault(require("fs/promises"));
const path_1 = __importDefault(require("path"));
const isDemo = process.env.NEXT_PUBLIC_DEMO_STATUS === "true";
const AUTH_PAGES = ["/logout"];
const PERMISSION_MAP = {
    trade: ["/api/exchange/order", "/api/ecosystem/order"],
    futures: ["/api/futures"],
    deposit: ["/api/finance/deposit"],
    withdraw: ["/api/finance/withdraw"],
    transfer: ["/api/finance/transfer"],
};
// Gateway extension permission map for API key authentication
const GATEWAY_PERMISSION_MAP = {
    "gateway.payment.create": ["/api/gateway/v1/payment/create"],
    "gateway.payment.status": ["/api/gateway/v1/payment"],
    "gateway.refund.create": ["/api/gateway/v1/refund"],
};
/**
 * Authenticate the request using either an API key or JWT.
 */
async function authenticate(res, req, next) {
    var _a;
    try {
        // Allow preflight requests immediately.
        if (req.method.toLowerCase() === "options") {
            return next();
        }
        // Check for required headers or cookies.
        if ((req.headers.platform && !req.headers.accesstoken) ||
            (!req.headers.platform && !req.cookies)) {
            return res.handleError(401, "Authentication Required");
        }
        // Process API Key based authentication.
        const apiKey = req.headers["x-api-key"];
        if (apiKey) {
            try {
                const apiKeyRecord = await db_1.models.apiKey.findOne({
                    where: { key: apiKey },
                });
                if (!apiKeyRecord)
                    throw (0, error_1.createError)({ statusCode: 401, message: "Invalid API Key" });
                const userPermissions = typeof apiKeyRecord.permissions === "string"
                    ? JSON.parse(apiKeyRecord.permissions)
                    : apiKeyRecord.permissions;
                req.setUser({ id: apiKeyRecord.userId, permissions: userPermissions });
                return next(); // Skip further JWT checks.
            }
            catch (error) {
                console_1.logger.error("AUTH", "API Key Verification Error", error);
                return res.handleError(401, "Authentication Required");
            }
        }
        // Process JWT-based authentication.
        // For WebSocket connections, also check query params
        const accessToken = req.cookies.accessToken ||
            req.headers.accesstoken ||
            ((_a = req.query) === null || _a === void 0 ? void 0 : _a.token);
        if (!accessToken) {
            return await attemptRefreshToken(res, req, next).catch((error) => {
                console_1.logger.error("AUTH", "JWT Verification Error - No access token", error);
                return res.handleError(401, "Authentication Required");
            });
        }
        const userPayload = await (0, token_1.verifyAccessToken)(accessToken);
        if (!userPayload) {
            return await attemptRefreshToken(res, req, next).catch((error) => {
                console_1.logger.error("AUTH", "JWT Verification Error - Invalid access token", error);
                return res.handleError(401, "Authentication Required");
            });
        }
        if (!userPayload.sub || !userPayload.sub.id) {
            return res.handleError(401, "Authentication Required");
        }
        req.setUser(userPayload.sub);
        return await csrfCheck(res, req, next);
    }
    catch (error) {
        console_1.logger.error("AUTH", "Error in authentication", error);
        return res.handleError(500, error.message);
    }
}
/**
 * Attempt to refresh the token when access token verification fails.
 */
async function attemptRefreshToken(res, req, next) {
    try {
        const sessionId = req.cookies.sessionId || req.headers.sessionid;
        if (!sessionId) {
            return res.handleError(401, "Authentication Required: Missing session ID");
        }
        const userSessionKey = `sessionId:${sessionId}`;
        const redisInstance = redis_1.RedisSingleton.getInstance();
        const sessionData = await redisInstance.get(userSessionKey);
        if (!sessionData) {
            return res.handleError(401, "Authentication Required: Session not found");
        }
        const { refreshToken: storedRefreshToken, user } = JSON.parse(sessionData);
        if (!storedRefreshToken) {
            return res.handleError(401, "Authentication Required: No refresh token found");
        }
        let newTokens;
        try {
            const decoded = await (0, token_1.verifyRefreshToken)(storedRefreshToken);
            if (!decoded ||
                !decoded.sub ||
                typeof decoded.sub !== "object" ||
                !decoded.sub.id) {
                throw (0, error_1.createError)({ statusCode: 401, message: "Invalid or malformed refresh token" });
            }
            newTokens = await (0, token_1.refreshTokens)(decoded.sub, sessionId);
        }
        catch (error) {
            console_1.logger.warn("AUTH", "Refresh token validation failed", error);
            newTokens = await (0, token_1.generateTokens)(user);
        }
        // Update tokens and set user.
        req.updateTokens(newTokens);
        req.setUser(user);
        next();
    }
    catch (error) {
        console_1.logger.error("AUTH", "Token refresh error", error);
        return res.handleError(401, `Authentication Required: ${error.message}`);
    }
}
/**
 * Verifies API access for plugin-based requests.
 */
async function handleApiVerification(res, req, next) {
    try {
        const apiKey = req.headers["x-api-key"];
        if (!apiKey) {
            return res.handleError(401, "API key is required");
        }
        const apiKeyRecord = await db_1.models.apiKey.findOne({
            where: { key: apiKey },
        });
        if (!apiKeyRecord) {
            return res.handleError(401, "Invalid API key");
        }
        const { type, permissions = [] } = apiKeyRecord;
        if (type !== "plugin") {
            return res.handleError(403, "Forbidden: Access restricted to plugin type");
        }
        // Check if the route requires specific permissions.
        // First check PERMISSION_MAP (legacy API keys)
        const routePermissions = Object.entries(PERMISSION_MAP).find(([, routes]) => routes.some((route) => req.url.startsWith(route)));
        if (routePermissions) {
            const [requiredPermission] = routePermissions;
            if (!permissions.includes(requiredPermission)) {
                return res.handleError(403, "Forbidden: Permission denied");
            }
        }
        // Check GATEWAY_PERMISSION_MAP (gateway extension API keys)
        const gatewayPermissions = Object.entries(GATEWAY_PERMISSION_MAP).find(([, routes]) => routes.some((route) => req.url.startsWith(route)));
        if (gatewayPermissions) {
            const [requiredPermission] = gatewayPermissions;
            if (!permissions.includes(requiredPermission)) {
                return res.handleError(403, "Forbidden: Gateway permission denied");
            }
        }
        next();
    }
    catch (error) {
        console_1.logger.error("API_VERIFICATION", "API Verification Error", error);
        return res.handleError(500, "Internal Server Error");
    }
}
/**
 * Performs CSRF token validation for non-GET requests or routes that require CSRF protection.
 */
async function csrfCheck(res, req, next) {
    try {
        // Allow GET requests or those not in protected pages.
        if (req.method.toLowerCase() === "get" || !AUTH_PAGES.includes(req.url)) {
            return next();
        }
        const csrfToken = req.cookies.csrfToken || req.headers.csrftoken;
        const sessionId = req.cookies.sessionId || req.headers.sessionid;
        if (!csrfToken || !sessionId) {
            return res.handleError(403, "CSRF Token or Session ID missing");
        }
        const user = req.getUser();
        if (!user) {
            return res.handleError(401, "Authentication Required");
        }
        const userSessionKey = `sessionId:${user.id}:${sessionId}`;
        const sessionData = await redis_1.RedisSingleton.getInstance().get(userSessionKey);
        if (!sessionData) {
            return res.handleError(403, "Invalid Session");
        }
        const { csrfToken: storedCSRFToken } = JSON.parse(sessionData);
        if (csrfToken !== storedCSRFToken) {
            return res.handleError(403, "Invalid CSRF Token");
        }
        next();
    }
    catch (error) {
        console_1.logger.error("CSRF", "CSRF Check Error", error);
        res.handleError(403, "CSRF Check Failed");
    }
}
/**
 * Implements rate limiting per IP address.
 */
async function rateLimit(res, req, next) {
    try {
        // Only rate limit methods that can modify state.
        if (!["post", "put", "patch", "delete"].includes(req.method.toLowerCase())) {
            return next();
        }
        const clientIpBuffer = res.getRemoteAddressAsText();
        const clientIp = clientIpBuffer ? clientIpBuffer : "unknown";
        const userRateLimitKey = `rateLimit:${clientIp}`;
        const limit = parseInt(process.env.RATE_LIMIT || "100", 10);
        const expireTime = parseInt(process.env.RATE_LIMIT_EXPIRE || "60", 10);
        const current = await redis_1.RedisSingleton.getInstance().get(userRateLimitKey);
        if (current !== null && parseInt(current, 10) >= limit) {
            return res.handleError(429, "Rate Limit Exceeded, Try Again Later");
        }
        await redis_1.RedisSingleton.getInstance()
            .multi()
            .incr(userRateLimitKey)
            .expire(userRateLimitKey, expireTime)
            .exec();
        next();
    }
    catch (error) {
        console_1.logger.error("RATE_LIMIT", "Rate Limiting Error", error);
        res.handleError(500, error.message);
    }
}
/**
 * Configurable rate limiter for specific endpoints
 */
function createRateLimiter(options = {}) {
    const { limit = 100, window = 60, keyPrefix = "rateLimit", message = "Rate Limit Exceeded, Try Again Later", } = options;
    return async (data) => {
        var _a;
        const { req, res, user } = data;
        // Determine the key based on user or IP
        let key;
        if (user === null || user === void 0 ? void 0 : user.id) {
            key = `${keyPrefix}:user:${user.id}`;
        }
        else {
            const clientIp = (req === null || req === void 0 ? void 0 : req.ip) || ((_a = req === null || req === void 0 ? void 0 : req.connection) === null || _a === void 0 ? void 0 : _a.remoteAddress) || "unknown";
            key = `${keyPrefix}:ip:${clientIp}`;
        }
        const redis = redis_1.RedisSingleton.getInstance();
        const current = await redis.get(key);
        if (current !== null && parseInt(current, 10) >= limit) {
            const ttl = await redis.ttl(key);
            throw {
                statusCode: 429,
                message,
                headers: {
                    "Retry-After": ttl > 0 ? ttl.toString() : window.toString(),
                    "X-RateLimit-Limit": limit.toString(),
                    "X-RateLimit-Remaining": "0",
                },
            };
        }
        await redis
            .multi()
            .incr(key)
            .expire(key, window)
            .exec();
    };
}
// Pre-configured rate limiters
exports.rateLimiters = {
    // Strict rate limit for sensitive operations
    strict: createRateLimiter({
        limit: 5,
        window: 900, // 15 minutes
        keyPrefix: "strict",
        message: "Too many attempts. Please try again in 15 minutes.",
    }),
    // Moderate rate limit
    moderate: createRateLimiter({
        limit: 30,
        window: 60,
        keyPrefix: "moderate",
        message: "Too many requests. Please slow down.",
    }),
    // Light rate limit
    light: createRateLimiter({
        limit: 100,
        window: 60,
        keyPrefix: "light",
        message: "Too many requests. Please try again shortly.",
    }),
    // General rate limit
    general: createRateLimiter({
        limit: 100,
        window: 60,
        keyPrefix: "general",
        message: "Too many requests. Please try again later.",
    }),
    // Order creation
    orderCreation: createRateLimiter({
        limit: 5,
        window: 900, // 15 minutes
        keyPrefix: "order_create",
        message: "Too many order attempts. Please wait before placing another order.",
    }),
    // Discount validation
    discountValidation: createRateLimiter({
        limit: 20,
        window: 60,
        keyPrefix: "discount_check",
        message: "Too many discount validation attempts. Please try again later.",
    }),
    // Download rate limit
    download: createRateLimiter({
        limit: 10,
        window: 3600, // 1 hour
        keyPrefix: "download",
        message: "Download limit exceeded. Please try again later.",
    }),
    // FAQ feedback
    faqFeedback: createRateLimiter({
        limit: 20,
        window: 3600, // 1 hour
        keyPrefix: "faq_feedback",
        message: "Too many feedback submissions. Please try again later.",
    }),
    // FAQ questions
    faqQuestion: createRateLimiter({
        limit: 5,
        window: 86400, // 24 hours
        keyPrefix: "faq_question",
        message: "You have reached the daily limit for questions. Please try again tomorrow.",
    }),
    // P2P specific limits
    p2pOfferCreate: createRateLimiter({
        limit: 5,
        window: 3600, // 1 hour
        keyPrefix: "p2p:offer:create",
        message: "Too many offers created. Please wait before creating another offer.",
    }),
    p2pTradeInitiate: createRateLimiter({
        limit: 20,
        window: 3600, // 1 hour
        keyPrefix: "p2p:trade:initiate",
        message: "Too many trade requests. Please wait before initiating another trade.",
    }),
    p2pTradeAction: createRateLimiter({
        limit: 50,
        window: 3600, // 1 hour
        keyPrefix: "p2p:trade:action",
        message: "Too many trade actions. Please slow down.",
    }),
    p2pMessage: createRateLimiter({
        limit: 100,
        window: 3600, // 1 hour
        keyPrefix: "p2p:message",
        message: "Too many messages sent. Please wait before sending more.",
    }),
    p2pDisputeCreate: createRateLimiter({
        limit: 3,
        window: 86400, // 24 hours
        keyPrefix: "p2p:dispute:create",
        message: "Too many disputes created. Please contact support if you need assistance.",
    }),
    p2pAdminDispute: createRateLimiter({
        limit: 100,
        window: 3600, // 1 hour
        keyPrefix: "p2p:admin:dispute",
        message: "Too many dispute management requests. Please wait.",
    }),
    p2pAdminOffer: createRateLimiter({
        limit: 50,
        window: 3600, // 1 hour
        keyPrefix: "p2p:admin:offer",
        message: "Too many offer management requests. Please wait.",
    }),
    p2pAdminTrade: createRateLimiter({
        limit: 100,
        window: 3600, // 1 hour
        keyPrefix: "p2p:admin:trade",
        message: "Too many trade management requests. Please wait.",
    }),
    // Copy Trading rate limiters
    copyTradingLeaderApply: createRateLimiter({
        limit: 3,
        window: 86400, // 24 hours
        keyPrefix: "copytrading:leader:apply",
        message: "Too many leader applications. Please wait 24 hours before trying again.",
    }),
    copyTradingLeaderUpdate: createRateLimiter({
        limit: 10,
        window: 3600, // 1 hour
        keyPrefix: "copytrading:leader:update",
        message: "Too many profile updates. Please wait before making more changes.",
    }),
    copyTradingFollow: createRateLimiter({
        limit: 10,
        window: 3600, // 1 hour
        keyPrefix: "copytrading:follower:follow",
        message: "Too many follow requests. Please wait before following more leaders.",
    }),
    copyTradingFollowerAction: createRateLimiter({
        limit: 30,
        window: 3600, // 1 hour
        keyPrefix: "copytrading:follower:action",
        message: "Too many subscription actions. Please slow down.",
    }),
    copyTradingFunds: createRateLimiter({
        limit: 20,
        window: 3600, // 1 hour
        keyPrefix: "copytrading:funds",
        message: "Too many fund operations. Please wait before making more changes.",
    }),
    copyTradingAdmin: createRateLimiter({
        limit: 50,
        window: 3600, // 1 hour
        keyPrefix: "copytrading:admin",
        message: "Too many admin actions. Please wait.",
    }),
};
// Aliases for backward compatibility
exports.strictRateLimit = exports.rateLimiters.strict;
exports.moderateRateLimit = exports.rateLimiters.moderate;
exports.lightRateLimit = exports.rateLimiters.light;
exports.faqFeedbackRateLimit = exports.rateLimiters.faqFeedback;
exports.faqQuestionRateLimit = exports.rateLimiters.faqQuestion;
exports.p2pAdminDisputeRateLimit = exports.rateLimiters.p2pAdminDispute;
exports.p2pAdminOfferRateLimit = exports.rateLimiters.p2pAdminOffer;
exports.p2pAdminTradeRateLimit = exports.rateLimiters.p2pAdminTrade;
/**
 * Checks if the user is allowed to access the route based on role and permissions.
 */
async function rolesGate(app, res, req, routePath, method, next) {
    try {
        const metadata = req.metadata;
        if (!metadata || !metadata.permission) {
            return next();
        }
        const user = req.getUser();
        if (!user) {
            return res.handleError(401, "Authentication Required");
        }
        // If API key is used, verify its permissions.
        if (req.headers["x-api-key"]) {
            const apiKey = req.headers["x-api-key"];
            const apiKeyRecord = await db_1.models.apiKey.findOne({
                where: { key: apiKey },
            });
            if (!apiKeyRecord) {
                return res.handleError(401, "Authentication Required");
            }
            const userPermissions = typeof apiKeyRecord.permissions === "string"
                ? JSON.parse(apiKeyRecord.permissions)
                : apiKeyRecord.permissions;
            // Check PERMISSION_MAP (legacy API keys)
            for (const permission in PERMISSION_MAP) {
                if (PERMISSION_MAP[permission].some((route) => routePath.startsWith(route))) {
                    if (!userPermissions.includes(permission)) {
                        return res.handleError(403, "Forbidden - You do not have permission to access this");
                    }
                    break;
                }
            }
            // Check GATEWAY_PERMISSION_MAP (gateway extension API keys)
            for (const permission in GATEWAY_PERMISSION_MAP) {
                if (GATEWAY_PERMISSION_MAP[permission].some((route) => routePath.startsWith(route))) {
                    if (!userPermissions.includes(permission)) {
                        return res.handleError(403, "Forbidden - You do not have permission to access this");
                    }
                    break;
                }
            }
        }
        // Fallback to role-based authorization.
        const userRole = app.getRole(user.role);
        if (!userRole ||
            (!userRole.permissions.includes(metadata.permission) &&
                userRole.name !== "Super Admin")) {
            return res.handleError(403, "Forbidden - You do not have permission to access this");
        }
        // In demo mode, restrict admin routes for non-Super Admins.
        if (isDemo &&
            routePath.startsWith("/api/admin") &&
            ["post", "put", "delete", "del"].includes(method.toLowerCase()) &&
            userRole.name !== "Super Admin") {
            return res.handleError(403, "Action not allowed in demo mode");
        }
        next();
    }
    catch (error) {
        console_1.logger.error("ROLES_GATE", "Roles Gate Error", error);
        res.handleError(500, error.message);
    }
}
// Maintenance mode is now handled by a separate maintenance server
// that runs automatically when the main server is stopped
// Routes that are always allowed without license (for initial setup)
const LICENSE_EXEMPT_ROUTES = [
    "/api/auth", // All auth routes (login, logout, verify, register, etc.)
    "/api/user/profile", // User profile (needed to determine role after login)
    "/api/admin/system/license", // License management routes
    "/api/admin/system/extension", // Extension info (needed by license page to avoid redirect loop)
    "/api/settings", // Basic settings (needed for frontend)
    "/api/admin/finance/exchange/provider/active"
];
/**
 * Checks if a route is exempt from license enforcement
 */
function isLicenseExemptRoute(url) {
    const urlPath = url.split("?")[0]; // Remove query params
    // Check exact matches and prefixes
    for (const exempt of LICENSE_EXEMPT_ROUTES) {
        // Match exact, with trailing slash, or as prefix
        if (urlPath === exempt || urlPath.startsWith(exempt + "/")) {
            return true;
        }
    }
    return false;
}
/**
 * Unified license enforcement gate - checks both core and extension licenses
 * This runs early in the middleware chain for all routes
 *
 * IMPORTANT: Certain routes are exempt to allow:
 * - Admin login for initial license activation
 * - License management endpoints
 * - Basic settings needed for frontend
 *
 * For extension routes, also verifies the extension-specific license file exists
 */
async function licenseEnforcementGate(res, req, next) {
    return next(); 
    // Always allow license-exempt routes (auth, settings, license management)
    if (isLicenseExemptRoute(requestUrl)) {
        return next();
    }
    try {
        const securityStatus = (0, security_1.getSecurityStatus)();
        // If security not initialized yet, allow through (startup grace period)
        if (!securityStatus.initialized) {
            return next();
        }
        // Check if core license is valid
        if (!securityStatus.licenseValid) {
            console_1.logger.warn("LICENSE", `Access denied - no valid core license for: ${requestUrl}`);
            return res.handleError(403, "License not activated. Please activate your license to continue.");
        }
        // Core license is valid, now check product-specific licenses
        // 1. Check extension-specific license if applicable
        const extension = findExtensionForRoute(requestUrl);
        if (extension) {
            const isValid = await isExtensionLicenseValid(extension.name);
            if (!isValid) {
                const productId = await getExtensionProductId(extension.name);
                console_1.logger.warn("LICENSE", `Extension license required: ${extension.name} (Product ID: ${productId}) for route: ${requestUrl}`);
                return res.handleLicenseError(403, {
                    error: "Extension license required",
                    extension: extension.name,
                    productId: productId,
                    type: "extension",
                    message: `This feature requires a valid license for ${extension.name}. Please activate your license to continue.`,
                });
            }
        }
        // 2. Check blockchain-specific license if applicable
        const blockchain = findBlockchainForRoute(requestUrl);
        if (blockchain) {
            const isValid = await isBlockchainLicenseValid(blockchain.chain);
            if (!isValid) {
                const productId = await getBlockchainProductId(blockchain.chain);
                console_1.logger.warn("LICENSE", `Blockchain license required: ${blockchain.chain} (Product ID: ${productId}) for route: ${requestUrl}`);
                return res.handleLicenseError(403, {
                    error: "Blockchain license required",
                    blockchain: blockchain.chain,
                    productId: productId,
                    type: "blockchain",
                    message: `This blockchain (${blockchain.chain}) requires a valid license. Please activate your license to continue.`,
                });
            }
        }
        // 3. Check exchange provider license if applicable
        if (isExchangeRoute(requestUrl)) {
            const isValid = await isExchangeLicenseValid();
            if (!isValid) {
                const productId = await getExchangeProductId();
                console_1.logger.warn("LICENSE", `Exchange license required (Product ID: ${productId}) for route: ${requestUrl}`);
                return res.handleLicenseError(403, {
                    error: "Exchange provider license required",
                    productId: productId,
                    type: "exchange",
                    message: "The active exchange provider requires a valid license. Please activate your license to continue.",
                });
            }
        }
        // All license checks passed, continue
        return next();
    }
    catch (error) {
        console_1.logger.error("LICENSE", "License enforcement error", error);
        // On error, allow through to avoid blocking legitimate requests
        return next();
    }
}
/**
 * Feature-specific license gate - checks if a specific feature is licensed
 */
function createFeatureLicenseGate(featureName) {
    return async function featureLicenseGate(res, req, next) {
        try {
            if (!(0, security_1.canAccessFeature)(featureName)) {
                console_1.logger.warn("LICENSE", `Feature not licensed: ${featureName}`);
                return res.handleError(403, `This feature (${featureName}) is not included in your license. Please upgrade to access this feature.`);
            }
            return next();
        }
        catch (error) {
            console_1.logger.error("LICENSE", `Feature license check error for ${featureName}`, error);
            return next();
        }
    };
}
// Extension routes
const EXTENSION_LICENSE_MAP = [
    { name: "ecosystem", routes: ["/api/admin/ecosystem"], type: "extension" },
    { name: "staking", routes: ["/api/staking", "/api/admin/staking"], type: "extension" },
    { name: "p2p", routes: ["/api/p2p", "/api/admin/p2p"], type: "extension" },
    { name: "ico", routes: ["/api/ico", "/api/admin/ico"], type: "extension" },
    { name: "forex", routes: ["/api/forex", "/api/admin/forex"], type: "extension" },
    { name: "futures", routes: ["/api/admin/futures"], type: "extension" },
    { name: "copy_trading", routes: ["/api/copy-trading", "/api/admin/copy-trading"], type: "extension" },
    { name: "affiliate", routes: ["/api/affiliate", "/api/admin/affiliate"], type: "extension" },
    { name: "ecommerce", routes: ["/api/ecommerce", "/api/admin/ecommerce"], type: "extension" },
    { name: "nft", routes: ["/api/nft", "/api/admin/nft"], type: "extension" },
    { name: "ai_investment", routes: ["/api/ai/investment", "/api/admin/ai/investment"], type: "extension" },
    { name: "ai_market_maker", routes: ["/api/ai/market-maker", "/api/admin/ai/market-maker"], type: "extension" },
    { name: "mailwizard", routes: ["/api/mailwizard", "/api/admin/mailwizard"], type: "extension" },
    { name: "knowledge_base", routes: ["/api/faq", "/api/admin/faq"], type: "extension" },
    { name: "gateway", routes: ["/api/gateway", "/api/admin/gateway"], type: "extension" },
    { name: "mlm", routes: ["/api/mlm", "/api/admin/mlm"], type: "extension" },
    { name: "wallet_connect", routes: ["/api/wallet-connect", "/api/admin/wallet-connect"], type: "extension" },
];
// Blockchain-specific route patterns (dynamically matched)
const BLOCKCHAIN_ROUTE_PATTERN = /^\/api(?:\/admin)?\/ecosystem\/(?:blockchain\/)?([A-Z0-9]+)/i;
// Exchange provider routes require dynamic matching based on active exchange
const EXCHANGE_ROUTES = ["/api/exchange", "/api/admin/finance/exchange"];
// Cache for extension product IDs (loaded from database)
let extensionProductIdsLoaded = false;
const extensionProductIdCache = new Map();
/**
 * Loads extension product IDs from the database
 */
async function loadExtensionProductIds() {
    if (extensionProductIdsLoaded)
        return;
    try {
        const extensions = await db_1.models.extension.findAll({
            attributes: ["name", "productId"],
        });
        for (const ext of extensions) {
            if (ext.productId) {
                extensionProductIdCache.set(ext.name, ext.productId);
            }
        }
        extensionProductIdsLoaded = true;
    }
    catch (error) {
        console_1.logger.error("LICENSE", "Failed to load extension product IDs", error);
    }
}
/**
 * Gets the product ID for an extension by name
 */
async function getExtensionProductId(extensionName) {
    await loadExtensionProductIds();
    return extensionProductIdCache.get(extensionName) || null;
}
/**
 * Checks if a license file exists for the given product ID
 */
async function checkExtensionLicenseFile(productId) {
    const cwd = process.cwd();
    const rootPath = cwd.endsWith("backend") || cwd.endsWith("backend/") || cwd.endsWith("backend\\")
        ? path_1.default.dirname(cwd)
        : cwd;
    const licFilePath = path_1.default.join(rootPath, "lic", `${productId}.lic`);
    try {
        await promises_1.default.access(licFilePath);
        return true;
    }
    catch (_a) {
        return false;
    }
}
// Cache for license verification results (5 minute TTL)
const extensionLicenseCache = new Map();
const LICENSE_CACHE_TTL = 5 * 60 * 1000; // 5 minutes
/**
 * Checks if an extension has a valid license (with caching)
 */
async function isExtensionLicenseValid(extensionName) {
    // Check cache first
    const cached = extensionLicenseCache.get(extensionName);
    if (cached && Date.now() - cached.timestamp < LICENSE_CACHE_TTL) {
        return cached.valid;
    }
    // Get product ID for this extension
    const productId = await getExtensionProductId(extensionName);
    if (!productId) {
        // Extension not found in database, allow access (might be core feature)
        return true;
    }
    // Check if license file exists
    const valid = await checkExtensionLicenseFile(productId);
    // Cache the result
    extensionLicenseCache.set(extensionName, { valid, timestamp: Date.now() });
    return valid;
}
/**
 * Finds the extension config that matches the given URL
 */
function findExtensionForRoute(url) {
    const urlPath = url.split("?")[0]; // Remove query params
    for (const ext of EXTENSION_LICENSE_MAP) {
        for (const route of ext.routes) {
            if (urlPath === route || urlPath.startsWith(route + "/")) {
                return ext;
            }
        }
    }
    return null;
}
// Cache for blockchain product IDs
let blockchainProductIdsLoaded = false;
const blockchainProductIdCache = new Map();
/**
 * Loads blockchain product IDs from the database
 */
async function loadBlockchainProductIds() {
    if (blockchainProductIdsLoaded)
        return;
    try {
        if (!db_1.models.ecosystemBlockchain)
            return;
        const blockchains = await db_1.models.ecosystemBlockchain.findAll({
            attributes: ["chain", "productId"],
        });
        for (const blockchain of blockchains) {
            if (blockchain.productId && blockchain.chain) {
                blockchainProductIdCache.set(blockchain.chain.toUpperCase(), blockchain.productId);
            }
        }
        blockchainProductIdsLoaded = true;
    }
    catch (error) {
        console_1.logger.error("LICENSE", "Failed to load blockchain product IDs", error);
    }
}
/**
 * Gets the product ID for a blockchain by chain name
 */
async function getBlockchainProductId(chain) {
    await loadBlockchainProductIds();
    return blockchainProductIdCache.get(chain.toUpperCase()) || null;
}
/**
 * Checks if a blockchain route requires license and returns blockchain info
 */
function findBlockchainForRoute(url) {
    const urlPath = url.split("?")[0];
    // Match blockchain-specific routes
    const match = BLOCKCHAIN_ROUTE_PATTERN.exec(urlPath);
    if (match && match[1]) {
        // Check if this is a known blockchain chain (SOL, TRON, XMR, TON, MO)
        const chain = match[1].toUpperCase();
        const knownChains = ["SOL", "TRON", "XMR", "TON", "MO"];
        if (knownChains.includes(chain)) {
            return { chain };
        }
    }
    return null;
}
/**
 * Checks if a blockchain has a valid license (with caching)
 */
async function isBlockchainLicenseValid(chain) {
    const cacheKey = `blockchain:${chain}`;
    // Check cache first
    const cached = extensionLicenseCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < LICENSE_CACHE_TTL) {
        return cached.valid;
    }
    // Get product ID for this blockchain
    const productId = await getBlockchainProductId(chain);
    if (!productId) {
        // Blockchain not found in database, allow access
        return true;
    }
    // Check if license file exists
    const valid = await checkExtensionLicenseFile(productId);
    // Cache the result
    extensionLicenseCache.set(cacheKey, { valid, timestamp: Date.now() });
    return valid;
}
let exchangeLicenseStatusCache = null;
/**
 * Checks all exchange providers and returns license status
 * Requires at least one licensed exchange provider for access
 */
async function checkExchangeProvidersLicense() {
    // Check cache first
    if (exchangeLicenseStatusCache && Date.now() - exchangeLicenseStatusCache.timestamp < LICENSE_CACHE_TTL) {
        return exchangeLicenseStatusCache;
    }
    try {
        // Get all exchange providers
        const exchanges = await db_1.models.exchange.findAll({
            attributes: ["productId", "name", "status"],
        });
        if (!exchanges || exchanges.length === 0) {
            // No exchanges configured, allow access
            const status = {
                hasLicensedProvider: true,
                firstUnlicensedProductId: null,
                timestamp: Date.now(),
            };
            exchangeLicenseStatusCache = status;
            return status;
        }
        let hasLicensedProvider = false;
        let firstUnlicensedProductId = null;
        // Check each exchange provider for a valid license
        for (const exchange of exchanges) {
            if (!exchange.productId)
                continue;
            const isLicensed = await checkExtensionLicenseFile(exchange.productId);
            if (isLicensed) {
                hasLicensedProvider = true;
                break; // At least one is licensed, that's enough
            }
            else if (!firstUnlicensedProductId) {
                firstUnlicensedProductId = exchange.productId;
            }
        }
        const status = {
            hasLicensedProvider,
            firstUnlicensedProductId,
            timestamp: Date.now(),
        };
        exchangeLicenseStatusCache = status;
        return status;
    }
    catch (error) {
        console_1.logger.error("LICENSE", "Failed to check exchange provider licenses", error);
        // On error, allow access to avoid blocking
        return {
            hasLicensedProvider: true,
            firstUnlicensedProductId: null,
            timestamp: Date.now(),
        };
    }
}
/**
 * Gets the first unlicensed exchange provider's product ID (for error messages)
 */
async function getExchangeProductId() {
    const status = await checkExchangeProvidersLicense();
    return status.firstUnlicensedProductId;
}
/**
 * Checks if a route is an exchange route that requires license
 */
function isExchangeRoute(url) {
    const urlPath = url.split("?")[0];
    for (const route of EXCHANGE_ROUTES) {
        if (urlPath === route || urlPath.startsWith(route + "/")) {
            return true;
        }
    }
    return false;
}
/**
 * Checks if at least one exchange provider has a valid license
 * Requires at least one licensed exchange provider for access to exchange routes
 */
async function isExchangeLicenseValid() {
    const status = await checkExchangeProvidersLicense();
    return status.hasLicensedProvider;
}
/**
 * Reloads blockchain product IDs from database
 */
async function reloadBlockchainProductIds() {
    blockchainProductIdsLoaded = false;
    blockchainProductIdCache.clear();
    await loadBlockchainProductIds();
}
/**
 * Reloads exchange provider license status from database
 */
async function reloadExchangeProductId() {
    exchangeLicenseStatusCache = null;
    extensionLicenseCache.delete("exchange:active");
    await checkExchangeProvidersLicense();
}
/**
 * Clears the extension license cache (useful after license activation)
 */
function clearExtensionLicenseCache(extensionName) {
    if (extensionName) {
        extensionLicenseCache.delete(extensionName);
    }
    else {
        extensionLicenseCache.clear();
    }
}
/**
 * Reloads extension product IDs from database (useful after extension updates)
 */
async function reloadExtensionProductIds() {
    extensionProductIdsLoaded = false;
    extensionProductIdCache.clear();
    await loadExtensionProductIds();
}
