"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.routeCache = void 0;
exports.setupApiRoutes = setupApiRoutes;
const promises_1 = __importDefault(require("fs/promises"));
const path_1 = __importDefault(require("path"));
const Middleware_1 = require("../handler/Middleware");
const validation_1 = require("@b/utils/validation");
const constants_1 = require("@b/utils/constants");
const console_1 = require("@b/utils/console");
const Websocket_1 = require("./Websocket");
const demoMask_1 = require("@b/utils/demoMask");
const error_1 = require("@b/utils/error");
// Use .js extension in production, otherwise .ts for development.
const fileExtension = constants_1.isProduction ? ".js" : ".ts";
// A typed cache for routes to avoid re-importing modules.
exports.routeCache = new Map();
/**
 * Recursively sets up API routes from a directory structure.
 * - Processes directories and files.
 * - Skips certain folders/files.
 * - Supports dynamic route parameters via bracket syntax.
 *
 * @param app - The application instance (e.g. an Express-like router).
 * @param startPath - The directory path where routes are defined.
 * @param basePath - The API base path (default is "/api").
 */
async function setupApiRoutes(app, startPath, basePath = "/api") {
    try {
        const entries = await promises_1.default.readdir(startPath, { withFileTypes: true });
        // Separate files and directories for parallel processing
        const files = [];
        const directories = [];
        const bracketDirs = [];
        for (const entry of entries) {
            // Skip certain directories and files
            if ((entry.isDirectory() && entry.name === "util") ||
                entry.name === `queries${fileExtension}` ||
                entry.name === `utils${fileExtension}`) {
                continue;
            }
            const entryPath = (0, validation_1.sanitizePath)(path_1.default.join(startPath, entry.name));
            if (entry.isDirectory()) {
                let newBasePath = basePath;
                // If the folder name is wrapped in parentheses (grouping folder), skip path addition
                if (!/^\(.*\)$/.test(entry.name)) {
                    newBasePath = `${basePath}/${entry.name.replace(/\[(\w+)\]/, ":$1")}`;
                }
                // Separate bracketed directories (dynamic routes) to process last
                if (entry.name.includes("[")) {
                    bracketDirs.push({ entry, entryPath, newBasePath });
                }
                else {
                    directories.push({ entry, entryPath, newBasePath });
                }
            }
            else {
                files.push({ entry, entryPath });
            }
        }
        // Process files first (register routes)
        await Promise.all(files.map(async ({ entry, entryPath }) => {
            const [fileName, method] = entry.name.split(".");
            let routePath = basePath + (fileName !== "index" ? `/${fileName}` : "");
            // Convert bracketed parameters to Express-like ":id" syntax
            routePath = routePath
                .replace(/\[(\w+)\]/g, ":$1")
                .replace(/\.get|\.post|\.put|\.delete|\.del|\.ws/, "");
            if (typeof app[method] === "function") {
                if (method === "ws") {
                    (0, Websocket_1.setupWebSocketEndpoint)(app, routePath, entryPath);
                }
                else {
                    await handleHttpMethod(app, method, routePath, entryPath);
                }
            }
        }));
        // Process non-bracketed directories in parallel
        await Promise.all(directories.map(({ entryPath, newBasePath }) => setupApiRoutes(app, entryPath, newBasePath)));
        // Process bracketed directories last (to ensure dynamic routes are registered after static ones)
        await Promise.all(bracketDirs.map(({ entryPath, newBasePath }) => setupApiRoutes(app, entryPath, newBasePath)));
    }
    catch (error) {
        console_1.logger.error("ROUTES", `Error setting up API routes in ${startPath}`, error);
        throw error;
    }
}
/**
 * Registers an HTTP route.
 *
 * It caches the route module (handler and metadata), parses the request body,
 * and then runs through a middleware chain (including API verification, rate limiting,
 * authentication, and role/maintenance checks) before handling the request.
 *
 * @param app - The application instance.
 * @param method - The HTTP method (e.g. "get", "post").
 * @param routePath - The full route path.
 * @param entryPath - The file system path for the route handler.
 */
async function handleHttpMethod(app, method, routePath, entryPath) {
    app[method](routePath, async (res, req) => {
        const startTime = Date.now();
        let metadata, handler;
        const cached = exports.routeCache.get(entryPath);
        if (cached) {
            handler = cached.handler;
            metadata = cached.metadata;
            req.setMetadata(metadata);
        }
        else {
            try {
                const handlerModule = await Promise.resolve(`${entryPath}`).then(s => __importStar(require(s)));
                handler = handlerModule.default;
                if (!handler) {
                    throw (0, error_1.createError)({ statusCode: 404, message: `Handler not found for ${entryPath}` });
                }
                metadata = handlerModule.metadata;
                if (!metadata) {
                    throw (0, error_1.createError)({ statusCode: 404, message: `Metadata not found for ${entryPath}` });
                }
                req.setMetadata(metadata);
                exports.routeCache.set(entryPath, { handler, metadata });
            }
            catch (error) {
                console_1.logger.error("ROUTE", `Error loading handler for ${entryPath}`, error);
                res.handleError(500, error.message);
                return;
            }
        }
        if (typeof handler !== "function") {
            throw (0, error_1.createError)({ statusCode: 500, message: `Handler is not a function for ${entryPath}` });
        }
        try {
            await req.parseBody();
        }
        catch (error) {
            console_1.logger.error("ROUTE", `Error parsing request body for ${entryPath}`, error);
            res.handleError(400, `Invalid request body: ${error.message}`);
            return;
        }
        // Benchmark the request (debug level only)
        const endBenchmarking = () => {
            const duration = Date.now() - startTime;
            if (duration > 1000) {
                console_1.logger.warn("ROUTE", `Slow request: ${method.toUpperCase()} ${routePath} (${duration}ms)`);
            }
            else {
                console_1.logger.debug("ROUTE", `${method.toUpperCase()} ${routePath} (${duration}ms)`);
            }
        };
        // Determine the middleware chain based on metadata flags.
        // licenseEnforcementGate handles both core and extension license checks
        if (metadata.requiresApi) {
            await (0, Middleware_1.licenseEnforcementGate)(res, req, async () => {
                await (0, Middleware_1.handleApiVerification)(res, req, async () => {
                    await handleRequest(res, req, handler, entryPath, metadata);
                    endBenchmarking();
                });
            });
            return;
        }
        if (!metadata.requiresAuth) {
            // License check runs for all routes (even public ones)
            await (0, Middleware_1.licenseEnforcementGate)(res, req, async () => {
                await handleRequest(res, req, handler, entryPath, metadata);
                endBenchmarking();
            });
            return;
        }
        await (0, Middleware_1.licenseEnforcementGate)(res, req, async () => {
            await (0, Middleware_1.rateLimit)(res, req, async () => {
                await (0, Middleware_1.authenticate)(res, req, async () => {
                    await (0, Middleware_1.rolesGate)(app, res, req, routePath, method, async () => {
                        await handleRequest(res, req, handler, entryPath, metadata);
                        endBenchmarking();
                    });
                });
            });
        });
    });
}
/**
 * Processes middleware array from metadata.
 * Middleware names directly map to rate limiters in rateLimiters object.
 * Example: middleware: ["copyTradingAdmin"] -> rateLimiters.copyTradingAdmin
 *
 * @param middleware - Array of middleware names (must match keys in rateLimiters)
 * @param req - The request object
 */
async function processMiddleware(middleware, req) {
    for (const middlewareName of middleware) {
        const rateLimiter = Middleware_1.rateLimiters[middlewareName];
        if (rateLimiter) {
            await rateLimiter(req);
        }
        else {
            console_1.logger.warn("MIDDLEWARE", `Unknown middleware: ${middlewareName}`);
        }
    }
}
/**
 * Executes the route handler and sends the response.
 *
 * If metadata contains logModule and logTitle, the handler is automatically
 * wrapped with logging context. The ctx object is passed to the handler via
 * the request data object.
 *
 * @param res - The response object.
 * @param req - The request object.
 * @param handler - The route handler function.
 * @param entryPath - The file system path for logging errors.
 * @param metadata - The route metadata.
 */
async function handleRequest(res, req, handler, entryPath, metadata) {
    var _a, _b, _c;
    // Check if logging is enabled via metadata
    const hasLogging = (metadata === null || metadata === void 0 ? void 0 : metadata.logModule) && (metadata === null || metadata === void 0 ? void 0 : metadata.logTitle);
    try {
        // Process middleware from metadata if present
        if ((metadata === null || metadata === void 0 ? void 0 : metadata.middleware) && Array.isArray(metadata.middleware)) {
            await processMiddleware(metadata.middleware, req);
        }
        let result;
        if (hasLogging) {
            // Wrap with logging context - add ctx to the req object
            result = await (0, console_1.withLogger)(metadata.logModule, metadata.logTitle, { user: req.user }, async (ctx) => {
                req.ctx = ctx;
                return await handler(req);
            }, { method: req.method, url: (_a = req.url) === null || _a === void 0 ? void 0 : _a.split("?")[0] });
        }
        else {
            // Execute without logging context
            result = await handler(req);
        }
        // Apply demo masking if configured in metadata
        if ((metadata === null || metadata === void 0 ? void 0 : metadata.demoMask) && Array.isArray(metadata.demoMask)) {
            result = (0, demoMask_1.applyDemoMask)(result, metadata.demoMask);
        }
        res.sendResponse(req, 200, result, metadata === null || metadata === void 0 ? void 0 : metadata.responseType);
    }
    catch (error) {
        const statusCode = error.statusCode || 500;
        const message = error.message || "Internal Server Error";
        // Only log server errors (5xx) - client errors (4xx) are expected behavior
        // Skip logging if withLogger already handled it (hasLogging is true)
        if (statusCode >= 500 && !hasLogging) {
            const method = ((_b = req.method) === null || _b === void 0 ? void 0 : _b.toUpperCase()) || "???";
            const apiPath = ((_c = req.url) === null || _c === void 0 ? void 0 : _c.split("?")[0]) || entryPath;
            console_1.logger.error("API", `${method} ${apiPath} → ${statusCode} ${message}`);
        }
        // Handle validation errors by sending a custom response
        if (error.validationErrors) {
            res.sendResponse(req, statusCode, {
                message,
                statusCode,
                validationErrors: error.validationErrors,
            });
            return;
        }
        res.handleError(statusCode, message);
    }
}
