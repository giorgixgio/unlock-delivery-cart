import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { KeyRound, Loader2, Copy } from "lucide-react";
import { toast } from "sonner";

/** Super-admin only: set a staff account password without touching code. */
const StaffPasswordPanel = ({ emails }: { emails: string[] }) => {
  const [email, setEmail] = useState(emails[0] ?? "");
  const [password, setPassword] = useState("");
  const [saving, setSaving] = useState(false);

  const generate = () => {
    const chars = "abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    const arr = new Uint32Array(12);
    crypto.getRandomValues(arr);
    setPassword(Array.from(arr, (n) => chars[n % chars.length]).join(""));
  };

  const submit = async () => {
    if (!email.trim()) return toast.error("Select an account");
    if (password.length < 8) return toast.error("Password must be at least 8 characters");
    setSaving(true);
    const { data, error } = await supabase.functions.invoke("set-staff-password", {
      body: { email: email.trim().toLowerCase(), password },
    });
    setSaving(false);
    if (error || (data as any)?.error) {
      toast.error((data as any)?.error ?? error?.message ?? "Failed");
      return;
    }
    toast.success((data as any)?.created ? "Account created with this password" : "Password updated");
  };

  return (
    <div className="bg-card rounded-lg p-4 border border-border space-y-3">
      <h3 className="font-bold text-sm flex items-center gap-2">
        <KeyRound className="w-4 h-4" /> Set staff password
      </h3>
      <p className="text-xs text-muted-foreground">
        Choose a staff account and set a new password. Share it with them directly — nothing is stored in code.
      </p>
      <div className="flex flex-wrap gap-3 items-end">
        <div className="min-w-[220px]">
          <Label className="text-xs">Account</Label>
          <select
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="h-10 w-full px-3 rounded-lg border border-border bg-card text-sm"
          >
            {emails.map((e) => (
              <option key={e} value={e}>{e}</option>
            ))}
          </select>
        </div>
        <div className="flex-1 min-w-[200px]">
          <Label className="text-xs">New password</Label>
          <Input
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="min 8 characters"
            className="h-10"
          />
        </div>
        <Button type="button" variant="outline" className="h-10" onClick={generate}>
          Generate
        </Button>
        <Button
          type="button"
          variant="outline"
          className="h-10"
          onClick={() => {
            navigator.clipboard.writeText(password);
            toast.success("Copied");
          }}
          disabled={!password}
        >
          <Copy className="w-4 h-4" />
        </Button>
        <Button onClick={submit} disabled={saving} className="h-10">
          {saving && <Loader2 className="w-4 h-4 animate-spin mr-1" />}
          Save password
        </Button>
      </div>
    </div>
  );
};

export default StaffPasswordPanel;
