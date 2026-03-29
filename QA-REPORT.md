# QA Report: sync-plate-frontend

**Date:** 2026-03-29
**URL:** http://localhost:3099
**Mode:** Full (report-only)
**Duration:** ~20 minutes
**Pages Visited:** 7 (Login, Sign Up, Forgot Password, Profile Setup, Household Setup, Household Created, Dashboard)
**Screenshots:** 27
**Framework:** React 19 (Create React App) + Supabase + Tailwind CSS

---

## Summary

| Severity | Count |
|----------|-------|
| Critical | 1 |
| High | 2 |
| Medium | 4 |
| Low | 3 |

**Health Score: 58/100**

The app's core flow works end-to-end: signup → profile → household → dashboard → food logging → grocery list. The AI food parser is impressive, correctly parsing natural language ("2 scrambled eggs", "grilled chicken salad with ranch dressing") into structured nutrition data. The grocery list auto-categorizes items. Design is clean and polished throughout.

The main concerns: a flood of 406 errors from Supabase on every dashboard load (likely an RLS or schema mismatch), the OpenAI API key exposed in the client bundle, and several UX issues around weight validation and the invite modal behavior.

---

## Top 3 Things to Fix

1. **CRITICAL: 406 errors on every dashboard load** — Multiple Supabase REST API calls return 406 (Not Acceptable) on each page load and navigation. These are silent failures... the dashboard renders but may be missing data.
2. **HIGH: OpenAI API key exposed in client-side bundle** — Extractable from devtools by any user.
3. **HIGH: Duplicate Supabase client files** — `src/supabaseClient.js` and `src/lib/supabaseClient.js` are identical. Dashboard also uses raw `process.env` in fetch headers instead of the client.

---

## Issues

### ISSUE-001: 406 errors from Supabase REST API on dashboard load
**Severity:** Critical
**Category:** Functional

**Description:**
Every time the dashboard loads, multiple Supabase REST API calls return HTTP 406 (Not Acceptable). In one page load, 7+ sequential 406 errors appeared. On reload, another batch of 6+ fired. These are silent failures — no error is shown to the user, but data may be missing or stale.

HTTP 406 from PostgREST typically means the request's `Accept` header doesn't match what the server can return, or there's a schema/view mismatch. This could indicate missing database tables, incorrect column references in queries, or an RLS policy issue on related tables.

**Evidence:** Console output shows repeated `Failed to load resource: the server responded with a status of 406 ()` starting at 21:37:50 and continuing through 21:40:56.

**Repro:**
1. Log in and reach the dashboard
2. Open browser devtools → Console
3. See: multiple 406 errors on every load

---

### ISSUE-002: OpenAI API key exposed in client-side code
**Severity:** High
**Category:** Security

**Description:**
`src/lib/openaiClient.js` creates an OpenAI client using `process.env.REACT_APP_OPENAI_API_KEY`. CRA inlines all `REACT_APP_*` variables into the JavaScript bundle at build time, making the key visible to anyone with devtools. Should be proxied through a backend (e.g., Supabase Edge Function).

---

### ISSUE-003: Duplicate Supabase client files
**Severity:** High
**Category:** Functional

**Description:**
Two identical Supabase client files exist:
- `src/supabaseClient.js` (orphaned)
- `src/lib/supabaseClient.js` (used by App.js)

Additionally, `Dashboard.jsx` (lines 545-546) uses `process.env.REACT_APP_SUPABASE_ANON_KEY` directly in fetch headers instead of using the Supabase client library. This bypasses the client's built-in auth handling.

---

### ISSUE-004: Profile Setup weight field rejects metric values without explanation
**Severity:** Medium
**Category:** UX

**Description:**
The weight field in Profile Setup has `min=100` validation, but there's no visible label indicating the unit is pounds. Entering 70 (a reasonable weight in kg) triggers browser validation: "Value must be greater than or equal to 100." The field labels show "Age", "Weight", "Height" but no units. A user thinking in kg would be confused.

**Evidence:** screenshots/10-after-profile.png — shows validation error on weight field with value 70.

**Repro:**
1. Sign up and reach Profile Setup
2. Enter weight: 70
3. Click Continue
4. See: native browser validation "Value must be greater than or equal to 100"

---

### ISSUE-005: Default CRA page title and meta description
**Severity:** Medium
**Category:** Content

**Description:**
`public/index.html` still has CRA defaults:
- `<title>React App</title>` (line 27)
- `<meta name="description" content="Web site created using create-react-app" />` (line 10)

Every user sees "React App" in their browser tab instead of "Sync-Plate."

---

### ISSUE-006: Default CRA favicon and PWA icons
**Severity:** Medium
**Category:** Visual

**Description:**
The app uses CRA's default React logo for favicon.ico, logo192.png, and logo512.png. The in-app icon (rose/pink utensils) doesn't match what appears in the browser tab or bookmarks.

---

### ISSUE-007: Invite Partner modal hard to dismiss
**Severity:** Medium
**Category:** UX

**Description:**
Clicking the "Invite Partner" button (or the header button that looks like a nav arrow) opens an invite modal. The modal cannot be closed by pressing Escape. Clicking the backdrop overlay also does not reliably close it. The only way to dismiss is to find the close button within the modal, which is not immediately obvious. On a reload, the modal stays gone, but the experience is jarring.

**Evidence:** screenshots/19-prev-day.png — modal appeared when clicking what looked like date navigation.

---

### ISSUE-008: ESLint warnings — unused variables in FoodInput.jsx
**Severity:** Low
**Category:** Code quality

**Description:**
```
src/components/FoodInput.jsx
  Line 24:10:  'servingsB' is assigned a value but never used
  Line 24:21:  'setServingsB' is assigned a value but never used
```

---

### ISSUE-009: Form state persists across Login/Signup toggle
**Severity:** Low
**Category:** UX

**Description:**
Email and password fields retain values when toggling between Login and Sign Up views. The password carrying over from a failed login to signup is unexpected behavior.

---

### ISSUE-010: Calorie target shows 3903 but BMR shows 2518
**Severity:** Low
**Category:** Content / UX

**Description:**
Dashboard header shows "650 / 3903 cal" as the daily target, but also displays "BMR: 2518 cal". The 3903 figure (BMR * activity multiplier + goal adjustment) is not explained anywhere. A user seeing "3903 calories per day" with no context might think the number is wrong. Consider adding a tooltip or breakdown showing how the target was calculated.

**Evidence:** screenshots/15-dashboard.png

---

## What Works Well

- **AI Food Parser** — Natural language parsing is excellent. "2 scrambled eggs" → 200 cal with correct macros. "Grilled chicken salad with ranch dressing" → 450 cal with detailed protein/carbs/fat/fiber breakdown. Saves to the correct meal type. Loading state ("Parsing...") is clear.
- **Onboarding flow** — Profile Setup → Household Setup → Dashboard is smooth and linear. Each step is well-designed with clear CTAs.
- **Grocery list auto-categorization** — Adding "2 lbs chicken breast" automatically files it under "Proteins" with a checkbox. Smart feature.
- **Weekly View** — Calendar shows daily intake, running totals, balance (over/under), and daily average. Color coding (on target / over / under) is intuitive.
- **Error handling** — Auth errors are translated to friendly messages via `friendlyError()`. Rate limiting, invalid credentials, unconfirmed email all handled gracefully.
- **Mobile responsiveness** — Dashboard, auth pages, and profile setup all work well on mobile (375x812). Content stacks properly, no horizontal overflow.
- **Household invite system** — Clean flow: create household → get code → share with partner. Code display is prominent and has a copy button.

---

## Console Health

| Context | New Errors | Notes |
|---------|-----------|-------|
| Dashboard load | 7+ × 406 | Supabase REST API returning Not Acceptable |
| Dashboard reload | 6+ × 406 | Same pattern on every load |
| Profile setup | 1 × 500, 1 × 406 | First profile save attempt failed, second succeeded |
| Auth pages | 0 (new) | Previous session errors only |

The 406 flood is the dominant issue. No new JS exceptions were thrown — all errors are network-level Supabase responses.

---

## Health Score Breakdown

| Category | Score | Weight | Weighted |
|----------|-------|--------|----------|
| Console | 10 | 15% | 1.5 |
| Links | 100 | 10% | 10.0 |
| Visual | 85 | 10% | 8.5 |
| Functional | 50 | 20% | 10.0 |
| UX | 60 | 15% | 9.0 |
| Performance | 85 | 10% | 8.5 |
| Content | 55 | 5% | 2.8 |
| Accessibility | 90 | 15% | 13.5 |
| **Total** | | | **58** |

Notes:
- Console score dropped to 10 due to the 406 error flood (10+ errors per page load)
- Functional deducted for 406 errors (-25), duplicate client (-10), security issue (-15)
- UX deducted for weight validation confusion (-15), modal dismiss issue (-15), form persistence (-5), calorie explanation (-5)
- Visual deducted for default favicon/icons (-15)
- Content deducted for default title/description (-25), no unit labels (-10), unexplained calorie target (-10)
- Performance deducted for 406 error overhead (-15)

---

## Pages Tested

| Page | Status | Notes |
|------|--------|-------|
| Login | Works | Clean design, good error handling |
| Sign Up | Works | Email confirmation required, friendly error messages |
| Forgot Password | Works | Reset email sends correctly |
| Profile Setup | Works (with issue) | Weight field rejects metric values |
| Household Setup | Works | Create/Join options, clear flow |
| Household Created | Works | Invite code display + copy button |
| Dashboard | Works (with issues) | 406 errors, modal behavior |
| Food Logger | Works | AI parsing is excellent |
| Weekly View | Works | Calendar with daily/weekly totals |
| Grocery List | Works | Auto-categorization is a nice touch |

---

## Notes

- No test framework detected beyond the default `App.test.js`. Run `/qa` to bootstrap a test suite.
- The 406 errors should be investigated first — they likely indicate missing database tables or views that the Dashboard queries expect but don't exist yet. Check the Supabase logs for the specific failing queries.
- The `Dashboard.jsx` file at 600+ lines should be decomposed into smaller components.

---

*Generated by gstack /qa-only*
