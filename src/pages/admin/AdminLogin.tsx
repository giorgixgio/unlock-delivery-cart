import { useState } from "react";
import { useAdminAuth } from "@/contexts/AdminAuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Lock } from "lucide-react";

const AdminLogin = () => {
  const { signIn } = useAdminAuth();
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState("");

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    const { error } = await signIn(email, password);
    if (error) setError(error);
    setLoading(false);
  };

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSuccess("");
    setLoading(true);

    const trimmedEmail = email.trim().toLowerCase();
    const { error } = await supabase.auth.signUp({ email: trimmedEmail, password });
    if (error) {
      setError(error.message);
    } else {
      setSuccess("Account created! You can now sign in.");
      setMode("login");
    }
    setLoading(false);
  };

  return (
    <main className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center">
          <Lock className="w-12 h-12 text-primary mx-auto mb-3" />
          <h1 className="text-2xl font-extrabold text-foreground">
            {mode === "login" ? "Admin Login" : "Admin Sign Up"}
          </h1>
        </div>
        <form onSubmit={mode === "login" ? handleLogin : handleSignup} className="space-y-4">
          <div>
            <Label>Email</Label>
            <Input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="admin@example.com"
              className="h-12"
              required
            />
          </div>
          <div>
            <Label>Password</Label>
            <Input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className="h-12"
              required
              minLength={6}
            />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          {success && <p className="text-sm text-green-600">{success}</p>}
          <Button type="submit" className="w-full h-12 text-base font-bold" disabled={loading}>
            {loading
              ? mode === "login" ? "Signing in..." : "Creating account..."
              : mode === "login" ? "Sign In" : "Create Account"}
          </Button>
        </form>
        <p className="text-center text-sm text-muted-foreground">
          {mode === "login" ? (
            <>No account yet?{" "}
              <button type="button" onClick={() => { setMode("signup"); setError(""); setSuccess(""); }} className="text-primary font-semibold underline">
                Sign Up
              </button>
            </>
          ) : (
            <>Already have an account?{" "}
              <button type="button" onClick={() => { setMode("login"); setError(""); setSuccess(""); }} className="text-primary font-semibold underline">
                Sign In
              </button>
            </>
          )}
        </p>
      </div>
    </main>
  );
};

export default AdminLogin;
