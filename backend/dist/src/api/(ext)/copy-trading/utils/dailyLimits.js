"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.checkDailyLimits = checkDailyLimits;
exports.getDailyStats = getDailyStats;
exports.recordTrade = recordTrade;
exports.recordLoss = recordLoss;
exports.resetDailyLimits = resetDailyLimits;
exports.updateFollowerLimits = updateFollowerLimits;
exports.getFollowerLimitStatus = getFollowerLimitStatus;
exports.checkAutoActions = checkAutoActions;
// Daily Limits - Daily trade/loss limit enforcement
const db_1 = require("@b/db");
const sequelize_1 = require("sequelize");
const console_1 = require("@b/utils/console");
const index_1 = require("./index");
const currency_1 = require("./currency");
const notification_1 = require("@b/services/notification");
// Redis key prefix for daily limits (in-memory fallback if Redis unavailable)
const dailyLimitsCache = new Map();
// ============================================================================
// DAILY LIMIT CHECKING
// ============================================================================
/**
 * Check if a follower can make a trade based on daily limits
 */
async function checkDailyLimits(followerId) {
    try {
        const follower = await db_1.models.copyTradingFollower.findByPk(followerId);
        if (!follower) {
            return { canTrade: false, reason: "Follower not found" };
        }
        const followerData = follower;
        // Check if follower is active
        if (followerData.status !== "ACTIVE") {
            return { canTrade: false, reason: "Subscription is not active" };
        }
        // Get today's stats
        const todayStats = await getDailyStats(followerId);
        // Check daily trade limit if configured
        const settings = await (0, index_1.getCopyTradingSettings)();
        const maxDailyTrades = settings.maxDailyLossDefault || 50; // Default 50 trades per day
        // Get follower's max daily loss
        const maxDailyLoss = followerData.maxDailyLoss;
        // Check trade count limit
        if (todayStats.tradesCount >= maxDailyTrades) {
            return {
                canTrade: false,
                reason: "Daily trade limit reached",
                currentTrades: todayStats.tradesCount,
                maxTrades: maxDailyTrades,
            };
        }
        // Check daily loss limit
        if (maxDailyLoss && maxDailyLoss > 0) {
            if (todayStats.totalLoss >= maxDailyLoss) {
                return {
                    canTrade: false,
                    reason: "Daily loss limit reached",
                    currentLoss: todayStats.totalLoss,
                    maxLoss: maxDailyLoss,
                };
            }
        }
        return { canTrade: true };
    }
    catch (error) {
        console_1.logger.error("COPY_TRADING", "Failed to check daily limits", error);
        // Allow trading if we can't check limits (fail open)
        return { canTrade: true };
    }
}
/**
 * Get daily statistics for a follower
 * All monetary values are converted to USDT equivalent for consistent comparison
 */
async function getDailyStats(followerId) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    try {
        // Get today's trades with symbol info to determine profit currency
        const trades = await db_1.models.copyTradingTrade.findAll({
            where: {
                followerId,
                createdAt: { [sequelize_1.Op.gte]: today },
            },
            attributes: ["profit", "cost", "status", "symbol", "profitCurrency"],
        });
        const tradesData = trades;
        const tradesCount = tradesData.length;
        // Calculate P&L with currency conversion to USDT
        let totalProfitUSDT = 0;
        let totalLossUSDT = 0;
        let totalVolumeUSDT = 0;
        const profitByCurrency = {};
        const lossByCurrency = {};
        for (const trade of tradesData) {
            const profit = trade.profit || 0;
            const cost = trade.cost || 0;
            // Determine the profit currency (from field or symbol quote)
            let profitCurrency = trade.profitCurrency;
            if (!profitCurrency && trade.symbol) {
                profitCurrency = (0, currency_1.getQuoteCurrency)(trade.symbol);
            }
            // Fallback to USDT if no currency info available
            if (!profitCurrency) {
                profitCurrency = "USDT";
            }
            // Convert profit/loss to USDT for aggregation
            try {
                const profitInUSDT = await (0, currency_1.convertToUSDT)(profit, profitCurrency);
                const costInUSDT = await (0, currency_1.convertToUSDT)(cost, profitCurrency);
                if (profitInUSDT > 0) {
                    totalProfitUSDT += profitInUSDT;
                    // Track profit in original currency
                    profitByCurrency[profitCurrency] =
                        (profitByCurrency[profitCurrency] || 0) + profit;
                }
                else if (profitInUSDT < 0) {
                    totalLossUSDT += Math.abs(profitInUSDT);
                    // Track loss in original currency
                    lossByCurrency[profitCurrency] =
                        (lossByCurrency[profitCurrency] || 0) + Math.abs(profit);
                }
                totalVolumeUSDT += costInUSDT;
            }
            catch (conversionError) {
                // If conversion fails, log warning and use raw values (assume USDT)
                console_1.logger.warn("COPY_TRADING", `Currency conversion failed for ${profitCurrency}, using raw value`, conversionError);
                if (profit > 0) {
                    totalProfitUSDT += profit;
                    profitByCurrency[profitCurrency] =
                        (profitByCurrency[profitCurrency] || 0) + profit;
                }
                else {
                    totalLossUSDT += Math.abs(profit);
                    lossByCurrency[profitCurrency] =
                        (lossByCurrency[profitCurrency] || 0) + Math.abs(profit);
                }
                totalVolumeUSDT += cost;
            }
        }
        return {
            tradesCount,
            totalProfit: totalProfitUSDT,
            totalLoss: totalLossUSDT,
            netPnL: totalProfitUSDT - totalLossUSDT,
            totalVolume: totalVolumeUSDT,
            profitByCurrency,
            lossByCurrency,
        };
    }
    catch (error) {
        console_1.logger.error("COPY_TRADING", "Failed to get daily stats", error);
        return {
            tradesCount: 0,
            totalProfit: 0,
            totalLoss: 0,
            netPnL: 0,
            totalVolume: 0,
            profitByCurrency: {},
            lossByCurrency: {},
        };
    }
}
// ============================================================================
// TRADE AND LOSS RECORDING
// ============================================================================
/**
 * Record a trade for daily limit tracking
 */
async function recordTrade(followerId, tradeAmount) {
    const today = new Date().toISOString().split("T")[0];
    const cacheKey = `${followerId}:${today}`;
    const existing = dailyLimitsCache.get(cacheKey) || {
        trades: 0,
        loss: 0,
        date: today,
    };
    existing.trades += 1;
    dailyLimitsCache.set(cacheKey, existing);
}
/**
 * Record a loss for daily limit tracking
 * @param lossAmount - The loss amount in original currency
 * @param lossCurrency - The currency of the loss (e.g., "USDT", "BTC")
 */
async function recordLoss(followerId, lossAmount, lossCurrency = "USDT") {
    if (lossAmount <= 0)
        return;
    const today = new Date().toISOString().split("T")[0];
    const cacheKey = `${followerId}:${today}`;
    // Convert loss to USDT for consistent tracking
    let lossInUSDT;
    try {
        lossInUSDT = await (0, currency_1.convertToUSDT)(lossAmount, lossCurrency);
    }
    catch (error) {
        console_1.logger.warn("COPY_TRADING", `Failed to convert loss from ${lossCurrency} to USDT, using raw value`, error);
        lossInUSDT = lossAmount;
    }
    const existing = dailyLimitsCache.get(cacheKey) || {
        trades: 0,
        loss: 0,
        date: today,
    };
    existing.loss += lossInUSDT;
    dailyLimitsCache.set(cacheKey, existing);
    // Check if this triggers the daily loss limit
    const follower = await db_1.models.copyTradingFollower.findByPk(followerId);
    if (follower) {
        const followerData = follower;
        const maxDailyLoss = followerData.maxDailyLoss; // maxDailyLoss is stored in USDT
        if (maxDailyLoss && existing.loss >= maxDailyLoss) {
            // Pause the follower subscription
            await pauseFollowerDueToDailyLimit(followerId, existing.loss, maxDailyLoss);
        }
    }
}
/**
 * Pause a follower's subscription due to daily loss limit
 * @param currentLoss - Current loss in USDT equivalent
 * @param maxLoss - Max daily loss limit in USDT
 */
async function pauseFollowerDueToDailyLimit(followerId, currentLoss, maxLoss) {
    try {
        await db_1.models.copyTradingFollower.update({ status: "PAUSED" }, { where: { id: followerId } });
        // Get follower for user notification
        const follower = await db_1.models.copyTradingFollower.findByPk(followerId, {
            include: [{ model: db_1.models.user, as: "user" }],
        });
        if (follower) {
            const followerData = follower;
            // Create notification with proper currency formatting
            const today = new Date().toISOString().split("T")[0];
            await notification_1.notificationService.send({
                userId: followerData.userId,
                type: "SYSTEM",
                channels: ["IN_APP"],
                idempotencyKey: `copy_trading_paused_${followerId}_${today}`,
                data: {
                    title: "Copy Trading Paused",
                    message: `Your copy trading subscription has been paused because your daily loss limit (${(0, currency_1.formatCurrencyAmount)(maxLoss, "USDT")}) was reached. Current loss: ${(0, currency_1.formatCurrencyAmount)(currentLoss, "USDT")}. You can resume trading tomorrow.`,
                    link: "/copy-trading/subscription",
                },
                priority: "HIGH"
            });
            // Create audit log
            await (0, index_1.createAuditLog)({
                entityType: "copyTradingFollower",
                entityId: followerId,
                action: "DAILY_LOSS_LIMIT_REACHED",
                userId: followerData.userId,
                metadata: { currentLoss, maxLoss, currency: "USDT" },
            });
        }
    }
    catch (error) {
        console_1.logger.error("COPY_TRADING", "Failed to pause follower due to daily limit", error);
    }
}
// ============================================================================
// DAILY RESET
// ============================================================================
/**
 * Reset daily limits for all followers (called by cron job at midnight)
 */
async function resetDailyLimits() {
    let reset = 0;
    let reactivated = 0;
    try {
        // Clear in-memory cache
        dailyLimitsCache.clear();
        reset++;
        // Reactivate followers paused due to daily limits
        // (only if they were paused and it's a new day)
        const pausedFollowers = await db_1.models.copyTradingFollower.findAll({
            where: { status: "PAUSED" },
            include: [
                {
                    model: db_1.models.copyTradingAuditLog,
                    as: "auditLogs",
                    where: {
                        action: "DAILY_LOSS_LIMIT_REACHED",
                        createdAt: {
                            [sequelize_1.Op.gte]: new Date(Date.now() - 24 * 60 * 60 * 1000), // Within last 24 hours
                        },
                    },
                    required: true,
                    limit: 1,
                },
            ],
        });
        for (const follower of pausedFollowers) {
            await follower.update({ status: "ACTIVE" });
            reactivated++;
            // Create notification
            await notification_1.notificationService.send({
                userId: follower.userId,
                type: "SYSTEM",
                channels: ["IN_APP"],
                idempotencyKey: `copy_trading_resumed_${follower.id}_${new Date().toISOString().split("T")[0]}`,
                data: {
                    title: "Copy Trading Resumed",
                    message: "Your copy trading subscription has been automatically reactivated for the new trading day.",
                    link: "/copy-trading/subscription",
                },
                priority: "NORMAL"
            });
            // Create audit log
            await (0, index_1.createAuditLog)({
                entityType: "copyTradingFollower",
                entityId: follower.id,
                action: "DAILY_LIMITS_RESET",
                userId: follower.userId,
            });
        }
        console_1.logger.info("COPY_TRADING", `Daily limits reset complete: ${reset} caches cleared, ${reactivated} followers reactivated`);
        return { reset, reactivated };
    }
    catch (error) {
        console_1.logger.error("COPY_TRADING", "Failed to reset daily limits", error);
        return { reset, reactivated };
    }
}
// ============================================================================
// LIMIT CONFIGURATION
// ============================================================================
/**
 * Update follower's daily limits
 */
async function updateFollowerLimits(followerId, limits) {
    try {
        const follower = await db_1.models.copyTradingFollower.findByPk(followerId);
        if (!follower) {
            return { success: false, error: "Follower not found" };
        }
        await follower.update(limits);
        // Create audit log
        await (0, index_1.createAuditLog)({
            entityType: "copyTradingFollower",
            entityId: followerId,
            action: "LIMITS_UPDATED",
            userId: follower.userId,
            newValue: limits,
        });
        return { success: true };
    }
    catch (error) {
        console_1.logger.error("COPY_TRADING", "Failed to update follower limits", error);
        return { success: false, error: error.message };
    }
}
/**
 * Get follower's current limit status
 * All monetary values are in USDT equivalent
 */
async function getFollowerLimitStatus(followerId) {
    const follower = await db_1.models.copyTradingFollower.findByPk(followerId);
    if (!follower) {
        return {
            limits: {
                maxDailyLoss: null,
                maxPositionSize: null,
                stopLossPercent: null,
                takeProfitPercent: null,
            },
            currentUsage: {
                tradesCount: 0,
                totalProfit: 0,
                totalLoss: 0,
                netPnL: 0,
                totalVolume: 0,
                profitByCurrency: {},
                lossByCurrency: {},
            },
            canTrade: false,
            reason: "Follower not found",
            currency: "USDT",
        };
    }
    const followerData = follower;
    const currentUsage = await getDailyStats(followerId);
    const limitCheck = await checkDailyLimits(followerId);
    return {
        limits: {
            maxDailyLoss: followerData.maxDailyLoss,
            maxPositionSize: followerData.maxPositionSize,
            stopLossPercent: followerData.stopLossPercent,
            takeProfitPercent: followerData.takeProfitPercent,
        },
        currentUsage,
        canTrade: limitCheck.canTrade,
        reason: limitCheck.reason,
        currency: "USDT", // All values are normalized to USDT
    };
}
// ============================================================================
// AUTO-ACTIONS
// ============================================================================
/**
 * Check and execute auto-pause for followers exceeding limits
 */
async function checkAutoActions() {
    let checked = 0;
    let paused = 0;
    try {
        // Get all active followers with loss limits configured
        const followers = await db_1.models.copyTradingFollower.findAll({
            where: {
                status: "ACTIVE",
                maxDailyLoss: { [sequelize_1.Op.gt]: 0 },
            },
        });
        for (const follower of followers) {
            checked++;
            const stats = await getDailyStats(follower.id);
            if (stats.totalLoss >= follower.maxDailyLoss) {
                await pauseFollowerDueToDailyLimit(follower.id, stats.totalLoss, follower.maxDailyLoss);
                paused++;
            }
        }
        return { checked, paused };
    }
    catch (error) {
        console_1.logger.error("COPY_TRADING", "Failed to check auto actions", error);
        return { checked, paused };
    }
}
