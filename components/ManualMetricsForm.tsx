"use client";

import { useState } from "react";
import type { Post } from "@/lib/types";

const FIELDS: { key: MetricKey; label: string }[] = [
  { key: "views", label: "Views" },
  { key: "likes", label: "Likes" },
  { key: "comments", label: "Comments" },
  { key: "shares", label: "Shares" },
  { key: "saves", label: "Saves" },
  { key: "profileVisits", label: "Profile visits" },
  { key: "linkClicks", label: "Link clicks" },
];

type MetricKey = "views" | "likes" | "comments" | "shares" | "saves" | "profileVisits" | "linkClicks";

export interface ManualMetricInput {
  postId: string;
  platform: Post["platform"];
  caption: string;
  publishDateTime: string;
  views: number;
  likes: number;
  comments: number;
  shares: number;
  saves: number;
  profileVisits: number;
  linkClicks: number;
}

function emptyRow(post: Post): ManualMetricInput {
  return {
    postId: post.id,
    platform: post.platform,
    caption: post.caption,
    publishDateTime: post.publishDateTime,
    views: 0,
    likes: 0,
    comments: 0,
    shares: 0,
    saves: 0,
    profileVisits: 0,
    linkClicks: 0,
  };
}

/**
 * Lets the founder type in last week's numbers by hand — pulled from
 * Instagram/TikTok's own free native analytics (Insights) — when Metricool
 * isn't connected. Feeds the exact same shape into the AI report as the
 * automatic Metricool path would.
 */
export default function ManualMetricsForm({
  posts,
  onSubmit,
  submitting,
}: {
  posts: Post[];
  onSubmit: (metrics: ManualMetricInput[]) => void;
  submitting: boolean;
}) {
  const [rows, setRows] = useState<ManualMetricInput[]>(posts.map(emptyRow));

  function setValue(postId: string, key: MetricKey, value: string) {
    const num = Math.max(0, Number(value) || 0);
    setRows((prev) => prev.map((r) => (r.postId === postId ? { ...r, [key]: num } : r)));
  }

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit(rows);
      }}
    >
      <p className="text-sm text-ink/60">
        Pull these from Instagram/TikTok&apos;s own Insights for each post below (free, no Metricool
        needed), then generate the report.
      </p>

      {rows.map((row) => (
        <div key={row.postId} className="card flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <span className="badge bg-black/5 text-ink/70">{row.platform}</span>
            <span className="text-xs text-ink/40">
              {new Date(row.publishDateTime).toLocaleString("en-GB", {
                weekday: "short",
                day: "numeric",
                month: "short",
              })}
            </span>
          </div>
          <p className="text-sm text-ink/70">{row.caption}</p>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {FIELDS.map((f) => (
              <label key={f.key} className="flex flex-col gap-1 text-xs text-ink/50">
                {f.label}
                <input
                  type="number"
                  min={0}
                  className="field-input"
                  value={row[f.key] === 0 ? "" : row[f.key]}
                  placeholder="0"
                  onChange={(e) => setValue(row.postId, f.key, e.target.value)}
                />
              </label>
            ))}
          </div>
        </div>
      ))}

      <button type="submit" className="btn-primary self-start" disabled={submitting}>
        {submitting ? "Generating…" : "Generate report from these numbers"}
      </button>
    </form>
  );
}
