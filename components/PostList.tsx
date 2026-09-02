"use client";

import { format, isToday, isTomorrow, parseISO } from "date-fns";
import type { EditablePostFields, Post } from "@/lib/types";
import PostCard from "./PostCard";

function dayLabel(iso: string): string {
  const d = parseISO(iso);
  if (isToday(d)) return `Today — ${format(d, "EEEE d MMM")}`;
  if (isTomorrow(d)) return `Tomorrow — ${format(d, "EEEE d MMM")}`;
  return format(d, "EEEE d MMM");
}

export default function PostList({
  posts,
  onUpdate,
}: {
  posts: Post[];
  onUpdate: (id: string, fields: EditablePostFields) => Promise<void>;
}) {
  if (posts.length === 0) {
    return (
      <div className="card text-center text-sm text-ink/50">
        No posts in this range yet. Click “Generate Week” to create the next 7 days of content.
      </div>
    );
  }

  const groups = new Map<string, Post[]>();
  for (const post of posts) {
    const dayKey = post.publishDateTime ? post.publishDateTime.slice(0, 10) : "unscheduled";
    if (!groups.has(dayKey)) groups.set(dayKey, []);
    groups.get(dayKey)!.push(post);
  }

  const orderedDays = Array.from(groups.keys()).sort();

  return (
    <div className="flex flex-col gap-6">
      {orderedDays.map((dayKey) => (
        <section key={dayKey} className="flex flex-col gap-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-ink/50">
            {dayKey === "unscheduled" ? "Unscheduled" : dayLabel(groups.get(dayKey)![0].publishDateTime)}
          </h2>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {groups.get(dayKey)!.map((post) => (
              <PostCard key={post.id} post={post} onUpdate={onUpdate} />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
