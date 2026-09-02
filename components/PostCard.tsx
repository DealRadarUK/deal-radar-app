"use client";

import { useState } from "react";
import type { EditablePostFields, Post, PostStatus } from "@/lib/types";
import PlatformBadge from "./PlatformBadge";
import StatusBadge from "./StatusBadge";

const NEXT_STATUSES: Record<PostStatus, PostStatus[]> = {
  draft: ["draft", "approved"],
  approved: ["approved", "scheduled", "published"],
  scheduled: ["scheduled", "published"],
  published: ["published"],
};

function toDatetimeLocal(iso: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function PostCard({
  post,
  onUpdate,
}: {
  post: Post;
  onUpdate: (id: string, fields: EditablePostFields) => Promise<void>;
}) {
  const [hook, setHook] = useState(post.hook);
  const [caption, setCaption] = useState(post.caption);
  const [hashtags, setHashtags] = useState(post.hashtags);
  const [publishAt, setPublishAt] = useState(toDatetimeLocal(post.publishDateTime));
  const [saving, setSaving] = useState(false);
  const [scriptOpen, setScriptOpen] = useState(false);

  async function save(fields: EditablePostFields) {
    setSaving(true);
    try {
      await onUpdate(post.id, fields);
    } finally {
      setSaving(false);
    }
  }

  const isDraft = post.status === "draft";

  return (
    <div className="card flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <PlatformBadge platform={post.platform} />
          <span className="badge bg-black/5 text-ink/70">{post.format}</span>
          <span className="badge bg-black/5 text-ink/70">{post.topic}</span>
        </div>
        <div className="flex items-center gap-2">
          {saving && <span className="text-xs text-ink/40">Saving…</span>}
          <StatusBadge status={post.status} />
        </div>
      </div>

      <input
        className="field-input font-semibold"
        value={hook}
        onChange={(e) => setHook(e.target.value)}
        onBlur={() => hook !== post.hook && save({ hook })}
        aria-label="Hook"
      />

      {post.script && (
        <div className="rounded-md bg-black/[0.03] px-3 py-2 text-sm">
          <button
            className="font-medium text-ink/70 hover:text-ink"
            onClick={() => setScriptOpen((v) => !v)}
          >
            {scriptOpen ? "▾" : "▸"} Script / shot list
          </button>
          {scriptOpen && <p className="mt-2 whitespace-pre-wrap text-ink/70">{post.script}</p>}
        </div>
      )}

      <textarea
        className="field-textarea"
        rows={3}
        value={caption}
        onChange={(e) => setCaption(e.target.value)}
        onBlur={() => caption !== post.caption && save({ caption })}
        aria-label="Caption"
      />

      <input
        className="field-input text-brand-700"
        value={hashtags}
        onChange={(e) => setHashtags(e.target.value)}
        onBlur={() => hashtags !== post.hashtags && save({ hashtags })}
        aria-label="Hashtags"
      />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <label className="flex items-center gap-2 text-sm text-ink/60">
          Publish
          <input
            type="datetime-local"
            className="field-input w-auto"
            value={publishAt}
            onChange={(e) => {
              setPublishAt(e.target.value);
              const iso = new Date(e.target.value).toISOString();
              save({ publishDateTime: iso });
            }}
          />
        </label>

        <div className="flex items-center gap-2">
          {isDraft ? (
            <button className="btn-success" onClick={() => save({ status: "approved" })} disabled={saving}>
              ✓ Approve
            </button>
          ) : (
            <select
              className="field-input w-auto capitalize"
              value={post.status}
              onChange={(e) => save({ status: e.target.value as PostStatus })}
              disabled={saving}
            >
              {NEXT_STATUSES[post.status].map((s) => (
                <option key={s} value={s} className="capitalize">
                  {s}
                </option>
              ))}
            </select>
          )}
        </div>
      </div>

      {post.videoLink && (
        <a
          href={post.videoLink}
          target="_blank"
          rel="noreferrer"
          className="text-xs text-brand-600 hover:underline"
        >
          Video file →
        </a>
      )}

      {post.notes && (
        <p className="rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-800">{post.notes}</p>
      )}
    </div>
  );
}
