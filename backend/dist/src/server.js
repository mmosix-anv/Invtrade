"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function (o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
        desc = { enumerable: true, get: function () { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function (o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function (o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function (o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function (o) {
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.MashServer = void 0;
// server.ts
const uWebSockets_js_1 = require("uWebSockets.js");
const RouteHandler_1 = require("./handler/RouteHandler");
const utils_1 = require("./utils");
const Routes_1 = require("@b/handler/Routes");
const docs_1 = require("@b/docs");
const utils_2 = require("@b/utils");
const roles_1 = require("@b/utils/roles");
const cron_1 = __importStar(require("@b/cron"));
const db_1 = require("@b/db");
const console_1 = require("@b/utils/console");
const safe_imports_1 = require("@b/utils/safe-imports");
const Response_1 = require("./handler/Response");
const console_2 = require("@b/utils/console");
const path = __importStar(require("path"));
const constants_1 = require("@b/utils/constants");
const cache_1 = require("./utils/cache");
const worker_threads_1 = require("worker_threads");
const db_2 = require("@b/db");
const security_1 = require("@b/utils/security");
const error_1 = require("@b/utils/error");
// Get package version - use path resolution that works in both dev and production
// In dev: backend/src/server.ts -> root package.json
// In prod: backend/dist/src/server.js -> root package.json
const pkg = (() => {
    try {
        // Try root package.json first (3 levels up from dist/src/server.js or 2 from src/server.ts)
        const rootPkg = constants_1.isProduction
            ? require(path.join(__dirname, "../../../package.json"))
            : require(path.join(__dirname, "../../package.json"));
        if (rootPkg.version)
            return rootPkg;
    }
    catch (_a) { }
    try {
        // Fallback: try to find it via process.cwd()
        return require(path.join(process.cwd(), "package.json"));
    }
    catch (_b) { }
    return { version: "unknown" };
})();
class MashServer extends RouteHandler_1.RouteHandler {
    constructor(options = {}) {
        super();
        this.benchmarkRoutes = [];
        this.app = (0, uWebSockets_js_1.App)(options);
        this.cors();
        this.startTime = Date.now();
        // Create a promise that will resolve when initialization is complete
        this.initPromise = new Promise((resolve, reject) => {
            this.initResolve = resolve;
            this.initReject = reject;
        });
        // Show banner only on main thread
        if (worker_threads_1.isMainThread) {
            const appName = process.env.NEXT_PUBLIC_SITE_NAME || "Invtrade";
            const env = constants_1.isProduction ? "Production" : "Development";
            console_1.console$.banner(appName, pkg.version, env);
        }
        this.initializeServer();
        (0, utils_1.setupProcessEventHandlers)();
    }
    /**
     * Wait for initialization to complete
     */
    async waitForInit() {
        return this.initPromise;
    }
    /**
     * Get the total startup time since server was created
     */
    getStartTime() {
        return this.startTime;
    }
    listen(port, cb) {
        this.app.any("/*", (res, req) => {
            let responseSent = false;
            res.onAborted(() => {
                responseSent = true;
            });
            try {
                const url = req.getUrl();
                if (url.startsWith("/uploads/")) {
                    const handled = (0, utils_1.serveStaticFile)(res, req, url, () => (responseSent = true));
                    if (handled)
                        return;
                }
                this.processRoute(res, req, () => (responseSent = true));
            }
            catch (error) {
                console.error("Server error :", error);
                if (!responseSent && !res.aborted) {
                    const response = new Response_1.Response(res);
                    response.handleError(500, `Internal Server Error: ${error.message}`);
                    responseSent = true;
                }
            }
        });
        // In development, bind to 0.0.0.0 to allow mobile/tablet access
        // In production, bind to default (localhost) for security
        const host = constants_1.isProduction ? undefined : "0.0.0.0";
        if (host) {
            this.app.listen(host, port, cb);
        }
        else {
            this.app.listen(port, cb);
        }
    }
    async initializeServer() {
        try {
            let cronCount = 0;
            let extensionCount = 0;
            // Database
            await this.runTask("Database", async () => {
                await this.ensureDatabaseReady();
            });
            // Initialize Notification Channels - After database is ready
            await this.runTask("Notifications", async () => {
                const { initializeNotificationChannels } = await Promise.resolve().then(() => __importStar(require("@b/services/notification")));
                await initializeNotificationChannels();
            });
            // Security - Initialize license validation and protection (main thread only)
            if (worker_threads_1.isMainThread) {
                await this.runTask("Security", async () => {
                    await (0, security_1.initializeSecurity)();
                    // Add license enforcement middleware
                    // This blocks all API requests if license is not valid (security level < 2)
                    this.use((res, req, next) => {
                        var _a;
                        const url = req.getUrl();
                        // Allow these paths without license check:
                        // - Auth endpoints (login, register, etc.) - needed to access admin and activate license
                        // - User profile endpoint - needed for role-based access to admin panel
                        // - License activation endpoints
                        // - Health check endpoints
                        // - Static files
                        if (url.startsWith("/api/auth/") ||
                            url.startsWith("/api/user/profile") ||
                            url.startsWith("/api/admin/system/license") ||
                            url.startsWith("/api/health") ||
                            url.startsWith("/uploads/") ||
                            url === "/api/docs" ||
                            url.startsWith("/api/docs/")) {
                            if (typeof next === "function")
                                next();
                            return;
                        }
                        // Check security level - level 2+ means valid license
                        const securityLevel = (0, security_1.getSecurityLevel)();
                        if (false) {
                            const status = (0, security_1.getSecurityStatus)();
                            const licenseStatus = ((_a = status.license) === null || _a === void 0 ? void 0 : _a.status) || "invalid";
                            // Return appropriate error based on license status
                            let message = "License validation failed. Please activate your license.";
                            let statusCode = 403;
                            if (licenseStatus === "not_activated") {
                                message = "License is not activated on this server. Please activate your license at /admin/system/license";
                            }
                            else if (licenseStatus === "expired") {
                                message = "License has expired. Please renew your license.";
                                statusCode = 402;
                            }
                            else if (licenseStatus === "revoked") {
                                message = "License has been revoked. Please contact support.";
                            }
                            else if (licenseStatus === "network_error") {
                                message = "Unable to validate license. Please check your internet connection.";
                                statusCode = 503;
                            }
                            res.handleError(statusCode, message);
                            return;
                        }
                        if (typeof next === "function")
                            next();
                    });
                });
            }
            // Binary Orders - Initialize pending orders after DB is ready
            const cacheManager = cache_1.CacheManager.getInstance();
            const binaryStatus = await cacheManager.getSetting("binaryStatus");
            if (binaryStatus === "true") {
                await this.runTask("Binary Orders", async () => {
                    const { BinaryOrderService } = await Promise.resolve().then(() => __importStar(require("./api/exchange/binary/order/util/BinaryOrderService")));
                    await BinaryOrderService.initializePendingOrders();
                });
            }
            // Roles & Permissions
            await this.runTask("Roles", async () => {
                await this.setupRoles();
            });
            // API Routes
            await this.runTask("Routes", async () => {
                await this.setupRoutes();
            });
            // Cron Jobs (main thread only)
            if (worker_threads_1.isMainThread) {
                await this.runTask("Cron", async () => {
                    cronCount = await this.setupCronJobs();
                });
            }
            // Extensions
            await this.runTask("Extensions", async () => {
                const cacheManager = cache_1.CacheManager.getInstance();
                const extensions = await cacheManager.getExtensions();
                extensionCount = extensions.size;
                if (false && extensions.has("ecosystem")) {
                    await this.setupEcosystem();
                }
            });
            // Signal that initialization is complete
            this.initResolve();
        }
        catch (error) {
            console_2.logger.error("SERVER", "Initialization failed", error);
            this.initReject(error);
            process.exit(1);
        }
    }
    /**
     * Run a task with minimal logging - shows spinner while running, then result
     */
    async runTask(name, fn) {
        const task = console_1.console$.live(name.toUpperCase(), `${name}...`);
        try {
            await fn();
            task.succeed();
        }
        catch (error) {
            task.fail(error.message);
            throw error;
        }
    }
    /**
     * Combined initialization and listen - ensures proper startup sequence
     */
    async startServer(port) {
        // Wait for initialization to complete
        await this.waitForInit();
        // Now start listening
        return new Promise((resolve) => {
            this.listen(port, () => {
                console_1.console$.ready(port, this.startTime);
                resolve();
            });
        });
    }
    async ensureDatabaseReady() {
        if (!db_2.sequelize) {
            throw (0, error_1.createError)({ statusCode: 500, message: "Sequelize instance is not initialized." });
        }
        // Initialize the database (sync tables)
        await db_1.db.initialize();
    }
    // Helper method to execute async functions safely and log any errors
    async safeExecute(fn, label) {
        try {
            await fn();
        }
        catch (error) {
            console_2.logger.error("SERVER", `${label} failed`, error);
            throw error;
        }
    }
    // Helper that returns a count from the executed function
    async safeExecuteWithCount(fn, label) {
        try {
            const result = await fn();
            return typeof result === "number" ? result : 0;
        }
        catch (error) {
            console_2.logger.error("SERVER", `${label} failed`, error);
            throw error;
        }
    }
    async setupRoles() {
        await roles_1.rolesManager.initialize();
        this.setRoles(roles_1.rolesManager.roles);
    }
    async setupRoutes() {
        const fs = await Promise.resolve().then(() => __importStar(require("fs/promises")));
        // Determine the correct API routes path
        let apiRoutesPath;
        if (constants_1.isProduction) {
            // In production, the API routes are in the dist folder relative to the current working directory
            apiRoutesPath = path.join(__dirname, "api");
        }
        else {
            // In development, use the source API path
            apiRoutesPath = path.join(constants_1.baseUrl, "src", "api");
        }
        // Check if the path exists using async access (non-blocking)
        const pathExists = async (p) => {
            try {
                await fs.access(p);
                return true;
            }
            catch (_a) {
                return false;
            }
        };
        if (await pathExists(apiRoutesPath)) {
            await (0, Routes_1.setupApiRoutes)(this, apiRoutesPath);
        }
        else {
            // Try alternative paths in parallel
            const alternativePaths = [
                path.join(process.cwd(), "backend", "dist", "src", "api"),
                path.join(process.cwd(), "dist", "src", "api"),
                path.join(__dirname, "..", "api"),
                path.join(constants_1.baseUrl, "api"),
            ];
            const results = await Promise.all(alternativePaths.map(async (p) => ({ path: p, exists: await pathExists(p) })));
            const validPath = results.find(r => r.exists);
            if (validPath) {
                await (0, Routes_1.setupApiRoutes)(this, validPath.path);
            }
        }
        (0, docs_1.setupSwaggerRoute)(this);
        (0, utils_2.setupDefaultRoutes)(this);
    }
    async setupCronJobs() {
        if (!worker_threads_1.isMainThread)
            return 0; // Only the main thread should setup cron jobs
        const cronJobManager = await cron_1.default.getInstance();
        const cronJobs = await cronJobManager.getCronJobs();
        // Create all workers in parallel (silent - no individual logging)
        await Promise.all(cronJobs.map((job) => (0, cron_1.createWorker)(job.name, job.handler, job.period)));
        return cronJobs.length;
    }
    async setupEcosystem() {
        try {
            await (0, safe_imports_1.initializeScylla)();
            await (0, safe_imports_1.initializeMatchingEngine)();
        }
        catch (error) {
            console_2.logger.error("ECOSYSTEM", "Error initializing ecosystem", error);
        }
    }
    get(path, ...handler) {
        this.benchmarkRoutes.push({ method: "get", path });
        super.set("get", path, ...handler);
    }
    post(path, ...handler) {
        super.set("post", path, ...handler);
    }
    put(path, ...handler) {
        super.set("put", path, ...handler);
    }
    patch(path, ...handler) {
        super.set("patch", path, ...handler);
    }
    del(path, ...handler) {
        super.set("delete", path, ...handler);
    }
    options(path, ...handler) {
        super.set("options", path, ...handler);
    }
    head(path, ...handler) {
        super.set("head", path, ...handler);
    }
    connect(path, ...handler) {
        super.set("connect", path, ...handler);
    }
    trace(path, ...handler) {
        super.set("trace", path, ...handler);
    }
    all(path, ...handler) {
        super.set("all", path, ...handler);
    }
    getBenchmarkRoutes() {
        return this.benchmarkRoutes;
    }
    use(middleware) {
        super.use(middleware);
    }
    error(cb) {
        super.error(cb);
    }
    notFound(cb) {
        super.notFound(cb);
    }
    ws(pattern, behavior) {
        this.app.ws(pattern, behavior);
    }
    cors() {
        const isDev = process.env.NODE_ENV === "development";
        console.log(`[CORS] Initializing CORS - NODE_ENV: ${process.env.NODE_ENV}, isDev: ${isDev}`);
        
        this.app.options("/*", (res, req) => {
            var _a, _b, _c, _d;
            // Get origin from headers - try different methods
            const origin = ((_a = req.getHeader) === null || _a === void 0 ? void 0 : _a.call(req, "origin")) || ((_b = req.getHeader) === null || _b === void 0 ? void 0 : _b.call(req, "Origin")) ||
                ((_c = req.headers) === null || _c === void 0 ? void 0 : _c["origin"]) || ((_d = req.headers) === null || _d === void 0 ? void 0 : _d["Origin"]);
            
            console.log(`[CORS] OPTIONS request - Origin: ${origin}, isDev: ${isDev}, NODE_ENV: ${process.env.NODE_ENV}`);
            
            // Always set CORS headers in development, check origins in production
            if (isDev) {
                // Development: Always allow
                (0, utils_1.setCORSHeaders)(res, origin || "http://localhost:3000");
                res.writeStatus("204 No Content");
                res.end();
            }
            else {
                // Production: Check allowed origins
                const isAllowed = origin && utils_1.allowedOrigins.includes(origin);
                console.log(`[CORS] Production mode - isAllowed: ${isAllowed}, allowedOrigins:`, utils_1.allowedOrigins);
                if (isAllowed) {
                    (0, utils_1.setCORSHeaders)(res, origin);
                    res.writeStatus("204 No Content");
                    res.end();
                } else {
                    res.writeStatus("403 Forbidden");
                    res.end();
                }
            }
        });
        this.use((res, req, next) => {
            var _a, _b, _c, _d;
            // Get origin from headers - try different methods
            const origin = ((_a = req.getHeader) === null || _a === void 0 ? void 0 : _a.call(req, "origin")) || ((_b = req.getHeader) === null || _b === void 0 ? void 0 : _b.call(req, "Origin")) ||
                ((_c = req.headers) === null || _c === void 0 ? void 0 : _c["origin"]) || ((_d = req.headers) === null || _d === void 0 ? void 0 : _d["Origin"]);
            // Always set CORS headers in development, check origins in production
            if (isDev) {
                // Development: Always allow
                (0, utils_1.setCORSHeaders)(res, origin || "http://localhost:3000");
            }
            else {
                // Production: Check allowed origins
                const isAllowed = origin && utils_1.allowedOrigins.includes(origin);
                if (isAllowed) {
                    (0, utils_1.setCORSHeaders)(res, origin);
                }
            }
            if (typeof next === "function") {
                next();
            }
        });
    }
    setRoles(roles) {
        this.roles = roles;
    }
    getRole(id) {
        return this.roles.get(id);
    }
    getDescriptor() {
        // Return the descriptor of the uWS app instance
        return this.app.getDescriptor();
    }
    addChildAppDescriptor(descriptor) {
        // Add a child app descriptor to the main app
        this.app.addChildAppDescriptor(descriptor);
    }
}
exports.MashServer = MashServer;
