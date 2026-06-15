import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "@/hooks/use-toast";
import { Loader2, Save, Upload, FileSearch } from "lucide-react";
import * as XLSX from "xlsx";

type Mapping = {
  target_field: string;
  label: string;
  source_header: string | null;
  occurrence: number;
  is_required: boolean;
  data_type: string;
  sort_order: number;
  notes: string | null;
};

export default function AdminCourierImportMapping() {
  const [rows, setRows] = useState<Mapping[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [detected, setDetected] = useState<string[] | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  async function load() {
    setLoading(true);
    const { data } = await supabase
      .from("courier_import_mappings")
      .select("*")
      .order("sort_order", { ascending: true });
    setRows((data as any) || []);
    setLoading(false);
  }
  useEffect(() => { load(); }, []);

  function update(idx: number, patch: Partial<Mapping>) {
    setRows((prev) => prev.map((r, i) => (i === idx ? { ...r, ...patch } : r)));
  }

  async function save() {
    setSaving(true);
    try {
      for (const r of rows) {
        const { error } = await supabase
          .from("courier_import_mappings")
          .update({
            source_header: r.source_header?.trim() || null,
            occurrence: r.occurrence || 1,
          })
          .eq("target_field", r.target_field);
        if (error) throw error;
      }
      toast({ title: "Mappings saved" });
    } catch (e: any) {
      toast({ title: "Save failed", description: e.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  async function detectHeaders(file: File) {
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(new Uint8Array(buf), { type: "array" });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const all: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null, raw: true });
      // find header row (looks for თრექინგი)
      let idx = 0;
      for (let i = 0; i < Math.min(all.length, 15); i++) {
        const r = (all[i] || []).map((c) => String(c ?? "").toLowerCase().trim());
        if (r.some((c) => c === "თრექინგი" || c.includes("tracking") || c === "შტრიხკოდი")) { idx = i; break; }
      }
      setDetected((all[idx] || []).map((h) => String(h ?? "")));
      toast({ title: "Headers detected", description: `Row ${idx + 1}, ${all[idx]?.length || 0} columns` });
    } catch (e: any) {
      toast({ title: "Could not read file", description: e.message, variant: "destructive" });
    }
  }

  if (loading) {
    return <div className="p-6 flex justify-center"><Loader2 className="w-6 h-6 animate-spin" /></div>;
  }

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-extrabold">Courier Import Mapping</h1>
        <p className="text-sm text-muted-foreground">
          Map each internal field to the column name used in the courier's Excel export. The importer matches by header name — not column position — so it survives column reordering.
        </p>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base flex items-center gap-2"><FileSearch className="w-4 h-4" /> Inspect a sample file</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <input
            ref={fileRef} type="file" accept=".xlsx" className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) detectHeaders(f); }}
          />
          <Button variant="secondary" onClick={() => fileRef.current?.click()} size="sm">
            <Upload className="w-4 h-4 mr-2" /> Read headers from .xlsx
          </Button>
          {detected && (
            <div className="text-xs bg-muted p-3 rounded-md">
              <div className="font-semibold mb-2">Detected headers ({detected.length}):</div>
              <div className="flex flex-wrap gap-1.5">
                {detected.map((h, i) => (
                  <span key={i} className="px-2 py-0.5 rounded bg-background border font-mono">{i}: {h || "—"}</span>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">Field Mapping</CardTitle>
          <Button onClick={save} disabled={saving} size="sm">
            {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
            Save
          </Button>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Internal Field</TableHead>
                <TableHead>Label</TableHead>
                <TableHead>Source Column Header (Excel)</TableHead>
                <TableHead className="w-24">Occurrence</TableHead>
                <TableHead className="w-20">Type</TableHead>
                <TableHead className="w-20">Required</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r, i) => {
                const matched = detected?.some(
                  (h) => h.trim().toLowerCase() === (r.source_header || "").trim().toLowerCase(),
                );
                return (
                  <TableRow key={r.target_field}>
                    <TableCell className="font-mono text-xs">{r.target_field}</TableCell>
                    <TableCell className="text-sm">{r.label}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Input
                          value={r.source_header || ""}
                          onChange={(e) => update(i, { source_header: e.target.value })}
                          placeholder="(unmapped)"
                          className="h-8 text-sm"
                        />
                        {detected && (
                          <span className={`text-[10px] px-1.5 py-0.5 rounded ${matched ? "bg-green-100 text-green-800" : "bg-amber-100 text-amber-800"}`}>
                            {matched ? "OK" : (r.source_header ? "miss" : "—")}
                          </span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Input
                        type="number" min={1}
                        value={r.occurrence}
                        onChange={(e) => update(i, { occurrence: parseInt(e.target.value) || 1 })}
                        className="h-8 w-16 text-sm"
                      />
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">{r.data_type}</TableCell>
                    <TableCell>
                      {r.is_required ? <span className="text-xs font-bold text-red-700">YES</span> : <span className="text-xs text-muted-foreground">no</span>}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <p className="text-xs text-muted-foreground">
        Tip: when the courier export has two columns with the same name (e.g. <code>სტატუსი</code>), use <strong>Occurrence</strong> to pick the 1st, 2nd, etc.
      </p>
    </div>
  );
}
