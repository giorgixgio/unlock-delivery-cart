import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface Info { order_number: string; amount: number; status: "sent" | "submitted" | "refunded"; submitted_at: string | null; refunded_at: string | null }
const call = (body: Record<string, unknown>) => supabase.functions.invoke("refund-request", { body });
const STEPS = ["მოთხოვნა მიღებულია", "მონაცემები მოწმდება", "გადარიცხვა მზადდება", "თანხა ჩაირიცხა"];

function Progress({ info }: { info: Info }) {
  const refunded = info.status === "refunded";
  const start = new Date(info.submitted_at || Date.now()).getTime();
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, []);
  // Presentation-only: eases toward 92% over 72h; jumps to 100% only when staff mark it refunded.
  const hrs = (now - start) / 3600_000;
  const pct = refunded ? 100 : Math.min(92, 18 + 74 * (1 - Math.exp(-hrs / 24)) + ((now / 1000) % 6) * 0.15);
  const step = refunded ? 3 : pct < 35 ? 1 : 2;
  return (
    <div className="space-y-5">
      <div className="text-center">
        <div className="text-5xl">{refunded ? "✅" : "⏳"}</div>
        <h1 className="mt-2 text-2xl font-bold">{refunded ? "თანხა დაბრუნებულია!" : "თანხის დაბრუნება მუშავდება"}</h1>
        <p className="mt-1 text-lg text-muted-foreground">{refunded ? "თანხა ჩაირიცხა თქვენს ანგარიშზე." : "თანხა ჩაგერიცხებათ 24–72 საათში."}</p>
      </div>
      <div>
        <div className="h-5 overflow-hidden rounded-full bg-muted">
          <div className={`h-full rounded-full bg-primary transition-all duration-1000 ${refunded ? "" : "animate-pulse"}`} style={{ width: `${pct}%` }} />
        </div>
        <div className="mt-1 text-right text-sm font-semibold">{Math.floor(pct)}%</div>
      </div>
      <ol className="space-y-3">
        {STEPS.map((s, i) => (
          <li key={s} className={`flex items-center gap-3 text-lg ${i <= step ? "font-semibold" : "text-muted-foreground"}`}>
            <span className={`flex h-8 w-8 items-center justify-center rounded-full text-sm ${i < step || refunded ? "bg-primary text-primary-foreground" : i === step ? "border-2 border-primary" : "bg-muted"}`}>{i < step || refunded ? "✓" : i + 1}</span>
            {s}{i === step && !refunded && <span className="text-sm text-muted-foreground">…</span>}
          </li>
        ))}
      </ol>
      <p className="rounded-lg bg-muted p-3 text-center">შეკვეთა #{info.order_number} · {Number(info.amount).toFixed(2)}₾</p>
    </div>
  );
}

export default function RefundRequest() {
  const { token = "" } = useParams();
  const [info, setInfo] = useState<Info | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [name, setName] = useState(""); const [iban, setIban] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => { document.title = "თანხის დაბრუნება"; void call({ action: "get", token }).then(({ data, error }) => data && !data.error ? setInfo(data) : setErr(error ? "ბმული ვერ მოიძებნა" : "ბმული ვერ მოიძებნა")); }, [token]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setErr(null);
    if (name.trim().split(/\s+/).length < 2) return setErr("ჩაწერეთ სახელი და გვარი");
    const clean = iban.replace(/\s+/g, "").toUpperCase();
    if (!/^GE\d{2}[A-Z]{2}\d{16}$/.test(clean)) return setErr("IBAN უნდა იყოს 22 სიმბოლო, იწყება GE-ით (მაგ: GE29NB0000000101904917)");
    setBusy(true);
    const { data, error } = await call({ action: "submit", token, full_name: name.trim(), iban: clean });
    setBusy(false);
    if (data?.ok) setInfo((i) => i && { ...i, status: "submitted", submitted_at: data.submitted_at });
    else if (data?.error === "bad_iban" || (error as any)?.context?.status === 400) setErr("IBAN არასწორია, გთხოვთ გადაამოწმოთ");
    else setErr("ვერ გაიგზავნა, სცადეთ თავიდან");
  };

  return (
    <main className="min-h-screen bg-background px-4 py-8">
      <div className="mx-auto max-w-md rounded-2xl border border-border bg-card p-5 shadow-sm">
        {!info ? <p className="py-10 text-center text-lg">{err || "იტვირთება…"}</p> : info.status !== "sent" ? <Progress info={info} /> : (
          <form onSubmit={submit} className="space-y-4">
            <div className="text-center">
              <div className="text-5xl">💸</div>
              <h1 className="mt-2 text-2xl font-bold">თანხის დაბრუნება</h1>
              <p className="mt-1 text-lg text-muted-foreground">შეკვეთა #{info.order_number} · <b className="text-foreground">{Number(info.amount).toFixed(2)}₾</b></p>
            </div>
            <label className="block space-y-1"><span className="text-lg font-semibold">სახელი და გვარი</span>
              <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={100} autoComplete="name" className="h-14 text-lg" placeholder="მაგ: გიორგი ბერიძე" /></label>
            <label className="block space-y-1"><span className="text-lg font-semibold">ბანკის ანგარიში (IBAN)</span>
              <Input value={iban} onChange={(e) => setIban(e.target.value.toUpperCase())} maxLength={34} className="h-14 font-mono text-lg" placeholder="GE00XX0000000000000000" inputMode="text" autoCapitalize="characters" /></label>
            {err && <p className="rounded-lg bg-destructive/10 p-3 font-semibold text-destructive">{err}</p>}
            <Button type="submit" disabled={busy} className="h-16 w-full text-xl font-bold">{busy ? "იგზავნება…" : "გაგზავნა"}</Button>
            <p className="text-center text-muted-foreground">🔒 თანხა ჩაგერიცხებათ 24–72 საათში</p>
          </form>
        )}
      </div>
    </main>
  );
}
