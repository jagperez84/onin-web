import type { Unit } from "../../../services/catalog/unitRepository";
import type { OninProduct } from "../../../services/otd/otdCalculationService";
import type { OtdScaleRow } from "../../../services/otd/otdScaleRepository";

export interface SelectionOption {
  id?: number;
  code: string;
  label: string;
  value?: string | null;
  sort_order: number;
}

export interface Selection {
  id?: number;
  code: string;
  name: string;
  selection_type: "OPTION" | "NUMBER" | "TEXT" | "BOOLEAN";
  required: boolean;
  is_dimension: boolean;
  unit_id?: number | null;
  options: SelectionOption[];
  sort_order: number;
}

export interface Variable {
  id?: number;
  code: string;
  name: string;
  expression: string | null;
  data_type: string;
  min_value?: number | null;
  max_value?: number | null;
  sort_order: number;
  active: boolean;
}

export interface Component {
  id?: number;
  product_id: number | null;
  characteristic_id: number | null;
  characteristic_expression: string | null;
  code?: string;
  description?: string | null;
  quantity_expression: string;
  component_type: "BASIC" | "IMPROVEMENT";
  price_increment: number;
  price_increment_type: "FIXED" | "PERCENTAGE";
  unit_id?: number | null;
  active: boolean;
  sort_order: number;
  dimension_expressions?: Record<string, string>;
}

export interface Otd {
  id?: number;
  company_id?: number;
  product_id?: number | null;
  code: string;
  name: string;
  template_type?: string | null;
  work_unit_id?: number | null;
  active?: boolean;
}
