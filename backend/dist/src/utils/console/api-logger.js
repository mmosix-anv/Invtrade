"use strict";
/**
 * API Endpoint Logger with Context Inheritance
 *
 * This module provides a logging system for API endpoints that:
 * 1. Groups all logs from an endpoint operation together
 * 2. Allows utility functions to inherit the logging context from their caller
 * 3. Tracks operation progress with steps
 * 4. Provides clear success/failure indicators
 *
 * Usage in endpoints:
 *   import { withLogger, ApiContext } from "@b/utils/console";
 *
 *   export default async (data: Handler) => {
 *     return withLogger("DEPOSIT", "Stripe deposit verification", data, async (ctx) => {
 *       ctx.step("Retrieving Stripe session");
 *       const session = await stripe.checkout.sessions.retrieve(sessionId);
 *
 *       ctx.step("Validating payment status");
 *       if (session.payment_status !== "paid") {
 *         ctx.fail("Payment not completed");
 *         throw new Error("Payment not completed");
 *       }
 *
 *       ctx.step("Creating wallet if needed");
 *       const wallet = await getOrCreateWallet(userId, currency, ctx); // ctx passed to utility
 *
 *       ctx.step("Recording transaction");
 *       const transaction = await createTransaction(...);
 *
 *       ctx.step("Sending notification");
 *       await sendNotification(...);
 *
 *       return { transaction, balance: wallet.balance };
 *     });
 *   };
 *
 * Usage in utility functions (context inheritance):
 *   export async function getOrCreateWallet(userId: string, currency: string, ctx?: ApiContext) {
 *     ctx?.step("Checking existing wallet");
 *     let wallet = await models.wallet.findOne({ where: { userId, currency } });
 *
 *     if (!wallet) {
 *       ctx?.step("Creating new wallet");
 *       wallet = await models.wallet.create({ userId, currency, type: "FIAT" });
 *     }
 *
 *     return wallet;
 *   }
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.getApiContext = getApiContext;
exports.logStep = logStep;
exports.logSuccess = logSuccess;
exports.logFail = logFail;
exports.logWarn = logWarn;
exports.logDebug = logDebug;
exports.withLogger = withLogger;
exports.logged = logged;
exports.withSubOperation = withSubOperation;
const async_hooks_1 = require("async_hooks");
const logger_1 = require("./logger");
// Async local storage for context propagation
const asyncLocalStorage = new async_hooks_1.AsyncLocalStorage();
/**
 * Get the current API context from async local storage
 * Utility functions can call this to get the current logging context
 */
function getApiContext() {
    return asyncLocalStorage.getStore();
}
/**
 * Log a step in the current context (if any)
 * Safe to call even if no context exists
 */
function logStep(message, status) {
    const ctx = getApiContext();
    if (ctx) {
        ctx.step(message, status);
    }
}
/**
 * Log success in the current context
 */
function logSuccess(message) {
    const ctx = getApiContext();
    if (ctx) {
        ctx.success(message);
    }
}
/**
 * Log failure in the current context
 */
function logFail(message) {
    const ctx = getApiContext();
    if (ctx) {
        ctx.fail(message);
    }
}
/**
 * Log a warning in the current context
 */
function logWarn(message) {
    const ctx = getApiContext();
    if (ctx) {
        ctx.warn(message);
    }
}
/**
 * Log debug in the current context
 */
function logDebug(message) {
    const ctx = getApiContext();
    if (ctx) {
        ctx.debug(message);
    }
}
// Generate unique request ID
let requestCounter = 0;
function generateRequestId() {
    requestCounter = (requestCounter + 1) % 1000000;
    return `${Date.now().toString(36)}-${requestCounter.toString(36)}`;
}
/**
 * Create an API context for an operation with live animated logging
 */
function createApiContext(module, title, userId, options) {
    const requestId = generateRequestId();
    const steps = [];
    let status = "running";
    const startTime = Date.now();
    // Start a live animated task
    const liveHandle = logger_1.logger.live(module, title);
    // Set request metadata if provided
    if ((options === null || options === void 0 ? void 0 : options.method) && (options === null || options === void 0 ? void 0 : options.url)) {
        liveHandle.setRequest(options.method, options.url);
    }
    const ctx = {
        module,
        title,
        requestId,
        userId,
        _steps: steps,
        _status: status,
        _startTime: startTime,
        _liveHandle: liveHandle,
        step(message, stepStatus = "info") {
            steps.push({ message, status: stepStatus, time: Date.now() });
            // Also send to live console for real-time display
            liveHandle.step(message, stepStatus);
        },
        success(message) {
            if (message) {
                steps.push({ message, status: "success", time: Date.now() });
                liveHandle.step(message, "success");
            }
            status = "success";
            this._status = status;
        },
        fail(message) {
            steps.push({ message, status: "error", time: Date.now() });
            liveHandle.step(message, "error");
            status = "error";
            this._status = status;
        },
        warn(message) {
            steps.push({ message, status: "warn", time: Date.now() });
            liveHandle.step(message, "warn");
        },
        debug(message) {
            // Only add debug steps if LOG_LEVEL=debug
            if (process.env.LOG_LEVEL === "debug") {
                steps.push({ message, status: "info", time: Date.now() });
                liveHandle.step(message, "info");
            }
        },
    };
    return ctx;
}
/**
 * Complete the live task with final status
 */
function completeOperation(ctx) {
    if (!ctx._liveHandle)
        return;
    const duration = Date.now() - ctx._startTime;
    if (ctx._status === "success") {
        // Pass duration to succeed - it will handle formatting the last step appropriately
        ctx._liveHandle.succeed(`${duration}`);
    }
    else {
        // Don't add redundant "Failed" message - the error step already shows the reason
        ctx._liveHandle.fail(`${duration}`);
    }
}
/**
 * Wrap an endpoint handler with logging context
 *
 * @param module - Module name for logs (e.g., "DEPOSIT", "WITHDRAW", "EXCHANGE")
 * @param title - Operation title (e.g., "Stripe deposit verification")
 * @param data - Handler data containing user info
 * @param handler - The async handler function
 * @param options - Optional request info (method, url)
 * @returns The result of the handler
 *
 * @example
 * export default async (data: Handler) => {
 *   return withLogger("DEPOSIT", "Stripe deposit", data, async (ctx) => {
 *     ctx.step("Validating request");
 *     // ... operation logic
 *     return result;
 *   });
 * };
 */
async function withLogger(module, title, data, handler, options) {
    var _a;
    const ctx = createApiContext(module, title, (_a = data.user) === null || _a === void 0 ? void 0 : _a.id, options);
    try {
        const result = await asyncLocalStorage.run(ctx, async () => {
            return await handler(ctx);
        });
        // Auto-success if no explicit fail was called
        if (ctx._status === "running") {
            ctx._status = "success";
        }
        // Complete the live task
        completeOperation(ctx);
        return result;
    }
    catch (error) {
        // Mark as failed if not already
        if (ctx._status === "running") {
            ctx.fail(error instanceof Error ? error.message : String(error));
        }
        // Complete the live task
        completeOperation(ctx);
        // Re-throw the error
        throw error;
    }
}
/**
 * Decorator-style wrapper for simpler usage
 * Creates a logged version of any async function
 *
 * @example
 * const processDeposit = logged("DEPOSIT", "Process deposit", async (ctx, amount, currency) => {
 *   ctx.step("Validating amount");
 *   // ...
 *   return result;
 * });
 */
function logged(module, title, fn) {
    return async (...args) => {
        const ctx = createApiContext(module, title);
        try {
            const result = await asyncLocalStorage.run(ctx, async () => {
                return await fn(ctx, ...args);
            });
            if (ctx._status === "running") {
                ctx._status = "success";
            }
            completeOperation(ctx);
            return result;
        }
        catch (error) {
            if (ctx._status === "running") {
                ctx.fail(error instanceof Error ? error.message : String(error));
            }
            completeOperation(ctx);
            throw error;
        }
    };
}
/**
 * Run a sub-operation within the current context
 * Steps will be added to the parent context
 *
 * @example
 * // In a utility function
 * export async function sendEmail(userId: string, template: string) {
 *   return withSubOperation("Sending email", async () => {
 *     // ... email logic
 *   });
 * }
 */
async function withSubOperation(label, fn) {
    const ctx = getApiContext();
    if (ctx) {
        ctx.step(label);
    }
    try {
        const result = await fn();
        if (ctx) {
            ctx.step(`${label} completed`, "success");
        }
        return result;
    }
    catch (error) {
        if (ctx) {
            ctx.step(`${label} failed: ${error instanceof Error ? error.message : error}`, "error");
        }
        throw error;
    }
}
