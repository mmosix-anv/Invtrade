"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.metadata = void 0;
const db_1 = require("@b/db");
const error_1 = require("@b/utils/error");
const sequelize_1 = require("sequelize");
const cache_1 = require("@b/utils/cache");
exports.metadata = {
    summary: "Get ICO Offering (Admin)",
    description: "Retrieves a single ICO offering by its ID for admin review and management, including calculated metrics (with rejected investments), platform averages, and timeline events.",
    operationId: "getIcoOfferingAdmin",
    tags: ["ICO", "Admin", "Offerings"],
    requiresAuth: true,
    logModule: "ADMIN_ICO",
    logTitle: "Get ICO Offer",
    parameters: [
        {
            name: "id",
            in: "path",
            required: true,
            schema: { type: "string", description: "The ID of the ICO offering." },
        },
    ],
    responses: {
        200: {
            description: "ICO offering retrieved successfully with calculated metrics, platform averages, and timeline events.",
            content: {
                "application/json": {
                    schema: {
                        type: "object",
                        description: "An object containing the ICO offering record, its computed metrics (including rejected funds), platform averages, and timeline events.",
                    },
                },
            },
        },
        401: { description: "Unauthorized – Admin privileges required." },
        404: { description: "ICO offering not found." },
        500: { description: "Internal Server Error" },
    },
    permission: "view.ico.offer",
};
exports.default = async (data) => {
    const { user, params, ctx } = data;
    ctx === null || ctx === void 0 ? void 0 : ctx.step("Validate user authentication");
    if (!(user === null || user === void 0 ? void 0 : user.id)) {
        throw (0, error_1.createError)({
            statusCode: 401,
            message: "Unauthorized: Admin privileges required.",
        });
    }
    const id = params.id;
    if (!id || typeof id !== "string") {
        throw (0, error_1.createError)({ statusCode: 400, message: "Invalid offering ID." });
    }
    // Fetch the offering and all associations in one call.
    const offering = await db_1.models.icoTokenOffering.findOne({
        where: { id },
        include: [
            {
                model: db_1.models.icoTokenDetail,
                as: "tokenDetail",
                include: [{ model: db_1.models.icoTokenType, as: "tokenTypeData" }]
            },
            { model: db_1.models.icoLaunchPlan, as: "plan" },
            {
                model: db_1.models.icoTokenOfferingUpdate,
                as: "updates",
                include: [{ model: db_1.models.user, as: "user" }],
            },
            { model: db_1.models.icoTokenOfferingPhase, as: "phases" },
            { model: db_1.models.icoRoadmapItem, as: "roadmapItems" },
            { model: db_1.models.icoAdminActivity, as: "adminActivities" },
            { model: db_1.models.user, as: "user" },
        ],
    });
    if (!offering) {
        throw (0, error_1.createError)({ statusCode: 404, message: "ICO offering not found." });
    }
    // Retrieve minimum investment from cached settings.
    const cacheManager = cache_1.CacheManager.getInstance();
    const minInvestmentSetting = await cacheManager.getSetting("icoMinInvestmentAmount");
    const minInvestmentAmount = Number(minInvestmentSetting) || 100;
    // --- Offer-specific Metrics ---
    const msPerDay = 1000 * 60 * 60 * 24;
    const startDate = offering.startDate ? new Date(offering.startDate) : null;
    const endDate = offering.endDate ? new Date(offering.endDate) : null;
    if (!startDate) {
        throw (0, error_1.createError)({
            statusCode: 500,
            message: "Offering start date is missing.",
        });
    }
    const now = new Date();
    // If the offering is marked as "SUCCESS", use its endDate; otherwise use current date.
    const durationDays = offering.status === "SUCCESS" && endDate
        ? Math.floor((endDate.getTime() - startDate.getTime()) / msPerDay)
        : Math.floor((now.getTime() - startDate.getTime()) / msPerDay);
    // Combine computation of non-rejected and rejected transaction sums in one query.
    const [offeringTxAggregates, investorAggregates] = await Promise.all([
        db_1.models.icoTransaction.findOne({
            attributes: [
                [
                    (0, sequelize_1.fn)("SUM", (0, sequelize_1.literal)("CASE WHEN status NOT IN ('REJECTED') THEN price * amount ELSE 0 END")),
                    "computedRaised",
                ],
                [
                    (0, sequelize_1.fn)("SUM", (0, sequelize_1.literal)("CASE WHEN status = 'REJECTED' THEN price * amount ELSE 0 END")),
                    "rejectedFunds",
                ],
            ],
            where: { offeringId: id },
            raw: true,
        }),
        // Group transactions by user for investor aggregates.
        db_1.models.icoTransaction.findAll({
            attributes: [
                "userId",
                [(0, sequelize_1.fn)("SUM", (0, sequelize_1.literal)("price * amount")), "totalCost"],
                [(0, sequelize_1.fn)("COUNT", (0, sequelize_1.literal)("id")), "transactionCount"],
            ],
            where: {
                offeringId: id,
                status: { [sequelize_1.Op.not]: ["REJECTED"] },
            },
            group: ["userId"],
            raw: true,
        }),
    ]);
    const computedCurrentRaised = parseFloat(offeringTxAggregates === null || offeringTxAggregates === void 0 ? void 0 : offeringTxAggregates.computedRaised) || 0;
    const rejectedInvestment = parseFloat(offeringTxAggregates === null || offeringTxAggregates === void 0 ? void 0 : offeringTxAggregates.rejectedFunds) || 0;
    const fundingRate = computedCurrentRaised / (durationDays || 1);
    const avgInvestment = computedCurrentRaised / (offering.participants || 1);
    const completionTime = durationDays;
    // Calculate largest investment and transactions per investor.
    const largestInvestment = investorAggregates.reduce((max, inv) => {
        const totalCost = Number(inv.totalCost) || 0;
        return totalCost > max ? totalCost : max;
    }, 0);
    const totalTransactions = investorAggregates.reduce((sum, inv) => sum + Number(inv.transactionCount), 0);
    const transactionsPerInvestor = investorAggregates.length > 0
        ? totalTransactions / investorAggregates.length
        : 0;
    const metrics = {
        avgInvestment,
        fundingRate,
        largestInvestment,
        smallestInvestment: minInvestmentAmount,
        transactionsPerInvestor,
        completionTime,
        rejectedInvestment,
        currentRaised: computedCurrentRaised,
    };
    // --- Platform-wide Metrics ---
    // Run independent platform queries concurrently.
    const [totalRaisedAllRow, offeringsData, platformLargestRow, transactionsAggregate, platformRejectedAggregate,] = await Promise.all([
        // 1. Total Raised across offerings with status ACTIVE or SUCCESS.
        db_1.models.icoTransaction.findOne({
            attributes: [[(0, sequelize_1.fn)("SUM", (0, sequelize_1.literal)("price * amount")), "totalRaisedAll"]],
            include: [
                {
                    model: db_1.models.icoTokenOffering,
                    as: "offering",
                    attributes: [],
                    where: { status: { [sequelize_1.Op.in]: ["ACTIVE", "SUCCESS"] } },
                },
            ],
            raw: true,
        }),
        // 2. Total Participants and average duration (in days) from offerings.
        db_1.models.icoTokenOffering.findOne({
            attributes: [
                [(0, sequelize_1.fn)("SUM", (0, sequelize_1.col)("participants")), "totalParticipants"],
                [
                    (0, sequelize_1.fn)("AVG", (0, sequelize_1.literal)("TIMESTAMPDIFF(DAY, startDate, endDate)")),
                    "avgDuration",
                ],
            ],
            where: { status: { [sequelize_1.Op.in]: ["ACTIVE", "SUCCESS"] } },
            raw: true,
        }),
        // 3. Largest investment across all offerings (using a subquery).
        db_1.models.icoTokenOffering.findOne({
            attributes: [
                [
                    (0, sequelize_1.fn)("MAX", (0, sequelize_1.literal)(`(SELECT SUM(amount * price) FROM ico_transaction 
                       WHERE ico_transaction.offeringId = icoTokenOffering.id 
                       AND status IN ('PENDING', 'RELEASED'))`)),
                    "maxInvestment",
                ],
            ],
            raw: true,
        }),
        // 4. Aggregated transaction data (non-rejected).
        db_1.models.icoTransaction.findOne({
            attributes: [
                [(0, sequelize_1.fn)("SUM", (0, sequelize_1.literal)("price * amount")), "totalCost"],
                [(0, sequelize_1.fn)("COUNT", (0, sequelize_1.literal)("id")), "transactionCount"],
                [(0, sequelize_1.fn)("COUNT", (0, sequelize_1.fn)("DISTINCT", (0, sequelize_1.col)("userId"))), "investorCount"],
            ],
            where: { status: { [sequelize_1.Op.not]: ["REJECTED"] } },
            raw: true,
        }),
        // 5. Total rejected funds platform-wide.
        db_1.models.icoTransaction.findOne({
            attributes: [
                [
                    (0, sequelize_1.fn)("COALESCE", (0, sequelize_1.fn)("SUM", (0, sequelize_1.literal)("price * amount")), 0),
                    "rejectedFunds",
                ],
            ],
            where: { status: "REJECTED" },
            raw: true,
        }),
    ]);
    const totalRaisedAll = parseFloat(totalRaisedAllRow === null || totalRaisedAllRow === void 0 ? void 0 : totalRaisedAllRow.totalRaisedAll) || 0;
    const totalParticipants = parseFloat(offeringsData === null || offeringsData === void 0 ? void 0 : offeringsData.totalParticipants) || 0;
    const avgDuration = parseFloat(offeringsData === null || offeringsData === void 0 ? void 0 : offeringsData.avgDuration) || 0;
    const platformAvgInvestment = totalParticipants > 0 ? totalRaisedAll / totalParticipants : 0;
    const platformFundingRate = avgDuration > 0 ? totalRaisedAll / avgDuration : 0;
    const platformLargestInvestment = platformLargestRow
        ? parseFloat(platformLargestRow.maxInvestment) || 0
        : 0;
    const platformSmallestInvestment = minInvestmentAmount;
    const totalTransactionCount = parseFloat(transactionsAggregate === null || transactionsAggregate === void 0 ? void 0 : transactionsAggregate.transactionCount) || 0;
    const investorCount = parseFloat(transactionsAggregate === null || transactionsAggregate === void 0 ? void 0 : transactionsAggregate.investorCount) || 0;
    const platformTransactionsPerInvestor = investorCount > 0 ? totalTransactionCount / investorCount : 0;
    const platformCompletionTime = avgDuration;
    const platformRejectedInvestment = parseFloat(platformRejectedAggregate === null || platformRejectedAggregate === void 0 ? void 0 : platformRejectedAggregate.rejectedFunds) || 0;
    const platformMetrics = {
        avgInvestment: platformAvgInvestment,
        fundingRate: platformFundingRate,
        largestInvestment: platformLargestInvestment,
        smallestInvestment: platformSmallestInvestment,
        transactionsPerInvestor: platformTransactionsPerInvestor,
        completionTime: platformCompletionTime,
        rejectedInvestment: platformRejectedInvestment,
    };
    // --- Compute Timeline Events ---
    const timeline = computeIcoOfferTimeline(offering, ctx);
    return { offering, metrics, platformMetrics, timeline };
};
function computeIcoOfferTimeline(offering, ctx) {
    var _a;
    const timelineEvents = [];
    const msPerDay = 1000 * 60 * 60 * 24;
    // Basic events
    if (offering.createdAt) {
        timelineEvents.push({
            id: "created",
            type: "created",
            timestamp: new Date(offering.createdAt).toISOString(),
            adminName: "System",
            details: "Offering created",
        });
    }
    if (offering.startDate && offering.status === "ACTIVE") {
        timelineEvents.push({
            id: "launched",
            type: "launched",
            timestamp: new Date(offering.startDate).toISOString(),
            adminName: "System",
            details: "Offering launched",
        });
    }
    if (offering.endDate) {
        timelineEvents.push({
            id: "completed",
            type: "completed",
            timestamp: new Date(offering.endDate).toISOString(),
            adminName: "System",
            details: "Offering completed",
        });
    }
    // Submission/Review events
    if (offering.submittedAt) {
        timelineEvents.push({
            id: "submitted",
            type: "submission",
            timestamp: new Date(offering.submittedAt).toISOString(),
            adminName: ((_a = offering.user) === null || _a === void 0 ? void 0 : _a.name) || "Creator",
            details: "Offering submitted for review",
        });
    }
    if (offering.approvedAt) {
        timelineEvents.push({
            id: "approved",
            type: "approval",
            timestamp: new Date(offering.approvedAt).toISOString(),
            adminName: "Admin",
            details: "Offering approved",
        });
    }
    if (offering.rejectedAt) {
        timelineEvents.push({
            id: "rejected",
            type: "rejection",
            timestamp: new Date(offering.rejectedAt).toISOString(),
            adminName: "Admin",
            details: "Offering rejected",
        });
    }
    // Updates (notes)
    if (offering.updates && Array.isArray(offering.updates)) {
        offering.updates.forEach((update) => {
            var _a;
            timelineEvents.push({
                id: update.id,
                type: "note",
                timestamp: new Date(update.createdAt).toISOString(),
                adminName: ((_a = update.user) === null || _a === void 0 ? void 0 : _a.name) || "Admin",
                details: `${update.title}: ${update.content}`,
            });
        });
    }
    // Roadmap items as milestones
    if (offering.roadmapItems && Array.isArray(offering.roadmapItems)) {
        offering.roadmapItems.forEach((item) => {
            timelineEvents.push({
                id: `roadmap-${item.id}`,
                type: "milestone",
                timestamp: new Date(item.date).toISOString(),
                adminName: "System",
                details: `${item.title} - ${item.description}`,
                important: item.completed,
            });
        });
    }
    // Phases – compute a phase-start event based on offering start date and phase duration.
    if (offering.phases && Array.isArray(offering.phases)) {
        let phaseStart = new Date(offering.startDate);
        offering.phases.forEach((phase) => {
            timelineEvents.push({
                id: `phase-${phase.id}`,
                type: "phase",
                timestamp: phaseStart.toISOString(),
                adminName: "System",
                details: `Phase ${phase.name} started. Token Price: ${phase.tokenPrice}`,
            });
            phaseStart = new Date(phaseStart.getTime() + phase.duration * msPerDay);
        });
    }
    // Admin activities (if available)
    if (offering.adminActivities && Array.isArray(offering.adminActivities)) {
        offering.adminActivities.forEach((activity) => {
            timelineEvents.push({
                id: `activity-${activity.id}`,
                type: activity.type || "activity",
                timestamp: new Date(activity.createdAt).toISOString(),
                adminName: activity.adminName || "Admin",
                details: activity.details || "",
            });
        });
    }
    // Attach offering context and sort events chronologically.
    timelineEvents.forEach((event) => {
        event.offeringId = offering.id;
        event.offeringName = offering.name;
    });
    timelineEvents.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
    ctx === null || ctx === void 0 ? void 0 : ctx.success("Get ICO Offer retrieved successfully");
    return timelineEvents;
}
