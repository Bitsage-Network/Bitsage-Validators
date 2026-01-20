/**
 * GPU Commands
 *
 * GPU detection and configuration
 */
export interface GPUInfo {
    detected: boolean;
    name: string;
    vramGb: number;
    type: "cuda" | "metal" | "cpu";
    tier: number;
    tierName: string;
    driver?: string;
}
interface GPUSetOptions {
    tier?: string;
    vram?: string;
    type?: string;
}
/**
 * Detect GPU capabilities
 */
export declare function detectGPU(): Promise<GPUInfo>;
/**
 * GPU command handler
 */
export declare function gpuCommand(subcommand: string, options: {
    json?: boolean;
} | GPUSetOptions): Promise<void>;
export {};
//# sourceMappingURL=gpu.d.ts.map