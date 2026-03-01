"use strict";
/**
 * Copy Trading Queue System
 *
 * Implements a high-performance queue-based system for processing copy trades
 * to prevent blocking the main thread when leaders have many followers.
 *
 * Features:
 * - Non-blocking async processing
 * - Batch processing for efficiency
 * - Concurrent follower processing with configurable limits
 * - Automatic retry logic for failed trades
 * - Priority queue for time-sensitive trades
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.CopyTradeQueue = void 0;
exports.queueLeaderTrade = queueLeaderTrade;
exports.startCopyQueue = startCopyQueue;
exports.stopCopyQueue = stopCopyQueue;
exports.getCopyQueueStats = getCopyQueueStats;
const console_1 = require("@b/utils/console");
const error_1 = require("@b/utils/error");
const copyProcessor_1 = require("./copyProcessor");
const db_1 = require("@b/db");
// ============================================================================
// CONFIGURATION
// ============================================================================
const CONFIG = {
    // Maximum number of followers to process concurrently per leader trade
    MAX_CONCURRENT_FOLLOWERS: 10,
    // Queue processing interval (milliseconds)
    QUEUE_PROCESS_INTERVAL: 100, // Process every 100ms
    // Maximum queue size before warning
    MAX_QUEUE_SIZE: 1000,
    // Batch size for database queries
    BATCH_SIZE: 50,
    // Retry configuration
    MAX_RETRIES: 3,
    RETRY_DELAY: 1000, // 1 second
};
// ============================================================================
// QUEUE IMPLEMENTATION
// ============================================================================
class CopyTradeQueue {
    constructor() {
        this.pendingQueue = [];
        this.processingSet = new Set();
        this.completedCount = 0;
        this.failedCount = 0;
        this.processingTimes = [];
        this.isProcessing = false;
        this.processInterval = null;
    }
    static getInstance() {
        if (!CopyTradeQueue.instance) {
            CopyTradeQueue.instance = new CopyTradeQueue();
        }
        return CopyTradeQueue.instance;
    }
    /**
     * Start the queue processor
     */
    start() {
        if (this.processInterval) {
            console_1.logger.warn("COPY_TRADING", "Queue processor already running");
            return;
        }
        this.processInterval = setInterval(() => {
            this.processQueue().catch((error) => {
                console_1.logger.error("COPY_TRADING", "Queue processing error", error);
            });
        }, CONFIG.QUEUE_PROCESS_INTERVAL);
        console_1.logger.info("COPY_TRADING", "Copy trade queue processor started");
    }
    /**
     * Stop the queue processor
     */
    stop() {
        if (this.processInterval) {
            clearInterval(this.processInterval);
            this.processInterval = null;
            console_1.logger.info("COPY_TRADING", "Copy trade queue processor stopped");
        }
    }
    /**
     * Add a leader trade to the processing queue
     */
    async enqueue(leaderTradeId, leaderId, symbol, priority = 0) {
        // Check queue size
        if (this.pendingQueue.length >= CONFIG.MAX_QUEUE_SIZE) {
            console_1.logger.warn("COPY_TRADING", `Queue size limit reached (${CONFIG.MAX_QUEUE_SIZE})`);
        }
        const task = {
            id: `${leaderTradeId}_${Date.now()}`,
            leaderTradeId,
            leaderId,
            symbol,
            priority,
            createdAt: new Date(),
            retries: 0,
        };
        // Insert based on priority (higher priority first)
        const insertIndex = this.pendingQueue.findIndex(t => t.priority < priority);
        if (insertIndex === -1) {
            this.pendingQueue.push(task);
        }
        else {
            this.pendingQueue.splice(insertIndex, 0, task);
        }
        console_1.logger.debug("COPY_TRADING", `Enqueued trade ${leaderTradeId} (priority: ${priority}, queue size: ${this.pendingQueue.length})`);
    }
    /**
     * Process the queue in batches
     */
    async processQueue() {
        if (this.isProcessing || this.pendingQueue.length === 0) {
            return;
        }
        this.isProcessing = true;
        try {
            // Take next task from queue
            const task = this.pendingQueue.shift();
            if (!task) {
                return;
            }
            this.processingSet.add(task.id);
            const startTime = Date.now();
            try {
                await this.processTask(task);
                // Track success
                this.completedCount++;
                const processingTime = Date.now() - startTime;
                this.processingTimes.push(processingTime);
                // Keep only last 100 processing times for average calculation
                if (this.processingTimes.length > 100) {
                    this.processingTimes.shift();
                }
                console_1.logger.debug("COPY_TRADING", `Completed task ${task.id} in ${processingTime}ms`);
            }
            catch (error) {
                console_1.logger.error("COPY_TRADING", `Task ${task.id} failed`, error);
                // Retry logic
                if (task.retries < CONFIG.MAX_RETRIES) {
                    task.retries++;
                    console_1.logger.info("COPY_TRADING", `Retrying task ${task.id} (attempt ${task.retries}/${CONFIG.MAX_RETRIES})`);
                    // Add back to queue with delay
                    setTimeout(() => {
                        this.pendingQueue.push(task);
                    }, CONFIG.RETRY_DELAY * task.retries);
                }
                else {
                    this.failedCount++;
                    console_1.logger.error("COPY_TRADING", `Task ${task.id} failed after ${CONFIG.MAX_RETRIES} retries`);
                }
            }
            finally {
                this.processingSet.delete(task.id);
            }
        }
        finally {
            this.isProcessing = false;
        }
    }
    /**
     * Process a single task by replicating to all followers
     */
    async processTask(task) {
        var _a;
        // Get the leader trade with leader info
        const leaderTrade = await db_1.models.copyTradingTrade.findByPk(task.leaderTradeId, {
            include: [
                {
                    model: db_1.models.copyTradingLeader,
                    as: "leader",
                    include: [{ model: db_1.models.user, as: "user" }],
                },
            ],
        });
        if (!leaderTrade) {
            throw (0, error_1.createError)({ statusCode: 404, message: `Leader trade ${task.leaderTradeId} not found` });
        }
        const leaderTradeData = leaderTrade;
        // Get leader's wallet balance for the quote currency (for proportional calculations)
        const [baseCurrency, quoteCurrency] = task.symbol.split("/");
        let leaderBalance = 0;
        try {
            const leaderWallet = await db_1.models.wallet.findOne({
                where: {
                    userId: (_a = leaderTradeData.leader) === null || _a === void 0 ? void 0 : _a.userId,
                    currency: quoteCurrency,
                    type: "ECO",
                },
            });
            leaderBalance = leaderWallet ? parseFloat(leaderWallet.balance) : 0;
        }
        catch (e) {
            // Default to 0 if wallet not found
        }
        // Get all ACTIVE followers for this leader with the same symbol allocation
        const followers = await db_1.models.copyTradingFollower.findAll({
            where: {
                leaderId: task.leaderId,
                status: "ACTIVE",
            },
            include: [
                {
                    model: db_1.models.copyTradingFollowerAllocation,
                    as: "allocations",
                    where: {
                        symbol: task.symbol,
                        isActive: true,
                    },
                    required: true,
                },
                {
                    model: db_1.models.user,
                    as: "user",
                },
            ],
        });
        if (followers.length === 0) {
            console_1.logger.debug("COPY_TRADING", `No active followers for leader ${task.leaderId} on ${task.symbol}`);
            return;
        }
        console_1.logger.info("COPY_TRADING", `Processing ${followers.length} followers for trade ${task.leaderTradeId}`);
        // Process followers in batches with concurrency limit
        await this.processFollowersBatch(followers, leaderTradeData, leaderBalance);
    }
    /**
     * Process followers in concurrent batches
     */
    async processFollowersBatch(followers, leaderTrade, leaderBalance) {
        const batchSize = CONFIG.MAX_CONCURRENT_FOLLOWERS;
        let successCount = 0;
        let failCount = 0;
        for (let i = 0; i < followers.length; i += batchSize) {
            const batch = followers.slice(i, i + batchSize);
            // Process batch concurrently
            const results = await Promise.allSettled(batch.map(follower => this.processFollowerCopy(follower, leaderTrade, leaderBalance)));
            // Count successes and failures
            results.forEach((result, index) => {
                if (result.status === "fulfilled" && result.value.success) {
                    successCount++;
                }
                else {
                    failCount++;
                    const follower = batch[index];
                    const error = result.status === "rejected" ? result.reason : result.value.error;
                    console_1.logger.warn("COPY_TRADING", `Failed to copy trade for follower ${follower.id}: ${error}`);
                }
            });
        }
        console_1.logger.info("COPY_TRADING", `Batch complete: ${successCount} succeeded, ${failCount} failed`);
    }
    /**
     * Process copy for a single follower
     */
    async processFollowerCopy(follower, leaderTrade, leaderBalance) {
        try {
            const result = await (0, copyProcessor_1.processCopyOrder)({
                leaderTrade,
                follower,
                leaderBalance,
            });
            return result;
        }
        catch (error) {
            return { success: false, error: error.message };
        }
    }
    /**
     * Get queue statistics
     */
    getStats() {
        const avgTime = this.processingTimes.length > 0
            ? this.processingTimes.reduce((a, b) => a + b, 0) / this.processingTimes.length
            : 0;
        return {
            pending: this.pendingQueue.length,
            processing: this.processingSet.size,
            completed: this.completedCount,
            failed: this.failedCount,
            averageProcessingTime: Math.round(avgTime),
        };
    }
    /**
     * Clear all statistics
     */
    clearStats() {
        this.completedCount = 0;
        this.failedCount = 0;
        this.processingTimes = [];
    }
    /**
     * Get current queue size
     */
    getQueueSize() {
        return this.pendingQueue.length;
    }
}
exports.CopyTradeQueue = CopyTradeQueue;
CopyTradeQueue.instance = null;
// ============================================================================
// CONVENIENCE FUNCTIONS
// ============================================================================
/**
 * Add a leader trade to the copy queue (non-blocking)
 */
async function queueLeaderTrade(leaderTradeId, leaderId, symbol, priority = 0) {
    const queue = CopyTradeQueue.getInstance();
    await queue.enqueue(leaderTradeId, leaderId, symbol, priority);
}
/**
 * Start the queue processor
 */
function startCopyQueue() {
    const queue = CopyTradeQueue.getInstance();
    queue.start();
}
/**
 * Stop the queue processor
 */
function stopCopyQueue() {
    const queue = CopyTradeQueue.getInstance();
    queue.stop();
}
/**
 * Get queue statistics
 */
function getCopyQueueStats() {
    const queue = CopyTradeQueue.getInstance();
    return queue.getStats();
}
