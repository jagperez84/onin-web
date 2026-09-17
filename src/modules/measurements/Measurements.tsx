import { useEffect, useRef, useState } from "react";
import { ArrowDown, ArrowUp, MapPin, Plus, Ruler, Search } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../auth/AuthContext";
import {
  listMeasurements,
  type MeasurementListRow,
  type MeasurementSortField,
  type MeasurementStatus,
} from "../../services/measurements/measurementRepository";
import { getUserDisplayNames } from "../../services/core/coreRepository";
import { MessageLog } from "../../components/ui/MessageLog";
import "./measurements.css";
import "../orders/sales-order.css";

const labels: Record<MeasurementStatus, string> = {
  PLANNED: "Planificada",
  ASSIGNED: "Asignada",
  IN_PROGRESS: "En curso",
  COMPLETED: "Completada",
  QUOTED: "Presupuestada",
  CLOSED: "Cerrada",
  CANCELLED: "Cancelada",
};
function formatDate(value: string | null) {
  return value
    ? new Intl.DateTimeFormat("es-ES").format(new Date(`${value}T12:00:00`))
    : "—";
}
function Badge({ status }: { status: MeasurementStatus }) {
  return (
    <span className={`status ${status.toLowerCase()}`}>{labels[status]}</span>
  );
}

export function Measurements() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [rows, setRows] = useState<MeasurementListRow[]>([]);
  const [userNames, setUserNames] = useState<Record<string, string>>({});
  const [onlyMine, setOnlyMine] = useState(false);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<
    | "active"
    | "planned"
    | "assigned"
    | "in_progress"
    | "completed"
    | "quoted"
    | "closed"
    | "cancelled"
    | "all"
  >("active");
  const [sortBy, setSortBy] = useState<MeasurementSortField>("measurement_date");
  const [ascending, setAscending] = useState(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const logRef = useRef<HTMLDivElement | null>(null);
  function reportError(message: string) {
    setError(message);
    requestAnimationFrame(() => logRef.current?.focus());
  }
  useEffect(() => {
    const timer = setTimeout(async () => {
      setLoading(true);
      setError("");
      try {
        const list = await listMeasurements(
          search,
          status,
          sortBy,
          ascending,
          onlyMine ? user?.id ?? null : null,
        );
        setRows(list);
        const ids = list
          .map((r) => r.assigned_user_id)
          .filter((v): v is string => Boolean(v));
        if (ids.length) setUserNames(await getUserDisplayNames(ids));
      } catch (e) {
        reportError(
          e instanceof Error
            ? e.message
            : "No se pudieron cargar las mediciones.",
        );
      } finally {
        setLoading(false);
      }
    }, 250);
    return () => clearTimeout(timer);
  }, [search, status, sortBy, ascending, onlyMine, user?.id]);
  return (
    <div className="module-page measurements-page">
      <div className="page-head">
        <div>
          <div className="eyebrow">GESTIÓN / MEDICIONES</div>
          <h1>Listado de Mediciones</h1>
          <p>Consulta y gestión de expedientes de medición.</p>
        </div>
        <button
          className="primary-button"
          onClick={() => navigate("/gestion/mediciones/nuevo")}
        >
          <Plus size={17} /> Nueva medición
        </button>
      </div>
      <MessageLog ref={logRef} error={error} />
      <div className="toolbar">
        <div className="search-box">
          <Search size={17} />
          <input
            autoFocus
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por número, referencia, cliente o población…"
            aria-label="Buscar medición"
          />
        </div>
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value as typeof status)}
          aria-label="Estado"
        >
          <option value="active">Activas</option>
          <option value="planned">Planificadas</option>
          <option value="assigned">Asignadas</option>
          <option value="in_progress">En curso</option>
          <option value="completed">Completadas</option>
          <option value="quoted">Presupuestadas</option>
          <option value="closed">Cerradas</option>
          <option value="cancelled">Canceladas</option>
          <option value="all">Todas</option>
        </select>
        <label className="measurement-toolbar-toggle">
          <input
            type="checkbox"
            checked={onlyMine}
            onChange={(e) => setOnlyMine(e.target.checked)}
          />
          Asignadas a mí
        </label>
        <div className="sales-order-sort">
          <label htmlFor="measurement-sort-field">Ordenar por</label>
          <select
            id="measurement-sort-field"
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as MeasurementSortField)}
          >
            <option value="measurement_date">Fecha de medición</option>
            <option value="contact_date">Fecha de contacto</option>
          </select>
          <button
            type="button"
            className="icon-link"
            onClick={() => setAscending((a) => !a)}
            title={ascending ? "Orden ascendente" : "Orden descendente"}
            aria-label={ascending ? "Orden ascendente" : "Orden descendente"}
          >
            {ascending ? <ArrowUp size={16} /> : <ArrowDown size={16} />}
          </button>
        </div>
        <span className="result-count">{rows.length} mediciones</span>
      </div>
      <div className="table-panel">
        <table>
          <thead>
            <tr>
              <th>Expediente</th>
              <th>Cliente</th>
              <th>Ubicación</th>
              <th>Fecha</th>
              <th>Medidor</th>
              <th>Estado</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={6}>Cargando…</td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={6}>
                  <div className="empty-state">
                    <Ruler size={28} />
                    <strong>No hay mediciones</strong>
                    <span>
                      Prueba con otra búsqueda o crea una nueva medición.
                    </span>
                  </div>
                </td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr
                  key={row.id}
                  className="clickable-row"
                  onClick={() => navigate(`/gestion/mediciones/${row.id}`)}
                >
                  <td>
                    <div className="measurement-code">{row.code}</div>
                    {row.reference && (
                      <div className="secondary">{row.reference}</div>
                    )}
                  </td>
                  <td>
                    <strong>{row.customer_name_snapshot || "—"}</strong>
                  </td>
                  <td>
                    {row.site_city || row.site_street ? (
                      <>
                        <MapPin size={13} /> {row.site_city || row.site_street}
                      </>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td>{formatDate(row.measurement_date)}</td>
                  <td>
                    {row.assigned_user_id
                      ? userNames[row.assigned_user_id] ?? "Usuario asignado"
                      : "Sin asignar"}
                  </td>
                  <td>
                    <Badge status={row.status} />
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
