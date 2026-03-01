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
exports.filterAndSortOrders = exports.matchAndCalculateOrders = void 0;
exports.processMatchedOrders = processMatchedOrders;
exports.addTradeToOrder = addTradeToOrder;
exports.validateOrder = validateOrder;
exports.sortOrders = sortOrders;
exports.getUserEcosystemWalletByCurrency = getUserEcosystemWalletByCurrency;
const db_1 = require("@b/db");
const blockchain_1 = require("./blockchain");
const queries_1 = require("./scylla/queries");
const wallet_1 = require("./wallet");
const ws_1 = require("./ws");
const console_1 = require("@b/utils/console");
const error_1 = require("@b/utils/error");
// ============================================
// AI Bot Position & PnL Tracking
// ============================================
/**
 * Record a real trade for a bot (when bot trades with a real user)
 * This updates the bot's position and calculates PnL
 *
 * @param botId - The AI bot's ID
 * @param marketId - The ecosystem market ID
 * @param symbol - Trading pair symbol (e.g., "BTC/USDT")
 * @param side - "BUY" or "SELL"
 * @param price - Trade price
 * @param amount - Trade amount
 * @param counterpartyUserId - The real user's ID
 */
async function recordBotRealTrade(botId, marketId, symbol, side, price, amount, counterpartyUserId) {
    try {
        // Get the bot from database
        const bot = await db_1.models.aiBot.findByPk(botId);
        if (!bot) {
            console_1.logger.warn("BOT_PNL", `Bot ${botId} not found, skipping trade recording`);
            return;
        }
        const botData = bot.get({ plain: true });
        const currentPosition = Number(botData.currentPosition || 0);
        const avgEntryPrice = Number(botData.avgEntryPrice || 0);
        let newPosition = currentPosition;
        let newAvgEntryPrice = avgEntryPrice;
        let realizedPnL = 0;
        let isProfitable = false;
        if (side === "BUY") {
            // Bot is BUYING - increasing position
            // If closing a short or adding to long
            if (currentPosition < 0) {
                // Closing short position - calculate PnL
                const closingAmount = Math.min(amount, Math.abs(currentPosition));
                // Short profit = (entry price - exit price) * amount
                realizedPnL = (avgEntryPrice - price) * closingAmount;
                isProfitable = realizedPnL > 0;
                // Remaining after closing short
                const remainingAmount = amount - closingAmount;
                if (remainingAmount > 0) {
                    // Opening new long position with remaining
                    newPosition = remainingAmount;
                    newAvgEntryPrice = price;
                }
                else {
                    // Just reduced short position
                    newPosition = currentPosition + amount;
                    // Keep avg entry price for remaining short
                }
            }
            else {
                // Adding to long position - calculate new average entry
                const totalCost = currentPosition * avgEntryPrice + amount * price;
                newPosition = currentPosition + amount;
                newAvgEntryPrice = newPosition > 0 ? totalCost / newPosition : 0;
            }
        }
        else {
            // Bot is SELLING - decreasing position
            // If closing a long or adding to short
            if (currentPosition > 0) {
                // Closing long position - calculate PnL
                const closingAmount = Math.min(amount, currentPosition);
                // Long profit = (exit price - entry price) * amount
                realizedPnL = (price - avgEntryPrice) * closingAmount;
                isProfitable = realizedPnL > 0;
                // Remaining after closing long
                const remainingAmount = amount - closingAmount;
                if (remainingAmount > 0) {
                    // Opening new short position with remaining
                    newPosition = -remainingAmount;
                    newAvgEntryPrice = price;
                }
                else {
                    // Just reduced long position
                    newPosition = currentPosition - amount;
                    // Keep avg entry price for remaining long
                }
            }
            else {
                // Adding to short position - calculate new average entry
                const totalCost = Math.abs(currentPosition) * avgEntryPrice + amount * price;
                newPosition = currentPosition - amount;
                newAvgEntryPrice = newPosition !== 0 ? totalCost / Math.abs(newPosition) : 0;
            }
        }
        // Update bot stats in database
        const updates = {
            currentPosition: newPosition,
            avgEntryPrice: newAvgEntryPrice,
            realTradesExecuted: (botData.realTradesExecuted || 0) + 1,
            totalVolume: (Number(botData.totalVolume) || 0) + amount,
            lastTradeAt: new Date(),
        };
        // If we realized any PnL, update those stats
        if (realizedPnL !== 0) {
            updates.totalRealizedPnL = (Number(botData.totalRealizedPnL) || 0) + realizedPnL;
            if (isProfitable) {
                updates.profitableTrades = (botData.profitableTrades || 0) + 1;
            }
        }
        await bot.update(updates);
        console_1.logger.info("BOT_PNL", `Bot ${botId} ${side} ${amount.toFixed(4)} @ ${price.toFixed(6)} | Position: ${currentPosition.toFixed(4)} -> ${newPosition.toFixed(4)} | PnL: ${realizedPnL.toFixed(4)} | Profitable: ${isProfitable}`);
    }
    catch (error) {
        // Don't fail the trade if bot tracking fails
        console_1.logger.error("BOT_PNL", `Failed to record trade for bot ${botId}`, error);
    }
}
// ============================================
// AI Market Maker Pool Integration
// ============================================
/**
 * Check if an order is from an AI bot (uses pool liquidity)
 */
function isBotOrder(order) {
    return !!order.marketMakerId;
}
/**
 * Get pool for a market maker
 */
async function getPoolForMarketMaker(marketMakerId) {
    const pool = await db_1.models.aiMarketMakerPool.findOne({
        where: { marketMakerId },
    });
    return pool;
}
/**
 * Update pool balance after a bot trade
 * @param marketMakerId - The market maker ID
 * @param baseDelta - Change in base currency (positive = add, negative = subtract)
 * @param quoteDelta - Change in quote currency (positive = add, negative = subtract)
 */
async function updatePoolBalance(marketMakerId, baseDelta, quoteDelta) {
    const pool = await getPoolForMarketMaker(marketMakerId);
    if (!pool) {
        throw (0, error_1.createError)({ statusCode: 404, message: `Pool not found for market maker ${marketMakerId}` });
    }
    const poolData = pool;
    const newBaseBalance = Number(poolData.baseCurrencyBalance) + baseDelta;
    const newQuoteBalance = Number(poolData.quoteCurrencyBalance) + quoteDelta;
    // Validate pool has sufficient balance
    if (newBaseBalance < 0) {
        throw (0, error_1.createError)({ statusCode: 400, message: `Insufficient pool base balance: need ${Math.abs(baseDelta)}, have ${poolData.baseCurrencyBalance}` });
    }
    if (newQuoteBalance < 0) {
        throw (0, error_1.createError)({ statusCode: 400, message: `Insufficient pool quote balance: need ${Math.abs(quoteDelta)}, have ${poolData.quoteCurrencyBalance}` });
    }
    await pool.update({
        baseCurrencyBalance: newBaseBalance,
        quoteCurrencyBalance: newQuoteBalance,
    });
}
const SCALING_FACTOR = BigInt(10 ** 18);
// Rate limit error logging for AI system user and system-like users
// Includes various formats that may appear in errors
const AI_SYSTEM_USER_IDS = [
    "a1000000-0000-4000-a000-000000000001", // new AI user format
    "00000000-0000-0000-0000-000000000001", // legacy AI user format
    "00000000-0000-0000-0000-000000000000", // fallback from invalid UUID conversion
];
let aiUserErrorCount = 0;
let lastAiUserErrorTime = 0;
const AI_ERROR_LOG_INTERVAL = 60000; // Only log once per minute
function isAiSystemUser(userId) {
    // Check direct match
    if (AI_SYSTEM_USER_IDS.includes(userId))
        return true;
    // Check for system-like patterns (all zeros or starts with system prefix)
    if (userId.startsWith("00000000-0000-0000") || userId.startsWith("a1000000-0000-4000"))
        return true;
    return false;
}
const matchAndCalculateOrders = async (orders, currentOrderBook) => {
    const matchedOrders = [];
    const bookUpdates = { bids: {}, asks: {} };
    const processedOrders = new Set();
    const buyOrders = (0, exports.filterAndSortOrders)(orders, "BUY", true);
    const sellOrders = (0, exports.filterAndSortOrders)(orders, "SELL", false);
    let buyIndex = 0, sellIndex = 0;
    while (buyIndex < buyOrders.length && sellIndex < sellOrders.length) {
        const buyOrder = buyOrders[buyIndex];
        const sellOrder = sellOrders[sellIndex];
        if (processedOrders.has(buyOrder.id) || processedOrders.has(sellOrder.id)) {
            if (processedOrders.has(buyOrder.id))
                buyIndex++;
            if (processedOrders.has(sellOrder.id))
                sellIndex++;
            continue;
        }
        let matchFound = false;
        if (buyOrder.type === "LIMIT" && sellOrder.type === "LIMIT") {
            matchFound =
                (buyOrder.side === "BUY" && buyOrder.price >= sellOrder.price) ||
                    (buyOrder.side === "SELL" && sellOrder.price >= buyOrder.price);
        }
        else if (buyOrder.type === "MARKET" || sellOrder.type === "MARKET") {
            matchFound = true;
        }
        if (matchFound) {
            processedOrders.add(buyOrder.id);
            processedOrders.add(sellOrder.id);
            try {
                await processMatchedOrders(buyOrder, sellOrder, currentOrderBook, bookUpdates);
                // Only add to matchedOrders if wallet updates succeeded
                matchedOrders.push(buyOrder, sellOrder);
            }
            catch (error) {
                // Rate limit error logging for AI system user wallet errors
                const errorStr = String(error);
                // Check if this is an AI/system user error - multiple ways to detect:
                // 1. Error message contains system user IDs
                // 2. Order belongs to system user
                // 3. Error is about wallet not found for zeros UUID (invalid/legacy orders)
                const errorContainsSystemId = AI_SYSTEM_USER_IDS.some(id => errorStr.includes(id));
                const orderFromSystemUser = isAiSystemUser(buyOrder.userId) || isAiSystemUser(sellOrder.userId);
                const isWalletNotFoundError = errorStr.includes("Wallet not found for user");
                const isInsufficientFundsError = errorStr.includes("insufficient locked funds");
                // Suppress wallet errors for system users or invalid legacy orders
                const shouldSuppressError = errorContainsSystemId || orderFromSystemUser ||
                    (isWalletNotFoundError && errorStr.includes("00000000"));
                if (shouldSuppressError) {
                    aiUserErrorCount++;
                    const now = Date.now();
                    if (now - lastAiUserErrorTime > AI_ERROR_LOG_INTERVAL) {
                        console_1.logger.warn("MATCHING", `System/AI user wallet errors: ${aiUserErrorCount} in the last minute. Suppressing to reduce log noise.`);
                        lastAiUserErrorTime = now;
                        aiUserErrorCount = 0;
                    }
                }
                else if (!isInsufficientFundsError) {
                    // Only log non-suppressed errors that aren't insufficient funds (those are logged at source)
                    console_1.logger.error("MATCHING", "Failed to process matched orders", error);
                }
                // For permanent errors like insufficient funds, DON'T retry - keep orders in processedOrders
                // This prevents infinite retry loops. The faulty orders will be cleaned up by the cleanup script.
                if (isInsufficientFundsError || isWalletNotFoundError) {
                    // Keep in processedOrders - don't retry this match
                    // Move to next orders
                    buyIndex++;
                    sellIndex++;
                }
                else {
                    // For transient errors, allow retry by removing from processed
                    processedOrders.delete(buyOrder.id);
                    processedOrders.delete(sellOrder.id);
                }
                // Skip this match and continue
                continue;
            }
            if (buyOrder.type === "LIMIT" && buyOrder.remaining === BigInt(0)) {
                buyIndex++;
            }
            if (sellOrder.type === "LIMIT" && sellOrder.remaining === BigInt(0)) {
                sellIndex++;
            }
            if (buyOrder.type === "MARKET" && buyOrder.remaining > BigInt(0)) {
                processedOrders.delete(buyOrder.id);
            }
            if (sellOrder.type === "MARKET" && sellOrder.remaining > BigInt(0)) {
                processedOrders.delete(sellOrder.id);
            }
        }
        else {
            if (buyOrder.type !== "MARKET" &&
                BigInt(buyOrder.price) < BigInt(sellOrder.price)) {
                buyIndex++;
            }
            if (sellOrder.type !== "MARKET" &&
                BigInt(sellOrder.price) > BigInt(buyOrder.price)) {
                sellIndex++;
            }
        }
    }
    return { matchedOrders, bookUpdates };
};
exports.matchAndCalculateOrders = matchAndCalculateOrders;
async function processMatchedOrders(buyOrder, sellOrder, currentOrderBook, bookUpdates) {
    var _a, _b, _c, _d;
    // Determine the amount to fill
    const amountToFill = buyOrder.remaining < sellOrder.remaining
        ? buyOrder.remaining
        : sellOrder.remaining;
    // Update the orders' filled and remaining fields
    [buyOrder, sellOrder].forEach((order) => {
        order.filled += amountToFill;
        order.remaining -= amountToFill;
        order.status = order.remaining === BigInt(0) ? "CLOSED" : "OPEN";
    });
    // Extract base and quote currency from symbol, e.g., "BTC/USDT" => base=BTC, quote=USDT
    const [baseCurrency, quoteCurrency] = buyOrder.symbol.split("/");
    // Check if orders are from bots (use pool liquidity)
    const buyerIsBot = isBotOrder(buyOrder);
    const sellerIsBot = isBotOrder(sellOrder);
    // Determine the final trade price
    const finalPrice = buyOrder.type.toUpperCase() === "MARKET"
        ? sellOrder.price
        : sellOrder.type.toUpperCase() === "MARKET"
            ? buyOrder.price
            : buyOrder.createdAt <= sellOrder.createdAt
                ? buyOrder.price
                : sellOrder.price;
    // Calculate cost: amountToFill * finalPrice (scaled by 10^18)
    const cost = (amountToFill * finalPrice) / SCALING_FACTOR;
    // Calculate fill ratios for proportional fee calculation
    const buyFillRatio = Number(amountToFill) / Number(buyOrder.amount);
    const sellFillRatio = Number(amountToFill) / Number(sellOrder.amount);
    // Calculate proportional fees and costs based on fill ratio
    // IMPORTANT: Always use proportional calculation to avoid over-releasing funds
    // For multi-fill orders, we need to release exactly what this fill requires, not the entire order cost
    const sellProportionalFee = (sellOrder.fee * BigInt(Math.floor(sellFillRatio * 1e18))) / SCALING_FACTOR;
    // For buyer cost, calculate based on actual fill: amountToFill * finalPrice + proportional fee
    // This ensures we only release the funds needed for THIS fill, not the entire order
    const buyProportionalFee = (buyOrder.fee * BigInt(Math.floor(buyFillRatio * 1e18))) / SCALING_FACTOR;
    const buyProportionalCostWithFee = cost + buyProportionalFee;
    // Convert to numbers
    const amountToFillNum = (0, blockchain_1.fromBigInt)((0, blockchain_1.removeTolerance)(amountToFill));
    const costNum = (0, blockchain_1.fromBigInt)((0, blockchain_1.removeTolerance)(cost));
    const sellFeeNum = (0, blockchain_1.fromBigInt)((0, blockchain_1.removeTolerance)(sellProportionalFee));
    const buyReleaseNum = (0, blockchain_1.fromBigInt)((0, blockchain_1.removeTolerance)(buyProportionalCostWithFee));
    // ============================================
    // Handle Bot vs Bot trades (both use same pool)
    // ============================================
    if (buyerIsBot && sellerIsBot) {
        // Both are bots from the same market maker - this is an internal AI trade
        // Pool balance doesn't change (bot buys from bot = net zero)
        // Just record the trade for volume/stats
    }
    // ============================================
    // Handle Bot (buyer) vs User (seller)
    // ============================================
    else if (buyerIsBot && !sellerIsBot) {
        // Bot is buying from a real user
        // - Pool pays QUOTE currency (cost) to user
        // - Pool receives BASE currency (amount) from user
        // - User's BASE wallet releases locked tokens
        // - User's QUOTE wallet receives payment
        // Get seller's wallets - use walletType from order to determine correct wallet
        const sellerWalletType = sellOrder.walletType || "ECO";
        const sellerBaseWallet = await getUserEcosystemWalletByCurrency(sellOrder.userId, baseCurrency, sellerWalletType);
        const sellerQuoteWallet = await getUserEcosystemWalletByCurrency(sellOrder.userId, quoteCurrency, sellerWalletType);
        if (!sellerBaseWallet || !sellerQuoteWallet) {
            throw (0, error_1.createError)({ statusCode: 404, message: `Wallets not found for seller ${sellOrder.userId} (type: ${sellerWalletType})` });
        }
        // Validate seller has locked funds (with small tolerance for floating-point precision)
        const sellerInOrder = parseFloat(((_a = sellerBaseWallet.inOrder) === null || _a === void 0 ? void 0 : _a.toString()) || "0");
        const PRECISION_TOLERANCE = 0.00000001; // 1e-8 tolerance for rounding errors
        if (sellerInOrder + PRECISION_TOLERANCE < amountToFillNum) {
            console_1.logger.error("MATCHING", `Seller insufficient locked funds: inOrder=${sellerInOrder}, needed=${amountToFillNum}, walletType=${sellerWalletType}`);
            throw (0, error_1.createError)({ statusCode: 400, message: `Seller has insufficient locked funds` });
        }
        // Clamp to not exceed what's actually locked
        const actualSellerRelease = Math.min(amountToFillNum, sellerInOrder);
        // Update pool: receives BASE, pays QUOTE
        await updatePoolBalance(buyOrder.marketMakerId, amountToFillNum, // Add BASE to pool
        -costNum // Subtract QUOTE from pool (payment to seller)
        );
        // Update seller's wallets
        // Use stable idempotency keys based on both order IDs
        const sellerBaseKey = `eco_trade_${buyOrder.id}_${sellOrder.id}_seller_base`;
        const sellerQuoteKey = `eco_trade_${buyOrder.id}_${sellOrder.id}_seller_quote`;
        await (0, wallet_1.updateWalletForFill)(sellerBaseWallet, 0, -actualSellerRelease, "seller releases base to bot", sellerBaseKey);
        await (0, wallet_1.updateWalletForFill)(sellerQuoteWallet, costNum - sellFeeNum, 0, "seller receives quote from bot", sellerQuoteKey);
        // Record bot's real trade for PnL tracking (bot is BUYING)
        if (buyOrder.botId) {
            const tradePrice = (0, blockchain_1.fromBigInt)(finalPrice);
            recordBotRealTrade(buyOrder.botId, undefined, // marketId not on Order type
            buyOrder.symbol, "BUY", tradePrice, amountToFillNum, sellOrder.userId).catch(err => console_1.logger.error("BOT_PNL", "Error recording bot trade", err));
        }
    }
    // ============================================
    // Handle User (buyer) vs Bot (seller)
    // ============================================
    else if (!buyerIsBot && sellerIsBot) {
        // User is buying from bot
        // - User pays QUOTE currency (cost) to pool
        // - User receives BASE currency (amount) from pool
        // - User's QUOTE wallet releases locked tokens
        // - User's BASE wallet receives tokens
        // Get buyer's wallets - use walletType from order to determine correct wallet
        const buyerWalletType = buyOrder.walletType || "ECO";
        const buyerBaseWallet = await getUserEcosystemWalletByCurrency(buyOrder.userId, baseCurrency, buyerWalletType);
        const buyerQuoteWallet = await getUserEcosystemWalletByCurrency(buyOrder.userId, quoteCurrency, buyerWalletType);
        if (!buyerBaseWallet || !buyerQuoteWallet) {
            throw (0, error_1.createError)({ statusCode: 404, message: `Wallets not found for buyer ${buyOrder.userId} (type: ${buyerWalletType})` });
        }
        // Validate buyer has locked funds (with small tolerance for floating-point precision)
        const buyerInOrder = parseFloat(((_b = buyerQuoteWallet.inOrder) === null || _b === void 0 ? void 0 : _b.toString()) || "0");
        const PRECISION_TOLERANCE = 0.00000001; // 1e-8 tolerance for rounding errors
        // Debug logging to understand the mismatch
        console_1.logger.info("MATCHING", `User vs Bot match: orderId=${buyOrder.id}, userId=${buyOrder.userId}, walletType=${buyerWalletType}, ` +
            `amountToFill=${amountToFillNum}, buyFillRatio=${buyFillRatio.toFixed(4)}, ` +
            `buyOrder.cost=${(0, blockchain_1.fromBigInt)(buyOrder.cost)}, buyReleaseNum=${buyReleaseNum}, buyerInOrder=${buyerInOrder}, ` +
            `buyOrder.status=${buyOrder.status}, buyOrder.remaining=${(0, blockchain_1.fromBigInt)(buyOrder.remaining)}`);
        if (buyerInOrder + PRECISION_TOLERANCE < buyReleaseNum) {
            console_1.logger.error("MATCHING", `Buyer insufficient locked funds: inOrder=${buyerInOrder}, needed=${buyReleaseNum}, diff=${buyReleaseNum - buyerInOrder}, orderId=${buyOrder.id}, walletType=${buyerWalletType}`);
            throw (0, error_1.createError)({ statusCode: 400, message: `Buyer has insufficient locked funds` });
        }
        // Clamp buyReleaseNum to not exceed what's actually locked
        const actualBuyRelease = Math.min(buyReleaseNum, buyerInOrder);
        // Update pool: pays BASE, receives QUOTE
        await updatePoolBalance(sellOrder.marketMakerId, -amountToFillNum, // Subtract BASE from pool (payment to buyer)
        costNum // Add QUOTE to pool (received from buyer)
        );
        // Update buyer's wallets
        // Use stable idempotency keys based on both order IDs
        const buyerBaseKey = `eco_trade_${buyOrder.id}_${sellOrder.id}_buyer_base`;
        const buyerQuoteKey = `eco_trade_${buyOrder.id}_${sellOrder.id}_buyer_quote`;
        await (0, wallet_1.updateWalletForFill)(buyerBaseWallet, amountToFillNum, 0, "buyer receives base from bot", buyerBaseKey);
        await (0, wallet_1.updateWalletForFill)(buyerQuoteWallet, 0, -actualBuyRelease, "buyer releases quote to bot", buyerQuoteKey);
        // Record bot's real trade for PnL tracking (bot is SELLING)
        if (sellOrder.botId) {
            const tradePrice = (0, blockchain_1.fromBigInt)(finalPrice);
            recordBotRealTrade(sellOrder.botId, undefined, // marketId not on Order type
            sellOrder.symbol, "SELL", tradePrice, amountToFillNum, buyOrder.userId).catch(err => console_1.logger.error("BOT_PNL", "Error recording bot trade", err));
        }
    }
    // ============================================
    // Handle User vs User trades (standard flow)
    // ============================================
    else {
        // Standard user-to-user trade - use walletType from orders to determine correct wallets
        const buyerWalletType = buyOrder.walletType || "ECO";
        const sellerWalletType = sellOrder.walletType || "ECO";
        const buyerBaseWallet = await getUserEcosystemWalletByCurrency(buyOrder.userId, baseCurrency, buyerWalletType);
        const buyerQuoteWallet = await getUserEcosystemWalletByCurrency(buyOrder.userId, quoteCurrency, buyerWalletType);
        const sellerBaseWallet = await getUserEcosystemWalletByCurrency(sellOrder.userId, baseCurrency, sellerWalletType);
        const sellerQuoteWallet = await getUserEcosystemWalletByCurrency(sellOrder.userId, quoteCurrency, sellerWalletType);
        if (!buyerBaseWallet || !buyerQuoteWallet || !sellerBaseWallet || !sellerQuoteWallet) {
            throw (0, error_1.createError)({ statusCode: 404, message: `Required wallets not found for buyer (type: ${buyerWalletType}) or seller (type: ${sellerWalletType}).` });
        }
        // Validate locked funds (with small tolerance for floating-point precision)
        const PRECISION_TOLERANCE = 0.00000001; // 1e-8 tolerance for rounding errors
        const sellerInOrder = parseFloat(((_c = sellerBaseWallet.inOrder) === null || _c === void 0 ? void 0 : _c.toString()) || "0");
        if (sellerInOrder + PRECISION_TOLERANCE < amountToFillNum) {
            console_1.logger.error("MATCHING", `Seller insufficient locked funds: inOrder=${sellerInOrder}, needed=${amountToFillNum}, walletType=${sellerWalletType}`);
            throw (0, error_1.createError)({ statusCode: 400, message: `Seller has insufficient locked funds` });
        }
        const actualSellerRelease = Math.min(amountToFillNum, sellerInOrder);
        const buyerInOrder = parseFloat(((_d = buyerQuoteWallet.inOrder) === null || _d === void 0 ? void 0 : _d.toString()) || "0");
        if (buyerInOrder + PRECISION_TOLERANCE < buyReleaseNum) {
            console_1.logger.error("MATCHING", `Buyer insufficient locked funds: inOrder=${buyerInOrder}, needed=${buyReleaseNum}, walletType=${buyerWalletType}`);
            throw (0, error_1.createError)({ statusCode: 400, message: `Buyer has insufficient locked funds` });
        }
        const actualBuyerRelease = Math.min(buyReleaseNum, buyerInOrder);
        // Execute wallet updates
        // Use stable idempotency keys based on both order IDs
        const buyBaseKey = `eco_trade_${buyOrder.id}_${sellOrder.id}_buy_base`;
        const buyQuoteKey = `eco_trade_${buyOrder.id}_${sellOrder.id}_buy_quote`;
        const sellBaseKey = `eco_trade_${buyOrder.id}_${sellOrder.id}_sell_base`;
        const sellQuoteKey = `eco_trade_${buyOrder.id}_${sellOrder.id}_sell_quote`;
        await (0, wallet_1.updateWalletForFill)(buyerBaseWallet, amountToFillNum, 0, "buyer receives base", buyBaseKey);
        await (0, wallet_1.updateWalletForFill)(buyerQuoteWallet, 0, -actualBuyerRelease, "buyer releases quote", buyQuoteKey);
        await (0, wallet_1.updateWalletForFill)(sellerBaseWallet, 0, -actualSellerRelease, "seller releases base", sellBaseKey);
        await (0, wallet_1.updateWalletForFill)(sellerQuoteWallet, costNum - sellFeeNum, 0, "seller receives quote", sellQuoteKey);
    }
    // Record the trades
    const buyTradeDetail = {
        id: `${buyOrder.id}`,
        amount: (0, blockchain_1.fromBigInt)(amountToFill),
        price: (0, blockchain_1.fromBigInt)(finalPrice),
        cost: (0, blockchain_1.fromBigIntMultiply)(amountToFill, finalPrice),
        side: "BUY",
        timestamp: Date.now(),
    };
    const sellTradeDetail = {
        id: `${sellOrder.id}`,
        amount: (0, blockchain_1.fromBigInt)(amountToFill),
        price: (0, blockchain_1.fromBigInt)(finalPrice),
        cost: (0, blockchain_1.fromBigIntMultiply)(amountToFill, finalPrice),
        side: "SELL",
        timestamp: Date.now(),
    };
    addTradeToOrder(buyOrder, buyTradeDetail);
    addTradeToOrder(sellOrder, sellTradeDetail);
    // Insert into dedicated trades table for Recent Trades display
    // Using buy trade - both buy and sell represent the same trade
    (0, queries_1.insertTrade)(buyOrder.symbol, buyTradeDetail.price, buyTradeDetail.amount, "BUY", false // Not an AI trade
    ).catch((err) => console_1.logger.error("MATCHING", "Failed to insert trade to trades table", err));
    // Broadcast the trades
    (0, ws_1.handleTradesBroadcast)(buyOrder.symbol, [buyTradeDetail, sellTradeDetail]);
    // Broadcast order updates to both users so they see partial fills in real-time
    (0, ws_1.handleOrderBroadcast)(buyOrder);
    (0, ws_1.handleOrderBroadcast)(sellOrder);
    // Update the orderbook entries
    updateOrderBook(bookUpdates, buyOrder, currentOrderBook, amountToFill);
    updateOrderBook(bookUpdates, sellOrder, currentOrderBook, amountToFill);
    // Trigger copy trading fill handling (async, non-blocking)
    // This will update copy trading records when leader or follower orders are filled
    triggerCopyTradingFill(buyOrder.id, buyOrder.userId, buyOrder.symbol, buyOrder.side, (0, blockchain_1.fromBigInt)(amountToFill), (0, blockchain_1.fromBigInt)(finalPrice), (0, blockchain_1.fromBigInt)((0, blockchain_1.removeTolerance)(buyProportionalFee)), buyOrder.status === "CLOSED" ? "FILLED" : "PARTIALLY_FILLED");
    triggerCopyTradingFill(sellOrder.id, sellOrder.userId, sellOrder.symbol, sellOrder.side, (0, blockchain_1.fromBigInt)(amountToFill), (0, blockchain_1.fromBigInt)(finalPrice), (0, blockchain_1.fromBigInt)((0, blockchain_1.removeTolerance)(sellProportionalFee)), sellOrder.status === "CLOSED" ? "FILLED" : "PARTIALLY_FILLED");
}
function addTradeToOrder(order, trade) {
    let trades = [];
    if (order.trades) {
        try {
            if (typeof order.trades === "string") {
                trades = JSON.parse(order.trades);
                if (!Array.isArray(trades) && typeof trades === "string") {
                    trades = JSON.parse(trades);
                }
            }
            else if (Array.isArray(order.trades)) {
                trades = order.trades;
            }
            else {
                console_1.logger.error("MATCHING", `Invalid trades format, resetting trades: ${JSON.stringify(order.trades)}`, new Error("Invalid trades format"));
                trades = [];
            }
        }
        catch (e) {
            console_1.logger.error("MATCHING", "Error parsing trades", e);
            trades = [];
        }
    }
    const mergedTrades = [...trades, trade].sort((a, b) => a.timestamp - b.timestamp);
    order.trades = JSON.stringify(mergedTrades, blockchain_1.BigIntReplacer);
    return order.trades;
}
const updateOrderBook = (bookUpdates, order, currentOrderBook, amount) => {
    const priceStr = order.price.toString();
    const bookSide = order.side === "BUY" ? "bids" : "asks";
    if (currentOrderBook[bookSide][priceStr] !== undefined) {
        // Price level exists - subtract the filled amount
        currentOrderBook[bookSide][priceStr] -= amount;
        bookUpdates[bookSide][priceStr] = currentOrderBook[bookSide][priceStr];
    }
    else {
        // Price level doesn't exist in orderbook - this can happen when:
        // 1. Order was placed but not yet synced to orderbook
        // 2. AI orders that exist in memory but not in ScyllaDB orderbook
        // Set to 0 to indicate this price level should be removed/ignored
        bookUpdates[bookSide][priceStr] = BigInt(0);
    }
};
const filterAndSortOrders = (orders, side, isBuy) => {
    return orders
        .filter((o) => o.side === side)
        .sort((a, b) => {
        if (isBuy) {
            return (Number(b.price) - Number(a.price) ||
                a.createdAt.getTime() - b.createdAt.getTime());
        }
        else {
            return (Number(a.price) - Number(b.price) ||
                a.createdAt.getTime() - b.createdAt.getTime());
        }
    })
        .filter((order) => !isBuy || BigInt(order.price) >= BigInt(0));
};
exports.filterAndSortOrders = filterAndSortOrders;
function validateOrder(order) {
    if (!order ||
        !order.id ||
        !order.userId ||
        !order.symbol ||
        !order.type ||
        !order.side ||
        typeof order.price !== "bigint" ||
        typeof order.amount !== "bigint" ||
        typeof order.filled !== "bigint" ||
        typeof order.remaining !== "bigint" ||
        typeof order.cost !== "bigint" ||
        typeof order.fee !== "bigint" ||
        !order.feeCurrency ||
        !order.status ||
        !(order.createdAt instanceof Date) ||
        !(order.updatedAt instanceof Date)) {
        console_1.logger.error("MATCHING", "Order validation failed", new Error(`Order validation failed: ${JSON.stringify(order)}`));
        return false;
    }
    return true;
}
function sortOrders(orders, isBuy) {
    return orders.sort((a, b) => {
        const priceComparison = isBuy
            ? Number(b.price - a.price)
            : Number(a.price - b.price);
        if (priceComparison !== 0)
            return priceComparison;
        if (a.createdAt < b.createdAt)
            return -1;
        if (a.createdAt > b.createdAt)
            return 1;
        return 0;
    });
}
async function getUserEcosystemWalletByCurrency(userId, currency, walletType = "ECO") {
    try {
        // Force fresh read from database to avoid stale cache issues
        const wallet = await db_1.models.wallet.findOne({
            where: {
                userId,
                currency,
                type: walletType,
            },
            // Ensure we get the latest data, bypassing any potential caching
            raw: false,
        });
        if (!wallet) {
            throw (0, error_1.createError)({ statusCode: 404, message: `Wallet not found for user ${userId} and currency ${currency} (type: ${walletType})` });
        }
        return wallet;
    }
    catch (error) {
        console_1.logger.error("ECOSYSTEM", "Failed to get user ecosystem wallet by currency", error);
        throw error;
    }
}
/**
 * Trigger copy trading fill handling (non-blocking)
 * This is called when any order is filled to check if it's a copy trading order
 */
async function triggerCopyTradingFill(orderId, userId, symbol, side, filledAmount, filledPrice, fee, status) {
    try {
        const { triggerCopyTradingOrderFilled } = await Promise.resolve().then(() => __importStar(require("@b/utils/safe-imports")));
        triggerCopyTradingOrderFilled(orderId, userId, symbol, side, filledAmount, filledPrice, fee, status).catch(() => { });
    }
    catch (importError) {
        // Copy trading module not available, skip silently
    }
}
