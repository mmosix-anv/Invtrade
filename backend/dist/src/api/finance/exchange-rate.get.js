"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.metadata = void 0;
const error_1 = require("@b/utils/error");
const schema_1 = require("@b/utils/schema");
const query_1 = require("@b/utils/query");
const utils_1 = require("./currency/utils");
const console_1 = require("@b/utils/console");
exports.metadata = {
    summary: "Get exchange rate between two currencies",
    description: "Calculates the exchange rate between two currencies across different wallet types (FIAT, SPOT, ECO, FUTURES)",
    operationId: "getExchangeRate",
    tags: ["Finance"],
    requiresAuth: true,
    parameters: [
        {
            name: "fromCurrency",
            in: "query",
            description: "Source currency code (e.g., EUR, USD, BTC)",
            required: true,
            schema: { type: "string" },
        },
        {
            name: "fromType",
            in: "query",
            description: "Source wallet type (FIAT, SPOT, ECO, FUTURES)",
            required: true,
            schema: { type: "string", enum: ["FIAT", "SPOT", "ECO", "FUTURES"] },
        },
        {
            name: "toCurrency",
            in: "query",
            description: "Target currency code (e.g., EUR, USD, BTC)",
            required: true,
            schema: { type: "string" },
        },
        {
            name: "toType",
            in: "query",
            description: "Target wallet type (FIAT, SPOT, ECO, FUTURES)",
            required: true,
            schema: { type: "string", enum: ["FIAT", "SPOT", "ECO", "FUTURES"] },
        },
    ],
    responses: {
        200: {
            description: "Exchange rate calculated successfully",
            content: {
                "application/json": {
                    schema: {
                        type: "object",
                        properties: {
                            rate: (0, schema_1.baseNumberSchema)("Exchange rate (1 fromCurrency = X toCurrency)"),
                            fromPriceUSD: (0, schema_1.baseNumberSchema)("Price of source currency in USD"),
                            toPriceUSD: (0, schema_1.baseNumberSchema)("Price of target currency in USD"),
                        },
                    },
                },
            },
        },
        400: {
            description: "Invalid parameters or currencies",
        },
        401: query_1.unauthorizedResponse,
        404: (0, query_1.notFoundMetadataResponse)("Currency"),
        500: query_1.serverErrorResponse,
    },
};
exports.default = async (data) => {
    const { user, query } = data;
    if (!(user === null || user === void 0 ? void 0 : user.id)) {
        throw (0, error_1.createError)({ statusCode: 401, message: "Unauthorized" });
    }
    const { fromCurrency, fromType, toCurrency, toType } = query;
    // Validate required parameters
    if (!fromCurrency || !fromType || !toCurrency || !toType) {
        throw (0, error_1.createError)({
            statusCode: 400,
            message: "Missing required parameters: fromCurrency, fromType, toCurrency, toType",
        });
    }
    // Validate wallet types
    const validTypes = ["FIAT", "SPOT", "ECO", "FUTURES"];
    if (!validTypes.includes(fromType) || !validTypes.includes(toType)) {
        throw (0, error_1.createError)({
            statusCode: 400,
            message: "Invalid wallet type. Must be FIAT, SPOT, ECO, or FUTURES",
        });
    }
    try {
        // Get price in USD for source currency
        let fromPriceUSD;
        if (fromType === "FIAT") {
            fromPriceUSD = await (0, utils_1.getFiatPriceInUSD)(fromCurrency);
        }
        else if (fromType === "SPOT" || fromType === "FUTURES") {
            fromPriceUSD = await (0, utils_1.getSpotPriceInUSD)(fromCurrency);
        }
        else if (fromType === "ECO") {
            fromPriceUSD = await (0, utils_1.getEcoPriceInUSD)(fromCurrency);
        }
        else {
            throw (0, error_1.createError)({
                statusCode: 400,
                message: `Unsupported wallet type: ${fromType}`,
            });
        }
        // Get price in USD for target currency
        let toPriceUSD;
        if (toType === "FIAT") {
            toPriceUSD = await (0, utils_1.getFiatPriceInUSD)(toCurrency);
        }
        else if (toType === "SPOT" || toType === "FUTURES") {
            toPriceUSD = await (0, utils_1.getSpotPriceInUSD)(toCurrency);
        }
        else if (toType === "ECO") {
            toPriceUSD = await (0, utils_1.getEcoPriceInUSD)(toCurrency);
        }
        else {
            throw (0, error_1.createError)({
                statusCode: 400,
                message: `Unsupported wallet type: ${toType}`,
            });
        }
        // Validate prices are valid numbers
        if (!fromPriceUSD || isNaN(fromPriceUSD) || fromPriceUSD <= 0) {
            throw (0, error_1.createError)({
                statusCode: 400,
                message: `Price not available for ${fromCurrency} (${fromType})`,
            });
        }
        if (!toPriceUSD || isNaN(toPriceUSD) || toPriceUSD <= 0) {
            throw (0, error_1.createError)({
                statusCode: 400,
                message: `Price not available for ${toCurrency} (${toType})`,
            });
        }
        // Calculate exchange rate: 1 fromCurrency = X toCurrency
        // Example: EUR ($1.05) to POL ($0.14) = 1.05 / 0.14 = 7.5 POL per EUR
        const rate = fromPriceUSD / toPriceUSD;
        return {
            rate,
            fromPriceUSD,
            toPriceUSD,
        };
    }
    catch (error) {
        // If it's already a createError, rethrow it
        if (error.statusCode) {
            throw error;
        }
        // Otherwise wrap it in a generic error
        console_1.logger.error("EXCHANGE", "Error calculating exchange rate", error);
        throw (0, error_1.createError)({
            statusCode: 500,
            message: error.message || "Failed to calculate exchange rate",
        });
    }
};
