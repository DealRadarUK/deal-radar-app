import type { Platform } from "@/lib/types";

const STYLES: Record<Platform, string> = {
  Instagram: "bg-pink-50 text-pink-700",
  TikTok: "bg-slate-100 text-slate-800",
  X: "bg-neutral-100 text-neutral-800",
  Threads: "bg-zinc-100 text-zinc-700",
};

export default function PlatformBadge({ platform }: { platform: Platform }) {
  return <span className={`badge ${STYLES[platform] ?? "bg-gray-100 text-gray-700"}`}>{platform}</span>;
}
