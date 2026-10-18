import { TIMEZONES } from "../extract/lexicon";
import { applicableRevisions, latestAtom } from "../extract/revisions";
import type { RequirementChain } from "../types";
import { isUiFile, type IndexedFile } from "./repo";

export interface Pattern {
  re: RegExp;
  why: string;
  /** Another line within `window` lines must match `near` for this to count. */
  near?: RegExp;
  window?: number;
  /** Lines matching this are ignored (e.g. a function definition rather than a call). */
  skipLine?: RegExp;
  /** The file as a whole must match this. */
  fileMust?: RegExp;
  /** The file as a whole must not match this. */
  fileMustNot?: RegExp;
}

export interface CheckSpec {
  ruleId: string;
  label: string;
  /**
   * presence  supports → PROVEN, nothing → MISSING
   * absence   conflicts → CONTRADICTED, none (in a non-empty scope) → PROVEN by curated absence scan
   * runtime   always UNVERIFIABLE; patterns are shown as hints only
   * each      every pattern in `each` needs at least one hit
   */
  mode: "presence" | "absence" | "runtime" | "each";
  scope: (f: IndexedFile) => boolean;
  scopeLabel: string;
  supports: Pattern[];
  /** Partial evidence: never PROVEN on its own. */
  weak?: Pattern[];
  weakStatus?: "missing" | "unverifiable";
  weakSummary?: string;
  conflicts: Pattern[];
  /** Shown to the user, never decisive. */
  candidates?: Pattern[];
  each?: { label: string; pattern: Pattern }[];
  expectation: string;
  uncertainty: string;
  provenSummary: string;
  missingSummary: string;
}

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&");
const anyFile = () => true;
const uiFiles = (f: IndexedFile) => isUiFile(f.path);
const ROUTE_DIR = /(?:^|\/)(?:app|pages|routes|views|screens|components)\//i;

/** Words that name the concept itself, so they don't count as the requirement's subject. */
const CONCEPT_WORDS = new Set(
  (
    "page screen form field login logging log sign auth authentication account password user patient " +
    "time times timezone zone utc ist display displayed show database db save saved store storage persist " +
    "error message fail fails failure clear blank loading spinner submitting confirmation confirm email " +
    "mobile responsive work works phone number digit digits indian validate validation selector dropdown " +
    "picker toggle dark mode theme header appointment detail details booking-form all every"
  ).split(" "),
);

function stem(word: string): string {
  return word.replace(/(?:ings?|ed|es|s)$/i, "");
}

export interface Subject {
  word: string;
  stem: string;
}

/** Subject nouns of a requirement ("booking" in "save every booking"). */
export function subjectWords(chain: RequirementChain): Subject[] {
  const words = applicableRevisions(chain).flatMap((r) => r.atom.keywords);
  const out = new Map<string, Subject>();
  for (const w of words) {
    if (w.length < 4 || CONCEPT_WORDS.has(w)) continue;
    const s = stem(w);
    if (s.length >= 3 && !out.has(s)) out.set(s, { word: w, stem: s });
  }
  return [...out.values()];
}

function subjectRegex(subjects: Subject[]): RegExp | undefined {
  if (subjects.length === 0) return undefined;
  return new RegExp(`(?:${subjects.map((s) => esc(s.stem)).join("|")})`, "i");
}

const plural = (w: string) => (w.endsWith("s") ? w : `${w}s`);

function textOf(chain: RequirementChain): string {
  return applicableRevisions(chain)
    .map((r) => r.atom.quote)
    .join(" \n ");
}

export function specFor(chain: RequirementChain, files: IndexedFile[]): CheckSpec {
  const atom = latestAtom(chain);
  const text = textOf(chain);
  const forbid = atom.polarity === "forbid";
  const subjects = subjectWords(chain);
  const subjectRe = subjectRegex(subjects);

  switch (chain.concept) {
    case "timezone": {
      const key = atom.value ?? "IST";
      const tz = TIMEZONES[key] ?? TIMEZONES.IST;
      const alt = tz.iana.map(esc).join("|");
      const supports: Pattern[] = [
        {
          re: new RegExp(`timeZone\\s*:\\s*['"\`](?:${alt})['"\`]`),
          why: `Formats dates with the ${tz.label} time zone.`,
        },
        {
          re: new RegExp(`['"\`](?:${alt})['"\`]`),
          near: /toLocale\w*\(|DateTimeFormat|format\w*\(|timeZone\s*:/,
          window: 3,
          why: `Uses ${tz.label} when formatting dates.`,
        },
      ];
      if (tz.offset) {
        supports.push({ re: tz.offset, near: /Date|time/i, window: 2, why: `Applies the ${key} UTC offset.` });
      }
      if (key === "UTC") {
        supports.push({ re: /\.toUTCString\(\)|\.getUTC(?:Hours|Minutes)\(\)/, why: "Displays UTC time components." });
      }
      const conflicts: Pattern[] = [
        {
          re: new RegExp(`timeZone\\s*:\\s*['"\`](?!(?:${alt})['"\`])[A-Za-z_]+(?:/[A-Za-z_+-]+)*['"\`]`),
          why: `Formats dates with a different, hard-coded time zone instead of ${key}.`,
        },
      ];
      if (key !== "UTC") {
        conflicts.push(
          { re: /\.toUTCString\(\)|\.getUTC(?:Hours|Minutes)\(\)/, why: `Displays UTC time components instead of ${key}.` },
          { re: /toISOString\(\)\s*\.(?:slice|substring|substr)\(\s*11/, why: `Shows the raw UTC clock time instead of ${key}.` },
        );
      }
      return {
        ruleId: "timezone",
        label: `Time zone · ${key}`,
        mode: "presence",
        scope: anyFile,
        scopeLabel: "all source files",
        supports,
        conflicts,
        expectation: `Every displayed time is formatted in ${tz.label} (for example timeZone: '${tz.iana[0]}'); no display path hard-codes another zone.`,
        uncertainty:
          "Static check of explicit time-zone settings. Dates formatted with the browser's local zone or a date library's defaults aren't detected.",
        provenSummary: `Dates are formatted with ${tz.label}.`,
        missingSummary: `No code pins displayed times to ${tz.label}.`,
      };
    }

    case "timezone-selector": {
      const patterns: Pattern[] = [
        { re: /<\s*Time[-_]?[Zz]one\w*(?:Select|Picker|Dropdown|Switcher|Menu)\w*\b/, why: "Renders a time-zone selector component." },
        { re: /Intl\.supportedValuesOf\(\s*['"]timeZone['"]/, why: "Builds a list of selectable time zones." },
        {
          re: /(?:name|id)=["'{]\s*["'`]?(?:tz|time-?zone)["'`]?/i,
          near: /<select\b|<Select\b/,
          window: 2,
          why: "Renders a <select> for the time zone.",
        },
      ];
      return {
        ruleId: "timezone-selector",
        label: "Time-zone selector",
        mode: forbid ? "absence" : "presence",
        scope: uiFiles,
        scopeLabel: "UI files (.tsx, .jsx, .vue, .svelte, .html)",
        supports: forbid ? [] : patterns,
        conflicts: forbid ? patterns : [],
        expectation: forbid
          ? "No time-zone selector is rendered anywhere in the UI."
          : "A time-zone selector is rendered where times are shown.",
        uncertainty:
          "Looks for common selector components and <select> elements for time zones. A custom control with an unrelated name wouldn't be detected; confirm visually.",
        provenSummary: forbid ? "No time-zone selector is rendered in the scanned UI files." : "A time-zone selector is rendered.",
        missingSummary: "No time-zone selector found.",
      };
    }

    case "auth": {
      const subjectFiles = subjectRe ? files.filter((f) => subjectRe.test(f.path) && ROUTE_DIR.test(f.path)) : [];
      const subjectSet = new Set(subjectFiles.map((f) => f.path));
      const isMiddleware = (f: IndexedFile) => /(?:^|\/)(?:middleware|proxy)\.[jt]s$/.test(f.path);
      const scope =
        subjectFiles.length > 0
          ? (f: IndexedFile) => subjectSet.has(f.path) || isMiddleware(f)
          : (f: IndexedFile) => ROUTE_DIR.test(f.path) || isMiddleware(f);
      const guards: Pattern[] = [
        {
          re: /\b(?:await\s+)?(?:requireAuth|requireUser|withAuth|ensureAuth\w*)\s*\(|\bgetServerSession\s*\(|\bauth\(\)\.protect\(|useSession\(\s*\{\s*required:\s*true/,
          skipLine: /\bfunction\s+(?:requireAuth|requireUser|withAuth|ensureAuth)|(?:const|let)\s+(?:requireAuth|requireUser|withAuth)\s*=/,
          why: "Requires a signed-in user before the page renders.",
        },
        { re: /redirect\(\s*['"`]\/(?:login|signin|sign-in|auth)\b/i, why: "Redirects visitors to the login page." },
        { re: /<\s*(?:RequireAuth|ProtectedRoute|AuthGuard|PrivateRoute|SignedIn)\b/, why: "Wraps the page in an auth guard." },
      ];
      if (subjectRe) {
        guards.push({
          re: /matcher\s*:/,
          near: new RegExp(`['"\`]/[^'"\`]*(?:${subjects.map((x) => esc(x.stem)).join("|")})`, "i"),
          window: 3,
          fileMust: /login|signin|session|auth|token/i,
          why: "Middleware protects this route with an auth check.",
        });
      }
      const where = subjects.length ? `${subjects.map((x) => x.word).join(", ")} routes and middleware` : "route files and middleware";
      return {
        ruleId: "auth",
        label: forbid ? "No login required" : "Login required",
        mode: forbid ? "absence" : "presence",
        scope,
        scopeLabel: where,
        supports: forbid ? [] : guards,
        conflicts: forbid ? guards : [],
        expectation: forbid
          ? `Visitors can open the ${subjects.length ? subjects.map((x) => x.word).join(", ") + " pages" : "pages"} without signing in: no auth guard, login redirect or middleware matcher covers them.`
          : `The ${subjects[0]?.word ?? "page"} requires a signed-in user.`,
        uncertainty:
          "Checks common auth guards (requireAuth, getServerSession, redirects to /login, middleware matchers). Custom guards with other names wouldn't be detected; open the page in a private window to confirm.",
        provenSummary: forbid
          ? `No auth guard covers the ${where}.`
          : `The ${subjects[0]?.word ?? "page"} is protected by an auth guard.`,
        missingSummary: "No auth guard found.",
      };
    }

    case "email": {
      const sends: Pattern[] = [
        {
          re: /\b\w*send\w*e?-?mail\w*\s*\(/i,
          skipLine: /^\s*(?:export\s+)?(?:default\s+)?(?:async\s+)?(?:function|const|let|var)\s+\w*send\w*mail/i,
          why: "Calls an email-sending function.",
        },
        {
          re: /resend\.emails\.send\(|transporter\.sendMail\(|sgMail\.send\(|mailgun\.messages|postmark\w*\.send|ses\.send\(/i,
          fileMustNot: /(?:function|const)\s+\w*send\w*mail/i,
          why: "Sends through an email provider.",
        },
      ];
      return {
        ruleId: "email",
        label: "Email is sent",
        mode: forbid ? "absence" : "presence",
        scope: anyFile,
        scopeLabel: "all source files",
        supports: forbid ? [] : sends,
        conflicts: forbid ? sends : [],
        candidates: [
          {
            re: /^\s*(?:export\s+)?(?:async\s+)?(?:function|const)\s+\w*send\w*mail\w*/i,
            why: "An email helper is defined here, but defining it doesn't send anything.",
          },
        ],
        expectation: forbid
          ? "No email is sent in this flow."
          : "The flow actually calls the email sender (not just defines a helper), so the recipient gets a confirmation email.",
        uncertainty: "Static evidence of a send call only. Delivery isn't tested.",
        provenSummary: "The code calls an email sender.",
        missingSummary: "No call that sends an email was found.",
      };
    }

    case "confirmation-screen":
      return {
        ruleId: "confirmation-screen",
        label: "Confirmation screen",
        mode: "presence",
        scope: uiFiles,
        scopeLabel: "UI files",
        supports: [
          {
            re: />\s*[^<{]*\b(?:confirmed|confirmation|thank you|thanks|success(?:fully)?|you'?re (?:all )?set|booked)\b[^<]*</i,
            why: "Renders confirmation text to the user.",
          },
        ],
        weak: [
          {
            re: /router\.(?:push|replace)\(\s*[`'"][^`'"]*confirm|redirect\(\s*[`'"][^`'"]*confirm|href=["'`][^"'`]*confirm/i,
            why: "Navigates to a confirmation route, but no confirmation text was found.",
          },
        ],
        weakStatus: "unverifiable",
        weakSummary: "Navigation to a confirmation route exists, but its content couldn't be confirmed.",
        conflicts: [],
        expectation: "After a successful submission the user sees a confirmation screen with the details they submitted.",
        uncertainty: "Confirms that confirmation text is rendered. Whether it shows every detail you asked for isn't checked.",
        provenSummary: "A confirmation screen is rendered.",
        missingSummary: "No confirmation screen or message was found.",
      };

    case "persistence": {
      const write =
        /prisma\.\w+\.(?:create|upsert|createMany)\(|\.insert\(|INSERT\s+INTO|localStorage\.setItem\(|addDoc\(|setDoc\(|\.save\(\s*\)|db\.(?:insert|run|exec)\(|\.upsert\(/i;
      const label = subjects[0] ? plural(subjects[0].word) : "data";
      return {
        ruleId: "persistence",
        label: `Persists ${label}`,
        mode: "presence",
        scope: anyFile,
        scopeLabel: "all source files",
        supports: [
          subjectRe
            ? { re: write, near: subjectRe, window: 4, why: `Writes ${label} to storage.` }
            : { re: write, why: "Writes data to storage." },
        ],
        weak: subjectRe ? [{ re: write, why: `A storage write exists, but not clearly for ${label}.` }] : undefined,
        weakStatus: "unverifiable",
        weakSummary: `Storage writes exist, but none is clearly tied to ${label}.`,
        conflicts: [],
        expectation: `Every ${label} is written to persistent storage and survives a reload.`,
        uncertainty: "Static evidence of a write call. The write isn't executed.",
        provenSummary: `${label[0].toUpperCase() + label.slice(1)} are written to storage.`,
        missingSummary: `No storage write for ${label} was found.`,
      };
    }

    case "form-fields": {
      const m = text.match(/\bwith\s+([^.;]+)/i);
      const fields = (m?.[1] ?? "")
        .split(/,|\band\b|&|\//i)
        .map((f) => f.trim().replace(/^(?:a|an|the|their|his|her)\s+/i, ""))
        .map((f) => f.split(/\s+/).pop()!.toLowerCase().replace(/[^a-z]/g, ""))
        .filter((f) => f.length >= 2)
        .slice(0, 8);
      return {
        ruleId: "form-fields",
        label: "Form fields",
        mode: "each",
        scope: uiFiles,
        scopeLabel: "UI files",
        supports: [],
        conflicts: [],
        each: fields.map((f) => ({
          label: f,
          pattern: {
            re: new RegExp(`(?:\\bname|\\bid|htmlFor|register\\()\\s*=?\\s*\\{?\\s*["'\`][\\w-]*${esc(f)}[\\w-]*["'\`]`, "i"),
            why: `Form field "${f}".`,
          },
        })),
        expectation: `The form has these fields: ${fields.join(", ")}.`,
        uncertainty: "Matches form inputs by name/id. It doesn't check labels, order or validation.",
        provenSummary: `All ${fields.length} fields are present.`,
        missingSummary: "Some requested fields weren't found.",
      };
    }

    case "phone-validation": {
      const plus91 = /\+91|india/i.test(text);
      const digits = text.match(/\b(\d{1,2})\s*digits?\b/i)?.[1];
      const loose: Pattern = {
        re: /phone/i,
        near: /\.test\(|\.match\(|pattern=|z\.string\(\)|regex|valid|\\d/i,
        window: 2,
        why: plus91 || digits ? "Phone numbers are validated, but not with the rule you specified." : "Validates phone numbers.",
      };
      const strict: Pattern[] = [];
      const countRe = digits
        ? new RegExp(`\\\\d\\{(?:${Math.max(1, +digits - 1)}|${digits})(?:,${digits})?\\}|\\{${digits}\\}|length\\s*[!=]==?\\s*${digits}`)
        : /\\d\{\d+\}/;
      if (plus91) strict.push({ re: /\+91/, near: countRe, window: 2, why: "Validates the +91 prefix and the digit count." });
      else if (digits) strict.push({ re: countRe, near: /phone|tel|mobile/i, window: 3, why: `Enforces ${digits} digits.` });
      const specific = strict.length > 0;
      return {
        ruleId: "phone-validation",
        label: specific ? `Phone validation${plus91 ? " · +91" : ""}${digits ? ` · ${digits} digits` : ""}` : "Phone validation",
        mode: "presence",
        scope: anyFile,
        scopeLabel: "all source files",
        supports: specific ? strict : [loose],
        weak: specific ? [loose] : undefined,
        weakStatus: "missing",
        weakSummary: "Phone validation exists, but the specific rule you asked for isn't in it.",
        conflicts: [],
        expectation: plus91
          ? `Phone numbers must start with +91 followed by ${digits ?? "10"} digits; anything else is rejected with a message.`
          : digits
            ? `Phone numbers must have exactly ${digits} digits.`
            : "Phone numbers are validated before submission.",
        uncertainty: "Finds the validation rule in code. It isn't executed against sample numbers.",
        provenSummary: specific ? "The exact phone rule you asked for is in the code." : "Phone numbers are validated.",
        missingSummary: "No phone-number validation was found.",
      };
    }

    case "loading-state":
      return {
        ruleId: "loading-state",
        label: "Loading state",
        mode: "presence",
        scope: uiFiles,
        scopeLabel: "UI files",
        supports: [
          { re: /<\s*(?:Spinner|Loader\w*|LoadingSpinner|CircularProgress)\b|aria-busy=|animate-spin/, why: "Renders a spinner or busy indicator." },
          { re: /(?:isSubmitting|isLoading|isPending|submitting|loading|pending)\s*(?:\?|&&)/, why: "Renders a pending state while work is in progress." },
        ],
        weak: [
          { re: /disabled=\{\s*[\w.]*(?:submitting|loading|pending)/i, why: "Disables the control while submitting, but shows no indicator." },
        ],
        weakStatus: "unverifiable",
        weakSummary: "The control is disabled while submitting, but no visible loading indicator was found.",
        conflicts: [],
        expectation: "While the request is in flight, a loading indicator is visible and the submit control is disabled.",
        uncertainty: "Finds the pending-state rendering in code. Timing isn't exercised.",
        provenSummary: "A loading state is rendered while submitting.",
        missingSummary: "No loading state was found.",
      };

    case "error-handling":
      return {
        ruleId: "error-handling",
        label: "Error handling",
        mode: "presence",
        scope: anyFile,
        scopeLabel: "all source files",
        supports: [
          {
            re: /\bcatch\s*[({]|\.catch\(|if\s*\(\s*!\s*res(?:ponse)?\.ok\b/,
            near: /set\w*Error\s*\(|toast\.error|role=["']alert|error\s*&&|\{\s*error\s*\}/i,
            window: 8,
            why: "Catches the failure and shows an error to the user.",
          },
          { re: /role=["']alert["']/, near: /error/i, window: 2, why: "Renders an error message." },
        ],
        weak: [{ re: /\bcatch\s*[({]|\.catch\(/, why: "Catches errors, but no user-facing message was found nearby." }],
        weakStatus: "unverifiable",
        weakSummary: "Errors are caught, but no user-facing message was found.",
        conflicts: [],
        expectation: "When the request fails, the user sees a clear error message instead of a blank screen.",
        uncertainty: "Finds catch blocks that surface an error. Failure paths aren't exercised.",
        provenSummary: "Failures are caught and shown to the user.",
        missingSummary: "No error handling was found.",
      };

    case "dark-mode":
      return {
        ruleId: "dark-mode",
        label: "Dark mode",
        mode: forbid ? "absence" : "presence",
        scope: anyFile,
        scopeLabel: "all source files",
        supports: forbid
          ? []
          : [{ re: /setTheme\(|classList\.(?:toggle|add)\(\s*['"]dark|data-theme|next-themes/, why: "Switches between themes." }],
        conflicts: forbid ? [{ re: /setTheme\(|classList\.(?:toggle|add)\(\s*['"]dark/, why: "A theme switch is still present." }] : [],
        expectation: "Users can switch to a dark theme and the choice applies across the app.",
        uncertainty: "Finds the theme switch in code. How it looks isn't checked.",
        provenSummary: "A theme switch exists.",
        missingSummary: "No theme switch was found.",
      };

    case "responsive":
      return {
        ruleId: "responsive",
        label: "Responsive layout",
        mode: "runtime",
        scope: anyFile,
        scopeLabel: "styles and UI files",
        supports: [],
        conflicts: [],
        candidates: [
          { re: /\b(?:sm|md|lg|xl):[a-z-]+/, why: "Breakpoint-specific styles (a hint, not proof)." },
          { re: /@media\s*\(/, why: "Media query (a hint, not proof)." },
          { re: /useMediaQuery|matchMedia\(/, why: "Reacts to screen size (a hint, not proof)." },
        ],
        expectation: "The page is usable at a phone width (around 375px): no horizontal scroll, readable text, tappable controls.",
        uncertainty: "Whether a layout works on mobile can only be judged by rendering it. Open it at 375px wide.",
        provenSummary: "",
        missingSummary: "",
      };

    default:
      return genericSpec(chain, forbid);
  }
}

function genericSpec(chain: RequirementChain, forbid: boolean): CheckSpec {
  const words = [...new Set(applicableRevisions(chain).flatMap((r) => r.atom.keywords))].filter((w) => w.length >= 3);
  const candidates: Pattern[] = words.slice(0, 6).map((w) => ({
    re: new RegExp(`${esc(stem(w))}`, "i"),
    why: `Mentions "${w}". A matching name isn't proof of behavior.`,
  }));
  return {
    ruleId: "keyword-search",
    label: "Keyword search",
    mode: "presence",
    scope: anyFile,
    scopeLabel: "all source files",
    supports: [],
    conflicts: [],
    candidates,
    expectation: forbid ? `${chain.revisions.at(-1)!.atom.title}.` : `Implement: ${latestAtom(chain).title}.`,
    uncertainty:
      "No built-in rule covers this requirement, so Receipts only searched for related names. A human needs to judge the candidates.",
    provenSummary: "",
    missingSummary: "",
  };
}
