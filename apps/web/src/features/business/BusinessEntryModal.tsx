import { DeleteOutlined, PlusOutlined } from '@ant-design/icons';
import { useMutation } from '@tanstack/react-query';
import { Alert, App, Button, Card, DatePicker, Form, Input, InputNumber, Modal, Select, Space, Typography } from 'antd';
import dayjs, { Dayjs } from 'dayjs';
import { useEffect } from 'react';
import { getErrorMessage } from '../../api/errors';
import { createBusinessEntries, createBusinessEntry } from './business.api';
import { BusinessCategoryType, BusinessEntryInput, BusinessEntrySource, BusinessResources } from './types';

type FormValues = {
  categoryId?: string;
  amount?: number;
  items?: Array<{
    categoryId?: string;
    reason: string;
    amount: number;
    counterparty?: string;
    documentNumber?: string;
    payrollPeriodId?: string;
  }>;
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
  const dailyEntryMode = Boolean(dailyCloseId);
  const categoryId = Form.useWatch('categoryId', form);
  const selectedOfficeId = Form.useWatch('officeId', form);
  const categories = resources?.categories.filter((item) => item.type === type) ?? [];
  const dailyCategory = dailyEntryMode ? findDailyCategory(categories, type) : undefined;
  const category = resources?.categories.find((item) => item.id === categoryId);
  const source = inferSource(category?.code);
  const requiresExplanation = source === 'UNRECORDED_REVENUE' || source === 'DAILY_DIFFERENCE';

  useEffect(() => {
    if (type) {
      form.resetFields();
      form.setFieldsValue({
        occurredAt: dayjs(defaultDate ?? undefined),
        officeId,
        ...(dailyEntryMode ? { items: [{ categoryId: dailyCategory?.id, reason: '', amount: undefined }] } : {}),
      });
    }
  }, [dailyCategory?.id, dailyEntryMode, defaultDate, form, officeId, type]);

  const mutation = useMutation({
    mutationFn: (values: FormValues) => {
      if (dailyEntryMode) {
        const inputs: BusinessEntryInput[] = (values.items ?? []).map((item) => {
          const itemCategory = categories.find((candidate) => candidate.id === item.categoryId);
          if (!itemCategory) throw new Error('Для каждой операции выберите статью');
          return {
            type: type!,
            categoryId: itemCategory.id,
            amount: item.amount,
            occurredAt: values.occurredAt.toISOString(),
            source: inferSource(itemCategory.code),
            officeId: values.officeId,
            cashboxId: values.cashboxId,
            paymentMethodId: values.paymentMethodId,
            payrollPeriodId: item.payrollPeriodId,
            dailyCloseId,
            counterparty: item.counterparty,
            documentNumber: item.documentNumber,
            comment: item.reason.trim(),
          };
        });
        return createBusinessEntries(inputs);
      }

      const input: BusinessEntryInput = {
        type: type!, categoryId: values.categoryId!, amount: values.amount!,
        occurredAt: values.occurredAt.toISOString(), source,
        officeId: values.officeId, cashboxId: values.cashboxId, paymentMethodId: values.paymentMethodId,
        payrollPeriodId: values.payrollPeriodId, dailyCloseId,
        counterparty: values.counterparty, documentNumber: values.documentNumber, comment: values.comment,
      };
      return createBusinessEntry(input).then((entry) => [entry]);
    },
    onSuccess: async (saved) => {
      await onSaved();
      const count = saved.length;
      message.success(count === 1
        ? type === 'INCOME' ? 'Доход зарегистрирован' : 'Расход зарегистрирован'
        : `${type === 'INCOME' ? 'Доходов' : 'Расходов'} зарегистрировано: ${count}`);
      onClose();
    },
    onError: (error) => message.error(getErrorMessage(error)),
  });

  return (
    <Modal
      open={Boolean(type)}
      title={type === 'INCOME' ? 'Добавить поступление' : 'Добавить расход'}
      onCancel={onClose}
      okText={dailyEntryMode ? 'Сохранить все операции' : 'Сохранить операцию'}
      okButtonProps={{ disabled: dailyEntryMode && categories.length === 0 }}
      cancelText="Отмена"
      confirmLoading={mutation.isPending}
      onOk={() => form.submit()}
      destroyOnHidden
      width={dailyEntryMode ? 760 : undefined}
    >
      <Form form={form} layout="vertical" onFinish={(values) => mutation.mutate(values)}>
        {dailyEntryMode ? (
          <>
            {!categories.length ? <Alert type="error" showIcon message="Не найдены доступные статьи для ручной операции" description="Обратитесь к директору: справочник доходов и расходов нужно восстановить." /> : null}
            {type === 'EXPENSE' ? (
              <Alert
                type="warning"
                showIcon
                message="Оплату поставщику не дублируйте здесь"
                description="Оплачивайте накладную в разделе «Склад → Накладные → Оплатить»: тогда расход и долг поставщику свяжутся автоматически."
                style={{ marginBottom: 12 }}
              />
            ) : null}
            <Form.List name="items">
              {(fields, { add, remove }) => (
                <Space direction="vertical" size={12} style={{ width: '100%' }}>
                  {fields.map((field, index) => (
                    <Card
                      key={field.key}
                      size="small"
                      title={`${type === 'INCOME' ? 'Доход' : 'Расход'} ${index + 1}`}
                      extra={fields.length > 1 ? <Button type="text" danger icon={<DeleteOutlined />} onClick={() => remove(field.name)}>Убрать</Button> : null}
                    >
                      <Space wrap align="start" style={{ width: '100%' }}>
                        <Form.Item
                          name={[field.name, 'categoryId']}
                          label="Статья"
                          rules={[{ required: true, message: 'Выберите статью' }]}
                          style={{ minWidth: 260, flex: 1 }}
                        >
                          <Select
                            showSearch
                            optionFilterProp="label"
                            placeholder="Что это за операция"
                            options={categories.map((item) => ({ value: item.id, label: item.title }))}
                          />
                        </Form.Item>
                        <Form.Item
                          name={[field.name, 'reason']}
                          label={type === 'INCOME' ? 'Причина дохода' : 'Причина расхода'}
                          rules={[{ required: true, min: 2, message: 'Напишите причину' }, { max: 500, message: 'Не более 500 символов' }]}
                          style={{ flex: 1, minWidth: 320 }}
                        >
                          <Input placeholder={type === 'INCOME' ? 'Например, разовое поступление' : 'Например, покупка воды или доставка'} maxLength={500} />
                        </Form.Item>
                        <Form.Item name={[field.name, 'amount']} label="Сумма" rules={[{ required: true, message: 'Укажите сумму' }]}>
                          <InputNumber min={0.01} precision={2} addonAfter="₽" style={{ width: 190 }} />
                        </Form.Item>
                      </Space>
                      <Form.Item noStyle shouldUpdate={(previous, current) => previous.items?.[field.name]?.categoryId !== current.items?.[field.name]?.categoryId}>
                        {() => {
                          const itemCategoryId = form.getFieldValue(['items', field.name, 'categoryId']);
                          const itemCategory = categories.find((candidate) => candidate.id === itemCategoryId);
                          const payroll = itemCategory?.code === 'payroll';
                          return (
                            <>
                              {payroll ? (
                                <Form.Item
                                  name={[field.name, 'payrollPeriodId']}
                                  label="Утверждённый расчёт зарплаты"
                                  rules={[{ required: true, message: 'Выберите утверждённый расчёт' }]}
                                >
                                  <Select
                                    placeholder="Выберите расчёт"
                                    options={resources?.payrollPeriods.map((item) => ({ value: item.id, label: item.title }))}
                                  />
                                </Form.Item>
                              ) : null}
                              <Space wrap align="start">
                                <Form.Item name={[field.name, 'counterparty']} label={payroll ? 'Сотрудник / получатель' : 'Получатель / источник'}>
                                  <Input style={{ width: 240 }} placeholder={payroll ? 'ФИО сотрудника' : 'Кому или от кого'} />
                                </Form.Item>
                                <Form.Item name={[field.name, 'documentNumber']} label="Номер документа">
                                  <Input style={{ width: 220 }} placeholder="Необязательно" />
                                </Form.Item>
                              </Space>
                              {payroll ? (
                                <Typography.Paragraph type="secondary">
                                  Выплата уменьшит деньги в кассе. Прибыль уже уменьшается утверждённым расчётом зарплаты, поэтому повторного расхода в прибыли не будет.
                                </Typography.Paragraph>
                              ) : null}
                            </>
                          );
                        }}
                      </Form.Item>
                    </Card>
                  ))}
                  {fields.length < 50 ? (
                    <Button type="dashed" block icon={<PlusOutlined />} onClick={() => add({ categoryId: dailyCategory?.id, reason: '', amount: undefined })}>
                      {type === 'INCOME' ? 'Добавить ещё доход' : 'Добавить ещё расход'}
                    </Button>
                  ) : null}
                </Space>
              )}
            </Form.List>
            <Typography.Paragraph type="secondary" style={{ marginTop: 12 }}>
              Каждая строка сохранится отдельной операцией со своей статьёй и получателем. Дата, филиал, касса и способ оплаты ниже применяются ко всем строкам.
            </Typography.Paragraph>
          </>
        ) : (
          <>
            <Form.Item name="categoryId" label="Статья" rules={[{ required: true, message: 'Выберите статью' }]}>
              <Select showSearch optionFilterProp="label" placeholder="Выберите статью" options={categories.map((item) => ({ value: item.id, label: item.title }))} />
            </Form.Item>
            <Form.Item name="amount" label="Сумма" rules={[{ required: true, message: 'Укажите сумму' }]}><InputNumber min={0.01} precision={2} addonAfter="₽" style={{ width: 210 }} /></Form.Item>
          </>
        )}
        <Space wrap align="start" style={{ width: '100%' }}>
          <Form.Item name="occurredAt" label="Дата и время" rules={[{ required: true }]}><DatePicker showTime format="DD.MM.YYYY HH:mm" /></Form.Item>
        </Space>
        <Form.Item name="officeId" label="Филиал" rules={[{ required: true, message: 'Выберите филиал' }]}>
          <Select disabled={lockOffice} options={resources?.offices.map((item) => ({ value: item.id, label: item.name }))} />
        </Form.Item>
        <Space wrap align="start">
          <Form.Item name="cashboxId" label="Касса"><Select allowClear style={{ width: 220 }} options={resources?.cashboxes.filter((item) => !selectedOfficeId || !item.officeId || item.officeId === selectedOfficeId).map((item) => ({ value: item.id, label: item.title }))} /></Form.Item>
          <Form.Item name="paymentMethodId" label="Способ оплаты"><Select allowClear style={{ width: 220 }} options={resources?.paymentMethods.map((item) => ({ value: item.id, label: item.title }))} /></Form.Item>
        </Space>
        {!dailyEntryMode && source === 'PAYROLL_PAYOUT' ? <Form.Item name="payrollPeriodId" label="Утверждённый расчёт зарплаты" rules={[{ required: true }]}><Select options={resources?.payrollPeriods.map((item) => ({ value: item.id, label: item.title }))} /></Form.Item> : null}
        {!dailyEntryMode ? <Space wrap align="start">
          <Form.Item name="counterparty" label="Получатель / источник"><Input style={{ width: 220 }} /></Form.Item>
          <Form.Item name="documentNumber" label="Номер документа"><Input style={{ width: 220 }} /></Form.Item>
        </Space> : null}
        {!dailyEntryMode ? <Form.Item name="comment" label={requiresExplanation ? 'Пояснение' : 'Комментарий'} rules={requiresExplanation ? [{ required: true, min: 2, message: 'Обязательно объясните операцию' }] : undefined}><Input.TextArea rows={3} /></Form.Item> : null}
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

function findDailyCategory(categories: BusinessResources['categories'], type: BusinessCategoryType | null) {
  const preferredCodes = type === 'INCOME'
    ? ['unrecorded_revenue', 'other_income']
    : ['petty_expense', 'other_expense'];
  return preferredCodes.map((code) => categories.find((item) => item.code === code)).find(Boolean);
}
