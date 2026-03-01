"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
require("module-alias/register");
const path_1 = __importDefault(require("path"));
const isProduction = process.env.NODE_ENV === "production";
// If this file is in `backend/` during development and compiled into `dist/backend/` in production:
const aliases = isProduction
    ? {
        // In production, code is compiled to `dist/src`,
        // so @b should point to `dist/src` and @db to `dist/models`.
        "@b": path_1.default.resolve(__dirname, "src"),
        "@db": path_1.default.resolve(__dirname, "models"),
    }
    : {
        // In development, `module-alias-setup.ts` is in `backend`.
        // `@b` points to `backend/src`.
        "@b": path_1.default.resolve(__dirname, "src"),
        // `@db` points to `models` which is one level up from `backend`.
        "@db": path_1.default.resolve(__dirname, "models"),
    };
for (const alias in aliases) {
    require("module-alias").addAlias(alias, aliases[alias]);
}
