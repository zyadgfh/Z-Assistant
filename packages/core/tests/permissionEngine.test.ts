import { describe, expect, it } from "vitest";

import { decide } from "../src/permissionEngine";
import { parseCommand } from "../src/commandRouter";

describe("permissionEngine", () => {
  it("executes safe intents directly", () => {
    const decision = decide(parseCommand("افتح كروم"));
    expect(decision).toMatchObject({ action: "execute", requirement: "none" });
  });

  it("requires voiceprint for sensitive personal data", () => {
    const decision = decide({ name: "read_note", args: {}, risk: "sensitive", raw: "", locale: "ar" });
    expect(decision).toMatchObject({ action: "auth_and_confirm", requirement: "voiceprint" });
  });

  it("requires voiceprint + PIN for high-risk operations", () => {
    const decision = decide({ name: "delete_file", args: {}, risk: "high", raw: "", locale: "ar" });
    expect(decision).toMatchObject({
      action: "auth_and_confirm",
      requirement: "voiceprint_plus_pin",
    });
  });

  it("rejects shell by default — the safe mode never runs a shell", () => {
    const decision = decide({ name: "shell_exec", args: { command: "rm -rf /" }, risk: "high", raw: "", locale: "en" });
    expect(decision.action).toBe("reject");
  });

  it("allows shell only in explicit developer mode with the highest auth tier", () => {
    const decision = decide(
      { name: "shell_exec", args: { command: "ls" }, risk: "high", raw: "", locale: "en" },
      { developerMode: true },
    );
    expect(decision).toMatchObject({ action: "auth_and_confirm", requirement: "voiceprint_plus_pin" });
  });

  it("rejects unknown intents", () => {
    const decision = decide({ name: "does_not_exist", args: {}, risk: "safe", raw: "", locale: "ar" });
    expect(decision.action).toBe("reject");
  });
});
