// Small date helpers shared by API routes and components. Deliberately
// dependency-light (only date-fns, already a dependency for formatting).

import { addDays, formatISO, startOfDay, subDays } from "date-fns";

/** "Now" truncated to the start of today, as a Date. */
export function today(): Date {
  return startOfDay(new Date());
}

/** ISO date (no time) for a Date, e.g. "2026-09-08". */
export function toDateOnlyISO(d: Date): string {
  return formatISO(d, { representation: "date" });
}

/** The next 14 days, as an [fromISO, toISO) datetime range starting today. */
export function next14DaysRange(): { fromISO: string; toISO: string } {
  const from = today();
  const to = addDays(from, 14);
  return { fromISO: from.toISOString(), toISO: to.toISOString() };
}

/** The next 7 days, as an [fromISO, toISO) datetime range starting today —
 * used when generating a new week of content. */
export function next7DaysRange(): { fromISO: string; toISO: string } {
  const from = today();
  const to = addDays(from, 7);
  return { fromISO: from.toISOString(), toISO: to.toISOString() };
}

/** The past 7 days, as an [fromISO, toISO) datetime range ending today —
 * used when pulling last week's performance for the report. */
export function past7DaysRange(): { fromISO: string; toISO: string } {
  const to = today();
  const from = subDays(to, 7);
  return { fromISO: from.toISOString(), toISO: to.toISOString() };
}
