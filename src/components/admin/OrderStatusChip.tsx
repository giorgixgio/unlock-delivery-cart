import { statusBadge, type BadgeTone } from "@/lib/queueSearchRules";

const TONE_CLS: Record<BadgeTone, string> = {
  blue: "bg-blue-100 text-blue-800 border-blue-300",
  orange: "bg-orange-100 text-orange-800 border-orange-300",
  amber: "bg-amber-100 text-amber-800 border-amber-300",
  sky: "bg-sky-100 text-sky-800 border-sky-300",
  green: "bg-emerald-100 text-emerald-800 border-emerald-300",
  red: "bg-red-100 text-red-800 border-red-300",
  purple: "bg-purple-100 text-purple-800 border-purple-300",
  gray: "bg-muted text-muted-foreground border-border",
};

/** Our order status as a colored badge (same wording in the Call Queue and the view-only order screen). */
export default function OrderStatusChip({ o }: { o: Parameters<typeof statusBadge>[0] }) {
  const b = statusBadge(o);
  return <span className={`rounded-full border px-2 py-0.5 text-xs font-bold whitespace-nowrap ${TONE_CLS[b.tone]}`}>{b.label}</span>;
}

export const fmtDateTime = (iso: string) =>
  new Date(iso).toLocaleString("ka-GE", { timeZone: "Asia/Tbilisi", day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
