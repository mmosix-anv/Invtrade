"use strict";
/**
 * Base Email Provider
 * Abstract class that all email providers must extend
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.BaseEmailProvider = void 0;
class BaseEmailProvider {
    constructor(name, config) {
        this.name = name;
        this.config = config || this.loadConfigFromEnv();
    }
    /**
     * Format email address
     */
    formatEmail(email, name) {
        if (name) {
            return `"${name}" <${email}>`;
        }
        return email;
    }
    /**
     * Validate email address
     */
    isValidEmail(email) {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return emailRegex.test(email);
    }
    /**
     * Log provider activity
     */
    log(message, data) {
        if (data !== undefined) {
            console.log(`[${this.name}] ${message}`, data);
        }
        else {
            console.log(`[${this.name}] ${message}`);
        }
    }
    /**
     * Log provider error
     */
    logError(message, error) {
        console.error(`[${this.name}] ERROR: ${message}`, error);
    }
}
exports.BaseEmailProvider = BaseEmailProvider;
