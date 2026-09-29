import { Form, Select } from 'antd';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { InputNumber } from '../../shared/ui/DecimalInputNumber';
import { useDebouncedValue } from '../../shared/hooks/useDebouncedValue';
import { formatMoney } from '../../shared/utils/money';
import { getServiceDefaultPrice } from '../stock/service-pricing';
import { getHospitalCatalog } from './hospital.api';
import type { HospitalBox, HospitalCatalog } from './types';

export function HospitalTariffSelect({ box, value, price, selectedTitle, onChange }: {
  box?: HospitalBox; value?: string; price?: number; selectedTitle?: string | null;
  onChange: (id: string | undefined, price: number | undefined) => void;
}) {
  const [search, setSearch] = useState('стационар');
  const [selectedService, setSelectedService] = useState<HospitalCatalog['services'][number]>();
  const debouncedSearch = useDebouncedValue(search, 250);
  const catalog = useQuery({ queryKey: ['hospital', 'daily-service-search', debouncedSearch], queryFn: ({ signal }) => getHospitalCatalog(debouncedSearch, signal), enabled: Boolean(box) });
  if (!box) return null;
  const services = [...new Map([...(selectedService ? [selectedService] : []), ...(catalog.data?.services ?? [])].map((service) => [service.id, service])).values()];
  const options = services.map((service) => ({ value: service.id, label: `${service.title} · ${formatMoney(getServiceDefaultPrice(service))}` }));
  if (value && !options.some((option) => option.value === value)) options.unshift({ value, label: selectedTitle || value });
  return <div className="hospital-tariff-select">
    <Form.Item label="Услуга содержания" help="Можно выбрать услугу из прайса или указать цену ниже. Выбор относится только к этой госпитализации.">
      <Select value={value} allowClear showSearch filterOption={false} onSearch={setSearch} loading={catalog.isFetching} placeholder="Выберите услугу из прайса" options={options} onChange={(id) => {
        const service = services.find((item) => item.id === id);
        setSelectedService(service);
        onChange(id, service ? getServiceDefaultPrice(service) : price);
      }} />
    </Form.Item>
    <Form.Item label="Цена бокса за день, ₽" required help="Для этого пациента. Каждая календарная дата пребывания считается целым днём.">
      <InputNumber value={price} min={0} max={999999999} precision={2} onChange={(next) => onChange(value, next ?? undefined)} className="full-width" />
    </Form.Item>
  </div>;
}
