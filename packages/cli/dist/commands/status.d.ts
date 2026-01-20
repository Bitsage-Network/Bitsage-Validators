/**
 * Status and Health Commands
 *
 * Show validator node status and health checks
 */
interface StatusOptions {
    json?: boolean;
}
interface HealthOptions {
    verbose?: boolean;
}
export declare function statusCommand(options: StatusOptions): Promise<void>;
export declare function healthCommand(options: HealthOptions): Promise<void>;
export {};
//# sourceMappingURL=status.d.ts.map