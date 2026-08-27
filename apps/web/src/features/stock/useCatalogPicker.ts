import { useQuery } from '@tanstack/react-query';
import { useDeferredValue, useMemo, useState } from 'react';
import { listProducts, listServices } from './stock.api';
import { getVisitClinicalCatalog } from '../visits/visits.api';
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

export function useVisitProductCatalogPicker(enabled: boolean, initialItems: Array<Product | null | undefined> = []) {
  return useCatalogPicker<Product>({
    enabled,
    initialItems,
    queryKey: 'visit-products',
    queryFn: async (search) => ({ items: (await getVisitClinicalCatalog(search)).products }),
  });
}

export function useVisitServiceCatalogPicker(enabled: boolean, initialItems: Array<ServiceItem | null | undefined> = []) {
  return useCatalogPicker<ServiceItem>({
    enabled,
    initialItems,
    queryKey: 'visit-services',
    queryFn: async (search) => ({ items: (await getVisitClinicalCatalog(search)).services }),
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
  queryKey: 'products' | 'services' | 'visit-products' | 'visit-services';
  queryFn: (search: string) => Promise<{ items: T[] }>;
}) {
  const [search, setSearch] = useState('');
  const deferredSearch = useDeferredValue(search.trim());
  const query = useQuery({
    queryKey: ['stock', queryKey, 'catalog-picker', deferredSearch],
    queryFn: () => queryFn(deferredSearch),
    enabled,
  });

  const items = useMemo(() => {
    const currentItems = [...initialItems, ...(query.data?.items ?? [])]
      .filter((item): item is T => Boolean(item));
    // The API already returns exact/prefix matches first and only then sorts ties
    // alphabetically. Preserve that order instead of destroying relevance here.
    return [...new Map(currentItems.map((item) => [item.id, item])).values()];
  }, [initialItems, query.data?.items]);

  return {
    ...query,
    items,
    search,
    onSearch: setSearch,
    resetSearch: () => setSearch(''),
  };
}
