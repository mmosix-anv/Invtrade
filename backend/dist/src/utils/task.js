"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.taskQueue = exports.TaskQueue = void 0;
// backend/src/api/utils/taskQueue.ts
const events_1 = require("events");
class TaskQueue extends events_1.EventEmitter {
    /**
     * @param concurrency Maximum number of tasks to process concurrently.
     * @param maxQueueLength Optional maximum length of the queue. New tasks beyond this limit will be rejected.
     */
    constructor(concurrency = 5, maxQueueLength) {
        super();
        this.queue = [];
        this.activeCount = 0;
        this.paused = false;
        this.concurrency = concurrency;
        this.maxQueueLength = maxQueueLength;
    }
    /**
     * Adds a task to the queue with optional settings.
     *
     * @param task A function that returns a Promise.
     * @param options Task options such as priority, timeout, and retry options.
     * @returns A Promise that resolves when the task completes successfully.
     */
    add(task, options = {}) {
        return new Promise((resolve, reject) => {
            var _a;
            if (this.maxQueueLength && this.queue.length >= this.maxQueueLength) {
                return reject(new Error("Task queue is full"));
            }
            const taskItem = {
                task,
                priority: (_a = options.priority) !== null && _a !== void 0 ? _a : 0,
                addedAt: Date.now(),
                resolve,
                reject,
                timeoutMs: options.timeoutMs,
                retryOptions: options.retryOptions,
                currentRetryCount: 0,
            };
            this.insertTaskItem(taskItem);
            this.emit("taskAdded");
            this.processQueue();
        });
    }
    /**
     * Inserts a task item into the queue in sorted order (by priority and then timestamp).
     */
    insertTaskItem(taskItem) {
        // Insert taskItem so that higher priority tasks come first.
        const index = this.queue.findIndex((item) => item.priority < taskItem.priority ||
            (item.priority === taskItem.priority && item.addedAt > taskItem.addedAt));
        if (index === -1) {
            this.queue.push(taskItem);
        }
        else {
            this.queue.splice(index, 0, taskItem);
        }
    }
    /**
     * Processes tasks from the queue up to the concurrency limit.
     */
    processQueue() {
        if (this.paused)
            return;
        while (this.activeCount < this.concurrency && this.queue.length > 0) {
            const taskItem = this.queue.shift();
            if (taskItem) {
                this.activeCount++;
                this.executeTask(taskItem).finally(() => {
                    this.activeCount--;
                    if (this.queue.length === 0 && this.activeCount === 0) {
                        this.emit("drain");
                        if (this.drainPromise) {
                            this.drainPromise.resolve();
                            this.drainPromise = undefined;
                        }
                    }
                    this.processQueue();
                });
            }
        }
    }
    /**
     * Executes a given task item with timeout and retry logic.
     *
     * @param taskItem The task item to execute.
     */
    async executeTask(taskItem) {
        this.emit("taskStarted");
        try {
            if (taskItem.timeoutMs) {
                await this.runWithTimeout(taskItem.task, taskItem.timeoutMs);
            }
            else {
                await taskItem.task();
            }
            taskItem.resolve();
            this.emit("taskCompleted");
        }
        catch (error) {
            if (taskItem.retryOptions &&
                taskItem.currentRetryCount < taskItem.retryOptions.maxRetries) {
                taskItem.currentRetryCount++;
                this.emit("taskRetried", {
                    error,
                    retryCount: taskItem.currentRetryCount,
                });
                const delay = taskItem.retryOptions.initialDelayMs *
                    (taskItem.retryOptions.factor || 2) **
                        (taskItem.currentRetryCount - 1);
                // Reinsert the task after the computed delay.
                setTimeout(() => {
                    this.insertTaskItem(taskItem);
                    this.processQueue();
                }, delay);
            }
            else {
                taskItem.reject(error);
                this.emit("taskError", error);
            }
        }
    }
    /**
     * Executes a task with a timeout.
     *
     * @param task A function that returns a Promise.
     * @param timeoutMs Timeout in milliseconds.
     * @returns A Promise that rejects if the task does not complete in time.
     */
    runWithTimeout(task, timeoutMs) {
        return new Promise((resolve, reject) => {
            const timeoutId = setTimeout(() => {
                reject(new Error("Task timeout exceeded"));
            }, timeoutMs);
            task()
                .then(() => {
                clearTimeout(timeoutId);
                resolve();
            })
                .catch((err) => {
                clearTimeout(timeoutId);
                reject(err);
            });
        });
    }
    /**
     * Pauses the processing of tasks.
     */
    pause() {
        this.paused = true;
    }
    /**
     * Resumes processing of tasks.
     */
    resume() {
        if (!this.paused)
            return;
        this.paused = false;
        this.processQueue();
    }
    /**
     * Clears all pending tasks from the queue.
     */
    clearQueue() {
        this.queue = [];
    }
    /**
     * Dynamically sets a new concurrency limit.
     *
     * @param newConcurrency The new maximum number of concurrent tasks.
     */
    setConcurrency(newConcurrency) {
        this.concurrency = newConcurrency;
        this.processQueue();
    }
    /**
     * Returns a promise that resolves when the queue is drained (no pending or active tasks).
     */
    awaitDrain() {
        if (this.queue.length === 0 && this.activeCount === 0) {
            return Promise.resolve();
        }
        if (!this.drainPromise) {
            let resolveFn;
            const promise = new Promise((resolve) => {
                resolveFn = resolve;
            });
            this.drainPromise = { resolve: resolveFn, promise };
        }
        return this.drainPromise.promise;
    }
    /**
     * Returns the number of tasks waiting in the queue.
     */
    getQueueLength() {
        return this.queue.length;
    }
    /**
     * Returns the number of tasks currently being processed.
     */
    getActiveCount() {
        return this.activeCount;
    }
}
exports.TaskQueue = TaskQueue;
exports.taskQueue = new TaskQueue();
