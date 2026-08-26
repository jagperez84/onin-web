import type {
  OtdRuntimeData,
  OtdCalculationResult,
  OtdConfigurationSnapshot,
  OtdSummary,
  OtdComponentDef,
} from "../../../services/otd/otdCalculationService";
import type { QuotationLineDimensionDraft } from "../../../services/sales/quotationCreationRepository";

export const euro = (n: number) =>
  n.toLocaleString("es-ES", { style: "currency", currency: "EUR" });

export type OtdLineConfiguratorModalProps = {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (
    snapshot: OtdConfigurationSnapshot,
    lineData: {
      description: string;
      unitPrice: number;
      quantity: number;
      dimensions: QuotationLineDimensionDraft[];
      otdId: number;
    },
  ) => void;
  initialOtdId?: number | null;
  initialSnapshot?: OtdConfigurationSnapshot | any | null;
  initialValues?: Record<string, any>;
  initialQuantity?: number;
  lineIndex?: number | null;
};

export type EditingCompModalState = {
  index: number | null;
  comp: OtdComponentDef;
} | null;
