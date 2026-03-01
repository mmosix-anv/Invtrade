"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.PayFastError = exports.PAYFAST_TRANSACTION_TYPES = exports.PAYFAST_STATUS_MAPPING = exports.PAYFAST_PAYMENT_METHODS = exports.PAYFAST_SUPPORTED_CURRENCIES = exports.PAYFAST_CONFIG = void 0;
exports.validatePayFastConfig = validatePayFastConfig;
exports.isCurrencySupported = isCurrencySupported;
exports.getAvailablePaymentMethods = getAvailablePaymentMethods;
exports.formatPayFastAmount = formatPayFastAmount;
exports.parsePayFastAmount = parsePayFastAmount;
exports.mapPayFastStatus = mapPayFastStatus;
exports.generatePayFastReference = generatePayFastReference;
exports.generateSignature = generateSignature;
exports.validateSignature = validateSignature;
exports.getPayFastHost = getPayFastHost;
exports.buildPaymentUrl = buildPaymentUrl;
exports.buildNotifyUrl = buildNotifyUrl;
exports.buildReturnUrl = buildReturnUrl;
exports.buildCancelUrl = buildCancelUrl;
exports.isTestMode = isTestMode;
exports.validateITN = validateITN;
exports.getPaymentMethodDisplayName = getPaymentMethodDisplayName;
exports.validateAmount = validateAmount;
exports.generatePaymentForm = generatePaymentForm;
const error_1 = require("@b/utils/error");
const crypto_1 = __importDefault(require("crypto"));
// PayFast API Configuration
exports.PAYFAST_CONFIG = {
    SANDBOX_HOST: 'sandbox.payfast.co.za',
    LIVE_HOST: 'www.payfast.co.za',
    MERCHANT_ID: process.env.APP_PAYFAST_MERCHANT_ID || '',
    MERCHANT_KEY: process.env.APP_PAYFAST_MERCHANT_KEY || '',
    PASSPHRASE: process.env.APP_PAYFAST_PASSPHRASE || '',
    SANDBOX: process.env.APP_PAYFAST_SANDBOX === 'true',
    NOTIFY_URL: process.env.APP_PAYFAST_NOTIFY_URL || '/api/finance/deposit/fiat/payfast/webhook',
    RETURN_URL: process.env.APP_PAYFAST_RETURN_URL || '/user/wallet/deposit/payfast/verify',
    CANCEL_URL: process.env.APP_PAYFAST_CANCEL_URL || '/user/wallet/deposit/payfast/cancel',
    TIMEOUT: 30000, // 30 seconds
};
// PayFast supported currencies with primary ZAR
exports.PAYFAST_SUPPORTED_CURRENCIES = [
    'ZAR', 'USD', 'EUR', 'GBP', 'AUD', 'CAD', 'CHF', 'SEK', 'NOK', 'DKK',
    'PLN', 'CZK', 'HUF', 'BGN', 'RON', 'HRK', 'ISK', 'JPY', 'CNY', 'HKD',
    'SGD', 'MYR', 'THB', 'PHP', 'IDR', 'VND', 'KRW', 'TWD', 'INR', 'ILS', 'TRY'
];
// PayFast payment methods by currency
exports.PAYFAST_PAYMENT_METHODS = {
    'ZAR': [
        'creditcard', 'instanteft', 'capitecpay', 'applepay', 'samsungpay',
        'snapcan', 'zapper', 'mobicred', 'moretyme', 'mukurupay', 'scode',
        'storecards', 'debitcard', 'masterpass'
    ],
    // International currencies support credit cards and mobile wallets
    'USD': ['creditcard', 'applepay', 'samsungpay'],
    'EUR': ['creditcard', 'applepay', 'samsungpay'],
    'GBP': ['creditcard', 'applepay', 'samsungpay'],
    'AUD': ['creditcard', 'applepay', 'samsungpay'],
    'CAD': ['creditcard', 'applepay', 'samsungpay'],
    'CHF': ['creditcard', 'applepay', 'samsungpay'],
    'SEK': ['creditcard', 'applepay', 'samsungpay'],
    'NOK': ['creditcard', 'applepay', 'samsungpay'],
    'DKK': ['creditcard', 'applepay', 'samsungpay'],
    'PLN': ['creditcard', 'applepay', 'samsungpay'],
    'CZK': ['creditcard', 'applepay', 'samsungpay'],
    'HUF': ['creditcard', 'applepay', 'samsungpay'],
    'BGN': ['creditcard', 'applepay', 'samsungpay'],
    'RON': ['creditcard', 'applepay', 'samsungpay'],
    'HRK': ['creditcard', 'applepay', 'samsungpay'],
    'ISK': ['creditcard', 'applepay', 'samsungpay'],
    'JPY': ['creditcard', 'applepay', 'samsungpay'],
    'CNY': ['creditcard', 'applepay', 'samsungpay'],
    'HKD': ['creditcard', 'applepay', 'samsungpay'],
    'SGD': ['creditcard', 'applepay', 'samsungpay'],
    'MYR': ['creditcard', 'applepay', 'samsungpay'],
    'THB': ['creditcard', 'applepay', 'samsungpay'],
    'PHP': ['creditcard', 'applepay', 'samsungpay'],
    'IDR': ['creditcard', 'applepay', 'samsungpay'],
    'VND': ['creditcard', 'applepay', 'samsungpay'],
    'KRW': ['creditcard', 'applepay', 'samsungpay'],
    'TWD': ['creditcard', 'applepay', 'samsungpay'],
    'INR': ['creditcard', 'applepay', 'samsungpay'],
    'ILS': ['creditcard', 'applepay', 'samsungpay'],
    'TRY': ['creditcard', 'applepay', 'samsungpay']
};
// PayFast status mapping
exports.PAYFAST_STATUS_MAPPING = {
    'COMPLETE': 'COMPLETED',
    'FAILED': 'FAILED',
    'CANCELLED': 'CANCELLED',
    'PENDING': 'PENDING',
};
// PayFast transaction types
exports.PAYFAST_TRANSACTION_TYPES = {
    PAYMENT: 'payment',
    SUBSCRIPTION: 'subscription',
    ADHOC: 'adhoc'
};
// Custom error class for PayFast
class PayFastError extends Error {
    constructor(message, status = 500, type) {
        super(message);
        this.name = 'PayFastError';
        this.status = status;
        this.type = type;
    }
}
exports.PayFastError = PayFastError;
// Validation functions
function validatePayFastConfig() {
    if (!exports.PAYFAST_CONFIG.MERCHANT_ID) {
        throw (0, error_1.createError)(500, 'PayFast merchant ID is not configured');
    }
    if (!exports.PAYFAST_CONFIG.MERCHANT_KEY) {
        throw (0, error_1.createError)(500, 'PayFast merchant key is not configured');
    }
}
function isCurrencySupported(currency) {
    return exports.PAYFAST_SUPPORTED_CURRENCIES.includes(currency.toUpperCase());
}
function getAvailablePaymentMethods(currency) {
    return exports.PAYFAST_PAYMENT_METHODS[currency.toUpperCase()] || [];
}
function formatPayFastAmount(amount) {
    return amount.toFixed(2);
}
function parsePayFastAmount(amountString) {
    return parseFloat(amountString) || 0;
}
function mapPayFastStatus(payFastStatus) {
    return exports.PAYFAST_STATUS_MAPPING[payFastStatus.toUpperCase()] || 'PENDING';
}
function generatePayFastReference() {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 8);
    return `PF_${timestamp}_${random}`.toUpperCase();
}
// PayFast signature generation
function generateSignature(data, passphrase) {
    // Remove signature if present
    const { signature, ...cleanData } = data;
    // Create parameter string
    const paramString = Object.keys(cleanData)
        .filter(key => cleanData[key] !== '' && cleanData[key] !== null && cleanData[key] !== undefined)
        .sort()
        .map(key => `${key}=${encodeURIComponent(cleanData[key]).replace(/%20/g, '+')}`)
        .join('&');
    // Add passphrase if provided
    const stringToHash = passphrase ? `${paramString}&passphrase=${passphrase}` : paramString;
    // Generate MD5 hash
    return crypto_1.default.createHash('md5').update(stringToHash).digest('hex');
}
// Validate PayFast signature
function validateSignature(data, passphrase) {
    const providedSignature = data.signature;
    if (!providedSignature)
        return false;
    const calculatedSignature = generateSignature(data, passphrase);
    return providedSignature.toLowerCase() === calculatedSignature.toLowerCase();
}
// Build PayFast URLs
function getPayFastHost() {
    return exports.PAYFAST_CONFIG.SANDBOX ? exports.PAYFAST_CONFIG.SANDBOX_HOST : exports.PAYFAST_CONFIG.LIVE_HOST;
}
function buildPaymentUrl() {
    return `https://${getPayFastHost()}/eng/process`;
}
function buildNotifyUrl() {
    const baseUrl = process.env.APP_PUBLIC_URL || 'http://localhost:3000';
    return `${baseUrl}${exports.PAYFAST_CONFIG.NOTIFY_URL}`;
}
function buildReturnUrl() {
    const baseUrl = process.env.APP_PUBLIC_URL || 'http://localhost:3000';
    return `${baseUrl}${exports.PAYFAST_CONFIG.RETURN_URL}`;
}
function buildCancelUrl() {
    const baseUrl = process.env.APP_PUBLIC_URL || 'http://localhost:3000';
    return `${baseUrl}${exports.PAYFAST_CONFIG.CANCEL_URL}`;
}
function isTestMode() {
    return exports.PAYFAST_CONFIG.SANDBOX;
}
// PayFast ITN validation via HTTP
async function validateITN(data) {
    try {
        // Build parameter string for validation
        const { signature, ...cleanData } = data;
        const paramString = Object.keys(cleanData)
            .filter(key => cleanData[key] !== '' && cleanData[key] !== null && cleanData[key] !== undefined)
            .sort()
            .map(key => `${key}=${encodeURIComponent(cleanData[key]).replace(/%20/g, '+')}`)
            .join('&');
        // Validate with PayFast
        const response = await fetch(`https://${getPayFastHost()}/eng/query/validate`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded'
            },
            body: paramString
        });
        const result = await response.text();
        if (result === 'VALID') {
            return { valid: true };
        }
        else {
            return { valid: false, error: 'PayFast ITN validation failed' };
        }
    }
    catch (error) {
        return { valid: false, error: `ITN validation error: ${error.message}` };
    }
}
// Get payment method display name
function getPaymentMethodDisplayName(method) {
    const methodNames = {
        'creditcard': 'Credit Card',
        'instanteft': 'Instant EFT',
        'capitecpay': 'Capitec Pay',
        'applepay': 'Apple Pay',
        'samsungpay': 'Samsung Pay',
        'snapcan': 'SnapScan',
        'zapper': 'Zapper',
        'mobicred': 'Mobicred',
        'moretyme': 'MoreTyme',
        'mukurupay': 'MukuruPay',
        'scode': 'SCode',
        'storecards': 'Store Cards',
        'debitcard': 'Debit Card',
        'masterpass': 'Masterpass'
    };
    return methodNames[method] || method;
}
// Utility to check if amount is within PayFast limits
function validateAmount(amount, currency) {
    // PayFast minimum is R1.00 for ZAR, equivalent for other currencies
    const minAmount = currency === 'ZAR' ? 1.00 : 0.50;
    const maxAmount = 100000.00; // PayFast typical maximum
    return amount >= minAmount && amount <= maxAmount;
}
// Generate PayFast payment form HTML
function generatePaymentForm(paymentData) {
    const host = getPayFastHost();
    const formFields = Object.entries(paymentData)
        .map(([key, value]) => `<input type="hidden" name="${key}" value="${value}">`)
        .join('\n    ');
    return `
<form id="payfast-form" action="https://${host}/eng/process" method="post">
    ${formFields}
    <input type="submit" value="Pay with PayFast">
</form>
<script>
    document.getElementById('payfast-form').submit();
</script>
  `.trim();
}
