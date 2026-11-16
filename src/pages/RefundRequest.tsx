import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface Info { order_number: string; amount: number; status: "sent" | "submitted" | "refunded"; submitted_at: string | null; refunded_at: string | null; evidence_required?: boolean }
interface Ev { id: string; name: string; video: boolean; preview: string; path?: string; state: "up" | "ok" | "err" }
const extOf = (f: File) => (f.name.split(".").pop() || "").toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 5) || (f.type.split("/")[1] || "bin").replace(/[^a-z0-9]/g, "").slice(0, 5);

function Evidence({ token, items, setItems, required }: { token: string; items: Ev[]; setItems: React.Dispatch<React.SetStateAction<Ev[]>>; required: boolean }) {
  const add = async (files: FileList | null) => {
    for (const f of Array.from(files || []).slice(0, Math.max(0, 10 - items.length))) {
      const id = crypto.randomUUID();
      if (f.size > 100 * 1024 * 1024) { setItems((x) => [...x, { id, name: f.name, video: false, preview: "", state: "err" }]); continue; }
      setItems((x) => [...x, { id, name: f.name, video: f.type.startsWith("video"), preview: URL.createObjectURL(f), state: "up" }]);
      const ext = extOf(f).length >= 2 ? extOf(f) : "jpg";
      const { data } = await call({ action: "upload_url", token, ext });
      const up = data?.path ? await supabase.storage.from("refund-evidence").uploadToSignedUrl(data.path, data.token, f, { contentType: f.type || undefined }) : { error: true };
      setItems((x) => x.map((e) => e.id === id ? { ...e, path: data?.path, state: up.error ? "err" : "ok" } : e));
    }
  };
  const pick = (capture: boolean) => {
    const i = document.createElement("input");
    i.type = "file"; i.accept = "image/*,video/*"; i.multiple = !capture;
    if (capture) i.setAttribute("capture", "environment");
    i.onchange = () => void add(i.files);
    i.click();
  };
  return (
    <div className="space-y-2">
      <span className="text-lg font-semibold">პროდუქტის ფოტო ან ვიდეო {required ? <span className="text-destructive">*</span> : <span className="text-base font-normal text-muted-foreground">(სურვილისამებრ)</span>}</span>
      <p className="text-muted-foreground">გადაიღეთ პროდუქტი, რომ სწრაფად შევამოწმოთ.</p>
      <div className="grid grid-cols-2 gap-2">
        <Button type="button" variant="outline" className="h-16 text-lg font-semibold" onClick={() => pick(true)}>📷 გადაღება</Button>
        <Button type="button" variant="outline" className="h-16 text-lg font-semibold" onClick={() => pick(false)}>🖼 გალერეიდან</Button>
      </div>
      {!!items.length && <div className="grid grid-cols-3 gap-2">
        {items.map((e) => (
          <div key={e.id} className="relative aspect-square overflow-hidden rounded-lg border border-border bg-muted">
            {e.preview && (e.video ? <video src={e.preview} muted playsInline className="h-full w-full object-cover" /> : <img src={e.preview} alt="" className="h-full w-full object-cover" />)}
            <span className="absolute inset-x-0 bottom-0 bg-background/85 py-0.5 text-center text-xs font-semibold">{e.state === "up" ? "იტვირთება…" : e.state === "ok" ? (e.video ? "🎬 ✓" : "✓") : "❌ ვერ აიტვირთა"}</span>
            <button type="button" aria-label="წაშლა" onClick={() => setItems((x) => x.filter((y) => y.id !== e.id))} className="absolute right-1 top-1 h-7 w-7 rounded-full bg-background/90 text-sm font-bold">✕</button>
          </div>
        ))}
      </div>}
    </div>
  );
}
const call = (body: Record<string, unknown>) => supabase.functions.invoke("refund-request", { body });
const STEPS = ["მასალა მიღებულია", "სპეციალისტი განიხილავს", "გადაწყვეტილება მზადდება", "დაგიკავშირდებით"];

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
        <h1 className="mt-2 text-2xl font-bold">{refunded ? "განხილვა დასრულდა" : "თქვენი მიმართვა განიხილება"}</h1>
        <p className="mt-1 text-lg text-muted-foreground">{refunded ? "მადლობა მოთმინებისთვის." : "24–72 საათში დაგიკავშირდებით."}</p>
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
      <p className="rounded-lg bg-muted p-3 text-center">შეკვეთა #{info.order_number}</p>
    </div>
  );
}

export default function RefundRequest() {
  const { token = "" } = useParams();
  const [info, setInfo] = useState<Info | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [ev, setEv] = useState<Ev[]>([]);

  useEffect(() => { document.title = "პრობლემის განხილვა"; void call({ action: "get", token }).then(({ data, error }) => data && !data.error ? setInfo(data) : setErr(error ? "ბმული ვერ მოიძებნა" : "ბმული ვერ მოიძებნა")); }, [token]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setErr(null);
    if (ev.some((e) => e.state === "up")) return setErr("დაელოდეთ ფაილების ატვირთვას");
    const evidence = ev.filter((e) => e.state === "ok" && e.path).map((e) => e.path!);
    if (!evidence.length) return setErr("ატვირთეთ პროდუქტის ფოტო ან ვიდეო");
    setBusy(true);
    const { data, error } = await call({ action: "submit", token, evidence });
    setBusy(false);
    if (data?.ok) setInfo((i) => i && { ...i, status: "submitted", submitted_at: data.submitted_at });
    else if ((error as any)?.context && (await (error as any).context.json?.().catch(() => null))?.error === "evidence_required") setErr("ატვირთეთ პროდუქტის ფოტო ან ვიდეო");
    else setErr("ვერ გაიგზავნა, სცადეთ თავიდან");
  };

  return (
    <main className="min-h-screen bg-background px-4 py-8">
      <div className="mx-auto max-w-md rounded-2xl border border-border bg-card p-5 shadow-sm">
        {!info ? <p className="py-10 text-center text-lg">{err || "იტვირთება…"}</p> : info.status !== "sent" ? <Progress info={info} /> : (
          <form onSubmit={submit} className="space-y-4">
            <div className="text-center">
              <div className="text-5xl">🔍</div>
              <h1 className="mt-2 text-2xl font-bold">პრობლემის განხილვა</h1>
              <p className="mt-1 text-lg text-muted-foreground">შეკვეთა #{info.order_number}</p>
              <p className="mt-2 text-lg">ატვირთეთ პროდუქტის ფოტო ან ვიდეო, რომ ნათლად დავინახოთ პრობლემა.</p>
            </div>
            <div className="space-y-1 rounded-lg bg-muted p-3 text-base">
              <p className="font-semibold">როგორ გადავიღოთ:</p>
              <ul className="list-disc space-y-0.5 pl-5">
                <li>მკაფიოდ ჩანდეს პროდუქტი და პრობლემა (დაზიანება, არ ირთვება და ა.შ.)</li>
                <li>თუ არ მუშაობს — გადაიღეთ ვიდეო, სადაც ცდილობთ ჩართვას</li>
                <li>კარგ განათებაზე, ახლოდან</li>
              </ul>
            </div>
            <Evidence token={token} items={ev} setItems={setEv} required />
            {err && <p className="rounded-lg bg-destructive/10 p-3 font-semibold text-destructive">{err}</p>}
            <Button type="submit" disabled={busy} className="h-16 w-full text-xl font-bold">{busy ? "იგზავნება…" : "გაგზავნა"}</Button>
            <p className="text-center text-muted-foreground">⏱ განვიხილავთ და 24–72 საათში დაგიკავშირდებით</p>
          </form>
        )}
      </div>
    </main>
  );
}
