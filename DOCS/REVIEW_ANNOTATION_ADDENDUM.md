# Addendum — Upload Rules & Review Annotation (highlight-to-comment)

> **What this is.** An addendum to the document-control core build plan, covering (1) upload format rules and (2) the review annotation flow — the highlight-to-comment mechanism QA uses during review. Attach to the core plan's Phase 2 (read surface) and Phase 6/7 (new-SOP and change review). Written for the implementation agent.
>
> **One governing principle:** the app is **never an editor**. SOPs are authored and corrected in Microsoft Word, *outside* the system. The system reads, reviews, annotates, and controls — it never edits document content. The annotation view highlights and comments; it does not change a single character.

---

## 1. Upload rules

- **Word only, all versions.** Uploads are restricted to the Microsoft Word family (`.docx` primary, `.doc` for legacy). Everyone authors in Word; accepting only Word keeps the viewer and text-extraction predictable. Various Word/carrier versions are fine — the Word family is the single accepted authoring format.
- **No other formats in.** No PDF, Google Docs, or other formats as the authoring upload. (PDF exists only as an *output* rendition via the copy register, never as an input.)
- **Upload is how document content enters** a draft — at intake (new SOP) and at each re-upload after requested changes. The uploaded Word file is the source of truth for that version's content.

---

## 2. Two views of the same document (two purposes)

The read surface serves the *same document* through **two renderers**, for two different jobs:

| View | Purpose | Behavior |
|---|---|---|
| **Microsoft online view** | **Reading** — the effective document, and faithful reading during review | Renders the Word file with formatting fully preserved. Sealed — cannot target/select specific words. This is why a second view is needed for review. |
| **HTML annotation view** | **Reviewing** — QA highlights problems and comments | Text extracted from the Word file into simple HTML. QA can select/highlight passages. **Read-and-annotate only — never edit.** No editing surface; highlighting + commenting only. |

**QA toggles between them.** Default is the faithful MS-online view; QA switches to the HTML annotation view when they need to flag specific passages. Both show the same document; only the HTML view supports targeting words.

> **Why extract to HTML:** the MS-online viewer is a sealed render — you cannot attach a comment to a specific word inside it. Extracting the text to simple HTML produces a surface where a highlight can be anchored to a passage. Formatting fidelity is lost in this view (that's fine — it's for reviewing content, not reading the final document); the MS-online view remains the faithful one.

---

## 3. The highlight-to-comment flow

The mechanism (as specified):

```
1. QA reviews an uploaded SOP → toggles to the HTML annotation view
2. QA finds a problem → HIGHLIGHTS the passage
3. A small popup appears → QA types the comment → clicks COMMIT
4. The committed comment:
     - saves, anchored to the highlighted passage
     - appears in the REVIEW COMMENTS panel below, pinned to that passage
5. QA repeats for each problem found (multiple anchored comments)
6. QA finishes → "request changes"  (= the existing changes_requested transition)
7. The document + its anchored comments go back to the SENDER (author)
8. The author sees each comment PINNED to the exact passage it refers to
9. The author corrects the SOP IN WORD (outside the system) → re-uploads a new draft
10. Re-upload = a new version of the content; old comments stay attached to the old
      draft as historical review record (audited)
11. QA reviews the new upload → clean, or another round
```

### 3.1 What this is / isn't

- **Is:** a commenting overlay. Highlights + anchored comments captured as *review data* in the system.
- **Isn't:** an editor. QA never changes document content. The content changes only when the author re-uploads a corrected Word file.
- The engine transition is unchanged: this is a richer way to populate the existing **`changes_requested`** step — not a new state. The state machine doesn't change; the review *experience* gets the annotation layer.

### 3.2 Anchoring (the one technical thing to get right)

- Anchor each comment to the **text content** it refers to — the quoted passage plus enough surrounding context to locate it — **not** to a raw character position.
- **Do not** attempt live re-anchoring across versions. Each comment belongs to **the draft it was made on**. When the author re-uploads a corrected version, that is a **new draft that starts clean** (no carried-over highlights). The old draft retains its comments as the historical record of that review round.
- This keeps it simple and keeps the review history honest *per version*: for any draft, you can see exactly what was flagged and that a corrected version followed.

### 3.3 Review comments panel

- Below the document view, a panel lists all committed comments for the current draft, each showing the quoted passage + the comment + who wrote it + when.
- This panel is what travels back to the author with the "request changes" action.
- All comments are audited (author of comment, timestamp, the passage) — an inspector can see the document was reviewed, what was flagged, and that it was addressed in a subsequent version.

---

## 4. How it ties into the existing flow

- **New-SOP pipe (core Phase 6):** the `changes_requested` loop (QA/HOD → author revise → resubmit) now carries anchored comments. Author re-uploads corrected Word → new draft → re-review.
- **Change pipe (core Phase 7):** same annotation mechanism during document review within a change.
- **Read surface (core Phase 2):** now specified to provide **two renderers** — MS-online (faithful reading) and HTML-extract (annotation). Both are core; the HTML view is view+annotate only.
- **Audit:** every comment, every re-upload, every review round is captured — the review history per version is complete and inspectable.

---

## 5. Guards / invariants

- The HTML annotation view **never edits document content** — highlight + comment only, enforced (no editing controls exist in it).
- Document content changes **only** by the author re-uploading a Word file — never inside the app.
- Comments are anchored per-draft; a corrected re-upload is a new clean draft; old comments persist as history.
- Uploads are Word-family only.
- Every comment and re-upload is audited.

---

## 6. Screens (additions/updates)

- **D-READ (updated):** gains a toggle between **MS-online view** (default, faithful) and **HTML annotation view**.
- **D-REVIEW-ANNOTATE (new, within QA review):** the HTML annotation surface — highlight a passage → popup → comment → commit; the review-comments panel below; "request changes" sends it back with all anchored comments.
- **D-CHANGES (updated, author side):** the author sees comments pinned to their passages; corrects in Word; re-uploads the new draft.

---

## 7. Open items

- Confirm Word versions to accept (recommend `.docx` + `.doc`; confirm if any client uses `.odt` or other — currently excluded).
- Whether HOD (not just QA) can also annotate during endorsement — recommend yes, same mechanism, since HOD can also request changes.
- Whether comments should support a simple resolve/acknowledge marker when the author addresses them (nice-to-have; the re-upload already implies addressing) — candidate for post-adoption feedback.

*End of addendum.*
