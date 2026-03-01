"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TronDeposits = void 0;
const safe_imports_1 = require("@b/utils/safe-imports");
const error_1 = require("@b/utils/error");
class TronDeposits {
    constructor(options) {
        this.wallet = options.wallet;
        this.chain = options.chain;
        this.address = options.address;
    }
    async watchDeposits() {
        const TronService = await (0, safe_imports_1.getTronService)();
        if (!TronService) {
            throw (0, error_1.createError)({ statusCode: 503, message: "Tron service not available" });
        }
        const tronService = await TronService.getInstance();
        await tronService.monitorTronDeposits(this.wallet, this.address);
    }
}
exports.TronDeposits = TronDeposits;
