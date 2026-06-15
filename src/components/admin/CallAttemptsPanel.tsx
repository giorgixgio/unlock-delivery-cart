import { PhoneOff, Clock, AlertTriangle } from "lucide-react";
import { DEFAULT_MAX_CALL_ATTEMPTS } from "@/lib/cancelReasons";

interface Props {
  count: number;
  lastAt?: string | null;
  lastBy?: string | null;
  nextCallAfter?: string | null;
  maxAttempts?: number;
}

export default function CallAttemptsPanel({
  count, lastAt, lastBy, nextCallAfter, maxAttempts = DEFAULT_MAX_CALL_ATTEMPTS,
}: Props) {
  const maxReached = count >= maxAttempts;
  const badgeCls =
    count === 0
      ? "bg-muted text-muted-foreground"
      : count === 1
      ? "bg-amber-100 text-amber-800 border border-amber-300"
      : count === 2
      ? "bg-orange-100 text-orange-800 border border-orange-300"
      : "bg-red-100 text-red-800 border border-red-300";

  const fmt = (s?: string | null) =>
    s ? new Date(s).toLocaleString("ka-GE", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }) : "—";

  const nextAction = maxReached
    ? "გააუქმე მიზეზით: არ პასუხობს რამდენიმე ცდის შემდეგ"
    : count === 0
    ? "სცადე დარეკვა"
    : "სცადე კიდევ ერთხელ";

  return (
    <section className="rounded-lg border border-border p-3 bg-card">
      <div className="flex items-center justify-between mb-2 gap-2">
        <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
          <PhoneOff className="w-3.5 h-3.5" /> ზარის მცდელობები
        </h3>
        <span className={`text-xs font-extrabold px-2 py-0.5 rounded-full ${badgeCls}`}>
          ცდა {count}/{maxAttempts}
        </span>
      </div>
      <div className="text-xs text-muted-foreground space-y-1">
        <div>ბოლო ზარი: <span className="text-foreground font-semibold">{fmt(lastAt)}</span>{lastBy ? <> — {lastBy}</> : null}</div>
        {nextCallAfter && (
          <div className="flex items-center gap-1"><Clock className="w-3 h-3" /> გადარეკვა: <span className="text-foreground font-semibold">{fmt(nextCallAfter)}</span></div>
        )}
        <div className={`flex items-center gap-1 mt-1 ${maxReached ? "text-red-700 font-bold" : ""}`}>
          {maxReached && <AlertTriangle className="w-3.5 h-3.5" />}
          შემდეგი მოქმედება: {nextAction}
        </div>
      </div>
    </section>
  );
}
