import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  ArrowLeft,
  ChevronDown,
  ChevronUp,
  Plus,
  Trash2,
  Eye,
  SlidersHorizontal,
  Sparkles,
  User,
} from "lucide-react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import { CoreRepositoryError } from "../../services/core/coreRepository";
import {
  getProductLineDefinition,
  buildCharacteristicColorOptions,
  type ProductLineDefinition,
} from "../../services/catalog/productDefinitionRepository";
import { ColorSwatch } from "../../components/ui/ColorSwatch";
import {
  createQuotation,
  customerAddresses,
  customerContactsData,
  customerOtdDiscount,
  customerProductDiscount,
  quotationOptions,
  type CustomerContactDataResult,
  type ProductLineBehavior,
  type QuotationLineCharacteristicDraft,
  type QuotationLineDimensionDraft,
} from "../../services/sales/quotationCreationRepository";
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
import { MessageLog } from "../../components/ui/MessageLog";
import { ProfileSaveBar } from "../../components/ui/ProfileSaveBar";
import { Toast } from "../../components/ui/Toast";
import { CommentsPanel, withOtdNotesComment, type CommentItem } from "./CommentsPanel";
import { EntitySearchField } from "../../components/ui/EntitySearchField";
import "./quotation-create.css";
import "./quotation-configurator.css";

const today = () => new Date().toISOString().slice(0, 10);
const money = (n: number) =>
  n.toLocaleString("es-ES", { style: "currency", currency: "EUR" });
export function otdDiscountLevelLabel(level: "article" | "familia" | "otd" | "otd_generico") {
  if (level === "article") return "artículo";
  if (level === "familia") return "familia";
  if (level === "otd") return "OTD";
  return "OTD genérico";
}

export type AddressDraft = {
  source_id: number | null;
  label: string;
  street: string;
  postal_code: string;
  city: string;
  region: string;
};
type Line = {
  product_id: number | null;
  description: string;
  quantity: number;
  unit_price: number;
  discount_percent: number;
  tax_rate_id: number | null;
  tax_percent: number;
  comments: CommentItem[];
  line_behavior: ProductLineBehavior | null;
  product_definition_snapshot: ProductLineDefinition | null;
  dimensions: QuotationLineDimensionDraft[];
  characteristics: QuotationLineCharacteristicDraft[];
  specific_data: Record<string, unknown>;
  configuration_snapshot?: QuotationLineSnapshot | any | null;
};

const emptyAddress = (): AddressDraft => ({
  source_id: null,
  label: "",
  street: "",
  postal_code: "",
  city: "",
  region: "",
});
const blank = (): Line => ({
  product_id: null,
  description: "",
  quantity: 1,
  unit_price: 0,
  discount_percent: 0,
  tax_rate_id: null,
  tax_percent: 21,
  comments: [],
  line_behavior: null,
  product_definition_snapshot: null,
  dimensions: [],
  characteristics: [],
  specific_data: {},
  configuration_snapshot: null,
});
type Option = {
  id: number;
  label: string;
  code?: string;
  price?: number;
  lineBehavior?: ProductLineBehavior | null;
};

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value));
}
function dimensionsFromDefinition(definition: ProductLineDefinition) {
  return definition.dimensions.map((d, i) => ({
    code: d.code,
    name: d.name,
    value: null,
    unit_id: d.unit_id,
    sort_order: i,
  }));
}
function characteristicsFromDefinition(definition: ProductLineDefinition) {
  const colorOptions = buildCharacteristicColorOptions(definition.characteristics);
  const first = colorOptions[0];
  if (!first) return [];
  return [
    {
      attribute_id: first.attributeId,
      attribute_value_id: null,
      value_text: null,
      value_number: null,
      value_boolean: null,
      color_id: first.colorId,
    },
  ];
}
function hasRequiredCharacteristicValues(line: Line) {
  const colorOptions = buildCharacteristicColorOptions(
    line.product_definition_snapshot?.characteristics ?? [],
  );
  if (colorOptions.length === 0) return true;
  return line.characteristics.some((c) => c.color_id != null);
}

export function QuotationCreate() {
  const nav = useNavigate();
  const location = useLocation();
  const [opts, setOpts] = useState<any>();
  const [addresses, setAddresses] = useState<any[]>([]);
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
  const [billingAddress, setBillingAddress] =
    useState<AddressDraft>(emptyAddress());
  const [installationAddress, setInstallationAddress] =
    useState<AddressDraft>(emptyAddress());
  const [paymentMethodId, setPaymentMethodId] = useState<number | null>(null);
  const [paymentTermId, setPaymentTermId] = useState<number | null>(null);
  const [issueDate, setIssueDate] = useState(today());
  const [validUntil, setValidUntil] = useState("");
  const [reference, setReference] = useState("");
  const [headerComments, setHeaderComments] = useState<CommentItem[]>([]);
  const [lines, setLines] = useState<Line[]>([blank()]);
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [headerCollapsed, setHeaderCollapsed] = useState(false);
  const [pendingCustomerId, setPendingCustomerId] = useState<number | null>(
    null,
  );
  const [changingCustomer, setChangingCustomer] = useState(false);
  const [snapshotModalOpen, setSnapshotModalOpen] = useState(false);
  const [selectedSnapshot, setSelectedSnapshot] = useState<
    QuotationLineSnapshot | any | null
  >(null);
  const [selectedSnapshotLineNo, setSelectedSnapshotLineNo] =
    useState<number>(1);
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
    void quotationOptions()
      .then(setOpts)
      .catch((e) =>
        setError(
          e instanceof Error ? e.message : "No se pudieron cargar los datos.",
        ),
      )
      .finally(() => setLoading(false));
  }, []);

  // Handle incoming OTD snapshot or initial OTD ID from navigation
  useEffect(() => {
    if (location.state?.otdSnapshot) {
      const otdSnap = location.state.otdSnapshot;
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

      const newLine: Line = {
        product_id: null,
        description: desc,
        quantity: 1,
        unit_price: Number(otdSnap.total_amount || 0),
        discount_percent: 0,
        tax_rate_id: null,
        tax_percent: 21,
        comments: withOtdNotesComment([], otdSnap.notes),
        line_behavior: null,
        product_definition_snapshot: null,
        dimensions: dimDrafts,
        characteristics: [],
        specific_data: {
          configuration_snapshot: enrichedSnapshot,
          otd_snapshot: enrichedSnapshot,
          is_otd: true,
          otd_id: otdSnap.otd_id,
          price_missing: false,
        },
        configuration_snapshot: enrichedSnapshot,
      };
      setLines([newLine]);
      setToast(`Configuración OTD "${otdSnap.otd_name}" añadida como línea.`);
    } else if (location.state?.initialOtdId) {
      openOtdModal(null, Number(location.state.initialOtdId));
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
  const updateLine = (i: number, patch: Partial<Line>) =>
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

  const selectProduct = async (i: number, id: number | null) => {
    if (id === null) {
      calculationRequests.current[i] =
        (calculationRequests.current[i] ?? 0) + 1;
      updateLine(i, blank());
      return;
    }
    const p = opts?.products?.find((x: any) => x.id === id);
    setError("");
    try {
      const definition = await getProductLineDefinition(id);
      const discount = customerId
        ? await customerProductDiscount(customerId, id)
        : null;
      const current = lines[i];
      const line: Line = {
        product_id: id,
        description: p?.label || p?.code || "",
        quantity: 1,
        unit_price: Number(p?.price ?? 0),
        discount_percent: discount?.discount_percent ?? 0,
        tax_rate_id: current?.tax_rate_id ?? null,
        tax_percent: current?.tax_percent ?? 21,
        comments: current?.comments ?? [],
        line_behavior: p?.lineBehavior ?? null,
        product_definition_snapshot: clone(definition),
        dimensions: dimensionsFromDefinition(definition),
        characteristics: characteristicsFromDefinition(definition),
        specific_data: { price_missing: false },
      };
      updateLine(i, line);
      void recalculateLine(i, id, line.dimensions, line.characteristics, true);
      if (discount) {
        setToast(
          `El cliente tiene descuentos aplicados (${otdDiscountLevelLabel(discount.level)}: ${discount.discount_percent}%).`,
        );
      }
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "No se pudo cargar la definición del artículo.",
      );
    }
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

  const handleOtdModalConfirm = async (
    snap: OtdConfigurationSnapshot,
    lineData: {
      description: string;
      unitPrice: number;
      quantity: number;
      dimensions: QuotationLineDimensionDraft[];
      otdId: number;
    },
  ) => {
    const existingLine =
      otdModalLineIndex !== null ? lines[otdModalLineIndex] : null;
    const discount = customerId
      ? await customerOtdDiscount(customerId, lineData.otdId).catch(() => null)
      : null;
    const newLine: Line = {
      product_id: null,
      description: lineData.description,
      quantity: lineData.quantity,
      unit_price: lineData.unitPrice,
      discount_percent: discount?.discount_percent ?? 0,
      tax_rate_id: existingLine?.tax_rate_id ?? null,
      tax_percent: existingLine?.tax_percent ?? 21,
      comments: withOtdNotesComment(existingLine?.comments ?? [], snap.notes),
      line_behavior: null,
      product_definition_snapshot: null,
      dimensions: lineData.dimensions,
      characteristics: [],
      specific_data: {
        configuration_snapshot: snap,
        otd_snapshot: snap,
        is_otd: true,
        otd_id: lineData.otdId,
        price_missing: false,
      },
      configuration_snapshot: snap,
    };

    const discountSuffix = discount
      ? ` El cliente tiene un descuento aplicado (${otdDiscountLevelLabel(discount.level)}: ${discount.discount_percent}%).`
      : "";

    if (otdModalLineIndex !== null) {
      updateLine(otdModalLineIndex, newLine);
      setToast(
        `Línea ${otdModalLineIndex + 1} actualizada con la nueva configuración OTD.${discountSuffix}`,
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
        `Configuración OTD "${snap.otd_name}" añadida como línea de presupuesto.${discountSuffix}`,
      );
    }
  };

  const openSnapshotModal = (
    snapshot: QuotationLineSnapshot,
    lineNo: number,
  ) => {
    setSelectedSnapshot(snapshot);
    setSelectedSnapshotLineNo(lineNo);
    setSnapshotModalOpen(true);
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
    patch: { attribute_id: number; color_id: number } | null,
  ) => {
    const line = lines[i];
    if (!line) return;
    const characteristics: QuotationLineCharacteristicDraft[] = patch
      ? [
          {
            attribute_id: patch.attribute_id,
            attribute_value_id: null,
            value_text: null,
            value_number: null,
            value_boolean: null,
            color_id: patch.color_id,
          },
        ]
      : [];
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

  const applyCustomerAddresses = (rows: any[]) => {
    setAddresses(rows);
    const billing = rows.find((a: any) =>
      ["FACTURACION", "FISCAL"].includes(String(a.address_type).toUpperCase()),
    );
    const installation = rows.find(
      (a: any) => String(a.address_type).toUpperCase() === "INSTALACION",
    );
    setBillingId(billing?.id ?? null);
    setInstallationId(installation?.id ?? null);
    setBillingAddress(addressDraft(billing));
    setInstallationAddress(addressDraft(installation));
  };

  const handleApplyCustomer = async (id: number | null) => {
    setChangingCustomer(true);
    setError("");
    try {
      setCustomerId(id);
      if (id === null) {
        setLines((xs) => xs.map((l) => ({ ...l, discount_percent: 0 })));
        setContactId(null);
        setContactName("");
        setContactEmail("");
        setContactPhone("");
        setCustomerContactData(null);
        setAddresses([]);
        setBillingId(null);
        setInstallationId(null);
        setBillingAddress(emptyAddress());
        setInstallationAddress(emptyAddress());
        return;
      }
      const [rows, contactInfo] = await Promise.all([
        customerAddresses(id),
        customerContactsData(id),
      ]);
      applyCustomerAddresses(rows);
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

      const discounted = await Promise.all(
        lines.map(async (l) => {
          if (l.product_id) return customerProductDiscount(id, l.product_id);
          const otdId = l.specific_data?.otd_id as number | undefined;
          return otdId ? customerOtdDiscount(id, otdId) : null;
        }),
      );
      setLines((xs) =>
        xs.map((l, index) => ({
          ...l,
          discount_percent: discounted[index]?.discount_percent ?? 0,
        })),
      );
      if (discounted.some(Boolean))
        setToast("El cliente tiene descuentos aplicados.");
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "No se pudieron cargar los datos asociados al cliente.",
      );
    } finally {
      setChangingCustomer(false);
    }
  };

  const requestCustomerChange = (id: number | null) => {
    if (id === customerId) return;
    if (!customerId && lines.length === 1 && lines[0].product_id === null) {
      void handleApplyCustomer(id);
      return;
    }
    setPendingCustomerId(id);
  };
  const cancelCustomerChange = () => setPendingCustomerId(null);
  const confirmCustomerChange = async () => {
    const id = pendingCustomerId;
    setPendingCustomerId(null);
    if (id === customerId) return;
    await handleApplyCustomer(id);
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (!customerId) {
      setError("Selecciona un cliente.");
      return;
    }
    if (lines.some((l) => !l.description.trim())) {
      setError("Todas las líneas deben tener descripción.");
      return;
    }
    if (lines.some((l) => !hasRequiredCharacteristicValues(l))) {
      setError("Completa las características obligatorias de los artículos.");
      return;
    }
    if (lines.some((l) => Boolean(l.specific_data?.price_missing))) {
      setError(
        "Hay líneas sin precio para la combinación seleccionada. Añade manualmente el precio de cada línea marcada en rojo.",
      );
      return;
    }
    setSaving(true);
    try {
      await createQuotation({
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
        measurement_id: null,
        issue_date: issueDate,
        valid_until: validUntil || null,
        reference,
        comments: headerComments.map((c) => ({ text: c.text, is_public: c.isPublic })),
        lines: lines.map((l) => ({
          product_id: l.product_id,
          description: l.description,
          quantity: l.quantity,
          unit_price: l.unit_price,
          discount_percent: l.discount_percent,
          tax_rate_id: l.tax_rate_id,
          tax_percent: l.tax_percent,
          comments: l.comments.map((c) => ({ text: c.text, is_public: c.isPublic })),
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
      nav("/ventas/presupuestos");
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
  };

  if (loading)
    return (
      <div className="module-page">
        <div className="page-head">
          <div>
            <div className="eyebrow">VENTAS / PRESUPUESTOS / NUEVO</div>
            <h1>Nuevo presupuesto</h1>
          </div>
        </div>
        <p>Cargando datos…</p>
      </div>
    );

  return (
    <div className="module-page quotation-create">
      <div className="page-head">
        <div>
          <div className="eyebrow">VENTAS / PRESUPUESTOS / NUEVO</div>
          <h1>Nuevo presupuesto</h1>
          <p>
            Crear presupuesto con artículos simples o técnicos a medida (OTD).
          </p>
        </div>
        <Link className="secondary-button" to="/ventas/presupuestos">
          <ArrowLeft size={15} />
          Volver a presupuestos
        </Link>
      </div>
      <MessageLog error={error} />
      {toast && <Toast message={toast} onClose={() => setToast("")} />}
      <form id="quotation-create-form" className="detail-grid" onSubmit={save}>
        <section className="panel quotation-header-panel">
          <div className="panel-head">
            <div>
              <h2>Datos generales</h2>
              <p>
                Cliente, condiciones comerciales y direcciones del presupuesto.
              </p>
            </div>
            <button
              type="button"
              className="secondary-button"
              onClick={() => setHeaderCollapsed((v) => !v)}
            >
              {headerCollapsed ? (
                <>
                  <ChevronDown size={15} />
                  Mostrar cabecera
                </>
              ) : (
                <>
                  <ChevronUp size={15} />
                  Contraer cabecera
                </>
              )}
            </button>
          </div>
          {!headerCollapsed && (
            <div className="form-grid">
              <label className="quotation-reference-field">
                Referencia
                <input
                  value={reference}
                  onChange={(e) => setReference(e.target.value)}
                />
              </label>
              <EntitySearchField
                label="Cliente"
                required
                matchExactCode
                options={opts?.customers ?? []}
                value={(opts?.customers ?? []).find((c: Option) => c.id === customerId) ?? null}
                onChange={(opt) => requestCustomerChange(opt?.id ?? null)}
                placeholder="Buscar cliente por nombre…"
              />
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
                  {(opts?.commercials ?? []).map((x: any) => (
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
                    setWarehouseId(
                      e.target.value ? Number(e.target.value) : null,
                    )
                  }
                >
                  <option value="">Sin asignar</option>
                  {(opts?.warehouses ?? []).map((x: any) => (
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
                  {(opts?.paymentMethods ?? []).map((x: any) => (
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
                  {(opts?.paymentTerms ?? []).map((x: any) => (
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
                  value={billingAddress}
                  onChange={setBillingAddress}
                  onSourceChange={setBillingId}
                />
                <AddressEditor
                  title="Dirección de instalación"
                  addresses={addresses}
                  value={installationAddress}
                  onChange={setInstallationAddress}
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
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "8px",
                    }}
                  >
                    <User
                      size={16}
                      style={{ color: "var(--primary)" }}
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
          )}
        </section>
        <section className="panel quotation-lines-panel">
          <div className="panel-head">
            <div>
              <h2>Líneas del presupuesto</h2>
              <p>
                Gestión de artículos simples (con dimensiones y características
                directas) y productos OTD a medida.
              </p>
            </div>
            <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
              <button
                type="button"
                className="secondary-button"
                onClick={() => setLines((xs) => [...xs, blank()])}
              >
                <Plus size={15} />+ Añadir Artículo Simple
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
                <Sparkles size={15} />+ Añadir OTD / A Medida
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
                      QuotationLineSnapshot | undefined);
                  return (
                    <QuotationLineRows
                      key={`line-${i}`}
                      line={line}
                      lineIndex={i}
                      total={total}
                      snapshot={snapshot ?? null}
                      opts={opts}
                      onProductChange={(id) => void selectProduct(i, id)}
                      onOpenOtdModal={() => openOtdModal(i)}
                      onOpenSnapshot={() =>
                        snapshot && openSnapshotModal(snapshot, i + 1)
                      }
                      onLinePatch={(patch) => {
                        const nextSpecific = {
                          ...line.specific_data,
                          ...(patch.unit_price !== undefined
                            ? {
                                price_missing: false,
                                price_missing_reason: null,
                              }
                            : {}),
                        };
                        updateLine(i, {
                          ...patch,
                          specific_data: nextSpecific,
                        });
                      }}
                      onRemove={() =>
                        setLines((xs) => xs.filter((_, j) => j !== i))
                      }
                      canRemove={lines.length > 1}
                      onDimensionChange={updateDimensionValue}
                      onCharacteristicChange={updateCharacteristic}
                    />
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
        <section className="panel quotation-notes-panel">
          <div className="panel-head">
            <div>
              <h2>Comentarios</h2>
              <p>
                Los comentarios marcados como <strong>público</strong> se imprimen en el PDF
                del presupuesto; el resto son internos y se heredan al pedido.
              </p>
            </div>
          </div>
          <CommentsPanel comments={headerComments} onChange={setHeaderComments} placeholder="Comentario para el presupuesto…" />
        </section>
      </form>
      <ProfileSaveBar
        onSave={() => {
          const formElement = document.getElementById(
            "quotation-create-form",
          ) as HTMLFormElement | null;
          formElement?.requestSubmit();
        }}
        saving={saving}
        label="Crear presupuesto"
      />
      {pendingCustomerId !== null && (
        <ConfirmationDialog
          title="Cambiar cliente"
          message="Al cambiar el cliente se recalcularán las direcciones y los descuentos aplicados a las líneas del presupuesto. ¿Quieres continuar?"
          confirmLabel="Cambiar cliente"
          busy={changingCustomer}
          onCancel={cancelCustomerChange}
          onConfirm={confirmCustomerChange}
        />
      )}
      {snapshotModalOpen && selectedSnapshot && (
        <QuotationLineSnapshotModal
          isOpen={snapshotModalOpen}
          onClose={() => setSnapshotModalOpen(false)}
          snapshot={selectedSnapshot}
          lineNo={selectedSnapshotLineNo}
          onEditOtd={() => {
            setSnapshotModalOpen(false);
            openOtdModal(selectedSnapshotLineNo - 1);
          }}
        />
      )}
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
      {contactSelectModalOpen && customerContactData && (
        <QuotationContactSelectModal
          isOpen={contactSelectModalOpen}
          onClose={() => setContactSelectModalOpen(false)}
          customerData={customerContactData}
          selectedContactId={contactId}
          initialContactName={contactName}
          initialContactEmail={contactEmail}
          initialContactPhone={contactPhone}
          onSelectContact={(sel: SelectedContactData) => {
            setContactId(sel.contact_id);
            setContactName(sel.contact_name);
            setContactEmail(sel.contact_email);
            setContactPhone(sel.contact_phone);
          }}
        />
      )}
    </div>
  );
}

function QuotationLineRows({
  line,
  lineIndex,
  total,
  snapshot,
  opts,
  onProductChange,
  onOpenOtdModal,
  onOpenSnapshot,
  onLinePatch,
  onRemove,
  canRemove,
  onDimensionChange,
  onCharacteristicChange,
}: {
  line: Line;
  lineIndex: number;
  total: number;
  snapshot: any | null;
  opts: any;
  onProductChange: (id: number | null) => void;
  onOpenOtdModal: () => void;
  onOpenSnapshot: () => void;
  onLinePatch: (patch: Partial<Line>) => void;
  onRemove: () => void;
  canRemove: boolean;
  onDimensionChange: (
    line: number,
    dimension: number,
    value: number | null,
  ) => void;
  onCharacteristicChange: (
    line: number,
    patch: { attribute_id: number; color_id: number } | null,
  ) => void;
}) {
  const priceMissing = Boolean(line.specific_data?.price_missing);
  const isOtd = Boolean(
    line.specific_data?.is_otd ||
    snapshot?.otd_code ||
    snapshot?.template_type ||
    (!line.product_id && snapshot),
  );
  const definition = line.product_definition_snapshot;

  const dimensionsToDisplay =
    snapshot?.dimensions && snapshot.dimensions.length > 0
      ? snapshot.dimensions
      : line.dimensions && line.dimensions.length > 0
        ? line.dimensions
        : snapshot?.inputs_display?.filter(
            (i: any) =>
              i.is_dimension ||
              (typeof i.value === "number" && !isNaN(i.value)),
          ) || [];

  return (
    <>
    <tr
      className={`quotation-line-row ${snapshot ? "line-has-snapshot" : ""} ${priceMissing ? "line-price-missing" : ""}`}
    >
      <td className="col-line-no">
        <span className="line-num-badge">{lineIndex + 1}</span>
      </td>
      <td className="col-article">
        {isOtd ? (
          <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
              <span
                style={{
                  background: "#e7ede9",
                  color: "#5c7a74",
                  fontSize: "10.5px",
                  fontWeight: 700,
                  padding: "2px 6px",
                  borderRadius: "4px",
                  textTransform: "uppercase",
                }}
              >
                OTD
              </span>
              <strong style={{ fontSize: "13px", color: "var(--text)" }}>
                {snapshot?.otd_code || snapshot?.otd_name || "Personalizado"}
              </strong>
            </div>
            <div className="line-article-badges">
              <button
                type="button"
                className="line-status-chip configured"
                onClick={onOpenOtdModal}
                title="Configuración OTD. Clic para editar"
              >
                <SlidersHorizontal size={11} /> Configurar OTD
              </button>
            </div>
          </div>
        ) : (
          <>
            <EntitySearchField
              compact
              matchExactCode
              portal
              options={opts?.products ?? []}
              value={(opts?.products ?? []).find((p: Option) => p.id === line.product_id) ?? null}
              onChange={(opt) => onProductChange(opt?.id ?? null)}
              placeholder="Buscar artículo…"
              renderOption={(option) => (
                <>
                  <span className="entity-search-option-main">
                    {option.code && <strong>{option.code} · </strong>}
                    <span>{option.label}</span>
                  </span>
                  {option.price != null && (
                    <span className="entity-search-option-secondary">
                      {money(Number(option.price))}
                    </span>
                  )}
                </>
              )}
            />
            {line.product_id && (
              <div className="line-article-badges">
                {priceMissing && (
                  <span
                    className="line-price-warning"
                    title={String(
                      line.specific_data?.price_missing_reason ||
                        "No existe precio para esta combinación.",
                    )}
                  >
                    ⚠ Precio pendiente: añádelo manualmente
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
          onChange={(e) => onLinePatch({ description: e.target.value })}
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
                      snapshot.work_unit?.symbol ||
                      snapshot.work_unit_symbol ||
                      snapshot.work_unit?.code ||
                      snapshot.work_unit_code ||
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
            {snapshot.components && snapshot.components.length > 0 && (
              <span className="summary-pill bom">
                📦 {snapshot.components.length} comp. OTD
              </span>
            )}
          </div>
        )}

        {/* Artículos simples: Cajas de texto directas para dimensiones */}
        {!isOtd && line.dimensions && line.dimensions.length > 0 && (
          <div className="line-inline-params-block">
            <div className="line-inline-params-header">
              <span>
                Dimensiones (
                {definition?.dimensions?.length || line.dimensions.length})
              </span>
            </div>
            <div className="line-dim-inputs-grid">
              {line.dimensions.map((d, di) => {
                const dimDef = definition?.dimensions?.[di];
                const unitObj = dimDef?.unit_id
                  ? opts?.units?.find((u: any) => u.id === dimDef.unit_id)
                  : null;
                const unitLabel = unitObj?.code || "mm";
                const step =
                  1 / 10 ** Math.max(0, Number(dimDef?.decimals ?? 2));
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
                          onDimensionChange(
                            lineIndex,
                            di,
                            e.target.value === ""
                              ? null
                              : Number(e.target.value),
                          )
                        }
                      />
                      <span className="dim-unit">{unitLabel}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Artículos simples: un único selector de color; la característica/acabado
            se deriva de la elección (igual que en el editor de OTD) */}
        {!isOtd &&
          definition?.characteristics &&
          definition.characteristics.length > 0 &&
          (() => {
            const colorOptions = buildCharacteristicColorOptions(
              definition.characteristics,
            );
            if (colorOptions.length === 0) return null;
            const current = line.characteristics?.[0];
            const selectedKey =
              current?.attribute_id != null && current?.color_id != null
                ? `${current.attribute_id}:${current.color_id}`
                : "";
            const selectedOption =
              colorOptions.find((o) => o.key === selectedKey) ?? null;
            const derivedCharacteristic = selectedOption
              ? definition.characteristics.find(
                  (c) => c.attribute_id === selectedOption.attributeId,
                )
              : null;
            return (
              <div className="line-inline-params-block">
                <div className="line-inline-params-header">
                  <span>Color ({colorOptions.length})</span>
                  {derivedCharacteristic && (
                    <span className="line-char-derived">
                      Acabado:{" "}
                      {derivedCharacteristic.attribute_name ||
                        derivedCharacteristic.attribute_code}
                    </span>
                  )}
                </div>
                <div className="line-char-inputs-grid">
                  <div
                    className="line-char-box"
                    style={{ display: "flex", flexDirection: "row", alignItems: "center", gap: "6px" }}
                  >
                    <select
                      className="char-select-val"
                      value={selectedKey}
                      onChange={(e) => {
                        const opt = colorOptions.find(
                          (o) => o.key === e.target.value,
                        );
                        onCharacteristicChange(
                          lineIndex,
                          opt
                            ? { attribute_id: opt.attributeId, color_id: opt.colorId }
                            : null,
                        );
                      }}
                    >
                      <option value="">Seleccionar color…</option>
                      {colorOptions.map((o) => (
                        <option key={o.key} value={o.key}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                    {selectedOption && (
                      <ColorSwatch
                        hex={selectedOption.hex}
                        code={selectedOption.code}
                        name={selectedOption.name}
                        size="sm"
                      />
                    )}
                  </div>
                </div>
              </div>
            );
          })()}
      </td>
      <td className="col-quantity">
        <input
          className="line-num-input"
          type="number"
          min="0.01"
          step="0.01"
          value={line.quantity}
          onChange={(e) => onLinePatch({ quantity: Number(e.target.value) })}
        />
      </td>
      <td className="col-price">
        <input
          className={`line-num-input ${priceMissing ? "price-input-missing" : ""}`}
          type="number"
          min="0"
          step="0.01"
          value={line.unit_price}
          onChange={(e) => onLinePatch({ unit_price: Number(e.target.value) })}
        />
        {priceMissing && (
          <small className="price-missing-help">
            No hay precio para esta combinación. Introduce el precio
            manualmente.
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
            onLinePatch({ discount_percent: Number(e.target.value) })
          }
        />
      </td>
      <td className="col-tax">
        <select
          className="line-tax-select"
          value={line.tax_rate_id ?? ""}
          onChange={(e) => {
            const id = e.target.value ? Number(e.target.value) : null;
            const t = (opts?.taxRates ?? []).find((x: any) => x.id === id);
            onLinePatch({ tax_rate_id: id, tax_percent: Number(t?.rate ?? 0) });
          }}
        >
          <option value="">Sin impuestos</option>
          {(opts?.taxRates ?? []).map((t: any) => (
            <option key={t.id} value={t.id}>
              {t.rate}% · {t.label}
            </option>
          ))}
        </select>
      </td>
      <td className="col-total">
        <strong className="line-total-val">{money(total)}</strong>
      </td>
      <td className="col-actions">
        <div className="line-actions-wrap">
          {isOtd && (
            <button
              type="button"
              className="line-btn-icon otd-edit"
              onClick={onOpenOtdModal}
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
              onClick={onOpenSnapshot}
              title="Ver snapshot y despiece congelado"
              aria-label="Ver snapshot y despiece congelado"
            >
              <Eye size={14} />
            </button>
          )}
          <button
            type="button"
            className="line-btn-icon delete"
            disabled={!canRemove}
            aria-label="Eliminar línea"
            title="Eliminar línea"
            onClick={onRemove}
          >
            <Trash2 size={14} />
          </button>
        </div>
      </td>
    </tr>
    <tr className="line-comments-row">
      <td colSpan={9}>
        <CommentsPanel
          comments={line.comments}
          onChange={(comments) => onLinePatch({ comments })}
          placeholder="Comentario para esta línea…"
        />
      </td>
    </tr>
    </>
  );
}

export function AddressEditor({
  title,
  addresses,
  value,
  onChange,
  onSourceChange,
}: {
  title: string;
  addresses: any[];
  value: AddressDraft;
  onChange: (value: AddressDraft) => void;
  onSourceChange: (id: number | null) => void;
}) {
  const set = (key: keyof AddressDraft, next: string) =>
    onChange({ ...value, [key]: next });
  const selectSource = (id: number | null) => {
    const source = addresses.find((a) => a.id === id);
    onSourceChange(id);
    onChange(source ? addressDraft(source) : { ...value, source_id: id });
  };
  return (
    <fieldset className="address-editor">
      <legend>{title}</legend>
      <label className="address-source">
        Cargar desde cliente
        <select
          value={value.source_id ?? ""}
          onChange={(e) =>
            selectSource(e.target.value ? Number(e.target.value) : null)
          }
        >
          <option value="">Sin dirección de cliente</option>
          {addresses.map((a) => (
            <option key={a.id} value={a.id}>
              {addressLabel(a)}
            </option>
          ))}
        </select>
      </label>
      <div className="address-editor-grid">
        <label className="address-street">
          Dirección
          <input
            value={value.street}
            onChange={(e) => set("street", e.target.value)}
          />
        </label>
        <label>
          Código Postal
          <input
            value={value.postal_code}
            onChange={(e) => set("postal_code", e.target.value)}
          />
        </label>
        <label>
          Localidad
          <input
            value={value.city}
            onChange={(e) => set("city", e.target.value)}
          />
        </label>
        <label>
          Provincia
          <input
            value={value.region}
            onChange={(e) => set("region", e.target.value)}
          />
        </label>
      </div>
    </fieldset>
  );
}
function addressDraft(a: any): AddressDraft {
  return {
    source_id: a?.id ?? null,
    label:
      a?.label ||
      (
        {
          FACTURACION: "Facturación",
          FISCAL: "Fiscal",
          INSTALACION: "Instalación",
        } as Record<string, string>
      )[String(a?.address_type || "").toUpperCase()] ||
      "Dirección",
    street: a?.street || "",
    postal_code: a?.postal_code || "",
    city: a?.city || "",
    region: a?.region || "",
  };
}
function addressLabel(a: any) {
  return [
    a.label ||
      (
        {
          FACTURACION: "Facturación",
          FISCAL: "Fiscal",
          INSTALACION: "Instalación",
        } as Record<string, string>
      )[String(a.address_type).toUpperCase()] ||
      "Dirección",
    a.street,
    a.postal_code,
    a.city,
  ]
    .filter(Boolean)
    .join(" · ");
}

function ConfirmationDialog({
  title,
  message,
  confirmLabel,
  busy,
  onCancel,
  onConfirm,
}: {
  title: string;
  message: string;
  confirmLabel: string;
  busy: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return createPortal(
    <div className="confirmation-overlay" role="presentation">
      <div
        className="confirmation-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirmation-title"
      >
        <h2 id="confirmation-title">{title}</h2>
        <p id="confirmation-message">{message}</p>
        <div className="confirmation-actions">
          <button
            type="button"
            className="secondary-button"
            onClick={onCancel}
            disabled={busy}
          >
            Cancelar
          </button>
          <button
            type="button"
            className="primary-button"
            onClick={onConfirm}
            disabled={busy}
          >
            {busy ? "Recalculando…" : confirmLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
