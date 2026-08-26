import { FormEvent, useEffect, useState } from "react";
import { ArrowRightLeft, Save } from "lucide-react";
import { getActiveCompanies } from "../../services/core/coreRepository";
import {
  listWarehouses,
  type Warehouse,
} from "../../services/warehouse/warehouseRepository";
import {
  listStockCharacteristics,
  registerStockTransfer,
  type StockProduct,
} from "../../services/warehouse/stockRepository";
import { StockProductLookup } from "./StockProductLookup";
import "./stock.css";

export function StockTransfers() {
  const [companyId, setCompanyId] = useState<number | null>(null);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [product, setProduct] = useState<StockProduct | null>(null);
  const [characteristics, setCharacteristics] = useState<
    import("../../services/warehouse/stockRepository").StockCharacteristic[]
  >([]);
  const [source, setSource] = useState("");
  const [target, setTarget] = useState("");
  const [characteristicId, setCharacteristicId] = useState("");
  const [quantity, setQuantity] = useState("");
  const [reference, setReference] = useState("");
  const [notes, setNotes] = useState("");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 16));
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  useEffect(() => {
    getActiveCompanies()
      .then((c) => {
        const id = c[0]?.id ?? null;
        setCompanyId(id);
        if (id)
          listWarehouses(id, "", "active")
            .then(setWarehouses)
            .catch((e) =>
              setError(
                e instanceof Error
                  ? e.message
                  : "No se pudieron cargar los almacenes.",
              ),
            );
      })
      .catch((e) =>
        setError(
          e instanceof Error ? e.message : "No se pudo cargar la empresa.",
        ),
      );
  }, []);
  useEffect(() => {
    if (!product) {
      setCharacteristics([]);
      setCharacteristicId("");
      return;
    }
    listStockCharacteristics(product.id)
      .then(setCharacteristics)
      .catch(() => setCharacteristics([]));
    setCharacteristicId("");
  }, [product?.id]);
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (companyId === null || !product) return;
    setSaving(true);
    setMessage("");
    setError("");
    try {
      const group = await registerStockTransfer({
        companyId,
        sourceWarehouseId: Number(source),
        targetWarehouseId: Number(target),
        productId: product.id,
        quantity: Number(quantity),
        characteristicId: characteristicId ? Number(characteristicId) : null,
        reference,
        notes,
        movementDate: date,
      });
      setMessage(
        `Traspaso realizado correctamente. Grupo ${group.slice(0, 8)}.`,
      );
      setQuantity("");
      setReference("");
      setNotes("");
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "No se pudo realizar el traspaso.",
      );
    } finally {
      setSaving(false);
    }
  }
  return (
    <div className="stock-page">
      <div className="page-head">
        <div>
          <div className="eyebrow">ALMACÉN / TRASPASOS</div>
          <h1>Transferencia entre almacenes</h1>
          <p>
            Se generan automáticamente una salida en origen y una entrada en
            destino.
          </p>
        </div>
      </div>
      {error && <div className="inline-error">{error}</div>}
      {message && <div className="inline-success">{message}</div>}
      <div className="stock-form-panel">
        <div className="transfer-visual">
          <span>
            {warehouses.find((w) => String(w.id) === source)?.code || "Origen"}
          </span>
          <ArrowRightLeft size={20} />
          <span>
            {warehouses.find((w) => String(w.id) === target)?.code || "Destino"}
          </span>
        </div>
        <form className="stock-form-grid" onSubmit={submit}>
          <StockProductLookup
            companyId={companyId ?? 0}
            value={product}
            onChange={setProduct}
          />
          <label>
            <span>Almacén origen *</span>
            <select
              value={source}
              onChange={(e) => setSource(e.target.value)}
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
            <span>Almacén destino *</span>
            <select
              value={target}
              onChange={(e) => setTarget(e.target.value)}
              required
            >
              <option value="">Seleccionar…</option>
              {warehouses
                .filter((w) => String(w.id) !== source)
                .map((w) => (
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
              {characteristics.map((c) => (
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
            <span>Fecha y hora</span>
            <input
              type="datetime-local"
              value={date}
              onChange={(e) => setDate(e.target.value)}
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
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </label>
          <div className="stock-form-actions field-wide">
            <button className="stock-button primary" disabled={saving}>
              <Save size={15} />
              {saving ? "Traspasando…" : "Realizar traspaso"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
