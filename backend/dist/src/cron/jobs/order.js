"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.processPendingOrders = processPendingOrders;
const console_1 = require("@b/utils/console");
const BinaryOrderService_1 = require("@b/api/exchange/binary/order/util/BinaryOrderService");
const broadcast_1 = require("../broadcast");
/**
 * Processes pending binary orders with retry logic.
 * @param shouldBroadcast - If true, broadcasts status messages (useful for cron jobs).
 */
async function processPendingOrders(shouldBroadcast = true) {
    const cronName = "processPendingOrders";
    const MAX_RETRIES = 3;
    const RETRY_DELAY = 5000; // 5 seconds
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
        try {
            if (shouldBroadcast) {
                (0, broadcast_1.broadcastStatus)(cronName, "running");
                const attemptMsg = attempt > 1 ? ` (attempt ${attempt}/${MAX_RETRIES})` : "";
                (0, broadcast_1.broadcastLog)(cronName, `Starting processing pending orders${attemptMsg}`);
            }
            // Pass the flag to BinaryOrderService so it can conditionally log as well.
            await BinaryOrderService_1.BinaryOrderService.processPendingOrders(shouldBroadcast);
            if (shouldBroadcast) {
                (0, broadcast_1.broadcastStatus)(cronName, "completed");
                (0, broadcast_1.broadcastLog)(cronName, "Processing pending orders completed", "success");
            }
            return; // Success - exit retry loop
        }
        catch (error) {
            const isLastAttempt = attempt === MAX_RETRIES;
            console_1.logger.error("CRON", `Processing pending orders failed (attempt ${attempt}/${MAX_RETRIES})`, error);
            if (isLastAttempt) {
                // Final attempt failed
                if (shouldBroadcast) {
                    (0, broadcast_1.broadcastStatus)(cronName, "failed");
                    (0, broadcast_1.broadcastLog)(cronName, `Processing pending orders failed after ${MAX_RETRIES} attempts: ${error.message}`, "error");
                }
                throw error;
            }
            // Log retry attempt
            if (shouldBroadcast) {
                (0, broadcast_1.broadcastLog)(cronName, `Attempt ${attempt} failed, retrying in ${RETRY_DELAY / 1000}s...`, "warning");
            }
            // Wait before retry
            await new Promise(resolve => setTimeout(resolve, RETRY_DELAY));
        }
    }
}
