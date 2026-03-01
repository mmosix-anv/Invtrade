"use strict";
/**
 * Log Queue Manager
 *
 * Manages all console output to prevent interleaving between:
 * 1. Live tasks (animated spinners using logUpdate)
 * 2. Buffered groups (atomic multi-line output)
 * 3. Regular logs (standard console.log)
 *
 * The key insight is that logUpdate OVERWRITES terminal lines while console.log APPENDS.
 * When both run concurrently, they conflict. This manager ensures:
 * - Live mode claims exclusive control of the terminal when active
 * - Buffered groups print atomically when live mode pauses
 * - Regular logs are held during live mode and flushed on completion
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.logQueue = void 0;
const log_update_1 = __importDefault(require("log-update"));
class LogQueueManager {
    constructor() {
        this.queue = [];
        this.processing = false;
        this.liveModeActive = false;
        this.liveTaskCount = 0;
        this.pendingPrints = [];
        this.lastLiveContent = "";
    }
    static getInstance() {
        if (!LogQueueManager.instance) {
            LogQueueManager.instance = new LogQueueManager();
        }
        return LogQueueManager.instance;
    }
    /**
     * Signal that a live task is starting
     * Increments the live task counter
     */
    liveStart() {
        this.liveTaskCount++;
        this.liveModeActive = true;
    }
    /**
     * Queue a live update (overwrites current line using logUpdate)
     */
    liveUpdate(content) {
        this.queue.push({ type: "live-update", content });
        this.processQueue();
    }
    /**
     * Clear live output without finishing
     */
    liveClear() {
        this.queue.push({ type: "live-clear" });
        this.processQueue();
    }
    /**
     * Signal that a live task is done
     * Only exits live mode when all tasks are complete
     * @param finalOutput Optional final output to print after exiting live mode
     */
    liveDone(finalOutput) {
        this.queue.push({ type: "live-done", finalOutput });
        this.processQueue();
    }
    /**
     * Queue a regular print (will be held if live mode is active)
     */
    print(content) {
        this.queue.push({ type: "print", content });
        this.processQueue();
    }
    /**
     * Queue an atomic multi-line print (for buffered groups)
     * This will pause live mode, print atomically, then resume
     */
    printAtomic(lines) {
        this.queue.push({ type: "print-atomic", lines });
        this.processQueue();
    }
    /**
     * Check if live mode is currently active
     */
    isLiveModeActive() {
        return this.liveModeActive;
    }
    /**
     * Get count of active live tasks
     */
    getLiveTaskCount() {
        return this.liveTaskCount;
    }
    /**
     * Process the queue - handles all output serialization
     */
    processQueue() {
        if (this.processing)
            return;
        this.processing = true;
        while (this.queue.length > 0) {
            const entry = this.queue.shift();
            switch (entry.type) {
                case "live-update":
                    // If we have pending prints and we're about to update live content,
                    // we need to clear first, flush pending, then continue live mode
                    if (this.pendingPrints.length > 0 && this.liveModeActive) {
                        log_update_1.default.clear();
                        for (const line of this.pendingPrints) {
                            console.log(line);
                        }
                        this.pendingPrints = [];
                    }
                    this.liveModeActive = true;
                    this.lastLiveContent = entry.content;
                    (0, log_update_1.default)(entry.content);
                    break;
                case "live-clear":
                    log_update_1.default.clear();
                    this.lastLiveContent = "";
                    break;
                case "live-done":
                    this.liveTaskCount = Math.max(0, this.liveTaskCount - 1);
                    // If there are still other live tasks, just clear current output
                    if (this.liveTaskCount > 0) {
                        // Don't call logUpdate.done() - other tasks are still running
                        // Just clear and let them continue
                        if (entry.finalOutput) {
                            // Need to print this task's final output while live mode continues
                            log_update_1.default.clear();
                            console.log(entry.finalOutput);
                        }
                    }
                    else {
                        // All live tasks done - exit live mode completely
                        if (entry.finalOutput) {
                            // Clear live area and print final output
                            log_update_1.default.clear();
                            console.log(entry.finalOutput);
                        }
                        else {
                            // Persist the last live content
                            log_update_1.default.done();
                        }
                        this.liveModeActive = false;
                        this.lastLiveContent = "";
                        // Flush any pending prints
                        for (const line of this.pendingPrints) {
                            console.log(line);
                        }
                        this.pendingPrints = [];
                    }
                    break;
                case "print":
                    if (this.liveModeActive) {
                        // Hold prints while live mode is active
                        this.pendingPrints.push(entry.content);
                    }
                    else {
                        console.log(entry.content);
                    }
                    break;
                case "print-atomic":
                    if (this.liveModeActive) {
                        // Temporarily clear live output, print atomic block, then restore
                        const savedContent = this.lastLiveContent;
                        log_update_1.default.clear();
                        // Flush any pending prints first
                        for (const line of this.pendingPrints) {
                            console.log(line);
                        }
                        this.pendingPrints = [];
                        // Print the atomic block
                        console.log(entry.lines.join("\n"));
                        // Restore live output if there are still active tasks
                        if (this.liveTaskCount > 0 && savedContent) {
                            (0, log_update_1.default)(savedContent);
                        }
                    }
                    else {
                        console.log(entry.lines.join("\n"));
                    }
                    break;
            }
        }
        this.processing = false;
    }
    /**
     * Force flush all pending output (for cleanup)
     */
    flush() {
        if (this.liveModeActive) {
            log_update_1.default.done();
            this.liveModeActive = false;
            this.liveTaskCount = 0;
        }
        for (const line of this.pendingPrints) {
            console.log(line);
        }
        this.pendingPrints = [];
    }
}
exports.logQueue = LogQueueManager.getInstance();
exports.default = exports.logQueue;
