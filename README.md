# Maya — Z-Assistant

Voice-first Arabic assistant for **Windows** and **Android**, built with Flutter and a
Cloudflare Worker backend that keeps the Gemini API key server-side. Deterministic local
commands work fully offline; unknown requests fall back to Gemini through the worker.

> العربية؟ اقرأ [README-ar.md](README-ar.md).

## Repository layout

| Path | Purpose |
|---|---|
| `app/` | Flutter app (Windows + Android): voice UI, local intents, permissions, tests |
| `backend/cloudflare-worker/` | TypeScript worker: `/v1/assistant`, `/v1/transcribe` (reserved), `/health` |
| `packages/core/` | Earlier TypeScript pipeline (dashboard/device-agent era) — kept working |
| `apps/dashboard/` | Next.js console from phase 1 — kept working |
| `apps/device-agent/` | Node agent with Whisper STT — kept working |
| `legacy/` | Original Python prototype (main.py, gif viewer, HTML animation) — preserved |
| `assets/` | Shared assets (Maya animation GIF) |
| `docs/` | Arabic docs: architecture, privacy, Windows/Android setup, API contract |

## Quick start

```bash
# Backend (holds GEMINI_API_KEY as a Cloudflare secret)
cd backend/cloudflare-worker && npm install && npx vitest run
cp wrangler.toml.example wrangler.toml   # edit ALLOWED_ORIGINS
npx wrangler secret put GEMINI_API_KEY && npm run deploy

# Flutter app (generate platform folders once — they are not committed)
cd app
flutter create . --platforms=windows,android --project-name maya_assistant
flutter run -d windows          # or -d android
flutter test                    # Dart tests (offline intents, permissions, controller…)
```

The backend URL is a **public** setting (never a secret): set it in the app's settings
screen or via `--dart-define=MAYA_BACKEND_URL=...`.

## Safety model

- **safe** — open app/site/folder, searches, screenshot, volume, local music: executes.
- **sensitive** — close app, delete file, send message, change setting: spoken/typed confirmation first.
- **critical** — installs, payments, shell exec: rejected in v1 (interfaces only, TODO).
- Spoken text never reaches a shell; process calls use argv lists only.
- No API key in Dart/APK/repo; worker validates model output against an intent whitelist.
- On-device STT, no raw audio upload, 12-second capture ceiling, deletable temp files.

## Status (honest)

- Worker: fully implemented and tested here (35 vitest tests green).
- Flutter: complete Dart source and tests written, **not executed** in this environment
  (no Flutter/Dart SDK available in the sandbox) — run `flutter test` locally.
- Windows local STT needs a native bridge (planned); Android STT/TTS work via system engines.
- Windows Hello and wake-word service: interfaces prepared, not implemented.

License: MIT — see [LICENSE](LICENSE).
