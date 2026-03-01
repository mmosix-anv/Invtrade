"use strict";
/**
 * Nodemailer Email Provider
 * Uses Nodemailer for SMTP email sending
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.NodemailerProvider = void 0;
const BaseEmailProvider_1 = require("./BaseEmailProvider");
// Use require for nodemailer to ensure proper CommonJS interop
const nodemailer = require("nodemailer");
class NodemailerProvider extends BaseEmailProvider_1.BaseEmailProvider {
    constructor(config) {
        super("Nodemailer", config);
        if (this.validateConfig()) {
            this.initializeTransporter();
        }
    }
    /**
     * Load Nodemailer configuration from environment
     */
    loadConfigFromEnv() {
        const service = process.env.APP_NODEMAILER_SERVICE; // e.g., 'gmail', 'yahoo'
        const host = process.env.APP_NODEMAILER_SMTP_HOST;
        const port = parseInt(process.env.APP_NODEMAILER_SMTP_PORT || "587");
        const secure = process.env.APP_NODEMAILER_SMTP_ENCRYPTION === "ssl";
        // Support both service-based and SMTP-based authentication
        const user = service
            ? process.env.APP_NODEMAILER_SERVICE_SENDER
            : (process.env.APP_NODEMAILER_SMTP_USERNAME || process.env.APP_NODEMAILER_SMTP_SENDER);
        const pass = service
            ? process.env.APP_NODEMAILER_SERVICE_PASSWORD
            : process.env.APP_NODEMAILER_SMTP_PASSWORD;
        return {
            service, // For service-based (Gmail, Yahoo, etc.)
            host, // For custom SMTP
            port,
            secure,
            auth: {
                user,
                pass,
            },
            from: process.env.NEXT_PUBLIC_APP_EMAIL || process.env.APP_EMAIL_FROM || "noreply@example.com",
            fromName: process.env.APP_EMAIL_SENDER_NAME || "Notification Service",
        };
    }
    /**
     * Validate Nodemailer configuration
     */
    validateConfig() {
        // Must have either service OR host
        if (!this.config.service && !this.config.host) {
            this.logError("Missing SMTP service or host configuration", {});
            return false;
        }
        // Must have auth credentials
        if (!this.config.auth || !this.config.auth.user || !this.config.auth.pass) {
            this.logError("Missing SMTP authentication credentials", {});
            return false;
        }
        return true;
    }
    /**
     * Initialize Nodemailer transporter
     */
    initializeTransporter() {
        try {
            const transportConfig = {
                auth: this.config.auth,
            };
            // Service-based configuration (Gmail, Yahoo, etc.)
            if (this.config.service) {
                transportConfig.service = this.config.service;
            }
            // Custom SMTP configuration
            else if (this.config.host) {
                transportConfig.host = this.config.host;
                transportConfig.port = this.config.port;
                transportConfig.secure = this.config.secure;
            }
            this.transporter = nodemailer.createTransport(transportConfig);
            this.log("Transporter initialized successfully");
        }
        catch (error) {
            this.logError("Failed to initialize transporter", error);
            throw error;
        }
    }
    /**
     * Send email via Nodemailer
     */
    async send(data) {
        try {
            // Validate config and transporter
            if (!this.validateConfig() || !this.transporter) {
                throw new Error("Nodemailer configuration is invalid or transporter not initialized");
            }
            // Prepare mail options
            const mailOptions = {
                from: data.from || this.formatEmail(this.config.from, this.config.fromName),
                to: Array.isArray(data.to) ? data.to.join(", ") : data.to,
                subject: data.subject,
                html: data.html,
                text: data.text || this.stripHtml(data.html),
            };
            // Optional fields
            if (data.replyTo) {
                mailOptions.replyTo = data.replyTo;
            }
            if (data.cc && data.cc.length > 0) {
                mailOptions.cc = data.cc.join(", ");
            }
            if (data.bcc && data.bcc.length > 0) {
                mailOptions.bcc = data.bcc.join(", ");
            }
            if (data.attachments && data.attachments.length > 0) {
                mailOptions.attachments = data.attachments;
            }
            // Send email
            const info = await this.transporter.sendMail(mailOptions);
            this.log("Email sent successfully", {
                to: data.to,
                subject: data.subject,
                messageId: info.messageId,
            });
            return {
                success: true,
                externalId: info.messageId,
                messageId: `nodemailer-${info.messageId}`,
            };
        }
        catch (error) {
            this.logError("Failed to send email", error);
            return {
                success: false,
                error: error.message || "Failed to send email via Nodemailer",
            };
        }
    }
    /**
     * Strip HTML tags for plain text version
     */
    stripHtml(html) {
        return html
            .replace(/<[^>]*>/g, "")
            .replace(/&nbsp;/g, " ")
            .replace(/&amp;/g, "&")
            .replace(/&lt;/g, "<")
            .replace(/&gt;/g, ">")
            .trim();
    }
    /**
     * Verify transporter connection
     */
    async verifyConnection() {
        try {
            await this.transporter.verify();
            this.log("Connection verified successfully");
            return true;
        }
        catch (error) {
            this.logError("Connection verification failed", error);
            return false;
        }
    }
}
exports.NodemailerProvider = NodemailerProvider;
