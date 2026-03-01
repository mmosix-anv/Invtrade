"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.metadata = void 0;
const db_1 = require("@b/db");
const error_1 = require("@b/utils/error");
const console_1 = require("@b/utils/console");
const utils_1 = require("./utils");
exports.metadata = {
    summary: 'Creates a Paysafe payment session',
    description: 'Initiates a payment with Paysafe using Payment Handles API and returns checkout URL for various payment methods',
    operationId: 'createPaysafePayment',
    tags: ['Finance', 'Deposit', 'Paysafe'],
    requiresAuth: true,
    logModule: "PAYSAFE_DEPOSIT",
    logTitle: "Create Paysafe payment session",
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
                            example: 'USD',
                        },
                        paymentType: {
                            type: 'string',
                            description: 'Preferred payment method type',
                            enum: ['CARD', 'PAYPAL', 'VENMO', 'SKRILL', 'NETELLER', 'APPLEPAY', 'GOOGLEPAY', 'ACH', 'EFT', 'PAYSAFECARD', 'PAYSAFECASH'],
                            default: 'CARD',
                        },
                        locale: {
                            type: 'string',
                            description: 'User locale for payment page',
                            example: 'en_US',
                        },
                    },
                    required: ['amount', 'currency'],
                },
            },
        },
    },
    responses: {
        200: {
            description: 'Paysafe payment session created successfully',
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
                                    payment_handle_id: { type: 'string' },
                                    payment_handle_token: { type: 'string' },
                                    checkout_url: { type: 'string' },
                                    reference: { type: 'string' },
                                    status: { type: 'string' },
                                    gateway: { type: 'string' },
                                    amount: { type: 'number' },
                                    currency: { type: 'string' },
                                    payment_type: { type: 'string' },
                                    expires_at: { type: 'string' },
                                    available_methods: {
                                        type: 'object',
                                        additionalProperties: { type: 'string' }
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
    var _a, _b, _c, _d, _e, _f;
    const { user, body } = data;
    const { amount, currency, paymentType = 'CARD', locale = 'en_US' } = body;
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
        // Validate Paysafe configuration
        (0, utils_1.validatePaysafeConfig)();
        // Check if currency is supported
        if (!(0, utils_1.isCurrencySupported)(currencyCode)) {
            throw (0, error_1.createError)({
                statusCode: 400,
                message: `Currency ${currencyCode} is not supported by Paysafe`,
            });
        }
        // Get gateway configuration
        const gateway = await db_1.models.depositGateway.findOne({
            where: { id: 'paysafe' },
        });
        if (!gateway || !gateway.status) {
            throw (0, error_1.createError)({
                statusCode: 400,
                message: 'Paysafe payment gateway is not available',
            });
        }
        // Check currency support in gateway
        const supportedCurrencies = JSON.parse(gateway.currencies || '[]');
        if (!supportedCurrencies.includes(currencyCode)) {
            throw (0, error_1.createError)({
                statusCode: 400,
                message: `Currency ${currencyCode} is not supported`,
            });
        }
        // Validate amount limits
        const minAmount = gateway.getMinAmount(currency);
        const maxAmount = gateway.getMaxAmount(currency);
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
        const reference = (0, utils_1.generatePaysafeReference)();
        // Create pending transaction
        const transaction = await db_1.models.transaction.create({
            uuid: reference,
            userId: user.id,
            type: 'DEPOSIT',
            status: 'PENDING',
            amount: amount,
            fee: 0, // Paysafe fees are typically deducted from merchant account
            description: `Paysafe deposit - ${amount} ${currencyCode}`,
            metadata: JSON.stringify({
                gateway: 'paysafe',
                currency: currencyCode,
                originalAmount: amount,
                paymentType: paymentType,
                locale: locale,
            })
        });
        // Get user profile data
        const profile = await db_1.models.user.findByPk(user.id, {
            attributes: ['firstName', 'lastName', 'email', 'phone']
        });
        // Prepare payment handle request
        const paymentHandleRequest = {
            merchantRefNum: reference,
            transactionType: 'PAYMENT',
            amount: (0, utils_1.formatPaysafeAmount)(amount, currencyCode),
            currencyCode: currencyCode,
            paymentType: paymentType,
            customerIp: data.remoteAddress || '127.0.0.1',
            billingDetails: {
                street: (profile === null || profile === void 0 ? void 0 : profile.firstName) || 'N/A',
                city: 'N/A',
                zip: '00000',
                country: (0, utils_1.getRegionFromCurrency)(currencyCode),
            },
            customer: {
                merchantCustomerId: user.id,
                firstName: (profile === null || profile === void 0 ? void 0 : profile.firstName) || 'Customer',
                lastName: (profile === null || profile === void 0 ? void 0 : profile.lastName) || 'User',
                email: (profile === null || profile === void 0 ? void 0 : profile.email) || `user${user.id}@example.com`,
                phone: (profile === null || profile === void 0 ? void 0 : profile.phone) || '+1234567890',
                ip: data.remoteAddress || '127.0.0.1',
            },
            merchantDescriptor: {
                dynamicDescriptor: 'Paysafe Payment',
                phone: '+1234567890',
            },
            returnLinks: [
                {
                    rel: 'on_completed',
                    href: (0, utils_1.buildReturnUrl)(),
                    method: 'GET',
                },
                {
                    rel: 'on_failed',
                    href: (0, utils_1.buildCancelUrl)(),
                    method: 'GET',
                },
                {
                    rel: 'default',
                    href: (0, utils_1.buildReturnUrl)(),
                    method: 'GET',
                },
            ],
            webhookUrl: (0, utils_1.buildWebhookUrl)(),
        };
        // Create payment handle
        const paymentHandle = await (0, utils_1.makeApiRequest)('paymenthandles', {
            method: 'POST',
            body: paymentHandleRequest,
        });
        // Update transaction with payment handle details
        await transaction.update({
            metadata: {
                ...transaction.metadata,
                paymentHandleId: paymentHandle.id,
                paymentHandleToken: paymentHandle.paymentHandleToken,
                gatewayId: (_a = paymentHandle.gatewayResponse) === null || _a === void 0 ? void 0 : _a.id,
                processorId: (_b = paymentHandle.gatewayResponse) === null || _b === void 0 ? void 0 : _b.processor,
            }
        });
        // Get checkout URL from payment handle
        const checkoutLink = (_c = paymentHandle.links) === null || _c === void 0 ? void 0 : _c.find(link => link.rel === 'redirect_payment' || link.rel === 'checkout');
        if (!checkoutLink) {
            throw (0, error_1.createError)({
                statusCode: 500,
                message: 'No checkout URL received from Paysafe',
            });
        }
        // Get available payment methods for this currency
        const availableMethods = (0, utils_1.getAvailablePaymentMethods)(currencyCode);
        const methodsDisplay = availableMethods.reduce((acc, method) => {
            acc[method] = (0, utils_1.getPaymentMethodDisplayName)(method);
            return acc;
        }, {});
        // Calculate expiration time
        const expiresAt = new Date(Date.now() + (paymentHandle.timeToLiveSeconds * 1000)).toISOString();
        return {
            success: true,
            data: {
                transaction_id: transaction.id,
                payment_handle_id: paymentHandle.id,
                payment_handle_token: paymentHandle.paymentHandleToken,
                checkout_url: checkoutLink.href,
                reference: reference,
                status: 'PENDING',
                gateway: 'paysafe',
                amount: amount,
                currency: currencyCode,
                payment_type: paymentType,
                expires_at: expiresAt,
                available_methods: methodsDisplay,
                processor: ((_d = paymentHandle.gatewayResponse) === null || _d === void 0 ? void 0 : _d.processor) || 'PAYSAFE',
                gateway_response: {
                    id: (_e = paymentHandle.gatewayResponse) === null || _e === void 0 ? void 0 : _e.id,
                    processor: (_f = paymentHandle.gatewayResponse) === null || _f === void 0 ? void 0 : _f.processor,
                    action: paymentHandle.action,
                    execution_mode: paymentHandle.executionMode,
                    usage: paymentHandle.usage,
                },
            },
        };
    }
    catch (error) {
        console_1.logger.error('PAYSAFE', 'Payment creation error', error);
        if (error instanceof utils_1.PaysafeError) {
            throw (0, error_1.createError)({
                statusCode: error.status,
                message: `Paysafe Error: ${error.message}`,
            });
        }
        throw (0, error_1.createError)({
            statusCode: 500,
            message: error.message || 'Failed to create Paysafe payment',
        });
    }
};
