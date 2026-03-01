"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.metadata = void 0;
const date_fns_1 = require("date-fns");
const db_1 = require("@b/db");
const cache_1 = require("@b/utils/cache");
exports.metadata = {
    summary: "Binary Trading Health Check",
    operationId: "binaryHealthCheck",
    tags: ["Binary", "Health"],
    description: "Checks the health status of the binary trading system including database connectivity, order processing, and system configuration.",
    responses: {
        200: {
            description: "Health check completed successfully",
            content: {
                "application/json": {
                    schema: {
                        type: "object",
                        properties: {
                            status: {
                                type: "string",
                                enum: ["healthy", "degraded", "down"],
                                description: "Overall system health status"
                            },
                            timestamp: {
                                type: "string",
                                description: "ISO 8601 timestamp of health check"
                            },
                            checks: {
                                type: "object",
                                properties: {
                                    system: { type: "object" },
                                    database: { type: "object" },
                                    durations: { type: "object" },
                                    markets: { type: "object" },
                                    orders: { type: "object" },
                                }
                            }
                        },
                    },
                },
            },
        },
        500: {
            description: "Health check failed",
        },
    },
    requiresAuth: false,
    logModule: "BINARY_HEALTH",
    logTitle: "Binary Trading Health Check",
};
exports.default = async (data) => {
    const { ctx } = data;
    const timestamp = (0, date_fns_1.formatDate)(new Date(), "yyyy-MM-dd HH:mm:ss");
    const checks = {
        system: { status: "up", message: "" },
        database: { status: "up", message: "" },
        durations: { status: "up", message: "" },
        markets: { status: "up", message: "" },
        orders: { status: "up", message: "" },
    };
    try {
        // 1. Check if binary trading is enabled
        ctx === null || ctx === void 0 ? void 0 : ctx.step("Checking binary trading system status");
        const cacheManager = cache_1.CacheManager.getInstance();
        const binaryStatus = (await cacheManager.getSetting("binaryStatus")) === "true";
        if (!binaryStatus) {
            checks.system = {
                status: "down",
                message: "Binary trading is disabled in system configuration",
                details: { enabled: false },
            };
        }
        else {
            checks.system = {
                status: "up",
                message: "Binary trading is enabled",
                details: { enabled: true },
            };
        }
        // 2. Check database connectivity
        ctx === null || ctx === void 0 ? void 0 : ctx.step("Checking database connectivity");
        try {
            await db_1.sequelize.authenticate();
            checks.database = {
                status: "up",
                message: "Database connection is healthy",
            };
        }
        catch (error) {
            checks.database = {
                status: "down",
                message: `Database connection failed: ${error.message}`,
            };
        }
        // 3. Check binary durations availability
        ctx === null || ctx === void 0 ? void 0 : ctx.step("Checking binary durations");
        try {
            const durations = await db_1.models.binaryDuration.findAll({
                where: { status: true },
                attributes: ["id", "duration", "status"],
            });
            if (durations.length === 0) {
                checks.durations = {
                    status: "warning",
                    message: "No active binary durations found",
                    details: { count: 0, active: 0 },
                };
            }
            else {
                checks.durations = {
                    status: "up",
                    message: `${durations.length} active duration(s) available`,
                    details: {
                        count: durations.length,
                        durations: durations.map(d => `${d.duration}m`).join(", ")
                    },
                };
            }
        }
        catch (error) {
            checks.durations = {
                status: "down",
                message: `Failed to fetch durations: ${error.message}`,
            };
        }
        // 4. Check binary markets availability
        ctx === null || ctx === void 0 ? void 0 : ctx.step("Checking binary markets");
        try {
            const markets = await db_1.models.binaryMarket.count({
                where: { status: "ACTIVE" },
            });
            if (markets === 0) {
                checks.markets = {
                    status: "warning",
                    message: "No active binary markets found",
                    details: { active: 0 },
                };
            }
            else {
                checks.markets = {
                    status: "up",
                    message: `${markets} active market(s) available`,
                    details: { active: markets },
                };
            }
        }
        catch (error) {
            checks.markets = {
                status: "down",
                message: `Failed to fetch markets: ${error.message}`,
            };
        }
        // 5. Check order processing health
        ctx === null || ctx === void 0 ? void 0 : ctx.step("Checking order processing health");
        try {
            // Count pending orders
            const pendingOrders = await db_1.models.binaryOrder.count({
                where: { status: "PENDING" },
            });
            // Check for stuck orders (pending for more than 24 hours)
            const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
            const stuckOrders = await db_1.models.binaryOrder.count({
                where: {
                    status: "PENDING",
                    createdAt: { [db_1.models.Sequelize.Op.lt]: oneDayAgo },
                },
            });
            if (stuckOrders > 0) {
                checks.orders = {
                    status: "warning",
                    message: `${stuckOrders} order(s) stuck in pending status for >24h`,
                    details: { pending: pendingOrders, stuck: stuckOrders },
                };
            }
            else {
                checks.orders = {
                    status: "up",
                    message: `Order processing healthy. ${pendingOrders} pending order(s)`,
                    details: { pending: pendingOrders, stuck: 0 },
                };
            }
        }
        catch (error) {
            checks.orders = {
                status: "down",
                message: `Failed to check orders: ${error.message}`,
            };
        }
        // Determine overall status
        const statuses = Object.values(checks).map(c => c.status);
        let overallStatus;
        if (statuses.includes("down")) {
            overallStatus = "down";
        }
        else if (statuses.includes("warning")) {
            overallStatus = "degraded";
        }
        else {
            overallStatus = "healthy";
        }
        ctx === null || ctx === void 0 ? void 0 : ctx.success(`Binary trading health check completed: ${overallStatus}`);
        return {
            status: overallStatus,
            timestamp,
            checks,
        };
    }
    catch (error) {
        ctx === null || ctx === void 0 ? void 0 : ctx.fail(`Health check failed: ${error.message}`);
        return {
            status: "down",
            timestamp,
            checks: {
                ...checks,
                system: {
                    status: "down",
                    message: `Unexpected error during health check: ${error.message}`,
                },
            },
        };
    }
};
