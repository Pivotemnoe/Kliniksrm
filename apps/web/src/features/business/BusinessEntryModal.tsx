import { useMutation } from '@tanstack/react-query';
import { App, DatePicker, Form, Input, InputNumber, Modal, Select, Space, Typography } from 'antd';
import dayjs, { Dayjs } from 'dayjs';
import { useEffect } from 'react';
import { getErrorMessage } from '../../api/errors';
import { createBusinessEntry } from './business.api';
import { BusinessCategoryType, BusinessEntryInput, BusinessEntrySource, BusinessResources } from './types';

type FormValues = {
  categoryId: string;
  amount: number;
  occurredAt: Dayjs;
  officeId?: string;
  cashboxId?: string;
  paymentMethodId?: string;
  payrollPeriodId?: string;
  counterparty?: string;
  documentNumber?: string;
  comment?: string;
};

export function BusinessEntryModal({ type, resources, officeId, dailyCloseId, defaultDate, lockOffice = false, onClose, onSaved }: {
  type: BusinessCategoryType | null;
  resources?: BusinessResources;
  officeId?: string;
  dailyCloseId?: string;
  defaultDate?: string;
  lockOffice?: boolean;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const { message } = App.useApp();
  const [form] = Form.useForm<FormValues>();
  const categoryId = Form.useWatch('categoryId', form);
  const selectedOfficeId = Form.useWatch('officeId', form);
  const category = resources?.categories.find((item) => item.id === categoryId);
  const categories = resources?.categories.filter((item) => item.type === type) ?? [];
  const source = inferSource(category?.code);
  const requiresExplanation = source === 'UNRECORDED_REVENUE' || source === 'DAILY_DIFFERENCE';

  useEffect(() => {
    if (type) {
      form.resetFields();
      form.setFieldsValue({ occurredAt: dayjs(defaultDate ?? undefined), officeId });
    }
  }, [defaultDate, form, officeId, type]);

  const mutation = useMutation({
    mutationFn: (values: FormValues) => {
      const input: BusinessEntryInput = {
        type: type!, categoryId: values.categoryId, amount: values.amount,
        occurredAt: values.occurredAt.toISOString(), source,
        officeId: values.officeId, cashboxId: values.cashboxId, paymentMethodId: values.paymentMethodId,
        payrollPeriodId: values.payrollPeriodId, dailyCloseId,
        counterparty: values.counterparty, documentNumber: values.documentNumber, comment: values.comment,
      };
      return createBusinessEntry(input);
    },
    onSuccess: async () => {
      await onSaved();
      message.success(type === 'INCOME' ? 'Доход зарегистрирован' : 'Расход зарегистрирован');
      onClose();
    },
    onError: (error) => message.error(getErrorMessage(error)),
  });

  return (
    <Modal open={Boolean(type)} title={type === 'INCOME' ? 'Добавить поступление' : 'Добавить расход'} onCancel={onClose} okText="Сохранить операцию" cancelText="Отмена" confirmLoading={mutation.isPending} onOk={() => form.submit()} destroyOnHidden>
      <Form form={form} layout="vertical" onFinish={(values) => mutation.mutate(values)}>
        <Form.Item name="categoryId" label="Статья" rules={[{ required: true, message: 'Выберите статью' }]}>
          <Select showSearch optionFilterProp="label" placeholder="Выберите статью" options={categories.map((item) => ({ value: item.id, label: item.title }))} />
        </Form.Item>
        <Space wrap align="start" style={{ width: '100%' }}>
          <Form.Item name="amount" label="Сумма" rules={[{ required: true, message: 'Укажите сумму' }]}><InputNumber min={0.01} precision={2} addonAfter="₽" style={{ width: 210 }} /></Form.Item>
          <Form.Item name="occurredAt" label="Дата и время" rules={[{ required: true }]}><DatePicker showTime format="DD.MM.YYYY HH:mm" /></Form.Item>
        </Space>
        <Form.Item name="officeId" label="Филиал" rules={[{ required: true, message: 'Выберите филиал' }]}>
          <Select disabled={lockOffice} options={resources?.offices.map((item) => ({ value: item.id, label: item.name }))} />
        </Form.Item>
        <Space wrap align="start">
          <Form.Item name="cashboxId" label="Касса"><Select allowClear style={{ width: 220 }} options={resources?.cashboxes.filter((item) => !selectedOfficeId || !item.officeId || item.officeId === selectedOfficeId).map((item) => ({ value: item.id, label: item.title }))} /></Form.Item>
          <Form.Item name="paymentMethodId" label="Способ оплаты"><Select allowClear style={{ width: 220 }} options={resources?.paymentMethods.map((item) => ({ value: item.id, label: item.title }))} /></Form.Item>
        </Space>
        {source === 'PAYROLL_PAYOUT' ? <Form.Item name="payrollPeriodId" label="Утверждённый расчёт зарплаты" rules={[{ required: true }]}><Select options={resources?.payrollPeriods.map((item) => ({ value: item.id, label: item.title }))} /></Form.Item> : null}
        <Space wrap align="start">
          <Form.Item name="counterparty" label="Получатель / источник"><Input style={{ width: 220 }} /></Form.Item>
          <Form.Item name="documentNumber" label="Номер документа"><Input style={{ width: 220 }} /></Form.Item>
        </Space>
        <Form.Item name="comment" label={requiresExplanation ? 'Пояснение' : 'Комментарий'} rules={requiresExplanation ? [{ required: true, min: 2, message: 'Обязательно объясните операцию' }] : undefined}><Input.TextArea rows={3} /></Form.Item>
        {source === 'UNRECORDED_REVENUE' ? <Typography.Paragraph type="warning">Операция будет отмечена для проверки директором: её нужно связать со счётом или отдельно подтвердить.</Typography.Paragraph> : null}
      </Form>
    </Modal>
  );
}

function inferSource(code?: string): BusinessEntrySource {
  if (code === 'unrecorded_revenue') return 'UNRECORDED_REVENUE';
  if (code === 'payroll') return 'PAYROLL_PAYOUT';
  if (code === 'owner_contribution' || code === 'owner_withdrawal') return 'OWNER_OPERATION';
  return 'MANUAL';
}
