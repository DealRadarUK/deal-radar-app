// PATCH /api/posts/[id]
//
// Applies an inline edit (hook/caption/hashtags/publishDateTime/notes) and/or
// a status change. The one bit of magic: when this PATCH is the thing that
// moves a post from anything else INTO "approved", and Metricool is
// connected (see isMetricoolConfigured), we automatically call Metricool to
// create the scheduled draft, then flip status to "scheduled" on success.
// On failure, per spec, we leave status as "approved" (not "scheduled") and
// write the error into Notes so the founder can see what went wrong without
// the request itself failing.
//
// Metricool is entirely optional — its API needs their paid Advanced plan.
// If it isn't configured, approving a post just marks it "approved" with a
// one-line note that scheduling needs to be done by hand (Metricool's free
// plan's own scheduler, or posting directly in the Instagram/TikTok apps).
// Nothing errors, and there's no repeated "missing config" noise.
//
// Deliberately does NOT re-fire Metricool on every subsequent edit to an
// already-approved/scheduled post — only on the actual draft -> approved
// transition — so re-tweaking a caption later doesn't create duplicate
// drafts in Metricool.

import { NextRequest, NextResponse } from "next/server";
import { getPost, updatePost } from "@/lib/airtable";
import { createScheduledPost, isMetricoolConfigured, MetricoolError } from "@/lib/metricool";
import type { EditablePostFields } from "@/lib/types";

function withNote(existing: string | undefined, line: string): string {
  const timestamped = `[${new Date().toISOString()}] ${line}`;
  return existing ? `${existing}\n${timestamped}` : timestamped;
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const { id } = params;

  try {
    const body = (await req.json()) as EditablePostFields;

    const before = await getPost(id);
    const isNewlyApproved = body.status === "approved" && before.status !== "approved";

    let updated = await updatePost(id, body);

    if (isNewlyApproved) {
      if (!isMetricoolConfigured()) {
        updated = await updatePost(id, {
          notes: withNote(updated.notes, "Approved. Metricool isn't connected — schedule this one by hand."),
        });
      } else {
        try {
          await createScheduledPost(updated);
          updated = await updatePost(id, { status: "scheduled" });
        } catch (err) {
          const message = err instanceof MetricoolError ? err.message : `Unexpected error: ${err}`;
          updated = await updatePost(id, {
            notes: withNote(updated.notes, `Metricool scheduling failed — status left as "approved". ${message}`),
          });
          // Note: we intentionally return 200 here, not 500 — the edit/approve
          // itself succeeded; only the downstream Metricool call failed, and
          // that's now visible to the founder in the Notes field.
        }
      }
    }

    return NextResponse.json({ post: updated });
  } catch (err) {
    console.error(`[PATCH /api/posts/${id}]`, err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown error updating post." },
      { status: 500 }
    );
  }
}
