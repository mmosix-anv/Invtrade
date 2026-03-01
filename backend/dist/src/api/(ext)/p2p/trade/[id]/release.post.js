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
exports.metadata = void 0;
const db_1 = require("@b/db");
const error_1 = require("@b/utils/error");
const console_1 = require("@b/utils/console");
const wallet_1 = require("@b/services/wallet");
exports.metadata = {
    summary: "Release Funds for Trade",
    description: "Releases funds and updates the trade status to 'COMPLETED' for the authenticated seller.",
    operationId: "releaseP2PTradeFunds",
    tags: ["P2P", "Trade"],
    requiresAuth: true,
    logModule: "P2P_TRADE",
    logTitle: "Release funds",
    parameters: [
        {
            index: 0,
            name: "id",
            in: "path",
            description: "Trade ID",
            required: true,
            schema: { type: "string" },
        },
    ],
    responses: {
        200: { description: "Funds released successfully." },
        401: { description: "Unauthorized." },
        404: { description: "Trade not found." },
        500: { description: "Internal Server Error." },
    },
};
exports.default = async (data) => {
    const { id } = data.params || {};
    const { user, ctx } = data;
    if (!(user === null || user === void 0 ? void 0 : user.id)) {
        throw (0, error_1.createError)({ statusCode: 401, message: "Unauthorized" });
    }
    ctx === null || ctx === void 0 ? void 0 : ctx.step("Checking idempotency and validating trade");
    // Import validation and utilities
    const { validateTradeStatusTransition } = await Promise.resolve().then(() => __importStar(require("../../utils/validation")));
    const { notifyTradeEvent } = await Promise.resolve().then(() => __importStar(require("../../utils/notifications")));
    const { broadcastP2PTradeEvent } = await Promise.resolve().then(() => __importStar(require("./index.ws")));
    const { sequelize } = await Promise.resolve().then(() => __importStar(require("@b/db")));
    const { getWalletSafe } = await Promise.resolve().then(() => __importStar(require("@b/api/finance/wallet/utils")));
    const { RedisSingleton } = await Promise.resolve().then(() => __importStar(require("@b/utils/redis")));
    const { createP2PAuditLog, P2PAuditEventType, P2PRiskLevel } = await Promise.resolve().then(() => __importStar(require("../../utils/audit")));
    // Implement idempotency to prevent double-release
    const idempotencyKey = `p2p:release:${id}:${user.id}`;
    const redis = RedisSingleton.getInstance();
    try {
        // Check if this operation was already performed
        const existingResult = await redis.get(idempotencyKey);
        if (existingResult) {
            return JSON.parse(existingResult);
        }
        // Set a lock to prevent concurrent executions
        const lockKey = `${idempotencyKey}:lock`;
        const lockAcquired = await redis.set(lockKey, "1", "EX", 30, "NX");
        if (!lockAcquired) {
            throw (0, error_1.createError)({
                statusCode: 409,
                message: "Operation already in progress. Please try again."
            });
        }
    }
    catch (redisError) {
        // Continue without idempotency if Redis is unavailable
        console_1.logger.error("P2P", "Redis error in idempotency check", redisError);
    }
    const transaction = await sequelize.transaction({
        isolationLevel: sequelize.constructor.Transaction.ISOLATION_LEVELS.SERIALIZABLE,
    });
    try {
        // Find and lock trade
        const trade = await db_1.models.p2pTrade.findOne({
            where: { id, sellerId: user.id },
            include: [{
                    model: db_1.models.p2pOffer,
                    as: "offer",
                    attributes: ["currency", "walletType"],
                }],
            lock: true,
            transaction,
        });
        if (!trade) {
            await transaction.rollback();
            throw (0, error_1.createError)({ statusCode: 404, message: "Trade not found" });
        }
        // Check if already released (additional safety check)
        if (["COMPLETED", "DISPUTED", "CANCELLED", "EXPIRED"].includes(trade.status)) {
            await transaction.rollback();
            throw (0, error_1.createError)({
                statusCode: 400,
                message: `Funds already released or trade is in final state: ${trade.status}`
            });
        }
        // Validate status transition - from PAYMENT_SENT to COMPLETED
        if (!validateTradeStatusTransition(trade.status, "COMPLETED")) {
            await transaction.rollback();
            throw (0, error_1.createError)({
                statusCode: 400,
                message: `Cannot release funds from status: ${trade.status}`
            });
        }
        ctx === null || ctx === void 0 ? void 0 : ctx.step("Processing fund transfer from seller to buyer");
        // Transfer funds to buyer when status is PAYMENT_SENT
        if (trade.status === "PAYMENT_SENT") {
            // This applies to ALL wallet types including FIAT
            // Note: For FIAT, the actual payment happens peer-to-peer externally,
            // but we still need to update platform balances for accounting
            // Get seller's wallet and unlock funds
            const sellerWallet = await getWalletSafe(trade.sellerId, trade.offer.walletType, trade.offer.currency);
            if (!sellerWallet) {
                await transaction.rollback();
                throw (0, error_1.createError)({
                    statusCode: 500,
                    message: "Seller wallet not found"
                });
            }
            // Verify we have locked funds to release
            if (sellerWallet.inOrder < trade.amount) {
                await transaction.rollback();
                throw (0, error_1.createError)({
                    statusCode: 400,
                    message: "Insufficient locked funds available to release"
                });
            }
            // Calculate fees - use escrowFee as the primary fee (shown to users)
            const escrowFeeAmount = parseFloat(trade.escrowFee || "0");
            const platformFee = Math.min(escrowFeeAmount, trade.amount);
            const buyerNetAmount = Math.max(0, trade.amount - platformFee);
            // Use wallet service for atomic, audited fund release from escrow
            const idempotencyKey = `p2p_release_${trade.id}`;
            ctx === null || ctx === void 0 ? void 0 : ctx.step(`Releasing ${trade.amount} ${trade.offer.currency} from seller's escrow`);
            // Execute from hold - this deducts from inOrder and does NOT add to balance
            await wallet_1.walletService.executeFromHold({
                idempotencyKey: `${idempotencyKey}_seller_execute`,
                userId: trade.sellerId,
                walletId: sellerWallet.id,
                walletType: trade.offer.walletType,
                currency: trade.offer.currency,
                amount: trade.amount,
                operationType: "P2P_TRADE_RELEASE",
                fee: platformFee,
                description: `P2P trade release #${trade.id}`,
                metadata: {
                    tradeId: trade.id,
                    buyerId: trade.buyerId,
                    escrowFee: escrowFeeAmount,
                },
                transaction,
            });
            // Audit log for funds unlocking
            await createP2PAuditLog({
                userId: user.id,
                eventType: P2PAuditEventType.FUNDS_UNLOCKED,
                entityType: "WALLET",
                entityId: sellerWallet.id,
                metadata: {
                    tradeId: trade.id,
                    amount: trade.amount,
                    currency: trade.offer.currency,
                    platformFee,
                },
                riskLevel: P2PRiskLevel.HIGH,
            });
            ctx === null || ctx === void 0 ? void 0 : ctx.step(`Transferring ${buyerNetAmount} ${trade.offer.currency} to buyer`);
            // Get or create buyer's wallet and credit the net amount
            const buyerWallet = await wallet_1.walletCreationService.getOrCreateWallet(trade.buyerId, trade.offer.walletType, trade.offer.currency);
            // Credit buyer's wallet
            await wallet_1.walletService.credit({
                idempotencyKey: `${idempotencyKey}_buyer_credit`,
                userId: trade.buyerId,
                walletId: buyerWallet.id,
                walletType: trade.offer.walletType,
                currency: trade.offer.currency,
                amount: buyerNetAmount,
                operationType: "P2P_TRADE_RECEIVE",
                description: `P2P trade receive #${trade.id}`,
                metadata: {
                    tradeId: trade.id,
                    sellerId: trade.sellerId,
                    originalAmount: trade.amount,
                    platformFee,
                },
                transaction,
            });
            // Audit log for funds transfer
            await createP2PAuditLog({
                userId: user.id,
                eventType: P2PAuditEventType.FUNDS_TRANSFERRED,
                entityType: "TRADE",
                entityId: trade.id,
                metadata: {
                    fromUserId: trade.sellerId,
                    toUserId: trade.buyerId,
                    requestedAmount: trade.amount,
                    buyerNetAmount,
                    platformFee,
                    escrowFee: escrowFeeAmount,
                    currency: trade.offer.currency,
                    walletType: trade.offer.walletType,
                },
                riskLevel: P2PRiskLevel.CRITICAL,
            });
            // Record platform commission if there's a fee
            if (platformFee > 0) {
                // Get system admin ID for commission recording
                const systemAdmin = await db_1.models.user.findOne({
                    include: [{
                            model: db_1.models.role,
                            as: "role",
                            where: { name: "Super Admin" },
                        }],
                    order: [["createdAt", "ASC"]], // Get the oldest super admin
                    transaction,
                });
                if (systemAdmin) {
                    // Record the commission in p2pCommission table
                    await db_1.models.p2pCommission.create({
                        adminId: systemAdmin.id,
                        amount: platformFee,
                        description: `P2P escrow fee for trade #${trade.id.slice(0, 8)}... - ${trade.amount} ${trade.offer.currency}`,
                        tradeId: trade.id,
                    }, { transaction });
                    console_1.logger.debug("P2P", `Platform commission recorded: tradeId=${trade.id}, adminId=${systemAdmin.id}, fee=${platformFee} ${trade.offer.currency}`);
                }
                else {
                    console_1.logger.warn("P2P", "No super admin found to assign commission");
                }
            }
            console_1.logger.info("P2P", `Funds transferred: tradeId=${trade.id}, seller=${trade.sellerId}, buyer=${trade.buyerId}, ${trade.offer.walletType} ${trade.offer.currency}, amount=${trade.amount}, fee=${platformFee}, buyerReceives=${buyerNetAmount}`);
        }
        ctx === null || ctx === void 0 ? void 0 : ctx.step("Updating trade status to COMPLETED");
        // Update trade status and timeline
        // Parse timeline if it's a string
        let timeline = trade.timeline || [];
        if (typeof timeline === "string") {
            try {
                timeline = JSON.parse(timeline);
            }
            catch (e) {
                console_1.logger.error("P2P", "Failed to parse timeline JSON", e);
                timeline = [];
            }
        }
        // Ensure timeline is an array
        if (!Array.isArray(timeline)) {
            timeline = [];
        }
        timeline.push({
            event: "FUNDS_RELEASED",
            message: "Seller released funds - Trade completed",
            userId: user.id,
            createdAt: new Date().toISOString(),
        });
        const previousStatus = trade.status;
        const completedAt = new Date();
        await trade.update({
            status: "COMPLETED",
            timeline,
            completedAt,
        }, { transaction });
        // Log activity
        await db_1.models.p2pActivityLog.create({
            userId: user.id,
            type: "TRADE_COMPLETED",
            action: "TRADE_COMPLETED",
            relatedEntity: "TRADE",
            relatedEntityId: trade.id,
            details: JSON.stringify({
                previousStatus,
                amount: trade.amount,
                currency: trade.offer.currency,
            }),
        }, { transaction });
        await transaction.commit();
        // Send notifications - use TRADE_COMPLETED event
        notifyTradeEvent(trade.id, "TRADE_COMPLETED", {
            buyerId: trade.buyerId,
            sellerId: trade.sellerId,
            amount: trade.amount,
            currency: trade.offer.currency,
        }).catch((err) => console_1.logger.error("P2P", "Failed to notify trade event", err));
        // Broadcast WebSocket event for real-time updates
        broadcastP2PTradeEvent(trade.id, {
            type: "STATUS_CHANGE",
            data: {
                status: "COMPLETED",
                previousStatus,
                completedAt,
                timeline,
            },
        });
        const result = {
            message: "Funds released successfully. Trade completed.",
            trade: {
                id: trade.id,
                status: "COMPLETED",
                completedAt,
            }
        };
        ctx === null || ctx === void 0 ? void 0 : ctx.success(`Released funds for trade ${trade.id.slice(0, 8)}... (${trade.amount} ${trade.offer.currency})`);
        // Cache the successful result for idempotency
        try {
            await redis.setex(idempotencyKey, 3600, JSON.stringify(result)); // Cache for 1 hour
            await redis.del(`${idempotencyKey}:lock`); // Release the lock
        }
        catch (redisError) {
            console_1.logger.error("P2P", "Redis error in caching result", redisError);
        }
        return result;
    }
    catch (err) {
        await transaction.rollback();
        // Release the lock on error
        try {
            await redis.del(`${idempotencyKey}:lock`);
        }
        catch (redisError) {
            console_1.logger.error("P2P", "Redis error in releasing lock", redisError);
        }
        if (err.statusCode) {
            throw err;
        }
        throw (0, error_1.createError)({
            statusCode: 500,
            message: "Failed to release funds: " + err.message,
        });
    }
};
