"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.metadata = void 0;
const db_1 = require("@b/db");
const error_1 = require("@b/utils/error");
const sequelize_1 = require("sequelize");
exports.metadata = {
    summary: "Get Staking Pool Analytics",
    description: "Retrieves detailed analytics for a specific staking pool.",
    operationId: "getStakingPoolAnalytics",
    tags: ["Staking", "Pools", "Analytics"],
    requiresAuth: true,
    parameters: [
        {
            index: 0,
            name: "id",
            in: "path",
            required: true,
            schema: { type: "string" },
            description: "Pool ID",
        },
        {
            index: 1,
            name: "timeframe",
            in: "query",
            required: false,
            schema: { type: "string", enum: ["week", "month", "year", "all"] },
            description: "Timeframe for analytics data",
        },
    ],
    responses: {
        200: {
            description: "Pool analytics retrieved successfully",
            content: {
                "application/json": {
                    schema: {
                        type: "object",
                        properties: {
                            analytics: { type: "object" },
                        },
                    },
                },
            },
        },
        401: { description: "Unauthorized" },
        404: { description: "Pool not found" },
        500: { description: "Internal Server Error" },
    },
};
exports.default = async (data) => {
    const { user, params, query } = data;
    if (!(user === null || user === void 0 ? void 0 : user.id)) {
        throw (0, error_1.createError)({ statusCode: 401, message: "Unauthorized" });
    }
    const { id } = params;
    const timeframe = query.timeframe || "month";
    // Verify pool exists
    const pool = await db_1.models.stakingPool.findOne({
        where: { id },
    });
    if (!pool) {
        throw (0, error_1.createError)({ statusCode: 404, message: "Pool not found" });
    }
    // Calculate date range based on timeframe
    const now = new Date();
    let startDate;
    switch (timeframe) {
        case "week":
            startDate = new Date(now);
            startDate.setDate(now.getDate() - 7);
            break;
        case "month":
            startDate = new Date(now);
            startDate.setMonth(now.getMonth() - 1);
            break;
        case "year":
            startDate = new Date(now);
            startDate.setFullYear(now.getFullYear() - 1);
            break;
        case "all":
            startDate = new Date(0);
            break;
        default:
            startDate = new Date(now);
            startDate.setMonth(now.getMonth() - 1);
    }
    // Compute total staked amount using valid statuses ("ACTIVE", "COMPLETED")
    const totalStaked = await db_1.models.stakingPosition.sum("amount", {
        where: {
            poolId: pool.id,
            status: { [sequelize_1.Op.in]: ["ACTIVE", "COMPLETED"] },
        },
    });
    // Compute total stakers count using valid statuses ("ACTIVE", "COMPLETED")
    const totalStakers = await db_1.models.stakingPosition.count({
        where: {
            poolId: pool.id,
            status: { [sequelize_1.Op.in]: ["ACTIVE", "COMPLETED"] },
        },
        distinct: true,
        col: "userId",
    });
    // Compute total earnings generated within the timeframe
    const totalEarnings = await db_1.models.stakingEarningRecord.sum("amount", {
        where: {
            poolId: pool.id,
            createdAt: { [sequelize_1.Op.gte]: startDate },
        },
    });
    // Fetch performance history (records after startDate)
    const performanceHistory = await db_1.models.stakingExternalPoolPerformance.findAll({
        where: {
            poolId: pool.id,
            date: { [sequelize_1.Op.gte]: startDate },
        },
        order: [["date", "ASC"]],
    });
    // Calculate staking growth over time (new positions by day)
    const stakingGrowth = await db_1.models.stakingPosition.findAll({
        attributes: [
            [(0, sequelize_1.fn)("DATE", (0, sequelize_1.col)("createdAt")), "date"],
            [(0, sequelize_1.fn)("SUM", (0, sequelize_1.col)("amount")), "totalAmount"],
            [(0, sequelize_1.fn)("COUNT", (0, sequelize_1.col)("id")), "count"],
        ],
        where: {
            poolId: pool.id,
            createdAt: { [sequelize_1.Op.gte]: startDate },
        },
        group: [(0, sequelize_1.fn)("DATE", (0, sequelize_1.col)("createdAt"))],
        order: [[(0, sequelize_1.fn)("DATE", (0, sequelize_1.col)("createdAt")), "ASC"]],
        raw: true,
    });
    // Calculate withdrawal data from positions with "COMPLETED" status
    const withdrawals = await db_1.models.stakingPosition.findAll({
        attributes: [
            [(0, sequelize_1.fn)("DATE", (0, sequelize_1.col)("updatedAt")), "date"],
            [(0, sequelize_1.fn)("SUM", (0, sequelize_1.col)("amount")), "totalAmount"],
            [(0, sequelize_1.fn)("COUNT", (0, sequelize_1.col)("id")), "count"],
        ],
        where: {
            poolId: pool.id,
            status: "COMPLETED",
            updatedAt: { [sequelize_1.Op.gte]: startDate },
        },
        group: [(0, sequelize_1.fn)("DATE", (0, sequelize_1.col)("updatedAt"))],
        order: [[(0, sequelize_1.fn)("DATE", (0, sequelize_1.col)("updatedAt")), "ASC"]],
        raw: true,
    });
    return {
        analytics: {
            poolId: pool.id,
            poolName: pool.name,
            tokenSymbol: pool.symbol,
            apr: pool.apr,
            totalStaked: totalStaked || 0,
            totalStakers: totalStakers || 0,
            totalEarnings: totalEarnings || 0,
            performanceHistory,
            stakingGrowth,
            withdrawals,
            timeframe,
        },
    };
};
