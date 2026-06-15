import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "@/hooks/use-toast";
import { Link2, X, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

type Row = {
  match_id: string | null;
  return_shipment_id: string;
  return_tracking: string;
  return_date: string | null;
  phone: string | null;
  sku: string | null;
  customer_name: string | null;
  city: string | null;
  suggested_original_id: string | null;
  suggested_tracking: string | null;
  suggested_date: string | null;
  score: number | null;
  match_reason: string | null;
};

export default function AdminCourierReturnMatching() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchFor, setSearchFor] = useState<Row | null>(null);
  const [searchQ, setSearchQ] = useState("");
  const [searchResults, setSearchResults] = useState<any[]>([]);

  async function load() {
    setLoading(true);
    // SUGGESTED matches
    const { data: suggested } = await supabase
      .from("return_matches")
      .select("id, confidence_score, match_reason, original_shipment_id, return_shipment_id")
      .eq("matched_by", "SUGGESTED")
      .limit(200);

    const ids = new Set<string>();
    (suggested || []).forEach((m: any) => { ids.add(m.original_shipment_id); ids.add(m.return_shipment_id); });

    // Unmatched returns (no row in return_matches)
    const { data: unmatched } = await supabase
      .from("courier_shipments")
      .select("id, tracking_number, latest_status_date, phone, sku, customer_name, city")
      .eq("shipment_type", "RETURN_TO_SENDER")
      .order("latest_status_date", { ascending: false })
      .limit(200);

    const { data: linked } = await supabase.from("return_matches").select("return_shipment_id");
    const linkedSet = new Set((linked || []).map((r: any) => r.return_shipment_id));

    const unmatchedFiltered = (unmatched || []).filter((s: any) => !linkedSet.has(s.id));
    unmatchedFiltered.forEach((s: any) => ids.add(s.id));

    const { data: ships } = ids.size
      ? await supabase.from("courier_shipments").select("*").in("id", Array.from(ids))
      : { data: [] as any[] };
    const shipMap = new Map((ships || []).map((s: any) => [s.id, s]));

    const out: Row[] = [];
    for (const m of suggested || []) {
      const ret: any = shipMap.get(m.return_shipment_id); const orig: any = shipMap.get(m.original_shipment_id);
      if (!ret) continue;
      out.push({
        match_id: m.id,
        return_shipment_id: ret.id, return_tracking: ret.tracking_number, return_date: ret.latest_status_date,
        phone: ret.phone, sku: ret.sku, customer_name: ret.customer_name, city: ret.city,
        suggested_original_id: orig?.id ?? null, suggested_tracking: orig?.tracking_number ?? null,
        suggested_date: orig?.latest_status_date ?? null,
        score: m.confidence_score, match_reason: m.match_reason,
      });
    }
    for (const ret of unmatchedFiltered) {
      out.push({
        match_id: null,
        return_shipment_id: ret.id, return_tracking: ret.tracking_number, return_date: ret.latest_status_date,
        phone: ret.phone, sku: ret.sku, customer_name: ret.customer_name, city: ret.city,
        suggested_original_id: null, suggested_tracking: null, suggested_date: null,
        score: null, match_reason: null,
      });
    }
    setRows(out);
    setLoading(false);
  }
  useEffect(() => { load(); }, []);

  async function link(row: Row, originalId: string, score: number, reason: string) {
    if (row.match_id) {
      await supabase.from("return_matches").update({ original_shipment_id: originalId, matched_by: "MANUAL", confidence_score: score, match_reason: reason }).eq("id", row.match_id);
    } else {
      await supabase.from("return_matches").insert({
        original_shipment_id: originalId, return_shipment_id: row.return_shipment_id,
        matched_by: "MANUAL", confidence_score: score, match_reason: reason,
      });
    }
    const { data: orig } = await supabase.from("courier_shipments").select("tracking_number").eq("id", originalId).single();
    if (orig) {
      await supabase.from("courier_shipments").update({ linked_original_tracking_number: orig.tracking_number }).eq("id", row.return_shipment_id);
      await supabase.from("courier_shipments").update({ linked_return_tracking_number: row.return_tracking }).eq("id", originalId);
    }
    toast({ title: "დაკავშირდა" });
    setSearchFor(null);
    await load();
  }

  async function ignore(row: Row) {
    if (row.match_id) {
      await supabase.from("return_matches").update({ matched_by: "IGNORED" }).eq("id", row.match_id);
    } else {
      // create a placeholder pointing to self to mark ignored — instead just skip
      toast({ title: "გამოტოვებულია" });
    }
    await load();
  }

  async function doSearch() {
    if (!searchQ.trim()) return;
    const q = searchQ.trim();
    const { data } = await supabase
      .from("courier_shipments")
      .select("id, tracking_number, phone, sku, customer_name, city, latest_status_date")
      .eq("shipment_type", "CUSTOMER_DELIVERY")
      .or(`tracking_number.ilike.%${q}%,phone.ilike.%${q}%,sku.ilike.%${q}%,customer_name.ilike.%${q}%`)
      .limit(20);
    setSearchResults(data || []);
  }

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-extrabold">Return Matching</h1>
        <p className="text-sm text-muted-foreground">Confirm or correct auto-matched returns. Below confidence 70 are shown here.</p>
      </div>
      <Card>
        <CardHeader><CardTitle className="text-base">Possible & Unmatched Returns ({rows.length})</CardTitle></CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Return Tracking</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Phone</TableHead>
                <TableHead>SKU</TableHead>
                <TableHead>Customer</TableHead>
                <TableHead>City</TableHead>
                <TableHead>Suggested Original</TableHead>
                <TableHead>Score</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading && <TableRow><TableCell colSpan={9} className="text-center py-8">Loading...</TableCell></TableRow>}
              {!loading && rows.map((r) => (
                <TableRow key={r.return_shipment_id}>
                  <TableCell className="font-mono text-xs">{r.return_tracking}</TableCell>
                  <TableCell className="text-xs">{r.return_date ? new Date(r.return_date).toLocaleDateString() : "—"}</TableCell>
                  <TableCell className="text-xs">{r.phone || "—"}</TableCell>
                  <TableCell className="text-xs">{r.sku || "—"}</TableCell>
                  <TableCell className="text-xs">{r.customer_name || "—"}</TableCell>
                  <TableCell className="text-xs">{r.city || "—"}</TableCell>
                  <TableCell className="font-mono text-xs">{r.suggested_tracking || "—"}</TableCell>
                  <TableCell>
                    {r.score != null ? <span className="px-2 py-0.5 rounded bg-amber-100 text-amber-800 text-xs font-semibold">{r.score}</span> : "—"}
                  </TableCell>
                  <TableCell className="text-right space-x-1">
                    {r.suggested_original_id && (
                      <Button size="sm" onClick={() => link(r, r.suggested_original_id!, r.score || 0, r.match_reason || "manual_confirm")}>
                        <Link2 className="w-3 h-3" /> Link
                      </Button>
                    )}
                    <Button size="sm" variant="ghost" onClick={() => { setSearchFor(r); setSearchQ(r.phone || ""); setSearchResults([]); }}>
                      <Search className="w-3 h-3" />
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => ignore(r)}>
                      <X className="w-3 h-3" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
              {!loading && rows.length === 0 && (
                <TableRow><TableCell colSpan={9} className="text-center text-muted-foreground py-8">No returns needing review</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={!!searchFor} onOpenChange={(o) => !o && setSearchFor(null)}>
        <DialogContent className="max-w-3xl">
          <DialogHeader><DialogTitle>Search original shipment</DialogTitle></DialogHeader>
          <div className="flex gap-2">
            <Input value={searchQ} onChange={(e) => setSearchQ(e.target.value)} placeholder="phone / tracking / SKU / name" />
            <Button onClick={doSearch}>Search</Button>
          </div>
          <div className="max-h-96 overflow-auto">
            <Table>
              <TableHeader><TableRow>
                <TableHead>Tracking</TableHead><TableHead>Phone</TableHead><TableHead>SKU</TableHead><TableHead>Name</TableHead><TableHead>Date</TableHead><TableHead></TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {searchResults.map((s) => (
                  <TableRow key={s.id}>
                    <TableCell className="font-mono text-xs">{s.tracking_number}</TableCell>
                    <TableCell className="text-xs">{s.phone}</TableCell>
                    <TableCell className="text-xs">{s.sku}</TableCell>
                    <TableCell className="text-xs">{s.customer_name}</TableCell>
                    <TableCell className="text-xs">{s.latest_status_date ? new Date(s.latest_status_date).toLocaleDateString() : "—"}</TableCell>
                    <TableCell><Button size="sm" onClick={() => searchFor && link(searchFor, s.id, 100, "manual_search")}>Link</Button></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
