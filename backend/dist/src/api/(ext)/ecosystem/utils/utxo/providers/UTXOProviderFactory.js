"use strict";
/**
 * UTXO Provider Factory
 * Creates and manages UTXO providers based on environment configuration
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.UTXOProviderFactory = void 0;
exports.getUTXOProvider = getUTXOProvider;
const MempoolProvider_1 = require("./MempoolProvider");
const BlockCypherProvider_1 = require("./BlockCypherProvider");
const BitcoinNodeProvider_1 = require("./BitcoinNodeProvider");
const error_1 = require("@b/utils/error");
class UTXOProviderFactory {
    /**
     * Get provider for a specific chain
     * Provider selection order (if available):
     * 1. Environment variable (BTC_PROVIDER, LTC_PROVIDER, etc.)
     * 2. Default provider based on chain
     */
    static async getProvider(chain) {
        const cacheKey = chain;
        // Return cached instance if available
        if (this.instances.has(cacheKey)) {
            return this.instances.get(cacheKey);
        }
        // Get provider type from environment
        const providerType = this.getProviderType(chain);
        // Create provider instance
        const provider = await this.createProvider(chain, providerType);
        // Cache the instance
        this.instances.set(cacheKey, provider);
        return provider;
    }
    /**
     * Get provider type from environment variables
     */
    static getProviderType(chain) {
        var _a;
        const envVar = `${chain}_NODE`;
        const providerEnv = (_a = process.env[envVar]) === null || _a === void 0 ? void 0 : _a.toLowerCase();
        if (providerEnv === 'mempool' || providerEnv === 'blockcypher' || providerEnv === 'node') {
            return providerEnv;
        }
        // Default providers by chain
        const defaults = {
            'BTC': 'mempool',
            'LTC': 'mempool',
            'DOGE': 'blockcypher',
            'DASH': 'blockcypher',
        };
        return defaults[chain] || 'blockcypher';
    }
    /**
     * Create a provider instance
     */
    static async createProvider(chain, type) {
        console.log(`[UTXO_PROVIDER] Creating ${type} provider for ${chain}`);
        switch (type) {
            case 'mempool':
                // Check if Mempool supports this chain
                if (!['BTC', 'LTC'].includes(chain)) {
                    console.warn(`[UTXO_PROVIDER] Mempool doesn't support ${chain}, falling back to BlockCypher`);
                    return new BlockCypherProvider_1.BlockCypherProvider(chain);
                }
                return new MempoolProvider_1.MempoolProvider(chain);
            case 'blockcypher':
                return new BlockCypherProvider_1.BlockCypherProvider(chain);
            case 'node':
                // Only BTC is supported by Bitcoin Core node
                if (chain !== 'BTC') {
                    console.warn(`[UTXO_PROVIDER] Bitcoin Node only supports BTC, falling back to BlockCypher for ${chain}`);
                    return new BlockCypherProvider_1.BlockCypherProvider(chain);
                }
                const nodeProvider = new BitcoinNodeProvider_1.BitcoinNodeProvider(chain);
                await nodeProvider.initialize();
                // Check if node is available
                const isAvailable = await nodeProvider.isAvailable();
                if (!isAvailable) {
                    console.warn('[UTXO_PROVIDER] Bitcoin Node is not available or not synced, falling back to Mempool');
                    return new MempoolProvider_1.MempoolProvider(chain);
                }
                return nodeProvider;
            default:
                throw (0, error_1.createError)({ statusCode: 400, message: `Unknown provider type: ${type}` });
        }
    }
    /**
     * Clear cached providers (useful for testing or switching providers)
     */
    static clearCache(chain) {
        if (chain) {
            this.instances.delete(chain);
        }
        else {
            this.instances.clear();
        }
    }
    /**
     * Get all available providers for a chain
     */
    static async getAvailableProviders(chain) {
        const providers = ['mempool', 'blockcypher', 'node'];
        const results = [];
        for (const type of providers) {
            try {
                const provider = await this.createProvider(chain, type);
                const available = await provider.isAvailable();
                results.push({
                    type: type,
                    available: available,
                    name: provider.getName(),
                });
            }
            catch (error) {
                results.push({
                    type: type,
                    available: false,
                    name: `${type} (${chain})`,
                });
            }
        }
        return results;
    }
}
exports.UTXOProviderFactory = UTXOProviderFactory;
UTXOProviderFactory.instances = new Map();
// Export helper functions for backward compatibility
async function getUTXOProvider(chain) {
    return UTXOProviderFactory.getProvider(chain);
}
