"use strict";
/**
 * License Heartbeat Cron Job
 * Sends periodic heartbeats to the Envato license server for all products
 * Uses batch API for efficiency - single request for all products
 */
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
exports.processLicenseHeartbeat = processLicenseHeartbeat;
const fingerprint_1 = require("@b/utils/security/fingerprint");
const security_1 = require("@b/utils/security");
const console_1 = require("@b/utils/console");
const db_1 = require("@b/db");
const promises_1 = __importDefault(require("fs/promises"));
const path_1 = __importDefault(require("path"));
const os_1 = __importDefault(require("os"));
const https_1 = __importDefault(require("https"));
const error_1 = require("@b/utils/error");
// Cache for public IP
let cachedPublicIp = null;
let lastIpFetch = 0;
const IP_CACHE_DURATION = 60000; // 1 minute
/**
 * Fetches the public IP address of the server
 */
async function fetchPublicIp() {
    const now = Date.now();
    if (cachedPublicIp && lastIpFetch && now - lastIpFetch < IP_CACHE_DURATION) {
        return cachedPublicIp;
    }
    try {
        const ip = await new Promise((resolve, reject) => {
            https_1.default.get("https://api.ipify.org?format=json", (resp) => {
                let data = "";
                resp.on("data", (chunk) => { data += chunk; });
                resp.on("end", () => {
                    try {
                        const parsed = JSON.parse(data);
                        resolve(parsed.ip);
                    }
                    catch (_a) {
                        reject(new Error("Failed to parse IP response"));
                    }
                });
                resp.on("error", reject);
            }).on("error", reject);
        });
        cachedPublicIp = ip;
        lastIpFetch = now;
        return ip;
    }
    catch (_a) {
        return "127.0.0.1";
    }
}
/**
 * Reset chart engine settings to TradingView when license is invalid
 * This affects both binary settings (display.chartType) and system settings (spotChartEngine)
 */
async function resetChartEngineSettings() {
    var _a;
    try {
        let settingsChanged = false;
        // 1. Reset binary settings chartType to TRADINGVIEW
        const binarySettingsRecord = await db_1.models.settings.findOne({
            where: { key: "binarySettings" },
        });
        if (binarySettingsRecord === null || binarySettingsRecord === void 0 ? void 0 : binarySettingsRecord.value) {
            try {
                const binarySettings = JSON.parse(binarySettingsRecord.value);
                if (((_a = binarySettings.display) === null || _a === void 0 ? void 0 : _a.chartType) === "CHART_ENGINE") {
                    binarySettings.display.chartType = "TRADINGVIEW";
                    binarySettings._lastModified = new Date().toISOString();
                    await db_1.models.settings.update({ value: JSON.stringify(binarySettings) }, { where: { key: "binarySettings" } });
                    console_1.logger.groupItem("HEARTBEAT", "Binary chart type reset to TradingView", "warn");
                    settingsChanged = true;
                }
            }
            catch (_b) {
                // Invalid JSON, skip
            }
        }
        // 2. Reset spot chart engine setting to TRADINGVIEW
        const spotChartSetting = await db_1.models.settings.findOne({
            where: { key: "spotChartEngine" },
        });
        if ((spotChartSetting === null || spotChartSetting === void 0 ? void 0 : spotChartSetting.value) === "CHART_ENGINE") {
            await db_1.models.settings.update({ value: "TRADINGVIEW" }, { where: { key: "spotChartEngine" } });
            console_1.logger.groupItem("HEARTBEAT", "Spot chart engine reset to TradingView", "warn");
            settingsChanged = true;
        }
        // 3. Clear cache if settings were changed so frontend picks up the changes
        if (settingsChanged) {
            try {
                const { CacheManager } = await Promise.resolve().then(() => __importStar(require("@b/utils/cache")));
                const cacheManager = CacheManager.getInstance();
                await cacheManager.clearCache();
                console_1.logger.groupItem("HEARTBEAT", "Settings cache cleared", "info");
            }
            catch (_c) {
                // Cache clear failed, not critical
            }
        }
    }
    catch (error) {
        console_1.logger.groupItem("HEARTBEAT", `Failed to reset chart engine settings: ${error.message}`, "error");
    }
}
/**
 * Get purchase code from license file
 */
async function getPurchaseCode(productId) {
    try {
        const cwd = process.cwd();
        const rootDir = cwd.endsWith("backend") || cwd.endsWith("backend/") || cwd.endsWith("backend\\")
            ? path_1.default.dirname(cwd)
            : cwd;
        const licPath = path_1.default.join(rootDir, "lic", `${productId}.lic`);
        const content = await promises_1.default.readFile(licPath, "utf-8");
        const trimmed = content.trim();
        // Try to parse as base64 encoded JSON
        try {
            const decoded = Buffer.from(trimmed, "base64").toString("utf-8");
            const licenseData = JSON.parse(decoded);
            if (licenseData.purchaseCode) {
                return licenseData.purchaseCode;
            }
            if (licenseData.licenseKey) {
                return licenseData.licenseKey;
            }
        }
        catch (_a) {
            // Not base64 JSON, might be plain purchase code (UUID format)
            if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(trimmed)) {
                return trimmed;
            }
        }
        return null;
    }
    catch (_b) {
        return null;
    }
}
/**
 * Get all products that have ACTIVATED licenses (with valid purchase codes)
 */
async function getActivatedProducts() {
    const products = [];
    // Check core product
    const coreProductId = process.env.MAIN_PRODUCT_ID || "35599184";
    const corePurchaseCode = await getPurchaseCode(coreProductId);
    if (corePurchaseCode) {
        products.push({
            productId: coreProductId,
            purchaseCode: corePurchaseCode,
            name: "Invtrade",
            type: "core",
        });
    }
    try {
        // Get all extensions with productIds
        if (db_1.models.extension) {
            const extensions = await db_1.models.extension.findAll({
                where: {
                    productId: { [require("sequelize").Op.not]: null },
                },
                attributes: ["productId", "name", "title"],
            });
            for (const ext of extensions) {
                if (ext.productId) {
                    const purchaseCode = await getPurchaseCode(ext.productId);
                    if (purchaseCode) {
                        products.push({
                            productId: ext.productId,
                            purchaseCode,
                            name: ext.title || ext.name,
                            type: "extension",
                        });
                    }
                }
            }
        }
        // Get all blockchains with productIds (if ecosystem model exists)
        if (db_1.models.ecosystemBlockchain) {
            const blockchains = await db_1.models.ecosystemBlockchain.findAll({
                where: {
                    productId: { [require("sequelize").Op.not]: null },
                },
                attributes: ["productId", "name", "chain"],
            });
            for (const bc of blockchains) {
                if (bc.productId) {
                    const purchaseCode = await getPurchaseCode(bc.productId);
                    if (purchaseCode) {
                        products.push({
                            productId: bc.productId,
                            purchaseCode,
                            name: bc.name || bc.chain,
                            type: "blockchain",
                        });
                    }
                }
            }
        }
        // Get all exchange providers with productIds
        if (db_1.models.exchange) {
            const exchanges = await db_1.models.exchange.findAll({
                where: {
                    productId: { [require("sequelize").Op.not]: null },
                },
                attributes: ["productId", "name", "title"],
            });
            for (const ex of exchanges) {
                if (ex.productId) {
                    const purchaseCode = await getPurchaseCode(ex.productId);
                    if (purchaseCode) {
                        products.push({
                            productId: ex.productId,
                            purchaseCode,
                            name: ex.title || ex.name,
                            type: "exchange",
                        });
                    }
                }
            }
        }
    }
    catch (error) {
        console_1.logger.warn("HEARTBEAT", "Failed to fetch product list from database");
    }
    return products;
}
/**
 * Send batch heartbeat to license server
 */
async function sendBatchHeartbeat(products) {
    var _a;
    // Hardcoded API URL - always use production
    const apiUrl = "https://updates.mashdiv.com";
    try {
        const fingerprint = (0, fingerprint_1.getCachedFingerprint)();
        // Extract just the host from the URL (e.g., "localhost:3000" from "http://localhost:3000")
        const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || process.env.APP_PUBLIC_URL || "localhost";
        let domain;
        try {
            const url = new URL(siteUrl);
            domain = url.host;
        }
        catch (_b) {
            domain = siteUrl.replace(/^https?:\/\//, "").split("/")[0];
        }
        const ipAddress = await fetchPublicIp();
        // Collect metadata
        const cwd = process.cwd();
        const rootDir = cwd.endsWith("backend") || cwd.endsWith("backend/") || cwd.endsWith("backend\\")
            ? path_1.default.dirname(cwd)
            : cwd;
        const packageJsonPath = path_1.default.join(rootDir, "package.json");
        let version = "unknown";
        try {
            const packageJson = JSON.parse(await promises_1.default.readFile(packageJsonPath, "utf-8"));
            version = packageJson.version || "unknown";
        }
        catch (_c) {
            // Ignore
        }
        const metadata = {
            version,
            nodeVersion: process.version,
            platform: os_1.default.platform(),
            arch: os_1.default.arch(),
            uptime: process.uptime(),
            timestamp: new Date().toISOString(),
            timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        };
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 30000);
        const response = await fetch(`${apiUrl}/api/client/licenses/heartbeat/batch`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                products: products.map(p => ({
                    productId: p.productId,
                    purchaseCode: p.purchaseCode,
                })),
                fingerprint,
                domain,
                ipAddress,
                metadata,
            }),
            signal: controller.signal,
        });
        clearTimeout(timeoutId);
        if (!response.ok) {
            throw (0, error_1.createError)({ statusCode: 500, message: `Server returned ${response.status}` });
        }
        const data = await response.json();
        return {
            success: (_a = data.success) !== null && _a !== void 0 ? _a : true,
            results: data.results || [],
            totalSuccess: data.total_success || 0,
            totalFailed: data.total_failed || 0,
        };
    }
    catch (error) {
        return {
            success: false,
            results: [],
            totalSuccess: 0,
            totalFailed: products.length,
        };
    }
}
/**
 * Process license heartbeat for all products
 * Uses batch API - single request for all activated products
 */
async function processLicenseHeartbeat() {
    var _a;
    const securityStatus = (0, security_1.getSecurityStatus)();
    // Only send heartbeat if security is initialized
    if (!securityStatus.initialized) {
        return;
    }
    console_1.logger.group("HEARTBEAT", "Processing license heartbeats...");
    try {
        // Get only products with valid purchase codes
        const products = await getActivatedProducts();
        if (products.length === 0) {
            console_1.logger.groupItem("HEARTBEAT", "No activated products found");
            console_1.logger.groupEnd("HEARTBEAT", "No heartbeats to send", true);
            return;
        }
        // Create a map for quick lookup by productId
        const productMap = new Map();
        for (const p of products) {
            productMap.set(p.productId, p);
        }
        // Send batch heartbeat
        const batchResult = await sendBatchHeartbeat(products);
        if (!batchResult.success && batchResult.results.length === 0) {
            // Batch endpoint failed completely - might not exist yet
            console_1.logger.groupItem("HEARTBEAT", "Batch endpoint unavailable, skipping heartbeat", "warn");
            console_1.logger.groupEnd("HEARTBEAT", "Heartbeat skipped", false);
            return;
        }
        let successCount = 0;
        let failCount = 0;
        // Chart Engine product ID for special handling
        const CHART_ENGINE_PRODUCT_ID = "61200000";
        // Log results for each product
        for (const result of batchResult.results) {
            const product = productMap.get(result.product_id);
            const productName = (product === null || product === void 0 ? void 0 : product.name) || result.product_id;
            const productType = ((_a = product === null || product === void 0 ? void 0 : product.type) === null || _a === void 0 ? void 0 : _a.toUpperCase()) || "UNKNOWN";
            if (result.success) {
                successCount++;
                console_1.logger.groupItem("HEARTBEAT", `[${productType}] ${productName}: OK`);
            }
            else {
                failCount++;
                const status = result.status || "unknown";
                if (status === "not_activated") {
                    console_1.logger.groupItem("HEARTBEAT", `[${productType}] ${productName}: Not activated`, "warn");
                }
                else if (status === "revoked") {
                    console_1.logger.groupItem("HEARTBEAT", `[${productType}] ${productName}: License revoked`, "error");
                    // If chart_engine license is revoked, reset chart settings to TradingView
                    if (result.product_id === CHART_ENGINE_PRODUCT_ID) {
                        await resetChartEngineSettings();
                    }
                }
                else if (status === "expired") {
                    console_1.logger.groupItem("HEARTBEAT", `[${productType}] ${productName}: License expired`, "error");
                    // If chart_engine license is expired, reset chart settings to TradingView
                    if (result.product_id === CHART_ENGINE_PRODUCT_ID) {
                        await resetChartEngineSettings();
                    }
                }
                else if (status === "not_found") {
                    console_1.logger.groupItem("HEARTBEAT", `[${productType}] ${productName}: License not found`, "warn");
                }
                else {
                    console_1.logger.groupItem("HEARTBEAT", `[${productType}] ${productName}: ${result.message || status}`, "warn");
                }
            }
        }
        const level = (0, security_1.getSecurityLevel)();
        console_1.logger.groupItem("HEARTBEAT", `Security level: ${level}`);
        console_1.logger.groupItem("HEARTBEAT", `Products: ${successCount} OK, ${failCount} failed`);
        console_1.logger.groupEnd("HEARTBEAT", `Batch heartbeat completed (${products.length} products)`, failCount === 0);
    }
    catch (error) {
        console_1.logger.groupItem("HEARTBEAT", `Error: ${error.message}`, "error");
        console_1.logger.groupEnd("HEARTBEAT", "Heartbeat failed", false);
        throw error;
    }
}
