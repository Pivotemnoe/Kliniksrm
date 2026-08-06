import { Input } from 'antd';
import type { SearchProps } from 'antd/es/input/Search';
import { useEffect, useRef } from 'react';

type LiveSearchInputProps = SearchProps & {
  debounceMs?: number;
};

export function LiveSearchInput({ debounceMs = 300, onChange, onSearch, ...props }: LiveSearchInputProps) {
  const timeoutRef = useRef<number | null>(null);
  const onSearchRef = useRef(onSearch);

  useEffect(() => {
    onSearchRef.current = onSearch;
  }, [onSearch]);

  useEffect(
    () => () => {
      if (timeoutRef.current !== null) {
        window.clearTimeout(timeoutRef.current);
      }
    },
    [],
  );

  function cancelScheduledSearch() {
    if (timeoutRef.current !== null) {
      window.clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  }

  return (
    <Input.Search
      {...props}
      onChange={(event) => {
        onChange?.(event);
        cancelScheduledSearch();
        if (event.type === 'click') {
          return;
        }
        const value = event.target.value;
        timeoutRef.current = window.setTimeout(() => {
          timeoutRef.current = null;
          onSearchRef.current?.(value, undefined, { source: 'input' });
        }, debounceMs);
      }}
      onSearch={(value, event, info) => {
        cancelScheduledSearch();
        onSearch?.(value, event, info);
      }}
    />
  );
}
