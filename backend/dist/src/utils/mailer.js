"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.sendEmailWithProvider = sendEmailWithProvider;
exports.emailWithSendgrid = emailWithSendgrid;
exports.emailWithNodemailerService = emailWithNodemailerService;
exports.emailWithNodemailerSmtp = emailWithNodemailerSmtp;
exports.prepareEmailTemplate = prepareEmailTemplate;
exports.fetchAndProcessEmailTemplate = fetchAndProcessEmailTemplate;
exports.replaceTemplateVariables = replaceTemplateVariables;
const mail_1 = __importDefault(require("@sendgrid/mail"));
const fs_1 = __importDefault(require("fs"));
const nodemailer_1 = __importDefault(require("nodemailer"));
const constants_1 = require("./constants");
const error_1 = require("./error");
const db_1 = require("@b/db");
const emailTemplates_1 = require("./emailTemplates");
const console_1 = require("@b/utils/console");
async function sendEmailWithProvider(provider, options) {
    try {
        switch (provider) {
            case "local":
                const localSenderName = process.env.APP_EMAIL_SENDER_NAME || constants_1.NEXT_PUBLIC_SITE_NAME || "Support";
                const localSenderEmail = process.env.NEXT_PUBLIC_APP_EMAIL || "no-reply@localhost";
                options.from = `"${localSenderName}" <${localSenderEmail}>`;
                await emailWithLocalSMTP(options);
                break;
            case "nodemailer-service":
                const serviceSenderName = process.env.APP_EMAIL_SENDER_NAME || constants_1.NEXT_PUBLIC_SITE_NAME || "Support";
                options.from = `"${serviceSenderName}" <${constants_1.APP_NODEMAILER_SERVICE_SENDER}>`;
                await emailWithNodemailerService(constants_1.APP_NODEMAILER_SERVICE_SENDER, constants_1.APP_NODEMAILER_SERVICE_PASSWORD, constants_1.APP_NODEMAILER_SERVICE, options);
                break;
            case "nodemailer-smtp":
                const senderEmail = process.env.NEXT_PUBLIC_APP_EMAIL &&
                    process.env.NEXT_PUBLIC_APP_EMAIL !== ""
                    ? process.env.NEXT_PUBLIC_APP_EMAIL
                    : constants_1.APP_NODEMAILER_SMTP_SENDER;
                const senderName = process.env.APP_EMAIL_SENDER_NAME || constants_1.NEXT_PUBLIC_SITE_NAME || "Support";
                options.from = `"${senderName}" <${senderEmail}>`;
                // Determine secure setting based on port and encryption setting
                const isSecure = constants_1.APP_NODEMAILER_SMTP_PORT === "465" || constants_1.APP_NODEMAILER_SMTP_ENCRYPTION === "ssl";
                await emailWithNodemailerSmtp(constants_1.APP_NODEMAILER_SMTP_SENDER, constants_1.APP_NODEMAILER_SMTP_PASSWORD, constants_1.APP_NODEMAILER_SMTP_HOST, constants_1.APP_NODEMAILER_SMTP_PORT, isSecure, options);
                break;
            case "nodemailer-sendgrid":
                const sendgridSenderName = process.env.APP_EMAIL_SENDER_NAME || constants_1.NEXT_PUBLIC_SITE_NAME || "Support";
                options.from = `"${sendgridSenderName}" <${constants_1.APP_SENDGRID_SENDER}>`;
                await emailWithSendgrid(options);
                break;
            default:
                throw (0, error_1.createError)({ statusCode: 500, message: "Unsupported email provider" });
        }
    }
    catch (error) {
        console_1.logger.error("EMAIL", "Failed to send email with provider", error);
        throw error;
    }
}
async function emailWithLocalSMTP(options) {
    try {
        const transporterOptions = {
            sendmail: true,
            newline: "unix",
            path: constants_1.APP_SENDMAIL_PATH,
        };
        const APP_NODEMAILER_DKIM_PRIVATE_KEY = process.env.APP_NODEMAILER_DKIM_PRIVATE_KEY || "";
        const APP_NODEMAILER_DKIM_DOMAIN = process.env.APP_NODEMAILER_DKIM_DOMAIN || "";
        const APP_NODEMAILER_DKIM_SELECTOR = process.env.APP_NODEMAILER_DKIM_SELECTOR || "default";
        if (APP_NODEMAILER_DKIM_PRIVATE_KEY &&
            APP_NODEMAILER_DKIM_DOMAIN &&
            APP_NODEMAILER_DKIM_SELECTOR) {
            transporterOptions.dkim = {
                privateKey: fs_1.default.readFileSync(APP_NODEMAILER_DKIM_PRIVATE_KEY, "utf8"),
                domainName: APP_NODEMAILER_DKIM_DOMAIN,
                keySelector: APP_NODEMAILER_DKIM_SELECTOR,
            };
        }
        const transporter = nodemailer_1.default.createTransport(transporterOptions);
        const mailOptions = {
            from: options.from,
            to: options.to,
            subject: options.subject,
            html: options.html,
            text: options.text,
        };
        await transporter.sendMail(mailOptions);
    }
    catch (error) {
        console_1.logger.error("EMAIL", "Failed to send email with local SMTP", error);
        throw error;
    }
}
async function emailWithSendgrid(options) {
    const apiKey = constants_1.APP_SENDGRID_API_KEY;
    if (!apiKey)
        throw (0, error_1.createError)({
            statusCode: 500,
            message: "Sendgrid Api key not found. Cannot send email. Aborting.",
        });
    try {
        mail_1.default.setApiKey(apiKey);
        const msg = {
            to: options.to,
            from: options.from,
            subject: options.subject,
            html: options.html ? options.html : options.text,
        };
        await mail_1.default.send(msg);
    }
    catch (error) {
        console_1.logger.error("EMAIL", "Failed to send email with Sendgrid", error);
        throw error;
    }
}
async function emailWithNodemailerService(sender, password, service, options) {
    const emailOptions = {
        from: options.from,
        to: options.to,
        subject: options.subject,
        html: options.html,
    };
    if (!service)
        throw (0, error_1.createError)({
            statusCode: 500,
            message: "Email service not specified. Aborting email send.",
        });
    if (!sender)
        throw (0, error_1.createError)({
            statusCode: 500,
            message: "Email user not specified. Aborting email send.",
        });
    if (!password)
        throw (0, error_1.createError)({
            statusCode: 500,
            message: "Email password not specified. Aborting email send.",
        });
    try {
        const transporter = await nodemailer_1.default.createTransport({
            service: service,
            auth: {
                user: sender,
                pass: password,
            },
            tls: {
                rejectUnauthorized: false,
            },
        });
        await transporter.verify();
        await transporter.sendMail(emailOptions);
    }
    catch (error) {
        console_1.logger.error("EMAIL", "Failed to send email with nodemailer service", error);
        throw error;
    }
}
async function emailWithNodemailerSmtp(sender, password, host, port, smtpEncryption, options) {
    const emailOptions = {
        from: options.from,
        to: options.to,
        subject: options.subject,
        html: options.html,
    };
    if (!host)
        throw (0, error_1.createError)({
            statusCode: 500,
            message: "Email host not specified. Aborting email send.",
        });
    if (!sender)
        throw (0, error_1.createError)({
            statusCode: 500,
            message: "Email user not specified. Aborting email send.",
        });
    if (!password)
        throw (0, error_1.createError)({
            statusCode: 500,
            message: "Email password not specified. Aborting email send.",
        });
    try {
        const portNum = parseInt(port);
        // Port 465 = implicit SSL (secure: true)
        // Port 587 = STARTTLS (secure: false, but uses TLS after STARTTLS command)
        // Port 25 = no encryption (secure: false)
        const useSecure = portNum === 465 || smtpEncryption;
        const transportConfig = {
            host: host,
            port: portNum,
            pool: true,
            secure: useSecure,
            auth: {
                user: sender,
                pass: password,
            },
            tls: {
                rejectUnauthorized: false,
                // For port 587, we need to allow the connection to start unencrypted
                // then upgrade via STARTTLS
                minVersion: "TLSv1.2",
            },
        };
        console_1.logger.debug("SMTP", `Connecting to ${host}:${portNum}, secure: ${useSecure}`);
        const transporter = await nodemailer_1.default.createTransport(transportConfig);
        await transporter.verify();
        await transporter.sendMail(emailOptions);
    }
    catch (error) {
        console_1.logger.error("SMTP", "Error sending email", error);
        throw error;
    }
}
/**
 * Convert CSS class-based HTML to inline styles for email client compatibility.
 * Email clients (especially Gmail) strip <style> tags, so we need inline styles.
 */
function convertToInlineStyles(html) {
    // Define inline style mappings for common email template classes
    const styleMap = {
        // Transaction/Info Cards
        'transaction-card': 'background-color: #f9fafb; border: 1px solid #e5e7eb; border-radius: 12px; padding: 20px; margin: 24px 0;',
        'transaction-row': 'display: flex; justify-content: space-between; align-items: center; padding: 12px 0; border-bottom: 1px solid #e5e7eb;',
        'transaction-label': 'color: #6b7280; font-size: 14px;',
        'transaction-value': 'color: #111827; font-size: 14px; font-weight: 600;',
        'transaction-value positive': 'color: #059669; font-size: 14px; font-weight: 600;',
        'transaction-value negative': 'color: #dc2626; font-size: 14px; font-weight: 600;',
        // Info Card
        'info-card': 'background-color: #f9fafb; border: 1px solid #e5e7eb; border-radius: 12px; padding: 20px; margin: 24px 0;',
        'info-card-title': 'font-size: 16px; font-weight: 600; color: #111827; margin-bottom: 12px;',
        'info-card-content': 'color: #6b7280; font-size: 14px; line-height: 1.6;',
        // Highlight Box
        'highlight-box': 'background: linear-gradient(135deg, #ede9fe 0%, #dbeafe 100%); border: 1px solid #c7d2fe; border-radius: 12px; padding: 24px; margin: 24px 0; text-align: center;',
        'highlight-value': 'font-size: 32px; font-weight: 700; color: #111827; margin-bottom: 4px; font-family: monospace; letter-spacing: 0.05em;',
        'highlight-label': 'color: #6b7280; font-size: 14px; font-weight: 500;',
        // Buttons
        'btn': 'display: inline-block; padding: 14px 32px; background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%); color: #ffffff; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 15px; text-align: center;',
        'btn-secondary': 'display: inline-block; padding: 14px 32px; background-color: #f3f4f6; color: #374151; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 15px; text-align: center; border: 1px solid #e5e7eb;',
        'btn-success': 'display: inline-block; padding: 14px 32px; background: linear-gradient(135deg, #059669 0%, #10b981 100%); color: #ffffff; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 15px; text-align: center;',
        // Alerts
        'alert': 'padding: 16px 20px; border-radius: 8px; margin: 20px 0; font-size: 14px; line-height: 1.6;',
        'alert alert-info': 'padding: 16px 20px; border-radius: 8px; margin: 20px 0; font-size: 14px; line-height: 1.6; background-color: #eff6ff; border: 1px solid #bfdbfe; color: #1e40af;',
        'alert alert-success': 'padding: 16px 20px; border-radius: 8px; margin: 20px 0; font-size: 14px; line-height: 1.6; background-color: #ecfdf5; border: 1px solid #a7f3d0; color: #047857;',
        'alert alert-warning': 'padding: 16px 20px; border-radius: 8px; margin: 20px 0; font-size: 14px; line-height: 1.6; background-color: #fffbeb; border: 1px solid #fde68a; color: #b45309;',
        'alert alert-error': 'padding: 16px 20px; border-radius: 8px; margin: 20px 0; font-size: 14px; line-height: 1.6; background-color: #fef2f2; border: 1px solid #fecaca; color: #dc2626;',
        // Code Block
        'code-block': 'background-color: #1f2937; border-radius: 8px; padding: 16px 20px; font-family: monospace; font-size: 13px; color: #e5e7eb; margin: 16px 0; overflow-x: auto;',
        // Stats
        'stats-grid': 'margin: 24px 0;',
        'stat-card': 'background-color: #f9fafb; border: 1px solid #e5e7eb; border-radius: 8px; padding: 16px; text-align: center; display: inline-block; margin: 8px;',
        'stat-value': 'font-size: 24px; font-weight: 700; color: #6366f1; margin-bottom: 4px;',
        'stat-label': 'font-size: 12px; color: #6b7280; text-transform: uppercase; letter-spacing: 0.05em;',
        // Divider
        'divider': 'height: 1px; background-color: #e5e7eb; margin: 24px 0;',
        // Security Badge
        'security-badge': 'display: inline-block; padding: 8px 16px; background-color: #ecfdf5; border: 1px solid #a7f3d0; border-radius: 50px; color: #059669; font-size: 13px; font-weight: 500;',
    };
    let result = html;
    // Process compound classes first (longer matches), then single classes
    const sortedClasses = Object.keys(styleMap).sort((a, b) => b.length - a.length);
    for (const className of sortedClasses) {
        const inlineStyle = styleMap[className];
        // Match class="className" or class='className' and add inline styles
        const classRegex = new RegExp(`class=["']${className.replace(/\s+/g, '\\s+')}["']`, 'gi');
        result = result.replace(classRegex, `style="${inlineStyle}"`);
    }
    // Also handle h1, h2, h3, p tags with default styling for better email rendering
    result = result.replace(/<h1(?![^>]*style)/gi, '<h1 style="color: #111827; font-size: 24px; font-weight: 700; margin: 0 0 16px 0; line-height: 1.3;"');
    result = result.replace(/<h2(?![^>]*style)/gi, '<h2 style="color: #111827; font-size: 20px; font-weight: 600; margin: 24px 0 12px 0; line-height: 1.3;"');
    result = result.replace(/<h3(?![^>]*style)/gi, '<h3 style="color: #374151; font-size: 16px; font-weight: 600; margin: 20px 0 8px 0; line-height: 1.3;"');
    result = result.replace(/<p(?![^>]*style)/gi, '<p style="color: #4b5563; font-size: 15px; line-height: 1.7; margin: 0 0 16px 0;"');
    return result;
}
async function prepareEmailTemplate(processedTemplate, processedSubject) {
    const generalTemplate = (0, emailTemplates_1.loadEmailTemplate)("generalTemplate");
    if (!generalTemplate) {
        throw (0, error_1.createError)({
            statusCode: 500,
            message: "General email template not found",
        });
    }
    // Use direct logo links instead of settings
    const logoUrl = `${constants_1.NEXT_PUBLIC_SITE_URL}/img/logo/logo-text.webp`;
    const siteName = constants_1.NEXT_PUBLIC_SITE_NAME || "Invtrade";
    // Convert CSS classes to inline styles for email client compatibility
    const styledTemplate = convertToInlineStyles(processedTemplate);
    const replacements = {
        "%SITE_URL%": constants_1.NEXT_PUBLIC_SITE_URL,
        "%SITE_NAME%": siteName,
        "%LOGO_URL%": logoUrl,
        "%HEADER%": processedSubject,
        "%MESSAGE%": styledTemplate,
        "%SUBJECT%": processedSubject,
        "%FOOTER%": siteName,
    };
    return Object.entries(replacements).reduce((acc, [key, value]) => replaceAllOccurrences(acc, key, value), generalTemplate);
}
async function fetchAndProcessEmailTemplate(specificVariables, templateName) {
    try {
        const templateRecord = await db_1.models.notificationTemplate.findOne({
            where: { name: templateName },
        });
        if (!templateRecord || !templateRecord.email || !templateRecord.emailBody)
            throw (0, error_1.createError)({
                statusCode: 404,
                message: "Email template not found or email not enabled",
            });
        const basicVariables = {
            URL: constants_1.NEXT_PUBLIC_SITE_URL,
        };
        const variables = {
            ...basicVariables,
            ...specificVariables,
        };
        const processedTemplate = replaceTemplateVariables(templateRecord.emailBody, variables);
        const processedSubject = replaceTemplateVariables(templateRecord.subject, variables);
        return { processedTemplate, processedSubject, templateRecord };
    }
    catch (error) {
        console_1.logger.error("EMAIL", "Failed to fetch and process email template", error);
        throw error;
    }
}
function replaceTemplateVariables(template, variables) {
    if (typeof template !== "string") {
        console_1.logger.error("MAILER", "Template is not a string");
        return "";
    }
    return Object.entries(variables).reduce((acc, [key, value]) => {
        if (value === undefined) {
            console_1.logger.debug("MAILER", `Variable ${key} is undefined`);
            return acc;
        }
        return acc.replace(new RegExp(`%${key}%`, "g"), String(value));
    }, template);
}
function replaceAllOccurrences(str, search, replace) {
    if (str == null) {
        console_1.logger.error("MAILER", "Input string is null or undefined");
        return "";
    }
    const regex = new RegExp(search, "g");
    return str.replace(regex, replace);
}
