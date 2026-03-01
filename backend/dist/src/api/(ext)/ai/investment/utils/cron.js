"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.processAiInvestments = processAiInvestments;
exports.getActiveInvestments = getActiveInvestments;
exports.processAiInvestment = processAiInvestment;
const db_1 = require("@b/db");
const console_1 = require("@b/utils/console");
const date_fns_1 = require("date-fns");
const index_get_1 = require("@b/api/finance/transaction/[id]/index.get");
const utils_1 = require("@b/api/finance/wallet/utils");
const emails_1 = require("@b/utils/emails");
const notifications_1 = require("@b/utils/notifications");
const affiliate_1 = require("@b/utils/affiliate");
const broadcast_1 = require("@b/cron/broadcast");
const wallet_1 = require("@b/services/wallet");
// 1. Main cron entry point: runs on a schedule
async function processAiInvestments() {
    const cronName = "processAiInvestments";
    const startTime = Date.now();
    try {
        (0, broadcast_1.broadcastStatus)(cronName, "running");
        (0, broadcast_1.broadcastLog)(cronName, "Starting AI investments processing");
        const activeInvestments = await getActiveInvestments();
        const total = activeInvestments.length;
        (0, broadcast_1.broadcastLog)(cronName, `Found ${total} active AI investments`);
        // Process each active AI investment
        for (let i = 0; i < total; i++) {
            const investment = activeInvestments[i];
            (0, broadcast_1.broadcastLog)(cronName, `Processing AI investment id ${investment.id} (current status: ${investment.status})`);
            try {
                // Attempt to process this investment
                const updated = await processAiInvestment(investment);
                if (updated) {
                    (0, broadcast_1.broadcastLog)(cronName, `Successfully processed AI investment id ${investment.id}`, "success");
                }
                else {
                    (0, broadcast_1.broadcastLog)(cronName, `No update for AI investment id ${investment.id}`, "warning");
                }
            }
            catch (error) {
                // If an error happens in processing this one, log/broadcast but continue with others
                console_1.logger.error("AI_INVESTMENT_PROCESS", `Error processing investment ${investment.id}: ${error.message}`, error);
                (0, broadcast_1.broadcastLog)(cronName, `Error processing AI investment id ${investment.id}: ${error.message}`, "error");
                continue;
            }
            // Broadcast incremental progress
            const progress = Math.round(((i + 1) / total) * 100);
            (0, broadcast_1.broadcastProgress)(cronName, progress);
        }
        // All done
        (0, broadcast_1.broadcastStatus)(cronName, "completed", {
            duration: Date.now() - startTime,
        });
        (0, broadcast_1.broadcastLog)(cronName, "AI investments processing completed", "success");
    }
    catch (error) {
        console_1.logger.error("AI_INVESTMENT_PROCESS", `AI investments processing failed: ${error.message}`, error);
        (0, broadcast_1.broadcastStatus)(cronName, "failed");
        (0, broadcast_1.broadcastLog)(cronName, `AI investments processing failed: ${error.message}`, "error");
        throw error;
    }
}
// 2. Fetch all active AI investments from the DB
async function getActiveInvestments() {
    try {
        return await db_1.models.aiInvestment.findAll({
            where: { status: "ACTIVE" },
            include: [
                {
                    model: db_1.models.aiInvestmentPlan,
                    as: "plan",
                    attributes: [
                        "id",
                        "name",
                        "title",
                        "description",
                        "defaultProfit",
                        "defaultResult",
                    ],
                },
                {
                    model: db_1.models.aiInvestmentDuration,
                    as: "duration",
                    attributes: ["id", "duration", "timeframe"],
                },
            ],
            order: [
                ["status", "ASC"],
                ["createdAt", "ASC"],
            ],
        });
    }
    catch (error) {
        console_1.logger.error("AI_INVESTMENT_PROCESS", "Failed to get active investments", error);
        throw error;
    }
}
// 3. Process a single AI investment
async function processAiInvestment(investment) {
    var _a;
    const cronName = "processAiInvestments";
    try {
        // If it's already completed, skip
        if (investment.status === "COMPLETED") {
            (0, broadcast_1.broadcastLog)(cronName, `Investment ${investment.id} is already COMPLETED; skipping`, "info");
            return null;
        }
        // Fetch user
        (0, broadcast_1.broadcastLog)(cronName, `Fetching user for AI investment ${investment.id}`);
        const user = await db_1.models.user.findByPk(investment.userId);
        if (!user) {
            (0, broadcast_1.broadcastLog)(cronName, `User not found for AI investment ${investment.id}`, "error");
            return null;
        }
        // Calculate ROI and result
        const roi = (_a = investment.profit) !== null && _a !== void 0 ? _a : investment.plan.defaultProfit;
        (0, broadcast_1.broadcastLog)(cronName, `Calculated ROI (${roi}) for AI investment ${investment.id}`);
        const investmentResult = investment.result || investment.plan.defaultResult;
        (0, broadcast_1.broadcastLog)(cronName, `Determined result (${investmentResult}) for AI investment ${investment.id}`);
        // Check if end date has passed
        const endDate = calculateEndDate(investment);
        if ((0, date_fns_1.isPast)(endDate)) {
            (0, broadcast_1.broadcastLog)(cronName, `AI investment ${investment.id} is eligible for processing (end date passed)`);
            // Attempt to update the investment
            const updatedInvestment = await handleAiInvestmentUpdate(investment, user, roi, investmentResult);
            if (updatedInvestment) {
                // If updated, do post-processing
                await postProcessAiInvestment(user, investment, updatedInvestment);
            }
            return updatedInvestment;
        }
        else {
            (0, broadcast_1.broadcastLog)(cronName, `AI investment ${investment.id} is not ready (end date not reached)`, "info");
            return null;
        }
    }
    catch (error) {
        console_1.logger.error("AI_INVESTMENT_PROCESS", `General error processing AI investment ${investment.id}: ${error.message}`, error);
        (0, broadcast_1.broadcastLog)(cronName, `General error processing AI investment ${investment.id}: ${error.message}`, "error");
        throw error;
    }
}
// 4. Helper to compute the end date
function calculateEndDate(investment) {
    const createdAt = new Date(investment.createdAt);
    switch (investment.duration.timeframe) {
        case "HOUR":
            return (0, date_fns_1.addHours)(createdAt, investment.duration.duration);
        case "DAY":
            return (0, date_fns_1.addDays)(createdAt, investment.duration.duration);
        case "WEEK":
            return (0, date_fns_1.addDays)(createdAt, investment.duration.duration * 7);
        case "MONTH":
            return (0, date_fns_1.addDays)(createdAt, investment.duration.duration * 30);
        default:
            return (0, date_fns_1.addHours)(createdAt, investment.duration.duration);
    }
}
// 5. Single transaction to update wallet, create transaction, mark investment completed
async function handleAiInvestmentUpdate(investment, user, roi, investmentResult) {
    var _a;
    const cronName = "processAiInvestments";
    let updatedInvestment;
    const t = await db_1.sequelize.transaction();
    try {
        (0, broadcast_1.broadcastLog)(cronName, `Starting update for AI investment ${investment.id}`);
        // 5a. Ensure transaction record and wallet exist
        const transactionRecord = await (0, index_get_1.getTransactionByRefId)(investment.id);
        if (!transactionRecord) {
            (0, broadcast_1.broadcastLog)(cronName, `Transaction not found for AI investment ${investment.id}, removing investment`, "error");
            await db_1.models.aiInvestment.destroy({
                where: { id: investment.id },
                transaction: t,
            });
            await t.commit();
            return null;
        }
        const wallet = await (0, utils_1.getWalletById)(transactionRecord.walletId);
        if (!wallet) {
            (0, broadcast_1.broadcastLog)(cronName, `Wallet not found for user ${user.id} (AI investment ${investment.id})`, "error");
            await t.rollback();
            return null;
        }
        // 5b. Calculate payout amount based on result
        const amount = (_a = investment.amount) !== null && _a !== void 0 ? _a : 0;
        let payoutAmount = 0;
        if (investmentResult === "WIN") {
            payoutAmount = amount + roi;
        }
        else if (investmentResult === "LOSS") {
            payoutAmount = amount - roi;
            if (payoutAmount < 0)
                payoutAmount = 0;
        }
        else {
            // e.g. "DRAW"
            payoutAmount = amount;
        }
        (0, broadcast_1.broadcastLog)(cronName, `Calculated payout: ${payoutAmount} for AI investment ${investment.id}`);
        // 5c. Update wallet balance
        if (payoutAmount > 0) {
            const idempotencyKey = `ai_invest_payout_${investment.id}`;
            await wallet_1.walletService.credit({
                idempotencyKey,
                userId: wallet.userId,
                walletId: wallet.id,
                walletType: wallet.type,
                currency: wallet.currency,
                amount: payoutAmount,
                operationType: "AI_INVESTMENT_ROI",
                referenceId: investment.id,
                description: `AI Investment ${investmentResult}: Plan "${investment.plan.title}" | Duration: ${investment.duration.duration} ${investment.duration.timeframe}`,
                metadata: {
                    investmentId: investment.id,
                    planId: investment.planId,
                    result: investmentResult,
                    roi,
                    originalAmount: amount,
                },
                transaction: t,
            });
            (0, broadcast_1.broadcastLog)(cronName, `Wallet credited ${payoutAmount} for AI investment ${investment.id}`);
        }
        else {
            (0, broadcast_1.broadcastLog)(cronName, `No payout for AI investment ${investment.id} (total loss)`);
        }
        // 5e. Mark AI investment as completed
        await db_1.models.aiInvestment.update({
            status: "COMPLETED",
            result: investmentResult,
            profit: roi,
        }, { where: { id: investment.id }, transaction: t });
        (0, broadcast_1.broadcastLog)(cronName, `AI investment ${investment.id} updated to COMPLETED (${investmentResult})`);
        // 5f. Reload the updated record
        updatedInvestment = await db_1.models.aiInvestment.findByPk(investment.id, {
            include: [
                { model: db_1.models.aiInvestmentPlan, as: "plan" },
                { model: db_1.models.aiInvestmentDuration, as: "duration" },
            ],
            transaction: t,
        });
        await t.commit();
        (0, broadcast_1.broadcastLog)(cronName, `Transaction committed for AI investment ${investment.id}`, "success");
    }
    catch (error) {
        await t.rollback();
        (0, broadcast_1.broadcastLog)(cronName, `Error updating AI investment ${investment.id}: ${error.message}`, "error");
        console_1.logger.error("AI_INVESTMENT_UPDATE", `Error updating AI investment: ${error.message}`, error);
        return null;
    }
    return updatedInvestment;
}
// 6. Post-processing: email, notification, rewards
async function postProcessAiInvestment(user, investment, updatedInvestment) {
    var _a, _b, _c;
    const cronName = "processAiInvestments";
    try {
        // 6a. Send AI investment completion email
        (0, broadcast_1.broadcastLog)(cronName, `Sending AI investment email for investment ${investment.id}`);
        await (0, emails_1.sendAiInvestmentEmail)(user, investment.plan, investment.duration, updatedInvestment, "AiInvestmentCompleted");
        (0, broadcast_1.broadcastLog)(cronName, `AI investment email sent for investment ${investment.id}`, "success");
        // 6b. Create completion notification
        (0, broadcast_1.broadcastLog)(cronName, `Creating notification for AI investment ${investment.id}`);
        await (0, notifications_1.createNotification)({
            userId: user.id,
            relatedId: updatedInvestment.id,
            title: "AI Investment Completed",
            message: `Your AI investment of ${investment.amount} ${(_a = updatedInvestment === null || updatedInvestment === void 0 ? void 0 : updatedInvestment.plan) === null || _a === void 0 ? void 0 : _a.currency} has been completed with a status of ${updatedInvestment.result}`,
            type: "system",
            link: `/ai/investments/${updatedInvestment.id}`,
            actions: [
                {
                    label: "View Investment",
                    link: `/ai/investments/${updatedInvestment.id}`,
                    primary: true,
                },
            ],
        });
        (0, broadcast_1.broadcastLog)(cronName, `Notification created for AI investment ${investment.id}`, "success");
        // 6c. Process affiliate rewards
        (0, broadcast_1.broadcastLog)(cronName, `Processing rewards for AI investment ${investment.id}`);
        await (0, affiliate_1.processRewards)(user.id, (_b = investment.amount) !== null && _b !== void 0 ? _b : 0, "AI_INVESTMENT", (_c = updatedInvestment === null || updatedInvestment === void 0 ? void 0 : updatedInvestment.plan) === null || _c === void 0 ? void 0 : _c.currency);
        (0, broadcast_1.broadcastLog)(cronName, `Rewards processed for AI investment ${investment.id}`, "success");
    }
    catch (error) {
        (0, broadcast_1.broadcastLog)(cronName, `Error in postProcessAiInvestment for ${investment.id}: ${error.message}`, "error");
        console_1.logger.error("AI_INVESTMENT_POST_PROCESS", `Error in postProcessAiInvestment: ${error.message}`, error);
    }
}
