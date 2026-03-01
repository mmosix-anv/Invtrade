"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.metadata = void 0;
const db_1 = require("@b/db");
const error_1 = require("@b/utils/error");
const emails_1 = require("@b/utils/emails");
const console_1 = require("@b/utils/console");
const wallet_1 = require("@b/services/wallet");
const utils_1 = require("./utils");
exports.metadata = {
    summary: 'Verifies a Paytm payment',
    description: 'Handles return URL verification after payment completion and updates transaction status',
    operationId: 'verifyPaytmPayment',
    tags: ['Finance', 'Deposit', 'Paytm'],
    requiresAuth: true,
    logModule: "PAYTM_DEPOSIT",
    logTitle: "Verify Paytm payment",
    requestBody: {
        required: true,
        content: {
            'application/json': {
                schema: {
                    type: 'object',
                    properties: {
                        orderId: {
                            type: 'string',
                            description: 'Paytm order ID',
                        },
                        txnId: {
                            type: 'string',
                            description: 'Paytm transaction ID',
                        },
                        checksumHash: {
                            type: 'string',
                            description: 'Checksum hash for verification',
                        },
                        status: {
                            type: 'string',
                            description: 'Transaction status from Paytm',
                        },
                    },
                    required: ['orderId'],
                },
            },
        },
    },
    responses: {
        200: {
            description: 'Payment verification completed',
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
                                    order_id: { type: 'string' },
                                    txn_id: { type: 'string' },
                                    status: { type: 'string' },
                                    amount: { type: 'number' },
                                    currency: { type: 'string' },
                                    gateway: { type: 'string' },
                                    payment_mode: { type: 'string' },
                                    bank_name: { type: 'string' },
                                    verified_at: { type: 'string' },
                                },
                            },
                        },
                    },
                },
            },
        },
        400: {
            description: 'Bad request - Invalid parameters or verification failed',
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
    const { user, body } = data;
    const { orderId, txnId, checksumHash, status } = body;
    if (!(user === null || user === void 0 ? void 0 : user.id)) {
        throw (0, error_1.createError)({
            statusCode: 401,
            message: 'User not authenticated',
        });
    }
    if (!orderId) {
        throw (0, error_1.createError)({
            statusCode: 400,
            message: 'Order ID is required',
        });
    }
    try {
        // Validate Paytm configuration
        (0, utils_1.validatePaytmConfig)();
        // Find the transaction
        const transaction = await db_1.models.transaction.findOne({
            where: {
                uuid: orderId,
                userId: user.id,
                type: 'DEPOSIT',
            },
        });
        if (!transaction) {
            throw (0, error_1.createError)({
                statusCode: 404,
                message: 'Transaction not found',
            });
        }
        // Parse transaction metadata
        const metadata = JSON.parse(transaction.metadata || '{}');
        if (metadata.gateway !== 'paytm') {
            throw (0, error_1.createError)({
                statusCode: 400,
                message: 'Invalid gateway for this transaction',
            });
        }
        // Skip verification if already completed
        if (transaction.status === 'COMPLETED') {
            return {
                success: true,
                data: {
                    transaction_id: transaction.uuid,
                    order_id: orderId,
                    txn_id: metadata.txnId || '',
                    status: 'COMPLETED',
                    amount: transaction.amount,
                    currency: metadata.currency || 'INR',
                    gateway: 'paytm',
                    payment_mode: metadata.paymentMode || '',
                    bank_name: metadata.bankName || '',
                    verified_at: transaction.updatedAt,
                },
            };
        }
        // Verify checksum if provided
        if (checksumHash) {
            const { checksumHash: hash, ...paramsWithoutChecksum } = body;
            const isValidChecksum = (0, utils_1.verifyChecksumHash)(paramsWithoutChecksum, checksumHash, utils_1.PAYTM_CONFIG.MERCHANT_KEY);
            if (!isValidChecksum) {
                throw (0, error_1.createError)({
                    statusCode: 400,
                    message: 'Invalid checksum verification',
                });
            }
        }
        // Verify payment status with Paytm API
        const verifyRequest = {
            body: {
                mid: utils_1.PAYTM_CONFIG.MID,
                orderId: orderId,
            }
        };
        // Generate checksum for verification request
        const verifyChecksum = (0, utils_1.verifyChecksumHash)(verifyRequest.body, '', utils_1.PAYTM_CONFIG.MERCHANT_KEY);
        verifyRequest.body['checksumHash'] = verifyChecksum;
        const verifyResponse = await (0, utils_1.makePaytmRequest)('/merchant-status/api/v1/getPaymentStatus', {
            method: 'POST',
            body: verifyRequest,
            headers: {
                'Content-Type': 'application/json',
            },
        });
        const paytmStatus = verifyResponse.body.resultInfo.resultStatus;
        const mappedStatus = (0, utils_1.mapPaytmStatus)(paytmStatus);
        const txnAmount = (0, utils_1.parsePaytmAmount)(verifyResponse.body.txnAmount || '0', metadata.currency || 'INR');
        // Update transaction status
        await transaction.update({
            status: mappedStatus,
            referenceId: verifyResponse.body.txnId || transaction.referenceId,
            metadata: JSON.stringify({
                ...metadata,
                txnId: verifyResponse.body.txnId,
                bankTxnId: verifyResponse.body.bankTxnId,
                paymentMode: verifyResponse.body.paymentMode,
                bankName: verifyResponse.body.bankName,
                gatewayName: verifyResponse.body.gatewayName,
                paytmVerifyResponse: verifyResponse.body,
                verifiedAt: new Date().toISOString(),
            }),
        });
        // If payment successful, update user wallet using wallet service
        if (mappedStatus === 'COMPLETED') {
            const currency = metadata.currency || 'INR';
            // Get or create the FIAT wallet
            const wallet = await wallet_1.walletCreationService.getOrCreateWallet(user.id, 'FIAT', currency);
            // Use wallet service for atomic, audited credit
            // Use stable idempotency key for proper retry detection
            const idempotencyKey = `paytm_deposit_${orderId}`;
            const creditResult = await wallet_1.walletService.credit({
                idempotencyKey,
                userId: user.id,
                walletId: wallet.id,
                walletType: 'FIAT',
                currency,
                amount: txnAmount,
                operationType: 'DEPOSIT',
                referenceId: transaction.uuid,
                description: `Paytm deposit - ${verifyResponse.body.txnId || orderId}`,
                metadata: {
                    gateway: 'paytm',
                    txnId: verifyResponse.body.txnId,
                    bankTxnId: verifyResponse.body.bankTxnId,
                    paymentMode: verifyResponse.body.paymentMode,
                    bankName: verifyResponse.body.bankName,
                },
            });
            // Send confirmation email
            try {
                await (0, emails_1.sendFiatTransactionEmail)(user, transaction, currency, creditResult.newBalance);
            }
            catch (emailError) {
                console_1.logger.error('PAYTM', 'Failed to send confirmation email', emailError);
            }
        }
        return {
            success: true,
            data: {
                transaction_id: transaction.uuid,
                order_id: orderId,
                txn_id: verifyResponse.body.txnId || '',
                status: mappedStatus,
                amount: txnAmount,
                currency: metadata.currency || 'INR',
                gateway: 'paytm',
                payment_mode: verifyResponse.body.paymentMode || '',
                bank_name: verifyResponse.body.bankName || '',
                gateway_name: verifyResponse.body.gatewayName || '',
                bank_txn_id: verifyResponse.body.bankTxnId || '',
                verified_at: new Date().toISOString(),
            },
        };
    }
    catch (error) {
        if (error instanceof utils_1.PaytmError) {
            throw (0, error_1.createError)({
                statusCode: error.status,
                message: error.message,
            });
        }
        throw (0, error_1.createError)({
            statusCode: 500,
            message: 'Failed to verify Paytm payment',
        });
    }
};
