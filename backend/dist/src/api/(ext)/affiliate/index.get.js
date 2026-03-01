"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.metadata = void 0;
exports.default = getAffiliateDashboard;
const db_1 = require("@b/db");
const error_1 = require("@b/utils/error");
const cache_1 = require("@b/utils/cache");
const sequelize_1 = require("sequelize");
exports.metadata = {
    summary: "Get Affiliate Dashboard",
    description: "Retrieves dashboard data for the authenticated affiliate, with optional period filtering.",
    operationId: "getAffiliateDashboard",
    tags: ["Affiliate", "Dashboard"],
    requiresAuth: true,
    logModule: "AFFILIATE",
    logTitle: "Get affiliate dashboard",
    parameters: [
        {
            name: "period",
            in: "query",
            required: false,
            schema: { type: "string", enum: ["1m", "3m", "6m", "1y"] },
        },
    ],
    responses: {
        200: { description: "Affiliate dashboard data retrieved successfully." },
        401: { description: "Unauthorized" },
        500: { description: "Internal Server Error" },
    },
};
async function getAffiliateDashboard(data) {
    const { user, query, ctx } = data;
    const userId = user === null || user === void 0 ? void 0 : user.id;
    if (!userId)
        throw (0, error_1.createError)({ statusCode: 401, message: "Unauthorized" });
    ctx === null || ctx === void 0 ? void 0 : ctx.step("Parsing period parameter");
    // parse period
    const period = (query === null || query === void 0 ? void 0 : query.period) || "6m";
    let monthsCount = 6;
    switch (period) {
        case "1m":
            monthsCount = 1;
            break;
        case "3m":
            monthsCount = 3;
            break;
        case "6m":
            monthsCount = 6;
            break;
        case "1y":
            monthsCount = 12;
            break;
    }
    const now = new Date();
    // compute start date for current period
    const startDate = new Date(now.getFullYear(), now.getMonth() - (monthsCount - 1), 1);
    // compute previous period boundaries
    const prevStart = new Date(now.getFullYear(), now.getMonth() - (2 * monthsCount - 1), 1);
    const prevEnd = new Date(startDate.getFullYear(), startDate.getMonth(), 0);
    ctx === null || ctx === void 0 ? void 0 : ctx.step("Loading MLM system settings");
    // load settings once
    const cache = cache_1.CacheManager.getInstance();
    const rawSettings = await cache.getSettings();
    const requireApproval = rawSettings.get("referralApprovalRequired") === "true";
    const mlmSystem = rawSettings.get("mlmSystem") || "DIRECT";
    const binaryLevels = parseInt(rawSettings.get("binaryLevels") || "2", 10);
    const unilevelLevels = parseInt(rawSettings.get("unilevelLevels") || "2", 10);
    ctx === null || ctx === void 0 ? void 0 : ctx.step(`Fetching dashboard statistics for ${period} period`);
    // stats for current and previous period in parallel
    const [totalReferrals, activeReferrals, pendingReferrals, rewardSum, recentCount, prevCountAll, rewardCount, prevTotalRef, prevActiveRef, prevPendingRef, prevRewardSumRaw, prevRewardCount,] = await Promise.all([
        db_1.models.mlmReferral.count({ where: { referrerId: userId } }),
        db_1.models.mlmReferral.count({
            where: { referrerId: userId, status: "ACTIVE" },
        }),
        db_1.models.mlmReferral.count({
            where: { referrerId: userId, status: "PENDING" },
        }),
        db_1.models.mlmReferralReward.findOne({
            attributes: [[(0, sequelize_1.fn)("SUM", (0, sequelize_1.col)("reward")), "totalEarnings"]],
            where: { referrerId: userId },
            raw: true,
        }),
        db_1.models.mlmReferral.count({
            where: { referrerId: userId, createdAt: { [sequelize_1.Op.gte]: startDate } },
        }),
        db_1.models.mlmReferral.count({
            where: { referrerId: userId, createdAt: { [sequelize_1.Op.lte]: prevEnd } },
        }),
        db_1.models.mlmReferralReward.count({
            where: { referrerId: userId, createdAt: { [sequelize_1.Op.gte]: startDate } },
        }),
        // previous stats
        db_1.models.mlmReferral.count({
            where: {
                referrerId: userId,
                createdAt: { [sequelize_1.Op.between]: [prevStart, prevEnd] },
            },
        }),
        db_1.models.mlmReferral.count({
            where: {
                referrerId: userId,
                status: "ACTIVE",
                createdAt: { [sequelize_1.Op.between]: [prevStart, prevEnd] },
            },
        }),
        db_1.models.mlmReferral.count({
            where: {
                referrerId: userId,
                status: "PENDING",
                createdAt: { [sequelize_1.Op.between]: [prevStart, prevEnd] },
            },
        }),
        db_1.models.mlmReferralReward.findOne({
            attributes: [[(0, sequelize_1.fn)("SUM", (0, sequelize_1.col)("reward")), "amount"]],
            where: {
                referrerId: userId,
                createdAt: { [sequelize_1.Op.between]: [prevStart, prevEnd] },
            },
            raw: true,
        }),
        db_1.models.mlmReferralReward.count({
            where: {
                referrerId: userId,
                createdAt: { [sequelize_1.Op.between]: [prevStart, prevEnd] },
            },
        }),
    ]);
    const totalEarnings = parseFloat(rewardSum.totalEarnings) || 0;
    const weeklyGrowth = recentCount && prevCountAll > 0
        ? Math.round(((recentCount - prevCountAll) / prevCountAll) * 100)
        : 0;
    const conversionRate = totalReferrals > 0 ? Math.round((rewardCount / totalReferrals) * 100) : 0;
    const prevTotalEarnings = parseFloat(prevRewardSumRaw === null || prevRewardSumRaw === void 0 ? void 0 : prevRewardSumRaw.amount) || 0;
    const prevConversionRate = prevTotalRef > 0 ? Math.round((prevRewardCount / prevTotalRef) * 100) : 0;
    ctx === null || ctx === void 0 ? void 0 : ctx.step("Computing statistics and growth metrics");
    const stats = {
        totalReferrals,
        activeReferrals,
        pendingReferrals,
        conversionRate,
        totalEarnings,
        weeklyGrowth,
    };
    const previousStats = {
        totalReferrals: prevTotalRef,
        activeReferrals: prevActiveRef,
        pendingReferrals: prevPendingRef,
        conversionRate: prevConversionRate,
        totalEarnings: prevTotalEarnings,
    };
    ctx === null || ctx === void 0 ? void 0 : ctx.step("Fetching referrals for current period");
    // referrals filtered by current period & approval
    const referralsWhere = {
        referrerId: userId,
        createdAt: { [sequelize_1.Op.gte]: startDate },
    };
    if (requireApproval)
        referralsWhere.status = "ACTIVE";
    const referrals = await db_1.models.mlmReferral.findAll({
        where: referralsWhere,
        include: [
            {
                model: db_1.models.user,
                as: "referred",
                attributes: ["firstName", "lastName", "email", "avatar"],
            },
        ],
        order: [["createdAt", "DESC"]],
    });
    ctx === null || ctx === void 0 ? void 0 : ctx.step("Fetching reward history");
    // rewards full history
    const rewards = await db_1.models.mlmReferralReward.findAll({
        where: { referrerId: userId },
        include: [
            {
                model: db_1.models.mlmReferralCondition,
                as: "condition",
                attributes: ["name"],
            },
        ],
        order: [["createdAt", "DESC"]],
    });
    ctx === null || ctx === void 0 ? void 0 : ctx.step("Generating monthly earnings breakdown");
    // monthly earnings for current period
    const months = [];
    for (let i = monthsCount - 1; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        months.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
    }
    const earningsRaw = await db_1.models.mlmReferralReward.findAll({
        attributes: [
            [(0, sequelize_1.fn)("TO_CHAR", (0, sequelize_1.col)("createdAt"), "YYYY-MM"), "month"],
            [(0, sequelize_1.fn)("SUM", (0, sequelize_1.col)("reward")), "amount"],
        ],
        where: { referrerId: userId, createdAt: { [sequelize_1.Op.gte]: startDate } },
        group: ["month"],
        raw: true,
    });
    const earningsMap = Object.fromEntries(earningsRaw.map((r) => [r.month, parseFloat(r.amount)]));
    const monthlyEarnings = months.map((m) => ({
        month: m,
        earnings: earningsMap[m] || 0,
    }));
    ctx === null || ctx === void 0 ? void 0 : ctx.success(`Retrieved dashboard data: ${totalReferrals} referrals, ${totalEarnings.toFixed(2)} total earnings`);
    return { stats, referrals, rewards, monthlyEarnings };
}
