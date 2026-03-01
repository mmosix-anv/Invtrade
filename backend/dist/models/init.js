"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.initModels = initModels;
exports.createUserCacheHooks = createUserCacheHooks;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const sequelize_1 = require("sequelize");
// Check if the environment is production
const isProduction = process.env.NODE_ENV === "production";
function initModels(sequelize) {
    console.log("[DEBUG] initModels function called");
    if (!sequelize || !(sequelize instanceof sequelize_1.Sequelize)) {
        throw new Error("Invalid Sequelize instance passed to initModels");
    }
    const models = {};
    // Get the current file name to exclude it from model imports
    const currentFileName = path_1.default.basename(__filename);
    // Always use .js extension when running from dist folder (compiled code)
    const fileExtension = ".js";
    console.log("[DEBUG] Looking for files with extension:", fileExtension);
    console.log("[DEBUG] isProduction:", isProduction);
    console.log("[DEBUG] __dirname:", __dirname);
    // Collect all model file paths (including nested directories)
    const modelFiles = [];
    function walkDir(dir) {
        fs_1.default.readdirSync(dir, { withFileTypes: true }).forEach((entry) => {
            const fullPath = path_1.default.join(dir, entry.name);
            if (entry.isDirectory()) {
                walkDir(fullPath);
            }
            else if (entry.isFile() &&
                path_1.default.extname(entry.name) === fileExtension &&
                entry.name !== currentFileName &&
                !entry.name.includes("index")) {
                modelFiles.push(fullPath);
            }
        });
    }
    try {
        // Recursively find model files under this directory (including /ext/**/**)
        walkDir(__dirname);
        console.log("[DEBUG] Found", modelFiles.length, "model files");
        console.log("[DEBUG] First 5 files:", modelFiles.slice(0, 5));
        // Initialize each model
        for (const filePath of modelFiles) {
            const modelModule = require(filePath);
            const model = modelModule.default || modelModule;
            if (model && typeof model.initModel === "function") {
                const initializedModel = model.initModel(sequelize);
                const modelName = initializedModel.name;
                if (!modelName) {
                    console.error(`Model from file ${filePath} has no modelName set.`);
                    continue;
                }
                models[modelName] = initializedModel;
            }
            else {
                console.error(`Model from file ${filePath} does not have an initModel method or a valid export structure.`);
            }
        }
        // Setup associations for all initialized models
        Object.keys(models).forEach((modelName) => {
            const model = models[modelName];
            if (typeof model.associate === "function") {
                model.associate(models);
            }
        });
    }
    catch (error) {
        console.error(`Error initializing models: ${error.message}`);
        console.error(`Error stack:`, error.stack);
        throw error;
    }
    // Models initialized silently - count available via db.models
    console.log("[DEBUG] Returning", Object.keys(models).length, "models");
    return models;
}
// Helper to extract userIds from a where clause
function extractUserIdsFromWhere(where) {
    let userIds = [];
    if (where && where.userId) {
        const uid = where.userId;
        userIds = Array.isArray(uid) ? uid : [uid];
    }
    else if (where && where[sequelize_1.Op.and]) {
        const conditions = where[sequelize_1.Op.and];
        for (const condition of conditions) {
            if (condition.userId) {
                if (Array.isArray(condition.userId)) {
                    userIds.push(...condition.userId);
                }
                else {
                    userIds.push(condition.userId);
                }
            }
        }
    }
    return [...new Set(userIds)];
}
/**
 * Returns hooks for cache invalidation that clear the Redis key:
 *   user:${userId}:profile
 *
 * @param getUserId - A function to extract the user id from an instance (default: instance.userId)
 */
function createUserCacheHooks(getUserId = (instance) => instance.userId) {
    // Lazy-load Redis to avoid circular dependency
    let redis = null;
    const getRedis = () => {
        if (!redis) {
            const { RedisSingleton } = require("@b/utils/redis");
            redis = RedisSingleton.getInstance();
        }
        return redis;
    };
    return {
        // Single record hooks
        afterCreate: async (instance) => {
            const userId = getUserId(instance);
            await getRedis().del(`user:${userId}:profile`);
        },
        afterUpdate: async (instance) => {
            const userId = getUserId(instance);
            await getRedis().del(`user:${userId}:profile`);
        },
        afterDestroy: async (instance) => {
            const userId = getUserId(instance);
            await getRedis().del(`user:${userId}:profile`);
        },
        // Bulk hooks (use non-arrow functions so "this" refers to the model)
        afterBulkUpdate: async function (options) {
            let userIds = extractUserIdsFromWhere(options.where);
            if (!userIds.length) {
                const instances = await this.findAll({ where: options.where });
                userIds = instances.map((inst) => getUserId(inst));
            }
            for (const uid of [...new Set(userIds)]) {
                await getRedis().del(`user:${uid}:profile`);
            }
        },
        afterBulkDestroy: async function (options) {
            let userIds = extractUserIdsFromWhere(options.where);
            if (!userIds.length) {
                const instances = await this.findAll({ where: options.where });
                userIds = instances.map((inst) => getUserId(inst));
            }
            for (const uid of [...new Set(userIds)]) {
                await getRedis().del(`user:${uid}:profile`);
            }
        },
    };
}
