"use strict";
/**
 * Base SMS Provider
 * Abstract class for all SMS providers
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.BaseSMSProvider = void 0;
const console_1 = require("@b/utils/console");
/**
 * BaseSMSProvider - Abstract class for SMS providers
 */
class BaseSMSProvider {
    constructor(name, config) {
        this.name = name;
        this.config = config || this.loadConfigFromEnv();
    }
    /**
     * Validate phone number format (E.164)
     */
    validatePhoneNumber(phone) {
        // E.164 format: +[country code][number]
        // Example: +1234567890
        const e164Regex = /^\+[1-9]\d{1,14}$/;
        return e164Regex.test(phone);
    }
    /**
     * Format phone number to E.164
     */
    formatPhoneNumber(phone, defaultCountryCode = "+1") {
        // Remove all non-digit characters except +
        let formatted = phone.replace(/[^\d+]/g, "");
        // If doesn't start with +, add default country code
        if (!formatted.startsWith("+")) {
            formatted = defaultCountryCode + formatted;
        }
        return formatted;
    }
    /**
     * Truncate message to SMS length (160 chars for single SMS)
     */
    truncateMessage(message, maxLength = 160) {
        if (message.length <= maxLength) {
            return message;
        }
        // Truncate and add ellipsis
        return message.substring(0, maxLength - 3) + "...";
    }
    /**
     * Calculate SMS parts needed
     */
    calculateSMSParts(message) {
        // Single SMS: 160 chars
        // Multi-part SMS: 153 chars per part (7 chars for headers)
        if (message.length <= 160) {
            return 1;
        }
        return Math.ceil(message.length / 153);
    }
    /**
     * Format email to phone number
     * Some providers allow sending to email addresses
     */
    formatEmail(email, domain) {
        return `${email}@${domain}`;
    }
    /**
     * Log message
     */
    log(message, data) {
        if (data !== undefined) {
            console_1.logger.info(`SMS:${this.name}`, message, data);
        }
        else {
            console_1.logger.info(`SMS:${this.name}`, message);
        }
    }
    /**
     * Log error
     */
    logError(message, error) {
        console_1.logger.error(`SMS:${this.name}`, message, error instanceof Error ? error : new Error(JSON.stringify(error)));
    }
}
exports.BaseSMSProvider = BaseSMSProvider;
