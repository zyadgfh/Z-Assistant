import { describe, expect, it } from "vitest";

import { buildCommand, detectPlatform, escapePowerShellSingleQuoted, UnsupportedActionError } from "../src/platform.js";
import type { DeviceAction } from "@maya/core";

describe("detectPlatform", () => {
  it("maps node platforms to Maya platforms", () => {
    expect(detectPlatform("darwin")).toBe("macos");
    expect(detectPlatform("win32")).toBe("windows");
    expect(detectPlatform("linux")).toBe("linux");
    expect(detectPlatform("sunos")).toBe("unknown");
  });
});

describe("escapePowerShellSingleQuoted", () => {
  it("doubles single quotes", () => {
    expect(escapePowerShellSingleQuoted("maya's reply")).toBe("maya''s reply");
    expect(escapePowerShellSingleQuoted("نص عربي")).toBe("نص عربي");
  });
});

describe("buildCommand", () => {
  it("maps open_application per platform", () => {
    const action: DeviceAction = { kind: "open_application", app: "Google Chrome" };
    expect(buildCommand(action, "macos")).toMatchObject({ file: "open", args: ["-a", "Google Chrome"] });
    expect(buildCommand(action, "windows")).toMatchObject({ file: "powershell" });
    expect(buildCommand(action, "linux")).toMatchObject({ file: "xdg-open", args: ["Google Chrome"] });
    expect(() => buildCommand(action, "unknown")).toThrow(UnsupportedActionError);
  });

  it("maps open_url without any shell string", () => {
    const action: DeviceAction = { kind: "open_url", url: "https://example.com/?q=C%2B%2B", label: "بحث" };
    expect(buildCommand(action, "macos")).toEqual({ file: "open", args: ["https://example.com/?q=C%2B%2B"], describe: expect.any(String) });
    expect(buildCommand(action, "windows")).toEqual({
      file: "rundll32",
      args: ["url.dll,FileProtocolHandler", "https://example.com/?q=C%2B%2B"],
      describe: expect.any(String),
    });
  });

  it("maps open_folder per platform", () => {
    const action: DeviceAction = { kind: "open_folder", folder: "Downloads" };
    expect(buildCommand(action, "macos").file).toBe("open");
    expect(buildCommand(action, "windows").file).toBe("explorer.exe");
    expect(buildCommand(action, "linux").file).toBe("xdg-open");
  });

  it("writes screenshots to the given directory", () => {
    const action: DeviceAction = { kind: "take_screenshot" };
    const mac = buildCommand(action, "macos", "/tmp/shots");
    expect(mac.file).toBe("screencapture");
    expect(mac.args[0]).toBe("-x");
    expect(mac.args[1]).toMatch(/^\/tmp\/shots\/maya_screenshot_\d+\.png$/);
    const win = buildCommand(action, "windows", "C:/temp");
    expect(win.file).toBe("powershell");
    expect(win.args[2]).toContain("CopyFromScreen");
  });

  it("routes play_song to a YouTube search through open_url", () => {
    const command = buildCommand({ kind: "play_song", song: "believer" }, "macos");
    expect(command.file).toBe("open");
    expect(command.args[0]).toBe("https://www.youtube.com/results?search_query=b believer".replace("b believer", "believer"));
  });

  it("escapes user-visible text in Windows TTS", () => {
    const command = buildCommand({ kind: "speak", text: "مايا's test" }, "windows");
    expect(command.args[2]).toContain("مايا''s test");
  });

  it("handles stop without spawning anything", () => {
    const command = buildCommand({ kind: "stop" }, "macos");
    expect(command.file).toBe("");
    expect(command.describe).toContain("إيقاف");
  });
});
