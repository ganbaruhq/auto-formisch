// Stand-ins for an application's own code, so the doc examples run in tests.
// Nothing here is part of Auto Formisch.

export const saved: unknown[] = [];

export async function saveContact(contact: object): Promise<void> {
  saved.push(contact);
}

export interface Customer {
  readonly id: string;
  readonly createdAt: string;
  readonly name?: string;
  readonly country?: string;
  readonly [key: string]: unknown;
}

export const customers = new Map<string, Customer>();

export interface Company {
  readonly id: string;
  readonly type: 'person' | 'company';
  readonly [key: string]: unknown;
}

export const companies = new Map<string, Company>();
