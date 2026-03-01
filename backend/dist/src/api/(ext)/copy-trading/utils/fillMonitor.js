"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.FillMonitor = void 0;
exports.closeTrade = closeTrade;
exports.closeLeaderTrade = closeLeaderTrade;
exports.handleOrderFilled = handleOrderFilled;
// Fill Monitor - Monitor order fills in real-time
const db_1 = require("@b/db");
const sequelize_1 = require("sequelize");
const console_1 = require("@b/utils/console");
const wallet_1 = require("@b/api/(ext)/ecosystem/utils/wallet");
const profitShare_1 = require("./profitShare");
const dailyLimits_1 = require("./dailyLimits");
const index_1 = require("./index");
// ============================================================================
// FILL MONITOR CLASS
// ============================================================================
class FillMonitor {
    constructor() {
        this.isProcessing = false;
        this.pollInterval = null;
    }
    static getInstance() {
        if (!FillMonitor.instance) {
            FillMonitor.instance = new FillMonitor();
        }
        return FillMonitor.instance;
    }
    /**
     * Start polling for order fills
     */
    start(intervalMs = 5000) {
        if (this.pollInterval) {
            return;
        }
        this.pollInterval = setInterval(async () => {
            await this.checkPendingOrders();
        }, intervalMs);
        console_1.logger.info("COPY_TRADING", "FillMonitor started");
    }
    /**
     * Stop the fill monitor
     */
    stop() {
        if (this.pollInterval) {
            clearInterval(this.pollInterval);
            this.pollInterval = null;
        }
        console_1.logger.info("COPY_TRADING", "FillMonitor stopped");
    }
    /**
     * Handle an order fill event
     */
    async onOrderFilled(event) {
        try {
            // Check if this is a leader trade
            const leaderTrade = await db_1.models.copyTradingTrade.findOne({
                where: {
                    leaderOrderId: event.orderId,
                    isLeaderTrade: true,
                },
            });
            if (leaderTrade) {
                await this.handleLeaderOrderFill(leaderTrade, event);
                return;
            }
            // Check if this is a follower trade
            const followerTrade = await db_1.models.copyTradingTrade.findOne({
                where: {
                    leaderOrderId: event.orderId,
                    isLeaderTrade: false,
                },
                include: [
                    {
                        model: db_1.models.copyTradingFollower,
                        as: "follower",
                        include: [{ model: db_1.models.copyTradingLeader, as: "leader" }],
                    },
                ],
            });
            if (followerTrade) {
                await this.handleFollowerOrderFill(followerTrade, event);
            }
        }
        catch (error) {
            console_1.logger.error("COPY_TRADING", "Fill monitor error on order filled", error);
        }
    }
    /**
     * Handle a leader's order being filled
     */
    async handleLeaderOrderFill(trade, event) {
        const t = await db_1.sequelize.transaction();
        try {
            // Update trade with fill info
            await trade.update({
                executedAmount: event.filledAmount,
                executedPrice: event.filledPrice,
                fee: event.fee,
                status: event.status === "FILLED"
                    ? "OPEN"
                    : event.status === "CANCELLED"
                        ? "CANCELLED"
                        : "PARTIALLY_FILLED",
            }, { transaction: t });
            // If cancelled, mark all pending follower trades as cancelled too
            if (event.status === "CANCELLED") {
                await db_1.models.copyTradingTrade.update({ status: "CANCELLED" }, {
                    where: {
                        leaderOrderId: trade.leaderOrderId,
                        isLeaderTrade: false,
                        status: "PENDING",
                    },
                    transaction: t,
                });
            }
            await t.commit();
            // Create audit log
            await (0, index_1.createAuditLog)({
                entityType: "copyTradingTrade",
                entityId: trade.id,
                action: "ORDER_FILLED",
                metadata: {
                    filledAmount: event.filledAmount,
                    filledPrice: event.filledPrice,
                    status: event.status,
                },
            });
        }
        catch (error) {
            await t.rollback();
            console_1.logger.error("COPY_TRADING", "Failed to handle leader order fill", error);
        }
    }
    /**
     * Handle a follower's order being filled
     */
    async handleFollowerOrderFill(trade, event) {
        const t = await db_1.sequelize.transaction();
        try {
            // Calculate slippage
            const slippage = trade.price > 0
                ? ((event.filledPrice - trade.price) / trade.price) * 100
                : 0;
            // Update trade with fill info
            await trade.update({
                executedAmount: event.filledAmount,
                executedPrice: event.filledPrice,
                slippage,
                fee: event.fee,
                status: event.status === "FILLED"
                    ? "OPEN"
                    : event.status === "CANCELLED"
                        ? "CANCELLED"
                        : "PARTIALLY_FILLED",
            }, { transaction: t });
            await t.commit();
            // Create audit log
            await (0, index_1.createAuditLog)({
                entityType: "copyTradingTrade",
                entityId: trade.id,
                action: "ORDER_FILLED",
                metadata: {
                    filledAmount: event.filledAmount,
                    filledPrice: event.filledPrice,
                    slippage,
                    status: event.status,
                },
            });
        }
        catch (error) {
            await t.rollback();
            console_1.logger.error("COPY_TRADING", "Failed to handle follower order fill", error);
        }
    }
    /**
     * Check for pending orders that need status updates
     */
    async checkPendingOrders() {
        if (this.isProcessing) {
            return;
        }
        this.isProcessing = true;
        try {
            // Find trades with PENDING status older than 30 seconds
            const cutoff = new Date(Date.now() - 30000);
            const pendingTrades = await db_1.models.copyTradingTrade.findAll({
                where: {
                    status: "PENDING",
                    createdAt: { [sequelize_1.Op.lt]: cutoff },
                },
                limit: 100,
            });
            for (const trade of pendingTrades) {
                // Mark as failed if still pending after timeout
                await trade.update({
                    status: "FAILED",
                    errorMessage: "Order timeout - no fill received",
                });
            }
        }
        catch (error) {
            console_1.logger.error("COPY_TRADING", "Failed to check pending orders", error);
        }
        finally {
            this.isProcessing = false;
        }
    }
}
exports.FillMonitor = FillMonitor;
FillMonitor.instance = null;
// ============================================================================
// TRADE CLOSURE FUNCTIONS
// ============================================================================
/**
 * Close a trade and calculate P&L
 */
async function closeTrade(tradeId, closePrice, closeAmount) {
    const t = await db_1.sequelize.transaction();
    try {
        const trade = await db_1.models.copyTradingTrade.findByPk(tradeId, {
            transaction: t,
            lock: t.LOCK.UPDATE,
            include: [
                {
                    model: db_1.models.copyTradingFollower,
                    as: "follower",
                    include: [{ model: db_1.models.copyTradingLeader, as: "leader" }],
                },
            ],
        });
        if (!trade) {
            await t.rollback();
            return { success: false, error: "Trade not found" };
        }
        const tradeData = trade;
        if (tradeData.status === "CLOSED") {
            await t.rollback();
            return { success: false, error: "Trade already closed" };
        }
        const amount = closeAmount || tradeData.executedAmount || tradeData.amount;
        const entryPrice = tradeData.executedPrice || tradeData.price;
        const entryCost = tradeData.cost;
        // Calculate P&L
        let profit;
        if (tradeData.side === "BUY") {
            // Long position: profit = (closePrice - entryPrice) * amount
            profit = (closePrice - entryPrice) * amount;
        }
        else {
            // Short position: profit = (entryPrice - closePrice) * amount
            profit = (entryPrice - closePrice) * amount;
        }
        // Subtract fees
        profit -= tradeData.fee || 0;
        const profitPercent = entryCost > 0 ? (profit / entryCost) * 100 : 0;
        // Update trade
        await tradeData.update({
            profit,
            profitPercent,
            status: "CLOSED",
            closedAt: new Date(),
        }, { transaction: t });
        // If this is a follower trade, handle profit distribution
        if (tradeData.followerId && tradeData.follower) {
            const follower = tradeData.follower;
            const leader = follower.leader;
            // Parse symbol to get currencies
            const [baseCurrency, quoteCurrency] = tradeData.symbol.split("/");
            // Get the allocation for this market
            const allocation = await db_1.models.copyTradingFollowerAllocation.findOne({
                where: {
                    followerId: follower.id,
                    symbol: tradeData.symbol,
                },
                transaction: t,
                lock: t.LOCK.UPDATE,
            });
            // Return funds based on trade side
            if (tradeData.side === "BUY") {
                // BUY trade: spent quote currency, received base currency
                // Return base currency to user wallet
                const receiveAmount = amount; // Amount of base currency
                if (receiveAmount > 0) {
                    const baseWallet = await (0, wallet_1.getWalletByUserIdAndCurrency)(follower.userId, baseCurrency);
                    if (baseWallet) {
                        await (0, wallet_1.updateWalletBalance)(baseWallet, receiveAmount, "add", `ct_fill_base_${tradeData.id}`, t);
                    }
                }
                // Release used quote currency from allocation
                if (allocation) {
                    await allocation.update({
                        quoteUsedAmount: (0, sequelize_1.literal)(`GREATEST(0, "quoteUsedAmount" - ${entryCost})`),
                    }, { transaction: t });
                }
            }
            else {
                // SELL trade: spent base currency, received quote currency
                // Return quote currency (cost + profit) to user wallet
                const receiveAmount = entryCost + profit;
                if (receiveAmount > 0) {
                    const quoteWallet = await (0, wallet_1.getWalletByUserIdAndCurrency)(follower.userId, quoteCurrency);
                    if (quoteWallet) {
                        await (0, wallet_1.updateWalletBalance)(quoteWallet, receiveAmount, "add", `ct_fill_quote_${tradeData.id}`, t);
                    }
                }
                // Release used base currency from allocation
                if (allocation) {
                    await allocation.update({
                        baseUsedAmount: (0, sequelize_1.literal)(`GREATEST(0, "baseUsedAmount" - ${amount})`),
                    }, { transaction: t });
                }
            }
            // Update allocation stats
            if (allocation) {
                await allocation.update({
                    totalProfit: (0, sequelize_1.literal)(`"totalProfit" + ${profit}`),
                    winRate: profit > 0
                        ? (0, sequelize_1.literal)(`(("winRate" * ("totalTrades" - 1) + 100) / "totalTrades")`)
                        : (0, sequelize_1.literal)(`(("winRate" * ("totalTrades" - 1)) / "totalTrades")`),
                }, { transaction: t });
            }
            // Update follower stats
            await follower.update({
                totalProfit: (0, sequelize_1.literal)(`"totalProfit" + ${profit}`),
                winRate: profit > 0
                    ? (0, sequelize_1.literal)(`(("winRate" * ("totalTrades" - 1) + 100) / "totalTrades")`)
                    : (0, sequelize_1.literal)(`(("winRate" * ("totalTrades" - 1)) / "totalTrades")`),
                // ROI is now calculated from allocations, not at follower level
            }, { transaction: t });
            // Record loss for daily limits
            if (profit < 0) {
                await (0, dailyLimits_1.recordLoss)(follower.id, Math.abs(profit));
            }
            // Distribute profit share if profitable
            if (profit > 0 && leader) {
                await (0, profitShare_1.distributeProfitShare)(tradeData.id, follower, leader, profit, quoteCurrency, t);
            }
            // Create transaction record
            await db_1.models.copyTradingTransaction.create({
                userId: follower.userId,
                followerId: follower.id,
                leaderId: tradeData.leaderId,
                tradeId: tradeData.id,
                type: profit >= 0 ? "TRADE_PROFIT" : "TRADE_LOSS",
                amount: Math.abs(profit),
                currency: quoteCurrency,
                fee: 0,
                balanceBefore: 0,
                balanceAfter: 0,
                description: `Trade closed: ${profit >= 0 ? "+" : ""}${profit.toFixed(2)} ${quoteCurrency}`,
                metadata: JSON.stringify({
                    closePrice,
                    profitPercent,
                }),
                status: "COMPLETED",
            }, { transaction: t });
        }
        await t.commit();
        // Update stats asynchronously
        (0, index_1.updateLeaderStats)(tradeData.leaderId).catch((e) => console_1.logger.error("COPY_TRADING", "Failed to update leader stats", e));
        if (tradeData.followerId) {
            (0, index_1.updateFollowerStats)(tradeData.followerId).catch((e) => console_1.logger.error("COPY_TRADING", "Failed to update follower stats", e));
        }
        // Create audit log
        await (0, index_1.createAuditLog)({
            entityType: "copyTradingTrade",
            entityId: tradeId,
            action: "TRADE_CLOSED",
            metadata: { closePrice, profit, profitPercent },
        });
        return { success: true, profit, profitPercent };
    }
    catch (error) {
        await t.rollback();
        console_1.logger.error("COPY_TRADING", "Failed to close trade", error);
        return { success: false, error: error.message };
    }
}
/**
 * Close all follower trades when leader closes their trade
 */
async function closeLeaderTrade(leaderTradeId, closePrice) {
    var _a;
    const errors = [];
    let closedCount = 0;
    try {
        // Close the leader's trade first
        const leaderResult = await closeTrade(leaderTradeId, closePrice);
        if (!leaderResult.success) {
            return { closedCount: 0, errors: [leaderResult.error || "Failed to close leader trade"] };
        }
        // Get all open follower trades
        const followerTrades = await db_1.models.copyTradingTrade.findAll({
            where: {
                leaderOrderId: (_a = (await db_1.models.copyTradingTrade.findByPk(leaderTradeId))) === null || _a === void 0 ? void 0 : _a.get("leaderOrderId"),
                isLeaderTrade: false,
                status: { [sequelize_1.Op.in]: ["OPEN", "PARTIALLY_FILLED"] },
            },
        });
        // Close each follower trade
        for (const trade of followerTrades) {
            const result = await closeTrade(trade.id, closePrice);
            if (result.success) {
                closedCount++;
            }
            else {
                errors.push(`Trade ${trade.id}: ${result.error}`);
            }
        }
        return { closedCount, errors };
    }
    catch (error) {
        console_1.logger.error("COPY_TRADING", "Failed to close leader trade", error);
        return { closedCount, errors: [error.message] };
    }
}
// ============================================================================
// EXPORTED FUNCTIONS
// ============================================================================
/**
 * Handle order filled event - entry point from ecosystem
 */
async function handleOrderFilled(orderId, userId, symbol, side, filledAmount, filledPrice, fee, status) {
    const monitor = FillMonitor.getInstance();
    await monitor.onOrderFilled({
        orderId,
        userId,
        symbol,
        side,
        filledAmount,
        filledPrice,
        fee,
        status,
        timestamp: new Date(),
    });
}
