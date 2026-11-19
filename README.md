# Smoke test

After every deploy, a change in one app that breaks the app next to it should be caught by a run on production, not
by Miky or Katerina. For now it is run by hand; `/land` will run it after each deploy. This walks ten core flows in
Peek, Ship and Leaf (five next door, five in each app's own basics) as two test accounts of its own, Smoke Test 1 and
Smoke Test 2, in the QA team. It runs in a real browser and does what a person does.

```bash
npm ci
node run.mjs                     # all ten flows, about 7–8 minutes
node run.mjs --flow 2,4          # only some
node run.mjs --serve leaf=../leaf/dist   # serve a local build of one app to the test only, at its real address
```

It exits 0 when every step passed or is known, 1 when a step failed, and 2 when the run itself broke. Each run writes
`out/<time>/result.txt` and `result.json`. These name each app's version (`/version.json`), mark each step passed,
failed, known or skipped, and hold a screenshot of each failed step. They also give the run's time and relay
requests, any "busy" answer from the relay, and anything the run could not remove.

## The ten flows

Each flow's file says, at its top, what a person sees today. Next door:

1. **An issue made in Ship opens in Peek and in Leaf.** The standing issue, which has text, a picture and a second
   person's comment, opens in Peek and in Leaf. A new issue with only a title opens in Leaf's editor with its
   conversation, and words typed there are its text in Ship.
2. **A Leaf document's link draws as the document in Peek.** A message with the link shows the document's title.
3. **A topic shows its issue and its document in Peek, Ship and Leaf.**
4. **A second person's comment arrives in Peek and Leaf without reloading.**
5. **A mention in a Ship comment reaches the person on Peek's Desk.**

Each app:

6. **Sign in, and still be signed in when the next app opens.** A new browser signed in to Estiva ID only opens Peek,
   Ship and Leaf, each signed in with no click.
7. **Peek: a message in a topic shows as unread to the other person.** The room's row turns blue for Smoke Test 1
   without a reload, and is quiet again once they have read it.
8. **Ship: an issue made, its status changed and a comment added**, all still there when it is opened again.
9. **Leaf: a document made, written in and commented on a block**, all still there when it is opened again.
10. **Search finds the issue and the document by title**, in Peek's search box (Ship and Leaf have none), and opens
    them. A run's titles carry a word of their own (`r` and six letters), since search matches the starts of words.

## What it keeps, and what it removes

The standing files live in the QA team and are listed in `standing.json`: the project "Smoke test", its issue, a Leaf
document, the topic (an initiative, in Peek's words), and a Peek team room. `setup.mjs` made them once, through the
apps.

A run makes one issue, one document, a few comments and two messages. It removes each of them at its end, as their
author. A removal that fails is printed under "Left behind". Ship's delete keeps an issue in the team's Issues ›
Archived › Deleted, where Restore can undo it. To remove what a stopped run left:

```bash
node clean.mjs issue <d> "<title>"
node clean.mjs document <d> "<title>"
node clean.mjs comment <n> <d> "<words>"
node clean.mjs events <n> "<words or event id>" --yes   # where no app can reach it any more
```

## Known bugs

A step can name an open bug (`known: { addr, title }`). While that issue is open in Ship, a failure of the step is
reported as **known**, with its link, and does not fail the run. Once the issue is closed, the step fails again. A
known step that passes says so, so the bug can be checked and closed.

## Proving it catches a break

To show that a step really catches its app breaking, build that app with the break and serve the build to the test only
(`--serve`). Everyone else keeps the live app. Checked on 19 Nov:

- **Leaf** at `main` with leaf#137 undone (`git revert bf02851`). The steps that fail are "the issue with no text opens
  in the editor" (flow 1), "the topic page lists the issue and the document" (flow 3) and "the comment arrives without
  reloading" (flow 4).
- **Peek** at `main` with `plants/peek-document-link.patch` applied (`git apply`): Peek stops recognising a Leaf
  document's link. It fails at "a message with the document's link draws the document by its title" (flow 2).
- **Peek** at `a2c1bb7` with `plants/peek-unread-dot.patch`: no row in the sidebar is ever unread. It fails at "the
  room turns unread for Smoke Test 1 without reloading" (flow 7).
- **Ship** at `7e3e219` with `plants/ship-status.patch`: choosing a status saves nothing. It fails at "opened again,
  the issue shows In Progress and the comment" (flow 8).
- **Leaf** at `6413522` with `plants/leaf-comment-place.patch`: a comment forgets the words it is on. It fails at
  "opened again, the line and its comment are there", its card saying "On the whole document" (flow 9).

The three plants of 19 Nov leave an import unused, so build them with `npx vite build` rather than `npm run build`.
Ship builds to `dist/ship`, and reads `RELAY_URL`, `ID_BASE` and `CLIENT_ID` (its deploy workflow).

Build either one with its production settings (`VITE_RELAY_URL=https://estiva.estiva.app`, plus Leaf's
`VITE_ESTIVA_ID_ORIGIN` and `VITE_ESTIVA_ID_CLIENT_ID` from its deploy workflow), then run
`node run.mjs --serve <app>=<its dist>`.

## The relay's limit

The relay allows each account about 300 requests a minute. Before each page open, the run waits until the account's
last minute leaves room (`PACE` in `lib/browser.mjs`), so it never meets a "busy" answer. The relay also allows each
account 50 socket messages in any 5 s; two page opens in a row went over it, so an open also waits until the last
one's burst has left that window (`WS_PACE`). Both count the account across every browser it has open. It uses its
own accounts, so a session using QA-1 at the same time does not count against it. The time it held back is in the
result. Two runs back to back share the relay's minute, which the second run cannot see: leave a minute between them.

## Accounts

`SMOKE1_EMAIL`, `SMOKE1_SECRET`, `SMOKE2_EMAIL` and `SMOKE2_SECRET` are read from the environment, or from
`~/.estiva-qa.env`. Sign-ins are kept in `~/.cache/estiva-smoke/` (mode 600). Estiva ID allows about one test sign-in
every 30 s.

`node explore.mjs <n> <app> <path> [--wait ms] [--click label] [--js expr] [--shot file]` opens a page as a smoke
account, for writing a new step.
