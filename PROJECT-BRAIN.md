# 🧠 SYNC-PLATE PROJECT BRAIN
Single source of truth for all Claude sessions

## 📍 PROJECT INFO
- **App Name:** Sync-Plate
- **Purpose:** Calorie tracking app for couples (and solo users) who eat together
- **Tech Stack:** React, Supabase (PostgreSQL + Edge Functions), OpenAI GPT-4o, Tailwind CSS
- **Location:** C:\Users\berkl\sync-plate-app\sync-plate-frontend
- **Live URL:** [PASTE YOUR VERCEL URL HERE]

---

## ✅ WHAT'S WORKING

### Core Features
- **AI Food Logging** — GPT-4o parses natural language; uses official branded nutrition values (McDonald's, Starbucks, etc.)
- **Individual Meals** — log for any date (past or future planning)
- **Shared Meals** — one entry split proportionally by each partner's calorie target ratio
- **Meal Prep** — batch-log the same meal across N consecutive days (individual or shared)
- **Rebalance Modal** — fires when daily calorie target exceeded; user picks daily/weekly/grace; saves to DB and applies to Dashboard + WeeklyView targets
- **Weekly Calendar View** — week navigation (arrows), expandable meal rows, "Add food for this day" shortcut
- **Grocery List** — household-level list
- **Partner Toggle** — switch between viewing partner A and B

### Auth & Accounts
- **Sign up / Sign in / Password reset** — friendly error messages, no sign-up page freeze
- **Onboarding flow** — ProfileSetup → HouseholdSetup (create or join via invite code)
- **Invite Partner** — copy code or send email via Edge Function (`invite-partner`)
- **Solo mode** — single user sees their own dashboard + "Invite Partner" banner; no partner toggle; no shared meal option
- **Account isolation** — RLS enforced at DB level on `users` and `meals` tables; each household can only see its own data

### Database
- RLS enabled on: `users`, `meals`, `daily_target_adjustments`, `households`
- All policies use `DROP POLICY IF EXISTS` pattern (not `CREATE POLICY IF NOT EXISTS` — invalid in PostgreSQL)

---

## ❌ KNOWN ISSUES / BROKEN

None currently known.

---

## 📋 PRIORITY TO-DO

1. **Account deletion** — no way for user to delete their own account yet
   - Requires Supabase Edge Function (`delete-account`) to call `auth.admin.deleteUser()`
   - App-side: delete meals, shared meal portions, users row, then call edge function, then sign out
2. **Resend confirmation email** — no option shown after sign-up
3. **3.5s modal delay** — RebalanceModal has `setTimeout(3500)` before showing; consider UX feedback during wait
4. **Grocery delete confirmation** — no confirm prompt before deleting grocery items
5. **"AI is Rebalancing" text** — misleading label in some UI states

---

## 📂 KEY FILES

```
src/
├── components/
│   ├── App.js                  ← auth session + routing (Auth → ProfileSetup → HouseholdSetup → Dashboard)
│   ├── Dashboard.jsx           ← main view; solo/couple mode; date nav; partner toggle
│   ├── FoodInput.jsx           ← AI food logger; shared meal; meal prep; rebalance trigger
│   ├── WeeklyView.jsx          ← weekly calendar; week nav; expandable rows; daily targets
│   ├── RebalanceModal.jsx      ← overage modal; saves to daily_target_adjustments
│   ├── Auth.jsx                ← sign up/in/reset; friendly errors
│   └── GroceryList.jsx         ← household grocery list
├── lib/
│   ├── supabaseClient.js       ← Supabase client instance
│   └── openaiClient.js         ← GPT-4o food parser (branded + USDA values)
supabase/
└── functions/
    └── invite-partner/         ← sends email invite with household code
supabase-schema.sql             ← all table/RLS definitions (run in Supabase SQL editor)
```

---

## 🗄️ DATABASE TABLES (Supabase)

| Table | Key Columns | Notes |
|-------|-------------|-------|
| `households` | `id`, `invite_code` | One per couple/solo user |
| `users` | `id` (= auth.users.id), `household_id`, `name`, `age`, `weight`, `height`, `bmr`, `daily_calorie_target`, `activity_level`, `goal` | Profile row created on onboarding |
| `meals` | `id`, `user_id`, `household_id`, `meal_date`, `meal_type`, `calories`, `protein_g`, `carbs_g`, `fat_g`, `portion_data` (JSONB), `is_planned` | `household_id` set for shared meals; `portion_data` = `{ [userId]: { calories, protein, carbs, fat, items } }` |
| `daily_target_adjustments` | `id`, `user_id`, `adjustment_date`, `overage`, `choice`, `daily_reduction`, `weekly_reduction`, `days_remaining` | CASCADE DELETE on user_id |

> ⚠️ Tables `recipes`, `daily_summaries`, `pending_adjustments`, `grocery_lists` referenced in old brain doc **do not exist** in current schema.

---

## 🔑 ENVIRONMENT VARIABLES

- `REACT_APP_SUPABASE_URL` ✅
- `REACT_APP_SUPABASE_ANON_KEY` ✅
- `REACT_APP_OPENAI_API_KEY` ✅
- `REACT_APP_USDA_API_KEY` — exists but USDA integration deferred indefinitely

---

## 💡 WORKFLOW NOTES
- Plan in browser chat (free) → Execute in Claude Code (uses credits)
- Update this file at end of every Claude Code session
- Drag this file into browser chat at start of every session

---

## 📅 LAST UPDATED

**2026-03-29** — Major session: fixed auth freeze, weekly average, rebalance silent fail, division by zero, shared meal prep servings, AI accuracy (GPT-4o + branded foods). Added week navigation + expandable meal rows to WeeklyView. Implemented rebalance choices applying to Dashboard + WeeklyView effective targets. Added account isolation: RLS on users/meals tables + solo-mode Dashboard (works for 1 user, invite banner, no partner toggle). Fixed SQL syntax (DROP POLICY IF EXISTS pattern).
