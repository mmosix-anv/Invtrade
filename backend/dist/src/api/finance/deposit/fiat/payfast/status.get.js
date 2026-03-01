"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.metadata = void 0;
const db_1 = require("@b/db");
const error_1 = require("@b/utils/error");
const console_1 = require("@b/utils/console");
const utils_1 = require("./utils");
exports.metadata = {
    summary: 'Check PayFast payment status',
    description: 'Queries current payment status from PayFast and updates local records',
    operationId: 'checkPayFastStatus',
    tags: ['Finance', 'Deposit', 'PayFast'],
    requiresAuth: true,
    parameters: [
        {
            name: 'transactionId',
            in: 'query',
            required: true,
            schema: {
                type: 'string',
                description: 'Transaction ID to check',
            },
        },
    ],
    responses: {
        200: {
            description: 'Payment status retrieved successfully',
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
                                    status: { type: 'string' },
                                    amount: { type: 'number' },
                                    currency: { type: 'string' },
                                    paymentId: { type: 'string' },
                                    reference: { type: 'string' },
                                    updated: { type: 'boolean' },
                                    paymentUrl: { type: 'string' },
                                },
                            },
                        },
                    },
                },
            },
        },
        400: { description: 'Bad request - invalid parameters' },
        401: { description: 'Unauthorized' },
        404: { description: 'Transaction not found' },
        500: { description: 'Internal server error' },
    },
};
exports.default = async (data) => {
    var _a, _b, _c;
    const { query, user } = data;
    if (!(user === null || user === void 0 ? void 0 : user.id)) {
        throw (0, error_1.createError)({
            statusCode: 401,
            message: 'Authentication required',
        });
    }
    // Validate required fields
    if (!query.transactionId) {
        throw (0, error_1.createError)({
            statusCode: 400,
            message: 'Transaction ID is required',
        });
    }
    // Validate configuration
    (0, utils_1.validatePayFastConfig)();
    try {
        // Find the transaction
        const transaction = await db_1.models.transaction.findOne({
            where: {
                id: query.transactionId,
                userId: user.id
            }
        });
        if (!transaction) {
            throw (0, error_1.createError)({
                statusCode: 404,
                message: 'Transaction not found',
            });
        }
        // Get PayFast payment data from transaction metadata
        const payfastData = (_a = transaction.metadata) === null || _a === void 0 ? void 0 : _a.payfast;
        if (!payfastData || !payfastData.pf_payment_id) {
            // If no PayFast payment ID, return current status
            return {
                success: true,
                data: {
                    transactionId: transaction.id,
                    status: transaction.status,
                    amount: transaction.amount,
                    currency: ((_b = transaction.metadata) === null || _b === void 0 ? void 0 : _b.currency) || 'ZAR',
                    paymentId: (payfastData === null || payfastData === void 0 ? void 0 : payfastData.m_payment_id) || transaction.uuid,
                    reference: transaction.uuid,
                    updated: false,
                    paymentUrl: null
                }
            };
        }
        let statusUpdated = false;
        let currentStatus = transaction.status;
        let paymentUrl = null;
        const createdAt = new Date(transaction.createdAt);
        try {
            // Query PayFast for payment status
            // Note: PayFast doesn't have a direct status API, so we rely on ITN notifications
            // This endpoint mainly serves to return current status and provide payment URLs
            // For active payments, we can construct the payment URL
            if (currentStatus === 'PENDING') {
                paymentUrl = `https://${(0, utils_1.getPayFastHost)()}/eng/process`;
            }
            // Check if payment has expired (PayFast payments typically expire after 1 hour)
            const now = new Date();
            const hoursDiff = (now.getTime() - createdAt.getTime()) / (1000 * 60 * 60);
            if (currentStatus === 'PENDING' && hoursDiff > 1) {
                // Mark as expired if it's been more than 1 hour
                await transaction.update({
                    status: 'EXPIRED',
                    metadata: {
                        ...transaction.metadata,
                        payfast: {
                            ...payfastData,
                            expired_at: new Date().toISOString(),
                            expiry_reason: 'Payment session timeout'
                        }
                    }
                });
                currentStatus = 'EXPIRED';
                statusUpdated = true;
                paymentUrl = null;
            }
        }
        catch (apiError) {
            console_1.logger.error('PAYFAST', 'Status check error', apiError);
            // Continue with local status if API fails
        }
        return {
            success: true,
            data: {
                transactionId: transaction.id,
                status: currentStatus,
                amount: transaction.amount,
                currency: ((_c = transaction.metadata) === null || _c === void 0 ? void 0 : _c.currency) || 'ZAR',
                paymentId: payfastData.pf_payment_id || payfastData.m_payment_id,
                reference: transaction.uuid,
                updated: statusUpdated,
                paymentUrl: paymentUrl,
                metadata: {
                    gateway: 'payfast',
                    createdAt: transaction.createdAt,
                    lastUpdated: transaction.updatedAt,
                    merchantId: payfastData.merchant_id,
                    paymentForm: payfastData.payment_form,
                    expiresAt: new Date(createdAt.getTime() + 60 * 60 * 1000).toISOString() // 1 hour from creation
                }
            }
        };
    }
    catch (error) {
        console_1.logger.error('PAYFAST', 'Status check error', error);
        throw (0, error_1.createError)({
            statusCode: error.statusCode || 500,
            message: error.message || 'Failed to check PayFast payment status',
        });
    }
};
