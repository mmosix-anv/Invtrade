"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.metadata = void 0;
const db_1 = require("@b/db");
const error_1 = require("@b/utils/error");
const console_1 = require("@b/utils/console");
const utils_1 = require("./utils");
exports.metadata = {
    summary: 'Checks Paysafe payment status',
    description: 'Queries current payment status from Paysafe and updates local transaction record',
    operationId: 'checkPaysafePaymentStatus',
    tags: ['Finance', 'Deposit', 'Paysafe'],
    requiresAuth: true,
    parameters: [
        {
            name: 'reference',
            in: 'query',
            required: true,
            schema: {
                type: 'string',
                description: 'Transaction reference number',
            },
        },
        {
            name: 'payment_id',
            in: 'query',
            required: false,
            schema: {
                type: 'string',
                description: 'Paysafe payment ID (optional)',
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
                                    transaction_id: { type: 'string' },
                                    reference: { type: 'string' },
                                    status: { type: 'string' },
                                    gateway_status: { type: 'string' },
                                    amount: { type: 'number' },
                                    currency: { type: 'string' },
                                    payment_id: { type: 'string' },
                                    gateway_transaction_id: { type: 'string' },
                                    created_at: { type: 'string' },
                                    updated_at: { type: 'string' },
                                    expires_at: { type: 'string' },
                                    is_expired: { type: 'boolean' },
                                    checkout_url: { type: 'string' },
                                    return_url: { type: 'string' },
                                    processor: { type: 'string' },
                                },
                            },
                        },
                    },
                },
            },
        },
        400: {
            description: 'Bad request - Invalid parameters',
        },
        401: {
            description: 'Unauthorized',
        },
        404: {
            description: 'Transaction not found',
        },
        500: {
            description: 'Internal server error',
        },
    },
};
exports.default = async (data) => {
    var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m, _o, _p, _q, _r, _s;
    const { user, query } = data;
    const { reference, payment_id } = query;
    if (!(user === null || user === void 0 ? void 0 : user.id)) {
        throw (0, error_1.createError)({
            statusCode: 401,
            message: 'User not authenticated',
        });
    }
    if (!reference) {
        throw (0, error_1.createError)({
            statusCode: 400,
            message: 'Transaction reference is required',
        });
    }
    try {
        // Validate Paysafe configuration
        (0, utils_1.validatePaysafeConfig)();
        // Find the transaction
        const transaction = await db_1.models.transaction.findOne({
            where: {
                uuid: reference,
                userId: user.id,
            },
        });
        if (!transaction) {
            throw (0, error_1.createError)({
                statusCode: 404,
                message: 'Transaction not found',
            });
        }
        // Check if transaction has expired (1 hour timeout)
        const createdAt = new Date(transaction.createdAt);
        const expiresAt = new Date(createdAt.getTime() + (60 * 60 * 1000)); // 1 hour
        const isExpired = new Date() > expiresAt;
        // If expired and still pending, mark as expired
        if (isExpired && transaction.status === 'PENDING') {
            await transaction.update({
                status: 'EXPIRED',
                metadata: {
                    ...transaction.metadata,
                    expiredAt: new Date().toISOString(),
                },
            });
        }
        let paymentDetails = null;
        let gatewayStatus = ((_a = transaction.metadata) === null || _a === void 0 ? void 0 : _a.gatewayStatus) || 'UNKNOWN';
        let gatewayTransactionId = ((_b = transaction.metadata) === null || _b === void 0 ? void 0 : _b.gatewayTransactionId) || null;
        let processor = ((_c = transaction.metadata) === null || _c === void 0 ? void 0 : _c.processorId) || 'PAYSAFE';
        // Try to get latest status from Paysafe if not expired
        if (!isExpired && transaction.status === 'PENDING') {
            try {
                if (payment_id) {
                    // Get payment by ID
                    paymentDetails = await (0, utils_1.makeApiRequest)(`payments/${payment_id}`, { method: 'GET' });
                }
                else {
                    // Get payment by merchant reference
                    const paymentsResponse = await (0, utils_1.makeApiRequest)(`payments?merchantRefNum=${reference}`, { method: 'GET' });
                    if (Array.isArray(paymentsResponse) && paymentsResponse.length > 0) {
                        paymentDetails = paymentsResponse[0];
                    }
                }
                if (paymentDetails) {
                    const mappedStatus = (0, utils_1.mapPaysafeStatus)(paymentDetails.status);
                    gatewayStatus = paymentDetails.status;
                    gatewayTransactionId = paymentDetails.gatewayReconciliationId || paymentDetails.id;
                    processor = ((_d = paymentDetails.gatewayResponse) === null || _d === void 0 ? void 0 : _d.processor) || 'PAYSAFE';
                    // Update transaction if status changed
                    if (transaction.status !== mappedStatus) {
                        await transaction.update({
                            status: mappedStatus,
                            metadata: {
                                ...transaction.metadata,
                                paymentId: paymentDetails.id,
                                gatewayTransactionId: gatewayTransactionId,
                                gatewayStatus: gatewayStatus,
                                processorId: processor,
                                lastStatusCheck: new Date().toISOString(),
                                gatewayResponse: paymentDetails.gatewayResponse,
                            },
                        });
                        // Update local transaction object for response
                        transaction.status = mappedStatus;
                    }
                }
            }
            catch (apiError) {
                console_1.logger.error('PAYSAFE', 'Failed to get payment status from Paysafe', apiError);
                // Don't fail the request if API call fails, just use local data
            }
        }
        // Build response URLs
        const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000';
        const checkoutUrl = ((_e = transaction.metadata) === null || _e === void 0 ? void 0 : _e.checkoutUrl) || `${baseUrl}/user/wallet/deposit`;
        const returnUrl = `${baseUrl}/user/wallet/deposit/paysafe/verify`;
        return {
            success: true,
            data: {
                transaction_id: transaction.id,
                reference: transaction.uuid,
                status: transaction.status,
                gateway_status: gatewayStatus,
                amount: transaction.amount,
                currency: ((_f = transaction.metadata) === null || _f === void 0 ? void 0 : _f.currency) || 'USD',
                payment_id: ((_g = transaction.metadata) === null || _g === void 0 ? void 0 : _g.paymentId) || payment_id || null,
                gateway_transaction_id: gatewayTransactionId,
                created_at: (_h = transaction.createdAt) === null || _h === void 0 ? void 0 : _h.toISOString(),
                updated_at: (_j = transaction.updatedAt) === null || _j === void 0 ? void 0 : _j.toISOString(),
                expires_at: expiresAt.toISOString(),
                is_expired: isExpired,
                checkout_url: checkoutUrl,
                return_url: returnUrl,
                processor: processor,
                payment_handle_id: ((_k = transaction.metadata) === null || _k === void 0 ? void 0 : _k.paymentHandleId) || null,
                payment_handle_token: ((_l = transaction.metadata) === null || _l === void 0 ? void 0 : _l.paymentHandleToken) || null,
                gateway_response: ((_m = transaction.metadata) === null || _m === void 0 ? void 0 : _m.gatewayResponse) || null,
                last_status_check: ((_o = transaction.metadata) === null || _o === void 0 ? void 0 : _o.lastStatusCheck) || null,
                webhook_events: {
                    last_event_id: ((_p = transaction.metadata) === null || _p === void 0 ? void 0 : _p.webhookEventId) || null,
                    last_event_type: ((_q = transaction.metadata) === null || _q === void 0 ? void 0 : _q.webhookEventType) || null,
                    last_event_time: ((_r = transaction.metadata) === null || _r === void 0 ? void 0 : _r.webhookEventTime) || null,
                    last_webhook_update: ((_s = transaction.metadata) === null || _s === void 0 ? void 0 : _s.lastWebhookUpdate) || null,
                },
            },
        };
    }
    catch (error) {
        console_1.logger.error('PAYSAFE', 'Status check error', error);
        if (error instanceof utils_1.PaysafeError) {
            throw (0, error_1.createError)({
                statusCode: error.status,
                message: `Paysafe Error: ${error.message}`,
            });
        }
        throw (0, error_1.createError)({
            statusCode: 500,
            message: error.message || 'Failed to check Paysafe payment status',
        });
    }
};
