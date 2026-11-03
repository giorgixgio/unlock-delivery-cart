import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Loader2, RefreshCw } from "lucide-react";
import { tbilisiDayKey } from "@/lib/tbilisiTime";
import { summarizeDay, bucketOf, changedInRange, changedAt, type Bucket, type Tally, type TodayShipment } from "@/lib/courierToday";
import { STATE_LABEL, STATE_BADGE } from "@/lib/courierStates";

const COLS = "tracking_number, order_number, current_courier_status, derived_state, is_return, customer_name, phone, city, cod_amount, company_receives, latest_status_date, status_changed_at, final_status_date, created_at";
const PAGE = 50;
const P = (v: number | null) => (v == null ? "—" : `${Math.round(v * 100)}%`);
const R = (v: number | null) => (v == null ? "—" : `${v.toFixed(1)} : 1`);

const gel = (n: number) => `${Math.round(n).toLocaleString("en-US")} ₾`;
const time = (iso: string | null) =>
  iso ? new Intl.DateTimeFormat("ka-GE", { timeZone: "Asia/Tbilisi", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }).format(new Date(iso)) : "—";

type Filter = { kind: "today"; bucket: Bucket } | { kind: "status"; status: string } | { kind: "open" } | null;

export default function AdminCourierToday() {
  const [day, setDay] = useState(() => tbilisiDayKey(new Date()));
  const [to, setTo] = useState(() => tbilisiDayKey(new Date()));
  const [page, setPage] = useState(0);
  const [filter, setFilter] = useState<Filter>(null);
  const [q, setQ] = useState("");

  const { data, isFetching, refetch, dataUpdatedAt, error } = useQuery({
    queryKey: ["courier-today", day, to],
    refetchInterval: 2 * 60 * 1000,
    queryFn: async () => {
      // Open parcels (no final status) + anything that changed in the last 3 days.
      const since = new Date(`${day}T00:00:00+04:00`);
      since.setUTCDate(since.getUTCDate() - 3);
      const out: TodayShipment[] = [];
      for (let p = 0; ; p++) {
        const { data, error } = await supabase
          .from("courier_shipments")
          .select(COLS)
          .eq("is_return", false)
          .eq("source", "api") // only parcels sent via the Onway API (Nov 3+)
          .or(`final_status_date.is.null,latest_status_date.gte.${since.toISOString()},status_changed_at.gte.${since.toISOString()}`)
          .order("tracking_number")
          .range(p * 1000, p * 1000 + 999);
        if (error) throw error;
        out.push(...((data as any) || []));
        if (!data || data.length < 1000) break;
      }
      return out;
    },
  });

  const list = data || [];
  const sum = useMemo(() => summarizeDay(list, day, to), [list, day, to]);

  const rows = useMemo(() => {
    let r = list;
    if (filter?.kind === "today") r = r.filter((s) => bucketOf(s) === filter.bucket && changedInRange(s, day, to));
    else if (filter?.kind === "status") r = r.filter((s) => (s.current_courier_status || "—").trim() === filter.status && ["in_progress", "failed_attempt"].includes(bucketOf(s)));
    else if (filter?.kind === "open") r = r.filter((s) => ["in_progress", "failed_attempt"].includes(bucketOf(s)));
    else r = r.filter((s) => changedInRange(s, day, to));
    const t = q.trim().toLowerCase();
    if (t) r = r.filter((s) => [s.tracking_number, s.order_number, s.customer_name, s.phone, s.city].some((v) => v?.toLowerCase().includes(t)));
    return [...r].sort((a, b) => (changedAt(b) || "").localeCompare(changedAt(a) || ""));
  }, [list, filter, q, day, to]);
  useEffect(() => setPage(0), [filter, q, day, to]);
  const pages = Math.max(1, Math.ceil(rows.length / PAGE));

  const Tile = ({ label, t, bucket, tone }: { label: string; t: Tally; bucket: Bucket; tone: string }) => (
    <button
      onClick={() => setFilter({ kind: "today", bucket })}
      className={`rounded-lg border p-4 text-left transition hover:shadow ${tone} ${filter?.kind === "today" && filter.bucket === bucket ? "ring-2 ring-primary" : ""}`}
    >
      <div className="text-sm font-medium">{label}</div>
      <div className="text-3xl font-bold">{t.count}</div>
      <div className="text-sm opacity-90">{gel(t.net)}</div>
      <div className="text-xs opacity-60">შეკვეთა {gel(t.cod)}</div>
    </button>
  );

  return (
    <div className="space-y-4 p-4 max-w-[1280px]">
      <div className="flex flex-wrap items-end gap-3">
        <div className="mr-auto">
          <h1 className="text-2xl font-bold">Onway — {day === to ? day : `${day} — ${to}`}</h1>
          <p className="text-xs text-muted-foreground">მხოლოდ API-ით გაგზავნილი ამანათები</p>
          <p className="text-xs text-muted-foreground">
            თანხა = <span className="font-medium">კომპანიას ერიცხება</span> (Onway-ის გადასახადის გარეშე) · ფურცლის ქვევით ჩანს შეკვეთის თანხაც
          </p>
          <p className="text-sm text-muted-foreground">
            განახლდა: {dataUpdatedAt ? time(new Date(dataUpdatedAt).toISOString()) : "—"} · ავტომატურად ყოველ 2 წუთში
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Input type="date" value={day} onChange={(e) => { const v = e.target.value; if (!v) return; setDay(v); if (v > to) setTo(v); }} className="w-40" />
          <span>—</span>
          <Input type="date" value={to} onChange={(e) => { const v = e.target.value; if (!v) return; setTo(v); if (v < day) setDay(v); }} className="w-40" />
          <Button variant="outline" size="sm" onClick={() => { const t = tbilisiDayKey(new Date()); setDay(t); setTo(t); }}>დღეს</Button>
          <Button variant="outline" size="sm" onClick={() => { const t = tbilisiDayKey(new Date()); const d = new Date(`${t}T12:00:00+04:00`); d.setUTCDate(d.getUTCDate() - 6); setDay(tbilisiDayKey(d)); setTo(t); }}>7 დღე</Button>
        </div>
        <Button onClick={() => refetch()} disabled={isFetching} size="lg">
          {isFetching ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />} განახლება
        </Button>
      </div>

      {error && <div className="rounded border border-destructive p-3 text-destructive">შეცდომა: {(error as Error).message}</div>}
      {!data && isFetching ? (
        <div className="flex justify-center p-10"><Loader2 className="h-6 w-6 animate-spin" /></div>
      ) : (
        <>
          <div className="text-sm font-semibold text-muted-foreground">სტატუსი შეიცვალა ამ დღეს</div>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Tile label="ჩაბარდა ✓" t={sum.today.delivered} bucket="delivered" tone={STATE_BADGE.DELIVERED} />
            <Tile label="ვერ ჩაბარდა (ისევ გავა)" t={sum.today.failed_attempt} bucket="failed_attempt" tone={STATE_BADGE.FAILED_ATTEMPT} />
            <Tile label="საბოლოოდ ვერ ჩაბარდა" t={sum.today.failed_final} bucket="failed_final" tone={STATE_BADGE.FAILED_FINAL} />
            <Tile label="გაუქმდა" t={sum.today.cancelled} bucket="cancelled" tone={STATE_BADGE.CANCELLED_EXCLUDED} />
          </div>
          <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
            {([
              ["ჩაბარდა / (ჩაბარდა + საბ. ვერ)", P(sum.rates.deliveredOfDecided)],
              ["ჩაბარდა / ყველა მცდელობა", P(sum.rates.deliveredOfAttempts)],
              ["ჩაბარდა / ყველა ცვლილება", P(sum.rates.deliveredOfAll)],
              ["საბოლოოდ ვერ / (ჩაბარდა + საბ. ვერ)", P(sum.rates.failedFinalOfDecided)],
              ["ვერ ჩაბარდა (ისევ გავა) / ყველა", P(sum.rates.failedAttemptOfAll)],
              ["გაუქმდა / ყველა", P(sum.rates.cancelledOfAll)],
              ["ჩაბარდა : ყველა ჩავარდნა", R(sum.rates.deliveredToFailedRatio)],
              ["ჩაბარდა : საბოლოოდ ვერ", R(sum.rates.deliveredToFinalRatio)],
            ] as const).map(([l, v]) => (
              <div key={l} className="rounded-lg border bg-card p-3">
                <div className="text-xs text-muted-foreground">{l}</div>
                <div className="text-2xl font-bold">{v}</div>
              </div>
            ))}
          </div>
          <div className="text-xs text-muted-foreground">ყველა ცვლილება ამ პერიოდში: {sum.totalChanged}</div>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center justify-between text-lg">
                <span>ახლა გზაშია / ღიაა</span>
                <button className="text-base underline" onClick={() => setFilter({ kind: "open" })}>
                  {sum.open.count} ამანათი · {gel(sum.open.net)}
                </button>
              </CardTitle>
              <p className="text-xs text-muted-foreground">კომპანიას ერიცხება · შეკვეთების თანხა {gel(sum.open.cod)}</p>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-2">
              {sum.byStatus.map((r) => (
                <button
                  key={r.status}
                  onClick={() => setFilter({ kind: "status", status: r.status })}
                  className={`rounded-md border px-3 py-2 text-left ${STATE_BADGE[r.bucket === "failed_attempt" ? "FAILED_ATTEMPT" : "IN_PROGRESS"]} ${filter?.kind === "status" && filter.status === r.status ? "ring-2 ring-primary" : ""}`}
                >
                  <div className="text-sm">{r.status}</div>
                  <div className="font-bold">{r.count} · {gel(r.net)}</div>
                  <div className="text-xs opacity-70">შეკვეთა {gel(r.cod)}</div>
                </button>
              ))}
              {!sum.byStatus.length && <div className="text-muted-foreground">ღია ამანათი არ არის</div>}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <div className="flex flex-wrap items-center gap-2">
                <CardTitle className="mr-auto text-lg">
                  {filter ? "ფილტრი" : "პერიოდის ყველა ცვლილება"} ({rows.length})
                </CardTitle>
                {filter && <Button variant="outline" size="sm" onClick={() => setFilter(null)}>ფილტრის მოხსნა</Button>}
                <Input placeholder="ძებნა: ტრეკინგი, შეკვეთა, ტელეფონი, ქალაქი" value={q} onChange={(e) => setQ(e.target.value)} className="w-72" />
              </div>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>შეკვეთა</TableHead><TableHead>ტრეკინგი</TableHead><TableHead>Onway სტატუსი</TableHead>
                    <TableHead>მდგომარეობა</TableHead><TableHead>ქალაქი</TableHead><TableHead>კლიენტი</TableHead>
                    <TableHead className="text-right">კომპანიას ერიცხება</TableHead><TableHead>შეიცვალა</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.slice(page * PAGE, page * PAGE + PAGE).map((s) => (
                    <TableRow key={s.tracking_number}>
                      <TableCell>{s.order_number || "—"}</TableCell>
                      <TableCell className="font-mono text-xs">{s.tracking_number}</TableCell>
                      <TableCell>{s.current_courier_status || "—"}</TableCell>
                      <TableCell>
                        <span className={`rounded border px-2 py-0.5 text-xs ${STATE_BADGE[s.derived_state || ""] || ""}`}>
                          {STATE_LABEL[s.derived_state || ""] || s.derived_state || "—"}
                        </span>
                      </TableCell>
                      <TableCell>{s.city || "—"}</TableCell>
                      <TableCell>{s.customer_name || "—"}<div className="text-xs text-muted-foreground">{s.phone}</div></TableCell>
                      <TableCell className="text-right">{gel(Number(s.company_receives) || 0)}<div className="text-xs text-muted-foreground">შეკვეთა {gel(Number(s.cod_amount) || 0)}</div></TableCell>
                      <TableCell className="whitespace-nowrap text-xs">{time(changedAt(s))}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              {rows.length > PAGE && (
                <div className="flex items-center justify-center gap-3 p-3">
                  <Button variant="outline" disabled={page === 0} onClick={() => setPage(page - 1)}>← წინა</Button>
                  <span className="text-sm">{page + 1} / {pages}</span>
                  <Button variant="outline" disabled={page >= pages - 1} onClick={() => setPage(page + 1)}>შემდეგი →</Button>
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
