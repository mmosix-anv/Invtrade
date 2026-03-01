"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.Request = void 0;
const uWebSockets_js_1 = require("uWebSockets.js");
const url_1 = __importDefault(require("url"));
const utils_1 = require("../utils");
const validation_1 = require("../utils/validation");
const error_1 = require("@b/utils/error");
const console_1 = require("@b/utils/console");
const ip_1 = __importDefault(require("ip"));
// Metadata type for operations
class Request {
    constructor(res, req) {
        this.res = res;
        this.req = req;
        this.keys = [];
        this.params = {};
        this.cookies = {};
        this.headers = {};
        this.user = null;
        this.connection = {
            encrypted: false,
            remoteAddress: "127.0.0.1",
        };
        this.updatedCookies = {};
        this.url = req.getUrl();
        this.method = req.getMethod();
        this.query = this.parseQuery();
        this.headers = this.parseHeaders();
        this.cookies = this.parseCookies();
        this.remoteAddress = this.computeRemoteAddress();
        // If metadata is already set (via setMetadata), validate parameters.
        if (this.metadata) {
            try {
                this.validateParameters();
            }
            catch (error) {
                console_1.logger.error("REQUEST", "Parameter validation failed", error);
                throw error;
            }
        }
    }
    /**
     * Parse request headers into a simple key-value object.
     */
    parseHeaders() {
        const headers = {};
        this.req.forEach((key, value) => {
            headers[key] = value;
        });
        return headers;
    }
    /**
     * Parses the Cookie header into an object.
     */
    parseCookies() {
        const cookiesHeader = this.headers["cookie"] || "";
        const cookies = {};
        cookiesHeader
            .split(";")
            .map((c) => c.trim())
            .forEach((cookie) => {
            const eqIndex = cookie.indexOf("=");
            if (eqIndex > -1) {
                const name = cookie.substring(0, eqIndex).trim();
                const val = cookie.substring(eqIndex + 1).trim();
                cookies[name] = val;
            }
        });
        return cookies;
    }
    /**
     * Parses the URL query string into an object.
     */
    parseQuery() {
        return url_1.default.parse(`?${this.req.getQuery()}`, true).query;
    }
    /**
     * Computes the remote address using uWebSockets.js utilities.
     */
    computeRemoteAddress() {
        const remoteAddressBuffer = this.res.getRemoteAddressAsText();
        const rawAddress = remoteAddressBuffer
            ? Buffer.from(remoteAddressBuffer).toString("utf-8")
            : "127.0.0.1";
        if (rawAddress === "::1" ||
            rawAddress === "0000:0000:0000:0000:0000:0000:0000:0001") {
            return "127.0.0.1";
        }
        return ip_1.default.isV6Format(rawAddress)
            ? ip_1.default.toString(ip_1.default.toBuffer(rawAddress))
            : rawAddress;
    }
    /**
     * Reads and processes the request body.
     * It parses only for methods that support a body.
     */
    async parseBody() {
        var _a, _b, _c;
        if (!["post", "put", "patch", "delete"].includes(this.method.toLowerCase())) {
            return;
        }
        const contentType = this.headers["content-type"] || "";
        try {
            const bodyContent = await this.readRequestBody();
            this.body = this.processBodyContent(contentType, bodyContent);
        }
        catch (error) {
            console_1.logger.error("REQUEST", "Error reading body content", error);
            throw (0, error_1.createError)({
                statusCode: 400,
                message: `Error reading request body: ${error.message}`,
            });
        }
        // Validate against schema if metadata is provided.
        // Skip validation for multipart/form-data or if skipBodyValidation is set
        if (((_a = this.metadata) === null || _a === void 0 ? void 0 : _a.requestBody) &&
            !((_b = this.metadata) === null || _b === void 0 ? void 0 : _b.skipBodyValidation) &&
            !contentType.includes("multipart/form-data")) {
            try {
                const mediaType = Object.keys(this.metadata.requestBody.content)[0];
                const schema = (_c = this.metadata.requestBody.content[mediaType]) === null || _c === void 0 ? void 0 : _c.schema;
                if (schema) {
                    this.body = (0, validation_1.validateSchema)(this.body, schema);
                }
            }
            catch (error) {
                console_1.logger.error("VALIDATION", "Schema validation failed", error);
                // Check if this is our custom validation error with user-friendly messages
                if (error.isValidationError) {
                    throw (0, error_1.createError)({
                        statusCode: 400,
                        message: error.message, // This is now user-friendly
                    });
                }
                else {
                    throw (0, error_1.createError)({
                        statusCode: 400,
                        message: `Schema validation error: ${error.message}`,
                    });
                }
            }
        }
    }
    /**
     * Reads the request body by accumulating incoming data chunks.
     */
    async readRequestBody() {
        const bodyData = [];
        return new Promise((resolve, reject) => {
            let hadData = false;
            this.res.onData((ab, isLast) => {
                hadData = true;
                const chunk = Buffer.from(ab).toString();
                bodyData.push(chunk);
                if (isLast) {
                    resolve(bodyData.join(""));
                }
            });
            this.res.onAborted(() => {
                if (!hadData) {
                    resolve("");
                }
                else {
                    reject(new Error("Request aborted"));
                }
            });
        });
    }
    /**
     * Processes the raw body string based on content-type.
     */
    processBodyContent(contentType, bodyContent) {
        const trimmedBody = bodyContent.trim();
        if (contentType.includes("application/json") && trimmedBody !== "") {
            try {
                return JSON.parse(trimmedBody);
            }
            catch (error) {
                throw (0, error_1.createError)({ statusCode: 400, message: `Invalid JSON: ${error.message}` });
            }
        }
        else if (contentType.includes("application/x-www-form-urlencoded")) {
            return Object.fromEntries(new URLSearchParams(trimmedBody));
        }
        return trimmedBody || {};
    }
    /**
     * Validates request parameters against the provided metadata.
     */
    validateParameters() {
        if (!this.metadata || !this.metadata.parameters)
            return;
        for (const parameter of this.metadata.parameters) {
            const value = this.getParameterValue(parameter);
            if (value === undefined && parameter.required) {
                throw (0, error_1.createError)({ statusCode: 400, message: `Missing required ${parameter.in} parameter: "${parameter.name}"` });
            }
            if (value !== undefined) {
                try {
                    this.updateParameterValue(parameter, (0, validation_1.validateSchema)(value, parameter.schema));
                }
                catch (error) {
                    // Check if this is our custom validation error with user-friendly messages
                    if (error.isValidationError) {
                        throw (0, error_1.createError)({ statusCode: 400, message: `Parameter "${parameter.name}": ${error.message}` });
                    }
                    else {
                        throw (0, error_1.createError)({ statusCode: 400, message: `Validation error for ${parameter.in} parameter "${parameter.name}": ${error.message}` });
                    }
                }
            }
        }
    }
    /**
     * Retrieves the parameter value based on its location.
     */
    getParameterValue(parameter) {
        switch (parameter.in) {
            case "query":
                return this.query[parameter.name];
            case "header":
                return this.headers[parameter.name];
            case "path":
                return this.params[parameter.name];
            case "cookie":
                return this.cookies[parameter.name];
            default:
                return undefined;
        }
    }
    /**
     * Updates the parameter value in the appropriate storage.
     */
    updateParameterValue(parameter, value) {
        switch (parameter.in) {
            case "query":
                this.query[parameter.name] = value;
                break;
            case "path":
                this.params[parameter.name] = value;
                break;
            case "cookie":
                this.cookies[parameter.name] = value;
                break;
        }
    }
    /**
     * Sets the regular expression parameters for dynamic routes.
     */
    _setRegexparam(keys, regExp) {
        this.keys = keys;
        this.regExp = regExp;
    }
    getHeader(lowerCaseKey) {
        return this.req.getHeader(lowerCaseKey);
    }
    getParameter(index) {
        return this.req.getParameter(index);
    }
    getUrl() {
        return this.req.getUrl();
    }
    getMethod() {
        return this.req.getMethod();
    }
    getCaseSensitiveMethod() {
        return this.req.getCaseSensitiveMethod();
    }
    getQuery() {
        return this.req.getQuery();
    }
    setYield(_yield) {
        this.req.setYield(_yield);
        return _yield;
    }
    /**
     * Extracts path parameters from the URL using the provided regular expression.
     */
    extractPathParameters() {
        if (!this.regExp)
            return;
        const matches = this.regExp.exec(this.url);
        if (!matches)
            return;
        this.keys.forEach((key, index) => {
            const value = matches[index + 1];
            if (value !== undefined) {
                this.params[key] = decodeURIComponent(value);
            }
        });
    }
    /**
     * Returns a promise that resolves with the raw body as a given type.
     */
    async rawBody() {
        return new Promise((resolve, reject) => {
            this.res.onData((data) => resolve((0, utils_1.handleArrayBuffer)(data)));
            this.res.onAborted(() => reject(null));
        });
    }
    /**
     * Parses multipart/form-data and returns the fields.
     */
    async file() {
        const header = this.req.getHeader("content-type");
        return new Promise((resolve, reject) => {
            let buffer = Buffer.from("");
            this.res.onData((ab, isLast) => {
                buffer = Buffer.concat([buffer, Buffer.from(ab)]);
                if (isLast) {
                    resolve((0, uWebSockets_js_1.getParts)(buffer, header));
                }
            });
            this.res.onAborted(() => reject(null));
        });
    }
    /**
     * Updates a cookie value to be sent later.
     */
    updateCookie(name, value, options = {}) {
        this.updatedCookies[name] = { value, options };
    }
    /**
     * Updates multiple tokens as cookies.
     */
    updateTokens(tokens) {
        Object.entries(tokens).forEach(([name, value]) => {
            this.updatedCookies[name] = { value };
        });
    }
    setMetadata(metadata) {
        this.metadata = metadata;
    }
    getMetadata() {
        return this.metadata;
    }
    setUser(user) {
        this.user = user;
    }
    getUser() {
        return this.user;
    }
}
exports.Request = Request;
