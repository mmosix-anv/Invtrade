"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getWssProvider = exports.getProvider = exports.initializeProvider = exports.chainConfigs = void 0;
exports.isProviderHealthy = isProviderHealthy;
const ethers_1 = require("ethers");
const chains_1 = require("./chains");
Object.defineProperty(exports, "chainConfigs", { enumerable: true, get: function () { return chains_1.chainConfigs; } });
const console_1 = require("@b/utils/console");
const error_1 = require("@b/utils/error");
// Cache providers to avoid recreating them
const providerCache = new Map();
// Initialize Ethereum provider
const initializeProvider = (chain) => {
    const provider = (0, exports.getProvider)(chain);
    if (!provider) {
        throw (0, error_1.createError)({ statusCode: 503, message: `Failed to initialize provider for chain ${chain}` });
    }
    return provider;
};
exports.initializeProvider = initializeProvider;
const getEnv = (key, defaultValue = "") => process.env[key] || defaultValue;
const getProvider = async (chainSymbol) => {
    try {
        const chainConfig = chains_1.chainConfigs[chainSymbol];
        if (!chainConfig)
            throw (0, error_1.createError)({ statusCode: 400, message: `Unsupported chain: ${chainSymbol}` });
        const networkName = getEnv(`${chainSymbol}_NETWORK`);
        if (!networkName)
            throw (0, error_1.createError)({ statusCode: 500, message: `Environment variable ${chainSymbol}_NETWORK is not set` });
        const rpcName = getEnv(`${chainSymbol}_${networkName.toUpperCase()}_RPC`);
        if (!rpcName)
            throw (0, error_1.createError)({ statusCode: 500, message: `Environment variable ${rpcName} is not set` });
        // Check cache first
        const cacheKey = `${chainSymbol}_${networkName}`;
        if (providerCache.has(cacheKey)) {
            return providerCache.get(cacheKey);
        }
        // Get chainId from config
        const network = chainConfig.networks[networkName];
        if (!(network === null || network === void 0 ? void 0 : network.chainId)) {
            throw (0, error_1.createError)({ statusCode: 500, message: `Chain ID not found for ${chainSymbol} on ${networkName}` });
        }
        // Create a static network configuration to prevent auto-detection
        const staticNetwork = ethers_1.Network.from({
            name: networkName,
            chainId: network.chainId,
        });
        // Create provider with static network - this prevents the "failed to detect network" error
        const provider = new ethers_1.JsonRpcProvider(rpcName, staticNetwork, {
            staticNetwork: true,
            batchMaxCount: 1,
        });
        // Cache the provider
        providerCache.set(cacheKey, provider);
        return provider;
    }
    catch (error) {
        console_1.logger.error("PROVIDER", "Failed to get provider", error);
        throw error;
    }
};
exports.getProvider = getProvider;
const getWssProvider = (chainSymbol) => {
    try {
        const chainConfig = chains_1.chainConfigs[chainSymbol];
        if (!chainConfig) {
            throw (0, error_1.createError)({ statusCode: 400, message: `Unsupported chain: ${chainSymbol}` });
        }
        const networkName = getEnv(`${chainSymbol}_NETWORK`);
        if (!networkName) {
            throw (0, error_1.createError)({ statusCode: 500, message: `Environment variable ${chainSymbol}_NETWORK is not set` });
        }
        const rpcWssVar = `${chainSymbol}_${networkName.toUpperCase()}_RPC_WSS`;
        const rpcWssUrl = getEnv(rpcWssVar);
        if (!rpcWssUrl) {
            throw (0, error_1.createError)({ statusCode: 500, message: `Environment variable ${rpcWssVar} is not set` });
        }
        return new ethers_1.WebSocketProvider(rpcWssUrl);
    }
    catch (error) {
        console_1.logger.error("WSS_PROVIDER", "Failed to get WSS provider", error);
        throw error;
    }
};
exports.getWssProvider = getWssProvider;
async function isProviderHealthy(provider) {
    try {
        const blockNumber = await provider.getBlockNumber();
        return blockNumber > 0;
    }
    catch (_a) {
        return false;
    }
}
