/**
 * Services Commands
 *
 * Start and stop validator services via Docker Compose
 */
interface StartOptions {
    gpu?: boolean;
    monitoring?: boolean;
    foreground?: boolean;
}
interface StopOptions {
    volumes?: boolean;
}
export declare function startCommand(options: StartOptions): Promise<void>;
export declare function stopCommand(options: StopOptions): Promise<void>;
export {};
//# sourceMappingURL=services.d.ts.map