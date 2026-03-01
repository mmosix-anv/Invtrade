"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.paypalClient = paypalClient;
exports.paypalOrdersController = paypalOrdersController;
// @ts-ignore - PayPal SDK types issue
// import { Client, Environment, OrdersController } from "@paypal/paypal-server-sdk";
const paypalSdk = require("@paypal/paypal-server-sdk");
const { Client, Environment, OrdersController } = paypalSdk;
function getEnvironment() {
    const isProduction = process.env.NODE_ENV === "production";
    return isProduction ? Environment.Production : Environment.Sandbox;
}
function getClientId() {
    return process.env.NEXT_PUBLIC_APP_PAYPAL_CLIENT_ID || "";
}
function getClientSecret() {
    return process.env.APP_PAYPAL_CLIENT_SECRET || "";
}
// Initialize the PayPal SDK client
function paypalClient() {
    return new Client({
        clientCredentialsAuthCredentials: {
            oAuthClientId: getClientId(),
            oAuthClientSecret: getClientSecret(),
        },
        environment: getEnvironment(),
    });
}
// Initialize the PayPal Orders Controller
function paypalOrdersController() {
    const client = paypalClient();
    return new OrdersController(client);
}
