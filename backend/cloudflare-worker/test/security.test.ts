/**
 * Repository security scan — runs in CI/sandbox without any device:
 *  1. No eval/exec/os.system/shell pass-through in app code.
 *  2. No API keys or secret files committed.
 *  3. The real wrangler.toml never lands in Git (only the example).
 */

import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

const repoRoot = join(__dirname, "..", "..", "..");

function* walk(dir: string, exts: readonly string[]): Generator<string> {
  if (!existsSync(dir)) return;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "node_modules" || entry.name === ".git" || entry.name === ".next" || entry.name === ".venv") continue;
      yield* walk(full, exts);
    } else if (exts.some((ext) => entry.name.endsWith(ext))) {
      yield full;
    }
  }
}

function readSafe(path: string): string {
  try {
    return readFileSync(path, "utf8");
  } catch {
    return "";
  }
}

describe("repository security scan", () => {
  it("Dart app code contains no eval, os.system, cmd.exe, or shell strings", () => {
    const offenders: string[] = [];
    const banned = [/eval\s*\(/, /os\.system\s*\(/, /cmd\.exe/, /['"]\/c['"]/, /shell\s*:\s*true/];
    for (const file of walk(join(repoRoot, "app", "lib"), [".dart"])) {
      const content = readSafe(file);
      for (const pattern of banned) {
        if (pattern.test(content)) offenders.push(`${relative(repoRoot, file)} → ${pattern}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it("Python legacy code keeps subprocess argv lists (no os.system)", () => {
    const content = readSafe(join(repoRoot, "legacy", "main.py"));
    expect(content).not.toMatch(/os\.system\s*\(/);
    expect(content).not.toMatch(/eval\s*\(/);
    expect(content).toContain("subprocess.run([");
  });

  it("worker code never spawns processes or uses eval", () => {
    const offenders: string[] = [];
    for (const file of walk(join(repoRoot, "backend", "cloudflare-worker", "src"), [".ts"])) {
      const content = readSafe(file);
      if (/child_process/.test(content)) offenders.push(relative(repoRoot, file));
      if (/[^.\w]eval\s*\(/.test(content)) offenders.push(relative(repoRoot, file));
    }
    expect(offenders).toEqual([]);
  });

  it("no API key literals or secret files are committed", () => {
    const offenders: string[] = [];
    for (const dir of ["app", "backend", "packages"]) {
      for (const file of walk(join(repoRoot, dir), [".dart", ".ts", ".toml", ".yaml", ".json"])) {
        const content = readSafe(file);
        // A real key assignment looks like: KEY = "<long literal>"; env reads are fine.
        if (/=\s*["'][A-Za-z0-9_-]{30,}["']/.test(content) && !file.includes("package-lock.json")) {
          offenders.push(relative(repoRoot, file));
        }
      }
    }
    expect(offenders).toEqual([]);

    expect(existsSync(join(repoRoot, "backend", "cloudflare-worker", "wrangler.toml"))).toBe(false);
    expect(existsSync(join(repoRoot, "app", ".env"))).toBe(false);
  });

  it("wrangler example documents secrets without containing any", () => {
    const example = readSafe(join(repoRoot, "backend", "cloudflare-worker", "wrangler.toml.example"));
    expect(example).toContain("wrangler secret put GEMINI_API_KEY");
    expect(example).not.toMatch(/GEMINI_API_KEY\s*=\s*["'][^"']+["']/);
  });
});
