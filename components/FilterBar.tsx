"use client";

import type { Platform, PostStatus } from "@/lib/types";

const PLATFORMS: Platform[] = ["Instagram", "TikTok", "X", "Threads"];
const STATUSES: PostStatus[] = ["draft", "approved", "scheduled", "published"];

export default function FilterBar({
  platform,
  status,
  onChange,
}: {
  platform: Platform | "";
  status: PostStatus | "";
  onChange: (next: { platform: Platform | ""; status: PostStatus | "" }) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <select
        className="field-input w-auto"
        value={platform}
        onChange={(e) => onChange({ platform: e.target.value as Platform | "", status })}
      >
        <option value="">All platforms</option>
        {PLATFORMS.map((p) => (
          <option key={p} value={p}>
            {p}
          </option>
        ))}
      </select>

      <select
        className="field-input w-auto"
        value={status}
        onChange={(e) => onChange({ platform, status: e.target.value as PostStatus | "" })}
      >
        <option value="">All statuses</option>
        {STATUSES.map((s) => (
          <option key={s} value={s} className="capitalize">
            {s}
          </option>
        ))}
      </select>

      {(platform || status) && (
        <button className="btn-secondary" onClick={() => onChange({ platform: "", status: "" })}>
          Clear filters
        </button>
      )}
    </div>
  );
}
