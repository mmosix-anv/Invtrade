"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.metadata = void 0;
const db_1 = require("@b/db");
const error_1 = require("@b/utils/error");
const query_1 = require("@b/utils/query");
const sequelize_1 = require("sequelize");
exports.metadata = {
    summary: "Retrieves affiliate program statistics",
    description: "Fetches public statistics for the affiliate program including total affiliates, total paid out, average monthly earnings, and success rate.",
    operationId: "getAffiliateStats",
    tags: ["Affiliate", "Stats"],
    logModule: "AFFILIATE",
    logTitle: "Get Public Stats",
    responses: {
        200: {
            description: "Affiliate stats retrieved successfully",
            content: {
                "application/json": {
                    schema: {
                        type: "object",
                        properties: {
                            totalAffiliates: {
                                type: "number",
                                description: "Total number of affiliates with referrals",
                            },
                            totalPaidOut: {
                                type: "number",
                                description: "Total amount paid out in rewards",
                            },
                            avgMonthlyEarnings: {
                                type: "number",
                                description: "Average monthly earnings per affiliate",
                            },
                            successRate: {
                                type: "number",
                                description: "Success rate percentage (active referrals / total referrals)",
                            },
                        },
                        required: ["totalAffiliates", "totalPaidOut", "avgMonthlyEarnings", "successRate"],
                    },
                },
            },
        },
        500: query_1.serverErrorResponse,
    },
};
exports.default = async (data) => {
    const { ctx } = data;
    ctx === null || ctx === void 0 ? void 0 : ctx.step("Fetching Affiliate Program Stats");
    try {
        // Fetch all stats in parallel
        const [totalAffiliatesCount, totalPaidOutResult, totalReferralsCount, activeReferralsCount, avgEarningsResult,] = await Promise.all([
            // Count unique affiliates who have made referrals
            db_1.models.mlmReferral.count({
                distinct: true,
                col: "referrerId",
            }),
            // Sum of all rewards paid out
            db_1.models.mlmReferralReward.findOne({
                attributes: [[(0, sequelize_1.fn)("SUM", (0, sequelize_1.col)("reward")), "total"]],
                raw: true,
            }),
            // Total number of referrals
            db_1.models.mlmReferral.count(),
            // Number of active referrals
            db_1.models.mlmReferral.count({
                where: { status: "ACTIVE" },
            }),
            // Average monthly earnings per affiliate (last 30 days)
            db_1.models.mlmReferralReward.findOne({
                attributes: [[(0, sequelize_1.fn)("AVG", (0, sequelize_1.col)("reward")), "avgReward"]],
                where: {
                    createdAt: {
                        [sequelize_1.Op.gte]: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
                    },
                },
                raw: true,
            }),
        ]);
        // Calculate stats
        const totalPaidOut = parseFloat(totalPaidOutResult === null || totalPaidOutResult === void 0 ? void 0 : totalPaidOutResult.total) || 0;
        const avgMonthlyEarnings = parseFloat(avgEarningsResult === null || avgEarningsResult === void 0 ? void 0 : avgEarningsResult.avgReward) || 0;
        const successRate = totalReferralsCount > 0
            ? Math.round((activeReferralsCount / totalReferralsCount) * 100)
            : 0;
        const stats = {
            totalAffiliates: totalAffiliatesCount,
            totalPaidOut: Math.round(totalPaidOut * 100) / 100, // Round to 2 decimals
            avgMonthlyEarnings: Math.round(avgMonthlyEarnings * 100) / 100,
            successRate,
        };
        ctx === null || ctx === void 0 ? void 0 : ctx.success(`Stats fetched: ${stats.totalAffiliates} affiliates, $${stats.totalPaidOut} paid out`);
        return stats;
    }
    catch (error) {
        throw (0, error_1.createError)({
            statusCode: 500,
            message: `Error retrieving affiliate stats: ${error.message}`,
        });
    }
};
