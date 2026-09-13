export declare const MUTE_AUDIO: string;
export declare const OFFSCREEN_POSITION: string;
export declare const DEFAULT_OFFSCREEN_WINDOW_SIZE: string;
export declare const SILENT_ARGS: readonly string[];
export declare const OFFSCREEN_ARGS: readonly string[];
export declare function presentationArgs(options?: {
  headless?: boolean;
  windowSize?: [number, number];
  extra?: string[];
}): string[];
export declare function firefoxPresentationArgs(options?: { headless?: boolean }): string[];
