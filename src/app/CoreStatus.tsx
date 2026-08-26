import { useEffect, useState } from "react";
import { Database, CircleCheck, CircleAlert } from "lucide-react";
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
  return (
    <div className="core-status panel">
      <div className="panel-head">
        <div>
          <h2>Conexión de datos</h2>
          <p>Comprobación del modelo Core de ONIN.</p>
        </div>
        {state.loading ? (
          <Database size={20} className="status-icon muted" />
        ) : state.ok ? (
          <CircleCheck size={20} className="status-icon success" />
        ) : (
          <CircleAlert size={20} className="status-icon danger" />
        )}
      </div>
      <div className={`core-status-body ${state.ok ? "ok" : "error"}`}>
        <strong>
          {state.loading
            ? "Comprobando…"
            : state.ok
              ? "Conectado"
              : "No disponible"}
        </strong>
        {!state.loading && (
          <span>
            {state.message}
            {state.ok ? ` Empresas activas: ${state.companies}.` : ""}
          </span>
        )}
      </div>
    </div>
  );
}
