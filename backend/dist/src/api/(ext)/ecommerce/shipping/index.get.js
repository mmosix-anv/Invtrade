"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.metadata = void 0;
exports.default = handler;
const db_1 = require("@b/db");
const error_1 = require("@b/utils/error");
// Metadata (OpenAPI style, optional)
exports.metadata = {
    summary: "Get user's shipping records",
    description: "Returns all shipping records for the current user, including all related order, items, products, and addresses.",
    operationId: "getUserShippingRecords",
    tags: ["Ecommerce", "Shipping", "User"],
    logModule: "ECOM",
    logTitle: "Get Shipping",
    requiresAuth: true,
    responses: {
        200: {
            description: "Shipping records for user",
            content: { "application/json": { schema: { type: "object" } } },
        },
        401: { description: "Unauthorized" },
        500: { description: "Internal Server Error" },
    },
    permission: "access.ecommerce.shipping",
};
async function handler({ user, ctx }) {
    if (!(user === null || user === void 0 ? void 0 : user.id)) {
        throw (0, error_1.createError)({ statusCode: 401, message: "Unauthorized" });
    }
    ctx === null || ctx === void 0 ? void 0 : ctx.step("Fetching Shipping");
    try {
        const shippings = await db_1.models.ecommerceShipping.findAll({
            include: [
                {
                    model: db_1.models.ecommerceOrder,
                    as: "ecommerceOrders", // association alias!
                    where: { userId: user.id },
                    required: true, // Only shippings with at least one order for this user
                    include: [
                        {
                            model: db_1.models.ecommerceOrderItem,
                            as: "ecommerceOrderItems",
                            // You can also include product if you want
                            include: [
                                {
                                    model: db_1.models.ecommerceProduct,
                                    as: "product",
                                },
                            ],
                        },
                        {
                            model: db_1.models.ecommerceShippingAddress,
                            as: "shippingAddress",
                        },
                        {
                            model: db_1.models.user,
                            as: "user",
                        },
                        {
                            model: db_1.models.ecommerceProduct,
                            as: "products", // if you have many-to-many between order and products
                        },
                    ],
                },
            ],
            order: [["createdAt", "DESC"]],
            paranoid: false, // include soft-deleted if needed
        });
        // No additional processing, raw Sequelize structure
        ctx === null || ctx === void 0 ? void 0 : ctx.success("Get Shipping fetched successfully");
        return shippings;
    }
    catch (err) {
        console.error("Failed to fetch shipping records", err);
        throw (0, error_1.createError)({
            statusCode: 500,
            message: "Failed to fetch shipping records",
        });
    }
}
