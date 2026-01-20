/**
 * Register Command
 *
 * Register as a validator on-chain
 */
interface RegisterOptions {
    stake: string;
    commission: string;
}
export declare function registerCommand(options: RegisterOptions): Promise<void>;
export {};
//# sourceMappingURL=register.d.ts.map