import { useEffect, useState } from "react";
import { Pencil, Plus, RotateCcw, Search, Trash2, X } from "lucide-react";
import {
  createCustomerFamilyDiscount,
  createCustomerProductDiscount,
  listCustomerFamilyDiscounts,
  listCustomerProductDiscounts,
  markCustomerFamilyDiscountForDeletion,
  markCustomerProductDiscountForDeletion,
  restoreCustomerFamilyDiscount,
  restoreCustomerProductDiscount,
  searchProductFamilies,
  searchProductsForDiscount,
  updateCustomerFamilyDiscount,
  updateCustomerProductDiscount,
  type DiscountFamilyRow,
  type DiscountProductRow,
} from "../../services/core/customerCommercialRepository";
import "./customerCommercial.css";

type Ref = { id: number; code: string; name: string };

function EntitySearch({
  value,
  onChange,
  load,
  placeholder,
}: {
  value: Ref | null;
  onChange: (v: Ref | null) => void;
  load: (q: string) => Promise<Ref[]>;
  placeholder: string;
}) {
  const [query, setQuery] = useState(
    value ? `${value.code} · ${value.name}` : "",
  );
  const [options, setOptions] = useState<Ref[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    setQuery(value ? `${value.code} · ${value.name}` : "");
  }, [value]);
  useEffect(() => {
    let alive = true;
    const t = setTimeout(async () => {
      const trimmed = query.trim();
      if (!trimmed || (value && trimmed === `${value.code} · ${value.name}`)) {
        setOptions([]);
        return;
      }
      setLoading(true);
      try {
        const r = await load(trimmed);
        if (alive) setOptions(r);
      } catch {
        if (alive) setOptions([]);
      } finally {
        if (alive) setLoading(false);
      }
    }, 180);
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [query, value, load]);
  function clear() {
    setQuery("");
    setOptions([]);
    setOpen(true);
    onChange(null);
  }
  return (
    <div className="entity-search">
      <div className="entity-search-control">
        <Search className="entity-search-icon" size={15} />
        <input
          className="entity-search-input"
          value={query}
          placeholder={placeholder}
          autoComplete="off"
          onFocus={() => setOpen(true)}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
            if (value) onChange(null);
          }}
          onBlur={() => setTimeout(() => setOpen(false), 160)}
        />
        {query && (
          <button
            className="entity-search-clear"
            type="button"
            aria-label="Limpiar búsqueda"
            onMouseDown={(e) => e.preventDefault()}
            onClick={clear}
          >
            <X size={14} />
          </button>
        )}
      </div>
      {open && (query.trim() || options.length > 0) && (
        <div className="entity-search-results">
          {loading ? (
            <div className="entity-search-option muted">Buscando…</div>
          ) : options.length === 0 ? (
            <div className="entity-search-option muted">Sin resultados</div>
          ) : (
            options.map((o) => (
              <button
                key={o.id}
                type="button"
                className="entity-search-option"
                onMouseDown={() => {
                  onChange(o);
                  setQuery(`${o.code} · ${o.name}`);
                  setOpen(false);
                }}
              >
                <strong>{o.code}</strong>
                <span>{o.name}</span>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}

export function CustomerCommercialSection({
  companyId,
  customerPartyId,
  editable,
  id = "descuentos",
}: {
  companyId: number;
  customerPartyId: number;
  editable: boolean;
  id?: string;
}) {
  const [families, setFamilies] = useState<DiscountFamilyRow[]>([]);
  const [products, setProducts] = useState<DiscountProductRow[]>([]);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [familyOpen, setFamilyOpen] = useState(false);
  const [productOpen, setProductOpen] = useState(false);
  const [familyEdit, setFamilyEdit] = useState<DiscountFamilyRow | null>(null);
  const [productEdit, setProductEdit] = useState<DiscountProductRow | null>(
    null,
  );
  const [familyRef, setFamilyRef] = useState<Ref | null>(null);
  const [productRef, setProductRef] = useState<Ref | null>(null);
  const [familyDiscount, setFamilyDiscount] = useState("");
  const [productDiscount, setProductDiscount] = useState("");
  async function load() {
    setError("");
    try {
      const [f, p] = await Promise.all([
        listCustomerFamilyDiscounts(customerPartyId, editable),
        listCustomerProductDiscounts(customerPartyId, editable),
      ]);
      setFamilies(f);
      setProducts(p);
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "No se pudieron cargar las condiciones comerciales.",
      );
    }
  }
  useEffect(() => {
    load();
  }, [customerPartyId, editable]);
  function resetFamily() {
    setFamilyOpen(false);
    setFamilyEdit(null);
    setFamilyRef(null);
    setFamilyDiscount("");
  }
  function resetProduct() {
    setProductOpen(false);
    setProductEdit(null);
    setProductRef(null);
    setProductDiscount("");
  }
  async function saveFamily() {
    const n = Number(familyDiscount);
    if (!familyEdit && !familyRef) {
      setError("Selecciona una familia.");
      return;
    }
    if (!Number.isFinite(n) || n < 0 || n > 100) {
      setError("El descuento debe estar entre 0 y 100 %.");
      return;
    }
    try {
      if (familyEdit) await updateCustomerFamilyDiscount(familyEdit.id, n);
      else
        await createCustomerFamilyDiscount(
          companyId,
          customerPartyId,
          familyRef!.id,
          n,
        );
      setMessage("Descuento por familia guardado correctamente.");
      resetFamily();
      await load();
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "No se pudo guardar el descuento por familia.",
      );
    }
  }
  async function saveProduct() {
    const n = Number(productDiscount);
    if (!productEdit && !productRef) {
      setError("Selecciona un artículo.");
      return;
    }
    if (!Number.isFinite(n) || n < 0 || n > 100) {
      setError("El descuento debe estar entre 0 y 100 %.");
      return;
    }
    try {
      if (productEdit) await updateCustomerProductDiscount(productEdit.id, n);
      else
        await createCustomerProductDiscount(customerPartyId, productRef!.id, n);
      setMessage("Descuento por artículo guardado correctamente.");
      resetProduct();
      await load();
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "No se pudo guardar el descuento por artículo.",
      );
    }
  }
  async function removeFamily(id: number) {
    if (!confirm("¿Marcar este descuento por familia para borrado?")) return;
    try {
      await markCustomerFamilyDiscountForDeletion(id);
      setMessage("Descuento por familia marcado para borrado.");
      await load();
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "No se pudo marcar el descuento para borrado.",
      );
    }
  }
  async function restoreFamily(id: number) {
    try {
      await restoreCustomerFamilyDiscount(id);
      setMessage("Descuento por familia recuperado correctamente.");
      await load();
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "No se pudo recuperar el descuento.",
      );
    }
  }
  async function removeProduct(id: number) {
    if (!confirm("¿Marcar este descuento por artículo para borrado?")) return;
    try {
      await markCustomerProductDiscountForDeletion(id);
      setMessage("Descuento por artículo marcado para borrado.");
      await load();
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "No se pudo marcar el descuento para borrado.",
      );
    }
  }
  async function restoreProduct(id: number) {
    try {
      await restoreCustomerProductDiscount(id);
      setMessage("Descuento por artículo recuperado correctamente.");
      await load();
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "No se pudo recuperar el descuento.",
      );
    }
  }
  return (
    <section id={id} className="panel customer-detail-anchor">
      <div className="panel-head">
        <div>
          <h2>Descuentos</h2>
          <p>
            Condiciones comerciales específicas del cliente para familias y
            artículos.
          </p>
        </div>
      </div>
      {error && <div className="inline-error">{error}</div>}
      {message && <div className="inline-success">{message}</div>}
      <div className="commercial-subsection">
        <div className="subsection-head">
          <div>
            <h3>Descuentos por familia</h3>
            <p>Se aplica a todos los artículos de la familia.</p>
          </div>
          {editable && (
            <button
              className="secondary-button"
              type="button"
              onClick={() => {
                resetFamily();
                setFamilyOpen(true);
                setError("");
                setMessage("");
              }}
            >
              <Plus size={15} /> Añadir
            </button>
          )}
        </div>
        <div className="table-panel compact-table">
          <table>
            <thead>
              <tr>
                <th>Familia</th>
                <th>Descripción</th>
                <th>Descuento</th>
                <th>Estado</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {families.length === 0 ? (
                <tr>
                  <td colSpan={5}>No hay descuentos por familia.</td>
                </tr>
              ) : (
                families.map((r) => {
                  const deleted = !!r.deleted_at;
                  return (
                    <tr key={r.id}>
                      <td>{r.family_code}</td>
                      <td>{r.family_name}</td>
                      <td>{r.discount_percent}%</td>
                      <td>
                        <span
                          className={`status ${deleted ? "inactive" : "active"}`}
                        >
                          {deleted
                            ? "Marcado para borrado"
                            : r.active
                              ? "Activo"
                              : "Inactivo"}
                        </span>
                      </td>
                      <td>
                        {editable && !deleted && (
                          <>
                            <button
                              className="icon-action"
                              title="Editar"
                              type="button"
                              onClick={() => {
                                setFamilyEdit(r);
                                setFamilyDiscount(String(r.discount_percent));
                                setFamilyOpen(true);
                                setError("");
                                setMessage("");
                              }}
                            >
                              <Pencil size={15} />
                            </button>
                            <button
                              className="icon-action danger"
                              title="Marcar para borrado"
                              type="button"
                              onClick={() => removeFamily(r.id)}
                            >
                              <Trash2 size={15} />
                            </button>
                          </>
                        )}
                        {editable && deleted && (
                          <button
                            className="icon-action"
                            title="Recuperar"
                            type="button"
                            onClick={() => restoreFamily(r.id)}
                          >
                            <RotateCcw size={15} />
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
        {familyOpen && editable && (
          <div className="subform">
            <div className="form-grid">
              {familyEdit ? (
                <label>
                  Familia
                  <input
                    value={`${familyEdit.family_code} · ${familyEdit.family_name}`}
                    readOnly
                  />
                </label>
              ) : (
                <label>
                  Familia
                  <EntitySearch
                    value={familyRef}
                    onChange={setFamilyRef}
                    load={(q) => searchProductFamilies(companyId, q)}
                    placeholder="Buscar familia por código o nombre…"
                  />
                </label>
              )}
              <label>
                Descuento (%)
                <input
                  className="field-sm"
                  inputMode="decimal"
                  value={familyDiscount}
                  onChange={(e) => setFamilyDiscount(e.target.value)}
                />
              </label>
            </div>
            <div className="actions">
              <button
                type="button"
                className="secondary-button"
                onClick={resetFamily}
              >
                Cancelar
              </button>
              <button
                type="button"
                className="primary-button"
                onClick={saveFamily}
              >
                Guardar descuento
              </button>
            </div>
          </div>
        )}
      </div>
      <div className="commercial-subsection">
        <div className="subsection-head">
          <div>
            <h3>Descuentos por artículo</h3>
            <p>
              Prevalece sobre el descuento de familia para el mismo cliente.
            </p>
          </div>
          {editable && (
            <button
              className="secondary-button"
              type="button"
              onClick={() => {
                resetProduct();
                setProductOpen(true);
                setError("");
                setMessage("");
              }}
            >
              <Plus size={15} /> Añadir
            </button>
          )}
        </div>
        <div className="table-panel compact-table">
          <table>
            <thead>
              <tr>
                <th>Artículo</th>
                <th>Descripción</th>
                <th>Familia</th>
                <th>Descuento</th>
                <th>Estado</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {products.length === 0 ? (
                <tr>
                  <td colSpan={6}>No hay descuentos por artículo.</td>
                </tr>
              ) : (
                products.map((r) => {
                  const deleted = !!r.deleted_at;
                  return (
                    <tr key={r.id}>
                      <td>{r.product_code}</td>
                      <td>{r.product_name || "—"}</td>
                      <td>{r.family_name || "—"}</td>
                      <td>{r.discount_percent}%</td>
                      <td>
                        <span
                          className={`status ${deleted ? "inactive" : "active"}`}
                        >
                          {deleted
                            ? "Marcado para borrado"
                            : r.active
                              ? "Activo"
                              : "Inactivo"}
                        </span>
                      </td>
                      <td>
                        {editable && !deleted && (
                          <>
                            <button
                              className="icon-action"
                              title="Editar"
                              type="button"
                              onClick={() => {
                                setProductEdit(r);
                                setProductDiscount(String(r.discount_percent));
                                setProductOpen(true);
                                setError("");
                                setMessage("");
                              }}
                            >
                              <Pencil size={15} />
                            </button>
                            <button
                              className="icon-action danger"
                              title="Marcar para borrado"
                              type="button"
                              onClick={() => removeProduct(r.id)}
                            >
                              <Trash2 size={15} />
                            </button>
                          </>
                        )}
                        {editable && deleted && (
                          <button
                            className="icon-action"
                            title="Recuperar"
                            type="button"
                            onClick={() => restoreProduct(r.id)}
                          >
                            <RotateCcw size={15} />
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
        {productOpen && editable && (
          <div className="subform">
            <div className="form-grid">
              {productEdit ? (
                <label>
                  Artículo
                  <input
                    value={`${productEdit.product_code} · ${productEdit.product_name}`}
                    readOnly
                  />
                </label>
              ) : (
                <label>
                  Artículo
                  <EntitySearch
                    value={productRef}
                    onChange={setProductRef}
                    load={(q) => searchProductsForDiscount(companyId, q)}
                    placeholder="Buscar artículo por código o descripción…"
                  />
                </label>
              )}
              <label>
                Descuento (%)
                <input
                  className="field-sm"
                  inputMode="decimal"
                  value={productDiscount}
                  onChange={(e) => setProductDiscount(e.target.value)}
                />
              </label>
            </div>
            <div className="actions">
              <button
                type="button"
                className="secondary-button"
                onClick={resetProduct}
              >
                Cancelar
              </button>
              <button
                type="button"
                className="primary-button"
                onClick={saveProduct}
              >
                Guardar descuento
              </button>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
