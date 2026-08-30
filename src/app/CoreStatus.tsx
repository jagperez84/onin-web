import { useEffect, useState } from "react";
import { checkCoreConnectivity } from "../services/core/coreRepository";

export function CoreStatus() {
  const [state, setState] = useState<{
    loading: boolean;
    ok: boolean;
    companies: number;
    message: string;
  }>({
    loading: true,
    ok: false,
    companies: 0,
    message: "Comprobando conexión…",
  });
  useEffect(() => {
    let alive = true;
    checkCoreConnectivity().then(
      (r) => alive && setState({ loading: false, ...r }),
    );
    return () => {
      alive = false;
    };
  }, []);
  const text = state.loading
    ? "Comprobando conexión de datos…"
    : state.ok
      ? `Conectado · ${state.companies} empresas activas`
      : state.message;
  return (
    <div className={`system-status ${state.loading ? "muted" : state.ok ? "ok" : "error"}`}>
      <span className="system-status-dot" />
      {text}
    </div>
  );
}
