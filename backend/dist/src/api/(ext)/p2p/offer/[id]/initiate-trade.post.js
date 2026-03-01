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
exports.default = handler;
const db_1 = require("@b/db");
const error_1 = require("@b/utils/error");
const utils_1 = require("@b/api/finance/wallet/utils");
const notifications_1 = require("@b/api/(ext)/p2p/utils/notifications");
const audit_1 = require("@b/api/(ext)/p2p/utils/audit");
const sequelize_1 = require("sequelize");
const json_parser_1 = require("@b/api/(ext)/p2p/utils/json-parser");
const safe_imports_1 = require("@b/utils/safe-imports");
const console_1 = require("@b/utils/console");
const wallet_1 = require("@b/services/wallet");
exports.metadata = {
    summary: "Initiate Trade from P2P Offer",
    description: "Creates a new trade from an active P2P offer with proper validation and balance locking",
    operationId: "initiateP2PTrade",
    tags: ["P2P", "Trade"],
    requiresAuth: true,
    logModule: "P2P_TRADE",
    logTitle: "Initiate P2P trade",
    parameters: [
        {
            index: 0,
            name: "id",
            in: "path",
            description: "Offer ID",
            required: true,
            schema: { type: "string", format: "uuid" },
        },
    ],
    requestBody: {
        description: "Trade initiation details",
        required: true,
        content: {
            "application/json": {
                schema: {
                    type: "object",
                    properties: {
                        amount: {
                            type: "number",
                            minimum: 0,
                            description: "Amount to trade"
                        },
                        paymentMethodId: {
                            type: "string",
                            format: "uuid",
                            description: "Selected payment method ID"
                        },
                        message: {
                            type: "string",
                            maxLength: 500,
                            description: "Optional initial message"
                        }
                    },
                    required: ["amount", "paymentMethodId"],
                },
            },
        },
    },
    responses: {
        200: { description: "Trade initiated successfully." },
        400: { description: "Bad Request - Invalid offer or amount." },
        401: { description: "Unauthorized." },
        404: { description: "Offer not found." },
        409: { description: "Conflict - Offer unavailable or insufficient balance." },
        500: { description: "Internal Server Error." },
    },
};
async function handler(data) {
    var _a, _b;
    const { id } = data.params || {};
    const { amount, paymentMethodId, message } = data.body;
    const { user, ctx } = data;
    if (!(user === null || user === void 0 ? void 0 : user.id)) {
        throw (0, error_1.createError)({ statusCode: 401, message: "Unauthorized" });
    }
    ctx === null || ctx === void 0 ? void 0 : ctx.step("Finding and locking offer");
    let transaction;
    try {
        transaction = await db_1.sequelize.transaction();
        // 1. Find and lock the offer
        const offer = await db_1.models.p2pOffer.findOne({
            where: {
                id,
                status: "ACTIVE",
                userId: { [sequelize_1.Op.ne]: user.id } // Can't trade with yourself
            },
            include: [
                {
                    model: db_1.models.user,
                    as: "user",
                    attributes: ["id", "firstName", "lastName", "email"],
                },
                {
                    model: db_1.models.p2pPaymentMethod,
                    as: "paymentMethods",
                    through: { attributes: [] },
                }
            ],
            lock: true,
            transaction,
        });
        if (!offer) {
            throw (0, error_1.createError)({
                statusCode: 404,
                message: "Offer not found or unavailable"
            });
        }
        ctx === null || ctx === void 0 ? void 0 : ctx.step("Validating trade amount against offer limits");
        // 2. Validate amount against offer limits
        // amountConfig stores limits in the pricing currency (USD/EUR)
        // We need to convert these to the offer currency (BTC/ETH) if trading crypto
        // Parse JSON with robust parser that handles all cases
        const amountConfig = (0, json_parser_1.parseAmountConfig)(offer.amountConfig);
        const priceConfig = (0, json_parser_1.parsePriceConfig)(offer.priceConfig);
        const { min, max, total } = amountConfig;
        const price = priceConfig.finalPrice;
        // Validate that price exists for crypto trades
        if (price <= 0) {
            throw (0, error_1.createError)({
                statusCode: 500,
                message: `Invalid offer configuration: price must be greater than 0`
            });
        }
        // Determine if offer currency is fiat by checking if it exists in the currency table
        const fiatCurrency = await db_1.models.currency.findOne({
            where: { id: offer.currency, status: true },
            transaction
        });
        const isOfferFiatCurrency = !!fiatCurrency;
        let minAmount, maxAmount;
        if (isOfferFiatCurrency) {
            // Trading fiat: limits are already in the correct currency
            minAmount = min || 0;
            maxAmount = max || total || 0;
        }
        else {
            // Trading crypto: convert price currency limits to crypto amounts
            // amount (BTC) = limit (USD) / price (USD per BTC)
            minAmount = (min || 0) / price;
            maxAmount = (max || total || 0) / price;
        }
        if (amount < minAmount || amount > maxAmount) {
            throw (0, error_1.createError)({
                statusCode: 400,
                message: `Amount must be between ${minAmount} and ${maxAmount} ${offer.currency}`
            });
        }
        // 2b. Validate minimum trade amount to prevent dust trades (especially for BTC UTXO issues)
        const { validateMinimumTradeAmount } = await Promise.resolve().then(() => __importStar(require("../../utils/fees")));
        const minimumValidation = await validateMinimumTradeAmount(amount, offer.currency);
        if (!minimumValidation.valid) {
            throw (0, error_1.createError)({
                statusCode: 400,
                message: minimumValidation.message || `Amount below minimum for ${offer.currency}`,
            });
        }
        // 2c. Validate against platform global min/max trade amounts
        const { CacheManager } = await Promise.resolve().then(() => __importStar(require("@b/utils/cache")));
        const cacheManager = CacheManager.getInstance();
        const platformMinTradeAmount = await cacheManager.getSetting("p2pMinimumTradeAmount");
        const platformMaxTradeAmount = await cacheManager.getSetting("p2pMaximumTradeAmount");
        // Calculate the trade value in price currency (USD/EUR) for comparison
        const tradeValueInPriceCurrency = isOfferFiatCurrency ? amount : amount * price;
        if (platformMinTradeAmount && tradeValueInPriceCurrency < platformMinTradeAmount) {
            throw (0, error_1.createError)({
                statusCode: 400,
                message: `Trade amount (${tradeValueInPriceCurrency.toFixed(2)} ${priceConfig.currency || 'USD'}) is below platform minimum of ${platformMinTradeAmount}`,
            });
        }
        if (platformMaxTradeAmount && tradeValueInPriceCurrency > platformMaxTradeAmount) {
            throw (0, error_1.createError)({
                statusCode: 400,
                message: `Trade amount (${tradeValueInPriceCurrency.toFixed(2)} ${priceConfig.currency || 'USD'}) exceeds platform maximum of ${platformMaxTradeAmount}`,
            });
        }
        // 3. Verify payment method is allowed for this offer
        const allowedPaymentMethodIds = offer.paymentMethods.map((pm) => pm.id);
        if (!allowedPaymentMethodIds.includes(paymentMethodId)) {
            throw (0, error_1.createError)({
                statusCode: 400,
                message: "Selected payment method not allowed for this offer"
            });
        }
        // 4. Verify payment method exists and is available
        // Note: The payment method belongs to the offer creator, not the buyer
        // The buyer selects from the seller's payment methods
        const selectedPaymentMethod = await db_1.models.p2pPaymentMethod.findOne({
            where: {
                id: paymentMethodId,
                available: true
            },
            transaction,
        });
        if (!selectedPaymentMethod) {
            throw (0, error_1.createError)({
                statusCode: 400,
                message: "Invalid or unavailable payment method"
            });
        }
        // 5. Determine buyer and seller based on offer type
        const isBuyOffer = offer.type === "BUY";
        const buyerId = isBuyOffer ? offer.userId : user.id;
        const sellerId = isBuyOffer ? user.id : offer.userId;
        ctx === null || ctx === void 0 ? void 0 : ctx.step("Verifying seller balance and locking funds");
        // 6. Handle seller's balance verification and locking
        // - For SELL offers: Balance was already locked when offer was created, no additional locking needed
        // - For BUY offers: Responder is the seller, need to check balance and lock their funds NOW
        let sellerWallet = await (0, utils_1.getWalletSafe)(sellerId, offer.walletType, offer.currency, false, ctx);
        // For BUY offers, the responder is the seller and needs a wallet with funds
        if (isBuyOffer) {
            ctx === null || ctx === void 0 ? void 0 : ctx.step(`Locking ${amount} ${offer.currency} for seller (BUY offer)`);
            // Create seller wallet if it doesn't exist
            if (!sellerWallet) {
                if (offer.walletType === "ECO") {
                    // For ECO wallets, use the ecosystem wallet creation function
                    const ecosystemUtils = await (0, safe_imports_1.getEcosystemWalletUtils)();
                    if (!(0, safe_imports_1.isServiceAvailable)(ecosystemUtils)) {
                        throw (0, error_1.createError)({
                            statusCode: 503,
                            message: "Ecosystem wallet service is not available"
                        });
                    }
                    const { getWalletByUserIdAndCurrency } = ecosystemUtils;
                    const seller = await db_1.models.user.findByPk(sellerId, { transaction });
                    sellerWallet = await getWalletByUserIdAndCurrency(seller, offer.currency);
                }
                else {
                    // For SPOT, FIAT, and other wallet types, use wallet creation service
                    const walletResult = await wallet_1.walletCreationService.getOrCreateWallet(sellerId, offer.walletType, offer.currency, transaction);
                    sellerWallet = walletResult.wallet;
                }
            }
            if (!sellerWallet) {
                throw (0, error_1.createError)({
                    statusCode: 500,
                    message: "Failed to create or retrieve seller wallet"
                });
            }
            // For BUY offers: Check available balance and lock funds
            // The responder (seller) needs to have funds to sell
            const availableBalance = sellerWallet.balance - sellerWallet.inOrder;
            if (availableBalance < amount) {
                throw (0, error_1.createError)({
                    statusCode: 409,
                    message: `Insufficient balance. Available: ${availableBalance} ${offer.currency}, Required: ${amount} ${offer.currency}. Please deposit more funds to your ${offer.walletType} wallet.`
                });
            }
            // Lock the seller's funds for BUY offers using wallet service
            // Use stable idempotency key for proper retry detection
            const idempotencyKey = `p2p_trade_lock_${offer.id}_${user.id}`;
            await wallet_1.walletService.hold({
                idempotencyKey,
                userId: sellerId,
                walletId: sellerWallet.id,
                walletType: offer.walletType,
                currency: offer.currency,
                amount,
                operationType: "P2P_TRADE_LOCK",
                description: `Lock ${amount} ${offer.currency} for P2P BUY offer trade`,
                metadata: {
                    offerId: offer.id,
                    offerType: offer.type,
                    initiatedBy: user.id,
                },
                transaction,
            });
        }
        else {
            // For SELL offers: Funds were already locked at offer creation
            // Just verify the seller's wallet exists and has sufficient locked funds
            if (!sellerWallet) {
                throw (0, error_1.createError)({
                    statusCode: 500,
                    message: "Seller wallet not found. The offer may be invalid."
                });
            }
            // Verify the seller still has enough locked funds (inOrder) for this trade
            // The funds should have been locked when the offer was created
            if (sellerWallet.inOrder < amount) {
                throw (0, error_1.createError)({
                    statusCode: 409,
                    message: `This offer is currently unavailable. The seller does not have sufficient ${offer.currency} balance to complete this trade.`
                });
            }
        }
        // Audit log for trade initiation (non-blocking)
        (0, audit_1.createP2PAuditLog)({
            userId: sellerId,
            eventType: audit_1.P2PAuditEventType.TRADE_INITIATED,
            entityType: "TRADE",
            entityId: offer.id,
            metadata: {
                offerId: offer.id,
                amount,
                currency: offer.currency,
                walletType: offer.walletType,
                walletInOrder: sellerWallet.inOrder,
                note: offer.walletType === "FIAT"
                    ? "FIAT trade - balance locked on platform, payment happens peer-to-peer"
                    : "Trade initiated - funds locked in escrow at trade initiation",
                initiatedBy: user.id,
            },
            riskLevel: audit_1.P2PRiskLevel.HIGH,
        }).catch(err => console_1.logger.error("P2P_TRADE", "Failed to create audit log", err));
        ctx === null || ctx === void 0 ? void 0 : ctx.step("Calculating trade fees");
        // 7. Calculate fees
        const { calculateTradeFees, calculateEscrowFee } = await Promise.resolve().then(() => __importStar(require("../../utils/fees")));
        // Maker = offer owner, Taker = trade initiator
        const fees = await calculateTradeFees(amount, offer.currency, offer.userId, // maker (offer owner)
        user.id, // taker (trade initiator)
        buyerId, sellerId);
        const escrowFee = await calculateEscrowFee(amount, offer.currency);
        ctx === null || ctx === void 0 ? void 0 : ctx.step("Creating trade record");
        // 8. Create the trade with fees stored
        // Copy seller's payment method details to trade for display during payment
        // Parse metadata properly - it may come as string from database
        let parsedMetadata = {};
        if (selectedPaymentMethod.metadata) {
            if (typeof selectedPaymentMethod.metadata === "string") {
                try {
                    parsedMetadata = JSON.parse(selectedPaymentMethod.metadata);
                }
                catch (_c) {
                    parsedMetadata = {};
                }
            }
            else if (typeof selectedPaymentMethod.metadata === "object") {
                parsedMetadata = selectedPaymentMethod.metadata;
            }
        }
        const paymentDetails = {
            name: selectedPaymentMethod.name,
            icon: selectedPaymentMethod.icon,
            instructions: selectedPaymentMethod.instructions || null,
            processingTime: selectedPaymentMethod.processingTime || null,
            // Copy the flexible metadata (contains actual payment details like account numbers, emails, etc.)
            ...parsedMetadata,
        };
        const trade = await db_1.models.p2pTrade.create({
            offerId: offer.id,
            buyerId,
            sellerId,
            type: offer.type, // BUY or SELL from the offer
            amount,
            price: priceConfig.finalPrice,
            total: amount * priceConfig.finalPrice,
            currency: offer.currency,
            paymentMethod: paymentMethodId,
            paymentDetails, // Store seller's payment details at time of trade initiation
            status: "PENDING",
            escrowFee: escrowFee.toString(),
            buyerFee: fees.buyerFee,
            sellerFee: fees.sellerFee,
            timeline: [
                {
                    event: "TRADE_INITIATED",
                    message: "Trade initiated",
                    userId: user.id,
                    createdAt: new Date().toISOString(),
                },
                ...(message ? [{
                        event: "MESSAGE",
                        message,
                        userId: user.id,
                        createdAt: new Date().toISOString(),
                    }] : [])
            ],
        }, { transaction });
        // 9. Update offer available amount with validation
        const newTotal = amountConfig.total - amount;
        // CRITICAL: Validate that new total doesn't go negative
        if (newTotal < 0) {
            throw (0, error_1.createError)({
                statusCode: 409,
                message: `Insufficient offer amount. Available: ${amountConfig.total} ${offer.currency}, Requested: ${amount} ${offer.currency}`
            });
        }
        // Track original total if not already set (for future restoration limits)
        const originalTotal = (_a = amountConfig.originalTotal) !== null && _a !== void 0 ? _a : amountConfig.total + amount;
        await offer.update({
            amountConfig: {
                ...amountConfig,
                total: newTotal,
                originalTotal, // Track original amount for restoration limits
            }
        }, { transaction });
        // 10. Keep offer visible even when fully consumed (total = 0)
        // Only mark as COMPLETED when user explicitly closes it or disables it
        // This way offers remain visible showing they're temporarily unavailable
        // and become available again if trades are cancelled
        ctx === null || ctx === void 0 ? void 0 : ctx.step("Updating offer available amount");
        // Commit transaction first to release locks
        await transaction.commit();
        ctx === null || ctx === void 0 ? void 0 : ctx.success(`Initiated ${offer.type} trade: ${amount} ${offer.currency} @ ${priceConfig.finalPrice}`);
        // 11. Log comprehensive audit trail (non-blocking, after commit)
        (0, audit_1.createP2PAuditLog)({
            userId: user.id,
            eventType: audit_1.P2PAuditEventType.TRADE_INITIATED,
            entityType: "TRADE",
            entityId: trade.id,
            metadata: {
                offerId: offer.id,
                amount,
                currency: offer.currency,
                price: priceConfig.finalPrice,
                paymentMethodId,
                buyerId,
                sellerId,
                buyerFee: fees.buyerFee,
                sellerFee: fees.sellerFee,
                escrowFee,
                totalValue: amount * priceConfig.finalPrice,
                offerType: offer.type,
                walletType: offer.walletType,
            },
            riskLevel: amount > 1000 ? audit_1.P2PRiskLevel.HIGH : audit_1.P2PRiskLevel.MEDIUM,
        }).catch(err => console_1.logger.error("P2P_TRADE", "Failed to create audit log", err));
        // 12. Increment offer view count (non-blocking)
        // Views are counted when trade is initiated, not on page load
        // This ensures only serious interest is counted and prevents owner inflation
        db_1.models.p2pOffer.increment("views", { where: { id } }).catch((err) => {
            console_1.logger.error("P2P_OFFER", "Failed to increment views", err);
        });
        // 13. Send notifications (non-blocking)
        (0, notifications_1.notifyTradeEvent)(trade.id, "TRADE_INITIATED", {
            buyerId,
            sellerId,
            amount,
            currency: offer.currency,
            initiatorId: user.id, // Pass who initiated the trade
        }).catch(console.error);
        // Return trade details
        return {
            message: "Trade initiated successfully",
            trade: {
                id: trade.id,
                amount: trade.amount,
                total: trade.total,
                status: trade.status,
                buyer: isBuyOffer ? offer.user : { id: user.id },
                seller: isBuyOffer ? { id: user.id } : offer.user,
                fees: {
                    buyerFee: fees.buyerFee,
                    sellerFee: fees.sellerFee,
                    escrowFee,
                    totalFee: fees.totalFee,
                },
                netAmounts: {
                    buyer: fees.netAmountBuyer,
                    seller: fees.netAmountSeller,
                }
            }
        };
    }
    catch (error) {
        // Only rollback if transaction exists and hasn't been committed/rolled back
        if (transaction) {
            try {
                if (!transaction.finished) {
                    await transaction.rollback();
                }
            }
            catch (rollbackError) {
                // Ignore rollback errors if transaction is already finished
                if (!((_b = rollbackError.message) === null || _b === void 0 ? void 0 : _b.includes("already been finished"))) {
                    console_1.logger.error("P2P_TRADE", "Transaction rollback failed", rollbackError);
                }
            }
        }
        // If it's already a createError, rethrow it
        if (error.statusCode) {
            throw error;
        }
        // Otherwise, wrap it in a generic error
        throw (0, error_1.createError)({
            statusCode: 500,
            message: `Failed to initiate trade: ${error.message}`,
        });
    }
}
