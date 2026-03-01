"use strict";
/**
 * Notification Service Custom Errors
 * Extends Error class with specific notification error types
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.NoContactMethodError = exports.TemplateRenderError = exports.RedisCacheError = exports.InvalidConfigError = exports.InvalidAmountError = exports.RateLimitError = exports.QuietHoursError = exports.DuplicateNotificationError = exports.UserNotFoundError = exports.ProviderError = exports.TemplateNotFoundError = exports.ChannelNotAvailableError = exports.NotificationError = void 0;
/**
 * Base notification error class
 */
class NotificationError extends Error {
    constructor(message) {
        super(message);
        this.name = "NotificationError";
        Error.captureStackTrace(this, this.constructor);
    }
}
exports.NotificationError = NotificationError;
/**
 * Thrown when a requested channel is not available or not implemented
 */
class ChannelNotAvailableError extends NotificationError {
    constructor(channel) {
        super(`Notification channel not available: ${channel}`);
        this.name = "ChannelNotAvailableError";
        this.channel = channel;
    }
}
exports.ChannelNotAvailableError = ChannelNotAvailableError;
/**
 * Thrown when a notification template is not found in the database
 */
class TemplateNotFoundError extends NotificationError {
    constructor(templateName) {
        super(`Notification template not found: ${templateName}`);
        this.name = "TemplateNotFoundError";
        this.templateName = templateName;
    }
}
exports.TemplateNotFoundError = TemplateNotFoundError;
/**
 * Thrown when a provider fails to send a notification
 */
class ProviderError extends NotificationError {
    constructor(provider, originalError) {
        super(`Provider ${provider} failed: ${originalError.message}`);
        this.name = "ProviderError";
        this.provider = provider;
        this.originalError = originalError;
    }
}
exports.ProviderError = ProviderError;
/**
 * Thrown when a user is not found
 */
class UserNotFoundError extends NotificationError {
    constructor(userId) {
        super(`User not found: ${userId}`);
        this.name = "UserNotFoundError";
        this.userId = userId;
    }
}
exports.UserNotFoundError = UserNotFoundError;
/**
 * Thrown when attempting to send a duplicate notification
 */
class DuplicateNotificationError extends NotificationError {
    constructor(idempotencyKey, existingNotificationId) {
        super(`Duplicate notification detected: ${idempotencyKey} (existing: ${existingNotificationId})`);
        this.name = "DuplicateNotificationError";
        this.idempotencyKey = idempotencyKey;
        this.existingNotificationId = existingNotificationId;
    }
}
exports.DuplicateNotificationError = DuplicateNotificationError;
/**
 * Thrown when attempting to send during user's quiet hours
 */
class QuietHoursError extends NotificationError {
    constructor(userId) {
        super(`User ${userId} is in quiet hours`);
        this.name = "QuietHoursError";
        this.userId = userId;
    }
}
exports.QuietHoursError = QuietHoursError;
/**
 * Thrown when rate limit is exceeded
 */
class RateLimitError extends NotificationError {
    constructor(channel, retryAfter) {
        super(`Rate limit exceeded for ${channel}. Retry after ${retryAfter} seconds`);
        this.name = "RateLimitError";
        this.channel = channel;
        this.retryAfter = retryAfter;
    }
}
exports.RateLimitError = RateLimitError;
/**
 * Thrown when invalid amount is provided
 */
class InvalidAmountError extends NotificationError {
    constructor(amount, details) {
        super(`Invalid amount ${amount}: ${details}`);
        this.name = "InvalidAmountError";
        this.amount = amount;
    }
}
exports.InvalidAmountError = InvalidAmountError;
/**
 * Thrown when invalid configuration is provided
 */
class InvalidConfigError extends NotificationError {
    constructor(configKey, details) {
        super(`Invalid configuration for ${configKey}: ${details}`);
        this.name = "InvalidConfigError";
        this.configKey = configKey;
    }
}
exports.InvalidConfigError = InvalidConfigError;
/**
 * Thrown when Redis connection fails
 */
class RedisCacheError extends NotificationError {
    constructor(operation, originalError) {
        super(`Redis cache operation failed (${operation}): ${originalError.message}`);
        this.name = "RedisCacheError";
    }
}
exports.RedisCacheError = RedisCacheError;
/**
 * Thrown when template rendering fails
 */
class TemplateRenderError extends NotificationError {
    constructor(templateName, details) {
        super(`Template rendering failed for ${templateName}: ${details}`);
        this.name = "TemplateRenderError";
        this.templateName = templateName;
    }
}
exports.TemplateRenderError = TemplateRenderError;
/**
 * Thrown when user has no valid contact method for channel
 */
class NoContactMethodError extends NotificationError {
    constructor(userId, channel) {
        super(`User ${userId} has no valid contact method for channel ${channel}`);
        this.name = "NoContactMethodError";
        this.userId = userId;
        this.channel = channel;
    }
}
exports.NoContactMethodError = NoContactMethodError;
