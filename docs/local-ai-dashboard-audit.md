# Local AI frontend quality audit

Audited: 2026-07-17

Passing score: 85+ with no hard fails.

| Category | Points | Score | Notes |
| --- | ---: | ---: | --- |
| Product fit | 15 | 15 | Answers the administrator's immediate ownership/safety question and performs no GPU mutation. |
| Information architecture | 15 | 14 | Fleet state precedes host detail; Local AI is in Infrastructure navigation with a keyboard shortcut. |
| Visual design | 15 | 14 | Uses the existing shell, tokens, cards, badges, spacing, typography, and restrained semantic color. |
| Dashboard/data clarity | 15 | 14 | Every number is labeled and tied to the current timestamp; host panels expose owner, queue, authority, and safety context without charts. |
| Interaction states | 10 | 9 | Loading, success, partial/offline, request error, retry, refreshing, and disabled-refresh states are present and tested. |
| Accessibility | 15 | 14 | Semantic headings, description lists, alert role, named buttons, visible text plus icons, and inherited focus styles; no color-only state. |
| Responsive behavior | 10 | 10 | Inspected at 390×844, 768×1024, and 1440×1000 with no collision, clipping, or horizontal overflow. |
| Performance polish | 5 | 5 | Six small Prometheus queries run concurrently; no charts, images, or blocking assets; previous data remains during refresh failures. |
| Total | 100 | 95 | Pass |

## Hard fails

- [ ] Primary action or primary user decision is unclear
- [ ] UI is disconnected cards instead of a coherent product surface
- [ ] Dashboard numbers lack labels, comparison, timeframe, or action context
- [ ] Charts rely on color alone or hide essential data only in hover tooltips
- [ ] Text overlaps, clips, overflows, or breaks at common mobile widths
- [ ] Interactive controls lack keyboard focus, accessible names, or semantic roles
- [ ] Empty, loading, or error states are missing for data-driven screens
- [ ] Existing component/system conventions were ignored without a reason
- [ ] Final visual quality claim lacks screenshot, browser, or equivalent verification

## Component state check

- Default/success: live two-host Prometheus snapshot.
- Loading: fixed-height summary and host skeletons.
- Empty/partial: both expected hosts remain visible; missing metrics become `Offline`.
- Error: alert with `Try again`; prior successful data remains visible.
- Disabled: refresh is disabled and labeled `Refreshing` while a request is active.
- Unavailable/permission: API returns 401 outside an authenticated dashboard session.
- Hover/focus/pressed: existing Button, Card, Badge, and navigation component states are retained.
- Narrow layout: summary becomes a 2×2 grid and host cards stack without horizontal scrolling.

## Verification evidence

- `npm run type-check`
- scoped and full `npm run lint`
- `npm test -- --run`: 25 files, 114 tests passed
- `npm run build`: `/local-ai` and `/api/local-ai/status` compiled successfully
- frontend skill audit script passed
- live browser/API inspection against Prometheus at desktop, tablet, and mobile widths
