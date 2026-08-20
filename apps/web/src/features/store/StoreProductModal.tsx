import { App, Button, Checkbox, Form, Input, InputNumber, Modal, Select } from 'antd';
import { useEffect, useState } from 'react';
import { getErrorMessage } from '../../api/errors';
import { createStoreProduct, updateStoreProduct } from './store.api';
import type { StoreProduct, StoreProductInput } from './types';

type StoreProductForm = StoreProductInput;

export function StoreProductModal({
  open,
  product,
  onClose,
  onSaved,
}: {
  open: boolean;
  product: StoreProduct | null;
  onClose: () => void;
  onSaved: () => Promise<void> | void;
}) {
  const { message } = App.useApp();
  const [form] = Form.useForm<StoreProductForm>();
  const [saving, setSaving] = useState(false);
  const generateBarcode = Form.useWatch('generateBarcode', form);

  useEffect(() => {
    if (!open) return;
    form.resetFields();
    form.setFieldsValue(product ? {
      title: product.title,
      categoryTitle: product.categoryTitle ?? undefined,
      sku: product.sku ?? undefined,
      barcode: product.barcode ?? undefined,
      retailPrice: Number(product.retailPrice),
      unit: product.unit ?? 'шт',
      vatRate: product.vatRate === null ? undefined : Number(product.vatRate),
      description: product.description ?? undefined,
      generateBarcode: false,
    } : { title: '', retailPrice: 0, unit: 'шт', generateBarcode: false });
  }, [form, open, product]);

  async function submit() {
    const values = await form.validateFields();
    setSaving(true);
    try {
      const input = { ...values, barcode: values.generateBarcode ? undefined : values.barcode };
      if (product) await updateStoreProduct(product.id, input);
      else await createStoreProduct(input);
      message.success(product ? 'Товар магазина изменён' : 'Товар добавлен в магазин');
      await onSaved();
      onClose();
    } catch (error) {
      if (typeof error === 'object' && error !== null && 'errorFields' in error) return;
      message.error(getErrorMessage(error));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      title={product ? 'Изменить товар магазина' : 'Добавить товар в магазин'}
      open={open}
      onCancel={onClose}
      onOk={() => void submit()}
      okText="Сохранить"
      cancelText="Отмена"
      confirmLoading={saving}
      width={760}
      destroyOnHidden
    >
      <Form form={form} layout="vertical">
        <Form.Item name="title" label="Название" rules={[{ required: true, whitespace: true, message: 'Введите название товара' }]}>
          <Input maxLength={240} />
        </Form.Item>
        <div className="form-grid two-columns">
          <Form.Item name="categoryTitle" label="Категория"><Input maxLength={160} /></Form.Item>
          <Form.Item name="sku" label="Артикул"><Input maxLength={80} /></Form.Item>
          <Form.Item name="retailPrice" label="Цена" rules={[{ required: true, message: 'Укажите цену' }]}>
            <InputNumber min={0} precision={2} className="full-width" addonAfter="₽" />
          </Form.Item>
          <Form.Item name="unit" label="Единица продажи">
            <Select showSearch options={['шт', 'упак', 'флакон', 'кг', 'г', 'л', 'мл'].map((value) => ({ value, label: value }))} />
          </Form.Item>
          <Form.Item name="vatRate" label="НДС">
            <Select allowClear placeholder="Без НДС" options={[0, 5, 7, 10, 20].map((value) => ({ value, label: `${value}%` }))} />
          </Form.Item>
          <Form.Item name="barcode" label="Штрих-код">
            <Input maxLength={80} disabled={generateBarcode} />
          </Form.Item>
        </div>
        <Form.Item name="generateBarcode" valuePropName="checked">
          <Checkbox>Создать внутренний штрих-код EAN-13</Checkbox>
        </Form.Item>
        <Form.Item name="description" label="Дополнительная информация"><Input.TextArea rows={3} maxLength={2000} /></Form.Item>
        {product ? <Button type="link" onClick={() => form.setFieldValue('generateBarcode', true)}>Создать новый внутренний штрих-код</Button> : null}
      </Form>
    </Modal>
  );
}
