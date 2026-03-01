"use strict";
// File: index.ts
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
// Load environment variables with multiple path fallbacks
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
// Try multiple paths for .env file - prioritize root .env file
const envPaths = [
    path_1.default.resolve(process.cwd(), ".env"),
    path_1.default.resolve(__dirname, "../.env"),
    path_1.default.resolve(__dirname, ".env"),
    path_1.default.resolve(process.cwd(), "../.env"),
];
let envLoaded = false;
for (const envPath of envPaths) {
    if (fs_1.default.existsSync(envPath)) {
        require("dotenv").config({ path: envPath });
        envLoaded = true;
        break;
    }
}
if (!envLoaded) {
    require("dotenv").config();
}
require("./module-alias-setup");
const src_1 = require("./src");
const console_1 = require("./src/utils/console");
const port = process.env.NEXT_PUBLIC_BACKEND_PORT || 30004;
const startApp = async () => {
    try {
        const app = new src_1.MashServer();
        // Start server - this waits for init then listens, showing "ready" only when all is done
        await app.startServer(Number(port));
    }
    catch (error) {
        console_1.console$.error("Failed to start server", error);
        console_1.logger.error("APP", "Failed to initialize app", error);
        process.exit(1);
    }
};
startApp();
