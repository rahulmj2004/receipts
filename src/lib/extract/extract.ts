import type { Atom, Cue, ExcludedSegment, Polarity, SourceMessage } from "../types";
import {
  ACTION_VERBS,
  CONCEPTS,
  FORBID_VERBS,
  OPERATIONAL_VERBS,
  STOPWORDS,
  timezoneValue,
} from "./lexicon";

/**
 * Rule-based extraction: cuts each of the user's messages into atomic, separately
 * verifiable requirements. Every atom keeps its exact quote from the message.
 */

const FILLER = /^(?:(?:ok(?:ay)?|so|and|also|oh|um+|uh+|alright|right|now|then|please|pls|plz|hey|yeah|yes|well|actually|btw|next|finally|lastly|plus|but|oh and|and also|one more thing)\b[\s,:-]*)+/i;
const ASK =
  /^(?:(?:can|could|would|will) you(?: please)?|i(?:'d| would)? (?:want|need|like)(?: you)? to|i want|we need to|we should|you need to|you should|let'?s|go ahead and|try to|remember to|don'?t forget to|be sure to)\s+/i;
const ENSURE = /^(?:make sure|ensure|be sure)(?: that| to)?\s+/i;
const CONDITIONAL = /^(?:if|when|whenever|after|once|before|while|on|upon)\b[^,]{1,80},\s*/i;
const MARKER =
  /\b(?:should(?:n'?t)?|must(?:n'?t)?|needs? to|has to|have to|shall|don'?t|do not|never|always|no longer|without|can'?t|cannot)\b/i;
const NO_START = /^(?:no|without)\s+\w+/i;
const VAGUE =
  /^\w+(?:\s+\w+)?\s+(?:it|this|that|them|these|those|everything|all|the (?:issue|error|bug|problem|thing)s?)(?:\s+(?:again|now|please|up|out|fully))?$/i;
const OPERATIONAL_CONTEXT = /\b(?:localhost|local link|the link|commit|push|deploy|git|terminal|npm|the server|dev server|the tests?)\b/i;
const HIGH = /\b(?:must|critical|important|make sure|ensure|definitely|really need|mandatory|required|always|never)\b/i;
const LOW = /\b(?:if possible|nice to have|maybe|optional(?:ly)?|if you can|when you get a chance|eventually|if there'?s time)\b/i;
const FORBID_PHRASE =
  /\b(?:without|shouldn'?t|should not|must not|mustn'?t|no longer|no need (?:to|for)|not require|doesn'?t (?:need|require)|don'?t|do not|never)\b|^(?:no)\s/i;
const CANCEL =
  /\b(?:never ?mind|scrap|scratch that|forget (?:about )?(?:the|that|it)|no need for|don'?t bother|leave out|drop the idea)\b/i;
const CORRECTION = /\b(?:actually|instead|rather than|on second thought|change of plan|correction|i meant)\b/i;
const CHANGE_TO = /^(?:change|switch|convert|replace|update|move)\b.*\b(?:to|with)\b/i;

interface Span {
  start: number;
  end: number;
}

/** Optimal string alignment distance, capped for speed. */
function editDistance(a: string, b: string): number {
  if (Math.abs(a.length - b.length) > 2) return 3;
  const d: number[][] = Array.from({ length: a.length + 1 }, (_, i) =>
    Array.from({ length: b.length + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0)),
  );
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
      }
    }
  }
  return d[a.length][b.length];
}

const VERB_SET = new Set(ACTION_VERBS);
const OP_SET = new Set(OPERATIONAL_VERBS.filter((v) => !v.includes(" ")));

/** Canonical action verb for a word, tolerating one typo ("remov", "chnage") and inflections. */
export function canonicalVerb(word: string): string | undefined {
  const w = word.toLowerCase().replace(/[^a-z-]/g, "");
  if (!w) return undefined;
  if (VERB_SET.has(w)) return w;
  for (const suffix of ["s", "es", "ed", "d", "ing"]) {
    if (w.endsWith(suffix)) {
      const base = w.slice(0, -suffix.length);
      if (VERB_SET.has(base)) return base;
      if (VERB_SET.has(base + "e")) return base + "e";
    }
  }
  if (w.length >= 5) {
    for (const v of ACTION_VERBS) {
      if (v.length >= 4 && editDistance(w, v) <= 1) return v;
    }
  }
  return undefined;
}

function stripLead(s: string): { core: string; ask: boolean; ensure: boolean; conditional: string } {
  let core = s.trim().replace(/^[\s"'“”‘’`*>-]+/, "");
  let ask = false;
  let ensure = false;
  let conditional = "";
  for (let i = 0; i < 3; i++) {
    const before = core;
    core = core.replace(FILLER, "");
    const c = core.match(CONDITIONAL);
    if (c) {
      conditional += c[0];
      core = core.slice(c[0].length);
    }
    const a = core.match(ASK);
    if (a) {
      ask = true;
      core = core.slice(a[0].length);
    }
    const e = core.match(ENSURE);
    if (e) {
      ensure = true;
      core = core.slice(e[0].length);
    }
    if (core === before) break;
  }
  return { core: core.replace(/[\s.!?,;:]+$/, ""), ask, ensure, conditional };
}

function firstWord(core: string): string {
  return core.split(/\s+/)[0] ?? "";
}

function isOperational(core: string): boolean {
  const lower = core.toLowerCase();
  if (OPERATIONAL_VERBS.some((v) => v.includes(" ") && lower.startsWith(v + " "))) return true;
  const w = firstWord(lower).replace(/[^a-z]/g, "");
  if (OP_SET.has(w) && !VERB_SET.has(w)) return true;
  // e.g. "give the localhost link", "show the local link"
  if (OPERATIONAL_CONTEXT.test(lower) && /^(?:give|show|send|share|open|run|start|check|make)\b/.test(lower)) return true;
  return false;
}

function startsAsRequirement(piece: string): boolean {
  const { core, ask, ensure } = stripLead(piece);
  if (!core) return false;
  if (ensure) return true;
  if (canonicalVerb(firstWord(core))) return true;
  if (NO_START.test(core)) return true;
  if (ask && isOperational(core)) return true;
  return false;
}

/** Split a message into candidate clause spans (indices into the message text). */
export function segmentMessage(text: string): Span[] {
  const spans: Span[] = [];
  const lineRe = /[^\n]+/g;
  let lm: RegExpExecArray | null;
  while ((lm = lineRe.exec(text))) {
    let lineStart = lm.index;
    const bullet = lm[0].match(/^\s*(?:[-*•]|\d+[.)])\s+/);
    if (bullet) lineStart += bullet[0].length;
    const line = text.slice(lineStart, lm.index + lm[0].length);

    // Sentences: break after . ! ? when followed by whitespace or the end.
    const sentRe = /[^.!?]+(?:[.!?]+(?=\s|$)|$)|[.!?]+/g;
    let sm: RegExpExecArray | null;
    const sentences: Span[] = [];
    let carry: Span | null = null;
    while ((sm = sentRe.exec(line))) {
      if (!sm[0]) {
        sentRe.lastIndex++;
        continue;
      }
      const s = { start: lineStart + sm.index, end: lineStart + sm.index + sm[0].length };
      // Keep "e.g." / "Asia/Kolkata" style fragments attached.
      if (carry) {
        carry.end = s.end;
      } else {
        carry = s;
      }
      const chunk = text.slice(carry.start, carry.end);
      if (/\b(?:e\.g|i\.e|etc|vs|approx)\.$/i.test(chunk.trim())) continue;
      sentences.push(carry);
      carry = null;
    }
    if (carry) sentences.push(carry);

    for (const sent of sentences) {
      const sentence = text.slice(sent.start, sent.end);
      const cond = sentence.trimStart().match(CONDITIONAL);
      const protectUntil = cond ? sentence.length - sentence.trimStart().length + cond[0].length : 0;
      const sepRe = /\s*;\s*|,?\s+(?:and then|and also|and|also|plus|then)\s+|,\s+/gi;
      const pieces: Span[] = [];
      let last = 0;
      let m: RegExpExecArray | null;
      while ((m = sepRe.exec(sentence))) {
        if (m.index < protectUntil) continue;
        pieces.push({ start: last, end: m.index });
        last = m.index + m[0].length;
      }
      pieces.push({ start: last, end: sentence.length });

      const merged: Span[] = [];
      for (const p of pieces) {
        const pieceText = sentence.slice(p.start, p.end);
        const prev = merged[merged.length - 1];
        const prevIsFiller = prev !== undefined && !stripLead(sentence.slice(prev.start, prev.end)).core;
        if (prev && (prevIsFiller || !startsAsRequirement(pieceText))) {
          prev.end = p.end;
        } else {
          merged.push({ ...p });
        }
      }
      for (const p of merged) {
        let s = sent.start + p.start;
        let e = sent.start + p.end;
        while (s < e && /[\s"“”'‘’]/.test(text[s])) s++;
        while (e > s && /[\s.!?,;:"“”'‘’]/.test(text[e - 1])) e--;
        if (e > s) spans.push({ start: s, end: e });
      }
    }
  }
  return spans;
}

function keywordsOf(core: string): string[] {
  const words = core.toLowerCase().match(/[a-z0-9+#/]+/g) ?? [];
  const out = new Set<string>();
  for (const raw of words) {
    if (raw.length < 2 || STOPWORDS.has(raw) || canonicalVerb(raw) === raw) continue;
    const w = raw.length > 4 && raw.endsWith("s") && !raw.endsWith("ss") ? raw.slice(0, -1) : raw;
    if (!STOPWORDS.has(w)) out.add(w);
  }
  return [...out];
}

function detectConcept(text: string): string {
  for (const c of CONCEPTS) if (c.re.test(text)) return c.id;
  return "general";
}

function capitalise(s: string): string {
  return s ? s[0].toUpperCase() + s.slice(1) : s;
}

export interface ExtractResult {
  atoms: Atom[];
  excluded: ExcludedSegment[];
}

export function extractRequirements(messages: SourceMessage[]): ExtractResult {
  const atoms: Atom[] = [];
  const excluded: ExcludedSegment[] = [];

  for (const msg of messages) {
    const spans = segmentMessage(msg.text);
    spans.forEach((span, i) => {
      const quote = msg.text.slice(span.start, span.end);
      const exclude = (reason: string) =>
        excluded.push({ messageId: msg.id, messageIndex: msg.index, quote, reason });

      const { core, ask, ensure, conditional } = stripLead(quote);
      if (!core) return;
      if (core.split(/\s+/).length < 2) {
        exclude(canonicalVerb(core) ? "Too short to verify on its own" : "No instruction detected");
        return;
      }
      const verb = canonicalVerb(firstWord(core));
      const isQuestion = /\?\s*$/.test(msg.text.slice(span.start, Math.min(msg.text.length, span.end + 2)));
      if (isOperational(core)) return exclude("Request about the session, not the product");
      if (isQuestion && !ask && !verb) return exclude("Question, not an instruction");
      if (VAGUE.test(core)) return exclude("Too vague to verify (refers to earlier context)");
      if (!verb && !ensure && !NO_START.test(core) && !MARKER.test(core)) return exclude("Context or statement, not an instruction");

      const fullText = conditional + core;
      let title: string;
      if (verb) {
        const rest = core.slice(firstWord(core).length);
        title = (conditional ? capitalise(conditional) + verb : capitalise(verb)) + rest;
      } else if (ensure) {
        title = (conditional ? capitalise(conditional) + "ensure " : "Ensure ") + core;
      } else {
        title = capitalise(fullText);
      }

      let polarity: Polarity = "require";
      if ((verb && FORBID_VERBS.has(verb)) || /^get rid of\b/i.test(core) || FORBID_PHRASE.test(core)) {
        polarity = "forbid";
      }

      let cue: Cue | undefined;
      if (CANCEL.test(quote)) cue = "cancel";
      else if (CORRECTION.test(quote) || CHANGE_TO.test(core)) cue = "correction";

      const concept = detectConcept(fullText);
      const value = concept === "timezone" ? timezoneValue(fullText) : undefined;
      const priority = HIGH.test(quote) ? "high" : LOW.test(quote) ? "low" : undefined;

      atoms.push({
        id: `${msg.id}#${i + 1}`,
        messageId: msg.id,
        messageIndex: msg.index,
        timestamp: msg.timestamp,
        quote,
        title,
        priority,
        concept,
        value,
        polarity,
        keywords: keywordsOf(fullText),
        cue,
      });
    });
  }
  return { atoms, excluded };
}
