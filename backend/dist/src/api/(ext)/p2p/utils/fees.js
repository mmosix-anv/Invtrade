"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getMinimumTradeAmounts = getMinimumTradeAmounts;
exports.validateMinimumTradeAmount = validateMinimumTradeAmount;
exports.getP2PFeeConfiguration = getP2PFeeConfiguration;
exports.calculateTradeFees = calculateTradeFees;
exports.calculateEscrowFee = calculateEscrowFee;
exports.getUserFeeDiscount = getUserFeeDiscount;
exports.applyFeeDiscount = applyFeeDiscount;
exports.createFeeTransactions = createFeeTransactions;
exports.calculateFeePreview = calculateFeePreview;
const db_1 = require("@b/db");
const sequelize_1 = require("sequelize");
const console_1 = require("@b/utils/console");
/**
 * Get minimum trade amounts per currency to prevent dust trades
 * This helps avoid issues like BTC UTXO consolidation problems
 */
async function getMinimumTradeAmounts(ctx) {
    var _a, _b, _c, _d, _e;
    try {
        (_a = ctx === null || ctx === void 0 ? void 0 : ctx.step) === null || _a === void 0 ? void 0 : _a.call(ctx, "Loading minimum trade amounts");
        // Try to get from extension settings first (admin-configurable)
        const extensionSettings = await db_1.models.settings.findOne({
            where: { key: "p2p" },
        });
        if (extensionSettings === null || extensionSettings === void 0 ? void 0 : extensionSettings.value) {
            const p2pSettings = JSON.parse(extensionSettings.value);
            if (p2pSettings.MinimumTradeAmounts) {
                (_b = ctx === null || ctx === void 0 ? void 0 : ctx.success) === null || _b === void 0 ? void 0 : _b.call(ctx, "Loaded minimum trade amounts from extension settings");
                return p2pSettings.MinimumTradeAmounts;
            }
        }
        // Fallback: try old settings key
        const legacySettings = await db_1.models.settings.findOne({
            where: { key: "p2pMinimumTradeAmounts" },
        });
        if (legacySettings === null || legacySettings === void 0 ? void 0 : legacySettings.value) {
            (_c = ctx === null || ctx === void 0 ? void 0 : ctx.success) === null || _c === void 0 ? void 0 : _c.call(ctx, "Loaded minimum trade amounts from legacy settings");
            return JSON.parse(legacySettings.value);
        }
    }
    catch (error) {
        (_d = ctx === null || ctx === void 0 ? void 0 : ctx.fail) === null || _d === void 0 ? void 0 : _d.call(ctx, error.message || "Failed to load minimum trade amounts");
        console_1.logger.error("P2P_FEES", "Failed to load P2P minimum trade amounts", error);
    }
    // Default minimum trade amounts to prevent dust
    // User requested 0.00005 BTC as minimum, which is very conservative
    (_e = ctx === null || ctx === void 0 ? void 0 : ctx.step) === null || _e === void 0 ? void 0 : _e.call(ctx, "Using default minimum trade amounts");
    return {
        BTC: 0.00005, // 0.00005 BTC minimum (prevents UTXO dust)
        ETH: 0.001, // 0.001 ETH minimum
        LTC: 0.01, // 0.01 LTC minimum
        BCH: 0.001, // 0.001 BCH minimum
        DOGE: 10, // 10 DOGE minimum
        XRP: 5, // 5 XRP minimum
        ADA: 5, // 5 ADA minimum
        SOL: 0.01, // 0.01 SOL minimum
        MATIC: 1, // 1 MATIC minimum
        // Add more as needed
    };
}
/**
 * Validate if trade amount meets minimum requirements
 */
async function validateMinimumTradeAmount(amount, currency, ctx) {
    var _a, _b, _c, _d;
    try {
        (_a = ctx === null || ctx === void 0 ? void 0 : ctx.step) === null || _a === void 0 ? void 0 : _a.call(ctx, `Validating minimum trade amount for ${amount} ${currency}`);
        const minimums = await getMinimumTradeAmounts(ctx);
        const minimum = minimums[currency.toUpperCase()];
        if (minimum && amount < minimum) {
            (_b = ctx === null || ctx === void 0 ? void 0 : ctx.fail) === null || _b === void 0 ? void 0 : _b.call(ctx, `Amount ${amount} ${currency} is below minimum ${minimum}`);
            return {
                valid: false,
                minimum,
                message: `Minimum trade amount for ${currency} is ${minimum}`,
            };
        }
        (_c = ctx === null || ctx === void 0 ? void 0 : ctx.success) === null || _c === void 0 ? void 0 : _c.call(ctx, `Trade amount validation passed for ${amount} ${currency}`);
        return { valid: true };
    }
    catch (error) {
        (_d = ctx === null || ctx === void 0 ? void 0 : ctx.fail) === null || _d === void 0 ? void 0 : _d.call(ctx, error.message || "Failed to validate minimum trade amount");
        throw error;
    }
}
/**
 * Get P2P fee configuration
 * This could be stored in settings or database
 */
async function getP2PFeeConfiguration(ctx) {
    var _a, _b, _c, _d;
    try {
        (_a = ctx === null || ctx === void 0 ? void 0 : ctx.step) === null || _a === void 0 ? void 0 : _a.call(ctx, "Loading P2P fee configuration");
        // Try to get from settings
        const settings = await db_1.models.settings.findOne({
            where: { key: "p2pFeeConfiguration" },
        });
        if (settings === null || settings === void 0 ? void 0 : settings.value) {
            (_b = ctx === null || ctx === void 0 ? void 0 : ctx.success) === null || _b === void 0 ? void 0 : _b.call(ctx, "Loaded fee configuration from settings");
            return JSON.parse(settings.value);
        }
    }
    catch (error) {
        (_c = ctx === null || ctx === void 0 ? void 0 : ctx.fail) === null || _c === void 0 ? void 0 : _c.call(ctx, error.message || "Failed to load fee configuration");
        console_1.logger.error("P2P_FEES", "Failed to load P2P fee configuration", error);
    }
    // Default configuration
    (_d = ctx === null || ctx === void 0 ? void 0 : ctx.step) === null || _d === void 0 ? void 0 : _d.call(ctx, "Using default fee configuration");
    return {
        maker: 0.1, // 0.1% for maker (offer creator)
        taker: 0.2, // 0.2% for taker (offer acceptor)
        minimum: 0.01, // Minimum fee
        maximum: 100, // Maximum fee
    };
}
/**
 * Calculate trade fees for a P2P trade
 * @param amount - Trade amount
 * @param currency - Currency code
 * @param offerOwnerId - The user ID of the offer creator (maker)
 * @param tradeInitiatorId - The user ID of the person who initiated/accepted the trade (taker)
 * @param buyerId - The user ID of the buyer in this trade
 * @param sellerId - The user ID of the seller in this trade
 * @param customConfig - Optional custom fee configuration
 * @param ctx - Optional LogContext for operation logging
 */
async function calculateTradeFees(amount, currency, offerOwnerId, tradeInitiatorId, buyerId, sellerId, customConfig, ctx) {
    var _a, _b, _c, _d;
    try {
        (_a = ctx === null || ctx === void 0 ? void 0 : ctx.step) === null || _a === void 0 ? void 0 : _a.call(ctx, `Calculating trade fees for ${amount} ${currency}`);
        const config = customConfig || await getP2PFeeConfiguration(ctx);
        (_b = ctx === null || ctx === void 0 ? void 0 : ctx.step) === null || _b === void 0 ? void 0 : _b.call(ctx, ` Using fee config: maker=${config.maker}%, taker=${config.taker}%`);
        // Calculate raw fees
        const makerFeeAmount = amount * (config.maker / 100);
        const takerFeeAmount = amount * (config.taker / 100);
        // Apply minimum and maximum limits
        const appliedMakerFee = Math.min(Math.max(makerFeeAmount, config.minimum), config.maximum);
        const appliedTakerFee = Math.min(Math.max(takerFeeAmount, config.minimum), config.maximum);
        // Determine who gets which fee
        // Maker = offer owner, Taker = trade initiator
        const buyerIsMaker = buyerId === offerOwnerId;
        const sellerIsMaker = sellerId === offerOwnerId;
        // Assign fees correctly
        // The offer owner (maker) pays maker fee, trade initiator (taker) pays taker fee
        const buyerFee = buyerIsMaker ? appliedMakerFee : appliedTakerFee;
        const sellerFee = sellerIsMaker ? appliedMakerFee : appliedTakerFee;
        // Calculate net amounts
        const netAmountBuyer = amount - buyerFee;
        const netAmountSeller = amount - sellerFee;
        const fees = {
            buyerFee: parseFloat(buyerFee.toFixed(8)),
            sellerFee: parseFloat(sellerFee.toFixed(8)),
            totalFee: parseFloat((buyerFee + sellerFee).toFixed(8)),
            netAmountBuyer: parseFloat(netAmountBuyer.toFixed(8)),
            netAmountSeller: parseFloat(netAmountSeller.toFixed(8)),
        };
        (_c = ctx === null || ctx === void 0 ? void 0 : ctx.success) === null || _c === void 0 ? void 0 : _c.call(ctx, `Calculated fees: buyer=${fees.buyerFee}, seller=${fees.sellerFee}, total=${fees.totalFee}`);
        return fees;
    }
    catch (error) {
        (_d = ctx === null || ctx === void 0 ? void 0 : ctx.fail) === null || _d === void 0 ? void 0 : _d.call(ctx, error.message || "Failed to calculate trade fees");
        throw error;
    }
}
/**
 * Calculate escrow fee for a P2P trade
 * This is separate from trading fees and covers the escrow service
 */
async function calculateEscrowFee(amount, currency, ctx) {
    var _a, _b, _c, _d, _e;
    try {
        (_a = ctx === null || ctx === void 0 ? void 0 : ctx.step) === null || _a === void 0 ? void 0 : _a.call(ctx, `Calculating escrow fee for ${amount} ${currency}`);
        let escrowFeeRate = 0.2; // Default 0.2%
        // First try to get from extension settings (p2p key)
        const extensionSettings = await db_1.models.settings.findOne({
            where: { key: "p2p" },
        });
        if (extensionSettings === null || extensionSettings === void 0 ? void 0 : extensionSettings.value) {
            try {
                const p2pSettings = JSON.parse(extensionSettings.value);
                // Check for EscrowFeeRate in extension settings
                if (p2pSettings.EscrowFeeRate !== undefined) {
                    escrowFeeRate = parseFloat(p2pSettings.EscrowFeeRate);
                }
                else if (p2pSettings.escrowFeeRate !== undefined) {
                    escrowFeeRate = parseFloat(p2pSettings.escrowFeeRate);
                }
            }
            catch (parseError) {
                (_b = ctx === null || ctx === void 0 ? void 0 : ctx.fail) === null || _b === void 0 ? void 0 : _b.call(ctx, "Failed to parse P2P extension settings");
                console_1.logger.error("P2P_FEES", "Failed to parse P2P extension settings", parseError);
            }
        }
        // Fallback: try legacy settings key
        if (escrowFeeRate === 0.2) {
            const legacySettings = await db_1.models.settings.findOne({
                where: { key: "p2pEscrowFeeRate" },
            });
            if (legacySettings === null || legacySettings === void 0 ? void 0 : legacySettings.value) {
                escrowFeeRate = parseFloat(legacySettings.value);
            }
        }
        (_c = ctx === null || ctx === void 0 ? void 0 : ctx.step) === null || _c === void 0 ? void 0 : _c.call(ctx, `Using escrow fee rate: ${escrowFeeRate}%`);
        const escrowFee = amount * (escrowFeeRate / 100);
        // Apply minimum escrow fee
        const minEscrowFee = 0.0001;
        const finalFee = parseFloat(Math.max(escrowFee, minEscrowFee).toFixed(8));
        (_d = ctx === null || ctx === void 0 ? void 0 : ctx.success) === null || _d === void 0 ? void 0 : _d.call(ctx, `Calculated escrow fee: ${finalFee}`);
        return finalFee;
    }
    catch (error) {
        (_e = ctx === null || ctx === void 0 ? void 0 : ctx.fail) === null || _e === void 0 ? void 0 : _e.call(ctx, error.message || "Failed to calculate escrow fee");
        console_1.logger.error("P2P_FEES", "Failed to calculate escrow fee", error);
        return 0;
    }
}
/**
 * Get fee discount for user based on trading volume or tier
 */
async function getUserFeeDiscount(userId, ctx) {
    var _a, _b, _c, _d;
    try {
        (_a = ctx === null || ctx === void 0 ? void 0 : ctx.step) === null || _a === void 0 ? void 0 : _a.call(ctx, `Calculating fee discount for user ${userId}`);
        // Calculate user's 30-day trading volume
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
        const volumeResult = await db_1.models.p2pTrade.findOne({
            attributes: [
                [(0, sequelize_1.fn)("SUM", (0, sequelize_1.col)("totalAmount")), "volume"],
            ],
            where: {
                [sequelize_1.Op.or]: [
                    { buyerId: userId },
                    { sellerId: userId },
                ],
                status: "COMPLETED",
                completedAt: {
                    [sequelize_1.Op.gte]: thirtyDaysAgo,
                },
            },
            raw: true,
        });
        const volume = parseFloat((volumeResult === null || volumeResult === void 0 ? void 0 : volumeResult.volume) || "0");
        (_b = ctx === null || ctx === void 0 ? void 0 : ctx.step) === null || _b === void 0 ? void 0 : _b.call(ctx, `User 30-day trading volume: $${volume}`);
        // Define volume tiers and discounts
        const tiers = [
            { minVolume: 100000, discount: 50 }, // 50% discount for > $100k volume
            { minVolume: 50000, discount: 30 }, // 30% discount for > $50k volume
            { minVolume: 10000, discount: 20 }, // 20% discount for > $10k volume
            { minVolume: 5000, discount: 10 }, // 10% discount for > $5k volume
            { minVolume: 1000, discount: 5 }, // 5% discount for > $1k volume
        ];
        // Find applicable tier
        const applicableTier = tiers.find(tier => volume >= tier.minVolume);
        const discount = (applicableTier === null || applicableTier === void 0 ? void 0 : applicableTier.discount) || 0;
        (_c = ctx === null || ctx === void 0 ? void 0 : ctx.success) === null || _c === void 0 ? void 0 : _c.call(ctx, `User fee discount: ${discount}%`);
        return discount;
    }
    catch (error) {
        (_d = ctx === null || ctx === void 0 ? void 0 : ctx.fail) === null || _d === void 0 ? void 0 : _d.call(ctx, error.message || "Failed to calculate user fee discount");
        console_1.logger.error("P2P_FEES", "Failed to calculate user fee discount", error);
        return 0;
    }
}
/**
 * Apply fee discount to calculated fees
 */
async function applyFeeDiscount(fees, userId, ctx) {
    var _a, _b, _c, _d, _e;
    try {
        (_a = ctx === null || ctx === void 0 ? void 0 : ctx.step) === null || _a === void 0 ? void 0 : _a.call(ctx, `Applying fee discount for user ${userId}`);
        const discount = await getUserFeeDiscount(userId, ctx);
        if (discount === 0) {
            (_b = ctx === null || ctx === void 0 ? void 0 : ctx.step) === null || _b === void 0 ? void 0 : _b.call(ctx, "No discount applicable");
            return fees;
        }
        (_c = ctx === null || ctx === void 0 ? void 0 : ctx.step) === null || _c === void 0 ? void 0 : _c.call(ctx, `Applying ${discount}% discount`);
        const discountMultiplier = 1 - (discount / 100);
        const discountedFees = {
            buyerFee: parseFloat((fees.buyerFee * discountMultiplier).toFixed(8)),
            sellerFee: parseFloat((fees.sellerFee * discountMultiplier).toFixed(8)),
            totalFee: parseFloat((fees.totalFee * discountMultiplier).toFixed(8)),
            netAmountBuyer: parseFloat((fees.netAmountBuyer + fees.buyerFee * (discount / 100)).toFixed(8)),
            netAmountSeller: parseFloat((fees.netAmountSeller + fees.sellerFee * (discount / 100)).toFixed(8)),
        };
        (_d = ctx === null || ctx === void 0 ? void 0 : ctx.success) === null || _d === void 0 ? void 0 : _d.call(ctx, `Fee discount applied: ${discount}%`);
        return discountedFees;
    }
    catch (error) {
        (_e = ctx === null || ctx === void 0 ? void 0 : ctx.fail) === null || _e === void 0 ? void 0 : _e.call(ctx, error.message || "Failed to apply fee discount");
        console_1.logger.error("P2P_FEES", "Failed to apply fee discount", error);
        return fees;
    }
}
/**
 * Create fee transaction records
 */
async function createFeeTransactions(tradeId, buyerId, sellerId, fees, currency, transaction, ctx) {
    var _a, _b, _c, _d, _e;
    try {
        (_a = ctx === null || ctx === void 0 ? void 0 : ctx.step) === null || _a === void 0 ? void 0 : _a.call(ctx, `Creating fee transactions for trade ${tradeId}`);
        const feeTransactions = [];
        if (fees.buyerFee > 0) {
            feeTransactions.push({
                userId: buyerId,
                type: "P2P_FEE",
                status: "COMPLETED",
                amount: -fees.buyerFee,
                fee: 0,
                currency,
                description: `P2P trading fee for trade #${tradeId}`,
                referenceId: tradeId,
            });
        }
        if (fees.sellerFee > 0) {
            feeTransactions.push({
                userId: sellerId,
                type: "P2P_FEE",
                status: "COMPLETED",
                amount: -fees.sellerFee,
                fee: 0,
                currency,
                description: `P2P trading fee for trade #${tradeId}`,
                referenceId: tradeId,
            });
        }
        if (feeTransactions.length > 0) {
            (_b = ctx === null || ctx === void 0 ? void 0 : ctx.step) === null || _b === void 0 ? void 0 : _b.call(ctx, `Creating ${feeTransactions.length} fee transaction records`);
            await db_1.models.transaction.bulkCreate(feeTransactions, { transaction });
            (_c = ctx === null || ctx === void 0 ? void 0 : ctx.success) === null || _c === void 0 ? void 0 : _c.call(ctx, `Created ${feeTransactions.length} fee transactions`);
        }
        else {
            (_d = ctx === null || ctx === void 0 ? void 0 : ctx.step) === null || _d === void 0 ? void 0 : _d.call(ctx, "No fee transactions to create");
        }
    }
    catch (error) {
        (_e = ctx === null || ctx === void 0 ? void 0 : ctx.fail) === null || _e === void 0 ? void 0 : _e.call(ctx, error.message || "Failed to create fee transactions");
        throw error;
    }
}
/**
 * Calculate and display fee preview
 */
function calculateFeePreview(amount, feeRate, ismaker = false) {
    const fee = amount * (feeRate / 100);
    const netAmount = amount - fee;
    return {
        fee: parseFloat(fee.toFixed(8)),
        netAmount: parseFloat(netAmount.toFixed(8)),
        feePercentage: `${feeRate}%`,
    };
}
