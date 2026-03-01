"use strict";
/**
 * MessageBroker Module
 *
 * This module abstracts the logic for sending messages to WebSocket clients.
 * It provides methods to:
 *  - Send a message to a specific client (across all routes).
 *  - Broadcast a message to all clients on a given route.
 *  - Broadcast a message to only those clients that are subscribed to a specific payload.
 *
 * In a high-load scenario, this module can be updated to integrate with a scalable
 * pub/sub mechanism (e.g., Redis, NATS, etc.) without changing the rest of the code.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.MessageBroker = void 0;
const console_1 = require("@b/utils/console");
class MessageBroker {
    constructor(clients) {
        this.clients = clients;
    }
    /**
     * Sends a message to a specific client on a specific route only.
     *
     * @param route - The specific route to send the message to.
     * @param clientId - Unique identifier for the client.
     * @param message - The message object to send.
     * @param isBinary - Whether to send the message as binary data.
     */
    sendToClientOnRoute(route, clientId, message, isBinary = false) {
        const routeClients = this.clients.get(route);
        if (routeClients) {
            const clientRecord = routeClients.get(clientId);
            if (clientRecord) {
                clientRecord.ws.cork(() => {
                    if (isBinary) {
                        const bufferMessage = Buffer.from(JSON.stringify(message));
                        clientRecord.ws.send(bufferMessage, true);
                    }
                    else {
                        clientRecord.ws.send(JSON.stringify(message));
                    }
                });
                return true;
            }
        }
        return false;
    }
    /**
     * Sends a message to a specific client across all routes.
     *
     * @param clientId - Unique identifier for the client.
     * @param message - The message object to send.
     * @param isBinary - Whether to send the message as binary data.
     */
    sendToClient(clientId, message, isBinary = false) {
        let found = false;
        for (const [route, routeClients] of this.clients.entries()) {
            if (routeClients.has(clientId)) {
                const clientRecord = routeClients.get(clientId);
                try {
                    clientRecord.ws.cork(() => {
                        if (isBinary) {
                            const bufferMessage = Buffer.from(JSON.stringify(message));
                            clientRecord.ws.send(bufferMessage, true);
                        }
                        else {
                            clientRecord.ws.send(JSON.stringify(message));
                        }
                    });
                }
                catch (error) {
                    console_1.logger.error("WS", `Failed to send message to client ${clientId}`, error);
                    routeClients.delete(clientId);
                }
                found = true;
            }
        }
        if (!found) {
            console_1.logger.debug("WS", `Client ${clientId} not found in any route`);
        }
    }
    /**
     * Broadcasts a message to all clients on a specific route.
     *
     * @param route - The route to broadcast to.
     * @param message - The message object to send.
     */
    broadcastToRoute(route, message) {
        const msgString = JSON.stringify(message);
        if (this.clients.has(route)) {
            const routeClients = this.clients.get(route);
            routeClients.forEach((clientRecord) => {
                try {
                    clientRecord.ws.cork(() => {
                        clientRecord.ws.send(msgString);
                    });
                }
                catch (error) {
                    console_1.logger.error("WS", `Failed to broadcast to route ${route}`, error);
                }
            });
        }
    }
    /**
     * Broadcasts a message to clients on a route that are subscribed to a specific payload.
     *
     * @param route - The route to broadcast to.
     * @param payload - The subscription payload. This is stringified internally.
     * @param message - The message object to send.
     */
    broadcastToSubscribedClients(route, payload, message) {
        try {
            const subscriptionKey = JSON.stringify(payload);
            // Broadcast to specific route with subscription filtering
            const routeClients = this.clients.get(route);
            if (routeClients) {
                let matchedClients = 0;
                for (const [clientId, clientRecord] of routeClients) {
                    // Check if client has matching subscription
                    if (clientRecord.subscriptions.has(subscriptionKey)) {
                        try {
                            clientRecord.ws.send(JSON.stringify(message));
                            matchedClients++;
                        }
                        catch (error) {
                            console_1.logger.error("WS", `Failed to send to client ${clientId}`, error);
                            routeClients.delete(clientId);
                        }
                    }
                }
            }
        }
        catch (error) {
            console_1.logger.error("WS", "Error in broadcastToSubscribedClients", error);
        }
    }
}
exports.MessageBroker = MessageBroker;
