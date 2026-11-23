/**
 * Local speech-to-text contract (plan sections 4.2 and 4.3).
 *
 * The plan mandates separating: wake-word detection, speech-to-text,
 * language detection, intent extraction, and tool execution. This module owns
 * the first three steps as pure, testable units; `whisperAdapter.ts` plugs a
 * real local engine in, and `pipeline.ts` chains everything together.
 *
 * Privacy rule (plan section 5.4): raw audio is deleted by the caller right
 * after transcription; this layer never persists audio.
 */

import { isArabic, normalizeCommand } from "./commandRouter";

export type SpokenLanguage = "ar" | "en" | "unknown";

/** An utterance already written to a secure temp file by the recorder. */
export interface AudioUtterance {
  audioPath: string;
  /** Optional hint when the user forced a language in settings. */
  languageHint?: SpokenLanguage | undefined;
}

export interface TranscriptionResult {
  text: string;
  language: SpokenLanguage;
  /** Engine identifier, e.g. `whisper-cli:whisper:small`. */
  engine: string;
}

export interface SpeechToText {
  readonly name: string;
  transcribe(utterance: AudioUtterance): Promise<TranscriptionResult>;
}

export function detectSpokenLanguage(text: string): SpokenLanguage {
  if (!text.trim()) return "unknown";
  return isArabic(text) ? "ar" : "en";
}

/**
 * Returns the text after the wake word, or null when the wake word is absent.
 * Prefix-only matching keeps the false-activation rate low (plan section 4.1):
 * «شعر عن مايا» must not trigger, but «مايا، افتح كروم» must.
 */
export function extractAfterWakeWord(raw: string): string | null {
  const normalized = normalizeCommand(raw);
  for (const wake of ["مايا", "maya"]) {
    if (!normalized.startsWith(wake)) continue;
    const next = normalized.slice(wake.length);
    // The wake word must be a whole word: a following LETTER (Arabic or Latin)
    // cancels the match, while punctuation «،» or a space passes. Note that
    // «،» (U+060C) sits inside the Arabic block but is punctuation, so we
    // match on the Unicode letter property, not the block range.
    if (next && /\p{L}|\p{N}/u.test(next[0] ?? "")) continue;
    if (normalized === wake) return "";
    return next.replace(/^[\s،,:!.\-]+/, "").trim();
  }
  return null;
}
