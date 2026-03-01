"use strict";
/**
 * Bitcoin Core Node Provider (Local RPC)
 * Self-hosted Bitcoin Core node with full control and privacy
 * Requires local Bitcoin Core installation with RPC enabled
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.BitcoinNodeProvider = void 0;
const btc_node_1 = require("../btc-node");
const btc_zmq_1 = require("../btc-zmq");
const console_1 = require("@b/utils/console");
const error_1 = require("@b/utils/error");
class BitcoinNodeProvider {
    constructor(chain) {
        this.zmqService = null;
        if (chain !== 'BTC') {
            throw (0, error_1.createError)({ statusCode: 400, message: 'Bitcoin Node provider only supports BTC' });
        }
        this.chain = chain;
    }
    async initialize() {
        this.nodeService = await btc_node_1.BitcoinNodeService.getInstance();
        // Initialize ZMQ service if ZMQ endpoints are configured
        if (process.env.BTC_ZMQ_RAWTX) {
            try {
                this.zmqService = await btc_zmq_1.BitcoinZMQService.getInstance();
                console_1.logger.success("BTC_NODE_PROVIDER", "ZMQ service initialized");
            }
            catch (error) {
                console_1.logger.warn("BTC_NODE_PROVIDER", `ZMQ service failed to initialize, falling back to polling: ${error.message}`);
            }
        }
    }
    /**
     * Watch address for deposits via ZMQ
     */
    async watchAddress(address, walletId) {
        if (this.zmqService) {
            await this.zmqService.watchAddress(address, walletId);
        }
    }
    getName() {
        return `Bitcoin Core Node (${this.chain})`;
    }
    async fetchTransactions(address) {
        try {
            if (!this.nodeService) {
                await this.initialize();
            }
            const txs = await this.nodeService.getAddressTransactions(address);
            return txs.map((tx) => ({
                hash: tx.txid,
                blockHeight: tx.blockheight || undefined,
                value: Math.abs(tx.amount * 100000000), // Convert BTC to satoshis
                confirmedTime: tx.time ? new Date(tx.time * 1000).toISOString() : undefined,
                spent: false,
                confirmations: tx.confirmations || 0,
            }));
        }
        catch (error) {
            console_1.logger.error("BTC_NODE_PROVIDER", "Failed to fetch transactions", error);
            return [];
        }
    }
    async fetchTransaction(txHash) {
        try {
            if (!this.nodeService) {
                await this.initialize();
            }
            const tx = await this.nodeService.getRawTransaction(txHash, true);
            if (!tx) {
                return null;
            }
            // Parse inputs
            const inputs = await Promise.all(tx.vin.map(async (input) => {
                var _a, _b;
                if (input.coinbase) {
                    return {
                        prev_hash: 'coinbase',
                        prevHash: 'coinbase',
                        output_index: 0,
                        outputIndex: 0,
                        output_value: 0,
                        addresses: [],
                    };
                }
                // Get previous transaction to get input value
                const prevTx = await this.nodeService.getRawTransaction(input.txid, true);
                const prevOut = prevTx === null || prevTx === void 0 ? void 0 : prevTx.vout[input.vout];
                return {
                    prev_hash: input.txid,
                    prevHash: input.txid,
                    output_index: input.vout,
                    outputIndex: input.vout,
                    output_value: prevOut ? prevOut.value * 100000000 : 0, // Convert BTC to satoshis
                    addresses: ((_a = prevOut === null || prevOut === void 0 ? void 0 : prevOut.scriptPubKey) === null || _a === void 0 ? void 0 : _a.addresses) || [],
                    script: (_b = prevOut === null || prevOut === void 0 ? void 0 : prevOut.scriptPubKey) === null || _b === void 0 ? void 0 : _b.hex,
                };
            }));
            // Parse outputs
            const outputs = tx.vout.map((output) => {
                var _a, _b;
                return ({
                    value: output.value * 100000000, // Convert BTC to satoshis
                    addresses: ((_a = output.scriptPubKey) === null || _a === void 0 ? void 0 : _a.addresses) || [],
                    script: (_b = output.scriptPubKey) === null || _b === void 0 ? void 0 : _b.hex,
                    spent: false, // Would need additional check
                });
            });
            // Calculate fee
            const totalInput = inputs.reduce((sum, input) => sum + input.output_value, 0);
            const totalOutput = outputs.reduce((sum, output) => sum + output.value, 0);
            const fee = totalInput - totalOutput;
            return {
                hash: tx.txid,
                block_height: tx.blockheight,
                confirmations: tx.confirmations,
                fee: fee, // in satoshis
                inputs: inputs,
                outputs: outputs,
            };
        }
        catch (error) {
            console_1.logger.error("BTC_NODE_PROVIDER", "Failed to fetch transaction", error);
            return null;
        }
    }
    async fetchRawTransaction(txHash) {
        try {
            if (!this.nodeService) {
                await this.initialize();
            }
            const tx = await this.nodeService.getRawTransaction(txHash, false);
            return tx;
        }
        catch (error) {
            console_1.logger.error("BTC_NODE_PROVIDER", "Failed to fetch raw transaction", error);
            throw error;
        }
    }
    async getBalance(address) {
        try {
            if (!this.nodeService) {
                await this.initialize();
            }
            const balanceBTC = await this.nodeService.getAddressBalance(address);
            return balanceBTC * 100000000; // Convert BTC to satoshis
        }
        catch (error) {
            console_1.logger.error("BTC_NODE_PROVIDER", "Failed to get balance", error);
            return 0;
        }
    }
    async getUTXOs(address) {
        try {
            if (!this.nodeService) {
                await this.initialize();
            }
            const utxos = await this.nodeService.listUnspent(address);
            return utxos.map((utxo) => ({
                txid: utxo.txid,
                vout: utxo.vout,
                value: utxo.amount * 100000000, // Convert BTC to satoshis
                confirmations: utxo.confirmations,
                script: utxo.scriptPubKey,
            }));
        }
        catch (error) {
            console_1.logger.error("BTC_NODE_PROVIDER", "Failed to get UTXOs", error);
            return [];
        }
    }
    async broadcastTransaction(rawTxHex) {
        try {
            if (!this.nodeService) {
                await this.initialize();
            }
            const txid = await this.nodeService.sendRawTransaction(rawTxHex);
            return {
                success: true,
                txid: txid,
            };
        }
        catch (error) {
            console_1.logger.error("BTC_NODE_PROVIDER", "Failed to broadcast transaction", error);
            return {
                success: false,
                txid: null,
                error: error.message,
            };
        }
    }
    async getFeeRate() {
        try {
            if (!this.nodeService) {
                await this.initialize();
            }
            // estimatesmartfee returns fee in BTC/kB, we need sat/byte
            const result = await this.nodeService.estimateSmartFee(6); // 6 blocks
            if (result.feerate) {
                const feePerKB = result.feerate * 100000000; // Convert BTC to satoshis
                return feePerKB / 1024; // Convert from sat/kB to sat/byte
            }
            return 1; // Default 1 sat/byte
        }
        catch (error) {
            console_1.logger.error("BTC_NODE_PROVIDER", "Failed to get fee rate", error);
            return 1;
        }
    }
    async isAvailable() {
        try {
            if (!this.nodeService) {
                await this.initialize();
            }
            return await this.nodeService.isSynced();
        }
        catch (error) {
            return false;
        }
    }
}
exports.BitcoinNodeProvider = BitcoinNodeProvider;
