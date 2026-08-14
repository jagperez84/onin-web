export type Company = { id: number; code: string; name: string; tax_id: string | null; active: boolean };
export type Party = { id: number; company_id: number; code: string | null; legal_name: string; trade_name: string | null; tax_id: string | null; email: string | null; phone: string | null; active: boolean; notes: string | null };
export type Customer = { id: number; party_id: number; deleted_at?: string | null };
export type Address = { id: number; party_id: number; address_type: string; street: string | null; postal_code: string | null; city: string | null; region: string | null; country_code: string | null };
export type Contact = { id: number; party_id: number; first_name: string | null; last_name: string | null; job_title: string | null; department: string | null; phone: string | null; mobile: string | null; email: string | null; notes: string | null; active: boolean };
export type CustomerSummary = Customer & { party: Pick<Party, 'id'|'code'|'legal_name'|'trade_name'|'tax_id'|'email'|'phone'|'active'> };
