import type { RepoFile } from "../types";

/**
 * ILLUSTRATIVE SAMPLE. A small clinic-booking app in two commits:
 *   a1f3c9e — the commit the agent reported as "all done"
 *   7be21d4 — the commit made after pasting Receipts' fix prompt
 * The gaps are deliberate, and every classification can be checked against these files.
 */

const middlewareV1 = `import { NextResponse, type NextRequest } from "next/server";

export function middleware(request: NextRequest) {
  const session = request.cookies.get("session");
  if (!session) {
    return NextResponse.redirect(new URL("/login", request.url));
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/book/:path*", "/dashboard/:path*"],
};
`;

const middlewareV2 = middlewareV1.replace(`["/book/:path*", "/dashboard/:path*"]`, `["/dashboard/:path*"]`);

const bookPageV1 = `import { BookingForm } from "@/components/BookingForm";
import { requireAuth } from "@/lib/auth";

export default async function BookPage() {
  await requireAuth();

  return (
    <main className="mx-auto max-w-xl px-4 py-10 sm:px-6">
      <h1 className="text-2xl font-semibold">Book an appointment</h1>
      <p className="mt-1 text-sm text-gray-500">Pick a slot that works for you.</p>
      <BookingForm />
    </main>
  );
}
`;

const bookPageV2 = `import { BookingForm } from "@/components/BookingForm";

export default function BookPage() {
  return (
    <main className="mx-auto max-w-xl px-4 py-10 sm:px-6">
      <h1 className="text-2xl font-semibold">Book an appointment</h1>
      <p className="mt-1 text-sm text-gray-500">Pick a slot that works for you.</p>
      <BookingForm />
    </main>
  );
}
`;

const bookingFormV1 = `"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { TimezoneSelect } from "./TimezoneSelect";
import { formatSlot, SLOTS } from "@/lib/time";

const PHONE_PATTERN = /^\\d{10}$/;

export function BookingForm() {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [timezone, setTimezone] = useState("UTC");

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(event.currentTarget));
    if (!PHONE_PATTERN.test(String(data.phone))) {
      setError("Enter a valid 10-digit phone number.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/bookings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error("Booking failed");
      const booking = await res.json();
      router.push(\`/book/confirmed?id=\${booking.id}\`);
    } catch {
      setError("We couldn't save your booking. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="mt-6 grid gap-4 sm:grid-cols-2">
      <label className="grid gap-1 text-sm">
        Full name
        <input name="name" required className="rounded border px-3 py-2" />
      </label>
      <label className="grid gap-1 text-sm">
        Phone
        <input name="phone" type="tel" required className="rounded border px-3 py-2" />
      </label>
      <label className="grid gap-1 text-sm sm:col-span-2">
        Time slot
        <select name="slot" required className="rounded border px-3 py-2">
          {SLOTS.map((slot) => (
            <option key={slot} value={slot}>
              {formatSlot(slot)}
            </option>
          ))}
        </select>
      </label>
      <TimezoneSelect value={timezone} onChange={setTimezone} />
      {error && (
        <p role="alert" className="text-sm text-red-600 sm:col-span-2">
          {error}
        </p>
      )}
      <button
        type="submit"
        disabled={submitting}
        className="rounded bg-teal-700 px-4 py-2 text-white sm:col-span-2"
      >
        {submitting ? <Spinner /> : "Book appointment"}
      </button>
    </form>
  );
}

function Spinner() {
  return <span aria-busy="true" className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />;
}
`;

const bookingFormV2 = `"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { formatSlot, SLOTS } from "@/lib/time";

const PHONE_PATTERN = /^\\+91[6-9]\\d{9}$/;

export function BookingForm() {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(event.currentTarget));
    if (!PHONE_PATTERN.test(String(data.phone))) {
      setError("Enter an Indian mobile number: +91 followed by 10 digits.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/bookings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error("Booking failed");
      const booking = await res.json();
      router.push(\`/book/confirmed?id=\${booking.id}\`);
    } catch {
      setError("We couldn't save your booking. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="mt-6 grid gap-4 sm:grid-cols-2">
      <label className="grid gap-1 text-sm">
        Full name
        <input name="name" required className="rounded border px-3 py-2" />
      </label>
      <label className="grid gap-1 text-sm">
        Phone
        <input name="phone" type="tel" placeholder="+91" required className="rounded border px-3 py-2" />
      </label>
      <label className="grid gap-1 text-sm sm:col-span-2">
        Email
        <input name="email" type="email" required className="rounded border px-3 py-2" />
      </label>
      <label className="grid gap-1 text-sm sm:col-span-2">
        Time slot
        <select name="slot" required className="rounded border px-3 py-2">
          {SLOTS.map((slot) => (
            <option key={slot} value={slot}>
              {formatSlot(slot)}
            </option>
          ))}
        </select>
      </label>
      {error && (
        <p role="alert" className="text-sm text-red-600 sm:col-span-2">
          {error}
        </p>
      )}
      <button
        type="submit"
        disabled={submitting}
        className="rounded bg-teal-700 px-4 py-2 text-white sm:col-span-2"
      >
        {submitting ? <Spinner /> : "Book appointment"}
      </button>
    </form>
  );
}

function Spinner() {
  return <span aria-busy="true" className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />;
}
`;

const timezoneSelect = `"use client";

const ZONES = ["UTC", "Asia/Kolkata", "Europe/London", "America/New_York"];

export function TimezoneSelect({ value, onChange }: { value: string; onChange: (tz: string) => void }) {
  return (
    <label className="grid gap-1 text-sm sm:col-span-2">
      Time zone
      <select name="timezone" value={value} onChange={(e) => onChange(e.target.value)} className="rounded border px-3 py-2">
        {ZONES.map((zone) => (
          <option key={zone}>{zone}</option>
        ))}
      </select>
    </label>
  );
}
`;

const routeV1 = `import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function POST(request: Request) {
  const body = await request.json();
  if (!body.name || !body.phone || !body.slot) {
    return NextResponse.json({ error: "Missing fields" }, { status: 400 });
  }

  const booking = await prisma.booking.create({
    data: { name: body.name, phone: body.phone, slot: new Date(body.slot) },
  });

  return NextResponse.json(booking, { status: 201 });
}
`;

const routeV2 = `import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { sendConfirmationEmail } from "@/lib/email";

export async function POST(request: Request) {
  const body = await request.json();
  if (!body.name || !body.phone || !body.email || !body.slot) {
    return NextResponse.json({ error: "Missing fields" }, { status: 400 });
  }

  const booking = await prisma.booking.create({
    data: { name: body.name, phone: body.phone, email: body.email, slot: new Date(body.slot) },
  });
  await sendConfirmationEmail(booking);

  return NextResponse.json(booking, { status: 201 });
}
`;

const confirmedPage = `import { prisma } from "@/lib/db";
import { formatSlot } from "@/lib/time";

export default async function ConfirmedPage({ searchParams }: { searchParams: Promise<{ id?: string }> }) {
  const { id } = await searchParams;
  const booking = id ? await prisma.booking.findUnique({ where: { id } }) : null;

  if (!booking) {
    return <p className="p-10 text-center">We couldn&apos;t find that booking.</p>;
  }

  return (
    <main className="mx-auto max-w-xl px-4 py-10">
      <h1 className="text-2xl font-semibold">Booking confirmed</h1>
      <dl className="mt-6 grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-sm">
        <dt>Name</dt>
        <dd>{booking.name}</dd>
        <dt>Time</dt>
        <dd>{formatSlot(booking.slot)}</dd>
      </dl>
    </main>
  );
}
`;

const timeV1 = `export const SLOTS = [
  "2026-10-20T03:30:00.000Z",
  "2026-10-20T05:00:00.000Z",
  "2026-10-20T08:30:00.000Z",
];

export function formatSlot(value: string | Date) {
  return new Date(value).toLocaleString("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "UTC",
  });
}
`;

const timeV2 = timeV1.replace(`timeZone: "UTC"`, `timeZone: "Asia/Kolkata"`);

const emailLib = `import { Resend } from "resend";
import { formatSlot } from "./time";

const resend = new Resend(process.env.RESEND_API_KEY);

export async function sendConfirmationEmail(booking: { email: string; name: string; slot: Date }) {
  await resend.emails.send({
    from: "Clinic <bookings@example.clinic>",
    to: booking.email,
    subject: "Your appointment is confirmed",
    html: \`<p>Hi \${booking.name}, your appointment is at \${formatSlot(booking.slot)}.</p>\`,
  });
}
`;

const authLib = `import { cookies } from "next/headers";
import { redirect } from "next/navigation";

export async function requireAuth() {
  const session = (await cookies()).get("session");
  if (!session) redirect("/login");
  return session;
}
`;

const dbLib = `import { PrismaClient } from "@prisma/client";

export const prisma = new PrismaClient();
`;

const schemaV1 = `model Booking {
  id        String   @id @default(cuid())
  name      String
  phone     String
  slot      DateTime
  createdAt DateTime @default(now())
}
`;

const schemaV2 = schemaV1.replace("  phone     String\n", "  phone     String\n  email     String\n");

const readme = `# Clinic booking

Status: all requirements implemented ✅

Book an appointment at /book.
`;

export interface Snapshot {
  id: string;
  sha: string;
  message: string;
  description: string;
  files: RepoFile[];
}

export const SNAPSHOTS: Snapshot[] = [
  {
    id: "v1",
    sha: "a1f3c9e",
    message: "feat: clinic booking flow",
    description: "The commit the agent reported as complete.",
    files: [
      { path: "README.md", content: readme },
      { path: "prisma/schema.prisma", content: schemaV1 },
      { path: "src/middleware.ts", content: middlewareV1 },
      { path: "src/app/book/page.tsx", content: bookPageV1 },
      { path: "src/app/book/confirmed/page.tsx", content: confirmedPage },
      { path: "src/app/api/bookings/route.ts", content: routeV1 },
      { path: "src/components/BookingForm.tsx", content: bookingFormV1 },
      { path: "src/components/TimezoneSelect.tsx", content: timezoneSelect },
      { path: "src/lib/auth.ts", content: authLib },
      { path: "src/lib/db.ts", content: dbLib },
      { path: "src/lib/email.ts", content: emailLib },
      { path: "src/lib/time.ts", content: timeV1 },
    ],
  },
  {
    id: "v2",
    sha: "7be21d4",
    message: "fix: login-free booking, IST, +91 validation, send confirmation email",
    description: "The commit made after pasting the fix prompt into the agent.",
    files: [
      { path: "README.md", content: readme },
      { path: "prisma/schema.prisma", content: schemaV2 },
      { path: "src/middleware.ts", content: middlewareV2 },
      { path: "src/app/book/page.tsx", content: bookPageV2 },
      { path: "src/app/book/confirmed/page.tsx", content: confirmedPage },
      { path: "src/app/api/bookings/route.ts", content: routeV2 },
      { path: "src/components/BookingForm.tsx", content: bookingFormV2 },
      { path: "src/lib/auth.ts", content: authLib },
      { path: "src/lib/db.ts", content: dbLib },
      { path: "src/lib/email.ts", content: emailLib },
      { path: "src/lib/time.ts", content: timeV2 },
    ],
  },
];

export function snapshotById(id: string): Snapshot {
  return SNAPSHOTS.find((s) => s.id === id) ?? SNAPSHOTS[0];
}

/** Files changed between two snapshots, for the rerun dialog. */
export function changedFiles(from: Snapshot, to: Snapshot): { path: string; change: "added" | "removed" | "modified" }[] {
  const a = new Map(from.files.map((f) => [f.path, f.content]));
  const b = new Map(to.files.map((f) => [f.path, f.content]));
  const out: { path: string; change: "added" | "removed" | "modified" }[] = [];
  for (const [p, c] of b) {
    if (!a.has(p)) out.push({ path: p, change: "added" });
    else if (a.get(p) !== c) out.push({ path: p, change: "modified" });
  }
  for (const p of a.keys()) if (!b.has(p)) out.push({ path: p, change: "removed" });
  return out.sort((x, y) => x.path.localeCompare(y.path));
}
