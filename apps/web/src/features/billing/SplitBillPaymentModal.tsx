import { Alert, Button, Card, Form, Input, Modal, Select, Space, Typography } from 'antd';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { InputNumber } from '../../shared/ui/DecimalInputNumber';
import { createOperationKey } from '../../shared/utils/operationKey';
import { formatMoney, roundMoney, subtractMoney, sumMoney } from '../../shared/utils/money';
import { getFinanceSettings } from '../finance/finance.api';
import { SplitPaymentInput } from './types';

type Part = { paymentMethodId: string; cashboxId: string; amount: number };
export function SplitBillPaymentModal({ open, debt, ownerBalance, loading, onBack, onClose, onSubmit }: { open: boolean; debt: number; ownerBalance: number; loading: boolean; onBack: () => void; onClose: () => void; onSubmit: (input: SplitPaymentInput) => void }) {
  const [parts, setParts] = useState<Part[]>([]);
  const [operationId, setOperationId] = useState('');
  const [comment, setComment] = useState('');
  const query = useQuery({ queryKey: ['finance', 'settings'], queryFn: getFinanceSettings, enabled: open });
  const methods = query.data?.paymentMethods.filter(method => method.isActive) ?? [];
  const cashboxes = query.data?.cashboxes.filter(cashbox => cashbox.isActive) ?? [];
  useEffect(() => {
    if (open) { setOperationId(createOperationKey()); setComment(''); setParts([{ paymentMethodId: '', cashboxId: '', amount: 0 }, { paymentMethodId: '', cashboxId: '', amount: roundMoney(debt) }]); }
  }, [open, debt]);
  useEffect(() => {
    if (!open || query.isLoading) return;
    setParts(previous => previous.map((part, index) => ({ ...part,
      paymentMethodId: part.paymentMethodId || methods.find(method => method.type === (index === 0 ? 'CASH' : 'CARD'))?.id || methods[index]?.id || '',
      cashboxId: part.cashboxId || (cashboxes.length === 1 ? cashboxes[0].id : ''),
    })));
  }, [open, query.data, query.isLoading]);
  const total = sumMoney(parts.map(part => part.amount));
  const difference = subtractMoney(debt, total);
  const deposit = sumMoney(parts.filter(part => methods.find(method => method.id === part.paymentMethodId)?.type === 'DEPOSIT').map(part => part.amount));
  const valid = parts.length === 2 && parts.every(part => part.amount > 0 && part.paymentMethodId && part.cashboxId) && parts[0].paymentMethodId !== parts[1].paymentMethodId && difference === 0 && deposit <= ownerBalance;
  const update = (index: number, values: Partial<Part>) => setParts(previous => previous.map((part, i) => i === index ? { ...part, ...values } : part));
  const changeAmount = (index: number, value: number | null) => setParts(previous => previous.map((part, i) => ({ ...part, amount: i === index ? roundMoney(value) : Math.max(subtractMoney(debt, value), 0) })));
  return <Modal title="Оплата двумя способами" open={open} width={660} onCancel={onClose} footer={<Space wrap><Button onClick={onBack} disabled={loading}>Один способ</Button><Button onClick={onClose} disabled={loading}>Отмена</Button><Button type="primary" loading={loading} disabled={!valid || query.isError || query.isLoading} onClick={() => onSubmit({ operationId, parts, ...(comment.trim() ? { comment: comment.trim() } : {}) })}>Провести оплату</Button></Space>} destroyOnHidden>
    <Alert type="info" showIcon message={`Остаток счёта: ${formatMoney(debt)}`} description="Укажите первую часть — остаток заполнится во второй. Каждая часть учитывается своим способом оплаты и в своей кассе." />
    {query.isError && <Alert type="error" message="Не удалось загрузить способы оплаты и кассы" />}
    <Form layout="vertical" style={{ marginTop: 16 }}>
      {parts.map((part, index) => <Card key={index} size="small" title={`Часть ${index + 1}`} style={{ marginBottom: 12 }}>
        <Form.Item label={`Способ оплаты · часть ${index + 1}`} required><Select aria-label={`Способ оплаты ${index + 1}`} value={part.paymentMethodId || undefined} loading={query.isLoading} options={methods.map(method => ({ value: method.id, label: method.title }))} onChange={id => update(index, { paymentMethodId: id })} /></Form.Item>
        <Form.Item label={`Касса · часть ${index + 1}`} required><Select aria-label={`Касса ${index + 1}`} value={part.cashboxId || undefined} loading={query.isLoading} options={cashboxes.map(cashbox => ({ value: cashbox.id, label: [cashbox.title, cashbox.office?.name].filter(Boolean).join(' · ') }))} onChange={id => update(index, { cashboxId: id })} /></Form.Item>
        <Form.Item label={`Сумма, ₽ · часть ${index + 1}`} required><InputNumber aria-label={`Сумма ${index + 1}`} value={part.amount} min={0} precision={2} style={{ width: '100%' }} onChange={value => changeAmount(index, value)} /></Form.Item>
      </Card>)}
      {parts.length === 2 && parts[0].paymentMethodId && parts[0].paymentMethodId === parts[1].paymentMethodId && <Alert type="warning" message="Выберите два разных способа оплаты" />}
      {deposit > ownerBalance && <Alert type="error" message={`На депозите доступно ${formatMoney(ownerBalance)}`} />}
      <Typography.Paragraph strong>Всего: {formatMoney(total)}{difference !== 0 ? ` · проверьте распределение: ${formatMoney(difference)}` : ''}</Typography.Paragraph>
      <Form.Item label="Комментарий"><Input.TextArea value={comment} rows={2} maxLength={1000} onChange={event => setComment(event.target.value)} /></Form.Item>
    </Form>
  </Modal>;
}
