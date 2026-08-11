import { EditOutlined, PlusOutlined } from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert, App, Button, Form, Input, InputNumber, Modal, Select, Space, Switch, Table, Tag, Typography } from 'antd';
import { useState } from 'react';
import { getErrorMessage } from '../../api/errors';
import { listBusinessCategories, saveBusinessCategory } from './business.api';
import { BusinessCategory, BusinessCategoryInput, BusinessCategoryType } from './types';

export function BusinessCategoriesModal({ open, onClose, onSaved }: {
  open: boolean;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const [form] = Form.useForm<BusinessCategoryInput>();
  const [editing, setEditing] = useState<BusinessCategory | null | undefined>();
  const categoriesQuery = useQuery({ queryKey: ['business', 'categories', 'all'], queryFn: listBusinessCategories, enabled: open });

  function closeModal() {
    setEditing(undefined);
    form.resetFields();
    onClose();
  }

  function startCreate(type: BusinessCategoryType) {
    setEditing(null);
    form.setFieldsValue({ title: '', type, affectsProfit: true, administratorAllowed: true, isActive: true, sortOrder: 300 });
  }

  function startEdit(category: BusinessCategory) {
    setEditing(category);
    form.setFieldsValue({
      title: category.title,
      type: category.type,
      affectsProfit: category.affectsProfit,
      administratorAllowed: category.administratorAllowed,
      isActive: category.isActive,
      sortOrder: category.sortOrder,
    });
  }

  const mutation = useMutation({
    mutationFn: (values: BusinessCategoryInput) => saveBusinessCategory(editing?.id ?? null, values),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['business', 'categories'] });
      await onSaved();
      message.success(editing ? 'Статья обновлена' : 'Статья создана');
      setEditing(undefined);
    },
    onError: (error) => message.error(getErrorMessage(error)),
  });

  return (
    <Modal open={open} title="Статьи доходов и расходов" footer={null} onCancel={closeModal} width={900} destroyOnHidden>
      <Alert
        type="info"
        showIcon
        message="Справочник доступен только директору"
        description="Статья выбирается обязательно при внесении операции. Неиспользуемую статью отключайте — исторические расходы и аудит сохранятся."
        style={{ marginBottom: 16 }}
      />
      {editing !== undefined ? (
        <Form form={form} layout="vertical" onFinish={(values) => mutation.mutate(values)}>
          <Space wrap align="start" style={{ width: '100%' }}>
            <Form.Item name="title" label="Название статьи" rules={[{ required: true, min: 2, message: 'Введите название статьи' }]} style={{ minWidth: 340, flex: 1 }}>
              <Input maxLength={160} placeholder="Например, Доставка или Хозяйственные товары" />
            </Form.Item>
            <Form.Item name="type" label="Тип" rules={[{ required: true }]}>
              <Select disabled={Boolean(editing)} style={{ width: 180 }} options={[{ value: 'EXPENSE', label: 'Расход' }, { value: 'INCOME', label: 'Доход' }]} />
            </Form.Item>
            <Form.Item name="sortOrder" label="Порядок"><InputNumber min={0} max={10000} /></Form.Item>
          </Space>
          <Space wrap size="large" align="start">
            <Form.Item name="affectsProfit" label="Учитывать в прибыли" valuePropName="checked"><Switch /></Form.Item>
            <Form.Item name="administratorAllowed" label="Доступна администратору" valuePropName="checked"><Switch /></Form.Item>
            <Form.Item name="isActive" label="Показывать при выборе" valuePropName="checked"><Switch /></Form.Item>
          </Space>
          <Typography.Paragraph type="secondary">
            Отключение скрывает статью из новых операций, но не удаляет старые записи. Тип уже используемой статьи изменить нельзя.
          </Typography.Paragraph>
          <Space>
            <Button type="primary" htmlType="submit" loading={mutation.isPending}>{editing ? 'Сохранить изменения' : 'Создать статью'}</Button>
            <Button onClick={() => setEditing(undefined)}>Назад к списку</Button>
          </Space>
        </Form>
      ) : (
        <>
          <Space wrap style={{ marginBottom: 12 }}>
            <Button type="primary" icon={<PlusOutlined />} onClick={() => startCreate('EXPENSE')}>Добавить статью расхода</Button>
            <Button icon={<PlusOutlined />} onClick={() => startCreate('INCOME')}>Добавить статью дохода</Button>
          </Space>
          <Table<BusinessCategory>
            rowKey="id"
            size="small"
            pagination={false}
            loading={categoriesQuery.isLoading}
            dataSource={categoriesQuery.data ?? []}
            locale={{ emptyText: 'Статей пока нет' }}
            columns={[
              { title: 'Статья', dataIndex: 'title' },
              { title: 'Тип', dataIndex: 'type', render: (value) => value === 'EXPENSE' ? <Tag color="red">Расход</Tag> : <Tag color="green">Доход</Tag> },
              { title: 'В прибыли', dataIndex: 'affectsProfit', render: (value) => value ? 'Да' : 'Нет' },
              { title: 'Администратору', dataIndex: 'administratorAllowed', render: (value) => value ? 'Да' : 'Только директору' },
              { title: 'Состояние', dataIndex: 'isActive', render: (value) => value ? <Tag color="green">Активна</Tag> : <Tag>Отключена</Tag> },
              { title: '', key: 'action', width: 130, render: (_, row) => <Button size="small" icon={<EditOutlined />} onClick={() => startEdit(row)}>Изменить</Button> },
            ]}
          />
        </>
      )}
    </Modal>
  );
}
