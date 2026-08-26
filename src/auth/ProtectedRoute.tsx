import type { ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "./AuthContext";
import { LoadingScreen } from "../components/ui/LoadingScreen";

export function ProtectedRoute({ children }: { children: ReactNode }) {
  const { loading, user } = useAuth();
  const location = useLocation();
  if (loading) return <LoadingScreen />;
  if (!user)
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  return <>{children}</>;
}
