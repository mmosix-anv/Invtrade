"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const worker_threads_1 = require("worker_threads");
const _1 = require(".");
async function initializeWorker() {
    try {
        // Step 2: Initialize MashServer and listen on assigned port
        const server = new _1.MashServer();
        const workerPort = worker_threads_1.workerData.port;
        server.listen(workerPort, () => {
            worker_threads_1.parentPort === null || worker_threads_1.parentPort === void 0 ? void 0 : worker_threads_1.parentPort.postMessage(server.getDescriptor());
        });
    }
    catch (error) {
        console.error(`Initialization error in worker ${worker_threads_1.threadId}:`, error);
        process.exit(1); // Exit the worker with a non-zero code if an error occurs
    }
}
// Run the worker initialization
initializeWorker();
