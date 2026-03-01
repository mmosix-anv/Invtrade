"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.metadata = void 0;
const db_1 = require("@b/db");
const error_1 = require("@b/utils/error");
const sequelize_1 = require("sequelize");
const wallet_1 = require("@b/services/wallet");
exports.metadata = {
    summary: "Stake Tokens",
    description: "Creates a new staking position for the authenticated user by staking tokens into a specified pool.",
    operationId: "stakeTokens",
    tags: ["Staking", "Positions"],
    requiresAuth: true,
    logModule: "STAKING",
    logTitle: "Create staking position",
    rateLimit: {
        windowMs: 60000, // 1 minute
        max: 5 // 5 requests per minute
    },
    requestBody: {
        required: true,
        content: {
            "application/json": {
                schema: {
                    type: "object",
                    properties: {
                        poolId: {
                            type: "string",
                            description: "The ID of the staking pool",
                        },
                        amount: {
                            type: "number",
                            description: "The amount of tokens to stake",
                        },
                    },
                    required: ["poolId", "amount"],
                },
            },
        },
    },
    responses: {
        200: {
            description: "Staking position created successfully",
            content: {
                "application/json": {
                    schema: {
                        type: "object",
                        properties: {
                            id: { type: "string", description: "Staking position ID" },
                            userId: { type: "string", description: "User ID" },
                            poolId: { type: "string", description: "Pool ID" },
                            amount: { type: "number", description: "Staked amount" },
                            startDate: {
                                type: "string",
                                format: "date-time",
                                description: "Staking start date",
                            },
                            endDate: {
                                type: "string",
                                format: "date-time",
                                description: "Staking end date",
                            },
                            status: {
                                type: "string",
                                description: "Status of the staking position",
                            },
                            withdrawalRequested: {
                                type: "boolean",
                                description: "Withdrawal requested flag",
                            },
                            withdrawalRequestDate: {
                                type: "string",
                                format: "date-time",
                                nullable: true,
                                description: "Date when withdrawal was requested",
                            },
                            adminNotes: {
                                type: "string",
                                nullable: true,
                                description: "Admin notes",
                            },
                            completedAt: {
                                type: "string",
                                format: "date-time",
                                nullable: true,
                                description: "Completion timestamp",
                            },
                            createdAt: {
                                type: "string",
                                format: "date-time",
                                description: "Creation timestamp",
                            },
                            updatedAt: {
                                type: "string",
                                format: "date-time",
                                description: "Last update timestamp",
                            },
                        },
                    },
                },
            },
        },
        400: {
            description: "Invalid request parameters or business logic validation failed",
        },
        401: { description: "Unauthorized" },
        404: { description: "Staking pool not found" },
        500: { description: "Internal Server Error" },
    },
};
/**
 * Creates a new staking position for the authenticated user.
 *
 * @description This endpoint allows users to stake tokens in a staking pool.
 * It performs the following operations:
 * - Validates the pool exists and is active
 * - Checks user has sufficient wallet balance
 * - Deducts tokens from user's wallet
 * - Creates a new staking position
 * - Updates pool's available stake capacity
 *
 * @param {Handler} data - Request handler data
 * @param {User} data.user - Authenticated user
 * @param {Object} data.body - Request body
 * @param {string} data.body.poolId - ID of the staking pool
 * @param {number} data.body.amount - Amount to stake
 *
 * @returns {Promise<StakingPosition>} The created staking position
 *
 * @throws {401} Unauthorized - User not authenticated
 * @throws {400} Bad Request - Invalid input or insufficient balance
 * @throws {404} Not Found - Pool not found
 * @throws {429} Too Many Requests - Rate limit exceeded
 * @throws {500} Internal Server Error - Transaction failed
 */
exports.default = async (data) => {
    const { user, body, ctx } = data;
    if (!(user === null || user === void 0 ? void 0 : user.id)) {
        throw (0, error_1.createError)({ statusCode: 401, message: "Unauthorized" });
    }
    const { poolId, amount } = body;
    ctx === null || ctx === void 0 ? void 0 : ctx.step("Validating stake parameters");
    // Rate limiting check for this specific user
    const recentPositions = await db_1.models.stakingPosition.count({
        where: {
            userId: user.id,
            createdAt: {
                [sequelize_1.Op.gte]: new Date(Date.now() - 60000) // Last minute
            }
        }
    });
    if (recentPositions >= 5) {
        throw (0, error_1.createError)({
            statusCode: 429,
            message: "Too many staking requests. Please wait before trying again."
        });
    }
    // Validate poolId
    if (!poolId || typeof poolId !== "string") {
        throw (0, error_1.createError)({
            statusCode: 400,
            message: "Valid poolId is required",
        });
    }
    // Validate amount
    if (typeof amount !== "number" || isNaN(amount) || !isFinite(amount)) {
        throw (0, error_1.createError)({
            statusCode: 400,
            message: "Valid numeric amount is required",
        });
    }
    if (amount <= 0) {
        throw (0, error_1.createError)({
            statusCode: 400,
            message: "Amount must be greater than zero",
        });
    }
    // Validate decimal places (max 8 decimals)
    const decimalPlaces = (amount.toString().split('.')[1] || '').length;
    if (decimalPlaces > 8) {
        throw (0, error_1.createError)({
            statusCode: 400,
            message: "Amount can have maximum 8 decimal places",
        });
    }
    ctx === null || ctx === void 0 ? void 0 : ctx.step("Retrieving staking pool details");
    // Retrieve the staking pool
    const pool = await db_1.models.stakingPool.findByPk(poolId);
    if (!pool) {
        throw (0, error_1.createError)({ statusCode: 404, message: "Staking pool not found" });
    }
    // Ensure the pool is active
    if (pool.status !== "ACTIVE") {
        throw (0, error_1.createError)({
            statusCode: 400,
            message: "Staking pool is not active",
        });
    }
    ctx === null || ctx === void 0 ? void 0 : ctx.step("Validating stake amount against pool limits");
    // Validate the staking amount against the pool's limits
    if (amount < pool.minStake) {
        throw (0, error_1.createError)({
            statusCode: 400,
            message: `Amount must be at least ${pool.minStake}`,
        });
    }
    if (pool.maxStake && amount > pool.maxStake) {
        throw (0, error_1.createError)({
            statusCode: 400,
            message: `Amount must not exceed ${pool.maxStake}`,
        });
    }
    if (amount > pool.availableToStake) {
        throw (0, error_1.createError)({
            statusCode: 400,
            message: "Insufficient available amount to stake in this pool",
        });
    }
    ctx === null || ctx === void 0 ? void 0 : ctx.step("Checking user wallet balance");
    // Check user's wallet balance
    const userWallet = await db_1.models.wallet.findOne({
        where: {
            userId: user.id,
            currency: pool.symbol,
            type: pool.walletType || 'SPOT'
        }
    });
    if (!userWallet) {
        throw (0, error_1.createError)({
            statusCode: 400,
            message: `You don't have a ${pool.symbol} wallet. Please create one first.`,
        });
    }
    if (userWallet.balance < amount) {
        throw (0, error_1.createError)({
            statusCode: 400,
            message: `Insufficient balance. You have ${userWallet.balance} ${pool.symbol} but need ${amount} ${pool.symbol}`,
        });
    }
    ctx === null || ctx === void 0 ? void 0 : ctx.step("Calculating staking period");
    // Calculate staking period
    const startDate = new Date();
    // Assuming pool.lockPeriod is in days
    const endDate = new Date(startDate.getTime() + pool.lockPeriod * 24 * 60 * 60 * 1000);
    ctx === null || ctx === void 0 ? void 0 : ctx.step("Creating staking position");
    // Use a transaction to ensure atomic operations: creating the staking position and updating the pool
    const transaction = await db_1.sequelize.transaction();
    try {
        const position = await db_1.models.stakingPosition.create({
            userId: user.id,
            poolId,
            amount,
            startDate,
            endDate,
            status: "ACTIVE",
            withdrawalRequested: false,
            withdrawalRequestDate: null,
            adminNotes: null,
            completedAt: null,
        }, { transaction });
        ctx === null || ctx === void 0 ? void 0 : ctx.step("Deducting stake amount from wallet via wallet service");
        // Use wallet service for atomic, audited debit
        const walletType = (pool.walletType || 'SPOT');
        await wallet_1.walletService.debit({
            idempotencyKey: `staking_create_${position.id}`,
            userId: user.id,
            walletId: userWallet.id,
            walletType,
            currency: pool.symbol,
            amount,
            operationType: "STAKING",
            description: `Staked ${amount} ${pool.symbol} in pool ${pool.name}`,
            metadata: {
                positionId: position.id,
                poolId: pool.id,
                poolName: pool.name,
                lockPeriod: pool.lockPeriod,
            },
            transaction,
        });
        ctx === null || ctx === void 0 ? void 0 : ctx.step("Updating pool availability");
        // Deduct staked amount from availableToStake
        pool.availableToStake = pool.availableToStake - amount;
        await pool.save({ transaction });
        await transaction.commit();
        ctx === null || ctx === void 0 ? void 0 : ctx.success(`Staked ${amount} ${pool.symbol} in pool ${pool.name} for ${pool.lockPeriod} days`);
        return position;
    }
    catch (err) {
        await transaction.rollback();
        ctx === null || ctx === void 0 ? void 0 : ctx.fail(err.message || "Failed to stake tokens");
        throw (0, error_1.createError)({
            statusCode: 500,
            message: err.message || "Failed to stake tokens",
        });
    }
};
