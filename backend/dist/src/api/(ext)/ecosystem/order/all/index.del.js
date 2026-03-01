"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.metadata = void 0;
const utils_1 = require("@b/api/finance/wallet/utils");
const blockchain_1 = require("@b/api/(ext)/ecosystem/utils/blockchain");
const matchingEngine_1 = require("@b/api/(ext)/ecosystem/utils/matchingEngine");
const queries_1 = require("@b/api/(ext)/ecosystem/utils/scylla/queries");
const wallet_1 = require("@b/api/(ext)/ecosystem/utils/wallet");
const error_1 = require("@b/utils/error");
const console_1 = require("@b/utils/console");
const query_1 = require("@b/utils/query");
exports.metadata = {
    summary: "Cancels all open trading orders",
    description: "Cancels all open trading orders for the user and refunds the unfulfilled amounts.",
    operationId: "cancelAllOrders",
    tags: ["Trading", "Orders"],
    logModule: "ECOSYSTEM",
    logTitle: "Cancel all trading orders",
    responses: {
        200: {
            description: "All orders cancelled successfully",
            content: {
                "application/json": {
                    schema: {
                        type: "object",
                        properties: {
                            message: { type: "string", description: "Success message" },
                            cancelledCount: { type: "number", description: "Number of orders cancelled" },
                        },
                    },
                },
            },
        },
        401: query_1.unauthorizedResponse,
        500: query_1.serverErrorResponse,
    },
    requiresAuth: true,
};
exports.default = async (data) => {
    const { user, ctx } = data;
    if (!(user === null || user === void 0 ? void 0 : user.id)) {
        throw (0, error_1.createError)({ statusCode: 401, message: "Unauthorized" });
    }
    try {
        ctx === null || ctx === void 0 ? void 0 : ctx.step("Fetching all user orders");
        // Get all orders for the user
        const allOrders = await (0, queries_1.getOrdersByUserId)(user.id);
        ctx === null || ctx === void 0 ? void 0 : ctx.step("Filtering open orders");
        // Filter only OPEN orders
        const openOrders = allOrders.filter(order => order.status === "OPEN");
        if (openOrders.length === 0) {
            ctx === null || ctx === void 0 ? void 0 : ctx.success("No open orders to cancel");
            return {
                message: "No open orders to cancel",
                cancelledCount: 0,
            };
        }
        ctx === null || ctx === void 0 ? void 0 : ctx.step(`Processing ${openOrders.length} open orders`);
        const matchingEngine = await matchingEngine_1.MatchingEngine.getInstance();
        let cancelledCount = 0;
        // Cancel each open order
        for (const order of openOrders) {
            try {
                const totalAmount = BigInt(order.amount);
                const remaining = BigInt(order.remaining);
                const totalFee = BigInt(order.fee);
                const price = BigInt(order.price);
                const side = order.side;
                const symbol = order.symbol;
                if (remaining === BigInt(0)) {
                    continue; // Skip fully filled orders
                }
                const [currency, pair] = symbol.split("/");
                let refundAmount = 0;
                if (side === "BUY") {
                    // BUY order: user locked (amount * price + fee) in pair currency
                    // For partial fills, the filled portion already released funds from inOrder
                    // We need to refund what's STILL LOCKED for the remaining unfilled portion
                    // Calculate proportional cost and fee for remaining amount
                    const fillRatio = Number(remaining) / Number(totalAmount);
                    const remainingCost = (remaining * price) / BigInt(1e18); // remaining * price
                    const remainingFee = (totalFee * BigInt(Math.floor(fillRatio * 1e18))) / BigInt(1e18);
                    // Total refund = remaining cost + remaining fee (what's still locked)
                    refundAmount = (0, blockchain_1.fromBigInt)(remainingCost + remainingFee);
                }
                else {
                    // SELL order: user locked 'amount' in base currency
                    // For partial fills, filled amount was already released from inOrder
                    // Refund the remaining unfilled amount that's still locked
                    refundAmount = (0, blockchain_1.fromBigInt)(remaining);
                }
                const refundCurrency = side === "BUY" ? pair : currency;
                const wallet = await (0, utils_1.getWallet)(user.id, "ECO", refundCurrency, false, ctx);
                if (!wallet) {
                    console_1.logger.warn("ORDERS", `Wallet not found for ${refundCurrency}, skipping order ${order.id}`);
                    continue;
                }
                // Cancel the order
                await (0, queries_1.cancelOrderByUuid)(user.id, order.id, typeof order.createdAt === 'string' ? order.createdAt : order.createdAt.toISOString(), symbol, BigInt(order.price), side, totalAmount);
                // Unlock and refund the leftover funds
                // Funds are locked in inOrder when order is created, need to unlock them and add back to balance
                const idempotencyKey = `eco_order_cancel_${order.id}_${wallet.id}`;
                await (0, wallet_1.updateWalletBalance)(wallet, refundAmount, "add", idempotencyKey);
                // Remove from orderbook and internal queues
                await matchingEngine.handleOrderCancellation(order.id, symbol);
                cancelledCount++;
            }
            catch (error) {
                console_1.logger.error("ORDERS", `Failed to cancel order ${order.id}`, error);
                // Continue with other orders even if one fails
            }
        }
        ctx === null || ctx === void 0 ? void 0 : ctx.success(`Successfully cancelled ${cancelledCount} of ${openOrders.length} orders`);
        return {
            message: `Successfully cancelled ${cancelledCount} order(s)`,
            cancelledCount,
        };
    }
    catch (error) {
        ctx === null || ctx === void 0 ? void 0 : ctx.fail(`Failed to cancel orders: ${error.message}`);
        throw (0, error_1.createError)({
            statusCode: 500,
            message: `Failed to cancel orders: ${error.message}`,
        });
    }
};
