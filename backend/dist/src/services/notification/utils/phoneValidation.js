"use strict";
/**
 * Phone Number Validation Utilities
 * E.164 format validation and formatting
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.isValidPhoneNumber = isValidPhoneNumber;
exports.formatPhoneNumber = formatPhoneNumber;
exports.getCountryCode = getCountryCode;
exports.formatPhoneForDisplay = formatPhoneForDisplay;
exports.validatePhoneNumbers = validatePhoneNumbers;
exports.normalizePhoneNumber = normalizePhoneNumber;
exports.isMobilePhone = isMobilePhone;
exports.getPhoneMetadata = getPhoneMetadata;
const console_1 = require("@b/utils/console");
/**
 * Validate phone number in E.164 format
 * E.164: +[country code][number]
 * Example: +1234567890
 */
function isValidPhoneNumber(phone) {
    if (!phone) {
        return false;
    }
    // E.164 format: +[1-9][0-9]{1-14}
    // - Must start with +
    // - Country code starts with 1-9
    // - Total length: 1-15 digits after +
    const e164Regex = /^\+[1-9]\d{1,14}$/;
    return e164Regex.test(phone);
}
/**
 * Format phone number to E.164 format
 */
function formatPhoneNumber(phone, defaultCountryCode = "+1") {
    if (!phone) {
        return "";
    }
    // Remove all non-digit characters except +
    let formatted = phone.replace(/[^\d+]/g, "");
    // If already in E.164 format, return as is
    if (formatted.startsWith("+") && isValidPhoneNumber(formatted)) {
        return formatted;
    }
    // Remove any leading + or 00
    formatted = formatted.replace(/^(\+|00)/, "");
    // If doesn't start with country code, add default
    if (!formatted.startsWith(defaultCountryCode.replace("+", ""))) {
        formatted = defaultCountryCode.replace("+", "") + formatted;
    }
    // Add + prefix
    if (!formatted.startsWith("+")) {
        formatted = "+" + formatted;
    }
    return formatted;
}
/**
 * Extract country code from phone number
 */
function getCountryCode(phone) {
    if (!isValidPhoneNumber(phone)) {
        return null;
    }
    // Common country codes (1-3 digits)
    const match = phone.match(/^\+(\d{1,3})/);
    return match ? match[1] : null;
}
/**
 * Format phone for display
 * E.164 -> Human readable
 */
function formatPhoneForDisplay(phone) {
    if (!isValidPhoneNumber(phone)) {
        return phone;
    }
    const countryCode = getCountryCode(phone);
    if (!countryCode) {
        return phone;
    }
    // Remove + and country code
    const number = phone.substring(countryCode.length + 1);
    // Format based on country code
    if (countryCode === "1") {
        // US/Canada: +1 (234) 567-8900
        if (number.length === 10) {
            return `+1 (${number.substring(0, 3)}) ${number.substring(3, 6)}-${number.substring(6)}`;
        }
    }
    // Default: +XX XXX XXX XXXX
    return `+${countryCode} ${number}`;
}
/**
 * Validate multiple phone numbers
 */
function validatePhoneNumbers(phones) {
    const valid = [];
    const invalid = [];
    for (const phone of phones) {
        if (isValidPhoneNumber(phone)) {
            valid.push(phone);
        }
        else {
            invalid.push(phone);
        }
    }
    return { valid, invalid };
}
/**
 * Normalize phone number (format to E.164)
 */
function normalizePhoneNumber(phone, defaultCountryCode = "+1") {
    try {
        const formatted = formatPhoneNumber(phone, defaultCountryCode);
        if (isValidPhoneNumber(formatted)) {
            return formatted;
        }
        console_1.logger.warn("PhoneValidation", `Invalid phone number after formatting: original="${phone}", formatted="${formatted}"`);
        return null;
    }
    catch (error) {
        console_1.logger.error("PhoneValidation", `Phone number normalization failed for: ${phone}`, error instanceof Error ? error : new Error(String(error)));
        return null;
    }
}
/**
 * Check if phone is mobile (best effort, not 100% accurate)
 */
function isMobilePhone(phone) {
    if (!isValidPhoneNumber(phone)) {
        return false;
    }
    const countryCode = getCountryCode(phone);
    // US/Canada mobile check (rough estimate)
    if (countryCode === "1") {
        const number = phone.substring(2);
        // US mobile typically starts with 2-9 in area code
        const areaCode = number.substring(0, 3);
        return /^[2-9]/.test(areaCode);
    }
    // For other countries, assume mobile if valid
    // In production, use a proper phone number library
    return true;
}
/**
 * Get phone number metadata
 */
function getPhoneMetadata(phone) {
    const valid = isValidPhoneNumber(phone);
    return {
        valid,
        formatted: valid ? phone : null,
        countryCode: valid ? getCountryCode(phone) : null,
        displayFormat: valid ? formatPhoneForDisplay(phone) : null,
        isMobile: valid ? isMobilePhone(phone) : false,
    };
}
