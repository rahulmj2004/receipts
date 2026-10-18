import type { Conversation } from "../types";

/** ILLUSTRATIVE SAMPLE conversation that produced the sample repository. */
const USER_MESSAGES: { at: string; text: string }[] = [
  {
    at: "2026-10-17T10:02:00+05:30",
    text: "I'm building a clinic booking page. Patients should be able to book without logging in. Add a booking form with name, phone and a time slot, and save every booking to the database.",
  },
  { at: "2026-10-17T10:09:00+05:30", text: "Display all appointment times in UTC." },
  {
    at: "2026-10-17T10:15:00+05:30",
    text: "After booking, show a confirmation screen with the appointment details, and send a confirmation email to the patient.",
  },
  {
    at: "2026-10-17T10:31:00+05:30",
    text: "Actually, change all displayed times to IST — our patients are in Kerala.",
  },
  { at: "2026-10-17T10:40:00+05:30", text: "Validate phone numbers." },
  { at: "2026-10-17T10:44:00+05:30", text: "Phone numbers must be Indian: +91 followed by 10 digits." },
  {
    at: "2026-10-17T10:52:00+05:30",
    text: "Remove the timezone selector, nobody needs it now. If the booking fails, show a clear error message instead of a blank screen. And make sure the page works on mobile.",
  },
  { at: "2026-10-17T10:58:00+05:30", text: "Show a loading spinner while the booking is submitting." },
  { at: "2026-10-17T11:05:00+05:30", text: "Can you open the localhost link?" },
];

export const DEMO_AGENT_CLAIM =
  "All done! ✅ I've implemented every requirement: login-free booking, IST times, a confirmation screen and email, phone validation, error handling, a loading state and full mobile support. The app is ready to ship.";

export function demoConversation(): Conversation {
  const messages = USER_MESSAGES.map((m, i) => ({
    id: `demo-${i + 1}`,
    index: i + 1,
    timestamp: m.at,
    text: m.text,
  }));
  return {
    source: "demo",
    messages,
    agentClaim: { text: DEMO_AGENT_CLAIM, id: "demo-agent-final", timestamp: "2026-10-17T11:26:00+05:30" },
    stats: { records: messages.length + 1, userMessages: messages.length, skipped: 1, malformed: 0, redactions: 0 },
  };
}
