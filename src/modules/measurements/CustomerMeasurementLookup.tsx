import { EntitySearchField, type EntitySearchOption } from "../../components/ui/EntitySearchField";
import { listCustomers } from "../../services/core/customerRepository";

export type CustomerOption = {
  id: number;
  party: {
    legal_name: string;
    trade_name: string | null;
    tax_id: string | null;
    code: string | null;
    phone: string | null;
    email: string | null;
  };
};

type CustomerSearchOption = CustomerOption & EntitySearchOption;

function toOption(customer: CustomerOption): CustomerSearchOption {
  return {
    ...customer,
    label: customer.party.trade_name || customer.party.legal_name,
    secondary: customer.party.phone || undefined,
  };
}

export function CustomerMeasurementLookup({
  value,
  onChange,
}: {
  value: CustomerOption | null;
  onChange: (customer: CustomerOption | null) => void;
}) {
  return (
    <EntitySearchField
      variant="modal"
      title="Buscar cliente"
      description="Busca y selecciona un cliente existente."
      placeholder="Seleccionar cliente…"
      searchPlaceholder="Nombre, código o teléfono…"
      value={value ? toOption(value) : null}
      onChange={onChange}
      onSearch={async (q) => {
        const rows = (await listCustomers(q, "active")) as CustomerOption[];
        return rows.map(toOption);
      }}
      emptyText="No se han encontrado clientes."
    />
  );
}
