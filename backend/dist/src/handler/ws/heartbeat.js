"use strict";
/**
 * Heartbeat Module
 *
 * This module encapsulates the heartbeat (ping/pong) logic.
 * It periodically pings each WebSocket connection and cleans up those
 * that are inactive or closed.
 *
 * This abstraction improves clarity and makes the heartbeat logic easier to test.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.startHeartbeat = startHeartbeat;
const console_1 = require("@b/utils/console");
/**
 * Starts the heartbeat mechanism.
 *
 * @param clients - A map of clients organized by route.
 * @param interval - The interval (in milliseconds) at which to perform the heartbeat check.
 * @returns The interval ID (can be used for clearing the interval).
 */
function startHeartbeat(clients, interval) {
    let isFirstCheck = true;
    return setInterval(() => {
        for (const [route, routeClients] of clients.entries()) {
            for (const [clientId, clientRecord] of routeClients.entries()) {
                // If the connection is marked as closed, remove it
                if (clientRecord.ws.isClosed) {
                    try {
                        clientRecord.ws.close();
                    }
                    catch (error) {
                        console_1.logger.error("WS", `Failed to close connection for client ${clientId}`, error);
                    }
                    routeClients.delete(clientId);
                }
                // Only check isAlive after the first interval (give clients time to connect)
                else if (!isFirstCheck && !clientRecord.ws.isAlive) {
                    // Client didn't respond to last ping, but give them one more chance
                    console_1.logger.debug("WS", `Client ${clientId} missed heartbeat, sending final ping`);
                    try {
                        clientRecord.ws.ping();
                        // Give them one more interval to respond
                        setTimeout(() => {
                            if (!clientRecord.ws.isAlive) {
                                console_1.logger.debug("WS", `Client ${clientId} failed to respond, closing`);
                                try {
                                    clientRecord.ws.close();
                                }
                                catch (error) {
                                    console_1.logger.error("WS", `Failed to close unresponsive client ${clientId}`, error);
                                }
                                routeClients.delete(clientId);
                            }
                        }, interval / 2); // Wait half the interval for response
                    }
                    catch (error) {
                        console_1.logger.error("WS", `Failed to send final ping to client ${clientId}`, error);
                        routeClients.delete(clientId);
                    }
                }
                else {
                    // Mark as not alive and send a ping, expecting a pong to mark it alive.
                    clientRecord.ws.isAlive = false;
                    try {
                        clientRecord.ws.ping();
                    }
                    catch (error) {
                        console_1.logger.error("WS", `Failed to ping client ${clientId} during heartbeat`, error);
                        routeClients.delete(clientId);
                    }
                }
            }
            if (routeClients.size === 0) {
                clients.delete(route);
            }
        }
        isFirstCheck = false;
    }, interval);
}
