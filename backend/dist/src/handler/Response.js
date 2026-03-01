"use strict";
// File: handler/Response.ts
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.Response = void 0;
const zlib_1 = __importDefault(require("zlib"));
const utils_1 = require("../utils");
const console_1 = require("@b/utils/console");
const isProd = process.env.NODE_ENV === "production";
/**
 * Builds a cookie header string from a name, value, and options.
 *
 * @param name - Cookie name.
 * @param value - Cookie value.
 * @param options - Additional cookie options.
 * @returns The formatted cookie header string.
 */
function buildCookieHeader(name, value, options) {
    var _a;
    let cookie = `${name}=${value};`;
    cookie += ` Path=${(_a = options === null || options === void 0 ? void 0 : options.path) !== null && _a !== void 0 ? _a : "/"};`;
    if (options === null || options === void 0 ? void 0 : options.httpOnly) {
        cookie += " HttpOnly;";
    }
    if (options === null || options === void 0 ? void 0 : options.secure) {
        cookie += " Secure;";
    }
    if (options === null || options === void 0 ? void 0 : options.sameSite) {
        cookie += ` SameSite=${options.sameSite};`;
    }
    if (options === null || options === void 0 ? void 0 : options.expires) {
        cookie += ` Expires=${options.expires};`;
    }
    return cookie;
}
// --------------------------------------------------------------------------
// Response Class
// --------------------------------------------------------------------------
class Response {
    constructor(res) {
        this.res = res;
        this.aborted = false;
        this.res.onAborted(() => {
            this.aborted = true;
        });
    }
    isAborted() {
        return this.aborted;
    }
    handleError(code, message) {
        if (this.aborted) {
            return;
        }
        const errorMsg = typeof message === "string" ? message : String(message);
        this.res.cork(() => {
            this.res
                .writeStatus(`${code} ${(0, utils_1.getStatusMessage)(code)}`)
                .writeHeader("Content-Type", "application/json")
                .writeHeader("Content-Encoding", "identity")
                .writeHeader("Cache-Control", "no-cache, no-store, must-revalidate")
                .writeHeader("Pragma", "no-cache")
                .writeHeader("Expires", "0")
                .end(JSON.stringify({ message: errorMsg, statusCode: code }));
        });
    }
    /**
     * Handles license-related errors with structured data for frontend handling.
     * Used for extension, blockchain, and exchange license errors.
     */
    handleLicenseError(code, licenseData) {
        if (this.aborted) {
            return;
        }
        this.res.cork(() => {
            this.res
                .writeStatus(`${code} ${(0, utils_1.getStatusMessage)(code)}`)
                .writeHeader("Content-Type", "application/json")
                .writeHeader("Content-Encoding", "identity")
                .writeHeader("Cache-Control", "no-cache, no-store, must-revalidate")
                .writeHeader("Pragma", "no-cache")
                .writeHeader("Expires", "0")
                .end(JSON.stringify({
                message: licenseData.message,
                statusCode: code,
                licenseRequired: true,
                productId: licenseData.productId,
                productType: licenseData.type,
                productName: licenseData.extension || licenseData.blockchain || null,
            }));
        });
    }
    pause() {
        this.res.pause();
    }
    resume() {
        this.res.resume();
    }
    writeStatus(status) {
        return this.res.writeStatus(status);
    }
    writeHeader(key, value) {
        return this.res.writeHeader(key, value);
    }
    write(chunk) {
        return this.res.write(chunk);
    }
    endWithoutBody(reportedContentLength, closeConnection) {
        this.res.endWithoutBody(reportedContentLength, closeConnection);
    }
    tryEnd(fullBodyOrChunk, totalSize) {
        const [result] = this.res.tryEnd(fullBodyOrChunk, totalSize);
        return result;
    }
    close() {
        this.res.close();
    }
    getWriteOffset() {
        return this.res.getWriteOffset();
    }
    onWritable(handler) {
        this.res.onWritable(handler);
    }
    onAborted(handler) {
        this.res.onAborted(handler);
    }
    onData(handler) {
        this.res.onData(handler);
    }
    getRemoteAddress() {
        return this.res.getRemoteAddress();
    }
    getRemoteAddressAsText() {
        const addrBuffer = this.res.getRemoteAddressAsText();
        return new TextDecoder().decode(addrBuffer);
    }
    getProxiedRemoteAddress() {
        return this.res.getProxiedRemoteAddress();
    }
    getProxiedRemoteAddressAsText() {
        const addrBuffer = this.res.getProxiedRemoteAddressAsText();
        return new TextDecoder().decode(addrBuffer);
    }
    cork(cb) {
        this.res.cork(cb);
    }
    status(statusCode) {
        const message = (0, utils_1.getStatusMessage)(statusCode);
        this.writeStatus(`${statusCode} ${message}`);
        return this;
    }
    upgrade(userData, secWebSocketKey, secWebSocketProtocol, secWebSocketExtensions, context) {
        this.res.upgrade(userData, secWebSocketKey, secWebSocketProtocol, secWebSocketExtensions, context);
    }
    end(body, closeConnection) {
        this.res.end(body, closeConnection);
    }
    json(data) {
        this.res
            .writeHeader("Content-Type", "application/json")
            .end(JSON.stringify(data));
    }
    pipe(stream) {
        this.res.pipe(stream);
    }
    // ------------------------------------------------------------------------
    // Cookie Management
    // ------------------------------------------------------------------------
    setSecureCookie(name, value, options) {
        const cookieValue = buildCookieHeader(name, value, {
            path: "/",
            httpOnly: options.httpOnly,
            secure: options.secure,
            sameSite: options.sameSite,
        });
        this.writeHeader("Set-Cookie", cookieValue);
    }
    setSecureCookies({ accessToken, csrfToken, sessionId, }, request) {
        const secure = isProd;
        this.setSecureCookie("accessToken", accessToken, {
            httpOnly: true,
            secure,
            sameSite: "None",
        });
        this.setSecureCookie("csrfToken", csrfToken, {
            httpOnly: false,
            secure,
            sameSite: "Strict",
        });
        this.setSecureCookie("sessionId", sessionId, {
            httpOnly: true,
            secure,
            sameSite: "None",
        });
        this.applyUpdatedCookies(request);
    }
    applyUpdatedCookies(request) {
        const cookiesToUpdate = ["accessToken", "csrfToken", "sessionId"];
        cookiesToUpdate.forEach((cookieName) => {
            if (request.updatedCookies[cookieName]) {
                const { value } = request.updatedCookies[cookieName];
                if (request.headers.platform === "app") {
                    this.writeHeader(cookieName, value);
                    return;
                }
                const expiration = (0, utils_1.getCommonExpiration)(cookieName) || null;
                const cookieValue = buildCookieHeader(cookieName, value, {
                    path: "/",
                    httpOnly: true,
                    secure: process.env.NODE_ENV === "production",
                    sameSite: process.env.NODE_ENV === "production" ? "None" : "Lax",
                    expires: expiration || undefined,
                });
                this.writeHeader("Set-Cookie", cookieValue);
            }
        });
    }
    writeCommonHeaders() {
        const headers = {
            "X-Content-Type-Options": "nosniff",
            "X-Frame-Options": "DENY",
            "X-XSS-Protection": "1; mode=block",
            "Referrer-Policy": "strict-origin-when-cross-origin",
            "Strict-Transport-Security": "max-age=31536000; includeSubDomains; preload",
        };
        Object.entries(headers).forEach(([key, value]) => {
            this.res.writeHeader(key, value);
        });
    }
    deleteSecureCookies() {
        ["accessToken", "csrfToken", "sessionId"].forEach((cookieName) => {
            this.writeHeader("Set-Cookie", `${cookieName}=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT;`);
        });
    }
    // ------------------------------------------------------------------------
    // Sending Response
    // ------------------------------------------------------------------------
    async sendResponse(req, statusCode, responseData, responseType) {
        if (this.aborted) {
            return;
        }
        try {
            // Handle binary responses (file downloads)
            if (responseType === "binary" && (responseData === null || responseData === void 0 ? void 0 : responseData.data) && (responseData === null || responseData === void 0 ? void 0 : responseData.headers)) {
                this.res.cork(() => {
                    this.res.writeStatus(`${statusCode} ${(0, utils_1.getStatusMessage)(Number(statusCode))}`);
                    // Write custom headers
                    Object.entries(responseData.headers).forEach(([key, value]) => {
                        this.res.writeHeader(key, String(value));
                    });
                    // Send raw binary data
                    this.res.end(responseData.data);
                });
                return;
            }
            this.res.cork(() => {
                const response = this.compressResponse(req, responseData);
                this.handleCookiesInResponse(req, Number(statusCode), responseData);
                this.writeCommonHeaders();
                this.res.writeStatus(`${statusCode} ${(0, utils_1.getStatusMessage)(Number(statusCode))}`);
                this.res.writeHeader("Content-Type", "application/json");
                this.res.end(response);
            });
        }
        catch (error) {
            console_1.logger.error("RESPONSE", "Error sending response", error);
            if (!this.aborted) {
                this.res.cork(() => {
                    this.res.writeStatus("500").end(error.message);
                });
            }
        }
    }
    handleCookiesInResponse(req, statusCode, responseData) {
        if ((responseData === null || responseData === void 0 ? void 0 : responseData.cookies) && [200, 201].includes(statusCode)) {
            Object.entries(responseData.cookies).forEach(([name, value]) => {
                req.updateCookie(name, value);
            });
            delete responseData.cookies;
        }
        if (req.url.startsWith("/api/auth")) {
            this.applyUpdatedCookies(req);
        }
    }
    /**
     * Compresses the response based on the client's Accept-Encoding header.
     * If the response is below a certain threshold, compression is skipped.
     *
     * @param req - The request object.
     * @param responseData - The data to send.
     * @returns A Buffer containing the (possibly compressed) response.
     */
    compressResponse(req, responseData) {
        const acceptEncoding = req.headers["accept-encoding"] || "";
        let rawData;
        try {
            rawData = Buffer.from(JSON.stringify(responseData !== null && responseData !== void 0 ? responseData : {}));
        }
        catch (_a) {
            rawData = Buffer.from(JSON.stringify({}));
        }
        const sizeThreshold = 1024;
        if (rawData.length < sizeThreshold) {
            this.res.writeHeader("Content-Encoding", "identity");
            return rawData;
        }
        let contentEncoding = "identity";
        try {
            if (acceptEncoding.includes("gzip")) {
                rawData = zlib_1.default.gzipSync(rawData);
                contentEncoding = "gzip";
            }
            else if (acceptEncoding.includes("br") &&
                typeof zlib_1.default.brotliCompressSync === "function") {
                rawData = zlib_1.default.brotliCompressSync(rawData);
                contentEncoding = "br";
            }
            else if (acceptEncoding.includes("deflate")) {
                rawData = zlib_1.default.deflateSync(rawData);
                contentEncoding = "deflate";
            }
        }
        catch (compressionError) {
            console_1.logger.warn("RESPONSE", "Compression error", compressionError);
            rawData = Buffer.from(JSON.stringify(responseData !== null && responseData !== void 0 ? responseData : {}));
            contentEncoding = "identity";
        }
        this.res.writeHeader("Content-Encoding", contentEncoding);
        return rawData;
    }
}
exports.Response = Response;
