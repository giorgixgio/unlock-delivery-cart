import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Loader2, Upload, ImageIcon } from "lucide-react";
import { toast } from "sonner";

type SlotKey = "logo_url_trendmart" | "logo_url_bigmart";

const SLOTS: { key: SlotKey; label: string; hint: string }[] = [
  { key: "logo_url_trendmart", label: "TrendMart Logo (Warehouse B)", hint: "trendmart.ge" },
  { key: "logo_url_bigmart", label: "BigMart Logo (Warehouse A)", hint: "bigmart.ge" },
];

const LogoSlot = ({
  slot,
  url,
  onSaved,
}: {
  slot: { key: SlotKey; label: string; hint: string };
  url: string | null;
  onSaved: (key: SlotKey, url: string) => void;
}) => {
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const upload = async (file: File) => {
    if (!file.type.startsWith("image/")) {
      toast.error("აირჩიეთ სურათი");
      return;
    }
    setUploading(true);
    try {
      const ext = file.name.split(".").pop() || "png";
      const path = `site-logos/${slot.key}-${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from("product-images")
        .upload(path, file, { upsert: true, contentType: file.type });
      if (upErr) throw upErr;
      const { data: pub } = supabase.storage.from("product-images").getPublicUrl(path);
      const publicUrl = pub.publicUrl;
      const { error: setErr } = await supabase
        .from("site_settings")
        .upsert(
          { key: slot.key, value: publicUrl, updated_at: new Date().toISOString() },
          { onConflict: "key" }
        );
      if (setErr) throw setErr;
      onSaved(slot.key, publicUrl);
      toast.success("ლოგო განახლდა");
    } catch (e: any) {
      toast.error(e?.message || "ატვირთვა ვერ მოხერხდა");
    } finally {
      setUploading(false);
    }
  };

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragOver(false);
        const f = e.dataTransfer.files?.[0];
        if (f) upload(f);
      }}
      className={`rounded-lg border p-4 space-y-3 transition-colors ${
        dragOver ? "border-primary bg-primary/5" : "border-border bg-background"
      }`}
    >
      <div>
        <p className="text-sm font-bold">{slot.label}</p>
        <p className="text-xs text-muted-foreground">{slot.hint}</p>
      </div>

      <div className="h-20 flex items-center justify-center rounded bg-muted/40 overflow-hidden">
        {url ? (
          <img src={url} alt={slot.label} className="max-h-16 w-auto object-contain" />
        ) : (
          <ImageIcon className="w-6 h-6 text-muted-foreground" />
        )}
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) upload(f);
          e.target.value = "";
        }}
      />
      <Button
        variant="outline"
        size="sm"
        disabled={uploading}
        onClick={() => inputRef.current?.click()}
        className="w-full"
      >
        {uploading ? (
          <Loader2 className="w-4 h-4 animate-spin mr-1" />
        ) : (
          <Upload className="w-4 h-4 mr-1" />
        )}
        {url ? "Replace" : "Upload"}
      </Button>
    </div>
  );
};

const SiteBrandingPanel = () => {
  const [urls, setUrls] = useState<Record<string, string | null>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase
      .from("site_settings")
      .select("key, value")
      .in("key", ["logo_url_trendmart", "logo_url_bigmart"])
      .then(({ data }) => {
        const map: Record<string, string | null> = {};
        for (const row of data || []) map[row.key] = row.value;
        setUrls(map);
        setLoading(false);
      });
  }, []);

  return (
    <div className="bg-card rounded-lg p-4 border border-border space-y-3">
      <div>
        <h3 className="font-bold text-sm">Site Branding</h3>
        <p className="text-xs text-muted-foreground mt-1">
          Logos shown on each storefront domain. Admin panel styling is unaffected.
          Preview locally with <code>?site=A</code> (BigMart) or <code>?site=B</code> (TrendMart).
        </p>
      </div>
      {loading ? (
        <Loader2 className="w-5 h-5 animate-spin text-primary" />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {SLOTS.map((slot) => (
            <LogoSlot
              key={slot.key}
              slot={slot}
              url={urls[slot.key] || null}
              onSaved={(k, u) => setUrls((prev) => ({ ...prev, [k]: u }))}
            />
          ))}
        </div>
      )}
    </div>
  );
};

export default SiteBrandingPanel;
