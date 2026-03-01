"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.metadata = void 0;
const db_1 = require("@b/db");
const error_1 = require("@b/utils/error");
const sequelize_1 = require("sequelize");
exports.metadata = {
    summary: "Get ICO Platform Statistics",
    description: "Retrieves ICO platform statistics including total raised funds, growth percentage, successful offerings count, total investors, and average ROI. Calculations are now based on all non-rejected transactions and monthly comparisons.",
    operationId: "getIcoStats",
    tags: ["ICO", "Stats"],
    logModule: "ICO",
    logTitle: "Get ICO Stats",
    requiresAuth: false,
    responses: {
        200: {
            description: "ICO platform statistics retrieved successfully.",
            content: {
                "application/json": {
                    schema: {
                        type: "object",
                        properties: {
                            projectsLaunched: { type: "number" },
                            totalRaised: { type: "number" },
                            totalInvestors: { type: "number" },
                            raisedGrowth: { type: "number" },
                            successfulOfferings: { type: "number" },
                            offeringsGrowth: { type: "number" },
                            investorsGrowth: { type: "number" },
                            averageROI: { type: "number" },
                            roiGrowth: { type: "number" },
                        },
                    },
                },
            },
        },
        500: { description: "Internal Server Error." },
    },
};
exports.default = async (data) => {
    const { ctx } = data;
    ctx === null || ctx === void 0 ? void 0 : ctx.step("Fetching ICO stats");
    if (!db_1.models.icoTransaction || !db_1.models.icoTokenOffering) {
        throw (0, error_1.createError)({
            statusCode: 500,
            message: `Model(s) missing: ` +
                (!db_1.models.icoTransaction ? "icoTransaction " : "") +
                (!db_1.models.icoTokenOffering ? "icoTokenOffering " : ""),
        });
    }
    const investmentModel = db_1.models.icoTransaction;
    const now = new Date();
    const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const previousMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const previousMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0);
    const [transactionStats, offeringsStats, investorStats] = await Promise.all([
        // 1) Transaction Stats
        db_1.models.icoTransaction.findOne({
            attributes: [
                [
                    (0, sequelize_1.fn)("SUM", (0, sequelize_1.literal)("CASE WHEN status NOT IN ('REJECTED') THEN price * amount ELSE 0 END")),
                    "totalRaised",
                ],
                [
                    (0, sequelize_1.fn)("SUM", (0, sequelize_1.literal)(`CASE WHEN createdAt >= '${currentMonthStart.toISOString()}' AND status NOT IN ('REJECTED') THEN price * amount ELSE 0 END`)),
                    "currentRaised",
                ],
                [
                    (0, sequelize_1.fn)("SUM", (0, sequelize_1.literal)(`CASE WHEN createdAt BETWEEN '${previousMonthStart.toISOString()}' AND '${previousMonthEnd.toISOString()}' AND status NOT IN ('REJECTED') THEN price * amount ELSE 0 END`)),
                    "previousRaised",
                ],
            ],
            raw: true,
        }),
        // 2) Offerings Stats
        db_1.models.icoTokenOffering.findOne({
            attributes: [
                [
                    (0, sequelize_1.fn)("SUM", (0, sequelize_1.literal)("CASE WHEN status = 'SUCCESS' THEN 1 ELSE 0 END")),
                    "successfulOfferings",
                ],
                [
                    (0, sequelize_1.fn)("SUM", (0, sequelize_1.literal)(`CASE WHEN createdAt >= '${currentMonthStart.toISOString()}' AND status = 'SUCCESS' THEN 1 ELSE 0 END`)),
                    "currentSuccessfulOfferings",
                ],
                [
                    (0, sequelize_1.fn)("SUM", (0, sequelize_1.literal)(`CASE WHEN createdAt BETWEEN '${previousMonthStart.toISOString()}' AND '${previousMonthEnd.toISOString()}' AND status = 'SUCCESS' THEN 1 ELSE 0 END`)),
                    "previousSuccessfulOfferings",
                ],
            ],
            raw: true,
        }),
        // 3) Investor Stats
        investmentModel.findOne({
            attributes: [
                [(0, sequelize_1.fn)("COUNT", (0, sequelize_1.literal)("DISTINCT userId")), "totalInvestors"],
                [
                    (0, sequelize_1.fn)("COUNT", (0, sequelize_1.literal)(`DISTINCT CASE WHEN createdAt >= '${currentMonthStart.toISOString()}' THEN userId ELSE NULL END`)),
                    "currentInvestors",
                ],
                [
                    (0, sequelize_1.fn)("COUNT", (0, sequelize_1.literal)(`DISTINCT CASE WHEN createdAt BETWEEN '${previousMonthStart.toISOString()}' AND '${previousMonthEnd.toISOString()}' THEN userId ELSE NULL END`)),
                    "previousInvestors",
                ],
            ],
            raw: true,
        }),
    ]);
    // Parse Transaction Stats
    const totalRaised = parseFloat(transactionStats === null || transactionStats === void 0 ? void 0 : transactionStats.totalRaised) || 0;
    const currentRaised = parseFloat(transactionStats === null || transactionStats === void 0 ? void 0 : transactionStats.currentRaised) || 0;
    const previousRaised = parseFloat(transactionStats === null || transactionStats === void 0 ? void 0 : transactionStats.previousRaised) || 0;
    const raisedGrowth = previousRaised > 0
        ? Math.round(((currentRaised - previousRaised) / previousRaised) * 100)
        : 0;
    // Parse Offerings Stats
    const successfulOfferings = parseInt(offeringsStats === null || offeringsStats === void 0 ? void 0 : offeringsStats.successfulOfferings, 10) || 0;
    const currentSuccessfulOfferings = parseInt(offeringsStats === null || offeringsStats === void 0 ? void 0 : offeringsStats.currentSuccessfulOfferings, 10) || 0;
    const previousSuccessfulOfferings = parseInt(offeringsStats === null || offeringsStats === void 0 ? void 0 : offeringsStats.previousSuccessfulOfferings, 10) || 0;
    const offeringsGrowth = previousSuccessfulOfferings > 0
        ? Math.round(((currentSuccessfulOfferings - previousSuccessfulOfferings) /
            previousSuccessfulOfferings) *
            100)
        : 0;
    // Parse Investor Stats
    const totalInvestors = parseInt(investorStats === null || investorStats === void 0 ? void 0 : investorStats.totalInvestors, 10) || 0;
    const currentInvestors = parseInt(investorStats === null || investorStats === void 0 ? void 0 : investorStats.currentInvestors, 10) || 0;
    const previousInvestors = parseInt(investorStats === null || investorStats === void 0 ? void 0 : investorStats.previousInvestors, 10) || 0;
    const investorsGrowth = previousInvestors > 0
        ? Math.round(((currentInvestors - previousInvestors) / previousInvestors) * 100)
        : 0;
    // ROI stats not available in schema, so return zero
    const averageROI = 0;
    const roiGrowth = 0;
    ctx === null || ctx === void 0 ? void 0 : ctx.success("Get ICO Stats retrieved successfully");
    return {
        projectsLaunched: successfulOfferings,
        totalRaised,
        totalInvestors,
        raisedGrowth,
        successfulOfferings,
        offeringsGrowth,
        investorsGrowth,
        averageROI,
        roiGrowth,
    };
};
