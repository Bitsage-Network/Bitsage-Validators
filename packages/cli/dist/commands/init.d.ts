/**
 * Init Command
 *
 * Interactive setup wizard for new validators
 */
interface InitOptions {
    network?: string;
    skipDocker?: boolean;
}
export declare function initCommand(options: InitOptions): Promise<void>;
export {};
//# sourceMappingURL=init.d.ts.map