"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.calculatePnL = calculatePnL;
exports.calculateUnrealizedPnL = calculateUnrealizedPnL;
exports.calculateProfitShareBreakdown = calculateProfitShareBreakdown;
exports.distributeProfitShare = distributeProfitShare;
exports.processPendingProfitDistributions = processPendingProfitDistributions;
exports.getLeaderEarnings = getLeaderEarnings;
exports.getFollowerProfitSharePayments = getFollowerProfitSharePayments;
exports.previewProfitShare = previewProfitShare;
// Profit Share - P&L calculation and profit share distribution
const db_1 = require("@b/db");
const sequelize_1 = require("sequelize");
const console_1 = require("@b/utils/console");
const wallet_1 = require("@b/api/(ext)/ecosystem/utils/wallet");
const index_1 = require("./index");
const currency_1 = require("./currency");
// ============================================================================
// P&L CALCULATION
// ============================================================================
/**
 * Calculate P&L for a trade
 */
function calculatePnL(entryPrice, exitPrice, amount, side, fees = 0) {
    let profit;
    if (side === "BUY") {
        // Long position: profit when price goes up
        profit = (exitPrice - entryPrice) * amount;
    }
    else {
        // Short position: profit when price goes down
        profit = (entryPrice - exitPrice) * amount;
    }
    // Subtract fees
    profit -= fees;
    const cost = entryPrice * amount;
    const profitPercent = cost > 0 ? (profit / cost) * 100 : 0;
    return { profit, profitPercent };
}
/**
 * Calculate unrealized P&L for an open trade
 */
function calculateUnrealizedPnL(entryPrice, currentPrice, amount, side) {
    const { profit, profitPercent } = calculatePnL(entryPrice, currentPrice, amount, side, 0);
    return {
        unrealizedProfit: profit,
        unrealizedProfitPercent: profitPercent,
    };
}
// ============================================================================
// PROFIT SHARE DISTRIBUTION
// ============================================================================
/**
 * Calculate profit share breakdown
 * @param grossProfit - The gross profit amount
 * @param leaderSharePercent - Leader's share percentage of profit
 * @param currency - The currency of the profit (e.g., "USDT", "BTC")
 */
async function calculateProfitShareBreakdown(grossProfit, leaderSharePercent, currency = "USDT") {
    const settings = await (0, index_1.getCopyTradingSettings)();
    const platformFeePercent = settings.platformFeePercent || 2;
    // Validate leader share percent (should not exceed 100%)
    const validatedLeaderShare = Math.min(leaderSharePercent, 100);
    // If profit sharing is disabled, leader gets nothing
    const effectiveLeaderSharePercent = settings.enableProfitShare ? validatedLeaderShare : 0;
    if (grossProfit <= 0) {
        return {
            grossProfit,
            platformFee: 0,
            platformFeePercent,
            leaderShare: 0,
            leaderSharePercent: effectiveLeaderSharePercent,
            followerNet: grossProfit,
            currency,
        };
    }
    const platformFee = grossProfit * (platformFeePercent / 100);
    const afterPlatformFee = grossProfit - platformFee;
    const leaderShare = afterPlatformFee * (effectiveLeaderSharePercent / 100);
    const followerNet = afterPlatformFee - leaderShare;
    return {
        grossProfit,
        platformFee,
        platformFeePercent,
        leaderShare,
        leaderSharePercent: effectiveLeaderSharePercent,
        followerNet,
        currency,
    };
}
/**
 * Distribute profit share to leader and record platform fee
 * @param tradeId - The trade ID
 * @param follower - The follower record
 * @param leader - The leader record
 * @param grossProfit - The gross profit amount in the specified currency
 * @param currency - The currency of the profit (quote currency from the trading pair)
 * @param transaction - Optional existing transaction
 */
async function distributeProfitShare(tradeId, follower, leader, grossProfit, currency, transaction) {
    try {
        if (grossProfit <= 0) {
            return {
                success: true,
                leaderShare: 0,
                platformFee: 0,
                followerNet: grossProfit,
                currency,
            };
        }
        const breakdown = await calculateProfitShareBreakdown(grossProfit, leader.profitSharePercent || 20, currency);
        const t = transaction || (await db_1.sequelize.transaction());
        const useExternalTransaction = !!transaction;
        try {
            // Credit leader's wallet with their share
            if (breakdown.leaderShare > 0) {
                const leaderWallet = await (0, wallet_1.getWalletByUserIdAndCurrency)(leader.userId, currency);
                if (leaderWallet) {
                    await (0, wallet_1.updateWalletBalance)(leaderWallet, breakdown.leaderShare, "add", `ct_profit_share_${tradeId}`, t);
                    // Create leader profit share transaction
                    await db_1.models.copyTradingTransaction.create({
                        userId: leader.userId,
                        leaderId: leader.id,
                        followerId: follower.id,
                        tradeId,
                        type: "PROFIT_SHARE_RECEIVED",
                        amount: breakdown.leaderShare,
                        currency,
                        fee: 0,
                        balanceBefore: parseFloat(leaderWallet.balance.toString()),
                        balanceAfter: parseFloat(leaderWallet.balance.toString()) +
                            breakdown.leaderShare,
                        description: `Profit share from follower trade: ${(0, currency_1.formatCurrencyAmount)(breakdown.leaderShare, currency)}`,
                        metadata: JSON.stringify({
                            grossProfit,
                            sharePercent: breakdown.leaderSharePercent,
                            currency,
                        }),
                        status: "COMPLETED",
                    }, { transaction: t });
                }
            }
            // Record follower's profit share paid
            await db_1.models.copyTradingTransaction.create({
                userId: follower.userId,
                leaderId: leader.id,
                followerId: follower.id,
                tradeId,
                type: "PROFIT_SHARE_PAID",
                amount: breakdown.leaderShare,
                currency,
                fee: breakdown.platformFee,
                balanceBefore: 0,
                balanceAfter: 0,
                description: `Profit share paid to leader: ${(0, currency_1.formatCurrencyAmount)(breakdown.leaderShare, currency)}`,
                metadata: JSON.stringify({
                    grossProfit,
                    leaderSharePercent: breakdown.leaderSharePercent,
                    platformFeePercent: breakdown.platformFeePercent,
                    currency,
                }),
                status: "COMPLETED",
            }, { transaction: t });
            // Record platform fee
            if (breakdown.platformFee > 0) {
                await db_1.models.copyTradingTransaction.create({
                    userId: follower.userId,
                    followerId: follower.id,
                    tradeId,
                    type: "PLATFORM_FEE",
                    amount: breakdown.platformFee,
                    currency,
                    fee: 0,
                    balanceBefore: 0,
                    balanceAfter: 0,
                    description: `Platform fee for profitable trade: ${(0, currency_1.formatCurrencyAmount)(breakdown.platformFee, currency)}`,
                    metadata: JSON.stringify({
                        grossProfit,
                        feePercent: breakdown.platformFeePercent,
                        currency,
                    }),
                    status: "COMPLETED",
                }, { transaction: t });
            }
            // Update leader's total profit from shares
            await db_1.models.copyTradingLeader.update({
                totalProfit: (0, sequelize_1.literal)(`"totalProfit" + ${breakdown.leaderShare}`),
            }, {
                where: { id: leader.id },
                transaction: t,
            });
            if (!useExternalTransaction) {
                await t.commit();
            }
            // Create audit log
            await (0, index_1.createAuditLog)({
                entityType: "copyTradingTrade",
                entityId: tradeId,
                action: "PROFIT_DISTRIBUTED",
                userId: follower.userId,
                metadata: breakdown,
            });
            return {
                success: true,
                leaderShare: breakdown.leaderShare,
                platformFee: breakdown.platformFee,
                followerNet: breakdown.followerNet,
                currency,
            };
        }
        catch (error) {
            if (!useExternalTransaction) {
                await t.rollback();
            }
            throw error;
        }
    }
    catch (error) {
        console_1.logger.error("COPY_TRADING", "Failed to distribute profit share", error);
        return {
            success: false,
            leaderShare: 0,
            platformFee: 0,
            followerNet: 0,
            currency,
            error: error.message,
        };
    }
}
// ============================================================================
// BATCH PROFIT DISTRIBUTION
// ============================================================================
/**
 * Process pending profit distributions
 */
async function processPendingProfitDistributions() {
    let processed = 0;
    let failed = 0;
    try {
        // Find closed trades that haven't had profit distributed
        const closedTrades = await db_1.models.copyTradingTrade.findAll({
            where: {
                status: "CLOSED",
                followerId: { [sequelize_1.Op.ne]: null },
                profit: { [sequelize_1.Op.gt]: 0 },
            },
            include: [
                {
                    model: db_1.models.copyTradingFollower,
                    as: "follower",
                    include: [
                        {
                            model: db_1.models.copyTradingLeader,
                            as: "leader",
                        },
                    ],
                },
            ],
        });
        for (const trade of closedTrades) {
            // Check if profit share already distributed
            const existingDistribution = await db_1.models.copyTradingTransaction.findOne({
                where: {
                    tradeId: trade.id,
                    type: "PROFIT_SHARE_PAID",
                },
            });
            if (existingDistribution) {
                continue; // Already distributed
            }
            const follower = trade.follower;
            const leader = follower === null || follower === void 0 ? void 0 : follower.leader;
            if (!follower || !leader) {
                continue;
            }
            // Get profit currency from trade or derive from symbol quote
            const profitCurrency = trade.profitCurrency || (0, currency_1.getQuoteCurrency)(trade.symbol);
            const result = await distributeProfitShare(trade.id, follower, leader, trade.profit, profitCurrency);
            if (result.success) {
                processed++;
            }
            else {
                failed++;
            }
        }
        return { processed, failed };
    }
    catch (error) {
        console_1.logger.error("COPY_TRADING", "Failed to process pending profit distributions", error);
        return { processed, failed };
    }
}
// ============================================================================
// LEADER EARNINGS
// ============================================================================
/**
 * Get leader's earnings summary
 * All amounts are converted to USDT for consistent aggregation
 */
async function getLeaderEarnings(leaderId, startDate, endDate) {
    const whereClause = {
        leaderId,
        type: "PROFIT_SHARE_RECEIVED",
        status: "COMPLETED",
    };
    if (startDate || endDate) {
        whereClause.createdAt = {};
        if (startDate)
            whereClause.createdAt[sequelize_1.Op.gte] = startDate;
        if (endDate)
            whereClause.createdAt[sequelize_1.Op.lte] = endDate;
    }
    // Get all transactions with currency info for proper conversion
    const transactions = await db_1.models.copyTradingTransaction.findAll({
        where: whereClause,
        attributes: ["amount", "currency"],
    });
    // Convert all amounts to USDT and track by currency
    let totalEarningsUSDT = 0;
    const earningsByCurrency = {};
    let tradeCount = 0;
    for (const tx of transactions) {
        const amount = parseFloat(tx.amount) || 0;
        const currency = tx.currency || "USDT";
        // Track original currency amounts
        earningsByCurrency[currency] = (earningsByCurrency[currency] || 0) + amount;
        tradeCount++;
        // Convert to USDT for totals
        try {
            const amountInUSDT = await (0, currency_1.convertToUSDT)(amount, currency);
            totalEarningsUSDT += amountInUSDT;
        }
        catch (conversionError) {
            // Fallback to raw amount if conversion fails
            console_1.logger.warn("COPY_TRADING", `Currency conversion failed for ${currency}`, conversionError);
            totalEarningsUSDT += amount;
        }
    }
    return {
        totalEarnings: totalEarningsUSDT,
        totalProfitShares: totalEarningsUSDT,
        totalPlatformFees: 0, // Platform fees go to platform, not leader
        tradeCount,
        currency: "USDT", // All totals are in USDT
        earningsByCurrency,
    };
}
/**
 * Get follower's profit share payments
 * All amounts are converted to USDT for consistent aggregation
 */
async function getFollowerProfitSharePayments(followerId, startDate, endDate) {
    const whereClause = {
        followerId,
        status: "COMPLETED",
    };
    if (startDate || endDate) {
        whereClause.createdAt = {};
        if (startDate)
            whereClause.createdAt[sequelize_1.Op.gte] = startDate;
        if (endDate)
            whereClause.createdAt[sequelize_1.Op.lte] = endDate;
    }
    // Get profit shares paid with currency info
    const profitShares = await db_1.models.copyTradingTransaction.findAll({
        where: { ...whereClause, type: "PROFIT_SHARE_PAID" },
        attributes: ["amount", "currency"],
    });
    // Get platform fees with currency info
    const platformFees = await db_1.models.copyTradingTransaction.findAll({
        where: { ...whereClause, type: "PLATFORM_FEE" },
        attributes: ["amount", "currency"],
    });
    // Convert profit shares to USDT
    let totalPaidUSDT = 0;
    const paidByCurrency = {};
    let tradeCount = 0;
    for (const tx of profitShares) {
        const amount = parseFloat(tx.amount) || 0;
        const currency = tx.currency || "USDT";
        paidByCurrency[currency] = (paidByCurrency[currency] || 0) + amount;
        tradeCount++;
        try {
            const amountInUSDT = await (0, currency_1.convertToUSDT)(amount, currency);
            totalPaidUSDT += amountInUSDT;
        }
        catch (conversionError) {
            console_1.logger.warn("COPY_TRADING", `Currency conversion failed for ${currency}`, conversionError);
            totalPaidUSDT += amount;
        }
    }
    // Convert platform fees to USDT
    let totalFeesUSDT = 0;
    for (const tx of platformFees) {
        const amount = parseFloat(tx.amount) || 0;
        const currency = tx.currency || "USDT";
        try {
            const amountInUSDT = await (0, currency_1.convertToUSDT)(amount, currency);
            totalFeesUSDT += amountInUSDT;
        }
        catch (conversionError) {
            console_1.logger.warn("COPY_TRADING", `Currency conversion failed for ${currency}`, conversionError);
            totalFeesUSDT += amount;
        }
    }
    return {
        totalPaid: totalPaidUSDT,
        totalPlatformFees: totalFeesUSDT,
        tradeCount,
        currency: "USDT", // All totals are in USDT
        paidByCurrency,
    };
}
// ============================================================================
// PROFIT SHARE PREVIEW
// ============================================================================
/**
 * Preview profit share for a potential trade close
 */
async function previewProfitShare(tradeId, closePrice) {
    var _a;
    const trade = await db_1.models.copyTradingTrade.findByPk(tradeId, {
        include: [
            {
                model: db_1.models.copyTradingFollower,
                as: "follower",
                include: [{ model: db_1.models.copyTradingLeader, as: "leader" }],
            },
        ],
    });
    if (!trade) {
        return { grossProfit: 0, breakdown: null };
    }
    const tradeData = trade;
    const entryPrice = tradeData.executedPrice || tradeData.price;
    const amount = tradeData.executedAmount || tradeData.amount;
    const { profit } = calculatePnL(entryPrice, closePrice, amount, tradeData.side, tradeData.fee || 0);
    if (profit <= 0 || !((_a = tradeData.follower) === null || _a === void 0 ? void 0 : _a.leader)) {
        return { grossProfit: profit, breakdown: null };
    }
    const breakdown = await calculateProfitShareBreakdown(profit, tradeData.follower.leader.profitSharePercent || 20);
    return { grossProfit: profit, breakdown };
}
