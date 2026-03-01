"use strict";
/**
 * SMS Notification Channel
 * Handles SMS notifications via Twilio
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.SMSChannel = void 0;
const BaseChannel_1 = require("./BaseChannel");
const TwilioProvider_1 = require("../providers/sms/TwilioProvider");
const db_1 = require("@b/db");
/**
 * SMSChannel - SMS delivery via Twilio
 */
class SMSChannel extends BaseChannel_1.BaseChannel {
    constructor() {
        super("SMS");
        this.twilioProvider = new TwilioProvider_1.TwilioProvider();
    }
    /**
     * Send SMS notification
     */
    async send(operation, transaction) {
        try {
            this.log("Sending SMS notification", {
                userId: operation.userId,
                type: operation.type,
            });
            // Get user phone number
            const user = await db_1.models.user.findByPk(operation.userId, {
                attributes: ["phone", "firstName", "lastName"],
                transaction,
            });
            if (!user || !user.phone) {
                return {
                    success: false,
                    error: "User phone number not found",
                };
            }
            // Prepare SMS message
            const message = this.prepareSMSMessage(operation, user);
            // Send SMS via Twilio
            const result = await this.twilioProvider.send({
                to: user.phone,
                message,
                from: process.env.APP_TWILIO_PHONE_NUMBER,
            });
            if (!result.success) {
                this.logError("Failed to send SMS", {
                    error: result.error,
                    to: user.phone,
                });
                return result;
            }
            this.log("SMS sent successfully", {
                userId: operation.userId,
                to: user.phone,
                messageId: result.messageId,
            });
            return result;
        }
        catch (error) {
            this.logError("Failed to send SMS", error);
            return {
                success: false,
                error: error.message || "Failed to send SMS notification",
            };
        }
    }
    /**
     * Prepare SMS message with 160 character limit
     */
    prepareSMSMessage(operation, user) {
        const data = operation.data || {};
        // If custom SMS message provided, use it
        if (data.smsMessage) {
            return this.truncateMessage(data.smsMessage);
        }
        // Build SMS from title + message
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
        // Add link if present and space available
        if (data.link && sms.length < 140) {
            const baseUrl = process.env.APP_PUBLIC_URL || "https://yourapp.com";
            const fullLink = data.link.startsWith("http")
                ? data.link
                : `${baseUrl}${data.link}`;
            sms += ` ${fullLink}`;
        }
        // Truncate to 160 characters
        return this.truncateMessage(sms);
    }
    /**
     * Truncate message to 160 characters (single SMS length)
     */
    truncateMessage(message, maxLength = 160) {
        if (message.length <= maxLength) {
            return message;
        }
        // Truncate and add ellipsis
        return message.substring(0, maxLength - 3) + "...";
    }
    /**
     * Validate SMS channel is configured
     */
    validateConfig() {
        if (!process.env.APP_TWILIO_ACCOUNT_SID) {
            this.logError("APP_TWILIO_ACCOUNT_SID not configured", {});
            return false;
        }
        // Validate account SID format (must start with "AC")
        if (!process.env.APP_TWILIO_ACCOUNT_SID.startsWith("AC")) {
            this.logError("APP_TWILIO_ACCOUNT_SID must start with 'AC'", {});
            return false;
        }
        if (!process.env.APP_TWILIO_AUTH_TOKEN) {
            this.logError("APP_TWILIO_AUTH_TOKEN not configured", {});
            return false;
        }
        if (!process.env.APP_TWILIO_PHONE_NUMBER &&
            !process.env.APP_TWILIO_MESSAGING_SERVICE_SID) {
            this.logError("APP_TWILIO_PHONE_NUMBER or APP_TWILIO_MESSAGING_SERVICE_SID not configured", {});
            return false;
        }
        return this.twilioProvider.validateConfig();
    }
    /**
     * Verify phone number format
     */
    async verifyPhoneNumber(phoneNumber) {
        return this.twilioProvider.verifyPhoneNumber(phoneNumber);
    }
    /**
     * Get message status from Twilio
     */
    async getMessageStatus(messageSid) {
        return this.twilioProvider.getMessageStatus(messageSid);
    }
}
exports.SMSChannel = SMSChannel;
