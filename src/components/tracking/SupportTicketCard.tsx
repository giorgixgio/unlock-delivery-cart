import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Check, ExternalLink, PlayCircle } from "lucide-react";

export interface TicketView {
  step: 1 | 2 | 3; open: boolean; created_at: string; resolved_at: string | null;
  messages: { from: "customer" | "support"; body: string; link: string | null; video: string | null; at: string }[];
}

const STEPS = ["მიღებულია", "განიხილება", "მოგვარებულია"];
const fmt = (t: string) => new Date(t).toLocaleString("ka-GE", { timeZone: "Asia/Tbilisi", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
const youtubeId = (u: string) => u.match(/(?:youtu\.be\/|v=|shorts\/)([\w-]{11})/)?.[1] ?? null;

/** Public "Your request" card on the tracking page. Comments go through the token-checked tracking function. */
export default function SupportTicketCard({ ticket, onComment }: { ticket: TicketView; onComment: (text: string) => Promise<void> }) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const send = async () => {
    if (!text.trim()) return;
    setBusy(true); setMsg(null);
    try { await onComment(text.trim()); setText(""); setMsg("გმადლობთ! თქვენი შეტყობინება მიღებულია."); }
    catch (e: any) { setMsg(e?.code === "rate_limited" ? "ძალიან ბევრი შეტყობინება. სცადეთ ცოტა ხანში." : "ვერ გაიგზავნა. სცადეთ ხელახლა."); }
    finally { setBusy(false); }
  };
  return (
    <section className="space-y-4 rounded-2xl border-2 border-primary/40 bg-card p-4">
      <h2 className="text-lg font-bold">თქვენი მიმართვა</h2>
      <ol className="flex items-center justify-between gap-1">
        {STEPS.map((label, i) => {
          const done = ticket.step > i + 1 || (ticket.step === 3 && i === 2);
          const current = ticket.step === i + 1 && ticket.open;
          return (
            <li key={label} className="flex flex-1 flex-col items-center gap-1 text-center">
              <span className={`flex h-8 w-8 items-center justify-center rounded-full border-2 ${done ? "border-primary bg-primary text-primary-foreground" : current ? "border-primary animate-pulse" : "border-border"}`}>
                {done ? <Check className="h-4 w-4" /> : <span className={`h-2.5 w-2.5 rounded-full ${current ? "bg-primary" : "bg-border"}`} />}
              </span>
              <span className={`text-sm ${done || current ? "font-bold" : "text-muted-foreground"}`}>{label}</span>
            </li>
          );
        })}
      </ol>
      {ticket.open && <p className="text-base text-muted-foreground">სპეციალისტი დაგიკავშირდებათ უახლოეს სამუშაო დღეებში.</p>}
      {ticket.messages.length > 0 && (
        <ul className="space-y-2">
          {ticket.messages.map((m, i) => {
            const yt = m.video ? youtubeId(m.video) : null;
            return (
              <li key={i} className={`rounded-xl p-3 text-base ${m.from === "support" ? "bg-primary/10" : "bg-muted ml-6"}`}>
                <p className="text-xs text-muted-foreground">{m.from === "support" ? "მხარდაჭერა" : "თქვენ"} · {fmt(m.at)}</p>
                <p className="whitespace-pre-wrap">{m.body}</p>
                {m.link && <Button asChild variant="outline" className="mt-2 h-11"><a href={m.link} target="_blank" rel="noopener noreferrer"><ExternalLink className="h-4 w-4" />გახსნა</a></Button>}
                {m.video && (yt
                  ? <div className="mt-2 aspect-video overflow-hidden rounded-lg"><iframe className="h-full w-full" src={`https://www.youtube-nocookie.com/embed/${yt}`} title="video" allowFullScreen /></div>
                  : <Button asChild variant="outline" className="mt-2 h-11"><a href={m.video} target="_blank" rel="noopener noreferrer"><PlayCircle className="h-4 w-4" />ვიდეოს ნახვა</a></Button>)}
              </li>
            );
          })}
        </ul>
      )}
      {ticket.open && (
        <div className="space-y-2">
          <label className="text-base font-semibold" htmlFor="ticket-comment">დაამატეთ დეტალები</label>
          <textarea id="ticket-comment" maxLength={500} rows={3} value={text} onChange={(e) => setText(e.target.value)}
            className="w-full rounded-xl border border-input bg-background p-3 text-base" placeholder="დაწერეთ რა გაწუხებთ..." />
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground">{text.length}/500</span>
            <Button size="lg" disabled={busy || !text.trim()} onClick={send}>გაგზავნა</Button>
          </div>
          {msg && <p className="text-base font-semibold">{msg}</p>}
        </div>
      )}
    </section>
  );
}
