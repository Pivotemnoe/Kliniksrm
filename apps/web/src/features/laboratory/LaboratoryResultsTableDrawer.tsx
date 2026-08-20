import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Alert, App, Button, Drawer, Input, Select, Space, Table, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { getErrorMessage } from '../../api/errors';
import { laboratoryOrderItemStatusLabels } from '../visits/types';
import type { LaboratoryOrderItem, LaboratoryOrderResultRowInput } from './types';
import { updateLaboratoryOrderResults } from './laboratory.api';

type ResultOrder = { id: string; items: LaboratoryOrderItem[] };
type ResultTableRow = LaboratoryOrderResultRowInput & {
  title: string;
  code: string | null;
  disabled: boolean;
};

export function LaboratoryResultsTableDrawer({
  order,
  patientName,
  canManage,
  onClose,
}: {
  order: ResultOrder | null;
  patientName: string;
  canManage: boolean;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const { message } = App.useApp();
  const [rows, setRows] = useState<ResultTableRow[]>([]);
  const mutation = useMutation({
    mutationFn: (items: LaboratoryOrderResultRowInput[]) => updateLaboratoryOrderResults(order!.id, items),
    onSuccess: () => {
      onClose();
      message.success('Таблица результатов сохранена');
      void Promise.all([
        queryClient.invalidateQueries({ queryKey: ['laboratory', 'orders'] }),
        queryClient.invalidateQueries({ queryKey: ['visits'] }),
        queryClient.invalidateQueries({ queryKey: ['dashboard'] }),
      ]);
    },
    onError: (error) => message.error(getErrorMessage(error)),
  });

  useEffect(() => {
    setRows(order?.items.map((item) => ({
      itemId: item.id,
      title: item.title,
      code: item.code,
      status: item.status,
      resultValue: item.resultValue ?? '',
      resultText: item.resultText ?? '',
      unit: item.unit ?? '',
      referenceRange: item.referenceRange ?? '',
      comment: item.comment ?? '',
      disabled: item.status === 'CANCELLED',
    })) ?? []);
  }, [order]);

  const updateRow = useCallback((itemId: string, patch: Partial<ResultTableRow>) => {
    setRows((current) => current.map((row) => (row.itemId === itemId ? { ...row, ...patch } : row)));
  }, []);

  const columns = useMemo<ColumnsType<ResultTableRow>>(() => [
    {
      title: 'Показатель',
      key: 'indicator',
      width: 220,
      shouldCellUpdate: (row, previous) => row.title !== previous.title || row.code !== previous.code,
      render: (_, row) => <Space direction="vertical" size={0}><Typography.Text strong>{row.title}</Typography.Text>{row.code ? <Typography.Text type="secondary">{row.code}</Typography.Text> : null}</Space>,
    },
    {
      title: 'Значение', dataIndex: 'resultValue', key: 'resultValue', width: 145,
      shouldCellUpdate: (row, previous) => row.resultValue !== previous.resultValue || row.status !== previous.status || row.disabled !== previous.disabled,
      render: (value, row) => <Input value={value ?? ''} disabled={row.disabled} aria-label={`Значение ${row.title}`} onChange={(event) => updateRow(row.itemId, { resultValue: event.target.value, ...(event.target.value.trim() && row.status === 'ORDERED' ? { status: 'COMPLETED' } : {}) })} />,
    },
    { title: 'Ед.', dataIndex: 'unit', key: 'unit', width: 110, shouldCellUpdate: (row, previous) => row.unit !== previous.unit || row.disabled !== previous.disabled, render: (value, row) => <Input value={value ?? ''} disabled={row.disabled} onChange={(event) => updateRow(row.itemId, { unit: event.target.value })} /> },
    { title: 'Референс', dataIndex: 'referenceRange', key: 'referenceRange', width: 230, shouldCellUpdate: (row, previous) => row.referenceRange !== previous.referenceRange || row.disabled !== previous.disabled, render: (value, row) => <Input value={value ?? ''} disabled={row.disabled} onChange={(event) => updateRow(row.itemId, { referenceRange: event.target.value })} /> },
    { title: 'Комментарий', dataIndex: 'comment', key: 'comment', width: 210, shouldCellUpdate: (row, previous) => row.comment !== previous.comment || row.disabled !== previous.disabled, render: (value, row) => <Input value={value ?? ''} disabled={row.disabled} onChange={(event) => updateRow(row.itemId, { comment: event.target.value })} /> },
    {
      title: 'Статус', dataIndex: 'status', key: 'status', width: 155,
      shouldCellUpdate: (row, previous) => row.status !== previous.status || row.disabled !== previous.disabled,
      render: (value, row) => <Select value={value} disabled={row.disabled} className="full-width" onChange={(status) => updateRow(row.itemId, { status })} options={Object.entries(laboratoryOrderItemStatusLabels).filter(([status]) => status !== 'CANCELLED').map(([status, label]) => ({ value: status, label }))} />,
    },
  ], [updateRow]);

  return (
    <Drawer
      title={order ? `Результаты: ${patientName}` : 'Таблица результатов'}
      open={Boolean(order)}
      onClose={onClose}
      width="min(1280px, 96vw)"
      destroyOnHidden
      extra={<Button type="primary" loading={mutation.isPending} disabled={!canManage || !rows.some((row) => !row.disabled)} onClick={() => mutation.mutate(rows.map(({ title: _title, code: _code, disabled: _disabled, ...row }) => row))}>Сохранить всю таблицу</Button>}
    >
      <Alert type="info" showIcon className="form-alert" message="Введите результаты прямо в бланк анализа" description="Показатели взяты из привязанного документа. Вся таблица сохраняется одной операцией, а печать использует тот же бланк A5." />
      {mutation.isError ? <Alert type="error" showIcon message={getErrorMessage(mutation.error)} className="form-alert" /> : null}
      <Table<ResultTableRow> rowKey="itemId" columns={columns} dataSource={rows} pagination={false} className="dense-table laboratory-result-grid" scroll={{ x: 1070, y: 'calc(100vh - 250px)' }} />
    </Drawer>
  );
}
