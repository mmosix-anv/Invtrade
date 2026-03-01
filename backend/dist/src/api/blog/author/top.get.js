"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.metadata = void 0;
// backend/src/api/(ext)/admin/blog/author/top.get.ts
const db_1 = require("@b/db");
const error_1 = require("@b/utils/error");
const sequelize_1 = require("sequelize");
const console_1 = require("@b/utils/console");
exports.metadata = {
    summary: "Get Top Blog Authors",
    description: "Retrieves top authors based on post counts.",
    operationId: "getAdminTopBlogAuthors",
    tags: ["Blog", "Admin", "Authors"],
    requiresAuth: true,
    responses: {
        200: {
            description: "Top authors retrieved successfully",
            content: {
                "application/json": {
                    schema: {
                        type: "array",
                        items: {
                            type: "object",
                            properties: {
                                id: { type: "string" },
                                userId: { type: "string" },
                                status: { type: "string" },
                                postCount: { type: "number" },
                                user: {
                                    type: "object",
                                    properties: {
                                        id: { type: "string" },
                                        firstName: { type: "string" },
                                        lastName: { type: "string" },
                                        email: { type: "string" },
                                        avatar: { type: "string" },
                                        profile: { type: "object" },
                                        role: {
                                            type: "object",
                                            properties: {
                                                name: { type: "string" }
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        },
        401: {
            description: "Unauthorized"
        },
        500: {
            description: "Internal server error"
        }
    }
};
exports.default = async (data) => {
    const { user } = data;
    if (!(user === null || user === void 0 ? void 0 : user.id)) {
        throw (0, error_1.createError)({ statusCode: 401, message: "Unauthorized" });
    }
    try {
        // Get top authors with post counts using a subquery approach
        const topAuthors = await db_1.models.author.findAll({
            attributes: [
                "id",
                "userId",
                "status",
                [
                    (0, sequelize_1.literal)(`(
            SELECT COUNT(*)
            FROM post
            WHERE post.authorId = author.id
            AND post.status = 'PUBLISHED'
            AND post.deletedAt IS NULL
          )`),
                    "postCount"
                ],
            ],
            include: [
                {
                    model: db_1.models.user,
                    as: "user",
                    attributes: ["id", "firstName", "lastName", "email", "avatar", "profile"],
                    include: [
                        {
                            model: db_1.models.role,
                            as: "role",
                            attributes: ["name"],
                        },
                    ],
                },
            ],
            order: [[(0, sequelize_1.literal)("postCount"), "DESC"]],
            limit: 5,
        });
        // Convert to plain objects and ensure postCount is a number
        return topAuthors.map(author => {
            const plainAuthor = author.get({ plain: true });
            return {
                ...plainAuthor,
                postCount: parseInt(plainAuthor.postCount) || 0,
            };
        });
    }
    catch (error) {
        console_1.logger.error("BLOG", "Error fetching top authors", error);
        throw (0, error_1.createError)({
            statusCode: 500,
            message: "Failed to fetch top authors",
        });
    }
};
