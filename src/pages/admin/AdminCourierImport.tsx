import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { toast } from "@/hooks/use-toast";
import { Upload, Loader2, AlertCircle, CheckCircle2, X } from "lucide-react";
import ExcelJS from "exceljs";

type Batch = {
  id: string; file_name: string; uploaded_at: string; uploaded_by: string | null;
  total_rows: number; successful_rows: number; error_rows: number;
  new_shipments: number; updated_shipments: number; new_history_rows: number;
  skipped_rows: number;
  possible_returns: number; auto_linked_returns: number;
  status: string; errors: any[];
};

type Stage = "idle" | "parsing" | "checking" | "importing" | "done";

type Parsed = {
  file_name: string;
  file_size: number;
  file_hash: string;
  sheet_names: string[];
  headers: string[];
  rows: any[][];
  header_row_index: number;
};

async function sha256Hex(buf: ArrayBuffer): Promise<string> {
  const h = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(h)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

const KNOWN_HEADERS = [
  "თრექინგი", "შტრიხკოდი", "სტატუსი", "შეკვ. თარიღი", "აღების თარიღი",
  "დას. თარიღი", "გამგზ. სახელი, გვარი", "მიმღ. სახელი, გვარი",
  "მიმღ. ქალაქი", "მიმღ. მისამართი", "მიმღ. ტელეფონი",
  "cod - გადახდა კურიერთან", "კომპანიას ერიცხება",
  "tracking", "tracking_number", "status", "phone",
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
  // Fallback for this courier export: row 1 is a title, real headers are in row 2.
  return rows.length > 1 ? 1 : 0;
}

export default function AdminCourierImport() {
  const fileRef = useRef<HTMLInputElement>(null);
  const [batches, setBatches] = useState<Batch[]>([]);
  const [parsing, setParsing] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [stage, setStage] = useState<Stage>("idle");
  const [lastSummary, setLastSummary] = useState<string | null>(null);
  const [parsed, setParsed] = useState<Parsed | null>(null);
  const [serverError, setServerError] = useState<{ message: string; details?: any } | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);

  async function load() {
    const { data } = await supabase
      .from("courier_import_batches")
      .select("*")
      .order("uploaded_at", { ascending: false })
      .limit(50);
    setBatches((data as any) || []);
  }
  useEffect(() => { load(); }, []);

  async function parseFile(file: File) {
    setParsing(true);
    setStage("parsing");
    setServerError(null);
    setParsed(null);
    setLastSummary(null);
    try {
      const buf = await file.arrayBuffer();
      const hash = await sha256Hex(buf);
      const wb = new ExcelJS.Workbook();
      await wb.xlsx.load(buf);
      const ws = wb.worksheets[0];
      if (!ws) throw new Error("Workbook has no sheets");
      const sheetNames = wb.worksheets.map((s) => s.name);
      const maxCol = ws.columnCount;
      const allRows: any[][] = [];
      // ExcelJS rows are 1-indexed; eachRow skips empty rows so we iterate manually.
      for (let r = 1; r <= ws.rowCount; r++) {
        const row = ws.getRow(r);
        const arr: any[] = [];
        for (let c = 1; c <= maxCol; c++) {
          const cell = row.getCell(c);
          let v: any = cell.value;
          // Unwrap rich text / formula / hyperlink shapes
          if (v && typeof v === "object") {
            if ("richText" in v && Array.isArray((v as any).richText)) {
              v = (v as any).richText.map((rt: any) => rt.text).join("");
            } else if ("text" in v) {
              v = (v as any).text;
            } else if ("result" in v) {
              v = (v as any).result;
            } else if ("hyperlink" in v) {
              v = (v as any).text || (v as any).hyperlink;
            } else if (v instanceof Date) {
              v = v.toISOString();
            }
          }
          arr.push(v == null || v === "" ? null : v);
        }
        allRows.push(arr);
      }
      if (allRows.length < 2) throw new Error("File is empty or has no data rows");
      const headerIdx = findHeaderRowIdx(allRows);
      const headers = (allRows[headerIdx] || []).map((h: any) => String(h ?? ""));
      const dataRows = allRows.slice(headerIdx + 1);
      setParsed({
        file_name: file.name,
        file_size: file.size,
        file_hash: hash,
        sheet_names: sheetNames,
        headers,
        rows: dataRows,
        header_row_index: headerIdx,
      });
    } catch (e: any) {
      toast({ title: "Could not parse file", description: e.message || String(e), variant: "destructive" });
    } finally {
      setParsing(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function confirmImport() {
    if (!parsed) return;
    setUploading(true);
    setServerError(null);
    try {
      const { data, error } = await supabase.functions.invoke("import-courier", {
        body: {
          file_name: parsed.file_name,
          file_size: parsed.file_size,
          file_hash: parsed.file_hash,
          sheet_names: parsed.sheet_names,
          headers: parsed.headers,
          rows: parsed.rows,
        },
      });

      // supabase-js returns the JSON body in `data` even for non-2xx, but `error` is set.
      // FunctionsHttpError exposes .context.response — read it to surface real message.
      if (error) {
        let serverBody: any = data;
        const ctxResp = (error as any)?.context?.response;
        if (!serverBody && ctxResp && typeof ctxResp.json === "function") {
          try { serverBody = await ctxResp.json(); } catch { /* ignore */ }
        }
        const msg = serverBody?.message || (error as any).message || "Edge function failed";
        setServerError({ message: msg, details: serverBody?.details });
        toast({ title: "Import failed", description: msg, variant: "destructive" });
        return;
      }

      const body = data as any;
      if (!body?.success) {
        setServerError({ message: body?.message || "Unknown error", details: body?.details });
        toast({ title: "Import failed", description: body?.message || "Unknown error", variant: "destructive" });
        return;
      }

      toast({ title: "Import complete", description: body.message });
      setParsed(null);
      await load();
    } catch (e: any) {
      setServerError({ message: e?.message || String(e) });
      toast({ title: "Network error", description: e?.message || String(e), variant: "destructive" });
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-extrabold">Courier Import</h1>
        <p className="text-sm text-muted-foreground">Upload courier export Excel. History is preserved per tracking number.</p>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Upload .xlsx</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <input
            ref={fileRef} type="file" accept=".xlsx" className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) parseFile(f); }}
          />
          <div className="flex gap-2 flex-wrap">
            <Button onClick={() => fileRef.current?.click()} disabled={parsing || uploading} size="lg">
              {parsing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
              {parsing ? "ფაილი იკითხება..." : "აირჩიე ფაილი"}
            </Button>
            {parsed && (
              <Button variant="ghost" onClick={() => { setParsed(null); setServerError(null); }}>
                <X className="w-4 h-4" /> Cancel
              </Button>
            )}
          </div>
          <p className="text-xs text-muted-foreground">იგივე ფაილის ხელახლა ატვირთვა უსაფრთხოა — დუბლიკატები არ შეიქმნება.</p>
        </CardContent>
      </Card>

      {serverError && (
        <Alert variant="destructive">
          <AlertCircle className="w-4 h-4" />
          <AlertTitle>{serverError.message}</AlertTitle>
          {serverError.details && (
            <AlertDescription>
              <pre className="text-xs whitespace-pre-wrap mt-2 max-h-60 overflow-auto">
                {JSON.stringify(serverError.details, null, 2)}
              </pre>
            </AlertDescription>
          )}
        </Alert>
      )}

      {parsed && (
        <Card className="border-blue-300">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-blue-600" /> Import Preview
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
              <div><div className="text-muted-foreground text-xs">File</div><div className="font-mono">{parsed.file_name}</div></div>
              <div><div className="text-muted-foreground text-xs">Size</div><div>{(parsed.file_size / 1024).toFixed(1)} KB</div></div>
              <div><div className="text-muted-foreground text-xs">Sheets</div><div>{parsed.sheet_names.join(", ")}</div></div>
              <div><div className="text-muted-foreground text-xs">Data Rows</div><div className="font-bold">{parsed.rows.length}</div></div>
            </div>

            <div>
              <div className="text-xs font-semibold mb-2">Detected headers ({parsed.headers.length}, row {parsed.header_row_index + 1}):</div>
              <div className="flex flex-wrap gap-1.5">
                {parsed.headers.map((h, i) => (
                  <span key={i} className="text-[11px] px-2 py-0.5 rounded bg-muted border font-mono">{i}: {h || "—"}</span>
                ))}
              </div>
            </div>

            <div>
              <div className="text-xs font-semibold mb-2">First 5 rows:</div>
              <div className="overflow-auto border rounded max-h-80">
                <Table>
                  <TableHeader>
                    <TableRow>
                      {parsed.headers.map((h, i) => (
                        <TableHead key={i} className="text-xs whitespace-nowrap">{h || `col_${i}`}</TableHead>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {parsed.rows.slice(0, 5).map((r, ri) => (
                      <TableRow key={ri}>
                        {parsed.headers.map((_, i) => (
                          <TableCell key={i} className="text-xs whitespace-nowrap">
                            {r[i] == null ? "—" : String(r[i])}
                          </TableCell>
                        ))}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>

            <div className="flex gap-2 pt-2">
              <Button onClick={confirmImport} disabled={uploading} size="lg">
                {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                {uploading ? "იმპორტი მიმდინარეობს..." : `დაადასტურე იმპორტი (${parsed.rows.length} row)`}
              </Button>
              <Button variant="outline" onClick={() => setParsed(null)} disabled={uploading}>
                Cancel
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader><CardTitle className="text-base">Import History</CardTitle></CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>File</TableHead>
                <TableHead className="text-right">Rows</TableHead>
                <TableHead className="text-right">New</TableHead>
                <TableHead className="text-right">Updated</TableHead>
                <TableHead className="text-right">History</TableHead>
                <TableHead className="text-right">Auto Returns</TableHead>
                <TableHead className="text-right">Suggested</TableHead>
                <TableHead className="text-right">Errors</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {batches.map((b) => (
                <>
                  <TableRow key={b.id} className="cursor-pointer" onClick={() => setExpanded(expanded === b.id ? null : b.id)}>
                    <TableCell>{new Date(b.uploaded_at).toLocaleString()}</TableCell>
                    <TableCell className="font-mono text-xs">{b.file_name}</TableCell>
                    <TableCell className="text-right">{b.total_rows}</TableCell>
                    <TableCell className="text-right text-green-700 font-semibold">{b.new_shipments}</TableCell>
                    <TableCell className="text-right">{b.updated_shipments}</TableCell>
                    <TableCell className="text-right">{b.new_history_rows}</TableCell>
                    <TableCell className="text-right text-blue-700">{b.auto_linked_returns}</TableCell>
                    <TableCell className="text-right text-amber-700">{b.possible_returns}</TableCell>
                    <TableCell className="text-right">
                      {b.error_rows > 0 ? <span className="text-red-700 font-semibold flex items-center justify-end gap-1"><AlertCircle className="w-3 h-3" />{b.error_rows}</span> : "—"}
                    </TableCell>
                  </TableRow>
                  {expanded === b.id && (b.errors?.length ?? 0) > 0 && (
                    <TableRow key={b.id + "-err"}>
                      <TableCell colSpan={9} className="bg-red-50">
                        <pre className="text-xs overflow-auto max-h-64">{JSON.stringify(b.errors, null, 2)}</pre>
                      </TableCell>
                    </TableRow>
                  )}
                </>
              ))}
              {batches.length === 0 && (
                <TableRow><TableCell colSpan={9} className="text-center text-muted-foreground py-8">No imports yet</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
