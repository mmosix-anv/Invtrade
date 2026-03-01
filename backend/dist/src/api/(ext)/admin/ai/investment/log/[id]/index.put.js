"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.metadata = void 0;
const query_1 = require("@b/utils/query");
const utils_1 = require("../utils");
exports.metadata = {
    summary: "Updates a specific AI Investment",
    operationId: "updateAiInvestment",
    tags: ["Admin", "AI Investments"],
    parameters: [
        {
            index: 0,
            name: "id",
            in: "path",
            description: "ID of the AI Investment to update",
            required: true,
            schema: {
                type: "string",
            },
        },
    ],
    requestBody: {
        description: "New data for the AI Investment",
        content: {
            "application/json": {
                schema: utils_1.aiInvestmentUpdateSchema,
            },
        },
    },
    responses: (0, query_1.updateRecordResponses)("AI Investment"),
    requiresAuth: true,
    permission: "edit.ai.investment",
    logModule: "ADMIN_AI",
    logTitle: "Update AI investment",
};
exports.default = async (data) => {
    const { body, params, ctx } = data;
    const { id } = params;
    const { userId, planId, durationId, symbol, amount, profit, result, status } = body;
    ctx === null || ctx === void 0 ? void 0 : ctx.step(`Updating investment ${id}`);
    const investmentResult = await (0, query_1.updateRecord)("aiInvestment", id, {
        userId,
        planId,
        durationId,
        symbol,
        amount,
        profit,
        result,
        status,
    });
    ctx === null || ctx === void 0 ? void 0 : ctx.success("Investment updated successfully");
    return investmentResult;
};
