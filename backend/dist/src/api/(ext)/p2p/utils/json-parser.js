"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.safeParseJSON = safeParseJSON;
exports.parseAmountConfig = parseAmountConfig;
exports.parsePriceConfig = parsePriceConfig;
exports.parseTradeSettings = parseTradeSettings;
exports.parseLocationSettings = parseLocationSettings;
exports.parseUserRequirements = parseUserRequirements;
const console_1 = require("@b/utils/console");
/**
 * Robust JSON parser that handles:
 * 1. Already parsed objects
 * 2. Single-stringified JSON
 * 3. Double-stringified JSON
 * 4. Malformed data
 */
function safeParseJSON(value, defaultValue = null) {
    // If already an object, return it
    if (value && typeof value === 'object' && !Array.isArray(value)) {
        return value;
    }
    // If array, return it
    if (Array.isArray(value)) {
        return value;
    }
    // If not a string, return default
    if (typeof value !== 'string') {
        return defaultValue;
    }
    // If empty string, return default
    if (!value || value.trim() === '') {
        return defaultValue;
    }
    try {
        // First attempt: parse once
        let parsed = JSON.parse(value);
        // If result is a string, it might be double-stringified
        if (typeof parsed === 'string') {
            try {
                parsed = JSON.parse(parsed);
            }
            catch (_a) {
                // If second parse fails, keep the first result
            }
        }
        // If result is still a string and looks like JSON, try one more time
        if (typeof parsed === 'string' && (parsed.startsWith('{') || parsed.startsWith('['))) {
            try {
                parsed = JSON.parse(parsed);
            }
            catch (_b) {
                // If third parse fails, keep the second result
            }
        }
        return parsed;
    }
    catch (error) {
        console_1.logger.warn("JSON", `Failed to parse value: ${error instanceof Error ? error.message : 'Unknown error'}`);
        return defaultValue;
    }
}
/**
 * Parse P2P offer amount config with safe fallback
 */
function parseAmountConfig(amountConfig) {
    const parsed = safeParseJSON(amountConfig);
    if (!parsed || typeof parsed !== 'object') {
        return { total: 0, min: 0, max: 0 };
    }
    return {
        total: Number(parsed.total) || 0,
        min: Number(parsed.min) || 0,
        max: Number(parsed.max) || 0,
        availableBalance: parsed.availableBalance ? Number(parsed.availableBalance) : undefined,
        originalTotal: parsed.originalTotal ? Number(parsed.originalTotal) : undefined,
    };
}
/**
 * Parse P2P offer price config with safe fallback
 */
function parsePriceConfig(priceConfig) {
    const parsed = safeParseJSON(priceConfig);
    if (!parsed || typeof parsed !== 'object') {
        return { model: 'FIXED', value: 0, finalPrice: 0 };
    }
    return {
        model: parsed.model || 'FIXED',
        value: Number(parsed.value) || 0,
        marketPrice: parsed.marketPrice ? Number(parsed.marketPrice) : undefined,
        finalPrice: Number(parsed.finalPrice) || Number(parsed.value) || 0,
        currency: parsed.currency,
    };
}
/**
 * Parse P2P offer trade settings with safe fallback
 */
function parseTradeSettings(tradeSettings) {
    const parsed = safeParseJSON(tradeSettings);
    if (!parsed || typeof parsed !== 'object') {
        return {
            autoCancel: 30,
            kycRequired: false,
            visibility: 'PUBLIC',
            termsOfTrade: '',
        };
    }
    return {
        autoCancel: Number(parsed.autoCancel) || 30,
        kycRequired: Boolean(parsed.kycRequired),
        visibility: parsed.visibility || 'PUBLIC',
        termsOfTrade: parsed.termsOfTrade || '',
        additionalNotes: parsed.additionalNotes,
    };
}
/**
 * Parse P2P offer location settings with safe fallback
 */
function parseLocationSettings(locationSettings) {
    const parsed = safeParseJSON(locationSettings);
    if (!parsed || typeof parsed !== 'object') {
        return { country: '' };
    }
    return {
        country: parsed.country || '',
        region: parsed.region,
        city: parsed.city,
        restrictions: Array.isArray(parsed.restrictions) ? parsed.restrictions : undefined,
    };
}
/**
 * Parse P2P offer user requirements with safe fallback
 */
function parseUserRequirements(userRequirements) {
    const parsed = safeParseJSON(userRequirements);
    if (!parsed || typeof parsed !== 'object') {
        return {};
    }
    return {
        minCompletedTrades: parsed.minCompletedTrades ? Number(parsed.minCompletedTrades) : undefined,
        minSuccessRate: parsed.minSuccessRate ? Number(parsed.minSuccessRate) : undefined,
        minAccountAge: parsed.minAccountAge ? Number(parsed.minAccountAge) : undefined,
        trustedOnly: parsed.trustedOnly ? Boolean(parsed.trustedOnly) : undefined,
    };
}
