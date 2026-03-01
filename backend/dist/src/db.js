"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.models = exports.sequelize = exports.db = exports.SequelizeSingleton = void 0;
const sequelize_1 = require("sequelize");
const init_1 = require("../models/init");
const worker_threads_1 = require("worker_threads");
const console_1 = require("@b/utils/console");
const error_1 = require("@b/utils/error");
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const crypto_1 = __importDefault(require("crypto"));
const SYNC_HASH_FILE = path_1.default.join(__dirname, "..", ".sync-hash");
class SequelizeSingleton {
    constructor() {
        if (!process.env.DB_NAME || !process.env.DB_USER || !process.env.DB_HOST) {
            throw (0, error_1.createError)({ statusCode: 500, message: 'Missing required database environment variables. Please check your .env file.' });
        }
        this.sequelize = new sequelize_1.Sequelize(process.env.DB_NAME, process.env.DB_USER, process.env.DB_PASSWORD || '', // Use empty string if undefined
        {
            host: process.env.DB_HOST,
            dialect: "postgres",
            port: Number(process.env.DB_PORT),
            logging: false,
            dialectOptions: {
                ssl: {
                    require: true,
                    rejectUnauthorized: false
                }
            },
            define: {
                timestamps: true,
                underscored: false,
            },
        });
        if (!this.sequelize) {
            throw (0, error_1.createError)({ statusCode: 500, message: "Failed to create Sequelize instance" });
        }
        this.models = this.initModels();
    }
    static getInstance() {
        if (!SequelizeSingleton.instance) {
            SequelizeSingleton.instance = new SequelizeSingleton();
        }
        return SequelizeSingleton.instance;
    }
    async initialize() {
        if (worker_threads_1.isMainThread) {
            await this.syncDatabase();
        }
    }
    getSequelize() {
        return this.sequelize;
    }
    initModels() {
        console.log("[DEBUG] initModels called");
        const models = (0, init_1.initModels)(this.sequelize);
        console.log("[DEBUG] initModels returned:", Object.keys(models).length, "models");
        console.log("[DEBUG] First 10 model names:", Object.keys(models).slice(0, 10));
        return models;
    }
    /**
     * Computes a hash of all model files to detect changes.
     * Walks through the models directory and creates a combined hash
     * of all file contents.
     */
    computeModelsHash() {
        const modelsDir = path_1.default.join(__dirname, "..", "models");
        const isProduction = process.env.NODE_ENV === "production";
        const fileExtension = isProduction ? ".js" : ".ts";
        const hash = crypto_1.default.createHash("md5");
        const walkDir = (dir) => {
            const entries = fs_1.default.readdirSync(dir, { withFileTypes: true });
            // Sort entries for consistent hash across different OS/filesystems
            entries.sort((a, b) => a.name.localeCompare(b.name));
            for (const entry of entries) {
                const fullPath = path_1.default.join(dir, entry.name);
                if (entry.isDirectory()) {
                    walkDir(fullPath);
                }
                else if (entry.isFile() &&
                    path_1.default.extname(entry.name) === fileExtension &&
                    entry.name !== "init.ts" &&
                    entry.name !== "init.js" &&
                    !entry.name.includes("index")) {
                    // Add file path and content to hash
                    const relativePath = path_1.default.relative(modelsDir, fullPath);
                    const content = fs_1.default.readFileSync(fullPath, "utf-8");
                    hash.update(relativePath);
                    hash.update(content);
                }
            }
        };
        walkDir(modelsDir);
        return hash.digest("hex");
    }
    /**
     * Gets the stored hash from the last sync operation
     */
    getStoredHash() {
        try {
            if (fs_1.default.existsSync(SYNC_HASH_FILE)) {
                return fs_1.default.readFileSync(SYNC_HASH_FILE, "utf-8").trim();
            }
        }
        catch (_a) {
            // Ignore errors reading hash file
        }
        return null;
    }
    /**
     * Stores the current hash after a successful sync
     */
    storeHash(hash) {
        try {
            fs_1.default.writeFileSync(SYNC_HASH_FILE, hash, "utf-8");
        }
        catch (_a) {
            // Ignore errors writing hash file
        }
    }
    /**
     * Checks if models have changed since last sync
     */
    hasModelsChanged() {
        const currentHash = this.computeModelsHash();
        const storedHash = this.getStoredHash();
        return {
            changed: storedHash !== currentHash,
            currentHash,
        };
    }
    async syncDatabase() {
        var _a;
        try {
            // DB_SYNC modes:
            // - "none": authenticate only, no schema changes
            // - "force": DROP and recreate tables (DANGEROUS)
            // - "lazy" (default): only sync if models changed
            // - "always": always run ALTER sync
            const syncMode = (_a = process.env.DB_SYNC) === null || _a === void 0 ? void 0 : _a.toLowerCase();
            if (syncMode === "none") {
                // Only authenticate, no schema changes
                await this.sequelize.authenticate();
                return;
            }
            if (syncMode === "force") {
                // DROP and recreate tables (DANGEROUS - loses all data)
                await this.sequelize.sync({ force: true });
                // Store hash after force sync
                this.storeHash(this.computeModelsHash());
                return;
            }
            if (syncMode === "always") {
                // Always run ALTER sync (old default behavior)
                await this.sequelize.sync({ alter: true });
                this.storeHash(this.computeModelsHash());
                return;
            }
            // Default: "lazy" mode - only sync if models have changed
            const { changed, currentHash } = this.hasModelsChanged();
            if (changed) {
                // Models changed, run full sync
                await this.sequelize.sync({ alter: true });
                this.storeHash(currentHash);
            }
            else {
                // No changes, just authenticate
                await this.sequelize.authenticate();
            }
        }
        catch (error) {
            console_1.logger.error("DB", "Connection failed");
            throw error;
        }
    }
}
exports.SequelizeSingleton = SequelizeSingleton;
exports.db = SequelizeSingleton.getInstance();
exports.sequelize = exports.db.getSequelize();
// Export a function to get models to avoid circular dependency issues
exports.getModels = () => exports.db.models;
exports.models = exports.db.models;
exports.default = exports.db;
