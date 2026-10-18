import { redactSecrets } from "../redact";
import type { Conversation, SourceMessage } from "../types";

const USER_LABEL = /^\s*(?:\*\*)?(user|you|me|human|developer|dev)(?:\*\*)?\s*:\s*/i;
const AGENT_LABEL =
  /^\s*(?:\*\*)?(assistant|claude|claude code|ai|agent|copilot|cursor|chatgpt|gpt|bot|model|codex|gemini)(?:\*\*)?\s*:\s*/i;
/** Claude Code's terminal transcript marks the user's turns with "> ". */
const CC_USER = /^>\s+/;
const CC_AGENT = /^⏺\s*/;

/**
 * Accepts:
 *  - "User: … / Assistant: …" style transcripts (several common labels)
 *  - Claude Code terminal copies ("> " user turns, "⏺" agent turns)
 *  - Plain text: every blank-line-separated block is one of your messages
 */
export function parsePastedConversation(input: string): Conversation {
  const lines = input.replace(/\r\n/g, "\n").split("\n");
  const labelled = lines.some((l) => USER_LABEL.test(l) || AGENT_LABEL.test(l));
  const ccStyle = !labelled && lines.some((l) => CC_USER.test(l)) && lines.some((l) => CC_AGENT.test(l));

  type Turn = { speaker: "user" | "agent"; lines: string[] };
  const turns: Turn[] = [];

  if (labelled || ccStyle) {
    let current: Turn | null = null;
    for (const line of lines) {
      const userM = labelled ? line.match(USER_LABEL) : line.match(CC_USER);
      const agentM = labelled ? line.match(AGENT_LABEL) : line.match(CC_AGENT);
      if (userM) {
        current = { speaker: "user", lines: [line.slice(userM[0].length)] };
        turns.push(current);
      } else if (agentM) {
        current = { speaker: "agent", lines: [line.slice(agentM[0].length)] };
        turns.push(current);
      } else if (current) {
        current.lines.push(line);
      }
    }
  } else {
    for (const block of input.split(/\n\s*\n/)) {
      if (block.trim()) turns.push({ speaker: "user", lines: block.split("\n") });
    }
  }

  const messages: SourceMessage[] = [];
  let redactions = 0;
  let agentText: string | undefined;
  let skipped = 0;
  for (const t of turns) {
    const text = t.lines.join("\n").trim();
    if (!text) {
      skipped++;
      continue;
    }
    if (t.speaker === "agent") {
      agentText = text;
      skipped++;
      continue;
    }
    const r = redactSecrets(text);
    redactions += r.count;
    messages.push({ id: `msg-${messages.length + 1}`, index: messages.length + 1, text: r.text });
  }

  return {
    source: "paste",
    messages,
    agentClaim: agentText ? { text: redactSecrets(agentText).text } : undefined,
    stats: { records: turns.length, userMessages: messages.length, skipped, malformed: 0, redactions },
  };
}
