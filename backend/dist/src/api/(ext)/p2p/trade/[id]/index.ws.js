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
exports.onClose = exports.p2pTradeHandler = exports.metadata = void 0;
exports.broadcastP2PTradeEvent = broadcastP2PTradeEvent;
const Websocket_1 = require("@b/handler/Websocket");
const db_1 = require("@b/db");
const sequelize_1 = require("sequelize");
const console_1 = require("@b/utils/console");
exports.metadata = {
    requiresAuth: true,
};
// Track active subscriptions for P2P trade updates
// This is EVENT-DRIVEN - no polling. Updates are sent only when:
// 1. Client first subscribes (initial data)
// 2. Something happens (message, status change, etc.) via broadcastP2PTradeEvent
class P2PTradeDataHandler {
    constructor() {
        this.activeSubscriptions = new Map(); // tradeId -> Set<clientId>
    }
    static getInstance() {
        if (!P2PTradeDataHandler.instance) {
            P2PTradeDataHandler.instance = new P2PTradeDataHandler();
        }
        return P2PTradeDataHandler.instance;
    }
    /**
     * Get counterparty stats for a user
     */
    async getCounterpartyStats(userId) {
        const totalTrades = await db_1.models.p2pTrade.count({
            where: {
                [sequelize_1.Op.or]: [{ buyerId: userId }, { sellerId: userId }],
                status: { [sequelize_1.Op.in]: ["COMPLETED", "DISPUTE_RESOLVED", "CANCELLED", "EXPIRED"] },
            },
        });
        const completedTrades = await db_1.models.p2pTrade.count({
            where: {
                [sequelize_1.Op.or]: [{ buyerId: userId }, { sellerId: userId }],
                status: "COMPLETED",
            },
        });
        const completionRate = totalTrades > 0 ? Math.round((completedTrades / totalTrades) * 100) : 100;
        return { completedTrades, completionRate };
    }
    /**
     * Fetch and send initial trade data to a client
     * This is called only once when client subscribes
     */
    async sendInitialData(tradeId, userId, isAdmin = false) {
        var _a, _b, _c, _d;
        try {
            // Fetch trade with all relations
            const whereClause = isAdmin
                ? { id: tradeId }
                : { id: tradeId, [sequelize_1.Op.or]: [{ buyerId: userId }, { sellerId: userId }] };
            const trade = await db_1.models.p2pTrade.findOne({
                where: whereClause,
                include: [
                    { association: "buyer", attributes: ["id", "firstName", "lastName", "email", "avatar"] },
                    { association: "seller", attributes: ["id", "firstName", "lastName", "email", "avatar"] },
                    { association: "dispute" },
                    {
                        association: "paymentMethodDetails",
                        attributes: ["id", "name", "icon", "processingTime", "instructions"],
                        required: false
                    },
                    {
                        association: "offer",
                        attributes: ["id", "currency", "priceCurrency", "walletType", "type", "tradeSettings"],
                        required: false
                    },
                ],
            });
            if (!trade) {
                console_1.logger.warn("P2P_WS", `Trade ${tradeId} not found or user ${userId} not authorized`);
                return;
            }
            const tradeData = trade.toJSON();
            // Get counterparty stats
            if (tradeData.buyer) {
                tradeData.buyer.name = `${tradeData.buyer.firstName || ''} ${tradeData.buyer.lastName || ''}`.trim();
                const buyerStats = await this.getCounterpartyStats(tradeData.buyer.id);
                tradeData.buyer.completedTrades = buyerStats.completedTrades;
                tradeData.buyer.completionRate = buyerStats.completionRate;
            }
            if (tradeData.seller) {
                tradeData.seller.name = `${tradeData.seller.firstName || ''} ${tradeData.seller.lastName || ''}`.trim();
                const sellerStats = await this.getCounterpartyStats(tradeData.seller.id);
                tradeData.seller.completedTrades = sellerStats.completedTrades;
                tradeData.seller.completionRate = sellerStats.completionRate;
            }
            // Add payment window from offer settings or platform default
            const { CacheManager } = await Promise.resolve().then(() => __importStar(require("@b/utils/cache")));
            const cacheManager = CacheManager.getInstance();
            const defaultPaymentWindow = await cacheManager.getSetting("p2pDefaultPaymentWindow") || 240;
            tradeData.paymentWindow = ((_b = (_a = tradeData.offer) === null || _a === void 0 ? void 0 : _a.tradeSettings) === null || _b === void 0 ? void 0 : _b.autoCancel) ||
                ((_d = (_c = tradeData.offer) === null || _c === void 0 ? void 0 : _c.tradeSettings) === null || _d === void 0 ? void 0 : _d.paymentWindow) ||
                defaultPaymentWindow;
            // Parse timeline if it's a string
            let timeline = tradeData.timeline || [];
            if (typeof timeline === 'string') {
                try {
                    timeline = JSON.parse(timeline);
                }
                catch (e) {
                    console_1.logger.error("P2P_WS", `Failed to parse timeline JSON: ${e}`);
                    timeline = [];
                }
            }
            tradeData.timeline = timeline;
            // Filter messages from timeline
            const messages = Array.isArray(timeline)
                ? timeline
                    .filter((entry) => entry.event === "MESSAGE")
                    .map((entry) => ({
                    id: entry.id || entry.createdAt,
                    message: entry.message,
                    senderId: entry.senderId,
                    senderName: entry.senderName || "User",
                    isAdminMessage: entry.isAdminMessage || false,
                    createdAt: entry.createdAt,
                }))
                : [];
            // Broadcast initial data
            Websocket_1.messageBroker.broadcastToSubscribedClients(`/api/p2p/trade/${tradeId}`, { tradeId, userId }, {
                stream: "p2p-trade-data",
                data: {
                    ...tradeData,
                    messages,
                },
            });
        }
        catch (error) {
            console_1.logger.error("P2P_WS", `Error sending initial data for trade ${tradeId}: ${error}`);
        }
    }
    /**
     * Check if user is an admin with P2P access
     */
    async isAdmin(userId) {
        try {
            const user = await db_1.models.user.findByPk(userId, {
                include: [
                    {
                        model: db_1.models.role,
                        as: "role",
                        include: [
                            {
                                model: db_1.models.permission,
                                as: "permissions",
                                through: { attributes: [] },
                            },
                        ],
                    },
                ],
            });
            if (!user || !user.role)
                return false;
            const permissions = user.role.permissions || [];
            const hasAdminAccess = permissions.some((p) => p.name === "view.p2p.trade" ||
                p.name === "edit.p2p.trade" ||
                p.name === "view.p2p.dispute" ||
                p.name === "edit.p2p.dispute" ||
                p.name === "Access P2P Trade Management" ||
                p.name === "Access P2P Dispute Management");
            return hasAdminAccess;
        }
        catch (error) {
            console_1.logger.error("P2P_WS", `Error checking admin status: ${error}`);
            return false;
        }
    }
    /**
     * Add a subscription for a trade
     */
    async addSubscription(tradeId, userId, isAdminSubscription = false) {
        if (!tradeId || !userId) {
            console_1.logger.warn("P2P_WS", "No tradeId or userId provided in subscription request");
            return;
        }
        // Check if user is admin
        const isAdmin = isAdminSubscription || await this.isAdmin(userId);
        // Validate user has access to this trade
        let trade;
        if (isAdmin) {
            // Admin can access any trade
            trade = await db_1.models.p2pTrade.findByPk(tradeId, {
                attributes: ['id'],
            });
        }
        else {
            // Regular user must be buyer or seller
            trade = await db_1.models.p2pTrade.findOne({
                where: {
                    id: tradeId,
                    [sequelize_1.Op.or]: [{ buyerId: userId }, { sellerId: userId }],
                },
                attributes: ['id'],
            });
        }
        if (!trade) {
            console_1.logger.warn("P2P_WS", `Trade ${tradeId} not found or user ${userId} not authorized`);
            return;
        }
        // Add to subscriptions
        if (!this.activeSubscriptions.has(tradeId)) {
            this.activeSubscriptions.set(tradeId, new Set());
        }
        this.activeSubscriptions.get(tradeId).add(userId);
        // Send initial data to the newly subscribed client
        await this.sendInitialData(tradeId, userId, isAdmin);
        console_1.logger.info("P2P_WS", `${isAdmin ? 'Admin' : 'User'} ${userId} subscribed to trade ${tradeId}`);
    }
    /**
     * Remove a subscription
     */
    removeSubscription(tradeId, userId) {
        if (this.activeSubscriptions.has(tradeId)) {
            this.activeSubscriptions.get(tradeId).delete(userId);
            // If no more clients for this trade, clean up
            if (this.activeSubscriptions.get(tradeId).size === 0) {
                this.activeSubscriptions.delete(tradeId);
            }
            console_1.logger.debug("P2P_WS", `User ${userId} unsubscribed from trade ${tradeId}`);
        }
    }
    /**
     * Broadcast an event to all clients subscribed to a trade
     * This is called from trade actions (confirm, release, cancel, dispute, message)
     */
    broadcastEvent(tradeId, event) {
        const subscriptions = this.activeSubscriptions.get(tradeId);
        if (!subscriptions || subscriptions.size === 0) {
            return;
        }
        // Broadcast to all subscribed clients
        for (const userId of subscriptions) {
            Websocket_1.messageBroker.broadcastToSubscribedClients(`/api/p2p/trade/${tradeId}`, { tradeId, userId }, {
                stream: "p2p-trade-event",
                data: {
                    tradeId,
                    timestamp: new Date().toISOString(),
                    ...event,
                },
            });
        }
    }
    /**
     * Check if there are any subscribers for a trade
     */
    hasSubscribers(tradeId) {
        const subscriptions = this.activeSubscriptions.get(tradeId);
        return subscriptions ? subscriptions.size > 0 : false;
    }
    /**
     * Remove all subscriptions for a specific client (called on disconnect)
     */
    removeClientFromAllSubscriptions(clientId) {
        const tradesToCleanup = [];
        for (const [tradeId, clients] of this.activeSubscriptions) {
            if (clients.has(clientId)) {
                clients.delete(clientId);
                if (clients.size === 0) {
                    tradesToCleanup.push(tradeId);
                }
            }
        }
        for (const tradeId of tradesToCleanup) {
            this.activeSubscriptions.delete(tradeId);
        }
        if (tradesToCleanup.length > 0) {
            console_1.logger.debug("P2P_WS", `Cleaned up subscriptions for disconnected client ${clientId}`);
        }
    }
}
// Export the handler instance for external use
exports.p2pTradeHandler = P2PTradeDataHandler.getInstance();
// Export helper function to broadcast events from trade actions
function broadcastP2PTradeEvent(tradeId, event) {
    exports.p2pTradeHandler.broadcastEvent(tradeId, event);
}
// WebSocket message handler
exports.default = async (data, message) => {
    var _a;
    // Parse the incoming message if it's a string
    if (typeof message === "string") {
        message = JSON.parse(message);
    }
    const { action, payload } = message;
    const { tradeId, isAdmin } = payload || {};
    const userId = (_a = data.user) === null || _a === void 0 ? void 0 : _a.id;
    if (!userId) {
        console_1.logger.error("P2P_WS", "No user ID found - authentication required");
        return;
    }
    if (!tradeId) {
        console_1.logger.error("P2P_WS", "No tradeId in payload");
        return;
    }
    const handler = P2PTradeDataHandler.getInstance();
    if (action === "SUBSCRIBE") {
        // Pass isAdmin flag - will be verified against actual permissions
        await handler.addSubscription(tradeId, userId, isAdmin === true);
    }
    else if (action === "UNSUBSCRIBE") {
        handler.removeSubscription(tradeId, userId);
    }
};
// Handle client disconnect
const onClose = (ws, route, clientId) => {
    const handler = P2PTradeDataHandler.getInstance();
    handler.removeClientFromAllSubscriptions(clientId);
};
exports.onClose = onClose;
