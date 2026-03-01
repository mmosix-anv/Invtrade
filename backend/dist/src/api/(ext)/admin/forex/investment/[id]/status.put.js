"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.metadata = void 0;
const query_1 = require("@b/utils/query");
exports.metadata = {
    summary: "Updates a Forex investment status",
    description: "Updates the status of a specific Forex investment. Valid statuses are ACTIVE, COMPLETED, CANCELLED, or REJECTED.",
    operationId: "updateForexInvestmentStatus",
    tags: ["Admin", "Forex", "Investment"],
    parameters: [
        {
            index: 0,
            name: "id",
            in: "path",
            required: true,
            description: "ID of the forex investment to update",
            schema: { type: "string" },
        },
    ],
    requestBody: {
        required: true,
        content: {
            "application/json": {
                schema: {
                    type: "object",
                    properties: {
                        status: {
                            type: "string",
                            enum: ["ACTIVE", "COMPLETED", "CANCELLED", "REJECTED"],
                            description: "New status to apply",
                        },
                    },
                    required: ["status"],
                },
            },
        },
    },
    responses: (0, query_1.updateRecordResponses)("Forex Investment"),
    requiresAuth: true,
    permission: "edit.forex.investment",
    logModule: "ADMIN_FOREX",
    logTitle: "Update forex investment status",
};
exports.default = async (data) => {
    const { body, params, ctx } = data;
    const { id } = params;
    const { status } = body;
    ctx === null || ctx === void 0 ? void 0 : ctx.step(`Validating forex investment ${id}`);
    ctx === null || ctx === void 0 ? void 0 : ctx.step(`Updating forex investment status to ${status}`);
    const result = await (0, query_1.updateStatus)("forexInvestment", id, status);
    ctx === null || ctx === void 0 ? void 0 : ctx.success("Forex investment status updated successfully");
    return result;
};
