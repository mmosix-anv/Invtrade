"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.metadata = void 0;
const Websocket_1 = require("@b/handler/Websocket");
const db_1 = require("@b/db");
exports.metadata = {};
exports.default = async (data, message) => {
    // Parse the message if it's a string.
    if (typeof message === "string") {
        message = JSON.parse(message);
    }
    const { user } = data;
    if (!(user === null || user === void 0 ? void 0 : user.id)) {
        return;
    }
    const { type, payload } = message;
    // Fetch notifications for the user.
    const notifications = await db_1.models.notification.findAll({
        where: { userId: user.id },
        order: [["createdAt", "DESC"]],
    });
    // Send notifications to the client only on the /api/user route
    Websocket_1.messageBroker.sendToClientOnRoute("/api/user", user.id, {
        type: "notifications",
        method: "create",
        payload: notifications.map((n) => n.get({ plain: true })),
    });
    // Fetch announcements with active status.
    const announcements = await db_1.models.announcement.findAll({
        where: { status: true },
        order: [["createdAt", "DESC"]],
    });
    // Send announcements to the client only on the /api/user route
    Websocket_1.messageBroker.sendToClientOnRoute("/api/user", user.id, {
        type: "announcements",
        method: "create",
        payload: announcements.map((a) => a.get({ plain: true })),
    });
};
