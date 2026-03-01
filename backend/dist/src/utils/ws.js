"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.parseParams = void 0;
// parse params with getParameter
const parseParams = (routePath, path) => {
    const routeParts = routePath.split("/");
    const pathParts = path.split("/");
    const params = {};
    for (let i = 0; i < routeParts.length; i++) {
        if (routeParts[i].startsWith(":")) {
            const key = routeParts[i].slice(1);
            params[key] = pathParts[i];
        }
    }
    return params;
};
exports.parseParams = parseParams;
