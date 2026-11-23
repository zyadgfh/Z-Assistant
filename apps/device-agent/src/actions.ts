/**
 * Executes declarative DeviceActions produced by the Maya pipeline.
 * The only injected dependency is the process runner, so tests never touch
 * the operating system. Every spawn uses an argv list — no shell strings.
 */

import type { DeviceAction } from "@maya/core";
import { buildCommand, UnsupportedActionError } from "./platform.js";
import type { Platform } from "./platform.js";

export type ProcessRunner = (file: string, args: string[]) => Promise<{ stdout: string; stderr: string }>;

export function defaultProcessRunner(): ProcessRunner {
  return async (file, args) => {
    const { execFile } = await import("node:child_process");
    const { promisify } = await import("node:util");
    const run = promisify(execFile);
    return run(file, args, { timeout: 30_000, shell: false, maxBuffer: 8 * 1024 * 1024 });
  };
}

export interface ExecutedAction {
  kind: DeviceAction["kind"];
  describe: string;
  ok: boolean;
  error?: string | undefined;
}

export interface ActionLogEntry {
  action: string;
  ok: boolean;
  error?: string | undefined;
}

export interface ActionsExecutorOptions {
  platform: Platform;
  runner?: ProcessRunner;
  screenshotDir?: string;
  /** Receives every executed action for auditing/UI. */
  onAction?: ((entry: ExecutedAction) => void) | undefined;
}

export class ActionsExecutor {
  private readonly runner: ProcessRunner;
  private readonly screenshotDir: string;

  constructor(private readonly options: ActionsExecutorOptions) {
    this.runner = options.runner ?? defaultProcessRunner();
    this.screenshotDir = options.screenshotDir ?? ".";
  }

  async execute(action: DeviceAction): Promise<ExecutedAction> {
    if (action.kind === "stop") {
      const entry: ExecutedAction = { kind: "stop", describe: "إيقاف مايا", ok: true };
      this.options.onAction?.(entry);
      return entry;
    }

    try {
      const spec = buildCommand(action, this.options.platform, this.screenshotDir);
      await this.runner(spec.file, spec.args);
      const entry: ExecutedAction = { kind: action.kind, describe: spec.describe, ok: true };
      this.options.onAction?.(entry);
      return entry;
    } catch (error) {
      if (error instanceof UnsupportedActionError) {
        const entry: ExecutedAction = { kind: action.kind, describe: "", ok: false, error: error.message };
        this.options.onAction?.(entry);
        return entry;
      }
      const message = error instanceof Error ? error.message.split("\n")[0] : String(error);
      const entry: ExecutedAction = { kind: action.kind, describe: "", ok: false, error: message };
      this.options.onAction?.(entry);
      return entry;
    }
  }

  async executeAll(actions: DeviceAction[]): Promise<ExecutedAction[]> {
    const results: ExecutedAction[] = [];
    for (const action of actions) {
      results.push(await this.execute(action));
    }
    return results;
  }
}
