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
exports.getProduct = getProduct;
exports.getBlockchain = getBlockchain;
exports.fetchPublicIp = fetchPublicIp;
exports.getPublicIp = getPublicIp;
exports.callApi = callApi;
exports.verifyLicense = verifyLicense;
exports.activateLicense = activateLicense;
exports.checkLatestVersion = checkLatestVersion;
exports.checkUpdate = checkUpdate;
exports.downloadUpdate = downloadUpdate;
exports.fetchAllProductsUpdates = fetchAllProductsUpdates;
const https_1 = __importDefault(require("https"));
const http_1 = __importDefault(require("http"));
const adm_zip_1 = __importDefault(require("adm-zip"));
const fs_1 = require("fs");
const fs_2 = require("fs");
const system_1 = require("../../../utils/system");
const db_1 = require("@b/db");
const path_1 = __importDefault(require("path"));
const license_1 = require("@b/config/license");
const console_1 = require("@b/utils/console");
const error_1 = require("@b/utils/error");
// Secure admin error utility
function adminError(message = "System configuration error. Please contact administrator.", details) {
    if (details) {
        // Only log server-side, never return to user
        console_1.logger.error("ADMIN", message, details);
    }
    else {
        console_1.logger.error("ADMIN", message);
    }
    return new Error(message);
}
let cachedIP = null;
let lastFetched = null;
let nextVerificationDate = null;
const verificationPeriodDays = 3;
// Determine the correct root path based on environment
const rootPath = (() => {
    const cwd = process.cwd();
    // In development, if we're in the backend folder, go up one level
    if (cwd.endsWith('/backend') || cwd.endsWith('\\backend')) {
        return path_1.default.join(cwd, '..');
    }
    // In production or if already at root, use current directory
    return cwd;
})();
const licFolderPath = `${rootPath}/lic`;
async function getProduct(id) {
    if (id) {
        const extension = await db_1.models.extension.findOne({
            where: { productId: id },
        });
        if (!extension)
            throw adminError();
        return extension;
    }
    else {
        try {
            // Try multiple possible locations for package.json
            const possiblePaths = [
                `${rootPath}/package.json`,
                `${path_1.default.join(rootPath, '..')}/package.json`,
                `${process.cwd()}/package.json`,
                `${path_1.default.join(process.cwd(), '..')}/package.json`,
            ];
            let content = null;
            let usedPath = '';
            for (const filePath of possiblePaths) {
                try {
                    const fileContent = await fs_1.promises.readFile(filePath, "utf8");
                    content = JSON.parse(fileContent);
                    // Check if this package.json has the expected fields
                    if (content && (content.id || content.name)) {
                        usedPath = filePath;
                        break;
                    }
                }
                catch (err) {
                    continue;
                }
            }
            if (!content || !content.id) {
                throw adminError("Could not find valid package.json with required fields");
            }
            return {
                id: content.id || "35599184", // Fallback to Envato Item ID
                productId: content.id || "35599184", // Map id to productId for compatibility
                name: content.name || "invtrade",
                version: content.version || "5.0.0",
                description: content.description || "Invtrade Trading Platform",
            };
        }
        catch (error) {
            throw adminError("Could not read product information.", error);
        }
    }
}
async function getBlockchain(id) {
    const blockchain = await db_1.models.ecosystemBlockchain.findOne({
        where: { productId: id },
    });
    if (!blockchain)
        throw adminError();
    return blockchain;
}
async function fetchPublicIp() {
    try {
        const data = await new Promise((resolve, reject) => {
            https_1.default.get("https://api.ipify.org?format=json", (resp) => {
                let data = "";
                resp.on("data", (chunk) => {
                    data += chunk;
                });
                resp.on("end", () => {
                    resolve(JSON.parse(data));
                });
                resp.on("error", (err) => {
                    reject(err);
                });
            });
        });
        return data.ip;
    }
    catch (error) {
        console_1.logger.error("ADMIN", `Error fetching public IP: ${error.message}`);
        return null;
    }
}
async function getPublicIp() {
    const now = Date.now();
    if (cachedIP && lastFetched && now - lastFetched < 60000) {
        // 1 minute cache
        return cachedIP;
    }
    cachedIP = await fetchPublicIp();
    lastFetched = now;
    return cachedIP;
}
async function callApi(method, url, data = null, filename) {
    try {
        const licenseConfig = (0, license_1.getLicenseConfig)();
        const requestData = data ? JSON.stringify(data) : null;
        const headers = {
            "Content-Type": "application/json",
            "X-License-Secret": licenseConfig.licenseSecret,
            "X-Site-URL": process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000",
            "X-Client-IP": (await getPublicIp()) || "127.0.0.1",
        };
        // Add Content-Length header for POST requests
        if (requestData) {
            headers["Content-Length"] = Buffer.byteLength(requestData).toString();
        }
        // Parse the URL to get components
        const parsedUrl = new URL(url);
        const isHttps = parsedUrl.protocol === "https:";
        const httpModule = isHttps ? https_1.default : http_1.default;
        const requestOptions = {
            hostname: parsedUrl.hostname,
            port: parsedUrl.port || (isHttps ? 443 : 80),
            path: parsedUrl.pathname + parsedUrl.search,
            method: method,
            headers: headers,
        };
        // Debug logging for API calls
        console_1.logger.info("LICENSE_API", `${method} ${url}`);
        const response = await new Promise((resolve, reject) => {
            const req = httpModule.request(requestOptions, (res) => {
                const data = [];
                const contentType = res.headers["content-type"] || "";
                const isZipResponse = contentType.includes("application/zip") || contentType.includes("application/octet-stream");
                // Detailed logging for debugging download issues
                console_1.logger.info("LICENSE_API", `Response status: ${res.statusCode}, Content-Type: ${contentType}, isZip: ${isZipResponse}`);
                // Check status code first - handle errors even for zip content-type
                if (res.statusCode !== 200) {
                    // For non-200, read the body to get error details
                    res.on("data", (chunk) => {
                        data.push(chunk);
                    });
                    res.on("end", () => {
                        let errorMessage = `HTTP ${res.statusCode}`;
                        try {
                            const result = JSON.parse(Buffer.concat(data).toString());
                            errorMessage = result.message || result.error || result.reason || JSON.stringify(result);
                        }
                        catch (_a) {
                            errorMessage = Buffer.concat(data).toString().slice(0, 200) || errorMessage;
                        }
                        reject(new Error(`API Error (${res.statusCode}): ${errorMessage}`));
                    });
                    return;
                }
                if (isZipResponse) {
                    if (!filename) {
                        reject(adminError("Filename required for zip download."));
                        return;
                    }
                    const dirPath = `${rootPath}/updates`;
                    const filePath = `${dirPath}/${filename}.zip`;
                    // Ensure the directory exists
                    fs_1.promises.mkdir(dirPath, { recursive: true })
                        .then(() => {
                        const fileStream = (0, fs_2.createWriteStream)(filePath);
                        res.pipe(fileStream);
                        fileStream.on("finish", () => {
                            console_1.logger.info("LICENSE_API", `ZIP file downloaded successfully to: ${filePath}`);
                            resolve({
                                status: true,
                                message: "Update file downloaded successfully",
                                path: filePath,
                            });
                        });
                        fileStream.on("error", (err) => {
                            reject(adminError("Download error.", err));
                        });
                    })
                        .catch((err) => {
                        reject(adminError("Directory error.", err));
                    });
                }
                else {
                    // JSON response - status code already verified as 200 above
                    res.on("data", (chunk) => {
                        data.push(chunk);
                    });
                    res.on("end", () => {
                        try {
                            const responseText = Buffer.concat(data).toString();
                            console_1.logger.info("LICENSE_API", `JSON response (first 500 chars): ${responseText.slice(0, 500)}`);
                            const result = JSON.parse(responseText);
                            resolve(result);
                        }
                        catch (e) {
                            reject(new Error(`Invalid JSON response from server: ${Buffer.concat(data).toString().slice(0, 200)}`));
                        }
                    });
                }
                res.on("error", (err) => {
                    reject(new Error(`Response error: ${err.message}`));
                });
            });
            req.on("error", (err) => {
                reject(new Error(`Connection error: ${err.message}. Is the license server running at ${url}?`));
            });
            if (requestData) {
                req.write(requestData);
            }
            req.end();
        });
        return response;
    }
    catch (error) {
        // Log the detailed error for debugging
        console_1.logger.error("LICENSE_API", `API call failed: ${error.message}`);
        // Pass through the detailed error message instead of wrapping it
        throw error;
    }
}
async function verifyLicense(productId, license, client, timeBasedCheck) {
    const licenseFilePath = `${licFolderPath}/${productId}.lic`;
    // Time-based cache check
    if (timeBasedCheck && verificationPeriodDays > 0) {
        const today = new Date();
        if (nextVerificationDate && today < nextVerificationDate) {
            return { status: true, message: "Verified from cache" };
        }
    }
    let purchaseCode = null;
    try {
        // Check if a license file exists and read the purchase code from it
        const licenseFileContent = await fs_1.promises.readFile(licenseFilePath, "utf8");
        try {
            const licenseData = JSON.parse(Buffer.from(licenseFileContent, "base64").toString("utf8"));
            // Try purchaseCode first, then fall back to licenseKey for backwards compatibility
            purchaseCode = licenseData.purchaseCode || licenseData.licenseKey || licenseData.license_key;
        }
        catch (_a) {
            // If not base64 JSON, treat as plain purchase code
            purchaseCode = licenseFileContent.trim();
        }
    }
    catch (err) {
        // File does not exist, use provided license
        purchaseCode = license || null;
    }
    if (!purchaseCode) {
        throw (0, error_1.createError)({ statusCode: 400, message: "No purchase code found. Please activate your license first." });
    }
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";
    // Extract just the domain from the URL (without protocol)
    let domain;
    try {
        const url = new URL(siteUrl);
        domain = url.host; // e.g., "localhost:3000" or "example.com"
    }
    catch (_b) {
        domain = siteUrl.replace(/^https?:\/\//, "").split("/")[0];
    }
    // Get hardware fingerprint for verification
    const { getCachedFingerprint } = await Promise.resolve().then(() => __importStar(require("@b/utils/security/fingerprint")));
    const fingerprint = getCachedFingerprint();
    // API format using purchaseCode with fingerprint for security
    const data = {
        purchaseCode: purchaseCode,
        domain: domain,
        fingerprint: fingerprint,
    };
    const licenseConfig = (0, license_1.getLicenseConfig)();
    // Log verification request for debugging
    console_1.logger.info("LICENSE_API", `Verifying license - Domain: ${domain}, Fingerprint: ${fingerprint ? fingerprint.substring(0, 16) + '...' : 'MISSING'}`);
    console_1.logger.debug("LICENSE_API", `Verify payload: ${JSON.stringify(data)}`);
    const response = await callApi("POST", `${licenseConfig.apiUrl}/api/client/licenses/verify`, data);
    if (timeBasedCheck && verificationPeriodDays > 0 && response.status) {
        const today = new Date();
        nextVerificationDate = new Date();
        nextVerificationDate.setDate(today.getDate() + verificationPeriodDays);
    }
    if (!response.status) {
        const reason = response.reason || "License verification failed";
        throw (0, error_1.createError)({ statusCode: 400, message: reason });
    }
    return response;
}
async function activateLicense(productId, purchaseCode, client, notificationEmail) {
    var _a;
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";
    // Extract just the domain from the URL (without protocol)
    let domain;
    try {
        const url = new URL(siteUrl);
        domain = url.host; // e.g., "localhost:3000" or "example.com"
    }
    catch (_b) {
        // If URL parsing fails, try to extract domain manually
        domain = siteUrl.replace(/^https?:\/\//, "").split("/")[0];
    }
    const ipAddress = await getPublicIp() || "127.0.0.1";
    // Get the pre-computed hardware fingerprint (same one used for verification)
    const { getCachedFingerprint } = await Promise.resolve().then(() => __importStar(require("@b/utils/security/fingerprint")));
    const hardwareFingerprint = getCachedFingerprint();
    // API format using purchaseCode
    // Send hardwareFingerprint directly instead of hardware object
    // This ensures the same fingerprint is used for activation and verification
    const data = {
        purchaseCode: purchaseCode,
        domain: domain,
        ipAddress: ipAddress,
        hardwareFingerprint: hardwareFingerprint,
        metadata: {
            productId: productId,
            clientName: client,
            activatedVia: "admin-panel",
        },
    };
    // Include notification email if provided
    if (notificationEmail) {
        data.notificationEmail = notificationEmail;
    }
    const licenseConfig = (0, license_1.getLicenseConfig)();
    // Log the activation request for debugging
    console_1.logger.info("LICENSE_API", `Activating license - Domain: ${domain}, ProductId: ${productId}`);
    console_1.logger.debug("LICENSE_API", `Activation payload: ${JSON.stringify(data)}`);
    const response = await callApi("POST", `${licenseConfig.apiUrl}/api/client/licenses/activate`, data);
    if (!response.status) {
        const reason = response.reason || response.message || "License activation failed";
        throw (0, error_1.createError)({ statusCode: 400, message: reason });
    }
    // If activation is successful, save the purchase code to a file
    const licenseFilePath = `${licFolderPath}/${productId}.lic`;
    // Get license details from response
    const responseData = response;
    // Create license file content with the purchase code and metadata
    const licenseData = {
        purchaseCode: purchaseCode,
        productId: productId,
        clientName: client,
        domain: domain,
        activatedAt: new Date().toISOString(),
        ...(((_a = responseData.data) === null || _a === void 0 ? void 0 : _a.license) || responseData.license || responseData.data || {}),
    };
    const licFileContent = Buffer.from(JSON.stringify(licenseData)).toString("base64");
    // Ensure the lic directory exists
    await fs_1.promises.mkdir(licFolderPath, { recursive: true });
    // Save the license to a file in the lic directory
    await fs_1.promises.writeFile(licenseFilePath, licFileContent);
    return {
        status: true,
        message: response.message || "License activated successfully",
        data: response.data,
    };
}
async function checkLatestVersion(productId) {
    // The Envato Product Management system doesn't have a dedicated latest-version endpoint
    // Updates are managed through the admin panel and downloaded via /api/client/updates/download
    // Return graceful fallback - version info comes from license verification
    return {
        status: false,
        message: "Version check not available via this endpoint",
        version: null,
    };
}
async function checkUpdate(productId, currentVersion) {
    const licenseConfig = (0, license_1.getLicenseConfig)();
    const licenseFilePath = `${licFolderPath}/${productId}.lic`;
    // First, read the purchase code from the license file
    let purchaseCode = null;
    try {
        const licenseFileContent = await fs_1.promises.readFile(licenseFilePath, "utf8");
        try {
            const licenseData = JSON.parse(Buffer.from(licenseFileContent, "base64").toString("utf8"));
            purchaseCode = licenseData.purchaseCode || licenseData.licenseKey;
        }
        catch (_a) {
            purchaseCode = licenseFileContent.trim();
        }
    }
    catch (_b) {
        // No license file - can't check for updates
        return {
            status: false,
            message: "License required to check for updates",
            updateAvailable: false,
            update_id: "",
            version: currentVersion,
            changelog: null,
        };
    }
    if (!purchaseCode) {
        return {
            status: false,
            message: "No purchase code found",
            updateAvailable: false,
            update_id: "",
            version: currentVersion,
            changelog: null,
        };
    }
    // Get hardware fingerprint for verification
    const { getCachedFingerprint } = await Promise.resolve().then(() => __importStar(require("@b/utils/security/fingerprint")));
    const fingerprint = getCachedFingerprint();
    // Use the verify endpoint to check license status and get product info
    // The Envato system uses license verification to provide update info
    const payload = {
        purchaseCode: purchaseCode,
        productId: productId,
        currentVersion: currentVersion,
        fingerprint: fingerprint,
    };
    try {
        const response = await callApi("POST", `${licenseConfig.apiUrl}/api/client/updates/check`, payload);
        // Map response to expected format
        if (response.status && response.data) {
            return {
                status: response.data.updateAvailable || false,
                message: response.data.updateAvailable
                    ? `Update available: ${response.data.latestVersion}`
                    : `You have the latest version of the product.`,
                updateAvailable: response.data.updateAvailable || false,
                update_id: response.data.updateId || "",
                version: response.data.latestVersion || currentVersion,
                changelog: response.data.changelog || null,
            };
        }
        return {
            status: false,
            message: `You have the latest version of the product.`,
            updateAvailable: false,
            update_id: "",
            version: currentVersion,
            changelog: null,
        };
    }
    catch (error) {
        // If endpoint doesn't exist or any error, gracefully indicate no updates
        console_1.logger.warn("ADMIN", `Update check failed for product ${productId}: ${error.message}`);
        return {
            status: false,
            message: `You have the latest version of the product.`,
            updateAvailable: false,
            update_id: "",
            version: currentVersion,
            changelog: null,
        };
    }
}
async function downloadUpdate(productId, updateId, version, product, type) {
    if (!productId || !updateId || !version || !product) {
        throw adminError();
    }
    const licenseFilePath = `${licFolderPath}/${productId}.lic`;
    let licenseFile;
    try {
        licenseFile = await fs_1.promises.readFile(licenseFilePath, "utf8");
    }
    catch (e) {
        throw adminError();
    }
    // Parse the license file to get the purchase code
    let purchaseCode;
    try {
        const licenseData = JSON.parse(Buffer.from(licenseFile, "base64").toString("utf8"));
        purchaseCode = licenseData.purchaseCode || licenseData.licenseKey;
    }
    catch (_a) {
        purchaseCode = licenseFile.trim();
    }
    // Get hardware fingerprint for verification
    const { getCachedFingerprint } = await Promise.resolve().then(() => __importStar(require("@b/utils/security/fingerprint")));
    const fingerprint = getCachedFingerprint();
    // Call API to download update using the correct Envato endpoint
    const licenseConfig = (0, license_1.getLicenseConfig)();
    const downloadPayload = {
        purchaseCode,
        productId,
        updateId: updateId || undefined,
        version: version || undefined,
        fingerprint: fingerprint,
    };
    console_1.logger.info("LICENSE_API", `Downloading update: product=${product}, version=${version}, updateId=${updateId}`);
    const response = await callApi("POST", `${licenseConfig.apiUrl}/api/client/updates/download`, downloadPayload, `${product}-${version}`);
    console_1.logger.info("LICENSE_API", `Download response: status=${response.status}, path=${response.path}, message=${response.message}`);
    if (!response.status || !response.path) {
        console_1.logger.error("LICENSE_API", `Download failed - response: ${JSON.stringify(response)}`);
        throw adminError("Update download failed.");
    }
    try {
        console_1.logger.info("UPDATE", `Extracting update to: ${rootPath}`);
        const extractResult = unzip(response.path, rootPath);
        if (!extractResult.success) {
            console_1.logger.error("UPDATE", `Extraction failed: ${extractResult.message}`);
            // Clean up ZIP file even on failure
            try {
                await fs_1.promises.unlink(response.path);
                console_1.logger.info("UPDATE", "ZIP file cleaned up after failed extraction");
            }
            catch (cleanupError) {
                // Ignore cleanup errors
            }
            throw adminError(`Update extraction failed: ${extractResult.message}`);
        }
        console_1.logger.info("UPDATE", `Extraction successful: ${extractResult.extractedFiles.length} files updated`);
        if (type === "extension") {
            try {
                await (0, system_1.updateExtensionQuery)(productId, version);
                console_1.logger.info("UPDATE", `Extension ${productId} version updated to ${version}`);
            }
            catch (error) {
                throw adminError("Extension update failed.", error);
            }
        }
        else if (type === "blockchain") {
            try {
                await (0, system_1.updateBlockchainQuery)(productId, version);
                console_1.logger.info("UPDATE", `Blockchain ${productId} version updated to ${version}`);
            }
            catch (error) {
                throw adminError("Blockchain update failed.", error);
            }
        }
        else if (type === "exchange") {
            try {
                await (0, system_1.updateExchangeQuery)(productId, version);
                console_1.logger.info("UPDATE", `Exchange ${productId} version updated to ${version}`);
            }
            catch (error) {
                throw adminError("Exchange update failed.", error);
            }
        }
        // Remove the zip file after successful extraction
        await fs_1.promises.unlink(response.path);
        console_1.logger.info("UPDATE", "ZIP file cleaned up successfully");
        return {
            message: `Update downloaded and extracted successfully. ${extractResult.extractedFiles.length} files updated.`,
            status: true,
            data: {
                filesUpdated: extractResult.extractedFiles.length,
                version: version,
            },
        };
    }
    catch (error) {
        // Log the error details
        console_1.logger.error("UPDATE", `Update extraction failed: ${error.message}`);
        // If the error is already from adminError, rethrow it
        if (error.message && !error.message.includes("Update extraction failed")) {
            throw adminError(`Update extraction failed: ${error.message}`, error);
        }
        throw error;
    }
}
async function fetchAllProductsUpdates() {
    const licenseConfig = (0, license_1.getLicenseConfig)();
    // First, we need to get the main product's purchase code
    const mainProductId = licenseConfig.mainProductId;
    const licenseFilePath = `${licFolderPath}/${mainProductId}.lic`;
    let purchaseCode = null;
    try {
        const licenseFileContent = await fs_1.promises.readFile(licenseFilePath, "utf8");
        try {
            const licenseData = JSON.parse(Buffer.from(licenseFileContent, "base64").toString("utf8"));
            purchaseCode = licenseData.purchaseCode || licenseData.licenseKey;
        }
        catch (_a) {
            purchaseCode = licenseFileContent.trim();
        }
    }
    catch (_b) {
        // No main license file - can't check for batch updates
        console_1.logger.warn("ADMIN", "No main product license found for batch update check");
        return { status: true, message: "No license for batch check", products: [] };
    }
    if (!purchaseCode) {
        return { status: true, message: "No purchase code found", products: [] };
    }
    // Gather all products with their versions from the database
    try {
        const [extensions, blockchains, exchanges] = await Promise.all([
            db_1.models.extension.findAll({ attributes: ["productId", "version"] }),
            db_1.models.ecosystemBlockchain ? db_1.models.ecosystemBlockchain.findAll({ attributes: ["productId", "version"] }) : Promise.resolve([]),
            db_1.models.exchange.findAll({ attributes: ["productId", "version"] }),
        ]);
        // Build the products array for batch check
        const products = [];
        // Add main product
        const mainProduct = await getProduct();
        products.push({
            productId: mainProductId,
            currentVersion: mainProduct.version || "5.0.0",
        });
        // Add extensions
        for (const ext of extensions) {
            if (ext.productId) {
                products.push({
                    productId: ext.productId,
                    currentVersion: ext.version || "0.0.1",
                });
            }
        }
        // Add blockchains
        for (const bc of blockchains) {
            if (bc.productId) {
                products.push({
                    productId: bc.productId,
                    currentVersion: bc.version || "0.0.1",
                });
            }
        }
        // Add exchanges
        for (const ex of exchanges) {
            if (ex.productId) {
                products.push({
                    productId: ex.productId,
                    currentVersion: ex.version || "0.0.1",
                });
            }
        }
        // Call the batch endpoint
        const payload = {
            purchaseCode,
            products,
        };
        const response = await callApi("POST", `${licenseConfig.apiUrl}/api/client/updates/batch`, payload);
        if (response.status && response.products) {
            // Sync database versions for products where we sent 0.0.1 but license shows same version
            // This handles cases where addon files were updated manually but DB wasn't synced
            for (const product of response.products) {
                const productId = product.product_id || product.productId;
                const currentVersion = product.current_version || product.currentVersion;
                const latestVersion = product.latest_version || product.latestVersion;
                const updateAvailable = product.update_available || product.updateAvailable;
                // If we sent 0.0.1 and license server says update available,
                // but we have a license file, the files are likely already updated
                // Check if we have the license file - if so, assume files are at latest version
                if (currentVersion === "0.0.1" && latestVersion && updateAvailable) {
                    const licFileExists = await fs_1.promises.access(`${licFolderPath}/${productId}.lic`).then(() => true).catch(() => false);
                    if (licFileExists) {
                        // Update database to match latest version since license exists (addon is installed)
                        // Find which table this product belongs to
                        const blockchain = blockchains.find((bc) => bc.productId === productId);
                        if (blockchain) {
                            await db_1.models.ecosystemBlockchain.update({ version: latestVersion }, { where: { productId } });
                            // Update the response to reflect corrected version
                            product.current_version = latestVersion;
                            product.currentVersion = latestVersion;
                            product.update_available = false;
                            product.updateAvailable = false;
                            product.summary = "You have the latest version";
                            console_1.logger.info("ADMIN", `Synced blockchain ${productId} version to ${latestVersion}`);
                        }
                        const extension = extensions.find((ext) => ext.productId === productId);
                        if (extension) {
                            await db_1.models.extension.update({ version: latestVersion }, { where: { productId } });
                            product.current_version = latestVersion;
                            product.currentVersion = latestVersion;
                            product.update_available = false;
                            product.updateAvailable = false;
                            product.summary = "You have the latest version";
                            console_1.logger.info("ADMIN", `Synced extension ${productId} version to ${latestVersion}`);
                        }
                        const exchange = exchanges.find((ex) => ex.productId === productId);
                        if (exchange) {
                            await db_1.models.exchange.update({ version: latestVersion }, { where: { productId } });
                            product.current_version = latestVersion;
                            product.currentVersion = latestVersion;
                            product.update_available = false;
                            product.updateAvailable = false;
                            product.summary = "You have the latest version";
                            console_1.logger.info("ADMIN", `Synced exchange ${productId} version to ${latestVersion}`);
                        }
                    }
                }
            }
            return {
                status: true,
                message: "Batch update check completed",
                products: response.products,
            };
        }
        return { status: true, message: "No updates available", products: [] };
    }
    catch (error) {
        console_1.logger.warn("ADMIN", `Batch update check failed: ${error.message}`);
        // Don't cache errors - allow retry on next request
        return { status: true, message: "Batch check unavailable", products: [] };
    }
}
const unzip = (filePath, outPath) => {
    const zip = new adm_zip_1.default(filePath);
    const zipEntries = zip.getEntries();
    const extractedFiles = [];
    const failedFiles = [];
    console_1.logger.info("UPDATE", `Starting extraction of ${zipEntries.length} entries from ${path_1.default.basename(filePath)} to ${outPath}`);
    // Filter out directories, only count files
    const fileEntries = zipEntries.filter(entry => !entry.isDirectory);
    if (fileEntries.length === 0) {
        console_1.logger.warn("UPDATE", "ZIP file contains no extractable files");
        return {
            success: false,
            extractedFiles: [],
            failedFiles: [],
            totalFiles: 0,
            message: "ZIP file contains no extractable files",
        };
    }
    // Extract each file individually with error handling
    for (const entry of zipEntries) {
        try {
            const entryName = entry.entryName;
            // Skip directories - they'll be created automatically
            if (entry.isDirectory) {
                continue;
            }
            // Determine the target path
            const targetPath = path_1.default.join(outPath, entryName);
            const targetDir = path_1.default.dirname(targetPath);
            // Ensure target directory exists
            try {
                if (!require("fs").existsSync(targetDir)) {
                    require("fs").mkdirSync(targetDir, { recursive: true });
                }
            }
            catch (mkdirError) {
                console_1.logger.warn("UPDATE", `Failed to create directory ${targetDir}: ${mkdirError.message}`);
                failedFiles.push(entryName);
                continue;
            }
            // Extract the file
            try {
                zip.extractEntryTo(entry, outPath, true, true);
                extractedFiles.push(entryName);
                // Log every 50 files to show progress
                if (extractedFiles.length % 50 === 0) {
                    console_1.logger.info("UPDATE", `Extracted ${extractedFiles.length}/${fileEntries.length} files...`);
                }
            }
            catch (extractError) {
                console_1.logger.warn("UPDATE", `Failed to extract ${entryName}: ${extractError.message}`);
                failedFiles.push(entryName);
            }
        }
        catch (entryError) {
            console_1.logger.error("UPDATE", `Error processing entry: ${entryError.message}`);
            failedFiles.push(entry.entryName);
        }
    }
    const success = failedFiles.length === 0 && extractedFiles.length > 0;
    console_1.logger.info("UPDATE", `Extraction complete: ${extractedFiles.length} files extracted, ${failedFiles.length} failed`);
    if (failedFiles.length > 0) {
        console_1.logger.warn("UPDATE", `Failed files: ${failedFiles.slice(0, 10).join(", ")}${failedFiles.length > 10 ? ` ... and ${failedFiles.length - 10} more` : ""}`);
    }
    // Log some sample extracted files for verification
    if (extractedFiles.length > 0) {
        const sampleFiles = extractedFiles.slice(0, 5);
        console_1.logger.info("UPDATE", `Sample extracted files: ${sampleFiles.join(", ")}`);
    }
    return {
        success,
        extractedFiles,
        failedFiles,
        totalFiles: fileEntries.length,
        message: success
            ? `Successfully extracted ${extractedFiles.length} files`
            : `Extraction completed with ${failedFiles.length} errors`,
    };
};
