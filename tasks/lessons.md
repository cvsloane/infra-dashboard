# Lessons

## 2026-02-09
- When a deploy log shows "GitHub API call failed: This endpoint is temporarily being throttled" while `X-RateLimit-Remaining` is high, treat it as a GitHub secondary/abuse throttle, not core rate-limit exhaustion.
- Make it explicit that GitHub REST API throttling can happen independently of `git clone/ls-remote` succeeding, so "other apps deploying" does not disprove the cause.
- When debugging Coolify deploy failures, distinguish REST calls (Coolify `githubApi(...)`) from git operations; if possible, point to the exact stack trace line so the explanation is falsifiable.
