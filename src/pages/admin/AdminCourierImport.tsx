import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "@/hooks/use-toast";
import { Upload, Loader2, AlertCircle } from "lucide-react";

type Batch = {
  id: string; file_name: string; uploaded_at: string; uploaded_by: string | null;
  total_rows: number; successful_rows: number; error_rows: number;
  new_shipments: number; updated_shipments: number; new_history_rows: number;
  possible_returns: number; auto_linked_returns: number;
  status: string; errors: any[];
};

export default function AdminCourierImport() {
  const fileRef = useRef<HTMLInputElement>(null);
  const [batches, setBatches] = useState<Batch[]>([]);
  const [uploading, setUploading] = useState(false);
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

  async function handleFile(file: File) {
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const { data, error } = await supabase.functions.invoke("import-courier", { body: fd });
      if (error) throw error;
      if ((data as any)?.deduped) {
        toast({ title: "ეს ფაილი უკვე ატვირთულია", description: "ბაჩი ნაჩვენებია სიაში." });
      } else {
        toast({ title: "იმპორტი დასრულდა", description: `ახალი: ${(data as any)?.batch?.new_shipments ?? 0}, განახლდა: ${(data as any)?.batch?.updated_shipments ?? 0}` });
      }
      await load();
    } catch (e: any) {
      toast({ title: "შეცდომა", description: e.message || String(e), variant: "destructive" });
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
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
        <CardContent>
          <input
            ref={fileRef} type="file" accept=".xlsx" className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
          />
          <Button onClick={() => fileRef.current?.click()} disabled={uploading} size="lg">
            {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
            {uploading ? "მუშავდება..." : "აირჩიე ფაილი"}
          </Button>
          <p className="text-xs text-muted-foreground mt-2">იგივე ფაილის ხელახლა ატვირთვა უსაფრთხოა — დუბლიკატები არ შეიქმნება.</p>
        </CardContent>
      </Card>

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
                      {b.error_rows > 0 ? <span className="text-red-700 font-semibold flex items-center justify-end gap-1"><AlertCircle className="w-3 h-3"/>{b.error_rows}</span> : "—"}
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
