"use strict";
// /server/api/admin/deposit/gateways/[id]/update.put.ts
Object.defineProperty(exports, "__esModule", { value: true });
exports.metadata = void 0;
const query_1 = require("@b/utils/query");
const utils_1 = require("../utils");
exports.metadata = {
    summary: "Updates a specific deposit gateway",
    operationId: "updateDepositGateway",
    tags: ["Admin", "Deposit Gateways"],
    parameters: [
        {
            index: 0,
            name: "id",
            in: "path",
            description: "ID of the deposit gateway to update",
            required: true,
            schema: {
                type: "string",
            },
        },
    ],
    requestBody: {
        description: "New data for the deposit gateway",
        content: {
            "application/json": {
                schema: utils_1.gatewayUpdateSchema,
            },
        },
    },
    responses: (0, query_1.updateRecordResponses)("Deposit Gateway"),
    requiresAuth: true,
    permission: "edit.deposit.gateway",
    logModule: "ADMIN_FIN",
    logTitle: "Update deposit gateway",
};
exports.default = async (data) => {
    const { body, params, ctx } = data;
    const { id } = params;
    const { title, description, image, alias, currencies, fixedFee, percentageFee, minAmount, maxAmount, status, } = body;
    ctx === null || ctx === void 0 ? void 0 : ctx.step("Fetching deposit gateway record");
    // Ensure currencies is properly formatted as an array
    const formattedCurrencies = Array.isArray(currencies) ? currencies :
        (typeof currencies === 'string' ? currencies.split(',').map(c => c.trim()) : null);
    // Ensure fee and limit values are properly formatted
    const formatFeeValue = (value) => {
        if (value === null || value === undefined)
            return null;
        if (typeof value === 'number')
            return value;
        if (typeof value === 'string') {
            // Try to parse as number first
            const parsed = parseFloat(value);
            if (!isNaN(parsed))
                return parsed;
            // If not a number, try to parse as JSON (for object strings)
            try {
                const jsonParsed = JSON.parse(value);
                if (typeof jsonParsed === 'object' && jsonParsed !== null)
                    return jsonParsed;
                return typeof jsonParsed === 'number' ? jsonParsed : 0;
            }
            catch (_a) {
                return 0;
            }
        }
        if (typeof value === 'object' && value !== null)
            return value;
        return 0;
    };
    ctx === null || ctx === void 0 ? void 0 : ctx.step("Updating deposit gateway");
    const result = await (0, query_1.updateRecord)("depositGateway", id, {
        title,
        description,
        image,
        alias,
        currencies: formattedCurrencies,
        fixedFee: formatFeeValue(fixedFee),
        percentageFee: formatFeeValue(percentageFee),
        minAmount: formatFeeValue(minAmount),
        maxAmount: formatFeeValue(maxAmount),
        status,
    });
    ctx === null || ctx === void 0 ? void 0 : ctx.success("Deposit gateway updated successfully");
    return result;
};
