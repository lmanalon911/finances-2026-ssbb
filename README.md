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

Without this, each phone keeps its own copy in its own browser. With it, both see the same numbers and changes appear on the other phone within seconds.

### On a computer, once

1. Go to [supabase.com](https://supabase.com) and sign up. Free tier is plenty.
2. **New project**. Give it any name. Pick a region near you, Singapore is closest to the Philippines. Set a database password and save it somewhere, though you will not need it for this.
3. Wait about two minutes for the project to finish setting up.
4. In the left sidebar click **SQL Editor**, then **New query**.
5. Open `schema.sql` from this folder, copy all of it, paste it in, and click **Run**. You should see "Success. No rows returned."
6. In the left sidebar click **Project Settings**, then **API**. Copy two things:
   - **Project URL**, looks like `https://abcdefgh.supabase.co`
   - **anon public** key, a very long string starting with `eyJ`

### On the first phone

7. Open the app, tap the chip in the top right corner, paste both values, tap **Save and sync**.
8. The chip should change to **Synced**. Your data is now online.

### On the second phone

Either paste the same two values again, or use the shortcut:

9. On the first phone, in Settings, tap **Copy setup link for the other phone**.
10. Send that link to the second phone and open it once. The settings fill in automatically and it syncs.
11. Delete the message afterwards. The link contains your key.

### Reading the chip

| Chip | Meaning |
|---|---|
| **Local only** | No Supabase settings entered yet |
| **Syncing** | Talking to Supabase |
| **Synced** | Everything is up to date |
| **Offline** | Cannot reach Supabase. You can keep working; it sends the changes when the connection returns. |

If a phone has been offline and made changes, it pushes those up before pulling anything down, so offline edits are never quietly overwritten. Settings shows a warning with a **Try again now** button when something is still waiting to be sent.

### On safety

The URL and key are stored only in each phone's browser and are never committed to this repository. That is why the repository can be public. Anyone who obtained both values could read and change the data, so do not screenshot them or leave the setup link sitting in a chat.

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

## Bills that do not repeat every month

Each bill has a **Repeats** button with three options:

| Setting | Use it for |
|---|---|
| Every month | Rent, electricity, insurance, card minimums. The default. |
| One time | A one-off you pay and never see again. You can give it a specific date rather than a day of the month. |
| A set number of payments | Loans with an end. The CIMB loan is 23 payments, the GLoans are 12 and 18. |

Once a one-off is paid, or a counted bill reaches its last payment, it stops appearing and is marked **finished** in Bills.

## Recording what you actually paid

Tap **Pay** on any bill. It shows what is still owing, with the amount prefilled, and you change it to whatever you really handed over. Pay less than the full amount and the remainder carries to next time, shown as **part paid**. Tap **Undo payment** to reverse it, card balance included.

Card payments are recorded the same way through **Money in**, so you never have to enter anything twice.

## Editing

**Edit** on a bill opens every field: name, amount, priority, how it repeats, the day or date it is due, which card it belongs to, a note, and Delete.

The Bills tab also holds **Money coming in**, where you can change who pays you, how much, and on what schedule, or stop counting a source without deleting it. Below that is **Payments recorded**, and below that the change log.

Cards can be renamed, have their rate and due day changed, or be deleted. Tasks on the Survive tab can be edited and deleted.

## Marking a card payment

Marking a card minimum as paid, in Bills or through Money in, updates that card's balance straight away: it adds the month's interest, then subtracts what you paid. You do not need to edit the balance by hand. Unmarking it puts the balance back.

Manual balance editing is still there on the Cards tab, for when a statement disagrees with the app.

---

## Changing things

Due dates and amounts move. Edit them in **Bills**, every change is written to the log at the bottom of that screen, so you can always see which numbers changed and when. That was the single biggest failure of the spreadsheet this replaces.

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
| `HANDOFF.md` | Full technical handoff, read this before changing any code |

`seed.js` is only read the first time the app opens. After that your data lives in the browser and in Supabase, and you can empty the arrays in that file if you'd rather it not sit in a public repository.

---

## Not financial advice

This is a planning tool built around one household's situation. It doesn't know about your penalties, grace periods, or what your bank will actually accept. For the Pag-IBIG arrears in particular, work from an official Statement of Account.
