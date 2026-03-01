"use strict";
// /server/api/mlm/referral-conditions/index.get.ts
Object.defineProperty(exports, "__esModule", { value: true });
exports.metadata = void 0;
const db_1 = require("@b/db");
const constants_1 = require("@b/utils/constants");
const query_1 = require("@b/utils/query");
const errors_1 = require("@b/utils/schema/errors");
const utils_1 = require("./utils");
exports.metadata = {
    summary: "Lists all affiliate conditions with pagination and filtering",
    description: "Retrieves a paginated list of all affiliate conditions. Supports filtering, sorting, and searching through various condition parameters. Returns conditions with reward details, types, and status information.",
    operationId: "listAffiliateConditions",
    tags: ["Admin", "Affiliate", "Condition"],
    parameters: constants_1.crudParameters,
    responses: {
        200: {
            description: "Affiliate conditions retrieved successfully",
            content: {
                "application/json": {
                    schema: {
                        type: "object",
                        properties: {
                            items: {
                                type: "array",
                                items: {
                                    type: "object",
                                    properties: utils_1.mlmReferralConditionSchema,
                                },
                            },
                            pagination: constants_1.paginationSchema,
                        },
                    },
                },
            },
        },
        401: errors_1.unauthorizedResponse,
        404: (0, errors_1.notFoundResponse)("Affiliate Conditions"),
        500: errors_1.serverErrorResponse,
    },
    requiresAuth: true,
    permission: "view.affiliate.condition",
    logModule: "ADMIN_AFFILIATE",
    logTitle: "List affiliate conditions",
};
exports.default = async (data) => {
    const { query, ctx } = data;
    ctx === null || ctx === void 0 ? void 0 : ctx.step("Fetching affiliate conditions");
    const result = (0, query_1.getFiltered)({
        model: db_1.models.mlmReferralCondition,
        query,
        sortField: query.sortField || "id",
        timestamps: false,
    });
    ctx === null || ctx === void 0 ? void 0 : ctx.success("Conditions fetched successfully");
    return result;
};
