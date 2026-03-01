"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.metadata = void 0;
const db_1 = require("@b/db");
const error_1 = require("@b/utils/error");
const query_1 = require("@b/utils/query");
const sequelize_1 = require("sequelize");
const console_1 = require("@b/utils/console");
exports.metadata = {
    summary: "Delete an ICO offering",
    description: "Deletes an ICO token offering. Admin-only endpoint. Cannot delete offerings with active investments.",
    operationId: "deleteIcoOffering",
    tags: ["ICO", "Admin", "Offerings"],
    parameters: [
        {
            name: "id",
            in: "path",
            description: "ID of the ICO offering to delete",
            required: true,
            schema: {
                type: "string",
            },
        },
    ],
    requiresAuth: true,
    permission: "delete.ico.offer",
    responses: {
        200: {
            description: "Offering deleted successfully",
        },
        400: {
            description: "Bad Request - Cannot delete offering with active investments",
        },
        401: query_1.unauthorizedResponse,
        403: {
            description: "Forbidden - Admin privileges required",
        },
        404: (0, query_1.notFoundMetadataResponse)("Offering"),
        500: query_1.serverErrorResponse,
    },
    logModule: "ADMIN_ICO",
    logTitle: "Delete ICO Offering",
};
exports.default = async (data) => {
    var _a;
    const { user, params, ctx } = data;
    if (!(user === null || user === void 0 ? void 0 : user.id)) {
        throw (0, error_1.createError)({
            statusCode: 401,
            message: "Unauthorized: Admin privileges required",
        });
    }
    const { id } = params;
    let transaction;
    try {
        transaction = await db_1.sequelize.transaction();
        ctx === null || ctx === void 0 ? void 0 : ctx.step("Finding ICO offering");
        // Find the offering
        const offering = await db_1.models.icoTokenOffering.findByPk(id, {
            transaction,
        });
        if (!offering) {
            throw (0, error_1.createError)({ statusCode: 404, message: "Offering not found" });
        }
        ctx === null || ctx === void 0 ? void 0 : ctx.step("Checking for active transactions");
        // Check if offering has any active (non-completed/non-rejected) transactions
        // Only block deletion for transactions that are truly in progress
        // COMPLETED and REJECTED transactions are historical records that don't block deletion
        const activeTransactions = await db_1.models.icoTransaction.count({
            where: {
                offeringId: id,
                status: {
                    [sequelize_1.Op.in]: ["PENDING", "VERIFICATION"],
                    // Removed "RELEASED" - released transactions are completed and shouldn't block deletion
                },
            },
            transaction,
        });
        if (activeTransactions > 0) {
            throw (0, error_1.createError)({
                statusCode: 400,
                message: `Cannot delete offering with ${activeTransactions} active investment(s). Please wait for all investments to be released or rejected first.`,
            });
        }
        // Only allow deletion of PENDING, REJECTED, or FAILED offerings
        // Prevent deletion of ACTIVE or SUCCESS offerings that might have history
        if (offering.status === "SUCCESS") {
            throw (0, error_1.createError)({
                statusCode: 400,
                message: "Cannot delete successful offerings. They are kept for historical records.",
            });
        }
        ctx === null || ctx === void 0 ? void 0 : ctx.step("Deleting associated records");
        // Delete associated records in order (to handle foreign key constraints)
        // Note: Cascade delete should handle most of this, but we do it explicitly for clarity
        // Delete phases
        await db_1.models.icoTokenOfferingPhase.destroy({
            where: { offeringId: id },
            transaction,
        });
        // Delete team members
        await db_1.models.icoTeamMember.destroy({
            where: { offeringId: id },
            transaction,
        });
        // Delete roadmap items
        await db_1.models.icoRoadmapItem.destroy({
            where: { offeringId: id },
            transaction,
        });
        // Delete updates
        await db_1.models.icoTokenOfferingUpdate.destroy({
            where: { offeringId: id },
            transaction,
        });
        // Delete admin activities
        await db_1.models.icoAdminActivity.destroy({
            where: { offeringId: id },
            transaction,
        });
        // Delete token detail
        await db_1.models.icoTokenDetail.destroy({
            where: { offeringId: id },
            transaction,
        });
        // Delete all transactions (including rejected and completed ones)
        // Since we already verified there are no active PENDING/VERIFICATION transactions above
        await db_1.models.icoTransaction.destroy({
            where: { offeringId: id },
            transaction,
        });
        ctx === null || ctx === void 0 ? void 0 : ctx.step("Deleting offering");
        // Finally, delete the offering itself
        await offering.destroy({ transaction });
        await transaction.commit();
        ctx === null || ctx === void 0 ? void 0 : ctx.success("ICO offering deleted successfully");
        return {
            message: "ICO offering deleted successfully",
        };
    }
    catch (error) {
        // Only rollback if transaction exists and hasn't been committed/rolled back
        if (transaction) {
            try {
                if (!transaction.finished) {
                    await transaction.rollback();
                }
            }
            catch (rollbackError) {
                // Ignore rollback errors if transaction is already finished
                if (!((_a = rollbackError.message) === null || _a === void 0 ? void 0 : _a.includes("already been finished"))) {
                    console_1.logger.error("ADMIN_ICO_OFFER", "Transaction rollback failed", rollbackError);
                }
            }
        }
        console_1.logger.error("ADMIN_ICO_OFFER", "Error deleting ICO offering", error);
        // If it's already a createError, rethrow it
        if (error.statusCode) {
            throw error;
        }
        // Otherwise, wrap it in a generic error
        throw (0, error_1.createError)({
            statusCode: 500,
            message: error.message || "Failed to delete ICO offering",
        });
    }
};
