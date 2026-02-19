import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { LandingConfig } from "@/hooks/useLandingConfig";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  ExternalLink, Pencil, Globe, Check, Loader2, Plus, Trash2, Eye,
} from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";

interface LandingRow {
  id: string;
  product_handle: string;
  landing_variant: string;
  landing_use_cod_modal: boolean;
  landing_bypass_min_cart: boolean;
  landing_config: LandingConfig | null;
  updated_at: string;
}

async function fetchLandings(): Promise<LandingRow[]> {
  const { data, error } = await supabase
    .from("product_landing_config")
    .select("*")
    .order("updated_at", { ascending: false });
  if (error) throw error;
  return (data || []) as LandingRow[];
}

// ----- Section helpers -----
type SectionType = "benefits" | "faq" | "video" | "reviews";

interface Section {
  type: SectionType;
  items?: string[];
  url?: string;
}

interface BundleOption {
  qty: number;
  label: string;
  discount_pct: number;
}

// ---------- Editor dialog ----------
const EditDialog = ({
  row,
  open,
  onClose,
}: {
  row: LandingRow;
  open: boolean;
  onClose: () => void;
}) => {
  const { toast } = useToast();
  const qc = useQueryClient();

  const cfg = row.landing_config || {};

  const [heroTitle, setHeroTitle] = useState(cfg.hero_title || "");
  const [heroSubtitle, setHeroSubtitle] = useState(cfg.hero_subtitle || "");
  const [useCod, setUseCod] = useState(row.landing_use_cod_modal);
  const [bypassMin, setBypassMin] = useState(row.landing_bypass_min_cart);
  const [variant, setVariant] = useState(row.landing_variant);

  // Sections
  const [sections, setSections] = useState<Section[]>(
    (cfg.sections as Section[]) || []
  );

  // Bundle options
  const [bundleEnabled, setBundleEnabled] = useState(cfg.bundle?.enabled ?? false);
  const [defaultQty, setDefaultQty] = useState(cfg.bundle?.default_qty ?? 1);
  const [bundleOptions, setBundleOptions] = useState<BundleOption[]>(
    cfg.bundle?.bundle_options || [{ qty: 1, label: "1 ცალი – სრული ფასი", discount_pct: 0 }]
  );

  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    const newConfig: LandingConfig = {
      hero_title: heroTitle || undefined,
      hero_subtitle: heroSubtitle || undefined,
      sections: sections.length > 0 ? sections : undefined,
      bundle: bundleEnabled
        ? { enabled: true, default_qty: defaultQty, bundle_options: bundleOptions }
        : undefined,
    };

    const { error } = await supabase
      .from("product_landing_config")
      .update({
        landing_config: newConfig as any,
        landing_use_cod_modal: useCod,
        landing_bypass_min_cart: bypassMin,
        landing_variant: variant,
        updated_at: new Date().toISOString(),
      })
      .eq("id", row.id);

    setSaving(false);
    if (error) {
      toast({ title: "Save failed", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Landing page saved ✓" });
      qc.invalidateQueries({ queryKey: ["admin-landings"] });
      onClose();
    }
  };

  // Section CRUD
  const addSection = (type: SectionType) => {
    setSections((prev) => [...prev, { type, items: [] }]);
  };

  const removeSection = (idx: number) => {
    setSections((prev) => prev.filter((_, i) => i !== idx));
  };

  const updateSectionItems = (idx: number, raw: string) => {
    const items = raw.split("\n").map((s) => s.trim()).filter(Boolean);
    setSections((prev) =>
      prev.map((s, i) => (i === idx ? { ...s, items } : s))
    );
  };

  const updateSectionUrl = (idx: number, url: string) => {
    setSections((prev) =>
      prev.map((s, i) => (i === idx ? { ...s, url } : s))
    );
  };

  const addBundleOption = () => {
    const nextQty = (bundleOptions[bundleOptions.length - 1]?.qty || 0) + 1;
    setBundleOptions((prev) => [
      ...prev,
      { qty: nextQty, label: `${nextQty} ცალი`, discount_pct: 0 },
    ]);
  };

  const removeBundleOption = (idx: number) => {
    setBundleOptions((prev) => prev.filter((_, i) => i !== idx));
  };

  const updateBundleOption = (idx: number, field: keyof BundleOption, value: any) => {
    setBundleOptions((prev) =>
      prev.map((o, i) => (i === idx ? { ...o, [field]: value } : o))
    );
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-base font-extrabold flex items-center gap-2">
            <Pencil className="w-4 h-4 text-primary" />
            Edit Landing Page
            <span className="text-xs font-normal text-muted-foreground ml-1 font-mono">/p/{row.product_handle}</span>
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-5 py-2">

          {/* Settings row */}
          <div className="grid grid-cols-3 gap-3 p-3 bg-muted/40 rounded-lg border border-border">
            <div className="flex items-center gap-2">
              <Switch id="cod" checked={useCod} onCheckedChange={setUseCod} />
              <Label htmlFor="cod" className="text-xs">COD Modal</Label>
            </div>
            <div className="flex items-center gap-2">
              <Switch id="bypass" checked={bypassMin} onCheckedChange={setBypassMin} />
              <Label htmlFor="bypass" className="text-xs">Bypass min cart</Label>
            </div>
            <div>
              <Label className="text-xs">Variant</Label>
              <select
                value={variant}
                onChange={(e) => setVariant(e.target.value)}
                className="mt-1 w-full text-xs border border-border rounded-md px-2 py-1.5 bg-background"
              >
                <option value="generic">generic</option>
                <option value="tailored">tailored</option>
              </select>
            </div>
          </div>

          {/* Hero */}
          <div className="space-y-2">
            <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Hero</Label>
            <Input
              placeholder="Hero title"
              value={heroTitle}
              onChange={(e) => setHeroTitle(e.target.value)}
              className="text-sm"
            />
            <Input
              placeholder="Hero subtitle"
              value={heroSubtitle}
              onChange={(e) => setHeroSubtitle(e.target.value)}
              className="text-sm"
            />
          </div>

          {/* Sections */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Sections</Label>
              <div className="flex gap-1.5">
                {(["benefits", "faq", "video", "reviews"] as SectionType[]).map((t) => (
                  <Button key={t} variant="outline" size="sm" className="h-6 text-[10px] px-2" onClick={() => addSection(t)}>
                    + {t}
                  </Button>
                ))}
              </div>
            </div>
            {sections.map((s, idx) => (
              <div key={idx} className="border border-border rounded-lg p-3 space-y-2 bg-muted/20">
                <div className="flex items-center justify-between">
                  <Badge variant="outline" className="text-[10px] uppercase">{s.type}</Badge>
                  <button onClick={() => removeSection(idx)} className="text-destructive hover:opacity-70">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
                {(s.type === "benefits" || s.type === "faq" || s.type === "reviews") && (
                  <Textarea
                    className="text-xs font-mono min-h-[100px]"
                    placeholder={
                      s.type === "faq"
                        ? "One FAQ per line: ❓ Question — Answer"
                        : "One item per line"
                    }
                    value={(s.items || []).join("\n")}
                    onChange={(e) => updateSectionItems(idx, e.target.value)}
                  />
                )}
                {s.type === "video" && (
                  <Input
                    className="text-xs"
                    placeholder="Video URL (YouTube embed, etc.)"
                    value={s.url || ""}
                    onChange={(e) => updateSectionUrl(idx, e.target.value)}
                  />
                )}
              </div>
            ))}
          </div>

          {/* Bundle */}
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Bundle Selector</Label>
              <Switch checked={bundleEnabled} onCheckedChange={setBundleEnabled} />
              <span className="text-xs text-muted-foreground">{bundleEnabled ? "Enabled" : "Disabled"}</span>
            </div>
            {bundleEnabled && (
              <div className="space-y-2 border border-border rounded-lg p-3 bg-muted/20">
                <div className="flex items-center gap-2 mb-2">
                  <Label className="text-xs">Default qty:</Label>
                  <Input
                    type="number"
                    className="h-7 w-16 text-xs"
                    value={defaultQty}
                    min={1}
                    onChange={(e) => setDefaultQty(Number(e.target.value))}
                  />
                </div>
                {bundleOptions.map((opt, idx) => (
                  <div key={idx} className="flex items-center gap-2">
                    <Input
                      type="number"
                      className="h-7 w-14 text-xs"
                      value={opt.qty}
                      min={1}
                      onChange={(e) => updateBundleOption(idx, "qty", Number(e.target.value))}
                      placeholder="Qty"
                    />
                    <Input
                      className="h-7 text-xs flex-1"
                      value={opt.label}
                      onChange={(e) => updateBundleOption(idx, "label", e.target.value)}
                      placeholder="Label"
                    />
                    <Input
                      type="number"
                      className="h-7 w-20 text-xs"
                      value={opt.discount_pct}
                      min={0}
                      max={100}
                      onChange={(e) => updateBundleOption(idx, "discount_pct", Number(e.target.value))}
                      placeholder="Discount %"
                    />
                    <button onClick={() => removeBundleOption(idx)} className="text-destructive hover:opacity-70 shrink-0">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
                <Button variant="outline" size="sm" className="h-7 text-xs gap-1 mt-1" onClick={addBundleOption}>
                  <Plus className="w-3 h-3" /> Add tier
                </Button>
              </div>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving} className="gap-2">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
            Save Changes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

// ---------- Main page ----------
const AdminLandingPages = () => {
  const { data: rows, isLoading } = useQuery({
    queryKey: ["admin-landings"],
    queryFn: fetchLandings,
    staleTime: 30 * 1000,
  });

  const [editing, setEditing] = useState<LandingRow | null>(null);

  const previewUrl = (handle: string) =>
    `${window.location.origin}/p/${handle}`;

  return (
    <div className="p-4 md:p-6 space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-extrabold text-foreground">Landing Pages</h1>
          <p className="text-xs text-muted-foreground mt-0.5">Edit tailored product landing pages and their configs</p>
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <div className="rounded-lg border border-border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
                <th className="text-left px-4 py-3 font-bold">Handle / URL</th>
                <th className="text-left px-4 py-3 font-bold">Variant</th>
                <th className="text-left px-4 py-3 font-bold">Hero Title</th>
                <th className="text-left px-4 py-3 font-bold">COD</th>
                <th className="text-left px-4 py-3 font-bold">Bundle</th>
                <th className="text-left px-4 py-3 font-bold">Updated</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {(rows || []).map((row) => (
                <tr key={row.id} className="border-t border-border hover:bg-muted/30 transition-colors">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <Globe className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                      <span className="font-mono text-xs text-foreground">/p/{row.product_handle}</span>
                      <a
                        href={previewUrl(row.product_handle)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-muted-foreground hover:text-primary"
                      >
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <Badge
                      variant={row.landing_variant === "tailored" ? "default" : "outline"}
                      className="text-[10px]"
                    >
                      {row.landing_variant}
                    </Badge>
                  </td>
                  <td className="px-4 py-3">
                    <span className="text-xs line-clamp-1 max-w-[200px]">
                      {row.landing_config?.hero_title || <span className="text-muted-foreground italic">—</span>}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    {row.landing_use_cod_modal ? (
                      <Badge className="text-[10px] bg-success/20 text-success border-success/30">COD</Badge>
                    ) : (
                      <span className="text-muted-foreground text-xs">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {row.landing_config?.bundle?.enabled ? (
                      <Badge variant="outline" className="text-[10px]">
                        {row.landing_config.bundle.bundle_options?.length || 0} tiers
                      </Badge>
                    ) : (
                      <span className="text-muted-foreground text-xs">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">
                    {new Date(row.updated_at).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1.5">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 w-7 p-0"
                        asChild
                      >
                        <a href={previewUrl(row.product_handle)} target="_blank" rel="noopener noreferrer">
                          <Eye className="w-3.5 h-3.5" />
                        </a>
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-7 gap-1 text-xs"
                        onClick={() => setEditing(row)}
                      >
                        <Pencil className="w-3 h-3" />
                        Edit
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
              {(rows || []).length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-12 text-center text-muted-foreground text-sm">
                    No landing pages configured yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {editing && (
        <EditDialog row={editing} open={!!editing} onClose={() => setEditing(null)} />
      )}
    </div>
  );
};

export default AdminLandingPages;
