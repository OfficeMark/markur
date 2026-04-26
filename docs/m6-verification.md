# M6 verification — audit walkaround

**Live URL:** https://waymarks-rebuild.netlify.app
**Migration applied:** `0012_m6_audit_session_triggers_and_helpers`

After Netlify ships and post-processing finishes, hard-refresh and walk through:

## 1. Start an audit

1. Open 161 Bay St. → a floor with a plan + a few pins (e.g. B2).
2. New "Audit floor" button (gold, with a clipboard icon) in the floor header. Click it.
3. The whole viewport flips to AUDIT mode: gold "AUDIT" badge top-left, building / floor name, progress shows `0 / N` on the right, "End audit" button on the far right, thin progress bar underneath. Floor plan fills the rest. Bottom action sheet says "Tap a pin or press Next to start."

## 2. Walk pins

1. Tap a pin. The bottom sheet updates with the pin's name + type, and three buttons: green "Confirm OK", red "Flag issue", grey "Skip".
2. Tap **Confirm OK** — the pin turns green, the progress bar advances by 1, and the next unvisited pin becomes the current one.
3. Tap a pin that's already green to re-confirm it. The progress count shouldn't double-count.
4. On another pin, tap **Skip** — the pin stays amber (skipped doesn't count as audited).
5. On another pin, tap **Flag issue** — the pin turns red and progress advances (flagged still counts as visited and acted on).
6. Tap "Next" without selecting anything. The shell jumps to the next unvisited pin.

## 3. Resume mid-audit

1. With at least one event recorded, press the floor's main "<- 161 Bay St." back button or close the browser tab.
2. Navigate back to the same floor. A gold "You have an audit in progress on this floor" banner shows above the plan, and the header button now reads "Resume audit". Click either to re-enter.
3. The session picks up exactly where you left off — pin colors and progress reflect the events you'd already logged.

## 4. End audit

1. Click "End audit" with at least one event. The summary modal opens: Total / Audited / Missed counts, plus a clickable list of any missed pins.
2. Click a missed asset → the modal closes and the shell focuses on that pin. Audit it.
3. Re-open End audit, now Missed should be lower. Click "End audit" inside the modal.
4. Modal closes, you're back on the floor view. The "Resume audit" banner is gone. Pins that you confirmed should now show in their normal status (green for in-cycle, amber if past their audit_cycle_days).

## 5. Try ending with no events

1. Start a fresh audit. Click "End audit" immediately without recording anything.
2. Expected: a red error banner inside the shell saying "Record at least one audit before ending the session."

## 6. Activity timeline

1. Open the drawer for any pin you confirmed. The Activity section should show new entries — both the `update.audit_events` (generic trigger) and the asset's `update.assets` rows are skipped here, but the audit_log will have entries the M7 timeline-by-session view will surface. For now, the asset drawer's existing `update.assets` rows still appear.

## 7. Multiple sessions accumulate

1. End an audit, then start a new one on the same floor.
2. Confirm a pin in the new session. Run `select count(*) from public.audit_events where session_id = '<old session id>'` and verify the old session's events haven't changed. The new session has its own events.
3. The pin's status reflects the **most recent** confirmed audit (across all sessions).

## 8. Database checks

```sql
-- one open session per (floor, auditor)
select count(*) from public.audit_sessions where completed_at is null;
-- audit_events linked to the session
select session_id, outcome, count(*) from public.audit_events group by 1, 2 order by 1;
-- audit_log rows from this session
select action, entity_type, count(*) from public.audit_log
where created_at > now() - interval '1 day'
  and entity_type in ('audit_sessions','audit_events')
group by 1, 2;
```

## 9. Build / test

- `npx tsc -b` clean.
- `npx vite build` clean (1.07 MB JS / 312 KB gzip — +3 KB gzip vs M5).
- `npx vitest run` — 70 / 70 passing across 14 test files (M5's 59 + 11 new for M6: `audit-summarize.test.ts` (6) and `asset-status-cycle.test.ts` (5)).

## 10. Things explicitly deferred

- The "Audit due" filter chip on the floor toolbar — UI affordance lands in M8 responsive polish.
- Playwright e2e for full 3-asset audit flow + tenant-rep blocked from auditing — bundled into M7 with the wider permissions hardening.
- The home / building view "Resume audit" surface — currently only the floor view has it. Expand in M7.
- Photo capture during audit (camera) — works through the existing photo gallery in the asset drawer, not yet in the audit shell directly. M8.
- Offline audit queueing — M9.
