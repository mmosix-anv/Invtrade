"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MarketMakerEngine = void 0;
const db_1 = require("@b/db");
const redis_1 = require("@b/utils/redis");
const console_1 = require("@b/utils/console");
const client_1 = require("../scylla/client");
const MarketManager_1 = require("./MarketManager");
const StrategyManager_1 = require("./strategies/StrategyManager");
const RiskManager_1 = require("./risk/RiskManager");
const PoolManager_1 = require("./pool/PoolManager");
const cache_1 = require("@b/utils/cache");
const redis = redis_1.RedisSingleton.getInstance();
// Default configuration
const DEFAULT_CONFIG = {
    tickIntervalMs: 1000, // 1 second
    maxConcurrentMarkets: 10,
    enableRealLiquidity: true,
    emergencyStopEnabled: true,
};
/**
 * MarketMakerEngine - Main orchestrator for AI market making
 *
 * This is a singleton class that manages all AI market making operations.
 * It coordinates between:
 * - MarketManager: Manages individual market instances
 * - StrategyManager: Handles price movement strategies
 * - RiskManager: Monitors and controls risk
 * - PoolManager: Manages liquidity pools
 */
class MarketMakerEngine {
    constructor() {
        this.status = "STOPPED";
        this.config = DEFAULT_CONFIG;
        this.tickInterval = null;
        this.lastTickTime = null;
        this.tickCount = 0;
        this.errorCount = 0;
        this.startTime = null;
        // Sub-managers
        this.marketManager = null;
        this.strategyManager = null;
        this.riskManager = null;
        this.poolManager = null;
        // Track if a tick is in progress to prevent overlapping executions
        this.tickInProgress = false;
        this.consecutiveSlowTicks = 0;
        this.MAX_TICK_DURATION_MS = 5000; // 5 seconds max per tick
    }
    /**
     * Get singleton instance
     */
    static getInstance() {
        if (!MarketMakerEngine.instance) {
            MarketMakerEngine.instance = new MarketMakerEngine();
        }
        return MarketMakerEngine.instance;
    }
    /**
     * Initialize the engine
     * Sets up all sub-managers and prepares for operation
     * Silent initialization - no console output (runs during startup via cron)
     */
    async initialize(config) {
        if (this.status !== "STOPPED") {
            return;
        }
        this.status = "STARTING";
        try {
            // Merge configuration
            this.config = { ...DEFAULT_CONFIG, ...config };
            // Initialize Scylla tables
            await (0, client_1.initializeAiMarketMakerTables)();
            // Load global settings from database
            await this.loadGlobalSettings();
            // Initialize sub-managers
            this.marketManager = new MarketManager_1.MarketManager(this);
            this.strategyManager = new StrategyManager_1.StrategyManager();
            this.riskManager = new RiskManager_1.RiskManager(this);
            this.poolManager = new PoolManager_1.PoolManager();
            // Load active markets
            await this.marketManager.loadActiveMarkets();
            this.status = "RUNNING";
            this.startTime = new Date();
            this.errorCount = 0;
            // Start the main tick loop
            this.startTickLoop();
            // Publish status to Redis for monitoring
            await this.publishStatus();
        }
        catch (error) {
            this.status = "ERROR";
            console_1.logger.error("AI_MM", "Failed to initialize engine", error);
            throw error;
        }
    }
    /**
     * Shutdown the engine gracefully
     */
    async shutdown() {
        if (this.status === "STOPPED") {
            console_1.logger.warn("AI_MM", "Engine is already stopped");
            return;
        }
        this.status = "STOPPING";
        console_1.logger.warn("AI_MM", "Shutting down Market Maker Engine...");
        try {
            // Stop the tick loop
            this.stopTickLoop();
            // Stop all active markets
            if (this.marketManager) {
                await this.marketManager.stopAllMarkets();
            }
            // Cleanup sub-managers
            this.marketManager = null;
            this.strategyManager = null;
            this.riskManager = null;
            this.poolManager = null;
            this.status = "STOPPED";
            this.startTime = null;
            console_1.logger.success("AI_MM", "Market Maker Engine shut down successfully");
            // Publish final status
            await this.publishStatus();
        }
        catch (error) {
            this.status = "ERROR";
            console_1.logger.error("AI_MM", "Failed to shutdown Market Maker Engine", error);
            throw error;
        }
    }
    /**
     * Emergency stop - immediately halt all trading
     */
    async emergencyStop() {
        console_1.logger.error("AI_MM", "EMERGENCY STOP TRIGGERED");
        this.stopTickLoop();
        if (this.marketManager) {
            await this.marketManager.emergencyStopAllMarkets();
        }
        this.status = "STOPPED";
        // Log emergency stop
        await this.logHistory("EMERGENCY_STOP", {
            reason: "Manual emergency stop triggered",
            timestamp: new Date().toISOString(),
        });
        await this.publishStatus();
    }
    /**
     * Get current engine status
     */
    getStatus() {
        var _a;
        return {
            status: this.status,
            uptime: this.startTime ? Date.now() - this.startTime.getTime() : null,
            tickCount: this.tickCount,
            errorCount: this.errorCount,
            activeMarkets: ((_a = this.marketManager) === null || _a === void 0 ? void 0 : _a.getActiveMarketCount()) || 0,
            config: this.config,
        };
    }
    /**
     * Get sub-managers for external access
     */
    getMarketManager() {
        return this.marketManager;
    }
    getStrategyManager() {
        return this.strategyManager;
    }
    getRiskManager() {
        return this.riskManager;
    }
    getPoolManager() {
        return this.poolManager;
    }
    /**
     * Get configuration
     */
    getConfig() {
        return { ...this.config };
    }
    /**
     * Update configuration (requires restart for some settings)
     */
    updateConfig(newConfig) {
        this.config = { ...this.config, ...newConfig };
        console_1.logger.info("AI_MM", `Configuration updated: ${JSON.stringify(this.config)}`);
    }
    // ============================================
    // Private Methods
    // ============================================
    /**
     * Load global settings from database
     */
    async loadGlobalSettings() {
        try {
            const cacheManager = cache_1.CacheManager.getInstance();
            // Load settings from centralized settings table
            const [maxConcurrentBots, tradingEnabled, maintenanceMode, globalPauseEnabled,] = await Promise.all([
                cacheManager.getSetting("aiMarketMakerMaxConcurrentBots"),
                cacheManager.getSetting("aiMarketMakerEnabled"),
                cacheManager.getSetting("aiMarketMakerMaintenanceMode"),
                cacheManager.getSetting("aiMarketMakerGlobalPauseEnabled"),
            ]);
            this.config.maxConcurrentMarkets = maxConcurrentBots || 50;
            this.config.enableRealLiquidity = tradingEnabled !== false;
            if (maintenanceMode || globalPauseEnabled) {
                console_1.logger.warn("AI_MM", "Global pause or maintenance mode is enabled");
            }
        }
        catch (error) {
            console_1.logger.error("AI_MM", "Failed to load global settings", error);
        }
    }
    /**
     * Start the main tick loop
     */
    startTickLoop() {
        if (this.tickInterval) {
            return;
        }
        this.tickInterval = setInterval(async () => {
            await this.tick();
        }, this.config.tickIntervalMs);
        // Note: Tick loop start is logged by caller in groupItem during initialization
    }
    /**
     * Stop the tick loop
     */
    stopTickLoop() {
        if (this.tickInterval) {
            clearInterval(this.tickInterval);
            this.tickInterval = null;
            console_1.logger.info("AI_MM", "Tick loop stopped");
        }
    }
    /**
     * Main tick - called every tickIntervalMs
     * This is where the magic happens
     */
    async tick() {
        var _a;
        if (this.status !== "RUNNING") {
            return;
        }
        // Prevent overlapping ticks which can cause resource exhaustion
        if (this.tickInProgress) {
            this.consecutiveSlowTicks++;
            if (this.consecutiveSlowTicks > 10) {
                console_1.logger.warn("AI_MM", `Warning: ${this.consecutiveSlowTicks} consecutive slow ticks detected`);
            }
            return;
        }
        this.tickInProgress = true;
        const tickStart = Date.now();
        this.tickCount++;
        this.lastTickTime = new Date();
        // Debug logging every 30 ticks in dev mode
        if (process.env.NODE_ENV === "development" && this.tickCount % 30 === 0) {
            console_1.logger.debug("AI_MM", `Tick #${this.tickCount} | Markets: ${((_a = this.marketManager) === null || _a === void 0 ? void 0 : _a.getActiveMarketCount()) || 0} | Errors: ${this.errorCount}`);
        }
        try {
            // Check global risk conditions
            if (this.riskManager) {
                const riskCheck = await this.riskManager.checkGlobalRisk();
                if (!riskCheck.canTrade) {
                    if (this.tickCount % 60 === 0) {
                        console_1.logger.warn("AI_MM", `Trading paused: ${riskCheck.reason}`);
                    }
                    return;
                }
            }
            // Process all active markets with timeout protection
            if (this.marketManager) {
                const processPromise = this.marketManager.processAllMarkets();
                const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error("Market processing timeout")), this.MAX_TICK_DURATION_MS));
                await Promise.race([processPromise, timeoutPromise]);
            }
            // Periodic tasks (every 60 ticks / ~1 minute)
            if (this.tickCount % 60 === 0) {
                await this.performPeriodicTasks();
            }
            // Reset slow tick counter on successful completion
            this.consecutiveSlowTicks = 0;
        }
        catch (error) {
            this.errorCount++;
            if ((error === null || error === void 0 ? void 0 : error.message) === "Market processing timeout") {
                console_1.logger.error("AI_MM", `Tick timeout - processing took > ${this.MAX_TICK_DURATION_MS}ms`);
            }
            else {
                console_1.logger.error("AI_MM", "Tick processing error", error);
            }
            // If too many errors, trigger emergency stop
            if (this.errorCount > 100 && this.config.emergencyStopEnabled) {
                await this.emergencyStop();
            }
        }
        finally {
            this.tickInProgress = false;
            // Log slow ticks
            const tickDuration = Date.now() - tickStart;
            if (tickDuration > this.config.tickIntervalMs * 2) {
                console_1.logger.warn("AI_MM", `Slow tick detected: ${tickDuration}ms (expected < ${this.config.tickIntervalMs}ms)`);
            }
        }
    }
    /**
     * Perform periodic maintenance tasks
     */
    async performPeriodicTasks() {
        // Check for daily volume reset (at midnight UTC)
        await this.checkDailyVolumeReset();
        // Update pool balances
        if (this.poolManager) {
            await this.poolManager.updateAllBalances();
        }
        // Check for expired orders
        if (this.marketManager) {
            await this.marketManager.cleanupExpiredOrders();
        }
        // Publish status to Redis
        await this.publishStatus();
    }
    /**
     * Check if we need to reset daily volumes (at midnight UTC)
     */
    async checkDailyVolumeReset() {
        try {
            const now = new Date();
            const lastResetKey = "ai_market_maker:last_daily_reset";
            // Get last reset date from Redis
            const lastResetStr = await redis.get(lastResetKey);
            const lastResetDate = lastResetStr ? new Date(lastResetStr) : null;
            // Check if it's a new day (UTC)
            const today = now.toISOString().split("T")[0];
            const lastResetDay = lastResetDate === null || lastResetDate === void 0 ? void 0 : lastResetDate.toISOString().split("T")[0];
            if (lastResetDay !== today) {
                console_1.logger.info("AI_MM", "Performing daily volume reset...");
                // Reset all market maker daily volumes
                await db_1.models.aiMarketMaker.update({ currentDailyVolume: 0 }, { where: {} });
                // Reset all bot daily trade counts
                await db_1.models.aiBot.update({ dailyTradeCount: 0 }, { where: {} });
                // Refresh market instances to pick up the reset values
                if (this.marketManager) {
                    await this.marketManager.refreshAllMarkets();
                }
                // Update last reset timestamp
                await redis.set(lastResetKey, now.toISOString());
                console_1.logger.info("AI_MM", "Daily volume reset complete");
                // Log the reset
                await this.logHistory("DAILY_RESET", {
                    resetDate: today,
                    timestamp: now.toISOString(),
                });
            }
        }
        catch (error) {
            console_1.logger.error("AI_MM", "Failed to check daily volume reset", error);
        }
    }
    /**
     * Publish engine status to Redis for monitoring
     */
    async publishStatus() {
        try {
            const status = this.getStatus();
            await redis.set("ai_market_maker:engine:status", JSON.stringify(status), "EX", 60 // Expire after 60 seconds
            );
        }
        catch (error) {
            // Ignore Redis errors for status publishing
        }
    }
    /**
     * Log history event
     */
    async logHistory(action, details) {
        try {
            // This will be logged to a global history table
            console_1.logger.info("AI_MM", `History: ${action} - ${JSON.stringify(details)}`);
        }
        catch (error) {
            // Ignore history logging errors
        }
    }
}
exports.MarketMakerEngine = MarketMakerEngine;
// Export singleton instance
exports.default = MarketMakerEngine.getInstance();
