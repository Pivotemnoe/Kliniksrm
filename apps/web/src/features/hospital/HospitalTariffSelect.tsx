import { Form, Select, Typography } from 'antd';
import { InputNumber } from '../../shared/ui/DecimalInputNumber';
import { formatMoney } from '../../shared/utils/money';
import { getServiceDefaultPrice, getServicePriceRange } from '../stock/service-pricing';
import type { HospitalBox } from './types';

export function HospitalTariffSelect({ box, value, price, onChange }: {
  box?: HospitalBox; value?: string; price?: number;
  onChange: (id: string | undefined, price: number | undefined) => void;
}) {
  if (!box) return null;
  const services = box.dailyServices ?? [];
  const selected = services.find((service) => service.id === value);
  const range = selected ? getServicePriceRange(selected) : null;
  if (!services.length) return <Typography.Text type="secondary">Содержание: {formatMoney(box.dailyRate)} за календарный день. Услуги для бокса можно привязать в настройках ресурсов.</Typography.Text>;
  return <div className="hospital-tariff-select">
    <Form.Item label="Услуга содержания" required help="Каждая календарная дата пребывания считается целым днём, включая поступление и выписку.">
      <Select value={value} showSearch optionFilterProp="label" placeholder="Выберите услугу по виду и весу пациента" options={services.map((service) => ({ value: service.id, label: `${service.title} · ${formatMoney(getServiceDefaultPrice(service))}` }))} onChange={(id) => {
        const service = services.find((item) => item.id === id);
        onChange(id, service ? getServiceDefaultPrice(service) : undefined);
      }} />
    </Form.Item>
    {selected?.priceType === 'FLOATING' ? <Form.Item label="Цена за календарный день, ₽">
      <InputNumber value={price} min={range?.minimum ?? 0} max={range?.maximum ?? undefined} precision={2} onChange={(next) => onChange(value, next ?? undefined)} />
    </Form.Item> : null}
  </div>;
}
