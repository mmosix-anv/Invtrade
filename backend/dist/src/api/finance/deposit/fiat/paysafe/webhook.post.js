"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.metadata = void 0;
const db_1 = require("@b/db");
const error_1 = require("@b/utils/error");
const emails_1 = require("@b/utils/emails");
const console_1 = require("@b/utils/console");
const utils_1 = require("./utils");
const wallet_1 = require("@b/services/wallet");
exports.metadata = {
    summary: 'Handles Paysafe webhook notifications',
    description: 'Processes real-time payment status updates from Paysafe via webhooks',
    operationId: 'handlePaysafeWebhook',
    tags: ['Finance', 'Deposit', 'Paysafe', 'Webhook'],
    logModule: "WEBHOOK",
    logTitle: "Paysafe webhook",
    requiresAuth: false, // Webhooks don't use user authentication
    requestBody: {
        required: true,
        content: {
            'application/json': {
                schema: {
                    type: 'object',
                    properties: {
                        eventType: {
                            type: 'string',
                            description: 'Type of webhook event',
                            example: 'payment.completed',
                        },
                        eventId: {
                            type: 'string',
                            description: 'Unique event identifier',
                        },
                        eventTime: {
                            type: 'string',
                            description: 'Event timestamp',
                            format: 'date-time',
                        },
                        object: {
                            type: 'object',
                            description: 'Payment or PaymentHandle object',
                        },
                    },
                    required: ['eventType', 'eventId', 'eventTime', 'object'],
                },
            },
        },
    },
    responses: {
        200: {
            description: 'Webhook processed successfully',
            content: {
                'application/json': {
                    schema: {
                        type: 'object',
                        properties: {
                            success: { type: 'boolean' },
                            message: { type: 'string' },
                            processed: { type: 'boolean' },
                        },
                    },
                },
            },
        },
        400: {
            description: 'Bad request - Invalid webhook data',
        },
        401: {
            description: 'Unauthorized - Invalid signature',
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
    const { body, headers } = data;
    try {
        // Validate Paysafe configuration
        (0, utils_1.validatePaysafeConfig)();
        // Validate webhook signature if provided
        const signature = headers['x-paysafe-signature'] || headers['paysafe-signature'];
        if (signature) {
            const rawBody = JSON.stringify(body);
            if (!(0, utils_1.validateWebhookSignature)(rawBody, signature)) {
                console_1.logger.error("PAYSAFE", "Invalid webhook signature");
                throw (0, error_1.createError)({
                    statusCode: 401,
                    message: 'Invalid webhook signature',
                });
            }
        }
        const webhookData = body;
        if (!webhookData.eventType || !webhookData.object) {
            throw (0, error_1.createError)({
                statusCode: 400,
                message: 'Invalid webhook data: missing eventType or object',
            });
        }
        console_1.logger.info("PAYSAFE", `Processing webhook: ${webhookData.eventType} - eventId: ${webhookData.eventId}`);
        // Extract payment details from webhook object
        const paymentObject = webhookData.object;
        if (!paymentObject.merchantRefNum) {
            console_1.logger.debug("PAYSAFE", "Webhook object missing merchantRefNum, skipping");
            return {
                success: true,
                message: 'Webhook processed (no merchantRefNum)',
                processed: false,
            };
        }
        // Find the transaction by reference
        const transaction = await db_1.models.transaction.findOne({
            where: {
                uuid: paymentObject.merchantRefNum,
            },
            include: [
                {
                    model: db_1.models.user,
                    as: 'user',
                    attributes: ['id', 'email', 'firstName', 'lastName'],
                },
            ],
        });
        if (!transaction) {
            console_1.logger.warn("PAYSAFE", `Transaction not found for reference: ${paymentObject.merchantRefNum}`);
            return {
                success: true,
                message: 'Transaction not found',
                processed: false,
            };
        }
        // Check if this is a duplicate event by comparing status
        const currentStatus = (0, utils_1.mapPaysafeStatus)(paymentObject.status);
        if (transaction.status === currentStatus) {
            console_1.logger.debug("PAYSAFE", `Status unchanged for transaction ${transaction.uuid}: ${currentStatus}`);
            return {
                success: true,
                message: 'Status unchanged',
                processed: false,
            };
        }
        // Process different event types
        let shouldUpdateWallet = false;
        let paymentAmount = 0;
        if ('amount' in paymentObject && 'currencyCode' in paymentObject) {
            paymentAmount = (0, utils_1.parsePaysafeAmount)(paymentObject.amount, paymentObject.currencyCode);
        }
        switch (webhookData.eventType.toLowerCase()) {
            case 'payment.completed':
            case 'payment.settled':
            case 'paymenthandle.completed':
                shouldUpdateWallet = currentStatus === 'COMPLETED';
                break;
            case 'payment.failed':
            case 'payment.declined':
            case 'payment.cancelled':
            case 'paymenthandle.failed':
            case 'paymenthandle.cancelled':
                shouldUpdateWallet = false;
                break;
            case 'payment.pending':
            case 'payment.processing':
            case 'paymenthandle.pending':
            case 'paymenthandle.processing':
                shouldUpdateWallet = false;
                break;
            default:
                console_1.logger.debug("PAYSAFE", `Unhandled event type: ${webhookData.eventType}`);
                shouldUpdateWallet = false;
        }
        // Start database transaction for atomic updates
        await db_1.sequelize.transaction(async (dbTransaction) => {
            // Update transaction status and metadata
            await transaction.update({
                status: currentStatus,
                metadata: {
                    ...transaction.metadata,
                    webhookEventId: webhookData.eventId,
                    webhookEventType: webhookData.eventType,
                    webhookEventTime: webhookData.eventTime,
                    gatewayStatus: paymentObject.status,
                    lastWebhookUpdate: new Date().toISOString(),
                    gatewayResponse: 'gatewayResponse' in paymentObject ? paymentObject.gatewayResponse : undefined,
                    paymentId: 'id' in paymentObject ? paymentObject.id : undefined,
                },
            }, { transaction: dbTransaction });
            // Update user wallet if payment is successful
            if (shouldUpdateWallet && paymentAmount > 0 && 'currencyCode' in paymentObject) {
                const currency = paymentObject.currencyCode;
                let wallet = await db_1.models.wallet.findOne({
                    where: {
                        userId: transaction.userId,
                        currency,
                        type: 'FIAT',
                    },
                    transaction: dbTransaction,
                });
                if (!wallet) {
                    // Create wallet using wallet creation service
                    wallet = await wallet_1.walletCreationService.getOrCreateWallet(transaction.userId, 'FIAT', currency, dbTransaction);
                }
                // Use wallet service for atomic, audited credit
                // Use stable idempotency key for proper retry detection
                const idempotencyKey = `paysafe_webhook_${webhookData.eventId}`;
                await wallet_1.walletService.credit({
                    idempotencyKey,
                    userId: transaction.userId,
                    walletId: wallet.id,
                    walletType: 'FIAT',
                    currency,
                    amount: paymentAmount,
                    operationType: 'DEPOSIT',
                    referenceId: paymentObject.merchantRefNum,
                    description: `Paysafe deposit - ${paymentAmount} ${currency}`,
                    metadata: {
                        method: 'PAYSAFE',
                        eventId: webhookData.eventId,
                        eventType: webhookData.eventType,
                    },
                    transaction: dbTransaction,
                });
                console_1.logger.success("PAYSAFE", `Wallet updated: +${paymentAmount} ${currency} for user ${transaction.userId}`);
            }
        });
        // Send confirmation email for completed payments
        if (shouldUpdateWallet && transaction.user && 'currencyCode' in paymentObject) {
            try {
                const updatedWallet = await db_1.models.wallet.findOne({
                    where: {
                        userId: transaction.userId,
                        currency: paymentObject.currencyCode,
                    },
                });
                await (0, emails_1.sendFiatTransactionEmail)(transaction.user, transaction, paymentObject.currencyCode, (updatedWallet === null || updatedWallet === void 0 ? void 0 : updatedWallet.balance) || paymentAmount);
                console_1.logger.success("PAYSAFE", `Confirmation email sent for transaction ${transaction.uuid}`);
            }
            catch (emailError) {
                console_1.logger.error("PAYSAFE", "Failed to send confirmation email", emailError);
                // Don't fail the webhook if email fails
            }
        }
        console_1.logger.success("PAYSAFE", `Webhook processed: ${webhookData.eventType} for ${transaction.uuid}`);
        return {
            success: true,
            message: 'Webhook processed successfully',
            processed: true,
            transaction_id: transaction.id,
            status: currentStatus,
            event_type: webhookData.eventType,
        };
    }
    catch (error) {
        console_1.logger.error("PAYSAFE", "Webhook processing error", error);
        if (error instanceof utils_1.PaysafeError) {
            throw (0, error_1.createError)({
                statusCode: error.status,
                message: `Paysafe Webhook Error: ${error.message}`,
            });
        }
        // For webhook errors, we should return 200 to prevent retries for invalid data
        // but log the error for investigation
        if (error.statusCode === 400 || error.statusCode === 404) {
            return {
                success: false,
                message: error.message,
                processed: false,
            };
        }
        throw (0, error_1.createError)({
            statusCode: 500,
            message: error.message || 'Failed to process Paysafe webhook',
        });
    }
};
