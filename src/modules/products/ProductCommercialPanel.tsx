import { useEffect, useState } from "react";
import { Edit3, Plus, Save, Search, Trash2, Undo2, X } from "lucide-react";
import { getActiveCompanies } from "../../services/core/coreRepository";
import {
  listProductCharacteristics,
  type ProductCharacteristic,
} from "../../services/catalog/productRepository";
import {
  listProductScales,
  listProductSuppliers,
  markProductScaleForDeletion,
  markProductSupplierForDeletion,
  restoreProductScale,
  restoreProductSupplier,
  updateProductScale,
  updateProductSupplier,
  createProductScale,
  createProductSupplier,
  type ProductScaleInput,
  type ProductScaleRow,
  type ProductSupplierInput,
  type ProductSupplierRow,
} from "../../services/catalog/productCommercialRepository";
import {
  loadMasterProductConfiguration,
  type MasterProductConfiguration,
} from "../../services/catalog/productConfigurationService";
import { supabase } from "../../lib/supabase";

type Props = {
  productId: number;
  editable?: boolean;
  scaled?: boolean;
  refreshKey?: number;
  onError: (message: string) => void;
};
type SupplierRef = { id: number; name: string };
type CommercialForm = {
  supplier_party_id: number | null;
  supplier_code: string;
  price_type: string;
  price: number | null;
  discount_percent: number;
  active: boolean;
  characteristic_id: number | null;
  delivery_days: number | null;
};
type ScaleForm = {
  dimension_values: number[];
  price: number;
  characteristic_id: number | null;
  attribute_values: Record<string, number | string | boolean | null>;
};
const emptySupplier = (): CommercialForm => ({
  supplier_party_id: null,
  supplier_code: "",
  price_type: "STANDARD",
  price: null,
  discount_percent: 0,
  active: true,
  characteristic_id: null,
  delivery_days: null,
});
const emptyScale = (): ScaleForm => ({
  dimension_values: [],
  price: 0,
  characteristic_id: null,
  attribute_values: {},
});

export function EntitySearchHelp({
  title,
  placeholder,
  items,
  value,
  onChange,
  labelOf,
  required = false,
}: {
  title: string;
  placeholder: string;
  items: { id: number }[];
  value: number | null;
  onChange: (id: number | null) => void;
  labelOf: (item: { id: number }) => string;
  required?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const selected = items.find((s) => s.id === value) ?? null;
  const filtered = items.filter((s) =>
    labelOf(s).toLowerCase().includes(query.trim().toLowerCase()),
  );
  return (
    <>
      {
        <div className="entity-lookup-field">
          <button
            type="button"
            className="entity-lookup-trigger"
            onClick={() => setOpen(true)}
          >
            <span className={selected ? "" : "entity-lookup-placeholder"}>
              {selected ? labelOf(selected) : placeholder}
            </span>
            <Search size={16} />
          </button>
          {selected && !required && (
            <button
              type="button"
              className="entity-lookup-clear"
              title="Quitar selección"
              onClick={() => onChange(null)}
            >
              <X size={14} />
            </button>
          )}
        </div>
      }
      {open && (
        <div
          className="entity-lookup-backdrop"
          role="presentation"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setOpen(false);
          }}
        >
          <div
            className="entity-lookup-dialog"
            role="dialog"
            aria-modal="true"
            aria-label={title}
          >
            <div className="entity-lookup-head">
              <div>
                <h3>{title}</h3>
                <p>Busca y selecciona una entidad existente.</p>
              </div>
              <button
                type="button"
                className="icon-action"
                onClick={() => setOpen(false)}
              >
                <X size={17} />
              </button>
            </div>
            <label className="entity-lookup-search">
              <Search size={16} />
              <input
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Buscar…"
              />
            </label>
            <div className="entity-lookup-results">
              {filtered.length === 0 ? (
                <div className="empty-state">
                  No se han encontrado resultados.
                </div>
              ) : (
                filtered.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    className={`entity-lookup-result${s.id === value ? " selected" : ""}`}
                    onClick={() => {
                      onChange(s.id);
                      setOpen(false);
                      setQuery("");
                    }}
                  >
                    <span>{labelOf(s)}</span>
                  </button>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export function ProductCommercialPanel({
  productId,
  editable = true,
  scaled = false,
  refreshKey = 0,
  onError,
}: Props) {
  const [suppliers, setSuppliers] = useState<SupplierRef[]>([]);
  const [characteristics, setCharacteristics] = useState<
    ProductCharacteristic[]
  >([]);
  const [supplierRows, setSupplierRows] = useState<ProductSupplierRow[]>([]);
  const [scaleRows, setScaleRows] = useState<ProductScaleRow[]>([]);
  const [scaleDimensions, setScaleDimensions] = useState<
    Array<{
      dimension_number: number;
      code: string;
      name: string;
      decimals: number;
    }>
  >([]);
  const [scaleAttributes, setScaleAttributes] = useState<
    MasterProductConfiguration["attributes"]
  >([]);
  const [scaleProduct, setScaleProduct] = useState<
    MasterProductConfiguration["product"] | null
  >(null);
  const [supplierEditing, setSupplierEditing] = useState<number | null>(null);
  const [scaleEditing, setScaleEditing] = useState<number | null>(null);
  const [productScaled, setProductScaled] = useState(scaled);
  const [supplierForm, setSupplierForm] = useState(emptySupplier());
  const [scaleForm, setScaleForm] = useState<ScaleForm>(emptyScale());
  const [saving, setSaving] = useState(false);
  useEffect(() => setProductScaled(!!scaled), [scaled]);
  useEffect(() => {
    void load();
  }, [productId, refreshKey]);
  useEffect(() => {
    if (!editable) {
      setSupplierEditing(null);
      setScaleEditing(null);
    }
  }, [editable]);
  async function load() {
    try {
      const companies = await getActiveCompanies();
      const companyId = companies[0]?.id;
      const [sr, cr, sc, suppliersData, configuration] = await Promise.all([
        listProductSuppliers(productId),
        listProductCharacteristics(productId, "active"),
        listProductScales(productId),
        companyId ? loadSuppliers(companyId) : Promise.resolve([]),
        loadMasterProductConfiguration(productId, companyId),
      ]);
      setSupplierRows(sr);
      setCharacteristics(cr);
      setScaleRows(sc);
      setSuppliers(suppliersData);
      setScaleProduct(configuration.product);
      setScaleDimensions(
        configuration.dimensions.map((d) => ({
          dimension_number: d.dimension_number,
          code: d.code,
          name: d.name,
          decimals: d.decimals,
        })),
      );
      setScaleAttributes(configuration.attributes);
    } catch (e) {
      onError(
        e instanceof Error
          ? e.message
          : "No se pudo cargar la información comercial.",
      );
    }
  }
  async function loadSuppliers(companyId: number): Promise<SupplierRef[]> {
    if (!supabase) return [];
    const db = supabase;
    const roles = await db
      .from("party_role")
      .select("party_id")
      .eq("role_code", "SUPPLIER")
      .eq("active", true);
    if (roles.error) throw roles.error;
    const ids = (roles.data ?? []).map((x) => x.party_id);
    if (!ids.length) return [];
    const p = await db
      .from("party")
      .select("id,legal_name,trade_name")
      .eq("company_id", companyId)
      .eq("active", true)
      .in("id", ids)
      .order("legal_name");
    if (p.error) throw p.error;
    return (p.data ?? []).map((x) => ({
      id: x.id,
      name: x.trade_name || x.legal_name,
    }));
  }
  function startSupplier(row?: ProductSupplierRow) {
    if (!editable) return;
    setSupplierEditing(row?.id ?? 0);
    setSupplierForm(
      row
        ? {
            supplier_party_id: row.supplier_party_id,
            supplier_code: row.supplier_code ?? "",
            price_type: row.price_type ?? "STANDARD",
            price: row.price,
            discount_percent: row.discount_percent,
            active: row.active,
            characteristic_id: row.characteristic_id,
            delivery_days: row.delivery_days,
          }
        : { ...emptySupplier() },
    );
  }
  function startScale(row?: ProductScaleRow) {
    if (!editable || !productScaled || !scaleDimensions.length) return;
    setScaleEditing(row?.id ?? 0);
    const legacy = row
      ? [row.dimension_1, ...(row.dimension_2 == null ? [] : [row.dimension_2])]
      : [];
    const values = row?.dimension_values?.length
      ? row.dimension_values
      : legacy;
    setScaleForm({
      dimension_values: Array.from({ length: scaleDimensions.length }, (_, i) =>
        Number(values[i] ?? 0),
      ),
      price: row?.price ?? 0,
      characteristic_id: row?.characteristic_id ?? null,
      attribute_values: row?.attribute_values ?? {},
    });
  }
  async function saveSupplier() {
    if (!supplierForm.supplier_party_id) {
      onError("Selecciona un proveedor.");
      return;
    }
    setSaving(true);
    try {
      const input: ProductSupplierInput = {
        supplier_party_id: supplierForm.supplier_party_id,
        supplier_code: supplierForm.supplier_code,
        price_type: supplierForm.price_type,
        price: supplierForm.price,
        discount_percent: supplierForm.discount_percent,
        active: supplierForm.active,
        characteristic_id: supplierForm.characteristic_id,
        delivery_days: supplierForm.delivery_days,
      };
      if (supplierEditing === 0) await createProductSupplier(productId, input);
      else if (supplierEditing !== null)
        await updateProductSupplier(supplierEditing, input);
      setSupplierEditing(null);
      await load();
    } catch (e) {
      onError(
        e instanceof Error ? e.message : "No se pudo guardar el proveedor.",
      );
    } finally {
      setSaving(false);
    }
  }
  async function saveScale() {
    if (!productScaled || !scaleDimensions.length) {
      onError("El Tipo de medida no tiene dimensiones configuradas.");
      return;
    }
    if (
      scaleForm.dimension_values.length !== scaleDimensions.length ||
      scaleForm.dimension_values.some((v) => !Number.isFinite(v) || v < 0)
    ) {
      onError("Completa todas las dimensiones del escalado.");
      return;
    }
    if (scaleForm.price <= 0) {
      onError("El precio del escalado debe ser mayor que 0.");
      return;
    }
    setSaving(true);
    try {
      const payload: ProductScaleInput = {
        dimension_values: scaleForm.dimension_values,
        price: scaleForm.price,
        characteristic_id: null,
        attribute_values: scaleForm.attribute_values,
      };
      if (scaleEditing === 0) await createProductScale(productId, payload);
      else if (scaleEditing !== null)
        await updateProductScale(scaleEditing, payload);
      setScaleEditing(null);
      await load();
    } catch (e) {
      onError(
        e instanceof Error ? e.message : "No se pudo guardar el escalado.",
      );
    } finally {
      setSaving(false);
    }
  }
  const charItems = characteristics as unknown as { id: number }[];
  const charLabel = (item: { id: number }) => {
    const c = characteristics.find((x) => x.id === item.id);
    return c ? `${c.code} · ${c.description}` : `Variante ${item.id}`;
  };
  const attributeValueLabel = (
    attribute: MasterProductConfiguration["attributes"][number],
    valueId: number | string | boolean | null,
  ) => {
    if (valueId == null || valueId === "") return "—";
    const value = attribute.values.find(
      (v) => String(v.id) === String(valueId),
    );
    return value?.name ?? String(valueId);
  };
  const scaleAttributeSummary = (row: ProductScaleRow) =>
    scaleAttributes
      .map((a) => {
        const valueId = row.attribute_values?.[String(a.attribute_id)];
        if (valueId == null) return null;
        return `${a.name}: ${attributeValueLabel(a, valueId)}`;
      })
      .filter(Boolean)
      .join(" · ") || "General";
  return (
    <section
      id="producto-precios"
      className="panel product-commercial-panel product-profile-anchor"
    >
      <div className="panel-head">
        <div>
          <h2>Proveedores y precios</h2>
          <p>
            Proveedores, precios de compra y escalados comerciales del artículo.
          </p>
        </div>
      </div>
      <div className="commercial-summary">
        <div>
          <span>Precio venta</span>
          <strong>Se gestiona en Datos comerciales</strong>
        </div>
        <div>
          <span>Proveedores</span>
          <strong>{supplierRows.length}</strong>
        </div>
        <div>
          <span>Escalados</span>
          <strong>{scaleRows.length}</strong>
        </div>
      </div>
      <div className="panel-head commercial-subhead">
        <div>
          <h3>Proveedores</h3>
          <p>El descuento aquí es de compra y pertenece al proveedor.</p>
        </div>
        {editable && (
          <button
            className="secondary-button compact"
            type="button"
            onClick={() => startSupplier()}
          >
            <Plus size={15} /> Añadir proveedor
          </button>
        )}
      </div>
      {supplierEditing !== null && editable && (
        <div className="characteristic-inline-editor">
          <div className="form-grid">
            <label>
              Proveedor *
              <EntitySearchHelp
                title="Buscar proveedor"
                placeholder="Seleccionar proveedor…"
                items={suppliers}
                value={supplierForm.supplier_party_id}
                onChange={(id) =>
                  setSupplierForm({ ...supplierForm, supplier_party_id: id })
                }
                labelOf={(item) =>
                  suppliers.find((x) => x.id === item.id)?.name ??
                  `Proveedor ${item.id}`
                }
                required
              />
            </label>
            <label>
              Código proveedor
              <input
                value={supplierForm.supplier_code}
                onChange={(e) =>
                  setSupplierForm({
                    ...supplierForm,
                    supplier_code: e.target.value,
                  })
                }
              />
            </label>
            <label>
              Tipo precio
              <select
                value={supplierForm.price_type}
                onChange={(e) =>
                  setSupplierForm({
                    ...supplierForm,
                    price_type: e.target.value,
                  })
                }
              >
                <option value="STANDARD">Estándar</option>
                <option value="NET">Neto</option>
              </select>
            </label>
            <label>
              Precio compra
              <input
                type="number"
                step="0.01"
                value={supplierForm.price ?? ""}
                onChange={(e) =>
                  setSupplierForm({
                    ...supplierForm,
                    price:
                      e.target.value === "" ? null : Number(e.target.value),
                  })
                }
              />
            </label>
            <label>
              Descuento %
              <input
                type="number"
                step="0.01"
                min="0"
                max="100"
                value={supplierForm.discount_percent}
                onChange={(e) =>
                  setSupplierForm({
                    ...supplierForm,
                    discount_percent: Number(e.target.value),
                  })
                }
              />
            </label>
            <label>
              Días entrega
              <input
                type="number"
                min="0"
                value={supplierForm.delivery_days ?? ""}
                onChange={(e) =>
                  setSupplierForm({
                    ...supplierForm,
                    delivery_days:
                      e.target.value === "" ? null : Number(e.target.value),
                  })
                }
              />
            </label>
            <label>
              Variante
              <EntitySearchHelp
                title="Buscar variante"
                placeholder="General (sin variante)"
                items={charItems}
                value={supplierForm.characteristic_id}
                onChange={(id) =>
                  setSupplierForm({ ...supplierForm, characteristic_id: id })
                }
                labelOf={charLabel}
              />
            </label>
          </div>
          <div className="actions">
            <button
              type="button"
              className="secondary-button"
              onClick={() => setSupplierEditing(null)}
            >
              Cancelar
            </button>
            <button
              type="button"
              className="primary-button"
              disabled={saving}
              onClick={saveSupplier}
            >
              <Save size={15} />
              Guardar
            </button>
          </div>
        </div>
      )}
      <div className="table-panel product-table">
        <table>
          <thead>
            <tr>
              <th>Proveedor</th>
              <th>Código</th>
              <th>Variante</th>
              <th>Precio</th>
              <th>Dto.</th>
              <th>Entrega</th>
              <th>Estado</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {supplierRows.length === 0 ? (
              <tr>
                <td colSpan={8}>
                  <div className="empty-state">
                    No hay proveedores definidos.
                  </div>
                </td>
              </tr>
            ) : (
              supplierRows.map((r) => (
                <tr key={r.id}>
                  <td>{r.supplier_name}</td>
                  <td>{r.supplier_code || "—"}</td>
                  <td>{r.characteristic_code || "General"}</td>
                  <td>
                    {r.price == null ? "—" : Number(r.price).toFixed(2) + " €"}
                  </td>
                  <td>{Number(r.discount_percent).toFixed(2)} %</td>
                  <td>
                    {r.delivery_days == null ? "—" : `${r.delivery_days} días`}
                  </td>
                  <td>
                    <span
                      className={`status ${r.active ? "active" : "inactive"}`}
                    >
                      {r.active ? "Activo" : "Marcado para borrado"}
                    </span>
                  </td>
                  <td>
                    {editable && !r.active && (
                      <button
                        className="icon-action"
                        onClick={() =>
                          restoreProductSupplier(r.id)
                            .then(load)
                            .catch((e) =>
                              onError(
                                e instanceof Error
                                  ? e.message
                                  : "No se pudo recuperar.",
                              ),
                            )
                        }
                      >
                        <Undo2 size={15} />
                      </button>
                    )}
                    {editable && r.active && (
                      <>
                        <button
                          className="icon-action"
                          onClick={() => startSupplier(r)}
                        >
                          <Edit3 size={15} />
                        </button>
                        <button
                          className="icon-action danger"
                          onClick={() =>
                            markProductSupplierForDeletion(r.id)
                              .then(load)
                              .catch((e) =>
                                onError(
                                  e instanceof Error
                                    ? e.message
                                    : "No se pudo borrar.",
                                ),
                              )
                          }
                        >
                          <Trash2 size={15} />
                        </button>
                      </>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      <div className="panel-head commercial-subhead">
        <div>
          <h3>Escalados</h3>
          <p>
            {productScaled
              ? scaleDimensions.length
                ? `El escalado se adapta automáticamente a las ${scaleDimensions.length} dimensiones del Tipo de medida.`
                : "El Tipo de medida no tiene dimensiones configuradas."
              : "Activa «Escalado» en el artículo para poder crear escalados."}
          </p>
        </div>
        {editable && productScaled && scaleDimensions.length > 0 && (
          <button
            className="secondary-button compact"
            type="button"
            onClick={() => startScale()}
          >
            <Plus size={15} /> Añadir escalado
          </button>
        )}
      </div>
      {scaleEditing !== null && editable && productScaled && (
        <div className="characteristic-inline-editor">
          <div className="form-grid">
            <label>
              Artículo
              <input
                value={
                  scaleProduct
                    ? `${scaleProduct.code} · ${scaleProduct.commercial_description || scaleProduct.technical_description || ""}`
                    : String(productId)
                }
                readOnly
              />
            </label>
            {scaleDimensions.map((d, i) => (
              <label key={d.dimension_number}>
                {d.name}
                {d.code ? ` (${d.code})` : ""}
                <input
                  type="number"
                  min="0"
                  step={10 ** -d.decimals}
                  value={scaleForm.dimension_values[i] ?? ""}
                  onChange={(e) => {
                    const values = [...scaleForm.dimension_values];
                    values[i] =
                      e.target.value === "" ? 0 : Number(e.target.value);
                    setScaleForm({ ...scaleForm, dimension_values: values });
                  }}
                />
              </label>
            ))}
            {scaleAttributes.map((a) => (
              <label key={a.attribute_id}>
                {a.name}
                <select
                  value={
                    scaleForm.attribute_values[String(a.attribute_id)] == null
                      ? ""
                      : String(
                          scaleForm.attribute_values[String(a.attribute_id)],
                        )
                  }
                  onChange={(e) =>
                    setScaleForm({
                      ...scaleForm,
                      attribute_values: {
                        ...scaleForm.attribute_values,
                        [String(a.attribute_id)]:
                          e.target.value === "" ? null : Number(e.target.value),
                      },
                    })
                  }
                >
                  <option value="">Selecciona...</option>
                  {a.values.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.name}
                    </option>
                  ))}
                </select>
              </label>
            ))}
            <label>
              Precio *
              <input
                type="number"
                min="0"
                step="0.01"
                value={scaleForm.price}
                onChange={(e) =>
                  setScaleForm({ ...scaleForm, price: Number(e.target.value) })
                }
              />
            </label>
          </div>
          <div className="actions">
            <button
              type="button"
              className="secondary-button"
              onClick={() => setScaleEditing(null)}
            >
              Cancelar
            </button>
            <button
              type="button"
              className="primary-button"
              disabled={saving}
              onClick={saveScale}
            >
              <Save size={15} />
              Guardar
            </button>
          </div>
        </div>
      )}
      <div className="table-panel product-table">
        <table>
          <thead>
            <tr>
              {scaleDimensions.map((d) => (
                <th key={d.dimension_number}>{d.name}</th>
              ))}
              <th>Características</th>
              <th>Precio</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {scaleRows.length === 0 ? (
              <tr>
                <td colSpan={scaleDimensions.length + 3}>
                  <div className="empty-state">
                    No hay escalados definidos para este artículo.
                  </div>
                </td>
              </tr>
            ) : (
              scaleRows.map((r) => (
                <tr key={r.id}>
                  {scaleDimensions.map((d, i) => (
                    <td key={d.dimension_number}>
                      {r.dimension_values?.[i] ??
                        (i === 0
                          ? r.dimension_1
                          : i === 1
                            ? r.dimension_2
                            : "—")}
                    </td>
                  ))}
                  <td>{scaleAttributeSummary(r)}</td>
                  <td>{Number(r.price).toFixed(2) + " €"}</td>
                  <td>
                    {editable && (
                      <>
                        <button
                          className="icon-action"
                          onClick={() => startScale(r)}
                        >
                          <Edit3 size={15} />
                        </button>
                        <button
                          className="icon-action danger"
                          onClick={() =>
                            markProductScaleForDeletion(r.id)
                              .then(load)
                              .catch((e) =>
                                onError(
                                  e instanceof Error
                                    ? e.message
                                    : "No se pudo borrar.",
                                ),
                              )
                          }
                        >
                          <Trash2 size={15} />
                        </button>
                      </>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
