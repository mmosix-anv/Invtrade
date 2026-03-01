"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.metadata = void 0;
const db_1 = require("@b/db");
const error_1 = require("@b/utils/error");
const gateway_1 = require("@b/utils/gateway");
const utils_1 = require("@b/api/finance/currency/utils");
const console_1 = require("@b/utils/console");
const wallet_1 = require("@b/services/wallet");
exports.metadata = {
    summary: "Confirm payment",
    description: "Confirms the payment and processes the transaction from customer wallet(s). Always uses allocation-based payments.",
    operationId: "confirmPayment",
    tags: ["Gateway", "Checkout"],
    parameters: [
        {
            name: "paymentIntentId",
            in: "path",
            required: true,
            description: "Payment intent ID",
            schema: { type: "string" },
        },
    ],
    requestBody: {
        required: true,
        content: {
            "application/json": {
                schema: {
                    type: "array",
                    description: "Payment allocations - which wallets to use and how much from each",
                    items: {
                        type: "object",
                        properties: {
                            walletId: { type: "string" },
                            walletType: { type: "string" },
                            currency: { type: "string" },
                            amount: { type: "number" },
                            equivalentInPaymentCurrency: { type: "number" },
                        },
                        required: ["walletId", "walletType", "currency", "amount", "equivalentInPaymentCurrency"],
                    },
                },
            },
        },
    },
    responses: {
        200: {
            description: "Payment confirmed successfully",
        },
        400: {
            description: "Payment cannot be confirmed",
        },
        401: {
            description: "Authentication required",
        },
        402: {
            description: "Insufficient funds",
        },
    },
    requiresAuth: true,
    logModule: "GATEWAY",
    logTitle: "Confirm Checkout Payment",
};
async function getPriceInUSD(currency, type) {
    try {
        if (type === "FIAT") {
            return await (0, utils_1.getFiatPriceInUSD)(currency);
        }
        else if (type === "SPOT") {
            return await (0, utils_1.getSpotPriceInUSD)(currency);
        }
        else if (type === "ECO") {
            return await (0, utils_1.getEcoPriceInUSD)(currency);
        }
        return 0;
    }
    catch (_a) {
        return 0;
    }
}
// Round to 8 decimal places (max for crypto)
function roundAmount(amount) {
    return Math.round(amount * 1e8) / 1e8;
}
exports.default = async (data) => {
    var _a, _b;
    const { params, user, body, headers, ctx } = data;
    const { paymentIntentId } = params;
    ctx === null || ctx === void 0 ? void 0 : ctx.step("Validate user authentication");
    if (!(user === null || user === void 0 ? void 0 : user.id)) {
        ctx === null || ctx === void 0 ? void 0 : ctx.fail("Authentication required - no user ID");
        throw (0, error_1.createError)({
            statusCode: 401,
            message: "Authentication required",
        });
    }
    ctx === null || ctx === void 0 ? void 0 : ctx.step("Find payment session");
    // Find payment with merchant info
    const payment = await db_1.models.gatewayPayment.findOne({
        where: {
            paymentIntentId,
        },
        include: [
            {
                model: db_1.models.gatewayMerchant,
                as: "merchant",
            },
        ],
    });
    if (!payment) {
        ctx === null || ctx === void 0 ? void 0 : ctx.fail("Payment not found");
        throw (0, error_1.createError)({
            statusCode: 404,
            message: "Payment not found",
        });
    }
    ctx === null || ctx === void 0 ? void 0 : ctx.step("Verify payment authorization and status");
    // SECURITY: Verify user is authorized to complete this payment
    if (payment.customerId && payment.customerId !== user.id) {
        ctx === null || ctx === void 0 ? void 0 : ctx.fail("Not authorized to confirm this payment");
        throw (0, error_1.createError)({
            statusCode: 403,
            message: "Not authorized to confirm this payment",
        });
    }
    // Check if payment is still pending
    if (payment.status !== "PENDING" && payment.status !== "PROCESSING") {
        ctx === null || ctx === void 0 ? void 0 : ctx.fail(`Payment is already ${payment.status.toLowerCase()}`);
        throw (0, error_1.createError)({
            statusCode: 400,
            message: `Payment is already ${payment.status.toLowerCase()}`,
        });
    }
    // Check if expired
    if (new Date(payment.expiresAt) < new Date()) {
        await payment.update({ status: "EXPIRED" });
        throw (0, error_1.createError)({
            statusCode: 400,
            message: "Payment session has expired",
        });
    }
    // Check merchant status
    if (((_a = payment.merchant) === null || _a === void 0 ? void 0 : _a.status) !== "ACTIVE") {
        ctx === null || ctx === void 0 ? void 0 : ctx.fail("Merchant is not active");
        throw (0, error_1.createError)({
            statusCode: 400,
            message: "Merchant is not active",
        });
    }
    ctx === null || ctx === void 0 ? void 0 : ctx.step("Validate payment allocations");
    // Get gateway settings
    const gatewaySettings = await (0, gateway_1.getGatewaySettings)();
    const allowedWalletTypes = gatewaySettings.gatewayAllowedWalletTypes || {};
    // Body is the allocations array directly
    const allocations = Array.isArray(body) ? body : [];
    if (allocations.length === 0) {
        ctx === null || ctx === void 0 ? void 0 : ctx.fail("No payment allocations provided");
        throw (0, error_1.createError)({
            statusCode: 400,
            message: "No payment allocations provided",
        });
    }
    // Validate allocations input
    for (const allocation of allocations) {
        // Validate amount is a positive finite number
        if (!Number.isFinite(allocation.amount) || allocation.amount <= 0) {
            throw (0, error_1.createError)({
                statusCode: 400,
                message: "Invalid allocation amount: must be a positive number",
            });
        }
        // Validate equivalent amount
        if (!Number.isFinite(allocation.equivalentInPaymentCurrency) || allocation.equivalentInPaymentCurrency <= 0) {
            throw (0, error_1.createError)({
                statusCode: 400,
                message: "Invalid equivalent amount",
            });
        }
    }
    // Check if this is a test mode payment
    const isTestMode = payment.testMode === true;
    ctx === null || ctx === void 0 ? void 0 : ctx.step("Process payment in database transaction");
    try {
        // Process payment in transaction
        const result = await db_1.sequelize.transaction(async (t) => {
            var _a;
            // SECURITY: Lock and update status inside transaction to prevent race conditions
            const lockedPayment = await db_1.models.gatewayPayment.findByPk(payment.id, {
                transaction: t,
                lock: t.LOCK.UPDATE,
            });
            if (!lockedPayment || (lockedPayment.status !== "PENDING" && lockedPayment.status !== "PROCESSING")) {
                throw (0, error_1.createError)({
                    statusCode: 400,
                    message: "Payment is no longer available for processing",
                });
            }
            // Mark as processing inside transaction
            await lockedPayment.update({ status: "PROCESSING" }, { transaction: t });
            const transactionRecords = [];
            let totalPaid = 0;
            // Get payment currency price for validation
            const paymentPriceInUSD = await getPriceInUSD(payment.currency, payment.walletType);
            if (!paymentPriceInUSD || paymentPriceInUSD <= 0) {
                throw (0, error_1.createError)({
                    statusCode: 400,
                    message: `Could not determine price for payment currency ${payment.currency}`,
                });
            }
            // Process each allocation
            for (const allocation of allocations) {
                // Round amount to 8 decimal places
                const roundedAmount = roundAmount(allocation.amount);
                // Validate wallet type is allowed
                const walletConfig = allowedWalletTypes[allocation.walletType];
                if (!walletConfig || !walletConfig.enabled) {
                    throw (0, error_1.createError)({
                        statusCode: 400,
                        message: `Wallet type ${allocation.walletType} is not enabled for payments`,
                    });
                }
                // Validate currency is allowed for this wallet type
                if (!walletConfig.currencies || !walletConfig.currencies.includes(allocation.currency)) {
                    throw (0, error_1.createError)({
                        statusCode: 400,
                        message: `Currency ${allocation.currency} is not enabled for ${allocation.walletType} wallet payments`,
                    });
                }
                // Find and lock the wallet
                const wallet = await db_1.models.wallet.findOne({
                    where: {
                        id: allocation.walletId,
                        userId: user.id,
                        currency: allocation.currency,
                        type: allocation.walletType,
                    },
                    transaction: t,
                    lock: t.LOCK.UPDATE,
                });
                if (!wallet) {
                    throw (0, error_1.createError)({
                        statusCode: 400,
                        message: `Wallet not found: ${allocation.walletType} ${allocation.currency}`,
                    });
                }
                // Check balance
                const currentBalance = parseFloat(wallet.balance);
                if (currentBalance < roundedAmount) {
                    throw (0, error_1.createError)({
                        statusCode: 402,
                        message: `Insufficient funds in ${allocation.currency} wallet. Required: ${roundedAmount}, Available: ${currentBalance}`,
                    });
                }
                // Verify exchange rate (with 2% tolerance for rate fluctuations)
                const walletPriceInUSD = await getPriceInUSD(allocation.currency, allocation.walletType);
                if (!walletPriceInUSD || walletPriceInUSD <= 0) {
                    throw (0, error_1.createError)({
                        statusCode: 400,
                        message: `Could not determine price for ${allocation.currency}`,
                    });
                }
                const expectedExchangeRate = walletPriceInUSD / paymentPriceInUSD;
                const expectedEquivalent = roundedAmount * expectedExchangeRate;
                const tolerance = 0.02; // 2% tolerance
                if (Math.abs(allocation.equivalentInPaymentCurrency - expectedEquivalent) / expectedEquivalent > tolerance) {
                    throw (0, error_1.createError)({
                        statusCode: 400,
                        message: `Exchange rate has changed for ${allocation.currency}. Please refresh and try again.`,
                    });
                }
                // Only debit wallet and create transaction in LIVE mode
                if (!isTestMode) {
                    // Use wallet service for atomic, audited debit
                    const idempotencyKey = `gateway_payment_${payment.paymentIntentId}_${allocation.walletId}_${transactionRecords.length}`;
                    const debitResult = await wallet_1.walletService.debit({
                        idempotencyKey,
                        userId: user.id,
                        walletId: wallet.id,
                        walletType: allocation.walletType,
                        currency: allocation.currency,
                        amount: roundedAmount,
                        operationType: "PAYMENT",
                        referenceId: `${payment.id}_${transactionRecords.length}`,
                        description: `Payment to ${payment.merchant.name}${payment.description ? ` - ${payment.description}` : ""} (${allocation.equivalentInPaymentCurrency.toFixed(2)} ${payment.currency})`,
                        metadata: {
                            paymentIntentId: payment.paymentIntentId,
                            merchantId: payment.merchant.id,
                            merchantName: payment.merchant.name,
                            merchantOrderId: payment.merchantOrderId,
                            equivalentAmount: allocation.equivalentInPaymentCurrency,
                            paymentCurrency: payment.currency,
                            exchangeRate: expectedExchangeRate,
                        },
                        transaction: t,
                    });
                    transactionRecords.push({ id: debitResult.transactionId });
                }
                totalPaid += allocation.equivalentInPaymentCurrency;
            }
            // Verify total paid covers payment amount (with small tolerance for rounding)
            const tolerance = 0.01; // $0.01 tolerance
            if (totalPaid < payment.amount - tolerance) {
                throw (0, error_1.createError)({
                    statusCode: 402,
                    message: `Insufficient payment. Required: ${payment.amount} ${payment.currency}, Allocated: ${totalPaid.toFixed(2)} ${payment.currency}`,
                });
            }
            // Credit merchant balance and collect fees
            // Note: We credit gatewayMerchantBalance.pending (NOT wallet.inOrder)
            // because wallet.inOrder is shared with trading/orders
            if (!isTestMode) {
                // Calculate fee percentage from original payment amount
                const feePercentage = payment.feeAmount / payment.amount;
                // Process each allocation - credit merchant balance and collect fee in same currency
                for (let i = 0; i < allocations.length; i++) {
                    const allocation = allocations[i];
                    const roundedAmount = roundAmount(allocation.amount);
                    // Calculate proportional fee for this allocation (in allocation currency)
                    const allocationFee = roundAmount(roundedAmount * feePercentage);
                    // Collect fee to super admin in same currency as allocation
                    if (allocationFee > 0) {
                        await (0, gateway_1.collectGatewayFee)({
                            currency: allocation.currency,
                            walletType: allocation.walletType,
                            feeAmount: allocationFee,
                            merchantId: payment.merchant.id,
                            paymentId: payment.id,
                            transaction: t,
                        });
                    }
                    // Credit merchant's gateway balance (pending) for this currency
                    // This is the source of truth for gateway funds - NOT wallet.inOrder
                    await (0, gateway_1.updateMerchantBalanceForPayment)({
                        merchantId: payment.merchantId,
                        currency: allocation.currency,
                        walletType: allocation.walletType,
                        amount: roundedAmount,
                        feeAmount: allocationFee,
                        transaction: t,
                    });
                }
            }
            // Update payment status
            const completedAt = new Date();
            await payment.update({
                status: "COMPLETED",
                customerId: user.id,
                transactionId: ((_a = transactionRecords[0]) === null || _a === void 0 ? void 0 : _a.id) || null,
                completedAt,
                ipAddress: (headers === null || headers === void 0 ? void 0 : headers["x-forwarded-for"]) || (headers === null || headers === void 0 ? void 0 : headers["x-real-ip"]),
                userAgent: headers === null || headers === void 0 ? void 0 : headers["user-agent"],
                customerEmail: user.email,
                customerName: `${user.firstName || ""} ${user.lastName || ""}`.trim() || null,
                allocations,
                metadata: {
                    ...payment.metadata,
                    isTestMode,
                    transactionIds: isTestMode ? "[]" : JSON.stringify(transactionRecords.map((t) => t.id)),
                },
            }, { transaction: t });
            return { transactionRecords, completedAt };
        });
        ctx === null || ctx === void 0 ? void 0 : ctx.step("Send payment completion webhook");
        // Send webhook
        if (payment.webhookUrl) {
            try {
                await (0, gateway_1.sendWebhook)(payment.merchant.id, payment.id, null, "payment.completed", payment.webhookUrl, {
                    id: `evt_${payment.paymentIntentId}`,
                    type: "payment.completed",
                    createdAt: new Date().toISOString(),
                    data: {
                        id: payment.paymentIntentId,
                        merchantOrderId: payment.merchantOrderId,
                        amount: payment.amount,
                        currency: payment.currency,
                        feeAmount: payment.feeAmount,
                        netAmount: payment.netAmount,
                        status: "COMPLETED",
                        customerEmail: user.email,
                        metadata: payment.metadata,
                        completedAt: result.completedAt.toISOString(),
                        allocations,
                    },
                }, payment.merchant.webhookSecret);
            }
            catch (error) {
                console_1.logger.error("GATEWAY_CHECKOUT", "Failed to send payment.completed webhook", error);
            }
        }
        ctx === null || ctx === void 0 ? void 0 : ctx.step("Build success redirect URL");
        // Build redirect URL with parameters
        const returnUrl = new URL(payment.returnUrl);
        returnUrl.searchParams.set("payment_id", payment.paymentIntentId);
        returnUrl.searchParams.set("status", "success");
        ctx === null || ctx === void 0 ? void 0 : ctx.success("Payment confirmed successfully");
        return {
            success: true,
            paymentId: payment.paymentIntentId,
            status: "COMPLETED",
            redirectUrl: returnUrl.toString(),
        };
    }
    catch (error) {
        // Log full error for debugging
        console_1.logger.error("GATEWAY_CHECKOUT", "Payment confirmation failed", error);
        if (error.errors) {
            console_1.logger.debug("GATEWAY_CHECKOUT", `Validation errors: ${JSON.stringify(error.errors, null, 2)}`);
        }
        // If error, revert to pending status
        if (payment.status === "PROCESSING") {
            await payment.update({ status: "PENDING" });
        }
        // Handle Sequelize validation errors
        if (error.name === "SequelizeValidationError" || error.name === "SequelizeUniqueConstraintError") {
            const messages = ((_b = error.errors) === null || _b === void 0 ? void 0 : _b.map((e) => e.message).join(", ")) || error.message;
            throw (0, error_1.createError)({
                statusCode: 400,
                message: messages,
            });
        }
        // Send failure webhook
        if (payment.webhookUrl && error.statusCode !== 402) {
            try {
                await (0, gateway_1.sendWebhook)(payment.merchant.id, payment.id, null, "payment.failed", payment.webhookUrl, {
                    id: `evt_${payment.paymentIntentId}`,
                    type: "payment.failed",
                    createdAt: new Date().toISOString(),
                    data: {
                        id: payment.paymentIntentId,
                        merchantOrderId: payment.merchantOrderId,
                        amount: payment.amount,
                        currency: payment.currency,
                        status: "FAILED",
                        error: error.message,
                    },
                }, payment.merchant.webhookSecret);
            }
            catch (webhookError) {
                console_1.logger.error("GATEWAY_CHECKOUT", "Failed to send payment.failed webhook", webhookError);
            }
        }
        throw error;
    }
};
