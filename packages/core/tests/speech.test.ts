import { describe, expect, it } from "vitest";

import { detectSpokenLanguage, extractAfterWakeWord } from "../src/speech";

describe("extractAfterWakeWord", () => {
  it("strips the wake word and returns the command", () => {
    expect(extractAfterWakeWord("مايا، افتح كروم")).toBe("افتح كروم");
    expect(extractAfterWakeWord("مايا افتح كروم")).toBe("افتح كروم");
    expect(extractAfterWakeWord("Maya open Chrome")).toBe("open chrome");
    expect(extractAfterWakeWord("مايا")).toBe("");
  });

  it("returns null when the wake word is absent (ignores ambient speech)", () => {
    expect(extractAfterWakeWord("افتح كروم")).toBeNull();
    expect(extractAfterWakeWord("شعر يقول عن مايا في الحب")).toBeNull();
    expect(extractAfterWakeWord("")).toBeNull();
  });

  it("does not trigger on words that merely start with the wake word", () => {
    expect(extractAfterWakeWord("mayanne said hi")).toBeNull();
    expect(extractAfterWakeWord("ماياد هذا")).toBeNull();
  });
});

describe("detectSpokenLanguage", () => {
  it("classifies Arabic, English, and empty text", () => {
    expect(detectSpokenLanguage("مرحبا")).toBe("ar");
    expect(detectSpokenLanguage("hello there")).toBe("en");
    expect(detectSpokenLanguage("")).toBe("unknown");
  });
});
