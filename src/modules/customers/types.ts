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

export type AddressForm = Omit<Address, 'id'|'party_id'>;
export type ContactForm = Omit<Contact, 'id'|'party_id'>;

export type CustomerListResult = { rows: CustomerSummary[]; total: number };
