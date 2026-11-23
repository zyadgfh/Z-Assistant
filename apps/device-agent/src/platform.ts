/**
 * Pure, per-platform command builders for the device agent.
 *
 * Every builder returns an argv array executed WITHOUT a shell, so spoken
 * text never becomes shell syntax. Tests cover every mapping; the executors
 * in actions.ts only inject the runner.
 */

import type { DeviceAction } from "@maya/core";

export type Platform = "macos" | "windows" | "linux" | "unknown";

export function detectPlatform(processPlatform: string = process.platform): Platform {
  switch (processPlatform) {
    case "darwin":
      return "macos";
    case "win32":
      return "windows";
    case "linux":
      return "linux";
    default:
      return "unknown";
  }
}

export interface CommandSpec {
  file: string;
  args: string[];
  /** Human-readable description for logs and tests. */
  describe: string;
}

/** Escape a single-quoted PowerShell string literal (' -> ''). */
export function escapePowerShellSingleQuoted(text: string): string {
  return text.replace(/'/g, "''");
}

const WINDOWS_SCREENSHOT_PS = (path: string): string =>
  [
    "Add-Type -AssemblyName System.Windows.Forms,System.Drawing;",
    "$b = [System.Windows.Forms.SystemInformation]::VirtualScreen;",
    "$bmp = New-Object System.Drawing.Bitmap $b.Width, $b.Height;",
    "$g = [System.Drawing.Graphics]::FromImage($bmp);",
    "$g.CopyFromScreen($b.X, $b.Y, 0, 0, $bmp.Size);",
    `$bmp.Save('${escapePowerShellSingleQuoted(path)}');`,
    "$g.Dispose(); $bmp.Dispose();",
  ].join(" ");

const WINDOWS_TTS_PS = (text: string): string =>
  [
    "Add-Type -AssemblyName System.Speech;",
    "$s = New-Object System.Speech.Synthesis.SpeechSynthesizer;",
    "$s.SetOutputToDefaultAudioDevice();",
    `$s.Speak('${escapePowerShellSingleQuoted(text)}');`,
  ].join(" ");

export class UnsupportedActionError extends Error {
  constructor(action: string, platform: Platform) {
    super(`الفعل «${action}» غير مدعوم بعد على ${platform} في عميل الجهاز المرجعي.`);
  }
}

/** Build the argv for one declarative action on one platform. */
export function buildCommand(action: DeviceAction, platform: Platform, screenshotDir = "."): CommandSpec {
  switch (action.kind) {
    case "open_application": {
      switch (platform) {
        case "macos":
          return { file: "open", args: ["-a", action.app], describe: `فتح التطبيق ${action.app}` };
        case "windows":
          return {
            file: "powershell",
            args: ["-NoProfile", "-Command", `Start-Process '${escapePowerShellSingleQuoted(action.app)}'`],
            describe: `فتح التطبيق ${action.app}`,
          };
        case "linux":
          return { file: "xdg-open", args: [action.app], describe: `فتح التطبيق ${action.app}` };
        default:
          throw new UnsupportedActionError("open_application", platform);
      }
    }

    case "open_url": {
      switch (platform) {
        case "macos":
          return { file: "open", args: [action.url], describe: `فتح الرابط ${action.label}` };
        case "windows":
          return {
            file: "rundll32",
            args: ["url.dll,FileProtocolHandler", action.url],
            describe: `فتح الرابط ${action.label}`,
          };
        case "linux":
          return { file: "xdg-open", args: [action.url], describe: `فتح الرابط ${action.label}` };
        default:
          throw new UnsupportedActionError("open_url", platform);
      }
    }

    case "open_folder": {
      switch (platform) {
        case "macos":
          return { file: "open", args: [action.folder], describe: `فتح المجلد ${action.folder}` };
        case "windows":
          return { file: "explorer.exe", args: [action.folder], describe: `فتح المجلد ${action.folder}` };
        case "linux":
          return { file: "xdg-open", args: [action.folder], describe: `فتح المجلد ${action.folder}` };
        default:
          throw new UnsupportedActionError("open_folder", platform);
      }
    }

    case "take_screenshot": {
      const path = `${screenshotDir}/maya_screenshot_${Date.now()}.png`;
      switch (platform) {
        case "macos":
          return { file: "screencapture", args: ["-x", path], describe: `لقطة شاشة إلى ${path}` };
        case "windows":
          return {
            file: "powershell",
            args: ["-NoProfile", "-Command", WINDOWS_SCREENSHOT_PS(path)],
            describe: `لقطة شاشة إلى ${path}`,
          };
        case "linux":
          return { file: "gnome-screenshot", args: ["-f", path], describe: `لقطة شاشة إلى ${path}` };
        default:
          throw new UnsupportedActionError("take_screenshot", platform);
      }
    }

    case "play_song": {
      // Playing a song = opening the YouTube search URL; the plan keeps media
      // playback inside the browser, never a shell player.
      const query = new URLSearchParams({ search_query: action.song }).toString().replace(/\+/g, "%20");
      const url = `https://www.youtube.com/results?${query}`;
      return buildCommand({ kind: "open_url", url, label: `أغنية ${action.song}` }, platform);
    }

    case "speak": {
      switch (platform) {
        case "macos":
          return { file: "say", args: [action.text], describe: "نطق الرد" };
        case "windows":
          return {
            file: "powershell",
            args: ["-NoProfile", "-Command", WINDOWS_TTS_PS(action.text)],
            describe: "نطق الرد",
          };
        case "linux":
          return { file: "spd-say", args: ["-w", action.text], describe: "نطق الرد" };
        default:
          throw new UnsupportedActionError("speak", platform);
      }
    }

    case "stop":
      // Handled by the agent loop itself (graceful exit), never a command.
      return { file: "", args: [], describe: "إيقاف مايا" };

    default: {
      const exhaustive: never = action;
      throw new UnsupportedActionError(String((exhaustive as { kind: string }).kind), platform);
    }
  }
}
