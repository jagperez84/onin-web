import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "../lib/supabase";
import { listMyCompanies, switchMyCompany, type CompanyOption } from "../services/core/companyRepository";

type AuthContextValue = {
  session: Session | null;
  user: User | null;
  loading: boolean;
  configured: boolean;
  listCompanies: () => Promise<CompanyOption[]>;
  switchCompany: (companyId: number) => Promise<void>;
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>;
  signOut: () => Promise<{ error: Error | null }>;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const configured = Boolean(supabase);

  useEffect(() => {
    let active = true;
    if (!supabase) {
      setLoading(false);
      return;
    }
    supabase.auth
      .getSession()
      .then(({ data }) => {
        if (!active) return;
        setSession(data.session ?? null);
        setLoading(false);
      })
      .catch(() => {
        if (active) setLoading(false);
      });

    const { data: listener } = supabase.auth.onAuthStateChange(
      (_event, nextSession) => {
        setSession(nextSession);
        setLoading(false);
      },
    );
    return () => {
      active = false;
      listener.subscription.unsubscribe();
    };
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      session,
      user: session?.user ?? null,
      loading,
      configured,
      listCompanies: async () => listMyCompanies(),
      switchCompany: async (companyId) => switchMyCompany(companyId),
      signIn: async (email, password) => {
        if (!supabase)
          return {
            error: new Error(
              "Supabase no está configurado. Revisa el archivo .env.",
            ),
          };
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        return { error: error ? new Error(error.message) : null };
      },
      signOut: async () => {
        sessionStorage.removeItem("onin.company-selected");
        if (!supabase) return { error: null };
        const { error } = await supabase.auth.signOut();
        return { error: error ? new Error(error.message) : null };
      },
    }),
    [configured, loading, session],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error("useAuth debe utilizarse dentro de AuthProvider");
  return value;
}
