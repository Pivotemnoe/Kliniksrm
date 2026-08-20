import { CatalogLabelPrinter, type CatalogPrintLine, type PrintableCatalogItem } from '../../shared/ui/CatalogLabelPrinter';
import { formatMoney } from '../../shared/utils/money';
import { formatServicePrice } from './service-pricing';
import { listProducts, listServices } from './stock.api';
import type { Product, ServiceItem, StockResources } from './types';

export type StockPrintLine = CatalogPrintLine;

export function toClinicProductPrintItem(product: Product): PrintableCatalogItem {
  return {
    key: `PRODUCT:${product.id}`,
    sourceId: product.id,
    kind: 'PRODUCT',
    kindTitle: 'Товар',
    title: product.title,
    categoryTitle: product.category?.title,
    sku: product.sku,
    barcode: product.barcode || product.gtin,
    priceText: formatMoney(product.retailPrice),
    vatRate: product.vatRate === null ? null : String(product.vatRate),
  };
}

export function toClinicServicePrintItem(service: ServiceItem): PrintableCatalogItem {
  return {
    key: `SERVICE:${service.id}`,
    sourceId: service.id,
    kind: 'SERVICE',
    kindTitle: 'Услуга',
    title: service.title,
    categoryTitle: service.category?.title,
    priceText: formatServicePrice(service),
    vatRate: service.vatRate === null ? null : String(service.vatRate),
  };
}

export function StockCatalogLabelPrinter({ lines, onChange, organization }: {
  lines: StockPrintLine[];
  onChange: (lines: StockPrintLine[]) => void;
  organization: StockResources['organization'];
}) {
  return (
    <CatalogLabelPrinter
      lines={lines}
      onChange={onChange}
      organization={organization}
      queryKey="clinic"
      loadItems={async (search) => {
        const [products, services] = await Promise.all([
          listProducts({ search: search || undefined, limit: 50, offset: 0 }),
          listServices({ search: search || undefined, limit: 50, offset: 0 }),
        ]);
        return [...products.items.map(toClinicProductPrintItem), ...services.items.map(toClinicServicePrintItem)];
      }}
    />
  );
}
