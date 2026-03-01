"use strict";
// handler/RouteHandler.ts
Object.defineProperty(exports, "__esModule", { value: true });
exports.RouteHandler = void 0;
const regexparam_1 = require("regexparam");
const utils_1 = require("../utils");
const Request_1 = require("./Request");
const Response_1 = require("./Response");
const console_1 = require("@b/utils/console");
class RouteHandler {
    constructor() {
        this.routes = [];
        this.middlewares = [];
        this.errorHandler = utils_1.errHandlerFn;
        this.notFoundHandler = utils_1.notFoundFn;
    }
    set(method, path, ...handler) {
        const { keys, pattern } = (0, regexparam_1.parse)(path);
        this.routes.push({ handler, method, path, regExp: pattern, keys });
    }
    use(middleware) {
        this.middlewares.push(middleware);
    }
    error(cb) {
        this.errorHandler = cb;
    }
    notFound(cb) {
        this.notFoundHandler = cb;
    }
    findRoutes(path, method) {
        for (const route of this.routes) {
            if ((route.method === method || route.method === "all") &&
                route.regExp.test(path)) {
                return route;
            }
        }
    }
    runSafe(fn, res, req, next) {
        try {
            fn(res, req, next);
        }
        catch (err) {
            console_1.logger.error("ROUTE", "Error in middleware/handler", err);
            this.errorHandler(err, res, req);
        }
    }
    applyMiddleware(res, req, done) {
        if (this.middlewares.length === 0)
            return done();
        let index = 0;
        const next = () => {
            index++;
            if (index < this.middlewares.length) {
                this.runSafe(this.middlewares[index], res, req, next);
            }
            else {
                done();
            }
        };
        this.runSafe(this.middlewares[index], res, req, next);
    }
    applyHandler(res, req, handlers) {
        let index = 0;
        const next = () => {
            index++;
            if (index < handlers.length) {
                this.runSafe(handlers[index], res, req, next);
            }
        };
        this.runSafe(handlers[index], res, req, next);
    }
    processRoute(response, request, markResponseSent) {
        const req = new Request_1.Request(response, request);
        const res = new Response_1.Response(response);
        const route = this.findRoutes(req.url, req.method);
        if (route) {
            req._setRegexparam(route.keys, route.regExp);
            req.extractPathParameters();
        }
        try {
            this.applyMiddleware(res, req, () => {
                if (route) {
                    this.applyHandler(res, req, route.handler);
                }
                else {
                    this.runSafe(this.notFoundHandler, res, req, () => { });
                }
                markResponseSent();
            });
        }
        catch (err) {
            console_1.logger.error("ROUTE", "Error processing route", err);
            this.errorHandler(err, res, req);
            markResponseSent();
        }
    }
}
exports.RouteHandler = RouteHandler;
