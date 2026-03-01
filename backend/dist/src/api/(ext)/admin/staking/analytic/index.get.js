"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.metadata = void 0;
const db_1 = require("@b/db");
const error_1 = require("@b/utils/error");
const sequelize_1 = require("sequelize");
exports.metadata = {
    summary: "Get Staking Analytics",
    description: "Retrieves aggregated analytics data for the staking system, including total staked amounts, user counts, and performance metrics.",
    operationId: "getStakingAnalytics",
    tags: ["Staking", "Admin", "Analytics"],
    requiresAuth: true,
    logModule: "ADMIN_STAKE",
    logTitle: "Get Staking Analytics",
    responses: {
        200: {
            description: "Analytics retrieved successfully",
            content: {
                "application/json": {
                    schema: {
                        type: "object",
                        properties: {
                            totalStaked: { type: "number" },
                            totalUsers: { type: "number" },
                            totalPools: { type: "number" },
                            stakingByToken: {
                                type: "object",
                                additionalProperties: { type: "number" },
                            },
                            stakingOverTime: {
                                type: "array",
                                items: {
                                    type: "object",
                                    properties: {
                                        date: { type: "string" },
                                        amount: { type: "number" },
                                    },
                                },
                            },
                            stakedChangePercent: { type: "number" },
                            usersChangePercent: { type: "number" },
                            rewardsChangePercent: { type: "number" },
                            activePoolsCount: { type: "number" },
                            averageAPR: { type: "number" },
                            totalRewardsDistributed: { type: "number" },
                            totalAdminEarnings: { type: "number" },
                            adminEarningsByPool: {
                                type: "object",
                                additionalProperties: { type: "number" },
                            },
                            averageUserROI: { type: "number" },
                            earlyWithdrawalRate: { type: "number" },
                            retentionRate: { type: "number" },
                            poolPerformance: {
                                type: "object",
                                additionalProperties: {
                                    type: "object",
                                    properties: {
                                        apr: { type: "number" },
                                        profit: { type: "number" },
                                        efficiency: { type: "number" },
                                    },
                                },
                            },
                        },
                    },
                },
            },
        },
        401: { description: "Unauthorized" },
        500: { description: "Internal Server Error" },
    },
    permission: "access.staking",
};
exports.default = async (data) => {
    const { user, ctx } = data;
    if (!(user === null || user === void 0 ? void 0 : user.id)) {
        throw (0, error_1.createError)({ statusCode: 401, message: "Unauthorized" });
    }
    try {
        ctx === null || ctx === void 0 ? void 0 : ctx.step("Fetching data");
        // Get total staked amount
        const totalStakedResult = await db_1.models.stakingPosition.findOne({
            attributes: [[(0, sequelize_1.fn)("SUM", (0, sequelize_1.col)("amount")), "totalStaked"]],
            where: {
                status: "ACTIVE",
            },
            raw: true,
        });
        const totalStaked = (totalStakedResult === null || totalStakedResult === void 0 ? void 0 : totalStakedResult.totalStaked) || 0;
        // Get total unique users
        const totalUsersResult = await db_1.models.stakingPosition.findOne({
            attributes: [[(0, sequelize_1.fn)("COUNT", (0, sequelize_1.fn)("DISTINCT", (0, sequelize_1.col)("userId"))), "totalUsers"]],
            raw: true,
        });
        const totalUsers = (totalUsersResult === null || totalUsersResult === void 0 ? void 0 : totalUsersResult.totalUsers) || 0;
        // Get total pools
        const totalPoolsResult = await db_1.models.stakingPool.count({
            raw: true,
        });
        const totalPools = totalPoolsResult || 0;
        // Get active pools count
        const activePoolsResult = await db_1.models.stakingPool.count({
            where: {
                status: "ACTIVE",
            },
            raw: true,
        });
        const activePoolsCount = activePoolsResult || 0;
        // Get staking by token
        const stakingByTokenResult = await db_1.models.stakingPosition.findAll({
            attributes: [
                [(0, sequelize_1.col)("pool.token"), "token"],
                [(0, sequelize_1.fn)("SUM", (0, sequelize_1.col)("stakingPosition.amount")), "amount"],
            ],
            include: [
                {
                    model: db_1.models.stakingPool,
                    as: "pool",
                    attributes: [],
                },
            ],
            where: {
                status: "ACTIVE",
            },
            group: [(0, sequelize_1.col)("pool.token")],
            raw: true,
        });
        const stakingByToken = stakingByTokenResult.reduce((acc, item) => {
            acc[item.token] = Number.parseFloat(item.amount);
            return acc;
        }, {});
        // Get total rewards distributed
        const totalRewardsResult = await db_1.models.stakingEarningRecord.findOne({
            attributes: [[(0, sequelize_1.fn)("SUM", (0, sequelize_1.col)("amount")), "totalRewards"]],
            raw: true,
        });
        const totalRewardsDistributed = (totalRewardsResult === null || totalRewardsResult === void 0 ? void 0 : totalRewardsResult.totalRewards) || 0;
        // Get total admin earnings
        const totalAdminEarningsResult = await db_1.models.stakingAdminEarning.findOne({
            attributes: [[(0, sequelize_1.fn)("SUM", (0, sequelize_1.col)("amount")), "totalAdminEarnings"]],
            where: {
                isClaimed: true,
            },
            raw: true,
        });
        const totalAdminEarnings = (totalAdminEarningsResult === null || totalAdminEarningsResult === void 0 ? void 0 : totalAdminEarningsResult.totalAdminEarnings) || 0;
        // Get admin earnings by pool
        const adminEarningsByPoolResult = await db_1.models.stakingAdminEarning.findAll({
            attributes: [
                [(0, sequelize_1.col)("poolId"), "poolId"],
                [(0, sequelize_1.fn)("SUM", (0, sequelize_1.col)("amount")), "amount"],
            ],
            where: {
                isClaimed: true,
            },
            group: [(0, sequelize_1.col)("poolId")],
            raw: true,
        });
        const adminEarningsByPool = adminEarningsByPoolResult.reduce((acc, item) => {
            acc[item.poolId] = Number.parseFloat(item.amount);
            return acc;
        }, {});
        // Get average APR
        const averageAPRResult = await db_1.models.stakingPool.findOne({
            attributes: [[(0, sequelize_1.fn)("AVG", (0, sequelize_1.col)("apr")), "averageAPR"]],
            where: {
                status: "ACTIVE",
            },
            raw: true,
        });
        const averageAPR = (averageAPRResult === null || averageAPRResult === void 0 ? void 0 : averageAPRResult.averageAPR) || 0;
        // Calculate average user ROI
        const averageUserROI = totalStaked > 0 ? (totalRewardsDistributed / totalStaked) * 100 : 0;
        // Get pool performance data
        const poolPerformanceData = await db_1.models.stakingExternalPoolPerformance.findAll({
            attributes: [
                "poolId",
                [(0, sequelize_1.fn)("AVG", (0, sequelize_1.col)("apr")), "avgApr"],
                [(0, sequelize_1.fn)("SUM", (0, sequelize_1.col)("profit")), "totalProfit"],
            ],
            group: ["poolId"],
            raw: true,
        });
        // Get all pools for efficiency calculation
        const allPools = await db_1.models.stakingPool.findAll({
            attributes: {
                include: [
                    "id",
                    "apr",
                    [
                        // Subquery to sum all positions for each pool
                        (0, sequelize_1.literal)(`(
              SELECT COALESCE(SUM(sp.amount), 0)
              FROM staking_positions AS sp
              WHERE sp.poolId = stakingPool.id
            )`),
                        "totalStaked",
                    ],
                ],
            },
            raw: true,
        });
        // Calculate pool performance metrics
        const poolPerformance = {};
        allPools.forEach((pool) => {
            const performance = poolPerformanceData.find((p) => p.poolId === pool.id);
            if (performance) {
                const avgApr = Number.parseFloat(performance.avgApr);
                const totalProfit = Number.parseFloat(performance.totalProfit);
                const expectedProfit = pool.totalStaked * (avgApr / 100);
                const efficiency = expectedProfit > 0 ? totalProfit / expectedProfit : 0;
                poolPerformance[pool.id] = {
                    apr: avgApr,
                    profit: totalProfit,
                    efficiency,
                };
            }
            else {
                poolPerformance[pool.id] = {
                    apr: pool.apr,
                    profit: 0,
                    efficiency: 0,
                };
            }
        });
        // Get staking over time (last 30 days)
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
        const stakingOverTimeResult = await db_1.models.stakingPosition.findAll({
            attributes: [
                [(0, sequelize_1.fn)("DATE", (0, sequelize_1.col)("createdAt")), "date"],
                [(0, sequelize_1.fn)("SUM", (0, sequelize_1.col)("amount")), "amount"],
            ],
            where: {
                createdAt: {
                    [sequelize_1.Op.gte]: thirtyDaysAgo,
                },
            },
            group: [(0, sequelize_1.fn)("DATE", (0, sequelize_1.col)("createdAt"))],
            order: [[(0, sequelize_1.fn)("DATE", (0, sequelize_1.col)("createdAt")), "ASC"]],
            raw: true,
        });
        const stakingOverTime = stakingOverTimeResult.map((item) => ({
            date: item.date,
            amount: Number.parseFloat(item.amount),
        }));
        // Calculate change percentages (simplified - would need more data for accurate calculation)
        // In a real implementation, you would compare with previous period
        const stakedChangePercent = 0;
        const usersChangePercent = 0;
        const rewardsChangePercent = 0;
        // Calculate early withdrawal rate and retention rate
        // These would require more complex calculations in a real implementation
        const earlyWithdrawalRate = 0;
        const retentionRate = 0;
        ctx === null || ctx === void 0 ? void 0 : ctx.success("Staking analytics retrieved successfully");
        return {
            totalStaked,
            totalUsers,
            totalPools,
            stakingByToken,
            stakingOverTime,
            stakedChangePercent,
            usersChangePercent,
            rewardsChangePercent,
            activePoolsCount,
            averageAPR,
            totalRewardsDistributed,
            totalAdminEarnings,
            adminEarningsByPool,
            averageUserROI,
            earlyWithdrawalRate,
            retentionRate,
            poolPerformance,
        };
    }
    catch (error) {
        console.error("Error fetching staking analytics:", error);
        throw (0, error_1.createError)({
            statusCode: 500,
            message: "Failed to fetch staking analytics",
        });
    }
};
