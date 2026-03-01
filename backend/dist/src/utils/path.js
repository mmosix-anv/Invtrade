"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.resolveUploadPath = resolveUploadPath;
exports.ensureDirectoryExists = ensureDirectoryExists;
exports.tryMultiplePaths = tryMultiplePaths;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const console_1 = require("@b/utils/console");
const error_1 = require("@b/utils/error");
/**
 * Resolves the correct path for file uploads in different environments
 * @param relativePath - The relative path from the public directory (e.g., "img/logo", "uploads")
 * @param fallbackPaths - Additional fallback paths to try
 * @returns The resolved absolute path
 */
function resolveUploadPath(relativePath, fallbackPaths = []) {
    const isProduction = process.env.NODE_ENV === 'production';
    // Standard path patterns
    const standardPaths = [
        // Production patterns
        path_1.default.join(process.cwd(), "frontend", "public", relativePath),
        path_1.default.join(process.cwd(), "public", relativePath),
        // Development patterns
        path_1.default.join(process.cwd(), "..", "frontend", "public", relativePath),
        path_1.default.join(process.cwd(), "..", "public", relativePath),
    ];
    // Combine standard paths with custom fallbacks
    const allPaths = [...standardPaths, ...fallbackPaths];
    // Find the first path where the parent directory exists
    for (const testPath of allPaths) {
        const parentDir = path_1.default.dirname(testPath);
        if (fs_1.default.existsSync(parentDir)) {
            console_1.logger.debug("PATH", `Selected: ${testPath}`);
            return testPath;
        }
    }
    // If no parent directory exists, return the first standard path
    const defaultPath = standardPaths[0];
    console_1.logger.debug("PATH", `No existing parent found, using default: ${defaultPath}`);
    return defaultPath;
}
/**
 * Ensures a directory exists, creating it if necessary
 * @param dirPath - The directory path to ensure exists
 * @param recursive - Whether to create parent directories
 */
async function ensureDirectoryExists(dirPath, recursive = true) {
    try {
        await fs_1.default.promises.access(dirPath);
        console_1.logger.debug("PATH", `Directory exists: ${dirPath}`);
    }
    catch (error) {
        if (error.code === "ENOENT") {
            try {
                console_1.logger.debug("PATH", `Creating directory: ${dirPath}`);
                await fs_1.default.promises.mkdir(dirPath, { recursive });
                console_1.logger.debug("PATH", `Directory created: ${dirPath}`);
            }
            catch (mkdirError) {
                console_1.logger.error("PATH", `Failed to create directory: ${dirPath}`, mkdirError);
                throw (0, error_1.createError)({ statusCode: 500, message: `Failed to create directory: ${mkdirError.message}` });
            }
        }
        else {
            console_1.logger.error("PATH", `Directory access error: ${dirPath}`, error);
            throw error;
        }
    }
}
/**
 * Tries multiple paths and returns the first one that can be created/accessed
 * @param paths - Array of paths to try
 * @returns The first successful path
 */
async function tryMultiplePaths(paths) {
    for (const testPath of paths) {
        try {
            await ensureDirectoryExists(testPath);
            return testPath;
        }
        catch (error) {
            console_1.logger.debug("PATH", `Failed to use path ${testPath}: ${error.message}`);
            continue;
        }
    }
    throw (0, error_1.createError)({ statusCode: 500, message: `Failed to create directory in any of the attempted paths: ${paths.join(", ")}` });
}
