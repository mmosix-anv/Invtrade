"use strict";
/**
 * In-App Notification Channel
 * Handles database storage and WebSocket delivery for in-app notifications
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.InAppChannel = void 0;
const db_1 = require("@b/db");
const BaseChannel_1 = require("./BaseChannel");
const Websocket_1 = require("@b/handler/Websocket");
class InAppChannel extends BaseChannel_1.BaseChannel {
    constructor() {
        super("IN_APP");
    }
    /**
     * Send in-app notification
     * Creates database record and sends via WebSocket
     */
    async send(operation, transaction) {
        try {
            this.validate(operation);
            const { userId, type, data } = operation;
            // Extract notification details from data or use defaults
            const title = (data === null || data === void 0 ? void 0 : data.title) || "Notification";
            const message = (data === null || data === void 0 ? void 0 : data.message) || "";
            const link = (data === null || data === void 0 ? void 0 : data.link) || null;
            const relatedId = (data === null || data === void 0 ? void 0 : data.relatedId) || null;
            const actions = (data === null || data === void 0 ? void 0 : data.actions) || null;
            // Create notification in database
            const notification = await db_1.models.notification.create({
                userId,
                type,
                title,
                message,
                link,
                relatedId,
                actions: actions ? JSON.stringify(actions) : null,
                read: false,
                idempotencyKey: operation.idempotencyKey,
                channels: JSON.stringify(["IN_APP"]),
                priority: operation.priority || "NORMAL",
                details: operation.metadata
                    ? JSON.stringify(operation.metadata)
                    : null,
            }, transaction ? { transaction } : undefined);
            this.log(`Notification created in database`, {
                id: notification.id,
                userId,
                type,
            });
            // Send via WebSocket (real-time delivery)
            try {
                await this.sendViaWebSocket(userId, {
                    id: notification.id,
                    type: notification.type, // Use the type from database (already converted to lowercase)
                    title,
                    message,
                    link,
                    actions,
                    createdAt: notification.createdAt,
                });
                this.log(`Notification sent via WebSocket`, {
                    id: notification.id,
                    userId,
                });
            }
            catch (wsError) {
                // WebSocket delivery failure is non-critical
                // User will still see notification when they refresh
                this.logError(`WebSocket delivery failed`, wsError);
            }
            // Track successful delivery
            await this.trackDelivery(notification.id, {
                status: "DELIVERED",
                messageId: `in-app-${notification.id}`,
            });
            return {
                success: true,
                externalId: notification.id,
                messageId: `in-app-${notification.id}`,
            };
        }
        catch (error) {
            this.logError(`Failed to send in-app notification`, error);
            return {
                success: false,
                error: error.message,
            };
        }
    }
    /**
     * Send notification via WebSocket
     */
    async sendViaWebSocket(userId, data) {
        try {
            // Send to user's connected socket (if online)
            Websocket_1.messageBroker.sendToClientOnRoute(userId, "notification", {
                ...data,
                timestamp: new Date().toISOString(),
            });
        }
        catch (error) {
            // User might not be connected, that's okay
            // They'll see notification when they load the app
            throw error;
        }
    }
    /**
     * Validate in-app notification operation
     */
    validate(operation) {
        var _a, _b;
        super.validate(operation);
        if (!((_a = operation.data) === null || _a === void 0 ? void 0 : _a.message) && !((_b = operation.data) === null || _b === void 0 ? void 0 : _b.title)) {
            throw new Error("In-app notification requires at least title or message");
        }
    }
}
exports.InAppChannel = InAppChannel;
