"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.executeOrder = executeOrder;
exports.cancelCopyOrder = cancelCopyOrder;
exports.checkPositionSize = checkPositionSize;
exports.checkStopLevels = checkStopLevels;
exports.monitorStopLevels = monitorStopLevels;
exports.calculateExpectedSlippage = calculateExpectedSlippage;
exports.checkSlippageLimit = checkSlippageLimit;
exports.getOrderStatus = getOrderStatus;
exports.syncTradeStatus = syncTradeStatus;
// Execution Utilities - Order execution and risk management
const db_1 = require("@b/db");
const sequelize_1 = require("sequelize");
const console_1 = require("@b/utils/console");
const wallet_1 = require("@b/api/(ext)/ecosystem/utils/wallet");
const queries_1 = require("@b/api/(ext)/ecosystem/utils/scylla/queries");
const blockchain_1 = require("@b/api/(ext)/ecosystem/utils/blockchain");
const index_1 = require("./index");
// ============================================================================
// ORDER EXECUTION
// ============================================================================
/**
 * Execute an order with risk checks
 */
async function executeOrder(params) {
    var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k;
    const { userId, symbol, side, type, amount, price } = params;
    try {
        // Get market info
        const [currency, pair] = symbol.split("/");
        const market = await db_1.models.ecosystemMarket.findOne({
            where: { currency, pair },
        });
        if (!market) {
            return { success: false, error: `Market not found: ${symbol}` };
        }
        const marketData = market;
        // Validate amount against market limits
        const minAmount = Number(((_c = (_b = (_a = marketData.metadata) === null || _a === void 0 ? void 0 : _a.limits) === null || _b === void 0 ? void 0 : _b.amount) === null || _c === void 0 ? void 0 : _c.min) || 0);
        const maxAmount = Number(((_f = (_e = (_d = marketData.metadata) === null || _d === void 0 ? void 0 : _d.limits) === null || _e === void 0 ? void 0 : _e.amount) === null || _f === void 0 ? void 0 : _f.max) || Number.MAX_SAFE_INTEGER);
        if (amount < minAmount) {
            return { success: false, error: `Amount below minimum: ${minAmount}` };
        }
        if (amount > maxAmount) {
            return { success: false, error: `Amount above maximum: ${maxAmount}` };
        }
        // Get effective price for market orders
        let effectivePrice = price;
        if (type === "MARKET") {
            const { asks, bids } = await (0, queries_1.getOrderBook)(symbol);
            if (side === "BUY" && asks && asks.length > 0) {
                effectivePrice = asks[0][0];
            }
            else if (side === "SELL" && bids && bids.length > 0) {
                effectivePrice = bids[0][0];
            }
        }
        // Calculate cost and fees
        const precision = Number(((_h = (_g = marketData.metadata) === null || _g === void 0 ? void 0 : _g.precision) === null || _h === void 0 ? void 0 : _h.price) || 8);
        const feeRate = Number(((_j = marketData.metadata) === null || _j === void 0 ? void 0 : _j.taker) || 0.1);
        const fee = parseFloat(((amount * effectivePrice * feeRate) / 100).toFixed(precision));
        const cost = side === "BUY"
            ? parseFloat((amount * effectivePrice + fee).toFixed(precision))
            : amount;
        // Check wallet balance
        const walletCurrency = side === "BUY" ? pair : currency;
        const wallet = await (0, wallet_1.getWalletByUserIdAndCurrency)(userId, walletCurrency);
        if (!wallet) {
            return { success: false, error: `Wallet not found: ${walletCurrency}` };
        }
        const walletBalance = parseFloat(wallet.balance.toString()) -
            parseFloat(((_k = wallet.inOrder) === null || _k === void 0 ? void 0 : _k.toString()) || "0");
        if (walletBalance < cost) {
            return {
                success: false,
                error: `Insufficient balance: ${walletBalance} < ${cost}`,
            };
        }
        // Create the order
        const order = await (0, queries_1.createOrder)({
            userId,
            symbol,
            amount: (0, blockchain_1.toBigIntFloat)(amount),
            price: (0, blockchain_1.toBigIntFloat)(effectivePrice),
            cost: (0, blockchain_1.toBigIntFloat)(cost),
            type,
            side,
            fee: (0, blockchain_1.toBigIntFloat)(fee),
            feeCurrency: pair,
        });
        // Update wallet balance
        await (0, wallet_1.updateWalletBalance)(wallet, cost, "subtract", `ct_exec_order_${order.id}`);
        return {
            success: true,
            orderId: order.id,
            executedAmount: amount,
            executedPrice: effectivePrice,
            fee,
        };
    }
    catch (error) {
        console_1.logger.error("COPY_TRADING", "Failed to execute order", error);
        return { success: false, error: error.message };
    }
}
/**
 * Cancel an existing order
 */
async function cancelCopyOrder(orderId, userId) {
    try {
        // Get all user orders to find the one we need to cancel
        const orders = await (0, queries_1.getOrdersByUserId)(userId);
        const order = orders.find((o) => o.id === orderId);
        if (!order) {
            return { success: false, error: "Order not found" };
        }
        // Format createdAt as ISO string for ScyllaDB
        const createdAtStr = order.createdAt instanceof Date
            ? order.createdAt.toISOString()
            : String(order.createdAt);
        // Call cancelOrderByUuid with all required parameters
        await (0, queries_1.cancelOrderByUuid)(userId, orderId, createdAtStr, order.symbol, order.price, order.side, order.remaining || order.amount);
        return { success: true };
    }
    catch (error) {
        console_1.logger.error("COPY_TRADING", "Failed to cancel order", error);
        return { success: false, error: error.message };
    }
}
// ============================================================================
// RISK MANAGEMENT
// ============================================================================
/**
 * Check position size against follower limits
 */
async function checkPositionSize(followerId, proposedAmount, price) {
    const follower = await db_1.models.copyTradingFollower.findByPk(followerId);
    if (!follower) {
        return { passed: false, reason: "Follower not found" };
    }
    const followerData = follower;
    const proposedCost = proposedAmount * price;
    // Check max position size
    if (followerData.maxPositionSize &&
        proposedAmount > followerData.maxPositionSize) {
        return {
            passed: true,
            adjustedAmount: followerData.maxPositionSize,
            reason: "Adjusted to max position size",
        };
    }
    // Check available balance
    const availableBalance = followerData.allocatedAmount - followerData.usedAmount;
    if (proposedCost > availableBalance) {
        return {
            passed: true,
            adjustedAmount: availableBalance / price,
            reason: "Adjusted to available balance",
        };
    }
    return { passed: true };
}
/**
 * Check stop-loss and take-profit levels
 */
async function checkStopLevels(tradeId, currentPrice) {
    const trade = await db_1.models.copyTradingTrade.findByPk(tradeId, {
        include: [{ model: db_1.models.copyTradingFollower, as: "follower" }],
    });
    if (!trade) {
        return { triggerStopLoss: false, triggerTakeProfit: false };
    }
    const tradeData = trade;
    const follower = tradeData.follower;
    if (!follower) {
        return { triggerStopLoss: false, triggerTakeProfit: false };
    }
    const entryPrice = tradeData.executedPrice || tradeData.price;
    const isLong = tradeData.side === "BUY";
    // Calculate stop-loss price
    let stopLossPrice;
    if (follower.stopLossPercent) {
        stopLossPrice = isLong
            ? entryPrice * (1 - follower.stopLossPercent / 100)
            : entryPrice * (1 + follower.stopLossPercent / 100);
    }
    // Calculate take-profit price
    let takeProfitPrice;
    if (follower.takeProfitPercent) {
        takeProfitPrice = isLong
            ? entryPrice * (1 + follower.takeProfitPercent / 100)
            : entryPrice * (1 - follower.takeProfitPercent / 100);
    }
    // Check if stop-loss triggered
    const triggerStopLoss = stopLossPrice
        ? isLong
            ? currentPrice <= stopLossPrice
            : currentPrice >= stopLossPrice
        : false;
    // Check if take-profit triggered
    const triggerTakeProfit = takeProfitPrice
        ? isLong
            ? currentPrice >= takeProfitPrice
            : currentPrice <= takeProfitPrice
        : false;
    return {
        triggerStopLoss,
        triggerTakeProfit,
        stopLossPrice,
        takeProfitPrice,
    };
}
/**
 * Monitor and execute stop-loss/take-profit for open trades
 */
async function monitorStopLevels() {
    let processed = 0;
    let triggered = 0;
    try {
        // Get all open follower trades with stop levels configured
        const openTrades = await db_1.models.copyTradingTrade.findAll({
            where: {
                followerId: { [sequelize_1.Op.ne]: null },
                status: "OPEN",
            },
            include: [
                {
                    model: db_1.models.copyTradingFollower,
                    as: "follower",
                    where: {
                        [sequelize_1.Op.or]: [
                            { stopLossPercent: { [sequelize_1.Op.ne]: null } },
                            { takeProfitPercent: { [sequelize_1.Op.ne]: null } },
                        ],
                    },
                },
            ],
        });
        for (const trade of openTrades) {
            processed++;
            // Get current price
            const [currency, pair] = trade.symbol.split("/");
            const { asks, bids } = await (0, queries_1.getOrderBook)(trade.symbol);
            const currentPrice = trade.side === "BUY"
                ? bids && bids.length > 0
                    ? bids[0][0]
                    : trade.price
                : asks && asks.length > 0
                    ? asks[0][0]
                    : trade.price;
            // Check stop levels
            const { triggerStopLoss, triggerTakeProfit } = await checkStopLevels(trade.id, currentPrice);
            if (triggerStopLoss || triggerTakeProfit) {
                triggered++;
                // Import closeTrade here to avoid circular dependency
                const { closeTrade } = await Promise.resolve().then(() => __importStar(require("./fillMonitor")));
                await closeTrade(trade.id, currentPrice);
                // Create audit log
                await (0, index_1.createAuditLog)({
                    entityType: "copyTradingTrade",
                    entityId: trade.id,
                    action: triggerStopLoss ? "STOP_LOSS_TRIGGERED" : "TAKE_PROFIT_TRIGGERED",
                    metadata: {
                        currentPrice,
                        entryPrice: trade.executedPrice || trade.price,
                    },
                });
            }
        }
        return { processed, triggered };
    }
    catch (error) {
        console_1.logger.error("COPY_TRADING", "Failed to monitor stop levels", error);
        return { processed, triggered };
    }
}
// ============================================================================
// SLIPPAGE PROTECTION
// ============================================================================
/**
 * Calculate expected slippage for an order
 */
async function calculateExpectedSlippage(symbol, side, amount, price) {
    try {
        const { asks, bids } = await (0, queries_1.getOrderBook)(symbol);
        const book = side === "BUY" ? asks : bids;
        if (!book || book.length === 0) {
            return { slippage: 0, effectivePrice: price };
        }
        let remainingAmount = amount;
        let totalCost = 0;
        for (const [levelPrice, levelAmount] of book) {
            const fillAmount = Math.min(remainingAmount, levelAmount);
            totalCost += fillAmount * levelPrice;
            remainingAmount -= fillAmount;
            if (remainingAmount <= 0)
                break;
        }
        const effectivePrice = totalCost / amount;
        const slippage = ((effectivePrice - price) / price) * 100;
        return { slippage: Math.abs(slippage), effectivePrice };
    }
    catch (error) {
        return { slippage: 0, effectivePrice: price };
    }
}
/**
 * Check if slippage is within acceptable limits
 */
async function checkSlippageLimit(symbol, side, amount, price, maxSlippagePercent = 2) {
    const { slippage, effectivePrice } = await calculateExpectedSlippage(symbol, side, amount, price);
    return {
        acceptable: slippage <= maxSlippagePercent,
        expectedSlippage: slippage,
    };
}
// ============================================================================
// ORDER MATCHING STATUS
// ============================================================================
/**
 * Get order status from the matching engine
 */
async function getOrderStatus(orderId) {
    try {
        // This would integrate with the actual matching engine
        // For now, return null to indicate we need to check the database
        return null;
    }
    catch (error) {
        return null;
    }
}
/**
 * Sync trade status with order status
 */
async function syncTradeStatus(tradeId) {
    try {
        const trade = await db_1.models.copyTradingTrade.findByPk(tradeId);
        if (!trade)
            return false;
        const tradeData = trade;
        const orderStatus = await getOrderStatus(tradeData.leaderOrderId);
        if (orderStatus) {
            await tradeData.update({
                executedAmount: orderStatus.filledAmount,
                executedPrice: orderStatus.filledPrice,
                fee: orderStatus.fee,
                status: orderStatus.status === "FILLED" ? "OPEN" : tradeData.status,
            });
            return true;
        }
        return false;
    }
    catch (error) {
        console_1.logger.error("COPY_TRADING", "Failed to sync trade status", error);
        return false;
    }
}
