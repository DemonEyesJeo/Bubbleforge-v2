# Bubbleforge v2 - V2-02 Agent Brief

## Scope
Fix only V2-02 in the v2 web app:
- src/components/keyboard.js
- src/screens/play.js
- src/main.js and/or src/router.js (only as needed for BUG-D)

Do not add extra features. Keep changes minimal and targeted.

## Known Bugs To Fix First (A -> D)

### BUG-A: Keys stay lit after press
File: src/components/keyboard.js
Root cause: A shared timer is reused for all keys, so rapid presses cancel other keys' clear timers.
Required fix:
- Use per-key timers (per element), not one shared timer.
- On key press:
  - add lit class
  - clear that key's prior timer only
  - set a new timer for that key to remove lit class

Acceptance:
- Fast repeated typing does not leave old keys stuck in lit state.

### BUG-B: Progress bar not scrubbable
File: src/screens/play.js
Root cause: Progress track has no click/drag handler wired.
Required fix:
- Add click handling on #progressTrack to seek by click position.
- Add drag scrubbing support (pointer down/move/up).
- Convert pointer x to fraction [0..1].
- Map fraction to message index.
- Re-render displayed messages through that index.
- Update fill width and time text immediately.

Acceptance:
- User can click and drag scrubber and playback position updates correctly.

### BUG-C: Ghost typing text field missing
File: src/screens/play.js
Root cause: Keyboard flashes exist but no visible text build-up field.
Required fix:
- Add a non-editable compose-like display field above keyboard overlay.
- During playback, build current message text character by character in sync with key flashes.
- Clear field when a message sends and before next typing sequence.
- Keep style consistent with existing compose input classes.

Acceptance:
- During play, user sees text visibly typing in the ghost field before send.

### BUG-D: Wrong initial screen on app boot
Files: src/main.js and src/router.js
Root cause: Home is not guaranteed as first/only boot navigation call.
Required fix:
- Ensure push('home') is the first and only initial route action.
- Ensure router state is not leaking previous screen state on reload.

Acceptance:
- Fresh app load always starts on Home.

## Router status note
- src/router.js had a broken partial edit and is now fixed to resolve stack via getStack() in push/pop/replace.
- Keep this behavior and do not regress it.

## Required smoke test after fixes
Run all checklist items and fix any failures before finishing:
- Home loads with sample project card
- Tap project -> Conversation screen slides in
- Speaker strip active chip behavior is correct
- Send message -> bubble appears on correct side
- Hub panel opens from ... and all 4 tabs switch
- Actor Editor save/back works
- Export rail opens, all 4 tabs and toggles work
- Play screen:
  - typing indicator then ghost text build-up appears
  - keyboard flashes and keys always return to normal
  - progress bar reflects and supports scrubbing
- Close returns to conversation

## Commands
From repo root:
- npm run dev
- Validate in browser at http://localhost:5173

## Done criteria
- BUG-A through BUG-D fixed
- Smoke checklist fully green
- No console errors introduced by changes
- Commit with message: Fix V2-02 play/typing/router bugs

## Suggested handoff prompt
Fix V2-02: there are 4 known bugs listed in V2-02_AGENT_BRIEF.md under BUG-A through BUG-D. Fix those first, then run the full smoke checklist in the same file and fix anything that fails. Commit only when the checklist is fully green.
