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
      <Table<T>
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
      <Table<T> {...tableProps} dataSource={visibleItems} pagination={false} />
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
