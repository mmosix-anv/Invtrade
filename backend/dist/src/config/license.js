"use strict";
// License API Configuration
// Connects to the Envato Product Management system for license validation
// IMPORTANT: These values are hardcoded and should not be changed
Object.defineProperty(exports, "__esModule", { value: true });
exports.LICENSE_CONFIG = void 0;
exports.getLicenseConfig = getLicenseConfig;
exports.getExtensionProductId = getExtensionProductId;
exports.getExtensionNameByProductId = getExtensionNameByProductId;
// Hardcoded API URL - always use production
const ENVATO_API_URL = "https://updates.mashdiv.com";
exports.LICENSE_CONFIG = {
    // Envato Product Management API URL (hardcoded - do not change)
    API_URL: ENVATO_API_URL,
    // License secret for signing requests (hardcoded)
    LICENSE_SECRET: 'x7K9mP2vQ8nR5jL1wY6hT3cE0bN4aZ8dF2gU7iS5oV9xW1yJ6kM3pR8qN0lH4tB7',
    // Main product ID - Bicrypto Envato Item ID
    MAIN_PRODUCT_ID: '35599184',
    // Heartbeat settings (hardcoded)
    HEARTBEAT_ENABLED: true,
    HEARTBEAT_INTERVAL: 3600000, // 1 hour
    // Cache settings
    CACHE_DURATION_VALID: 3600000, // 1 hour for valid licenses
    CACHE_DURATION_INVALID: 300000, // 5 minutes for invalid licenses
    // Grace period for network errors
    GRACE_PERIOD_ENABLED: true,
    GRACE_PERIOD_DURATION: 86400000, // 24 hours
    // Extension to Envato Item ID mappings
    EXTENSION_MAPPINGS: {
        "ai_investment": "35988984",
        "ecosystem": "40071914",
        "forex": "36668679",
        "ico": "36120046",
        "staking": "37434481",
        "knowledge_base": "39166202",
        "ecommerce": "44624493",
        "wallet_connect": "37548018",
        "p2p": "44593497",
        "mlm": "36667808",
        "mailwizard": "45613491",
        "futures": "46094641",
        "nft": "60962133",
        "gateway": "61043226",
        "ai_market_maker": "61007981",
        "copy_trading": "61107157"
    }
};
// Helper function to get license configuration
function getLicenseConfig() {
    return {
        apiUrl: exports.LICENSE_CONFIG.API_URL,
        licenseSecret: exports.LICENSE_CONFIG.LICENSE_SECRET,
        mainProductId: exports.LICENSE_CONFIG.MAIN_PRODUCT_ID,
        extensionMappings: exports.LICENSE_CONFIG.EXTENSION_MAPPINGS,
        heartbeat: {
            enabled: exports.LICENSE_CONFIG.HEARTBEAT_ENABLED,
            interval: exports.LICENSE_CONFIG.HEARTBEAT_INTERVAL,
        },
        cache: {
            validDuration: exports.LICENSE_CONFIG.CACHE_DURATION_VALID,
            invalidDuration: exports.LICENSE_CONFIG.CACHE_DURATION_INVALID,
        },
        gracePeriod: {
            enabled: exports.LICENSE_CONFIG.GRACE_PERIOD_ENABLED,
            duration: exports.LICENSE_CONFIG.GRACE_PERIOD_DURATION,
        },
    };
}
// Get product ID for an extension
function getExtensionProductId(extensionName) {
    const mappings = exports.LICENSE_CONFIG.EXTENSION_MAPPINGS;
    return mappings[extensionName] || null;
}
// Get extension name from product ID
function getExtensionNameByProductId(productId) {
    const entries = Object.entries(exports.LICENSE_CONFIG.EXTENSION_MAPPINGS);
    const found = entries.find(([, id]) => id === productId);
    return found ? found[0] : null;
}
