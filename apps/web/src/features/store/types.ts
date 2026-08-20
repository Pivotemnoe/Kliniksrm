import type { DecimalValue } from '../visits/types';

export type StoreProduct = {
  id: string;
  isActive: boolean;
  title: string;
  categoryTitle: string | null;
  sku: string | null;
  barcode: string | null;
  retailPrice: DecimalValue;
  unit: string | null;
  vatRate: DecimalValue | null;
  description: string | null;
  createdAt: string;
  updatedAt: string;
};

export type StoreProductInput = {
  title: string;
  categoryTitle?: string;
  sku?: string;
  barcode?: string;
  retailPrice: number;
  unit?: string;
  vatRate?: number;
  description?: string;
  generateBarcode?: boolean;
};

export type StoreResources = {
  organization: {
    displayName: string;
    legalName: string | null;
  } | null;
};
