"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.sendWarningEmail = exports.liquidatePosition = exports.checkForLiquidation = void 0;
exports.sendLiquidationWarningEmail = sendLiquidationWarningEmail;
exports.sendPartialLiquidationNotificationEmail = sendPartialLiquidationNotificationEmail;
exports.sendLiquidationNotificationEmail = sendLiquidationNotificationEmail;
// Safe import for ecosystem modules
let fromBigInt;
let toBigIntFloat;
let client;
let scyllaFuturesKeyspace;
let getWalletByUserIdAndCurrency;
let updateWalletBalance;
try {
    const blockchainModule = require("@b/api/(ext)/ecosystem/utils/blockchain");
    fromBigInt = blockchainModule.fromBigInt;
    toBigIntFloat = blockchainModule.toBigIntFloat;
    const clientModule = require("@b/api/(ext)/ecosystem/utils/scylla/client");
    client = clientModule.default;
    scyllaFuturesKeyspace = clientModule.scyllaFuturesKeyspace;
    const walletModule = require("@b/api/(ext)/ecosystem/utils/wallet");
    getWalletByUserIdAndCurrency = walletModule.getWalletByUserIdAndCurrency;
    updateWalletBalance = walletModule.updateWalletBalance;
}
catch (e) {
    // Ecosystem extension not available
}
const emails_1 = require("../../../../utils/emails");
const db_1 = require("@b/db");
const ws_1 = require("./ws");
const error_1 = require("@b/utils/error");
const calculateMargin = (position, matchedPrice) => {
    if (!toBigIntFloat) {
        throw (0, error_1.createError)({ statusCode: 500, message: "Ecosystem extension not available" });
    }
    const currentPriceBigInt = toBigIntFloat(matchedPrice); // Scale up by 18
    const entryPriceBigInt = position.entryPrice;
    const leverageBigInt = BigInt(position.leverage);
    // Ensure entryPriceBigInt is not zero to avoid division by zero
    if (entryPriceBigInt === BigInt(0)) {
        throw (0, error_1.createError)({ statusCode: 400, message: "Entry price cannot be zero" });
    }
    // Calculate price difference based on the side of the position
    const priceDifferenceBigInt = position.side === "BUY"
        ? currentPriceBigInt - entryPriceBigInt
        : entryPriceBigInt - currentPriceBigInt;
    const entryPriceWithLeverageBigInt = entryPriceBigInt / leverageBigInt;
    const marginBigInt = (priceDifferenceBigInt * BigInt(1000000000000000000)) /
        entryPriceWithLeverageBigInt;
    // Convert margin back to number for the result
    const margin = Number(marginBigInt) / 1000000000000000000;
    return margin;
};
const checkForLiquidation = async (position, matchedPrice) => {
    if (!toBigIntFloat) {
        console.warn("Ecosystem extension not available for liquidation checks");
        return;
    }
    const margin = calculateMargin(position, matchedPrice);
    const partialLiquidationThreshold = -0.8; // 80% loss for partial liquidation
    const fullLiquidationThreshold = -1.0; // 100% loss for full liquidation
    if (margin <= partialLiquidationThreshold &&
        margin > fullLiquidationThreshold) {
        await (0, exports.liquidatePosition)(position, matchedPrice, true); // Partial liquidation
    }
    else if (margin <= fullLiquidationThreshold) {
        await (0, exports.liquidatePosition)(position, matchedPrice); // Full liquidation
    }
};
exports.checkForLiquidation = checkForLiquidation;
const liquidatePosition = async (position, matchedPrice, partial = false) => {
    if (!client || !scyllaFuturesKeyspace || !fromBigInt || !getWalletByUserIdAndCurrency || !updateWalletBalance) {
        throw (0, error_1.createError)({ statusCode: 500, message: "Ecosystem extension not available" });
    }
    // Calculate the amount to liquidate
    const amountToLiquidate = partial
        ? (position.amount * BigInt(80)) / BigInt(100) // Liquidate 80% of the position in partial liquidation
        : position.amount;
    // Update the position in the database
    await client.execute(`UPDATE ${scyllaFuturesKeyspace}.position SET amount = ?, status = ? WHERE "userId" = ? AND id = ?`, [
        partial ? amountToLiquidate.toString() : "0",
        partial ? "PARTIALLY_LIQUIDATED" : "LIQUIDATED",
        position.userId,
        position.id,
    ], { prepare: true });
    // Update the user's wallet balance
    const wallet = await getWalletByUserIdAndCurrency(position.userId, position.symbol.split("/")[1]);
    if (wallet) {
        const amountToRefund = fromBigInt(amountToLiquidate) * fromBigInt(position.entryPrice);
        await updateWalletBalance(wallet, amountToRefund, "add");
    }
    // Broadcast position update
    await (0, ws_1.handlePositionBroadcast)(position);
    // Send liquidation email
    const user = await db_1.models.user.findOne({ where: { id: position.userId } });
    if (user && user.email) {
        if (partial) {
            await sendPartialLiquidationNotificationEmail(user, position, matchedPrice);
        }
        else {
            await sendLiquidationNotificationEmail(user, position, matchedPrice);
        }
    }
};
exports.liquidatePosition = liquidatePosition;
const sendWarningEmail = async (userId, position, margin, matchedPrice) => {
    const user = await db_1.models.user.findOne({ where: { id: userId } });
    if (user && user.email) {
        await sendLiquidationWarningEmail(user, position, margin, matchedPrice);
    }
};
exports.sendWarningEmail = sendWarningEmail;
async function sendLiquidationWarningEmail(user, position, margin, matchedPrice) {
    const emailType = "LiquidationWarning";
    const emailData = {
        TO: user.email,
        FIRSTNAME: user.firstName,
        SYMBOL: position.symbol,
        MARGIN: margin.toFixed(2),
        LEVERAGE: position.leverage,
        ENTRY_PRICE: fromBigInt ? fromBigInt(position.entryPrice) : position.entryPrice,
        CURRENT_PRICE: matchedPrice,
    };
    await emails_1.emailQueue.add({ emailData, emailType });
}
async function sendPartialLiquidationNotificationEmail(user, position, matchedPrice) {
    const emailType = "PartialLiquidationNotification";
    const emailData = {
        TO: user.email,
        FIRSTNAME: user.firstName,
        SYMBOL: position.symbol,
        LEVERAGE: position.leverage,
        ENTRY_PRICE: fromBigInt ? fromBigInt(position.entryPrice) : position.entryPrice,
        CURRENT_PRICE: matchedPrice,
    };
    await emails_1.emailQueue.add({ emailData, emailType });
}
async function sendLiquidationNotificationEmail(user, position, matchedPrice) {
    const emailType = "LiquidationNotification";
    const emailData = {
        TO: user.email,
        FIRSTNAME: user.firstName,
        SYMBOL: position.symbol,
        LEVERAGE: position.leverage,
        ENTRY_PRICE: fromBigInt ? fromBigInt(position.entryPrice) : position.entryPrice,
        CURRENT_PRICE: matchedPrice,
    };
    await emails_1.emailQueue.add({ emailData, emailType });
}
