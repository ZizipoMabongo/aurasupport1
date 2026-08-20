# Aura Seas — Implementation Plan

A luxury cruise service management platform with guest/crew/analyst/admin roles, AI ticket classification & splitting, real-time chat, escalations, analytics, and reporting.

## Scope check before I start

This is a substantial 10-phase build (auth, AI, realtime chat, analytics, PDF reports, audit logging, notifications). I'll build it end-to-end on the current TanStack Start + Lovable Cloud stack, but I want to confirm a few decisions before writing code:

1. **Backend** — I'll enable **Lovable Cloud** (Postgres + auth + storage + realtime) as the backend. All data persists in the database; nothing in localStorage.
2. **AI** — I'll use **Lovable AI** (`google/gemini-3-flash-preview`) via a server function for classification, splitting, draft responses, and the weekly summary. Keyword fallback if AI fails.
3. **Realtime chat** — Supabase Realtime on a `chat_messages` table, threaded per ticket (escalations keep the same thread).
4. **PDF export** — client-side `jspdf` + `jspdf-autotable` (works in browser, no native deps).
5. **Design** — maritime palette: soft ocean blues (`oklch` tokens), clean whites, generous whitespace, Apple-like minimalism. SF Pro-style system stack + Inter for body. No emojis anywhere.

## Phased delivery

Because of the size, I'll ship in tight, working increments and verify each phase compiles before moving on:

- **Phase 1** — Cloud enabled, schema migration (profiles, roles, guests, tickets, responses, chat_messages, audit_log, notifications), landing page, guest login (ID-only), staff login (email/password), default admin seeded, role-gated routing.
- **Phase 2** — Ticket submission with AI classification + splitting server function, role-validation rule (`effective_role = guest` when on_behalf_of_guest), guest_allowed enforcement, success modal listing all generated tickets.
- **Phase 3** — Guest dashboard (profile, cabin, submit form, ticket list, ticket detail with timeline + chat). Removed Classification card per your note.
- **Phase 4** — Crew dashboard with "My Request" / "Guest Request" modes; guest search by Guest ID or cabin number.
- **Phase 5** — Analyst live feed (filters, sort), accept/respond/note/template/AI-draft/resolve/escalate actions. Response is a modal popup with **manual dismiss only**.
- **Phase 6** — Admin dashboard (Escalated, All Tickets, Manage Users, Reports, Analytics). Escalation preserves chat thread.
- **Phase 7** — Analytics: KPIs, charts (Recharts), Guest-Issues vs Crew-Issues split, AI weekly summary, CSV export.
- **Phase 8** — Report generator with date/department filters, text preview, PDF export.
- **Phase 9** — Toast (sonner) + notification center with unread counts, realtime-driven.
- **Phase 10** — Audit trail wired on every mutation, AI fallback to keyword matching, final responsive/QA pass.

## Technical notes

- Tables in `public.*` with explicit `GRANT`s + RLS; roles in a separate `user_roles` table with `has_role()` security-definer function (per platform rules).
- Server functions under `src/lib/*.functions.ts`; admin client only inside handlers via dynamic import.
- Protected routes under `src/routes/_authenticated/`; guest routes use a separate guest-session mechanism (Guest ID stored in a `guest_sessions` row + signed cookie via server fn — guests don't have Supabase auth users).
- Audit log row written inside the same server function as each mutation.

## What I won't do unless you ask

- No demo-account toggles or "click to fill" buttons on the login screens.
- No emojis.
- No light/dark toggle (per platform rules).
- No mock AI — real Lovable AI calls with keyword fallback.

## Confirm to proceed

Reply "go" and I'll start with Phase 1 (Cloud enable + schema + auth + landing). Or tell me anything to adjust — e.g. "skip PDF, CSV only", "guests should also need a cabin number", "use a different palette", etc.
