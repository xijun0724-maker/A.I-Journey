# Journey A.I &mdash; Domain & Architectural Context

## Domain Vocabulary

- **Course**: An academic unit or subject containing lessons, events, readings, and associated documents.
- **Event**: A task or assessment (assignment, exam, quiz, project, reading, lab) associated with a course, carrying due dates, estimated effort, weight, and completion status.
- **Lesson**: A scheduled lecture or class session within a course.
- **Reading**: An assigned article, book chapter, or textbook section linked to a course.
- **Document**: Full-text file uploaded to the Library (syllabus, lecture notes, textbook), chunked for retrieval.
- **Chunk**: A segment of document text indexed by the BM25 retrieval engine.
- **ChatMessage**: An exchange in the study tutor dialogue between user, assistant, or system. Each message carries a `cid` (conversation id); messages stored before conversations existed carry none and form one legacy conversation.
- **Conversation**: The group of chat messages sharing a `cid`. One conversation is one row in the sidebar Recents, is what the assistant transcript shows when open, and is the only history sent to the model. "New" closes the open conversation (landing page) without deleting anything; the next message starts a new one. The open conversation is **session state**, not persisted: "New" holds until the page is reloaded, and a reload resumes the newest conversation.
- **StudyPlan**: Generated schedule of study blocks allocating time across upcoming deadlines.

## Architectural Vocabulary

- **Store (Deep Module)**: Owns the persistent schema, storage quota monitoring, IndexedDB mirroring, and atomic entity mutations (`courses`, `events`, `lessons`, `readings`, `documents`, `chat`, `settings`). The five array entities come from one `makeEntity` factory — each supplies only its defaults, an optional `onSave` hook and an optional `cascade` — so the insert/update/remove rule is written once. Emits in-process `change` events on every mutation and guarantees automatic persistence. `Store.chat` additionally owns conversation semantics: which conversation is open (`activeId`/`newConversation`/`open`), the grouping of the flat log into conversations, and exactly two write paths — `append(msg)` opens the conversation it lands in (creating one when nothing is open) and returns its cid, `appendTo(cid, msg)` files a message without opening it (a reply arriving after "New" leaves the landing page alone) — so "one chat = one Recents row" and "a late reply never hijacks the view" are each stated once, in the Store.
- **Settings Schema (Deep Module)**: `config/settings.js` is the single source of truth for every setting's default, storage type, form binding and coercion. `createBlankDB()` derives the blank settings from it and `readSettingsForm()` maps the live form back to a typed patch, so the Settings view and every writer go through `Store.settings.update` rather than assigning `db.settings` directly.
- **Layout Seam**: The router composes the page frame (`view-padded` + scope chip); every view returns its body only, so no view encodes the wrapper and the chip needs no string matching.
- **Seam**: The interface between modules. 
  - *Store &rarr; Router Seam*: `Store.on('change', Router.onStoreChange)` lets the UI stay reactive without action handlers coupling to the view layer. `onStoreChange` is also the single **repaint policy**: chat appends repaint only the sidebar Recents (the assistant paints its transcript incrementally, so a full re-render would rebuild it — and any half-typed draft — mid-conversation), every other mutation repaints the whole view. Neither the Store nor the view layer decides alone.
  - *RAG &rarr; Store Seam*: `RAG.observe()` subscribes the retrieval cache to the same `change` event, so index invalidation is owned by RAG instead of every mutation call site.
  - *Action Delegation Seam*: `data-act` attributes on DOM elements routed declaratively through `actions-delegation.js` to semantic action handlers. One `ACTIONS` table maps each action name to its handler; `KNOWN_ACTIONS` is derived from its keys.
- **Locality**: Concentrating related invariants (e.g. course deletion cascading to its events, lessons, readings, and document chunks) inside the Store rather than scattering array mutations across multiple action files and modals.
- **Leverage**: Action handlers and modals shrink to single semantic method calls (`Store.courses.remove(id)`), hiding persistence, cascade cleanup, and change notifications behind one deep interface.
