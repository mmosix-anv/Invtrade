"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.metadata = void 0;
const db_1 = require("@b/db");
const error_1 = require("@b/utils/error");
const query_1 = require("@b/utils/query");
const wallet_1 = require("@b/services/wallet");
// Conditional import for ecosystem wallet utility
let getWalletByUserIdAndCurrency;
try {
    const ecosystemWallet = require("@b/api/(ext)/ecosystem/utils/wallet");
    getWalletByUserIdAndCurrency = ecosystemWallet.getWalletByUserIdAndCurrency;
}
catch (error) {
    // Ecosystem extension not available, will use fallback
    getWalletByUserIdAndCurrency = null;
}
exports.metadata = {
    summary: "Claims a specific referral reward",
    description: "Processes the claim of a specified referral reward.",
    operationId: "claimReward",
    tags: ["MLM", "Rewards"],
    requiresAuth: true,
    logModule: "AFFILIATE",
    logTitle: "Claim affiliate reward",
    parameters: [
        {
            name: "id",
            in: "path",
            required: true,
            schema: { type: "string", description: "Referral reward UUID" },
        },
    ],
    responses: {
        200: {
            description: "Reward claimed successfully",
            content: {
                "application/json": {
                    schema: {
                        type: "object",
                        properties: {
                            message: { type: "string", description: "Success message" },
                        },
                    },
                },
            },
        },
        401: query_1.unauthorizedResponse,
        404: (0, query_1.notFoundMetadataResponse)("Affiliate Reward"),
        500: query_1.serverErrorResponse,
    },
};
exports.default = async (data) => {
    const { params, user, ctx } = data;
    const { id } = params;
    if (!(user === null || user === void 0 ? void 0 : user.id)) {
        throw (0, error_1.createError)({ statusCode: 401, message: "Unauthorized" });
    }
    ctx === null || ctx === void 0 ? void 0 : ctx.step("Fetching reward details and validating ownership");
    const reward = await db_1.models.mlmReferralReward.findOne({
        where: { id, isClaimed: false, referrerId: user.id },
        include: [{ model: db_1.models.mlmReferralCondition, as: "condition" }],
    });
    if (!reward)
        throw (0, error_1.createError)({ statusCode: 404, message: "Reward not found or already claimed" });
    let updatedWallet;
    ctx === null || ctx === void 0 ? void 0 : ctx.step(`Retrieving or creating ${reward.condition.rewardWalletType} wallet for ${reward.condition.rewardCurrency}`);
    // Handle ECO wallet creation logic differently
    if (reward.condition.rewardWalletType === "ECO") {
        // Check if ecosystem extension is available
        if (getWalletByUserIdAndCurrency) {
            // Utilize ecosystem-specific wallet retrieval/creation logic
            updatedWallet = await getWalletByUserIdAndCurrency(user.id, reward.condition.rewardCurrency);
        }
        else {
            // Fallback to regular wallet creation for ECO type when ecosystem is not available
            const walletResult = await wallet_1.walletCreationService.getOrCreateWallet(user.id, "ECO", reward.condition.rewardCurrency);
            updatedWallet = walletResult.wallet;
        }
    }
    else {
        // For non-ECO wallets, use wallet creation service
        const walletResult = await wallet_1.walletCreationService.getOrCreateWallet(user.id, reward.condition.rewardWalletType, reward.condition.rewardCurrency);
        updatedWallet = walletResult.wallet;
    }
    if (!updatedWallet)
        throw (0, error_1.createError)({ statusCode: 500, message: "Wallet not found or could not be created" });
    ctx === null || ctx === void 0 ? void 0 : ctx.step("Processing reward claim in transaction");
    await db_1.sequelize.transaction(async (transaction) => {
        var _a, _b;
        // Re-check the reward status within the transaction to prevent race conditions
        ctx === null || ctx === void 0 ? void 0 : ctx.step("Verifying reward is still available (preventing race conditions)");
        const rewardToUpdate = await db_1.models.mlmReferralReward.findOne({
            where: { id, isClaimed: false, referrerId: user.id },
            transaction,
            lock: transaction.LOCK.UPDATE,
        });
        if (!rewardToUpdate) {
            throw (0, error_1.createError)({ statusCode: 404, message: "Reward not found or already claimed" });
        }
        ctx === null || ctx === void 0 ? void 0 : ctx.step(`Crediting reward via wallet service: ${rewardToUpdate.reward} ${reward.condition.rewardCurrency}`);
        // Use stable idempotency key for proper retry detection (wallet service creates transaction automatically)
        const idempotencyKey = `affiliate_reward_${id}`;
        await wallet_1.walletService.credit({
            idempotencyKey,
            userId: user.id,
            walletId: updatedWallet.id,
            walletType: reward.condition.rewardWalletType,
            currency: reward.condition.rewardCurrency,
            amount: rewardToUpdate.reward,
            operationType: "REFERRAL_REWARD",
            referenceId: id,
            description: `Referral reward for ${(_a = reward.condition) === null || _a === void 0 ? void 0 : _a.type}`,
            metadata: {
                rewardId: id,
                conditionId: reward.conditionId,
                conditionType: (_b = reward.condition) === null || _b === void 0 ? void 0 : _b.type,
            },
            transaction,
        });
        ctx === null || ctx === void 0 ? void 0 : ctx.step("Marking reward as claimed");
        await rewardToUpdate.update({ isClaimed: true }, { transaction });
    });
    ctx === null || ctx === void 0 ? void 0 : ctx.success(`Claimed ${reward.reward} ${reward.condition.rewardCurrency} in referral rewards`);
    return { message: "Reward claimed successfully" };
};
