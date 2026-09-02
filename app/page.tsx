"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import GenerateWeekButton from "@/components/GenerateWeekButton";
import FilterBar from "@/components/FilterBar";
import PostList from "@/components/PostList";
import type { EditablePostFields, Platform, Post, PostStatus } from "@/lib/types";

export default function DashboardPage() {
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [platform, setPlatform] = useState<Platform | "">("");
  const [status, setStatus] = useState<PostStatus | "">("");

  const fetchPosts = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ days: "14" });
      if (platform) params.set("platform", platform);
      if (status) params.set("status", status);

      const res = await fetch(`/api/posts?${params.toString()}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to load posts.");
      setPosts(data.posts);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load posts.");
    } finally {
      setLoading(false);
    }
  }, [platform, status]);

  useEffect(() => {
    fetchPosts();
  }, [fetchPosts]);

  async function handleGenerateWeek() {
    setGenerating(true);
    setError(null);
    try {
      const res = await fetch("/api/generate-week", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to generate week.");
      await fetchPosts();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to generate week.");
    } finally {
      setGenerating(false);
    }
  }

  async function handleUpdate(id: string, fields: EditablePostFields) {
    const res = await fetch(`/api/posts/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(fields),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error ?? "Failed to save change.");
      return;
    }
    setPosts((prev) => prev.map((p) => (p.id === id ? data.post : p)));
  }

  return (
    <main className="flex flex-col gap-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Deal Radar UK</h1>
          <p className="text-sm text-ink/50">Content desk — next 14 days</p>
        </div>
        <div className="flex items-center gap-3">
          <Link href="/report" className="btn-secondary">
            Weekly report →
          </Link>
          <GenerateWeekButton onClick={handleGenerateWeek} loading={generating} />
        </div>
      </header>

      <FilterBar
        platform={platform}
        status={status}
        onChange={(next) => {
          setPlatform(next.platform);
          setStatus(next.status);
        }}
      />

      {error && (
        <div className="card border-red-200 bg-red-50 text-sm text-red-700">{error}</div>
      )}

      {loading ? (
        <div className="card text-center text-sm text-ink/50">Loading posts…</div>
      ) : (
        <PostList posts={posts} onUpdate={handleUpdate} />
      )}
    </main>
  );
}
