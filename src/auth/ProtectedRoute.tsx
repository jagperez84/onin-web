import { useEffect, useState, type ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "./AuthContext";
import { LoadingScreen } from "../components/ui/LoadingScreen";
import { LoginPage } from "../components/ui/LoginPage";

const COMPANY_SELECTED_KEY = "onin.company-selected";

export function ProtectedRoute({ children }: { children: ReactNode }) {
  const { loading, user, listCompanies } = useAuth();
  const location = useLocation();
  const [companyCheck, setCompanyCheck] = useState<"loading" | "ready" | "required">("loading");

  useEffect(() => {
    if (loading) return;
    if (!user) {
      setCompanyCheck("ready");
      return;
    }
    if (sessionStorage.getItem(COMPANY_SELECTED_KEY) === "1") {
      setCompanyCheck("ready");
      return;
    }

    let active = true;
    void listCompanies()
      .then((companies) => {
        if (!active) return;
        if (companies.length > 1) {
          setCompanyCheck("required");
        } else {
          sessionStorage.setItem(COMPANY_SELECTED_KEY, "1");
          setCompanyCheck("ready");
        }
      })
      .catch(() => {
        if (active) setCompanyCheck("ready");
      });

    return () => {
      active = false;
    };
  }, [listCompanies, loading, user]);

  if (loading || (user && companyCheck === "loading")) return <LoadingScreen />;
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  if (companyCheck === "required") return <LoginPage />;
  return <>{children}</>;
}
