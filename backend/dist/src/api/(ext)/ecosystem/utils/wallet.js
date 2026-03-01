"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.updateAlternativeWallet = exports.refundUser = exports.decrementWalletBalance = exports.handleEcosystemDeposit = exports.executeNativeWithdrawal = exports.executePermit = exports.executeNoPermitWithdrawal = exports.executeEcosystemWithdrawal = exports.initializeContracts = exports.getEcosystemTokenOwner = exports.validateEcosystemBalances = exports.validateAddress = exports.generateAndAddAddresses = exports.storeWallet = exports.walletResponseAttributes = void 0;
exports.checkBlockchainExtensions = checkBlockchainExtensions;
exports.getActiveTokensByCurrency = getActiveTokensByCurrency;
exports.getWalletByUserIdAndCurrency = getWalletByUserIdAndCurrency;
exports.getMasterWalletByChain = getMasterWalletByChain;
exports.getMasterWalletByChainFull = getMasterWalletByChainFull;
exports.checkEcosystemAvailableFunds = checkEcosystemAvailableFunds;
exports.getGasPayer = getGasPayer;
exports.getAndValidateTokenOwner = getAndValidateTokenOwner;
exports.getAndValidateNativeTokenOwner = getAndValidateNativeTokenOwner;
exports.getWalletData = getWalletData;
exports.findAlternativeWalletData = findAlternativeWalletData;
exports.getEcosystemPendingTransactions = getEcosystemPendingTransactions;
exports.updatePrivateLedger = updatePrivateLedger;
exports.createPendingTransaction = createPendingTransaction;
exports.updateWalletBalance = updateWalletBalance;
exports.updateWalletForFill = updateWalletForFill;
const db_1 = require("@b/db");
const error_1 = require("@b/utils/error");
const encrypt_1 = require("@b/utils/encrypt");
const safe_imports_1 = require("@b/utils/safe-imports");
const ethers_1 = require("ethers");
const tonweb_1 = __importDefault(require("tonweb"));
const blockchain_1 = require("./blockchain");
const gas_1 = require("./gas");
const tokens_1 = require("./tokens");
const smartContract_1 = require("./smartContract");
const chains_1 = require("./chains");
const sequelize_1 = require("sequelize");
const custodialWallet_1 = require("./custodialWallet");
const console_1 = require("@b/utils/console");
const wallet_1 = require("@b/services/wallet");
async function checkBlockchainExtensions() {
    const solanaService = await (0, safe_imports_1.getSolanaService)();
    const tronService = await (0, safe_imports_1.getTronService)();
    const moneroService = await (0, safe_imports_1.getMoneroService)();
    const tonService = await (0, safe_imports_1.getTonService)();
    return {
        solana: (0, safe_imports_1.isServiceAvailable)(solanaService),
        tron: (0, safe_imports_1.isServiceAvailable)(tronService),
        monero: (0, safe_imports_1.isServiceAvailable)(moneroService),
        ton: (0, safe_imports_1.isServiceAvailable)(tonService),
    };
}
exports.walletResponseAttributes = [
    "id",
    "currency",
    "chain",
    "address",
    "status",
    "balance",
];
const web3_js_1 = require("@solana/web3.js");
const utxo_1 = require("./utxo");
async function getActiveTokensByCurrency(currency) {
    const tokens = await db_1.models.ecosystemToken.findAll({
        where: { currency, status: true },
    });
    const filteredTokens = tokens.filter((token) => {
        // Special handling for chains with dedicated services or UTXO chains - always allow
        const specialChains = ['XMR', 'TON', 'SOL', 'TRON', 'BTC', 'LTC', 'DOGE', 'DASH'];
        if (specialChains.includes(token.chain)) {
            return true; // These chains have dedicated services/UTXO handling and don't require network env var matching
        }
        const chainEnvVar = `${token.chain.toUpperCase()}_NETWORK`;
        const expectedNetwork = process.env[chainEnvVar];
        // If no environment variable is set, skip this token
        if (!expectedNetwork) {
            return false;
        }
        // Flexible network matching
        if (token.network === expectedNetwork) {
            return true;
        }
        // Handle common network name variations
        const networkMappings = {
            'BSC': 'mainnet',
            'ETH': 'mainnet',
            'POLYGON': 'mainnet',
            'ARBITRUM': 'mainnet',
            'OPTIMISM': 'mainnet',
            'AVALANCHE': 'mainnet',
            'FANTOM': 'mainnet'
        };
        // Check if token network matches chain name and expected is mainnet
        if (token.network === token.chain && expectedNetwork === 'mainnet') {
            return true;
        }
        // Check reverse mapping
        if (networkMappings[token.chain] === token.network && expectedNetwork === 'mainnet') {
            return true;
        }
        return false;
    });
    if (filteredTokens.length === 0) {
        throw (0, error_1.createError)({
            statusCode: 500,
            message: "No enabled tokens found for this currency",
        });
    }
    return filteredTokens;
}
async function getWalletByUserIdAndCurrency(userId, currency, type = "ECO", // Default to ECO for backward compatibility
transaction, lock // Whether to lock the row when using transaction
) {
    // Step 1: Fetch the wallet for the specified user and currency.
    let wallet = await db_1.models.wallet.findOne({
        where: {
            userId,
            currency,
            type, // Use provided type parameter
        },
        attributes: ["id", "type", "currency", "balance", "inOrder", "address"],
        ...(transaction && { transaction }),
        ...(transaction && lock && { lock: transaction.LOCK.UPDATE }),
    });
    // Step 2: For COPY_TRADING wallets, return immediately (no address generation needed)
    // CT wallets are internal-only and don't need blockchain addresses
    if (type === "COPY_TRADING") {
        return wallet; // Can be null - caller will create if needed
    }
    // Step 3: If no ECO wallet is found, generate a new wallet with addresses
    if (!wallet) {
        wallet = await (0, exports.storeWallet)({ id: userId }, currency);
    }
    // Step 4: If wallet is still not found after attempting creation, throw an error.
    if (!wallet) {
        throw (0, error_1.createError)(404, "Wallet not found");
    }
    // Step 4: Retrieve active tokens for the currency.
    const tokens = await getActiveTokensByCurrency(currency);
    // Step 5: Check if the wallet's address is empty or if it has incomplete addresses.
    let addresses = {};
    try {
        if (wallet.address) {
            if (typeof wallet.address === "string") {
                addresses = JSON.parse(wallet.address);
            }
            else {
                addresses = wallet.address;
            }
            if (typeof addresses === "string") {
                addresses = JSON.parse(addresses);
            }
        }
    }
    catch (error) {
        console_1.logger.error("WALLET", `Failed to parse wallet address for wallet ${wallet.id}: ${error.message}`);
        console_1.logger.debug("WALLET", `Raw address value: ${wallet.address}`);
        // Try to repair common JSON errors
        if (typeof wallet.address === "string") {
            try {
                // Fix missing colons (e.g., "balance"0.123 -> "balance":0.123)
                const repairedAddress = wallet.address.replace(/"(\w+)"(\d+\.?\d*)/g, '"$1":$2');
                addresses = JSON.parse(repairedAddress);
                console_1.logger.success("WALLET", `Repaired corrupted wallet address JSON for wallet ${wallet.id}`);
                // Save the repaired address back to database
                await db_1.models.wallet.update({ address: JSON.stringify(addresses) }, { where: { id: wallet.id } });
            }
            catch (repairError) {
                console_1.logger.error("WALLET", `Failed to repair wallet address: ${repairError.message}`);
                // Reset to empty addresses object
                addresses = {};
            }
        }
    }
    if (!addresses ||
        (addresses && Object.keys(addresses).length < tokens.length)) {
        const tokensWithoutAddress = tokens.filter((token) => !addresses || !addresses.hasOwnProperty(token.chain));
        // Generate and add missing addresses to the wallet.
        if (tokensWithoutAddress.length > 0) {
            await db_1.sequelize.transaction(async (transaction) => {
                await (0, exports.generateAndAddAddresses)(wallet, tokensWithoutAddress, transaction);
            });
        }
        // Fetch and return the updated wallet after generating missing addresses.
        const updatedWallet = await db_1.models.wallet.findOne({
            where: { id: wallet.id },
            attributes: ["id", "type", "currency", "balance", "inOrder", "address"],
        });
        if (!updatedWallet) {
            throw (0, error_1.createError)(500, "Failed to update wallet with new addresses");
        }
        return updatedWallet;
    }
    return wallet;
}
const storeWallet = async (user, currency) => {
    const tokens = await getActiveTokensByCurrency(currency);
    if (!tokens.length) {
        handleError("No enabled tokens found for this currency");
    }
    try {
        (0, encrypt_1.encrypt)("test");
    }
    catch (error) {
        handleError("Encryption key is not set");
    }
    return await db_1.sequelize.transaction(async (transaction) => {
        // Use walletCreationService for consistent wallet creation
        // This will find existing wallet or create a new one
        const walletResult = await wallet_1.walletCreationService.getOrCreateWallet(user.id, "ECO", currency, transaction);
        const wallet = walletResult.wallet;
        // Check if wallet already has addresses
        let addresses = wallet.address
            ? typeof wallet.address === "string"
                ? JSON.parse(wallet.address)
                : wallet.address
            : {};
        if (typeof addresses === "string") {
            addresses = JSON.parse(addresses);
        }
        // If wallet exists with addresses, return it
        if (addresses && Object.keys(addresses).length > 0) {
            // Return fresh wallet from DB to get Sequelize model instance
            return await db_1.models.wallet.findByPk(wallet.id, { transaction });
        }
        // Get the wallet as a Sequelize model for address generation
        const walletModel = await db_1.models.wallet.findByPk(wallet.id, { transaction });
        if (!walletModel) {
            throw (0, error_1.createError)({ statusCode: 500, message: "Failed to retrieve wallet for address generation" });
        }
        // Generate and add addresses for ECO wallet
        return await (0, exports.generateAndAddAddresses)(walletModel, tokens, transaction);
    });
};
exports.storeWallet = storeWallet;
const generateAndAddAddresses = async (wallet, tokens, transaction) => {
    let addresses = wallet.address
        ? typeof wallet.address === "string"
            ? JSON.parse(wallet.address)
            : wallet.address
        : {};
    if (typeof addresses === "string") {
        addresses = JSON.parse(addresses);
    }
    for (const token of tokens) {
        try {
            switch (token.contractType) {
                case "PERMIT":
                    if (token.chain === "SOL") {
                        await handleSolanaWallet(wallet, addresses, transaction);
                    }
                    else {
                        await handlePermitContract(token, wallet, addresses, transaction);
                    }
                    break;
                case "NO_PERMIT":
                    await handleNoPermitContract(token, wallet, addresses);
                    break;
                case "NATIVE":
                    if (token.chain === "SOL") {
                        await handleSolanaNativeWallet(wallet, addresses, transaction);
                    }
                    else if (token.chain === "TRON") {
                        await handleTronNativeWallet(wallet, addresses, transaction);
                    }
                    else if (token.chain === "XMR") {
                        await handleMoneroNativeWallet(wallet, addresses, transaction);
                    }
                    else if (token.chain === "TON") {
                        await handleTonNativeWallet(wallet, addresses, transaction);
                    }
                    else {
                        await handleNativeContract(token, wallet, addresses, transaction);
                    }
                    break;
                default:
                    handleError(`Unknown contract type for token ${token.name}`, false);
            }
        }
        catch (error) {
            handleError(`Failed to generate address for token ${token.name}: ${error.message}`, false);
        }
    }
    if (Object.keys(addresses).length === 0) {
        handleError("Failed to generate any addresses for the wallet");
    }
    // Update the wallet with the new addresses
    await db_1.models.wallet.update({ address: JSON.stringify(addresses) }, {
        where: { id: wallet.id },
        transaction,
    });
    const updatedWallet = await db_1.models.wallet.findOne({
        where: { id: wallet.id },
        transaction,
    });
    if (!updatedWallet) {
        handleError("Failed to update wallet with new addresses");
    }
    return updatedWallet;
};
exports.generateAndAddAddresses = generateAndAddAddresses;
const handleNativeContract = async (token, newWallet, addresses, transaction) => {
    let encryptedWalletData;
    if (["BTC", "LTC", "DOGE", "DASH"].includes(token.chain)) {
        const wallet = (0, utxo_1.createUTXOWallet)(token.chain);
        addresses[token.chain] = {
            address: wallet.address,
            network: token.network,
            balance: 0,
        };
        encryptedWalletData = (0, encrypt_1.encrypt)(JSON.stringify(wallet.data));
    }
    else {
        const wallet = ethers_1.ethers.Wallet.createRandom();
        if (!wallet.mnemonic)
            throw (0, error_1.createError)({ statusCode: 500, message: "Mnemonic not found" });
        const hdNode = ethers_1.ethers.HDNodeWallet.fromPhrase(wallet.mnemonic.phrase);
        addresses[token.chain] = {
            address: hdNode.address,
            network: token.network,
            balance: 0,
        };
        if (!hdNode.mnemonic)
            throw (0, error_1.createError)({ statusCode: 500, message: "Mnemonic not found" });
        encryptedWalletData = (0, encrypt_1.encrypt)(JSON.stringify({
            mnemonic: hdNode.mnemonic.phrase,
            publicKey: hdNode.publicKey,
            privateKey: hdNode.privateKey,
            xprv: hdNode.extendedKey,
            xpub: hdNode.neuter().extendedKey,
            chainCode: hdNode.chainCode,
            path: hdNode.path,
        }));
    }
    const walletData = await db_1.models.walletData.findOne({
        where: {
            walletId: newWallet.id,
            currency: token.currency,
            chain: token.chain,
        },
        transaction,
    });
    if (walletData) {
        // Update the existing record
        await walletData.update({
            balance: 0, // Update this as per your logic
            index: 0,
            data: encryptedWalletData,
        }, transaction);
    }
    else {
        // Create a new record
        await db_1.models.walletData.create({
            walletId: newWallet.id,
            currency: token.currency,
            chain: token.chain,
            balance: 0,
            index: 0,
            data: encryptedWalletData,
        }, { transaction });
    }
};
const handleSolanaNativeWallet = async (wallet, addresses, transaction) => {
    const SolanaService = await (0, safe_imports_1.getSolanaService)();
    if (!SolanaService) {
        throw (0, error_1.createError)({ statusCode: 500, message: "Solana service not available" });
    }
    const solanaService = await SolanaService.getInstance();
    const { address, data } = solanaService.createWallet();
    addresses["SOL"] = {
        address,
        network: process.env.SOLANA_NETWORK || "mainnet",
        balance: 0,
    };
    const encryptedWalletData = (0, encrypt_1.encrypt)(JSON.stringify(data));
    const walletData = await db_1.models.walletData.findOne({
        where: {
            walletId: wallet.id,
            currency: "SOL",
            chain: "SOL",
        },
        transaction,
    });
    if (walletData) {
        // Update the existing record
        await walletData.update({
            balance: 0,
            data: encryptedWalletData,
        }, { transaction });
    }
    else {
        // Create a new record
        await db_1.models.walletData.create({
            walletId: wallet.id,
            currency: "SOL",
            chain: "SOL",
            balance: 0,
            data: encryptedWalletData,
        }, { transaction });
    }
};
const handleSolanaWallet = async (wallet, addresses, transaction) => {
    const SolanaService = await (0, safe_imports_1.getSolanaService)();
    if (!SolanaService) {
        throw (0, error_1.createError)({ statusCode: 500, message: "Solana service not available" });
    }
    const solanaService = await SolanaService.getInstance();
    const { address, data } = solanaService.createWallet();
    addresses["SOL"] = {
        address,
        network: process.env.SOLANA_NETWORK || "mainnet",
        balance: 0,
    };
    const encryptedWalletData = (0, encrypt_1.encrypt)(JSON.stringify(data));
    const walletData = await db_1.models.walletData.findOne({
        where: {
            walletId: wallet.id,
            currency: wallet.currency,
            chain: "SOL",
        },
        transaction,
    });
    if (walletData) {
        // Update the existing record
        await walletData.update({
            balance: 0,
            data: encryptedWalletData,
        }, { transaction });
    }
    else {
        // Create a new record
        await db_1.models.walletData.create({
            walletId: wallet.id,
            currency: wallet.currency,
            chain: "SOL",
            balance: 0,
            data: encryptedWalletData,
        }, { transaction });
    }
};
const handleTronNativeWallet = async (wallet, addresses, transaction) => {
    const TronService = await (0, safe_imports_1.getTronService)();
    if (!TronService) {
        throw (0, error_1.createError)({ statusCode: 500, message: "Tron service not available" });
    }
    const tronService = await TronService.getInstance();
    const { address, data } = tronService.createWallet();
    addresses["TRON"] = {
        address,
        network: process.env.TRON_NETWORK || "mainnet",
        balance: 0,
    };
    const encryptedWalletData = (0, encrypt_1.encrypt)(JSON.stringify(data));
    const walletData = await db_1.models.walletData.findOne({
        where: {
            walletId: wallet.id,
            currency: "TRX",
            chain: "TRON",
        },
        transaction,
    });
    if (walletData) {
        // Update the existing record
        await walletData.update({
            balance: 0,
            data: encryptedWalletData,
        }, { transaction });
    }
    else {
        // Create a new record
        await db_1.models.walletData.create({
            walletId: wallet.id,
            currency: "TRX",
            chain: "TRON",
            balance: 0,
            data: encryptedWalletData,
        }, { transaction });
    }
};
const handleMoneroNativeWallet = async (wallet, addresses, transaction) => {
    const MoneroService = await (0, safe_imports_1.getMoneroService)();
    if (!MoneroService) {
        throw (0, error_1.createError)({ statusCode: 500, message: "Monero service not available" });
    }
    const moneroService = await MoneroService.getInstance();
    const { address, data } = await moneroService.createWallet(wallet.id);
    addresses["XMR"] = {
        address,
        network: process.env.MONERO_NETWORK || "mainnet",
        balance: 0,
    };
    const encryptedWalletData = (0, encrypt_1.encrypt)(JSON.stringify(data));
    const walletData = await db_1.models.walletData.findOne({
        where: {
            walletId: wallet.id,
            currency: "XMR",
            chain: "XMR",
        },
        transaction,
    });
    if (walletData) {
        // Update the existing record
        await walletData.update({
            balance: 0,
            data: encryptedWalletData,
        }, { transaction });
    }
    else {
        // Create a new record
        await db_1.models.walletData.create({
            walletId: wallet.id,
            currency: "XMR",
            chain: "XMR",
            balance: 0,
            data: encryptedWalletData,
        }, { transaction });
    }
};
const handleTonNativeWallet = async (wallet, addresses, transaction) => {
    const TonService = await (0, safe_imports_1.getTonService)();
    if (!TonService) {
        throw (0, error_1.createError)({ statusCode: 500, message: "TON service not available" });
    }
    const tonService = await TonService.getInstance();
    const { address, data } = await tonService.createWallet();
    addresses["TON"] = {
        address,
        network: process.env.TON_NETWORK || "mainnet",
        balance: 0,
    };
    const encryptedWalletData = (0, encrypt_1.encrypt)(JSON.stringify(data));
    const walletData = await db_1.models.walletData.findOne({
        where: {
            walletId: wallet.id,
            currency: "TON",
            chain: "TON",
        },
        transaction,
    });
    if (walletData) {
        // Update the existing record
        await walletData.update({
            balance: 0,
            data: encryptedWalletData,
        }, { transaction });
    }
    else {
        // Create a new record
        await db_1.models.walletData.create({
            walletId: wallet.id,
            currency: "TON",
            chain: "TON",
            balance: 0,
            data: encryptedWalletData,
        }, { transaction });
    }
};
const handleError = (message, throwIt = true) => {
    console_1.logger.error("WALLET", message);
    if (throwIt) {
        throw (0, error_1.createError)({ statusCode: 500, message });
    }
};
const handlePermitContract = async (token, newWallet, addresses, transaction) => {
    // Assuming the 'token' object has properties: chain, network, contractType
    const masterWallet = await db_1.models.ecosystemMasterWallet.findOne({
        where: { chain: token.chain, status: true },
        transaction,
    });
    if (!masterWallet || !masterWallet.data) {
        console_1.logger.warn("WALLET", `Skipping chain ${token.chain} - Master wallet not found or not enabled`);
        return;
    }
    const nextIndex = masterWallet.lastIndex != null ? masterWallet.lastIndex + 1 : 1;
    await db_1.models.ecosystemMasterWallet.update({ lastIndex: nextIndex }, {
        where: { id: masterWallet.id },
        transaction,
    });
    const decryptedMasterData = JSON.parse((0, encrypt_1.decrypt)(masterWallet.data));
    const hdNode = ethers_1.ethers.HDNodeWallet.fromPhrase(decryptedMasterData.mnemonic);
    const childNode = hdNode.deriveChild(nextIndex);
    if (!childNode.address) {
        throw (0, error_1.createError)({ statusCode: 500, message: "Address failed to generate" });
    }
    addresses[token.chain] = {
        address: childNode.address,
        network: token.network,
        balance: 0,
    };
    const encryptedChildData = (0, encrypt_1.encrypt)(JSON.stringify({
        address: childNode.address,
        publicKey: childNode.publicKey,
        privateKey: childNode.privateKey,
    }));
    const walletData = await db_1.models.walletData.findOne({
        where: {
            walletId: newWallet.id,
            currency: token.currency,
            chain: token.chain,
        },
        transaction,
    });
    if (walletData) {
        // Update the existing record
        await walletData.update({
            balance: 0, // Update this as per your logic
            index: nextIndex,
            data: encryptedChildData,
        }, { transaction });
    }
    else {
        // Create a new record
        await db_1.models.walletData.create({
            walletId: newWallet.id,
            currency: token.currency,
            chain: token.chain,
            balance: 0,
            index: nextIndex,
            data: encryptedChildData,
        }, { transaction });
    }
};
const handleNoPermitContract = async (token, newWallet, addresses) => {
    addresses[token.chain] = {
        balance: 0,
    };
};
async function getMasterWalletByChain(chain) {
    try {
        return await db_1.models.ecosystemMasterWallet.findOne({
            where: { chain },
            attributes: exports.walletResponseAttributes,
        });
    }
    catch (error) {
        console_1.logger.error("WALLET", "Failed to get master wallet by chain", error);
        throw error;
    }
}
async function getMasterWalletByChainFull(chain) {
    try {
        const wallet = await db_1.models.ecosystemMasterWallet.findOne({
            where: { chain },
        });
        if (!wallet) {
            throw (0, error_1.createError)({ statusCode: 404, message: `Master wallet not found for chain: ${chain}` });
        }
        return wallet;
    }
    catch (error) {
        console_1.logger.error("WALLET", "Failed to get master wallet by chain", error);
        throw error;
    }
}
async function checkEcosystemAvailableFunds(userWallet, walletData, totalAmount) {
    try {
        console_1.logger.debug("WALLET", `Checking funds availability: walletId=${userWallet.id}, totalAmount=${totalAmount}, currentBalance=${userWallet.balance}`);
        const totalAvailable = await getTotalAvailable(userWallet, walletData);
        console_1.logger.debug("WALLET", `Total available: ${totalAvailable}`);
        if (totalAvailable < totalAmount) {
            console_1.logger.error("WALLET", `Insufficient funds: available ${totalAvailable} < required ${totalAmount}`);
            throw (0, error_1.createError)({ statusCode: 400, message: "Insufficient funds for withdrawal including fee" });
        }
        return totalAvailable;
    }
    catch (error) {
        console_1.logger.error("WALLET", "Error checking funds", error);
        if (error.statusCode === 400) {
            throw error;
        }
        throw (0, error_1.createError)({ statusCode: 500, message: "Withdrawal failed - please try again later" });
    }
}
const getTotalAvailable = async (userWallet, walletData) => {
    const pvEntry = await db_1.models.ecosystemPrivateLedger.findOne({
        where: {
            walletId: userWallet.id,
            index: walletData.index,
            currency: userWallet.currency,
            chain: walletData.chain,
        },
    });
    return userWallet.balance + (pvEntry ? pvEntry.offchainDifference : 0);
};
async function getGasPayer(chain, provider) {
    try {
        console_1.logger.debug("WALLET", `Getting gas payer for chain: ${chain}`);
        const masterWallet = await getMasterWalletByChainFull(chain);
        if (!masterWallet) {
            console_1.logger.error("WALLET", `Master wallet not found for chain: ${chain}`);
            throw (0, error_1.createError)({ statusCode: 404, message: "Master wallet not found" });
        }
        const { data } = masterWallet;
        if (!data) {
            console_1.logger.error("WALLET", `Master wallet data not found for chain: ${chain}`);
            throw (0, error_1.createError)({ statusCode: 404, message: "Master wallet data not found" });
        }
        console_1.logger.debug("WALLET", `Decrypting master wallet data`);
        const decryptedMasterData = JSON.parse((0, encrypt_1.decrypt)(data));
        return new ethers_1.ethers.Wallet(decryptedMasterData.privateKey, provider);
    }
    catch (error) {
        console_1.logger.error("WALLET", "Error getting gas payer", error);
        throw (0, error_1.createError)({ statusCode: 500, message: "Withdrawal failed - please try again later" });
    }
}
const validateAddress = (toAddress, chain) => {
    if (chain === "SOL") {
        // Solana address validation
        try {
            new web3_js_1.PublicKey(toAddress);
        }
        catch (error) {
            throw (0, error_1.createError)({ statusCode: 400, message: `Invalid Solana address: ${toAddress}` });
        }
    }
    else if (chain === "TRON") {
        // Tron address validation (should start with 'T')
        if (!toAddress.startsWith("T")) {
            throw (0, error_1.createError)({ statusCode: 400, message: `Invalid Tron address: ${toAddress}` });
        }
    }
    else if (chain === "XMR") {
        // Monero address validation (starts with '4' or '8')
        if (!toAddress.startsWith("4") && !toAddress.startsWith("8")) {
            throw (0, error_1.createError)({ statusCode: 400, message: `Invalid Monero address: ${toAddress}` });
        }
    }
    else if (chain === "TON") {
        try {
            // Accept both raw and user-friendly TON addresses
            const tonAddress = new tonweb_1.default.utils.Address(toAddress);
            if (!tonAddress || !tonAddress.toString()) {
                throw (0, error_1.createError)({ statusCode: 400, message: `Invalid TON address: ${toAddress}` });
            }
        }
        catch (error) {
            throw (0, error_1.createError)({ statusCode: 400, message: `Invalid TON address: ${toAddress}` });
        }
    }
    else {
        // Ethereum address validation (via ethers.js)
        if (!ethers_1.ethers.isAddress(toAddress)) {
            throw (0, error_1.createError)({ statusCode: 400, message: `Invalid target wallet address: ${toAddress}` });
        }
    }
};
exports.validateAddress = validateAddress;
const validateEcosystemBalances = async (tokenContract, actualTokenOwner, amount) => {
    try {
        const tokenOwnerBalance = (await tokenContract.balanceOf(actualTokenOwner.address)).toString();
        if (tokenOwnerBalance < amount) {
            throw (0, error_1.createError)({ statusCode: 400, message: "Insufficient funds in the wallet for withdrawal" });
        }
        return true;
    }
    catch (error) {
        console_1.logger.error("WALLET", "Failed to validate ecosystem balances", error);
        throw error;
    }
};
exports.validateEcosystemBalances = validateEcosystemBalances;
const getEcosystemTokenOwner = (walletData, provider) => {
    const { data } = walletData;
    const decryptedData = JSON.parse((0, encrypt_1.decrypt)(data));
    const { privateKey } = decryptedData;
    return new ethers_1.ethers.Wallet(privateKey, provider);
};
exports.getEcosystemTokenOwner = getEcosystemTokenOwner;
const initializeContracts = async (chain, currency, provider) => {
    try {
        const { contractAddress, contractType, tokenDecimals } = await (0, tokens_1.getTokenContractAddress)(chain, currency);
        const gasPayer = await getGasPayer(chain, provider);
        const { abi } = await (0, smartContract_1.getSmartContract)("token", "ERC20");
        const contract = new ethers_1.ethers.Contract(contractAddress, abi, provider);
        return {
            contract,
            contractAddress,
            gasPayer,
            contractType,
            tokenDecimals,
        };
    }
    catch (error) {
        console_1.logger.error("WALLET", "Failed to initialize contracts", error);
        throw error;
    }
};
exports.initializeContracts = initializeContracts;
const executeEcosystemWithdrawal = async (tokenContract, tokenContractAddress, gasPayer, tokenOwner, toAddress, amount, provider) => {
    try {
        const gasPrice = await (0, gas_1.getAdjustedGasPrice)(provider);
        const transferFromTransaction = {
            to: tokenContractAddress,
            from: gasPayer.address,
            data: tokenContract.interface.encodeFunctionData("transferFrom", [
                tokenOwner.address,
                toAddress,
                amount,
            ]),
        };
        const gasLimitForTransferFrom = await (0, gas_1.estimateGas)(transferFromTransaction, provider);
        const trx = await tokenContract
            .connect(gasPayer)
            .getFunction("transferFrom")
            .send(tokenOwner.address, toAddress, amount, {
            gasPrice: gasPrice,
            gasLimit: gasLimitForTransferFrom,
        });
        await trx.wait(2);
        return trx;
    }
    catch (error) {
        console_1.logger.error("WALLET", "Failed to execute ecosystem withdrawal", error);
        throw error;
    }
};
exports.executeEcosystemWithdrawal = executeEcosystemWithdrawal;
const executeNoPermitWithdrawal = async (chain, tokenContractAddress, gasPayer, toAddress, amount, provider, isNative) => {
    try {
        const custodialWallets = await (0, custodialWallet_1.getActiveCustodialWallets)(chain);
        if (!custodialWallets || custodialWallets.length === 0) {
            throw (0, error_1.createError)({ statusCode: 404, message: "No custodial wallets found" });
        }
        let tokenOwner, custodialContract, custodialContractAddress;
        for (const custodialWallet of custodialWallets) {
            const custodialWalletContract = await (0, custodialWallet_1.getCustodialWalletContract)(custodialWallet.address, provider);
            const balance = await (0, custodialWallet_1.getCustodialWalletTokenBalance)(custodialWalletContract, tokenContractAddress);
            if (BigInt(balance) >= amount) {
                tokenOwner = custodialWallet;
                custodialContract = custodialWalletContract;
                custodialContractAddress = custodialWallet.address;
                break;
            }
        }
        if (!tokenOwner) {
            throw (0, error_1.createError)({ statusCode: 404, message: "No custodial wallets found" });
        }
        let trx;
        if (isNative) {
            trx = await custodialContract
                .connect(gasPayer)
                .getFunction("transferNative")
                .send(toAddress, amount);
        }
        else {
            trx = await custodialContract
                .connect(gasPayer)
                .getFunction("transferTokens")
                .send(tokenContractAddress, toAddress, amount);
        }
        await trx.wait(2);
        return trx;
    }
    catch (error) {
        console_1.logger.error("WALLET", "Failed to execute no permit withdrawal", error);
        throw error;
    }
};
exports.executeNoPermitWithdrawal = executeNoPermitWithdrawal;
async function getAndValidateTokenOwner(walletData, amountEth, tokenContract, provider) {
    try {
        let alternativeWalletUsed = false;
        const tokenOwner = await (0, exports.getEcosystemTokenOwner)(walletData, provider);
        let actualTokenOwner = tokenOwner;
        let alternativeWallet = null;
        const onChainBalance = await tokenContract.balanceOf(tokenOwner.address);
        if (onChainBalance < amountEth) {
            const alternativeWalletData = await findAlternativeWalletData(walletData, (0, blockchain_1.fromBigInt)(amountEth));
            alternativeWallet = alternativeWalletData;
            actualTokenOwner = (0, exports.getEcosystemTokenOwner)(alternativeWalletData, provider);
            alternativeWalletUsed = true;
        }
        (0, exports.validateEcosystemBalances)(tokenContract, actualTokenOwner, amountEth);
        return { actualTokenOwner, alternativeWalletUsed, alternativeWallet };
    }
    catch (error) {
        console_1.logger.error("WALLET", "Failed to get and validate token owner", error);
        throw error;
    }
}
const executePermit = async (tokenContract, tokenContractAddress, gasPayer, tokenOwner, amount, provider) => {
    try {
        const nonce = await tokenContract.nonces(tokenOwner.address);
        const deadline = (0, chains_1.getTimestampInSeconds)() + 4200;
        const domain = {
            chainId: await (0, chains_1.getChainId)(provider),
            name: await tokenContract.name(),
            verifyingContract: tokenContractAddress,
            version: "1",
        };
        const types = {
            Permit: [
                {
                    name: "owner",
                    type: "address",
                },
                {
                    name: "spender",
                    type: "address",
                },
                {
                    name: "value",
                    type: "uint256",
                },
                {
                    name: "nonce",
                    type: "uint256",
                },
                {
                    name: "deadline",
                    type: "uint256",
                },
            ],
        };
        const values = {
            owner: tokenOwner.address,
            spender: gasPayer.address,
            value: amount,
            nonce: nonce,
            deadline: deadline,
        };
        const signature = await tokenOwner.signTypedData(domain, types, values);
        const sig = ethers_1.ethers.Signature.from(signature);
        const recovered = ethers_1.ethers.verifyTypedData(domain, types, values, sig);
        if (recovered !== tokenOwner.address) {
            throw (0, error_1.createError)({ statusCode: 400, message: "Invalid signature" });
        }
        const gasPrice = await (0, gas_1.getAdjustedGasPrice)(provider);
        const permitTransaction = {
            to: tokenContractAddress,
            from: tokenOwner.address,
            nonce: nonce,
            data: tokenContract.interface.encodeFunctionData("permit", [
                tokenOwner.address,
                gasPayer.address,
                amount,
                deadline,
                sig.v,
                sig.r,
                sig.s,
            ]),
        };
        const gasLimitForPermit = await (0, gas_1.estimateGas)(permitTransaction, provider);
        const gasPayerBalance = (await tokenContract.balanceOf(gasPayer.address)).toString();
        if (BigInt(gasPayerBalance) <
            BigInt(gasLimitForPermit) * gasPrice * BigInt(2)) {
            throw (0, error_1.createError)({ statusCode: 500, message: "Withdrawal failed, Please contact support team." });
        }
        const tx = await tokenContract
            .connect(gasPayer)
            .getFunction("permit")
            .send(tokenOwner.address, gasPayer.address, amount, deadline, sig.v, sig.r, sig.s, {
            gasPrice: gasPrice,
            gasLimit: gasLimitForPermit,
        });
        await tx.wait(2);
        return tx;
    }
    catch (error) {
        console_1.logger.error("WALLET", "Failed to execute permit", error);
        throw error;
    }
};
exports.executePermit = executePermit;
const executeNativeWithdrawal = async (payer, toAddress, amount, provider) => {
    try {
        const balance = await provider.getBalance(payer.address);
        if (balance < amount) {
            throw (0, error_1.createError)({ statusCode: 400, message: "Insufficient funds for withdrawal" });
        }
        const tx = {
            to: toAddress,
            value: amount,
        };
        const response = await payer.sendTransaction(tx);
        await response.wait(2);
        return response;
    }
    catch (error) {
        console_1.logger.error("WALLET", "Failed to execute native withdrawal", error);
        throw error;
    }
};
exports.executeNativeWithdrawal = executeNativeWithdrawal;
async function getAndValidateNativeTokenOwner(walletData, amountEth, provider) {
    try {
        const tokenOwner = await (0, exports.getEcosystemTokenOwner)(walletData, provider);
        const onChainBalance = await provider.getBalance(tokenOwner.address);
        if (onChainBalance < amountEth) {
            throw (0, error_1.createError)({ statusCode: 400, message: "Insufficient funds in the wallet for withdrawal" });
        }
        return tokenOwner;
    }
    catch (error) {
        console_1.logger.error("WALLET", "Failed to get and validate native token owner", error);
        throw error;
    }
}
async function getWalletData(walletId, chain) {
    try {
        return await db_1.models.walletData.findOne({
            where: {
                walletId: walletId,
                chain: chain,
            },
        });
    }
    catch (error) {
        console_1.logger.error("WALLET", "Failed to get wallet data", error);
        throw error;
    }
}
async function findAlternativeWalletData(walletData, amount) {
    try {
        const alternativeWalletData = await db_1.models.walletData.findOne({
            where: {
                currency: walletData.currency,
                chain: walletData.chain,
                balance: {
                    [sequelize_1.Op.gte]: amount,
                },
            },
        });
        if (!alternativeWalletData) {
            throw (0, error_1.createError)({ statusCode: 404, message: "No alternative wallet with sufficient balance found" });
        }
        return alternativeWalletData;
    }
    catch (error) {
        console_1.logger.error("WALLET", "Failed to find alternative wallet data", error);
        throw error;
    }
}
async function getEcosystemPendingTransactions() {
    try {
        return await db_1.models.transaction.findAll({
            where: {
                type: "WITHDRAW",
                status: "PENDING",
            },
            include: [{ model: db_1.models.wallet, where: { type: "ECO" } }],
        });
    }
    catch (error) {
        console_1.logger.error("WALLET", "Failed to get ecosystem pending transactions", error);
        throw error;
    }
}
const handleEcosystemDeposit = async (trx) => {
    try {
        const wallet = await db_1.models.wallet.findOne({
            where: { id: trx.id },
        });
        if (!wallet) {
            throw (0, error_1.createError)({ statusCode: 404, message: "Wallet not found" });
        }
        // For XMR and other pay-to-many chains, check transaction by both trxId AND walletId
        // This allows multiple recipients to receive from the same transaction
        // Note: Ecosystem uses trxId, referenceId is for spot trading
        const existingTransaction = await db_1.models.transaction.findOne({
            where: {
                trxId: trx.hash,
                walletId: wallet.id, // Check per wallet, not globally
            },
        });
        if (existingTransaction) {
            throw (0, error_1.createError)({ statusCode: 409, message: "Transaction already processed for this wallet" });
        }
        const addresses = JSON.parse(wallet.address);
        const chainAddress = addresses[trx.chain];
        if (!chainAddress) {
            throw (0, error_1.createError)({ statusCode: 404, message: "Address not found for the given chain" });
        }
        const depositAmount = parseFloat(trx.amount);
        console_1.logger.debug("DEPOSIT", `Processing deposit for wallet ${wallet.id}`);
        console_1.logger.debug("DEPOSIT", `Current wallet balance: ${wallet.balance} ${wallet.currency}`);
        console_1.logger.debug("DEPOSIT", `Current chain balance: ${chainAddress.balance || 0} ${wallet.currency}`);
        console_1.logger.debug("DEPOSIT", `Deposit amount (trx.amount): ${trx.amount} ${wallet.currency}`);
        console_1.logger.debug("DEPOSIT", `Parsed deposit amount: ${depositAmount} ${wallet.currency}`);
        // **Calculate the fee appropriately**
        let fee = 0;
        const utxoChains = ["BTC", "DOGE", "LTC", "DASH"];
        if (utxoChains.includes(trx.chain)) {
            // For UTXO-based chains
            // Note: inputs and outputs are already converted from satoshis to standard units
            const totalInputValue = trx.inputs.reduce((sum, input) => {
                const inputValue = input.output_value || input.value || 0;
                return sum + parseFloat(inputValue);
            }, 0);
            const totalOutputValue = trx.outputs.reduce((sum, output) => {
                const outputValue = output.value || 0;
                return sum + parseFloat(outputValue);
            }, 0);
            // Calculate the fee
            fee = totalInputValue - totalOutputValue;
        }
        else {
            // For EVM-based chains
            if (!isNaN(parseFloat(trx.gasUsed)) && !isNaN(parseFloat(trx.gasPrice))) {
                fee = parseFloat(trx.gasUsed) * parseFloat(trx.gasPrice);
            }
            else {
                fee = 0;
            }
        }
        // Use wallet service for atomic, audited ecosystem deposit
        // Use stable idempotency key for proper retry detection
        const idempotencyKey = `eco_deposit_${trx.hash}_${wallet.id}`;
        const result = await wallet_1.walletService.ecoCredit({
            idempotencyKey,
            userId: wallet.userId,
            walletId: wallet.id,
            currency: wallet.currency,
            chain: trx.chain,
            amount: depositAmount,
            operationType: "ECO_DEPOSIT",
            fee,
            description: `Deposit of ${trx.amount} ${wallet.currency} from ${Array.isArray(trx.from) ? trx.from[0] || 'Unknown' : trx.from || 'Unknown'}`,
            txHash: trx.hash,
            fromAddress: trx.from,
            toAddress: trx.to,
            metadata: {
                gasLimit: trx.gasLimit,
                gasPrice: trx.gasPrice,
                gasUsed: trx.gasUsed,
                inputs: trx.inputs,
                outputs: trx.outputs,
            },
        });
        console_1.logger.debug("DEPOSIT", `New chain balance: ${result.newChainBalance} ${wallet.currency}`);
        console_1.logger.debug("DEPOSIT", `New wallet balance: ${result.newBalance} ${wallet.currency}`);
        // Save UTXOs for UTXO-based chains (BTC, LTC, DOGE, DASH)
        if (utxoChains.includes(trx.chain) && trx.outputs && Array.isArray(trx.outputs)) {
            console_1.logger.debug("UTXO", `Saving UTXOs for ${trx.chain} transaction ${trx.hash}`);
            // Filter outputs that belong to this wallet's address
            const walletAddress = chainAddress.address;
            const walletOutputs = trx.outputs.filter(output => output.addresses && output.addresses.includes(walletAddress));
            console_1.logger.debug("UTXO", `Found ${walletOutputs.length} outputs for wallet address ${walletAddress}`);
            // Save each UTXO to the database
            for (let i = 0; i < trx.outputs.length; i++) {
                const output = trx.outputs[i];
                // Only save outputs that belong to this wallet
                if (output.addresses && output.addresses.includes(walletAddress)) {
                    try {
                        await db_1.models.ecosystemUtxo.create({
                            walletId: wallet.id,
                            transactionId: trx.hash,
                            index: i,
                            amount: parseFloat(output.value),
                            script: output.script || '',
                            status: false, // false = unspent
                        });
                        console_1.logger.debug("UTXO", `Saved UTXO: ${trx.hash}:${i} amount=${output.value} ${wallet.currency}`);
                    }
                    catch (utxoError) {
                        console_1.logger.error("UTXO", `Failed to save UTXO ${trx.hash}:${i}: ${utxoError.message}`);
                        // Don't throw - continue processing other UTXOs
                    }
                }
            }
            console_1.logger.debug("UTXO", `Completed UTXO save for transaction ${trx.hash}`);
        }
        const updatedWallet = await db_1.models.wallet.findOne({
            where: { id: wallet.id },
        });
        // Update wallet_data balance with precision handling
        console_1.logger.debug("DEPOSIT", `Updating wallet_data for walletId: ${wallet.id}, chain: ${trx.chain}`);
        const walletData = await db_1.models.walletData.findOne({
            where: {
                walletId: wallet.id,
                chain: trx.chain,
            },
        });
        if (walletData) {
            console_1.logger.debug("DEPOSIT", `Current wallet_data balance: ${walletData.balance}`);
            console_1.logger.debug("DEPOSIT", `Deposit amount: ${trx.amount}`);
            // Parse both values to ensure numeric addition (not string concatenation)
            const currentBalance = parseFloat(walletData.balance) || 0;
            const depositAmount = parseFloat(trx.amount);
            console_1.logger.debug("DEPOSIT", `Parsed current balance: ${currentBalance}`);
            console_1.logger.debug("DEPOSIT", `Parsed deposit amount: ${depositAmount}`);
            const newBalance = updateBalancePrecision(currentBalance + depositAmount, trx.chain);
            console_1.logger.debug("DEPOSIT", `New wallet_data balance: ${newBalance}`);
            await db_1.models.walletData.update({
                balance: newBalance,
            }, {
                where: {
                    walletId: wallet.id,
                    chain: trx.chain,
                },
            });
            console_1.logger.debug("DEPOSIT", `Successfully updated wallet_data balance`);
        }
        else {
            console_1.logger.error("DEPOSIT", `No wallet_data found for walletId: ${wallet.id}, chain: ${trx.chain}`);
        }
        return {
            transactionId: result.transactionId,
            wallet: updatedWallet,
        };
    }
    catch (error) {
        console_1.logger.error("WALLET", "Failed to handle ecosystem deposit", error);
        throw error;
    }
};
exports.handleEcosystemDeposit = handleEcosystemDeposit;
const satoshiToBTC = (value) => value / 1e8;
/**
 * Update private ledger using the LedgerService
 * Tracks off-chain balance differences for ECO wallets
 */
async function updatePrivateLedger(wallet_id, index, currency, chain, difference) {
    try {
        return await wallet_1.ledgerService.updateLedger({
            walletId: wallet_id,
            index,
            currency,
            chain: chain,
            amount: difference,
        });
    }
    catch (error) {
        console_1.logger.error("WALLET", "Failed to update private ledger", error);
        throw error;
    }
}
const updateBalancePrecision = (balance, chain) => {
    const fixedPrecisionChains = {
        BTC: 8,
        LTC: 8,
        DOGE: 8,
        DASH: 8,
        SOL: 8,
        TRON: 6,
        XMR: 12,
        // EVM chains - use 8 decimals for balance precision
        BSC: 8,
        ETH: 8,
        POLYGON: 8,
        ARBITRUM: 8,
        OPTIMISM: 8,
        BASE: 8,
        AVAX: 8,
        FTM: 8,
        CELO: 8,
        RSK: 8,
    };
    if (fixedPrecisionChains[chain] !== undefined) {
        return parseFloat(balance.toFixed(fixedPrecisionChains[chain]));
    }
    return balance;
};
const decrementWalletBalance = async (userWallet, chain, amount, dbTransaction) => {
    try {
        // Use wallet service for atomic, audited ecosystem debit
        // Use stable idempotency key for proper retry detection
        const idempotencyKey = `eco_debit_${userWallet.id}_${chain}_${amount}`;
        const result = await wallet_1.walletService.ecoDebit({
            idempotencyKey,
            userId: userWallet.userId,
            walletId: userWallet.id,
            currency: userWallet.currency,
            chain: chain,
            amount,
            operationType: "ECO_WITHDRAW",
            description: `Withdrawal of ${amount} ${userWallet.currency} on ${chain}`,
            transaction: dbTransaction,
        });
        return result;
    }
    catch (error) {
        console_1.logger.error("WALLET", "Failed to decrement wallet balance", error);
        throw error;
    }
};
exports.decrementWalletBalance = decrementWalletBalance;
async function createPendingTransaction(userId, walletId, currency, chain, amount, toAddress, withdrawalFee, token, dbTransaction) {
    try {
        const createOptions = {
            userId: userId,
            walletId: walletId,
            type: "WITHDRAW",
            status: "PENDING",
            amount: amount,
            fee: withdrawalFee,
            description: `Pending withdrawal of ${amount} ${currency} to ${toAddress}`,
            metadata: JSON.stringify({
                toAddress: toAddress,
                chain: chain,
                contractType: token.contractType,
                contract: token.contract,
                decimals: token.decimals,
            }),
        };
        // If we have a database transaction, pass it as an option
        if (dbTransaction) {
            return await db_1.models.transaction.create(createOptions, { transaction: dbTransaction });
        }
        return await db_1.models.transaction.create(createOptions);
    }
    catch (error) {
        console_1.logger.error("WALLET", "Failed to create pending transaction", error);
        throw error;
    }
}
const refundUser = async (transaction) => {
    try {
        await db_1.models.transaction.update({
            status: "FAILED",
            description: `Refund of ${transaction.amount}`,
        }, {
            where: { id: transaction.id },
        });
        const wallet = await db_1.models.wallet.findOne({
            where: { id: transaction.walletId },
        });
        if (!wallet) {
            throw (0, error_1.createError)({ statusCode: 404, message: "Wallet not found" });
        }
        const metadata = JSON.parse(transaction.metadata);
        const amount = transaction.amount + transaction.fee;
        const chain = metadata === null || metadata === void 0 ? void 0 : metadata.chain;
        // Use wallet service for atomic, audited ecosystem refund
        // Use stable idempotency key for proper retry detection
        const idempotencyKey = `eco_refund_${transaction.id}`;
        await wallet_1.walletService.ecoRefund({
            idempotencyKey,
            userId: wallet.userId,
            walletId: wallet.id,
            currency: wallet.currency,
            chain: chain,
            amount,
            operationType: "ECO_REFUND",
            description: `Refund of ${amount} ${wallet.currency} for failed withdrawal`,
            referenceId: transaction.id,
            metadata: {
                originalTransactionId: transaction.id,
                reason: "withdrawal_failed",
            },
        });
    }
    catch (error) {
        console_1.logger.error("WALLET", "Failed to refund user", error);
        throw error;
    }
};
exports.refundUser = refundUser;
const updateAlternativeWallet = async (currency, chain, amount) => {
    try {
        const alternativeWalletData = await db_1.models.walletData.findOne({
            where: {
                currency: currency,
                chain: chain,
            },
        });
        if (!alternativeWalletData) {
            throw (0, error_1.createError)({ statusCode: 404, message: "Alternative wallet not found" });
        }
        const newBalance = updateBalancePrecision(parseFloat(alternativeWalletData.balance) - amount, chain);
        await db_1.models.walletData.update({
            balance: newBalance,
        }, {
            where: { id: alternativeWalletData.id },
        });
        await updatePrivateLedger(alternativeWalletData.walletId, alternativeWalletData.index, currency, chain, -amount);
    }
    catch (error) {
        console_1.logger.error("WALLET", "Failed to update alternative wallet", error);
        throw error;
    }
};
exports.updateAlternativeWallet = updateAlternativeWallet;
/**
 * Updates wallet balance and inOrder for order operations
 * Uses WalletService for atomic, audited updates
 */
async function updateWalletBalance(wallet, balanceChange, type, idempotencyKey, transaction) {
    try {
        if (!wallet)
            throw (0, error_1.createError)({ statusCode: 404, message: "Wallet not found" });
        if (!idempotencyKey)
            throw (0, error_1.createError)({ statusCode: 400, message: "idempotencyKey is required for updateWalletBalance" });
        if (type === "subtract") {
            // Hold funds: move from balance to inOrder
            await wallet_1.walletService.hold({
                idempotencyKey,
                userId: wallet.userId,
                walletId: wallet.id,
                walletType: wallet.type || "ECO",
                currency: wallet.currency,
                amount: balanceChange,
                reason: "Order placement",
                transaction,
            });
        }
        else {
            // Release funds: move from inOrder back to balance
            await wallet_1.walletService.release({
                idempotencyKey,
                userId: wallet.userId,
                walletId: wallet.id,
                walletType: wallet.type || "ECO",
                currency: wallet.currency,
                amount: balanceChange,
                reason: "Order cancelled/filled",
                transaction,
            });
        }
    }
    catch (error) {
        console_1.logger.error("WALLET", "Failed to update wallet balance", error);
        throw error;
    }
}
/**
 * Updates wallet for order fill/execution (matching engine)
 * Uses WalletService for atomic, audited updates
 *
 * @param wallet - Wallet to update
 * @param balanceChange - Amount to change balance by
 * @param inOrderChange - Amount to change inOrder by (can be negative)
 * @param operation - Description for error messages
 * @param idempotencyKey - Required stable idempotency key for retry detection (e.g., based on trade ID)
 */
async function updateWalletForFill(wallet, balanceChange, inOrderChange, operation, idempotencyKey) {
    try {
        if (!wallet)
            throw (0, error_1.createError)({ statusCode: 404, message: "Wallet not found" });
        if (!idempotencyKey)
            throw (0, error_1.createError)({ statusCode: 400, message: "idempotencyKey is required for updateWalletForFill" });
        // For trade execution:
        // - If receiving funds (balanceChange > 0), credit the wallet
        // - If inOrder is decreasing (trade executed), execute from hold
        if (balanceChange > 0) {
            await wallet_1.walletService.credit({
                idempotencyKey: `${idempotencyKey}_credit`,
                userId: wallet.userId,
                walletId: wallet.id,
                walletType: wallet.type || "ECO",
                currency: wallet.currency,
                amount: balanceChange,
                operationType: "TRADE_CREDIT",
                description: operation,
            });
        }
        else if (balanceChange < 0) {
            await wallet_1.walletService.debit({
                idempotencyKey: `${idempotencyKey}_debit`,
                userId: wallet.userId,
                walletId: wallet.id,
                walletType: wallet.type || "ECO",
                currency: wallet.currency,
                amount: Math.abs(balanceChange),
                operationType: "TRADE_DEBIT",
                description: operation,
            });
        }
        // Handle inOrder changes separately if needed
        if (inOrderChange < 0) {
            // Decrease inOrder (order executed from held funds)
            await wallet_1.walletService.executeFromHold({
                idempotencyKey: `${idempotencyKey}_execute`,
                userId: wallet.userId,
                walletId: wallet.id,
                walletType: wallet.type || "ECO",
                currency: wallet.currency,
                amount: Math.abs(inOrderChange),
                operationType: "RELEASE",
                description: `Execute from hold: ${operation}`,
                reason: operation,
            });
        }
    }
    catch (error) {
        console_1.logger.error("WALLET", "Failed to update wallet for fill", error);
        throw error;
    }
}
