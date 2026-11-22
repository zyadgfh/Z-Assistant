"""Maya AI: bilingual Arabic/English voice assistant for macOS.

The assistant handles natural voice commands through a small, auditable command
router. It never passes spoken text to a shell; unknown requests are answered by
Ollama rather than executed as arbitrary operating-system commands.
"""

from __future__ import annotations

import logging
import os
import re
import shutil
import subprocess
import sys
import webbrowser
from datetime import datetime
from pathlib import Path
from urllib.parse import urlencode

import ollama
import pyautogui
import pywhatkit
import speech_recognition as sr

BASE_DIR = Path(__file__).resolve().parent
GIF_PATH = BASE_DIR / "maya_animation.gif"
SCREENSHOTS_DIR = BASE_DIR / "screenshots"
OLLAMA_MODEL = os.getenv("MAYA_OLLAMA_MODEL", "llama3")
RECOGNITION_LANGUAGES = ("ar-SA", "en-US")
WAKE_WORDS = ("maya", "مايا")

logging.basicConfig(level=logging.INFO, format="%(levelname)s: %(message)s")
logger = logging.getLogger("maya")
recognizer = sr.Recognizer()
_ambient_noise_calibrated = False


def is_arabic(text: str) -> bool:
    """Return True when the text contains Arabic letters."""
    return bool(re.search(r"[\u0600-\u06FF]", text))


def say_text(text: str, language: str | None = None) -> None:
    """Print and speak text without invoking a shell."""
    text = str(text).strip()
    if not text:
        return
    print(f"Maya: {text}")
    if sys.platform != "darwin":
        logger.info("Text-to-speech is only configured for macOS.")
        return

    # macOS voice names differ by installation. Try Arabic when available,
    # then fall back to the system default voice.
    voice = "Arabic" if (language == "ar" or is_arabic(text)) else None
    commands = [["say", "-v", voice, text]] if voice else []
    commands.append(["say", text])
    for command in commands:
        try:
            result = subprocess.run(command, check=False, capture_output=True, text=True)
            if result.returncode == 0:
                return
        except FileNotFoundError:
            break
        except OSError as exc:
            logger.warning("Speech error: %s", exc)
            break


def speak(text: str) -> None:
    say_text(text, "ar" if is_arabic(text) else "en")


def show_startup_gif() -> None:
    """Open the bundled animation without creating machine-specific paths."""
    try:
        if GIF_PATH.exists():
            webbrowser.open(GIF_PATH.as_uri())
        else:
            logger.info("Startup GIF not found: %s", GIF_PATH)
    except OSError as exc:
        logger.warning("Could not open startup animation: %s", exc)


def introduce_yourself() -> None:
    speak(
        "مرحباً! أنا مايا، مساعدتك الصوتية. أستطيع فتح التطبيقات، البحث، تشغيل الموسيقى، "
        "التقاط صورة للشاشة والإجابة عن الأسئلة بالعربية أو الإنجليزية."
    )


def run_mac_open(*args: str) -> bool:
    """Run macOS open with an argument list, never through a shell."""
    if sys.platform != "darwin":
        speak("هذه الوظيفة متاحة حالياً على macOS فقط.")
        return False
    try:
        result = subprocess.run(["open", *args], check=False, capture_output=True, text=True)
        if result.returncode != 0:
            logger.warning("open failed: %s", result.stderr.strip())
            return False
        return True
    except FileNotFoundError:
        speak("أمر macOS open غير متاح على هذا الجهاز.")
        return False


def open_folder_anywhere(folder_name: str) -> None:
    folder_name = folder_name.strip()
    common_folders = {
        "downloads": Path.home() / "Downloads",
        "التنزيلات": Path.home() / "Downloads",
        "desktop": Path.home() / "Desktop",
        "سطح المكتب": Path.home() / "Desktop",
        "documents": Path.home() / "Documents",
        "المستندات": Path.home() / "Documents",
        "home": Path.home(),
        "الرئيسية": Path.home(),
    }
    path = common_folders.get(folder_name)
    if path is None and shutil.which("mdfind"):
        try:
            result = subprocess.run(["mdfind", folder_name], check=False, capture_output=True, text=True)
            path = next((Path(line) for line in result.stdout.splitlines() if Path(line).is_dir()), None)
        except OSError as exc:
            logger.warning("Folder search failed: %s", exc)

    if path and path.is_dir() and run_mac_open(str(path)):
        speak("تم فتح المجلد.")
    else:
        speak("لم أجد هذا المجلد.")


def ask_local_ai(prompt: str) -> str:
    try:
        response = ollama.chat(
            model=OLLAMA_MODEL,
            messages=[
                {
                    "role": "system",
                    "content": "أجب بلغة المستخدم. لا تدّع تنفيذ أفعال على الجهاز؛ أنت تجيب فقط عن الأسئلة.",
                },
                {"role": "user", "content": prompt},
            ],
        )
        return response["message"]["content"].strip()
    except Exception as exc:
        logger.warning("Ollama is unavailable: %s", exc)
        return "تعذر الاتصال بالمساعد المحلي. تأكد من تشغيل Ollama والنموذج." if is_arabic(prompt) else "Ollama is unavailable. Start Ollama and verify the model is installed."


def listen_command(timeout: int = 5, phrase_time: int = 8) -> str:
    """Recognize Arabic first, then English, while keeping microphone errors visible."""
    global _ambient_noise_calibrated
    try:
        with sr.Microphone() as source:
            if not _ambient_noise_calibrated:
                recognizer.adjust_for_ambient_noise(source, duration=0.5)
                _ambient_noise_calibrated = True
            print("Listening / أستمع...")
            audio = recognizer.listen(source, timeout=timeout, phrase_time_limit=phrase_time)
    except sr.WaitTimeoutError:
        return ""
    except (OSError, AttributeError) as exc:
        logger.error("Microphone error: %s", exc)
        return ""

    for language in RECOGNITION_LANGUAGES:
        try:
            return recognizer.recognize_google(audio, language=language)
        except sr.UnknownValueError:
            continue
        except sr.RequestError as exc:
            logger.warning("Speech recognition service error: %s", exc)
            break
    return ""


def play_song(command: str) -> None:
    match = re.search(r"(?:play|شغل|شغّل|شغل لي|شغّل لي)\s+(.+)$", command, re.IGNORECASE)
    song = match.group(1).strip() if match else ""
    song = re.sub(r"^(?:song|أغنية|اغنية)\s+", "", song, flags=re.IGNORECASE)
    if not song:
        speak("اذكر اسم الأغنية من فضلك.")
        return
    try:
        speak(f"سأشغل {song} على YouTube.")
        pywhatkit.playonyt(song)
    except Exception as exc:
        logger.warning("Could not play song: %s", exc)
        speak("تعذر تشغيل الأغنية.")


def take_screenshot() -> Path | None:
    try:
        SCREENSHOTS_DIR.mkdir(exist_ok=True)
        file_path = SCREENSHOTS_DIR / f"screenshot_{datetime.now():%Y-%m-%d_%H-%M-%S}.png"
        pyautogui.screenshot().save(file_path)
        run_mac_open(str(file_path))
        return file_path
    except (OSError, pyautogui.FailSafeException) as exc:
        logger.warning("Screenshot failed: %s", exc)
        return None


def open_search(engine: str, query: str) -> None:
    query = query.strip()
    if not query:
        speak("ما موضوع البحث؟")
        return
    base = "https://www.google.com/search" if engine == "google" else "https://www.youtube.com/results"
    webbrowser.open(f"{base}?{urlencode({'q' if engine == 'google' else 'search_query': query})}")


def normalized(command: str) -> str:
    return re.sub(r"\s+", " ", command.casefold()).strip()


def process_command(command: str) -> None:
    """Route Arabic/English natural commands to safe, explicit actions."""
    command = normalized(command)
    if not command:
        return

    try:
        if any(word in command for word in ("stop maya", "quit maya", "أوقف مايا", "إيقاف مايا", "توقف")):
            speak("إلى اللقاء.")
            raise SystemExit
        if any(phrase in command for phrase in ("tell me about yourself", "introduce yourself", "who are you", "عرفي نفسك", "من أنت", "من انتي")):
            introduce_yourself()
        elif any(phrase in command for phrase in ("screenshot", "take a screenshot", "لقطة شاشة", "صورة للشاشة", "التقط صورة")):
            speak("تم التقاط صورة الشاشة." if take_screenshot() else "تعذر التقاط صورة الشاشة.")
        elif re.search(r"(?:search google for|ابحث في جوجل عن|ابحث عن)", command):
            query = re.split(r"(?:search google for|ابحث في جوجل عن|ابحث عن)", command, maxsplit=1)[-1]
            open_search("google", query)
        elif re.search(r"(?:search youtube for|ابحث في يوتيوب عن)", command):
            query = re.split(r"(?:search youtube for|ابحث في يوتيوب عن)", command, maxsplit=1)[-1]
            open_search("youtube", query)
        elif re.match(r"(?:play|شغل|شغّل|شغل لي|شغّل لي)\b", command):
            play_song(command)
        elif re.search(r"(?:open folder|افتح مجلد|افتح المجلد)", command):
            folder = re.split(r"(?:open folder|افتح مجلد|افتح المجلد)", command, maxsplit=1)[-1]
            open_folder_anywhere(folder)
        elif any(x in command for x in ("open youtube", "افتح يوتيوب")):
            webbrowser.open("https://youtube.com")
        elif any(x in command for x in ("open whatsapp", "افتح واتساب", "افتح الواتساب")):
            speak("سأفتح واتساب.")
            run_mac_open("-a", "WhatsApp")
        elif any(x in command for x in ("open chrome", "افتح كروم", "افتح جوجل كروم")):
            speak("سأفتح Chrome.")
            run_mac_open("-a", "Google Chrome")
        elif any(x in command for x in ("open safari", "افتح سفاري")):
            speak("سأفتح Safari.")
            run_mac_open("-a", "Safari")
        elif any(x in command for x in ("open visual studio code", "open vs code", "افتح فيجوال ستوديو كود", "افتح vscode")):
            speak("سأفتح Visual Studio Code.")
            run_mac_open("-a", "Visual Studio Code")
        elif re.match(r"(?:open|افتح)\s+.+", command):
            # Opening a named application is bounded to macOS's `open -a` and
            # does not execute arbitrary shell syntax.
            app = re.sub(r"^(?:open|افتح)\s+", "", command).strip()
            if app:
                speak(f"سأحاول فتح {app}.")
                run_mac_open("-a", app)
        else:
            speak(ask_local_ai(command))
    except SystemExit:
        raise
    except Exception as exc:
        logger.exception("Command processing error: %s", exc)
        speak("حدث خطأ أثناء تنفيذ الطلب.")


def start_maya() -> None:
    show_startup_gif()
    speak("مرحباً، مايا جاهزة. قل: مايا، ثم تحدث بالعربية أو الإنجليزية.")
    while True:
        try:
            wake_word = listen_command(timeout=5, phrase_time=4)
            if not wake_word:
                continue
            wake = normalized(wake_word)
            if any(word in wake for word in WAKE_WORDS):
                speak("نعم، كيف أساعدك؟" if is_arabic(wake_word) else "Yes, how can I help?")
                command = listen_command(timeout=8, phrase_time=12)
                if command:
                    process_command(command)
        except SystemExit:
            break
        except KeyboardInterrupt:
            print("\nMaya stopped by user")
            break


if __name__ == "__main__":
    start_maya()
