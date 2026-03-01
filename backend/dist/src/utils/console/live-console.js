"use strict";
/**
 * Live Terminal Console
 * Provides animated spinners, live progress bars, and dynamic status updates
 *
 * IMPORTANT: This module now routes all output through logQueue to prevent
 * conflicts with buffered group logging.
 *
 * Usage:
 *   import { liveConsole } from "@b/utils/console";
 *
 *   // Start a live task with spinner
 *   const task = liveConsole.startTask("BTC_SCAN", "Starting Bitcoin scanner...");
 *   task.update("Connecting to node...");
 *   task.update("Syncing blocks...", { progress: 50 });
 *   task.succeed("Scanner ready!");
 *   // or task.fail("Connection failed");
 *
 *   // Multiple concurrent tasks
 *   const task1 = liveConsole.startTask("DB", "Connecting to database...");
 *   const task2 = liveConsole.startTask("CACHE", "Warming cache...");
 *   task1.succeed("Connected");
 *   task2.succeed("Cache ready");
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.liveConsole = void 0;
const cli_spinners_1 = __importDefault(require("cli-spinners"));
const colors_1 = require("./colors");
const log_queue_1 = require("./log-queue");
// Spinner frames for different states
const SPINNERS = {
    dots: cli_spinners_1.default.dots,
    dots2: cli_spinners_1.default.dots2,
    dots3: cli_spinners_1.default.dots3,
    dots12: cli_spinners_1.default.dots12,
    line: cli_spinners_1.default.line,
    arc: cli_spinners_1.default.arc,
    bouncingBar: cli_spinners_1.default.bouncingBar,
    bouncingBall: cli_spinners_1.default.bouncingBall,
    pulse: cli_spinners_1.default.moon,
    aesthetic: cli_spinners_1.default.aesthetic,
};
// Progress bar characters
const PROGRESS_CHARS = {
    filled: "█",
    empty: "░",
    head: "▓",
};
class LiveConsole {
    constructor() {
        this.tasks = new Map();
        this.renderInterval = null;
        this.spinner = SPINNERS.dots12;
        this.frameCount = 0;
        // Maps child modules to their parent task module (e.g., "BTC_NODE" -> "BTC_SCAN")
        this.moduleAliases = new Map();
        // Maps module names to their active task IDs
        this.activeModuleTasks = new Map();
        // Disable in non-TTY environments (like CI, piped output)
        this.isEnabled = process.stdout.isTTY === true;
    }
    /**
     * Check if live console is available
     */
    get enabled() {
        return this.isEnabled;
    }
    /**
     * Register a child module to log as part of a parent's live task
     * When child module logs, it will appear as a step in parent's task
     * Example: registerAlias("BTC_NODE", "BTC_SCAN")
     */
    registerAlias(childModule, parentModule) {
        this.moduleAliases.set(childModule.toUpperCase(), parentModule.toUpperCase());
    }
    /**
     * Unregister a module alias
     */
    unregisterAlias(childModule) {
        this.moduleAliases.delete(childModule.toUpperCase());
    }
    /**
     * Check if a module has an active live task (directly or via alias)
     */
    hasActiveTask(module) {
        const upperModule = module.toUpperCase();
        // Direct task check
        if (this.activeModuleTasks.has(upperModule)) {
            return true;
        }
        // Check via alias
        const parentModule = this.moduleAliases.get(upperModule);
        if (parentModule && this.activeModuleTasks.has(parentModule)) {
            return true;
        }
        return false;
    }
    /**
     * Add a step to a live task by module name (supports aliases)
     * Returns true if the step was added to a task, false otherwise
     */
    addStepToTask(module, message, status = "info") {
        const upperModule = module.toUpperCase();
        // Try direct module first
        let taskId = this.activeModuleTasks.get(upperModule);
        // If not found, try via alias
        if (!taskId) {
            const parentModule = this.moduleAliases.get(upperModule);
            if (parentModule) {
                taskId = this.activeModuleTasks.get(parentModule);
            }
        }
        if (!taskId)
            return false;
        const task = this.tasks.get(taskId);
        if (!task)
            return false;
        task.steps.push({ message, status, time: Date.now() });
        task.message = message;
        return true;
    }
    /**
     * Start a new live task with animated spinner
     */
    startTask(module, title) {
        const id = `${module}-${Date.now()}`;
        const upperModule = module.toUpperCase();
        const task = {
            id,
            module: upperModule,
            title,
            status: "running",
            message: title,
            startTime: Date.now(),
            steps: [],
            spinnerFrame: 0,
        };
        this.tasks.set(id, task);
        this.activeModuleTasks.set(upperModule, id);
        // Notify log queue that live mode is starting
        log_queue_1.logQueue.liveStart();
        this.startRendering();
        return {
            update: (message, options) => {
                this.updateTask(id, message, options);
            },
            step: (message, status = "info") => {
                this.addStep(id, message, status);
            },
            succeed: (message) => {
                this.completeTask(id, "success", message);
            },
            fail: (message) => {
                this.completeTask(id, "error", message);
            },
            warn: (message) => {
                this.completeTask(id, "warn", message);
            },
            setRequest: (method, url) => {
                const task = this.tasks.get(id);
                if (task) {
                    task.request = { method, url };
                }
            },
        };
    }
    /**
     * Update a task's current message
     */
    updateTask(id, message, options) {
        const task = this.tasks.get(id);
        if (!task)
            return;
        task.message = message;
        if ((options === null || options === void 0 ? void 0 : options.progress) !== undefined) {
            task.progress = Math.min(100, Math.max(0, options.progress));
        }
    }
    /**
     * Add a step to a task's history
     */
    addStep(id, message, status) {
        const task = this.tasks.get(id);
        if (!task)
            return;
        task.steps.push({ message, status, time: Date.now() });
        task.message = message;
    }
    /**
     * Complete a task with final status
     */
    completeTask(id, status, message) {
        const task = this.tasks.get(id);
        if (!task)
            return;
        task.status = status;
        if (message) {
            task.message = message;
        }
        // Build final output atomically
        const finalOutput = this.buildFinalTaskOutput(task);
        // Remove task from active tracking
        this.tasks.delete(id);
        this.activeModuleTasks.delete(task.module);
        // Stop rendering if no more tasks
        if (this.tasks.size === 0) {
            this.stopRendering();
        }
        // Notify log queue that this task is done, with final output
        log_queue_1.logQueue.liveDone(finalOutput);
    }
    /**
     * Build the final output string for a completed task
     * If task has steps, show full detailed output with all steps
     * If no steps, show minimal single line
     */
    buildFinalTaskOutput(task) {
        const timestamp = this.getTimestamp();
        // task.message contains duration in ms when passed from api-logger
        const durationMs = parseInt(task.message, 10);
        const duration = !isNaN(durationMs) ? this.formatDuration(durationMs) : this.formatDuration(Date.now() - task.startTime);
        // If no steps, show minimal single-line output
        if (task.steps.length === 0) {
            const icon = this.getStatusIcon(task.status);
            const color = this.getStatusColor(task.status);
            const taskName = task.title.replace(/\.\.\.?$/, "");
            return `${timestamp} ${icon} ${color}${taskName}${colors_1.colors.reset} ${colors_1.colors.gray}(${duration})${colors_1.colors.reset}`;
        }
        // Has steps - show full detailed output
        const lines = [];
        const indent = " ".repeat(task.module.length + 12);
        // Header line with request info if available
        if (task.request) {
            const method = task.request.method.toUpperCase();
            const methodColor = method === "GET" ? colors_1.colors.green
                : method === "POST" ? colors_1.colors.yellow
                    : method === "PUT" ? colors_1.colors.blue
                        : method === "DELETE" ? colors_1.colors.red
                            : colors_1.colors.cyan;
            lines.push(`${timestamp} ${colors_1.colors.cyan}[${task.module}]${colors_1.colors.reset} ${colors_1.colors.cyan}▶${colors_1.colors.reset}  ${methodColor}${method}${colors_1.colors.reset} ${colors_1.colors.white}${task.request.url}${colors_1.colors.reset}`);
            lines.push(`${indent}├─ ${colors_1.colors.dim}${task.title}${colors_1.colors.reset}`);
        }
        else {
            lines.push(`${timestamp} ${colors_1.colors.cyan}[${task.module}]${colors_1.colors.reset} ${colors_1.colors.cyan}▶${colors_1.colors.reset}  ${task.title}`);
        }
        // Check if last step should be the final line (success, error, or warning)
        const lastStep = task.steps[task.steps.length - 1];
        const lastStepIsFinal = lastStep && (lastStep.status === "success" || lastStep.status === "error" || lastStep.status === "warn");
        // All steps except the last one (which becomes the final line)
        const stepsToShow = lastStepIsFinal ? task.steps.slice(0, -1) : task.steps;
        for (const step of stepsToShow) {
            let icon = "";
            let color = colors_1.colors.dim;
            switch (step.status) {
                case "success":
                    icon = `${colors_1.colors.green}${colors_1.icons.success}${colors_1.colors.reset} `;
                    break;
                case "warn":
                    icon = `${colors_1.colors.yellow}${colors_1.icons.warning}${colors_1.colors.reset} `;
                    color = colors_1.colors.yellow;
                    break;
                case "error":
                    icon = `${colors_1.colors.red}${colors_1.icons.error}${colors_1.colors.reset} `;
                    color = colors_1.colors.red;
                    break;
            }
            lines.push(`${indent}├─ ${icon}${color}${step.message}${colors_1.colors.reset}`);
        }
        // Final status line - use last step if it has a status, otherwise show generic message
        const finalIcon = this.getStatusIcon(task.status);
        const finalColor = task.status === "success" ? colors_1.colors.green : task.status === "error" ? colors_1.colors.red : colors_1.colors.yellow;
        let finalMsg;
        if (lastStepIsFinal) {
            // Use the last step's message as the final line
            finalMsg = lastStep.message;
        }
        else {
            // Fallback for tasks without proper final step
            finalMsg = task.status === "success" ? "Completed" : "Failed";
        }
        lines.push(`${indent}└─ ${finalIcon} ${finalColor}${finalMsg}${colors_1.colors.reset} ${colors_1.colors.gray}(${duration})${colors_1.colors.reset}`);
        return lines.join("\n");
    }
    /**
     * Start the render loop
     */
    startRendering() {
        if (this.renderInterval || !this.isEnabled)
            return;
        this.renderInterval = setInterval(() => {
            this.frameCount++;
            this.render();
        }, this.spinner.interval);
    }
    /**
     * Stop the render loop
     */
    stopRendering() {
        if (this.renderInterval) {
            clearInterval(this.renderInterval);
            this.renderInterval = null;
        }
        // Don't call logUpdate directly - let logQueue handle it
    }
    /**
     * Render all active tasks via logQueue
     */
    render() {
        if (this.tasks.size === 0)
            return;
        const lines = [];
        for (const task of this.tasks.values()) {
            lines.push(...this.renderTask(task));
        }
        // Route through logQueue to prevent conflicts
        log_queue_1.logQueue.liveUpdate(lines.join("\n"));
    }
    /**
     * Render a single task - shows header, all completed steps, and current step with spinner
     */
    renderTask(task) {
        const timestamp = this.getTimestamp();
        const duration = this.formatDuration(Date.now() - task.startTime);
        const indent = " ".repeat(task.module.length + 12);
        // Get spinner frame
        const spinnerFrame = this.spinner.frames[this.frameCount % this.spinner.frames.length];
        const lines = [];
        // Header line with module and title
        lines.push(`${timestamp} ${colors_1.colors.cyan}[${task.module}]${colors_1.colors.reset} ${colors_1.colors.cyan}▶${colors_1.colors.reset}  ${task.title}`);
        // Show all completed steps (all but the last one which is the current step)
        const completedSteps = task.steps.slice(0, -1);
        for (const step of completedSteps) {
            let icon = "";
            let color = colors_1.colors.dim;
            switch (step.status) {
                case "success":
                    icon = `${colors_1.colors.green}${colors_1.icons.success}${colors_1.colors.reset} `;
                    break;
                case "warn":
                    icon = `${colors_1.colors.yellow}${colors_1.icons.warning}${colors_1.colors.reset} `;
                    color = colors_1.colors.yellow;
                    break;
                case "error":
                    icon = `${colors_1.colors.red}${colors_1.icons.error}${colors_1.colors.reset} `;
                    color = colors_1.colors.red;
                    break;
            }
            lines.push(`${indent}├─ ${icon}${color}${step.message}${colors_1.colors.reset}`);
        }
        // Show current step with spinner (the last step)
        if (task.steps.length > 0) {
            const currentStep = task.steps[task.steps.length - 1];
            const spinnerStr = `${colors_1.colors.cyan}${spinnerFrame}${colors_1.colors.reset}`;
            lines.push(`${indent}├─ ${spinnerStr} ${colors_1.colors.dim}${currentStep.message}${colors_1.colors.reset} ${colors_1.colors.gray}${duration}${colors_1.colors.reset}`);
        }
        else {
            // No steps yet, show spinner on title line
            const spinnerStr = `${colors_1.colors.cyan}${spinnerFrame}${colors_1.colors.reset}`;
            lines.push(`${indent}└─ ${spinnerStr} ${colors_1.colors.dim}Initializing...${colors_1.colors.reset} ${colors_1.colors.gray}${duration}${colors_1.colors.reset}`);
        }
        return lines;
    }
    /**
     * Render a progress bar
     */
    renderProgressBar(percent, width) {
        const filled = Math.round((percent / 100) * width);
        const empty = width - filled;
        const filledStr = PROGRESS_CHARS.filled.repeat(Math.max(0, filled - 1));
        const headStr = filled > 0 ? PROGRESS_CHARS.head : "";
        const emptyStr = PROGRESS_CHARS.empty.repeat(empty);
        return `${colors_1.colors.green}${filledStr}${headStr}${colors_1.colors.gray}${emptyStr}${colors_1.colors.reset}`;
    }
    /**
     * Get status icon
     */
    getStatusIcon(status) {
        switch (status) {
            case "success": return `${colors_1.colors.green}${colors_1.icons.success}${colors_1.colors.reset}`;
            case "error": return `${colors_1.colors.red}${colors_1.icons.error}${colors_1.colors.reset}`;
            case "warn": return `${colors_1.colors.yellow}${colors_1.icons.warning}${colors_1.colors.reset}`;
            default: return `${colors_1.colors.cyan}●${colors_1.colors.reset}`;
        }
    }
    /**
     * Get step icon
     */
    getStepIcon(status) {
        switch (status) {
            case "success": return `${colors_1.colors.green}${colors_1.icons.success}${colors_1.colors.reset}`;
            case "error": return `${colors_1.colors.red}${colors_1.icons.error}${colors_1.colors.reset}`;
            case "warn": return `${colors_1.colors.yellow}${colors_1.icons.warning}${colors_1.colors.reset}`;
            default: return `${colors_1.colors.dim}${colors_1.icons.bullet}${colors_1.colors.reset}`;
        }
    }
    /**
     * Get status color
     */
    getStatusColor(status) {
        switch (status) {
            case "success": return colors_1.colors.green;
            case "error": return colors_1.colors.red;
            case "warn": return colors_1.colors.yellow;
            case "running": return colors_1.colors.cyan;
            default: return colors_1.colors.dim;
        }
    }
    /**
     * Format timestamp
     */
    getTimestamp() {
        const now = new Date();
        return `${colors_1.colors.gray}${now.toISOString().split("T")[1].slice(0, 8)}${colors_1.colors.reset}`;
    }
    /**
     * Format module name
     */
    formatModule(module) {
        return `${colors_1.colors.cyan}[${module}]${colors_1.colors.reset}`;
    }
    /**
     * Format duration
     */
    formatDuration(ms) {
        if (ms < 1000)
            return `${ms}ms`;
        if (ms < 60000)
            return `${(ms / 1000).toFixed(1)}s`;
        const mins = Math.floor(ms / 60000);
        const secs = ((ms % 60000) / 1000).toFixed(0);
        return `${mins}m ${secs}s`;
    }
}
// Export singleton instance
exports.liveConsole = new LiveConsole();
exports.default = exports.liveConsole;
