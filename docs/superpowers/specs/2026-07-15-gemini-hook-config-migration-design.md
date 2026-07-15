# Gemini Hook Configuration Migration

## Goal

Make Gemini CLI load and execute the installed `AfterAgent` notification hook while preserving unrelated user configuration.

## Design

- Write Gemini hooks using the current nested `AfterAgent[].hooks[]` schema.
- During installation, remove this project's hooks from both the obsolete flat schema and the current nested schema, then append one valid nested definition.
- Preserve all unrelated flat entries, nested hook definitions, matchers, ordering metadata, and other settings.
- Treat only a valid nested project hook as installed so obsolete configurations cannot produce a false-positive status.
- During uninstall, remove this project's hooks from both schemas and delete only containers left empty by that removal.
- Do not change Claude hooks, OpenCode integration, Watch routing, notification channels, or Gemini hook stdout handling.

## Verification

- Cover legacy migration, mixed configurations, third-party preservation, idempotent installation, status detection, uninstall behavior, and config preview with automated tests.
- Run the complete Node test suite and frontend build.
- Migrate the local user configuration and verify that Gemini CLI 0.49.0 registers and executes the `AfterAgent` hook.
- Confirm the hook exits successfully with JSON-only stdout and produces a real notification without a Gemini hook parsing warning.
