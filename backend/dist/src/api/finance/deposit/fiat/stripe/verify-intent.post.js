"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.metadata = void 0;
const query_1 = require("@b/utils/query");
const error_1 = require("@b/utils/error");
const utils_1 = require("./utils");
const db_1 = require("@b/db");
const emails_1 = require("@b/utils/emails");
const console_1 = require("@b/utils/console");
const wallet_1 = require("@b/services/wallet");
exports.metadata = {
    summary: "Verifies a Stripe payment intent",
    description: "Confirms a completed Stripe payment intent and creates the corresponding wallet transaction",
    operationId: "verifyStripePaymentIntent",
    tags: ["Finance", "Deposit"],
    requiresAuth: true,
    logModule: "STRIPE_DEPOSIT",
    logTitle: "Verify Stripe payment intent",
    parameters: [
        {
            index: 0,
            name: "intentId",
            in: "query",
            description: "Stripe payment intent ID (pi_xxxxx)",
            required: true,
            schema: { type: "string" },
        },
    ],
    responses: {
        200: {
            description: "Payment intent verified successfully",
            content: {
                "application/json": {
                    schema: {
                        type: "object",
                        properties: {
                            transaction: {
                                type: "object",
                                description: "Created transaction object"
                            },
                            balance: {
                                type: "number",
                                description: "Updated wallet balance"
                            },
                            currency: {
                                type: "string",
                                description: "Transaction currency"
                            },
                            method: {
                                type: "string",
                                description: "Payment method"
                            },
                            status: {
                                type: "string",
                                description: "Verification status"
                            }
                        }
                    }
                }
            }
        },
        401: query_1.unauthorizedResponse,
        404: (0, query_1.notFoundMetadataResponse)("Payment Intent"),
        500: query_1.serverErrorResponse,
    },
};
exports.default = async (data) => {
    const { user, query, ctx } = data;
    if (!user)
        throw (0, error_1.createError)({ statusCode: 401, message: "User not authenticated" });
    const { intentId } = query;
    const stripe = (0, utils_1.useStripe)();
    try {
        // 1. Retrieve the Payment Intent from Stripe
        ctx === null || ctx === void 0 ? void 0 : ctx.step("Retrieving Stripe payment intent");
        const paymentIntent = await stripe.paymentIntents.retrieve(intentId);
        // 2. Check if payment succeeded
        if (paymentIntent.status !== 'succeeded') {
            throw (0, error_1.createError)({ statusCode: 400, message: `Payment intent status: ${paymentIntent.status}` });
        }
        // 3. Check for existing transaction to prevent duplicates
        ctx === null || ctx === void 0 ? void 0 : ctx.step("Checking for duplicate transaction");
        const existingTransaction = await db_1.models.transaction.findOne({
            where: { referenceId: intentId },
        });
        if (existingTransaction) {
            ctx === null || ctx === void 0 ? void 0 : ctx.success("Stripe deposit completed successfully");
            return {
                transaction: existingTransaction,
                status: 'already_processed',
                message: 'Transaction already exists'
            };
        }
        // 4. Calculate amounts (same logic as checkout sessions)
        const totalAmount = paymentIntent.amount / 100; // Convert from cents
        const currency = paymentIntent.currency.toUpperCase();
        // Get gateway to calculate fees
        ctx === null || ctx === void 0 ? void 0 : ctx.step("Fetching payment gateway configuration");
        const gateway = await db_1.models.depositGateway.findOne({
            where: { alias: "stripe", status: true },
        });
        if (!gateway)
            throw (0, error_1.createError)({ statusCode: 404, message: "Stripe gateway not found" });
        const { fixedFee, percentageFee } = gateway;
        ctx === null || ctx === void 0 ? void 0 : ctx.step("Calculating fees");
        const fee = (totalAmount * (percentageFee || 0)) / 100 + (fixedFee || 0);
        const depositAmount = totalAmount - fee;
        // 5. Find or create user wallet
        ctx === null || ctx === void 0 ? void 0 : ctx.step("Finding or creating wallet");
        const walletCreationResult = await wallet_1.walletCreationService.getOrCreateWallet(user.id, "FIAT", currency);
        const wallet = walletCreationResult.wallet;
        // Get currency data for precision
        ctx === null || ctx === void 0 ? void 0 : ctx.step("Validating currency");
        const currencyData = await db_1.models.currency.findOne({
            where: { id: wallet.currency },
        });
        if (!currencyData) {
            ctx === null || ctx === void 0 ? void 0 : ctx.fail("Currency not found");
            throw (0, error_1.createError)({ statusCode: 404, message: "Currency not found" });
        }
        let newBalance = wallet.balance + depositAmount;
        newBalance = parseFloat(newBalance.toFixed(currencyData.precision || 2));
        // 6. Update wallet and record admin profit (use database transaction)
        ctx === null || ctx === void 0 ? void 0 : ctx.step("Starting database transaction");
        const walletResult = await db_1.sequelize.transaction(async (t) => {
            // Update wallet balance via wallet service (this creates the transaction automatically)
            ctx === null || ctx === void 0 ? void 0 : ctx.step("Updating wallet balance via wallet service");
            // Use stable idempotency key for proper retry detection
            const idempotencyKey = `stripe_intent_${intentId}`;
            const result = await wallet_1.walletService.credit({
                idempotencyKey,
                userId: user.id,
                walletId: wallet.id,
                walletType: "FIAT",
                currency,
                amount: depositAmount,
                operationType: "DEPOSIT",
                referenceId: intentId,
                description: `Stripe payment intent deposit of ${depositAmount} ${currency}`,
                metadata: {
                    method: "STRIPE_PAYMENT_INTENT",
                    paymentIntentId: intentId,
                    stripeAmount: totalAmount,
                    fee,
                },
                transaction: t,
            });
            // Record admin profit if there's a fee (use transaction ID from wallet service)
            if (fee > 0) {
                ctx === null || ctx === void 0 ? void 0 : ctx.step("Recording admin profit");
                await db_1.models.adminProfit.create({
                    amount: fee,
                    currency: wallet.currency,
                    type: "DEPOSIT",
                    transactionId: result.transactionId,
                    description: `Admin profit from Stripe payment intent fee of ${fee} ${currency} for user (${user.id})`,
                }, { transaction: t });
            }
            return result;
        });
        // 7. Send email notification
        ctx === null || ctx === void 0 ? void 0 : ctx.step("Fetching user account");
        const userPk = await db_1.models.user.findByPk(user.id);
        // Get the transaction record for email
        const transaction = await db_1.models.transaction.findByPk(walletResult.transactionId);
        try {
            ctx === null || ctx === void 0 ? void 0 : ctx.step("Sending notification email");
            await (0, emails_1.sendFiatTransactionEmail)(userPk, transaction, currency, newBalance);
        }
        catch (error) {
            console_1.logger.error("STRIPE", "Error sending email", error);
        }
        return {
            transaction,
            balance: newBalance,
            currency,
            method: "Stripe Payment Intent",
            status: "succeeded"
        };
    }
    catch (error) {
        throw (0, error_1.createError)({ statusCode: 500, message: `Error verifying payment intent: ${error.message}` });
    }
};
