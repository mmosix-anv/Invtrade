"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.checkAndProcessFailedOfferings = checkAndProcessFailedOfferings;
exports.processAutomaticRefunds = processAutomaticRefunds;
const db_1 = require("@b/db");
const sequelize_1 = require("sequelize");
const notifications_1 = require("@b/utils/notifications");
const console_1 = require("@b/utils/console");
const wallet_1 = require("@b/services/wallet");
async function checkAndProcessFailedOfferings() {
    const transaction = await db_1.sequelize.transaction();
    try {
        const now = new Date();
        // Find offerings that ended and didn't reach soft cap
        const failedOfferings = await db_1.models.icoTokenOffering.findAll({
            where: {
                status: 'ACTIVE',
                endDate: { [sequelize_1.Op.lt]: now },
            },
            include: [{
                    model: db_1.models.icoTokenDetail,
                    as: "tokenDetail",
                }],
            transaction,
        });
        for (const offering of failedOfferings) {
            // Calculate total raised
            const totalRaised = await db_1.models.icoTransaction.sum('amount', {
                where: {
                    offeringId: offering.id,
                    status: { [sequelize_1.Op.in]: ['PENDING', 'VERIFICATION', 'RELEASED'] }
                },
                transaction,
            }) || 0;
            const softCap = offering.targetAmount * 0.3; // 30% soft cap
            if (totalRaised < softCap) {
                // Mark offering as failed
                await offering.update({
                    status: 'FAILED',
                    notes: JSON.stringify({
                        failureReason: 'Soft cap not reached',
                        totalRaised,
                        softCap,
                        failedAt: now.toISOString(),
                    })
                }, { transaction });
                // Mark all pending transactions as rejected (will be refunded)
                await db_1.models.icoTransaction.update({
                    status: 'REJECTED',
                    notes: JSON.stringify({
                        rejectionReason: 'Soft cap not reached - pending refund',
                        rejectedAt: now.toISOString(),
                    })
                }, {
                    where: {
                        offeringId: offering.id,
                        status: { [sequelize_1.Op.in]: ['PENDING', 'VERIFICATION'] }
                    },
                    transaction,
                });
                // Notify offering owner
                await (0, notifications_1.createNotification)({
                    userId: offering.userId,
                    relatedId: offering.id,
                    type: "system",
                    title: "ICO Offering Failed",
                    message: `${offering.name} failed to reach soft cap`,
                    details: `Total raised: ${totalRaised} ${offering.purchaseWalletCurrency}\nSoft cap: ${softCap} ${offering.purchaseWalletCurrency}\nRefunds will be processed for all investors.`,
                    link: `/ico/creator/token/${offering.id}`,
                    actions: [
                        {
                            label: "Process Refunds",
                            link: `/ico/creator/token/${offering.id}/refunds`,
                            primary: true,
                        },
                    ],
                });
                // Notify all investors
                const investors = await db_1.models.icoTransaction.findAll({
                    where: {
                        offeringId: offering.id,
                        status: 'REJECTED',
                    },
                    attributes: ['userId'],
                    group: ['userId'],
                    transaction,
                });
                for (const investor of investors) {
                    await (0, notifications_1.createNotification)({
                        userId: investor.userId,
                        relatedId: offering.id,
                        type: "investment",
                        title: "ICO Investment Refund Available",
                        message: `${offering.name} did not reach its funding goal`,
                        details: `Your investment will be refunded. The ICO failed to reach its soft cap of ${softCap} ${offering.purchaseWalletCurrency}.`,
                        link: `/ico/dashboard?tab=transactions`,
                    });
                }
                // Create admin activity log
                await db_1.models.icoAdminActivity.create({
                    type: "OFFERING_FAILED",
                    offeringId: offering.id,
                    offeringName: offering.name,
                    adminId: null, // System action
                    details: JSON.stringify({
                        reason: 'Soft cap not reached',
                        totalRaised,
                        softCap,
                        currency: offering.purchaseWalletCurrency,
                        investorCount: investors.length,
                    }),
                }, { transaction });
            }
        }
        await transaction.commit();
    }
    catch (error) {
        await transaction.rollback();
        console_1.logger.error("ICO_REFUND", "Error checking failed offerings", error);
        throw error;
    }
}
async function processAutomaticRefunds() {
    const transaction = await db_1.sequelize.transaction();
    try {
        // Find all offerings marked for refund
        const refundableOfferings = await db_1.models.icoTokenOffering.findAll({
            where: {
                status: { [sequelize_1.Op.in]: ['FAILED', 'CANCELLED'] },
            },
            transaction,
        });
        for (const offering of refundableOfferings) {
            // Check if refunds are already processed
            const pendingRefunds = await db_1.models.icoTransaction.count({
                where: {
                    offeringId: offering.id,
                    status: 'REJECTED',
                },
                transaction,
            });
            if (pendingRefunds === 0)
                continue;
            // Process refunds
            const pendingTransactions = await db_1.models.icoTransaction.findAll({
                where: {
                    offeringId: offering.id,
                    status: 'REJECTED',
                },
                transaction,
            });
            let refundedCount = 0;
            let totalRefunded = 0;
            for (const icoTransaction of pendingTransactions) {
                try {
                    const refundAmount = icoTransaction.amount * icoTransaction.price;
                    // Find user's wallet
                    const wallet = await db_1.models.wallet.findOne({
                        where: {
                            userId: icoTransaction.userId,
                            type: offering.purchaseWalletType,
                            currency: offering.purchaseWalletCurrency,
                        },
                        transaction,
                        lock: transaction.LOCK.UPDATE,
                    });
                    if (!wallet)
                        continue;
                    // Use wallet service for atomic, audited refund credit
                    // Use stable idempotency key for proper retry detection
                    const idempotencyKey = `ico_auto_refund_${icoTransaction.id}`;
                    await wallet_1.walletService.credit({
                        idempotencyKey,
                        userId: icoTransaction.userId,
                        walletId: wallet.id,
                        walletType: offering.purchaseWalletType,
                        currency: offering.purchaseWalletCurrency,
                        amount: refundAmount,
                        operationType: "REFUND",
                        referenceId: icoTransaction.id,
                        description: `Automatic ICO Refund: ${offering.name}`,
                        metadata: {
                            offeringId: offering.id,
                            offeringName: offering.name,
                            originalTransactionId: icoTransaction.transactionId,
                            reason: 'Automatic refund - offering failed',
                            processedBy: 'SYSTEM',
                        },
                        transaction,
                    });
                    // Update transaction notes (status already REJECTED)
                    await icoTransaction.update({
                        notes: JSON.stringify({
                            ...JSON.parse(icoTransaction.notes || '{}'),
                            refund: {
                                amount: refundAmount,
                                reason: 'Automatic refund - offering failed',
                                processedAt: new Date().toISOString(),
                                processedBy: 'SYSTEM',
                            }
                        })
                    }, { transaction });
                    refundedCount++;
                    totalRefunded += refundAmount;
                }
                catch (error) {
                    console_1.logger.error("ICO_REFUND", `Failed to refund transaction ${icoTransaction.id}`, error);
                }
            }
            // Update offering notes if all refunds processed
            if (refundedCount === pendingTransactions.length) {
                await offering.update({
                    notes: JSON.stringify({
                        ...JSON.parse(offering.notes || '{}'),
                        automaticRefund: {
                            refundedAt: new Date().toISOString(),
                            refundedCount,
                            totalRefunded,
                            allRefundsProcessed: true,
                        }
                    })
                }, { transaction });
            }
        }
        await transaction.commit();
    }
    catch (error) {
        await transaction.rollback();
        console_1.logger.error("ICO_REFUND", "Error processing automatic refunds", error);
        throw error;
    }
}
