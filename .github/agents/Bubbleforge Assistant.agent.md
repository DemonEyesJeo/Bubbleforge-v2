# Bubbleforge Assistant Rules (v2)

## Product Identity

- Bubbleforge v2 is a Vite + Vanilla JS mobile-first web app wrapped for Android with Capacitor.
- Core flow: Home (projects) -> Project (scene hub) -> Scene editors (Conversation, Title, Quote) -> Play -> Export.
- Frontend state is local-first via localStorage in src/store.js.
- Backend export is a local Flask API in backend/.

## Architecture Snapshot

- Screen pattern: class-based screens using render(), bind(), resume(), destroy().
- Router stack: src/router.js manages push/pop/replace and screen lifecycles.
- Single source of truth: src/store.js.
- Shared UI primitives live in src/components/.
- Global visual language and tokens live in src/style.css.

## Data Model Rules

- Project contains actors, scenes, and render_settings.
- Scene contains messages, status_bar config, divider_style, and actor_overrides.
- Actor identity (name, side) is project-level.
- Actor appearance can be scene-specific through scene.actor_overrides.
- Message records support text and optional media/audio/file attachments.

## Confirmed UX Behavior

- Home cards use project options menu via top-right dots on each card.
- Project screen has its own top-right project menu for Rename, Duplicate, Delete.
- Scene cards have per-scene dots menu for Rename, Duplicate, Delete.
- Bubble long-press opens message options sheet.
- Message options include React, Duplicate POV, Flip side, Copy text, Delete, and status chips.
- Duplicate POV clones message content/attachments, rewrites text POV, and places duplicate near source message.
- Back labels should read Projects, not Stories/Stores.

## Aesthetic Guardrails

- Preserve the dark glass visual system: layered translucent surfaces, soft borders, restrained glow.
- Keep spacing breathable; avoid cramped controls and text collisions.
- Use accent-driven hierarchy from CSS variables instead of hardcoded color literals.
- Keep cards and sheets with rounded corners and subtle depth, never flat utility-only boxes.
- Maintain cinematic gradients for scene covers (conversation/title/quote) without breaking legibility.
- Preserve high-contrast text hierarchy using t1-t4 tokens.

## Status Bar Direction

- Status bar is a core storytelling device, editable per scene.
- Do not reduce status controls; improve discoverability and structure instead.
- Keep live preview visible while editing.
- Prefer segmented editing over one long packed form.

## Interaction Rules

- Menus, sheets, and rails should feel consistent in motion and dismissal behavior.
- Long-press and context actions must never block primary tap navigation.
- Prevent accidental destructive actions with confirmation.
- Keep keyboard and playback interactions deterministic and easy to recover from.

## Scrollbar Rule

- Show scrollbars only in menu surfaces (hub panel, sheets, pickers, rails).
- Do not show scrollbars on regular page/screen content.
- Menu scrollbars must be small and thin.
- Scrollbar track must stay transparent.
- Menu scrollbar thumb should auto-hide after inactivity.

## Change Safety Checklist

- Keep v2 edits inside /var/home/Jeovan/Documents/Claude/Testing/Bubbleforge-v2.
- Validate with npm run build after frontend changes.
- Do not introduce external UI frameworks.
- Avoid visual regressions in top nav, bottom nav, and sheet layering.
