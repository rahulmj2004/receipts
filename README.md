# Receipts

**You said it. Did your AI actually build it?**

Receipts checks AI-generated code against what you actually asked for. It reads your side of a coding-agent conversation, cuts it into atomic requirements, tracks corrections across turns, and looks for file-and-line evidence in the repository. Each requirement gets one of four verdicts:

| Verdict | Meaning |
| --- | --- |
| **Proven** | Relevant code supports it. The file, line and exact text are attached. |
| **Contradicted** | Code was found that does something different (affirmative conflict, not just "not found"). |
| **Missing** | No implementation was found in the scanned files. Treated as a strong lead, not absolute proof. |
| **Unverifiable** | Code inspection can't settle it (layout, runtime behavior, or no rule covers it). A person has to check. |

The agent's own "done" message is shown for contrast and never used as evidence.

## Run it

```bash
npm install
npm run dev          # http://localhost:3000
```

Production (static export to `out/`):

```bash
npm run build
npm run start        # serves out/ on http://localhost:3000
```

No environment variables, API keys or accounts are needed. Both routes (`/` and `/app`) export as static HTML; all analysis runs in the browser.

## Deploy

Pushing to `main` runs `.github/workflows/deploy.yml`: typecheck, lint, unit tests, then a static build published to GitHub Pages at `https://<user>.github.io/<repo>/`. The workflow sets `PAGES_BASE_PATH` to `/<repo>`. For a root domain (Netlify, Vercel, Cloudflare Pages), build without it and serve `out/`.

## Tests

```bash
npm run typecheck
npm run lint
npm test             # Vitest: extraction, revisions, evidence engine, imports, fix prompt
npm run test:e2e     # Playwright: full demo flow, overrides, paste import, malformed log, mobile
npm run check        # all of the above plus a production build
```

`test:e2e` builds nothing itself. Run `npm run build` first; it serves `out/` on port 3100.

## How it works

```
conversation ─► ingest ─► extract ─► link revisions ─► evaluate against repo ─► ledger / fix prompt
 (JSONL/paste)  (user msgs  (atomic     (supersedes,       (deterministic rules,
                 only,       reqs +      cancels, refines,  real file:line hits)
                 redacted)   quotes)     potential conflict)
```

- `src/lib/ingest/` parses Claude Code session logs (`~/.claude/projects/<project>/<session>.jsonl`) and pasted transcripts. Only user-typed text is kept: tool results, meta records, slash-command wrappers and assistant turns are skipped, and likely secrets are redacted before anything is stored.
- `src/lib/extract/extract.ts` does rule-based extraction. It splits clauses, keeps conditionals attached, tolerates one-letter dictation typos ("remov"), and skips session chatter ("open the localhost link"). Every requirement keeps an exact substring of your message.
- `src/lib/extract/revisions.ts` links requirements over time. Explicit corrections supersede; "never mind…" cancels; compatible detail refines; incompatible values with no correction wording are flagged as a **potential conflict** for you to resolve, never silently guessed.
- `src/lib/evidence/` holds the evidence engine. Curated rules (time zones, auth guards, email sending, persistence, form fields, phone validation, loading and error states, confirmation screens, responsive layout) run regex checks with proximity windows over the code. Comments, docs, tests, dependencies and `.env` files are never evidence. Requirements without a rule get keyword *candidates* and can never be proven.
- `src/lib/fix-prompt.ts` writes a follow-up prompt with only the selected gaps, the superseded wording, conflicting code and a request for file-and-line proof.
- `src/components/workspace/` is the audit UI: ledger, inspector, revision timeline, verdict overrides, fix prompt, rerun.

## Privacy

- Logs and pasted chats are parsed in the browser tab.
- Local folders are read through the browser's file picker (File System Access API on Chromium, `webkitdirectory` elsewhere). Nothing is uploaded.
- Public GitHub repos are fetched by the browser straight from GitHub's API (max 600 files).
- Audits are saved in `localStorage`: requirements, quotes, verdicts and short evidence excerpts. Whole files live only in memory. **Settings & privacy → Discard all data** clears everything.

## Sample audit

`/app` opens an **illustrative** sample: a clinic-booking app in two commits (`src/lib/demo/`). Commit `a1f3c9e` is the one the agent called complete; `7be21d4` is the commit after pasting the fix prompt. The gaps are deliberate, the verdicts come from the real engine, and every cited file can be opened in the app.

## Limitations

- Extraction is rule-based. Rambling or unusual phrasing can be missed or split oddly; check the "lines not treated as requirements" list.
- Checks are static: nothing is executed, so runtime and visual behavior stays **Unverifiable**.
- Curated rules cover common web-app requirements. Everything else falls back to keyword candidates, which need human judgment.
- Repository contents aren't kept between sessions; reconnect the repo to rerun after a reload.
