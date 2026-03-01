"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.metadata = void 0;
const db_1 = require("@b/db");
const error_1 = require("@b/utils/error");
const sequelize_1 = require("sequelize");
exports.metadata = {
    summary: "Get Funding Chart Data for an Offering",
    description: "Retrieves funding chart data (daily aggregated amounts with cumulative totals) for a specific ICO offering based on the specified time range. The data now includes valid funds (from all non-rejected transactions) and rejected funds.",
    operationId: "getAdminFundingChartData",
    tags: ["ICO", "Admin", "FundingChart"],
    requiresAuth: true,
    logModule: "ADMIN_ICO",
    logTitle: "Get ICO Offer Funding",
    parameters: [
        {
            index: 0,
            name: "id",
            in: "path",
            required: true,
            schema: { type: "string" },
            description: "The ID of the ICO offering.",
        },
        {
            index: 1,
            name: "range",
            in: "query",
            required: true,
            schema: { type: "string" },
            description: "Time range for chart data: '7d' for current week, '30d' for current month, '90d' for three full months, or 'all' for all time (monthly, ensuring at least 12 months).",
        },
    ],
    responses: {
        200: {
            description: "Funding chart data retrieved successfully.",
            content: {
                "application/json": {
                    schema: {
                        type: "array",
                        items: {
                            type: "object",
                            properties: {
                                date: { type: "string" },
                                validAmount: { type: "number" },
                                validCumulative: { type: "number" },
                                rejectedAmount: { type: "number" },
                                rejectedCumulative: { type: "number" },
                                totalAmount: { type: "number" },
                                totalCumulative: { type: "number" },
                            },
                        },
                        description: "Array of funding data points including breakdown of valid and rejected funds.",
                    },
                },
            },
        },
        401: { description: "Unauthorized" },
        404: { description: "ICO offering not found" },
        500: { description: "Internal Server Error" },
    },
    permission: "view.ico.offer",
};
/**
 * Helper to get daily aggregated funding data over a given date range.
 * This version calculates valid and rejected funds separately and then computes totals.
 */
async function getDailyChartData(offerId, start, end) {
    // Query valid transactions: now using all non-rejected statuses.
    const validRows = await db_1.models.icoTransaction.findAll({
        attributes: [
            [
                (0, sequelize_1.literal)("TO_CHAR(icoTransaction.createdAt, 'YYYY-MM-DD')"),
                "period",
            ],
            [(0, sequelize_1.fn)("SUM", (0, sequelize_1.literal)("amount * price")), "raised"],
        ],
        where: {
            offeringId: offerId,
            createdAt: { [sequelize_1.Op.between]: [start, end] },
            status: { [sequelize_1.Op.not]: ["REJECTED"] },
        },
        group: [(0, sequelize_1.literal)("TO_CHAR(icoTransaction.createdAt, 'YYYY-MM-DD')")],
        order: [(0, sequelize_1.literal)("period")],
        raw: true,
    });
    // Query rejected transactions.
    const rejectedRows = await db_1.models.icoTransaction.findAll({
        attributes: [
            [
                (0, sequelize_1.literal)("TO_CHAR(icoTransaction.createdAt, 'YYYY-MM-DD')"),
                "period",
            ],
            [(0, sequelize_1.fn)("SUM", (0, sequelize_1.literal)("amount * price")), "raised"],
        ],
        where: {
            offeringId: offerId,
            createdAt: { [sequelize_1.Op.between]: [start, end] },
            status: "REJECTED",
        },
        group: [(0, sequelize_1.literal)("TO_CHAR(icoTransaction.createdAt, 'YYYY-MM-DD')")],
        order: [(0, sequelize_1.literal)("period")],
        raw: true,
    });
    // Build lookup maps.
    const validMap = validRows.reduce((acc, row) => {
        acc[row.period] = parseFloat(row.raised);
        return acc;
    }, {});
    const rejectedMap = rejectedRows.reduce((acc, row) => {
        acc[row.period] = parseFloat(row.raised);
        return acc;
    }, {});
    const chartData = [];
    let cumulativeValid = 0;
    let cumulativeRejected = 0;
    let cumulativeTotal = 0;
    // Iterate day-by-day.
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
        const year = d.getFullYear();
        const month = String(d.getMonth() + 1).padStart(2, "0");
        const day = String(d.getDate()).padStart(2, "0");
        const dateStr = `${year}-${month}-${day}`;
        const valid = validMap[dateStr] || 0;
        const rejected = rejectedMap[dateStr] || 0;
        const total = valid + rejected;
        cumulativeValid += valid;
        cumulativeRejected += rejected;
        cumulativeTotal += total;
        chartData.push({
            date: dateStr,
            validAmount: valid,
            validCumulative: cumulativeValid,
            rejectedAmount: rejected,
            rejectedCumulative: cumulativeRejected,
            totalAmount: total,
            totalCumulative: cumulativeTotal,
        });
    }
    return chartData;
}
/**
 * Helper to get monthly aggregated funding data from a start date to an end date.
 * This version calculates valid and rejected funds separately and ensures at least 12 months.
 */
async function getMonthlyChartData(offerId, start, end) {
    // Query valid transactions for monthly grouping using all non-rejected statuses.
    const validRows = await db_1.models.icoTransaction.findAll({
        attributes: [
            [
                (0, sequelize_1.literal)("TO_CHAR(icoTransaction.createdAt, 'YYYY-MM-01')"),
                "period",
            ],
            [(0, sequelize_1.fn)("SUM", (0, sequelize_1.literal)("amount * price")), "raised"],
        ],
        where: {
            offeringId: offerId,
            createdAt: { [sequelize_1.Op.gte]: start },
            status: { [sequelize_1.Op.not]: ["REJECTED"] },
        },
        group: [(0, sequelize_1.literal)("TO_CHAR(icoTransaction.createdAt, 'YYYY-MM-01')")],
        order: [(0, sequelize_1.literal)("period")],
        raw: true,
    });
    // Query rejected transactions for monthly grouping.
    const rejectedRows = await db_1.models.icoTransaction.findAll({
        attributes: [
            [
                (0, sequelize_1.literal)("TO_CHAR(icoTransaction.createdAt, 'YYYY-MM-01')"),
                "period",
            ],
            [(0, sequelize_1.fn)("SUM", (0, sequelize_1.literal)("amount * price")), "raised"],
        ],
        where: {
            offeringId: offerId,
            createdAt: { [sequelize_1.Op.gte]: start },
            status: "REJECTED",
        },
        group: [(0, sequelize_1.literal)("TO_CHAR(icoTransaction.createdAt, 'YYYY-MM-01')")],
        order: [(0, sequelize_1.literal)("period")],
        raw: true,
    });
    // Build lookup maps.
    const validMap = validRows.reduce((acc, row) => {
        acc[row.period] = parseFloat(row.raised);
        return acc;
    }, {});
    const rejectedMap = rejectedRows.reduce((acc, row) => {
        acc[row.period] = parseFloat(row.raised);
        return acc;
    }, {});
    const chartMonths = [];
    let cumulativeValid = 0;
    let cumulativeRejected = 0;
    let cumulativeTotal = 0;
    // Iterate month-by-month.
    for (let d = new Date(start); d <= end; d.setMonth(d.getMonth() + 1)) {
        const year = d.getFullYear();
        const month = String(d.getMonth() + 1).padStart(2, "0");
        const dateStr = `${year}-${month}-01`;
        const valid = validMap[dateStr] || 0;
        const rejected = rejectedMap[dateStr] || 0;
        const total = valid + rejected;
        cumulativeValid += valid;
        cumulativeRejected += rejected;
        cumulativeTotal += total;
        chartMonths.push({
            date: dateStr,
            validAmount: valid,
            validCumulative: cumulativeValid,
            rejectedAmount: rejected,
            rejectedCumulative: cumulativeRejected,
            totalAmount: total,
            totalCumulative: cumulativeTotal,
        });
    }
    // Ensure at least 12 months of data by prepending missing months if necessary.
    while (chartMonths.length < 12) {
        const first = chartMonths[0];
        const firstDate = new Date(first.date);
        firstDate.setMonth(firstDate.getMonth() - 1);
        const year = firstDate.getFullYear();
        const month = String(firstDate.getMonth() + 1).padStart(2, "0");
        const dateStr = `${year}-${month}-01`;
        // Prepend zero values; cumulative remains as the first entry's cumulative.
        chartMonths.unshift({
            date: dateStr,
            validAmount: 0,
            validCumulative: first.validCumulative,
            rejectedAmount: 0,
            rejectedCumulative: first.rejectedCumulative,
            totalAmount: 0,
            totalCumulative: first.totalCumulative,
        });
    }
    return chartMonths;
}
exports.default = async (data) => {
    const { user, params, query, ctx } = data;
    ctx === null || ctx === void 0 ? void 0 : ctx.step("Validate user authentication");
    if (!(user === null || user === void 0 ? void 0 : user.id)) {
        throw (0, error_1.createError)({ statusCode: 401, message: "Unauthorized" });
    }
    const offerId = params.id;
    // Verify that the offering exists.
    const offering = await db_1.models.icoTokenOffering.findOne({
        where: { id: offerId },
    });
    if (!offering) {
        throw (0, error_1.createError)({ statusCode: 404, message: "ICO offering not found." });
    }
    const now = new Date();
    const range = query.range || "30d";
    let chartData = [];
    if (range === "7d") {
        // Current week: from Monday to Sunday.
        const dayOfWeek = now.getDay();
        const diffToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
        const startOfWeek = new Date(now);
        startOfWeek.setDate(now.getDate() + diffToMonday);
        const endOfWeek = new Date(startOfWeek);
        endOfWeek.setDate(startOfWeek.getDate() + 6);
        chartData = await getDailyChartData(offerId, startOfWeek, endOfWeek);
    }
    else if (range === "30d") {
        // Current month: from the 1st to the last day.
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
        const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0);
        chartData = await getDailyChartData(offerId, startOfMonth, endOfMonth);
    }
    else if (range === "90d") {
        // 90d: From two months before the current month start to the end of the current month.
        const startRange = new Date(now.getFullYear(), now.getMonth() - 2, 1);
        const endRange = new Date(now.getFullYear(), now.getMonth() + 1, 0);
        chartData = await getDailyChartData(offerId, startRange, endRange);
    }
    else {
        // "all": Group monthly from the earliest transaction, ensuring at least 12 months.
        const earliestTx = await db_1.models.icoTransaction.findOne({
            attributes: [
                [(0, sequelize_1.fn)("MIN", (0, sequelize_1.literal)("icoTransaction.createdAt")), "minDate"],
            ],
            where: { offeringId: offerId },
            raw: true,
        });
        let startDateAll;
        if (earliestTx && earliestTx.minDate) {
            startDateAll = new Date(earliestTx.minDate);
        }
        else {
            startDateAll = new Date();
            startDateAll.setFullYear(startDateAll.getFullYear() - 1);
        }
        // Ensure at least 12 months by comparing to 12 months ago.
        const twelveMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 11, 1);
        if (startDateAll > twelveMonthsAgo) {
            startDateAll = twelveMonthsAgo;
        }
        chartData = await getMonthlyChartData(offerId, startDateAll, now);
    }
    ctx === null || ctx === void 0 ? void 0 : ctx.success("Get ICO Offer Funding retrieved successfully");
    return chartData;
};
