import { describe, expect, it } from "vitest";

import { isArabic, normalizeCommand, parseCommand } from "../src/commandRouter";

describe("normalizeCommand", () => {
  it("strips tashkeel so «شغّل» matches «شغل»", () => {
    expect(normalizeCommand("شغّل أغنية Believer")).toBe("شغل اغنية believer");
  });

  it("normalizes alef variants", () => {
    expect(normalizeCommand("افتحِ الواتسأب")).toBe("افتح الواتساب");
  });
});

describe("parseCommand", () => {
  it("routes «شغل لي اغنية believer» to play_song without leaking لي", () => {
    const intent = parseCommand("شغّل لي أغنية Believer");
    expect(intent.name).toBe("play_song");
    expect(intent.args.song).toBe("believer");
    expect(intent.locale).toBe("mixed");
  });

  it("routes English play commands", () => {
    const intent = parseCommand("play song Believer");
    expect(intent.name).toBe("play_song");
    expect(intent.args.song).toBe("believer");
  });

  it("maps «افتح كروم» to the canonical app name", () => {
    const intent = parseCommand("مايا، افتحي كروم");
    expect(intent.name).toBe("open_application");
    expect(intent.args.app).toBe("Google Chrome");
  });

  it("handles the feminine imperative and masculine forms alike", () => {
    expect(parseCommand("افتحي كروم").args.app).toBe("Google Chrome");
    expect(parseCommand("افتح كروم").args.app).toBe("Google Chrome");
    expect(parseCommand("ابحثي في جوجل عن python").name).toBe("search_google");
  });

  it("strips the wake word before routing", () => {
    expect(parseCommand("مايا افتح سفاري").args.app).toBe("Safari");
  });

  it("maps open whatsapp in Arabic and English", () => {
    expect(parseCommand("افتح واتساب").args.app).toBe("WhatsApp");
    expect(parseCommand("Open WhatsApp").args.app).toBe("WhatsApp");
  });

  it("extracts Google and YouTube queries", () => {
    expect(parseCommand("ابحث في جوجل عن python")).toMatchObject({
      name: "search_google",
      args: { query: "python" },
    });
    expect(parseCommand("ابحث في يوتيوب عن أخبار التقنية")).toMatchObject({
      name: "search_youtube",
      args: { query: "اخبار التقنية" },
    });
    expect(parseCommand("search google for C++ & Python").args.query).toBe("c++ & python");
  });

  it("routes screenshot, folder and stop commands", () => {
    expect(parseCommand("التقط صورة للشاشة").name).toBe("take_screenshot");
    expect(parseCommand("افتح مجلد التنزيلات").name).toBe("open_folder");
    expect(parseCommand("أوقف مايا").name).toBe("stop");
  });

  it("routes destructive requests to the high-risk delete_file intent", () => {
    const intent = parseCommand("احذف الملف القديم");
    expect(intent).toMatchObject({ name: "delete_file", risk: "high", args: { target: "القديم" } });
    expect(parseCommand("delete file report.pdf").name).toBe("delete_file");
  });

  it("falls back to ai_query for unknown text (answered, never executed)", () => {
    const intent = parseCommand("ما عاصمة اليابان؟");
    expect(intent.name).toBe("ai_query");
    expect(intent.args.prompt).toBe("ما عاصمة اليابان؟");
  });

  it("detects mixed Arabic/English locale", () => {
    expect(parseCommand("ابحث في جوجل عن nextjs tutorial").locale).toBe("mixed");
  });
});

describe("isArabic", () => {
  it("detects Arabic letters", () => {
    expect(isArabic("مرحبا")).toBe(true);
    expect(isArabic("hello")).toBe(false);
  });
});
