"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.metadata = void 0;
// User Copy Trading Dashboard
const db_1 = require("@b/db");
const error_1 = require("@b/utils/error");
const sequelize_1 = require("sequelize");
const utils_1 = require("./utils");
exports.metadata = {
    summary: "Get Copy Trading Dashboard",
    description: "Retrieves the user's copy trading dashboard overview including leader profile (if any), subscriptions summary, and recent trades.",
    operationId: "getCopyTradingDashboard",
    tags: ["Copy Trading"],
    requiresAuth: true,
    logModule: "COPY",
    logTitle: "Get dashboard",
    responses: {
        200: {
            description: "Dashboard retrieved successfully",
            content: {
                "application/json": {
                    schema: {
                        type: "object",
                        properties: {
                            isLeader: { type: "boolean" },
                            leaderProfile: { type: "object", nullable: true },
                            subscriptions: {
                                type: "object",
                                properties: {
                                    active: { type: "number" },
                                    paused: { type: "number" },
                                    totalProfit: { type: "number" },
                                    totalROI: { type: "number" },
                                },
                            },
                            recentTrades: { type: "array" },
                            settings: { type: "object" },
                        },
                    },
                },
            },
        },
        401: { description: "Unauthorized" },
        500: { description: "Internal Server Error" },
    },
};
exports.default = async (data) => {
    const { user, ctx } = data;
    if (!(user === null || user === void 0 ? void 0 : user.id)) {
        throw (0, error_1.createError)({ statusCode: 401, message: "Unauthorized" });
    }
    ctx === null || ctx === void 0 ? void 0 : ctx.step("Fetching leader profile");
    // Check if user is a leader
    const leaderProfile = await (0, utils_1.getLeaderByUserId)(user.id);
    const isLeader = !!leaderProfile && leaderProfile.status === "ACTIVE";
    // Get leader stats if user is a leader
    let leaderStats = null;
    if (leaderProfile) {
        const activeFollowers = await db_1.models.copyTradingFollower.count({
            where: { leaderId: leaderProfile.id, status: "ACTIVE" },
        });
        const pausedFollowers = await db_1.models.copyTradingFollower.count({
            where: { leaderId: leaderProfile.id, status: "PAUSED" },
        });
        // Total allocated is now calculated from allocations, not follower records
        const totalAllocatedByFollowers = 0; // TODO: Calculate from allocations if needed
        // Get recent leader trades
        const recentLeaderTrades = await db_1.models.copyTradingTrade.findAll({
            where: { leaderId: leaderProfile.id, followerId: null },
            order: [["createdAt", "DESC"]],
            limit: 5,
        });
        leaderStats = {
            ...leaderProfile.toJSON(),
            activeFollowers,
            pausedFollowers,
            totalAllocatedByFollowers,
            recentTrades: recentLeaderTrades.map((t) => t.toJSON()),
        };
    }
    ctx === null || ctx === void 0 ? void 0 : ctx.step("Fetching subscriptions");
    // Get user's subscriptions (as follower)
    const subscriptions = await db_1.models.copyTradingFollower.findAll({
        where: { userId: user.id, status: { [sequelize_1.Op.ne]: "STOPPED" } },
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
    const activeCount = subscriptions.filter((s) => s.status === "ACTIVE").length;
    const pausedCount = subscriptions.filter((s) => s.status === "PAUSED").length;
    const totalProfit = subscriptions.reduce((sum, s) => sum + (s.totalProfit || 0), 0);
    // TODO: Calculate total allocated from allocations if needed for ROI
    const totalROI = 0; // ROI calculation needs to be based on allocations
    ctx === null || ctx === void 0 ? void 0 : ctx.step("Fetching recent trades");
    // Get recent trades as follower
    const followerIds = subscriptions.map((s) => s.id);
    let recentTrades = [];
    if (followerIds.length > 0) {
        recentTrades = await db_1.models.copyTradingTrade.findAll({
            where: { followerId: { [sequelize_1.Op.in]: followerIds } },
            include: [
                {
                    model: db_1.models.copyTradingLeader,
                    as: "leader",
                    attributes: ["id", "displayName"],
                },
            ],
            order: [["createdAt", "DESC"]],
            limit: 10,
        });
    }
    ctx === null || ctx === void 0 ? void 0 : ctx.step("Fetching settings");
    // Get settings
    const settings = await (0, utils_1.getCopyTradingSettings)();
    ctx === null || ctx === void 0 ? void 0 : ctx.success("Dashboard retrieved");
    return {
        isLeader,
        leaderProfile: leaderStats,
        subscriptions: {
            active: activeCount,
            paused: pausedCount,
            total: subscriptions.length,
            totalProfit,
            totalROI: Math.round(totalROI * 100) / 100,
            items: subscriptions.map((s) => s.toJSON()),
        },
        recentTrades: recentTrades.map((t) => t.toJSON()),
        settings: {
            maxLeadersPerFollower: settings.maxLeadersPerFollower,
            minAllocationAmount: settings.minAllocationAmount,
            maxAllocationPercent: settings.maxAllocationPercent,
        },
    };
};
