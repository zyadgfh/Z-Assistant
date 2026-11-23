/**
 * Known-intent taxonomy and the deterministic Arabic/English parser.
 *
 * Mirrors the shared core (packages/core) and the Flutter offline service so
 * every tier behaves identically. Spoken text is NEVER turned into a shell
 * command: unknown requests go to Gemini, which may only answer with an intent
 * from this whitelist and validated arguments.
 */

export type Risk = "safe" | "sensitive" | "critical";

export interface Intent {
  name: string;
  args: Record<string, string>;
  risk: Risk;
  /** Null for free-text answers that execute nothing. */
}

/** Arguments each intent accepts; anything else returned by a model is dropped. */
export const INTENT_ARGS: Readonly<Record<string, readonly string[]>> = {
  open_application: ["application"],
  open_url: ["site"],
  search_google: ["query"],
  search_youtube: ["query"],
  take_screenshot: [],
  volume_up: [],
  volume_down: [],
  open_folder: ["folder"],
  play_local_music: ["file"],
  close_application: ["application"],
  send_message: ["recipient", "message"],
  delete_file: ["path"],
  change_setting: ["setting"],
  open_private_file: ["path"],
};

export const INTENT_RISK: Readonly<Record<string, Risk>> = {
  open_application: "safe",
  open_url: "safe",
  search_google: "safe",
  search_youtube: "safe",
  take_screenshot: "safe",
  volume_up: "safe",
  volume_down: "safe",
  open_folder: "safe",
  play_local_music: "safe",
  close_application: "sensitive",
  send_message: "sensitive",
  delete_file: "sensitive",
  change_setting: "sensitive",
  open_private_file: "sensitive",
};

/** Critical tier exists in the policy but is never executed in v1. */
export const CRITICAL_INTENTS: readonly string[] = ["install_application", "payment", "shell_exec"];

export function isKnownIntent(name: string): boolean {
  return name in INTENT_ARGS;
}

export function validateArgs(name: string, args: Record<string, unknown>): Record<string, string> | null {
  const allowed = INTENT_ARGS[name];
  if (!allowed) return null;
  const clean: Record<string, string> = {};
  for (const key of allowed) {
    const value = args[key];
    if (typeof value !== "string") continue;
    const value_ = value.trim().slice(0, 200);
    if (!value_) continue;
    if (key === "path" && /[*?;"'`$&|<>]/.test(value_)) return null; // no wildcards/quotes in paths
    clean[key] = value_;
  }
  return clean;
}

export function normalizeText(text: string): string {
  return text
    .normalize("NFKC")
    .replace(/[\u064B-\u0652\u0670]/g, "")
    .replace(/[\u0623\u0625\u0622]/g, "\u0627")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

const APP_ALIASES: Readonly<Record<string, string>> = {
  "كروم": "Google Chrome",
  "جوجل كروم": "Google Chrome",
  "chrome": "Google Chrome",
  "واتساب": "WhatsApp",
  "الواتساب": "WhatsApp",
  "whatsapp": "WhatsApp",
  "فيجوال ستوديو كود": "VS Code",
  "في اس كود": "VS Code",
  "vs code": "VS Code",
  "vscode": "VS Code",
  "تليجرام": "Telegram",
  "telegram": "Telegram",
};

const SITE_ALIASES: Readonly<Record<string, string>> = {
  "يوتيوب": "https://www.youtube.com",
  "youtube": "https://www.youtube.com",
  "جوجل": "https://www.google.com",
  "google": "https://www.google.com",
  "جيميل": "https://mail.google.com",
  "gmail": "https://mail.google.com",
  "واتساب ويب": "https://web.whatsapp.com",
  "whatsapp web": "https://web.whatsapp.com",
};

const FOLDER_ALIASES: Readonly<Record<string, string>> = {
  "التنزيلات": "downloads",
  "التحميلات": "downloads",
  "downloads": "downloads",
  "سطح المكتب": "desktop",
  "desktop": "desktop",
  "المستندات": "documents",
  "documents": "documents",
};

function resolveAlias(text: string, aliases: Readonly<Record<string, string>>): string | null {
  const cleaned = text.replace(/^(?:تطبيق|برنامج|الموقع|موقع|مجلد)\s+/, "").trim();
  if (aliases[cleaned]) return aliases[cleaned];
  for (const [alias, target] of Object.entries(aliases)) {
    if (cleaned.includes(alias)) return target;
  }
  return null;
}

/** Drop «الأغنية/الاغنية/دي/ملف» leftovers from play requests. */
function cleanSongName(raw: string): string {
  let song = raw
    .replace(/^(?:الاغنيه|الاغنية|اغنيه|اغنية|ملف الموسيقى|ملف الموسيقي|الموسيقى|الموسيقي)\s+/, "")
    .trim();
  song = song.replace(/\s+(?:دي|ده|المحلية|المحلي)$/, "").trim();
  if (["دي", "ده", "المحلي", "المحلية"].includes(song)) return "";
  return song;
}

/**
 * Deterministic parse of a normalized utterance. Returns null for unknown
 * requests (the caller then asks Gemini). Covers the Egyptian forms from the
 * spec: «افتحلي كروم»، «شغلّي الأغنية دي»، «هاتلي بحث عن...»، «اقفل التطبيق».
 */
export function parseIntent(rawText: string): Intent | null {
  const text = normalizeText(rawText);

  const screenshot = text.match(/(?:خذ|التقط|اسقاط)\s*(?:لقطة|صورة)?\s*(?:للشاشة)?|^screenshot$|لقطة شاشة|screenshot/);
  if (screenshot) return { name: "take_screenshot", args: {}, risk: "safe" };

  const volumeUp = text.match(/ارفع\s*(?:الصوت|الفول)?|volume up|زود الصوت/);
  if (volumeUp) return { name: "volume_up", args: {}, risk: "safe" };

  const volumeDown = text.match(/(?:اخفض|قلل|نزل)\s*(?:الصوت|الفول)?|volume down/);
  if (volumeDown) return { name: "volume_down", args: {}, risk: "safe" };

  const googleSearch = text.match(/(?:هاتلي البحث عن|هاتلي بحث عن|ابحث في جوجل عن|ابحث في جوجل|ابحث عن|دور في جوجل عن|دور عن|search google for)\s+(.+)/);
  if (googleSearch?.[1]) return { name: "search_google", args: { query: googleSearch[1].trim() }, risk: "safe" };

  const youtubeSearch = text.match(/(?:ابحث في يوتيوب عن|search youtube for)\s+(.+)/);
  if (youtubeSearch?.[1]) return { name: "search_youtube", args: { query: youtubeSearch[1].trim() }, risk: "safe" };

  // Local music before generic «شغّل …» so the explicit local-file phrase wins.
  const localMusic = text.match(/(?:شغللي|شغلي|شغل)\s*(?:ملف)?\s*(?:الموسيقى|الموسيقي)\s*(?:المحلية|المحلي)?|play local music/);
  if (localMusic) return { name: "play_local_music", args: {}, risk: "safe" };

  // Normalization strips shadda: «شغلّي» becomes «شغلي».
  const playMatch = text.match(/^(?:شغللي|شغلي|شغل)\s+(.+)$/);
  if (playMatch?.[1]) {
    const song = cleanSongName(playMatch[1]);
    if (song) return { name: "search_youtube", args: { query: song }, risk: "safe" };
  }

  const folderMatch = text.match(/افتح(?:لي)?\s*(?:مجلد)?\s*(.+)/);
  if (folderMatch?.[1]) {
    const folder = resolveAlias(folderMatch[1], FOLDER_ALIASES);
    if (folder) return { name: "open_folder", args: { folder }, risk: "safe" };
  }

  const closeMatch = text.match(/^(?:اقفللي|اقفل|سكر|اغلق)\s+(?:تطبيق\s+)?(.+)$/);
  if (closeMatch?.[1]) {
    const application = resolveAlias(closeMatch[1], APP_ALIASES) ?? closeMatch[1].trim();
    return { name: "close_application", args: { application }, risk: "sensitive" };
  }

  const deleteMatch = text.match(/(?:احذف|امسح)\s+(?:الملف|ملف)\s+(.+)/);
  if (deleteMatch?.[1]) return { name: "delete_file", args: { path: deleteMatch[1].trim() }, risk: "sensitive" };

  const sendMatch = text.match(/^(?:ابعتلي|ابعت|ارسل|أرسل)\s+(?:رسالة|رساله|message)?\s*(?:لـ|لى|ل|الى|إلى)?\s*(.+?)\s*(?:قول|بان|بإن|يقول)\s+(.+)$/);
  if (sendMatch?.[1] && sendMatch[2]) {
    return { name: "send_message", args: { recipient: sendMatch[1].trim(), message: sendMatch[2].trim() }, risk: "sensitive" };
  }

  const settingMatch = text.match(/(?:غير|غيّر)\s+(?:الاعداد|الإعداد)\s+(.+)/);
  if (settingMatch?.[1]) return { name: "change_setting", args: { setting: settingMatch[1].trim() }, risk: "sensitive" };

  const openMatch = text.match(/^(?:افتحلي|افتح|فتح|open)\s+(.+)$/);
  if (openMatch?.[1]) {
    const target = openMatch[1].trim();
    const site = resolveAlias(target, SITE_ALIASES);
    if (site) return { name: "open_url", args: { site }, risk: "safe" };
    const application = resolveAlias(target, APP_ALIASES);
    if (application) return { name: "open_application", args: { application }, risk: "safe" };
  }

  return null;
}

/** Arabic reply templates (Egyptian dialect) for deterministic intents. */
export function replyFor(intent: Intent): string {
  switch (intent.name) {
    case "open_application":
      return `حاضر، هفتح ${intent.args.application ?? "التطبيق"}`;
    case "open_url":
      return "حاضر، بفتح الموقع";
    case "search_google":
      return `ببحث في جوجل عن ${intent.args.query ?? ""}`;
    case "search_youtube":
      return `بشغّل ${intent.args.query ?? ""} على يوتيوب`;
    case "take_screenshot":
      return "بصّ، بآخد لقطة للشاشة";
    case "volume_up":
      return "ولّعت الصوت لفوق";
    case "volume_down":
      return "نزّلت الصوت شوية";
    case "open_folder":
      return "بفتح المجلد";
    case "play_local_music":
      return "بشغّل ملف الموسيقى المحلي";
    case "close_application":
      return `تحب اقفل ${intent.args.application ?? "التطبيق"}؟`;
    case "send_message":
      return `سأرسل الرسالة إلى ${intent.args.recipient ?? ""}: «${intent.args.message ?? ""}». هل تؤكد؟`;
    case "delete_file":
      return `سأنقل الملف إلى سلة المهملات: ${intent.args.path ?? ""}. هل تؤكد؟`;
    case "change_setting":
      return `سأغير الإعداد: ${intent.args.setting ?? ""}. هل تؤكد؟`;
    case "open_private_file":
      return `سأفتح الملف الخاص: ${intent.args.path ?? ""}. هل تؤكد؟`;
    default:
      return "تم";
  }
}
