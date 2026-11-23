/**
 * Permission engine (plan section 3.1 "Permission Engine" and section 10).
 *
 * Classifies actions into three tiers:
 *   safe      -> direct execution
 *   sensitive -> voiceprint + liveness
 *   high      -> voiceprint + liveness + PIN/Windows Hello + visible confirmation
 *
 * The default mode never executes a shell. `shell_exec` requires developer mode,
 * which is explicit, temporary, and audited.
 */

import type { CommandContext, Intent, PermissionDecision } from "./types.js";

type Policy = {
  requirement: PermissionDecision["requirement"];
  /** True when the intent needs a visible confirmation even at the safe tier. */
  confirm?: boolean;
};

const POLICY: Readonly<Record<string, Policy>> = {
  noop: { requirement: "none" },
  stop: { requirement: "none" },
  introduce: { requirement: "none" },
  search_google: { requirement: "none" },
  search_youtube: { requirement: "none" },
  play_song: { requirement: "none" },
  take_screenshot: { requirement: "none" },
  open_folder: { requirement: "none" },
  open_application: { requirement: "none" },
  ai_query: { requirement: "none" },

  // Sensitive tier: personal data.
  read_note: { requirement: "voiceprint" },
  read_private_file: { requirement: "voiceprint" },
  send_message: { requirement: "voiceprint", confirm: true },
  read_calendar: { requirement: "voiceprint" },

  // High tier: destructive or privileged operations.
  delete_file: { requirement: "voiceprint_plus_pin", confirm: true },
  install_application: { requirement: "voiceprint_plus_pin", confirm: true },
  change_account: { requirement: "voiceprint_plus_pin", confirm: true },
  payment: { requirement: "voiceprint_plus_pin", confirm: true },
  shell_exec: { requirement: "voiceprint_plus_pin", confirm: true },
};

const REJECT_REASON =
  "الأمر مرفوض في الوضع الآمن؛ لا تنفيذ للـ shell إلا في وضع المطوّر المؤقت والموثق.";

export function decide(intent: Intent, context: CommandContext = {}): PermissionDecision {
  const policy = POLICY[intent.name];

  if (!policy) {
    return {
      action: "reject",
      requirement: "none",
      reason: `نية غير معروفة: ${intent.name}`,
    };
  }

  if (intent.name === "shell_exec" && !context.developerMode) {
    return {
      action: "reject",
      requirement: "none",
      reason: REJECT_REASON,
    };
  }

  if (policy.requirement === "none") {
    return policy.confirm
      ? { action: "confirm", requirement: "none", reason: "أمر آمن يتطلب تأكيدًا ظاهرًا قبل الإرسال." }
      : { action: "execute", requirement: "none", reason: "أمر آمن ضمن المستوى الأول." };
  }

  if (policy.requirement === "voiceprint") {
    return {
      action: "auth_and_confirm",
      requirement: "voiceprint",
      reason: "أمر حساس: يتطلب بصمة صوتية واختبار حيوية.",
    };
  }

  // High tier.
  return {
    action: "auth_and_confirm",
    requirement: "voiceprint_plus_pin",
    reason: "أمر عالي الخطورة: بصمة صوتية + حيوية + PIN أو Windows Hello وتأكيد ظاهر.",
  };
}

export const permissionEngine = { decide };
