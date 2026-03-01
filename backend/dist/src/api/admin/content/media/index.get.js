"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.metadata = void 0;
exports.parseFilterParam = parseFilterParam;
const constants_1 = require("@b/utils/constants");
const utils_1 = require("./utils");
const console_1 = require("@b/utils/console");
exports.metadata = {
    summary: "Fetches media files based on category and date",
    operationId: "fetchMediaFiles",
    tags: ["Admin", "Content", "Media"],
    parameters: constants_1.crudParameters,
    responses: {
        200: {
            description: "Media entries for the given category and date",
            content: {
                "application/json": {
                    schema: {
                        type: "object",
                        properties: {
                            items: {
                                type: "array",
                                items: { type: "object", additionalProperties: true },
                            },
                            pagination: {
                                type: "object",
                                properties: {
                                    totalItems: { type: "number" },
                                    currentPage: { type: "number" },
                                    perPage: { type: "number" },
                                    totalPages: { type: "number" },
                                },
                            },
                        },
                    },
                },
            },
        },
        400: {
            description: "Bad request if the category or date are not specified or filter parsing fails",
        },
        404: { description: "Not found if the media file does not exist" },
        500: { description: "Internal server error" },
    },
    requiresAuth: true,
    permission: "view.content.media",
    logModule: "ADMIN_CMS",
    logTitle: "List media files",
};
exports.default = async (data) => {
    const { query, ctx } = data;
    // Ensure media cache is initialized
    ctx === null || ctx === void 0 ? void 0 : ctx.step("Initializing media cache");
    if (!utils_1.cacheInitialized)
        await (0, utils_1.initMediaWatcher)();
    ctx === null || ctx === void 0 ? void 0 : ctx.step("Parsing query parameters");
    const page = query.page ? parseInt(query.page) : 1;
    const perPage = query.perPage ? parseInt(query.perPage) : 10;
    const sortField = query.sortField || "name";
    const sortOrder = query.sortOrder || "asc";
    // For media files, treat width and height as numeric
    const numericFields = ["width", "height"];
    // Parse the filter payload (e.g. filter: {"id": {"value": "17", "operator": "startsWith"}})
    let filters = {};
    try {
        filters = query.filter ? JSON.parse(query.filter) : {};
    }
    catch (error) {
        console_1.logger.error("MEDIA", "Error parsing filter", error);
        ctx === null || ctx === void 0 ? void 0 : ctx.warn("Failed to parse filter parameters");
        // Optionally: return a 400 error here.
    }
    // 1) Convert the raw filter param into nested + direct filter objects
    ctx === null || ctx === void 0 ? void 0 : ctx.step("Building filter criteria");
    const rawFilter = parseFilterParam(query.filter, numericFields);
    const { directFilters } = buildNestedFilters(rawFilter);
    // 2) Filter the in-memory mediaCache
    ctx === null || ctx === void 0 ? void 0 : ctx.step("Filtering media files");
    const filteredMedia = utils_1.mediaCache.filter((file) => {
        // Only include image files
        if (!/\.(jpg|jpeg|png|gif|webp)$/i.test(file.path))
            return false;
        // Check each direct filter
        return Object.entries(directFilters).every(([key, filterValue]) => {
            if (filterValue &&
                typeof filterValue === "object" &&
                "operator" in filterValue) {
                // The user specified an operator: e.g. { value: "17", operator: "startsWith" }
                const { value, operator } = filterValue;
                const opFunc = utils_1.operatorMap[operator];
                if (typeof opFunc !== "function")
                    return true; // skip if no operator func
                // If it's a numeric field, parse both sides as numbers
                if (numericFields.includes(key)) {
                    const recordVal = Number(file[key]);
                    const filterVal = parseFloat(value);
                    return opFunc({ [key]: recordVal }, key, filterVal);
                }
                else {
                    // Otherwise, treat them as strings (or whatever your operator expects)
                    return opFunc(file, key, value);
                }
            }
            else {
                // Fallback: simple equality check
                // For numeric fields, parse as number
                if (numericFields.includes(key)) {
                    return Number(file[key]) === Number(filterValue);
                }
                else {
                    return file[key] == filterValue;
                }
            }
        });
    });
    // 3) Sort the filtered media by the specified sortField + sortOrder
    ctx === null || ctx === void 0 ? void 0 : ctx.step("Sorting results");
    filteredMedia.sort((a, b) => {
        // If it's numeric, parse as number to avoid string-sorting
        const aVal = numericFields.includes(sortField)
            ? Number(a[sortField])
            : a[sortField];
        const bVal = numericFields.includes(sortField)
            ? Number(b[sortField])
            : b[sortField];
        if (aVal < bVal)
            return sortOrder === "asc" ? -1 : 1;
        if (aVal > bVal)
            return sortOrder === "asc" ? 1 : -1;
        return 0;
    });
    // 4) Paginate
    ctx === null || ctx === void 0 ? void 0 : ctx.step("Paginating results");
    const totalItems = filteredMedia.length;
    const totalPages = Math.ceil(totalItems / perPage);
    const offset = (page - 1) * perPage;
    const paginatedItems = filteredMedia.slice(offset, offset + perPage);
    ctx === null || ctx === void 0 ? void 0 : ctx.success(`Retrieved ${paginatedItems.length} media file(s) (page ${page} of ${totalPages})`);
    return {
        items: paginatedItems,
        pagination: {
            totalItems,
            currentPage: page,
            perPage,
            totalPages,
        },
    };
};
// -----------------------------------
// Helper Functions
// -----------------------------------
function parseFilterParam(filterParam, numericFields) {
    const parsedFilters = {};
    if (!filterParam)
        return parsedFilters;
    let filtersObject = {};
    if (typeof filterParam === "string") {
        try {
            filtersObject = JSON.parse(filterParam);
        }
        catch (error) {
            console_1.logger.error("MEDIA", "Error parsing filter param", error);
            return parsedFilters;
        }
    }
    // Copy the filter structure into parsedFilters
    Object.entries(filtersObject).forEach(([key, value]) => {
        const keyParts = key.split(".");
        let current = parsedFilters;
        keyParts.slice(0, -1).forEach((part) => {
            current[part] = current[part] || {};
            current = current[part];
        });
        // Assign value directly
        current[keyParts[keyParts.length - 1]] = value;
    });
    return parsedFilters;
}
function buildNestedFilters(filters) {
    const nestedFilters = {};
    const directFilters = {};
    Object.entries(filters).forEach(([fullKey, value]) => {
        // If it's a boolean or an operator-based object => direct
        if (typeof value === "boolean" ||
            (typeof value === "object" && "operator" in value && "value" in value)) {
            directFilters[fullKey] = value;
        }
        else {
            // Otherwise, it's a nested filter
            const keys = fullKey.split(".");
            let current = nestedFilters;
            for (let i = 0; i < keys.length - 1; i++) {
                const k = keys[i];
                current[k] = current[k] || {};
                current = current[k];
            }
            current[keys[keys.length - 1]] = value;
        }
    });
    return { nestedFilters: applyOperatorMapping(nestedFilters), directFilters };
}
function applyOperatorMapping(filters) {
    const whereClause = {};
    const processFilters = (currentFilters, parentObject) => {
        Object.entries(currentFilters).forEach(([key, value]) => {
            if (value &&
                typeof value === "object" &&
                value.operator &&
                utils_1.operatorMap[value.operator]) {
                // Keep operator + value as is
                parentObject[key] = { operator: value.operator, value: value.value };
            }
            else if (value && typeof value === "object" && !value.operator) {
                // Recurse deeper
                parentObject[key] = {};
                processFilters(value, parentObject[key]);
            }
            else {
                parentObject[key] = value;
            }
        });
    };
    processFilters(filters, whereClause);
    return whereClause;
}
