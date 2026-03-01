"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.metadata = void 0;
const error_1 = require("@b/utils/error");
const db_1 = require("@b/db");
const emails_1 = require("@b/utils/emails");
const utils_1 = require("./utils");
const console_1 = require("@b/utils/console");
const wallet_1 = require("@b/services/wallet");
exports.metadata = {
    summary: 'Handles Mollie webhook notifications',
    description: 'Processes payment status updates from Mollie backend notifications',
    operationId: 'mollieWebhook',
    tags: ['Finance', 'Deposit', 'Mollie', 'Webhook'],
    logModule: "WEBHOOK",
    logTitle: "Mollie webhook",
    requiresAuth: false, // Webhooks don't use user authentication
    requestBody: {
        required: true,
        content: {
            'application/x-www-form-urlencoded': {
                schema: {
                    type: 'object',
                    properties: {
                        id: {
                            type: 'string',
                            description: 'Mollie payment ID',
                        },
                    },
                    required: ['id'],
                },
            },
        },
    },
    responses: {
        200: {
            description: 'Webhook processed successfully',
            content: {
                'text/plain': {
                    schema: {
                        type: 'string',
                        example: 'OK',
                    },
                },
            },
        },
        400: { description: 'Bad request' },
        404: { description: 'Payment not found' },
        500: { description: 'Internal server error' },
    },
};
exports.default = async (data) => {
    var _a, _b, _c, _d, _e;
    const { body } = data;
    if (!body.id) {
        throw (0, error_1.createError)({
            statusCode: 400,
            message: 'Payment ID is required',
        });
    }
    (0, utils_1.validateMollieConfig)();
    try {
        const molliePaymentId = body.id;
        // Fetch payment details from Mollie
        const molliePayment = await (0, utils_1.makeApiRequest)(`/payments/${molliePaymentId}`);
        if (!molliePayment) {
            throw (0, error_1.createError)({
                statusCode: 404,
                message: 'Payment not found at Mollie',
            });
        }
        // Find transaction by Mollie payment ID
        const transaction = await db_1.models.transaction.findOne({
            where: {
                referenceId: molliePaymentId,
            },
        });
        if (!transaction) {
            // Try to find by metadata
            const transactionByMetadata = await db_1.models.transaction.findOne({
                where: {
                    metadata: {
                        molliePaymentId: molliePaymentId,
                    },
                },
            });
            if (!transactionByMetadata) {
                console_1.logger.warn("MOLLIE", `No transaction found for Mollie payment ID: ${molliePaymentId}`);
                return 'OK'; // Return OK to prevent Mollie from retrying
            }
        }
        const targetTransaction = transaction || await db_1.models.transaction.findOne({
            where: {
                metadata: {
                    molliePaymentId: molliePaymentId,
                },
            },
        });
        // Check if transaction status has changed
        const currentMollieStatus = (_a = targetTransaction.metadata) === null || _a === void 0 ? void 0 : _a.mollieStatus;
        if (currentMollieStatus === molliePayment.status) {
            // No status change, return OK
            return 'OK';
        }
        // Map Mollie status to our system status
        const newStatus = (0, utils_1.mapMollieStatus)(molliePayment.status);
        // Get user information
        const user = await db_1.models.user.findByPk(targetTransaction.userId);
        if (!user) {
            console_1.logger.error("MOLLIE", `User not found for transaction: ${targetTransaction.uuid}`);
            return 'OK';
        }
        // Process payment based on status
        if (molliePayment.status === 'paid' && targetTransaction.status !== 'COMPLETED') {
            // Payment successful - update transaction and wallet
            await db_1.sequelize.transaction(async (dbTransaction) => {
                var _a;
                // Update transaction status
                await db_1.models.transaction.update({
                    status: 'COMPLETED',
                    referenceId: molliePayment.id,
                    metadata: JSON.stringify({
                        ...targetTransaction.metadata,
                        molliePaymentId: molliePayment.id,
                        mollieStatus: molliePayment.status,
                        paymentMethod: molliePayment.method || 'unknown',
                        paidAt: molliePayment.createdAt,
                        settlementAmount: molliePayment.settlementAmount,
                        webhookProcessedAt: new Date().toISOString(),
                    }),
                }, {
                    where: { uuid: targetTransaction.uuid },
                    transaction: dbTransaction,
                });
                // Find user's wallet for the currency
                const currency = ((_a = targetTransaction.metadata) === null || _a === void 0 ? void 0 : _a.currency) || 'EUR';
                // Get or create wallet
                const walletResult = await wallet_1.walletCreationService.getOrCreateWallet(user.id, 'FIAT', currency, dbTransaction);
                const wallet = walletResult.wallet;
                // Update wallet balance via wallet service
                // Use stable idempotency key for proper retry detection
                const idempotencyKey = `mollie_webhook_${molliePaymentId}`;
                await wallet_1.walletService.credit({
                    idempotencyKey,
                    userId: user.id,
                    walletId: wallet.id,
                    walletType: 'FIAT',
                    currency,
                    amount: targetTransaction.amount,
                    operationType: 'DEPOSIT',
                    referenceId: molliePaymentId,
                    description: `Mollie deposit - ${targetTransaction.amount} ${currency}`,
                    metadata: {
                        method: 'MOLLIE',
                        molliePaymentId: molliePayment.id,
                        paymentMethod: molliePayment.method || 'unknown',
                    },
                    transaction: dbTransaction,
                });
                // Transaction record is already created in the targetTransaction variable above
                // No need to create another walletTransaction
                // Record admin profit if there are fees
                if (molliePayment.settlementAmount && molliePayment.amount) {
                    const originalAmount = (0, utils_1.parseMollieAmount)(molliePayment.amount.value, molliePayment.amount.currency);
                    const settlementAmount = (0, utils_1.parseMollieAmount)(molliePayment.settlementAmount.value, molliePayment.settlementAmount.currency);
                    const fee = originalAmount - settlementAmount;
                    if (fee > 0) {
                        await db_1.models.transaction.update({ fee: fee / 100 }, // Convert from minor units
                        {
                            where: { uuid: targetTransaction.uuid },
                            transaction: dbTransaction,
                        });
                    }
                }
            });
            // Send confirmation email
            try {
                const currency = ((_b = targetTransaction.metadata) === null || _b === void 0 ? void 0 : _b.currency) || 'EUR';
                const updatedWallet = await db_1.models.wallet.findOne({
                    where: {
                        userId: user.id,
                        currency: currency,
                        type: 'FIAT',
                    },
                });
                await (0, emails_1.sendFiatTransactionEmail)(user, {
                    id: targetTransaction.uuid,
                    type: 'DEPOSIT',
                    amount: targetTransaction.amount,
                    status: 'COMPLETED',
                    description: `Mollie deposit - ${targetTransaction.amount} ${currency}`,
                }, currency, (updatedWallet === null || updatedWallet === void 0 ? void 0 : updatedWallet.balance) || 0);
            }
            catch (emailError) {
                console_1.logger.error('MOLLIE', 'Failed to send confirmation email', emailError);
                // Don't throw error for email failure
            }
        }
        else if (['failed', 'canceled', 'expired'].includes(molliePayment.status)) {
            // Payment failed - update transaction status
            await db_1.models.transaction.update({
                status: newStatus,
                metadata: JSON.stringify({
                    ...targetTransaction.metadata,
                    molliePaymentId: molliePayment.id,
                    mollieStatus: molliePayment.status,
                    failureReason: ((_c = molliePayment.details) === null || _c === void 0 ? void 0 : _c.failureReason) || 'Payment failed',
                    webhookProcessedAt: new Date().toISOString(),
                }),
            }, {
                where: { uuid: targetTransaction.uuid },
            });
            // Send failure notification email
            try {
                const currency = ((_d = targetTransaction.metadata) === null || _d === void 0 ? void 0 : _d.currency) || 'EUR';
                await (0, emails_1.sendFiatTransactionEmail)(user, {
                    id: targetTransaction.uuid,
                    type: 'DEPOSIT',
                    amount: targetTransaction.amount,
                    status: newStatus,
                    description: `Mollie deposit failed - ${targetTransaction.amount} ${currency}`,
                }, currency, 0 // No balance change for failed transactions
                );
            }
            catch (emailError) {
                console_1.logger.error('MOLLIE', 'Failed to send failure notification email', emailError);
            }
        }
        else {
            // Payment still pending or other status - update metadata only
            await db_1.models.transaction.update({
                metadata: JSON.stringify({
                    ...targetTransaction.metadata,
                    molliePaymentId: molliePayment.id,
                    mollieStatus: molliePayment.status,
                    webhookProcessedAt: new Date().toISOString(),
                }),
            }, {
                where: { uuid: targetTransaction.uuid },
            });
        }
        // Log webhook processing
        console_1.logger.success("MOLLIE", `Webhook processed: Payment ${molliePaymentId} status ${molliePayment.status}`);
        return 'OK';
    }
    catch (error) {
        console_1.logger.error('MOLLIE', 'Webhook processing error', error);
        // For webhook errors, we should still return OK to prevent Mollie from retrying
        // unless it's a configuration error
        if ((_e = error.message) === null || _e === void 0 ? void 0 : _e.includes('API key')) {
            throw (0, error_1.createError)({
                statusCode: 500,
                message: 'Configuration error',
            });
        }
        return 'OK';
    }
};
