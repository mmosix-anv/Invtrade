"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.onClose = exports.metadata = void 0;
// index.ws.ts
const error_1 = require("@b/utils/error");
const db_1 = require("@b/db");
const tokens_1 = require("@b/api/(ext)/ecosystem/utils/tokens");
const EVMDeposits_1 = require("./util/monitor/EVMDeposits");
const UTXODeposits_1 = require("./util/monitor/UTXODeposits");
const SolanaDeposits_1 = require("./util/monitor/SolanaDeposits");
const TronDeposits_1 = require("./util/monitor/TronDeposits");
const MoneroDeposits_1 = require("./util/monitor/MoneroDeposits");
const TonDeposits_1 = require("./util/monitor/TonDeposits");
const MODeposits_1 = require("./util/monitor/MODeposits");
const cron_1 = require("@b/cron");
const PendingVerification_1 = require("./util/PendingVerification");
const worker_threads_1 = require("worker_threads");
const console_1 = require("@b/utils/console");
const monitorInstances = new Map(); // Maps userId -> monitor instance
const monitorStopTimeouts = new Map(); // Maps userId -> stopPolling timeout ID
const activeConnections = new Map(); // Maps userId -> connection metadata
let workerInitialized = false;
exports.metadata = {
    logModule: "ECOSYSTEM",
    logTitle: "Deposit WebSocket monitoring"
};
exports.default = async (data, message) => {
    const { user, ctx } = data;
    if (!(user === null || user === void 0 ? void 0 : user.id))
        throw (0, error_1.createError)(401, "Unauthorized");
    ctx === null || ctx === void 0 ? void 0 : ctx.step("Parsing deposit WebSocket message");
    if (typeof message === "string") {
        try {
            message = JSON.parse(message);
        }
        catch (err) {
            console_1.logger.error("DEPOSIT_WS", `Failed to parse incoming message: ${err.message}`);
            ctx === null || ctx === void 0 ? void 0 : ctx.fail("Invalid JSON payload");
            throw (0, error_1.createError)(400, "Invalid JSON payload");
        }
    }
    const { currency, chain, address } = message.payload;
    ctx === null || ctx === void 0 ? void 0 : ctx.step("Validating deposit parameters");
    // Enhanced validation
    if (!currency || !chain) {
        ctx === null || ctx === void 0 ? void 0 : ctx.fail("Missing currency or chain");
        throw (0, error_1.createError)(400, "Currency and chain are required");
    }
    try {
        ctx === null || ctx === void 0 ? void 0 : ctx.step(`Finding wallet for ${currency}`);
        const wallet = await db_1.models.wallet.findOne({
            where: {
                userId: user.id,
                currency,
                type: "ECO",
            },
        });
        if (!wallet) {
            ctx === null || ctx === void 0 ? void 0 : ctx.fail("Wallet not found");
            throw (0, error_1.createError)(400, "Wallet not found");
        }
        if (!wallet.address) {
            ctx === null || ctx === void 0 ? void 0 : ctx.fail("Wallet address not found");
            throw (0, error_1.createError)(400, "Wallet address not found");
        }
        const addresses = JSON.parse(wallet.address);
        const walletChain = addresses[chain];
        if (!walletChain) {
            ctx === null || ctx === void 0 ? void 0 : ctx.fail("Address not found for chain");
            throw (0, error_1.createError)(400, "Address not found");
        }
        ctx === null || ctx === void 0 ? void 0 : ctx.step(`Fetching token configuration for ${currency} on ${chain}`);
        const token = await (0, tokens_1.getEcosystemToken)(chain, currency);
        if (!token) {
            ctx === null || ctx === void 0 ? void 0 : ctx.fail("Token not found");
            throw (0, error_1.createError)(400, "Token not found");
        }
        const contractType = token.contractType;
        const finalAddress = contractType === "NO_PERMIT" ? address : walletChain.address;
        const monitorKey = user.id;
        // Store connection metadata for better tracking
        activeConnections.set(monitorKey, {
            userId: user.id,
            currency,
            chain,
            address: finalAddress,
            contractType,
            connectedAt: Date.now(),
        });
        // Clear any pending stop timeouts since the user reconnected
        if (monitorStopTimeouts.has(monitorKey)) {
            clearTimeout(monitorStopTimeouts.get(monitorKey));
            monitorStopTimeouts.delete(monitorKey);
            console_1.logger.info("DEPOSIT_WS", `Cleared stop timeout for user ${monitorKey} on reconnection`);
        }
        let monitor = monitorInstances.get(monitorKey);
        // Enhanced monitor management - check if monitor is stale or for different parameters
        if (monitor) {
            const connection = activeConnections.get(monitorKey);
            const isStaleMonitor = monitor.active === false ||
                (connection &&
                    (monitor.chain !== chain ||
                        monitor.currency !== currency ||
                        monitor.address !== finalAddress));
            if (isStaleMonitor) {
                console_1.logger.info("DEPOSIT_WS", `Monitor for user ${monitorKey} is stale or inactive. Creating a new monitor.`);
                // Clean up old monitor
                if (typeof monitor.stopPolling === "function") {
                    monitor.stopPolling();
                }
                monitorInstances.delete(monitorKey);
                monitor = null;
            }
        }
        if (!monitor) {
            ctx === null || ctx === void 0 ? void 0 : ctx.step(`Creating new deposit monitor for ${chain}/${currency}`);
            // No existing monitor for this user, create a new one
            console_1.logger.info("DEPOSIT_WS", `Creating new monitor for user ${monitorKey}, chain: ${chain}, currency: ${currency}`);
            monitor = createMonitor(chain, {
                wallet,
                chain,
                currency,
                address: finalAddress,
                contractType,
            });
            if (monitor) {
                await monitor.watchDeposits();
                monitorInstances.set(monitorKey, monitor);
                console_1.logger.success("DEPOSIT_WS", `Monitor created and started for user ${monitorKey}`);
                ctx === null || ctx === void 0 ? void 0 : ctx.success(`Deposit monitor started for ${chain}/${currency}`);
            }
            else {
                console_1.logger.error("DEPOSIT_WS", `Failed to create monitor for chain ${chain}`);
                ctx === null || ctx === void 0 ? void 0 : ctx.fail(`Monitor creation failed for chain ${chain}`);
                throw (0, error_1.createError)(500, `Monitor creation failed for chain ${chain}`);
            }
        }
        else {
            // Monitor already exists and is valid, just reuse it
            console_1.logger.info("DEPOSIT_WS", `Reusing existing monitor for user ${monitorKey}`);
            ctx === null || ctx === void 0 ? void 0 : ctx.success(`Reusing existing deposit monitor for ${chain}/${currency}`);
        }
        // Initialize verification worker if not already done
        if (worker_threads_1.isMainThread && !workerInitialized) {
            try {
                ctx === null || ctx === void 0 ? void 0 : ctx.step("Initializing verification worker");
                await (0, cron_1.createWorker)("verifyPendingTransactions", PendingVerification_1.verifyPendingTransactions, 10000);
                console_1.logger.success("DEPOSIT_WS", "Verification worker started");
                workerInitialized = true;
            }
            catch (error) {
                console_1.logger.error("DEPOSIT_WS", `Failed to start verification worker: ${error.message}`);
            }
        }
    }
    catch (error) {
        console_1.logger.error("DEPOSIT_WS", `Error in deposit WebSocket handler: ${error.message}`);
        ctx === null || ctx === void 0 ? void 0 : ctx.fail(`Deposit monitoring failed: ${error.message}`);
        // Clean up on error
        const monitorKey = user.id;
        if (monitorInstances.has(monitorKey)) {
            const monitor = monitorInstances.get(monitorKey);
            if (typeof monitor.stopPolling === "function") {
                monitor.stopPolling();
            }
            monitorInstances.delete(monitorKey);
        }
        activeConnections.delete(monitorKey);
        throw error;
    }
};
function createMonitor(chain, options) {
    const { wallet, currency, address, contractType } = options;
    try {
        if (["BTC", "LTC", "DOGE", "DASH"].includes(chain)) {
            return new UTXODeposits_1.UTXODeposits({ wallet, chain, address });
        }
        else if (chain === "SOL") {
            return new SolanaDeposits_1.SolanaDeposits({ wallet, chain, currency, address });
        }
        else if (chain === "TRON") {
            return new TronDeposits_1.TronDeposits({ wallet, chain, address });
        }
        else if (chain === "XMR") {
            return new MoneroDeposits_1.MoneroDeposits({ wallet });
        }
        else if (chain === "TON") {
            return new TonDeposits_1.TonDeposits({ wallet, chain, address });
        }
        else if (chain === "MO" && contractType !== "NATIVE") {
            return new MODeposits_1.MODeposits({ wallet, chain, currency, address, contractType });
        }
        else {
            return new EVMDeposits_1.EVMDeposits({
                wallet,
                chain,
                currency,
                address,
                contractType,
            });
        }
    }
    catch (error) {
        console_1.logger.error("DEPOSIT_WS", `Error creating monitor for chain ${chain}: ${error.message}`);
        return null;
    }
}
const onClose = async (ws, route, clientId) => {
    console_1.logger.info("DEPOSIT_WS", `WebSocket connection closed for client ${clientId}`);
    // Clear any previous pending stop timeouts for this client
    if (monitorStopTimeouts.has(clientId)) {
        clearTimeout(monitorStopTimeouts.get(clientId));
        monitorStopTimeouts.delete(clientId);
    }
    const monitor = monitorInstances.get(clientId);
    const connection = activeConnections.get(clientId);
    if (monitor && typeof monitor.stopPolling === "function") {
        // Enhanced timeout management - different timeouts based on contract type
        const timeoutDuration = (connection === null || connection === void 0 ? void 0 : connection.contractType) === "NO_PERMIT"
            ? 2 * 60 * 1000 // 2 minutes for NO_PERMIT (shorter due to address locking)
            : 10 * 60 * 1000; // 10 minutes for others
        console_1.logger.info("DEPOSIT_WS", `Scheduling monitor stop for client ${clientId} in ${timeoutDuration / 1000}s (${(connection === null || connection === void 0 ? void 0 : connection.contractType) || "unknown"} type)`);
        // Schedule stopPolling after timeout if the user doesn't reconnect
        const timeoutId = setTimeout(() => {
            try {
                console_1.logger.info("DEPOSIT_WS", `Executing scheduled monitor stop for client ${clientId}`);
                if (monitor && typeof monitor.stopPolling === "function") {
                    monitor.stopPolling();
                }
                monitorStopTimeouts.delete(clientId);
                monitorInstances.delete(clientId);
                activeConnections.delete(clientId);
                console_1.logger.success("DEPOSIT_WS", `Monitor stopped and cleaned up for client ${clientId}`);
            }
            catch (error) {
                console_1.logger.error("DEPOSIT_WS", `Error during monitor cleanup for client ${clientId}: ${error.message}`);
            }
        }, timeoutDuration);
        monitorStopTimeouts.set(clientId, timeoutId);
    }
    else {
        // No monitor or invalid monitor, just clean up immediately
        monitorInstances.delete(clientId);
        activeConnections.delete(clientId);
    }
};
exports.onClose = onClose;
