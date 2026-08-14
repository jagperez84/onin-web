import type { Address, Contact, CustomerSummary, Party } from '../../domain/core/types';

export type CustomerDetails = {
  customer: { id:number; party_id:number };
  party: Party;
  addresses: Address[];
  contacts: Contact[];
};

export type CustomerForm = {
  legal_name: string;
  trade_name: string;
  tax_id: string;
  email: string;
  phone: string;
  active: boolean;
  notes: string;
};

/**
 * Form models are deliberately non-nullable. Database Address/Contact rows
 * may contain null values, but the UI normalizes them to empty strings before
 * they enter these forms.
 */
export type AddressForm = {
  address_type: string;
  street: string;
  postal_code: string;
  city: string;
  region: string;
  country_code: string;
};

export type ContactForm = {
  first_name: string;
  last_name: string;
  job_title: string;
  department: string;
  phone: string;
  mobile: string;
  email: string;
  notes: string;
  active: boolean;
};

export type CustomerListResult = { rows: CustomerSummary[]; total: number };
