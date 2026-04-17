import React, { createContext, useContext, useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Session, User } from "@supabase/supabase-js";
import { setDemoMode, wrapSupabaseForDemo } from "@/lib/demoMode";

// Install the demo-mode wrapper exactly once at module load.
wrapSupabaseForDemo(supabase);

interface AdminAuthContextType {
  session: Session | null;
  user: User | null;
  isAdmin: boolean;
  isDemo: boolean;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
}

const AdminAuthContext = createContext<AdminAuthContextType | undefined>(undefined);

export const AdminAuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [isDemo, setIsDemo] = useState(false);
  const [loading, setLoading] = useState(true);

  const resolveAdminState = async (nextSession: Session | null) => {
    setSession(nextSession);
    setUser(nextSession?.user ?? null);

    if (!nextSession?.user?.id) {
      setIsAdmin(false);
      setIsDemo(false);
      setDemoMode(false);
      setLoading(false);
      return false;
    }

    try {
      const { data, error } = await supabase.rpc("is_active_admin", {
        user_id: nextSession.user.id,
      });

      if (error) throw error;

      const adminActive = data === true;
      setIsAdmin(adminActive);

      // Look up the demo flag via the user's own admin row (RLS allows
      // each authenticated user to read their own row).
      let demoActive = false;
      if (adminActive && nextSession.user.email) {
        const { data: row } = await supabase
          .from("admin_users")
          .select("is_demo")
          .eq("email", nextSession.user.email.toLowerCase())
          .maybeSingle();
        demoActive = (row as any)?.is_demo === true;
      }
      setIsDemo(demoActive);
      setDemoMode(demoActive);

      setLoading(false);
      return adminActive;
    } catch {
      setIsAdmin(false);
      setIsDemo(false);
      setDemoMode(false);
      setLoading(false);
      return false;
    }
  };

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setLoading(true);
      void resolveAdminState(newSession);
    });

    void (async () => {
      const { data } = await supabase.auth.getSession();
      await resolveAdminState(data.session);
    })();

    return () => subscription.unsubscribe();
  }, []);

  const signIn = async (email: string, password: string) => {
    setLoading(true);

    const { data, error } = await supabase.auth.signInWithPassword({
      email: email.trim().toLowerCase(),
      password,
    });

    if (error) {
      setLoading(false);
      return { error: error.message };
    }

    const adminActive = await resolveAdminState(data.session);
    if (!adminActive) {
      await supabase.auth.signOut();
      return { error: "This account does not have admin access." };
    }

    return { error: null };
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    setSession(null);
    setUser(null);
    setIsAdmin(false);
    setIsDemo(false);
    setDemoMode(false);
  };

  return (
    <AdminAuthContext.Provider value={{ session, user, isAdmin, isDemo, loading, signIn, signOut }}>
      {children}
    </AdminAuthContext.Provider>
  );
};

export const useAdminAuth = () => {
  const ctx = useContext(AdminAuthContext);
  if (!ctx) throw new Error("useAdminAuth must be used within AdminAuthProvider");
  return ctx;
};
