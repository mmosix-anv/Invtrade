"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.calculateSharpeRatio = calculateSharpeRatio;
exports.calculateSortinoRatio = calculateSortinoRatio;
exports.calculateMaxDrawdown = calculateMaxDrawdown;
exports.calculateCurrentDrawdown = calculateCurrentDrawdown;
exports.calculateStdDev = calculateStdDev;
exports.calculateVolatility = calculateVolatility;
exports.calculateRollingVolatility = calculateRollingVolatility;
exports.calculateProfitFactor = calculateProfitFactor;
exports.calculateExpectancy = calculateExpectancy;
exports.calculatePerformanceMetrics = calculatePerformanceMetrics;
exports.calculateDailyReturns = calculateDailyReturns;
exports.calculateMonthlyPerformance = calculateMonthlyPerformance;
exports.calculateAlpha = calculateAlpha;
exports.calculateRiskAdjustedReturn = calculateRiskAdjustedReturn;
// Advanced Calculations - Sharpe ratio, drawdown, volatility, and other analytics
const db_1 = require("@b/db");
const sequelize_1 = require("sequelize");
// ============================================================================
// SHARPE RATIO
// ============================================================================
/**
 * Calculate Sharpe Ratio
 * Sharpe Ratio = (Average Return - Risk-Free Rate) / Standard Deviation
 */
function calculateSharpeRatio(returns, riskFreeRate = 0.02 // 2% annual risk-free rate
) {
    if (returns.length < 2)
        return 0;
    const avgReturn = returns.reduce((a, b) => a + b, 0) / returns.length;
    const stdDev = calculateStdDev(returns);
    if (stdDev === 0)
        return 0;
    // Annualize if needed (assuming daily returns)
    const annualizedReturn = avgReturn * 252; // Trading days in a year
    const annualizedStdDev = stdDev * Math.sqrt(252);
    return (annualizedReturn - riskFreeRate) / annualizedStdDev;
}
/**
 * Calculate Sortino Ratio
 * Like Sharpe but only considers downside volatility
 */
function calculateSortinoRatio(returns, riskFreeRate = 0.02) {
    if (returns.length < 2)
        return 0;
    const avgReturn = returns.reduce((a, b) => a + b, 0) / returns.length;
    // Calculate downside deviation (only negative returns)
    const negativeReturns = returns.filter((r) => r < 0);
    if (negativeReturns.length === 0)
        return avgReturn > 0 ? Infinity : 0;
    const downsideDeviation = calculateStdDev(negativeReturns);
    if (downsideDeviation === 0)
        return 0;
    // Annualize
    const annualizedReturn = avgReturn * 252;
    const annualizedDownsideDev = downsideDeviation * Math.sqrt(252);
    return (annualizedReturn - riskFreeRate) / annualizedDownsideDev;
}
// ============================================================================
// DRAWDOWN CALCULATIONS
// ============================================================================
/**
 * Calculate Maximum Drawdown
 */
function calculateMaxDrawdown(equityCurve) {
    if (equityCurve.length < 2) {
        return { maxDrawdown: 0, maxDrawdownPercent: 0, drawdownHistory: [] };
    }
    let peak = equityCurve[0];
    let maxDrawdown = 0;
    let maxDrawdownPercent = 0;
    const drawdownHistory = [];
    let currentDrawdown = null;
    for (let i = 1; i < equityCurve.length; i++) {
        const value = equityCurve[i];
        if (value > peak) {
            // New peak - close any current drawdown
            if (currentDrawdown) {
                currentDrawdown.recovered = true;
                currentDrawdown.endDate = new Date();
                drawdownHistory.push(currentDrawdown);
                currentDrawdown = null;
            }
            peak = value;
        }
        else {
            // In drawdown
            const drawdown = peak - value;
            const drawdownPercent = (drawdown / peak) * 100;
            if (!currentDrawdown) {
                currentDrawdown = {
                    peak,
                    trough: value,
                    drawdown,
                    drawdownPercent,
                    startDate: new Date(),
                    recovered: false,
                };
            }
            else {
                if (value < currentDrawdown.trough) {
                    currentDrawdown.trough = value;
                    currentDrawdown.drawdown = peak - value;
                    currentDrawdown.drawdownPercent = (currentDrawdown.drawdown / peak) * 100;
                }
            }
            if (drawdown > maxDrawdown) {
                maxDrawdown = drawdown;
                maxDrawdownPercent = drawdownPercent;
            }
        }
    }
    // Add any ongoing drawdown
    if (currentDrawdown) {
        drawdownHistory.push(currentDrawdown);
    }
    return { maxDrawdown, maxDrawdownPercent, drawdownHistory };
}
/**
 * Calculate current drawdown from peak
 */
function calculateCurrentDrawdown(equityCurve) {
    if (equityCurve.length === 0) {
        return { currentDrawdown: 0, currentDrawdownPercent: 0, peakValue: 0 };
    }
    const peakValue = Math.max(...equityCurve);
    const currentValue = equityCurve[equityCurve.length - 1];
    const currentDrawdown = Math.max(0, peakValue - currentValue);
    const currentDrawdownPercent = peakValue > 0 ? (currentDrawdown / peakValue) * 100 : 0;
    return { currentDrawdown, currentDrawdownPercent, peakValue };
}
// ============================================================================
// VOLATILITY
// ============================================================================
/**
 * Calculate standard deviation
 */
function calculateStdDev(values) {
    if (values.length < 2)
        return 0;
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    const squaredDiffs = values.map((v) => Math.pow(v - mean, 2));
    const avgSquaredDiff = squaredDiffs.reduce((a, b) => a + b, 0) / values.length;
    return Math.sqrt(avgSquaredDiff);
}
/**
 * Calculate volatility (annualized standard deviation of returns)
 */
function calculateVolatility(returns) {
    if (returns.length < 2)
        return 0;
    const stdDev = calculateStdDev(returns);
    // Annualize (assuming daily returns)
    return stdDev * Math.sqrt(252);
}
/**
 * Calculate rolling volatility
 */
function calculateRollingVolatility(returns, windowSize = 20) {
    const result = [];
    for (let i = windowSize - 1; i < returns.length; i++) {
        const window = returns.slice(i - windowSize + 1, i + 1);
        result.push(calculateVolatility(window));
    }
    return result;
}
// ============================================================================
// PROFIT FACTOR & EXPECTANCY
// ============================================================================
/**
 * Calculate profit factor
 * Profit Factor = Gross Profit / Gross Loss
 */
function calculateProfitFactor(profits) {
    const grossProfit = profits.filter((p) => p > 0).reduce((a, b) => a + b, 0);
    const grossLoss = Math.abs(profits.filter((p) => p < 0).reduce((a, b) => a + b, 0));
    if (grossLoss === 0)
        return grossProfit > 0 ? Infinity : 0;
    return grossProfit / grossLoss;
}
/**
 * Calculate expectancy
 * Expectancy = (Win Rate * Average Win) - (Loss Rate * Average Loss)
 */
function calculateExpectancy(profits) {
    if (profits.length === 0)
        return 0;
    const wins = profits.filter((p) => p > 0);
    const losses = profits.filter((p) => p < 0);
    const winRate = wins.length / profits.length;
    const lossRate = losses.length / profits.length;
    const avgWin = wins.length > 0 ? wins.reduce((a, b) => a + b, 0) / wins.length : 0;
    const avgLoss = losses.length > 0
        ? Math.abs(losses.reduce((a, b) => a + b, 0) / losses.length)
        : 0;
    return winRate * avgWin - lossRate * avgLoss;
}
// ============================================================================
// COMPREHENSIVE METRICS
// ============================================================================
/**
 * Calculate all performance metrics for a leader/follower
 */
async function calculatePerformanceMetrics(entityType, entityId, startDate, endDate) {
    const whereClause = {
        status: "CLOSED",
        profit: { [sequelize_1.Op.ne]: null },
    };
    if (entityType === "leader") {
        whereClause.leaderId = entityId;
        whereClause.isLeaderTrade = true;
    }
    else {
        whereClause.followerId = entityId;
    }
    if (startDate) {
        whereClause.closedAt = { ...whereClause.closedAt, [sequelize_1.Op.gte]: startDate };
    }
    if (endDate) {
        whereClause.closedAt = { ...whereClause.closedAt, [sequelize_1.Op.lte]: endDate };
    }
    const trades = await db_1.models.copyTradingTrade.findAll({
        where: whereClause,
        order: [["closedAt", "ASC"]],
        raw: true,
    });
    if (trades.length === 0) {
        return {
            sharpeRatio: 0,
            sortinoRatio: 0,
            maxDrawdown: 0,
            maxDrawdownPercent: 0,
            volatility: 0,
            avgReturn: 0,
            winRate: 0,
            profitFactor: 0,
            avgWin: 0,
            avgLoss: 0,
            expectancy: 0,
            totalTrades: 0,
            winningTrades: 0,
            losingTrades: 0,
        };
    }
    const tradesData = trades;
    // Extract profits and returns
    const profits = tradesData.map((t) => t.profit || 0);
    const returns = tradesData.map((t) => (t.profitPercent || 0) / 100);
    // Build equity curve
    let equity = 10000; // Start with arbitrary 10k
    const equityCurve = [equity];
    for (const profit of profits) {
        equity += profit;
        equityCurve.push(equity);
    }
    // Calculate metrics
    const wins = profits.filter((p) => p > 0);
    const losses = profits.filter((p) => p < 0);
    const avgWin = wins.length > 0 ? wins.reduce((a, b) => a + b, 0) / wins.length : 0;
    const avgLoss = losses.length > 0
        ? Math.abs(losses.reduce((a, b) => a + b, 0) / losses.length)
        : 0;
    const { maxDrawdown, maxDrawdownPercent } = calculateMaxDrawdown(equityCurve);
    return {
        sharpeRatio: calculateSharpeRatio(returns),
        sortinoRatio: calculateSortinoRatio(returns),
        maxDrawdown,
        maxDrawdownPercent,
        volatility: calculateVolatility(returns),
        avgReturn: returns.reduce((a, b) => a + b, 0) / returns.length,
        winRate: (wins.length / profits.length) * 100,
        profitFactor: calculateProfitFactor(profits),
        avgWin,
        avgLoss,
        expectancy: calculateExpectancy(profits),
        totalTrades: profits.length,
        winningTrades: wins.length,
        losingTrades: losses.length,
    };
}
// ============================================================================
// TIME-BASED ANALYTICS
// ============================================================================
/**
 * Calculate daily returns for a period
 */
async function calculateDailyReturns(entityType, entityId, days = 30) {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);
    startDate.setHours(0, 0, 0, 0);
    const whereClause = {
        status: "CLOSED",
        closedAt: { [sequelize_1.Op.gte]: startDate },
    };
    if (entityType === "leader") {
        whereClause.leaderId = entityId;
        whereClause.isLeaderTrade = true;
    }
    else {
        whereClause.followerId = entityId;
    }
    const trades = await db_1.models.copyTradingTrade.findAll({
        where: whereClause,
        attributes: [
            [(0, sequelize_1.fn)("DATE", (0, sequelize_1.col)("closedAt")), "date"],
            [(0, sequelize_1.fn)("SUM", (0, sequelize_1.col)("profit")), "totalProfit"],
            [(0, sequelize_1.fn)("SUM", (0, sequelize_1.col)("cost")), "totalCost"],
            [(0, sequelize_1.fn)("COUNT", (0, sequelize_1.col)("id")), "tradeCount"],
        ],
        group: [(0, sequelize_1.fn)("DATE", (0, sequelize_1.col)("closedAt"))],
        order: [[(0, sequelize_1.fn)("DATE", (0, sequelize_1.col)("closedAt")), "ASC"]],
        raw: true,
    });
    return trades.map((t) => ({
        date: t.date,
        return: t.totalCost > 0 ? (t.totalProfit / t.totalCost) * 100 : 0,
        trades: parseInt(t.tradeCount),
    }));
}
/**
 * Calculate monthly performance
 */
async function calculateMonthlyPerformance(entityType, entityId, months = 12) {
    const startDate = new Date();
    startDate.setMonth(startDate.getMonth() - months);
    startDate.setDate(1);
    startDate.setHours(0, 0, 0, 0);
    const whereClause = {
        status: "CLOSED",
        closedAt: { [sequelize_1.Op.gte]: startDate },
    };
    if (entityType === "leader") {
        whereClause.leaderId = entityId;
        whereClause.isLeaderTrade = true;
    }
    else {
        whereClause.followerId = entityId;
    }
    const trades = await db_1.models.copyTradingTrade.findAll({
        where: whereClause,
        attributes: [
            [
                (0, sequelize_1.fn)("TO_CHAR", (0, sequelize_1.col)("closedAt"), "YYYY-MM"),
                "month",
            ],
            [(0, sequelize_1.fn)("SUM", (0, sequelize_1.col)("profit")), "totalProfit"],
            [(0, sequelize_1.fn)("SUM", (0, sequelize_1.col)("cost")), "totalCost"],
            [(0, sequelize_1.fn)("COUNT", (0, sequelize_1.col)("id")), "tradeCount"],
            [
                (0, sequelize_1.fn)("SUM", (0, sequelize_1.literal)("CASE WHEN profit > 0 THEN 1 ELSE 0 END")),
                "winCount",
            ],
        ],
        group: [
            (0, sequelize_1.fn)("TO_CHAR", (0, sequelize_1.col)("closedAt"), "YYYY-MM"),
        ],
        order: [
            [
                (0, sequelize_1.fn)("TO_CHAR", (0, sequelize_1.col)("closedAt"), "YYYY-MM"),
                "ASC",
            ],
        ],
        raw: true,
    });
    return trades.map((t) => ({
        month: t.month,
        profit: parseFloat(t.totalProfit) || 0,
        roi: t.totalCost > 0 ? (t.totalProfit / t.totalCost) * 100 : 0,
        trades: parseInt(t.tradeCount) || 0,
        winRate: t.tradeCount > 0 ? (parseInt(t.winCount) / parseInt(t.tradeCount)) * 100 : 0,
    }));
}
// ============================================================================
// COMPARISON METRICS
// ============================================================================
/**
 * Compare leader performance to benchmark (market average)
 */
async function calculateAlpha(leaderId, benchmarkReturn = 0 // Market return for the period
) {
    const metrics = await calculatePerformanceMetrics("leader", leaderId);
    // Simplified alpha calculation
    // Alpha = Actual Return - (Risk-Free Rate + Beta * (Market Return - Risk-Free Rate))
    const riskFreeRate = 0.02; // 2% annual
    const actualReturn = metrics.avgReturn * 252; // Annualized
    // Beta would require correlation with market - simplified to 1 for now
    const beta = 1;
    const expectedReturn = riskFreeRate + beta * (benchmarkReturn - riskFreeRate);
    const alpha = actualReturn - expectedReturn;
    return { alpha, beta };
}
/**
 * Calculate risk-adjusted return (RAR)
 */
function calculateRiskAdjustedReturn(totalReturn, volatility) {
    if (volatility === 0)
        return 0;
    return totalReturn / volatility;
}
