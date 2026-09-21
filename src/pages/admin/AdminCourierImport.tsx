import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { toast } from "@/hooks/use-toast";
import { Upload, Loader2, AlertCircle, CheckCircle2, X, CalendarRange } from "lucide-react";
import ExcelJS from "exceljs";
import { senderIsCustomer, parseCommentItems, normalizePhone } from "@/lib/courierStates";

type Batch = {
  id: string; file_name: string; uploaded_at: string; uploaded_by: string | null;
  total_rows: number; successful_rows: number; error_rows: number;
  new_shipments: number; updated_shipments: number; new_history_rows: number;
  skipped_rows: number; conflict_rows: number; linked_returns: number; unlinked_returns: number;
  covered_from: string | null; covered_to: string | null;
  status: string; errors: any[]; conflicts: any[]; error_message: string | null;
};

const FINAL_STATES = new Set([
  "DELIVERED", "FAILED_FINAL", "RETURNED_FAILED", "CANCELLED_EXCLUDED",
  "RETURN_COLLECTED", "RETURN_FAILED", "RETURN_CANCELLED",
]);

const CHUNK_SIZE = 400;

/** RFC4180-style CSV parser: quotes, embedded commas/newlines, ""-escapes, ; and tab delimiters. */
export function parseCsv(text: string): string[][] {
  const head = text.slice(0, text.indexOf("\n") >= 0 ? text.indexOf("\n") : text.length);
  const counts = { ",": 0, ";": 0, "\t": 0 } as Record<string, number>;
  let inQ0 = false;
  for (const ch of head) {
    if (ch === '"') inQ0 = !inQ0;
    else if (!inQ0 && ch in counts) counts[ch]++;
  }
  const delim = (Object.keys(counts) as string[]).sort((a, b) => counts[b] - counts[a])[0] || ",";

  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQ = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQ) {
      if (ch === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else inQ = false;
      } else field += ch;
      continue;
    }
    if (ch === '"') { inQ = true; continue; }
    if (ch === delim) { row.push(field); field = ""; continue; }
    if (ch === "\r") continue;
    if (ch === "\n") { row.push(field); field = ""; rows.push(row); row = []; continue; }
    field += ch;
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  return rows.filter((r) => r.some((c) => c.trim() !== ""));
}

async function sha256Hex(buf: ArrayBuffer): Promise<string> {
  const h = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(h)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

const KNOWN_HEADERS = [
  "თრექინგი", "შტრიხკოდი", "სტატუსი", "შეკვ. თარიღი", "აღების თარიღი",
  "დას. თარიღი", "გამგზ. სახელი, გვარი", "მიმღ. სახელი, გვარი",
  "მიმღ. ქალაქი", "მიმღ. მისამართი", "მიმღ. ტელეფონი", "კომენტარი",
  "cod - გადახდა კურიერთან", "კომპანიას ერიცხება", "tracking", "status", "phone",
];

function scoreRowAsHeader(row: any[]): number {
  const cells = (row || []).map((c) => String(c ?? "").toLowerCase().trim()).filter(Boolean);
  if (cells.length < 3) return 0;
  let score = 0;
  for (const cell of cells) {
    for (const k of KNOWN_HEADERS) {
      if (cell === k.toLowerCase() || cell.includes(k.toLowerCase())) { score++; break; }
    }
  }
  return score;
}

function findHeaderRowIdx(rows: any[][]): number {
  const limit = Math.min(rows.length, 15);
  let bestIdx = -1, bestScore = 0;
  for (let i = 0; i < limit; i++) {
    const s = scoreRowAsHeader(rows[i]);
    if (s > bestScore) { bestScore = s; bestIdx = i; }
  }
  if (bestIdx >= 0 && bestScore >= 2) return bestIdx;
  return rows.length > 1 ? 1 : 0;
}

function parseDDMMYYYY(v: any): string | null {
  if (v == null || v === "") return null;
  if (v instanceof Date) return isNaN(+v) ? null : v.toISOString();
  const s = String(v).trim();
  const m = s.match(/^(\d{1,2})[.\/\-](\d{1,2})[.\/\-](\d{2,4})(?:[ T](\d{1,2}):(\d{2}))?/);
  if (m) {
    let year = parseInt(m[3]); if (year < 100) year += 2000;
    const d = new Date(Date.UTC(year, parseInt(m[2]) - 1, parseInt(m[1]),
      parseInt(m[4] || "0"), parseInt(m[5] || "0")));
    return isNaN(+d) ? null : d.toISOString();
  }
  const d = new Date(s);
  return isNaN(+d) ? null : d.toISOString();
}

const findCol = (headers: string[], aliases: string[]) => {
  const norm = headers.map((h) => String(h ?? "").toLowerCase().replace(/\s+/g, " ").trim());
  for (const a of aliases) {
    const i = norm.findIndex((h) => h === a.toLowerCase());
    if (i >= 0) return i;
  }
  for (const a of aliases) {
    const i = norm.findIndex((h) => h.includes(a.toLowerCase()));
    if (i >= 0) return i;
  }
  return -1;
};

type Parsed = {
  file_name: string; file_size: number; file_hash: string;
  sheet_names: string[]; headers: string[]; rows: any[][]; header_row_index: number;
  minDate: string | null; maxDate: string | null;
};

type Preview = {
  total: number;
  newCount: number;
  changed: number;
  unchanged: number;
  finalizedIgnored: number;
  conflicts: { tracking: string; stored: string; file: string }[];
  unmatchedOrders: number;
  returnRows: number;
  returnsLinkable: number;
  filteredOut: number;
  duplicateInFile: number;
};

export default function AdminCourierImport() {
  const fileRef = useRef<HTMLInputElement>(null);
  const [batches, setBatches] = useState<Batch[]>([]);
  const [parsing, setParsing] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [lastSummary, setLastSummary] = useState<string | null>(null);
  const [parsed, setParsed] = useState<Parsed | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [onlyFrom, setOnlyFrom] = useState<string>("");
  const [serverError, setServerError] = useState<{ message: string; details?: any } | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [coverage, setCoverage] = useState<{ from: string | null; to: string | null } | null>(null);

  async function load() {
    const { data } = await supabase
      .from("courier_import_batches").select("*")
      .order("uploaded_at", { ascending: false }).limit(50);
    setBatches((data as any) || []);
    const { data: cov } = await supabase
      .from("courier_shipments").select("order_date").not("order_date", "is", null)
      .order("order_date", { ascending: true }).limit(1);
    const { data: cov2 } = await supabase
      .from("courier_shipments").select("order_date").not("order_date", "is", null)
      .order("order_date", { ascending: false }).limit(1);
    setCoverage({
      from: (cov as any)?.[0]?.order_date ?? null,
      to: (cov2 as any)?.[0]?.order_date ?? null,
    });
  }
  useEffect(() => { load(); }, []);

  const lastBatch = batches[0];

  useEffect(() => {
    if (!lastBatch?.covered_from) return;
    const d = new Date(lastBatch.covered_from);
    d.setDate(d.getDate() - 2);
    setOnlyFrom(d.toISOString().slice(0, 10));
  }, [lastBatch?.covered_from]);

  async function parseFile(file: File) {
    setParsing(true);
    setServerError(null); setParsed(null); setPreview(null); setLastSummary(null);
    try {
      const buf = await file.arrayBuffer();
      const hash = await sha256Hex(buf);
      const wb = new ExcelJS.Workbook();
      const isCsv = file.name.toLowerCase().endsWith(".csv");
      let ws: any;
      if (isCsv) {
        const text = new TextDecoder("utf-8").decode(buf).replace(/^\uFEFF/, "");
        const sheet = wb.addWorksheet("csv");
        for (const cells of parseCsv(text)) sheet.addRow(cells);
        ws = sheet;
      } else {
        await wb.xlsx.load(buf);
        ws = wb.worksheets[0];
      }
      if (!ws) throw new Error("Workbook has no sheets");
      const maxCol = ws.columnCount;
      const allRows: any[][] = [];
      for (let r = 1; r <= ws.rowCount; r++) {
        const row = ws.getRow(r);
        const arr: any[] = [];
        for (let c = 1; c <= maxCol; c++) {
          let v: any = row.getCell(c).value;
          if (v && typeof v === "object") {
            if ("richText" in v && Array.isArray((v as any).richText)) v = (v as any).richText.map((t: any) => t.text).join("");
            else if ("text" in v) v = (v as any).text;
            else if ("result" in v) v = (v as any).result;
            else if ("hyperlink" in v) v = (v as any).text || (v as any).hyperlink;
            else if (v instanceof Date) v = v.toISOString();
          }
          arr.push(v == null || v === "" ? null : v);
        }
        allRows.push(arr);
      }
      if (allRows.length < 2) throw new Error("File is empty or has no data rows");
      const headerIdx = findHeaderRowIdx(allRows);
      const headers = (allRows[headerIdx] || []).map((h: any) => String(h ?? ""));
      const dataRows = allRows.slice(headerIdx + 1).filter((r) => r.some((v) => v != null && v !== ""));

      const cOrderDate = findCol(headers, ["შეკვ. თარიღი", "შეკვეთის თარიღი"]);
      let minDate: string | null = null, maxDate: string | null = null;
      if (cOrderDate >= 0) {
        for (const r of dataRows) {
          const d = parseDDMMYYYY(r[cOrderDate]);
          if (!d) continue;
          if (!minDate || d < minDate) minDate = d;
          if (!maxDate || d > maxDate) maxDate = d;
        }
      }

      const p: Parsed = {
        file_name: file.name, file_size: file.size, file_hash: hash,
        sheet_names: wb.worksheets.map((s: any) => s.name),
        headers, rows: dataRows, header_row_index: headerIdx, minDate, maxDate,
      };
      setParsed(p);
      await buildPreview(p);
    } catch (e: any) {
      toast({ title: "Could not parse file", description: e.message || String(e), variant: "destructive" });
    } finally {
      setParsing(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function buildPreview(p: Parsed) {
    setPreviewing(true);
    try {
      const h = p.headers;
      const cTrack = findCol(h, ["თრექინგი", "შტრიხკოდი", "tracking"]);
      const cStatus = findCol(h, ["სტატუსი", "status"]);
      const cSender = findCol(h, ["გამგზ. სახელი, გვარი", "sender"]);
      const cOrderNo = findCol(h, ["შეკვეთის ნომერი", "order_number"]);
      const cOrderDate = findCol(h, ["შეკვ. თარიღი"]);
      const cPhone = findCol(h, ["მიმღ. ტელეფონი", "ტელეფონი"]);
      const cComment = findCol(h, ["კომენტარი", "comment"]);
      if (cTrack < 0 || cStatus < 0) throw new Error("Tracking or status column not found");

      const from = onlyFrom ? new Date(onlyFrom).toISOString() : null;
      const seen = new Set<string>();
      let duplicateInFile = 0, filteredOut = 0, returnRows = 0;
      const rows: { tracking: string; status: string; isReturn: boolean; orderNo: string | null; phone: string | null }[] = [];

      for (const r of p.rows) {
        const tracking = String(r[cTrack] ?? "").trim();
        if (!tracking) continue;
        if (seen.has(tracking)) { duplicateInFile++; continue; }
        seen.add(tracking);
        const od = cOrderDate >= 0 ? parseDDMMYYYY(r[cOrderDate]) : null;
        if (from && od && od < from) { filteredOut++; continue; }
        const sender = cSender >= 0 ? String(r[cSender] ?? "").trim() : "";
        const isReturn = senderIsCustomer(sender);
        if (isReturn) returnRows++;
        rows.push({
          tracking,
          status: String(r[cStatus] ?? "").trim(),
          isReturn,
          orderNo: cOrderNo >= 0 ? String(r[cOrderNo] ?? "").trim() || null : null,
          phone: normalizePhone(cPhone >= 0 ? String(r[cPhone] ?? "") : isReturn ? sender : ""),
        });
        if (cComment >= 0) parseCommentItems(String(r[cComment] ?? ""));
      }

      // existing shipments
      const existing = new Map<string, { status: string; state: string | null }>();
      for (let i = 0; i < rows.length; i += 400) {
        const slice = rows.slice(i, i + 400).map((r) => r.tracking);
        const { data } = await supabase
          .from("courier_shipments")
          .select("tracking_number, current_courier_status, derived_state")
          .in("tracking_number", slice);
        for (const s of (data as any[]) || []) {
          existing.set(s.tracking_number, { status: s.current_courier_status || "", state: s.derived_state });
        }
      }

      let newCount = 0, changed = 0, unchanged = 0, finalizedIgnored = 0;
      const conflicts: Preview["conflicts"] = [];
      for (const r of rows) {
        const ex = existing.get(r.tracking);
        if (!ex) { newCount++; continue; }
        const isFinal = ex.state ? FINAL_STATES.has(ex.state) : false;
        if (isFinal) {
          finalizedIgnored++;
          if (ex.status !== r.status) conflicts.push({ tracking: r.tracking, stored: ex.status, file: r.status });
          continue;
        }
        if (ex.status !== r.status) changed++; else unchanged++;
      }

      // unmatched to a Lovable order (outbound only, by order number)
      const orderNos = [...new Set(rows.filter((r) => !r.isReturn && r.orderNo).map((r) => r.orderNo!))];
      const foundNos = new Set<string>();
      for (let i = 0; i < orderNos.length; i += 400) {
        const { data } = await supabase.from("orders")
          .select("public_order_number").in("public_order_number", orderNos.slice(i, i + 400));
        for (const o of (data as any[]) || []) foundNos.add(o.public_order_number);
      }
      const unmatchedOrders = orderNos.filter((n) => !foundNos.has(n)).length
        + rows.filter((r) => !r.isReturn && !r.orderNo).length;

      // returns that can be linked by phone
      const returnPhones = [...new Set(rows.filter((r) => r.isReturn && r.phone).map((r) => r.phone!))];
      const linkablePhones = new Set<string>();
      for (let i = 0; i < returnPhones.length; i += 400) {
        const { data } = await supabase.from("courier_shipments")
          .select("phone_normalized").eq("is_return", false)
          .in("phone_normalized", returnPhones.slice(i, i + 400));
        for (const s of (data as any[]) || []) linkablePhones.add(s.phone_normalized);
      }
      const returnsLinkable = rows.filter((r) => r.isReturn && r.phone && linkablePhones.has(r.phone)).length;

      setPreview({
        total: rows.length, newCount, changed, unchanged, finalizedIgnored,
        conflicts: conflicts.slice(0, 50), unmatchedOrders, returnRows, returnsLinkable,
        filteredOut, duplicateInFile,
      });
    } catch (e: any) {
      toast({ title: "Preview failed", description: e.message || String(e), variant: "destructive" });
    } finally {
      setPreviewing(false);
    }
  }

  /** Invoke the import function and surface the REAL server error body (invoke() drops it on non-2xx). */
  async function callImport(body: any): Promise<any> {
    const { data, error } = await supabase.functions.invoke("import-courier", { body });
    if (error) {
      let serverBody: any = null;
      try { serverBody = await (error as any)?.context?.json?.(); } catch { /* not json */ }
      const err: any = new Error(serverBody?.message || error.message || "Edge function failed");
      err.stage = serverBody?.details?.stage;
      err.details = serverBody?.details;
      throw err;
    }
    if (!data?.success) {
      const err: any = new Error(data?.message || "Import failed");
      err.stage = data?.details?.stage;
      err.details = data?.details;
      throw err;
    }
    return data;
  }

  async function confirmImport() {
    if (!parsed) return;
    setUploading(true); setServerError(null); setProgress(0);
    let batchId: string | null = null;
    try {
      const sBody = await callImport({
        mode: "start",
        file_name: parsed.file_name, file_hash: parsed.file_hash, file_size: parsed.file_size,
        total_rows: parsed.rows.length,
        covered_from: parsed.minDate ? parsed.minDate.slice(0, 10) : null,
        covered_to: parsed.maxDate ? parsed.maxDate.slice(0, 10) : null,
      });
      if (sBody.details?.deduped) {
        toast({ title: "Already imported", description: sBody.message });
        setParsed(null); setPreview(null); await load();
        return;
      }
      batchId = sBody.details.batch_id;

      const totals = { new: 0, updated: 0, unchanged: 0, ignored: 0, conflicts: 0, linked: 0, unlinked: 0, orders: 0 };
      const chunks: any[][][] = [];
      for (let i = 0; i < parsed.rows.length; i += CHUNK_SIZE) chunks.push(parsed.rows.slice(i, i + CHUNK_SIZE));

      for (let i = 0; i < chunks.length; i++) {
        const body = await callImport({
          mode: "chunk", batch_id: batchId,
          headers: parsed.headers, rows: chunks[i],
          only_from: onlyFrom ? new Date(onlyFrom).toISOString() : null,
        });
        const d = body.details;
        totals.new += d.new; totals.updated += d.updated; totals.unchanged += d.unchanged;
        totals.ignored += d.ignored_final; totals.conflicts += d.conflicts;
        totals.linked += d.linked_returns; totals.unlinked += d.unlinked_returns;
        totals.orders += d.orders_updated;
        setProgress(Math.round(((i + 1) / chunks.length) * 100));
      }

      await supabase.functions.invoke("import-courier", { body: { mode: "finalize", batch_id: batchId } });

      const summary =
        `${totals.new} new, ${totals.updated} updated, ${totals.unchanged} unchanged, ` +
        `${totals.ignored} finalized ignored, ${totals.conflicts} conflicts, ` +
        `${totals.linked} returns linked (${totals.unlinked} unlinked), ${totals.orders} orders synced`;
      setLastSummary(summary);
      toast({ title: "Import complete", description: summary });
      setParsed(null); setPreview(null);
      await load();
    } catch (e: any) {
      const stage = e?.stage ? ` (stage: ${e.stage})` : "";
      const msg = `${e?.message || String(e)}${stage}`;
      if (batchId) {
        // keep_existing_error: never overwrite a specific server-side message with a generic one
        await supabase.functions.invoke("import-courier", {
          body: {
            mode: "finalize", batch_id: batchId, failed: true,
            error_message: msg, keep_existing_error: !e?.stage,
          },
        });
      }
      setServerError({ message: e?.message || String(e), details: { stage: e?.stage, ...(e?.details || {}) } });
      toast({ title: "Import failed", description: msg, variant: "destructive" });
      await load();
    } finally {
      setUploading(false);
    }
  }

  const fmt = (d: string | null | undefined) => (d ? new Date(d).toLocaleDateString("ka-GE") : "—");

  const coverageText = useMemo(() => {
    if (!coverage?.from) return "ჯერ არაფერია იმპორტირებული";
    return `${fmt(coverage.from)} — ${fmt(coverage.to)}`;
  }, [coverage]);

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-extrabold">Courier Import</h1>
        <p className="text-sm text-muted-foreground">
          ატვირთე კურიერის ფაილი (.xlsx / .csv). დასრულებული გზავნილები აღარასდროს იცვლება.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><CalendarRange className="w-4 h-4" />ბოლო ატვირთვა</CardTitle></CardHeader>
          <CardContent className="text-sm">
            {lastBatch ? (
              <>
                <div className="font-semibold">{fmt(lastBatch.covered_from)} — {fmt(lastBatch.covered_to)}</div>
                <div className="text-xs text-muted-foreground">{new Date(lastBatch.uploaded_at).toLocaleString()} · {lastBatch.total_rows} row</div>
              </>
            ) : "—"}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">სრული დაფარვა</CardTitle></CardHeader>
          <CardContent className="text-sm font-semibold">{coverageText}</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">ფაილის პერიოდი</CardTitle></CardHeader>
          <CardContent className="text-sm font-semibold">
            {parsed ? `${fmt(parsed.minDate)} — ${fmt(parsed.maxDate)}` : "—"}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Upload</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <input ref={fileRef} type="file" accept=".xlsx,.csv" className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) parseFile(f); }} />
          <div className="flex gap-2 flex-wrap items-end">
            <Button onClick={() => fileRef.current?.click()} disabled={parsing || uploading} size="lg">
              {parsing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
              {parsing ? "ფაილი იკითხება..." : "აირჩიე ფაილი"}
            </Button>
            <div>
              <Label className="text-xs">მხოლოდ ამ თარიღიდან</Label>
              <Input type="date" value={onlyFrom} onChange={(e) => setOnlyFrom(e.target.value)} className="w-44" />
            </div>
            {parsed && (
              <Button variant="ghost" onClick={() => { setParsed(null); setPreview(null); setServerError(null); }}>
                <X className="w-4 h-4" /> Cancel
              </Button>
            )}
          </div>
          {uploading && (
            <div className="space-y-1">
              <Progress value={progress} />
              <div className="text-xs text-muted-foreground">{progress}% — იმპორტი მიმდინარეობს</div>
            </div>
          )}
          {lastSummary && (
            <Alert className="border-green-300 bg-green-50">
              <CheckCircle2 className="w-4 h-4 text-green-700" />
              <AlertTitle className="text-green-900">იმპორტი დასრულდა</AlertTitle>
              <AlertDescription className="text-green-900 text-sm">{lastSummary}</AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>

      {serverError && (
        <Alert variant="destructive">
          <AlertCircle className="w-4 h-4" />
          <AlertTitle>{serverError.message}</AlertTitle>
        </Alert>
      )}

      {parsed && (
        <Card className="border-blue-300">
          <CardHeader><CardTitle className="text-base">Import Preview</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            {previewing && <div className="flex items-center gap-2 text-sm"><Loader2 className="w-4 h-4 animate-spin" /> ითვლება...</div>}
            {preview && (
              <>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                  {[
                    ["სულ რიგი", preview.total, ""],
                    ["ახალი", preview.newCount, "text-green-700"],
                    ["შეიცვლება", preview.changed, "text-blue-700"],
                    ["უცვლელი", preview.unchanged, "text-muted-foreground"],
                    ["დასრულებული (იგნორი)", preview.finalizedIgnored, "text-zinc-600"],
                    ["კონფლიქტი", preview.conflicts.length, "text-amber-700"],
                    ["შეკვეთას ვერ მიება", preview.unmatchedOrders, "text-orange-700"],
                    ["დაბრუნება (მიება/სულ)", `${preview.returnsLinkable}/${preview.returnRows}`, ""],
                  ].map(([label, value, cls]) => (
                    <div key={String(label)} className="rounded border p-3">
                      <div className="text-xs text-muted-foreground">{label}</div>
                      <div className={`text-xl font-bold ${cls}`}>{value as any}</div>
                    </div>
                  ))}
                </div>
                {(preview.filteredOut > 0 || preview.duplicateInFile > 0) && (
                  <p className="text-xs text-muted-foreground">
                    {preview.filteredOut} რიგი გაფილტრულია თარიღით, {preview.duplicateInFile} დუბლიკატი ფაილში.
                  </p>
                )}
                {preview.conflicts.length > 0 && (
                  <div className="border rounded overflow-auto max-h-56">
                    <Table>
                      <TableHeader><TableRow>
                        <TableHead>Tracking</TableHead><TableHead>ბაზაში</TableHead><TableHead>ფაილში</TableHead>
                      </TableRow></TableHeader>
                      <TableBody>
                        {preview.conflicts.map((c) => (
                          <TableRow key={c.tracking}>
                            <TableCell className="font-mono text-xs">{c.tracking}</TableCell>
                            <TableCell className="text-xs">{c.stored}</TableCell>
                            <TableCell className="text-xs">{c.file}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </>
            )}
            <div className="flex gap-2 pt-2">
              <Button onClick={confirmImport} disabled={uploading || previewing} size="lg">
                {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                დაადასტურე იმპორტი ({preview?.total ?? parsed.rows.length})
              </Button>
              <Button variant="outline" onClick={() => { setParsed(null); setPreview(null); }} disabled={uploading}>Cancel</Button>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader><CardTitle className="text-base">Import History</CardTitle></CardHeader>
        <CardContent className="p-0 overflow-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead><TableHead>File</TableHead><TableHead>Coverage</TableHead>
                <TableHead className="text-right">Rows</TableHead><TableHead className="text-right">New</TableHead>
                <TableHead className="text-right">Updated</TableHead><TableHead className="text-right">Skipped</TableHead>
                <TableHead className="text-right">Conflicts</TableHead><TableHead className="text-right">Returns</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {batches.map((b) => (
                <>
                  <TableRow key={b.id} className="cursor-pointer" onClick={() => setExpanded(expanded === b.id ? null : b.id)}>
                    <TableCell className="whitespace-nowrap">{new Date(b.uploaded_at).toLocaleString()}</TableCell>
                    <TableCell className="font-mono text-xs">{b.file_name}</TableCell>
                    <TableCell className="text-xs">{fmt(b.covered_from)} — {fmt(b.covered_to)}</TableCell>
                    <TableCell className="text-right">{b.total_rows}</TableCell>
                    <TableCell className="text-right text-green-700 font-semibold">{b.new_shipments}</TableCell>
                    <TableCell className="text-right text-blue-700">{b.updated_shipments}</TableCell>
                    <TableCell className="text-right text-muted-foreground">{b.skipped_rows ?? 0}</TableCell>
                    <TableCell className="text-right text-amber-700">{b.conflict_rows ?? 0}</TableCell>
                    <TableCell className="text-right">{b.linked_returns ?? 0}/{(b.linked_returns ?? 0) + (b.unlinked_returns ?? 0)}</TableCell>
                    <TableCell>
                      <span className={`text-xs px-2 py-0.5 rounded border ${
                        b.status === "completed" ? "bg-green-100 text-green-800 border-green-300"
                        : b.status === "failed" ? "bg-red-100 text-red-800 border-red-300"
                        : "bg-amber-100 text-amber-800 border-amber-300"}`}>{b.status}</span>
                    </TableCell>
                  </TableRow>
                  {expanded === b.id && (
                    <TableRow key={b.id + "-x"}>
                      <TableCell colSpan={10} className="bg-muted/40">
                        {b.error_message && <div className="text-xs text-red-700 mb-2">{b.error_message}</div>}
                        <pre className="text-xs overflow-auto max-h-64">
                          {JSON.stringify({ conflicts: b.conflicts, errors: b.errors }, null, 2)}
                        </pre>
                      </TableCell>
                    </TableRow>
                  )}
                </>
              ))}
              {batches.length === 0 && (
                <TableRow><TableCell colSpan={10} className="text-center text-muted-foreground py-8">No imports yet</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
