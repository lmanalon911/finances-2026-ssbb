# Finances

A household money app for two phones. You tell it what landed and when; it tells you where it goes.

No build step, no framework, no dependencies. Plain HTML, CSS and JavaScript.

---

## Put it online

### 1. Make the repository

On GitHub: **New repository** → name it `finances-2026-ssbb` → **Public** → Create.

### 2. Upload the files

Either drag every file in this folder into the GitHub upload page, or from a terminal:

```bash
cd finances-2026-ssbb
git init
git add .
git commit -m "Finances app"
git branch -M main
git remote add origin https://github.com/lmanalon911/finances-2026-ssbb.git
git push -u origin main
```

### 3. Turn on GitHub Pages

Repository → **Settings** → **Pages** → Source: **Deploy from a branch** → Branch: `main`, folder `/ (root)` → Save.

After a minute or two it's live at:

```
https://lmanalon911.github.io/finances-2026-ssbb/
```

### 4. Install it on both phones

Open that link on your phone.

- **Android / Chrome:** menu → *Add to Home screen*
- **iPhone / Safari:** Share → *Add to Home Screen*

It then opens like an app and works with no signal.

---

## Sync between the two phones

Without this, each phone keeps its own copy. With it, both see the same numbers.

1. Create a free project at [supabase.com](https://supabase.com).
2. In your project: **SQL Editor** → **New query** → paste all of `schema.sql` → **Run**.
3. Go to **Project Settings** → **API** and copy two things:
   - **Project URL** (looks like `https://abcdefgh.supabase.co`)
   - **anon public** key (a long string starting `eyJ`)
4. In the app, tap the chip in the top right → paste both → **Save and sync**.
5. Do the same on the second phone, with the same two values.

The chip reads **Synced** when it's working, **Offline** if it can't reach Supabase — in which case everything still works and syncs when you're back.

**On safety:** the URL and key are stored only in each phone's browser and are never committed to this repository. That's why the repository can be public. Anyone who obtained both values could read the data, so don't paste them into a message or screenshot them.

---

## The six screens

| Screen | What it's for |
|---|---|
| **Today** | Cash on hand, when the next money lands, what's due before then, and how far behind the housing loans are |
| **Money in** | Enter what you received. It deals the money out in priority order and tells you what's left unfunded |
| **Bills** | Every obligation, editable. Change an amount or a due date and it records what changed |
| **Cards** | Balances, monthly interest, and how much of your payment actually reduces the debt |
| **Survive** | The to-do list |
| **Ask Claude** | Builds a full snapshot of where things stand. Copy it, paste into the Claude app, ask your question |

---

## How the priority order works

Money is allocated by what it costs to miss something, not by which due date is nearest.

| Tier | What | If you miss it |
|---|---|---|
| 1 | Pag-IBIG housing loans | Default at three unpaid months; cross-defaults both loans; foreclosure |
| 2 | Car loan | Repossession |
| 3 | Utilities | Disconnection and reconnection fees |
| 4 | Rent | |
| 5 | Fixed loans | Late fees, credit record |
| 6 | Card minimums | Late fee plus a month of interest |
| 7 | Insurance | Usually a 30-day grace period |
| 8 | Living | |

Two things happen before any of that:

- **Food comes off the top.** A daily allowance × the days until the next money in. Change the rate in Settings.
- **A hold-back is set aside** when something lands after the next tranche that the next tranche can't cover alone. That reserve competes by tier, so holding back for next week's car payment never starves this week's overdue housing loan.

Part payments are remembered. Pay half a bill today and only the remainder appears next time.

---

## Changing things

Due dates and amounts move. Edit them in **Bills** — every change is written to the log at the bottom of that screen, so you can always see which numbers changed and when. That was the single biggest failure of the spreadsheet this replaces.

---

## Files

| File | |
|---|---|
| `index.html` | Shell and tab bar |
| `styles.css` | All styling |
| `engine.js` | Dates, income projection, allocation |
| `store.js` | localStorage, with optional Supabase mirroring |
| `app.js` | The six screens |
| `seed.js` | Starting data, written once on first run |
| `sw.js` | Offline caching |
| `schema.sql` | Supabase tables |

`seed.js` is only read the first time the app opens. After that your data lives in the browser and in Supabase, and you can empty the arrays in that file if you'd rather it not sit in a public repository.

---

## Not financial advice

This is a planning tool built around one household's situation. It doesn't know about your penalties, grace periods, or what your bank will actually accept. For the Pag-IBIG arrears in particular, work from an official Statement of Account.
