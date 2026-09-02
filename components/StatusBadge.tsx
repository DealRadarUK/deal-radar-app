import type { PostStatus } from "@/lib/types";

const STYLES: Record<PostStatus, string> = {
  draft: "bg-amber-50 text-amber-700",
  approved: "bg-blue-50 text-blue-700",
  scheduled: "bg-violet-50 text-violet-700",
  published: "bg-emerald-50 text-emerald-700",
};

export default function StatusBadge({ status }: { status: PostStatus }) {
  return <span className={`badge capitalize ${STYLES[status]}`}>{status}</span>;
}
