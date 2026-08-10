import { useInfiniteQuery, type QueryKey } from '@tanstack/react-query';
import { Spin, Table, Typography, type TableProps } from 'antd';
import { useEffect, useMemo, useRef, useState } from 'react';

export const DEFAULT_INFINITE_PAGE_SIZE = 50;

export type PaginatedList<T> = {
  items: T[];
  total: number;
  limit?: number;
  offset?: number;
};

export function useInfiniteListQuery<T>({
  queryKey,
  queryFn,
  pageSize = DEFAULT_INFINITE_PAGE_SIZE,
  enabled = true,
}: {
  queryKey: QueryKey;
  queryFn: (pagination: { limit: number; offset: number }) => Promise<PaginatedList<T>>;
  pageSize?: number;
  enabled?: boolean;
}) {
  return useInfiniteQuery({
    queryKey,
    initialPageParam: 0,
    enabled,
    queryFn: ({ pageParam }) => queryFn({ limit: pageSize, offset: pageParam }),
    getNextPageParam: (lastPage, pages) => {
      const loaded = pages.reduce((total, page) => total + page.items.length, 0);
      return loaded < lastPage.total ? loaded : undefined;
    },
  });
}

export type InfiniteQueryLike<T> = {
  data?: { pages: Array<PaginatedList<T>> };
  isLoading: boolean;
  isError: boolean;
  isFetchingNextPage: boolean;
  hasNextPage?: boolean;
  fetchNextPage: () => Promise<unknown>;
};

export function InfiniteTable<T extends object>({
  query,
  errorText,
  ...tableProps
}: Omit<TableProps<T>, 'dataSource' | 'loading' | 'pagination'> & {
  query: InfiniteQueryLike<T>;
  errorText?: string;
}) {
  const items = useMemo(() => query.data?.pages.flatMap((page) => page.items) ?? [], [query.data]);
  const total = query.data?.pages[0]?.total ?? 0;

  return (
    <>
      {query.isError && errorText ? <Typography.Text type="danger">{errorText}</Typography.Text> : null}
      <TableWithTopScrollbar<T>
        {...tableProps}
        dataSource={items}
        loading={query.isLoading}
        pagination={false}
      />
      <InfiniteListStatus
        loaded={items.length}
        total={total}
        hasMore={Boolean(query.hasNextPage)}
        loading={query.isFetchingNextPage}
        onLoadMore={() => void query.fetchNextPage()}
      />
    </>
  );
}

export function ProgressiveTable<T extends object>({
  dataSource,
  chunkSize = DEFAULT_INFINITE_PAGE_SIZE,
  ...tableProps
}: Omit<TableProps<T>, 'dataSource' | 'pagination'> & {
  dataSource: T[];
  chunkSize?: number;
}) {
  const [visibleCount, setVisibleCount] = useState(chunkSize);

  useEffect(() => {
    setVisibleCount(chunkSize);
  }, [chunkSize, dataSource]);

  const visibleItems = dataSource.slice(0, visibleCount);
  const hasMore = visibleItems.length < dataSource.length;

  return (
    <>
      <TableWithTopScrollbar<T> {...tableProps} dataSource={visibleItems} pagination={false} />
      {dataSource.length > chunkSize ? (
        <InfiniteListStatus
          loaded={visibleItems.length}
          total={dataSource.length}
          hasMore={hasMore}
          loading={false}
          onLoadMore={() => setVisibleCount((current) => Math.min(current + chunkSize, dataSource.length))}
        />
      ) : null}
    </>
  );
}

function TableWithTopScrollbar<T extends object>({ className, scroll, ...tableProps }: TableProps<T>) {
  const shellRef = useRef<HTMLDivElement>(null);
  const topScrollRef = useRef<HTMLDivElement>(null);
  const topScrollInnerRef = useRef<HTMLDivElement>(null);
  const hasHorizontalScroll = Boolean(scroll?.x);

  useEffect(() => {
    if (!hasHorizontalScroll) return;
    const shell = shellRef.current;
    const topScroll = topScrollRef.current;
    const topScrollInner = topScrollInnerRef.current;
    const tableScroll = shell?.querySelector<HTMLElement>('.ant-table-content, .ant-table-body');
    if (!shell || !topScroll || !topScrollInner || !tableScroll) return;

    let syncing = false;
    const updateMetrics = () => {
      topScrollInner.style.width = `${tableScroll.scrollWidth}px`;
      topScroll.hidden = tableScroll.scrollWidth <= tableScroll.clientWidth + 1;
      topScroll.scrollLeft = tableScroll.scrollLeft;
    };
    const syncFromTop = () => {
      if (syncing) return;
      syncing = true;
      tableScroll.scrollLeft = topScroll.scrollLeft;
      syncing = false;
    };
    const syncFromTable = () => {
      if (syncing) return;
      syncing = true;
      topScroll.scrollLeft = tableScroll.scrollLeft;
      syncing = false;
    };

    topScroll.addEventListener('scroll', syncFromTop, { passive: true });
    tableScroll.addEventListener('scroll', syncFromTable, { passive: true });
    const resizeObserver = new ResizeObserver(updateMetrics);
    resizeObserver.observe(tableScroll);
    const table = tableScroll.querySelector('table');
    if (table) resizeObserver.observe(table);
    const mutationObserver = new MutationObserver(updateMetrics);
    mutationObserver.observe(tableScroll, { childList: true, subtree: true });
    updateMetrics();

    return () => {
      topScroll.removeEventListener('scroll', syncFromTop);
      tableScroll.removeEventListener('scroll', syncFromTable);
      resizeObserver.disconnect();
      mutationObserver.disconnect();
    };
  });

  return (
    <div ref={shellRef} className={['table-scroll-shell', className].filter(Boolean).join(' ')}>
      {hasHorizontalScroll ? <div ref={topScrollRef} className="table-top-scroll" aria-label="Горизонтальная прокрутка таблицы" tabIndex={0} hidden><div ref={topScrollInnerRef} className="table-top-scroll-inner" /></div> : null}
      <Table<T> {...tableProps} scroll={scroll} />
    </div>
  );
}

function InfiniteListStatus({
  loaded,
  total,
  hasMore,
  loading,
  onLoadMore,
}: {
  loaded: number;
  total: number;
  hasMore: boolean;
  loading: boolean;
  onLoadMore: () => void;
}) {
  const sentinelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel || !hasMore || loading) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) onLoadMore();
      },
      { rootMargin: '700px 0px' },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [hasMore, loaded, loading, onLoadMore]);

  if (!total && !loading) return null;

  return (
    <div ref={sentinelRef} className="infinite-list-status" aria-live="polite">
      {loading ? <Spin size="small" /> : null}
      <Typography.Text type="secondary">
        {hasMore ? `Показано ${loaded} из ${total}. Остальные загрузятся при прокрутке.` : `Показано ${loaded} из ${total}.`}
      </Typography.Text>
    </div>
  );
}
