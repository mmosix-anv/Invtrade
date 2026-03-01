"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getAllocationByToken = getAllocationByToken;
exports.getUserPortfolioHistory = getUserPortfolioHistory;
const sequelize_1 = require("sequelize");
const db_1 = require("@b/db");
/**
 * Computes allocation by token at a given date.
 * It aggregates all transactions (completed) for the user up to `date` and then computes the
 * market value per token offering based on the offering's currentPrice (or fallback to tokenPrice).
 */
async function getAllocationByToken(userId, date, ctx) {
    var _a, _b, _c, _d, _e, _f;
    try {
        (_a = ctx === null || ctx === void 0 ? void 0 : ctx.step) === null || _a === void 0 ? void 0 : _a.call(ctx, "Fetching completed transactions for allocation calculation");
        // Get all transactions up to the provided date.
        const transactions = await db_1.models.icoTransaction.findAll({
            where: {
                userId,
                createdAt: { [sequelize_1.Op.lte]: date },
                status: "RELEASED",
            },
            include: [
                {
                    model: db_1.models.icoTokenOffering,
                    as: "offering",
                    attributes: ["currentPrice", "tokenPrice", "name"],
                },
            ],
        });
        (_b = ctx === null || ctx === void 0 ? void 0 : ctx.step) === null || _b === void 0 ? void 0 : _b.call(ctx, "Calculating cumulative holdings per offering");
        // Calculate cumulative holdings per offering.
        const holdings = {};
        const offeringName = {};
        transactions.forEach((tx) => {
            const id = tx.offeringId;
            if (tx.offering) {
                offeringName[id] = tx.offering.name;
            }
            if (tx.type === "buy") {
                holdings[id] = (holdings[id] || 0) + tx.amount;
            }
            else if (tx.type === "sell") {
                holdings[id] = (holdings[id] || 0) - tx.amount;
            }
        });
        (_c = ctx === null || ctx === void 0 ? void 0 : ctx.step) === null || _c === void 0 ? void 0 : _c.call(ctx, "Computing market value per offering");
        let totalValue = 0;
        const allocationMap = {};
        // Compute market value per offering.
        for (const offeringId in holdings) {
            // Retrieve price info from the most recent transaction that includes offering info.
            const tx = transactions.find((t) => t.offeringId === offeringId);
            if (tx && tx.offering) {
                const price = (_d = tx.offering.currentPrice) !== null && _d !== void 0 ? _d : tx.offering.tokenPrice;
                const tokenValue = holdings[offeringId] * price;
                allocationMap[tx.offering.name] =
                    (allocationMap[tx.offering.name] || 0) + tokenValue;
                totalValue += tokenValue;
            }
        }
        const allocationByToken = Object.entries(allocationMap).map(([name, value]) => ({
            name,
            percentage: totalValue > 0 ? (value / totalValue) * 100 : 0,
        }));
        (_e = ctx === null || ctx === void 0 ? void 0 : ctx.success) === null || _e === void 0 ? void 0 : _e.call(ctx, `Calculated allocation for ${allocationByToken.length} tokens`);
        return { allocationByToken, totalPortfolioValue: totalValue };
    }
    catch (error) {
        (_f = ctx === null || ctx === void 0 ? void 0 : ctx.fail) === null || _f === void 0 ? void 0 : _f.call(ctx, error.message || "Failed to calculate allocation by token");
        throw error;
    }
}
/**
 * Computes a daily time series of portfolio market value for a given user between startDate and endDate.
 * It builds the series by "replaying" all completed transactions (buy increases, sell decreases)
 * and then calculates the value using each offering's currentPrice (or tokenPrice as fallback).
 *
 * @param userId The user's ID.
 * @param startDate The start date (as a Date object).
 * @param endDate The end date (as a Date object).
 * @returns Array of data points in the shape { date: string, value: number }.
 */
async function getUserPortfolioHistory(userId, startDate, endDate, ctx) {
    var _a, _b, _c, _d, _e, _f, _g;
    try {
        (_a = ctx === null || ctx === void 0 ? void 0 : ctx.step) === null || _a === void 0 ? void 0 : _a.call(ctx, "Fetching transaction history for portfolio calculation");
        // Fetch all completed transactions up to endDate, including offering data.
        const transactions = await db_1.models.icoTransaction.findAll({
            where: {
                userId,
                createdAt: { [sequelize_1.Op.lte]: endDate },
                status: "RELEASED",
            },
            order: [["createdAt", "ASC"]],
            include: [
                {
                    model: db_1.models.icoTokenOffering,
                    as: "offering",
                    attributes: ["currentPrice", "tokenPrice"],
                },
            ],
        });
        (_b = ctx === null || ctx === void 0 ? void 0 : ctx.step) === null || _b === void 0 ? void 0 : _b.call(ctx, "Processing transactions before start date");
        // Initialize holdings and a mapping for price info per offering.
        const holdings = {};
        const offeringPrice = {};
        let txIndex = 0;
        // Process transactions before startDate to build initial holdings.
        while (txIndex < transactions.length &&
            new Date(transactions[txIndex].createdAt) < startDate) {
            const tx = transactions[txIndex];
            const id = tx.offeringId;
            const price = tx.offering && ((_c = tx.offering.currentPrice) !== null && _c !== void 0 ? _c : tx.offering.tokenPrice);
            if (price != null) {
                offeringPrice[id] = price;
            }
            if (tx.type === "buy") {
                holdings[id] = (holdings[id] || 0) + tx.amount;
            }
            else if (tx.type === "sell") {
                holdings[id] = (holdings[id] || 0) - tx.amount;
            }
            txIndex++;
        }
        // Helper to compute portfolio market value from current holdings.
        const computePortfolioValue = () => {
            var _a;
            let value = 0;
            for (const id in holdings) {
                const qty = holdings[id];
                const price = (_a = offeringPrice[id]) !== null && _a !== void 0 ? _a : 0;
                value += qty * price;
            }
            return parseFloat(value.toFixed(2));
        };
        (_d = ctx === null || ctx === void 0 ? void 0 : ctx.step) === null || _d === void 0 ? void 0 : _d.call(ctx, "Building daily portfolio history");
        // Record the initial portfolio value.
        const history = [];
        const msPerDay = 24 * 3600 * 1000;
        const totalDays = Math.floor((endDate.getTime() - startDate.getTime()) / msPerDay);
        // Iterate day-by-day and process transactions that occur on each day.
        for (let i = 0; i <= totalDays; i++) {
            const currentDate = new Date(startDate.getTime() + i * msPerDay);
            // Process all transactions for the current day.
            while (txIndex < transactions.length &&
                new Date(transactions[txIndex].createdAt) <= currentDate) {
                const tx = transactions[txIndex];
                const id = tx.offeringId;
                // Update the offering price (if available) to the most recent value.
                if (tx.offering) {
                    offeringPrice[id] = (_e = tx.offering.currentPrice) !== null && _e !== void 0 ? _e : tx.offering.tokenPrice;
                }
                if (tx.type === "buy") {
                    holdings[id] = (holdings[id] || 0) + tx.amount;
                }
                else if (tx.type === "sell") {
                    holdings[id] = (holdings[id] || 0) - tx.amount;
                }
                txIndex++;
            }
            history.push({
                date: currentDate.toISOString().split("T")[0],
                value: computePortfolioValue(),
            });
        }
        (_f = ctx === null || ctx === void 0 ? void 0 : ctx.success) === null || _f === void 0 ? void 0 : _f.call(ctx, `Generated ${history.length} days of portfolio history`);
        return history;
    }
    catch (error) {
        (_g = ctx === null || ctx === void 0 ? void 0 : ctx.fail) === null || _g === void 0 ? void 0 : _g.call(ctx, error.message || "Failed to generate portfolio history");
        throw error;
    }
}
