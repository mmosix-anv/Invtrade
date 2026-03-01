"use strict";
/**
 * WebSocket Handler Module
 *
 * This module sets up a WebSocket endpoint and manages client connections,
 * subscriptions, message handling, and clean-up.
 *
 * It now uses:
 *  - MessageBroker (from messageBroker.ts) for message broadcasting.
 *  - A separate heartbeat module (from heartbeat.ts) for ping/pong logic.
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.hasClients = exports.handleDirectClientMessage = exports.handleBroadcastMessage = exports.removeClientSubscription = exports.deregisterClient = exports.registerClient = exports.messageBroker = exports.clients = void 0;
exports.setupWebSocketEndpoint = setupWebSocketEndpoint;
const ws_1 = require("@b/utils/ws");
const Middleware_1 = require("./Middleware");
const Request_1 = require("./Request");
const Response_1 = require("./Response");
const passwords_1 = require("@b/utils/passwords");
const query_1 = require("@b/utils/query");
const console_1 = require("@b/utils/console");
const error_1 = require("@b/utils/error");
const Routes_1 = require("./Routes");
const heartbeat_1 = require("./ws/heartbeat");
const messageBroker_1 = require("./ws/messageBroker");
// Global map to keep track of WebSocket clients by route.
// Structure: Map<route, Map<clientId, { ws, subscriptions: Set<string> }>>
exports.clients = new Map();
// Instantiate the MessageBroker with the clients map.
exports.messageBroker = new messageBroker_1.MessageBroker(exports.clients);
// ----------------------------------------------------------------------
// WebSocket Endpoint Setup
// ----------------------------------------------------------------------
/**
 * Sets up a WebSocket endpoint on the provided application instance.
 *
 * @param app - The server application with WebSocket support.
 * @param routePath - The URL path to mount the WebSocket endpoint.
 * @param entryPath - The module path containing the handler, metadata, and optional onClose function.
 *
 * The entry module must export:
 *  - default: the handler function.
 *  - metadata: an object (e.g., { requiresAuth: true }).
 *  - onClose (optional): a function to execute when a client disconnects.
 */
async function setupWebSocketEndpoint(app, routePath, entryPath) {
    let handler, metadata, onClose;
    // Attempt to retrieve from cache.
    const cached = Routes_1.routeCache.get(entryPath);
    if (cached && cached.metadata) {
        ({ handler, metadata, onClose } = cached);
    }
    else {
        const handlerModule = await Promise.resolve(`${entryPath}`).then(s => __importStar(require(s)));
        handler = handlerModule.default;
        if (!handler) {
            throw (0, error_1.createError)({ statusCode: 404, message: `Handler not found for ${entryPath}` });
        }
        metadata = handlerModule.metadata;
        if (!metadata) {
            throw (0, error_1.createError)({ statusCode: 404, message: `Metadata not found for ${entryPath}` });
        }
        onClose = handlerModule.onClose;
        Routes_1.routeCache.set(entryPath, { handler, metadata, onClose });
    }
    if (typeof handler !== "function") {
        throw (0, error_1.createError)({ statusCode: 500, message: `Handler is not a function for ${entryPath}` });
    }
    // Configure the WebSocket endpoint.
    app.ws(routePath, {
        pong: (ws, message) => {
            ws.isAlive = true;
        },
        upgrade: async (response, request, context) => {
            const res = new Response_1.Response(response);
            const req = new Request_1.Request(response, request);
            req.params = (0, ws_1.parseParams)(routePath, req.url);
            try {
                if (!metadata) {
                    throw (0, error_1.createError)({ statusCode: 404, message: `Metadata not found for ${entryPath}` });
                }
                req.setMetadata(metadata);
            }
            catch (error) {
                console_1.logger.error("WS", `Error setting metadata for ${entryPath}`, error);
                res.cork(async () => {
                    res.handleError(500, "Internal Server Error");
                });
                return;
            }
            try {
                if (metadata.requiresAuth) {
                    await (0, Middleware_1.rateLimit)(res, req, async () => {
                        await (0, Middleware_1.authenticate)(res, req, async () => {
                            await (0, Middleware_1.rolesGate)(app, res, req, routePath, "ws", async () => {
                                res.cork(async () => {
                                    // Store base path without query params for correct route matching
                                    const basePath = req.url.split('?')[0];
                                    res.upgrade({
                                        user: req.user,
                                        params: req.params,
                                        query: req.query,
                                        path: basePath,
                                    }, req.headers["sec-websocket-key"], req.headers["sec-websocket-protocol"], req.headers["sec-websocket-extensions"], context);
                                });
                            });
                        });
                    });
                }
                else {
                    res.cork(async () => {
                        var _a, _b;
                        // Store base path without query params for correct route matching
                        const basePath = req.url.split('?')[0];
                        res.upgrade({
                            user: {
                                id: ((_a = req.query) === null || _a === void 0 ? void 0 : _a.userId) || (0, passwords_1.makeUuid)(),
                                role: ((_b = req.query) === null || _b === void 0 ? void 0 : _b.userId) ? "user" : "guest",
                            },
                            params: req.params,
                            query: req.query,
                            path: basePath,
                        }, req.headers["sec-websocket-key"], req.headers["sec-websocket-protocol"], req.headers["sec-websocket-extensions"], context);
                    });
                }
            }
            catch (error) {
                console_1.logger.error("WS", `Error upgrading connection for ${entryPath}`, error);
                res.cork(async () => {
                    res.close();
                });
            }
        },
        open: (ws) => {
            ws.isAlive = true;
            ws.isClosed = false;
            if (!ws.user || typeof ws.user.id === "undefined") {
                console_1.logger.error("WS", "User or user ID is undefined");
                return;
            }
            const clientId = ws.user.id;
            (0, exports.registerClient)(ws.path, clientId, ws);
        },
        message: async (ws, message, isBinary) => {
            const preparedMessage = Buffer.from(message).toString("utf-8");
            try {
                const parsedMessage = JSON.parse(preparedMessage);
                if (parsedMessage.action === "SUBSCRIBE" ||
                    parsedMessage.action === "UNSUBSCRIBE") {
                    processSubscriptionChange(ws, parsedMessage);
                }
                const result = await handler(ws, parsedMessage, isBinary);
                if (result) {
                    // Send response directly back through the WebSocket connection
                    try {
                        ws.send(JSON.stringify(result));
                    }
                    catch (sendError) {
                        console_1.logger.error("WS", "Failed to send response", sendError);
                    }
                }
            }
            catch (error) {
                console_1.logger.error("WS", `Failed to parse/handle message for ${entryPath}`, error);
            }
        },
        close: async (ws) => {
            if (typeof onClose === "function") {
                await onClose(ws, ws.path, ws.user.id);
            }
            ws.isClosed = true;
            (0, exports.deregisterClient)(ws.path, ws.user.id);
        },
    });
}
// ----------------------------------------------------------------------
// Client and Subscription Management
// ----------------------------------------------------------------------
/**
 * Registers a new client connection.
 *
 * @param route - The route the client connected to.
 * @param clientId - The unique client identifier.
 * @param ws - The WebSocket connection instance.
 * @param initialSubscription (optional) - A subscription to add initially.
 */
const registerClient = (route, clientId, ws, initialSubscription) => {
    if (!route || !clientId || !ws)
        return;
    if (!exports.clients.has(route)) {
        exports.clients.set(route, new Map());
    }
    const routeClients = exports.clients.get(route);
    if (!routeClients.has(clientId)) {
        routeClients.set(clientId, {
            ws,
            subscriptions: new Set(initialSubscription ? [initialSubscription] : []),
        });
    }
    else if (initialSubscription) {
        routeClients.get(clientId).subscriptions.add(initialSubscription);
    }
};
exports.registerClient = registerClient;
/**
 * Deregisters a client connection.
 *
 * @param route - The route from which to remove the client.
 * @param clientId - The unique client identifier.
 */
const deregisterClient = (route, clientId) => {
    if (exports.clients.has(route)) {
        const routeClients = exports.clients.get(route);
        routeClients.delete(clientId);
        if (routeClients.size === 0) {
            exports.clients.delete(route);
        }
    }
};
exports.deregisterClient = deregisterClient;
/**
 * Removes a subscription for a given client.
 *
 * @param route - The route the client is connected to.
 * @param clientId - The unique client identifier.
 * @param subscription - The subscription to remove.
 */
const removeClientSubscription = (route, clientId, subscription) => {
    if (exports.clients.has(route) && exports.clients.get(route).has(clientId)) {
        const clientRecord = exports.clients.get(route).get(clientId);
        clientRecord.subscriptions.delete(subscription);
        if (clientRecord.subscriptions.size === 0) {
            exports.clients.get(route).delete(clientId);
            if (exports.clients.get(route).size === 0) {
                exports.clients.delete(route);
            }
        }
    }
};
exports.removeClientSubscription = removeClientSubscription;
/**
 * Processes subscription change requests from clients.
 *
 * Expects the message payload to be valid.
 *
 * @param ws - The WebSocket connection instance.
 * @param message - Parsed JSON message from the client.
 */
function processSubscriptionChange(ws, message) {
    if (!message.payload) {
        throw (0, error_1.createError)({ statusCode: 400, message: "Invalid subscription payload" });
    }
    const clientId = ws.user.id;
    const route = ws.path;
    const subscriptionKey = JSON.stringify(message.payload);
    if (message.action === "SUBSCRIBE") {
        (0, exports.registerClient)(route, clientId, ws, subscriptionKey);
    }
    else if (message.action === "UNSUBSCRIBE") {
        (0, exports.removeClientSubscription)(route, clientId, subscriptionKey);
    }
}
// ----------------------------------------------------------------------
// Common Message Processing
// ----------------------------------------------------------------------
/**
 * Helper function for processing WebSocket messages (create, update, delete).
 *
 * This function fetches or validates payload data based on the method,
 * then calls the provided sendMessage callback with the proper data.
 */
async function processWebSocketMessage(params) {
    let payload;
    const { type, model, id, data, method, status, sendMessage } = params;
    if (method === "update") {
        if (!id)
            throw (0, error_1.createError)({ statusCode: 400, message: "ID is required for update method" });
        if (status === true) {
            if (!model)
                throw (0, error_1.createError)({ statusCode: 400, message: "Model is required for update method" });
            if (Array.isArray(id)) {
                const records = await (0, query_1.getRecords)(model, id);
                if (!records || records.length === 0) {
                    throw (0, error_1.createError)({ statusCode: 404, message: `Records with IDs ${id.join(", ")} not found` });
                }
                payload = records;
            }
            else {
                const record = await (0, query_1.getRecord)(model, id);
                if (!record) {
                    throw (0, error_1.createError)({ statusCode: 404, message: `Record with ID ${id} not found` });
                }
                payload = record;
            }
            sendMessage("create", payload);
        }
        else if (status === false) {
            sendMessage("delete", Array.isArray(id) ? id.map((i) => ({ id: i })) : { id });
        }
        else {
            payload = { id, data };
            sendMessage("update", payload);
        }
    }
    else if (method === "create") {
        if (data) {
            payload = data;
        }
        else {
            if (!model || !id)
                throw (0, error_1.createError)({ statusCode: 400, message: "Model and ID are required for create method when no data is provided" });
            if (Array.isArray(id)) {
                const records = await (0, query_1.getRecords)(model, id);
                if (!records || records.length === 0) {
                    throw (0, error_1.createError)({ statusCode: 404, message: `Records with IDs ${id.join(", ")} not found` });
                }
                payload = records;
            }
            else {
                const record = await (0, query_1.getRecord)(model, id);
                if (!record) {
                    throw (0, error_1.createError)({ statusCode: 404, message: `Record with ID ${id} not found` });
                }
                payload = record;
            }
        }
        sendMessage("create", payload);
    }
    else if (method === "delete") {
        if (!id)
            throw (0, error_1.createError)({ statusCode: 400, message: "ID is required for delete method" });
        sendMessage("delete", Array.isArray(id) ? id.map((i) => ({ id: i })) : { id });
    }
}
/**
 * Processes a broadcast message for all clients on a route.
 *
 * Wraps processWebSocketMessage with a sendMessage callback that uses
 * MessageBroker to broadcast the message.
 */
const handleBroadcastMessage = async (params) => {
    const sendMessage = (method, payload) => {
        // Use the provided route or default to /api/user
        const broadcastRoute = params.route || "/api/user";
        exports.messageBroker.broadcastToRoute(broadcastRoute, {
            type: params.type,
            method,
            payload,
        });
    };
    await processWebSocketMessage({ ...params, sendMessage });
};
exports.handleBroadcastMessage = handleBroadcastMessage;
/**
 * Processes a direct message for a specific client.
 *
 * Wraps processWebSocketMessage with a sendMessage callback that uses
 * MessageBroker to send the message directly to the specified client.
 */
const handleDirectClientMessage = async (params) => {
    const sendMessage = (method, payload) => {
        exports.messageBroker.sendToClient(params.clientId, {
            type: params.type,
            method,
            payload,
        });
    };
    await processWebSocketMessage({ ...params, sendMessage });
};
exports.handleDirectClientMessage = handleDirectClientMessage;
/**
 * Checks if there are any active clients connected to a given route.
 *
 * @param route - The route to check.
 * @returns True if at least one client is connected; false otherwise.
 */
const hasClients = (route) => {
    return exports.clients.has(route) && exports.clients.get(route).size > 0;
};
exports.hasClients = hasClients;
// ----------------------------------------------------------------------
// Start Heartbeat
// ----------------------------------------------------------------------
// Start the heartbeat mechanism using the imported module (interval in ms).
// Increased to 30 seconds for better stability with client connections
const HEARTBEAT_INTERVAL = 30000;
(0, heartbeat_1.startHeartbeat)(exports.clients, HEARTBEAT_INTERVAL);
