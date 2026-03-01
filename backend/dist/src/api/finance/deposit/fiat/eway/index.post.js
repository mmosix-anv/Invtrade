"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.metadata = void 0;
const query_1 = require("@b/utils/query");
const error_1 = require("@b/utils/error");
const console_1 = require("@b/utils/console");
const utils_1 = require("./utils");
const db_1 = require("@b/db");
const publicUrl = process.env.NEXT_PUBLIC_SITE_URL;
const isProduction = process.env.NODE_ENV === "production";
exports.metadata = {
    summary: "Creates an eWAY payment",
    description: "Initiates an eWAY payment process for Asia-Pacific region. Supports multiple connection methods including Transparent Redirect, Direct Connection, and Responsive Shared Page.",
    operationId: "createEwayPayment",
    tags: ["Finance", "Payment"],
    logModule: "EWAY_DEPOSIT",
    logTitle: "Create eWAY payment",
    requestBody: {
        description: "eWAY payment creation request",
        content: {
            "application/json": {
                schema: {
                    type: "object",
                    properties: {
                        amount: {
                            type: "number",
                            description: "Payment amount in smallest currency unit",
                            example: 10000,
                        },
                        currency: {
                            type: "string",
                            description: "Currency code (ISO 4217)",
                            example: "AUD",
                        },
                        method: {
                            type: "string",
                            description: "eWAY connection method",
                            enum: ["TransparentRedirect", "ResponsiveSharedPage", "Direct"],
                            default: "TransparentRedirect",
                        },
                        transaction_type: {
                            type: "string",
                            description: "Transaction type",
                            enum: ["Purchase", "MOTO", "Recurring"],
                            default: "Purchase",
                        },
                        customer: {
                            type: "object",
                            description: "Customer information",
                            properties: {
                                first_name: { type: "string" },
                                last_name: { type: "string" },
                                email: { type: "string" },
                                phone: { type: "string" },
                                address: {
                                    type: "object",
                                    properties: {
                                        street1: { type: "string" },
                                        street2: { type: "string" },
                                        city: { type: "string" },
                                        state: { type: "string" },
                                        postal_code: { type: "string" },
                                        country: { type: "string", description: "2-letter country code" },
                                    },
                                },
                            },
                        },
                        invoice_number: {
                            type: "string",
                            description: "Invoice number for reference",
                        },
                        description: {
                            type: "string",
                            description: "Payment description",
                        },
                        return_url: {
                            type: "string",
                            description: "URL to redirect after successful payment",
                        },
                        cancel_url: {
                            type: "string",
                            description: "URL to redirect after cancelled payment",
                        },
                    },
                    required: ["amount", "currency"],
                },
            },
        },
    },
    responses: {
        200: {
            description: "eWAY payment created successfully",
            content: {
                "application/json": {
                    schema: {
                        type: "object",
                        properties: {
                            success: { type: "boolean" },
                            data: {
                                type: "object",
                                properties: {
                                    transaction_id: { type: "string" },
                                    payment_url: { type: "string" },
                                    access_code: { type: "string" },
                                    status: { type: "string" },
                                    gateway: { type: "string" },
                                    amount: { type: "number" },
                                    currency: { type: "string" },
                                    reference: { type: "string" },
                                },
                            },
                        },
                    },
                },
            },
        },
        400: {
            description: "Invalid request parameters",
        },
        401: query_1.unauthorizedResponse,
        404: (0, query_1.notFoundMetadataResponse)("Transaction"),
        500: {
            description: "Internal server error",
            content: {
                "application/json": {
                    schema: {
                        type: "object",
                        properties: {
                            message: {
                                type: "string",
                                description: "Error message",
                            },
                        },
                    },
                },
            },
        },
    },
    requiresAuth: true,
};
exports.default = async (data) => {
    var _a, _b, _c, _d, _e, _f, _g;
    const { user, body, ctx } = data;
    if (!(user === null || user === void 0 ? void 0 : user.id)) {
        ctx === null || ctx === void 0 ? void 0 : ctx.fail("User not authenticated");
        throw (0, error_1.createError)({ statusCode: 401, message: "User not authenticated" });
    }
    try {
        const { amount, currency, method = "TransparentRedirect", transaction_type = "Purchase", customer = {}, invoice_number, description, return_url, cancel_url, } = body;
        // Validate required parameters
        if (!amount || amount <= 0) {
            throw (0, error_1.createError)({ statusCode: 400, message: "Valid amount is required" });
        }
        if (!currency) {
            throw (0, error_1.createError)({ statusCode: 400, message: "Currency is required" });
        }
        if (!(0, utils_1.validateCurrency)(currency)) {
            throw (0, error_1.createError)({ statusCode: 400, message: `Currency ${currency} is not supported by eWAY` });
        }
        // Get user's wallet
        const wallet = await db_1.models.wallet.findOne({
            where: { userId: user.id, currency: currency.toUpperCase() },
        });
        if (!wallet) {
            throw (0, error_1.createError)({ statusCode: 404, message: `Wallet not found for currency ${currency}` });
        }
        // Get eWAY gateway configuration
        ctx === null || ctx === void 0 ? void 0 : ctx.step("Fetching payment gateway configuration");
        const gateway = await db_1.models.depositGateway.findOne({
            where: { alias: "eway", status: true },
        });
        if (!gateway) {
            ctx === null || ctx === void 0 ? void 0 : ctx.fail("Payment gateway not found");
            throw (0, error_1.createError)({ statusCode: 404, message: "eWAY gateway is not available" });
        }
        // Check if currency is supported by the gateway
        if (!gateway.currencies.includes(currency.toUpperCase())) {
            throw (0, error_1.createError)({ statusCode: 400, message: `Currency ${currency} is not supported by eWAY gateway` });
        }
        // Calculate fees (gateway specific fee structure)
        const feePercentage = 0.029; // 2.9% base rate for eWAY
        ctx === null || ctx === void 0 ? void 0 : ctx.step("Calculating fees");
        const fixedFee = currency.toUpperCase() === "AUD" ? 30 : 0; // 30 cents for AUD
        const calculatedFee = Math.round(amount * feePercentage) + fixedFee;
        const totalAmount = amount + calculatedFee;
        // Generate unique reference
        const reference = `EWAY_${Date.now()}_${user.id}`;
        // Create transaction record
        ctx === null || ctx === void 0 ? void 0 : ctx.step("Creating transaction record");
        const transaction = await db_1.models.transaction.create({
            userId: user.id,
            walletId: wallet.id,
            type: "DEPOSIT",
            status: "PENDING",
            amount: amount,
            fee: calculatedFee,
            description: description || "eWAY deposit",
            metadata: JSON.stringify({
                gateway: "eway",
                method: method,
                transaction_type: transaction_type,
                currency: currency.toUpperCase(),
                reference: reference,
                invoice_number: invoice_number,
                customer: customer,
            }),
            referenceId: reference,
        });
        // Prepare eWAY request
        const ewayRequest = {
            Customer: {
                Reference: reference,
                FirstName: customer.first_name || "",
                LastName: customer.last_name || "",
                Email: customer.email || user.email || "",
                Phone: customer.phone || "",
                Street1: ((_a = customer.address) === null || _a === void 0 ? void 0 : _a.street1) || "",
                Street2: ((_b = customer.address) === null || _b === void 0 ? void 0 : _b.street2) || "",
                City: ((_c = customer.address) === null || _c === void 0 ? void 0 : _c.city) || "",
                State: ((_d = customer.address) === null || _d === void 0 ? void 0 : _d.state) || "",
                PostalCode: ((_e = customer.address) === null || _e === void 0 ? void 0 : _e.postal_code) || "",
                Country: ((_g = (_f = customer.address) === null || _f === void 0 ? void 0 : _f.country) === null || _g === void 0 ? void 0 : _g.toLowerCase()) || "au",
            },
            Payment: {
                TotalAmount: totalAmount, // eWAY expects amount in cents
                InvoiceNumber: invoice_number || reference,
                InvoiceDescription: description || "Payment via eWAY",
                InvoiceReference: reference,
                CurrencyCode: currency.toUpperCase(),
            },
            RedirectUrl: return_url || `${publicUrl}/finance/deposit/eway/success?ref=${reference}`,
            CancelUrl: cancel_url || `${publicUrl}/finance/deposit/eway/cancel?ref=${reference}`,
            Method: "ProcessPayment",
            TransactionType: utils_1.EWAY_TRANSACTION_TYPES[transaction_type.toUpperCase()] || "Purchase",
            DeviceID: "v5-platform",
            CustomerIP: "127.0.0.1", // Will be set from request headers if available
        };
        // Add optional fields based on method
        if (method === "ResponsiveSharedPage") {
            // Use Responsive Shared Page endpoint
            const response = await (0, utils_1.makeEwayRequest)("/CreateAccessCode", "POST", ewayRequest);
            if (response.Errors) {
                throw new utils_1.EwayError("eWAY API Error", 400, { errors: response.Errors });
            }
            // Update transaction with eWAY details
            await transaction.update({
                metadata: JSON.stringify({
                    ...transaction.metadata,
                    eway_access_code: response.AccessCode,
                    eway_form_url: response.FormActionURL,
                }),
            });
            return {
                success: true,
                data: {
                    transaction_id: transaction.id,
                    payment_url: response.FormActionURL,
                    access_code: response.AccessCode,
                    status: "PENDING",
                    gateway: "eway",
                    amount: amount,
                    currency: currency.toUpperCase(),
                    reference: reference,
                    method: method,
                },
            };
        }
        else {
            // Use Transparent Redirect (default)
            const response = await (0, utils_1.makeEwayRequest)("/CreateAccessCodeShared", "POST", ewayRequest);
            if (response.Errors) {
                throw new utils_1.EwayError("eWAY API Error", 400, { errors: response.Errors });
            }
            // Update transaction with eWAY details
            await transaction.update({
                metadata: JSON.stringify({
                    ...transaction.metadata,
                    eway_access_code: response.AccessCode,
                    eway_form_url: response.FormActionURL,
                }),
            });
            return {
                success: true,
                data: {
                    transaction_id: transaction.id,
                    payment_url: response.FormActionURL,
                    access_code: response.AccessCode,
                    status: "PENDING",
                    gateway: "eway",
                    amount: amount,
                    currency: currency.toUpperCase(),
                    reference: reference,
                    method: method,
                },
            };
        }
    }
    catch (error) {
        console_1.logger.error("EWAY", "Payment creation error", error);
        if (error instanceof utils_1.EwayError) {
            throw (0, error_1.createError)({ statusCode: 400, message: `eWAY Error: ${error.message}` });
        }
        throw (0, error_1.createError)({ statusCode: 500, message: error.message || "Failed to create eWAY payment" });
    }
};
