"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.handleEvmWithdrawal = void 0;
exports.updatePrivateLedger = updatePrivateLedger;
const db_1 = require("@b/db");
const chains_1 = require("./chains");
const utils_1 = require("@b/utils");
const console_1 = require("@b/utils/console");
const error_1 = require("@b/utils/error");
const wallet_1 = require("@b/api/(ext)/ecosystem/utils/wallet");
const provider_1 = require("./provider");
const ethers_1 = require("ethers");
const wallet_2 = require("@b/services/wallet");
const notification_1 = require("@b/services/notification");
const handleEvmWithdrawal = async (id, walletId, chain, amount, toAddress) => {
    console_1.logger.info("EVM_WITHDRAW", `Starting withdrawal: txId=${id}, wallet=${walletId}, chain=${chain}, amount=${amount}, to=${toAddress === null || toAddress === void 0 ? void 0 : toAddress.substring(0, 10)}...`);
    (0, wallet_1.validateAddress)(toAddress, chain);
    console_1.logger.debug("EVM_WITHDRAW", "Address validation passed");
    console_1.logger.debug("EVM_WITHDRAW", `Initializing provider for chain: ${chain}`);
    const provider = await (0, provider_1.initializeProvider)(chain);
    console_1.logger.debug("EVM_WITHDRAW", `Fetching user wallet: ${walletId}`);
    const userWallet = await db_1.models.wallet.findByPk(walletId);
    if (!userWallet) {
        console_1.logger.error("EVM_WITHDRAW", `User wallet not found: ${walletId}`);
        throw (0, error_1.createError)({ statusCode: 404, message: "User wallet not found" });
    }
    console_1.logger.debug("EVM_WITHDRAW", `Wallet found, currency: ${userWallet.currency}`);
    const { currency } = userWallet;
    console_1.logger.debug("EVM_WITHDRAW", `Initializing contracts for ${currency} on ${chain}`);
    const { contract, contractAddress, gasPayer, contractType, tokenDecimals } = await (0, wallet_1.initializeContracts)(chain, currency, provider);
    console_1.logger.debug("EVM_WITHDRAW", `Contract details: type=${contractType}, address=${contractAddress}, decimals=${tokenDecimals}`);
    const amountEth = ethers_1.ethers.parseUnits(amount.toString(), tokenDecimals);
    console_1.logger.debug("EVM_WITHDRAW", `Amount in wei: ${amountEth.toString()}`);
    let walletData, actualTokenOwner, alternativeWalletUsed, transaction, alternativeWallet;
    if (contractType === "PERMIT") {
        console_1.logger.debug("EVM_WITHDRAW", "Processing PERMIT contract type");
        walletData = await (0, wallet_1.getWalletData)(walletId, chain);
        const ownerData = await (0, wallet_1.getAndValidateTokenOwner)(walletData, amountEth, contract, provider);
        actualTokenOwner = ownerData.actualTokenOwner;
        alternativeWalletUsed = ownerData.alternativeWalletUsed;
        alternativeWallet = ownerData.alternativeWallet;
        try {
            await (0, wallet_1.executePermit)(contract, contractAddress, gasPayer, actualTokenOwner, amountEth, provider);
        }
        catch (error) {
            console_1.logger.error("EVM_WITHDRAW", "Failed to execute permit", error);
            throw (0, error_1.createError)({ statusCode: 500, message: `Failed to execute permit: ${error.message}` });
        }
        try {
            transaction = await (0, wallet_1.executeEcosystemWithdrawal)(contract, contractAddress, gasPayer, actualTokenOwner, toAddress, amountEth, provider);
        }
        catch (error) {
            console_1.logger.error("EVM_WITHDRAW", `Failed to execute withdrawal: ${error.message}`);
            throw (0, error_1.createError)({ statusCode: 500, message: `Failed to execute withdrawal: ${error.message}` });
        }
    }
    else if (contractType === "NO_PERMIT") {
        const isNative = chains_1.chainConfigs[chain].currency === currency;
        try {
            transaction = await (0, wallet_1.executeNoPermitWithdrawal)(chain, contractAddress, gasPayer, toAddress, amountEth, provider, isNative);
        }
        catch (error) {
            console_1.logger.error("EVM_WITHDRAW", `Failed to execute withdrawal: ${error.message}`);
            throw (0, error_1.createError)({ statusCode: 500, message: `Failed to execute withdrawal: ${error.message}` });
        }
    }
    else if (contractType === "NATIVE") {
        try {
            walletData = await (0, wallet_1.getWalletData)(walletId, chain);
            const payer = await (0, wallet_1.getAndValidateNativeTokenOwner)(walletData, amountEth, provider);
            transaction = await (0, wallet_1.executeNativeWithdrawal)(payer, toAddress, amountEth, provider);
        }
        catch (error) {
            console_1.logger.error("EVM_WITHDRAW", `Failed to execute withdrawal: ${error.message}`);
            throw (0, error_1.createError)({ statusCode: 500, message: `Failed to execute withdrawal: ${error.message}` });
        }
    }
    if (transaction && transaction.hash) {
        // Checking the transaction status
        let attempts = 0;
        const maxAttempts = 10;
        while (attempts < maxAttempts) {
            try {
                const txReceipt = await provider.getTransactionReceipt(transaction.hash);
                if (txReceipt && txReceipt.status === 1) {
                    console_1.logger.success("EVM_WITHDRAW", `Transaction confirmed: ${transaction.hash}`);
                    if (contractType === "PERMIT") {
                        if (alternativeWalletUsed) {
                            await (0, wallet_1.updateAlternativeWallet)(currency, chain, amount);
                            // Deduct from the wallet that was used for withdrawal
                            await updatePrivateLedger(alternativeWallet.walletId, alternativeWallet.index, currency, chain, amount);
                        }
                        // Add to the wallet that initiated the withdrawal
                        await updatePrivateLedger(walletId, walletData.index, currency, chain, -amount);
                    }
                    else if (contractType === "NATIVE") {
                        // For NATIVE tokens, reconcile the gas fee difference
                        // The database was debited with: amount + estimatedGasFee
                        // On-chain was debited with: amount + actualGasFee
                        // We need to refund/deduct the difference
                        try {
                            // Get the full transaction details to access gas price
                            const tx = await provider.getTransaction(transaction.hash);
                            const gasPrice = (tx === null || tx === void 0 ? void 0 : tx.gasPrice) || ethers_1.ethers.parseUnits("0", "gwei");
                            const actualGasUsed = txReceipt.gasUsed * gasPrice;
                            const actualGasFee = parseFloat(ethers_1.ethers.formatUnits(actualGasUsed, tokenDecimals));
                            console_1.logger.debug("EVM_WITHDRAW", `NATIVE gas reconciliation: gasUsed=${txReceipt.gasUsed}, gasPrice=${gasPrice}, actualGasFee=${actualGasFee}, txHash=${transaction.hash}`);
                            // Get the transaction record to find the estimated fee
                            const txRecord = await db_1.models.transaction.findByPk(id);
                            if (txRecord && txRecord.fee) {
                                const estimatedGasFee = parseFloat(txRecord.fee);
                                const gasDifference = estimatedGasFee - actualGasFee;
                                console_1.logger.debug("EVM_WITHDRAW", `Gas fee comparison: estimated=${estimatedGasFee}, actual=${actualGasFee}, difference=${gasDifference}`);
                                // If there's a significant difference, adjust the wallet balance via wallet service
                                if (Math.abs(gasDifference) > 0.00000001) {
                                    const wallet = await db_1.models.wallet.findByPk(walletId);
                                    if (wallet) {
                                        // Use ecosystem wallet service for atomic balance + chain balance adjustment
                                        // Use stable idempotency key for proper retry detection
                                        const idempotencyKey = `eco_gas_reconcile_${id}`;
                                        if (gasDifference > 0) {
                                            // Refund overestimated gas - use ecoRefund for atomic update
                                            await wallet_2.walletService.ecoRefund({
                                                idempotencyKey,
                                                userId: wallet.userId,
                                                walletId: wallet.id,
                                                currency,
                                                chain: chain,
                                                amount: gasDifference,
                                                operationType: "ECO_REFUND",
                                                referenceId: id,
                                                description: `Gas fee refund - overestimated by ${gasDifference} ${currency}`,
                                                metadata: {
                                                    transactionId: id,
                                                    estimatedGasFee,
                                                    actualGasFee,
                                                    reason: "gas_overestimate",
                                                },
                                            });
                                        }
                                        else {
                                            // Deduct underestimated gas - use ecoDebit for atomic update
                                            await wallet_2.walletService.ecoDebit({
                                                idempotencyKey,
                                                userId: wallet.userId,
                                                walletId: wallet.id,
                                                currency,
                                                chain: chain,
                                                amount: Math.abs(gasDifference),
                                                operationType: "ECO_WITHDRAW",
                                                referenceId: id,
                                                description: `Gas fee adjustment - underestimated by ${Math.abs(gasDifference)} ${currency}`,
                                                metadata: {
                                                    transactionId: id,
                                                    estimatedGasFee,
                                                    actualGasFee,
                                                    reason: "gas_underestimate",
                                                },
                                            });
                                        }
                                        console_1.logger.info("EVM_WITHDRAW", `Adjusted wallet balance by ${gasDifference} ${currency}`);
                                    }
                                }
                            }
                        }
                        catch (gasError) {
                            console_1.logger.error("EVM_WITHDRAW", "Failed to reconcile gas fee", gasError);
                            // Don't fail the withdrawal if reconciliation fails
                        }
                    }
                    await db_1.models.transaction.update({
                        status: "COMPLETED",
                        description: `Withdrawal of ${amount} ${currency} to ${toAddress}`,
                        trxId: transaction.hash,
                    }, {
                        where: { id },
                    });
                    console_1.logger.success("EVM_WITHDRAW", "Transaction marked as COMPLETED");
                    return true;
                }
                else {
                    attempts += 1;
                    await (0, utils_1.delay)(5000);
                }
            }
            catch (error) {
                console_1.logger.error("EVM_WITHDRAW", `Failed to check transaction status: ${error.message}`);
                // Inform admin about withdrawal issue
                try {
                    // Also notify all admin users
                    const admins = await db_1.models.user.findAll({
                        include: [{
                                model: db_1.models.role,
                                as: "role",
                                where: {
                                    name: ["Admin", "Super Admin"],
                                },
                            }],
                        attributes: ["id"],
                    });
                    for (const admin of admins) {
                        await notification_1.notificationService.send({
                            userId: admin.id,
                            type: "ALERT",
                            channels: ["IN_APP"],
                            idempotencyKey: `evm_withdraw_issue_${transaction.hash}_${admin.id}_${attempts}`,
                            data: {
                                title: "Ecosystem Withdrawal Issue",
                                message: `Failed to verify withdrawal transaction ${transaction.hash}. Manual review required.`,
                                link: `/admin/ecosystem/wallet/custodial`,
                            },
                            priority: "HIGH"
                        });
                    }
                }
                catch (notifError) {
                    console_1.logger.error("EVM_WITHDRAW", "Failed to send admin notification", notifError);
                }
                attempts += 1;
                await (0, utils_1.delay)(5000);
            }
        }
        // If loop exits, mark transaction as failed
        console_1.logger.error("EVM_WITHDRAW", `Transaction ${transaction.hash} failed after ${maxAttempts} attempts.`);
    }
    throw (0, error_1.createError)({ statusCode: 500, message: "Transaction failed" });
};
exports.handleEvmWithdrawal = handleEvmWithdrawal;
async function updatePrivateLedger(walletId, index, currency, chain, amount) {
    var _a;
    // Fetch or create the ledger entry
    const ledger = await getPrivateLedger(walletId, index, currency, chain);
    // Update the offchainDifference
    const newOffchainDifference = ((_a = ledger === null || ledger === void 0 ? void 0 : ledger.offchainDifference) !== null && _a !== void 0 ? _a : 0) + amount;
    const networkEnvVar = `${chain}_NETWORK`;
    const network = process.env[networkEnvVar];
    const existingLedger = await db_1.models.ecosystemPrivateLedger.findOne({
        where: {
            walletId,
            index,
            currency,
            chain,
            network,
        },
    });
    if (existingLedger) {
        await db_1.models.ecosystemPrivateLedger.update({
            offchainDifference: newOffchainDifference,
        }, {
            where: {
                walletId,
                index,
                currency,
                chain,
                network,
            },
        });
    }
    else {
        await db_1.models.ecosystemPrivateLedger.create({
            walletId,
            index,
            currency,
            chain,
            offchainDifference: newOffchainDifference,
            network,
        });
    }
}
async function getPrivateLedger(walletId, index, currency, chain) {
    // If not found, create a new ledger entry
    const networkEnvVar = `${chain}_NETWORK`;
    const network = process.env[networkEnvVar];
    // Try to find the existing ledger entry
    return (await db_1.models.ecosystemPrivateLedger.findOne({
        where: {
            walletId,
            index,
            currency,
            chain,
            network,
        },
    }));
}
async function normalizePrivateLedger(walletId) {
    // Fetch all ledger entries for this wallet
    const ledgers = await getAllPrivateLedgersForWallet(walletId);
    let positiveDifferences = [];
    let negativeDifferences = [];
    // Separate ledgers with positive and negative offchainDifference
    for (const ledger of ledgers) {
        if (ledger.offchainDifference > 0) {
            positiveDifferences.push(ledger);
        }
        else if (ledger.offchainDifference < 0) {
            negativeDifferences.push(ledger);
        }
    }
    // Sort the ledgers to optimize the normalization process
    positiveDifferences = positiveDifferences.sort((a, b) => b.offchainDifference - a.offchainDifference);
    negativeDifferences = negativeDifferences.sort((a, b) => a.offchainDifference - b.offchainDifference);
    // Normalize
    for (const posLedger of positiveDifferences) {
        for (const negLedger of negativeDifferences) {
            const amountToNormalize = Math.min(posLedger.offchainDifference, -negLedger.offchainDifference);
            if (amountToNormalize === 0) {
                continue;
            }
            // Update the ledgers
            await db_1.models.ecosystemPrivateLedger.update({
                offchainDifference: posLedger.offchainDifference - amountToNormalize,
            }, {
                where: { id: posLedger.id },
            });
            await db_1.models.ecosystemPrivateLedger.update({
                offchainDifference: negLedger.offchainDifference + amountToNormalize,
            }, {
                where: { id: negLedger.id },
            });
            // Update the in-memory objects to reflect the changes
            posLedger.offchainDifference -= amountToNormalize;
            negLedger.offchainDifference += amountToNormalize;
            // If one of the ledgers has been fully normalized, break out of the loop
            if (posLedger.offchainDifference === 0 ||
                negLedger.offchainDifference === 0) {
                break;
            }
        }
    }
}
async function getAllPrivateLedgersForWallet(walletId) {
    // Fetch all ledger entries for the given wallet ID
    return await db_1.models.ecosystemPrivateLedger.findAll({
        where: {
            walletId,
        },
    });
}
