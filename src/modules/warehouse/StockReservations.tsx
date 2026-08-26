import { FormEvent, useEffect, useState } from "react";
import { CalendarClock, Check, Plus, RotateCcw, Save, X } from "lucide-react";
import { getActiveCompanies } from "../../services/core/coreRepository";
import {
  listWarehouses,
  type Warehouse,
} from "../../services/warehouse/warehouseRepository";
import {
  listStockCharacteristics,
  listStockReservations,
  reserveStock,
  releaseStockReservation,
  consumeStockReservation,
  type StockProduct,
  type StockReservation,
} from "../../services/warehouse/stockRepository";
import { StockProductLookup } from "./StockProductLookup";
import "./stock.css";

export function StockReservations() {
  const [companyId, setCompanyId] = useState<number | null>(null);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [rows, setRows] = useState<StockReservation[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  useEffect(() => {
    getActiveCompanies()
      .then((c) => setCompanyId(c[0]?.id ?? null))
      .catch((e) =>
        setError(
          e instanceof Error ? e.message : "No se pudo cargar la empresa.",
        ),
      );
  }, []);
  async function load() {
    if (companyId === null) return;
    setLoading(true);
    setError("");
    try {
      const [w, r] = await Promise.all([
        listWarehouses(companyId, "", "active"),
        listStockReservations(companyId),
      ]);
      setWarehouses(w);
      setRows(r);
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "No se pudieron cargar las reservas.",
      );
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    void load();
  }, [companyId]);
  async function changeReservation(
    r: StockReservation,
    action: "release" | "consume",
  ) {
    setError("");
    try {
      if (action === "release") await releaseStockReservation(r.id);
      else await consumeStockReservation(r.id);
      await load();
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "No se pudo actualizar la reserva.",
      );
    }
  }
  return (
    <div className="stock-page">
      <div className="page-head">
        <div>
          <div className="eyebrow">ALMACÉN / RESERVAS</div>
          <h1>Reservas de stock</h1>
          <p>
            El stock reservado reduce el disponible sin alterar todavía el stock
            físico.
          </p>
        </div>
        <button
          className="stock-button primary"
          onClick={() => setShowForm((v) => !v)}
        >
          <Plus size={15} />
          {showForm ? "Cerrar" : "Nueva reserva"}
        </button>
      </div>
      {error && <div className="inline-error">{error}</div>}
      {showForm && companyId !== null && (
        <ReservationForm
          companyId={companyId}
          warehouses={warehouses}
          onSaved={() => {
            setShowForm(false);
            void load();
          }}
        />
      )}
      <div className="stock-panel">
        <div className="stock-table-wrap">
          <table className="stock-table">
            <thead>
              <tr>
                <th>Fecha</th>
                <th>Almacén</th>
                <th>Artículo</th>
                <th>Característica</th>
                <th className="numeric">Cantidad</th>
                <th>Referencia</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={7}>Cargando…</td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={7} className="empty">
                    No hay reservas activas.
                  </td>
                </tr>
              ) : (
                rows.map((r) => (
                  <tr key={r.id}>
                    <td>{new Date(r.created_at).toLocaleString("es-ES")}</td>
                    <td>
                      {r.warehouse?.code}
                      <span className="secondary-line">
                        {r.warehouse?.name}
                      </span>
                    </td>
                    <td>
                      <strong>{r.product?.code}</strong>
                      <span className="secondary-line">
                        {r.product?.commercial_description || "Sin descripción"}
                      </span>
                    </td>
                    <td>{r.characteristic?.code || "—"}</td>
                    <td className="numeric">{r.quantity}</td>
                    <td>{r.reference || "—"}</td>
                    <td>
                      <div className="row-actions">
                        <button
                          className="icon-action"
                          title="Consumir reserva"
                          onClick={() => void changeReservation(r, "consume")}
                        >
                          <Check size={14} />
                        </button>
                        <button
                          className="icon-action"
                          title="Liberar reserva"
                          onClick={() => void changeReservation(r, "release")}
                        >
                          <X size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function ReservationForm({
  companyId,
  warehouses,
  onSaved,
}: {
  companyId: number;
  warehouses: Warehouse[];
  onSaved: () => void;
}) {
  const [product, setProduct] = useState<StockProduct | null>(null);
  const [chars, setChars] = useState<
    import("../../services/warehouse/stockRepository").StockCharacteristic[]
  >([]);
  const [warehouseId, setWarehouseId] = useState("");
  const [characteristicId, setCharacteristicId] = useState("");
  const [quantity, setQuantity] = useState("");
  const [reference, setReference] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  useEffect(() => {
    if (!product) {
      setChars([]);
      setCharacteristicId("");
      return;
    }
    listStockCharacteristics(product.id)
      .then(setChars)
      .catch(() => setChars([]));
    setCharacteristicId("");
  }, [product?.id]);
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!product) return;
    setSaving(true);
    setError("");
    setMessage("");
    try {
      await reserveStock({
        companyId,
        warehouseId: Number(warehouseId),
        productId: product.id,
        quantity: Number(quantity),
        characteristicId: characteristicId ? Number(characteristicId) : null,
        reference,
        notes,
      });
      setMessage("Reserva creada correctamente.");
      setQuantity("");
      setReference("");
      setNotes("");
      setTimeout(onSaved, 350);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo crear la reserva.");
    } finally {
      setSaving(false);
    }
  }
  return (
    <div className="stock-form-panel">
      <div className="panel-title">
        <div>
          <h2>Nueva reserva</h2>
          <p>Se valida el stock disponible antes de reservar.</p>
        </div>
        <CalendarClock size={20} />
      </div>
      {error && <div className="inline-error">{error}</div>}
      {message && <div className="inline-success">{message}</div>}
      <form className="stock-form-grid" onSubmit={submit}>
        <StockProductLookup
          companyId={companyId}
          value={product}
          onChange={setProduct}
        />
        <label>
          <span>Almacén *</span>
          <select
            value={warehouseId}
            onChange={(e) => setWarehouseId(e.target.value)}
            required
          >
            <option value="">Seleccionar…</option>
            {warehouses.map((w) => (
              <option key={w.id} value={w.id}>
                {w.code} · {w.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>Característica / color</span>
          <select
            value={characteristicId}
            onChange={(e) => setCharacteristicId(e.target.value)}
            disabled={!product}
          >
            <option value="">Sin característica</option>
            {chars.map((c) => (
              <option key={c.id} value={c.id}>
                {c.code}
                {c.description ? ` · ${c.description}` : ""}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>Cantidad *</span>
          <input
            type="number"
            inputMode="decimal"
            min="0.0001"
            step="any"
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
            required
          />
        </label>
        <label>
          <span>Referencia</span>
          <input
            value={reference}
            onChange={(e) => setReference(e.target.value)}
            maxLength={255}
          />
        </label>
        <label className="field-wide">
          <span>Observaciones</span>
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} />
        </label>
        <div className="stock-form-actions field-wide">
          <button className="stock-button primary" disabled={saving}>
            <Save size={15} />
            {saving ? "Reservando…" : "Crear reserva"}
          </button>
        </div>
      </form>
    </div>
  );
}
