"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.metadata = void 0;
const db_1 = require("@b/db");
const error_1 = require("@b/utils/error");
const query_1 = require("@b/utils/query");
const utils_1 = require("./utils");
exports.metadata = {
    summary: "Retrieves all investments for the logged-in user",
    description: "Fetches all AI trading investments for the currently authenticated user, excluding active investments.",
    operationId: "getAllInvestments",
    tags: ["AI Trading"],
    responses: {
        200: {
            description: "Investments retrieved successfully",
            content: {
                "application/json": {
                    schema: {
                        type: "array",
                        items: {
                            type: "object",
                            properties: utils_1.baseInvestmentSchema,
                        },
                    },
                },
            },
        },
        401: query_1.unauthorizedResponse,
        404: (0, query_1.notFoundMetadataResponse)("AI Investment"),
        500: query_1.serverErrorResponse,
    },
    logModule: "AI",
    logTitle: "Get all AI investments",
    requiresAuth: true,
};
exports.default = async (data) => {
    const { user, ctx } = data;
    if (!(user === null || user === void 0 ? void 0 : user.id))
        throw (0, error_1.createError)({ statusCode: 401, message: "Unauthorized" });
    ctx === null || ctx === void 0 ? void 0 : ctx.step("Fetching all user investments");
    const investments = await db_1.models.aiInvestment.findAll({
        where: {
            userId: user.id,
        },
        include: [
            {
                model: db_1.models.aiInvestmentPlan,
                as: "plan",
                attributes: ["title"],
            },
            {
                model: db_1.models.aiInvestmentDuration,
                as: "duration",
                attributes: ["duration", "timeframe"],
            },
        ],
        attributes: [
            "id",
            "symbol",
            "type",
            "amount",
            "profit",
            "result",
            "status",
            "createdAt",
        ],
        order: [
            ["status", "ASC"],
            ["createdAt", "ASC"],
        ],
    });
    ctx === null || ctx === void 0 ? void 0 : ctx.success(`Retrieved ${investments.length} investment(s)`);
    return investments;
};
