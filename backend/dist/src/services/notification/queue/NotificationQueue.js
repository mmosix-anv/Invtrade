"use strict";
/**
 * Notification Queue Service
 * Wraps Bull queue for async email delivery
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.notificationQueue = exports.NotificationQueue = void 0;
const bull_1 = __importDefault(require("bull"));
const SendGridProvider_1 = require("../providers/email/SendGridProvider");
const NodemailerProvider_1 = require("../providers/email/NodemailerProvider");
const console_1 = require("@b/utils/console");
/**
 * NotificationQueue - Bull queue wrapper for async email delivery
 */
class NotificationQueue {
    constructor() {
        // Initialize Bull queue
        this.queue = new bull_1.default("notification-emails", {
            redis: {
                host: process.env.REDIS_HOST || "localhost",
                port: parseInt(process.env.REDIS_PORT || "6379"),
                password: process.env.REDIS_PASSWORD,
                db: parseInt(process.env.REDIS_DB || "0"),
            },
            defaultJobOptions: {
                attempts: 3, // Retry up to 3 times
                backoff: {
                    type: "exponential",
                    delay: 2000, // Start with 2s delay, then exponential backoff
                },
                removeOnComplete: 100, // Keep last 100 completed jobs
                removeOnFail: 500, // Keep last 500 failed jobs
            },
        });
        // Initialize email providers
        this.sendGridProvider = new SendGridProvider_1.SendGridProvider();
        this.nodemailerProvider = new NodemailerProvider_1.NodemailerProvider();
        // Register job processor
        this.queue.process(this.processEmailJob.bind(this));
        // Register event handlers
        this.registerEventHandlers();
    }
    /**
     * Get singleton instance
     */
    static getInstance() {
        if (!NotificationQueue.instance) {
            NotificationQueue.instance = new NotificationQueue();
        }
        return NotificationQueue.instance;
    }
    /**
     * Add email job to queue
     */
    async addEmailJob(provider, emailData, notificationId, userId, priority) {
        try {
            const job = await this.queue.add({
                provider,
                emailData,
                notificationId,
                userId,
            }, {
                priority: priority || 0, // Higher number = higher priority
            });
            console_1.logger.info("Queue", `Email job added to queue: ${job.id}`, {
                jobId: job.id,
                provider,
                notificationId,
                to: emailData.to,
            });
            return job;
        }
        catch (error) {
            console_1.logger.error("Queue", `Failed to add email job to queue: provider=${provider}, notificationId=${notificationId}`, error instanceof Error ? error : new Error(String(error)));
            throw error;
        }
    }
    /**
     * Process email job
     */
    async processEmailJob(job) {
        const { provider, emailData, notificationId, userId } = job.data;
        console_1.logger.info("Queue", `Processing email job: ${job.id}`, {
            jobId: job.id,
            provider,
            notificationId,
            attempt: job.attemptsMade + 1,
        });
        try {
            let result;
            // Select provider and send
            if (provider === "sendgrid") {
                result = await this.sendGridProvider.send(emailData);
            }
            else if (provider === "nodemailer") {
                result = await this.nodemailerProvider.send(emailData);
            }
            else {
                throw new Error(`Unknown email provider: ${provider}`);
            }
            if (!result.success) {
                throw new Error(result.error || "Email send failed");
            }
            console_1.logger.info("Queue", `Email job completed successfully: ${job.id}`, {
                jobId: job.id,
                provider,
                notificationId,
                messageId: result.messageId,
            });
            return result;
        }
        catch (error) {
            console_1.logger.error("Queue", `Email job failed: jobId=${job.id}, provider=${provider}, notificationId=${notificationId}, attempt=${job.attemptsMade + 1}`, error instanceof Error ? error : new Error(String(error)));
            // Re-throw to trigger retry
            throw error;
        }
    }
    /**
     * Register event handlers for queue monitoring
     */
    registerEventHandlers() {
        this.queue.on("completed", (job, result) => {
            console_1.logger.info("Queue", `Email job completed: ${job.id}`, {
                jobId: job.id,
                notificationId: job.data.notificationId,
                messageId: result.messageId,
            });
        });
        this.queue.on("failed", (job, error) => {
            console_1.logger.error("Queue", `Email job failed permanently: jobId=${job.id}, notificationId=${job.data.notificationId}, attempts=${job.attemptsMade}`, error instanceof Error ? error : new Error(String(error)));
        });
        this.queue.on("stalled", (job) => {
            console_1.logger.warn("Queue", `Email job stalled: jobId=${job.id}, notificationId=${job.data.notificationId}`);
        });
        this.queue.on("error", (error) => {
            console_1.logger.error("Queue", "Queue error occurred", error instanceof Error ? error : new Error(String(error)));
        });
    }
    /**
     * Get queue statistics
     */
    async getStats() {
        const [waiting, active, completed, failed, delayed] = await Promise.all([
            this.queue.getWaitingCount(),
            this.queue.getActiveCount(),
            this.queue.getCompletedCount(),
            this.queue.getFailedCount(),
            this.queue.getDelayedCount(),
        ]);
        return {
            waiting,
            active,
            completed,
            failed,
            delayed,
        };
    }
    /**
     * Get job by ID
     */
    async getJob(jobId) {
        return this.queue.getJob(jobId);
    }
    /**
     * Retry failed job
     */
    async retryFailedJob(jobId) {
        const job = await this.queue.getJob(jobId);
        if (!job) {
            throw new Error(`Job ${jobId} not found`);
        }
        await job.retry();
        console_1.logger.info("Queue", `Retrying failed job: ${jobId}`);
    }
    /**
     * Clean old jobs
     */
    async cleanOldJobs(grace = 24 * 60 * 60 * 1000) {
        // grace period in milliseconds (default: 24 hours)
        const completedJobs = await this.queue.clean(grace, "completed");
        const failedJobs = await this.queue.clean(grace, "failed");
        console_1.logger.info("Queue", `Cleaned old jobs: ${completedJobs.length} completed, ${failedJobs.length} failed`);
        // Extract job IDs from the Job arrays
        const completedIds = completedJobs.map((job) => parseInt(job.id));
        const failedIds = failedJobs.map((job) => parseInt(job.id));
        return [...completedIds, ...failedIds];
    }
    /**
     * Pause queue
     */
    async pause() {
        await this.queue.pause();
        console_1.logger.info("Queue", "Queue paused");
    }
    /**
     * Resume queue
     */
    async resume() {
        await this.queue.resume();
        console_1.logger.info("Queue", "Queue resumed");
    }
    /**
     * Close queue connection
     */
    async close() {
        await this.queue.close();
        console_1.logger.info("Queue", "Queue closed");
    }
}
exports.NotificationQueue = NotificationQueue;
// Export singleton instance
exports.notificationQueue = NotificationQueue.getInstance();
