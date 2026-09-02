"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { PostMetrics } from "@/lib/types";

function truncate(text: string, n: number): string {
  return text.length > n ? `${text.slice(0, n)}…` : text;
}

export default function ReportCharts({ metrics }: { metrics: PostMetrics[] }) {
  const chartData = metrics.map((m) => ({
    label: truncate(m.caption, 22),
    Views: m.views,
    Likes: m.likes,
    Comments: m.comments,
    Shares: m.shares,
  }));

  return (
    <div className="flex flex-col gap-6">
      <div className="card">
        <h3 className="mb-4 text-sm font-semibold text-ink/70">Views &amp; engagement by post</h3>
        <div className="h-72 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} margin={{ top: 4, right: 8, left: 0, bottom: 40 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
              <XAxis dataKey="label" angle={-30} textAnchor="end" interval={0} height={70} tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip />
              <Legend />
              <Bar dataKey="Views" fill="#3b63f2" radius={[4, 4, 0, 0]} />
              <Bar dataKey="Likes" fill="#d6336c" radius={[4, 4, 0, 0]} />
              <Bar dataKey="Comments" fill="#0f1115" radius={[4, 4, 0, 0]} />
              <Bar dataKey="Shares" fill="#5f88ff" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="card overflow-x-auto">
        <h3 className="mb-4 text-sm font-semibold text-ink/70">Full breakdown</h3>
        <table className="w-full min-w-[720px] text-left text-sm">
          <thead>
            <tr className="border-b border-black/10 text-ink/50">
              <th className="py-2 pr-3 font-medium">Post</th>
              <th className="py-2 pr-3 font-medium">Platform</th>
              <th className="py-2 pr-3 font-medium">Views</th>
              <th className="py-2 pr-3 font-medium">Likes</th>
              <th className="py-2 pr-3 font-medium">Comments</th>
              <th className="py-2 pr-3 font-medium">Shares</th>
              <th className="py-2 pr-3 font-medium">Saves</th>
              <th className="py-2 pr-3 font-medium">Profile visits</th>
              <th className="py-2 pr-3 font-medium">Link clicks</th>
              <th className="py-2 font-medium">Engagement</th>
            </tr>
          </thead>
          <tbody>
            {metrics.map((m) => (
              <tr key={m.postId} className="border-b border-black/5">
                <td className="py-2 pr-3">{truncate(m.caption, 40)}</td>
                <td className="py-2 pr-3">{m.platform}</td>
                <td className="py-2 pr-3">{m.views.toLocaleString()}</td>
                <td className="py-2 pr-3">{m.likes.toLocaleString()}</td>
                <td className="py-2 pr-3">{m.comments.toLocaleString()}</td>
                <td className="py-2 pr-3">{m.shares.toLocaleString()}</td>
                <td className="py-2 pr-3">{m.saves.toLocaleString()}</td>
                <td className="py-2 pr-3">{m.profileVisits.toLocaleString()}</td>
                <td className="py-2 pr-3">{m.linkClicks.toLocaleString()}</td>
                <td className="py-2">{(m.engagementRate * 100).toFixed(1)}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
