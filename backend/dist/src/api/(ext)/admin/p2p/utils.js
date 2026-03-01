"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.sendP2POfferEmail = sendP2POfferEmail;
exports.sendOfferApprovalEmail = sendOfferApprovalEmail;
exports.sendOfferRejectionEmail = sendOfferRejectionEmail;
exports.sendOfferFlaggedEmail = sendOfferFlaggedEmail;
exports.sendOfferDisabledEmail = sendOfferDisabledEmail;
const emails_1 = require("@b/utils/emails");
/**
 * Send P2P offer-related emails
 */
async function sendP2POfferEmail(emailType, recipientEmail, replacements) {
    // Construct the email data
    const emailData = {
        TO: recipientEmail,
        ...replacements,
    };
    // Queue the email for sending
    await emails_1.emailQueue.add({ emailData, emailType });
}
/**
 * Send offer approval email
 */
async function sendOfferApprovalEmail(recipientEmail, replacements) {
    await sendP2POfferEmail("P2POfferApproved", recipientEmail, replacements);
}
/**
 * Send offer rejection email
 */
async function sendOfferRejectionEmail(recipientEmail, replacements) {
    await sendP2POfferEmail("P2POfferRejected", recipientEmail, replacements);
}
/**
 * Send offer flagged email
 */
async function sendOfferFlaggedEmail(recipientEmail, replacements) {
    await sendP2POfferEmail("P2POfferFlagged", recipientEmail, replacements);
}
/**
 * Send offer disabled email
 */
async function sendOfferDisabledEmail(recipientEmail, replacements) {
    await sendP2POfferEmail("P2POfferDisabled", recipientEmail, replacements);
}
