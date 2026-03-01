"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const db_1 = require("@b/db");
const safe_imports_1 = require("@b/utils/safe-imports");
const notifications_1 = require("@b/utils/notifications");
const console_1 = require("@b/utils/console");
const error_1 = require("@b/utils/error");
// BTC_NODE can be: "node" (local Bitcoin Core), "mempool" (free API), "blockcypher" (requires token)
// Default to "mempool" as it's free and doesn't require configuration
const BTC_NODE = (process.env.BTC_NODE || "mempool").toLowerCase();
const BLOCKCYPHER_TOKEN = process.env.BLOCKCYPHER_TOKEN;
const SCAN_INTERVAL = 60000; // 60 seconds
const REQUIRED_CONFIRMATIONS = 3;
class BTCDepositScanner {
    constructor() {
        this.isScanning = false;
        this.processedTransactions = new Map();
        this.provider = null;
        this.providerType = null;
        this.scanInterval = null;
        this.ecosystemWalletUtils = null;
        // Track initialization state to avoid repeated failed attempts
        this.initializationFailed = false;
        this.isInitialized = false;
    }
    static getInstance() {
        if (!BTCDepositScanner.instance) {
            BTCDepositScanner.instance = new BTCDepositScanner();
        }
        return BTCDepositScanner.instance;
    }
    /**
     * Try to initialize a provider with fallback chain based on BTC_NODE setting:
     * - If BTC_NODE=node: node → mempool → blockcypher (if token) → fail
     * - If BTC_NODE=mempool: mempool → blockcypher (if token) → fail
     * - If BTC_NODE=blockcypher: blockcypher → mempool → fail
     */
    async initializeProviderWithFallback() {
        const fallbackChain = [];
        // Build fallback chain based on config
        switch (BTC_NODE) {
            case "node":
                // Try local node first, then mempool, then blockcypher
                fallbackChain.push("node");
                fallbackChain.push("mempool");
                if (BLOCKCYPHER_TOKEN) {
                    fallbackChain.push("blockcypher");
                }
                break;
            case "blockcypher":
                // Try blockcypher first (if token exists), then mempool
                if (BLOCKCYPHER_TOKEN) {
                    fallbackChain.push("blockcypher");
                }
                fallbackChain.push("mempool");
                break;
            case "mempool":
            default:
                // Default: try mempool first, then blockcypher if token exists
                fallbackChain.push("mempool");
                if (BLOCKCYPHER_TOKEN) {
                    fallbackChain.push("blockcypher");
                }
                break;
        }
        for (const providerType of fallbackChain) {
            try {
                const success = await this.tryInitializeProvider(providerType);
                if (success) {
                    this.providerType = providerType;
                    return true;
                }
            }
            catch (error) {
                // Continue to next provider
                console_1.logger.groupItem("BTC_SCAN", `${providerType} failed: ${error instanceof Error ? error.message : error}`, "error");
            }
        }
        return false;
    }
    /**
     * Try to initialize a specific provider type
     */
    async tryInitializeProvider(type) {
        switch (type) {
            case "node": {
                console_1.logger.groupItem("BTC_SCAN", "Trying local Bitcoin Core node...");
                const BitcoinNodeService = await (0, safe_imports_1.getBitcoinNodeService)();
                if (!(0, safe_imports_1.isServiceAvailable)(BitcoinNodeService)) {
                    throw (0, error_1.createError)({ statusCode: 500, message: "Bitcoin Node service not available" });
                }
                console_1.logger.groupItem("BTC_SCAN", "Initializing BTC Core RPC connection");
                this.provider = await BitcoinNodeService.getInstance();
                // Check if node is synced
                const isSynced = await this.provider.isSynced();
                if (!isSynced) {
                    const progress = await this.provider.getSyncProgress();
                    console_1.logger.groupItem("BTC_SCAN", `Node syncing: ${progress.blocks}/${progress.headers} (${progress.progress.toFixed(1)}%)`, "warn");
                }
                console_1.logger.groupItem("BTC_SCAN", "Local node connected", "success");
                return true;
            }
            case "mempool": {
                console_1.logger.groupItem("BTC_SCAN", "Trying Mempool.space API...");
                const MempoolProvider = await (0, safe_imports_1.getMempoolProviderClass)();
                if (!(0, safe_imports_1.isServiceAvailable)(MempoolProvider)) {
                    throw (0, error_1.createError)({ statusCode: 500, message: "Mempool provider not available" });
                }
                const mempoolProvider = new MempoolProvider("BTC");
                // Test connectivity
                const isAvailable = await mempoolProvider.isAvailable();
                if (!isAvailable) {
                    throw (0, error_1.createError)({ statusCode: 500, message: "Mempool.space API not reachable" });
                }
                this.provider = mempoolProvider;
                console_1.logger.groupItem("BTC_SCAN", "Mempool.space connected", "success");
                return true;
            }
            case "blockcypher": {
                if (!BLOCKCYPHER_TOKEN) {
                    throw (0, error_1.createError)({ statusCode: 500, message: "BLOCKCYPHER_TOKEN not configured" });
                }
                console_1.logger.groupItem("BTC_SCAN", "Trying BlockCypher API...");
                const BlockCypherProvider = await (0, safe_imports_1.getBlockCypherProviderClass)();
                if (!(0, safe_imports_1.isServiceAvailable)(BlockCypherProvider)) {
                    throw (0, error_1.createError)({ statusCode: 500, message: "BlockCypher provider not available" });
                }
                const blockcypherProvider = new BlockCypherProvider("BTC");
                // Test connectivity
                const isAvailable = await blockcypherProvider.isAvailable();
                if (!isAvailable) {
                    throw (0, error_1.createError)({ statusCode: 500, message: "BlockCypher API not reachable" });
                }
                this.provider = blockcypherProvider;
                console_1.logger.groupItem("BTC_SCAN", "BlockCypher connected", "success");
                return true;
            }
            default:
                return false;
        }
    }
    async start() {
        // Skip if already initialized or if initialization previously failed
        if (this.isInitialized) {
            return; // Already running, nothing to do
        }
        if (this.initializationFailed) {
            return; // Previous initialization failed, don't retry (restart server to retry)
        }
        // Check if ecosystem is available
        this.ecosystemWalletUtils = await (0, safe_imports_1.getEcosystemWalletUtils)();
        if (!(0, safe_imports_1.isServiceAvailable)(this.ecosystemWalletUtils)) {
            return; // Ecosystem not available, skip silently
        }
        // Use buffered group logging instead of live task to avoid conflicts with other startup tasks
        // This ensures atomic output that doesn't interleave with other logs
        console_1.logger.group("BTC_SCAN", "Starting Bitcoin deposit scanner...");
        // Register child modules so their logs appear in this group
        console_1.logger.registerGroupAlias("BTC_NODE", "BTC_SCAN");
        console_1.logger.registerGroupAlias("BTC_NODE_PROVIDER", "BTC_SCAN");
        try {
            // Try to initialize a provider with fallback
            const providerInitialized = await this.initializeProviderWithFallback();
            if (!providerInitialized) {
                throw (0, error_1.createError)({ statusCode: 500, message: "All providers failed - no BTC scanning available" });
            }
            // For node provider, import addresses
            if (this.providerType === "node") {
                await this.importAllAddresses();
            }
            // Start periodic scanning
            this.startPeriodicScan();
            this.isInitialized = true;
            console_1.logger.groupEnd("BTC_SCAN", `Scanner started using ${this.providerType}`, true);
        }
        catch (error) {
            // Mark as failed so we don't keep retrying every cron cycle
            this.initializationFailed = true;
            console_1.logger.groupEnd("BTC_SCAN", `Failed: ${error instanceof Error ? error.message : error}`, false);
            // Show helpful message about configuration
            if (BTC_NODE === "node") {
                console_1.logger.warn("BTC_SCAN", "Tip: Ensure Bitcoin Core is running or set BTC_NODE=mempool in .env");
            }
            else {
                console_1.logger.warn("BTC_SCAN", "Tip: Check your internet connection or try a different BTC_NODE provider");
            }
            // Don't throw - just log and stop retrying
        }
        finally {
            // Unregister aliases after group is done
            console_1.logger.unregisterGroupAlias("BTC_NODE");
            console_1.logger.unregisterGroupAlias("BTC_NODE_PROVIDER");
        }
    }
    stop() {
        if (this.scanInterval) {
            clearInterval(this.scanInterval);
            this.scanInterval = null;
        }
        if (this.isInitialized) {
            console_1.logger.info("BTC_SCAN", "Bitcoin deposit scanner stopped");
        }
        this.isInitialized = false;
    }
    async importAllAddresses() {
        var _a, _b;
        if (this.providerType !== "node" || !((_a = this.provider) === null || _a === void 0 ? void 0 : _a.importAddress)) {
            return; // Only needed for local node
        }
        try {
            console_1.logger.groupItem("BTC_SCAN", "Importing wallet addresses to node...");
            const wallets = await db_1.models.wallet.findAll({
                where: {
                    type: "ECO",
                    currency: "BTC",
                },
            });
            console_1.logger.groupItem("BTC_SCAN", `Found ${wallets.length} BTC wallets`);
            let imported = 0;
            for (const wallet of wallets) {
                try {
                    if (!wallet.address)
                        continue;
                    const addresses = typeof wallet.address === "string"
                        ? JSON.parse(wallet.address)
                        : wallet.address;
                    const btcAddress = (_b = addresses === null || addresses === void 0 ? void 0 : addresses.BTC) === null || _b === void 0 ? void 0 : _b.address;
                    if (!btcAddress)
                        continue;
                    await this.provider.importAddress(btcAddress, `wallet_${wallet.id}_user_${wallet.userId}`);
                    imported++;
                    // Small delay to avoid overwhelming the node
                    await this.delay(100);
                }
                catch (error) {
                    // Silent - address might already be imported
                }
            }
            if (imported > 0) {
                console_1.logger.groupItem("BTC_SCAN", `Imported ${imported} addresses`, "success");
            }
        }
        catch (error) {
            console_1.logger.groupItem("BTC_SCAN", `Address import failed: ${error instanceof Error ? error.message : error}`, "warn");
            // Non-fatal, continue
        }
    }
    startPeriodicScan() {
        this.scanInterval = setInterval(async () => {
            await this.scanAllWallets();
        }, SCAN_INTERVAL);
        // Run first scan immediately
        setImmediate(() => this.scanAllWallets());
    }
    async scanAllWallets() {
        if (this.isScanning || !this.provider) {
            return;
        }
        // For node provider, check if synced
        if (this.providerType === "node" && this.provider.isSynced) {
            const isSynced = await this.provider.isSynced();
            if (!isSynced) {
                return; // Skip until synced
            }
        }
        this.isScanning = true;
        try {
            const wallets = await db_1.models.wallet.findAll({
                where: {
                    type: "ECO",
                    currency: "BTC",
                },
            });
            let newDepositsFound = 0;
            let pendingDeposits = 0;
            for (const wallet of wallets) {
                try {
                    const result = await this.scanWalletForDeposits(wallet);
                    newDepositsFound += result.newDeposits;
                    pendingDeposits += result.pendingDeposits;
                }
                catch (error) {
                    console_1.logger.error("BTC_SCAN", `Error scanning wallet ${wallet.id}`, error);
                }
            }
            if (newDepositsFound > 0 || pendingDeposits > 0) {
                console_1.logger.info("BTC_SCAN", `Scan completed: ${newDepositsFound} new, ${pendingDeposits} pending`);
            }
        }
        catch (error) {
            console_1.logger.error("BTC_SCAN", "Error in scan cycle", error);
        }
        finally {
            this.isScanning = false;
        }
    }
    async scanWalletForDeposits(wallet) {
        var _a;
        try {
            if (!wallet.address) {
                return { newDeposits: 0, pendingDeposits: 0 };
            }
            const addresses = typeof wallet.address === "string"
                ? JSON.parse(wallet.address)
                : wallet.address;
            const btcAddress = (_a = addresses === null || addresses === void 0 ? void 0 : addresses.BTC) === null || _a === void 0 ? void 0 : _a.address;
            if (!btcAddress) {
                return { newDeposits: 0, pendingDeposits: 0 };
            }
            // Get transactions based on provider type
            let transactions = [];
            if (this.providerType === "node") {
                transactions = await this.provider.getAddressTransactions(btcAddress);
            }
            else {
                // For API providers, use fetchTransactions
                transactions = await this.provider.fetchTransactions(btcAddress);
            }
            let newDeposits = 0;
            let pendingDeposits = 0;
            for (const tx of transactions) {
                // Normalize transaction format
                const txid = tx.txid || tx.hash;
                const confirmations = tx.confirmations || 0;
                const category = tx.category || (tx.value > 0 ? "receive" : "send");
                // Only process incoming transactions
                if (category !== "receive" && tx.value <= 0)
                    continue;
                const txKey = `${txid}-${wallet.id}`;
                // Check if already processed
                const existingTx = await db_1.models.transaction.findOne({
                    where: {
                        trxId: txid,
                        walletId: wallet.id,
                        type: "DEPOSIT",
                    },
                });
                if (existingTx && existingTx.status === "COMPLETED") {
                    this.processedTransactions.set(txKey, {
                        txid,
                        walletId: wallet.id,
                        lastChecked: Date.now(),
                    });
                    continue;
                }
                if (confirmations >= REQUIRED_CONFIRMATIONS) {
                    // Process confirmed deposit
                    console_1.logger.info("BTC_SCAN", `Processing deposit: ${txid} (${confirmations} conf)`);
                    await this.processDeposit(wallet, tx, btcAddress);
                    newDeposits++;
                    this.processedTransactions.set(txKey, {
                        txid,
                        walletId: wallet.id,
                        lastChecked: Date.now(),
                    });
                }
                else if (confirmations > 0) {
                    pendingDeposits++;
                }
            }
            return { newDeposits, pendingDeposits };
        }
        catch (error) {
            console_1.logger.error("BTC_SCAN", `Error scanning wallet ${wallet.id}`, error);
            return { newDeposits: 0, pendingDeposits: 0 };
        }
    }
    async processDeposit(wallet, tx, address) {
        try {
            const txid = tx.txid || tx.hash;
            const amount = tx.amount || (tx.value / 100000000); // Convert satoshis if needed
            const fee = tx.fee || 0;
            const txData = {
                id: wallet.id,
                chain: "BTC",
                hash: txid,
                type: "DEPOSIT",
                from: "N/A",
                to: address,
                amount: amount.toString(),
                fee: fee.toString(),
                status: "CONFIRMED",
                timestamp: tx.time || tx.confirmedTime || Math.floor(Date.now() / 1000),
                inputs: tx.vin || tx.inputs || [],
                outputs: tx.vout || tx.outputs || [],
            };
            console_1.logger.info("BTC_SCAN", `Creating deposit: ${amount} BTC`);
            const result = await this.ecosystemWalletUtils.handleEcosystemDeposit(txData);
            if (result.transaction) {
                console_1.logger.success("BTC_SCAN", `Deposit processed: ${result.transaction.id}`);
                // Send notification to user
                try {
                    await (0, notifications_1.createNotification)({
                        userId: wallet.userId,
                        relatedId: result.transaction.id,
                        title: "Deposit Confirmed",
                        message: `Your deposit of ${amount} BTC has been confirmed.`,
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
                }
                catch (notifError) {
                    console_1.logger.error("BTC_SCAN", "Failed to send notification", notifError);
                }
            }
        }
        catch (error) {
            const txid = tx.txid || tx.hash;
            console_1.logger.error("BTC_SCAN", `Failed to process deposit ${txid}`, error);
            throw error;
        }
    }
    delay(ms) {
        return new Promise((resolve) => setTimeout(resolve, ms));
    }
}
exports.default = BTCDepositScanner;
