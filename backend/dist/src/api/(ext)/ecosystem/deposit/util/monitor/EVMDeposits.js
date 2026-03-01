"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.EVMDeposits = void 0;
const tokens_1 = require("@b/api/(ext)/ecosystem/utils/tokens");
const transactions_1 = require("@b/api/(ext)/ecosystem/utils/transactions");
const chains_1 = require("@b/api/(ext)/ecosystem/utils/chains");
const ProviderManager_1 = require("../ProviderManager");
const ethers_1 = require("ethers");
const DepositUtils_1 = require("../DepositUtils");
const deposit_1 = require("@b/api/(ext)/ecosystem/utils/redis/deposit");
const console_1 = require("@b/utils/console");
class EVMDeposits {
    constructor(options) {
        this.active = true;
        this.wallet = options.wallet;
        this.chain = options.chain;
        this.currency = options.currency;
        this.address = options.address;
        this.contractType = options.contractType;
    }
    async watchDeposits() {
        var _a;
        if (!this.active) {
            console_1.logger.debug("EVM_DEPOSIT", `Monitor for ${this.chain} is not active, skipping watchDeposits`);
            return;
        }
        try {
            let provider = ProviderManager_1.chainProviders.get(this.chain);
            if (!provider) {
                provider = await (0, ProviderManager_1.initializeWebSocketProvider)(this.chain);
                if (!provider) {
                    provider = await (0, ProviderManager_1.initializeHttpProvider)(this.chain);
                }
                if (!provider) {
                    console_1.logger.error("EVM_DEPOSIT", `No provider available for chain ${this.chain}`);
                    return;
                }
            }
            const feeDecimals = ((_a = chains_1.chainConfigs[this.chain]) === null || _a === void 0 ? void 0 : _a.decimals) || 18;
            if (this.contractType === "NATIVE") {
                await this.watchNativeDeposits(provider, feeDecimals);
            }
            else {
                await this.watchTokenDeposits(provider, feeDecimals);
            }
        }
        catch (error) {
            console_1.logger.error("EVM_DEPOSIT", `Error in watchDeposits for ${this.chain}: ${error.message}`);
            this.active = false;
        }
    }
    async watchNativeDeposits(provider, feeDecimals) {
        var _a;
        const decimals = ((_a = chains_1.chainConfigs[this.chain]) === null || _a === void 0 ? void 0 : _a.decimals) || 18;
        let depositFound = false;
        let startTime = Math.floor(Date.now() / 1000);
        let consecutiveErrors = 0;
        const MAX_CONSECUTIVE_ERRORS = 10; // Increased from 5 to 10 for better resilience
        console_1.logger.info("EVM_DEPOSIT", `Starting native deposit monitoring for ${this.chain} address ${this.address}`);
        const verifyDeposits = async () => {
            if (depositFound || !this.active) {
                return;
            }
            try {
                const transactions = await (0, transactions_1.fetchEcosystemTransactions)(this.chain, this.address);
                for (const tx of transactions) {
                    if (tx.to &&
                        tx.to.toLowerCase() === this.address.toLowerCase() &&
                        Number(tx.timestamp) > startTime &&
                        Number(tx.status) === 1) {
                        consecutiveErrors = 0; // Reset error counter on success
                        try {
                            console_1.logger.success("EVM_DEPOSIT", `Found native deposit for ${this.chain}: ${tx.hash}`);
                            const txDetails = await (0, DepositUtils_1.createTransactionDetails)("NATIVE", this.wallet.id, tx, this.address, this.chain, decimals, feeDecimals, "DEPOSIT");
                            await (0, deposit_1.storeAndBroadcastTransaction)(txDetails, tx.hash);
                            console_1.logger.success("EVM_DEPOSIT", `Native deposit ${tx.hash} processed successfully - stopping monitor`);
                            // Mark deposit as found and stop monitoring
                            depositFound = true;
                            this.stopPolling();
                            return; // Exit immediately
                        }
                        catch (error) {
                            console_1.logger.error("EVM_DEPOSIT", `Error processing native transaction ${tx.hash}: ${error.message}`);
                            // Don't mark as depositFound if processing failed - will retry on next poll
                        }
                        startTime = Math.floor(Date.now() / 1000);
                        break;
                    }
                }
                consecutiveErrors = 0; // Reset on successful API call
            }
            catch (error) {
                consecutiveErrors++;
                // Log error details for debugging
                console_1.logger.error("EVM_DEPOSIT", `${this.chain} Error fetching transactions (attempt ${consecutiveErrors}/${MAX_CONSECUTIVE_ERRORS})`);
                console_1.logger.error("EVM_DEPOSIT", `${this.chain} Error message: ${error.message}`);
                // Log full error for first few attempts
                if (consecutiveErrors <= 3) {
                    console_1.logger.debug("EVM_DEPOSIT", `${this.chain} Full error: ${JSON.stringify(error)}`);
                }
                if (consecutiveErrors >= MAX_CONSECUTIVE_ERRORS) {
                    console_1.logger.error("EVM_DEPOSIT", `${this.chain} Max consecutive errors (${MAX_CONSECUTIVE_ERRORS}) reached, stopping monitor`);
                    this.stopPolling();
                    return;
                }
            }
        };
        // Initial verification
        await verifyDeposits();
        // Set up periodic checking with exponential backoff on errors
        const getInterval = () => {
            if (consecutiveErrors === 0) {
                return 10000; // 10 seconds when no errors
            }
            // Exponential backoff: 10s, 20s, 40s, 60s (max)
            const backoffMs = Math.min(10000 * Math.pow(2, consecutiveErrors - 1), 60000);
            console_1.logger.debug("EVM_DEPOSIT", `${this.chain} Next poll in ${backoffMs / 1000}s (${consecutiveErrors} consecutive errors)`);
            return backoffMs;
        };
        const scheduleNext = () => {
            if (this.active && !depositFound) {
                this.intervalId = setTimeout(async () => {
                    await verifyDeposits();
                    scheduleNext();
                }, getInterval());
            }
            else if (depositFound) {
                console_1.logger.info("EVM_DEPOSIT", `Native deposit found for ${this.chain}, stopping monitoring`);
            }
        };
        scheduleNext();
    }
    async watchTokenDeposits(provider, feeDecimals) {
        try {
            const token = await (0, tokens_1.getEcosystemToken)(this.chain, this.currency);
            if (!token) {
                console_1.logger.error("EVM_DEPOSIT", `Token ${this.currency} not found for chain ${this.chain}`);
                return;
            }
            const decimals = token.decimals;
            console_1.logger.info("EVM_DEPOSIT", `Starting token deposit monitoring for ${this.currency} on ${this.chain} at address ${this.address}`);
            const filter = {
                address: token.contract,
                topics: [
                    ethers_1.ethers.id("Transfer(address,address,uint256)"),
                    null,
                    this.address ? ethers_1.ethers.zeroPadValue(this.address, 32) : undefined,
                ],
            };
            // Store the filter for later cleanup
            this.eventFilter = filter;
            // Enhanced event listener with better error handling
            this.eventListener = async (log) => {
                if (!this.active) {
                    console_1.logger.debug("EVM_DEPOSIT", `Monitor inactive, ignoring event for ${this.chain}`);
                    return;
                }
                try {
                    console_1.logger.info("EVM_DEPOSIT", `Token transfer event detected for ${this.currency} on ${this.chain}: ${log.transactionHash}`);
                    const success = await (0, DepositUtils_1.processTransaction)(this.contractType === "NO_PERMIT" ? "NO_PERMIT" : "PERMIT", log.transactionHash, provider, this.address, this.chain, decimals, feeDecimals, this.wallet.id);
                    if (success) {
                        console_1.logger.success("EVM_DEPOSIT", `Token deposit ${log.transactionHash} processed successfully`);
                        // Enhanced cleanup - different timeout based on contract type
                        const cleanupTimeout = this.contractType === "NO_PERMIT"
                            ? 5 * 60 * 1000 // 5 minutes for NO_PERMIT
                            : 30 * 60 * 1000; // 30 minutes for PERMIT
                        setTimeout(() => {
                            this.stopEventListener();
                            console_1.logger.info("EVM_DEPOSIT", `Token deposit monitoring stopped after ${cleanupTimeout / 1000}s for ${this.chain}`);
                        }, cleanupTimeout);
                    }
                }
                catch (error) {
                    console_1.logger.error("EVM_DEPOSIT", `Error in token deposit handler for ${this.chain}: ${error.message}`);
                }
            };
            // Enhanced provider event handling with reconnection logic
            provider.on(filter, this.eventListener);
            provider.on("error", (error) => {
                console_1.logger.error("EVM_DEPOSIT", `Provider error for ${this.chain}: ${error.message}`);
                // Attempt reconnection for WebSocket providers
                if (provider.websocket) {
                    console_1.logger.info("EVM_DEPOSIT", `Attempting to reconnect WebSocket provider for ${this.chain}`);
                    setTimeout(async () => {
                        try {
                            const newProvider = await (0, ProviderManager_1.initializeWebSocketProvider)(this.chain);
                            if (newProvider && this.active) {
                                provider.removeAllListeners();
                                await this.watchTokenDeposits(newProvider, feeDecimals);
                            }
                        }
                        catch (reconnectError) {
                            console_1.logger.error("EVM_DEPOSIT", `Failed to reconnect provider for ${this.chain}: ${reconnectError.message}`);
                        }
                    }, 5000);
                }
            });
            // Add connection monitoring
            if (provider.websocket) {
                provider.websocket.on("close", () => {
                    console_1.logger.warn("EVM_DEPOSIT", `WebSocket connection closed for ${this.chain}`);
                });
                provider.websocket.on("open", () => {
                    console_1.logger.info("EVM_DEPOSIT", `WebSocket connection opened for ${this.chain}`);
                });
            }
        }
        catch (error) {
            console_1.logger.error("EVM_DEPOSIT", `Error setting up token deposit monitoring for ${this.chain}: ${error.message}`);
            this.active = false;
        }
    }
    stopEventListener() {
        if (this.eventListener && this.eventFilter) {
            const provider = ProviderManager_1.chainProviders.get(this.chain);
            if (provider) {
                try {
                    provider.off(this.eventFilter, this.eventListener);
                    console_1.logger.debug("EVM_DEPOSIT", `Event listener removed for ${this.chain}`);
                }
                catch (error) {
                    console_1.logger.error("EVM_DEPOSIT", `Error removing event listener for ${this.chain}: ${error.message}`);
                }
            }
            this.eventListener = null;
            this.eventFilter = null;
        }
    }
    stopPolling() {
        console_1.logger.info("EVM_DEPOSIT", `Stopping EVM deposit monitoring for ${this.chain}`);
        this.active = false;
        if (this.intervalId) {
            clearTimeout(this.intervalId);
            this.intervalId = undefined;
        }
        this.stopEventListener();
        console_1.logger.success("EVM_DEPOSIT", `EVM deposit monitoring stopped for ${this.chain}`);
    }
}
exports.EVMDeposits = EVMDeposits;
