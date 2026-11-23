#!/usr/bin/env python3
"""التحويل الصوتي المحلي لمايا — Whisper يعمل بالكامل على الجهاز.

الصوت لا يغادر الجهاز إطلاقًا: السكربت يقرأ ملفًا مسجلًا محليًا ويطبع JSON على
stdout فقط. الجهاز (macOS/Windows/Android) يستدعي هذا السكربت بعد تسجيل العبارة
في ملف مؤقت، ثم يحذف الملف فورًا وفق سياسة الاحتفاظ (الخطة §5.4).

الاستخدام:
    python stt/maya_stt.py recording.wav --model small
    python stt/maya_stt.py recording.wav --model tiny --language ar

النماذج وفق الخطة §4.3:
    tiny/base  → أجهزة ضعيفة وهواتف
    small      → أجهزة متوسطة (الافتراضي)
    medium/large-v3 → أجهزة قوية
"""

import argparse
import json
import re
import sys

ARABIC_RE = re.compile(r"[\u0600-\u06FF]")


def transcribe_faster_whisper(audio_path: str, model_size: str, language):
    from faster_whisper import WhisperModel

    model = WhisperModel(model_size, device="auto", compute_type="auto")
    segments, info = model.transcribe(audio_path, language=language)
    text = " ".join(segment.text.strip() for segment in segments).strip()
    return text, (info.language if language is None else language)


def transcribe_openai_whisper(audio_path: str, model_size: str, language):
    import whisper

    model = whisper.load_model(model_size)
    result = model.transcribe(audio_path, language=language)
    return str(result.get("text", "")).strip(), result.get("language", "unknown")


def main() -> int:
    parser = argparse.ArgumentParser(description="Maya local speech-to-text (Whisper)")
    parser.add_argument("audio", help="مسار ملف الصوت المحلي (wav/mp3/m4a)")
    parser.add_argument(
        "--model",
        default="small",
        choices=["tiny", "base", "small", "medium", "large-v3"],
        help="حجم النموذج حسب قوة الجهاز (الخطة §4.3)",
    )
    parser.add_argument(
        "--language",
        default=None,
        choices=["ar", "en"],
        help="فرض اللغة أو ترك الاكتشاف التلقائي (اختياري)",
    )
    args = parser.parse_args()

    try:
        text, language = transcribe_faster_whisper(args.audio, args.model, args.language)
    except ImportError:
        try:
            text, language = transcribe_openai_whisper(args.audio, args.model, args.language)
        except ImportError:
            print(
                json.dumps(
                    {"error": "لا يوجد محرك Whisper مثبت. ثبّت faster-whisper أو openai-whisper (stt/requirements.txt)."},
                    ensure_ascii=False,
                )
            )
            return 2

    if language in (None, "unknown") and ARABIC_RE.search(text or ""):
        language = "ar"

    print(json.dumps({"text": text, "language": language or "unknown"}, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    sys.exit(main())
