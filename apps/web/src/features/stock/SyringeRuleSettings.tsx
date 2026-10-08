import { useEffect, useDeferredValue, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert, App, Button, Form, Select, Typography } from 'antd';
import { getErrorMessage } from '../../api/errors';
import { listConsumableRules, listProducts, updateSyringeRule } from './stock.api';
import type { SyringeRuleInput } from './types';

const bands: Array<{ max: number; name: keyof SyringeRuleInput; label: string }> = [
  { max: 1, name: 'syringe1ProductId', label: 'До 1 мл включительно' },
  { max: 2, name: 'syringe2ProductId', label: 'Более 1, до 2 мл включительно' },
  { max: 5, name: 'syringe5ProductId', label: 'Более 2, до 5 мл включительно' },
  { max: 10, name: 'syringe10ProductId', label: 'Более 5, до 10 мл включительно' },
];

export function SyringeRuleSettings({ canManage }: { canManage: boolean }) {
  const queryClient = useQueryClient();
  const { message } = App.useApp();
  const [form] = Form.useForm<SyringeRuleInput>();
  const [search, setSearch] = useState('шприц');
  const deferredSearch = useDeferredValue(search.trim());
  const rules = useQuery({ queryKey: ['stock', 'consumable-rules'], queryFn: listConsumableRules });
  const products = useQuery({ queryKey: ['stock', 'syringe-picker', deferredSearch], queryFn: () => listProducts({ search: deferredSearch || undefined, limit: 100 }), enabled: canManage });
  const rule = rules.data?.find((item) => item.code === 'SYRINGE');
  const options = useMemo(() => [...new Map([...(rule?.options.map((option) => option.product) ?? []), ...(products.data?.items ?? [])].filter((product) => product.isActive && product.stockUnit?.trim().toLocaleLowerCase('ru') === 'шт' && (product.writeOffUnit ?? product.stockUnit)?.trim().toLocaleLowerCase('ru') === 'шт').map((product) => [product.id, { value: product.id, label: product.title }])).values()], [rule, products.data]);
  useEffect(() => {
    if (!rule || form.isFieldsTouched()) return;
    form.setFieldsValue(Object.fromEntries(bands.map((band) => [band.name, rule.options.find((option) => Number(option.maxValue) === band.max)?.productId])));
  }, [rule, form]);
  const save = useMutation({
    mutationFn: updateSyringeRule,
    onSuccess: async () => {
      form.resetFields();
      await queryClient.invalidateQueries({ queryKey: ['stock', 'consumable-rules'] });
      message.success('Настройка шприцов сохранена');
    },
  });
  return <div style={{ padding: '8px 0', maxWidth: 760 }}>
    <Typography.Paragraph type="secondary">Один раз выберите товары-шприцы для всех препаратов. По введённому объёму будет списываться один шприц. В карточке нужного препарата включите «Списывать шприц».</Typography.Paragraph>
    {rules.error || save.error ? <Alert type="error" showIcon className="form-alert" message={getErrorMessage(rules.error ?? save.error)} /> : null}
    <Form form={form} layout="vertical" onFinish={(values) => save.mutate(values)} disabled={!canManage || save.isPending || rules.isLoading}>
      <div className="form-grid two-columns">
        {bands.map((band) => <Form.Item key={band.name} name={band.name} label={band.label} rules={[{ required: true, message: `Выберите шприц ${band.max} мл` }]}>
          <Select showSearch filterOption={false} onSearch={setSearch} onOpenChange={(open) => { if (open) setSearch('шприц'); }} loading={products.isFetching} options={options} placeholder={`Выберите товар: шприц ${band.max} мл`} />
        </Form.Item>)}
      </div>
      {canManage ? <Button type="primary" htmlType="submit" loading={save.isPending}>Сохранить</Button> : null}
    </Form>
  </div>;
}
