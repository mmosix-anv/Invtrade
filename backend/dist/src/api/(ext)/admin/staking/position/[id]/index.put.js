"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.metadata = void 0;
const db_1 = require("@b/db");
const error_1 = require("@b/utils/error");
const notifications_1 = require("@b/utils/notifications");
const sequelize_1 = require("sequelize");
exports.metadata = {
    summary: "Update Staking Position",
    description: "Updates an existing staking position with the provided details.",
    operationId: "updateStakingPosition",
    tags: ["Staking", "Admin", "Positions"],
    requiresAuth: true,
    logModule: "ADMIN_STAKE",
    logTitle: "Update Staking Position",
    parameters: [
        {
            index: 0,
            name: "id",
            in: "path",
            required: true,
            schema: { type: "string" },
            description: "Position ID",
        },
    ],
    requestBody: {
        description: "Updated staking position data",
        required: true,
        content: {
            "application/json": {
                schema: {
                    type: "object",
                    properties: {
                        amount: { type: "number" },
                        startDate: { type: "string", format: "date-time" },
                        endDate: { type: "string", format: "date-time" },
                        status: {
                            type: "string",
                            enum: ["ACTIVE", "COMPLETED", "CANCELLED", "PENDING_WITHDRAWAL"],
                        },
                        withdrawalRequested: { type: "boolean" },
                        withdrawalRequestDate: {
                            type: "string",
                            format: "date-time",
                            nullable: true,
                        },
                        adminNotes: {
                            type: "string",
                            nullable: true,
                        },
                        completedAt: {
                            type: "string",
                            format: "date-time",
                            nullable: true,
                        },
                    },
                },
            },
        },
    },
    responses: {
        200: {
            description: "Position updated successfully",
            content: {
                "application/json": {
                    schema: {
                        type: "object",
                    },
                },
            },
        },
        400: { description: "Bad Request" },
        401: { description: "Unauthorized" },
        404: { description: "Position not found" },
        500: { description: "Internal Server Error" },
    },
    permission: "edit.staking.position",
};
exports.default = async (data) => {
    var _a, _b, _c, _d;
    const { user, params, body, ctx } = data;
    if (!(user === null || user === void 0 ? void 0 : user.id)) {
        throw (0, error_1.createError)({ statusCode: 401, message: "Unauthorized" });
    }
    const positionId = params.id;
    if (!positionId) {
        throw (0, error_1.createError)({ statusCode: 400, message: "Position ID is required" });
    }
    if (!body) {
        throw (0, error_1.createError)({ statusCode: 400, message: "Request body is required" });
    }
    try {
        ctx === null || ctx === void 0 ? void 0 : ctx.step("Find position to update");
        // Find the position to update
        const position = await db_1.models.stakingPosition.findOne({
            where: { id: positionId },
            include: [
                {
                    model: db_1.models.stakingPool,
                    as: "pool",
                },
            ],
        });
        if (!position) {
            throw (0, error_1.createError)({ statusCode: 404, message: "Position not found" });
        }
        // Check if status is changing to COMPLETED
        const isCompletingPosition = position.status !== "COMPLETED" && body.status === "COMPLETED";
        ctx === null || ctx === void 0 ? void 0 : ctx.step("Update position");
        // Update the position
        await position.update({
            ...body,
            // If completing the position, set completedAt to now if not provided
            completedAt: isCompletingPosition && !body.completedAt
                ? new Date()
                : body.completedAt,
        });
        ctx === null || ctx === void 0 ? void 0 : ctx.step("Reload position with associations");
        // Reload the position with associations
        const updatedPosition = await db_1.models.stakingPosition.findOne({
            where: { id: positionId },
            include: [
                {
                    model: db_1.models.stakingPool,
                    as: "pool",
                },
                {
                    model: db_1.models.stakingEarningRecord,
                    as: "earningHistory",
                    required: false,
                },
            ],
        });
        ctx === null || ctx === void 0 ? void 0 : ctx.step("Calculate additional properties");
        // Calculate additional properties
        const pendingRewardsResult = await db_1.models.stakingEarningRecord.findOne({
            attributes: [[(0, sequelize_1.fn)("SUM", (0, sequelize_1.col)("amount")), "pendingRewards"]],
            where: {
                positionId: position.id,
                isClaimed: false,
            },
            raw: true,
        });
        const pendingRewards = (pendingRewardsResult === null || pendingRewardsResult === void 0 ? void 0 : pendingRewardsResult.pendingRewards) || 0;
        const earningsToDateResult = await db_1.models.stakingEarningRecord.findOne({
            attributes: [[(0, sequelize_1.fn)("SUM", (0, sequelize_1.col)("amount")), "earningsToDate"]],
            where: {
                positionId: position.id,
            },
            raw: true,
        });
        const earningsToDate = (earningsToDateResult === null || earningsToDateResult === void 0 ? void 0 : earningsToDateResult.earningsToDate) || 0;
        const lastEarningRecord = await db_1.models.stakingEarningRecord.findOne({
            attributes: ["createdAt"],
            where: {
                positionId: position.id,
            },
            order: [["createdAt", "DESC"]],
            raw: true,
        });
        const lastEarningDate = (lastEarningRecord === null || lastEarningRecord === void 0 ? void 0 : lastEarningRecord.createdAt) || null;
        // Create a notification for the user
        try {
            // Get user ID from the position
            const userId = position.userId;
            // Create notification based on the update type
            let title, message, details;
            if (isCompletingPosition) {
                title = "Staking Position Completed";
                message = `Your staking position in ${position.pool.name} has been completed.`;
                details =
                    "Your staked amount and earnings are now available for withdrawal.";
            }
            else if (body.status === "CANCELLED") {
                title = "Staking Position Cancelled";
                message = `Your staking position in ${position.pool.name} has been cancelled.`;
                details = "Please contact support if you have any questions.";
            }
            else if (body.withdrawalRequested && !position.withdrawalRequested) {
                title = "Withdrawal Request Received";
                message = `Your withdrawal request for ${position.pool.name} has been received.`;
                details = "We are processing your request and will update you soon.";
            }
            else {
                title = "Staking Position Updated";
                message = `Your staking position in ${position.pool.name} has been updated.`;
                details = "Check your dashboard for the latest information.";
            }
            await (0, notifications_1.createNotification)({
                userId,
                relatedId: position.id,
                type: "system",
                title,
                message,
                details,
                link: `/staking/positions/${position.id}`,
                actions: [
                    {
                        label: "View Position",
                        link: `/staking/positions/${position.id}`,
                        primary: true,
                    },
                ],
            }, ctx);
        }
        catch (notifErr) {
            console.error("Failed to create notification for position update", notifErr);
            // Continue execution even if notification fails
        }
        ctx === null || ctx === void 0 ? void 0 : ctx.success("Staking position updated successfully");
        // Return position with computed properties
        return {
            ...updatedPosition.toJSON(),
            pendingRewards,
            earningsToDate,
            lastEarningDate,
            rewardTokenSymbol: (_a = updatedPosition.pool) === null || _a === void 0 ? void 0 : _a.symbol,
            tokenSymbol: (_b = updatedPosition.pool) === null || _b === void 0 ? void 0 : _b.symbol,
            poolName: (_c = updatedPosition.pool) === null || _c === void 0 ? void 0 : _c.name,
            lockPeriodEnd: updatedPosition.endDate,
            apr: (_d = updatedPosition.pool) === null || _d === void 0 ? void 0 : _d.apr,
        };
    }
    catch (error) {
        if (error.statusCode === 404) {
            throw error;
        }
        console.error(`Error updating staking position ${positionId}:`, error);
        throw (0, error_1.createError)({
            statusCode: 500,
            message: error.message,
        });
    }
};
