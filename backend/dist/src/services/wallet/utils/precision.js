"use strict";
/**
 * Precision Utilities
 * Safe arithmetic operations to prevent floating-point errors
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.roundToPrecision = roundToPrecision;
exports.validatePrecision = validatePrecision;
exports.safeAdd = safeAdd;
exports.safeSubtract = safeSubtract;
exports.safeMultiply = safeMultiply;
exports.safeDivide = safeDivide;
exports.safeEquals = safeEquals;
exports.safeGreaterThan = safeGreaterThan;
exports.safeGreaterThanOrEqual = safeGreaterThanOrEqual;
exports.safeLessThan = safeLessThan;
exports.safeLessThanOrEqual = safeLessThanOrEqual;
exports.toSmallestUnit = toSmallestUnit;
exports.fromSmallestUnit = fromSmallestUnit;
exports.formatWithPrecision = formatWithPrecision;
exports.parseWithPrecision = parseWithPrecision;
exports.calculatePercentage = calculatePercentage;
exports.calculateFee = calculateFee;
exports.calculateAmountAfterFee = calculateAmountAfterFee;
exports.clamp = clamp;
exports.ensureNonNegative = ensureNonNegative;
exports.safeSum = safeSum;
const error_1 = require("@b/utils/error");
const constants_1 = require("../constants");
/**
 * Round a value to the appropriate precision for a currency
 */
function roundToPrecision(value, currency) {
    const precision = (0, constants_1.getPrecision)(currency);
    const multiplier = Math.pow(10, precision);
    return Math.round(value * multiplier) / multiplier;
}
/**
 * Validate that a value doesn't exceed the allowed precision
 */
function validatePrecision(value, currency) {
    const precision = (0, constants_1.getPrecision)(currency);
    const multiplier = Math.pow(10, precision);
    const rounded = Math.round(value * multiplier);
    return Math.abs(value * multiplier - rounded) < 0.0000001;
}
/**
 * Safely add two numbers with precision handling
 * Converts to integers to avoid floating-point errors
 */
function safeAdd(a, b, currency) {
    const precision = (0, constants_1.getPrecision)(currency);
    const multiplier = Math.pow(10, precision);
    const aInt = Math.round(a * multiplier);
    const bInt = Math.round(b * multiplier);
    return (aInt + bInt) / multiplier;
}
/**
 * Safely subtract two numbers with precision handling
 * Converts to integers to avoid floating-point errors
 */
function safeSubtract(a, b, currency) {
    const precision = (0, constants_1.getPrecision)(currency);
    const multiplier = Math.pow(10, precision);
    const aInt = Math.round(a * multiplier);
    const bInt = Math.round(b * multiplier);
    return (aInt - bInt) / multiplier;
}
/**
 * Safely multiply two numbers with precision handling
 */
function safeMultiply(a, b, currency) {
    const precision = (0, constants_1.getPrecision)(currency);
    const multiplier = Math.pow(10, precision);
    return Math.round(a * b * multiplier) / multiplier;
}
/**
 * Safely divide two numbers with precision handling
 */
function safeDivide(a, b, currency) {
    if (b === 0) {
        throw (0, error_1.createError)({ statusCode: 400, message: "Division by zero" });
    }
    const precision = (0, constants_1.getPrecision)(currency);
    const multiplier = Math.pow(10, precision);
    return Math.round((a / b) * multiplier) / multiplier;
}
/**
 * Compare two numbers for equality with tolerance
 */
function safeEquals(a, b, tolerance = 0.00000001) {
    return Math.abs(a - b) < tolerance;
}
/**
 * Check if a number is greater than another with tolerance
 */
function safeGreaterThan(a, b, tolerance = 0.00000001) {
    return a - b > tolerance;
}
/**
 * Check if a number is greater than or equal to another with tolerance
 */
function safeGreaterThanOrEqual(a, b, tolerance = 0.00000001) {
    return a - b >= -tolerance;
}
/**
 * Check if a number is less than another with tolerance
 */
function safeLessThan(a, b, tolerance = 0.00000001) {
    return b - a > tolerance;
}
/**
 * Check if a number is less than or equal to another with tolerance
 */
function safeLessThanOrEqual(a, b, tolerance = 0.00000001) {
    return b - a >= -tolerance;
}
/**
 * Convert a number to its integer representation based on precision
 */
function toSmallestUnit(amount, currency) {
    const precision = (0, constants_1.getPrecision)(currency);
    const multiplier = Math.pow(10, precision);
    return BigInt(Math.round(amount * multiplier));
}
/**
 * Convert from smallest unit back to decimal
 */
function fromSmallestUnit(amount, currency) {
    const precision = (0, constants_1.getPrecision)(currency);
    const multiplier = Math.pow(10, precision);
    return Number(amount) / multiplier;
}
/**
 * Format a number to a string with proper precision
 */
function formatWithPrecision(value, currency) {
    const precision = (0, constants_1.getPrecision)(currency);
    return value.toFixed(precision);
}
/**
 * Parse a string value to number with precision validation
 */
function parseWithPrecision(value, currency) {
    const parsed = parseFloat(value);
    if (isNaN(parsed)) {
        throw (0, error_1.createError)({ statusCode: 400, message: `Invalid number: ${value}` });
    }
    return roundToPrecision(parsed, currency);
}
/**
 * Calculate percentage of an amount
 */
function calculatePercentage(amount, percentage, currency) {
    return safeMultiply(amount, percentage / 100, currency);
}
/**
 * Calculate fee amount
 */
function calculateFee(amount, feePercentage, currency) {
    return calculatePercentage(amount, feePercentage, currency);
}
/**
 * Calculate amount after fee deduction
 */
function calculateAmountAfterFee(amount, feePercentage, currency) {
    const feeAmount = calculateFee(amount, feePercentage, currency);
    const netAmount = safeSubtract(amount, feeAmount, currency);
    return { netAmount, feeAmount };
}
/**
 * Clamp a value between min and max
 */
function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
}
/**
 * Ensure value is non-negative
 */
function ensureNonNegative(value) {
    return Math.max(0, value);
}
/**
 * Sum an array of numbers safely
 */
function safeSum(values, currency) {
    return values.reduce((acc, val) => safeAdd(acc, val, currency), 0);
}
