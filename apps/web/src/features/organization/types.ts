export type OrganizationOffice = {
  id: string;
  name: string;
  phone: string | null;
  address: string | null;
  timezone: string;
};

export type OrganizationSettings = {
  id: string;
  displayName: string;
  legalName: string | null;
  orgType: string | null;
  inn: string | null;
  kpp: string | null;
  legalAddress: string | null;
  postalAddress: string | null;
  bankName: string | null;
  bik: string | null;
  account: string | null;
  corrAccount: string | null;
  defaultBillDueDays: number | null;
  offices: OrganizationOffice[];
  createdAt: string;
  updatedAt: string;
};

export type UpdateOrganizationPayload = {
  displayName?: string;
  legalName?: string;
  orgType?: string;
  inn?: string;
  kpp?: string;
  legalAddress?: string;
  postalAddress?: string;
  bankName?: string;
  bik?: string;
  account?: string;
  corrAccount?: string;
  defaultBillDueDays?: number | null;
};
