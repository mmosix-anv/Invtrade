"use strict";
/**
 * Console Utilities
 *
 * Centralized logging system with:
 * - Colored console output with icons
 * - Buffered group logging (atomic output)
 * - Live animated tasks with spinners
 * - API endpoint logging with context inheritance
 *
 * Usage:
 *   import { logger, colors, icons, withLogger } from "@b/utils/console";
 *
 *   // Basic logging
 *   logger.info("MODULE", "Message");
 *   logger.error("MODULE", "Error", error);
 *
 *   // Grouped logging (atomic output)
 *   logger.group("MODULE", "Task title");
 *   logger.groupItem("MODULE", "Step 1");
 *   logger.groupEnd("MODULE", "Done", true);
 *
 *   // Live animated tasks
 *   const task = logger.live("MODULE", "Loading...");
 *   task.step("Step 1");
 *   task.succeed("Done!");
 *
 *   // API endpoint logging
 *   export default async (data: Handler) => {
 *     return withLogger("DEPOSIT", "Process deposit", data, async (ctx) => {
 *       ctx.step("Validating");
 *       // ...
 *       return result;
 *     });
 *   };
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = exports.logCtxDebug = exports.logCtxWarn = exports.logFail = exports.logCtxSuccess = exports.logStep = exports.getApiContext = exports.withSubOperation = exports.logged = exports.withLogger = exports.logDebug = exports.logError = exports.logWarn = exports.logSuccess = exports.logInfo = exports.console$ = exports.logger = exports.liveConsole = exports.logQueue = exports.box = exports.icons = exports.colors = void 0;
// Re-export everything from sub-modules
var colors_1 = require("./colors");
Object.defineProperty(exports, "colors", { enumerable: true, get: function () { return colors_1.colors; } });
Object.defineProperty(exports, "icons", { enumerable: true, get: function () { return colors_1.icons; } });
Object.defineProperty(exports, "box", { enumerable: true, get: function () { return colors_1.box; } });
var log_queue_1 = require("./log-queue");
Object.defineProperty(exports, "logQueue", { enumerable: true, get: function () { return log_queue_1.logQueue; } });
var live_console_1 = require("./live-console");
Object.defineProperty(exports, "liveConsole", { enumerable: true, get: function () { return live_console_1.liveConsole; } });
var logger_1 = require("./logger");
Object.defineProperty(exports, "logger", { enumerable: true, get: function () { return logger_1.logger; } });
Object.defineProperty(exports, "console$", { enumerable: true, get: function () { return logger_1.console$; } });
Object.defineProperty(exports, "logInfo", { enumerable: true, get: function () { return logger_1.logInfo; } });
Object.defineProperty(exports, "logSuccess", { enumerable: true, get: function () { return logger_1.logSuccess; } });
Object.defineProperty(exports, "logWarn", { enumerable: true, get: function () { return logger_1.logWarn; } });
Object.defineProperty(exports, "logError", { enumerable: true, get: function () { return logger_1.logError; } });
Object.defineProperty(exports, "logDebug", { enumerable: true, get: function () { return logger_1.logDebug; } });
var api_logger_1 = require("./api-logger");
Object.defineProperty(exports, "withLogger", { enumerable: true, get: function () { return api_logger_1.withLogger; } });
Object.defineProperty(exports, "logged", { enumerable: true, get: function () { return api_logger_1.logged; } });
Object.defineProperty(exports, "withSubOperation", { enumerable: true, get: function () { return api_logger_1.withSubOperation; } });
Object.defineProperty(exports, "getApiContext", { enumerable: true, get: function () { return api_logger_1.getApiContext; } });
Object.defineProperty(exports, "logStep", { enumerable: true, get: function () { return api_logger_1.logStep; } });
Object.defineProperty(exports, "logCtxSuccess", { enumerable: true, get: function () { return api_logger_1.logSuccess; } });
Object.defineProperty(exports, "logFail", { enumerable: true, get: function () { return api_logger_1.logFail; } });
Object.defineProperty(exports, "logCtxWarn", { enumerable: true, get: function () { return api_logger_1.logWarn; } });
Object.defineProperty(exports, "logCtxDebug", { enumerable: true, get: function () { return api_logger_1.logDebug; } });
// Default export is the logger
var logger_2 = require("./logger");
Object.defineProperty(exports, "default", { enumerable: true, get: function () { return logger_2.logger; } });
