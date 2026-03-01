"use strict";
/**
 * Centralized Error Response Schemas
 *
 * All API error responses should use these reusable schemas for consistency.
 * Import and use these in endpoint metadata.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.baseModelSchema = exports.commonFields = exports.singleItemResponse = exports.paginatedResponse = exports.paginationSchema = exports.statusUpdateResponses = exports.bulkDeleteResponses = exports.createResponses = exports.updateResponses = exports.deleteResponses = exports.successMessageResponse = exports.serviceUnavailableResponse = exports.badGatewayResponse = exports.serverErrorResponse = exports.rateLimitResponse = exports.unprocessableEntityResponse = exports.conflictResponse = exports.notFoundResponse = exports.forbiddenResponse = exports.adminUnauthorizedResponse = exports.unauthorizedResponse = exports.validationErrorResponse = exports.badRequestResponse = void 0;
// Base error response schema
const baseErrorSchema = {
    type: "object",
    properties: {
        message: {
            type: "string",
            description: "Error message describing what went wrong",
        },
    },
    required: ["message"],
};
// Extended error schema with optional fields
const extendedErrorSchema = {
    type: "object",
    properties: {
        message: {
            type: "string",
            description: "Error message describing what went wrong",
        },
        code: {
            type: "string",
            description: "Error code for programmatic handling",
        },
        details: {
            type: "object",
            description: "Additional error details",
            additionalProperties: true,
        },
    },
    required: ["message"],
};
// Validation error schema
const validationErrorSchema = {
    type: "object",
    properties: {
        message: {
            type: "string",
            description: "Validation error message",
        },
        errors: {
            type: "array",
            description: "List of validation errors",
            items: {
                type: "object",
                properties: {
                    field: {
                        type: "string",
                        description: "Field that failed validation",
                    },
                    message: {
                        type: "string",
                        description: "Validation error message for this field",
                    },
                    code: {
                        type: "string",
                        description: "Validation error code",
                    },
                },
                required: ["field", "message"],
            },
        },
    },
    required: ["message"],
};
/**
 * 400 Bad Request - Invalid request parameters or body
 */
exports.badRequestResponse = {
    description: "Bad request - Invalid or missing parameters",
    content: {
        "application/json": {
            schema: baseErrorSchema,
        },
    },
};
/**
 * 400 Validation Error - Detailed validation errors
 */
exports.validationErrorResponse = {
    description: "Validation error - One or more fields failed validation",
    content: {
        "application/json": {
            schema: validationErrorSchema,
        },
    },
};
/**
 * 401 Unauthorized - Missing or invalid authentication
 */
exports.unauthorizedResponse = {
    description: "Unauthorized - Authentication required or invalid credentials",
    content: {
        "application/json": {
            schema: baseErrorSchema,
        },
    },
};
/**
 * 401 Unauthorized - Admin permission required
 */
exports.adminUnauthorizedResponse = {
    description: "Unauthorized - Admin permission required",
    content: {
        "application/json": {
            schema: baseErrorSchema,
        },
    },
};
/**
 * 403 Forbidden - Insufficient permissions
 */
exports.forbiddenResponse = {
    description: "Forbidden - Insufficient permissions to perform this action",
    content: {
        "application/json": {
            schema: baseErrorSchema,
        },
    },
};
/**
 * 404 Not Found - Resource not found (generic)
 */
const notFoundResponse = (resource = "Resource") => ({
    description: `${resource} not found`,
    content: {
        "application/json": {
            schema: baseErrorSchema,
        },
    },
});
exports.notFoundResponse = notFoundResponse;
/**
 * 409 Conflict - Resource already exists or conflicting state
 */
const conflictResponse = (resource = "Resource") => ({
    description: `Conflict - ${resource} already exists or is in a conflicting state`,
    content: {
        "application/json": {
            schema: baseErrorSchema,
        },
    },
});
exports.conflictResponse = conflictResponse;
/**
 * 422 Unprocessable Entity - Request understood but cannot be processed
 */
exports.unprocessableEntityResponse = {
    description: "Unprocessable entity - Request understood but cannot be processed",
    content: {
        "application/json": {
            schema: extendedErrorSchema,
        },
    },
};
/**
 * 429 Too Many Requests - Rate limit exceeded
 */
exports.rateLimitResponse = {
    description: "Too many requests - Rate limit exceeded",
    content: {
        "application/json": {
            schema: {
                type: "object",
                properties: {
                    message: {
                        type: "string",
                        description: "Rate limit error message",
                    },
                    retryAfter: {
                        type: "integer",
                        description: "Seconds until rate limit resets",
                    },
                },
                required: ["message"],
            },
        },
    },
};
/**
 * 500 Internal Server Error - Unexpected server error
 */
exports.serverErrorResponse = {
    description: "Internal server error - An unexpected error occurred",
    content: {
        "application/json": {
            schema: baseErrorSchema,
        },
    },
};
/**
 * 502 Bad Gateway - Upstream service error
 */
exports.badGatewayResponse = {
    description: "Bad gateway - Error communicating with upstream service",
    content: {
        "application/json": {
            schema: baseErrorSchema,
        },
    },
};
/**
 * 503 Service Unavailable - Service temporarily unavailable
 */
exports.serviceUnavailableResponse = {
    description: "Service unavailable - Service is temporarily unavailable",
    content: {
        "application/json": {
            schema: {
                type: "object",
                properties: {
                    message: {
                        type: "string",
                        description: "Service unavailable message",
                    },
                    retryAfter: {
                        type: "integer",
                        description: "Estimated seconds until service is available",
                    },
                },
                required: ["message"],
            },
        },
    },
};
// ============================================================================
// CRUD Operation Response Helpers
// ============================================================================
/**
 * Standard success message response
 */
const successMessageResponse = (description) => ({
    description,
    content: {
        "application/json": {
            schema: {
                type: "object",
                properties: {
                    message: {
                        type: "string",
                        description: "Success message",
                    },
                },
                required: ["message"],
            },
        },
    },
});
exports.successMessageResponse = successMessageResponse;
/**
 * Standard DELETE operation responses
 */
const deleteResponses = (resource) => ({
    200: (0, exports.successMessageResponse)(`${resource} deleted successfully`),
    401: exports.unauthorizedResponse,
    404: (0, exports.notFoundResponse)(resource),
    500: exports.serverErrorResponse,
});
exports.deleteResponses = deleteResponses;
/**
 * Standard UPDATE operation responses
 */
const updateResponses = (resource) => ({
    200: (0, exports.successMessageResponse)(`${resource} updated successfully`),
    400: exports.badRequestResponse,
    401: exports.unauthorizedResponse,
    404: (0, exports.notFoundResponse)(resource),
    500: exports.serverErrorResponse,
});
exports.updateResponses = updateResponses;
/**
 * Standard CREATE operation responses
 */
const createResponses = (resource) => ({
    200: (0, exports.successMessageResponse)(`${resource} created successfully`),
    400: exports.badRequestResponse,
    401: exports.unauthorizedResponse,
    409: (0, exports.conflictResponse)(resource),
    500: exports.serverErrorResponse,
});
exports.createResponses = createResponses;
/**
 * Standard BULK DELETE operation responses
 */
const bulkDeleteResponses = (resource) => ({
    200: (0, exports.successMessageResponse)(`${resource} records deleted successfully`),
    400: exports.badRequestResponse,
    401: exports.unauthorizedResponse,
    404: (0, exports.notFoundResponse)(resource),
    500: exports.serverErrorResponse,
});
exports.bulkDeleteResponses = bulkDeleteResponses;
/**
 * Standard STATUS UPDATE operation responses
 */
const statusUpdateResponses = (resource) => ({
    200: (0, exports.successMessageResponse)(`${resource} status updated successfully`),
    400: exports.badRequestResponse,
    401: exports.unauthorizedResponse,
    404: (0, exports.notFoundResponse)(resource),
    500: exports.serverErrorResponse,
});
exports.statusUpdateResponses = statusUpdateResponses;
// ============================================================================
// Pagination Schema
// ============================================================================
exports.paginationSchema = {
    type: "object",
    properties: {
        totalItems: {
            type: "integer",
            description: "Total number of items across all pages",
        },
        currentPage: {
            type: "integer",
            description: "Current page number (1-indexed)",
        },
        perPage: {
            type: "integer",
            description: "Number of items per page",
        },
        totalPages: {
            type: "integer",
            description: "Total number of pages",
        },
    },
    required: ["totalItems", "currentPage", "perPage", "totalPages"],
};
/**
 * Create a paginated list response schema
 */
const paginatedResponse = (itemSchema, description = "List retrieved successfully") => ({
    description,
    content: {
        "application/json": {
            schema: {
                type: "object",
                properties: {
                    data: {
                        type: "array",
                        items: itemSchema,
                    },
                    pagination: exports.paginationSchema,
                },
                required: ["data", "pagination"],
            },
        },
    },
});
exports.paginatedResponse = paginatedResponse;
/**
 * Create a single item response schema
 */
const singleItemResponse = (itemSchema, description = "Item retrieved successfully") => ({
    description,
    content: {
        "application/json": {
            schema: itemSchema,
        },
    },
});
exports.singleItemResponse = singleItemResponse;
// ============================================================================
// Common Field Schemas for Reuse
// ============================================================================
exports.commonFields = {
    id: {
        type: "string",
        format: "uuid",
        description: "Unique identifier",
    },
    createdAt: {
        type: "string",
        format: "date-time",
        description: "Timestamp when the record was created",
    },
    updatedAt: {
        type: "string",
        format: "date-time",
        description: "Timestamp when the record was last updated",
    },
    deletedAt: {
        type: "string",
        format: "date-time",
        nullable: true,
        description: "Timestamp when the record was soft deleted",
    },
    status: {
        type: "boolean",
        description: "Whether the record is active",
    },
};
/**
 * Base model schema with common fields
 */
const baseModelSchema = (additionalProperties) => ({
    type: "object",
    properties: {
        ...exports.commonFields,
        ...additionalProperties,
    },
});
exports.baseModelSchema = baseModelSchema;
