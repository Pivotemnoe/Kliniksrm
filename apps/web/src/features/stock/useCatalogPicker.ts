import { useQuery } from '@tanstack/react-query';
import { useDeferredValue, useEffect, useMemo, useState } from 'react';
import { listProducts, listServices } from './stock.api';
import { Product, ServiceItem } from './types';

const CATALOG_PICKER_LIMIT = 50;

export function useProductCatalogPicker(enabled: boolean, initialItems: Array<Product | null | undefined> = []) {
  return useCatalogPicker<Product>({
    enabled,
    initialItems,
    queryKey: 'products',
    queryFn: (search) => listProducts({ search: search || undefined, limit: CATALOG_PICKER_LIMIT, offset: 0 }),
  });
}

export function useServiceCatalogPicker(enabled: boolean, initialItems: Array<ServiceItem | null | undefined> = []) {
  return useCatalogPicker<ServiceItem>({
    enabled,
    initialItems,
    queryKey: 'services',
    queryFn: (search) => listServices({ search: search || undefined, limit: CATALOG_PICKER_LIMIT, offset: 0 }),
  });
}

function useCatalogPicker<T extends { id: string; title: string }>({
  enabled,
  initialItems,
  queryKey,
  queryFn,
}: {
  enabled: boolean;
  initialItems: Array<T | null | undefined>;
  queryKey: 'products' | 'services';
  queryFn: (search: string) => Promise<{ items: T[] }>;
}) {
  const [search, setSearch] = useState('');
  const [knownItems, setKnownItems] = useState<Record<string, T>>({});
  const deferredSearch = useDeferredValue(search.trim());
  const query = useQuery({
    queryKey: ['stock', queryKey, 'catalog-picker', deferredSearch],
    queryFn: () => queryFn(deferredSearch),
    enabled,
  });

  useEffect(() => {
    const incoming = [...initialItems, ...(query.data?.items ?? [])].filter((item): item is T => Boolean(item));
    if (incoming.length === 0) return;

    setKnownItems((current) => {
      let changed = false;
      const next = { ...current };
      incoming.forEach((item) => {
        if (next[item.id] !== item) {
          next[item.id] = item;
          changed = true;
        }
      });
      return changed ? next : current;
    });
  }, [initialItems, query.data?.items]);

  const items = useMemo(
    () => Object.values(knownItems).sort((left, right) => left.title.localeCompare(right.title, 'ru')),
    [knownItems],
  );

  return {
    ...query,
    items,
    search,
    onSearch: setSearch,
    resetSearch: () => setSearch(''),
  };
}
