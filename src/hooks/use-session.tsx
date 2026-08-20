import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useServerFn } from "@tanstack/react-start";
import { getMe } from "@/lib/staff.functions";
import { bootstrapAdmin } from "@/lib/staff.functions";

export type StaffSession = {
  kind: "staff";
  user_id: string;
  email: string;
  full_name: string;
  role: "crew" | "analyst" | "admin";
};
export type GuestSession = {
  kind: "guest";
  guest_id: string;
  full_name: string;
  cabin_number: string;
};
export type Session = StaffSession | GuestSession | null;

interface SessionCtx {
  session: Session;
  loading: boolean;
  refresh: () => Promise<void>;
  signOut: () => Promise<void>;
  setGuest: (g: { guest_id: string; full_name: string; cabin_number: string }) => void;
}

const Ctx = createContext<SessionCtx | null>(null);
const GUEST_KEY = "auraseas_guest";

export function SessionProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session>(null);
  const [loading, setLoading] = useState(true);
  const getMeFn = useServerFn(getMe);
  const bootstrapFn = useServerFn(bootstrapAdmin);

  const hydrate = async () => {
    setLoading(true);
    try {
      const { data } = await supabase.auth.getSession();
      if (data.session) {
        try {
          const me = await getMeFn({ data: undefined as never });
          if (me.profile && me.role) {
            setSession({
              kind: "staff",
              user_id: me.user_id,
              email: me.profile.email,
              full_name: me.profile.full_name,
              role: me.role,
            });
            return;
          }
        } catch (e) {
          console.error(e);
        }
      }
      // No staff session — check guest
      if (typeof window !== "undefined") {
        const raw = window.localStorage.getItem(GUEST_KEY);
        if (raw) {
          try {
            const g = JSON.parse(raw);
            setSession({ kind: "guest", ...g });
            return;
          } catch {
            window.localStorage.removeItem(GUEST_KEY);
          }
        }
      }
      setSession(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // Best-effort bootstrap of default admin on first app load
    bootstrapFn({ data: undefined as never }).catch(() => {});
    hydrate();
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_IN" || event === "SIGNED_OUT" || event === "USER_UPDATED") {
        hydrate();
      }
    });
    return () => {
      sub.subscription.unsubscribe();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const signOut = async () => {
    if (session?.kind === "staff") await supabase.auth.signOut();
    if (typeof window !== "undefined") window.localStorage.removeItem(GUEST_KEY);
    setSession(null);
  };

  const setGuest = (g: { guest_id: string; full_name: string; cabin_number: string }) => {
    if (typeof window !== "undefined") window.localStorage.setItem(GUEST_KEY, JSON.stringify(g));
    setSession({ kind: "guest", ...g });
  };

  return (
    <Ctx.Provider value={{ session, loading, refresh: hydrate, signOut, setGuest }}>
      {children}
    </Ctx.Provider>
  );
}

export function useSession() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useSession must be used inside SessionProvider");
  return ctx;
}
