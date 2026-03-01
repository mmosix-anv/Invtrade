"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.OrderManager = void 0;
const console_1 = require("@b/utils/console");
const queries_1 = require("../scylla/queries");
// Order expiration times in milliseconds
const AI_ORDER_EXPIRATION_MS = 5 * 60 * 1000; // 5 minutes for AI-only orders (should match quickly)
const REAL_ORDER_EXPIRATION_MS = 60 * 60 * 1000; // 1 hour for real liquidity orders (need time to match with users)
/**
 * OrderManager - Manages orders for a single market
 *
 * Handles:
 * - Creating AI-only orders (in ai_bot_orders table)
 * - Creating real liquidity orders (in ecosystem orders table)
 * - Tracking open orders
 * - Canceling and expiring orders
 * - Order matching (for AI-to-AI trades)
 */
class OrderManager {
    constructor(config, engine) {
        // Open orders tracking (both AI and real)
        this.openOrders = new Map();
        // Statistics
        this.ordersCreated = 0;
        this.ordersCanceled = 0;
        this.ordersFilled = 0;
        this.config = config;
        this.engine = engine;
    }
    /**
     * Initialize - load existing open REAL LIQUIDITY orders only
     * AI-to-AI trades no longer create persistent orders, so we skip loading AI-only orders
     */
    async initialize() {
        try {
            // Only load real liquidity open orders (if realLiquidityPercent > 0)
            // AI-only orders are no longer created for AI-to-AI trades
            if (this.config.realLiquidityPercent > 0) {
                const realOrders = await (0, queries_1.getRealLiquidityOrdersBySymbol)(this.config.symbol, "OPEN");
                for (const order of realOrders) {
                    this.trackOrder({
                        orderId: order.ecosystemOrderId,
                        botId: order.aiBotOrderId,
                        side: order.side,
                        price: order.price,
                        amount: order.amount,
                        filledAmount: BigInt(0),
                        isRealLiquidity: true,
                        createdAt: order.createdAt,
                        expiresAt: new Date(order.createdAt.getTime() + REAL_ORDER_EXPIRATION_MS),
                    });
                }
            }
            console_1.logger.info("AI_MM", `OrderManager initialized with ${this.openOrders.size} real liquidity orders for ${this.config.symbol}`);
        }
        catch (error) {
            console_1.logger.error("AI_MM", "OrderManager initialization error", error);
            throw error;
        }
    }
    /**
     * Create a new order
     */
    async createOrder(params) {
        try {
            if (params.isRealLiquidity) {
                return this.createRealOrder(params);
            }
            else {
                return this.createAiOrder(params);
            }
        }
        catch (error) {
            console_1.logger.error("AI_MM", "Order creation error", error);
            return null;
        }
    }
    /**
     * Create an AI-only order
     */
    async createAiOrder(params) {
        const orderId = await (0, queries_1.insertBotOrder)({
            marketId: this.config.marketId,
            botId: params.botId,
            side: params.side,
            type: params.type,
            price: params.price,
            amount: params.amount,
            filledAmount: BigInt(0),
            status: "OPEN",
            purpose: params.purpose,
        });
        // Track locally with shorter expiration for AI orders
        const now = new Date();
        this.trackOrder({
            orderId,
            botId: params.botId,
            side: params.side,
            price: params.price,
            amount: params.amount,
            filledAmount: BigInt(0),
            isRealLiquidity: false,
            createdAt: now,
            expiresAt: new Date(now.getTime() + AI_ORDER_EXPIRATION_MS), // Use shorter expiration for AI orders
        });
        this.ordersCreated++;
        return orderId;
    }
    /**
     * Create a real liquidity order (in ecosystem)
     * Uses pool liquidity - no user wallets needed
     */
    async createRealOrder(params) {
        // First create AI order to track
        const aiOrderId = await (0, queries_1.insertBotOrder)({
            marketId: this.config.marketId,
            botId: params.botId,
            side: params.side,
            type: params.type,
            price: params.price,
            amount: params.amount,
            filledAmount: BigInt(0),
            status: "OPEN",
            purpose: params.purpose,
        });
        // Then place in ecosystem with marketMakerId/botId for pool-based matching
        const ecosystemOrder = await (0, queries_1.placeRealOrder)(this.config.symbol, params.side, params.price, params.amount, aiOrderId, this.config.id, // Pass market maker ID (config.id) for pool identification
        params.botId // Pass bot ID for tracking
        );
        // Track locally with longer expiration for real liquidity orders
        const now = new Date();
        this.trackOrder({
            orderId: ecosystemOrder.id,
            botId: params.botId,
            side: params.side,
            price: params.price,
            amount: params.amount,
            filledAmount: BigInt(0),
            isRealLiquidity: true,
            createdAt: now,
            expiresAt: new Date(now.getTime() + REAL_ORDER_EXPIRATION_MS), // Use longer expiration for real orders
        });
        this.ordersCreated++;
        return ecosystemOrder.id;
    }
    /**
     * Cancel an order
     */
    async cancelOrder(orderId) {
        try {
            const order = this.openOrders.get(orderId);
            if (!order) {
                return false;
            }
            if (order.isRealLiquidity) {
                // Cancel in ecosystem - use botId as the userId (matches how order was created)
                await (0, queries_1.cancelRealOrder)(orderId, order.botId, order.createdAt.toISOString(), this.config.symbol, order.price, order.side, order.amount - order.filledAmount);
            }
            else {
                // Cancel AI order
                await (0, queries_1.cancelBotOrder)(this.config.marketId, orderId, order.createdAt);
            }
            this.openOrders.delete(orderId);
            this.ordersCanceled++;
            return true;
        }
        catch (error) {
            console_1.logger.error("AI_MM", "Order cancellation error", error);
            return false;
        }
    }
    /**
     * Cancel all open orders
     */
    async cancelAllOrders() {
        const orderIds = Array.from(this.openOrders.keys());
        await Promise.all(orderIds.map((id) => this.cancelOrder(id)));
        this.openOrders.clear();
    }
    /**
     * Cleanup expired orders
     * Note: Orders may have already been filled/cancelled by the matching engine,
     * so we silently remove them from local tracking if cancel fails
     */
    async cleanupExpiredOrders() {
        const now = new Date();
        const expiredOrderIds = [];
        for (const [orderId, order] of this.openOrders) {
            if (order.expiresAt <= now) {
                expiredOrderIds.push(orderId);
            }
        }
        if (expiredOrderIds.length === 0)
            return;
        let cancelledCount = 0;
        let alreadyGoneCount = 0;
        for (const orderId of expiredOrderIds) {
            const order = this.openOrders.get(orderId);
            if (!order)
                continue;
            try {
                if (order.isRealLiquidity) {
                    // For real liquidity orders, try to cancel but don't error if already gone
                    await (0, queries_1.cancelRealOrder)(orderId, order.botId, order.createdAt.toISOString(), this.config.symbol, order.price, order.side, order.amount - order.filledAmount);
                }
                else {
                    // Cancel AI order
                    await (0, queries_1.cancelBotOrder)(this.config.marketId, orderId, order.createdAt);
                }
                cancelledCount++;
            }
            catch (error) {
                // Order was likely already filled or cancelled by matching engine - this is expected
                alreadyGoneCount++;
            }
            // Remove from local tracking regardless of cancel result
            this.openOrders.delete(orderId);
            this.ordersCanceled++;
        }
        console_1.logger.info("AI_MM", `Cleaned up ${expiredOrderIds.length} expired orders for ${this.config.symbol} (cancelled: ${cancelledCount}, already processed: ${alreadyGoneCount})`);
    }
    /**
     * Update order fill
     */
    async updateOrderFill(orderId, filledAmount, status) {
        const order = this.openOrders.get(orderId);
        if (!order) {
            return;
        }
        // Update in database
        if (!order.isRealLiquidity) {
            await (0, queries_1.updateBotOrder)(this.config.marketId, orderId, order.createdAt, {
                filledAmount,
                status,
            });
        }
        // Update tracking
        order.filledAmount = filledAmount;
        if (status === "FILLED") {
            this.openOrders.delete(orderId);
            this.ordersFilled++;
        }
    }
    /**
     * Find matching orders for AI-to-AI trades
     */
    findMatchingOrders(side, price, maxAmount) {
        const oppositeSide = side === "BUY" ? "SELL" : "BUY";
        const matches = [];
        let remainingAmount = maxAmount;
        for (const [, order] of this.openOrders) {
            // Only match AI-only orders
            if (order.isRealLiquidity) {
                continue;
            }
            // Must be opposite side
            if (order.side !== oppositeSide) {
                continue;
            }
            // Price must match (for BUY: sell price <= buy price, for SELL: buy price >= sell price)
            if (side === "BUY" && order.price > price) {
                continue;
            }
            if (side === "SELL" && order.price < price) {
                continue;
            }
            // Check available amount
            const available = order.amount - order.filledAmount;
            if (available <= BigInt(0)) {
                continue;
            }
            matches.push(order);
            remainingAmount -= available;
            if (remainingAmount <= BigInt(0)) {
                break;
            }
        }
        return matches;
    }
    /**
     * Get open order count
     */
    getOpenOrderCount() {
        return this.openOrders.size;
    }
    /**
     * Get open buy/sell counts
     */
    getOrderCounts() {
        let buys = 0;
        let sells = 0;
        for (const [, order] of this.openOrders) {
            if (order.side === "BUY") {
                buys++;
            }
            else {
                sells++;
            }
        }
        return { buys, sells };
    }
    /**
     * Get statistics
     */
    getStats() {
        return {
            openOrders: this.openOrders.size,
            ordersCreated: this.ordersCreated,
            ordersCanceled: this.ordersCanceled,
            ordersFilled: this.ordersFilled,
        };
    }
    /**
     * Track an order locally
     */
    trackOrder(order) {
        this.openOrders.set(order.orderId, order);
    }
    /**
     * Get open orders
     */
    getOpenOrders() {
        return Array.from(this.openOrders.values());
    }
}
exports.OrderManager = OrderManager;
exports.default = OrderManager;
