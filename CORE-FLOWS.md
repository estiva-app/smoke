# Core flows

The few things Miky and Katerina do in Peek, Ship and Leaf every day, written as they see them. When one breaks, their
work stops. Every ticket's kickoff names the core flows it touches, in the apps next door too, and the product
reviewers check a pull request against this list on `main`. The smoke test walks each one on production after every
deploy.

## What makes a flow core

- **In:** a person does it every day, and when it breaks their work stops.
- **Out:** nobody does it every day any more, or another flow already covers it.
- **Who decides:** adding a flow or cutting one is Miky's call. Whoever proposes it brings the moment it was missed or
  the reason it no longer matters. A flow comes in with the smoke test's steps that walk it, and goes out with them.

A ticket that changes how a core flow looks or works says so in its pull request, and updates the flow here and its
smoke test file in a pull request to this repository, named in the app's pull request and merged with it. A ticket that adds something new does not add a flow: most things a person can do
are not core, and are checked by that ticket's own Done when.

## The ten flows

| # | Flow | Apps | Smoke test |
| --- | --- | --- | --- |
| 1 | An issue made in Ship opens in Peek and in Leaf | Ship, Peek, Leaf | [`flows/1-issue-next-door.mjs`](flows/1-issue-next-door.mjs) |
| 2 | A Leaf document's link draws as the document in Peek | Leaf, Peek | [`flows/2-document-link-in-peek.mjs`](flows/2-document-link-in-peek.mjs) |
| 3 | A topic shows its issue and its document in each app | Peek, Ship, Leaf | [`flows/3-topic.mjs`](flows/3-topic.mjs) |
| 4 | A second person's comment arrives without reloading | Ship, Peek, Leaf | [`flows/4-comment-arrives.mjs`](flows/4-comment-arrives.mjs) |
| 5 | A mention in a Ship comment reaches the person in Peek | Ship, Peek | [`flows/5-mention-reaches-peek.mjs`](flows/5-mention-reaches-peek.mjs) |
| 6 | Sign in once, and every app opens signed in | Estiva ID, Peek, Ship, Leaf | [`flows/6-sign-in.mjs`](flows/6-sign-in.mjs) |
| 7 | A message in a room shows as unread to the other person | Peek | [`flows/7-peek-message-unread.mjs`](flows/7-peek-message-unread.mjs) |
| 8 | An issue made, its status changed and a comment added | Ship | [`flows/8-ship-issue.mjs`](flows/8-ship-issue.mjs) |
| 9 | A document made, written in and commented on | Leaf | [`flows/9-leaf-document.mjs`](flows/9-leaf-document.mjs) |
| 10 | Search finds an issue and a document by title | Peek, Ship, Leaf | [`flows/10-search.mjs`](flows/10-search.mjs) |

Below, each app's section lists every flow it takes part in, as a person there sees it, with the smoke test's step in
brackets. A ticket in one app reads its own section and the flows it shares with the others.

## Estiva ID

- **6. Sign in once.** In a new browser, a person signs in to Estiva ID, then opens Peek, Ship and Leaf. Each opens
  signed in, with no sign-in screen and no click, and shows their name. (`Peek, then Ship, then Leaf: each opens signed
  in, in one new browser`)

## Peek

- **1. An issue from Ship.** A person opens an issue made in Ship. Its title is in the side panel's Overview card and
  its conversation is in the middle. Its text and picture are not drawn: Peek shows another app's file as a card.
  (`Peek: the issue opens with its title and its conversation`)
- **2. A Leaf link.** A person pastes a Leaf document's link into a message and sends it. The link draws as the
  document, with its title. (`Peek: a message with the document's link draws the document by its title`)
- **3. A topic.** A person opens a topic (an initiative, in Peek's words). Its side panel lists its issue and its
  document under Files. (`Peek: the topic's side panel lists the issue and the document`)
- **4. A comment arrives.** With an issue open, a person sees a comment someone else just wrote in Ship appear in the
  conversation, without reloading. (`Peek: the comment arrives without reloading`)
- **5. A mention.** When someone mentions a person in a Ship comment, that comment is on the person's Desk, naming them.
  (`Peek: the mention is on Smoke Test 1's Desk`)
- **6. Sign in once.** Peek opens signed in after Estiva ID. (flow 6's step)
- **7. Unread.** A person has Peek open on Teams, and their team room's row is quiet. Someone else sends a message in
  the room. Without a reload, the row's dot turns blue. They open the room, read the message, and the row is quiet
  again. (`Peek: the room turns unread for Smoke Test 1 without reloading`, `Peek: Smoke Test 1 opens the room, reads
  the message, and the row is quiet again`)
- **10. Search.** A person presses Search Peek (Ctrl+K) and types the start of an issue's or a document's title. It is
  among the answers, and choosing it opens it. Search matches the starts of words. (`Peek: search finds the issue by
  the start of its title, and opens it`, `Peek: search finds the document by the start of its title, and opens it`)

## Ship

- **1. An issue opens next door.** An issue a person adds in Ship, with only a title, opens in Leaf, and what they
  type there is the issue's text back in Ship. (`Ship: add an issue with only a title`, `Leaf: words typed there are
  the issue's text in Ship`)
- **3. A topic.** A person opens a topic. Its page lists its issue under Issues and its document under Documents.
  (`Ship: the topic page lists the issue and the document`)
- **4. A comment.** A person comments on an issue, and the people who have it open in Peek and Leaf see it arrive.
  Typing in the comment box as soon as it shows keeps every letter (an open bug since 19 Nov: Ship redraws the box,
  and letters are lost). (`Ship: typing in the comment box as soon as it shows keeps every letter`, `Ship: Smoke Test 2
  comments on the issue`)
- **5. A mention.** A person mentions someone in a comment, and the comment reaches that person's Desk in Peek.
  (`Ship: Smoke Test 2 mentions Smoke Test 1 in a comment`)
- **6. Sign in once.** Ship opens signed in after Estiva ID. (flow 6's step)
- **8. An issue's life.** A person adds an issue, someone else sets its Status from Todo to In Progress and comments
  on it. Opened again, the issue shows In Progress and the comment. (`Ship: Smoke Test 1 adds an issue`, `Ship: Smoke
  Test 2 sets its status to In Progress`, `Ship: Smoke Test 2 comments on it`, `Ship: opened again, the issue shows In
  Progress and the comment`)
- **10. Search.** The issue Ship made is found by its title in Peek's search. Ship's own search is only its `[` link
  list. (`Peek: search finds the issue by the start of its title, and opens it`)

## Leaf

- **1. An issue from Ship.** A person opens an issue made in Ship. It opens as a page: its title, its text, its
  picture as a card with its thumbnail, and its conversation beside it. An issue with no text opens in the editor,
  empty, with its conversation beside it, and what they type there is the issue's text in Ship. (`Leaf: the issue opens
  with its title, text, picture and conversation`, `Leaf: the issue with no text opens in the editor`, `Leaf: the issue
  with no text shows its conversation`, `Leaf: words typed there are the issue's text in Ship`)
- **2. A link in Peek.** A document's link, pasted in a Peek message, draws as the document by its title. (flow 2's
  step)
- **3. A topic.** A person opens a topic. Its page lists its issue and its document. (`Leaf: the topic page lists the
  issue and the document`)
- **4. A comment arrives.** With an issue open, a person sees a comment someone else just wrote in Ship appear under
  Comments, without reloading. (`Leaf: the comment arrives without reloading`)
- **6. Sign in once.** Leaf opens signed in after Estiva ID. (flow 6's step)
- **9. A document's life.** A person presses New document on Home, names it and picks a team, and Leaf opens it. They
  type a line, select its words, press Comment and write a comment, which shows in the Comments column. Opened again,
  the line and the comment are there. (`Leaf: Smoke Test 2 makes a document in the QA team`, `Leaf: Smoke Test 2 writes
  a line in it`, `Leaf: Smoke Test 2 comments on the line`, `Leaf: opened again, the line and its comment are there`)
- **10. Search.** A document made in Leaf is found by its title in Peek's search. Leaf's own search is only its `[`
  link list. (`Peek: search finds the document by the start of its title, and opens it`)
