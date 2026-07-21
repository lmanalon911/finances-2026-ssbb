# HANDOFF

Everything a new session needs to pick this project up cold. Read this first, then `engine.js`.

**Last updated:** 2026-07-21

---

## 1. What this is

A two-person household money app. The owners are self-employed in the Philippines with irregular multi-client income, heavy consumer debt, and two housing loans in arrears. Currency is PHP throughout.

**The single job:** you tell it what money landed and when; it tells you where that money goes, ranked by what it costs to miss each thing.

It is not a budgeting app, an expense tracker, or a dashboard. It replaced a spreadsheet that failed at exactly one thing, telling them, on the day money arrived, what to pay first.

### Design constraints that drove every decision

| Constraint | Consequence |
|---|---|
| Used on phones, often standing in a payment queue | Mobile-first, bottom tab bar, large tap targets |
| Bad mobile data, sometimes none | No webfonts, no CDN, no framework, service worker caches everything |
| Two people, two phones | Optional Supabase sync, local-first so it never blocks |
| Public GitHub repo | No credentials in source, ever |
| The owners are under real financial stress | No cheerful fintech tone. Say the bad number plainly. |

---

## 2. The situation the app encodes

Needed to understand why the code is shaped this way. No names or account numbers here or anywhere in the repo.

### Income

| Source | Rule | Amount | Status |
|---|---|---|---|
| Client A | Weekly | ₱15,800 | Confirmed |
| Client B | Semi-monthly, 15th and 30th | ₱40,000 | Confirmed, schedule non-negotiable |
| Client C | Weekly | ₱11,000 | **Tentative, excluded from all projections** |

Confirmed average ≈ ₱148,467/month. Five-Tuesday months yield an extra ₱15,800; the app computes this from the calendar rather than hardcoding it.

**Open question:** Client A was described as paying Tuesdays, but the July tranche landed on Monday the 27th. The recurrence rule in `seed.js` says weekday 1 (Monday). Confirm before trusting projections.

### The core problem: intra-month timing

Days 1–14 carry roughly ₱73,600 of dated obligations but only two weekly tranches (~₱31,600) arrive. Days 15–30 are the reverse. The first-half gap has been financed on credit cards at 3%/month, which is why card balances grew ~₱48,700 over a year while ~₱27,800/month was being paid against them.

The fix is a **float account** of ₱65,000, working capital, not savings, refilled on the 15th and 30th before any discretionary spending. It does not exist yet. Funding target was November 2026.

### Debt

Revolving, all at the BSP cap of 3%/month except GCredit:

| Account | Balance | Rate | Due day |
|---|---|---|---|
| BPI Gold | 171,419.21 | 3% | 13 |
| BPI blue | 106,374.45 | 3% | 13 |
| Chinabank Velvet | 105,000 | 3% | 13 |
| Unionbank Rewards | 97,000 | 3% | 24 |
| Chinabank Freedom Platinum | 45,000 | 3% | 28 |
| GCredit | 12,347.21 | 5–7% | 24 |

Monthly interest ≈ ₱16,361 against ~₱29,377 of card payments, only ~44% reaches principal.

Fixed-amortisation loans (CIMB personal loan, two GLoans) have interest pre-computed. **They are deliberately excluded from payoff ordering**, early payment usually saves nothing under PH loan terms.

### The urgent item

Two Pag-IBIG housing loans, ₱9,166.28 each. **Two months behind.** Pag-IBIG declares default at three unpaid amortisations, at which point the whole balance accelerates and foreclosure can begin. Critically, Circular 403 §11.1: default on any one housing account cross-defaults all others. Both houses stand or fall together.

This is why tier 1 exists and why the arrears counter is the largest element on the home screen.

---

## 3. Architecture

No build step. No package manager. No dependencies. Open `index.html` and it runs.

```
index.html    shell, six tab buttons, four script tags in load order
styles.css    all styling, CSS custom properties at :root
seed.js       window.SEED, starting data, read once on first run
store.js      localStorage + optional Supabase mirror
engine.js     dates, income projection, allocation. Pure functions.
app.js        the six screens, all DOM, all event handlers
sw.js         service worker, cache-first fallback
manifest.json PWA manifest
schema.sql    Supabase tables and RLS policy
```

Load order matters: `seed` → `store` → `engine` → `app`. Each exposes one global (`SEED`, `Store`, `E`); `app.js` is an IIFE and exposes nothing.

**`engine.js` is pure**, every function takes `db` and returns a value, no I/O, no DOM. That's what makes it testable in Node (see §7). Keep it that way.

---

## 4. Data model

One shape per collection. Everything lives under a single localStorage key `fin2026`.

```js
obligation = {
  id, name,
  tier,        // 1..8, drives payment priority. See §5.
  amount,      // full monthly amount
  dueDay,      // 1..31, or null for undated (living costs)
  dueDate,     // 'YYYY-MM-DD'. One-off bills with a specific calendar date.
               // When set it overrides dueDay entirely.
  recur,       // 'monthly' (default) | 'once' | 'count'
  count,       // recur:'count' only, total number of payments
  paidCount,   // completed payments, drives E.exhausted()
  kind,        // housing|loan|utility|fixed|cardmin|insurance|living|other
  cardId,      // present on kind:'cardmin', links to a card for balance updates
  note,        // free text, shown in Bills
  endsOn,      // 'YYYY-MM-DD', obligation stops after this
  archived,    // bool
  paid,        // { '2026-07': true } , fully settled for that month
  partial      // { '2026-07': 4833.72 }, part paid, remainder still owed
}

card = {
  id, name,
  balance, rate,        // rate is MONTHLY, as a fraction: 0.03 = 3%/mo
  dueDay,
  kind,                 // 'revolving' | 'fixed'
  payment, remaining,   // fixed loans only
  lastPayment, lastInterest, lastPaid,
  note
}

incomeSource = {
  id, name,
  rule,        // 'weekly' | 'semimonthly' | 'monthly'
  weekday,     // weekly: 0=Sun..6=Sat
  days,        // semimonthly: [15, 30]
  day,         // monthly
  amount,
  status       // 'confirmed' | 'tentative', tentative never enters projections
}

todo      = { id, text, when, done }
payment   = { id, date, obligationId, name, amount }
changelog = { id, ts, entity, entityId, field, before, after, note }
settings  = { cash, dailyLiving, floatTarget, floatBalance, arrearsMonths, arrearsNote }
```

`settings` is stored in Supabase as a single row with `id: 'singleton'`.

---

## 5. The allocation engine

`E.plan(db, cash, onDate)` is the heart of the app. Read it before changing anything.

### Tiers

Priority is by **consequence of missing**, never by due date.

| Tier | | Consequence |
|---|---|---|
| 1 | Pag-IBIG housing | Foreclosure, cross-default across both loans |
| 2 | Car loan | Repossession |
| 3 | Utilities | Disconnection + reconnection fee |
| 4 | Rent | |
| 5 | Fixed loans | Late fees, credit record |
| 6 | Card minimums | Late fee + one month of interest |
| 7 | Insurance | ~30-day grace period |
| 8 | Living | |

Sort within a tier: overdue first, then earliest due date. See `sortForPayment`.

### Sequence

1. **Food comes off the top**, `dailyLiving × daysToNextIncome`, before any tier. Not negotiable in code; you cannot not eat.
2. **Bucket A**, everything unpaid and due between `onDate` and the next income date.
3. **Bucket B**, due between the next income and the one after, tier ≤ 5, excluding anything already in bucket A. If `sum(bucketB) > nextIncome.amount`, the shortfall becomes a **hold-back**.
4. The hold-back is injected into the queue **as a pseudo-line carrying the tier of its most critical driver**, then everything sorts together.
5. Allocate greedily down the sorted queue.
6. Whatever's left goes to the float.

### Why the hold-back competes by tier

This is the subtle part and it was a bug once. If the reserve is simply taken off the top, then holding back for next week's car payment starves this week's *overdue housing loan*, inverting the whole priority scheme. Giving the reserve its driver's tier makes it compete fairly. **Do not "simplify" this back into a top-slice.**

### Three bugs already fixed, do not reintroduce

1. **Overdue backfill leaking into future windows.** `dueInstances` backfills unpaid items from the current month whose day has passed. Called with a *future* `from`, it resurrected the same arrears again, so bucket B double-counted them. Fixed with the `includeOverdue` parameter, pass `false` for any window that doesn't start today.
2. **Duplicate instances.** One obligation could appear twice in a single window. Now capped at one instance per obligation, the earliest unpaid one, via the `seen` set.
3. **Partial payments resetting.** Paying half a bill left it reappearing at full amount. Now tracked in `ob.partial[period]`; `E.owing()` returns the net remainder.

### Recurrence

`E.exhausted(ob)` decides whether an obligation is finished:

| `recur` | Behaviour |
|---|---|
| `monthly` | Default. Never exhausts. `paid` is keyed by month, so August is a fresh key and the bill returns. |
| `once` | Disappears permanently once `paidCount >= 1`. Pair with `dueDate` for a specific calendar date. |
| `count` | Disappears once `paidCount >= count`. Used for the fixed loans: CIMB 23, GLoans 12 and 18, loan difference 15. |

`paidCount` increments when a bill is marked fully paid, from either Bills or Money in, and decrements when unmarked. Part payments do not increment it.

### Card balances

A `cardmin` obligation carries `cardId`. Marking it paid, through **either** route, calls `applyCardPayment`: it adds one month of interest, then subtracts the payment. `ob.cardApplied[period]` holds `{before, paid, interest}`. The **first** payment in a month charges one month of interest and then subtracts the payment; later payments the same month subtract only, so two part payments never charge interest twice. Unmarking calls `reverseCardPayment`, which restores the stored `before` value exactly.

Both routes must stay funnelled through those two helpers. An earlier version updated balances only in `confirmPlan`, so marking a card paid in Bills silently did nothing.

### Known limitations

- The hold-back doesn't account for living costs during the reserved window. It's a floor, not a full projection.
- Card interest is applied only when a `cardmin` payment is recorded, not monthly on a schedule. Balances drift if payments are skipped.
- `monthsToClear` on the Cards screen uses a blended 3% across all revolving balances, which slightly understates GCredit.
- No multi-currency, no FX. Deliberate.

---

## 6. Storage and sync

**localStorage is always the source of truth.** Supabase is a mirror. The app must work with no signal, that is not negotiable.

- On boot: read local. If empty, write `SEED`. If Supabase is configured, pull; if the pull returns nothing, push local up.
- On every write: save local first, then mirror. Sync failure is logged and shown as an `Offline` chip; it never blocks the UI or loses data.
- A `fin2026.dirty` flag is set whenever a push fails. On the next boot, a dirty phone **pushes before it pulls**, so offline edits are never silently overwritten by stale remote data. `Store.retry()` drives the manual retry button in Settings.
- The second phone can be configured from a setup link: `#setup=<base64 of {url,key}>`. The fragment never reaches a server. `readSetupLink()` in `app.js` consumes it and strips it from the URL immediately.
- Conflict resolution is otherwise last-write-wins. Fine for two people who talk to each other. Don't build CRDTs.
- Supabase is accessed over plain REST with `fetch`. **No SDK**, that would be the only dependency in the project.

### Credentials

The Supabase URL and anon key are entered per-phone in Settings and stored under localStorage key `fin2026.supabase`. **They are never committed.** That is the entire reason the repo can be public. Any change that puts a key in source is a bug, not a convenience.

RLS is on with a permissive policy for the `anon` role, see `schema.sql`. Anyone holding both the URL and key can read and write. Acceptable for this threat model; if it ever needs hardening, add Supabase Auth with a shared account rather than trying to lock down anon.

### The service worker

`sw.js` deliberately **skips any cross-origin request** so Supabase calls are never cached. Bump `CACHE` when shipping changes or phones will serve stale files.

---

## 7. Testing

There is no test framework. There is a Node harness that loads `seed.js` and `engine.js` and runs the real July 2026 scenario:

```bash
node --check engine.js && node --check app.js && node --check store.js
node /tmp/test.js   # recreate from the pattern below
```

```js
global.window = {};
const fs = require('fs');
eval(fs.readFileSync('seed.js','utf8').replace('window.SEED','global.SEED'));
global.E = eval(fs.readFileSync('engine.js','utf8').replace('const E =',''));

const db = {
  obligations: SEED.obligations.map(o => ({...o, paid:{}})),
  cards: SEED.cards, income: SEED.income, todos: SEED.todos,
  settings: {...SEED.settings}, payments: [], changelog: []
};

const p = E.plan(db, 15800, '2026-07-27');
p.envelopes.forEach(e => console.log('ENV', e.name, E.peso(e.amount)));
p.lines.forEach(l => console.log(l.amount > 0 ? 'PAY' : '---', l.item.ob.name, E.peso(l.amount)));
```

**Always test the two-tranche sequence**, not just a single plan: run a plan, apply its results to `db` the way `confirmPlan` does, then run the next plan. That's the path that surfaced the partial-payment bug.

### Expected output for the July scenario

Given ₱15,800 on 2026-07-27 with both housing loans unpaid: food ₱1,800, then ₱9,166.28 to housing loan A and ₱4,833.72 to loan B. Then given ₱40,000 on 2026-07-30: it asks for only B's ₱4,332.56 remainder, holds back ₱1,900 for the Aug 5 car payment, funds utilities and fixed loans, and leaves the card minimum and both insurances unfunded at the bottom. If a change breaks that shape, the change is wrong.

---

## 8. Visual language

Deliberately not fintech. See `:root` in `styles.css`.

- **Paper** `#EDEFEA`, **ink** `#1C2321`, hairline `#D3D8CF`
- **Brick** `#A63A2E` overdue · **ochre** `#B07D28` due soon · **green** `#3F6B4C` settled · **teal** `#1F5673` actions
- **No webfonts.** System sans for interface, `ui-monospace` with `tabular-nums` for every peso figure so columns align when scanning.
- No gradients, no shadows, no celebratory colour. The app frequently delivers bad news; it should read like a ledger, not a game.
- Copy is plain and active. "Work out where it goes", not "Calculate allocation". Sentence case everywhere.

The one deliberate risk: when in arrears, the days-to-default counter is the largest thing on screen. That's uncomfortable by design, the spreadsheet's central failure was letting exactly that number stay invisible.

---

## 9. Deployment

Public GitHub repo `finances-2026-ssbb`, served by GitHub Pages from `main` at root. No CI, no build. Push the files, done.

Live at `https://lmanalon911.github.io/finances-2026-ssbb/`.

Installed to home screen as a PWA on both phones.

---

## 10. Backlog

Roughly in order of value:

1. **Monthly interest accrual on a schedule**, not only on payment. Balances currently drift when a payment is skipped, which is exactly when accuracy matters most.
2. **Arrears as first-class data.** `settings.arrearsMonths` is a single number covering both housing loans. It should be per-obligation, with a running penalty at 1/20 of 1% per day.
3. **Float automation**, prompt for the refill on the 15th and 30th, since that's the rule that makes the float work at all.
5. **Snowball projection**, payoff dates per card under confirmed-only / with Client C / with a trimmed budget.
7. Import the export file, for moving between phones without Supabase.

---

## 11. Rules for whoever picks this up

1. **Keep `engine.js` pure.** No DOM, no storage, no fetch. It's the only thing that's genuinely testable.
2. **No dependencies.** Not one. The whole point is that it opens instantly on bad data and keeps working in five years.
3. **Local-first, always.** Any change that makes the UI wait on the network is wrong.
4. **No credentials in source.**
5. **Priority is by consequence, not by date.** Every time someone "fixes" the ordering to be chronological, they break the thing the app exists to do.
6. **Log every edit** to `changelog`. Due dates and amounts move constantly, and not knowing which numbers were still true is what killed the spreadsheet.
7. **Don't soften the numbers.** If the plan leaves four bills unfunded, show four unfunded bills.

---

## 12. Open questions carried from the spreadsheet

- Which day does Client A actually pay? Stated as Tuesday; July's landed Monday the 27th.
- CIMB loan: is ₱112,299.93 the principal or the total of payments? 23 × ₱6,685.33 = ₱153,762.59, so the two don't reconcile.
- Is there an interest rebate on early CIMB pre-termination? If yes it re-enters snowball ordering.
- GCredit actual rate, 5% or 7%?
- Is any of the Chinabank Freedom balance an installment conversion rather than revolving?
- Are the day-13 card payments and the day-5 car loan auto-debited or manual? Changes float sizing.
- Who holds the "loan difference for 2 houses"? If secured against the properties it promotes to tier 1.
- Exact Pag-IBIG arrears and penalties, needs an official Statement of Account.

---

## 13. Not financial advice

This encodes one household's situation and a set of judgement calls about what to pay first. It doesn't know their actual penalty terms, grace periods, or what any lender will accept. Anything touching the Pag-IBIG arrears should be worked from an official Statement of Account and a conversation with Pag-IBIG.
