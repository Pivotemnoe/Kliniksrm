import { EditOutlined, PlusOutlined, PrinterOutlined } from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert, Button, Card, Form, Input, Modal, Select, Space, Table, Tag, Typography } from 'antd';
import { useState } from 'react';
import { getErrorMessage } from '../../api/errors';
import { hasPermission } from '../../auth/permissions';
import { useCurrentEmployee } from '../../auth/useAuth';
import { useDebouncedValue } from '../../shared/hooks/useDebouncedValue';
import { formatDateTime } from '../../shared/utils/date';
import { AttachmentsPanel } from '../files/AttachmentsPanel';
import { listLaboratoryOrderFiles, uploadLaboratoryOrderFile } from '../files/files.api';
import { LaboratoryResultsTableDrawer } from '../laboratory/LaboratoryResultsTableDrawer';
import { printLaboratoryOrder } from '../laboratory/laboratoryPrint';
import type { LaboratoryOrder } from '../laboratory/types';
import type { OrganizationPrintProfile } from '../organization/types';
import { laboratoryOrderStatusColors, laboratoryOrderStatusLabels } from '../visits/types';
import { createHospitalLaboratoryOrder, listHospitalLaboratoryOrders, searchHospitalLaboratoryTests, updateHospitalLaboratoryResults } from './hospital.api';
import type { HospitalStay } from './types';

export function HospitalLaboratoryPanel({ stay, organization }: { stay: HospitalStay; organization?: OrganizationPrintProfile | null }) {
  const { data: auth } = useCurrentEmployee();
  const remoteReadOnly = auth?.accessType === 'REMOTE' && !auth.employee.roles.includes('director');
  const canManage = hasPermission(auth?.employee, 'hospital.manage') && stay.status === 'ACTIVE' && !remoteReadOnly;
  const canPrint = hasPermission(auth?.employee, 'documents.print');
  const canReadFiles = hasPermission(auth?.employee, 'laboratory.read');
  const canUploadFiles = canManage && hasPermission(auth?.employee, 'laboratory.manage');
  const client = useQueryClient();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebouncedValue(search, 250);
  const [form] = Form.useForm<{ testId: string; comment?: string }>();
  const [editing, setEditing] = useState<LaboratoryOrder | null>(null);
  const queryKey = ['laboratory', 'orders', 'hospital', stay.id];
  const orders = useQuery({ queryKey, queryFn: () => listHospitalLaboratoryOrders(stay.id) });
  const tests = useQuery({
    queryKey: ['laboratory', 'tests', 'hospital-select', debouncedSearch],
    queryFn: () => searchHospitalLaboratoryTests(debouncedSearch),
    enabled: open,
  });
  const create = useMutation({
    mutationFn: (values: { testId: string; comment?: string }) => createHospitalLaboratoryOrder(stay.id, values),
    onSuccess: async (order) => {
      setOpen(false); form.resetFields(); setEditing(order);
      await Promise.all([client.invalidateQueries({ queryKey: ['laboratory', 'orders'] }), client.invalidateQueries({ queryKey: ['visits'] })]);
    },
  });
  return (
    <Card title="Результаты анализов" size="small" extra={canManage ? <Button icon={<PlusOutlined />} onClick={() => { create.reset(); setOpen(true); }}>Добавить анализ</Button> : null}>
      <Typography.Paragraph type="secondary">Результаты сохраняются в истории пациента и лаборатории. Стоимость исследования добавляйте как услугу стационара — эта карточка повторно её не начисляет.</Typography.Paragraph>
      {orders.isError ? <Alert type="error" showIcon message={getErrorMessage(orders.error)} /> : null}
      <Space direction="vertical" className="full-width">
        {!orders.isLoading && !orders.isError && !orders.data?.length ? <Typography.Text type="secondary">Результаты анализов ещё не добавлены.</Typography.Text> : null}
        {orders.data?.map((order) => (
          <Card key={order.id} size="small" title={<Space wrap><span>{formatDateTime(order.createdAt)}</span><Tag color={laboratoryOrderStatusColors[order.status]}>{laboratoryOrderStatusLabels[order.status]}</Tag></Space>}>
            <Space wrap className="form-alert">
              {canManage && order.status !== 'CANCELLED' ? <Button icon={<EditOutlined />} onClick={() => setEditing(order)}>Заполнить показатели</Button> : null}
              {canPrint ? <Button icon={<PrinterOutlined />} onClick={() => printLaboratoryOrder(order, organization)}>Печать A5</Button> : null}
            </Space>
            {order.comment ? <Typography.Paragraph>{order.comment}</Typography.Paragraph> : null}
            <Table rowKey="id" size="small" pagination={false} dataSource={order.items} scroll={{ x: 520 }} columns={[
              { title: 'Показатель', key: 'title', render: (_, item) => <span>{item.groupName ? `${item.groupName} · ` : ''}{item.title}</span> },
              { title: 'Результат', key: 'result', render: (_, item) => item.resultValue || item.resultText || '—' },
              { title: 'Ед.', dataIndex: 'unit' }, { title: 'Референс', dataIndex: 'referenceRange' },
            ]} />
            {canReadFiles ? <AttachmentsPanel queryKey={['laboratory', 'order-files', order.id]} listFiles={() => listLaboratoryOrderFiles(order.id)} uploadFile={(file) => uploadLaboratoryOrderFile(order.id, file)} canManage={canUploadFiles && order.status !== 'CANCELLED'} title="Бланки анализов" /> : null}
          </Card>
        ))}
      </Space>
      <Modal title="Добавить анализ" open={open} onCancel={() => setOpen(false)} onOk={() => form.submit()} okText="Добавить" cancelText="Отмена" confirmLoading={create.isPending}>
        <Form form={form} layout="vertical" onFinish={(values) => create.mutate(values)}>
          {create.isError ? <Alert type="error" message={getErrorMessage(create.error)} /> : null}
          {tests.isError ? <Alert type="error" message={getErrorMessage(tests.error)} /> : null}
          <Form.Item name="testId" label="Исследование" rules={[{ required: true, message: 'Выберите исследование' }]}>
            <Select showSearch filterOption={false} onSearch={setSearch} loading={tests.isFetching} options={tests.data?.items.map((test) => ({ value: test.id, label: test.title, disabled: !test.documentTemplateId }))} />
          </Form.Item>
          <Form.Item name="comment" label="Комментарий"><Input.TextArea maxLength={1000} rows={2} /></Form.Item>
        </Form>
      </Modal>
      <LaboratoryResultsTableDrawer order={editing} patientName={stay.animal?.nickname ?? ''} canManage={canManage} onClose={() => setEditing(null)} saveResults={(orderId, items) => updateHospitalLaboratoryResults(stay.id, orderId, items)} />
    </Card>
  );
}
