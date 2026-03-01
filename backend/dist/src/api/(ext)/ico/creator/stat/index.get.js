"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.metadata = void 0;
const db_1 = require("@b/db");
const error_1 = require("@b/utils/error");
const sequelize_1 = require("sequelize");
exports.metadata = {
    summary: "Get Creator Stats",
    description: "Retrieves aggregated statistics (counts, growth metrics) for the authenticated creator's ICO offerings, " +
        "and calculates total raised and raise growth from all transactions except those with a 'REJECTED' status.",
    operationId: "getCreatorStatsStats",
    tags: ["ICO", "Creator", "Stats"],
    logModule: "ICO",
    logTitle: "Get Creator Stats",
    requiresAuth: true,
    responses: {
        200: {
            description: "Creator statistics retrieved successfully",
            content: {
                "application/json": {
                    schema: {
                        type: "object",
                        properties: {
                            totalOfferings: { type: "number" },
                            pendingOfferings: { type: "number" },
                            activeOfferings: { type: "number" },
                            completedOfferings: { type: "number" },
                            rejectedOfferings: { type: "number" },
                            totalRaised: { type: "number" },
                            currentRaised: { type: "number" },
                            previousRaised: { type: "number" },
                            offeringsGrowth: { type: "number" },
                            activeGrowth: { type: "number" },
                            raiseGrowth: { type: "number" }
                        }
                    }
                }
            }
        },
        401: {
            description: "Unauthorized"
        },
        500: {
            description: "Internal server error"
        }
    }
};
exports.default = async (data) => {
    const { user, ctx } = data;
    if (!(user === null || user === void 0 ? void 0 : user.id)) {
        throw (0, error_1.createError)({ statusCode: 401, message: "Unauthorized" });
    }
    ctx === null || ctx === void 0 ? void 0 : ctx.step("Fetching creator stats");
    const userId = user.id;
    const now = new Date();
    const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const previousMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const previousMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0);
    // Aggregated query for overall offering counts
    const offeringStatsPromise = db_1.models.icoTokenOffering.findOne({
        attributes: [
            [(0, sequelize_1.fn)("COUNT", (0, sequelize_1.literal)("*")), "totalOfferings"],
            [
                (0, sequelize_1.fn)("SUM", (0, sequelize_1.literal)(`CASE WHEN \`icoTokenOffering\`.\`status\` = 'PENDING' THEN 1 ELSE 0 END`)),
                "pendingOfferings",
            ],
            [
                (0, sequelize_1.fn)("SUM", (0, sequelize_1.literal)(`CASE WHEN \`icoTokenOffering\`.\`status\` = 'ACTIVE' THEN 1 ELSE 0 END`)),
                "activeOfferings",
            ],
            [
                (0, sequelize_1.fn)("SUM", (0, sequelize_1.literal)(`CASE WHEN \`icoTokenOffering\`.\`status\` = 'SUCCESS' THEN 1 ELSE 0 END`)),
                "completedOfferings",
            ],
            [
                (0, sequelize_1.fn)("SUM", (0, sequelize_1.literal)(`CASE WHEN \`icoTokenOffering\`.\`status\` = 'REJECTED' THEN 1 ELSE 0 END`)),
                "rejectedOfferings",
            ],
        ],
        where: { userId },
        raw: true,
    });
    // Aggregated query for monthly offering stats (current and previous month)
    const monthStatsPromise = db_1.models.icoTokenOffering.findOne({
        attributes: [
            [
                (0, sequelize_1.fn)("SUM", (0, sequelize_1.literal)(`CASE WHEN \`icoTokenOffering\`.\`createdAt\` >= '${currentMonthStart.toISOString()}' THEN 1 ELSE 0 END`)),
                "currentOfferingsCount",
            ],
            [
                (0, sequelize_1.fn)("SUM", (0, sequelize_1.literal)(`CASE WHEN \`icoTokenOffering\`.\`createdAt\` >= '${currentMonthStart.toISOString()}' AND \`icoTokenOffering\`.\`status\` = 'ACTIVE' THEN 1 ELSE 0 END`)),
                "currentActive",
            ],
            [
                (0, sequelize_1.fn)("SUM", (0, sequelize_1.literal)(`CASE WHEN \`icoTokenOffering\`.\`createdAt\` >= '${currentMonthStart.toISOString()}' THEN 1 ELSE 0 END`)),
                "currentTotal",
            ],
            [
                (0, sequelize_1.fn)("SUM", (0, sequelize_1.literal)(`CASE WHEN \`icoTokenOffering\`.\`createdAt\` BETWEEN '${previousMonthStart.toISOString()}' AND '${previousMonthEnd.toISOString()}' THEN 1 ELSE 0 END`)),
                "previousOfferingsCount",
            ],
            [
                (0, sequelize_1.fn)("SUM", (0, sequelize_1.literal)(`CASE WHEN \`icoTokenOffering\`.\`createdAt\` BETWEEN '${previousMonthStart.toISOString()}' AND '${previousMonthEnd.toISOString()}' AND \`icoTokenOffering\`.\`status\` = 'ACTIVE' THEN 1 ELSE 0 END`)),
                "previousActive",
            ],
            [
                (0, sequelize_1.fn)("SUM", (0, sequelize_1.literal)(`CASE WHEN \`icoTokenOffering\`.\`createdAt\` BETWEEN '${previousMonthStart.toISOString()}' AND '${previousMonthEnd.toISOString()}' THEN 1 ELSE 0 END`)),
                "previousTotal",
            ],
        ],
        where: { userId },
        raw: true,
    });
    // Aggregated query for transactions (total, current month, and previous month)
    const transactionStatsPromise = db_1.models.icoTransaction.findOne({
        attributes: [
            [
                (0, sequelize_1.fn)("SUM", (0, sequelize_1.literal)(`CASE WHEN \`icoTransaction\`.\`status\` NOT IN ('REJECTED') THEN \`icoTransaction\`.\`price\` * \`icoTransaction\`.\`amount\` ELSE 0 END`)),
                "totalRaised",
            ],
            [
                (0, sequelize_1.fn)("SUM", (0, sequelize_1.literal)(`CASE WHEN \`icoTransaction\`.\`createdAt\` >= '${currentMonthStart.toISOString()}' AND \`icoTransaction\`.\`status\` NOT IN ('REJECTED') THEN \`icoTransaction\`.\`price\` * \`icoTransaction\`.\`amount\` ELSE 0 END`)),
                "currentRaised",
            ],
            [
                (0, sequelize_1.fn)("SUM", (0, sequelize_1.literal)(`CASE WHEN \`icoTransaction\`.\`createdAt\` BETWEEN '${previousMonthStart.toISOString()}' AND '${previousMonthEnd.toISOString()}' AND \`icoTransaction\`.\`status\` NOT IN ('REJECTED') THEN \`icoTransaction\`.\`price\` * \`icoTransaction\`.\`amount\` ELSE 0 END`)),
                "previousRaised",
            ],
        ],
        include: [
            {
                model: db_1.models.icoTokenOffering,
                as: "offering",
                attributes: [],
                where: { userId },
            },
        ],
        raw: true,
    });
    // Execute aggregated queries concurrently
    const [offeringStats, monthStats, transactionStats] = await Promise.all([
        offeringStatsPromise,
        monthStatsPromise,
        transactionStatsPromise,
    ]);
    // Parse aggregated values
    const totalOfferings = parseInt(offeringStats.totalOfferings, 10) || 0;
    const pendingOfferings = parseInt(offeringStats.pendingOfferings, 10) || 0;
    const activeOfferings = parseInt(offeringStats.activeOfferings, 10) || 0;
    const completedOfferings = parseInt(offeringStats.completedOfferings, 10) || 0;
    const rejectedOfferings = parseInt(offeringStats.rejectedOfferings, 10) || 0;
    const currentOfferingsCount = parseInt(monthStats.currentOfferingsCount, 10) || 0;
    const previousOfferingsCount = parseInt(monthStats.previousOfferingsCount, 10) || 0;
    const currentActive = parseInt(monthStats.currentActive, 10) || 0;
    const previousActive = parseInt(monthStats.previousActive, 10) || 0;
    const currentTotal = parseInt(monthStats.currentTotal, 10) || 0;
    const previousTotal = parseInt(monthStats.previousTotal, 10) || 0;
    const totalRaised = parseFloat(transactionStats.totalRaised) || 0;
    const currentRaised = parseFloat(transactionStats.currentRaised) || 0;
    const previousRaised = parseFloat(transactionStats.previousRaised) || 0;
    // Calculate growth metrics
    const offeringGrowth = previousOfferingsCount > 0
        ? Math.round(((currentOfferingsCount - previousOfferingsCount) /
            previousOfferingsCount) *
            100)
        : 0;
    const raiseGrowth = previousRaised > 0
        ? Math.round(((currentRaised - previousRaised) / previousRaised) * 100)
        : 0;
    const currentSuccessRate = currentTotal > 0 ? Math.round((currentActive / currentTotal) * 100) : 0;
    const previousSuccessRate = previousTotal > 0 ? Math.round((previousActive / previousTotal) * 100) : 0;
    const successRate = totalOfferings > 0
        ? Math.round((activeOfferings / totalOfferings) * 100)
        : 0;
    const successRateGrowth = previousSuccessRate
        ? currentSuccessRate - previousSuccessRate
        : 0;
    ctx === null || ctx === void 0 ? void 0 : ctx.success("Get Creator Stats retrieved successfully");
    return {
        totalOfferings,
        pendingOfferings,
        activeOfferings,
        completedOfferings,
        rejectedOfferings,
        totalRaised,
        offeringGrowth,
        raiseGrowth,
        successRate,
        successRateGrowth,
    };
};
