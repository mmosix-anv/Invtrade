"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.supportTicketUpdateSchema = exports.supportTicketSchema = exports.baseSupportTicketSchema = void 0;
const schema_1 = require("@b/utils/schema"); // Adjust the import path as necessary
// Base schema components for support tickets
const id = {
    ...(0, schema_1.baseStringSchema)("ID of the support ticket"),
    nullable: true, // Optional during creation
};
const userId = (0, schema_1.baseStringSchema)("ID of the user who created the ticket");
const agentId = (0, schema_1.baseStringSchema)("ID of the agent assigned to the ticket");
const subject = (0, schema_1.baseStringSchema)("Subject of the ticket");
const importance = (0, schema_1.baseStringSchema)("Importance of the ticket");
const status = (0, schema_1.baseEnumSchema)("Status of the ticket", [
    "PENDING",
    "OPEN",
    "REPLIED",
    "CLOSED",
]);
const messages = {
    type: "object",
    description: "Messages associated with the chat",
};
const type = (0, schema_1.baseEnumSchema)("Type of the ticket", ["LIVE", "TICKET"]);
// Base schema definition for support tickets
exports.baseSupportTicketSchema = {
    id,
    userId,
    agentId,
    messages,
    subject,
    importance,
    status,
    type,
};
// Full schema for a support ticket including user and chat details
exports.supportTicketSchema = {
    ...exports.baseSupportTicketSchema,
    user: {
        type: "object",
        properties: {
            id: { type: "string", description: "ID of the user" },
            avatar: { type: "string", description: "Avatar of the user" },
            firstName: { type: "string", description: "First name of the user" },
            lastName: { type: "string", description: "Last name of the user" },
        },
        nullable: true,
    },
};
// Schema for updating a support ticket
exports.supportTicketUpdateSchema = {
    type: "object",
    properties: {
        subject,
        importance,
        status,
    },
    required: ["subject", "importance", "status"],
};
