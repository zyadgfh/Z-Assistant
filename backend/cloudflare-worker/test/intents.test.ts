import { describe, expect, it } from "vitest";

import { parseIntent, replyFor, validateArgs } from "../src/intents.js";

describe("deterministic intent parser", () => {
  it("parses «افتحلي كروم» (Egyptian) to the canonical app", () => {
    expect(parseIntent("افتحلي كروم")).toMatchObject({
      name: "open_application",
      args: { application: "Google Chrome" },
      risk: "safe",
    });
  });

  it("parses «افتح كروم» and English «open chrome»", () => {
    expect(parseIntent("افتح كروم")?.args.application).toBe("Google Chrome");
    expect(parseIntent("open chrome")?.args.application).toBe("Google Chrome");
  });

  it("routes known sites to open_url, not app launching", () => {
    expect(parseIntent("افتح يوتيوب")).toMatchObject({
      name: "open_url",
      args: { site: "https://www.youtube.com" },
    });
  });

  it("parses «هاتلي بحث عن python» (Egyptian) to a Google search", () => {
    expect(parseIntent("هاتلي بحث عن python")).toMatchObject({
      name: "search_google",
      args: { query: "python" },
    });
  });

  it("parses YouTube searches and song requests", () => {
    expect(parseIntent("ابحث في يوتيوب عن أخبار التقنية")?.name).toBe("search_youtube");
    expect(parseIntent("شغلّي أغنية Believer")).toMatchObject({
      name: "search_youtube",
      args: { query: "believer" },
    });
  });

  it("routes «شغل ملف الموسيقى المحلي» to the local music intent", () => {
    expect(parseIntent("شغل ملف الموسيقى المحلي")?.name).toBe("play_local_music");
    expect(parseIntent("play local music")?.name).toBe("play_local_music");
  });

  it("parses screenshot, volume, and known folders", () => {
    expect(parseIntent("خذ screenshot")?.name).toBe("take_screenshot");
    expect(parseIntent("التقط صورة للشاشة")?.name).toBe("take_screenshot");
    expect(parseIntent("ارفع الصوت")?.name).toBe("volume_up");
    expect(parseIntent("اخفض الصوت")?.name).toBe("volume_down");
    expect(parseIntent("افتح مجلد التنزيلات")).toMatchObject({
      name: "open_folder",
      args: { folder: "downloads" },
    });
    expect(parseIntent("افتح مجلد سطح المكتب")?.args.folder).toBe("desktop");
  });

  it("marks close_application as sensitive", () => {
    expect(parseIntent("اقفل التطبيق كروم")).toMatchObject({
      name: "close_application",
      args: { application: "Google Chrome" },
      risk: "sensitive",
    });
  });

  it("marks destructive and messaging intents as sensitive", () => {
    expect(parseIntent("احذف الملف report.pdf")).toMatchObject({ name: "delete_file", risk: "sensitive" });
    expect(parseIntent("ابعت رسالة لاحمد قول إزيك")).toMatchObject({
      name: "send_message",
      args: { recipient: "احمد", message: "ازيك" },
      risk: "sensitive",
    });
  });

  it("returns null for unknown questions (they go to Gemini)", () => {
    expect(parseIntent("ما عاصمة اليابان؟")).toBeNull();
    expect(parseIntent("اكتب لي قصيدة")).toBeNull();
  });

  it("rejects wildcard/quoted paths in argument validation", () => {
    expect(validateArgs("delete_file", { path: "C:/data/*.pdf" })).toBeNull();
    expect(validateArgs("delete_file", { path: 'notes"; rm -rf /' })).toBeNull();
    expect(validateArgs("delete_file", { path: "report.pdf" })).toEqual({ path: "report.pdf" });
  });

  it("allows only http(s) scheme for URLs (never file:/javascript:/intent:)", () => {
    expect(validateArgs("open_url", { site: "javascript:alert(1)" })).toBeNull();
    expect(validateArgs("open_url", { site: "file:///C:/Windows/System32" })).toBeNull();
    expect(validateArgs("open_url", { site: "intent://evil#Intent" })).toBeNull();
    expect(validateArgs("open_url", { site: "https://www.youtube.com" })).toEqual({
      site: "https://www.youtube.com",
    });
    expect(validateArgs("open_url", { site: "http://example.com/page" })).toEqual({ site: "http://example.com/page" });
  });

  it("builds Egyptian replies for deterministic intents", () => {
    const intent = parseIntent("افتحلي كروم");
    expect(replyFor(intent!)).toContain("هفتح Google Chrome");
    expect(replyFor({ name: "send_message", args: { recipient: "أحمد", message: "سلام" }, risk: "sensitive" })).toContain("هل تؤكد؟");
  });
});
