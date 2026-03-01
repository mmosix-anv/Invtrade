"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.metadata = void 0;
const error_1 = require("@b/utils/error");
const db_1 = require("@b/db");
const console_1 = require("@b/utils/console");
const utils_1 = require("./utils");
exports.metadata = {
    summary: 'Creates a Mollie payment session',
    description: 'Initiates a payment with Mollie and returns checkout URL',
    operationId: 'createMolliePayment',
    tags: ['Finance', 'Deposit', 'Mollie'],
    requiresAuth: true,
    logModule: "MOLLIE_DEPOSIT",
    logTitle: "Create Mollie payment session",
    requestBody: {
        required: true,
        content: {
            'application/json': {
                schema: {
                    type: 'object',
                    properties: {
                        amount: {
                            type: 'number',
                            description: 'Payment amount',
                            minimum: 0.01,
                        },
                        currency: {
                            type: 'string',
                            description: 'Payment currency code',
                            example: 'EUR',
                        },
                        method: {
                            type: 'string',
                            description: 'Preferred payment method (optional)',
                            example: 'creditcard',
                        },
                        locale: {
                            type: 'string',
                            description: 'User locale for payment page',
                            example: 'en',
                        },
                    },
                    required: ['amount', 'currency'],
                },
            },
        },
    },
    responses: {
        200: {
            description: 'Payment session created successfully',
            content: {
                'application/json': {
                    schema: {
                        type: 'object',
                        properties: {
                            success: { type: 'boolean' },
                            data: {
                                type: 'object',
                                properties: {
                                    transactionId: { type: 'string' },
                                    paymentId: { type: 'string' },
                                    checkoutUrl: { type: 'string' },
                                    amount: { type: 'number' },
                                    currency: { type: 'string' },
                                    status: { type: 'string' },
                                    expiresAt: { type: 'string' },
                                    availableMethods: {
                                        type: 'array',
                                        items: { type: 'string' },
                                    },
                                },
                            },
                        },
                    },
                },
            },
        },
        400: { description: 'Bad request - invalid parameters' },
        401: { description: 'Unauthorized' },
        500: { description: 'Internal server error' },
    },
};
exports.default = async (data) => {
    var _a, _b;
    const { body, user, ctx } = data;
    if (!(user === null || user === void 0 ? void 0 : user.id)) {
        throw (0, error_1.createError)({
            statusCode: 401,
            message: 'Authentication required',
        });
    }
    // Validate required fields
    if (!body.amount || !body.currency) {
        throw (0, error_1.createError)({
            statusCode: 400,
            message: 'Amount and currency are required',
        });
    }
    // Validate configuration
    (0, utils_1.validateMollieConfig)();
    // Validate currency support
    if (!(0, utils_1.isCurrencySupported)(body.currency)) {
        throw (0, error_1.createError)({
            statusCode: 400,
            message: `Currency ${body.currency} is not supported by Mollie`,
        });
    }
    // Validate amount
    if (body.amount <= 0) {
        throw (0, error_1.createError)({
            statusCode: 400,
            message: 'Amount must be greater than 0',
        });
    }
    const { amount, currency, method, locale = 'en' } = body;
    try {
        // Get gateway configuration
        ctx === null || ctx === void 0 ? void 0 : ctx.step("Fetching payment gateway configuration");
        const gateway = await db_1.models.depositGateway.findOne({
            where: { id: 'mollie' },
        });
        if (!gateway || !gateway.status) {
            throw (0, error_1.createError)({
                statusCode: 400,
                message: 'Mollie payment gateway is not available',
            });
        }
        // Check currency support in gateway
        const supportedCurrencies = JSON.parse(gateway.currencies || '[]');
        if (!supportedCurrencies.includes(currency.toUpperCase())) {
            throw (0, error_1.createError)({
                statusCode: 400,
                message: `Currency ${currency} is not supported`,
            });
        }
        // Validate amount limits
        const minAmount = gateway.getMinAmount(currency);
        const maxAmount = gateway.getMaxAmount(currency);
        if (amount < minAmount) {
            throw (0, error_1.createError)({
                statusCode: 400,
                message: `Minimum amount is ${minAmount} ${currency}`,
            });
        }
        if (maxAmount !== null && amount > maxAmount) {
            throw (0, error_1.createError)({
                statusCode: 400,
                message: `Maximum amount is ${maxAmount} ${currency}`,
            });
        }
        // Generate unique reference
        const reference = (0, utils_1.generateMollieReference)();
        // Create transaction record
        ctx === null || ctx === void 0 ? void 0 : ctx.step("Creating transaction record");
        const transaction = await db_1.models.transaction.create({
            uuid: reference,
            userId: user.id,
            type: 'DEPOSIT',
            status: 'PENDING',
            amount: amount,
            fee: 0, // Fee will be calculated by Mollie
            description: `Mollie deposit - ${amount} ${currency}`,
            metadata: JSON.stringify({
                gateway: 'mollie',
                currency: currency,
                method: method || 'auto',
                locale: locale,
            }),
        });
        // Get available payment methods for currency
        const availableMethods = (0, utils_1.getAvailablePaymentMethods)(currency);
        // Validate specific method if provided
        if (method && !availableMethods.includes(method)) {
            throw (0, error_1.createError)({
                statusCode: 400,
                message: `Payment method ${method} is not available for ${currency}`,
            });
        }
        // Prepare Mollie payment request
        const mollieAmount = (0, utils_1.formatMollieAmount)(amount * 100, currency); // Convert to minor units
        const mollieLocale = (0, utils_1.getMollieLocale)(locale);
        const paymentRequest = {
            amount: {
                currency: currency.toUpperCase(),
                value: mollieAmount,
            },
            description: `Deposit ${amount} ${currency.toUpperCase()}`,
            redirectUrl: `${(0, utils_1.buildReturnUrl)()}?transaction=${transaction.uuid}`,
            webhookUrl: (0, utils_1.buildWebhookUrl)(),
            metadata: {
                transactionId: transaction.uuid,
                userId: user.id,
                platform: 'v5',
                type: 'deposit',
            },
            locale: mollieLocale,
        };
        // Add specific payment method if requested
        if (method) {
            paymentRequest.method = method;
        }
        // Add consumer information if available
        if (user.firstName && user.lastName) {
            paymentRequest.consumerName = `${user.firstName} ${user.lastName}`;
        }
        // Create payment with Mollie
        const molliePayment = await (0, utils_1.makeApiRequest)('/payments', {
            method: 'POST',
            body: paymentRequest,
        });
        if (!molliePayment.id || !((_b = (_a = molliePayment._links) === null || _a === void 0 ? void 0 : _a.checkout) === null || _b === void 0 ? void 0 : _b.href)) {
            throw (0, error_1.createError)({
                statusCode: 500,
                message: 'Failed to create Mollie payment session',
            });
        }
        // Update transaction with Mollie payment ID
        await db_1.models.transaction.update({
            referenceId: molliePayment.id,
            metadata: JSON.stringify({
                ...transaction.metadata,
                molliePaymentId: molliePayment.id,
                mollieStatus: molliePayment.status,
                expiresAt: molliePayment.expiresAt,
                checkoutUrl: molliePayment._links.checkout.href,
            }),
        }, {
            where: { uuid: transaction.uuid },
        });
        return {
            success: true,
            data: {
                transactionId: transaction.uuid,
                paymentId: molliePayment.id,
                checkoutUrl: molliePayment._links.checkout.href,
                amount: amount,
                currency: currency.toUpperCase(),
                status: molliePayment.status,
                expiresAt: molliePayment.expiresAt,
                availableMethods: availableMethods,
            },
        };
    }
    catch (error) {
        console_1.logger.error("MOLLIE", "Payment creation error", error);
        if (error.statusCode) {
            throw error;
        }
        throw (0, error_1.createError)({
            statusCode: 500,
            message: error.message || 'Failed to create Mollie payment',
        });
    }
};
