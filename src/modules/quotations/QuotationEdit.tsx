import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { createPortal } from "react-dom";
import {
  ArrowLeft,
  Eye,
  Plus,
  Search,
  SlidersHorizontal,
  Sparkles,
  Trash2,
  User,
  X,
} from "lucide-react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import { MessageLog } from "../../components/ui/MessageLog";
import { Toast } from "../../components/ui/Toast";
import { CoreRepositoryError } from "../../services/core/coreRepository";
import {
  getProductLineDefinition,
  type ProductLineDefinition,
} from "../../services/catalog/productDefinitionRepository";
import {
  quotationForEdit,
  quotationOptions,
  updateQuotation,
  type QuotationEditData,
  type QuotationEditLine,
} from "../../services/sales/quotationEditRepository";
import {
  customerAddresses,
  customerContactsData,
  type CustomerContactDataResult,
  type QuotationLineCharacteristicDraft,
  type QuotationLineDimensionDraft,
} from "../../services/sales/quotationCreationRepository";
import { AddressEditor, type AddressDraft } from "./QuotationCreate";
import {
  calculateQuotationLineByProductId,
  type QuotationLineSnapshot,
} from "../../services/sales/quotationLineCalculationService";
import type { OtdConfigurationSnapshot } from "../../services/otd/otdCalculationService";
import { QuotationLineSnapshotModal } from "./QuotationLineSnapshotModal";
import { OtdLineConfiguratorModal } from "./OtdLineConfiguratorModal";
import {
  QuotationContactSelectModal,
  type SelectedContactData,
} from "./QuotationContactSelectModal";
import "./quotation-create.css";
import "./quotation.css";
import "./quotation-configurator.css";

const money = (n: number) =>
  n.toLocaleString("es-ES", { style: "currency", currency: "EUR" });
type Address = {
  label: string;
  street: string;
  postal_code: string;
  city: string;
  region: string;
};
type EditLine = QuotationEditLine & {
  configuration_snapshot?: QuotationLineSnapshot | any | null;
};
type Option = { id: number; label: string; code?: string; price?: number };

function blankLine(): EditLine {
  return {
    id: 0,
    line_no: 0,
    product_id: null,
    description: "",
    quantity: 1,
    unit_price: 0,
    discount_percent: 0,
    tax_rate_id: null,
    tax_percent: 21,
    line_behavior_id: null,
    line_behavior_snapshot: null,
    product_definition_snapshot: null,
    dimensions: [],
    characteristics: [],
    specific_data: {},
    configuration_snapshot: null,
  };
}

function clone<T>(v: T): T {
  return JSON.parse(JSON.stringify(v));
}

function dimensionsFromDefinition(
  definition: ProductLineDefinition,
  old: EditLine["dimensions"],
) {
  const values = new Map(old.map((v) => [v.code, v.value]));
  return definition.dimensions.map((d, i) => ({
    code: d.code,
    name: d.name,
    value: values.get(d.code) ?? null,
    unit_id: d.unit_id,
    sort_order: i,
  }));
}

function characteristicsFromDefinition(
  definition: ProductLineDefinition,
  old: EditLine["characteristics"],
) {
  const values = new Map(
    old
      .filter((v) => v.attribute_id != null)
      .map((v) => [Number(v.attribute_id), v]),
  );
  return definition.characteristics.map((c) => {
    const v = values.get(c.attribute_id);
    return {
      attribute_id: c.attribute_id,
      attribute_value_id: v?.attribute_value_id ?? null,
      value_text: v?.value_text ?? null,
      value_number: v?.value_number ?? null,
      value_boolean: v?.value_boolean ?? null,
    };
  });
}

export function QuotationEdit() {
  const { id } = useParams();
  const nav = useNavigate();
  const location = useLocation();

  const [data, setData] = useState<QuotationEditData | null>(null);
  const [opts, setOpts] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [loadingDefinition, setLoadingDefinition] = useState<number | null>(
    null,
  );

  const [customerId, setCustomerId] = useState<number | null>(null);
  const [contactId, setContactId] = useState<number | null>(null);
  const [contactName, setContactName] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [customerContactData, setCustomerContactData] =
    useState<CustomerContactDataResult | null>(null);
  const [contactSelectModalOpen, setContactSelectModalOpen] = useState(false);
  const [commercialId, setCommercialId] = useState<number | null>(null);
  const [warehouseId, setWarehouseId] = useState<number | null>(null);
  const [billingId, setBillingId] = useState<number | null>(null);
  const [installationId, setInstallationId] = useState<number | null>(null);
  const [addresses, setAddresses] = useState<any[]>([]);

  const [billingAddress, setBillingAddress] = useState<Address>({
    label: "",
    street: "",
    postal_code: "",
    city: "",
    region: "",
  });
  const [installationAddress, setInstallationAddress] = useState<Address>({
    label: "",
    street: "",
    postal_code: "",
    city: "",
    region: "",
  });

  const [paymentMethodId, setPaymentMethodId] = useState<number | null>(null);
  const [paymentTermId, setPaymentTermId] = useState<number | null>(null);
  const [issueDate, setIssueDate] = useState("");
  const [validUntil, setValidUntil] = useState("");
  const [reference, setReference] = useState("");
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<EditLine[]>([]);
  const [toast, setToast] = useState("");

  // Snapshot Viewer Modal state
  const [snapshotModalOpen, setSnapshotModalOpen] = useState(false);
  const [selectedSnapshot, setSelectedSnapshot] = useState<any | null>(null);
  const [selectedSnapshotLineNo, setSelectedSnapshotLineNo] =
    useState<number>(1);
  const [selectedSnapshotLineId, setSelectedSnapshotLineId] = useState<
    number | null
  >(null);

  // OTD Configurator Modal state
  const [otdModalOpen, setOtdModalOpen] = useState(false);
  const [otdModalLineIndex, setOtdModalLineIndex] = useState<number | null>(
    null,
  );
  const [otdModalInitialOtdId, setOtdModalInitialOtdId] = useState<
    number | null
  >(null);
  const [otdModalInitialSnapshot, setOtdModalInitialSnapshot] = useState<
    any | null
  >(null);

  const calculationRequests = useRef<Record<number, number>>({});

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const [o, q] = await Promise.all([
          quotationOptions(),
          quotationForEdit(Number(id)),
        ]);
        if (!active) return;
        setOpts(o);
        setData(q);
        setCustomerId(q.customer_id);
        setCommercialId(q.commercial_id);
        setWarehouseId(q.warehouse_id);
        setBillingId(q.billing_address_id);
        setInstallationId(q.installation_address_id);
        setBillingAddress(q.billing_address);
        setInstallationAddress(q.installation_address);
        setPaymentMethodId(q.payment_method_id);
        setPaymentTermId(q.payment_term_id);
        setIssueDate(q.issue_date);
        setValidUntil(q.valid_until || "");
        setReference(q.reference);
        setNotes(q.notes);
        setContactId(q.contact_id ?? null);
        setContactName(q.contact_name ?? "");
        setContactEmail(q.contact_email ?? "");
        setContactPhone(q.contact_phone ?? "");

        if (q.customer_id) {
          void customerContactsData(q.customer_id)
            .then((res) => {
              if (active) setCustomerContactData(res);
            })
            .catch(() => {});
          void customerAddresses(q.customer_id)
            .then((rows) => {
              if (active) setAddresses(rows);
            })
            .catch(() => {});
        }

        // Hydrate configuration_snapshot from specific_data if present
        const hydratedLines: EditLine[] = q.lines.map((l) => ({
          ...l,
          configuration_snapshot:
            (l.specific_data?.configuration_snapshot as
              QuotationLineSnapshot | undefined) ||
            (l.specific_data?.otd_snapshot as any) ||
            null,
        }));
        setLines(hydratedLines);
      } catch (e) {
        if (active)
          setError(
            e instanceof Error
              ? e.message
              : "No se pudo cargar el presupuesto.",
          );
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [id]);

  // Handle incoming OTD snapshot edit or addition
  useEffect(() => {
    if (location.state?.otdSnapshot) {
      const otdSnap = location.state.otdSnapshot;
      const targetLineId = location.state.lineId;
      const dimDrafts: QuotationLineDimensionDraft[] = (
        otdSnap.inputs_display || []
      )
        .filter(
          (i: any) =>
            i.is_dimension || (typeof i.value === "number" && !isNaN(i.value)),
        )
        .map((i: any, idx: number) => ({
          code: i.code,
          name: i.name,
          value:
            typeof i.value === "number"
              ? i.value
              : parseFloat(String(i.value)) || null,
          unit_id: null,
          sort_order: idx,
        }));

      const workUnitSymbol =
        otdSnap.work_unit?.symbol ||
        otdSnap.work_unit_symbol ||
        otdSnap.work_unit?.code ||
        otdSnap.work_unit_code ||
        "";

      const dimSummary =
        dimDrafts.length > 0
          ? dimDrafts
              .map(
                (d) =>
                  `${d.name}: ${d.value ?? 0}${workUnitSymbol ? ` ${workUnitSymbol}` : ""}`,
              )
              .join(" · ")
          : (otdSnap.inputs_display || [])
              .filter((i: any) => i.value !== null)
              .map((i: any) => `${i.name}: ${i.display_value}`)
              .join(", ");

      const desc = `${otdSnap.otd_name} (${dimSummary || otdSnap.otd_code})`;

      const enrichedSnapshot = {
        ...otdSnap,
        dimensions: dimDrafts.map((d) => ({
          code: d.code,
          name: d.name,
          value: d.value,
          unit_code: workUnitSymbol || undefined,
          unit_symbol: workUnitSymbol || undefined,
        })),
      };

      setLines((prevLines) => {
        if (targetLineId) {
          return prevLines.map((l) =>
            l.id === targetLineId
              ? {
                  ...l,
                  description: desc,
                  unit_price: Number(otdSnap.total_amount || 0),
                  dimensions: dimDrafts,
                  specific_data: {
                    ...l.specific_data,
                    configuration_snapshot: enrichedSnapshot,
                    otd_snapshot: enrichedSnapshot,
                    is_otd: true,
                    otd_id: otdSnap.otd_id,
                  },
                  configuration_snapshot: enrichedSnapshot,
                }
              : l,
          );
        } else {
          const newLine: EditLine = {
            id: 0,
            line_no: prevLines.length + 1,
            product_id: null,
            description: desc,
            quantity: 1,
            unit_price: Number(otdSnap.total_amount || 0),
            discount_percent: 0,
            tax_rate_id: null,
            tax_percent: 21,
            line_behavior_id: null,
            line_behavior_snapshot: null,
            product_definition_snapshot: null,
            dimensions: dimDrafts,
            characteristics: [],
            specific_data: {
              configuration_snapshot: enrichedSnapshot,
              otd_snapshot: enrichedSnapshot,
              is_otd: true,
              otd_id: otdSnap.otd_id,
            },
            configuration_snapshot: enrichedSnapshot,
          };
          return [...prevLines, newLine];
        }
      });
      setToast(`Configuración OTD "${otdSnap.otd_name}" actualizada.`);
    }
  }, [location.state]);

  const totals = useMemo(
    () =>
      lines.reduce(
        (a, l) => {
          const gross = Math.max(0, l.quantity * l.unit_price);
          const discount = Math.max(0, (gross * l.discount_percent) / 100);
          const net = Math.max(0, gross - discount);
          const tax = (net * l.tax_percent) / 100;
          return {
            discount: a.discount + discount,
            net: a.net + net,
            tax: a.tax + tax,
            total: a.total + net + tax,
          };
        },
        { discount: 0, net: 0, tax: 0, total: 0 },
      ),
    [lines],
  );

  const updateLine = (i: number, patch: Partial<EditLine>) =>
    setLines((xs) => xs.map((l, j) => (j === i ? { ...l, ...patch } : l)));

  const recalculateLine = async (
    i: number,
    productId: number | null,
    dimensions: QuotationLineDimensionDraft[],
    characteristics: QuotationLineCharacteristicDraft[] = [],
    silent = true,
  ) => {
    if (productId === null) return;
    const request = (calculationRequests.current[i] ?? 0) + 1;
    calculationRequests.current[i] = request;
    try {
      const result = await calculateQuotationLineByProductId({
        productId,
        dimensions,
        characteristics,
      });
      if (calculationRequests.current[i] === request) {
        updateLine(i, {
          unit_price: result.unit_price,
          specific_data: {
            ...((lines[i]?.specific_data ?? {}) as Record<string, unknown>),
            price_missing: result.price_missing,
            price_missing_reason: result.price_missing_reason ?? null,
          },
        });
      }
    } catch (e) {
      if (!silent && calculationRequests.current[i] === request)
        setError(
          e instanceof Error
            ? e.message
            : "No se pudo recalcular el precio del artículo.",
        );
    }
  };

  const updateDimensionValue = (i: number, d: number, value: number | null) => {
    const line = lines[i];
    if (!line) return;
    const dimensions = line.dimensions.map((x, k) =>
      k === d ? { ...x, value } : x,
    );
    updateLine(i, { dimensions });
    if (line.product_id !== null)
      void recalculateLine(
        i,
        line.product_id,
        dimensions,
        line.characteristics,
        false,
      );
  };

  const updateCharacteristic = (
    i: number,
    c: number,
    patch: Partial<QuotationLineCharacteristicDraft>,
  ) => {
    const line = lines[i];
    if (!line) return;
    const characteristics = line.characteristics.map((x, k) =>
      k === c ? { ...x, ...patch } : x,
    );
    updateLine(i, { characteristics });
    if (line.product_id !== null)
      void recalculateLine(
        i,
        line.product_id,
        line.dimensions,
        characteristics,
        false,
      );
  };

  const selectProduct = async (i: number, pid: number | null) => {
    if (pid === null) {
      calculationRequests.current[i] =
        (calculationRequests.current[i] ?? 0) + 1;
      updateLine(i, {
        product_id: null,
        description: "",
        unit_price: 0,
        line_behavior_id: null,
        line_behavior_snapshot: null,
        product_definition_snapshot: null,
        dimensions: [],
        characteristics: [],
        configuration_snapshot: null,
        specific_data: {},
      });
      return;
    }
    const p = opts?.products?.find((x: any) => x.id === pid);
    setLoadingDefinition(pid);
    setError("");
    try {
      const definition = await getProductLineDefinition(pid);
      const newLine: Partial<EditLine> = {
        product_id: pid,
        description: p?.label || p?.code || "",
        unit_price: Number(p?.price ?? 0),
        line_behavior_id: p?.lineBehavior?.id ?? null,
        line_behavior_snapshot: p?.lineBehavior ?? null,
        product_definition_snapshot: clone(definition),
        dimensions: dimensionsFromDefinition(definition, []),
        characteristics: characteristicsFromDefinition(definition, []),
        configuration_snapshot: null,
        specific_data: { price_missing: false },
      };
      updateLine(i, newLine);
      void recalculateLine(
        i,
        pid,
        newLine.dimensions || [],
        newLine.characteristics || [],
        true,
      );
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "No se pudo cargar la definición del artículo.",
      );
    } finally {
      setLoadingDefinition(null);
    }
  };

  const openSnapshotModal = (
    snapshot: any,
    lineNo: number,
    lineId?: number | null,
  ) => {
    setSelectedSnapshot(snapshot);
    setSelectedSnapshotLineNo(lineNo);
    setSelectedSnapshotLineId(lineId ?? null);
    setSnapshotModalOpen(true);
  };

  const openOtdModal = (
    lineIndex: number | null = null,
    preselectedOtdId: number | null = null,
  ) => {
    if (lineIndex !== null) {
      const line = lines[lineIndex];
      const snap =
        line.configuration_snapshot ||
        line.specific_data?.configuration_snapshot ||
        line.specific_data?.otd_snapshot ||
        null;
      setOtdModalLineIndex(lineIndex);
      setOtdModalInitialOtdId(
        snap?.otd_id ||
          (line.specific_data?.otd_id as number) ||
          preselectedOtdId ||
          null,
      );
      setOtdModalInitialSnapshot(snap);
    } else {
      setOtdModalLineIndex(null);
      setOtdModalInitialOtdId(preselectedOtdId || null);
      setOtdModalInitialSnapshot(null);
    }
    setOtdModalOpen(true);
  };

  const handleOtdModalConfirm = (
    snap: OtdConfigurationSnapshot,
    lineData: {
      description: string;
      unitPrice: number;
      quantity: number;
      dimensions: QuotationLineDimensionDraft[];
      otdId: number;
    },
  ) => {
    const isUpdating = otdModalLineIndex !== null;
    const existingLine = isUpdating ? lines[otdModalLineIndex] : null;

    const newLine: EditLine = {
      id: existingLine?.id ?? 0,
      line_no: existingLine?.line_no ?? lines.length + 1,
      product_id: null,
      description: lineData.description,
      quantity: lineData.quantity,
      unit_price: lineData.unitPrice,
      discount_percent: existingLine?.discount_percent ?? 0,
      tax_rate_id: existingLine?.tax_rate_id ?? null,
      tax_percent: existingLine?.tax_percent ?? 0,
      line_behavior_id: null,
      line_behavior_snapshot: null,
      product_definition_snapshot: null,
      dimensions: lineData.dimensions,
      characteristics: [],
      specific_data: {
        ...(existingLine?.specific_data || {}),
        configuration_snapshot: snap,
        otd_snapshot: snap,
        is_otd: true,
        otd_id: lineData.otdId,
        price_missing: false,
      },
      configuration_snapshot: snap,
    };

    if (isUpdating && otdModalLineIndex !== null) {
      updateLine(otdModalLineIndex, newLine);
      setToast(
        `Línea ${otdModalLineIndex + 1} actualizada con la nueva configuración OTD.`,
      );
    } else {
      setLines((prev) => {
        if (
          prev.length === 1 &&
          !prev[0].product_id &&
          !prev[0].description &&
          prev[0].unit_price === 0
        ) {
          return [newLine];
        }
        return [...prev, newLine];
      });
      setToast(
        `Configuración OTD "${snap.otd_name}" añadida como línea de presupuesto.`,
      );
    }
  };

  const handleCustomerChange = async (newCustomerId: number | null) => {
    setCustomerId(newCustomerId);
    if (!newCustomerId) {
      setContactId(null);
      setContactName("");
      setContactEmail("");
      setContactPhone("");
      setCustomerContactData(null);
      setAddresses([]);
      return;
    }
    void customerAddresses(newCustomerId)
      .then(setAddresses)
      .catch(() => {});
    try {
      const contactInfo = await customerContactsData(newCustomerId);
      setCustomerContactData(contactInfo);
      if (contactInfo.contacts.length > 1) {
        const first = contactInfo.contacts[0];
        const fullName =
          [first.first_name, first.last_name].filter(Boolean).join(" ") ||
          contactInfo.company_name;
        setContactId(first.id);
        setContactName(fullName);
        setContactEmail(first.email || "");
        setContactPhone(first.phone || first.mobile || "");
        setContactSelectModalOpen(true);
      } else if (contactInfo.contacts.length === 1) {
        const single = contactInfo.contacts[0];
        const fullName =
          [single.first_name, single.last_name].filter(Boolean).join(" ") ||
          contactInfo.company_name;
        setContactId(single.id);
        setContactName(fullName);
        setContactEmail(single.email || contactInfo.header_email || "");
        setContactPhone(
          single.phone || single.mobile || contactInfo.header_phone || "",
        );
      } else {
        setContactId(null);
        setContactName(contactInfo.company_name || "");
        setContactEmail(contactInfo.header_email || "");
        setContactPhone(contactInfo.header_phone || "");
      }
    } catch (e) {
      console.error("Error fetching customer contacts:", e);
    }
  };

  async function save(e: FormEvent) {
    e.preventDefault();
    setError("");
    if (!customerId && !contactName.trim()) {
      setError("Selecciona un cliente o indica el nombre de contacto para el cliente potencial.");
      return;
    }
    if (lines.some((l) => l.quantity <= 0)) {
      setError("La cantidad debe ser mayor que cero.");
      return;
    }
    setSaving(true);
    try {
      await updateQuotation({
        id: Number(id),
        customer_id: customerId,
        commercial_id: commercialId,
        warehouse_id: warehouseId,
        contact_id: contactId,
        contact_name: contactName,
        contact_email: contactEmail,
        contact_phone: contactPhone,
        billing_address_id: billingId,
        installation_address_id: installationId,
        billing_address: billingAddress,
        installation_address: installationAddress,
        payment_method_id: paymentMethodId,
        payment_term_id: paymentTermId,
        issue_date: issueDate,
        valid_until: validUntil || null,
        status:
          data?.status === "EXPIRED" ||
          (data?.valid_until &&
            data.valid_until < new Date().toISOString().slice(0, 10))
            ? "SENT"
            : (data?.status ?? "SENT"),
        reference,
        notes,
        lines: lines.map((l) => ({
          line_no: l.line_no,
          product_id: l.product_id,
          description: l.description,
          quantity: l.quantity,
          unit_price: l.unit_price,
          discount_percent: l.discount_percent,
          tax_rate_id: l.tax_rate_id,
          tax_percent: l.tax_percent,
          line_behavior_id: l.line_behavior_id,
          line_behavior_snapshot: l.line_behavior_snapshot,
          product_definition_snapshot: l.product_definition_snapshot,
          dimensions: l.dimensions,
          characteristics: l.characteristics,
          specific_data: {
            ...l.specific_data,
            configuration_snapshot:
              l.configuration_snapshot ||
              l.specific_data?.configuration_snapshot ||
              null,
          },
        })),
      });
      nav(`/ventas/presupuestos/${id}`);
    } catch (e) {
      setError(
        e instanceof CoreRepositoryError
          ? e.message
          : e instanceof Error
            ? e.message
            : "No se pudo guardar el presupuesto.",
      );
    } finally {
      setSaving(false);
    }
  }

  if (loading)
    return (
      <div className="module-page">
        <div className="page-head">
          <div>
            <div className="eyebrow">VENTAS / PRESUPUESTOS / EDITAR</div>
            <h1>Editando presupuesto</h1>
          </div>
        </div>
        <p>Cargando datos…</p>
      </div>
    );
  if (error && !data)
    return (
      <div className="module-page">
        <div className="page-head">
          <div>
            <div className="eyebrow">VENTAS / PRESUPUESTOS</div>
            <h1>Editar presupuesto</h1>
          </div>
        </div>
        <MessageLog error={error} />
      </div>
    );
  if (!data || !opts) return null;

  return (
    <div className="module-page quotation-create">
      <div className="page-head">
        <div>
          <div className="eyebrow">VENTAS / PRESUPUESTOS / EDITAR</div>
          <h1>{data.code}</h1>
          <p>
            Modifica los datos del documento y las líneas del presupuesto con
            gestión directa de dimensiones y artículos OTD.
          </p>
        </div>
        <Link
          className="secondary-button"
          to={`/ventas/presupuestos/${data.id}`}
        >
          <ArrowLeft size={15} />
          Volver al presupuesto
        </Link>
      </div>

      <MessageLog error={error} />

      <form className="detail-grid" onSubmit={save}>
        <section className="panel quotation-header-panel">
          <div className="panel-head">
            <div>
              <h2>Datos generales</h2>
              <p>Condiciones comerciales y datos del documento.</p>
            </div>
          </div>
          <div className="form-grid">
            <label className="quotation-reference-field">
              Referencia
              <input
                value={reference}
                onChange={(e) => setReference(e.target.value)}
              />
            </label>
            <label>
              Cliente
              <select
                value={customerId ?? ""}
                onChange={(e) =>
                  handleCustomerChange(
                    e.target.value ? Number(e.target.value) : null,
                  )
                }
              >
                <option value="">Cliente potencial (sin ficha registrada)</option>
                {opts.customers.map((x: any) => (
                  <option key={x.id} value={x.id}>
                    {x.label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Comercial
              <select
                value={commercialId ?? ""}
                onChange={(e) =>
                  setCommercialId(
                    e.target.value ? Number(e.target.value) : null,
                  )
                }
              >
                <option value="">Sin asignar</option>
                {opts.commercials.map((x: any) => (
                  <option key={x.id} value={x.id}>
                    {x.label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Almacén
              <select
                value={warehouseId ?? ""}
                onChange={(e) =>
                  setWarehouseId(e.target.value ? Number(e.target.value) : null)
                }
              >
                <option value="">Sin asignar</option>
                {opts.warehouses.map((x: any) => (
                  <option key={x.id} value={x.id}>
                    {x.label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Fecha de documento
              <input
                type="date"
                value={issueDate}
                onChange={(e) => setIssueDate(e.target.value)}
                required
              />
            </label>
            <label>
              Válido hasta
              <input
                type="date"
                value={validUntil}
                onChange={(e) => setValidUntil(e.target.value)}
              />
            </label>
            <label>
              Forma de pago
              <select
                value={paymentMethodId ?? ""}
                onChange={(e) =>
                  setPaymentMethodId(
                    e.target.value ? Number(e.target.value) : null,
                  )
                }
              >
                <option value="">Sin especificar</option>
                {opts.paymentMethods.map((x: any) => (
                  <option key={x.id} value={x.id}>
                    {x.label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Condiciones de pago
              <select
                value={paymentTermId ?? ""}
                onChange={(e) =>
                  setPaymentTermId(
                    e.target.value ? Number(e.target.value) : null,
                  )
                }
              >
                <option value="">Sin especificar</option>
                {opts.paymentTerms.map((x: any) => (
                  <option key={x.id} value={x.id}>
                    {x.label}
                  </option>
                ))}
              </select>
            </label>
            <div className="address-editors-row">
              <AddressEditor
                title="Dirección de facturación"
                addresses={addresses}
                value={{ source_id: billingId, ...billingAddress }}
                onChange={(next: AddressDraft) => {
                  const { source_id, ...rest } = next;
                  setBillingId(source_id);
                  setBillingAddress(rest);
                }}
                onSourceChange={setBillingId}
              />
              <AddressEditor
                title="Dirección de instalación"
                addresses={addresses}
                value={{ source_id: installationId, ...installationAddress }}
                onChange={(next: AddressDraft) => {
                  const { source_id, ...rest } = next;
                  setInstallationId(source_id);
                  setInstallationAddress(rest);
                }}
                onSourceChange={setInstallationId}
              />
            </div>
            <div
              className="quotation-contact-section"
              style={{
                gridColumn: "1 / -1",
                marginTop: "8px",
                padding: "16px",
                borderRadius: "8px",
                background: "var(--color-surface-subtle, #f8fafc)",
                border: "1px solid var(--color-border, #e4e2dc)",
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  marginBottom: "12px",
                  flexWrap: "wrap",
                  gap: "8px",
                }}
              >
                <div
                  style={{ display: "flex", alignItems: "center", gap: "8px" }}
                >
                  <User
                    size={16}
                    style={{ color: "var(--color-primary, #5c7a74)" }}
                  />
                  <span
                    style={{
                      fontWeight: 600,
                      fontSize: "0.9rem",
                      color: "var(--color-text, #33393b)",
                    }}
                  >
                    Datos de contacto del presupuesto
                  </span>
                  {contactId ? (
                    <span
                      style={{
                        fontSize: "0.75rem",
                        background: "#e7ede9",
                        color: "#5c7a74",
                        padding: "2px 8px",
                        borderRadius: "12px",
                        fontWeight: 500,
                      }}
                    >
                      Contacto del cliente
                    </span>
                  ) : customerId ? (
                    <span
                      style={{
                        fontSize: "0.75rem",
                        background: "#efeee9",
                        color: "#7a8083",
                        padding: "2px 8px",
                        borderRadius: "12px",
                        fontWeight: 500,
                      }}
                    >
                      Cabecera / Personalizado
                    </span>
                  ) : null}
                </div>
                {customerId && (
                  <button
                    type="button"
                    className="secondary-button"
                    style={{
                      fontSize: "0.8rem",
                      padding: "4px 10px",
                      height: "auto",
                    }}
                    onClick={() => {
                      if (customerContactData) {
                        setContactSelectModalOpen(true);
                      } else if (customerId) {
                        void customerContactsData(customerId).then((res) => {
                          setCustomerContactData(res);
                          setContactSelectModalOpen(true);
                        });
                      }
                    }}
                  >
                    <User size={13} /> Elegir otro contacto
                  </button>
                )}
              </div>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
                  gap: "12px",
                }}
              >
                <label>
                  Nombre de contacto
                  <input
                    type="text"
                    value={contactName}
                    onChange={(e) => setContactName(e.target.value)}
                    placeholder="Nombre del destinatario o empresa"
                  />
                </label>
                <label>
                  Email de contacto
                  <input
                    type="email"
                    value={contactEmail}
                    onChange={(e) => setContactEmail(e.target.value)}
                    placeholder="email@empresa.com"
                  />
                </label>
                <label>
                  Teléfono de contacto
                  <input
                    type="text"
                    value={contactPhone}
                    onChange={(e) => setContactPhone(e.target.value)}
                    placeholder="+34 600 000 000"
                  />
                </label>
              </div>
            </div>
          </div>
        </section>

        <section className="panel quotation-lines-panel">
          <div className="panel-head">
            <div>
              <h2>Líneas del presupuesto</h2>
              <p>
                Gestión directa de artículos simples y artículos a medida OTD.
              </p>
            </div>
            <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
              <button
                type="button"
                className="secondary-button"
                onClick={() =>
                  setLines((xs) => [
                    ...xs,
                    { ...blankLine(), line_no: xs.length + 1 },
                  ])
                }
              >
                <Plus size={15} /> + Añadir Artículo Simple
              </button>
              <button
                type="button"
                className="primary-button"
                onClick={() => openOtdModal(null)}
                style={{
                  background: "#5c7a74",
                  borderColor: "#5c7a74",
                  color: "#ffffff",
                  fontWeight: 600,
                }}
                title="Añadir producto técnico a medida (OTD) con configurador interactivo"
              >
                <Sparkles size={15} /> + Añadir OTD / A Medida
              </button>
            </div>
          </div>

          <div className="table-panel quotation-lines-table">
            <table>
              <thead>
                <tr>
                  <th className="col-line-no">#</th>
                  <th className="col-article">Artículo</th>
                  <th className="col-description">
                    Descripción & Dimensiones / Características
                  </th>
                  <th className="col-quantity">Cantidad</th>
                  <th className="col-price">Precio</th>
                  <th className="col-discount">Dto. %</th>
                  <th className="col-tax">Impuestos</th>
                  <th className="col-total">Total</th>
                  <th className="col-actions">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {lines.map((line, i) => {
                  const total =
                    Math.max(
                      0,
                      line.quantity *
                        line.unit_price *
                        (1 - line.discount_percent / 100),
                    ) *
                    (1 + line.tax_percent / 100);
                  const snapshot =
                    line.configuration_snapshot ||
                    (line.specific_data?.configuration_snapshot as
                      QuotationLineSnapshot | undefined) ||
                    (line.specific_data?.otd_snapshot as any);
                  const isOtd = Boolean(
                    line.specific_data?.is_otd ||
                    (snapshot as any)?.otd_code ||
                    (snapshot as any)?.template_type ||
                    (!line.product_id && snapshot),
                  );
                  const definition = line.product_definition_snapshot;
                  const priceMissing = Boolean(
                    line.specific_data?.price_missing,
                  );

                  const dimensionsToDisplay =
                    snapshot?.dimensions && snapshot.dimensions.length > 0
                      ? snapshot.dimensions
                      : line.dimensions && line.dimensions.length > 0
                        ? line.dimensions
                        : (snapshot as any)?.inputs_display?.filter(
                            (inp: any) =>
                              inp.is_dimension ||
                              (typeof inp.value === "number" &&
                                !isNaN(inp.value)),
                          ) || [];

                  return (
                    <tr
                      key={`${line.id}-${i}`}
                      className={`quotation-line-row ${snapshot ? "line-has-snapshot" : ""} ${priceMissing ? "line-price-missing" : ""}`}
                    >
                      <td className="col-line-no">
                        <span className="line-num-badge">{i + 1}</span>
                      </td>
                      <td className="col-article">
                        {isOtd ? (
                          <div
                            style={{
                              display: "flex",
                              flexDirection: "column",
                              gap: "3px",
                            }}
                          >
                            <div
                              style={{
                                display: "flex",
                                alignItems: "center",
                                gap: "6px",
                              }}
                            >
                              <span
                                style={{
                                  background: "#e7ede9",
                                  color: "#5c7a74",
                                  fontSize: "10px",
                                  fontWeight: 700,
                                  padding: "1px 5px",
                                  borderRadius: "4px",
                                  textTransform: "uppercase",
                                }}
                              >
                                OTD
                              </span>
                              <strong
                                style={{ fontSize: "13px", color: "#33393b" }}
                              >
                                {(snapshot as any)?.otd_code ||
                                  (snapshot as any)?.otd_name ||
                                  "Personalizado"}
                              </strong>
                            </div>
                            <div className="line-article-badges">
                              <button
                                type="button"
                                className="line-status-chip configured"
                                onClick={() => openOtdModal(i)}
                                title="Configuración OTD. Clic para editar"
                              >
                                <SlidersHorizontal size={11} /> Configurar OTD
                              </button>
                            </div>
                          </div>
                        ) : (
                          <>
                            <LookupSelect
                              compact
                              options={opts?.products ?? []}
                              value={line.product_id}
                              onChange={(pid) => {
                                void selectProduct(i, pid);
                              }}
                              placeholder="Buscar artículo…"
                            />
                            {line.product_id && (
                              <div className="line-article-badges">
                                {priceMissing && (
                                  <span
                                    className="line-price-warning"
                                    title={String(
                                      line.specific_data
                                        ?.price_missing_reason ||
                                        "No existe precio para esta combinación.",
                                    )}
                                  >
                                    ⚠ Precio pendiente
                                  </span>
                                )}
                              </div>
                            )}
                          </>
                        )}
                      </td>
                      <td className="col-description">
                        <input
                          className="line-text-input"
                          value={line.description}
                          onChange={(e) =>
                            updateLine(i, { description: e.target.value })
                          }
                          placeholder="Descripción del artículo o partida…"
                          required
                        />
                        {isOtd && snapshot && (
                          <div className="line-config-summary">
                            {dimensionsToDisplay.length > 0 && (
                              <span className="summary-pill dim">
                                📐{" "}
                                {dimensionsToDisplay
                                  .map((d: any) => {
                                    const u =
                                      d.unit_symbol ||
                                      d.unit_code ||
                                      (snapshot as any).work_unit?.symbol ||
                                      (snapshot as any).work_unit_symbol ||
                                      (snapshot as any).work_unit?.code ||
                                      (snapshot as any).work_unit_code ||
                                      "";
                                    return `${d.name}: ${d.value ?? d.display_value ?? 0}${u ? ` ${u}` : ""}`;
                                  })
                                  .join(" · ")}
                              </span>
                            )}
                            {snapshot.selected_variant && (
                              <span className="summary-pill variant">
                                🏷️{" "}
                                {snapshot.selected_variant.code ||
                                  snapshot.selected_variant.description}
                              </span>
                            )}
                            {(snapshot as any).components &&
                              (snapshot as any).components.length > 0 && (
                                <span className="summary-pill bom">
                                  📦 {(snapshot as any).components.length} comp.
                                  OTD
                                </span>
                              )}
                          </div>
                        )}

                        {/* Artículos simples: Cajas de texto directas para dimensiones */}
                        {!isOtd &&
                          line.dimensions &&
                          line.dimensions.length > 0 && (
                            <div className="line-inline-params-block">
                              <div className="line-inline-params-header">
                                <span>
                                  Dimensiones (
                                  {definition?.dimensions?.length ||
                                    line.dimensions.length}
                                  )
                                </span>
                              </div>
                              <div className="line-dim-inputs-grid">
                                {line.dimensions.map((d, di) => {
                                  const dimDef = definition?.dimensions?.[di];
                                  const unitObj = dimDef?.unit_id
                                    ? opts?.units?.find(
                                        (u: any) => u.id === dimDef.unit_id,
                                      )
                                    : null;
                                  const unitLabel = unitObj?.code || "mm";
                                  const step =
                                    1 /
                                    10 **
                                      Math.max(
                                        0,
                                        Number(dimDef?.decimals ?? 2),
                                      );
                                  return (
                                    <div
                                      key={`${d.code}-${di}`}
                                      className="line-dim-box"
                                      title={d.name}
                                    >
                                      <span className="dim-name">{d.name}</span>
                                      <div className="dim-input-group">
                                        <input
                                          type="number"
                                          step={step}
                                          placeholder="0"
                                          className="dim-input-val"
                                          value={d.value ?? ""}
                                          onChange={(e) =>
                                            updateDimensionValue(
                                              i,
                                              di,
                                              e.target.value === ""
                                                ? null
                                                : Number(e.target.value),
                                            )
                                          }
                                        />
                                        <span className="dim-unit">
                                          {unitLabel}
                                        </span>
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          )}

                        {/* Artículos simples: Cajas / selectores directos para características */}
                        {!isOtd &&
                          definition?.characteristics &&
                          definition.characteristics.length > 0 && (
                            <div className="line-inline-params-block">
                              <div className="line-inline-params-header">
                                <span>
                                  Características (
                                  {definition.characteristics.length})
                                </span>
                              </div>
                              <div className="line-char-inputs-grid">
                                {definition.characteristics.map((c, ci) => {
                                  const current = line.characteristics?.[ci];
                                  return (
                                    <div
                                      key={
                                        c.assignment_id || c.attribute_id || ci
                                      }
                                      className="line-char-box"
                                      title={
                                        c.attribute_name || c.attribute_code
                                      }
                                    >
                                      <span className="char-name">
                                        {c.attribute_name || c.attribute_code}
                                        {c.required && (
                                          <span className="req-star">*</span>
                                        )}
                                      </span>
                                      {c.values && c.values.length > 0 ? (
                                        <select
                                          className="char-select-val"
                                          value={
                                            current?.attribute_value_id ?? ""
                                          }
                                          onChange={(e) =>
                                            updateCharacteristic(i, ci, {
                                              attribute_id: c.attribute_id,
                                              attribute_value_id: e.target.value
                                                ? Number(e.target.value)
                                                : null,
                                              value_text: null,
                                              value_number: null,
                                              value_boolean: null,
                                            })
                                          }
                                        >
                                          <option value="">Seleccionar…</option>
                                          {c.values.map((v) => (
                                            <option key={v.id} value={v.id}>
                                              {v.name}
                                            </option>
                                          ))}
                                        </select>
                                      ) : c.data_type === "NUMBER" ? (
                                        <input
                                          type="number"
                                          step="0.01"
                                          className="char-input-val"
                                          placeholder="0"
                                          value={current?.value_number ?? ""}
                                          onChange={(e) =>
                                            updateCharacteristic(i, ci, {
                                              attribute_id: c.attribute_id,
                                              attribute_value_id: null,
                                              value_text: null,
                                              value_number:
                                                e.target.value === ""
                                                  ? null
                                                  : Number(e.target.value),
                                              value_boolean: null,
                                            })
                                          }
                                        />
                                      ) : c.data_type === "BOOLEAN" ? (
                                        <label className="char-checkbox-label">
                                          <input
                                            type="checkbox"
                                            checked={
                                              current?.value_boolean === true
                                            }
                                            onChange={(e) =>
                                              updateCharacteristic(i, ci, {
                                                attribute_id: c.attribute_id,
                                                attribute_value_id: null,
                                                value_text: null,
                                                value_number: null,
                                                value_boolean: e.target.checked,
                                              })
                                            }
                                          />
                                          <span>Sí</span>
                                        </label>
                                      ) : (
                                        <input
                                          type="text"
                                          className="char-input-val"
                                          placeholder="Valor…"
                                          value={current?.value_text ?? ""}
                                          onChange={(e) =>
                                            updateCharacteristic(i, ci, {
                                              attribute_id: c.attribute_id,
                                              attribute_value_id: null,
                                              value_text:
                                                e.target.value || null,
                                              value_number: null,
                                              value_boolean: null,
                                            })
                                          }
                                        />
                                      )}
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          )}
                      </td>
                      <td className="col-quantity">
                        <input
                          className="line-num-input"
                          type="number"
                          min="0.01"
                          step="0.01"
                          value={line.quantity}
                          onChange={(e) =>
                            updateLine(i, { quantity: Number(e.target.value) })
                          }
                        />
                      </td>
                      <td className="col-price">
                        <input
                          className={`line-num-input ${priceMissing ? "price-input-missing" : ""}`}
                          type="number"
                          min="0"
                          step="0.01"
                          value={line.unit_price}
                          onChange={(e) =>
                            updateLine(i, {
                              unit_price: Number(e.target.value),
                            })
                          }
                        />
                        {priceMissing && (
                          <small className="price-missing-help">
                            No hay precio para esta combinación. Introduce el
                            precio manualmente.
                          </small>
                        )}
                      </td>
                      <td className="col-discount">
                        <input
                          className="line-num-input"
                          type="number"
                          min="0"
                          max="100"
                          step="0.01"
                          value={line.discount_percent}
                          onChange={(e) =>
                            updateLine(i, {
                              discount_percent: Number(e.target.value),
                            })
                          }
                        />
                      </td>
                      <td className="col-tax">
                        <select
                          className="line-tax-select"
                          value={line.tax_rate_id ?? ""}
                          onChange={(e) => {
                            const taxId = e.target.value
                              ? Number(e.target.value)
                              : null;
                            const t = opts.taxRates.find(
                              (x: any) => x.id === taxId,
                            );
                            updateLine(i, {
                              tax_rate_id: taxId,
                              tax_percent: Number(t?.rate ?? 0),
                            });
                          }}
                        >
                          <option value="">Sin impuestos</option>
                          {opts.taxRates.map((t: any) => (
                            <option key={t.id} value={t.id}>
                              {t.rate}% · {t.label}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="col-total">
                        <strong className="line-total-val">
                          {money(total)}
                        </strong>
                      </td>
                      <td className="col-actions">
                        <div className="line-actions-wrap">
                          {isOtd && (
                            <button
                              type="button"
                              className="line-btn-icon otd-edit"
                              onClick={() => openOtdModal(i)}
                              title="Editar en configurador OTD"
                              aria-label="Editar en configurador OTD"
                            >
                              <SlidersHorizontal size={14} />
                            </button>
                          )}
                          {snapshot && (
                            <button
                              type="button"
                              className="line-btn-icon snapshot"
                              onClick={() =>
                                openSnapshotModal(snapshot, i + 1, line.id)
                              }
                              title="Ver snapshot y despiece congelado"
                              aria-label="Ver snapshot y despiece congelado"
                            >
                              <Eye size={14} />
                            </button>
                          )}
                          <button
                            type="button"
                            className="line-btn-icon delete"
                            disabled={lines.length === 1}
                            aria-label="Eliminar línea"
                            title="Eliminar línea"
                            onClick={() =>
                              setLines((xs) => xs.filter((_, j) => j !== i))
                            }
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="quote-totals">
            <span>
              Base imponible <strong>{money(totals.net)}</strong>
            </span>
            <span>
              Descuentos <strong>{money(totals.discount)}</strong>
            </span>
            <span>
              Impuestos <strong>{money(totals.tax)}</strong>
            </span>
            <span>
              Total <strong>{money(totals.total)}</strong>
            </span>
          </div>
        </section>

        <section className="panel">
          <div className="panel-head">
            <div>
              <h2>Observaciones</h2>
              <p>Notas internas o información adicional del presupuesto.</p>
            </div>
          </div>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={5}
          />
        </section>

        <div className="profile-save-bar">
          <Link
            className="secondary-button"
            to={`/ventas/presupuestos/${data.id}`}
          >
            Cancelar
          </Link>
          <button
            className="primary-button"
            type="submit"
            disabled={saving || loadingDefinition !== null}
          >
            {saving ? "Guardando…" : "Guardar cambios"}
          </button>
        </div>
      </form>

      {/* Snapshot Viewer Modal */}
      {snapshotModalOpen && selectedSnapshot && (
        <QuotationLineSnapshotModal
          isOpen={snapshotModalOpen}
          onClose={() => setSnapshotModalOpen(false)}
          snapshot={selectedSnapshot}
          lineNo={selectedSnapshotLineNo}
          quotationId={Number(id)}
          lineId={selectedSnapshotLineId}
          onEditOtd={() => {
            setSnapshotModalOpen(false);
            openOtdModal(selectedSnapshotLineNo - 1);
          }}
        />
      )}

      {/* OTD Configurator Modal */}
      {otdModalOpen && (
        <OtdLineConfiguratorModal
          isOpen={otdModalOpen}
          onClose={() => setOtdModalOpen(false)}
          onConfirm={handleOtdModalConfirm}
          initialOtdId={otdModalInitialOtdId}
          initialSnapshot={otdModalInitialSnapshot}
          initialQuantity={
            otdModalLineIndex !== null ? lines[otdModalLineIndex]?.quantity : 1
          }
          lineIndex={otdModalLineIndex}
        />
      )}
      {/* Contact Select Modal */}
      {contactSelectModalOpen && customerContactData && (
        <QuotationContactSelectModal
          isOpen={contactSelectModalOpen}
          onClose={() => setContactSelectModalOpen(false)}
          customerData={customerContactData}
          selectedContactId={contactId}
          onSelectContact={(sel: SelectedContactData) => {
            setContactId(sel.contact_id);
            setContactName(sel.contact_name);
            setContactEmail(sel.contact_email);
            setContactPhone(sel.contact_phone);
          }}
        />
      )}
      {/* Toast notifications */}
      {toast && <Toast message={toast} onClose={() => setToast("")} />}
    </div>
  );
}

function LookupSelect({
  compact = false,
  options = [],
  value,
  onChange,
  placeholder,
}: {
  compact?: boolean;
  options?: Option[];
  value: number | null;
  onChange: (id: number | null) => void;
  placeholder: string;
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const safeOptions = options || [];
  const selected = safeOptions.find((x) => x.id === value);
  const filtered = useMemo(() => {
    const q = query.trim().toLocaleLowerCase();
    if (!q) return safeOptions.slice(0, 12);
    return safeOptions
      .filter((x) =>
        `${x.code ?? ""} ${x.label}`.toLocaleLowerCase().includes(q),
      )
      .slice(0, 12);
  }, [safeOptions, query]);

  const reposition = () => {
    if (inputRef.current)
      setRect(
        inputRef.current.closest(".lookup-control")?.getBoundingClientRect() ??
          inputRef.current.getBoundingClientRect(),
      );
  };

  useEffect(() => {
    if (!open) return;
    reposition();
    const onScroll = () => reposition();
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onScroll);
    };
  }, [open]);

  const selectItem = (id: number) => {
    onChange(id);
    setQuery("");
    setOpen(false);
  };

  return (
    <div className={`lookup-field ${compact ? "lookup-field-compact" : ""}`}>
      <div className="lookup-control">
        <Search size={15} />
        <input
          ref={inputRef}
          value={open ? query : (selected?.label ?? "")}
          placeholder={placeholder}
          onFocus={() => {
            setOpen(true);
            if (selected) setQuery(selected.label);
          }}
          onChange={(e) => {
            const next = e.target.value;
            setQuery(next);
            setOpen(true);
            if (value !== null) onChange(null);
            const exact = safeOptions.find(
              (x) =>
                x.code &&
                x.code.trim().toLowerCase() === next.trim().toLowerCase(),
            );
            if (exact) selectItem(exact.id);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              if (filtered.length > 0) selectItem(filtered[0].id);
            } else if (e.key === "Escape") setOpen(false);
          }}
        />
        {selected && (
          <button
            type="button"
            className="lookup-clear"
            aria-label="Limpiar selección"
            onClick={() => {
              setQuery("");
              onChange(null);
              setOpen(false);
            }}
          >
            <X size={14} />
          </button>
        )}
      </div>
      {open &&
        rect &&
        createPortal(
          <div className="lookup-portal">
            <button
              type="button"
              className="lookup-dismiss"
              aria-label="Cerrar resultados"
              onClick={() => setOpen(false)}
            />
            <div
              className="lookup-results"
              style={{
                top: rect.bottom + 4,
                left: rect.left,
                width: Math.max(rect.width, 280),
              }}
            >
              {filtered.length === 0 ? (
                <small>No se han encontrado resultados.</small>
              ) : (
                filtered.map((x) => (
                  <button
                    type="button"
                    key={x.id}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => selectItem(x.id)}
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      width: "100%",
                    }}
                  >
                    <span>
                      <strong>{x.code ? `${x.code} · ` : ""}</strong>
                      {x.label}
                    </span>
                    {x.price != null && (
                      <span
                        style={{
                          fontSize: "11px",
                          color: "#7a8083",
                          marginLeft: "8px",
                        }}
                      >
                        {money(Number(x.price))}
                      </span>
                    )}
                  </button>
                ))
              )}
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}
