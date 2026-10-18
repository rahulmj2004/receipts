/** Verbs that open a product instruction ("add…", "remove…", "show…"). */
export const ACTION_VERBS = [
  "add", "use", "make", "remove", "delete", "drop", "change", "switch", "replace", "display", "show",
  "hide", "render", "create", "build", "implement", "include", "support", "send", "store", "save",
  "persist", "validate", "handle", "keep", "set", "update", "fix", "move", "put", "place", "rename",
  "convert", "allow", "let", "prevent", "block", "disable", "enable", "require", "restrict", "limit",
  "format", "sort", "filter", "highlight", "redirect", "log", "cache", "load", "fetch", "center",
  "align", "increase", "decrease", "reduce", "shrink", "enlarge", "style", "color", "colour", "animate",
  "translate", "localize", "integrate", "connect", "track", "notify", "email", "alert", "warn",
  "return", "accept", "reject", "wrap", "split", "merge", "combine", "extract", "generate", "export",
  "import", "upload", "download", "compress", "optimize", "refactor", "write", "document", "stop",
  "avoid", "ensure", "get", "turn", "insert", "append", "attach", "embed", "group", "paginate",
  "rate-limit", "throttle", "retry", "auto-save", "autosave", "list", "link", "mark", "flag", "default",
  "round", "trim", "truncate", "lowercase", "uppercase", "capitalize", "swap", "ditch", "eliminate",
  "strip", "clean", "reset", "clear", "toggle", "expose", "schedule", "remind", "confirm", "greet",
  "welcome", "redesign", "simplify", "shorten", "lengthen", "widen", "narrow", "darken", "lighten",
];

/** Requests about running the session rather than about the product. */
export const OPERATIONAL_VERBS = [
  "open", "run", "start", "launch", "deploy", "commit", "push", "pull", "give", "tell", "explain",
  "check", "look", "see", "try", "continue", "proceed", "do", "go", "wait", "install", "restart",
  "show me", "describe", "summarize", "review", "read", "test", "debug", "help", "thanks", "thank",
];

export const FORBID_VERBS = new Set([
  "remove", "delete", "drop", "hide", "disable", "prevent", "block", "stop", "avoid", "ditch",
  "eliminate", "strip",
]);

export const STOPWORDS = new Set(
  (
    "a an the and or but if then else when while of to in on at by for with from into onto over under " +
    "is are was were be been being it its this that these those there here i me my we our you your they " +
    "them their he she his her as so than too very can could would should will shall must may might do " +
    "does did done not no yes all any each every some just also only more most less least up down out " +
    "about after before again once please pls plz ok okay now new old one two etc like make sure ensure " +
    "really actually instead rather need needs want wants able nobody anybody everything something " +
    "thing things way still even same other another clear properly correctly always never via " +
    "without followed logging logged"
  ).split(" "),
);

export interface ConceptDef {
  id: string;
  re: RegExp;
}

/** Order matters: the first match wins, so specific concepts come before broad ones. */
export const CONCEPTS: ConceptDef[] = [
  {
    id: "timezone-selector",
    re: /time[\s-]?zone\w*\s+(?:select\w*|picker|dropdown|drop-down|switch\w*|toggle|chooser|menu)|(?:select\w*|picker|dropdown)\s+(?:for\s+)?(?:the\s+)?time[\s-]?zones?/i,
  },
  { id: "phone-validation", re: /\b(?:phone|mobile)\s*(?:numbers?|no\.?|nos)\b|\+91|\b\d{1,2}\s*digits?\b/i },
  { id: "form-fields", re: /\bform\b[^.]*?\bwith\b/i },
  {
    id: "email",
    re: /\b(?:send|sends|sending|notify)\b[^.]*\be-?mails?\b|\be-?mails?\b[^.]*\b(?:confirm\w*|receipt|notif\w*)\b|\b(?:confirm\w*|welcome|receipt|notification)\s+e-?mails?\b/i,
  },
  {
    id: "confirmation-screen",
    re: /\b(?:confirm\w*|success|thank[\s-]?you)\s+(?:screen|page|view|message|step|modal|state)\b/i,
  },
  {
    id: "timezone",
    re: /\b(?:utc|gmt|ist|indian standard time|time[\s-]?zones?|asia\/kolkata|pst|pdt|est|edt|cet|bst|jst|aest|local time)\b/i,
  },
  {
    id: "auth",
    re: /\b(?:log(?:ging)?[\s-]?(?:in|on)|login|sign(?:ing)?[\s-]?(?:in|up)|signin|signup|auth\w*|accounts?|passwords?)\b/i,
  },
  { id: "loading-state", re: /\b(?:loading|spinner|skeleton)\b|\bwhile\b[^.]*\b(?:submitting|saving|loading)\b/i },
  { id: "error-handling", re: /\b(?:errors?|fails?|failures?|failed|exceptions?|gracefully)\b/i },
  {
    id: "persistence",
    re: /\b(?:persist\w*|database|db|save[sd]?|saving|store[sd]?|storage|localstorage|local storage)\b/i,
  },
  { id: "dark-mode", re: /\b(?:dark|light)\s*(?:mode|theme)\b/i },
  { id: "responsive", re: /\b(?:responsive|mobile|small screens?|tablets?|phones?)\b/i },
];

export const TIMEZONES: Record<string, { label: string; iana: string[]; offset?: RegExp }> = {
  IST: { label: "IST (Asia/Kolkata)", iana: ["Asia/Kolkata", "Asia/Calcutta"], offset: /\+05:?30/ },
  UTC: { label: "UTC", iana: ["UTC", "Etc/UTC", "GMT"] },
  PST: { label: "Pacific time", iana: ["America/Los_Angeles"] },
  EST: { label: "Eastern time", iana: ["America/New_York"] },
  CET: { label: "Central European time", iana: ["Europe/Berlin", "Europe/Paris", "CET"] },
  BST: { label: "UK time", iana: ["Europe/London"] },
  JST: { label: "Japan time", iana: ["Asia/Tokyo"] },
  AEST: { label: "Sydney time", iana: ["Australia/Sydney"] },
};

export function timezoneValue(text: string): string | undefined {
  const t = text.toLowerCase();
  if (/\bist\b|indian standard time|asia\/kolkata/.test(t)) return "IST";
  if (/\butc\b|\bgmt\b/.test(t)) return "UTC";
  if (/\bpst\b|\bpdt\b|pacific time/.test(t)) return "PST";
  if (/\best\b|\bedt\b|eastern time/.test(t)) return "EST";
  if (/\bcet\b/.test(t)) return "CET";
  if (/\bbst\b/.test(t)) return "BST";
  if (/\bjst\b/.test(t)) return "JST";
  if (/\baest\b/.test(t)) return "AEST";
  return undefined;
}
