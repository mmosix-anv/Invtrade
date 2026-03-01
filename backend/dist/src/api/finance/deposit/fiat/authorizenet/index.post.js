"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.metadata = void 0;
const query_1 = require("@b/utils/query");
const error_1 = require("@b/utils/error");
const console_1 = require("@b/utils/console");
const db_1 = require("@b/db");
const utils_1 = require("./utils");
exports.metadata = {
    summary: "Create Authorize.Net hosted payment page",
    description: "Creates an Authorize.Net Accept Hosted payment page for secure deposit processing. Returns a payment token for hosted payment form integration.",
    operationId: "createAuthorizeNetPayment",
    tags: ["Finance", "Deposit"],
    requiresAuth: true,
    logModule: "AUTHORIZENET_DEPOSIT",
    logTitle: "Create Authorize.Net payment",
    requestBody: {
        required: true,
        content: {
            "application/json": {
                schema: {
                    type: "object",
                    properties: {
                        amount: {
                            type: "number",
                            description: "Deposit amount",
                        },
                        currency: {
                            type: "string",
                            description: "Currency code (USD, CAD, EUR, etc.)",
                            example: "USD",
                        },
                    },
                    required: ["amount", "currency"],
                },
            },
        },
    },
    responses: {
        200: {
            description: "Hosted payment page created successfully. Returns payment token and form URL.",
            content: {
                "application/json": {
                    schema: {
                        type: "object",
                        properties: {
                            status: {
                                type: "boolean",
                                description: "Indicates if the request was successful",
                            },
                            statusCode: {
                                type: "number",
                                description: "HTTP status code",
                                example: 200,
                            },
                            data: {
                                type: "object",
                                properties: {
                                    token: {
                                        type: "string",
                                        description: "Payment token for hosted form",
                                    },
                                    formUrl: {
                                        type: "string",
                                        description: "URL for hosted payment form",
                                    },
                                    referenceId: {
                                        type: "string",
                                        description: "Transaction reference ID",
                                    },
                                },
                            },
                        },
                    },
                },
            },
        },
        401: query_1.unauthorizedResponse,
        404: (0, query_1.notFoundMetadataResponse)("Authorize.Net"),
        500: query_1.serverErrorResponse,
    },
};
exports.default = async (data) => {
    const { user, body, ctx } = data;
    if (!(user === null || user === void 0 ? void 0 : user.id))
        throw (0, error_1.createError)({ statusCode: 401, message: "User not authenticated" });
    ctx === null || ctx === void 0 ? void 0 : ctx.step("Fetching user account");
    const userPk = await db_1.models.user.findByPk(user.id);
    if (!userPk)
        throw (0, error_1.createError)({ statusCode: 404, message: "User not found" });
    const { amount, currency } = body;
    // Validate amount
    if (!amount || amount <= 0) {
        throw (0, error_1.createError)({ statusCode: 400, message: "Invalid amount" });
    }
    // Validate currency
    const supportedCurrencies = ["USD", "CAD", "GBP", "EUR", "AUD", "NZD", "DKK", "NOK", "PLN", "SEK"];
    if (!supportedCurrencies.includes(currency)) {
        throw (0, error_1.createError)({ statusCode: 400, message: `Currency ${currency} is not supported by Authorize.Net` });
    }
    // Get Authorize.Net gateway configuration
    const authorizeNetGateway = await db_1.models.depositGateway.findOne({
        where: { name: "AUTHORIZENET" },
    });
    if (!authorizeNetGateway) {
        throw (0, error_1.createError)({ statusCode: 404, message: "Authorize.Net gateway not found" });
    }
    if (!authorizeNetGateway.status) {
        throw (0, error_1.createError)({ statusCode: 400, message: "Authorize.Net gateway is currently disabled" });
    }
    // Check currency support
    if (!authorizeNetGateway.currencies.includes(currency)) {
        throw (0, error_1.createError)({ statusCode: 400, message: `Currency ${currency} is not supported by this gateway` });
    }
    // Validate amount limits
    if (amount < (authorizeNetGateway.minAmount || 1)) {
        throw (0, error_1.createError)({ statusCode: 400, message: `Minimum deposit amount is ${authorizeNetGateway.minAmount || 1} ${currency}` });
    }
    if (amount > (authorizeNetGateway.maxAmount || 10000)) {
        throw (0, error_1.createError)({ statusCode: 400, message: `Maximum deposit amount is ${authorizeNetGateway.maxAmount || 10000} ${currency}` });
    }
    try {
        const config = (0, utils_1.getAuthorizeNetConfig)();
        // Calculate fees
        ctx === null || ctx === void 0 ? void 0 : ctx.step("Calculating fees");
        const fixedFee = authorizeNetGateway.fixedFee || 0;
        const percentageFee = authorizeNetGateway.percentageFee || 0;
        const feeAmount = Number(((amount * percentageFee) / 100 + fixedFee).toFixed(2));
        const totalAmount = Number((amount + feeAmount).toFixed(2));
        // Generate unique reference ID
        const referenceId = `deposit_${user.id.toString()}_${Date.now()}`;
        // Create transaction record
        ctx === null || ctx === void 0 ? void 0 : ctx.step("Creating transaction record");
        const transaction = await db_1.models.transaction.create({
            userId: user.id,
            type: "DEPOSIT",
            amount: amount,
            fee: feeAmount,
            referenceId: referenceId,
            status: "PENDING",
            description: `Authorize.Net deposit of ${amount} ${currency}`,
            metadata: JSON.stringify({
                method: "AUTHORIZENET",
                currency: currency,
                totalAmount: totalAmount,
            }),
        });
        // Prepare hosted payment request
        const hostedPaymentRequest = {
            merchantAuthentication: {
                name: config.apiLoginId,
                transactionKey: config.transactionKey,
            },
            refId: referenceId,
            transactionRequest: {
                transactionType: "authCaptureTransaction",
                amount: totalAmount.toString(),
                currencyCode: currency,
                customer: {
                    id: user.id.toString(),
                    email: userPk.email,
                },
                billTo: {
                    firstName: userPk.firstName || "",
                    lastName: userPk.lastName || "",
                },
                order: {
                    invoiceNumber: referenceId,
                    description: `Deposit to wallet - ${amount} ${currency}`,
                },
            },
            hostedPaymentSettings: (0, utils_1.generateHostedPaymentSettings)({
                returnUrl: `${process.env.FRONTEND_URL}/finance/deposit?status=success&ref=${referenceId}`,
                cancelUrl: `${process.env.FRONTEND_URL}/finance/deposit?status=cancelled&ref=${referenceId}`,
                showReceipt: false,
            }),
        };
        // Create hosted payment page
        const response = await (0, utils_1.makeAuthorizeNetRequest)({ getHostedPaymentPageRequest: hostedPaymentRequest }, config);
        const hostedPaymentResponse = response.getHostedPaymentPageResponse;
        if (hostedPaymentResponse.messages.resultCode !== "Ok") {
            const errorMessage = hostedPaymentResponse.messages.message
                .map(msg => msg.text)
                .join(", ");
            throw (0, error_1.createError)({ statusCode: 400, message: `Authorize.Net error: ${errorMessage}` });
        }
        if (!hostedPaymentResponse.token) {
            throw (0, error_1.createError)({ statusCode: 500, message: "Failed to create hosted payment page - no token received" });
        }
        // Construct form URL
        const formUrl = `https://${config.environment === "production" ? "accept" : "test"}.authorize.net/payment/payment?token=${hostedPaymentResponse.token}`;
        return {
            status: true,
            statusCode: 200,
            data: {
                token: hostedPaymentResponse.token,
                formUrl: formUrl,
                referenceId: referenceId,
                amount: amount,
                currency: currency,
                fee: feeAmount,
                totalAmount: totalAmount,
            },
        };
    }
    catch (error) {
        console_1.logger.error("AUTHORIZENET", "Payment creation error", error);
        throw (0, error_1.createError)({ statusCode: 500, message: error instanceof Error ? error.message : "Failed to create Authorize.Net payment" });
    }
};
