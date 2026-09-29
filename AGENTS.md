# AGENTS.md

This file defines the default working rules for AI-assisted and agentic development in this repository.

## Project Context

Panevo is an Electron, React, Vite, and TypeScript desktop app for live production control, PTZ camera operation, and future race-production integrations.

Read these docs before architectural work:

- `docs/index.md`
- `docs/product/roadmap.md`
- `docs/product/mvp-checklist.md`
- `docs/architecture/architecture.md`

## Standard Verification

Run the relevant checks after changes:

```bash
npm run type
npm run test
npm run lint
npm run format:check
```

Use judgment:

- For docs-only changes, `format:check` on changed docs is usually enough.
- For TypeScript, workflow, package, or config changes, run the full standard verification.
- For protocol, config, or service logic changes, add or update focused Vitest coverage.
- For camera-control changes, include hardware validation notes when possible.

## Coding Rules

- Keep renderer code away from raw VISCA, ONVIF, sockets, filesystem access, and Node networking APIs.
- Route camera actions through typed preload IPC and main-process services.
- Preserve stop, emergency stop, command queue, speed clamp, and active-camera validation behavior.
- Keep integrations optional and isolated.
- Do not add in-app preview backends unless the roadmap explicitly reopens preview scope.

## Documentation Rules

- Update `docs/product/mvp-checklist.md` when checklist scope changes.
- Update `docs/product/decisions.md` for architectural decisions.
- Update `docs/hardware/tenveo-hardware.md` after real hardware validation.
- Keep README end-user focused; put development details in `docs/architecture/development.md`.
