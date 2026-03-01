"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.metadata = void 0;
const query_1 = require("@b/utils/query");
exports.metadata = {
    summary: "Updates the status of an AI Investment",
    operationId: "updateAIInvestmentStatus",
    tags: ["Admin", "AI Investments"],
    parameters: [
        {
            name: "id",
            in: "path",
            required: true,
            description: "ID of the AI Investment to update",
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
    responses: (0, query_1.updateRecordResponses)("AI Investment"),
    requiresAuth: true,
    permission: "edit.ai.investment",
    logModule: "ADMIN_AI",
    logTitle: "Update AI investment status",
};
exports.default = async (data) => {
    const { body, params, ctx } = data;
    const { id } = params;
    const { status } = body;
    ctx === null || ctx === void 0 ? void 0 : ctx.step(`Updating investment ${id} status to ${status}`);
    const result = await (0, query_1.updateStatus)("aiInvestment", id, status);
    ctx === null || ctx === void 0 ? void 0 : ctx.success("Investment status updated");
    return result;
};
