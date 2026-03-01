"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.metadata = void 0;
const db_1 = require("@b/db");
const error_1 = require("@b/utils/error");
const console_1 = require("@b/utils/console");
const utils_1 = require("./utils");
exports.metadata = {
    summary: 'Creates a PayFast payment session',
    description: 'Initiates a payment with PayFast and returns payment form',
    operationId: 'createPayFastPayment',
    tags: ['Finance', 'Deposit', 'PayFast'],
    requiresAuth: true,
    logModule: "PAYFAST_DEPOSIT",
    logTitle: "Create PayFast payment session",
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
                            example: 'ZAR',
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
                                    reference: { type: 'string' },
                                    amount: { type: 'number' },
                                    currency: { type: 'string' },
                                    paymentUrl: { type: 'string' },
                                    paymentForm: { type: 'string' },
                                    redirectUrl: { type: 'string' },
                                    instructions: { type: 'string' },
                                    expiresAt: { type: 'string' },
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
    const { body, user } = data;
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
    (0, utils_1.validatePayFastConfig)();
    // Validate currency support
    if (!(0, utils_1.isCurrencySupported)(body.currency)) {
        throw (0, error_1.createError)({
            statusCode: 400,
            message: `Currency ${body.currency} is not supported by PayFast`,
        });
    }
    // Validate amount
    if (body.amount <= 0) {
        throw (0, error_1.createError)({
            statusCode: 400,
            message: 'Amount must be greater than 0',
        });
    }
    const { amount, currency: currencyCode } = body;
    try {
        // Get gateway configuration
        const gateway = await db_1.models.depositGateway.findOne({
            where: { id: 'payfast' },
        });
        if (!gateway || !gateway.status) {
            throw (0, error_1.createError)({
                statusCode: 400,
                message: 'PayFast payment gateway is not available',
            });
        }
        // Check currency support in gateway
        const supportedCurrencies = JSON.parse(gateway.currencies || '[]');
        if (!supportedCurrencies.includes(currencyCode.toUpperCase())) {
            throw (0, error_1.createError)({
                statusCode: 400,
                message: `Currency ${currencyCode} is not supported`,
            });
        }
        // Validate amount limits
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
        const reference = (0, utils_1.generatePayFastReference)();
        // Create pending transaction
        const transaction = await db_1.models.transaction.create({
            uuid: reference,
            userId: user.id,
            type: 'DEPOSIT',
            status: 'PENDING',
            amount: amount,
            fee: 0, // PayFast fees are deducted from the amount
            description: `PayFast deposit - ${amount} ${currencyCode}`,
            metadata: JSON.stringify({
                gateway: 'payfast',
                currency: currencyCode,
                originalAmount: amount,
                paymentMethod: 'payfast'
            })
        });
        // Prepare PayFast payment data
        const paymentData = {
            merchant_id: utils_1.PAYFAST_CONFIG.MERCHANT_ID,
            merchant_key: utils_1.PAYFAST_CONFIG.MERCHANT_KEY,
            return_url: (0, utils_1.buildReturnUrl)(),
            cancel_url: (0, utils_1.buildCancelUrl)(),
            notify_url: (0, utils_1.buildNotifyUrl)(),
            name_first: user.firstName || 'Customer',
            name_last: user.lastName || '',
            email_address: user.email,
            m_payment_id: reference,
            amount: (0, utils_1.formatPayFastAmount)(amount),
            item_name: `Wallet Deposit - ${amount} ${currencyCode}`,
            item_description: `Deposit to wallet for ${user.email}`,
            custom_str1: transaction.id.toString(),
            custom_str2: user.id.toString(),
            custom_str3: currencyCode,
            custom_str4: 'deposit',
            custom_str5: 'wallet'
        };
        // Add passphrase if configured
        if (utils_1.PAYFAST_CONFIG.PASSPHRASE) {
            paymentData.passphrase = utils_1.PAYFAST_CONFIG.PASSPHRASE;
        }
        // Generate signature
        paymentData.signature = (0, utils_1.generateSignature)(paymentData, utils_1.PAYFAST_CONFIG.PASSPHRASE);
        // Update transaction with PayFast data
        await transaction.update({
            metadata: {
                ...transaction.metadata,
                payfast: {
                    merchant_id: paymentData.merchant_id,
                    m_payment_id: paymentData.m_payment_id,
                    amount: paymentData.amount,
                    item_name: paymentData.item_name,
                    signature: paymentData.signature,
                    created_at: new Date().toISOString()
                }
            }
        });
        // Return payment form and details
        return {
            success: true,
            data: {
                transactionId: transaction.id,
                reference: reference,
                amount: amount,
                currency: currencyCode,
                paymentUrl: (0, utils_1.buildPaymentUrl)(),
                paymentForm: (0, utils_1.generatePaymentForm)(paymentData),
                paymentData: {
                    ...paymentData,
                    // Don't expose sensitive data in response
                    merchant_key: undefined,
                    passphrase: undefined
                },
                redirectUrl: (0, utils_1.buildPaymentUrl)(),
                instructions: 'You will be redirected to PayFast to complete your payment',
                expiresAt: new Date(Date.now() + 30 * 60 * 1000).toISOString() // 30 minutes
            }
        };
    }
    catch (error) {
        console_1.logger.error('PAYFAST', 'Payment creation error', error);
        throw (0, error_1.createError)({
            statusCode: error.statusCode || 500,
            message: error.message || 'Failed to create PayFast payment',
        });
    }
};
