"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.onClose = exports.copyTradingHandler = exports.metadata = void 0;
exports.broadcastTradeUpdate = broadcastTradeUpdate;
exports.broadcastLeaderUpdate = broadcastLeaderUpdate;
exports.broadcastLeaderboard = broadcastLeaderboard;
exports.broadcastUserNotification = broadcastUserNotification;
exports.broadcastSubscriptionUpdate = broadcastSubscriptionUpdate;
// Copy Trading WebSocket Handler - Real-time updates for copy trading
const Websocket_1 = require("@b/handler/Websocket");
const db_1 = require("@b/db");
const console_1 = require("@b/utils/console");
const sequelize_1 = require("sequelize");
const stats_calculator_1 = require("@b/api/(ext)/copy-trading/utils/stats-calculator");
exports.metadata = {
    requiresAuth: true,
};
// ============================================================================
// COPY TRADING DATA HANDLER
// ============================================================================
class CopyTradingDataHandler {
    constructor() {
        this.activeSubscriptions = new Map(); // channel -> Set<userId>
    }
    static getInstance() {
        if (!CopyTradingDataHandler.instance) {
            CopyTradingDataHandler.instance = new CopyTradingDataHandler();
        }
        return CopyTradingDataHandler.instance;
    }
    /**
     * Add a subscription for a user
     */
    async addSubscription(userId, channel, leaderId) {
        const subscriptionKey = leaderId ? `${channel}:${leaderId}` : channel;
        if (!this.activeSubscriptions.has(subscriptionKey)) {
            this.activeSubscriptions.set(subscriptionKey, new Set());
        }
        this.activeSubscriptions.get(subscriptionKey).add(userId);
        // Send initial data based on channel
        let initialData = null;
        switch (channel) {
            case "my_trades":
                initialData = await this.getMyTrades(userId);
                break;
            case "leader_updates":
                if (leaderId) {
                    initialData = await this.getLeaderData(leaderId);
                }
                break;
            case "all_leaders":
                initialData = await this.getLeaderboard();
                break;
            case "my_subscriptions":
                initialData = await this.getMySubscriptions(userId);
                break;
        }
        console_1.logger.info("COPY_TRADING_WS", `User ${userId} subscribed to ${subscriptionKey}`);
        return { success: true, data: initialData };
    }
    /**
     * Remove a subscription
     */
    removeSubscription(userId, channel, leaderId) {
        const subscriptionKey = leaderId ? `${channel}:${leaderId}` : channel;
        if (this.activeSubscriptions.has(subscriptionKey)) {
            this.activeSubscriptions.get(subscriptionKey).delete(userId);
            if (this.activeSubscriptions.get(subscriptionKey).size === 0) {
                this.activeSubscriptions.delete(subscriptionKey);
            }
            console_1.logger.info("COPY_TRADING_WS", `User ${userId} unsubscribed from ${subscriptionKey}`);
        }
    }
    /**
     * Remove all subscriptions for a user (called on disconnect)
     */
    removeAllSubscriptions(userId) {
        const keysToCleanup = [];
        for (const [key, users] of this.activeSubscriptions) {
            if (users.has(userId)) {
                users.delete(userId);
                if (users.size === 0) {
                    keysToCleanup.push(key);
                }
            }
        }
        for (const key of keysToCleanup) {
            this.activeSubscriptions.delete(key);
        }
        if (keysToCleanup.length > 0) {
            console_1.logger.info("COPY_TRADING_WS", `Cleaned up ${keysToCleanup.length} subscriptions for user ${userId}`);
        }
    }
    /**
     * Get user's active copy trades
     */
    async getMyTrades(userId) {
        try {
            const followerRecords = await db_1.models.copyTradingFollower.findAll({
                where: { userId, status: { [sequelize_1.Op.in]: ["ACTIVE", "PAUSED"] } },
                attributes: ["id"],
            });
            if (followerRecords.length === 0)
                return [];
            const followerIds = followerRecords.map((f) => f.id);
            const trades = await db_1.models.copyTradingTrade.findAll({
                where: {
                    followerId: { [sequelize_1.Op.in]: followerIds },
                    status: { [sequelize_1.Op.in]: ["OPEN", "PENDING", "PENDING_REPLICATION"] },
                },
                include: [
                    {
                        model: db_1.models.copyTradingLeader,
                        as: "leader",
                        attributes: ["id", "displayName"],
                    },
                ],
                order: [["createdAt", "DESC"]],
                limit: 50,
            });
            return trades.map((t) => t.toJSON());
        }
        catch (error) {
            console_1.logger.error("COPY_TRADING_WS", "Failed to get my trades", error);
            return [];
        }
    }
    /**
     * Get leader data
     */
    async getLeaderData(leaderId) {
        try {
            const leader = await db_1.models.copyTradingLeader.findByPk(leaderId, {
                include: [
                    {
                        model: db_1.models.user,
                        as: "user",
                        attributes: ["id", "firstName", "lastName", "avatar"],
                    },
                ],
            });
            if (!leader)
                return null;
            return leader.toJSON();
        }
        catch (error) {
            console_1.logger.error("COPY_TRADING_WS", "Failed to get leader data", error);
            return null;
        }
    }
    /**
     * Get leaderboard
     */
    async getLeaderboard() {
        try {
            const leaders = await db_1.models.copyTradingLeader.findAll({
                where: { status: "ACTIVE", isPublic: true },
                include: [
                    {
                        model: db_1.models.user,
                        as: "user",
                        attributes: ["id", "firstName", "lastName", "avatar"],
                    },
                ],
            });
            // Calculate stats for all leaders
            const leaderIds = leaders.map((l) => l.id);
            const statsMap = leaderIds.length > 0
                ? await (0, stats_calculator_1.calculateBatchLeaderStats)(leaderIds)
                : new Map();
            // Map leaders with stats and sort by ROI
            const leadersWithStats = leaders.map((l) => {
                var _a;
                const stats = statsMap.get(l.id) || { roi: 0, winRate: 0, totalFollowers: 0 };
                return {
                    id: l.id,
                    displayName: l.displayName,
                    avatar: l.avatar || ((_a = l.user) === null || _a === void 0 ? void 0 : _a.avatar),
                    roi: stats.roi,
                    winRate: stats.winRate,
                    totalFollowers: stats.totalFollowers,
                    tradingStyle: l.tradingStyle,
                    riskLevel: l.riskLevel,
                };
            });
            // Sort by ROI descending and limit to 50
            leadersWithStats.sort((a, b) => b.roi - a.roi);
            return leadersWithStats.slice(0, 50);
        }
        catch (error) {
            console_1.logger.error("COPY_TRADING_WS", "Failed to get leaderboard", error);
            return [];
        }
    }
    /**
     * Get user's subscriptions (leaders they follow)
     */
    async getMySubscriptions(userId) {
        try {
            const subscriptions = await db_1.models.copyTradingFollower.findAll({
                where: { userId, status: { [sequelize_1.Op.in]: ["ACTIVE", "PAUSED"] } },
                include: [
                    {
                        model: db_1.models.copyTradingLeader,
                        as: "leader",
                        include: [
                            {
                                model: db_1.models.user,
                                as: "user",
                                attributes: ["id", "firstName", "lastName", "avatar"],
                            },
                        ],
                    },
                ],
            });
            // Get stats for all leaders in these subscriptions
            const leaderIds = subscriptions
                .filter((s) => s.leader)
                .map((s) => s.leader.id);
            const leaderStatsMap = leaderIds.length > 0
                ? await (0, stats_calculator_1.calculateBatchLeaderStats)(leaderIds)
                : new Map();
            return subscriptions.map((s) => {
                var _a;
                const leaderStats = s.leader ? leaderStatsMap.get(s.leader.id) : null;
                return {
                    id: s.id,
                    status: s.status,
                    leader: s.leader
                        ? {
                            id: s.leader.id,
                            displayName: s.leader.displayName,
                            avatar: s.leader.avatar || ((_a = s.leader.user) === null || _a === void 0 ? void 0 : _a.avatar),
                            roi: (leaderStats === null || leaderStats === void 0 ? void 0 : leaderStats.roi) || 0,
                            winRate: (leaderStats === null || leaderStats === void 0 ? void 0 : leaderStats.winRate) || 0,
                        }
                        : null,
                };
            });
        }
        catch (error) {
            console_1.logger.error("COPY_TRADING_WS", "Failed to get my subscriptions", error);
            return [];
        }
    }
}
// Export the handler instance
exports.copyTradingHandler = CopyTradingDataHandler.getInstance();
// ============================================================================
// WEBSOCKET MESSAGE HANDLER
// ============================================================================
exports.default = async (ws, message) => {
    var _a;
    // Parse the incoming message if it's a string
    if (typeof message === "string") {
        try {
            message = JSON.parse(message);
        }
        catch (e) {
            return { error: "Invalid message format" };
        }
    }
    const userId = (_a = ws.user) === null || _a === void 0 ? void 0 : _a.id;
    if (!userId) {
        return { error: "Authentication required" };
    }
    const { action, payload } = message;
    const { channel, leaderId } = payload || {};
    if (!channel) {
        return { error: "Channel is required" };
    }
    const handler = CopyTradingDataHandler.getInstance();
    if (action === "SUBSCRIBE") {
        const result = await handler.addSubscription(userId, channel, leaderId);
        return {
            subscribed: channel,
            leaderId,
            data: result.data,
        };
    }
    else if (action === "UNSUBSCRIBE") {
        handler.removeSubscription(userId, channel, leaderId);
        return {
            unsubscribed: channel,
            leaderId,
        };
    }
    return { error: "Unknown action" };
};
// ============================================================================
// HANDLE CLIENT DISCONNECT
// ============================================================================
const onClose = (ws, route, clientId) => {
    const handler = CopyTradingDataHandler.getInstance();
    handler.removeAllSubscriptions(clientId);
};
exports.onClose = onClose;
// ============================================================================
// BROADCAST FUNCTIONS (for use by other modules)
// ============================================================================
/**
 * Broadcast a trade update to relevant subscribers
 */
function broadcastTradeUpdate(trade, eventType) {
    var _a;
    const message = {
        type: `trade_${eventType}`,
        trade: {
            id: trade.id,
            symbol: trade.symbol,
            side: trade.side,
            amount: trade.amount,
            price: trade.price,
            profit: trade.profit,
            status: trade.status,
        },
        leaderId: trade.leaderId,
        followerId: trade.followerId,
    };
    // Broadcast to leader's subscribers
    Websocket_1.messageBroker.broadcastToSubscribedClients(`/api/ext/copy-trading`, { channel: "leader_updates", leaderId: trade.leaderId }, { stream: "leader_trade", data: message });
    // Broadcast to follower if applicable
    if (trade.followerId && ((_a = trade.follower) === null || _a === void 0 ? void 0 : _a.userId)) {
        Websocket_1.messageBroker.broadcastToSubscribedClients(`/api/ext/copy-trading`, { channel: "my_trades", userId: trade.follower.userId }, { stream: "my_trade", data: message });
    }
}
/**
 * Broadcast leader stats update
 * @param leader - Leader object with id and displayName
 * @param stats - Calculated stats (roi, winRate, totalFollowers) from stats-calculator
 */
function broadcastLeaderUpdate(leader, stats) {
    const message = {
        type: "leader_stats",
        leader: {
            id: leader.id,
            displayName: leader.displayName,
            roi: stats.roi,
            winRate: stats.winRate,
            totalFollowers: stats.totalFollowers,
        },
    };
    // Broadcast to leader's subscribers
    Websocket_1.messageBroker.broadcastToSubscribedClients(`/api/ext/copy-trading`, { channel: "leader_updates", leaderId: leader.id }, { stream: "leader_stats", data: message });
    // Broadcast to leaderboard subscribers
    Websocket_1.messageBroker.broadcastToSubscribedClients(`/api/ext/copy-trading`, { channel: "all_leaders" }, { stream: "leaderboard_update", data: message });
}
/**
 * Broadcast leaderboard update
 */
async function broadcastLeaderboard() {
    try {
        const leaders = await db_1.models.copyTradingLeader.findAll({
            where: { status: "ACTIVE", isPublic: true },
            include: [
                {
                    model: db_1.models.user,
                    as: "user",
                    attributes: ["id", "firstName", "lastName", "avatar"],
                },
            ],
        });
        // Calculate stats for all leaders
        const leaderIds = leaders.map((l) => l.id);
        const statsMap = leaderIds.length > 0
            ? await (0, stats_calculator_1.calculateBatchLeaderStats)(leaderIds)
            : new Map();
        // Map leaders with stats and sort by ROI
        const leadersWithStats = leaders.map((l) => {
            var _a;
            const stats = statsMap.get(l.id) || { roi: 0, winRate: 0, totalFollowers: 0 };
            return {
                id: l.id,
                displayName: l.displayName,
                avatar: l.avatar || ((_a = l.user) === null || _a === void 0 ? void 0 : _a.avatar),
                roi: stats.roi,
                winRate: stats.winRate,
                totalFollowers: stats.totalFollowers,
                tradingStyle: l.tradingStyle,
                riskLevel: l.riskLevel,
            };
        });
        // Sort by ROI descending and limit to 50
        leadersWithStats.sort((a, b) => b.roi - a.roi);
        const leaderboard = leadersWithStats.slice(0, 50);
        Websocket_1.messageBroker.broadcastToSubscribedClients(`/api/ext/copy-trading`, { channel: "all_leaders" }, { stream: "leaderboard", data: leaderboard });
    }
    catch (error) {
        console_1.logger.error("COPY_TRADING_WS", "Failed to broadcast leaderboard", error);
    }
}
/**
 * Broadcast notification to a specific user
 */
function broadcastUserNotification(userId, notification) {
    Websocket_1.messageBroker.broadcastToSubscribedClients(`/api/ext/copy-trading`, { channel: "my_trades", userId }, { stream: "notification", data: notification });
}
/**
 * Broadcast follower subscription status change
 */
function broadcastSubscriptionUpdate(followerId, status, follower) {
    const message = {
        type: "subscription_update",
        followerId,
        status,
        leaderId: follower.leaderId,
    };
    // Broadcast to the follower
    Websocket_1.messageBroker.broadcastToSubscribedClients(`/api/ext/copy-trading`, { channel: "my_trades", userId: follower.userId }, { stream: "subscription_update", data: message });
}
