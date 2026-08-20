import { CatalogLabelPrinter, type CatalogPrintLine, type PrintableCatalogItem } from '../../shared/ui/CatalogLabelPrinter';
import { formatMoney } from '../../shared/utils/money';
import { listStoreProducts } from './store.api';
import type { StoreProduct, StoreResources } from './types';

export type StorePrintLine = CatalogPrintLine;

export function toStorePrintableItem(product: StoreProduct): PrintableCatalogItem {
  return {
    key: `STORE_PRODUCT:${product.id}`,
    sourceId: product.id,
    kind: 'STORE_PRODUCT',
    kindTitle: 'Товар',
    title: product.title,
    categoryTitle: product.categoryTitle,
    sku: product.sku,
    barcode: product.barcode,
    priceText: formatMoney(product.retailPrice),
    vatRate: product.vatRate === null ? null : String(product.vatRate),
  };
}

export function StoreLabelPrinter({ lines, onChange, resources }: {
  lines: StorePrintLine[];
  onChange: (lines: StorePrintLine[]) => void;
  resources?: StoreResources;
}) {
  return (
    <CatalogLabelPrinter
      lines={lines}
      onChange={onChange}
      organization={resources?.organization ?? null}
      queryKey="store"
      isolationMessage="Печать только из отдельного каталога магазина. Эти позиции не связаны с товарами, услугами, остатками и финансами клиники."
      loadItems={async (search) => {
        const result = await listStoreProducts({ search: search || undefined, limit: 50, offset: 0 });
        return result.items.map(toStorePrintableItem);
      }}
    />
  );
}
