"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.roleStoreSchema = exports.roleUpdateSchema = exports.baseRoleSchema = void 0;
exports.cacheRoles = cacheRoles;
exports.getRoles = getRoles;
exports.getRole = getRole;
const db_1 = require("@b/db");
const redis_1 = require("@b/utils/redis");
const console_1 = require("@b/utils/console");
const redis = redis_1.RedisSingleton.getInstance();
// Function to cache the roles
async function cacheRoles() {
    try {
        const roles = await getRoles();
        await redis.set("roles", JSON.stringify(roles), "EX", 3600);
    }
    catch (error) {
        console_1.logger.error("ROLE", "Redis error", error);
    }
}
// Initialize the cache when the file is loaded
cacheRoles();
async function getRoles() {
    const roles = await db_1.models.role.findAll({
        include: [
            {
                model: db_1.models.permission,
                as: "permissions",
                through: { attributes: [] },
            },
        ],
    });
    return roles.map((role) => role.get({ plain: true }));
}
async function getRole(id) {
    const role = await db_1.models.role.findOne({
        where: { id },
        include: [
            {
                model: db_1.models.permission,
                as: "permissions",
                through: { attributes: [] },
            },
        ],
    });
    return role ? role.get({ plain: true }) : null;
}
const schema_1 = require("@b/utils/schema"); // Adjust the import path as necessary
// Define base components for the role schema
const id = (0, schema_1.baseStringSchema)("ID of the role");
const name = (0, schema_1.baseStringSchema)("Name of the role");
// Update permissions schema to expect an array of numbers
const permissions = {
    type: "array",
    items: {
        type: "string",
        description: "ID of the permission",
    },
};
// Base schema definition for roles
exports.baseRoleSchema = {
    id,
    name,
    permissions,
};
// Schema for updating a role
exports.roleUpdateSchema = {
    type: "object",
    properties: {
        name,
        permissions,
    },
    required: ["name", "permissions"],
};
// Schema for defining a new role
exports.roleStoreSchema = {
    description: "Role created or updated successfully",
    content: {
        "application/json": {
            schema: {
                type: "object",
                properties: exports.baseRoleSchema,
            },
        },
    },
};
