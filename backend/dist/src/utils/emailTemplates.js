"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.EMAIL_TEMPLATES = void 0;
exports.loadEmailTemplate = loadEmailTemplate;
exports.replaceTemplateVariables = replaceTemplateVariables;
exports.processStandaloneTemplate = processStandaloneTemplate;
exports.getAvailableTemplates = getAvailableTemplates;
exports.validateTemplateVariables = validateTemplateVariables;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const error_1 = require("../utils/error");
const console_1 = require("./console");
/**
 * Get the correct email templates directory path with multiple fallbacks
 */
function getEmailTemplatesPath() {
    // Try multiple paths for email templates directory - similar to .env file loading
    const templatePaths = [
        path_1.default.resolve(process.cwd(), "backend", "email", "templates"), // Production path (PRIORITY)
        path_1.default.resolve(__dirname, "../../../email", "templates"), // Development relative path from src/utils
        path_1.default.resolve(process.cwd(), "email", "templates"), // Legacy fallback
        path_1.default.resolve(__dirname, "../../email", "templates"), // Another relative fallback
    ];
    for (const templatePath of templatePaths) {
        if (fs_1.default.existsSync(templatePath)) {
            console_1.logger.debug("EMAIL", `Templates directory found at: ${templatePath}`);
            return templatePath;
        }
    }
    console_1.logger.warn("EMAIL", `No email templates directory found. Tried paths: ${templatePaths.join(", ")}`);
    // Return the first path as fallback (production path)
    return templatePaths[0];
}
/**
 * Load an email template from the templates directory
 */
function loadEmailTemplate(templateName) {
    const templatesDir = getEmailTemplatesPath();
    const templatePath = path_1.default.join(templatesDir, `${templateName}.html`);
    try {
        return fs_1.default.readFileSync(templatePath, "utf-8");
    }
    catch (error) {
        throw (0, error_1.createError)({
            statusCode: 500,
            message: `Email template '${templateName}' not found at ${templatePath}`,
        });
    }
}
/**
 * Replace variables in a template string
 */
function replaceTemplateVariables(template, variables) {
    if (typeof template !== "string") {
        console_1.logger.error("EMAIL", "Template is not a string");
        return "";
    }
    return Object.entries(variables).reduce((acc, [key, value]) => {
        if (value === undefined) {
            console_1.logger.warn("EMAIL", `Variable ${key} is undefined`);
            return acc;
        }
        return acc.replace(new RegExp(`%${key}%`, "g"), String(value));
    }, template);
}
/**
 * Process a standalone email template (not wrapped in general template)
 */
function processStandaloneTemplate(templateName, variables) {
    const template = loadEmailTemplate(templateName);
    return replaceTemplateVariables(template, variables);
}
/**
 * Get list of available email templates
 */
function getAvailableTemplates() {
    const templatesDir = getEmailTemplatesPath();
    try {
        return fs_1.default
            .readdirSync(templatesDir)
            .filter((file) => file.endsWith(".html"))
            .map((file) => file.replace(".html", ""));
    }
    catch (error) {
        console_1.logger.error("EMAIL", "Error reading templates directory", error);
        return [];
    }
}
/**
 * Validate that all required variables are provided
 */
function validateTemplateVariables(template, providedVariables) {
    const variablePattern = /%([A-Z_]+)%/g;
    const requiredVariables = new Set();
    let match;
    while ((match = variablePattern.exec(template)) !== null) {
        requiredVariables.add(match[1]);
    }
    const missingVariables = Array.from(requiredVariables).filter((variable) => !(variable in providedVariables) || providedVariables[variable] === undefined);
    return {
        isValid: missingVariables.length === 0,
        missingVariables,
    };
}
/**
 * Email template types for better type safety
 */
exports.EMAIL_TEMPLATES = {
    GENERAL: "generalTemplate",
    WELCOME: "welcome",
    NOTIFICATION: "notification",
};
