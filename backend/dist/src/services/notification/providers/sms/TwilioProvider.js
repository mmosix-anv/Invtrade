"use strict";
/**
 * Twilio SMS Provider
 * Uses Twilio API for SMS sending
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.TwilioProvider = void 0;
const twilio_1 = require("twilio");
const BaseSMSProvider_1 = require("./BaseSMSProvider");
class TwilioProvider extends BaseSMSProvider_1.BaseSMSProvider {
    constructor(config) {
        super("Twilio", config);
        if (this.validateConfig()) {
            try {
                this.initializeClient();
            }
            catch (error) {
                // Don't throw during initialization - just log the error
                // This allows the server to start even with invalid Twilio config
                this.logError("Failed to initialize Twilio client", error);
            }
        }
    }
    /**
     * Load Twilio configuration from environment
     */
    loadConfigFromEnv() {
        return {
            accountSid: process.env.APP_TWILIO_ACCOUNT_SID,
            authToken: process.env.APP_TWILIO_AUTH_TOKEN,
            fromNumber: process.env.APP_TWILIO_PHONE_NUMBER,
            messagingServiceSid: process.env.APP_TWILIO_MESSAGING_SERVICE_SID, // Optional
        };
    }
    /**
     * Validate Twilio configuration
     */
    validateConfig() {
        if (!this.config.accountSid) {
            this.logError("Missing APP_TWILIO_ACCOUNT_SID", {});
            return false;
        }
        // Twilio account SID must start with "AC"
        if (!this.config.accountSid.startsWith("AC")) {
            this.logError("Invalid APP_TWILIO_ACCOUNT_SID - must start with 'AC'", {});
            return false;
        }
        if (!this.config.authToken) {
            this.logError("Missing APP_TWILIO_AUTH_TOKEN", {});
            return false;
        }
        // Must have either fromNumber or messagingServiceSid
        if (!this.config.fromNumber && !this.config.messagingServiceSid) {
            this.logError("Missing APP_TWILIO_PHONE_NUMBER or APP_TWILIO_MESSAGING_SERVICE_SID", {});
            return false;
        }
        return true;
    }
    /**
     * Initialize Twilio client
     */
    initializeClient() {
        try {
            this.client = new twilio_1.Twilio(this.config.accountSid, this.config.authToken);
        }
        catch (error) {
            this.logError("Failed to initialize Twilio client", error);
            throw error;
        }
    }
    /**
     * Send SMS via Twilio
     */
    async send(data) {
        try {
            // Validate config and client
            if (!this.validateConfig() || !this.client) {
                throw new Error("Twilio configuration is invalid or client not initialized");
            }
            // Validate and format phone number
            const toNumber = this.formatPhoneNumber(data.to);
            if (!this.validatePhoneNumber(toNumber)) {
                return {
                    success: false,
                    error: `Invalid phone number format: ${data.to}`,
                };
            }
            // Truncate message if too long
            const message = this.truncateMessage(data.message, 160);
            // Calculate SMS parts
            const parts = this.calculateSMSParts(message);
            if (parts > 1) {
                this.log(`Message will be sent in ${parts} parts`, {
                    originalLength: data.message.length,
                });
            }
            // Prepare message options
            const messageOptions = {
                to: toNumber,
                body: message,
            };
            // Use messaging service SID or from number
            if (this.config.messagingServiceSid) {
                messageOptions.messagingServiceSid = this.config.messagingServiceSid;
            }
            else {
                messageOptions.from = data.from || this.config.fromNumber;
            }
            // Send SMS via Twilio
            const twilioMessage = await this.client.messages.create(messageOptions);
            this.log("SMS sent successfully", {
                to: toNumber,
                sid: twilioMessage.sid,
                status: twilioMessage.status,
                parts,
            });
            return {
                success: true,
                messageId: `twilio-${twilioMessage.sid}`,
                externalId: twilioMessage.sid,
                metadata: {
                    status: twilioMessage.status,
                    parts,
                    price: twilioMessage.price,
                    priceUnit: twilioMessage.priceUnit,
                },
            };
        }
        catch (error) {
            this.logError("Failed to send SMS", error);
            return {
                success: false,
                error: error.message || "Failed to send SMS via Twilio",
            };
        }
    }
    /**
     * Get message status from Twilio
     */
    async getMessageStatus(messageSid) {
        try {
            if (!this.client) {
                throw new Error("Twilio client not initialized");
            }
            const message = await this.client.messages(messageSid).fetch();
            return {
                sid: message.sid,
                status: message.status,
                to: message.to,
                from: message.from,
                body: message.body,
                errorCode: message.errorCode,
                errorMessage: message.errorMessage,
                dateCreated: message.dateCreated,
                dateSent: message.dateSent,
                dateUpdated: message.dateUpdated,
            };
        }
        catch (error) {
            this.logError("Failed to get message status", error);
            throw error;
        }
    }
    /**
     * Verify phone number with Twilio Lookup API
     */
    async verifyPhoneNumber(phoneNumber) {
        try {
            if (!this.client) {
                throw new Error("Twilio client not initialized");
            }
            const formatted = this.formatPhoneNumber(phoneNumber);
            const lookup = await this.client.lookups.v1
                .phoneNumbers(formatted)
                .fetch();
            return {
                valid: true,
                phoneNumber: lookup.phoneNumber,
                countryCode: lookup.countryCode,
                nationalFormat: lookup.nationalFormat,
            };
        }
        catch (error) {
            this.logError("Phone number verification failed", error);
            return {
                valid: false,
                error: error.message,
            };
        }
    }
}
exports.TwilioProvider = TwilioProvider;
