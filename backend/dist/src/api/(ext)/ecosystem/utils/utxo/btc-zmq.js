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
exports.BitcoinZMQService = void 0;
const zmq = __importStar(require("zeromq"));
const console_1 = require("@b/utils/console");
const btc_node_1 = require("./btc-node");
const db_1 = require("@b/db");
// Extension module - using safe import
let storeAndBroadcastTransaction;
try {
    const depositModule = require("@b/api/(ext)/ecosystem/utils/redis/deposit");
    storeAndBroadcastTransaction = depositModule.storeAndBroadcastTransaction;
}
catch (e) {
    // Extension not available
}
class BitcoinZMQService {
    constructor() {
        this.nodeService = null;
        // ZMQ sockets
        this.rawTxSocket = null;
        this.rawBlockSocket = null;
        this.hashTxSocket = null;
        this.hashBlockSocket = null;
        // Tracking
        this.watchedAddresses = new Set();
        this.addressToWalletId = new Map();
        this.processedTxIds = new Set();
        this.isRunning = false;
        this.mempoolTxs = new Map();
        this.config = {
            rawTxEndpoint: process.env.BTC_ZMQ_RAWTX || 'tcp://127.0.0.1:28333',
            rawBlockEndpoint: process.env.BTC_ZMQ_RAWBLOCK || 'tcp://127.0.0.1:28332',
            hashTxEndpoint: process.env.BTC_ZMQ_HASHTX || 'tcp://127.0.0.1:28334',
            hashBlockEndpoint: process.env.BTC_ZMQ_HASHBLOCK || 'tcp://127.0.0.1:28335',
        };
    }
    static async getInstance() {
        if (!BitcoinZMQService.instance) {
            BitcoinZMQService.instance = new BitcoinZMQService();
            await BitcoinZMQService.instance.initialize();
        }
        return BitcoinZMQService.instance;
    }
    async initialize() {
        try {
            console_1.logger.info("BTC_ZMQ", "Initializing Bitcoin ZMQ service...");
            // Get node service instance
            this.nodeService = await btc_node_1.BitcoinNodeService.getInstance();
            // Start ZMQ listeners
            await this.startListeners();
            console_1.logger.success("BTC_ZMQ", "Bitcoin ZMQ service initialized successfully");
        }
        catch (error) {
            console_1.logger.error("BTC_ZMQ", `Failed to initialize: ${error.message}`);
            throw error;
        }
    }
    async startListeners() {
        try {
            // Raw Transaction Listener (for instant deposit detection)
            this.rawTxSocket = new zmq.Subscriber();
            this.rawTxSocket.connect(this.config.rawTxEndpoint);
            this.rawTxSocket.subscribe('rawtx');
            console_1.logger.info("BTC_ZMQ", `Connected to rawtx: ${this.config.rawTxEndpoint}`);
            // Raw Block Listener (for confirmations)
            this.rawBlockSocket = new zmq.Subscriber();
            this.rawBlockSocket.connect(this.config.rawBlockEndpoint);
            this.rawBlockSocket.subscribe('rawblock');
            console_1.logger.info("BTC_ZMQ", `Connected to rawblock: ${this.config.rawBlockEndpoint}`);
            // Hash Transaction Listener (lightweight)
            this.hashTxSocket = new zmq.Subscriber();
            this.hashTxSocket.connect(this.config.hashTxEndpoint);
            this.hashTxSocket.subscribe('hashtx');
            console_1.logger.info("BTC_ZMQ", `Connected to hashtx: ${this.config.hashTxEndpoint}`);
            this.isRunning = true;
            // Start processing loops
            this.processRawTransactions();
            this.processRawBlocks();
            this.processHashTransactions();
            console_1.logger.success("BTC_ZMQ", "All ZMQ listeners started");
        }
        catch (error) {
            console_1.logger.error("BTC_ZMQ", `Failed to start listeners: ${error.message}`);
            throw error;
        }
    }
    /**
     * Process raw transactions for instant deposit detection
     */
    async processRawTransactions() {
        if (!this.rawTxSocket)
            return;
        try {
            for await (const [topic, message] of this.rawTxSocket) {
                if (!this.isRunning)
                    break;
                try {
                    const txHex = message.toString('hex');
                    const tx = await this.parseRawTransaction(txHex);
                    if (tx) {
                        await this.handleNewTransaction(tx, true); // true = from mempool
                    }
                }
                catch (error) {
                    console_1.logger.error("BTC_ZMQ", `Error processing raw transaction: ${error.message}`);
                }
            }
        }
        catch (error) {
            console_1.logger.error("BTC_ZMQ", `Raw transaction listener error: ${error.message}`);
        }
    }
    /**
     * Process raw blocks for confirmation updates
     */
    async processRawBlocks() {
        if (!this.rawBlockSocket)
            return;
        try {
            for await (const [topic, message] of this.rawBlockSocket) {
                if (!this.isRunning)
                    break;
                try {
                    console_1.logger.info("BTC_ZMQ", "New block received, updating confirmations...");
                    // Update all pending transactions with new confirmation counts
                    await this.updatePendingTransactions();
                    // Clean up old mempool transactions
                    this.cleanupMempoolTxs();
                }
                catch (error) {
                    console_1.logger.error("BTC_ZMQ", `Error processing block: ${error.message}`);
                }
            }
        }
        catch (error) {
            console_1.logger.error("BTC_ZMQ", `Raw block listener error: ${error.message}`);
        }
    }
    /**
     * Process hash transactions (lightweight notification)
     */
    async processHashTransactions() {
        if (!this.hashTxSocket)
            return;
        try {
            for await (const [topic, message] of this.hashTxSocket) {
                if (!this.isRunning)
                    break;
                try {
                    const txHash = message.toString('hex');
                    // Just log for monitoring, main processing happens in rawtx
                    console_1.logger.debug("BTC_ZMQ", `New transaction hash: ${txHash}`);
                }
                catch (error) {
                    console_1.logger.error("BTC_ZMQ", `Error processing tx hash: ${error.message}`);
                }
            }
        }
        catch (error) {
            console_1.logger.error("BTC_ZMQ", `Hash transaction listener error: ${error.message}`);
        }
    }
    /**
     * Parse raw transaction hex to extract addresses
     */
    async parseRawTransaction(txHex) {
        try {
            if (!this.nodeService)
                return null;
            // Decode raw transaction using Bitcoin RPC
            const response = await this.nodeService.decodeRawTransaction(txHex);
            return {
                txid: response.txid,
                vout: response.vout,
                vin: response.vin,
                hex: txHex,
            };
        }
        catch (error) {
            console_1.logger.error("BTC_ZMQ", `Failed to parse raw transaction: ${error.message}`);
            return null;
        }
    }
    /**
     * Handle new transaction (from mempool or confirmed)
     */
    async handleNewTransaction(tx, fromMempool) {
        var _a, _b, _c;
        try {
            // Skip if already processed
            if (this.processedTxIds.has(tx.txid)) {
                return;
            }
            // Check if any outputs match our watched addresses
            const matchedOutputs = [];
            for (let i = 0; i < tx.vout.length; i++) {
                const output = tx.vout[i];
                const addresses = ((_a = output.scriptPubKey) === null || _a === void 0 ? void 0 : _a.addresses) ||
                    (((_b = output.scriptPubKey) === null || _b === void 0 ? void 0 : _b.address) ? [output.scriptPubKey.address] : []);
                for (const address of addresses) {
                    if (this.watchedAddresses.has(address)) {
                        matchedOutputs.push({
                            address,
                            amount: output.value,
                            vout: i,
                        });
                    }
                }
            }
            if (matchedOutputs.length === 0) {
                return; // No watched addresses involved
            }
            console_1.logger.info("BTC_ZMQ", `Detected transaction to watched address: ${tx.txid}`);
            console_1.logger.debug("BTC_ZMQ", `Matched outputs: ${JSON.stringify(matchedOutputs)}`);
            // Calculate fee (if available)
            let fee = 0;
            try {
                const fullTx = await ((_c = this.nodeService) === null || _c === void 0 ? void 0 : _c.getRawTransaction(tx.txid, true));
                if (fullTx) {
                    fee = fullTx.fee ? Math.abs(fullTx.fee) : 0;
                }
            }
            catch (e) {
                // Fee estimation not available yet
            }
            // Store in mempool tracking if unconfirmed
            if (fromMempool) {
                this.mempoolTxs.set(tx.txid, {
                    time: Date.now(),
                    fee: fee,
                    addresses: matchedOutputs.map(o => o.address),
                });
                console_1.logger.warn("BTC_ZMQ", `0-conf transaction detected with fee: ${fee} BTC`);
            }
            // Process each matched output
            for (const output of matchedOutputs) {
                const walletId = this.addressToWalletId.get(output.address);
                if (!walletId)
                    continue;
                const wallet = await db_1.models.wallet.findOne({
                    where: { id: walletId },
                    include: [{ model: db_1.models.user, as: 'user' }],
                });
                if (!wallet)
                    continue;
                // Broadcast pending transaction (0 confirmations)
                if (storeAndBroadcastTransaction) {
                    const txData = {
                        walletId: wallet.id,
                        chain: 'BTC',
                        hash: tx.txid,
                        transactionHash: tx.txid,
                        type: fromMempool ? 'pending_confirmation' : 'DEPOSIT',
                        from: 'N/A',
                        address: output.address,
                        amount: output.amount,
                        fee: fee,
                        confirmations: fromMempool ? 0 : 1,
                        requiredConfirmations: 3, // BTC requires 3 confirmations
                        status: fromMempool ? 'PENDING' : 'COMPLETED',
                    };
                    await storeAndBroadcastTransaction(txData, tx.txid, fromMempool);
                    console_1.logger.info("BTC_ZMQ", `Broadcasted ${fromMempool ? 'pending' : 'confirmed'} transaction for wallet ${wallet.id}`);
                }
            }
            // Mark as processed
            this.processedTxIds.add(tx.txid);
            // Clean up old processed txs (keep last 1000)
            if (this.processedTxIds.size > 1000) {
                const toDelete = Array.from(this.processedTxIds).slice(0, 100);
                toDelete.forEach(txid => this.processedTxIds.delete(txid));
            }
        }
        catch (error) {
            console_1.logger.error("BTC_ZMQ", `Error handling transaction ${tx.txid}: ${error.message}`);
        }
    }
    /**
     * Update pending transactions with new confirmation counts
     */
    async updatePendingTransactions() {
        var _a;
        try {
            // Get all pending BTC transactions
            const pendingTxs = await db_1.models.transaction.findAll({
                where: {
                    status: 'PENDING',
                    chain: 'BTC',
                },
                include: [{ model: db_1.models.wallet, as: 'wallet' }],
            });
            for (const transaction of pendingTxs) {
                try {
                    if (!transaction.trxId)
                        continue;
                    const tx = await ((_a = this.nodeService) === null || _a === void 0 ? void 0 : _a.getRawTransaction(transaction.trxId, true));
                    if (!tx)
                        continue;
                    const confirmations = tx.confirmations || 0;
                    // Update transaction with new confirmation count
                    if (storeAndBroadcastTransaction) {
                        const txData = {
                            walletId: transaction.walletId,
                            chain: 'BTC',
                            hash: transaction.trxId,
                            transactionHash: transaction.trxId,
                            type: confirmations >= 3 ? 'DEPOSIT' : 'pending_confirmation',
                            from: 'N/A',
                            address: transaction.toAddress,
                            amount: transaction.amount,
                            fee: transaction.fee || 0,
                            confirmations: confirmations,
                            requiredConfirmations: 3,
                            status: confirmations >= 3 ? 'COMPLETED' : 'PENDING',
                        };
                        await storeAndBroadcastTransaction(txData, transaction.trxId, confirmations < 3);
                        console_1.logger.info("BTC_ZMQ", `Updated transaction ${transaction.trxId}: ${confirmations}/3 confirmations`);
                    }
                }
                catch (error) {
                    console_1.logger.error("BTC_ZMQ", "Error updating transaction", error);
                }
            }
        }
        catch (error) {
            console_1.logger.error("BTC_ZMQ", "Error updating pending transactions", error);
        }
    }
    /**
     * Clean up old mempool transactions (older than 1 hour)
     */
    cleanupMempoolTxs() {
        const oneHourAgo = Date.now() - 60 * 60 * 1000;
        for (const [txid, data] of this.mempoolTxs.entries()) {
            if (data.time < oneHourAgo) {
                this.mempoolTxs.delete(txid);
            }
        }
    }
    /**
     * Add address to watch list
     */
    async watchAddress(address, walletId) {
        try {
            // Import address into Bitcoin Core watch-only wallet
            if (this.nodeService) {
                await this.nodeService.importAddress(address, `wallet_${walletId}`);
            }
            this.watchedAddresses.add(address);
            this.addressToWalletId.set(address, walletId);
            console_1.logger.info("BTC_ZMQ", `Now watching address ${address} for wallet ${walletId}`);
        }
        catch (error) {
            console_1.logger.error("BTC_ZMQ", `Failed to watch address ${address}: ${error.message}`);
            throw error;
        }
    }
    /**
     * Remove address from watch list
     */
    unwatchAddress(address) {
        this.watchedAddresses.delete(address);
        this.addressToWalletId.delete(address);
        console_1.logger.info("BTC_ZMQ", `Stopped watching address ${address}`);
    }
    /**
     * Get mempool transaction info
     */
    getMempoolTx(txid) {
        return this.mempoolTxs.get(txid);
    }
    /**
     * Check if transaction is in mempool
     */
    isInMempool(txid) {
        return this.mempoolTxs.has(txid);
    }
    /**
     * Get all watched addresses
     */
    getWatchedAddresses() {
        return Array.from(this.watchedAddresses);
    }
    /**
     * Stop ZMQ service
     */
    async stop() {
        console_1.logger.info("BTC_ZMQ", "Stopping Bitcoin ZMQ service...");
        this.isRunning = false;
        if (this.rawTxSocket)
            await this.rawTxSocket.close();
        if (this.rawBlockSocket)
            await this.rawBlockSocket.close();
        if (this.hashTxSocket)
            await this.hashTxSocket.close();
        if (this.hashBlockSocket)
            await this.hashBlockSocket.close();
        console_1.logger.success("BTC_ZMQ", "Bitcoin ZMQ service stopped");
    }
}
exports.BitcoinZMQService = BitcoinZMQService;
exports.default = BitcoinZMQService;
