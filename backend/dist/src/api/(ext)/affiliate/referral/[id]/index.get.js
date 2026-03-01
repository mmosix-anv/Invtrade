"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.metadata = void 0;
exports.default = handler;
// File: /api/affiliate/referral/[id].ts
const db_1 = require("@b/db");
const error_1 = require("@b/utils/error");
exports.metadata = {
    summary: "Get details for a single referral",
    operationId: "getAffiliateReferral",
    tags: ["Affiliate", "Referral"],
    requiresAuth: true,
    logModule: "AFFILIATE",
    logTitle: "Get affiliate referral details",
    parameters: [
        { name: "id", in: "path", required: true, schema: { type: "string" } },
    ],
    responses: {
        200: { description: "Referral details retrieved successfully." },
        401: { description: "Unauthorized" },
        404: { description: "Not Found" },
        500: { description: "Internal Server Error" },
    },
};
async function handler(data) {
    // Authenticate user
    const { user, params, ctx } = data;
    if (!user) {
        throw (0, error_1.createError)({ statusCode: 401, message: "Unauthorized" });
    }
    // Extract referral ID from path or query
    const referralId = params.id;
    if (!referralId) {
        throw (0, error_1.createError)({ statusCode: 400, message: "Referral ID is required" });
    }
    ctx === null || ctx === void 0 ? void 0 : ctx.step(`Fetching referral details for ID: ${referralId}`);
    // Fetch the referral, ensuring it belongs to the current user
    const referral = await db_1.models.mlmReferral.findOne({
        where: { id: referralId, referrerId: user.id },
        include: [
            {
                model: db_1.models.user,
                as: "referred",
                attributes: ["id", "firstName", "lastName", "email", "avatar"],
            },
        ],
    });
    if (!referral) {
        throw (0, error_1.createError)({ statusCode: 404, message: "Referral not found" });
    }
    ctx === null || ctx === void 0 ? void 0 : ctx.step("Computing earnings summary");
    // Compute earnings summary
    const totalEarnings = (await db_1.models.mlmReferralReward.sum("reward", {
        where: { referrerId: user.id },
    }));
    const pendingRewards = (await db_1.models.mlmReferralReward.sum("reward", {
        where: { referrerId: user.id, isClaimed: false },
    }));
    const lastRewardRecord = await db_1.models.mlmReferralReward.findOne({
        where: { referrerId: user.id },
        order: [["createdAt", "DESC"]],
    });
    // Build earnings object
    const earnings = {
        total: totalEarnings || 0,
        pending: pendingRewards || 0,
        lastReward: lastRewardRecord
            ? {
                amount: lastRewardRecord.reward,
                date: lastRewardRecord.createdAt,
            }
            : null,
    };
    ctx === null || ctx === void 0 ? void 0 : ctx.step("Building activity timeline");
    // Build activity timeline: invite + rewards
    const timeline = [];
    timeline.push({
        type: "invite",
        title: "Invitation sent",
        date: referral.createdAt,
    });
    const rewardEvents = await db_1.models.mlmReferralReward.findAll({
        where: { referrerId: user.id },
        order: [["createdAt", "ASC"]],
    });
    for (const r of rewardEvents) {
        timeline.push({
            type: "reward",
            title: `Reward: $${r.reward.toFixed(2)}`,
            date: r.createdAt,
        });
    }
    ctx === null || ctx === void 0 ? void 0 : ctx.success(`Retrieved details for referral ${referralId} with ${timeline.length} timeline events`);
    return {
        referral,
        earnings,
        timeline,
    };
}
