"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.metadata = void 0;
const error_1 = require("@b/utils/error");
const db_1 = require("@b/db");
const emails_1 = require("@b/utils/emails");
const console_1 = require("@b/utils/console");
const utils_1 = require("./utils");
const utils_2 = require("@b/api/finance/utils");
exports.metadata = {
    summary: 'Verifies Mollie payment status',
    description: 'Handles return URL from Mollie and verifies payment completion',
    operationId: 'verifyMolliePayment',
    tags: ['Finance', 'Deposit', 'Mollie'],
    requiresAuth: true,
    logModule: "MOLLIE_DEPOSIT",
    logTitle: "Verify Mollie payment",
    requestBody: {
        required: true,
        content: {
            'application/json': {
                schema: {
                    type: 'object',
                    properties: {
                        transaction: {
                            type: 'string',
                            description: 'Transaction UUID',
                        },
                        paymentId: {
                            type: 'string',
                            description: 'Mollie payment ID (optional)',
                        },
                    },
                    required: ['transaction'],
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
                                    transactionId: { type: 'string' },
                                    status: { type: 'string' },
                                    amount: { type: 'number' },
                                    currency: { type: 'string' },
                                    paymentMethod: { type: 'string' },
                                    paidAt: { type: 'string' },
                                },
                            },
                        },
                    },
                },
            },
        },
        400: { description: 'Bad request' },
        401: { description: 'Unauthorized' },
        404: { description: 'Transaction not found' },
        500: { description: 'Internal server error' },
    },
};
exports.default = async (data) => {
    var _a, _b, _c, _d, _e, _f;
    const { body, user, ctx } = data;
    if (!(user === null || user === void 0 ? void 0 : user.id)) {
        throw (0, error_1.createError)({
            statusCode: 401,
            message: 'Authentication required',
        });
    }
    if (!body.transaction) {
        throw (0, error_1.createError)({
            statusCode: 400,
            message: 'Transaction ID is required',
        });
    }
    (0, utils_1.validateMollieConfig)();
    try {
        // Find the transaction
        const transaction = await db_1.models.transaction.findOne({
            where: {
                uuid: body.transaction,
                userId: user.id,
            },
        });
        if (!transaction) {
            throw (0, error_1.createError)({
                statusCode: 404,
                message: 'Transaction not found',
            });
        }
        // Check if transaction is already processed
        if (transaction.status === 'COMPLETED') {
            return {
                success: true,
                data: {
                    transactionId: transaction.uuid,
                    status: 'COMPLETED',
                    amount: transaction.amount,
                    currency: ((_a = transaction.metadata) === null || _a === void 0 ? void 0 : _a.currency) || 'EUR',
                    paymentMethod: ((_b = transaction.metadata) === null || _b === void 0 ? void 0 : _b.method) || 'unknown',
                    paidAt: transaction.updatedAt,
                },
            };
        }
        // Get Mollie payment ID from transaction or request
        const molliePaymentId = body.paymentId || transaction.referenceId || ((_c = transaction.metadata) === null || _c === void 0 ? void 0 : _c.molliePaymentId);
        if (!molliePaymentId) {
            throw (0, error_1.createError)({
                statusCode: 400,
                message: 'Mollie payment ID not found',
            });
        }
        // Fetch payment status from Mollie
        const molliePayment = await (0, utils_1.makeApiRequest)(`/payments/${molliePaymentId}`);
        if (!molliePayment) {
            throw (0, error_1.createError)({
                statusCode: 404,
                message: 'Payment not found at Mollie',
            });
        }
        // Map Mollie status to our system status
        const newStatus = (0, utils_1.mapMollieStatus)(molliePayment.status);
        let updatedTransaction = transaction;
        // Process payment based on status
        if (molliePayment.status === 'paid' && transaction.status !== 'COMPLETED') {
            const currency = ((_d = transaction.metadata) === null || _d === void 0 ? void 0 : _d.currency) || 'EUR';
            // Calculate fee if available
            let fee = 0;
            if (molliePayment.settlementAmount && molliePayment.amount) {
                const originalAmount = (0, utils_1.parseMollieAmount)(molliePayment.amount.value, molliePayment.amount.currency);
                const settlementAmount = (0, utils_1.parseMollieAmount)(molliePayment.settlementAmount.value, molliePayment.settlementAmount.currency);
                fee = (originalAmount - settlementAmount) / 100; // Convert from minor units
            }
            // Update transaction status
            await db_1.models.transaction.update({
                status: 'COMPLETED',
                referenceId: molliePayment.id,
                fee,
                metadata: JSON.stringify({
                    ...transaction.metadata,
                    molliePaymentId: molliePayment.id,
                    mollieStatus: molliePayment.status,
                    paymentMethod: molliePayment.method || 'unknown',
                    paidAt: molliePayment.createdAt,
                    settlementAmount: molliePayment.settlementAmount,
                }),
            }, {
                where: { uuid: transaction.uuid },
            });
            // Use centralized wallet service for atomic, audited deposit
            ctx === null || ctx === void 0 ? void 0 : ctx.step("Processing deposit via wallet service");
            const depositResult = await (0, utils_2.processFiatDeposit)({
                userId: user.id,
                currency,
                amount: transaction.amount,
                fee,
                referenceId: molliePayment.id,
                method: 'MOLLIE',
                description: `Mollie deposit - ${transaction.amount} ${currency}`,
                metadata: {
                    molliePaymentId: molliePayment.id,
                    paymentMethod: molliePayment.method || 'unknown',
                },
                idempotencyKey: `mollie_deposit_${molliePayment.id}`,
                ctx,
            });
            // Send confirmation email
            try {
                ctx === null || ctx === void 0 ? void 0 : ctx.step("Sending notification email");
                await (0, emails_1.sendFiatTransactionEmail)(user, {
                    id: transaction.uuid,
                    type: 'DEPOSIT',
                    amount: transaction.amount,
                    status: 'COMPLETED',
                    description: `Mollie deposit - ${transaction.amount} ${currency}`,
                }, currency, depositResult.newBalance);
            }
            catch (emailError) {
                console_1.logger.error("MOLLIE", "Failed to send confirmation email", emailError);
            }
            // Fetch updated transaction
            updatedTransaction = await db_1.models.transaction.findOne({
                where: { uuid: transaction.uuid },
            });
        }
        else if (['failed', 'canceled', 'expired'].includes(molliePayment.status)) {
            // Payment failed - update transaction status
            await db_1.models.transaction.update({
                status: newStatus,
                metadata: JSON.stringify({
                    ...transaction.metadata,
                    molliePaymentId: molliePayment.id,
                    mollieStatus: molliePayment.status,
                    failureReason: ((_e = molliePayment.details) === null || _e === void 0 ? void 0 : _e.failureReason) || 'Payment failed',
                }),
            }, {
                where: { uuid: transaction.uuid },
            });
            updatedTransaction = await db_1.models.transaction.findOne({
                where: { uuid: transaction.uuid },
            });
        }
        else {
            // Payment still pending - update metadata only
            await db_1.models.transaction.update({
                metadata: JSON.stringify({
                    ...transaction.metadata,
                    molliePaymentId: molliePayment.id,
                    mollieStatus: molliePayment.status,
                }),
            }, {
                where: { uuid: transaction.uuid },
            });
            updatedTransaction = await db_1.models.transaction.findOne({
                where: { uuid: transaction.uuid },
            });
        }
        return {
            success: true,
            data: {
                transactionId: updatedTransaction.uuid,
                status: updatedTransaction.status,
                amount: updatedTransaction.amount,
                currency: ((_f = updatedTransaction.metadata) === null || _f === void 0 ? void 0 : _f.currency) || 'EUR',
                paymentMethod: molliePayment.method || 'unknown',
                paidAt: molliePayment.status === 'paid' ? molliePayment.createdAt : null,
            },
        };
    }
    catch (error) {
        console_1.logger.error("MOLLIE", "Payment verification error", error);
        if (error.statusCode) {
            throw error;
        }
        throw (0, error_1.createError)({
            statusCode: 500,
            message: error.message || 'Failed to verify Mollie payment',
        });
    }
};
