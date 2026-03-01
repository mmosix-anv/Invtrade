"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.metadata = void 0;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const error_1 = require("@b/utils/error");
const errors_1 = require("@b/utils/schema/errors");
/**
 * Recursively scans a directory to find all page.tsx files
 * @param dir - Directory to scan
 * @param basePath - Base path for building routes (default: "")
 * @returns Array of route paths
 */
function getPagePaths(dir, basePath = "") {
    const entries = fs_1.default.readdirSync(dir, { withFileTypes: true });
    const paths = [];
    for (const entry of entries) {
        const fullPath = path_1.default.join(dir, entry.name);
        if (entry.isDirectory()) {
            // Skip certain directories
            if (entry.name.startsWith("_") ||
                entry.name.startsWith(".") ||
                entry.name === "api" ||
                entry.name === "admin" ||
                entry.name === "auth") {
                continue;
            }
            // Build the route path
            let routePart = entry.name;
            // Handle dynamic routes [param] and remove locale from path
            if (routePart.startsWith("[") && routePart.endsWith("]")) {
                if (routePart === "[locale]") {
                    // Skip locale in the path
                    routePart = "";
                }
                else {
                    // Keep other dynamic params as-is for now
                    routePart = routePart;
                }
            }
            const newBasePath = routePart ? `${basePath}/${routePart}` : basePath;
            paths.push(...getPagePaths(fullPath, newBasePath));
        }
        else if (entry.name === "page.tsx" || entry.name === "page.jsx") {
            // Found a page file, add the route
            const routePath = basePath || "/";
            paths.push(routePath);
        }
    }
    return paths;
}
/**
 * Transforms raw paths into structured page link objects
 * @param rawPaths - Array of raw route paths
 * @returns Array of structured page links
 */
function transformToPageLinks(rawPaths) {
    return rawPaths
        .filter((p) => {
        // Exclude admin, auth, API, and error pages
        return (!p.includes("/admin") &&
            !p.includes("/auth") &&
            !p.includes("/api") &&
            !p.includes("/error") &&
            !p.includes("/_") &&
            p !== "/404" &&
            p !== "/500");
    })
        .map((p) => {
        // Extract group from path (first segment after root)
        const segments = p.split("/").filter(Boolean);
        const group = segments[0] || "general";
        // Create a friendly name from the path
        const name = segments.length > 0
            ? segments
                .join(" > ")
                .replace(/\[|\]/g, "")
                .replace(/-/g, " ")
                .replace(/\b\w/g, (c) => c.toUpperCase())
            : "Home";
        return {
            id: p,
            path: p,
            name,
            group: group.charAt(0).toUpperCase() + group.slice(1),
        };
    });
}
exports.metadata = {
    summary: "Get Available Page Links",
    description: "Automatically scans the Next.js app directory to retrieve a list of available page paths. Excludes admin, auth, utility, and error pages. Returns page paths with metadata for FAQ assignment.",
    operationId: "getFaqPageLinks",
    tags: ["Admin", "FAQ", "Pages"],
    requiresAuth: true,
    responses: {
        200: {
            description: "Page links retrieved successfully",
            content: {
                "application/json": {
                    schema: {
                        type: "array",
                        items: {
                            type: "object",
                            properties: {
                                id: { type: "string", description: "Unique identifier (same as path)" },
                                path: { type: "string", description: "Page path" },
                                name: { type: "string", description: "User-friendly page name" },
                                group: { type: "string", description: "Page group/section" },
                            },
                        },
                    },
                },
            },
        },
        401: errors_1.unauthorizedResponse,
        500: errors_1.serverErrorResponse,
    },
    permission: "view.faq",
    logModule: "ADMIN_FAQ",
    logTitle: "Get FAQ page links",
};
exports.default = async (data) => {
    const { user, ctx } = data;
    if (!(user === null || user === void 0 ? void 0 : user.id)) {
        throw (0, error_1.createError)({ statusCode: 401, message: "Unauthorized" });
    }
    // Locate the Next.js app directory
    // Development: backend runs from /project/backend/, needs ".." to reach /project/frontend/
    // Production: backend runs from /public_html/, frontend is at /public_html/frontend/
    const isProduction = process.env.NODE_ENV === 'production';
    const appDir = isProduction
        ? path_1.default.join(process.cwd(), "frontend", "app")
        : path_1.default.join(process.cwd(), "..", "frontend", "app");
    let rawPaths = [];
    try {
        ctx === null || ctx === void 0 ? void 0 : ctx.step("Scanning page directories");
        rawPaths = getPagePaths(appDir);
    }
    catch (err) {
        console.error("Error scanning pages directory:", err);
        ctx === null || ctx === void 0 ? void 0 : ctx.fail("Failed to scan page directories");
        throw (0, error_1.createError)({
            statusCode: 500,
            message: "Failed to retrieve page links",
        });
    }
    // Transform raw paths into structured page links, skipping certain prefixes
    const pageLinks = transformToPageLinks(rawPaths);
    // Remove duplicates if any, then return
    const uniqueLinks = Array.from(new Set(pageLinks.map((pl) => pl.path))).map((path) => pageLinks.find((pl) => pl.path === path));
    ctx === null || ctx === void 0 ? void 0 : ctx.success("Page links retrieved successfully");
    return uniqueLinks;
};
