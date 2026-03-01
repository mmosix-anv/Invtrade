"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.metadata = void 0;
const db_1 = require("@b/db");
const error_1 = require("@b/utils/error");
const cache_1 = require("@b/utils/cache");
const sequelize_1 = require("sequelize");
const errors_1 = require("@b/utils/schema/errors");
exports.metadata = {
    summary: "Gets detailed affiliate referral information",
    description: "Retrieves comprehensive information about a specific affiliate referral, including referrer profile, network structure, rewards history, and earnings. The network structure varies based on MLM system (DIRECT/BINARY/UNILEVEL).",
    operationId: "getAffiliateReferralDetail",
    tags: ["Admin", "Affiliate", "Referral"],
    requiresAuth: true,
    permission: "view.affiliate.referral",
    demoMask: ["affiliate.email", "affiliate.phone", "network.email"],
    parameters: [
        {
            name: "id",
            in: "path",
            required: true,
            schema: { type: "string", format: "uuid" },
            description: "The affiliate referral ID",
        },
    ],
    responses: {
        200: {
            description: "Affiliate referral details retrieved successfully",
            content: {
                "application/json": {
                    schema: {
                        type: "object",
                        properties: {
                            affiliate: { type: "object", description: "Referrer user information and metrics" },
                            network: { type: "array", description: "Network of referred users" },
                            rewards: { type: "array", description: "Reward history" },
                            monthlyEarnings: { type: "array", description: "Last 6 months earnings" },
                        },
                    },
                },
            },
        },
        401: errors_1.unauthorizedResponse,
        404: (0, errors_1.notFoundResponse)("Affiliate Referral"),
        500: errors_1.serverErrorResponse,
    },
    logModule: "ADMIN_AFFILIATE",
    logTitle: "Get affiliate referral details",
};
exports.default = async (data) => {
    var _a, _b, _c;
    const { user, params, ctx } = data;
    if (!(user === null || user === void 0 ? void 0 : user.id)) {
        throw (0, error_1.createError)({
            statusCode: 401,
            message: "Unauthorized: Admin privileges required.",
        });
    }
    const referralId = params.id;
    ctx === null || ctx === void 0 ? void 0 : ctx.step(`Loading referral record with ID: ${referralId}`);
    // Load referral record and referrer user
    const referralRecord = await db_1.models.mlmReferral.findOne({
        where: { id: referralId },
        include: [
            {
                model: db_1.models.user,
                as: "referrer",
                attributes: ["id", "firstName", "lastName", "email", "phone", "status"],
            },
        ],
        raw: false,
    });
    if (!(referralRecord === null || referralRecord === void 0 ? void 0 : referralRecord.referrer)) {
        throw (0, error_1.createError)({
            statusCode: 404,
            message: "Referral record not found.",
        });
    }
    const referrer = referralRecord.referrer;
    const affiliateUserId = referrer.id;
    ctx === null || ctx === void 0 ? void 0 : ctx.step("Building affiliate profile");
    // Basic affiliate profile
    const affiliate = {
        id: affiliateUserId,
        name: `${referrer.firstName || ""} ${referrer.lastName || ""}`.trim(),
        email: referrer.email || "",
        phone: referrer.phone || null,
        location: null,
        status: (_a = referrer.status) === null || _a === void 0 ? void 0 : _a.toLowerCase(),
        joinDate: referralRecord.createdAt.toISOString(),
        referralCode: referralRecord.id,
    };
    ctx === null || ctx === void 0 ? void 0 : ctx.step("Calculating summary metrics");
    // Summary metrics
    const referralsCount = await db_1.models.mlmReferral.count({
        where: { referrerId: affiliateUserId },
    });
    const earningsRow = await db_1.models.mlmReferralReward.findOne({
        attributes: [[(0, sequelize_1.fn)("SUM", (0, sequelize_1.col)("reward")), "totalEarnings"]],
        where: { referrerId: affiliateUserId },
        raw: true,
    });
    const totalEarnings = parseFloat(earningsRow.totalEarnings) || 0;
    const rewardsCount = await db_1.models.mlmReferralReward.count({
        where: { referrerId: affiliateUserId },
    });
    const conversionRate = referralsCount
        ? Math.round((rewardsCount / referralsCount) * 100)
        : 0;
    Object.assign(affiliate, {
        referrals: referralsCount,
        earnings: totalEarnings,
        conversionRate,
    });
    ctx === null || ctx === void 0 ? void 0 : ctx.step("Determining MLM system");
    // Determine MLM system
    const cache = cache_1.CacheManager.getInstance();
    const settings = await cache.getSettings();
    const mlmSystem = settings.has("mlmSystem")
        ? settings.get("mlmSystem")
        : "DIRECT";
    ctx === null || ctx === void 0 ? void 0 : ctx.step(`Building network structure for ${mlmSystem} system`);
    // Build network based on system
    let network = [];
    if (mlmSystem === "UNILEVEL") {
        // Unilevel: traverse mlmUnilevelNode descendants
        const rootNode = await db_1.models.mlmUnilevelNode.findOne({
            where: { referralId },
        });
        if (rootNode) {
            const all = await db_1.models.mlmUnilevelNode.findAll({ raw: true });
            const children = {};
            all.forEach((n) => {
                children[n.parentId] = children[n.parentId] || [];
                if (n.parentId)
                    children[n.parentId].push(n);
            });
            const queue = [{ node: rootNode, level: 1 }];
            while (queue.length) {
                const { node, level } = queue.shift();
                for (const child of children[node.id] || []) {
                    queue.push({ node: child, level: level + 1 });
                    // load referred user
                    // Use await instead of unhandled promise to prevent data inconsistency
                    const childReferral = await db_1.models.mlmReferral.findOne({
                        where: { id: child.referralId },
                        include: [
                            {
                                model: db_1.models.user,
                                as: "referred",
                                attributes: [
                                    "id",
                                    "firstName",
                                    "lastName",
                                    "email",
                                    "status",
                                    "createdAt",
                                ],
                            },
                        ],
                        raw: false,
                    });
                    if (childReferral === null || childReferral === void 0 ? void 0 : childReferral.referred) {
                        network.push({
                            nodeId: child.id,
                            referralId: child.referralId,
                            id: childReferral.referred.id,
                            name: `${childReferral.referred.firstName} ${childReferral.referred.lastName}`.trim(),
                            email: childReferral.referred.email,
                            level,
                            status: (_b = childReferral.referred.status) === null || _b === void 0 ? void 0 : _b.toLowerCase(),
                            earnings: 0,
                            referrals: 0,
                            joinDate: childReferral.referred.createdAt.toISOString(),
                        });
                    }
                }
            }
        }
    }
    else if (mlmSystem === "BINARY") {
        // Binary: traverse mlmBinaryNode tree (similar BFS on leftChildId/rightChildId)
        const root = await db_1.models.mlmBinaryNode.findOne({ where: { referralId } });
        if (root) {
            const queue = [{ node: root, level: 1 }];
            while (queue.length) {
                const { node, level } = queue.shift();
                for (const side of ["leftChildId", "rightChildId"]) {
                    const childId = node[side];
                    if (childId) {
                        // Use await instead of unhandled promises to prevent data inconsistency
                        const childNode = await db_1.models.mlmBinaryNode.findByPk(childId, { raw: true });
                        if (childNode) {
                            queue.push({ node: childNode, level: level + 1 });
                            const childReferral = await db_1.models.mlmReferral.findOne({
                                where: { id: childNode.referralId },
                                include: [
                                    {
                                        model: db_1.models.user,
                                        as: "referred",
                                        attributes: [
                                            "id",
                                            "firstName",
                                            "lastName",
                                            "email",
                                            "status",
                                            "createdAt",
                                        ],
                                    },
                                ],
                                raw: false,
                            });
                            if (childReferral === null || childReferral === void 0 ? void 0 : childReferral.referred) {
                                network.push({
                                    nodeId: childNode.id,
                                    referralId: childNode.referralId,
                                    id: childReferral.referred.id,
                                    name: `${childReferral.referred.firstName} ${childReferral.referred.lastName}`.trim(),
                                    email: childReferral.referred.email,
                                    level,
                                    status: (_c = childReferral.referred.status) === null || _c === void 0 ? void 0 : _c.toLowerCase(),
                                    earnings: 0,
                                    referrals: 0,
                                    joinDate: childReferral.referred.createdAt.toISOString(),
                                });
                            }
                        }
                    }
                }
            }
        }
    }
    else {
        // DIRECT: immediate referrals only
        const direct = await db_1.models.mlmReferral.findAll({
            where: { referrerId: affiliateUserId },
            include: [
                {
                    model: db_1.models.user,
                    as: "referred",
                    attributes: [
                        "id",
                        "firstName",
                        "lastName",
                        "email",
                        "status",
                        "createdAt",
                    ],
                },
            ],
            raw: false,
        });
        network = direct.map((d) => {
            var _a;
            return ({
                nodeId: null,
                referralId: d.id,
                id: d.referred.id,
                name: `${d.referred.firstName} ${d.referred.lastName}`.trim(),
                email: d.referred.email,
                level: 1,
                status: (_a = d.referred.status) === null || _a === void 0 ? void 0 : _a.toLowerCase(),
                earnings: 0,
                referrals: 0,
                joinDate: d.createdAt.toISOString(),
            });
        });
    }
    ctx === null || ctx === void 0 ? void 0 : ctx.step("Enriching network with metrics");
    // Enrich network metrics
    if (network.length) {
        const [refAll, earnAll] = await Promise.all([
            db_1.models.mlmReferral.findAll({
                attributes: ["referrerId", [(0, sequelize_1.fn)("COUNT", (0, sequelize_1.literal)("*")), "cnt"]],
                group: ["referrerId"],
                raw: true,
            }),
            db_1.models.mlmReferralReward.findAll({
                attributes: ["referrerId", [(0, sequelize_1.fn)("SUM", (0, sequelize_1.col)("reward")), "sum"]],
                group: ["referrerId"],
                raw: true,
            }),
        ]);
        const refMap = Object.fromEntries(refAll.map((r) => [r.referrerId, parseInt(r.cnt, 10)]));
        const earnMap = Object.fromEntries(earnAll.map((r) => [r.referrerId, parseFloat(r.sum)]));
        network = network.map((n) => ({
            ...n,
            referrals: refMap[n.id] || 0,
            earnings: earnMap[n.id] || 0,
        }));
    }
    ctx === null || ctx === void 0 ? void 0 : ctx.step("Fetching reward history");
    // Reward history
    const rewardsRaw = await db_1.models.mlmReferralReward.findAll({
        where: { referrerId: affiliateUserId },
        include: [
            {
                model: db_1.models.mlmReferralCondition,
                as: "condition",
                attributes: ["name"],
            },
        ],
        order: [["createdAt", "DESC"]],
        raw: false,
    });
    const rewards = rewardsRaw.map((r) => {
        var _a;
        return ({
            id: r.id,
            date: r.createdAt.toISOString(),
            type: ((_a = r.condition) === null || _a === void 0 ? void 0 : _a.name) || "",
            description: r.description || "",
            status: r.isClaimed ? "paid" : "pending",
            amount: r.reward,
        });
    });
    ctx === null || ctx === void 0 ? void 0 : ctx.step("Calculating monthly earnings");
    // Monthly earnings (last 6)
    const months = [];
    for (let i = 5; i >= 0; i--) {
        const d = new Date();
        d.setMonth(d.getMonth() - i, 1);
        months.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
    }
    const earnByMonthRaw = await db_1.models.mlmReferralReward.findAll({
        attributes: [
            [(0, sequelize_1.fn)("TO_CHAR", (0, sequelize_1.col)("createdAt"), "YYYY-MM"), "month"],
            [(0, sequelize_1.fn)("SUM", (0, sequelize_1.col)("reward")), "amount"],
        ],
        where: {
            referrerId: affiliateUserId,
            createdAt: {
                [sequelize_1.Op.gte]: new Date(new Date().setMonth(new Date().getMonth() - 5, 1)),
            },
        },
        group: ["month"],
        raw: true,
    });
    const earnMonthMap = {};
    earnByMonthRaw.forEach((r) => {
        earnMonthMap[r.month] = parseFloat(r.amount);
    });
    const monthlyEarnings = months.map((m) => ({
        month: m,
        earnings: earnMonthMap[m] || 0,
    }));
    ctx === null || ctx === void 0 ? void 0 : ctx.success("Affiliate details retrieved successfully");
    return { affiliate, network, rewards, monthlyEarnings };
};
