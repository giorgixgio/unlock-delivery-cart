import React, { createContext, useContext, useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Session, User } from "@supabase/supabase-js";
import { setDemoMode, wrapSupabaseForDemo } from "@/lib/demoMode";
import {
  setPresentationMode,
  wrapSupabaseForPresentation,
} from "@/lib/presentationMode";

// Install client wrappers exactly once at module load.
wrapSupabaseForDemo(supabase);
wrapSupabaseForPresentation(supabase);

interface AdminAuthContextType {
  session: Session | null;
  user: User | null;
  isAdmin: boolean;
  /** Any active staff member (admin, operator, warehouse, scanner). */
  isStaff: boolean;
  isDemo: boolean;
  /** Admin role from admin_users.role (e.g. 'admin', 'operator', 'warehouse'). */
  role: string | null;
  /** True when this signed-in admin has presentation mode active. */
  isPresentation: boolean;
  /** Multiplier (0–1) currently applied to displayed revenue. */
  presentationMultiplier: number;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
}

const AdminAuthContext = createContext<AdminAuthContextType | undefined>(undefined);

export const AdminAuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [isStaff, setIsStaff] = useState(false);
  const [isDemo, setIsDemo] = useState(false);
  const [role, setRole] = useState<string | null>(null);
  const [isPresentation, setIsPresentation] = useState(false);
  const [presentationMultiplier, setPresentationMultiplierState] = useState(1);
  const [loading, setLoading] = useState(true);

  /**
   * Resolves staff state for a session.
   * Returns true (staff), false (definitely NOT staff) or null (check failed —
   * network / auth-lock error). A failed check must never sign the user out.
   */
  const resolveAdminState = async (
    nextSession: Session | null,
  ): Promise<boolean | null> => {
    setSession(nextSession);
    setUser(nextSession?.user ?? null);

    if (!nextSession?.user?.id) {
      setIsAdmin(false);
      setIsStaff(false);
      setIsDemo(false);
      setRole(null);
      setDemoMode(false);
      setIsPresentation(false);
      setPresentationMultiplierState(1);
      setPresentationMode(null);
      setLoading(false);
      return false;
    }

    // The staff check can transiently fail (offline, token refresh in another
    // tab holding the auth lock, cold start). Retry a couple of times before
    // treating it as an error — and never as "not staff".
    const checkStaff = async (): Promise<boolean | null> => {
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          const [{ data: adminData, error: adminErr }, { data: staffData, error: staffErr }] =
            await Promise.all([
              supabase.rpc("is_active_admin", { user_id: nextSession.user.id }),
              supabase.rpc("is_active_staff", { user_id: nextSession.user.id }),
            ]);
          if (!staffErr && !adminErr) {
            return staffData === true || adminData === true
              ? (setIsAdmin(adminData === true), true)
              : (setIsAdmin(false), false);
          }
          console.warn("[auth] staff check error", staffErr ?? adminErr);
        } catch (e) {
          console.warn("[auth] staff check threw", e);
        }
        await new Promise((r) => setTimeout(r, 400 * (attempt + 1)));
      }
      return null;
    };

    const staffActive = await checkStaff();

    if (staffActive === null) {
      // Unknown — keep whatever access state we already had, stay signed in.
      setLoading(false);
      return null;
    }

    setIsStaff(staffActive);

    const email = nextSession.user.email?.toLowerCase() ?? null;

    // Demo flag + role (legacy — leaves real data intact, just labels the UI)
    let demoActive = false;
    let userRole: string | null = null;
    if (staffActive && email) {
      const { data: row } = await supabase
        .from("admin_users")
        .select("is_demo, role")
        .eq("email", email)
        .maybeSingle();
      demoActive = (row as any)?.is_demo === true;
      userRole = ((row as any)?.role as string) ?? null;
    }
    setIsDemo(demoActive);
    setRole(userRole);
    setDemoMode(demoActive);

    // Presentation mode — load this user's row (RLS allows own-row read)
    let pres = false;
    let mult = 1;
    if (staffActive && email) {
      const { data: pRow } = await supabase
        .from("presentation_settings")
        .select("is_active, revenue_multiplier")
        .eq("target_email", email)
        .maybeSingle();
      if ((pRow as any)?.is_active === true) {
        pres = true;
        mult = Number((pRow as any).revenue_multiplier) || 0;
      }
    }
    setIsPresentation(pres);
    setPresentationMultiplierState(mult);
    setPresentationMode(pres && email ? { email, multiplier: mult } : null);

    setLoading(false);
    return staffActive;
  };

  useEffect(() => {
    let hasInitialSession = false;

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, newSession) => {
      // Only show the global loading screen for real sign-in / sign-out events.
      // TOKEN_REFRESHED (which fires when you switch tabs / unminimize) must NOT
      // remount AdminGuard children, otherwise the dashboard "restarts".
      const isAuthChange =
        event === "SIGNED_IN" ||
        event === "SIGNED_OUT" ||
        event === "USER_UPDATED" ||
        event === "PASSWORD_RECOVERY";

      if (isAuthChange && !hasInitialSession) {
        setLoading(true);
      }
      hasInitialSession = true;
      // Never call other supabase methods synchronously inside this callback —
      // it runs while the auth lock is held and can deadlock/fail the queries.
      setTimeout(() => void resolveAdminState(newSession), 0);
    });

    void (async () => {
      const { data } = await supabase.auth.getSession();
      hasInitialSession = true;
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

    const staffActive = await resolveAdminState(data.session);

    if (staffActive === null) {
      setLoading(false);
      return {
        error:
          "Signed in, but we couldn't verify your access right now. Check your connection and try again.",
      };
    }

    if (!staffActive) {
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
    setIsStaff(false);
    setIsDemo(false);
    setRole(null);
    setDemoMode(false);
    setIsPresentation(false);
    setPresentationMultiplierState(1);
    setPresentationMode(null);
  };

  return (
    <AdminAuthContext.Provider
      value={{
        session,
        user,
        isAdmin,
        isStaff,
        isDemo,
        role,
        isPresentation,
        presentationMultiplier,
        loading,
        signIn,
        signOut,
      }}
    >
      {children}
    </AdminAuthContext.Provider>
  );
};

export const useAdminAuth = () => {
  const ctx = useContext(AdminAuthContext);
  if (!ctx) throw new Error("useAdminAuth must be used within AdminAuthProvider");
  return ctx;
};
