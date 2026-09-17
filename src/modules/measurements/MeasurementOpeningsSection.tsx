import { ChangeEvent, useEffect, useRef, useState } from "react";
import { Edit3, Plus, Ruler, Trash2 } from "lucide-react";
import { confirmDialog } from "../../components/ui/ConfirmDialog";
import { getCurrentCompanyId } from "../../services/core/coreRepository";
import { listUnits } from "../../services/catalog/unitRepository";
import { listActiveOtds, type OtdSummary } from "../../services/otd/otdCalculationService";
import {
  createMeasurementOpening,
  listInstallationConditionTypes,
  listMeasurementOpenings,
  listOtdDimensionSelections,
  markMeasurementOpeningForDeletion,
  replaceMeasurementOpeningConditions,
  replaceMeasurementOpeningProducts,
  updateMeasurementOpening,
  type InstallationConditionType,
  type MeasurementOpeningCondition,
  type MeasurementOpeningFull,
} from "../../services/measurements/measurementOpeningRepository";
import {
  listMeasurementOpeningPhotos,
  removeMeasurementPhoto,
  uploadMeasurementPhoto,
} from "../../services/measurements/measurementRepository";
import {
  MeasurementOpeningModal,
  newOpeningProductDraft,
  type MeasurementOpeningDraft,
  type OpeningOtdOption,
  type OpeningPhotoDraft,
} from "./MeasurementOpeningModal";
import { compressImage } from "./MeasurementPhotos";
import "./measurements.css";

function emptyConditionsFrom(types: InstallationConditionType[]): MeasurementOpeningDraft["conditions"] {
  return types.map((ct) => ({
    code: ct.code,
    name: ct.name,
    dataType: ct.data_type,
    unitLabel: null,
    options: ct.options.map((o) => ({ code: o.code, name: o.name })),
    value: null,
  }));
}

export function MeasurementOpeningsSection({ measurementId, canEdit }: { measurementId: number; canEdit: boolean }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [companyId, setCompanyId] = useState<number | null>(null);
  const [otds, setOtds] = useState<OtdSummary[]>([]);
  const [conditionTypes, setConditionTypes] = useState<InstallationConditionType[]>([]);
  const [unitLabelById, setUnitLabelById] = useState<Map<number, string>>(new Map());
  const [openings, setOpenings] = useState<MeasurementOpeningFull[]>([]);

  const [activeOpeningId, setActiveOpeningId] = useState<number | null>(null);
  const [isNewOpening, setIsNewOpening] = useState(false);
  const [draft, setDraft] = useState<MeasurementOpeningDraft | null>(null);
  const [photos, setPhotos] = useState<OpeningPhotoDraft[]>([]);
  const [saving, setSaving] = useState(false);
  const cameraInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    void load();
  }, [measurementId]);

  async function load() {
    setLoading(true);
    setError("");
    try {
      const cid = await getCurrentCompanyId();
      setCompanyId(cid);
      const [otdRows, condTypes, units, ops] = await Promise.all([
        listActiveOtds(),
        listInstallationConditionTypes(cid),
        listUnits(cid),
        listMeasurementOpenings(measurementId),
      ]);
      setOtds(otdRows);
      setConditionTypes(condTypes);
      setUnitLabelById(new Map(units.map((u) => [u.id, u.symbol || u.code])));
      setOpenings(ops);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudieron cargar los huecos de esta medición.");
    } finally {
      setLoading(false);
    }
  }

  function unitLabel(unitId: number | null) {
    return unitId != null ? unitLabelById.get(unitId) ?? null : null;
  }

  function otdOptions(): OpeningOtdOption[] {
    return otds.map((o) => ({ id: o.id, code: o.code, name: o.name, templateType: o.template_type }));
  }

  function buildDraftFromOpening(o: MeasurementOpeningFull): MeasurementOpeningDraft {
    return {
      label: o.label ?? "",
      products: o.products.length
        ? o.products.map((p) => ({
            key: `p${p.id}`,
            otdId: p.otd_id,
            dimensions: p.dimensions.map((d) => ({
              code: d.code,
              name: d.name,
              unitLabel: unitLabel(d.unit_id),
              unitId: d.unit_id,
              sortOrder: d.sort_order,
              value: d.value,
            })),
          }))
        : [newOpeningProductDraft()],
      conditions: conditionTypes.map((ct) => {
        const existing = o.conditions.find((c) => c.condition_type_id === ct.id);
        const option = existing?.option_id != null ? ct.options.find((opt) => opt.id === existing.option_id) : null;
        const value =
          existing == null
            ? null
            : ct.data_type === "BOOLEAN"
              ? existing.value_boolean
              : ct.data_type === "NUMBER"
                ? existing.value_number
                : ct.data_type === "SELECT"
                  ? option?.code ?? null
                  : existing.value_text;
        return {
          code: ct.code,
          name: ct.name,
          dataType: ct.data_type,
          unitLabel: unitLabel(ct.unit_id),
          options: ct.options.map((opt) => ({ code: opt.code, name: opt.name })),
          value,
        };
      }),
      observations: o.observations ?? "",
    };
  }

  async function loadPhotosFor(openingId: number) {
    try {
      const list = await listMeasurementOpeningPhotos(openingId);
      setPhotos(list.map((p) => ({ path: p.path, previewUrl: p.signedUrl })));
    } catch {
      setPhotos([]);
    }
  }

  async function startNewOpening() {
    setSaving(true);
    setError("");
    try {
      const id = await createMeasurementOpening(measurementId, openings.length + 1);
      setActiveOpeningId(id);
      setIsNewOpening(true);
      setDraft({ label: "", products: [newOpeningProductDraft()], conditions: emptyConditionsFrom(conditionTypes), observations: "" });
      setPhotos([]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo crear el hueco.");
    } finally {
      setSaving(false);
    }
  }

  async function editOpening(o: MeasurementOpeningFull) {
    setActiveOpeningId(o.id);
    setIsNewOpening(false);
    setDraft(buildDraftFromOpening(o));
    void loadPhotosFor(o.id);
  }

  function closeModal() {
    setActiveOpeningId(null);
    setDraft(null);
    setPhotos([]);
  }

  async function handleCancel() {
    if (isNewOpening && activeOpeningId != null) {
      try {
        await markMeasurementOpeningForDeletion(activeOpeningId);
      } catch {
        // El hueco quedó vacío; si el borrado lógico falla no bloqueamos al usuario por ello.
      }
    }
    closeModal();
  }

  async function handleDraftChange(next: MeasurementOpeningDraft) {
    const prev = draft;
    setDraft(next);
    if (!prev) return;
    const prevByKey = new Map(prev.products.map((p) => [p.key, p]));
    for (const product of next.products) {
      const prevProduct = prevByKey.get(product.key);
      const otdChanged = !prevProduct || prevProduct.otdId !== product.otdId;
      if (!otdChanged) continue;
      if (product.otdId == null) {
        setDraft((current) =>
          current
            ? { ...current, products: current.products.map((p) => (p.key === product.key ? { ...p, dimensions: [] } : p)) }
            : current,
        );
        continue;
      }
      try {
        const dimensions = await listOtdDimensionSelections(product.otdId);
        setDraft((current) =>
          current
            ? {
                ...current,
                products: current.products.map((p) =>
                  p.key === product.key
                    ? {
                        ...p,
                        dimensions: dimensions.map((d) => ({
                          code: d.code,
                          name: d.name,
                          unitLabel: unitLabel(d.unit_id),
                          unitId: d.unit_id,
                          sortOrder: d.sort_order,
                          value: null,
                        })),
                      }
                    : p,
                ),
              }
            : current,
        );
      } catch {
        // El usuario puede reintentar volviendo a elegir el OTD.
      }
    }
  }

  async function handleAddPhoto() {
    cameraInput.current?.click();
  }

  async function handleFilesSelected(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []);
    event.target.value = "";
    if (!files.length || activeOpeningId == null) return;
    setSaving(true);
    setError("");
    try {
      for (const file of files) await uploadMeasurementPhoto(measurementId, await compressImage(file), activeOpeningId);
      await loadPhotosFor(activeOpeningId);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo adjuntar la fotografía.");
    } finally {
      setSaving(false);
    }
  }

  async function handleRemovePhoto(path: string) {
    try {
      await removeMeasurementPhoto(measurementId, path);
      setPhotos((current) => current.filter((p) => p.path !== path));
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo eliminar la fotografía.");
    }
  }

  async function handleSave() {
    if (activeOpeningId == null || !draft) return;
    setSaving(true);
    setError("");
    try {
      await updateMeasurementOpening(activeOpeningId, {
        label: draft.label.trim() || null,
        observations: draft.observations.trim() || null,
      });
      const products = draft.products
        .filter((p) => p.otdId != null || p.dimensions.some((d) => d.value != null))
        .map((p) => ({
          otd_id: p.otdId,
          dimensions: p.dimensions.map((d, idx) => ({ code: d.code, name: d.name, value: d.value, unit_id: d.unitId, sort_order: idx + 1 })),
        }));
      await replaceMeasurementOpeningProducts(activeOpeningId, products);
      const conditionRows = draft.conditions
        .map((cnd): MeasurementOpeningCondition | null => {
          const ct = conditionTypes.find((x) => x.code === cnd.code);
          if (!ct) return null;
          const option = ct.data_type === "SELECT" ? ct.options.find((o) => o.code === cnd.value) ?? null : null;
          return {
            condition_type_id: ct.id,
            option_id: option?.id ?? null,
            value_text: ct.data_type === "TEXT" ? (cnd.value as string | null) : null,
            value_number: ct.data_type === "NUMBER" ? (cnd.value as number | null) : null,
            value_boolean: ct.data_type === "BOOLEAN" ? (cnd.value as boolean | null) : null,
          };
        })
        .filter((row): row is MeasurementOpeningCondition => row !== null);
      await replaceMeasurementOpeningConditions(activeOpeningId, conditionRows);
      await load();
      closeModal();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo guardar el hueco.");
    } finally {
      setSaving(false);
    }
  }

  async function deleteOpening(o: MeasurementOpeningFull) {
    if (
      !(await confirmDialog({
        title: "¿Eliminar este hueco?",
        message: "Se marca como borrado; sus medidas y fotos se conservan en el histórico.",
        danger: true,
      }))
    )
      return;
    try {
      await markMeasurementOpeningForDeletion(o.id);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo eliminar el hueco.");
    }
  }

  function openingSummary(o: MeasurementOpeningFull) {
    if (o.products.length === 0) return "Sin productos todavía";
    return o.products
      .map((p) => {
        const otd = otds.find((x) => x.id === p.otd_id);
        const otdLabel = otd ? `${otd.code} · ${otd.name}` : "Sin decidir";
        const dims = p.dimensions
          .filter((d) => d.value != null)
          .map((d) => `${d.value} ${unitLabel(d.unit_id) ?? ""}`.trim())
          .join(" × ");
        return [otdLabel, dims].filter(Boolean).join(" · ");
      })
      .join(" + ");
  }

  if (loading) return <div className="loading-block">Cargando huecos…</div>;

  return (
    <section className="panel measurement-openings-panel">
      <div className="panel-head">
        <div>
          <h2>Huecos medidos</h2>
          <p>Cada punto a cubrir de esta visita, con sus productos, medidas reales y condiciones de instalación.</p>
        </div>
        <Ruler size={19} />
      </div>
      {error && <div className="measurement-photo-error">{error}</div>}
      {canEdit && (
        <button type="button" className="secondary-button" disabled={saving || !companyId} onClick={() => void startNewOpening()}>
          <Plus size={16} /> Añadir hueco
        </button>
      )}
      {openings.length === 0 ? (
        <div className="empty-state">
          <Ruler size={22} />
          <strong>Sin huecos todavía</strong>
          <span>Añade el primer punto medido en esta visita.</span>
        </div>
      ) : (
        <div className="opening-card-list">
          {openings.map((o, idx) => (
            <div className="opening-card" key={o.id}>
              <div className="opening-card-main">
                <strong>{o.label || `Hueco ${idx + 1}`}</strong>
                <span>{openingSummary(o)}</span>
              </div>
              {canEdit && (
                <div className="opening-card-actions">
                  <button type="button" title="Editar hueco" onClick={() => void editOpening(o)}>
                    <Edit3 size={15} />
                  </button>
                  <button type="button" title="Eliminar hueco" onClick={() => void deleteOpening(o)}>
                    <Trash2 size={15} />
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <input ref={cameraInput} type="file" accept="image/*" capture="environment" multiple onChange={handleFilesSelected} hidden />

      {draft && activeOpeningId != null && (
        <MeasurementOpeningModal
          isOpen
          openingNumber={isNewOpening ? openings.length + 1 : openings.findIndex((o) => o.id === activeOpeningId) + 1}
          totalOpenings={isNewOpening ? openings.length + 1 : openings.length}
          draft={draft}
          otds={otdOptions()}
          photos={photos}
          saving={saving}
          onChange={(next) => void handleDraftChange(next)}
          onAddPhoto={() => void handleAddPhoto()}
          onRemovePhoto={(path) => void handleRemovePhoto(path)}
          onCancel={() => void handleCancel()}
          onSave={() => void handleSave()}
        />
      )}
    </section>
  );
}
