import { lazy, Suspense, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Check, Loader2, Phone, Star } from "lucide-react";
import { getPolicySections, TRENDMART_RETURNS } from "@/lib/storePolicies";
import OnwayCityPicker from "@/components/OnwayCityPicker";
import { useOnwayCities } from "@/hooks/useOnwayCities";
import { selectedCityValid } from "@/lib/onwayCities";

const TrackingMap = lazy(() => import("@/components/tracking/TrackingMap"));

interface Stage { key: string; label: string; done: boolean; at: string | null }
interface Tracking {
  number: string; store: "BIGMART" | "TRENDMART"; logo: string | null; first_name: string | null; city: string | null; street: string | null;
  total: number; delivery_text: string | null; items: { title: string; qty: number; image: string | null }[]; stages: Stage[];
  handed: boolean; status: "active" | "delivered" | "canceled"; can_cancel: boolean; operator_phone: string | null;
  can_rate_operator: boolean; rated: boolean; review_token: string | null;
  confirmed: boolean; needs_address: boolean; shipping_fee: number;
}

async function call(body: Record<string, unknown>) {
  const { data, error } = await supabase.functions.invoke("order-tracking", { body });
  if (error) {
    const ctx = (error as any).context;
    let payload: any = null;
    try { payload = await ctx?.json?.(); } catch { /* ignore */ }
    throw Object.assign(new Error(payload?.error || "failed"), { code: payload?.error, status: ctx?.status });
  }
  return data;
}

const fmt = (t: string | null) => (t ? new Date(t).toLocaleString("ka-GE", { timeZone: "Asia/Tbilisi", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "");
const money = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(2));
const telHref = (p: string) => `tel:+995${p.replace(/\D/g, "").slice(-9)}`;
const REASONS: [string, string][] = [["cant_afford", "ვეღარ ვიყიდი"], ["too_expensive", "ძვირია"], ["bought_elsewhere", "სხვაგან ვიყიდე"], ["accidental", "შემთხვევით შევუკვეთე"], ["other", "სხვა"]];

export default function OrderTracking() {
  const { token = "" } = useParams();
  const [data, setData] = useState<Tracking | null>(null);
  const [state, setState] = useState<"loading" | "ok" | "not_found" | "error">("loading");

  useEffect(() => {
    const m = document.createElement("meta");
    m.name = "robots"; m.content = "noindex, nofollow";
    document.head.appendChild(m);
    return () => { m.remove(); };
  }, []);
  const load = () => call({ action: "get", token }).then((d) => { setData(d); setState("ok"); })
    .catch((e) => setState(e.status === 404 || e.status === 400 ? "not_found" : "error"));
  useEffect(() => { load(); }, [token]);

  if (state === "loading") return <div className="flex min-h-screen items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  if (state !== "ok" || !data) return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-4 p-6 text-center">
      <h1 className="text-2xl font-extrabold">{state === "not_found" ? "შეკვეთა ვერ მოიძებნა" : "დროებით ვერ ჩაიტვირთა"}</h1>
      <p className="text-muted-foreground">{state === "not_found" ? "შეამოწმეთ SMS-ში მიღებული ბმული." : "სცადეთ ცოტა ხანში ხელახლა."}</p>
      <Button asChild size="lg"><Link to="/">მთავარ გვერდზე</Link></Button>
    </main>
  );

  const stages = data.confirmed ? data.stages : data.stages.slice(0, 1);
  const current = data.confirmed ? stages.findIndex((s) => !s.done) : -1;
  return (
    <main className="mx-auto max-w-md space-y-5 px-4 pb-16 pt-4">
      <header className="flex items-center justify-between">
        <h1 className="text-xl font-extrabold">შეკვეთა #{data.number}</h1>
        {data.logo ? <img src={data.logo} alt={data.store} className="h-7 w-auto" /> : <span className="font-black">{data.store}</span>}
      </header>
      {data.first_name && <p className="text-lg">გამარჯობა, {data.first_name}!</p>}

      {data.status === "canceled" ? (
        <section className="rounded-2xl border-2 border-destructive bg-destructive/5 p-5 text-center text-lg font-bold">შეკვეთა გაუქმებულია</section>
      ) : (
        <section className="rounded-2xl bg-primary p-5 text-center text-primary-foreground shadow-lg">
          <p className="text-base font-semibold">კურიერს გადაუხდით:</p>
          <p className="text-5xl font-black leading-tight">{money(data.total)} ₾</p>
          <p className="mt-1 text-sm opacity-90">გადახდა კურიერთან მიღებისას</p>
          {data.shipping_fee > 0 && <p className="text-sm opacity-90">მათ შორის მიტანა: {money(data.shipping_fee)} ₾</p>}
        </section>
      )}

      {data.status === "active" && data.needs_address && <AddressForm token={token} onDone={load} />}
      {data.status === "active" && !data.confirmed && (
        <section className="rounded-2xl border-2 border-primary/40 bg-primary/5 p-4 text-center text-lg font-bold">ოპერატორი დაგირეკავთ დასადასტურებლად</section>
      )}
      {data.status === "active" && (data.needs_address || !data.confirmed) && <ShippingInfo />}

      {data.status === "active" && data.confirmed && !data.needs_address && data.delivery_text && (
        <section className="rounded-2xl border border-border bg-card p-4">
          <p className="text-sm text-muted-foreground">მიტანის დღე</p>
          <p className="text-2xl font-extrabold">{data.delivery_text}</p>
          {data.city && <p className="text-sm text-muted-foreground">{data.city}{data.street ? `, ${data.street}` : ""}</p>}
        </section>
      )}

      {data.status !== "canceled" && (
        <section className="rounded-2xl border border-border bg-card p-4">
          <ol className="space-y-0">
            {stages.map((s, i) => {
              const isCurrent = i === current;
              return (
                <li key={s.key} className="relative flex gap-3 pb-5 last:pb-0">
                  {i < stages.length - 1 && <span className={`absolute left-[15px] top-8 h-[calc(100%-2rem)] w-0.5 ${s.done ? "bg-primary" : "bg-border"}`} />}
                  <span className={`relative z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 ${s.done ? "border-primary bg-primary text-primary-foreground" : isCurrent ? "border-primary bg-background animate-pulse" : "border-border bg-background"}`}>
                    {s.done ? <Check className="h-4 w-4" /> : <span className={`h-2.5 w-2.5 rounded-full ${isCurrent ? "bg-primary" : "bg-border"}`} />}
                  </span>
                  <div className="pt-1">
                    <p className={`text-base ${s.done || isCurrent ? "font-bold" : "text-muted-foreground"}`}>{s.label}</p>
                    {s.at && <p className="text-xs text-muted-foreground">{fmt(s.at)}</p>}
                  </div>
                </li>
              );
            })}
          </ol>
        </section>
      )}

      {data.status === "active" && data.confirmed && !data.needs_address && <Suspense fallback={<div className="h-56 rounded-2xl bg-muted" />}><TrackingMap city={data.city} handed={data.handed} /></Suspense>}

      <section className="space-y-2">
        <h2 className="text-lg font-bold">პროდუქტები</h2>
        {data.items.map((it, i) => (
          <div key={i} className="flex items-center gap-3 rounded-xl border border-border bg-card p-2">
            {it.image ? <img src={it.image} alt="" className="h-16 w-16 rounded-lg object-cover" loading="lazy" /> : <div className="h-16 w-16 rounded-lg bg-muted" />}
            <p className="flex-1 text-sm font-medium">{it.title}</p>
            <span className="text-sm font-bold">×{it.qty}</span>
          </div>
        ))}
      </section>

      {data.status === "active" && <Actions data={data} token={token} onChanged={load} />}
      {data.confirmed && data.can_rate_operator && <OperatorRating token={token} onDone={load} />}
      {data.status === "delivered" && data.review_token && (
        <Button asChild size="lg" className="h-14 w-full text-lg"><Link to={`/r/${data.review_token}`}>შეაფასეთ პროდუქტი ⭐</Link></Button>
      )}
      <Faq />
    </main>
  );
}

function Actions({ data, token, onChanged }: { data: Tracking; token: string; onChanged: () => void }) {
  const [mode, setMode] = useState<null | "change" | "cancel1" | "cancel2" | "sent" | "saved">(null);
  const [address, setAddress] = useState(""), [day, setDay] = useState("");
  const [reason, setReason] = useState(""), [text, setText] = useState("");
  const [busy, setBusy] = useState(false), [err, setErr] = useState<string | null>(null);
  const run = async (body: Record<string, unknown>, next: typeof mode, reload = false) => {
    setBusy(true); setErr(null);
    try { await call({ token, ...body }); setMode(next); if (reload) onChanged(); }
    catch (e: any) { setErr(e.code === "handed_to_courier" ? "შეკვეთა უკვე კურიერთანაა — გაუქმება მხოლოდ ზარით." : e.code === "rate_limited" ? "ძალიან ბევრი მცდელობა, სცადეთ მოგვიანებით." : "ვერ მოხერხდა, სცადეთ ხელახლა."); }
    setBusy(false);
  };
  return (
    <section className="space-y-3">
      {data.operator_phone && (
        <Button asChild size="lg" className="h-14 w-full gap-2 text-lg"><a href={telHref(data.operator_phone)}><Phone className="h-5 w-5" />დაგვირეკეთ</a></Button>
      )}
      {mode === null && !data.needs_address && <Button variant="outline" size="lg" className="h-14 w-full text-base" onClick={() => setMode("change")}>{data.confirmed ? "მისამართის / დღის შეცვლა" : "მისამართის შესწორება"}</Button>}
      {mode === "change" && (
        <div className="space-y-2 rounded-2xl border border-border bg-card p-4">
          <label className="block text-sm font-semibold">ახალი მისამართი<textarea value={address} onChange={(e) => setAddress(e.target.value)} maxLength={300} rows={2} className="mt-1 w-full rounded-lg border border-input bg-background p-2 text-base" /></label>
          {data.confirmed && <label className="block text-sm font-semibold">სასურველი დღე<input value={day} onChange={(e) => setDay(e.target.value)} maxLength={100} placeholder="მაგ. ხვალ საღამოს" className="mt-1 w-full rounded-lg border border-input bg-background p-2 text-base" /></label>}
          <div className="flex gap-2">
            <Button className="h-12 flex-1" disabled={busy || (!address.trim() && !day.trim())} onClick={() => run({ action: "change", address: address.trim() || undefined, day: day.trim() || undefined }, "sent")}>გაგზავნა</Button>
            <Button variant="ghost" className="h-12" onClick={() => setMode(null)}>დახურვა</Button>
          </div>
        </div>
      )}
      {mode === "sent" && <p className="rounded-xl bg-muted p-3 text-center font-semibold">მივიღეთ! ოპერატორი დაგიკავშირდებათ.</p>}

      {!data.can_cancel && data.handed && (
        <p className="text-center text-sm text-muted-foreground">გაუქმება შესაძლებელია მხოლოდ ზარით{data.operator_phone ? <> — <a className="underline" href={telHref(data.operator_phone)}>დაგვირეკეთ</a></> : ""}</p>
      )}
      {data.can_cancel && mode === null && <button className="block w-full py-2 text-center text-sm text-muted-foreground underline" onClick={() => setMode("cancel1")}>შეკვეთის გაუქმება</button>}
      {mode === "cancel1" && (
        <div className="space-y-2 rounded-2xl border border-border bg-card p-4">
          <p className="font-bold">რატომ გსურთ გაუქმება?</p>
          {REASONS.map(([k, l]) => (
            <label key={k} className="flex items-center gap-2 rounded-lg border border-border p-3 text-base"><input type="radio" name="r" checked={reason === k} onChange={() => setReason(k)} className="h-5 w-5" />{l}</label>
          ))}
          {reason === "other" && <textarea value={text} onChange={(e) => setText(e.target.value)} maxLength={300} rows={2} className="w-full rounded-lg border border-input bg-background p-2 text-base" placeholder="მოგვწერეთ მიზეზი" />}
          <div className="flex gap-2">
            <Button className="h-12 flex-1" disabled={!reason} onClick={() => setMode("cancel2")}>გაგრძელება</Button>
            <Button variant="ghost" className="h-12" onClick={() => setMode(null)}>უკან</Button>
          </div>
        </div>
      )}
      {mode === "cancel2" && (
        <div className="space-y-3 rounded-2xl border border-border bg-card p-4 text-center">
          <p className="text-lg font-bold">ოპერატორი დაგირეკავთ და შევეცდებით დაგეხმაროთ</p>
          <Button size="lg" className="h-14 w-full text-lg" disabled={busy} onClick={() => run({ action: "call_me", reason, text: text || undefined }, "saved")}>დამირეკეთ</Button>
          <Button variant="outline" className="h-12 w-full" disabled={busy} onClick={() => run({ action: "cancel", reason, text: text || undefined }, null, true)}>მაინც გავაუქმო</Button>
        </div>
      )}
      {mode === "saved" && <p className="rounded-xl bg-muted p-3 text-center font-semibold">გმადლობთ! ოპერატორი მალე დაგირეკავთ.</p>}
      {err && <p className="text-center text-sm text-destructive">{err}</p>}
    </section>
  );
}

function ShippingInfo() {
  return (
    <section className="space-y-1 rounded-2xl border border-border bg-card p-4 text-base">
      <p className="text-sm text-muted-foreground">მიწოდების პირობები</p>
      <p>• თბილისი — მომდევნო სამუშაო დღეს (თუ შეკვეთა 18:00-მდე დადასტურდა)</p>
      <p>• რეგიონები — 1-3 სამუშაო დღე</p>
      <p>• კვირას მიტანა არ ხდება</p>
      <p className="font-semibold">გადახდა კურიერთან, ნივთის მიღებისას</p>
    </section>
  );
}

function AddressForm({ token, onDone }: { token: string; onDone: () => void }) {
  const { cities, loading } = useOnwayCities();
  const [city, setCity] = useState(""), [cityId, setCityId] = useState<string | null>(null);
  const [address, setAddress] = useState(""), [name, setName] = useState("");
  const [busy, setBusy] = useState(false), [err, setErr] = useState<string | null>(null), [done, setDone] = useState(false);
  if (done) return <section className="rounded-2xl border-2 border-primary bg-primary/5 p-5 text-center text-lg font-bold">გმადლობთ! მისამართი შენახულია.</section>;
  const save = async () => {
    if (!selectedCityValid(cities, cityId, city)) return setErr("აირჩიეთ ქალაქი სიიდან");
    if (address.trim().length < 3) return setErr("ჩაწერეთ მისამართი");
    setBusy(true); setErr(null);
    try { await call({ action: "set_address", token, region_id: cityId, address: address.trim(), name: name.trim() || undefined }); setDone(true); setTimeout(onDone, 2500); }
    catch (e: any) { setErr(e.code === "rate_limited" ? "ძალიან ბევრი მცდელობა, სცადეთ მოგვიანებით." : "ვერ შეინახა, სცადეთ ხელახლა."); }
    setBusy(false);
  };
  return (
    <form className="space-y-3 rounded-2xl border-2 border-primary bg-card p-4 shadow-md" onSubmit={(e) => { e.preventDefault(); save(); }}>
      <h2 className="text-xl font-extrabold">მიუთითეთ მიწოდების მისამართი</h2>
      <div><p className="mb-1 text-sm font-semibold">ქალაქი / სოფელი</p>
        <OnwayCityPicker value={city} cities={cities} loading={loading} selectedId={cityId}
          onChange={(v) => { setCityId(null); setCity(v); }} onSelect={(c) => { setCityId(c.id); setCity(c.name); }} /></div>
      <label className="block text-sm font-semibold">მისამართი<input value={address} onChange={(e) => setAddress(e.target.value)} maxLength={300} placeholder="ქუჩა, სახლის ნომერი, ბინა" className="mt-1 h-12 w-full rounded-lg border border-input bg-background px-3 text-base" /></label>
      <label className="block text-sm font-semibold">მიმღების სახელი (არასავალდებულო)<input value={name} onChange={(e) => setName(e.target.value)} maxLength={100} className="mt-1 h-12 w-full rounded-lg border border-input bg-background px-3 text-base" /></label>
      {err && <p className="text-sm text-destructive">{err}</p>}
      <Button type="submit" size="lg" className="h-14 w-full text-lg" disabled={busy}>{busy ? <Loader2 className="h-5 w-5 animate-spin" /> : "შენახვა"}</Button>
    </form>
  );
}

function OperatorRating({ token, onDone }: { token: string; onDone: () => void }) {
  const [stars, setStars] = useState(0), [comment, setComment] = useState(""), [busy, setBusy] = useState(false), [done, setDone] = useState(false);
  if (done) return <p className="rounded-xl bg-muted p-3 text-center font-semibold">მადლობა შეფასებისთვის!</p>;
  return (
    <section className="space-y-3 rounded-2xl border border-border bg-card p-4 text-center">
      <p className="font-bold">როგორ შეაფასებდით ოპერატორთან საუბარს?</p>
      <div className="flex justify-center gap-1">
        {[1, 2, 3, 4, 5].map((n) => (
          <button key={n} aria-label={`${n} ვარსკვლავი`} onClick={() => setStars(n)} className="p-1">
            <Star className={`h-10 w-10 ${n <= stars ? "fill-primary text-primary" : "text-muted-foreground"}`} />
          </button>
        ))}
      </div>
      {stars > 0 && (
        <>
          <textarea value={comment} onChange={(e) => setComment(e.target.value)} maxLength={1000} rows={2} placeholder="კომენტარი (არასავალდებულო)" className="w-full rounded-lg border border-input bg-background p-2 text-base" />
          <Button className="h-12 w-full" disabled={busy} onClick={async () => {
            setBusy(true);
            try { await call({ action: "rate_operator", token, stars, comment: comment.trim() || undefined }); } catch { /* already rated */ }
            setDone(true); setBusy(false); onDone();
          }}>გაგზავნა</Button>
        </>
      )}
    </section>
  );
}

function Faq() {
  const returns = getPolicySections("/returns");
  const items: [string, string][] = [
    ["შემიძლია ნახვა გადახდამდე?", "დიახ, კურიერთან შეგიძლიათ ამანათი დაათვალიეროთ და შემდეგ გადაიხადოთ."],
    ["რა ხდება თუ არ ვარ სახლში?", "კურიერი დაგირეკავთ. თუ ვერ დაგიკავშირდათ, ჩვენ დაგიკავშირდებით და ახალ დროს შევთანხმდებით."],
    ["თუ პროდუქტი დაზიანებულია?", `დაზიანებულ ნივთს ${TRENDMART_RETURNS.damagedOnArrivalDays} დღის განმავლობაში უფასოდ დაგიბრუნებთ ან შეგიცვლით — დაგვიკავშირდით.`],
    ["დაბრუნების პოლიტიკა", returns.flatMap((s) => s.paragraphs).slice(0, 3).join(" ")],
    ["როდის მოვა კურიერი?", "მიტანის დღე ზემოთაა მითითებული. კურიერი მოსვლამდე დაგირეკავთ — გქონდეთ ტელეფონი ჩართული."],
    ["გადახდის მეთოდები", "გადახდა ხდება კურიერთან მიღებისას. ბარათით წინასწარ გადახდა არ არის საჭირო."],
  ];
  return (
    <section>
      <h2 className="mb-2 text-lg font-bold">ხშირი კითხვები</h2>
      <Accordion type="single" collapsible className="rounded-2xl border border-border bg-card px-4">
        {items.map(([q, a], i) => (
          <AccordionItem key={i} value={`q${i}`} className="last:border-b-0">
            <AccordionTrigger className="text-left text-base">{q}</AccordionTrigger>
            <AccordionContent className="text-base">{a} {i === 3 && <Link to="/returns" className="underline">სრულად</Link>}</AccordionContent>
          </AccordionItem>
        ))}
      </Accordion>
    </section>
  );
}
