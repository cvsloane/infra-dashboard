# Local AI dashboard product brief

## User and operating question

The user is the authenticated infrastructure administrator. The page must answer one question in a few seconds: **which workload, if any, owns each local GPU, and is anything queued, inhibited, stale, or unreachable?**

This is an observation surface. It must not acquire, release, preempt, restart, or load a model.

## Information hierarchy

1. Fleet summary: healthy host count, current owners, queued media, and safety problems.
2. One status panel per host: named state, current workload/kind, lease age, media waiting, inhibit state, stale-owner state, and authority reachability.
3. A compact operating-contract reminder: one owner per GPU, no preemption, media waits next, text models unload after two idle minutes.

The page refreshes every 30 seconds and offers a manual refresh. It uses the existing dashboard shell, typography, spacing, cards, badges, and dark/light themes. There are no decorative charts.

## Required states

- Loading: host-card skeletons with a clear page title.
- Success: both expected hosts are always represented, including a named `Ready`, `In use`, `Media waiting`, `Inhibited`, `Stale owner`, or `Offline` state.
- Partial failure: a missing host is shown as `Offline`; healthy hosts remain usable.
- Request failure: an inline error panel with a retry control; the previous successful snapshot remains visible when available.
- Empty metrics: represented as both expected hosts offline, never as a blank page.

## Accessibility and responsive behavior

- State is communicated with an icon and text, not color alone.
- Status text is concise and uses normal DOM reading order.
- Controls have visible labels and keyboard focus behavior inherited from the dashboard components.
- The two host panels stack into one column on narrow screens; no horizontal scroll is required.

## Acceptance gate

- Authenticated API returns a stable two-host snapshot from Prometheus.
- Page refresh and error behavior are covered by tests.
- Desktop and mobile screenshots show no overlap, clipping, unreadable hierarchy, or color-only state.
- Product-design audit score is at least 85 with no hard failure.
