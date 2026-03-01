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
Object.defineProperty(exports, "__esModule", { value: true });
exports.mapChainNameToChainId = mapChainNameToChainId;
const ccxt = __importStar(require("ccxt"));
const https_1 = require("https");
const system_1 = require("./system");
const db_1 = require("@b/db");
const console_1 = require("@b/utils/console");
const error_1 = require("@b/utils/error");
const utils_1 = require("@b/api/exchange/utils");
// Force IPv4 for exchanges like XT.com that don't support IPv6 whitelisting
const httpsAgentIPv4 = new https_1.Agent({
    family: 4, // Force IPv4
    keepAlive: true,
    timeout: 30000,
});
class ExchangeManager {
    constructor() {
        this.exchangeCache = new Map();
        this.initializationPromises = new Map();
        this.provider = null;
        this.exchange = null;
        this.exchangeProvider = null;
        this.lastAttemptTime = null;
        this.attemptCount = 0;
        this.isInitializing = false;
        this.initializationQueue = [];
    }
    async fetchActiveProvider() {
        try {
            const provider = await db_1.models.exchange.findOne({
                where: {
                    status: true,
                },
            });
            if (!provider) {
                return null;
            }
            return provider.name;
        }
        catch (error) {
            console_1.logger.error("EXCHANGE", "Failed to fetch active provider", error);
            return null;
        }
    }
    async initializeExchange(provider, retries = 3, ctx) {
        var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k;
        (_a = ctx === null || ctx === void 0 ? void 0 : ctx.step) === null || _a === void 0 ? void 0 : _a.call(ctx, `Checking ban status for ${provider}`);
        if (await (0, utils_1.handleBanStatus)(await (0, utils_1.loadBanStatus)())) {
            return null;
        }
        if (this.exchangeCache.has(provider)) {
            (_b = ctx === null || ctx === void 0 ? void 0 : ctx.step) === null || _b === void 0 ? void 0 : _b.call(ctx, `Using cached exchange instance for ${provider}`);
            return this.exchangeCache.get(provider);
        }
        const now = Date.now();
        if (this.attemptCount >= 3 &&
            this.lastAttemptTime &&
            now - this.lastAttemptTime < 30 * 60 * 1000) {
            (_c = ctx === null || ctx === void 0 ? void 0 : ctx.step) === null || _c === void 0 ? void 0 : _c.call(ctx, `Rate limit reached for ${provider}, waiting...`);
            return null;
        }
        (_d = ctx === null || ctx === void 0 ? void 0 : ctx.step) === null || _d === void 0 ? void 0 : _d.call(ctx, `Loading API credentials for ${provider}`);
        const apiKey = process.env[`APP_${provider.toUpperCase()}_API_KEY`];
        const apiSecret = process.env[`APP_${provider.toUpperCase()}_API_SECRET`];
        const apiPassphrase = process.env[`APP_${provider.toUpperCase()}_API_PASSPHRASE`];
        if (!apiKey || !apiSecret || apiKey === "" || apiSecret === "") {
            console_1.logger.error("EXCHANGE", `API credentials for ${provider} are missing.`, new Error(`API credentials for ${provider} are missing.`));
            this.attemptCount += 1;
            this.lastAttemptTime = now;
            return null;
        }
        try {
            (_e = ctx === null || ctx === void 0 ? void 0 : ctx.step) === null || _e === void 0 ? void 0 : _e.call(ctx, `Creating exchange instance for ${provider}`);
            let exchange = new ccxt.pro[provider]({
                apiKey,
                secret: apiSecret,
                password: apiPassphrase,
                agent: httpsAgentIPv4, // Force IPv4 for API requests
                timeout: 30000,
                enableRateLimit: true,
            });
            (_f = ctx === null || ctx === void 0 ? void 0 : ctx.step) === null || _f === void 0 ? void 0 : _f.call(ctx, `Validating credentials for ${provider}`);
            const credentialsValid = await exchange.checkRequiredCredentials();
            if (!credentialsValid) {
                console_1.logger.error("EXCHANGE", `API credentials for ${provider} are invalid.`, new Error(`API credentials for ${provider} are invalid.`));
                await exchange.close();
                exchange = new ccxt.pro[provider]({
                    agent: httpsAgentIPv4,
                    timeout: 30000,
                    enableRateLimit: true,
                });
            }
            try {
                (_g = ctx === null || ctx === void 0 ? void 0 : ctx.step) === null || _g === void 0 ? void 0 : _g.call(ctx, `Loading markets for ${provider}`);
                await exchange.loadMarkets();
            }
            catch (error) {
                if (this.isRateLimitError(error)) {
                    (_h = ctx === null || ctx === void 0 ? void 0 : ctx.step) === null || _h === void 0 ? void 0 : _h.call(ctx, `Rate limit error detected for ${provider}, retrying...`);
                    await this.handleRateLimitError(provider, ctx);
                    return this.initializeExchange(provider, retries, ctx);
                }
                else {
                    console_1.logger.error("EXCHANGE", `Failed to load markets: ${error.message}`, new Error(`Failed to load markets: ${error.message}`));
                    await exchange.close();
                    exchange = new ccxt.pro[provider]({
                        agent: httpsAgentIPv4,
                        timeout: 30000,
                        enableRateLimit: true,
                    });
                }
            }
            this.exchangeCache.set(provider, exchange);
            this.attemptCount = 0;
            this.lastAttemptTime = null;
            (_j = ctx === null || ctx === void 0 ? void 0 : ctx.step) === null || _j === void 0 ? void 0 : _j.call(ctx, `Exchange ${provider} initialized successfully`);
            return exchange;
        }
        catch (error) {
            console_1.logger.error("EXCHANGE", "Failed to initialize exchange", error);
            this.attemptCount += 1;
            this.lastAttemptTime = now;
            if (retries > 0 &&
                (this.attemptCount < 3 || now - this.lastAttemptTime >= 30 * 60 * 1000)) {
                (_k = ctx === null || ctx === void 0 ? void 0 : ctx.step) === null || _k === void 0 ? void 0 : _k.call(ctx, `Retrying exchange initialization for ${provider} (${retries} retries left)`);
                await (0, system_1.sleep)(5000);
                return this.initializeExchange(provider, retries - 1, ctx);
            }
            return null;
        }
    }
    isRateLimitError(error) {
        return error instanceof ccxt.RateLimitExceeded || error.code === -1003;
    }
    async handleRateLimitError(provider, ctx) {
        var _a;
        (_a = ctx === null || ctx === void 0 ? void 0 : ctx.step) === null || _a === void 0 ? void 0 : _a.call(ctx, `Rate limit exceeded for ${provider}, applying 1-minute ban`);
        const banTime = Date.now() + 60000; // Ban for 1 minute
        await (0, utils_1.saveBanStatus)(banTime);
        await (0, system_1.sleep)(60000); // Wait for 1 minute
    }
    async startExchange(ctx) {
        var _a, _b, _c, _d, _e, _f, _g, _h, _j;
        (_a = ctx === null || ctx === void 0 ? void 0 : ctx.step) === null || _a === void 0 ? void 0 : _a.call(ctx, "Starting exchange initialization");
        if (await (0, utils_1.handleBanStatus)(await (0, utils_1.loadBanStatus)())) {
            (_b = ctx === null || ctx === void 0 ? void 0 : ctx.step) === null || _b === void 0 ? void 0 : _b.call(ctx, "Exchange is currently banned");
            return null;
        }
        if (this.exchange) {
            (_c = ctx === null || ctx === void 0 ? void 0 : ctx.step) === null || _c === void 0 ? void 0 : _c.call(ctx, "Using existing exchange instance");
            return this.exchange;
        }
        // Handle concurrent initialization
        if (this.isInitializing) {
            (_d = ctx === null || ctx === void 0 ? void 0 : ctx.step) === null || _d === void 0 ? void 0 : _d.call(ctx, "Exchange initialization already in progress, queuing request");
            return new Promise((resolve, reject) => {
                this.initializationQueue.push({ resolve, reject });
            });
        }
        this.isInitializing = true;
        try {
            (_e = ctx === null || ctx === void 0 ? void 0 : ctx.step) === null || _e === void 0 ? void 0 : _e.call(ctx, "Fetching active exchange provider");
            this.provider = this.provider || (await this.fetchActiveProvider());
            if (!this.provider) {
                (_f = ctx === null || ctx === void 0 ? void 0 : ctx.step) === null || _f === void 0 ? void 0 : _f.call(ctx, "No active exchange provider found");
                this.resolveQueue(null);
                return null;
            }
            (_g = ctx === null || ctx === void 0 ? void 0 : ctx.step) === null || _g === void 0 ? void 0 : _g.call(ctx, `Active provider: ${this.provider}`);
            // Check if exchange is already cached
            if (this.exchangeCache.has(this.provider)) {
                (_h = ctx === null || ctx === void 0 ? void 0 : ctx.step) === null || _h === void 0 ? void 0 : _h.call(ctx, `Using cached exchange for ${this.provider}`);
                this.exchange = this.exchangeCache.get(this.provider);
                this.resolveQueue(this.exchange);
                return this.exchange;
            }
            // Initialize exchange
            (_j = ctx === null || ctx === void 0 ? void 0 : ctx.step) === null || _j === void 0 ? void 0 : _j.call(ctx, `Initializing exchange: ${this.provider}`);
            this.exchange = await this.initializeExchange(this.provider, 3, ctx);
            this.resolveQueue(this.exchange);
            return this.exchange;
        }
        catch (error) {
            this.rejectQueue(error);
            throw error;
        }
        finally {
            this.isInitializing = false;
        }
    }
    resolveQueue(result) {
        while (this.initializationQueue.length > 0) {
            const { resolve } = this.initializationQueue.shift();
            resolve(result);
        }
    }
    rejectQueue(error) {
        while (this.initializationQueue.length > 0) {
            const { reject } = this.initializationQueue.shift();
            reject(error);
        }
    }
    async startExchangeProvider(provider, ctx) {
        var _a, _b, _c, _d;
        (_a = ctx === null || ctx === void 0 ? void 0 : ctx.step) === null || _a === void 0 ? void 0 : _a.call(ctx, `Starting exchange provider: ${provider}`);
        if (await (0, utils_1.handleBanStatus)(await (0, utils_1.loadBanStatus)())) {
            (_b = ctx === null || ctx === void 0 ? void 0 : ctx.step) === null || _b === void 0 ? void 0 : _b.call(ctx, "Exchange is currently banned");
            return null;
        }
        if (!provider) {
            throw (0, error_1.createError)({ statusCode: 400, message: "Provider is required to start exchange provider." });
        }
        if (this.exchangeCache.has(provider)) {
            (_c = ctx === null || ctx === void 0 ? void 0 : ctx.step) === null || _c === void 0 ? void 0 : _c.call(ctx, `Using cached exchange provider: ${provider}`);
        }
        else {
            (_d = ctx === null || ctx === void 0 ? void 0 : ctx.step) === null || _d === void 0 ? void 0 : _d.call(ctx, `Initializing exchange provider: ${provider}`);
        }
        this.exchangeProvider =
            this.exchangeCache.get(provider) ||
                (await this.initializeExchange(provider, 3, ctx));
        return this.exchangeProvider;
    }
    removeExchange(provider) {
        if (!provider) {
            throw (0, error_1.createError)({ statusCode: 400, message: "Provider is required to remove exchange." });
        }
        this.exchangeCache.delete(provider);
        if (this.provider === provider) {
            this.exchange = null;
            this.provider = null;
        }
    }
    async getProvider() {
        if (!this.provider) {
            this.provider = await this.fetchActiveProvider();
        }
        return this.provider;
    }
    async testExchangeCredentials(provider, ctx) {
        var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m, _o, _p, _q, _r;
        (_a = ctx === null || ctx === void 0 ? void 0 : ctx.step) === null || _a === void 0 ? void 0 : _a.call(ctx, `Testing exchange credentials for ${provider}`);
        if (await (0, utils_1.handleBanStatus)(await (0, utils_1.loadBanStatus)())) {
            (_b = ctx === null || ctx === void 0 ? void 0 : ctx.step) === null || _b === void 0 ? void 0 : _b.call(ctx, "Exchange is currently banned");
            return {
                status: false,
                message: "Service temporarily unavailable. Please try again later.",
            };
        }
        try {
            (_c = ctx === null || ctx === void 0 ? void 0 : ctx.step) === null || _c === void 0 ? void 0 : _c.call(ctx, `Loading API credentials for ${provider}`);
            const apiKey = process.env[`APP_${provider.toUpperCase()}_API_KEY`];
            const apiSecret = process.env[`APP_${provider.toUpperCase()}_API_SECRET`];
            const apiPassphrase = process.env[`APP_${provider.toUpperCase()}_API_PASSPHRASE`];
            if (!apiKey || !apiSecret || apiKey === "" || apiSecret === "") {
                (_d = ctx === null || ctx === void 0 ? void 0 : ctx.step) === null || _d === void 0 ? void 0 : _d.call(ctx, "API credentials are missing");
                return {
                    status: false,
                    message: "API credentials are missing from environment variables",
                };
            }
            // Create exchange instance with timeout and error handling
            (_e = ctx === null || ctx === void 0 ? void 0 : ctx.step) === null || _e === void 0 ? void 0 : _e.call(ctx, `Creating test exchange instance for ${provider}`);
            const exchange = new ccxt.pro[provider]({
                apiKey,
                secret: apiSecret,
                password: apiPassphrase,
                agent: httpsAgentIPv4, // Force IPv4 for API requests
                timeout: 30000, // 30 second timeout
                enableRateLimit: true,
            });
            // Test connection by loading markets first
            (_f = ctx === null || ctx === void 0 ? void 0 : ctx.step) === null || _f === void 0 ? void 0 : _f.call(ctx, `Loading markets for ${provider}`);
            await exchange.loadMarkets();
            // Test credentials by fetching balance
            (_g = ctx === null || ctx === void 0 ? void 0 : ctx.step) === null || _g === void 0 ? void 0 : _g.call(ctx, `Fetching balance to verify credentials for ${provider}`);
            const balance = await exchange.fetchBalance();
            // Clean up the connection
            (_h = ctx === null || ctx === void 0 ? void 0 : ctx.step) === null || _h === void 0 ? void 0 : _h.call(ctx, `Closing test connection for ${provider}`);
            await exchange.close();
            if (balance && typeof balance === 'object') {
                (_j = ctx === null || ctx === void 0 ? void 0 : ctx.step) === null || _j === void 0 ? void 0 : _j.call(ctx, `Credentials verified successfully for ${provider}`);
                return {
                    status: true,
                    message: "API credentials are valid and connection successful",
                };
            }
            else {
                (_k = ctx === null || ctx === void 0 ? void 0 : ctx.step) === null || _k === void 0 ? void 0 : _k.call(ctx, `Failed to verify credentials for ${provider}`);
                return {
                    status: false,
                    message: "Failed to fetch balance with the provided credentials",
                };
            }
        }
        catch (error) {
            console_1.logger.error("EXCHANGE", "Failed to test exchange credentials", error);
            // Handle specific error types
            if (error.name === 'AuthenticationError') {
                (_l = ctx === null || ctx === void 0 ? void 0 : ctx.step) === null || _l === void 0 ? void 0 : _l.call(ctx, `Authentication error for ${provider}`);
                return {
                    status: false,
                    message: "Invalid API credentials. Please check your API key and secret.",
                };
            }
            else if (error.name === 'NetworkError' || error.code === 'ENOTFOUND' || error.code === 'EAI_AGAIN') {
                (_m = ctx === null || ctx === void 0 ? void 0 : ctx.step) === null || _m === void 0 ? void 0 : _m.call(ctx, `Network error for ${provider}`);
                return {
                    status: false,
                    message: "Network error. Please check your internet connection and try again.",
                };
            }
            else if (error.name === 'ExchangeNotAvailable') {
                (_o = ctx === null || ctx === void 0 ? void 0 : ctx.step) === null || _o === void 0 ? void 0 : _o.call(ctx, `Exchange not available: ${provider}`);
                return {
                    status: false,
                    message: "Exchange service is temporarily unavailable. Please try again later.",
                };
            }
            else if (error.name === 'RateLimitExceeded') {
                (_p = ctx === null || ctx === void 0 ? void 0 : ctx.step) === null || _p === void 0 ? void 0 : _p.call(ctx, `Rate limit exceeded for ${provider}`);
                return {
                    status: false,
                    message: "Rate limit exceeded. Please wait a moment and try again.",
                };
            }
            else if (error.name === 'PermissionDenied') {
                (_q = ctx === null || ctx === void 0 ? void 0 : ctx.step) === null || _q === void 0 ? void 0 : _q.call(ctx, `Permission denied for ${provider}`);
                return {
                    status: false,
                    message: "Insufficient API permissions. Please check your API key permissions.",
                };
            }
            else {
                (_r = ctx === null || ctx === void 0 ? void 0 : ctx.step) === null || _r === void 0 ? void 0 : _r.call(ctx, `Connection failed for ${provider}: ${error.message}`);
                return {
                    status: false,
                    message: `Connection failed: ${error.message || 'Unknown error occurred'}`,
                };
            }
        }
    }
    async stopExchange() {
        if (this.exchange) {
            await this.exchange.close();
            this.exchange = null;
        }
    }
}
ExchangeManager.instance = new ExchangeManager();
exports.default = ExchangeManager.instance;
function mapChainNameToChainId(chainName) {
    const chainMap = {
        BEP20: "bsc",
        BEP2: "bnb",
        ERC20: "eth",
        TRC20: "trx",
        "KAVA EVM CO-CHAIN": "kavaevm",
        "LIGHTNING NETWORK": "lightning",
        "BTC-SEGWIT": "btc",
        "ASSET HUB(POLKADOT)": "polkadot",
    };
    return chainMap[chainName] || chainName;
}
