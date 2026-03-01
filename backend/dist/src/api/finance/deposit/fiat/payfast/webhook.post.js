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
    summary: 'Handles PayFast ITN webhook',
    description: 'Processes PayFast Instant Transaction Notification (ITN) callbacks',
    operationId: 'handlePayFastWebhook',
    tags: ['Finance', 'Deposit', 'PayFast', 'Webhook'],
    logModule: "WEBHOOK",
    logTitle: "PayFast webhook",
    requiresAuth: false, // Webhooks don't use user authentication
    requestBody: {
        required: true,
        content: {
            'application/x-www-form-urlencoded': {
                schema: {
                    type: 'object',
                    properties: {
                        m_payment_id: {
                            type: 'string',
                            description: 'Merchant payment ID',
                        },
                        pf_payment_id: {
                            type: 'string',
                            description: 'PayFast payment ID',
                        },
                        payment_status: {
                            type: 'string',
                            description: 'Payment status from PayFast',
                        },
                        amount_gross: {
                            type: 'string',
                            description: 'Gross payment amount',
                        },
                        amount_fee: {
                            type: 'string',
                            description: 'PayFast processing fee',
                        },
                        amount_net: {
                            type: 'string',
                            description: 'Net amount after fees',
                        },
                        signature: {
                            type: 'string',
                            description: 'PayFast signature for verification',
                        },
                    },
                    required: ['m_payment_id', 'pf_payment_id', 'payment_status'],
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
        400: { description: 'Bad request - invalid webhook data' },
        500: { description: 'Internal server error' },
    },
};
exports.default = async (data) => {
    var _a, _b;
    const { body } = data;
    console_1.logger.info('PAYFAST', `ITN received: ${body.m_payment_id}, status: ${body.payment_status}, amount: ${body.amount_gross}`);
    // Validate required fields
    if (!body.m_payment_id || !body.pf_payment_id || !body.payment_status) {
        throw (0, error_1.createError)({
            statusCode: 400,
            message: 'Required webhook fields missing',
        });
    }
    // Validate configuration
    (0, utils_1.validatePayFastConfig)();
    try {
        // Validate signature
        if (utils_1.PAYFAST_CONFIG.PASSPHRASE) {
            const isValidSignature = (0, utils_1.validateSignature)(body, utils_1.PAYFAST_CONFIG.PASSPHRASE);
            if (!isValidSignature) {
                console_1.logger.error('PAYFAST', 'ITN signature validation failed');
                throw (0, error_1.createError)({
                    statusCode: 400,
                    message: 'Invalid webhook signature',
                });
            }
        }
        // Validate ITN with PayFast (optional additional security)
        const itnValidation = await (0, utils_1.validateITN)(body);
        if (!itnValidation.valid) {
            console_1.logger.warn('PAYFAST', `ITN validation failed: ${itnValidation.error}`);
            // Log but don't fail - signature validation is primary security
        }
        // Find the transaction
        const transaction = await db_1.models.transaction.findOne({
            where: {
                uuid: body.m_payment_id
            },
            include: [
                {
                    model: db_1.models.user,
                    as: 'user',
                    attributes: ['id', 'email', 'firstName', 'lastName']
                }
            ]
        });
        if (!transaction) {
            console_1.logger.error('PAYFAST', `Transaction not found for ITN: ${body.m_payment_id}`);
            throw (0, error_1.createError)({
                statusCode: 404,
                message: 'Transaction not found',
            });
        }
        // Check if status has changed to prevent duplicate processing
        const currentStatus = transaction.status;
        const newStatus = (0, utils_1.mapPayFastStatus)(body.payment_status);
        if (currentStatus === newStatus) {
            console_1.logger.debug('PAYFAST', 'ITN: Status unchanged, skipping processing');
            return 'OK';
        }
        // Get payment amounts
        const grossAmount = (0, utils_1.parsePayFastAmount)(body.amount_gross);
        const feeAmount = (0, utils_1.parsePayFastAmount)(body.amount_fee || '0');
        const netAmount = (0, utils_1.parsePayFastAmount)(body.amount_net || body.amount_gross) - feeAmount;
        // Start database transaction
        const dbTransaction = await db_1.sequelize.transaction();
        try {
            // Update transaction status and metadata
            await transaction.update({
                status: newStatus,
                fee: feeAmount,
                metadata: JSON.stringify({
                    ...transaction.metadata,
                    payfast: {
                        ...(_a = transaction.metadata) === null || _a === void 0 ? void 0 : _a.payfast,
                        pf_payment_id: body.pf_payment_id,
                        payment_status: body.payment_status,
                        amount_gross: grossAmount,
                        amount_fee: feeAmount,
                        amount_net: netAmount,
                        itn_received_at: new Date().toISOString(),
                        signature_valid: true,
                        itn_valid: itnValidation.valid,
                        webhook_data: body
                    }
                })
            }, { transaction: dbTransaction });
            // If payment was successful, update user wallet
            if (newStatus === 'COMPLETED' && currentStatus !== 'COMPLETED') {
                const currency = ((_b = transaction.metadata) === null || _b === void 0 ? void 0 : _b.currency) || 'ZAR';
                // Get or create user wallet
                let wallet = await db_1.models.wallet.findOne({
                    where: {
                        userId: transaction.userId,
                        currency,
                        type: 'FIAT',
                    },
                    transaction: dbTransaction
                });
                if (!wallet) {
                    wallet = await wallet_1.walletCreationService.getOrCreateWallet(transaction.userId, 'FIAT', currency, dbTransaction);
                }
                // Use wallet service for atomic, audited credit
                // Use stable idempotency key for proper retry detection
                const idempotencyKey = `payfast_webhook_${body.pf_payment_id}`;
                await wallet_1.walletService.credit({
                    idempotencyKey,
                    userId: transaction.userId,
                    walletId: wallet.id,
                    walletType: 'FIAT',
                    currency,
                    amount: netAmount,
                    operationType: 'DEPOSIT',
                    referenceId: body.pf_payment_id,
                    description: `PayFast deposit - ${netAmount} ${currency}`,
                    metadata: {
                        method: 'PAYFAST',
                        pfPaymentId: body.pf_payment_id,
                        grossAmount,
                        feeAmount,
                    },
                    transaction: dbTransaction,
                });
                const newBalance = parseFloat(wallet.balance) + netAmount;
                // Record admin profit from processing fees
                if (feeAmount > 0) {
                    try {
                        await db_1.models.adminProfit.create({
                            type: 'DEPOSIT_FEE',
                            amount: feeAmount,
                            currency: currency,
                            description: `PayFast processing fee for transaction ${transaction.id}`,
                            metadata: JSON.stringify({
                                transactionId: transaction.id,
                                userId: transaction.userId,
                                gateway: 'payfast',
                                pf_payment_id: body.pf_payment_id
                            })
                        }, { transaction: dbTransaction });
                    }
                    catch (profitError) {
                        console_1.logger.error('PAYFAST', 'Failed to record admin profit', profitError);
                        // Don't fail the transaction for profit recording errors
                    }
                }
                // Send confirmation email
                try {
                    await (0, emails_1.sendFiatTransactionEmail)(transaction.user, transaction, currency, newBalance);
                }
                catch (emailError) {
                    console_1.logger.error('PAYFAST', 'Failed to send confirmation email', emailError);
                    // Don't fail the transaction for email errors
                }
            }
            // Commit the database transaction
            await dbTransaction.commit();
            console_1.logger.success('PAYFAST', `ITN processed: Transaction ${transaction.id}, ${currentStatus} → ${newStatus}, amount: ${grossAmount}, fee: ${feeAmount}`);
            return 'OK';
        }
        catch (dbError) {
            await dbTransaction.rollback();
            throw dbError;
        }
    }
    catch (error) {
        console_1.logger.error('PAYFAST', 'ITN processing error', error);
        // Return error response but don't expose internal details
        throw (0, error_1.createError)({
            statusCode: error.statusCode || 500,
            message: 'Webhook processing failed',
        });
    }
};
