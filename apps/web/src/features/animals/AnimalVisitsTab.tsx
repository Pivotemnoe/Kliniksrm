import { PlusOutlined } from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import { Button, Space, Table, Tag, Typography } from 'antd';
import { ColumnsType } from 'antd/es/table';
import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { getErrorMessage } from '../../api/errors';
import { formatDateTime } from '../../shared/utils/date';
import { formatMoney } from '../../shared/utils/money';
import { listVisits } from '../visits/visits.api';
import { VisitListItem, VisitStatus, visitStatusColors, visitStatusLabels } from '../visits/types';

type AnimalVisitsTabProps = {
  ownerId: string;
  animalId: string;
};

export function AnimalVisitsTab({ ownerId, animalId }: AnimalVisitsTabProps) {
  const navigate = useNavigate();
  const visitsQuery = useQuery({
    queryKey: ['visits', { animalId, limit: 20, offset: 0 }],
    queryFn: () => listVisits({ animalId, limit: 20, offset: 0 }),
  });
  const columns = useMemo<ColumnsType<VisitListItem>>(
    () => [
      {
        title: 'Дата',
        dataIndex: 'startedAt',
        key: 'startedAt',
        render: (value: string, record) => (
          <Button type="link" className="table-link" onClick={() => navigate(`/visits/${record.id}`)}>
            {formatDateTime(value)}
          </Button>
        ),
      },
      { title: 'Сотрудник', key: 'employee', render: (_, record) => record.employee?.fullName ?? '—' },
      {
        title: 'Статус',
        dataIndex: 'status',
        key: 'status',
        render: (value: VisitStatus) => <Tag color={visitStatusColors[value]}>{visitStatusLabels[value]}</Tag>,
      },
      { title: 'Сумма', dataIndex: 'totalAmount', key: 'totalAmount', render: formatMoney },
    ],
    [navigate],
  );

  return (
    <Space direction="vertical" size={16} className="full-width">
      <div className="toolbar-row">
        <Typography.Text type="secondary">История приёмов пациента</Typography.Text>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => navigate(`/visits?ownerId=${ownerId}&animalId=${animalId}`)}>
          Создать приём
        </Button>
      </div>
      {visitsQuery.isError ? <Typography.Text type="danger">{getErrorMessage(visitsQuery.error)}</Typography.Text> : null}
      <Table<VisitListItem>
        rowKey="id"
        columns={columns}
        dataSource={visitsQuery.data?.items ?? []}
        loading={visitsQuery.isLoading}
        pagination={false}
        onRow={(record) => ({ onDoubleClick: () => navigate(`/visits/${record.id}`) })}
      />
    </Space>
  );
}
