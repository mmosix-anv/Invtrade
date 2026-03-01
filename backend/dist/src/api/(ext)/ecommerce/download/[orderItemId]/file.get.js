"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.metadata = void 0;
const db_1 = require("@b/db");
const error_1 = require("@b/utils/error");
const query_1 = require("@b/utils/query");
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
const promises_1 = require("stream/promises");
const Middleware_1 = require("@b/handler/Middleware");
exports.metadata = {
    summary: "Stream digital product file",
    description: "Streams the actual file content for purchased digital products",
    operationId: "streamDigitalProductFile",
    tags: ["Ecommerce", "Downloads"],
    logModule: "ECOM",
    logTitle: "Download File",
    requiresAuth: true,
    parameters: [
        {
            index: 0,
            name: "orderItemId",
            in: "path",
            required: true,
            schema: { type: "string" },
            description: "Order item ID for the digital product to download",
        },
    ],
    responses: {
        200: {
            description: "File streamed successfully",
            content: {
                "application/octet-stream": {
                    schema: {
                        type: "string",
                        format: "binary",
                    },
                },
            },
        },
        401: query_1.unauthorizedResponse,
        404: (0, query_1.notFoundMetadataResponse)("Digital Product File"),
        500: query_1.serverErrorResponse,
    },
};
exports.default = async (data) => {
    const { ctx } = data;
    // Apply rate limiting
    await Middleware_1.rateLimiters.download(data);
    const { user, params } = data;
    const { res } = data; // res is provided by the framework at runtime
    if (!(user === null || user === void 0 ? void 0 : user.id)) {
        throw (0, error_1.createError)({ statusCode: 401, message: "Unauthorized" });
    }
    ctx === null || ctx === void 0 ? void 0 : ctx.step("Download File");
    const { orderItemId } = params;
    // Find the order item and verify ownership
    const orderItem = await db_1.models.ecommerceOrderItem.findOne({
        where: { id: orderItemId },
        include: [
            {
                model: db_1.models.ecommerceOrder,
                as: "order",
                where: { userId: user.id },
                attributes: ["id", "status", "userId"],
            },
            {
                model: db_1.models.ecommerceProduct,
                as: "product",
                attributes: ["id", "name", "type", "status"],
            },
        ],
    });
    if (!orderItem) {
        throw (0, error_1.createError)({
            statusCode: 404,
            message: "Order item not found or access denied"
        });
    }
    const orderItemData = orderItem.get({ plain: true });
    // Verify the order is completed
    if (orderItemData.order.status !== "COMPLETED") {
        throw (0, error_1.createError)({
            statusCode: 403,
            message: "Order must be completed before downloading"
        });
    }
    // Verify it's a downloadable product
    if (orderItemData.product.type !== "DOWNLOADABLE") {
        throw (0, error_1.createError)({
            statusCode: 400,
            message: "This product is not downloadable"
        });
    }
    // Check if product is still active
    if (!orderItemData.product.status) {
        throw (0, error_1.createError)({
            statusCode: 410,
            message: "This product is no longer available for download"
        });
    }
    // Check if download file exists
    if (!orderItemData.filePath) {
        throw (0, error_1.createError)({
            statusCode: 404,
            message: "Download file not found"
        });
    }
    try {
        // Define the uploads base directory (should be configured in environment)
        const uploadsBaseDir = path_1.default.resolve(process.env.UPLOAD_DIR || './uploads/ecommerce/products');
        // Sanitize the file path to prevent path traversal
        const normalizedPath = path_1.default.normalize(orderItemData.filePath);
        const resolvedPath = path_1.default.resolve(uploadsBaseDir, normalizedPath);
        // Ensure the resolved path is within the uploads directory
        if (!resolvedPath.startsWith(uploadsBaseDir)) {
            throw (0, error_1.createError)({
                statusCode: 403,
                message: "Access denied"
            });
        }
        // Verify file exists
        if (!fs_1.default.existsSync(resolvedPath)) {
            throw (0, error_1.createError)({
                statusCode: 404,
                message: "Download file not found on server"
            });
        }
        const stats = fs_1.default.statSync(resolvedPath);
        const fileName = path_1.default.basename(resolvedPath);
        // Set response headers
        res.setHeader('Content-Type', 'application/octet-stream');
        res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
        res.setHeader('Content-Length', stats.size.toString());
        // Stream the file
        const readStream = fs_1.default.createReadStream(resolvedPath);
        await (0, promises_1.pipeline)(readStream, res);
        // Log download activity
        await db_1.models.ecommerceOrderItem.update({
            updatedAt: new Date(),
            // You could add a download counter here if needed
        }, { where: { id: orderItemId } });
    }
    catch (error) {
        console.error("File streaming error:", error);
        if (!res.headersSent) {
            throw (0, error_1.createError)({
                statusCode: 500,
                message: "Error streaming file"
            });
        }
    }
};
