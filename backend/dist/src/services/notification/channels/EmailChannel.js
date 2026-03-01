"use strict";
/**
 * Email Notification Channel
 * Handles email notifications using queue-based delivery
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.EmailChannel = void 0;
const BaseChannel_1 = require("./BaseChannel");
const NotificationQueue_1 = require("../queue/NotificationQueue");
const TemplateEngine_1 = require("../templates/TemplateEngine");
const db_1 = require("@b/db");
/**
 * EmailChannel - Async email delivery via Bull queue
 */
class EmailChannel extends BaseChannel_1.BaseChannel {
    constructor() {
        super("EMAIL");
    }
    /**
     * Send email notification
     * Queues the email for async delivery
     */
    async send(operation, transaction) {
        try {
            this.log("Sending email notification", {
                userId: operation.userId,
                type: operation.type,
            });
            // Get user email
            const user = await db_1.models.user.findByPk(operation.userId, {
                attributes: ["email", "firstName", "lastName"],
                transaction,
            });
            if (!user || !user.email) {
                return {
                    success: false,
                    error: "User email not found",
                };
            }
            // Determine email provider from environment
            const emailer = process.env.APP_EMAILER || "nodemailer";
            const provider = this.getProviderFromEmailer(emailer);
            // Prepare template data
            const data = operation.data || {};
            const templateData = {
                user: {
                    firstName: user.firstName,
                    lastName: user.lastName,
                    email: user.email,
                },
                notification: {
                    title: data.title,
                    message: data.message,
                    link: data.link,
                    type: operation.type,
                    priority: operation.priority || "NORMAL",
                },
                ...data.templateData, // Additional custom data
            };
            // Render template or create simple email
            let emailContent;
            if (data.templateName) {
                // Use template from database
                try {
                    emailContent = await TemplateEngine_1.templateEngine.render(data.templateName, templateData);
                }
                catch (templateError) {
                    this.logError("Template rendering failed, using simple email", {
                        templateName: data.templateName,
                        error: templateError,
                    });
                    // Fallback to simple email
                    emailContent = TemplateEngine_1.templateEngine.createSimpleEmail(data.title, data.message, data.templateData);
                }
            }
            else {
                // No template specified, create simple email
                emailContent = TemplateEngine_1.templateEngine.createSimpleEmail(data.title, data.message, data.templateData);
            }
            // Prepare email data
            const emailData = {
                to: user.email,
                subject: emailContent.subject,
                html: emailContent.html,
                text: emailContent.text,
                from: data.from || undefined,
                replyTo: data.replyTo || undefined,
                attachments: data.attachments || undefined,
            };
            // Calculate priority for queue
            const queuePriority = this.getQueuePriority(operation.priority);
            // Add to queue for async delivery
            const job = await NotificationQueue_1.notificationQueue.addEmailJob(provider, emailData, data.relatedId || `notif-${Date.now()}`, operation.userId, queuePriority);
            this.log("Email queued successfully", {
                userId: operation.userId,
                jobId: job.id,
                provider,
                to: user.email,
            });
            return {
                success: true,
                messageId: `email-job-${job.id}`,
                externalId: String(job.id),
            };
        }
        catch (error) {
            this.logError("Failed to queue email", error);
            return {
                success: false,
                error: error.message || "Failed to queue email notification",
            };
        }
    }
    /**
     * Get email provider from APP_EMAILER env variable
     */
    getProviderFromEmailer(emailer) {
        // APP_EMAILER can be:
        // - "sendgrid"
        // - "nodemailer-sendgrid"
        // - "nodemailer"
        // - "nodemailer-gmail"
        // etc.
        if (emailer.includes("sendgrid")) {
            return "sendgrid";
        }
        return "nodemailer";
    }
    /**
     * Convert notification priority to queue priority
     */
    getQueuePriority(priority) {
        switch (priority) {
            case "URGENT":
                return 10;
            case "HIGH":
                return 5;
            case "NORMAL":
                return 0;
            case "LOW":
                return -5;
            default:
                return 0;
        }
    }
    /**
     * Validate email channel is configured
     */
    validateConfig() {
        const emailer = process.env.APP_EMAILER;
        if (!emailer) {
            this.logError("APP_EMAILER not configured", {});
            return false;
        }
        // Check provider-specific config
        if (emailer.includes("sendgrid")) {
            if (!process.env.APP_SENDGRID_API_KEY) {
                this.logError("SendGrid API key not configured", {});
                return false;
            }
        }
        else {
            // Nodemailer config
            if (!process.env.APP_NODEMAILER_SERVICE &&
                !process.env.APP_NODEMAILER_SMTP_HOST) {
                this.logError("Nodemailer service/host not configured", {});
                return false;
            }
            if (!process.env.APP_NODEMAILER_SMTP_USERNAME ||
                !process.env.APP_NODEMAILER_SMTP_PASSWORD) {
                this.logError("Nodemailer credentials not configured", {});
                return false;
            }
        }
        return true;
    }
}
exports.EmailChannel = EmailChannel;
