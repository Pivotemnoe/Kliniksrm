import { useQuery } from '@tanstack/react-query';
import { AutoComplete, Input } from 'antd';
import type { InputProps } from 'antd';
import { apiRequest } from '../../api/client';
import { useDebouncedValue } from '../hooks/useDebouncedValue';

type AddressAutocompleteProps = Omit<InputProps, 'onChange'> & {
  value?: string;
  onChange?: (value: string) => void;
};
type Suggestions = { suggestions: { id: string; label: string; level: number; sourceVersion: number }[] };

export function AddressAutocomplete({ value, onChange, placeholder = 'Город, улица, дом, квартира', ...props }: AddressAutocompleteProps) {
  const query = useDebouncedValue(value?.trim() ?? '', 250);
  const addresses = useQuery({
    queryKey: ['address-catalog', query],
    queryFn: ({ signal }) => apiRequest<Suggestions>(`/v1/addresses/suggest?q=${encodeURIComponent(query)}`, { signal }),
    enabled: query.length >= 2 && !props.disabled,
    staleTime: 5 * 60 * 1000,
    retry: false,
  });
  // Keep manual input available even if the clinic server cannot be reached.
  // Never invent a street, default an unknown town to Armavir, or show stale
  // suggestions belonging to an earlier query.
  const current = query === (value?.trim() ?? '');
  const options = current ? (addresses.data?.suggestions ?? []).map((item) => ({ value: item.label, key: item.id })) : [];
  return (
    <AutoComplete
      value={value}
      disabled={props.disabled}
      options={options}
      filterOption={false}
      onChange={(nextValue) => onChange?.(nextValue)}
    >
      <Input {...props} placeholder={placeholder} />
    </AutoComplete>
  );
}
