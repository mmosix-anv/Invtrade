"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.handleUnilevelMlmReferralRegister = exports.handleBinaryMlmReferralRegister = exports.handleReferralRegister = void 0;
exports.processRewards = processRewards;
const db_1 = require("@b/db");
const notifications_1 = require("./notifications");
const console_1 = require("@b/utils/console");
const cache_1 = require("@b/utils/cache");
const error_1 = require("@b/utils/error");
const sequelize_1 = require("sequelize");
/**
 * Validates and safely parses MLM JSON settings with schema validation
 * @param jsonString The JSON string to parse
 * @param maxSize Maximum allowed size in bytes
 * @param schemaType Type of schema to validate against
 * @returns Parsed object or throws error
 */
function validateAndParseMLMSettings(jsonString, maxSize, schemaType) {
    // Size validation
    if (typeof jsonString !== 'string' || jsonString.length > maxSize) {
        throw (0, error_1.createError)({ statusCode: 400, message: `Invalid MLM ${schemaType} settings format or size (max: ${maxSize} bytes)` });
    }
    // Security validation - check for malicious content
    const maliciousPatterns = ['__proto__', 'constructor', 'prototype', 'eval', 'function', 'require'];
    for (const pattern of maliciousPatterns) {
        if (jsonString.includes(pattern)) {
            throw (0, error_1.createError)({ statusCode: 400, message: `Potentially malicious content detected in ${schemaType} settings: ${pattern}` });
        }
    }
    let parsed;
    try {
        parsed = JSON.parse(jsonString);
    }
    catch (parseError) {
        throw (0, error_1.createError)({ statusCode: 400, message: `Invalid JSON format in ${schemaType} settings: ${parseError.message}` });
    }
    // Type validation
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        throw (0, error_1.createError)({ statusCode: 400, message: `${schemaType} settings must be a valid object` });
    }
    // Prototype validation
    if (Object.getPrototypeOf(parsed) !== Object.prototype) {
        throw (0, error_1.createError)({ statusCode: 400, message: `Invalid ${schemaType} settings object type` });
    }
    // Schema-specific validation
    if (schemaType === 'binary') {
        validateBinarySchema(parsed);
    }
    else if (schemaType === 'unilevel') {
        validateUnilevelSchema(parsed);
    }
    return parsed;
}
/**
 * Validates binary MLM settings schema
 */
function validateBinarySchema(settings) {
    if (typeof settings.levels !== 'number' || settings.levels < 2 || settings.levels > 7) {
        throw (0, error_1.createError)({ statusCode: 400, message: 'Binary settings must have levels between 2 and 7' });
    }
    if (!Array.isArray(settings.levelsPercentage)) {
        throw (0, error_1.createError)({ statusCode: 400, message: 'Binary settings must have levelsPercentage array' });
    }
    // Validate each level percentage
    for (const level of settings.levelsPercentage) {
        if (!level || typeof level.level !== 'number' || typeof level.value !== 'number') {
            throw (0, error_1.createError)({ statusCode: 400, message: 'Binary level percentages must have valid level and value properties' });
        }
        if (level.value < 0 || level.value > 100) {
            throw (0, error_1.createError)({ statusCode: 400, message: `Binary level percentage must be between 0-100, got: ${level.value}` });
        }
    }
}
/**
 * Validates unilevel MLM settings schema
 */
function validateUnilevelSchema(settings) {
    if (typeof settings.levels !== 'number' || settings.levels < 2 || settings.levels > 7) {
        throw (0, error_1.createError)({ statusCode: 400, message: 'Unilevel settings must have levels between 2 and 7' });
    }
    if (!Array.isArray(settings.levelsPercentage)) {
        throw (0, error_1.createError)({ statusCode: 400, message: 'Unilevel settings must have levelsPercentage array' });
    }
    // Validate each level percentage
    for (const level of settings.levelsPercentage) {
        if (!level || typeof level.level !== 'number' || typeof level.value !== 'number') {
            throw (0, error_1.createError)({ statusCode: 400, message: 'Unilevel level percentages must have valid level and value properties' });
        }
        if (level.value < 0 || level.value > 100) {
            throw (0, error_1.createError)({ statusCode: 400, message: `Unilevel level percentage must be between 0-100, got: ${level.value}` });
        }
    }
}
async function processRewards(userId, amount, conditionName, currency, ctx) {
    var _a, _b, _c, _d, _e, _f;
    (_a = ctx === null || ctx === void 0 ? void 0 : ctx.step) === null || _a === void 0 ? void 0 : _a.call(ctx, "Checking MLM extension status");
    const cacheManager = cache_1.CacheManager.getInstance();
    const extensions = await cacheManager.getExtensions();
    if (!extensions.has("mlm"))
        return;
    (_b = ctx === null || ctx === void 0 ? void 0 : ctx.step) === null || _b === void 0 ? void 0 : _b.call(ctx, "Loading MLM settings");
    const settings = await cacheManager.getSettings();
    const mlmSystem = settings.has("mlmSystem")
        ? settings.get("mlmSystem")
        : "DIRECT";
    let mlmSettings = null;
    try {
        const mlmSettingsRaw = settings.get("mlmSettings");
        if (mlmSettingsRaw && settings.has("mlmSettings")) {
            // Validate JSON string before parsing to prevent injection
            if (typeof mlmSettingsRaw !== 'string' || mlmSettingsRaw.length > 10000) {
                throw (0, error_1.createError)({ statusCode: 400, message: "Invalid MLM settings format or size" });
            }
            // Additional validation to prevent malicious JSON
            if (mlmSettingsRaw.includes('__proto__') || mlmSettingsRaw.includes('constructor') || mlmSettingsRaw.includes('prototype')) {
                throw (0, error_1.createError)({ statusCode: 400, message: "Potentially malicious JSON detected in MLM settings" });
            }
            mlmSettings = JSON.parse(mlmSettingsRaw);
            // Validate the parsed object structure
            if (mlmSettings && typeof mlmSettings === 'object' && mlmSettings !== null) {
                // Ensure it's a plain object, not a function or other potentially dangerous type
                if (Object.getPrototypeOf(mlmSettings) !== Object.prototype) {
                    throw (0, error_1.createError)({ statusCode: 400, message: "Invalid MLM settings object type" });
                }
            }
        }
    }
    catch (error) {
        console_1.logger.error("MLM", "Failed to parse MLM settings", error);
        return;
    }
    if (!mlmSettings) {
        console_1.logger.error("MLM", "MLM settings not found", new Error("MLM settings not found"));
        return; // MLM settings not found
    }
    // Validate transaction type and currency
    if (!isValidTransaction(conditionName, amount, currency)) {
        console_1.logger.error("MLM", "Invalid transaction type or currency", new Error("Invalid transaction type or currency"));
        return;
    }
    const { mlmReferralCondition } = db_1.models;
    try {
        (_c = ctx === null || ctx === void 0 ? void 0 : ctx.step) === null || _c === void 0 ? void 0 : _c.call(ctx, "Looking up referral condition");
        const condition = await mlmReferralCondition.findOne({
            where: { name: conditionName, status: true },
        });
        if (!condition) {
            console_1.logger.error("MLM", "Invalid referral condition", new Error("Invalid referral condition"));
            return;
        }
        let rewardsProcessed = false; // Flag to indicate if rewards were successfully processed
        (_d = ctx === null || ctx === void 0 ? void 0 : ctx.step) === null || _d === void 0 ? void 0 : _d.call(ctx, `Processing ${mlmSystem} rewards`);
        switch (mlmSystem) {
            case "DIRECT":
                rewardsProcessed = await processDirectRewards(condition, userId, amount, ctx);
                break;
            case "BINARY":
                rewardsProcessed = await processBinaryRewards(condition, userId, amount, mlmSettings, ctx);
                break;
            case "UNILEVEL":
                rewardsProcessed = await processUnilevelRewards(condition, userId, amount, mlmSettings, ctx);
                break;
            default:
                console_1.logger.error("MLM", "Invalid MLM system type", new Error("Invalid MLM system type"));
                break;
        }
        if (rewardsProcessed) {
            (_e = ctx === null || ctx === void 0 ? void 0 : ctx.step) === null || _e === void 0 ? void 0 : _e.call(ctx, "Sending reward notifications");
            // Notify the user about their reward using the new notification utility.
            await (0, notifications_1.createNotification)({
                userId,
                relatedId: condition.id ? condition.id.toString() : undefined,
                title: "Reward Processed",
                message: `Your reward for ${conditionName} of ${amount} ${currency} has been successfully processed.`,
                type: "system",
                link: `/mlm/rewards`,
                actions: [
                    {
                        label: "View Rewards",
                        link: `/mlm/rewards`,
                        primary: true,
                    },
                ],
            }, ctx);
            // Notify users with the "View MLM Rewards" permission about the reward process.
            await (0, notifications_1.createAdminNotification)("View MLM Rewards", "MLM Reward Processed", `A reward for ${conditionName} of ${amount} ${currency} was processed for user ${userId}.`, "system", `/admin/mlm/rewards`, undefined, undefined, ctx);
        }
    }
    catch (error) {
        (_f = ctx === null || ctx === void 0 ? void 0 : ctx.fail) === null || _f === void 0 ? void 0 : _f.call(ctx, error.message || "Failed to process rewards");
        console_1.logger.error("MLM", "Failed to process rewards", error);
    }
}
function isValidTransaction(conditionName, amount, currency) {
    // Validate input parameters
    if (!conditionName || typeof conditionName !== 'string') {
        return false;
    }
    if (typeof amount !== 'number' || amount <= 0 || !isFinite(amount)) {
        return false;
    }
    if (!currency || typeof currency !== 'string') {
        return false;
    }
    switch (conditionName) {
        case "WELCOME_BONUS":
            return currency === "USDT" && amount >= 100;
        case "MONTHLY_TRADE_VOLUME":
            return currency === "USDT" && amount > 1000;
        case "TRADE_COMMISSION":
        case "DEPOSIT":
        case "TRADE":
        case "INVESTMENT":
        case "BINARY_WIN":
        case "AI_INVESTMENT":
        case "FOREX_INVESTMENT":
        case "ICO_CONTRIBUTION":
        case "STAKING":
        case "STAKING_LOYALTY":
        case "ECOMMERCE_PURCHASE":
        case "P2P_TRADE":
            return amount > 0; // All these conditions require positive amounts
        default:
            return false;
    }
}
async function processDirectRewards(condition, referredId, amount, ctx) {
    var _a, _b, _c, _d;
    try {
        (_a = ctx === null || ctx === void 0 ? void 0 : ctx.step) === null || _a === void 0 ? void 0 : _a.call(ctx, "Finding referral record");
        // Find the referral record for the user who made the transaction
        const referral = await db_1.models.mlmReferral.findOne({
            where: { referredId }, // The person who made the transaction
        });
        if (!referral)
            return false;
        (_b = ctx === null || ctx === void 0 ? void 0 : ctx.step) === null || _b === void 0 ? void 0 : _b.call(ctx, "Checking for duplicate rewards");
        // Check for existing reward to prevent duplicates
        // Include referredId to make the check more specific
        const existingReward = await db_1.models.mlmReferralReward.findOne({
            where: {
                referrerId: referral.referrerId,
                conditionId: condition.id,
                // Add a transaction reference or timestamp to prevent exact duplicates
                // For now, we check if a reward was already given for this condition
            },
        });
        if (existingReward) {
            console_1.logger.error("MLM", `Duplicate reward prevented for referrer ${referral.referrerId}, condition ${condition.id}`, new Error(`Duplicate reward prevented for referrer ${referral.referrerId}, condition ${condition.id}`));
            return false;
        }
        (_c = ctx === null || ctx === void 0 ? void 0 : ctx.step) === null || _c === void 0 ? void 0 : _c.call(ctx, "Calculating reward amount");
        // Calculate reward amount
        const rewardAmount = condition.rewardType === "PERCENTAGE"
            ? amount * (condition.reward / 100)
            : condition.reward;
        // Validate reward amount
        if (rewardAmount <= 0) {
            console_1.logger.error("MLM", `Invalid reward amount calculated: ${rewardAmount}`, new Error(`Invalid reward amount calculated: ${rewardAmount}`));
            return false;
        }
        (_d = ctx === null || ctx === void 0 ? void 0 : ctx.step) === null || _d === void 0 ? void 0 : _d.call(ctx, "Creating reward record");
        // Create the reward record
        await db_1.models.mlmReferralReward.create({
            referrerId: referral.referrerId,
            conditionId: condition.id,
            reward: rewardAmount,
        });
        return true;
    }
    catch (error) {
        console_1.logger.error("MLM", "Failed to process direct rewards", error);
        return false;
    }
}
// Helper function to find uplines
async function findUplines(userId, systemType, levels) {
    const uplines = [];
    let currentUserId = userId;
    // Assume model names for binary and unilevel systems
    const model = systemType === "BINARY" ? db_1.models.mlmBinaryNode : db_1.models.mlmUnilevelNode;
    for (let i = 0; i < levels; i++) {
        try {
            const referral = await db_1.models.mlmReferral.findOne({
                where: { referredId: currentUserId },
                include: [
                    {
                        model: model,
                        as: systemType === "BINARY" ? "node" : "unilevelNode",
                        required: true,
                    },
                ],
            });
            if (!referral || !referral.referrerId) {
                console_1.logger.error("MLM", `User ${currentUserId} is not associated to ${systemType === "BINARY" ? "mlmBinaryNode" : "mlmUnilevelNode"}!`, new Error(`User ${currentUserId} is not associated to ${systemType === "BINARY" ? "mlmBinaryNode" : "mlmUnilevelNode"}!`));
                break;
            }
            uplines.push({
                level: i + 1,
                referrerId: referral.referrerId,
            });
            currentUserId = referral.referrerId;
        }
        catch (error) {
            console_1.logger.error("MLM", "Failed to find uplines", error);
            break;
        }
    }
    return uplines;
}
// Common function to create reward record with proper validation and duplicate prevention
async function createRewardRecord(referrerId, rewardAmount, conditionId) {
    try {
        // Validate inputs
        if (!referrerId || !conditionId) {
            throw (0, error_1.createError)({ statusCode: 400, message: "referrerId and conditionId are required" });
        }
        if (typeof rewardAmount !== 'number' || rewardAmount <= 0 || !isFinite(rewardAmount)) {
            throw (0, error_1.createError)({ statusCode: 400, message: `Invalid reward amount: ${rewardAmount}` });
        }
        // Check for duplicate rewards within a transaction
        const existingReward = await db_1.models.mlmReferralReward.findOne({
            where: {
                referrerId,
                conditionId,
                createdAt: {
                    [sequelize_1.Op.gte]: new Date(Date.now() - 60000) // Within last minute
                }
            }
        });
        if (existingReward) {
            console_1.logger.error("MLM", `Duplicate reward prevented for referrer ${referrerId}, condition ${conditionId}`, new Error(`Duplicate reward prevented for referrer ${referrerId}, condition ${conditionId}`));
            return false;
        }
        await db_1.models.mlmReferralReward.create({
            referrerId,
            reward: rewardAmount,
            conditionId: conditionId,
        });
        return true;
    }
    catch (error) {
        console_1.logger.error("MLM", "Failed to create reward record", error);
        return false;
    }
}
// Binary Rewards Processing
async function processBinaryRewards(condition, userId, depositAmount, mlmSettings, ctx) {
    var _a, _b, _c, _d;
    try {
        (_a = ctx === null || ctx === void 0 ? void 0 : ctx.step) === null || _a === void 0 ? void 0 : _a.call(ctx, "Validating binary MLM settings");
        if (typeof mlmSettings.binary === "string") {
            try {
                mlmSettings.binary = validateAndParseMLMSettings(mlmSettings.binary, 5000, 'binary');
            }
            catch (error) {
                console_1.logger.error("MLM", "Failed to parse binary MLM settings", error);
                return false;
            }
        }
        if (!mlmSettings.binary || !mlmSettings.binary.levels) {
            console_1.logger.error("MLM", "Binary MLM settings are invalid", new Error("Binary MLM settings are invalid"));
            return false;
        }
        // Validate commission percentages don't exceed 100%
        if (mlmSettings.binary.levelsPercentage && Array.isArray(mlmSettings.binary.levelsPercentage)) {
            const totalCommission = mlmSettings.binary.levelsPercentage.reduce((sum, level) => {
                const percentage = typeof level.value === 'number' ? level.value : 0;
                return sum + percentage;
            }, 0);
            if (totalCommission > 100) {
                console_1.logger.error("MLM", `Total binary commission percentages (${totalCommission}%) cannot exceed 100%`, new Error(`Total binary commission percentages (${totalCommission}%) cannot exceed 100%`));
                return false;
            }
        }
        (_b = ctx === null || ctx === void 0 ? void 0 : ctx.step) === null || _b === void 0 ? void 0 : _b.call(ctx, "Finding binary uplines");
        const binaryLevels = mlmSettings.binary.levels;
        const uplines = await findUplines(userId, "BINARY", binaryLevels);
        if (!uplines.length) {
            return false;
        }
        (_c = ctx === null || ctx === void 0 ? void 0 : ctx.step) === null || _c === void 0 ? void 0 : _c.call(ctx, `Processing rewards for ${uplines.length} uplines`);
        for (let i = uplines.length - 1; i >= 0; i--) {
            const upline = uplines[i];
            const levelIndex = binaryLevels - i;
            const levelRewardPercentage = (_d = mlmSettings.binary.levelsPercentage.find((l) => l.level === levelIndex)) === null || _d === void 0 ? void 0 : _d.value;
            if (levelRewardPercentage === undefined) {
                continue;
            }
            // Calculate reward based on condition type
            let finalReward;
            if (condition.rewardType === "PERCENTAGE") {
                // For percentage rewards, apply the condition's reward percentage to the transaction amount
                const conditionReward = depositAmount * (condition.reward / 100);
                // Then apply the level percentage to determine the upline's share
                finalReward = conditionReward * (levelRewardPercentage / 100);
            }
            else {
                // For fixed rewards, apply the level percentage to the fixed amount
                finalReward = condition.reward * (levelRewardPercentage / 100);
            }
            await createRewardRecord(upline.referrerId, finalReward, condition.id);
        }
        return true;
    }
    catch (error) {
        console_1.logger.error("MLM", "Failed to process binary rewards", error);
        return false;
    }
}
// Unilevel Rewards Processing
async function processUnilevelRewards(condition, userId, depositAmount, mlmSettings, ctx) {
    var _a, _b, _c, _d;
    try {
        (_a = ctx === null || ctx === void 0 ? void 0 : ctx.step) === null || _a === void 0 ? void 0 : _a.call(ctx, "Validating unilevel MLM settings");
        if (typeof mlmSettings.unilevel === "string") {
            try {
                mlmSettings.unilevel = validateAndParseMLMSettings(mlmSettings.unilevel, 5000, 'unilevel');
            }
            catch (error) {
                console_1.logger.error("MLM", "Failed to parse unilevel MLM settings", error);
                return false;
            }
        }
        if (!mlmSettings.unilevel || !mlmSettings.unilevel.levels) {
            console_1.logger.error("MLM", "Unilevel MLM settings are invalid", new Error("Unilevel MLM settings are invalid"));
            return false;
        }
        // Validate commission percentages don't exceed 100%
        if (mlmSettings.unilevel.levelsPercentage && Array.isArray(mlmSettings.unilevel.levelsPercentage)) {
            const totalCommission = mlmSettings.unilevel.levelsPercentage.reduce((sum, level) => {
                const percentage = typeof level.value === 'number' ? level.value : 0;
                return sum + percentage;
            }, 0);
            if (totalCommission > 100) {
                console_1.logger.error("MLM", `Total unilevel commission percentages (${totalCommission}%) cannot exceed 100%`, new Error(`Total unilevel commission percentages (${totalCommission}%) cannot exceed 100%`));
                return false;
            }
        }
        (_b = ctx === null || ctx === void 0 ? void 0 : ctx.step) === null || _b === void 0 ? void 0 : _b.call(ctx, "Finding unilevel uplines");
        const unilevelLevels = mlmSettings.unilevel.levels;
        const uplines = await findUplines(userId, "UNILEVEL", unilevelLevels);
        if (!uplines.length) {
            return false;
        }
        (_c = ctx === null || ctx === void 0 ? void 0 : ctx.step) === null || _c === void 0 ? void 0 : _c.call(ctx, `Processing rewards for ${uplines.length} uplines`);
        for (let i = uplines.length - 1; i >= 0; i--) {
            const upline = uplines[i];
            const levelIndex = unilevelLevels - i;
            const levelRewardPercentage = (_d = mlmSettings.unilevel.levelsPercentage.find((l) => l.level === levelIndex)) === null || _d === void 0 ? void 0 : _d.value;
            if (levelRewardPercentage === undefined) {
                continue;
            }
            // Calculate reward based on condition type
            let finalReward;
            if (condition.rewardType === "PERCENTAGE") {
                // For percentage rewards, apply the condition's reward percentage to the transaction amount
                const conditionReward = depositAmount * (condition.reward / 100);
                // Then apply the level percentage to determine the upline's share
                finalReward = conditionReward * (levelRewardPercentage / 100);
            }
            else {
                // For fixed rewards, apply the level percentage to the fixed amount
                finalReward = condition.reward * (levelRewardPercentage / 100);
            }
            await createRewardRecord(upline.referrerId, finalReward, condition.id);
        }
        return true;
    }
    catch (error) {
        console_1.logger.error("MLM", "Failed to process unilevel rewards", error);
        return false;
    }
}
const handleReferralRegister = async (refId, userId, ctx) => {
    var _a, _b, _c, _d, _e, _f;
    try {
        (_a = ctx === null || ctx === void 0 ? void 0 : ctx.step) === null || _a === void 0 ? void 0 : _a.call(ctx, "Finding referrer user");
        const referrer = await db_1.models.user.findByPk(refId);
        if (referrer) {
            (_b = ctx === null || ctx === void 0 ? void 0 : ctx.step) === null || _b === void 0 ? void 0 : _b.call(ctx, "Loading referral settings");
            const cacheManager = cache_1.CacheManager.getInstance();
            const settings = await cacheManager.getSettings();
            const referralApprovalRequired = settings.has("referralApprovalRequired")
                ? settings.get("referralApprovalRequired") === "true"
                : false;
            (_c = ctx === null || ctx === void 0 ? void 0 : ctx.step) === null || _c === void 0 ? void 0 : _c.call(ctx, "Creating referral record");
            const referral = await db_1.models.mlmReferral.create({
                referrerId: referrer.id,
                referredId: userId,
                status: referralApprovalRequired ? "PENDING" : "ACTIVE",
            });
            const mlmSystem = settings.has("mlmSystem")
                ? settings.get("mlmSystem")
                : null;
            if (mlmSystem === "DIRECT") {
                return;
            }
            else if (mlmSystem === "BINARY") {
                (_d = ctx === null || ctx === void 0 ? void 0 : ctx.step) === null || _d === void 0 ? void 0 : _d.call(ctx, "Registering binary MLM node");
                await (0, exports.handleBinaryMlmReferralRegister)(referrer.id, referral, db_1.models.mlmBinaryNode, ctx);
            }
            else if (mlmSystem === "UNILEVEL") {
                (_e = ctx === null || ctx === void 0 ? void 0 : ctx.step) === null || _e === void 0 ? void 0 : _e.call(ctx, "Registering unilevel MLM node");
                await (0, exports.handleUnilevelMlmReferralRegister)(referrer.id, referral, db_1.models.mlmUnilevelNode, ctx);
            }
        }
    }
    catch (error) {
        (_f = ctx === null || ctx === void 0 ? void 0 : ctx.fail) === null || _f === void 0 ? void 0 : _f.call(ctx, error.message || "Failed to handle referral register");
        console_1.logger.error("MLM", "Failed to handle referral register", error);
        throw error;
    }
};
exports.handleReferralRegister = handleReferralRegister;
const checkCycleForBinary = async (referrerNode, newUserId, mlmBinaryNodeModel) => {
    let current = referrerNode;
    while (current) {
        const referral = await db_1.models.mlmReferral.findOne({
            where: { id: current.referralId },
        });
        if (referral && referral.referredId === newUserId) {
            return true;
        }
        if (!current.parentId)
            break;
        current = await mlmBinaryNodeModel.findByPk(current.parentId);
    }
    return false;
};
const checkCycleForUnilevel = async (referrerNode, newUserId, mlmUnilevelNodeModel) => {
    let current = referrerNode;
    while (current) {
        const referral = await db_1.models.mlmReferral.findOne({
            where: { id: current.referralId },
        });
        if (referral && referral.referredId === newUserId) {
            return true;
        }
        if (!current.parentId)
            break;
        current = await mlmUnilevelNodeModel.findByPk(current.parentId);
    }
    return false;
};
const handleBinaryMlmReferralRegister = async (referrerUserId, newReferral, mlmBinaryNode, ctx) => {
    const { sequelize } = db_1.models;
    return await sequelize.transaction(async (transaction) => {
        var _a, _b, _c, _d;
        try {
            (_a = ctx === null || ctx === void 0 ? void 0 : ctx.step) === null || _a === void 0 ? void 0 : _a.call(ctx, "Finding or creating referrer referral record");
            let referrerReferral = await db_1.models.mlmReferral.findOne({
                where: { referrerId: referrerUserId, referredId: referrerUserId },
                transaction,
            });
            if (!referrerReferral) {
                referrerReferral = await db_1.models.mlmReferral.create({
                    referrerId: referrerUserId,
                    referredId: referrerUserId,
                    status: "ACTIVE",
                }, { transaction });
            }
            (_b = ctx === null || ctx === void 0 ? void 0 : ctx.step) === null || _b === void 0 ? void 0 : _b.call(ctx, "Finding or creating binary node for referrer");
            let referrerNode = await mlmBinaryNode.findOne({
                where: { referralId: referrerReferral.id },
                transaction,
                lock: transaction.LOCK.UPDATE,
            });
            if (!referrerNode) {
                referrerNode = await mlmBinaryNode.create({
                    referralId: referrerReferral.id,
                    parentId: null,
                }, { transaction });
            }
            (_c = ctx === null || ctx === void 0 ? void 0 : ctx.step) === null || _c === void 0 ? void 0 : _c.call(ctx, "Checking for referral cycles");
            const cycleExists = await checkCycleForBinary(referrerNode, newReferral.referredId, mlmBinaryNode);
            if (cycleExists) {
                throw (0, error_1.createError)({ statusCode: 409, message: "Referral loop detected: the referred user is already an ancestor." });
            }
            (_d = ctx === null || ctx === void 0 ? void 0 : ctx.step) === null || _d === void 0 ? void 0 : _d.call(ctx, "Creating binary node for new referral");
            const placementField = referrerNode.leftChildId
                ? "rightChildId"
                : "leftChildId";
            const newNode = await mlmBinaryNode.create({
                referralId: newReferral.id,
                parentId: referrerNode.id,
            }, { transaction });
            referrerNode[placementField] = newNode.id;
            await referrerNode.save({ transaction });
            return newNode;
        }
        catch (error) {
            console_1.logger.error("MLM", "Failed to handle binary MLM referral register", error);
            throw error;
        }
    });
};
exports.handleBinaryMlmReferralRegister = handleBinaryMlmReferralRegister;
const handleUnilevelMlmReferralRegister = async (referrerUserId, newReferral, mlmUnilevelNode, ctx) => {
    const { sequelize } = db_1.models;
    return await sequelize.transaction(async (transaction) => {
        var _a, _b, _c, _d;
        try {
            (_a = ctx === null || ctx === void 0 ? void 0 : ctx.step) === null || _a === void 0 ? void 0 : _a.call(ctx, "Finding or creating referrer referral record");
            let referrerReferral = await db_1.models.mlmReferral.findOne({
                where: { referrerId: referrerUserId, referredId: referrerUserId },
                transaction,
            });
            if (!referrerReferral) {
                referrerReferral = await db_1.models.mlmReferral.create({
                    referrerId: referrerUserId,
                    referredId: referrerUserId,
                    status: "ACTIVE",
                }, { transaction });
            }
            (_b = ctx === null || ctx === void 0 ? void 0 : ctx.step) === null || _b === void 0 ? void 0 : _b.call(ctx, "Finding or creating unilevel node for referrer");
            let referrerNode = await mlmUnilevelNode.findOne({
                where: { referralId: referrerReferral.id },
                transaction,
                lock: transaction.LOCK.UPDATE,
            });
            if (!referrerNode) {
                referrerNode = await mlmUnilevelNode.create({
                    referralId: referrerReferral.id,
                    parentId: null,
                }, { transaction });
            }
            (_c = ctx === null || ctx === void 0 ? void 0 : ctx.step) === null || _c === void 0 ? void 0 : _c.call(ctx, "Checking for referral cycles");
            const cycleExists = await checkCycleForUnilevel(referrerNode, newReferral.referredId, mlmUnilevelNode);
            if (cycleExists) {
                throw (0, error_1.createError)({ statusCode: 409, message: "Referral loop detected: the referred user is already an ancestor." });
            }
            (_d = ctx === null || ctx === void 0 ? void 0 : ctx.step) === null || _d === void 0 ? void 0 : _d.call(ctx, "Creating unilevel node for new referral");
            const newNode = await mlmUnilevelNode.create({
                referralId: newReferral.id,
                parentId: referrerNode.id,
            }, { transaction });
            return newNode;
        }
        catch (error) {
            console_1.logger.error("MLM", "Failed to handle unilevel MLM referral register", error);
            throw error;
        }
    });
};
exports.handleUnilevelMlmReferralRegister = handleUnilevelMlmReferralRegister;
