"use strict";
/**
 * SMS Template Engine
 * Handles SMS templates with 160 character limit
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.smsTemplateEngine = exports.SMSTemplateEngine = void 0;
const console_1 = require("@b/utils/console");
/**
 * SMSTemplateEngine - Simple template rendering for SMS
 */
class SMSTemplateEngine {
    constructor() {
        // Maximum SMS length
        this.SINGLE_SMS_LENGTH = 160;
        this.MULTIPART_SMS_LENGTH = 153; // 7 chars for headers
        // Silent initialization - no logging needed for singleton pattern
    }
    /**
     * Get singleton instance
     */
    static getInstance() {
        if (!SMSTemplateEngine.instance) {
            SMSTemplateEngine.instance = new SMSTemplateEngine();
        }
        return SMSTemplateEngine.instance;
    }
    /**
     * Render SMS template
     */
    render(template, data) {
        try {
            // Simple variable replacement: {{variable}}
            let message = template;
            // Replace all {{variable}} with data values
            message = message.replace(/\{\{([^}]+)\}\}/g, (match, key) => {
                const trimmedKey = key.trim();
                return data[trimmedKey] !== undefined
                    ? String(data[trimmedKey])
                    : match;
            });
            // Calculate length and parts
            const length = message.length;
            const parts = this.calculateParts(message);
            // Truncate if too long
            if (length > this.SINGLE_SMS_LENGTH) {
                console_1.logger.warn("SMSTemplateEngine", `SMS message exceeds single SMS length: ${length} chars, ${parts} parts`, template);
                // Truncate to single SMS
                message = this.truncate(message, this.SINGLE_SMS_LENGTH);
            }
            return {
                message,
                length: message.length,
                parts: this.calculateParts(message),
            };
        }
        catch (error) {
            console_1.logger.error("SMSTemplateEngine", `Failed to render SMS template: ${template}`, error instanceof Error ? error : new Error(String(error)));
            throw error;
        }
    }
    /**
     * Create SMS from notification data
     */
    createFromNotification(data) {
        let sms = "";
        // Add title if present
        if (data.title) {
            sms += data.title;
        }
        // Add message
        if (data.message) {
            if (sms.length > 0) {
                sms += ": ";
            }
            sms += data.message;
        }
        // Add link if space available
        if (data.link && sms.length < 140) {
            const baseUrl = process.env.APP_PUBLIC_URL || "https://yourapp.com";
            const fullLink = data.link.startsWith("http")
                ? data.link
                : `${baseUrl}${data.link}`;
            // Shorten link if possible
            const shortLink = this.shortenLink(fullLink);
            if (sms.length + shortLink.length + 1 <= this.SINGLE_SMS_LENGTH) {
                sms += ` ${shortLink}`;
            }
        }
        // Truncate if needed
        if (sms.length > this.SINGLE_SMS_LENGTH) {
            sms = this.truncate(sms, this.SINGLE_SMS_LENGTH);
        }
        return {
            message: sms,
            length: sms.length,
            parts: this.calculateParts(sms),
        };
    }
    /**
     * Calculate SMS parts needed
     */
    calculateParts(message) {
        if (message.length <= this.SINGLE_SMS_LENGTH) {
            return 1;
        }
        return Math.ceil(message.length / this.MULTIPART_SMS_LENGTH);
    }
    /**
     * Truncate message to specified length
     */
    truncate(message, maxLength) {
        if (message.length <= maxLength) {
            return message;
        }
        // Truncate and add ellipsis
        return message.substring(0, maxLength - 3) + "...";
    }
    /**
     * Shorten link (basic implementation)
     * In production, use a URL shortening service
     */
    shortenLink(url) {
        // Remove protocol
        let short = url.replace(/^https?:\/\//, "");
        // Remove www
        short = short.replace(/^www\./, "");
        // Remove trailing slash
        short = short.replace(/\/$/, "");
        // If still too long, truncate
        if (short.length > 30) {
            short = short.substring(0, 27) + "...";
        }
        return short;
    }
    /**
     * Validate template
     */
    validateTemplate(template, data) {
        const errors = [];
        // Check for undefined variables
        const variables = template.match(/\{\{([^}]+)\}\}/g);
        if (variables) {
            for (const variable of variables) {
                const key = variable.replace(/\{\{|\}\}/g, "").trim();
                if (data[key] === undefined) {
                    errors.push(`Missing data for variable: ${key}`);
                }
            }
        }
        // Check rendered length
        if (errors.length === 0) {
            const rendered = this.render(template, data);
            if (rendered.parts > 1) {
                errors.push(`Template renders to ${rendered.parts} SMS parts (${rendered.length} chars)`);
            }
        }
        return {
            valid: errors.length === 0,
            errors,
        };
    }
    /**
     * Get common SMS templates
     */
    getCommonTemplates() {
        return {
            // Trade notifications
            TRADE_COMPLETED: "Trade completed: {{pair}} {{side}} {{amount}} at {{price}}",
            TRADE_FAILED: "Trade failed: {{pair}} - {{reason}}",
            // Wallet notifications
            DEPOSIT_CONFIRMED: "Deposit confirmed: {{amount}} {{currency}} to your wallet",
            WITHDRAWAL_APPROVED: "Withdrawal approved: {{amount}} {{currency}} is being sent",
            WITHDRAWAL_COMPLETED: "Withdrawal completed: {{amount}} {{currency}}",
            // Security notifications
            LOGIN_NEW_DEVICE: "New login: {{device}} from {{location}}",
            PASSWORD_CHANGED: "Your password was changed. Contact support if not you.",
            TWO_FACTOR_ENABLED: "2FA enabled for your account",
            // System notifications
            MAINTENANCE_ALERT: "Maintenance: {{message}} at {{time}}",
            SYSTEM_ALERT: "Alert: {{message}}",
            // Verification
            VERIFY_PHONE: "Your verification code: {{code}}",
            OTP_CODE: "Your OTP code: {{code}} - Valid for {{minutes}} minutes",
        };
    }
}
exports.SMSTemplateEngine = SMSTemplateEngine;
// Export singleton instance
exports.smsTemplateEngine = SMSTemplateEngine.getInstance();
