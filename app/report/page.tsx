"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { format, parseISO } from "date-fns";
import ReportCharts from "@/components/ReportCharts";
import ManualMetricsForm, { type ManualMetricInput } from "@/components/ManualMetricsForm";
import type { Post, WeeklyReport } from "@/lib/types";

export default function ReportPage() {
  const [metricoolConfigured, setMetricoolConfigured] = useState<boolean | null>(null);
  const [lastWeekPosts, setLastWeekPosts] = useState<Post[] | null>(null);
  const [loadingPosts, setLoadingPosts] = useState(false);

  const [report, setReport] = useState<WeeklyReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/status")
      .then((res) => res.json())
      .then((data) => setMetricoolConfigured(Boolean(data.metricoolConfigured)))
      .catch(() => setMetricoolConfigured(false));
  }, []);

  async function runReport(body?: { manualMetrics: ManualMetricInput[] }) {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/generate-report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body ?? {}),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to generate report.");
      setReport(data.report);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to generate report.");
    } finally {
      setLoading(false);
    }
  }

  async function handleLoadLastWeek() {
    setLoadingPosts(true);
    setError(null);
    try {
      const res = await fetch("/api/posts/last-week");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to load last week's posts.");
      if (data.posts.length === 0) {
        setError("No posts found in the last 7 days to report on yet.");
        return;
      }
      setLastWeekPosts(data.posts);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load last week's posts.");
    } finally {
      setLoadingPosts(false);
    }
  }

  const mailtoHref = report
    ? (() => {
        const to = process.env.NEXT_PUBLIC_REPORT_EMAIL_TO ?? "";
        const subject = encodeURIComponent(
          `Deal Radar UK — weekly report (${format(parseISO(report.rangeStart), "d MMM")}–${format(
            parseISO(report.rangeEnd),
            "d MMM"
          )})`
        );
        const body = encodeURIComponent(
          `${report.summary}\n\nRecommendations for next week:\n${report.recommendations
            .map((r, i) => `${i + 1}. ${r}`)
            .join("\n")}`
        );
        return `mailto:${to}?subject=${subject}&body=${body}`;
      })()
    : "#";

  return (
    <main className="flex flex-col gap-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Weekly report</h1>
          <p className="text-sm text-ink/50">Last 7 days of Instagram &amp; TikTok performance</p>
        </div>
        <div className="flex items-center gap-3">
          <Link href="/" className="btn-secondary">
            ← Content desk
          </Link>
          {metricoolConfigured && (
            <button className="btn-primary" onClick={() => runReport()} disabled={loading}>
              {loading ? "Generating…" : "📊 Generate Report"}
            </button>
          )}
        </div>
      </header>

      {error && <div className="card border-red-200 bg-red-50 text-sm text-red-700">{error}</div>}

      {metricoolConfigured === false && !report && (
        <div className="flex flex-col gap-4">
          <div className="card text-sm text-ink/60">
            Metricool isn&apos;t connected, so numbers can&apos;t be pulled automatically yet. Enter last
            week&apos;s figures by hand instead — free in Instagram/TikTok&apos;s own Insights — and you&apos;ll
            still get the same AI summary and recommendations.
          </div>

          {!lastWeekPosts && (
            <button className="btn-primary self-start" onClick={handleLoadLastWeek} disabled={loadingPosts}>
              {loadingPosts ? "Loading…" : "Load last week's posts"}
            </button>
          )}

          {lastWeekPosts && (
            <ManualMetricsForm
              posts={lastWeekPosts}
              submitting={loading}
              onSubmit={(manualMetrics) => runReport({ manualMetrics })}
            />
          )}
        </div>
      )}

      {metricoolConfigured === true && !report && !loading && !error && (
        <div className="card text-center text-sm text-ink/50">
          Click “Generate Report” to pull last week’s Metricool performance and get an AI summary.
        </div>
      )}

      {report && (
        <div className="flex flex-col gap-6">
          <div className="card flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-ink/70">Summary</h2>
              <a href={mailtoHref} className="text-xs font-medium text-brand-600 hover:underline">
                Email this report →
              </a>
            </div>
            {report.summary.split("\n\n").map((para, i) => (
              <p key={i} className="text-sm leading-relaxed text-ink/80">
                {para}
              </p>
            ))}
          </div>

          <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
            <div className="card">
              <h2 className="mb-3 text-sm font-semibold text-ink/70">Top posts</h2>
              <ul className="flex flex-col gap-2 text-sm">
                {report.topPosts.map((tp, i) => (
                  <li key={i} className="rounded-md bg-black/[0.03] px-3 py-2">
                    <span className="font-medium">#{i + 1}</span> — {tp.reason}
                  </li>
                ))}
              </ul>
            </div>

            <div className="card">
              <h2 className="mb-3 text-sm font-semibold text-ink/70">Best hooks, formats &amp; times</h2>
              <ul className="flex list-disc flex-col gap-1.5 pl-4 text-sm text-ink/80">
                {report.bestHooksFormatsTimes.map((line, i) => (
                  <li key={i}>{line}</li>
                ))}
              </ul>
            </div>
          </div>

          <div className="card">
            <h2 className="mb-3 text-sm font-semibold text-ink/70">Recommendations for next week</h2>
            <ol className="flex flex-col gap-2 text-sm">
              {report.recommendations.map((rec, i) => (
                <li key={i} className="flex gap-3 rounded-md bg-brand-50 px-3 py-2 text-brand-900">
                  <span className="font-semibold">{i + 1}.</span>
                  <span>{rec}</span>
                </li>
              ))}
            </ol>
          </div>

          <ReportCharts metrics={report.metrics} />
        </div>
      )}
    </main>
  );
}
