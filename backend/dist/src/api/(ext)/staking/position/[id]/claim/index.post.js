"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.metadata = void 0;
const cache_1 = require("@b/utils/cache");
const console_1 = require("@b/utils/console");
const wallet_1 = require("@b/services/wallet");
// Safe import functions for ecosystem utilities
let ecosystemTokenUtils = null;
let ecosystemWalletUtils = null;
let ecosystemUtilsChecked = false;
async function safeImportEcosystemUtils() {
    if (!ecosystemUtilsChecked) {
        try {
            const tokenPath = `@b/api/(ext)/ecosystem/utils/tokens`;
            const walletPath = `@b/api/(ext)/ecosystem/utils/wallet`;
            const tokenModule = await Promise.resolve(`${tokenPath}`).then(s => __importStar(require(s)));
            const walletModule = await Promise.resolve(`${walletPath}`).then(s => __importStar(require(s)));
            ecosystemTokenUtils = tokenModule;
            ecosystemWalletUtils = walletModule;
        }
        catch (error) {
            // Ecosystem addon not available
            ecosystemTokenUtils = null;
            ecosystemWalletUtils = null;
        }
        ecosystemUtilsChecked = true;
    }
    return {
        tokenUtils: ecosystemTokenUtils,
        walletUtils: ecosystemWalletUtils,
    };
}
const notifications_1 = require("@b/utils/notifications");
const db_1 = require("@b/db");
const error_1 = require("@b/utils/error");
const sequelize_1 = require("sequelize");
exports.metadata = {
    summary: "Claim Staking Position Earnings",
    description: "Claims all unclaimed earnings for a specific staking position.",
    operationId: "claimStakingPositionEarnings",
    tags: ["Staking", "Positions", "Earnings"],
    requiresAuth: true,
    logModule: "STAKING",
    logTitle: "Claim earnings",
    rateLimit: {
        windowMs: 3600000, // 1 hour
        max: 10 // 10 claims per hour
    },
    parameters: [
        {
            index: 0,
            name: "id",
            in: "path",
            required: true,
            schema: { type: "string" },
            description: "Position ID",
        },
    ],
    responses: {
        200: {
            description: "Earnings claimed successfully",
            content: {
                "application/json": {
                    schema: {
                        type: "object",
                        properties: {
                            success: { type: "boolean" },
                            claimedAmount: { type: "number" },
                            transactionId: { type: "string" },
                        },
                    },
                },
            },
        },
        401: { description: "Unauthorized" },
        403: { description: "Forbidden - Not position owner" },
        404: { description: "Position not found" },
        400: { description: "No earnings to claim" },
        500: { description: "Internal Server Error" },
    },
};
/**
 * Claims all unclaimed earnings for a staking position.
 *
 * @description This endpoint processes earnings claims for staking positions.
 * It performs the following operations:
 * - Validates position ownership
 * - Retrieves all unclaimed earnings
 * - Credits earnings to user's wallet
 * - Marks earnings as claimed
 * - Creates transaction records for audit
 * - Sends notification to user
 *
 * Rate limited to 10 claims per hour per user.
 *
 * @param {Handler} data - Request handler data
 * @param {User} data.user - Authenticated user
 * @param {Object} data.params - Route parameters
 * @param {string} data.params.id - Position ID to claim earnings from
 *
 * @returns {Promise<{success: boolean, claimedAmount: number}>} Claim result
 *
 * @throws {401} Unauthorized - User not authenticated
 * @throws {403} Forbidden - User doesn't own the position
 * @throws {404} Not Found - Position not found
 * @throws {400} Bad Request - No earnings to claim
 * @throws {429} Too Many Requests - Rate limit exceeded
 * @throws {500} Internal Server Error - Transaction failed
 */
exports.default = async (data) => {
    const { user, params, ctx } = data;
    if (!(user === null || user === void 0 ? void 0 : user.id)) {
        throw (0, error_1.createError)({ statusCode: 401, message: "Unauthorized" });
    }
    const { id } = params;
    ctx === null || ctx === void 0 ? void 0 : ctx.step("Validating claim request");
    // Validate position ID
    if (!id || typeof id !== "string") {
        throw (0, error_1.createError)({ statusCode: 400, message: "Valid position ID is required" });
    }
    // Rate limiting check for claims
    const recentClaims = await db_1.models.stakingEarningRecord.count({
        where: {
            positionId: {
                [sequelize_1.Op.in]: (0, sequelize_1.literal)(`(
          SELECT id FROM staking_position WHERE userId = '${user.id}'
        )`)
            },
            isClaimed: true,
            claimedAt: {
                [sequelize_1.Op.gte]: new Date(Date.now() - 3600000) // Last hour
            }
        }
    });
    if (recentClaims >= 10) {
        throw (0, error_1.createError)({
            statusCode: 429,
            message: "Too many claim requests. Please wait before trying again."
        });
    }
    ctx === null || ctx === void 0 ? void 0 : ctx.step("Retrieving staking position");
    // Get the position
    const position = await db_1.models.stakingPosition.findOne({
        where: { id },
        include: [
            {
                model: db_1.models.stakingPool,
                as: "pool",
            },
        ],
    });
    if (!position) {
        throw (0, error_1.createError)({ statusCode: 404, message: "Position not found" });
    }
    ctx === null || ctx === void 0 ? void 0 : ctx.step("Verifying position ownership");
    // Verify ownership
    if (position.userId !== user.id) {
        throw (0, error_1.createError)({
            statusCode: 403,
            message: "You don't have access to this position",
        });
    }
    ctx === null || ctx === void 0 ? void 0 : ctx.step("Retrieving unclaimed earnings");
    // Get unclaimed earnings
    const unclaimedEarnings = await db_1.models.stakingEarningRecord.findAll({
        where: {
            positionId: position.id,
            isClaimed: false,
        },
    });
    if (unclaimedEarnings.length === 0) {
        throw (0, error_1.createError)({ statusCode: 400, message: "No earnings to claim" });
    }
    ctx === null || ctx === void 0 ? void 0 : ctx.step("Calculating total claim amount");
    // Calculate total amount to claim
    const totalClaimAmount = unclaimedEarnings.reduce((sum, record) => sum + record.amount, 0);
    ctx === null || ctx === void 0 ? void 0 : ctx.step("Retrieving or creating user wallet");
    let wallet;
    if (position.pool.walletType === "ECO") {
        const cacheManager = cache_1.CacheManager.getInstance();
        const extensions = await cacheManager.getExtensions();
        if (!position.pool.walletChain)
            throw (0, error_1.createError)({
                statusCode: 400,
                message: "Chain not found in trade offer",
            });
        // Try to use ecosystem utils if available
        const { tokenUtils, walletUtils } = await safeImportEcosystemUtils();
        if (tokenUtils && walletUtils && extensions.has("ecosystem")) {
            try {
                // Check token contract address
                await tokenUtils.getTokenContractAddress(position.pool.walletChain, position.pool.symbol);
                // Get or create ecosystem wallet
                wallet = await walletUtils.getWalletByUserIdAndCurrency(user.id, position.pool.symbol);
            }
            catch (error) {
                console_1.logger.error("STAKING", "Failed to create or retrieve wallet", error);
                throw (0, error_1.createError)({
                    statusCode: 500,
                    message: "Failed to create or retrieve wallet, please contact support",
                });
            }
        }
        else {
            // Fallback: create a basic ECO wallet without ecosystem functionality
            const walletResult = await wallet_1.walletCreationService.getOrCreateWallet(user.id, "ECO", position.pool.symbol);
            wallet = walletResult.wallet;
        }
    }
    else {
        // For non-ECO wallets (SPOT, FIAT, etc.)
        const walletResult = await wallet_1.walletCreationService.getOrCreateWallet(user.id, position.pool.walletType, position.pool.symbol);
        wallet = walletResult.wallet;
    }
    ctx === null || ctx === void 0 ? void 0 : ctx.step("Processing earnings claim");
    // Start a transaction
    const transaction = await db_1.sequelize.transaction();
    try {
        ctx === null || ctx === void 0 ? void 0 : ctx.step("Marking earnings as claimed");
        // Update all earnings as claimed
        await Promise.all(unclaimedEarnings.map((earning) => db_1.models.stakingEarningRecord.update({
            isClaimed: true,
            claimedAt: new Date(),
        }, {
            where: { id: earning.id },
            transaction,
        })));
        ctx === null || ctx === void 0 ? void 0 : ctx.step("Crediting wallet with claimed earnings");
        // Credit the wallet with the claimed earnings (wallet service creates transaction automatically)
        // Use stable idempotency key for proper retry detection
        await wallet_1.walletService.credit({
            idempotencyKey: `staking_claim_${position.id}`,
            userId: user.id,
            walletId: wallet.id,
            walletType: position.pool.walletType,
            currency: position.pool.symbol,
            amount: totalClaimAmount,
            operationType: "STAKING_REWARD",
            description: `Staking rewards claim from position ${position.id}`,
            metadata: {
                source: 'STAKING_CLAIM',
                positionId: position.id,
                earningIds: unclaimedEarnings.map(e => e.id)
            },
            transaction,
        });
        ctx === null || ctx === void 0 ? void 0 : ctx.step("Creating claim notification");
        // Create updated notification using the new format
        await (0, notifications_1.createNotification)({
            userId: user.id,
            relatedId: position.id,
            title: "Staking Rewards Claimed",
            message: `You have successfully claimed ${totalClaimAmount} ${position.pool.symbol} from your staking position.`,
            type: "system",
            link: `/staking/positions/${position.id}`,
            actions: [
                {
                    label: "View Position",
                    link: `/staking/positions/${position.id}`,
                    primary: true,
                },
            ],
        }, ctx);
        await transaction.commit();
        ctx === null || ctx === void 0 ? void 0 : ctx.success(`Claimed ${totalClaimAmount} ${position.pool.symbol} in staking rewards`);
        return {
            success: true,
            claimedAmount: totalClaimAmount,
        };
    }
    catch (error) {
        await transaction.rollback();
        ctx === null || ctx === void 0 ? void 0 : ctx.fail(error.message || "Failed to claim earnings");
        throw error;
    }
};
