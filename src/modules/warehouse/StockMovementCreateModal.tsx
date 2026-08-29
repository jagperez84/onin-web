import { FormEvent, useEffect, useState } from "react";
import { Ruler, Save, X } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { getActiveCompanies } from "../../services/core/coreRepository";
import { listWarehouses, type Warehouse } from "../../services/warehouse/warehouseRepository";
import { listMovementTypes, listStockCharacteristics, registerStockMovement, type StockProduct, type StockCharacteristic } from "../../services/warehouse/stockRepository";
import { getProductLineDefinition, type ProductDimensionDefinition } from "../../services/catalog/productDefinitionRepository";
import { StockProductLookup } from "./StockProductLookup";
import "./stock.css";

type ProductDimension = ProductDimensionDefinition & { id: string };

async function listProductDimensions(productId: number): Promise<ProductDimension[]> {
  const definition = await getProductLineDefinition(productId);
  return definition.dimensions.map((d) => ({ ...d, id: `${productId}-${d.dimension_number}` }));
}

type Props = { onClose: () => void };

export function StockMovementCreateModal({ onClose }: Props) {
  const navigate = useNavigate();
  const [companyId, setCompanyId] = useState<number | null>(null);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [types, setTypes] = useState<{ id: number; code: string; name: string; direction: number }[]>([]);
  const [product, setProduct] = useState<StockProduct | null>(null);
  const [characteristics, setCharacteristics] = useState<StockCharacteristic[]>([]);
  const [dimensions, setDimensions] = useState<ProductDimension[]>([]);
  const [dimensionValues, setDimensionValues] = useState<Record<string, string>>({});
  const [warehouseId, setWarehouseId] = useState("");
  const [type, setType] = useState("");
  const [characteristicId, setCharacteristicId] = useState("");
  const [quantity, setQuantity] = useState("");
  const [reference, setReference] = useState("");
  const [notes, setNotes] = useState("");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 16));
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    getActiveCompanies().then((companies) => {
      const id = companies[0]?.id ?? null;
      setCompanyId(id);
      if (!id) return;
      return Promise.all([listWarehouses(id, "", "active"), listMovementTypes(id)]).then(([warehouseRows, movementTypes]) => {
        setWarehouses(warehouseRows);
        setTypes(movementTypes.filter((item) => !["TRANSFER_IN", "TRANSFER_OUT"].includes(item.code)));
        setType(movementTypes.find((item) => item.code === "ADJUSTMENT_IN")?.code ?? "");
      });
    }).catch((value) => setError(value instanceof Error ? value.message : "No se pudieron cargar los datos."));
  }, []);

  useEffect(() => {
    if (!product) {
      setCharacteristics([]); setDimensions([]); setDimensionValues({}); setCharacteristicId(""); return;
    }
    setError("");
    Promise.all([listStockCharacteristics(product.id), listProductDimensions(product.id)]).then(([characteristicRows, dimensionRows]) => {
      setCharacteristics(characteristicRows);
      setDimensions(dimensionRows);
      setDimensionValues(Object.fromEntries(dimensionRows.map((dimension) => [dimension.code, ""])));
    }).catch((value) => {
      setCharacteristics([]); setDimensions([]); setDimensionValues({});
      setError(value instanceof Error ? value.message : "No se pudieron cargar las dimensiones del artículo.");
    });
    setCharacteristicId("");
  }, [product?.id]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (companyId === null || !product) return;
    const characteristicRequired = product.include_stock_by_color && characteristics.length > 0;
    if (characteristicRequired && !characteristicId) { setError("Selecciona una característica para este artículo."); return; }
    setSaving(true); setError("");
    try {
      const normalizedDimensions = Object.fromEntries(dimensions.map((dimension) => [dimension.code, dimensionValues[dimension.code] === undefined || dimensionValues[dimension.code] === "" ? null : Number(dimensionValues[dimension.code])]));
      if (dimensions.some((dimension) => normalizedDimensions[dimension.code] === null)) throw new Error("Completa todas las dimensiones del artículo.");
      await registerStockMovement({ companyId, warehouseId: Number(warehouseId), productId: product.id, quantity: Number(quantity), movementTypeCode: type, characteristicId: characteristicId ? Number(characteristicId) : null, dimensionValues: normalizedDimensions, reference, notes, movementDate: date });
      navigate("/almacen/movimientos", { replace: true, state: { stockSuccess: "Movimiento registrado correctamente." } });
    } catch (value) {
      setError(value instanceof Error ? value.message : "No se pudo registrar el movimiento.");
    } finally { setSaving(false); }
  }

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <div className="stock-movement-modal" role="dialog" aria-modal="true" aria-labelledby="stock-movement-title">
        <div className="stock-modal-head">
          <div><div className="eyebrow">ALMACÉN / MOVIMIENTOS</div><h2 id="stock-movement-title">Nuevo movimiento</h2><p>Registra una entrada, salida o ajuste de stock.</p></div>
          <button type="button" className="stock-modal-close" onClick={onClose} aria-label="Cerrar"><X size={18} /></button>
        </div>
        {error && <div className="inline-error">{error}</div>}
        <form className="stock-form-grid" onSubmit={submit}>
          <StockProductLookup companyId={companyId ?? 0} value={product} onChange={setProduct} />
          <label><span>Almacén *</span><select value={warehouseId} onChange={(event) => setWarehouseId(event.target.value)} required><option value="">Seleccionar…</option>{warehouses.map((warehouse) => <option key={warehouse.id} value={warehouse.id}>{warehouse.code} · {warehouse.name}</option>)}</select></label>
          <label><span>Tipo *</span><select value={type} onChange={(event) => setType(event.target.value)} required><option value="">Seleccionar…</option>{types.map((movementType) => <option key={movementType.code} value={movementType.code}>{movementType.name}</option>)}</select></label>
          <label><span>Característica / color</span><select value={characteristicId} onChange={(event) => setCharacteristicId(event.target.value)} disabled={!product || characteristics.length === 0} required={Boolean(product?.include_stock_by_color && characteristics.length > 0)}><option value="">{!product ? "Selecciona un artículo" : characteristics.length === 0 ? "Sin características asignadas" : "Sin característica"}</option>{characteristics.map((characteristic) => <option key={characteristic.id} value={characteristic.id}>{characteristic.code}{characteristic.description ? ` · ${characteristic.description}` : ""}</option>)}</select>{product && characteristics.length === 0 && <small className="field-hint">Este artículo no tiene características asignadas; no es necesario seleccionar ninguna.</small>}</label>
          {dimensions.length > 0 && <div className="stock-dimension-fields field-wide"><div className="stock-dimension-title"><Ruler size={15} /> Dimensiones del artículo</div><div className="stock-dimension-grid">{dimensions.map((dimension) => <label key={dimension.id}><span>{dimension.name} <small>({dimension.code}) *</small></span><div className="stock-dimension-input"><input type="number" min="0" step={dimension.decimals ? `0.${"0".repeat(Math.max(0, dimension.decimals - 1))}1` : "1"} value={dimensionValues[dimension.code] ?? ""} onChange={(event) => setDimensionValues((values) => ({ ...values, [dimension.code]: event.target.value }))} required /><em>u.{dimension.unit_id}</em></div></label>)}</div></div>}
          <label><span>Cantidad *</span><input inputMode="decimal" type="number" min="0.0001" step="any" value={quantity} onChange={(event) => setQuantity(event.target.value)} required /></label>
          <label><span>Fecha y hora</span><input type="datetime-local" value={date} onChange={(event) => setDate(event.target.value)} /></label>
          <label><span>Referencia</span><input value={reference} onChange={(event) => setReference(event.target.value)} maxLength={255} /></label>
          <label className="field-wide"><span>Observaciones</span><textarea value={notes} onChange={(event) => setNotes(event.target.value)} /></label>
          <div className="stock-form-actions field-wide"><button type="button" className="stock-button" onClick={onClose}>Cancelar</button><button type="submit" className="stock-button primary" disabled={saving}>{saving ? "Guardando…" : <><Save size={15} /> Registrar movimiento</>}</button></div>
        </form>
      </div>
    </div>
  );
}
