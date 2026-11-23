/**
 * Bilingual Arabic/English command router.
 *
 * Mirrors the safe routing of the macOS prototype (main.py) in pure TypeScript:
 * spoken text is mapped to an explicit intent, never executed as a shell command.
 * Unknown requests become `ai_query` so the model layer can answer as text only.
 */

import type { Intent } from "./types";

/** Strip Arabic diacritics (tashkeel) and normalize letters, then casefold. */
export function normalizeCommand(text: string): string {
  return text
    .normalize("NFKC")
    // eslint-disable-next-line no-control-regex -- Unicode ranges are intentional
    .replace(/[\u064B-\u0652\u0670]/g, "") // tashkeel + superscript alef
    .replace(/[\u0623\u0625\u0622]/g, "\u0627") // alef variants -> bare alef
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

export function isArabic(text: string): boolean {
  return /[\u0600-\u06FF]/.test(text);
}

const APP_ALIASES: Readonly<Record<string, string>> = {
  whatsapp: "WhatsApp",
  "واتساب": "WhatsApp",
  "الواتساب": "WhatsApp",
  chrome: "Google Chrome",
  "كروم": "Google Chrome",
  "جوجل كروم": "Google Chrome",
  safari: "Safari",
  "سفاري": "Safari",
  "visual studio code": "Visual Studio Code",
  "vs code": "Visual Studio Code",
  vscode: "Visual Studio Code",
  "فيجوال ستوديو كود": "Visual Studio Code",
  vscode_ar: "Visual Studio Code",
};

const KNOWN_APPS = new Set(Object.keys(APP_ALIASES));

function appLabel(alias: string): string {
  return APP_ALIASES[alias] ?? alias;
}

function detectLocale(text: string): Intent["locale"] {
  const hasArabic = isArabic(text);
  const hasLatin = /[a-z]/i.test(text);
  if (hasArabic && hasLatin) return "mixed";
  return hasArabic ? "ar" : "en";
}

function splitBy(command: string, keywords: string[]): string | undefined {
  for (const keyword of keywords) {
    if (command.includes(keyword)) {
      const query = command.split(keyword).slice(1).join(keyword).trim();
      if (query) return query;
    }
  }
  return undefined;
}

/** Drop the wake word («مايا») with any trailing punctuation. */
function stripWakeWord(command: string): string {
  return command.replace(/^مايا[\s،,:-]*/, "").trim();
}

/** Drop a leading "song"/«أغنية» word left over from play commands. */
function stripSongWord(song: string): string {
  return song.replace(/^(?:song|اغنية|أغنية)\s+/, "");
}

/**
 * Parse a normalized command into an explicit intent.
 * Returns `ai_query` for anything unrecognized (answered, never executed).
 */
export function parseCommand(input: string): Intent {
  const command = stripWakeWord(normalizeCommand(input));
  const locale = detectLocale(command);
  const base = { raw: input, locale };

  if (!command) {
    return { name: "noop", args: {}, risk: "safe", ...base };
  }

  if (["اوقف مايا", "ايقاف مايا", "توقف", "stop maya", "quit maya"].some((p) => command.includes(p))) {
    return { name: "stop", args: {}, risk: "safe", ...base };
  }

  if (
    ["عرفي نفسك", "من انت", "من انتي", "tell me about yourself", "introduce yourself", "who are you"].some((p) =>
      command.includes(p),
    )
  ) {
    return { name: "introduce", args: {}, risk: "safe", ...base };
  }

  if (["لقطة شاشة", "صورة للشاشة", "التقط صورة", "screenshot"].some((p) => command.includes(p))) {
    return { name: "take_screenshot", args: {}, risk: "safe", ...base };
  }

  const googleQuery = splitBy(command, ["ابحثي في جوجل عن", "ابحث في جوجل عن", "ابحثي عن", "ابحث عن", "search google for"]);
  if (googleQuery) {
    return { name: "search_google", args: { query: googleQuery }, risk: "safe", ...base };
  }

  const youtubeQuery = splitBy(command, ["ابحثي في يوتيوب عن", "ابحث في يوتيوب عن", "search youtube for"]);
  if (youtubeQuery) {
    return { name: "search_youtube", args: { query: youtubeQuery }, risk: "safe", ...base };
  }

  // Longest variants first so «شغل لي» does not leak «لي» into the song name.
  const playMatch = command.match(/^(?:play|شغل لي|شغل)\s+(.+)$/);
  if (playMatch) {
    const song = stripSongWord(playMatch[1]?.trim() ?? "");
    if (song) {
      return { name: "play_song", args: { song }, risk: "safe", ...base };
    }
  }

  // Destructive requests route to the high-risk tier: better to over-classify
  // than to misfire (plan section 10 tier 6).
  const deleteTarget = splitBy(command, ["احذف الملف", "امسح الملف", "احذف مجلد", "delete file", "احذف"]);
  if (deleteTarget) {
    return { name: "delete_file", args: { target: deleteTarget }, risk: "high", ...base };
  }

  const folderQuery = splitBy(command, ["افتحي مجلد", "افتح مجلد", "افتحي المجلد", "افتح المجلد", "open folder"]);
  if (folderQuery) {
    return { name: "open_folder", args: { folder: folderQuery }, risk: "safe", ...base };
  }

  // Feminine imperative «افتحي» must be tried before «افتح», otherwise the
  // split leaks the attached pronoun into the app name.
  const appQuery = splitBy(command, ["افتحي تطبيق", "افتح تطبيق", "افتحي", "افتح", "open the app", "open"]);
  if (appQuery) {
    const alias = appQuery in KNOWN_APPS ? appQuery : appQuery.replace(/^تطبيق\s+/, "").trim();
    if (alias) {
      return { name: "open_application", args: { app: appLabel(alias) }, risk: "safe", ...base };
    }
  }

  // Unknown request: answer only, never execute.
  return { name: "ai_query", args: { prompt: input.trim() }, risk: "safe", ...base };
}

export const commandRouter = { parseCommand, normalizeCommand, isArabic };
