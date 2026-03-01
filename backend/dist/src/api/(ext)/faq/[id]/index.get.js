"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.metadata = void 0;
const db_1 = require("@b/db");
const error_1 = require("@b/utils/error");
exports.metadata = {
    summary: "Get FAQ by ID",
    description: "Retrieves a single FAQ entry by its ID, including its related FAQs, computed helpfulCount from feedback, and increments the view count.",
    operationId: "getFAQById",
    tags: ["FAQ"],
    logModule: "FAQ",
    logTitle: "Get FAQ by ID",
    parameters: [
        {
            index: 0,
            name: "id",
            in: "path",
            required: true,
            schema: { type: "string" },
            description: "FAQ ID",
        },
    ],
    responses: {
        200: {
            description: "FAQ retrieved successfully with related FAQs, helpfulCount and updated view count embedded",
            content: { "application/json": { schema: { type: "object" } } },
        },
        404: { description: "FAQ not found" },
        500: { description: "Internal Server Error" },
    },
};
exports.default = async (data) => {
    const { params, ctx } = data;
    ctx === null || ctx === void 0 ? void 0 : ctx.step(`Fetching FAQ by ID: ${params.id}`);
    const faq = await db_1.models.faq.findByPk(params.id);
    if (!faq) {
        ctx === null || ctx === void 0 ? void 0 : ctx.fail("FAQ not found");
        throw (0, error_1.createError)({ statusCode: 404, message: "FAQ not found" });
    }
    ctx === null || ctx === void 0 ? void 0 : ctx.step("Incrementing view count");
    // Increment the views count and reload the instance to get the updated value.
    await faq.increment("views", { by: 1 });
    await faq.reload();
    ctx === null || ctx === void 0 ? void 0 : ctx.step("Parsing related FAQ IDs");
    // Parse relatedFaqIds if stored as a JSON string.
    let relatedFaqIds = [];
    if (faq.relatedFaqIds) {
        if (typeof faq.relatedFaqIds === "string") {
            try {
                relatedFaqIds = JSON.parse(faq.relatedFaqIds);
            }
            catch (e) {
                // If parsing fails, default to empty array.
                relatedFaqIds = [];
            }
        }
        else if (Array.isArray(faq.relatedFaqIds)) {
            relatedFaqIds = faq.relatedFaqIds;
        }
    }
    // Fetch related FAQs if there are any related FAQ IDs.
    let relatedFaqs = [];
    if (relatedFaqIds.length > 0) {
        ctx === null || ctx === void 0 ? void 0 : ctx.step(`Fetching ${relatedFaqIds.length} related FAQs`);
        relatedFaqs = await db_1.models.faq.findAll({
            where: {
                id: relatedFaqIds,
            },
        });
    }
    ctx === null || ctx === void 0 ? void 0 : ctx.step("Calculating helpful count from feedback");
    // Compute the helpfulCount by counting all feedbacks with isHelpful true.
    const helpfulCount = await db_1.models.faqFeedback.count({
        where: {
            faqId: faq.id,
            isHelpful: true,
        },
    });
    ctx === null || ctx === void 0 ? void 0 : ctx.step("Building response data");
    // Convert the FAQ model instance to a plain object.
    const faqData = faq.toJSON();
    // Embed the related FAQs and helpfulCount within the FAQ object.
    faqData.relatedFaqs = relatedFaqs;
    faqData.helpfulCount = helpfulCount;
    ctx === null || ctx === void 0 ? void 0 : ctx.success(`FAQ retrieved successfully (views: ${faq.views}, helpful: ${helpfulCount})`);
    return faqData;
};
