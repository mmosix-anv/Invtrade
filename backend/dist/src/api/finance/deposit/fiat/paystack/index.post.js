"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.metadata = void 0;
const db_1 = require("@b/db");
const error_1 = require("@b/utils/error");
const utils_1 = require("./utils");
exports.metadata = {
    summary: 'Creates a Paystack payment session',
    description: 'Initializes a payment with Paystack and returns authorization URL for various payment methods across African markets',
    operationId: 'createPaystackPayment',
    tags: ['Finance', 'Deposit', 'Paystack'],
    requiresAuth: true,
    logModule: "PAYSTACK_DEPOSIT",
    logTitle: "Create Paystack payment session",
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
                            minimum: 1,
                        },
                        currency: {
                            type: 'string',
                            description: 'Payment currency code',
                            enum: ['NGN', 'GHS', 'ZAR', 'KES', 'XOF', 'EGP', 'USD'],
                            example: 'NGN',
                        },
                        channels: {
                            type: 'array',
                            items: { type: 'string' },
                            description: 'Preferred payment channels',
                            example: ['card', 'bank', 'ussd'],
                        },
                        metadata: {
                            type: 'object',
                            description: 'Additional metadata for the transaction',
                            additionalProperties: true,
                        },
                    },
                    required: ['amount', 'currency'],
                },
            },
        },
    },
    responses: {
        200: {
            description: 'Paystack payment session created successfully',
            content: {
                'application/json': {
                    schema: {
                        type: 'object',
                        properties: {
                            success: { type: 'boolean' },
                            data: {
                                type: 'object',
                                properties: {
                                    transaction_id: { type: 'string' },
                                    reference: { type: 'string' },
                                    authorization_url: { type: 'string' },
                                    access_code: { type: 'string' },
                                    status: { type: 'string' },
                                    gateway: { type: 'string' },
                                    amount: { type: 'number' },
                                    currency: { type: 'string' },
                                    region: { type: 'string' },
                                    available_methods: {
                                        type: 'object',
                                        additionalProperties: { type: 'string' }
                                    },
                                    supported_channels: {
                                        type: 'array',
                                        items: { type: 'string' }
                                    },
                                    fees_info: {
                                        type: 'object',
                                        properties: {
                                            fees: { type: 'number' },
                                            net_amount: { type: 'number' },
                                            gross_amount: { type: 'number' },
                                        },
                                    },
                                },
                            },
                        },
                    },
                },
            },
        },
        400: {
            description: 'Bad request - Invalid parameters',
            content: {
                'application/json': {
                    schema: {
                        type: 'object',
                        properties: {
                            error: { type: 'string' },
                            details: { type: 'object' },
                        },
                    },
                },
            },
        },
        401: {
            description: 'Unauthorized',
        },
        404: {
            description: 'Payment gateway not found',
        },
        500: {
            description: 'Internal server error',
        },
    },
};
exports.default = async (data) => {
    const { user, body } = data;
    const { amount, currency, channels, metadata = {} } = body;
    if (!(user === null || user === void 0 ? void 0 : user.id)) {
        throw (0, error_1.createError)({
            statusCode: 401,
            message: 'User not authenticated',
        });
    }
    if (!amount || amount <= 0) {
        throw (0, error_1.createError)({
            statusCode: 400,
            message: 'Invalid amount provided',
        });
    }
    if (!currency) {
        throw (0, error_1.createError)({
            statusCode: 400,
            message: 'Currency is required',
        });
    }
    const currencyCode = currency.toUpperCase();
    try {
        // Validate Paystack configuration
        (0, utils_1.validatePaystackConfig)();
        // Check if currency is supported
        if (!(0, utils_1.isCurrencySupported)(currencyCode)) {
            throw (0, error_1.createError)({
                statusCode: 400,
                message: `Currency ${currencyCode} is not supported by Paystack. Supported currencies: NGN, GHS, ZAR, KES, XOF, EGP, USD`,
            });
        }
        // Get gateway configuration
        const gateway = await db_1.models.depositGateway.findOne({
            where: { id: 'paystack' },
        });
        if (!gateway || !gateway.status) {
            throw (0, error_1.createError)({
                statusCode: 400,
                message: 'Paystack payment gateway is not available',
            });
        }
        // Check currency support in gateway
        const supportedCurrencies = JSON.parse(gateway.currencies || '[]');
        if (!supportedCurrencies.includes(currencyCode)) {
            throw (0, error_1.createError)({
                statusCode: 400,
                message: `Currency ${currencyCode} is not supported by this gateway`,
            });
        }
        // Validate amount limits using gateway helper methods
        const minAmount = gateway.getMinAmount(currencyCode);
        const maxAmount = gateway.getMaxAmount(currencyCode);
        if (amount < minAmount) {
            throw (0, error_1.createError)({
                statusCode: 400,
                message: `Minimum amount is ${minAmount} ${currencyCode}`,
            });
        }
        if (maxAmount !== null && amount > maxAmount) {
            throw (0, error_1.createError)({
                statusCode: 400,
                message: `Maximum amount is ${maxAmount} ${currencyCode}`,
            });
        }
        // Generate unique reference
        const reference = (0, utils_1.generatePaystackReference)();
        // Get currency information and available methods
        const currencyInfo = (0, utils_1.getCurrencyInfo)(currencyCode);
        const availableMethods = (0, utils_1.getAvailablePaymentMethods)(currencyCode);
        const supportedChannels = (0, utils_1.getSupportedChannels)(currencyCode);
        const feesInfo = (0, utils_1.calculatePaystackFees)(amount, currencyCode);
        // Prepare transaction data for database
        const transactionData = {
            id: reference,
            userId: user.id,
            type: 'DEPOSIT',
            status: 'PENDING',
            amount: amount,
            currency: currencyCode,
            description: `Paystack deposit - ${amount} ${currencyCode}`,
            fee: feesInfo.fees,
            metadata: JSON.stringify({
                gateway: 'paystack',
                region: currencyInfo === null || currencyInfo === void 0 ? void 0 : currencyInfo.region,
                available_methods: availableMethods,
                supported_channels: supportedChannels,
                user_metadata: metadata,
                ip_address: data.remoteAddress,
            }),
        };
        // Create transaction record
        const transaction = await db_1.models.transaction.create(transactionData);
        // Prepare Paystack transaction request
        const paystackAmount = (0, utils_1.formatPaystackAmount)(amount, currencyCode);
        const transactionRequest = {
            reference: reference,
            amount: paystackAmount,
            email: user.email || '',
            currency: currencyCode,
            callback_url: (0, utils_1.buildReturnUrl)(),
            metadata: {
                user_id: user.id,
                transaction_id: transaction.id,
                gateway: 'paystack',
                region: currencyInfo === null || currencyInfo === void 0 ? void 0 : currencyInfo.region,
                original_amount: amount,
                fees: feesInfo.fees,
                net_amount: feesInfo.netAmount,
                ...metadata,
            },
        };
        // Add channels if specified
        if (channels && Array.isArray(channels) && channels.length > 0) {
            const validChannels = channels.filter(channel => supportedChannels.includes(channel));
            if (validChannels.length > 0) {
                transactionRequest.channels = validChannels;
            }
        }
        else {
            // Use all supported channels for the currency
            transactionRequest.channels = supportedChannels;
        }
        // Add customer information if available
        if (user.firstName || user.lastName) {
            transactionRequest.customer = {
                email: user.email || '',
                first_name: user.firstName || '',
                last_name: user.lastName || '',
                phone: user.phone || '',
                metadata: {
                    user_id: user.id,
                },
            };
        }
        // Initialize transaction with Paystack
        const paystackResponse = await (0, utils_1.makePaystackRequest)('/transaction/initialize', {
            method: 'POST',
            body: transactionRequest,
        });
        if (!paystackResponse.status || !paystackResponse.data) {
            throw (0, error_1.createError)({
                statusCode: 400,
                message: paystackResponse.message || 'Failed to initialize Paystack transaction',
            });
        }
        // Update transaction with Paystack response
        await transaction.update({
            referenceId: paystackResponse.data.reference,
            metadata: JSON.stringify({
                ...JSON.parse(transaction.metadata || '{}'),
                paystack_access_code: paystackResponse.data.access_code,
                paystack_reference: paystackResponse.data.reference,
                authorization_url: paystackResponse.data.authorization_url,
            }),
        });
        // Prepare available methods display
        const availableMethodsDisplay = availableMethods.reduce((acc, method) => {
            acc[method] = (0, utils_1.getPaymentMethodDisplayName)(method);
            return acc;
        }, {});
        return {
            success: true,
            data: {
                transaction_id: transaction.id,
                reference: reference,
                authorization_url: paystackResponse.data.authorization_url,
                access_code: paystackResponse.data.access_code,
                status: 'PENDING',
                gateway: 'paystack',
                amount: amount,
                currency: currencyCode,
                region: (currencyInfo === null || currencyInfo === void 0 ? void 0 : currencyInfo.region) || 'Africa',
                available_methods: availableMethodsDisplay,
                supported_channels: supportedChannels,
                fees_info: {
                    fees: feesInfo.fees,
                    net_amount: feesInfo.netAmount,
                    gross_amount: feesInfo.grossAmount,
                },
            },
        };
    }
    catch (error) {
        if (error instanceof utils_1.PaystackError) {
            throw (0, error_1.createError)({
                statusCode: error.status,
                message: error.message,
            });
        }
        if (error.statusCode) {
            throw error;
        }
        throw (0, error_1.createError)({
            statusCode: 500,
            message: 'Failed to create Paystack payment session',
        });
    }
};
