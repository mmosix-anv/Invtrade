"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.metadata = void 0;
const db_1 = require("@b/db");
const constants_1 = require("@b/utils/constants");
const query_1 = require("@b/utils/query");
const utils_1 = require("./utils");
exports.metadata = {
    summary: "List all ecosystem master wallets",
    description: "Retrieves a paginated list of ecosystem master wallets with optional filtering and sorting. Includes real-time balance updates fetched from the blockchain, associated custodial wallets, and full wallet configuration details.",
    operationId: "listEcosystemMasterWallets",
    tags: ["Admin", "Ecosystem", "Wallet"],
    parameters: constants_1.crudParameters,
    responses: {
        200: {
            description: "Master wallets retrieved successfully",
            content: {
                "application/json": {
                    schema: {
                        type: "object",
                        properties: {
                            items: {
                                type: "array",
                                items: {
                                    type: "object",
                                    properties: utils_1.ecosystemMasterWalletSchema,
                                },
                            },
                            pagination: constants_1.paginationSchema,
                        },
                    },
                },
            },
        },
        401: query_1.unauthorizedResponse,
        404: (0, query_1.notFoundMetadataResponse)("Ecosystem Master Wallets"),
        500: query_1.serverErrorResponse,
    },
    requiresAuth: true,
    permission: "view.ecosystem.master.wallet",
    demoMask: ["items.address", "items.ecosystemCustodialWallets.address"],
};
exports.default = async (data) => {
    const { query, ctx } = data;
    ctx === null || ctx === void 0 ? void 0 : ctx.step("Fetching master wallets list with balances");
    // Fetch wallets with pagination and filtering
    const result = await (0, query_1.getFiltered)({
        model: db_1.models.ecosystemMasterWallet,
        query,
        sortField: query.sortField || "chain",
        timestamps: false,
        includeModels: [
            {
                model: db_1.models.ecosystemCustodialWallet,
                as: "ecosystemCustodialWallets",
                attributes: ["id", "address", "status"],
            },
        ],
    });
    // Update balances in parallel with timeout and error handling
    if (result.items && result.items.length > 0) {
        // Create balance update promises with reasonable timeout (5 seconds per wallet)
        const balanceUpdatePromises = result.items.map(async (walletItem, index) => {
            // Set a reasonable timeout for each wallet balance update (5 seconds)
            const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error('Balance fetch timeout')), 5000));
            const updatePromise = (async () => {
                var _a;
                try {
                    // Handle both plain objects and Sequelize models
                    const wallet = (typeof walletItem.get === 'function'
                        ? walletItem.get({ plain: true })
                        : walletItem);
                    // Only fetch balance, don't wait for database update
                    await (0, utils_1.getEcosystemMasterWalletBalance)(wallet);
                    // Quick refresh without waiting for all includes
                    const updatedWallet = await db_1.models.ecosystemMasterWallet.findByPk(wallet.id, {
                        attributes: ['id', 'chain', 'currency', 'address', 'balance', 'status', 'lastIndex'],
                        raw: true
                    });
                    if (updatedWallet) {
                        // Merge updated balance with existing data
                        if (typeof walletItem.get === 'function') {
                            walletItem.set('balance', updatedWallet.balance);
                        }
                        else {
                            // For plain objects, directly set the balance
                            walletItem.balance = updatedWallet.balance;
                        }
                    }
                }
                catch (error) {
                    // Log for debugging
                    console.log(`Balance update failed for wallet ${index}: ${(_a = error === null || error === void 0 ? void 0 : error.message) === null || _a === void 0 ? void 0 : _a.substring(0, 50)}`);
                }
            })();
            // Race between update and timeout
            return Promise.race([updatePromise, timeoutPromise]).catch((err) => {
                console.log(`Wallet ${index} update timeout or error: ${err.message}`);
            });
        });
        // Wait for all updates to complete or timeout
        // Allow up to 10 seconds for all balance fetches
        const globalTimeout = new Promise((resolve) => setTimeout(resolve, 10000));
        await Promise.race([
            Promise.allSettled(balanceUpdatePromises),
            globalTimeout
        ]);
    }
    ctx === null || ctx === void 0 ? void 0 : ctx.success("Retrieved master wallets successfully");
    return result;
};
