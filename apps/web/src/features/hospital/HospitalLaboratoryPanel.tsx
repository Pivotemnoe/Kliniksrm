import { EditOutlined, PlusOutlined, PrinterOutlined } from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert, Button, Card, Drawer, Form, Input, Select, Space, Table, Tag, Typography } from 'antd';
import { useState } from 'react';
import { getErrorMessage } from '../../api/errors';
import { hasPermission } from '../../auth/permissions';
import { useCurrentEmployee } from '../../auth/useAuth';
import { useDebouncedValue } from '../../shared/hooks/useDebouncedValue';
import { formatDateTime } from '../../shared/utils/date';
import { AttachmentsPanel } from '../files/AttachmentsPanel';
import { listLaboratoryOrderFiles, uploadLaboratoryOrderFile } from '../files/files.api';
import { getLaboratoryResources } from '../laboratory/laboratory.api';
import { LaboratoryTestEditorDrawer } from '../laboratory/LaboratoryPage';
import { LaboratoryResultsTableDrawer } from '../laboratory/LaboratoryResultsTableDrawer';
import { printLaboratoryOrder } from '../laboratory/laboratoryPrint';
import type { LaboratoryOrder } from '../laboratory/types';
import type { OrganizationPrintProfile } from '../organization/types';
import { laboratoryOrderStatusColors, laboratoryOrderStatusLabels } from '../visits/types';
import { createHospitalLaboratoryOrder, listHospitalLaboratoryOrders, searchHospitalLaboratoryTests, updateHospitalLaboratoryResults } from './hospital.api';
import type { HospitalStay } from './types';

export function HospitalLaboratoryPanel({
  stay,
  organization,
  createOpen,
  onCreateOpenChange,
}: {
  stay: HospitalStay;
  organization?: OrganizationPrintProfile | null;
  createOpen: boolean;
  onCreateOpenChange: (open: boolean) => void;
}) {
  const { data: auth } = useCurrentEmployee();
  const remoteReadOnly = auth?.accessType === 'REMOTE' && !auth.employee.roles.includes('director');
  const canManage = hasPermission(auth?.employee, 'hospital.manage') && stay.status === 'ACTIVE' && !remoteReadOnly;
  const canPrint = hasPermission(auth?.employee, 'documents.print');
  const canReadFiles = hasPermission(auth?.employee, 'laboratory.read');
  const canUploadFiles = canManage && hasPermission(auth?.employee, 'laboratory.manage');
  const client = useQueryClient();
  const [configurationOpen, setConfigurationOpen] = useState(false);
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebouncedValue(search, 250);
  const [form] = Form.useForm<{ testIds: string[]; comment?: string }>();
  const [editing, setEditing] = useState<LaboratoryOrder | null>(null);
  const queryKey = ['laboratory', 'orders', 'hospital', stay.id];
  const orders = useQuery({ queryKey, queryFn: () => listHospitalLaboratoryOrders(stay.id) });
  const tests = useQuery({
    queryKey: ['laboratory', 'tests', 'hospital-select', debouncedSearch],
    queryFn: () => searchHospitalLaboratoryTests(debouncedSearch),
    enabled: createOpen,
  });
  const resources = useQuery({
    queryKey: ['laboratory', 'resources'],
    queryFn: getLaboratoryResources,
    enabled: configurationOpen,
  });
  const create = useMutation({
    mutationFn: (values: { testIds: string[]; comment?: string }) => createHospitalLaboratoryOrder(stay.id, values),
    onSuccess: async (order) => {
      onCreateOpenChange(false); setSearch(''); form.resetFields(); setEditing(order);
      await Promise.all([client.invalidateQueries({ queryKey: ['laboratory', 'orders'] }), client.invalidateQueries({ queryKey: ['visits'] })]);
    },
  });
  const canConfigure = hasPermission(auth?.employee, 'laboratory.read')
    || hasPermission(auth?.employee, 'laboratory.manage')
    || hasPermission(auth?.employee, 'visits.manage');
  const canEditDocuments = hasPermission(auth?.employee, 'documents.manage');
  const availableTests = tests.data?.items ?? [];
  function closeCreate() {
    onCreateOpenChange(false);
    setSearch('');
    form.resetFields();
    create.reset();
  }
  return (
    <Card title="Результаты анализов" size="small">
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
            <Table rowKey="id" size="small" pagination={false} dataSource={order.items.filter(item => item.status !== 'CANCELLED')} scroll={{ x: 520 }} columns={[
              { title: 'Показатель', key: 'title', render: (_, item) => <span>{item.groupName ? `${item.groupName} · ` : ''}{item.title}</span> },
              { title: 'Результат', key: 'result', render: (_, item) => item.resultValue || item.resultText || '—' },
              { title: 'Ед.', dataIndex: 'unit' }, { title: 'Референс', dataIndex: 'referenceRange' },
            ]} />
            {canReadFiles ? <AttachmentsPanel queryKey={['laboratory', 'order-files', order.id]} listFiles={() => listLaboratoryOrderFiles(order.id)} uploadFile={(file) => uploadLaboratoryOrderFile(order.id, file)} canManage={canUploadFiles && order.status !== 'CANCELLED'} title="Бланки анализов" /> : null}
          </Card>
        ))}
      </Space>
      <Drawer title="Добавить анализы" open={createOpen} onClose={closeCreate} width={620} destroyOnHidden>
        <Form form={form} layout="vertical" onFinish={(values) => create.mutate(values)}>
          {create.isError ? <Alert type="error" message={getErrorMessage(create.error)} /> : null}
          {tests.isError ? <Alert type="error" message={getErrorMessage(tests.error)} /> : null}
          <Alert
            type="info"
            showIcon
            className="form-alert"
            message="Выберите анализ — бланк уже подключён"
            description="После нажатия «Добавить» откроется таблица бланка для заполнения. Повторно связывать услугу не нужно; стоимость здесь не начисляется."
          />
          {canConfigure ? (
            <Button block icon={<PlusOutlined />} className="form-alert" onClick={() => setConfigurationOpen(true)}>
              Настроить новый анализ
            </Button>
          ) : null}
          {!tests.isLoading && !tests.isError && !availableTests.length ? (
            <Alert
              type="warning"
              showIcon
              className="form-alert"
              message={debouncedSearch ? 'По запросу анализы не найдены' : 'Нет анализов, готовых к добавлению'}
              description={debouncedSearch ? 'Измените запрос или создайте связь услуги и документа.' : 'Сначала свяжите услугу анализа с документом результатов.'}
            />
          ) : null}
          <Form.Item name="testIds" label="Лабораторные анализы" rules={[{ required: true, message: 'Выберите хотя бы один анализ' }]}>
            <Select
              mode="multiple"
              showSearch
              filterOption={false}
              onSearch={setSearch}
              loading={tests.isFetching}
              placeholder="Введите название анализа, код или услугу"
              notFoundContent={tests.isFetching ? 'Идёт поиск…' : 'Анализы не найдены'}
              options={availableTests.map((test) => ({
                value: test.id,
                label: `${test.title}${test.code ? ` · ${test.code}` : ''} · ${test.service?.title ?? 'услуга'} · ${test.documentTemplate?.title ?? 'документ'}`,
              }))}
            />
          </Form.Item>
          <Form.Item name="comment" label="Комментарий"><Input.TextArea maxLength={1000} rows={2} /></Form.Item>
          <Button type="primary" htmlType="submit" loading={create.isPending} disabled={tests.isLoading || !availableTests.length}>Добавить</Button>
        </Form>
      </Drawer>
      <LaboratoryTestEditorDrawer
        open={configurationOpen}
        test={null}
        resources={resources.data}
        canEditDocuments={canEditDocuments}
        onClose={() => setConfigurationOpen(false)}
      />
      <LaboratoryResultsTableDrawer order={editing} patientName={stay.animal?.nickname ?? ''} canManage={canManage} onClose={() => setEditing(null)} saveResults={(orderId, items, changes) => updateHospitalLaboratoryResults(stay.id, orderId, items, changes)} />
    </Card>
  );
}
