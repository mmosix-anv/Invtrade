"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.storeAndBroadcastTransaction = storeAndBroadcastTransaction;
exports.offloadToRedis = offloadToRedis;
exports.loadKeysFromRedis = loadKeysFromRedis;
exports.loadFromRedis = loadFromRedis;
exports.removeFromRedis = removeFromRedis;
const redis_1 = require("@b/utils/redis");
const Websocket_1 = require("@b/handler/Websocket");
const wallet_1 = require("@b/api/(ext)/ecosystem/utils/wallet");
const notifications_1 = require("@b/utils/notifications");
const utils_1 = require("@b/api/(ext)/ecosystem/wallet/utils");
const console_1 = require("@b/utils/console");
const redis = redis_1.RedisSingleton.getInstance();
const setAsync = (key, value) => redis.set(key, value);
const getAsync = (key) => redis.get(key);
const delAsync = (key) => redis.del(key);
const keysAsync = (pattern) => redis.keys(pattern);
async function storeAndBroadcastTransaction(txDetails, txHash, isPending = false) {
    var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l;
    try {
        console_1.logger.info("DEPOSIT", `Processing deposit for immediate broadcast: ${txHash}`);
        // Check if this is a pending transaction update (for confirmations)
        if (isPending && txDetails.type === "pending_confirmation") {
            console_1.logger.info("DEPOSIT", `Broadcasting pending transaction update for ${txHash}`);
            const address = ((_a = txDetails.address) === null || _a === void 0 ? void 0 : _a.toLowerCase()) || ((_b = txDetails.to) === null || _b === void 0 ? void 0 : _b.toLowerCase());
            // For UTXO chains (BTC, LTC, DOGE, DASH, XMR), currency === chain
            const currency = txDetails.currency || txDetails.chain;
            // Broadcast pending transaction status to WebSocket subscribers
            const broadcastPayload = {
                currency: currency,
                chain: txDetails.chain,
                address: address,
            };
            console_1.logger.debug("DEPOSIT", `Broadcasting to subscribed clients with payload: ${JSON.stringify(broadcastPayload)}`);
            Websocket_1.messageBroker.broadcastToSubscribedClients("/api/ecosystem/deposit", broadcastPayload, {
                stream: "verification",
                data: {
                    type: "pending_confirmation",
                    transactionHash: txDetails.transactionHash,
                    hash: txDetails.hash,
                    confirmations: txDetails.confirmations,
                    requiredConfirmations: txDetails.requiredConfirmations,
                    amount: txDetails.amount,
                    fee: txDetails.fee,
                    status: "PENDING",
                    chain: txDetails.chain,
                    walletId: txDetails.walletId,
                },
            });
            console_1.logger.success("DEPOSIT", `Broadcasted pending transaction ${txHash} with ${txDetails.confirmations}/${txDetails.requiredConfirmations} confirmations to currency:${currency}, chain:${txDetails.chain}, address:${address}`);
            return;
        }
        // First, try to handle the ecosystem deposit immediately
        const response = await (0, wallet_1.handleEcosystemDeposit)(txDetails);
        if (response.transactionId) {
            // Success! Broadcast immediately to connected clients
            console_1.logger.success("DEPOSIT", `Deposit processed immediately for ${txHash}, broadcasting to WebSocket`);
            // Handle address - it could be a string or array
            let address;
            if (txDetails.chain === "MO") {
                address = Array.isArray(txDetails.to)
                    ? (_c = txDetails.to[0]) === null || _c === void 0 ? void 0 : _c.toLowerCase()
                    : (_d = txDetails.to) === null || _d === void 0 ? void 0 : _d.toLowerCase();
            }
            else {
                address = ((_e = txDetails.address) === null || _e === void 0 ? void 0 : _e.toLowerCase()) ||
                    (Array.isArray(txDetails.to) ? (_f = txDetails.to[0]) === null || _f === void 0 ? void 0 : _f.toLowerCase() : (_g = txDetails.to) === null || _g === void 0 ? void 0 : _g.toLowerCase());
            }
            // Broadcast to WebSocket subscribers
            const broadcastPayload = {
                currency: (_h = response.wallet) === null || _h === void 0 ? void 0 : _h.currency,
                chain: txDetails.chain,
                address: address,
            };
            Websocket_1.messageBroker.broadcastToSubscribedClients("/api/ecosystem/deposit", broadcastPayload, {
                stream: "verification",
                data: {
                    status: 200,
                    message: "Deposit confirmed",
                    transactionId: response.transactionId,
                    wallet: response.wallet,
                    trx: txDetails,
                    balance: (_j = response.wallet) === null || _j === void 0 ? void 0 : _j.balance,
                    currency: (_k = response.wallet) === null || _k === void 0 ? void 0 : _k.currency,
                    chain: txDetails.chain,
                    method: "Wallet Deposit",
                },
            });
            // Handle address unlocking for NO_PERMIT tokens
            if (txDetails.contractType === "NO_PERMIT" && txDetails.to) {
                try {
                    await (0, utils_1.unlockAddress)(txDetails.to);
                    console_1.logger.success("DEPOSIT", `Address ${txDetails.to} unlocked for NO_PERMIT transaction ${txHash}`);
                }
                catch (unlockError) {
                    console_1.logger.error("DEPOSIT", `Failed to unlock address ${txDetails.to}`, unlockError);
                }
            }
            // Create notification
            if ((_l = response.wallet) === null || _l === void 0 ? void 0 : _l.userId) {
                try {
                    await (0, notifications_1.createNotification)({
                        userId: response.wallet.userId,
                        relatedId: response.transactionId,
                        title: "Deposit Confirmation",
                        message: `Your deposit of ${txDetails.amount} ${response.wallet.currency} has been confirmed.`,
                        type: "system",
                        link: `/finance/history`,
                        actions: [
                            {
                                label: "View Deposit",
                                link: `/finance/history`,
                                primary: true,
                            },
                        ],
                    });
                    console_1.logger.success("DEPOSIT", `Notification created for user ${response.wallet.userId}`);
                }
                catch (notificationError) {
                    console_1.logger.error("DEPOSIT", "Failed to create notification", notificationError);
                }
            }
            // Don't store as pending since it's already processed
            console_1.logger.success("DEPOSIT", `Deposit ${txHash} processed and broadcast immediately`);
            return;
        }
        else {
            console_1.logger.info("DEPOSIT", `Deposit ${txHash} couldn't be processed immediately, storing as pending`);
        }
    }
    catch (error) {
        console_1.logger.error("DEPOSIT", `Error in immediate deposit processing for ${txHash}`, error);
    }
    // Fallback: Store as pending for the verification worker to handle later
    console_1.logger.info("DEPOSIT", `Storing ${txHash} as pending for verification worker`);
    const pendingTransactions = (await loadFromRedis("pendingTransactions")) || {};
    pendingTransactions[txHash] = txDetails;
    await offloadToRedis("pendingTransactions", pendingTransactions);
}
async function offloadToRedis(key, value) {
    const serializedValue = JSON.stringify(value);
    await setAsync(key, serializedValue);
}
async function loadKeysFromRedis(pattern) {
    try {
        const keys = await keysAsync(pattern);
        return keys;
    }
    catch (error) {
        console_1.logger.error("REDIS", "Failed to fetch keys", error);
        return [];
    }
}
async function loadFromRedis(identifier) {
    const dataStr = await getAsync(identifier);
    if (!dataStr)
        return null;
    try {
        return JSON.parse(dataStr);
    }
    catch (error) {
        console_1.logger.error("REDIS", "Failed to parse JSON", error);
        return null;
    }
}
async function removeFromRedis(key) {
    try {
        const delResult = await delAsync(key);
        console_1.logger.debug("REDIS", `Delete Result for key ${key}: ${delResult}`);
    }
    catch (error) {
        console_1.logger.error("REDIS", `Failed to delete key ${key}`, error);
    }
}
