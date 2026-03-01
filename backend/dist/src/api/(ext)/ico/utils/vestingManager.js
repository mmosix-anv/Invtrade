"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createVestingSchedule = createVestingSchedule;
exports.calculateVestedAmount = calculateVestedAmount;
exports.processVestingReleases = processVestingReleases;
exports.claimVestedTokens = claimVestedTokens;
exports.getVestingScheduleForUser = getVestingScheduleForUser;
const db_1 = require("@b/db");
const sequelize_1 = require("sequelize");
const notifications_1 = require("@b/utils/notifications");
const console_1 = require("@b/utils/console");
const error_1 = require("@b/utils/error");
async function createVestingSchedule(transactionId, schedule) {
    const transaction = await db_1.sequelize.transaction();
    try {
        // Find the ICO transaction
        const icoTransaction = await db_1.models.icoTransaction.findByPk(transactionId, {
            include: [{
                    model: db_1.models.icoTokenOffering,
                    as: "offering",
                }],
            transaction,
        });
        if (!icoTransaction) {
            throw (0, error_1.createError)({ statusCode: 404, message: "Transaction not found" });
        }
        // Calculate release schedule based on type
        let releaseSchedule = null;
        if (schedule.type === "MILESTONE" && schedule.milestones) {
            releaseSchedule = schedule.milestones.map(m => ({
                date: m.date,
                percentage: m.percentage,
                amount: icoTransaction.amount * (m.percentage / 100),
            }));
        }
        // Create vesting record
        const vesting = await db_1.models.icoTokenVesting.create({
            transactionId: icoTransaction.id,
            userId: icoTransaction.userId,
            offeringId: icoTransaction.offeringId,
            totalAmount: icoTransaction.amount,
            releasedAmount: 0,
            vestingType: schedule.type,
            startDate: schedule.startDate,
            endDate: schedule.endDate,
            cliffDuration: schedule.cliffDuration,
            releaseSchedule,
            status: "ACTIVE",
        }, { transaction });
        // Create initial release records for milestones
        if (schedule.type === "MILESTONE" && releaseSchedule) {
            for (const milestone of releaseSchedule) {
                await db_1.models.icoTokenVestingRelease.create({
                    vestingId: vesting.id,
                    amount: milestone.amount,
                    releaseDate: milestone.date,
                    status: "PENDING",
                }, { transaction });
            }
        }
        await transaction.commit();
        return vesting;
    }
    catch (error) {
        await transaction.rollback();
        throw error;
    }
}
async function calculateVestedAmount(vestingId) {
    const vesting = await db_1.models.icoTokenVesting.findByPk(vestingId);
    if (!vesting)
        return 0;
    const now = new Date();
    // If before start date, nothing is vested
    if (now < vesting.startDate)
        return 0;
    // If after end date, everything is vested
    if (now >= vesting.endDate)
        return vesting.totalAmount;
    switch (vesting.vestingType) {
        case "LINEAR":
            // Check cliff period
            if (vesting.cliffDuration) {
                const cliffEndDate = new Date(vesting.startDate);
                cliffEndDate.setDate(cliffEndDate.getDate() + vesting.cliffDuration);
                if (now < cliffEndDate)
                    return 0;
            }
            // Calculate linear vesting
            const totalDuration = vesting.endDate.getTime() - vesting.startDate.getTime();
            const elapsed = now.getTime() - vesting.startDate.getTime();
            const percentage = elapsed / totalDuration;
            return vesting.totalAmount * percentage;
        case "CLIFF":
            // All or nothing at cliff date
            const cliffDate = new Date(vesting.startDate);
            cliffDate.setDate(cliffDate.getDate() + (vesting.cliffDuration || 365));
            return now >= cliffDate ? vesting.totalAmount : 0;
        case "MILESTONE":
            // Sum up all milestones that have passed
            if (!vesting.releaseSchedule)
                return 0;
            let vestedAmount = 0;
            for (const milestone of vesting.releaseSchedule) {
                if (new Date(milestone.date) <= now) {
                    vestedAmount += milestone.amount;
                }
            }
            return vestedAmount;
        default:
            return 0;
    }
}
async function processVestingReleases() {
    const transaction = await db_1.sequelize.transaction();
    try {
        const now = new Date();
        // Find all pending releases that are due
        const pendingReleases = await db_1.models.icoTokenVestingRelease.findAll({
            where: {
                status: "PENDING",
                releaseDate: { [sequelize_1.Op.lte]: now },
            },
            include: [{
                    model: db_1.models.icoTokenVesting,
                    as: "vesting",
                    where: { status: "ACTIVE" },
                    include: [{
                            model: db_1.models.icoTransaction,
                            as: "transaction",
                            include: [{
                                    model: db_1.models.icoTokenOffering,
                                    as: "offering",
                                }],
                        }],
                }],
            transaction,
        });
        for (const release of pendingReleases) {
            try {
                // Update release status
                await release.update({ status: "PROCESSING" }, { transaction });
                // Update vesting released amount
                await release.vesting.update({ releasedAmount: release.vesting.releasedAmount + release.amount }, { transaction });
                // Notify user
                await (0, notifications_1.createNotification)({
                    userId: release.vesting.userId,
                    relatedId: release.vesting.offeringId,
                    type: "investment",
                    title: "Vested Tokens Available",
                    message: `${release.amount} ${release.vesting.transaction.offering.symbol} tokens are now available for release`,
                    details: `Your vested tokens from ${release.vesting.transaction.offering.name} are ready to be claimed.`,
                    link: `/ico/dashboard?tab=vesting`,
                    actions: [
                        {
                            label: "Claim Tokens",
                            link: `/ico/vesting/${release.vestingId}/claim`,
                            primary: true,
                        },
                    ],
                });
                // Create audit log
                await db_1.models.icoAdminActivity.create({
                    type: "VESTING_RELEASE",
                    offeringId: release.vesting.offeringId,
                    offeringName: release.vesting.transaction.offering.name,
                    adminId: null, // System action
                    details: JSON.stringify({
                        vestingId: release.vestingId,
                        releaseId: release.id,
                        amount: release.amount,
                        userId: release.vesting.userId,
                    }),
                }, { transaction });
            }
            catch (error) {
                console_1.logger.error("ICO_VESTING", `Failed to process vesting release ${release.id}`, error);
                await release.update({
                    status: "FAILED",
                    notes: error.message
                }, { transaction });
            }
        }
        // Check for completed vestings
        const activeVestings = await db_1.models.icoTokenVesting.findAll({
            where: {
                status: "ACTIVE",
                endDate: { [sequelize_1.Op.lte]: now },
            },
            transaction,
        });
        for (const vesting of activeVestings) {
            if (vesting.releasedAmount >= vesting.totalAmount) {
                await vesting.update({ status: "COMPLETED" }, { transaction });
            }
        }
        await transaction.commit();
    }
    catch (error) {
        await transaction.rollback();
        console_1.logger.error("ICO_VESTING", "Error processing vesting releases", error);
        throw error;
    }
}
async function claimVestedTokens(vestingId, userId, walletAddress, transactionHash) {
    const transaction = await db_1.sequelize.transaction();
    try {
        // Find vesting and verify ownership
        const vesting = await db_1.models.icoTokenVesting.findOne({
            where: {
                id: vestingId,
                userId,
                status: "ACTIVE",
            },
            include: [{
                    model: db_1.models.icoTokenVestingRelease,
                    as: "releases",
                    where: { status: "PROCESSING" },
                }],
            transaction,
        });
        if (!vesting) {
            throw (0, error_1.createError)({ statusCode: 404, message: "Vesting not found or access denied" });
        }
        // Update all processing releases to completed
        for (const release of vesting.releases) {
            await release.update({
                status: "COMPLETED",
                transactionHash,
                notes: `Claimed to wallet: ${walletAddress}`,
            }, { transaction });
        }
        await transaction.commit();
        // Send confirmation notification
        await (0, notifications_1.createNotification)({
            userId,
            relatedId: vesting.offeringId,
            type: "investment",
            title: "Vested Tokens Claimed",
            message: "Your vested tokens have been successfully claimed",
            details: `Transaction hash: ${transactionHash}`,
            link: `/ico/dashboard?tab=vesting`,
        });
    }
    catch (error) {
        await transaction.rollback();
        throw error;
    }
}
async function getVestingScheduleForUser(userId) {
    const vestings = await db_1.models.icoTokenVesting.findAll({
        where: {
            userId,
            status: { [sequelize_1.Op.in]: ["ACTIVE", "COMPLETED"] },
        },
        include: [
            {
                model: db_1.models.icoTokenVestingRelease,
                as: "releases",
            },
            {
                model: db_1.models.icoTransaction,
                as: "transaction",
                include: [{
                        model: db_1.models.icoTokenOffering,
                        as: "offering",
                        attributes: ["name", "symbol"],
                    }],
            },
        ],
        order: [["startDate", "ASC"]],
    });
    return await Promise.all(vestings.map(async (v) => {
        const vestedAmount = await calculateVestedAmount(v.id);
        return {
            ...v.get({ plain: true }),
            vestedAmount,
            availableToClaim: vestedAmount - v.releasedAmount,
        };
    }));
}
