# Claude SDK Session Notification Filter

## Goal

Prevent Claude SDK-derived sessions from producing false completion notifications while preserving the existing interactive Claude Hook and Watch behavior.

## Design

- Add a bounded, structured parser for Claude session origin metadata.
- Prefer `entrypoint` and `promptSource` from the Hook payload, then inspect the beginning of the transcript when those fields are absent.
- Classify `entrypoint: "sdk-cli"` or `promptSource: "sdk"` as SDK-derived, and `entrypoint: "cli"` or `promptSource: "typed"` as interactive.
- Treat missing, unreadable, or unknown metadata as interactive-compatible so notifications fail open.
- Add `sources.claude.onlyInteractive`, enabled by default, with a desktop UI switch. Users who need `claude -p` notifications can disable it.
- Apply the same classifier to Claude Stop Hooks and Claude Watch so Hybrid mode cannot reintroduce the same false notification.
- Keep Claude assistant-text extraction, failure detection, delay, summary, channel routing, deduplication, and confirm reminders unchanged for allowed sessions.
- Do not change Codex, Gemini, or OpenCode behavior.

## Verification

- Test SDK and interactive Hook payloads, transcript fallback, unreadable transcript fail-open behavior, and the disabled-filter compatibility path.
- Test Claude Watch suppression for SDK transcripts and normal notification for interactive transcripts.
- Test configuration defaults and the Claude source UI control.
- Run the complete test suite and frontend/macOS builds, including existing Gemini Hook protocol regressions.
