"use strict";
/**
 * Safe JSON handling utilities to prevent double-encoding
 * and ensure data integrity for P2P offer configurations
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.safeStringify = safeStringify;
exports.safeParse = safeParse;
exports.prepareJsonFields = prepareJsonFields;
const console_1 = require("@b/utils/console");
const error_1 = require("@b/utils/error");
/**
 * Safely stringifies a value for database storage
 * - If already a string, returns as-is (prevents double-encoding)
 * - If an object, stringifies it once
 * - Validates the result is valid JSON
 *
 * @param value - The value to stringify
 * @param fieldName - Name of the field (for error messages)
 * @returns JSON string ready for database storage
 * @throws Error if the value cannot be safely stringified
 */
function safeStringify(value, fieldName = 'field') {
    // If already a string, validate it's valid JSON and return as-is
    if (typeof value === 'string') {
        try {
            JSON.parse(value); // Validate it's valid JSON
            return value;
        }
        catch (err) {
            throw (0, error_1.createError)({ statusCode: 400, message: `${fieldName} contains invalid JSON string: ${err}` });
        }
    }
    // If it's an object or array, stringify it
    if (typeof value === 'object' && value !== null) {
        try {
            const stringified = JSON.stringify(value);
            // Validate the stringified result
            JSON.parse(stringified);
            return stringified;
        }
        catch (err) {
            throw (0, error_1.createError)({ statusCode: 400, message: `Failed to stringify ${fieldName}: ${err}` });
        }
    }
    throw (0, error_1.createError)({ statusCode: 400, message: `${fieldName} must be an object or valid JSON string` });
}
/**
 * Safely parses a value from database
 * - If already an object, returns as-is
 * - If a string, parses it once
 * - Returns defaultValue if parsing fails
 *
 * @param value - The value to parse
 * @param defaultValue - Default value if parsing fails
 * @returns Parsed object or default value
 */
function safeParse(value, defaultValue) {
    // If already an object, return as-is
    if (typeof value === 'object' && value !== null) {
        return value;
    }
    // If it's a string, try to parse it
    if (typeof value === 'string') {
        try {
            return JSON.parse(value);
        }
        catch (err) {
            console_1.logger.error("P2P_JSON", "JSON parse error", err);
            return defaultValue;
        }
    }
    return defaultValue;
}
/**
 * Prepares JSON fields for database insertion/update
 * Ensures all JSON fields are properly stringified without double-encoding
 *
 * @param data - Object containing JSON fields to prepare
 * @param jsonFields - Array of field names that should be JSON-stringified
 * @returns Object with safely stringified JSON fields
 */
function prepareJsonFields(data, jsonFields) {
    const prepared = { ...data };
    for (const field of jsonFields) {
        if (prepared[field] !== undefined && prepared[field] !== null) {
            try {
                prepared[field] = safeStringify(prepared[field], String(field));
            }
            catch (err) {
                throw (0, error_1.createError)({ statusCode: 400, message: `Failed to prepare ${String(field)}: ${err}` });
            }
        }
    }
    return prepared;
}
