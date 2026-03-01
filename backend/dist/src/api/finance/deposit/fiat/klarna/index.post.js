"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.metadata = void 0;
const query_1 = require("@b/utils/query");
const error_1 = require("@b/utils/error");
const utils_1 = require("./utils");
const db_1 = require("@b/db");
const publicUrl = process.env.NEXT_PUBLIC_SITE_URL;
const isProduction = process.env.NODE_ENV === "production";
exports.metadata = {
    summary: "Creates a Klarna payment session",
    description: "Initiates a Klarna payment process by creating a payment session with Buy Now, Pay Later options. Supports multiple payment methods including Pay Now, Pay Later, and Pay in Installments.",
    operationId: "createKlarnaPayment",
    tags: ["Finance", "Deposit"],
    logModule: "KLARNA_DEPOSIT",
    logTitle: "Create Klarna payment session",
    requestBody: {
        description: "Payment information for Klarna session",
        content: {
            "application/json": {
                schema: {
                    type: "object",
                    properties: {
                        amount: {
                            type: "number",
                            description: "Payment amount in base currency units",
                        },
                        currency: {
                            type: "string",
                            description: "Currency code (e.g., USD, EUR, GBP)",
                        },
                        country: {
                            type: "string",
                            description: "Purchase country code (e.g., US, GB, DE)",
                            nullable: true,
                        },
                        payment_method: {
                            type: "string",
                            description: "Preferred Klarna payment method",
                            enum: ["pay_now", "pay_later", "pay_over_time"],
                            nullable: true,
                        },
                        customer: {
                            type: "object",
                            description: "Customer information",
                            properties: {
                                email: { type: "string", format: "email" },
                                phone: { type: "string" },
                                given_name: { type: "string" },
                                family_name: { type: "string" },
                                date_of_birth: { type: "string", format: "date" },
                            },
                            nullable: true,
                        },
                        billing_address: {
                            type: "object",
                            description: "Billing address information",
                            properties: {
                                given_name: { type: "string" },
                                family_name: { type: "string" },
                                email: { type: "string", format: "email" },
                                phone: { type: "string" },
                                street_address: { type: "string" },
                                postal_code: { type: "string" },
                                city: { type: "string" },
                                region: { type: "string" },
                                country: { type: "string" },
                            },
                            nullable: true,
                        },
                    },
                    required: ["amount", "currency"],
                },
            },
        },
    },
    responses: {
        200: {
            description: "Klarna payment session created successfully. Returns session details and client token for frontend integration.",
            content: {
                "application/json": {
                    schema: {
                        type: "object",
                        properties: {
                            session_id: {
                                type: "string",
                                description: "Klarna session ID",
                            },
                            client_token: {
                                type: "string",
                                description: "Client token for Klarna SDK",
                            },
                            payment_method_categories: {
                                type: "array",
                                description: "Available payment methods",
                                items: {
                                    type: "object",
                                    properties: {
                                        identifier: { type: "string" },
                                        name: { type: "string" },
                                        asset_urls: {
                                            type: "object",
                                            properties: {
                                                descriptive: { type: "string" },
                                                standard: { type: "string" },
                                            },
                                        },
                                    },
                                },
                            },
                            purchase_country: {
                                type: "string",
                                description: "Purchase country code",
                            },
                            purchase_currency: {
                                type: "string",
                                description: "Purchase currency code",
                            },
                            order_amount: {
                                type: "number",
                                description: "Total order amount in minor units",
                            },
                            reference: {
                                type: "string",
                                description: "Merchant reference for this payment",
                            },
                        },
                    },
                },
            },
        },
        400: {
            description: "Invalid request parameters",
            content: {
                "application/json": {
                    schema: {
                        type: "object",
                        properties: {
                            error: { type: "string" },
                            details: { type: "object" },
                        },
                    },
                },
            },
        },
        401: query_1.unauthorizedResponse,
        404: (0, query_1.notFoundMetadataResponse)("Klarna"),
        500: query_1.serverErrorResponse,
    },
    requiresAuth: true,
};
exports.default = async (data) => {
    var _a;
    const { user, body, ctx } = data;
    if (!user)
        throw (0, error_1.createError)({ statusCode: 401, message: "User not authenticated" });
    const { amount, currency, country, payment_method, customer, billing_address } = body;
    // Validate amount
    if (!amount || amount <= 0) {
        throw (0, error_1.createError)({ statusCode: 400, message: "Amount must be greater than 0" });
    }
    // Validate currency
    if (!(0, utils_1.validateCurrency)(currency)) {
        throw (0, error_1.createError)({ statusCode: 400, message: `Currency ${currency} is not supported by Klarna` });
    }
    // Check if Klarna gateway is available
    ctx === null || ctx === void 0 ? void 0 : ctx.step("Fetching payment gateway configuration");
    const gateway = await db_1.models.depositGateway.findOne({
        where: { alias: "klarna", status: true },
    });
    if (!gateway) {
        ctx === null || ctx === void 0 ? void 0 : ctx.fail("Payment gateway not found");
        throw (0, error_1.createError)({ statusCode: 404, message: "Klarna gateway not found or disabled" });
    }
    if (!((_a = gateway.currencies) === null || _a === void 0 ? void 0 : _a.includes(currency))) {
        throw (0, error_1.createError)({ statusCode: 400, message: `Currency ${currency} is not supported by Klarna gateway` });
    }
    // Determine purchase country based on currency if not provided
    let purchaseCountry = country;
    if (!purchaseCountry) {
        // Find country that supports this currency
        for (const [countryCode, currencies] of Object.entries(utils_1.KLARNA_COUNTRY_CURRENCY_MAP)) {
            if (currencies.includes(currency)) {
                purchaseCountry = countryCode;
                break;
            }
        }
    }
    if (!purchaseCountry) {
        throw (0, error_1.createError)({ statusCode: 400, message: `No supported country found for currency ${currency}` });
    }
    // Validate country-currency combination
    const supportedCurrencies = utils_1.KLARNA_COUNTRY_CURRENCY_MAP[purchaseCountry];
    if (!supportedCurrencies || !supportedCurrencies.includes(currency)) {
        throw (0, error_1.createError)({ statusCode: 400, message: `Currency ${currency} is not supported in country ${purchaseCountry}` });
    }
    // Get locale for the country
    const locale = utils_1.KLARNA_LOCALE_MAP[purchaseCountry] || "en-US";
    // Calculate fees
    const { fixedFee, percentageFee } = gateway;
    const feeAmount = (amount * (percentageFee || 0)) / 100 + (fixedFee || 0);
    const totalAmount = amount + feeAmount;
    // Convert amounts to Klarna format (minor units)
    const orderAmount = (0, utils_1.convertToKlarnaAmount)(totalAmount);
    ctx === null || ctx === void 0 ? void 0 : ctx.step("Calculating fees");
    const taxAmount = (0, utils_1.convertToKlarnaAmount)(feeAmount);
    // Generate unique reference
    const merchantReference = (0, utils_1.generateKlarnaReference)();
    // Create order lines
    const orderLines = [
        {
            type: "physical",
            reference: "deposit",
            name: "Account Deposit",
            quantity: 1,
            unit_price: (0, utils_1.convertToKlarnaAmount)(amount),
            tax_rate: 0,
            total_amount: (0, utils_1.convertToKlarnaAmount)(amount),
            total_tax_amount: 0,
        },
    ];
    // Add fee as separate line item if applicable
    if (feeAmount > 0) {
        orderLines.push({
            type: "fee",
            reference: "processing_fee",
            name: "Processing Fee",
            quantity: 1,
            unit_price: (0, utils_1.convertToKlarnaAmount)(feeAmount),
            tax_rate: 0,
            total_amount: (0, utils_1.convertToKlarnaAmount)(feeAmount),
            total_tax_amount: 0,
        });
    }
    // Configure merchant URLs
    const baseUrl = `${publicUrl}${isProduction ? "" : ":3000"}`;
    const merchantUrls = {
        terms: `${baseUrl}/terms`,
        confirmation: `${baseUrl}/api/finance/deposit/fiat/klarna/verify?session_id={checkout.order.id}`,
        push: `${baseUrl}/api/finance/deposit/fiat/klarna/webhook`,
        authorization: `${baseUrl}/api/finance/deposit/fiat/klarna/authorize`,
    };
    // Prepare payment session data
    const sessionData = {
        purchase_country: purchaseCountry,
        purchase_currency: currency,
        locale,
        order_amount: orderAmount,
        order_tax_amount: taxAmount,
        order_lines: orderLines,
        merchant_urls: merchantUrls,
        merchant_reference1: merchantReference,
        merchant_reference2: user.id,
        options: {
            allow_separate_shipping_address: false,
            date_of_birth_mandatory: false,
            title_mandatory: false,
            phone_mandatory: false,
            show_subtotal_detail: true,
            allowed_customer_types: ["person"],
            purchase_type: "buy",
        },
    };
    // Add customer information if provided
    if (customer || user.email) {
        sessionData.customer = {
            type: "person",
            ...customer,
        };
        // Add billing address
        sessionData.billing_address = {
            given_name: (customer === null || customer === void 0 ? void 0 : customer.given_name) || user.firstName || "",
            family_name: (customer === null || customer === void 0 ? void 0 : customer.family_name) || user.lastName || "",
            email: (customer === null || customer === void 0 ? void 0 : customer.email) || user.email,
            country: purchaseCountry,
            ...billing_address,
        };
    }
    try {
        // Create payment session with Klarna
        const response = await (0, utils_1.makeKlarnaRequest)("/payments/v1/sessions", "POST", sessionData);
        // Store transaction record for tracking
        await db_1.models.transaction.create({
            userId: user.id,
            type: "DEPOSIT",
            amount: totalAmount,
            fee: feeAmount,
            referenceId: response.session_id,
            status: "PENDING",
            metadata: JSON.stringify({
                method: "KLARNA",
                session_id: response.session_id,
                merchant_reference: merchantReference,
                purchase_country: purchaseCountry,
                purchase_currency: currency,
                payment_method: payment_method || "auto",
                klarna_reference: response.klarna_reference,
            }),
            description: `Klarna deposit of ${amount} ${currency} initiated by ${user.firstName} ${user.lastName}`,
        });
        return {
            session_id: response.session_id,
            client_token: response.client_token,
            payment_method_categories: response.payment_method_categories,
            purchase_country: purchaseCountry,
            purchase_currency: currency,
            order_amount: orderAmount,
            reference: merchantReference,
            html_snippet: response.html_snippet, // For embedded checkout
        };
    }
    catch (error) {
        if (error instanceof utils_1.KlarnaError) {
            throw (0, error_1.createError)({ statusCode: 500, message: `Klarna payment session creation failed: ${error.message}` });
        }
        throw (0, error_1.createError)({ statusCode: 500, message: `Failed to create Klarna payment session: ${error.message}` });
    }
};
