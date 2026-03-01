"use strict";
/**
 * Push Notification Template Engine
 * Handles push notification templates with platform-specific formatting
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.pushTemplateEngine = exports.PushTemplateEngine = void 0;
const console_1 = require("@b/utils/console");
/**
 * PushTemplateEngine - Template rendering for push notifications
 */
class PushTemplateEngine {
    constructor() {
        // Maximum lengths for push notifications
        this.MAX_TITLE_LENGTH = 65; // FCM limit
        this.MAX_BODY_LENGTH = 240; // FCM limit
        // Silent initialization - no logging needed for singleton pattern
    }
    /**
     * Get singleton instance
     */
    static getInstance() {
        if (!PushTemplateEngine.instance) {
            PushTemplateEngine.instance = new PushTemplateEngine();
        }
        return PushTemplateEngine.instance;
    }
    /**
     * Render push notification template
     */
    render(titleTemplate, bodyTemplate, data) {
        try {
            // Replace variables in title
            let title = this.replaceVariables(titleTemplate, data);
            // Replace variables in body
            let body = this.replaceVariables(bodyTemplate, data);
            // Truncate if needed
            title = this.truncate(title, this.MAX_TITLE_LENGTH);
            body = this.truncate(body, this.MAX_BODY_LENGTH);
            return {
                title,
                body,
                data: this.extractStringData(data),
                imageUrl: data.imageUrl,
                icon: data.icon,
            };
        }
        catch (error) {
            console_1.logger.error("PushTemplateEngine", `Failed to render push template: title="${titleTemplate}", body="${bodyTemplate}"`, error instanceof Error ? error : new Error(String(error)));
            throw error;
        }
    }
    /**
     * Create push notification from notification data
     */
    createFromNotification(data) {
        return {
            title: this.truncate(data.title, this.MAX_TITLE_LENGTH),
            body: this.truncate(data.message, this.MAX_BODY_LENGTH),
            imageUrl: data.imageUrl,
            icon: data.icon,
            data: this.extractStringData(data.customData || {}),
        };
    }
    /**
     * Replace variables in template
     */
    replaceVariables(template, data) {
        // Simple variable replacement: {{variable}}
        return template.replace(/\{\{([^}]+)\}\}/g, (match, key) => {
            const trimmedKey = key.trim();
            return data[trimmedKey] !== undefined ? String(data[trimmedKey]) : match;
        });
    }
    /**
     * Truncate text to maximum length
     */
    truncate(text, maxLength) {
        if (text.length <= maxLength) {
            return text;
        }
        // Truncate and add ellipsis
        return text.substring(0, maxLength - 1) + "…";
    }
    /**
     * Extract string data for FCM data payload
     * FCM requires all data values to be strings
     */
    extractStringData(data) {
        const stringData = {};
        for (const [key, value] of Object.entries(data)) {
            if (value !== null && value !== undefined) {
                stringData[key] = String(value);
            }
        }
        return stringData;
    }
    /**
     * Get common push templates
     */
    getCommonTemplates() {
        return {
            // Trade notifications
            TRADE_COMPLETED: {
                title: "Trade Completed",
                body: "{{pair}} {{side}} order filled at {{price}}",
            },
            TRADE_FAILED: {
                title: "Trade Failed",
                body: "{{pair}} order failed: {{reason}}",
            },
            // Wallet notifications
            DEPOSIT_CONFIRMED: {
                title: "Deposit Confirmed",
                body: "{{amount}} {{currency}} deposited to your wallet",
            },
            WITHDRAWAL_COMPLETED: {
                title: "Withdrawal Completed",
                body: "{{amount}} {{currency}} sent successfully",
            },
            // Security notifications
            LOGIN_NEW_DEVICE: {
                title: "New Login Detected",
                body: "Login from {{device}} in {{location}}",
            },
            PASSWORD_CHANGED: {
                title: "Password Changed",
                body: "Your password was changed. Contact support if this wasn't you.",
            },
            TWO_FACTOR_ENABLED: {
                title: "2FA Enabled",
                body: "Two-factor authentication has been enabled for your account",
            },
            // System notifications
            MAINTENANCE_ALERT: {
                title: "Maintenance Alert",
                body: "{{message}} scheduled for {{time}}",
            },
            SYSTEM_UPDATE: {
                title: "System Update",
                body: "{{message}}",
            },
            // Price alerts
            PRICE_ALERT: {
                title: "Price Alert",
                body: "{{pair}} reached {{price}} ({{change}})",
            },
            // Order updates
            ORDER_FILLED: {
                title: "Order Filled",
                body: "{{pair}} {{side}} order filled at {{price}}",
            },
            ORDER_CANCELLED: {
                title: "Order Cancelled",
                body: "{{pair}} order cancelled",
            },
        };
    }
    /**
     * Render with fallback
     */
    renderWithFallback(titleTemplate, bodyTemplate, data, fallback) {
        try {
            return this.render(titleTemplate, bodyTemplate, data);
        }
        catch (error) {
            if (fallback) {
                console_1.logger.warn("PushTemplateEngine", "Using fallback push template", error instanceof Error ? error.message : String(error));
                return {
                    title: this.truncate(fallback.title, this.MAX_TITLE_LENGTH),
                    body: this.truncate(fallback.body, this.MAX_BODY_LENGTH),
                };
            }
            throw error;
        }
    }
    /**
     * Validate template
     */
    validateTemplate(titleTemplate, bodyTemplate, data) {
        const errors = [];
        // Check for undefined variables in title
        const titleVariables = titleTemplate.match(/\{\{([^}]+)\}\}/g);
        if (titleVariables) {
            for (const variable of titleVariables) {
                const key = variable.replace(/\{\{|\}\}/g, "").trim();
                if (data[key] === undefined) {
                    errors.push(`Missing data for title variable: ${key}`);
                }
            }
        }
        // Check for undefined variables in body
        const bodyVariables = bodyTemplate.match(/\{\{([^}]+)\}\}/g);
        if (bodyVariables) {
            for (const variable of bodyVariables) {
                const key = variable.replace(/\{\{|\}\}/g, "").trim();
                if (data[key] === undefined) {
                    errors.push(`Missing data for body variable: ${key}`);
                }
            }
        }
        // Check rendered lengths
        if (errors.length === 0) {
            const rendered = this.render(titleTemplate, bodyTemplate, data);
            if (rendered.title.length > this.MAX_TITLE_LENGTH) {
                errors.push(`Title too long: ${rendered.title.length} chars (max ${this.MAX_TITLE_LENGTH})`);
            }
            if (rendered.body.length > this.MAX_BODY_LENGTH) {
                errors.push(`Body too long: ${rendered.body.length} chars (max ${this.MAX_BODY_LENGTH})`);
            }
        }
        return {
            valid: errors.length === 0,
            errors,
        };
    }
    /**
     * Create rich notification with image
     */
    createRichNotification(data) {
        return {
            title: this.truncate(data.title, this.MAX_TITLE_LENGTH),
            body: this.truncate(data.body, this.MAX_BODY_LENGTH),
            imageUrl: data.imageUrl,
            icon: data.icon,
            data: this.extractStringData(data.customData || {}),
        };
    }
    /**
     * Create action notification with buttons
     */
    createActionNotification(data) {
        const actionData = {
            ...this.extractStringData(data.customData || {}),
            actions: JSON.stringify(data.actions),
        };
        return {
            title: this.truncate(data.title, this.MAX_TITLE_LENGTH),
            body: this.truncate(data.body, this.MAX_BODY_LENGTH),
            data: actionData,
        };
    }
}
exports.PushTemplateEngine = PushTemplateEngine;
// Export singleton instance
exports.pushTemplateEngine = PushTemplateEngine.getInstance();
