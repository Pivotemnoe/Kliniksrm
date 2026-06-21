import { SearchOutlined } from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import { Button, Input, Table, Tag, Typography } from 'antd';
import { ColumnsType, TablePaginationConfig } from 'antd/es/table';
import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { getErrorMessage } from '../../api/errors';
import { AnimalSpeciesLabel } from '../../shared/ui/AnimalSpeciesIcon';
import { PageHeader } from '../../shared/ui/PageHeader';
import { listAnimals } from './animals.api';
import { Animal } from './types';

const pageSize = 10;

export function AnimalsPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [search, setSearch] = useState(searchParams.get('search') ?? '');
  const [searchInput, setSearchInput] = useState(searchParams.get('search') ?? '');
  const ownerId = searchParams.get('ownerId') ?? '';
  const [offset, setOffset] = useState(0);
  const animalsQuery = useQuery({
    queryKey: ['animals', { search, ownerId, limit: pageSize, offset }],
    queryFn: () => listAnimals({ search, ownerId, limit: pageSize, offset }),
  });

  useEffect(() => {
    const nextSearch = searchParams.get('search') ?? '';
    setSearch(nextSearch);
    setSearchInput(nextSearch);
    setOffset(0);
  }, [searchParams]);

  const columns = useMemo<ColumnsType<Animal>>(
    () => [
      {
        title: 'Состояние',
        dataIndex: 'status',
        key: 'status',
        render: (value: string | null) => <Tag color={value ? 'green' : 'default'}>{value || 'Не указано'}</Tag>,
      },
      {
        title: 'Пациент',
        dataIndex: 'nickname',
        key: 'nickname',
        render: (value: string, record) => (
          <Typography.Link onClick={() => navigate(`/patients/${record.id}`)}>{value}</Typography.Link>
        ),
      },
      { title: 'Вид', dataIndex: 'species', key: 'species', render: (value: string | null) => <AnimalSpeciesLabel species={value} /> },
      { title: 'Порода', dataIndex: 'breed', key: 'breed', render: (value: string | null) => value || '—' },
      { title: 'Пол', dataIndex: 'sex', key: 'sex', render: (value: string) => sexLabel[value] ?? value },
      {
        title: 'Владелец',
        key: 'owner',
        render: (_, record) =>
          record.owner ? (
            <Typography.Link onClick={() => navigate(`/owners/${record.owner?.id}`)}>{record.owner.fullName}</Typography.Link>
          ) : (
            '—'
          ),
      },
      { title: 'Последний приём', key: 'lastVisit', render: () => '—' },
    ],
    [navigate],
  );

  function handleTableChange(pagination: TablePaginationConfig) {
    const current = pagination.current ?? 1;
    const size = pagination.pageSize ?? pageSize;
    setOffset((current - 1) * size);
  }

  return (
    <div className="page">
      <PageHeader title="Пациенты" extra={<Button>Избранные</Button>} />
      <div className="list-panel">
        <div className="list-panel-header">
          <Input.Search
            allowClear
            enterButton={<SearchOutlined />}
            placeholder="Поиск по кличке, владельцу, породе или микрочипу"
            className="search-input"
            value={searchInput}
            onChange={(event) => setSearchInput(event.target.value)}
            onSearch={(value) => {
              setSearch(value.trim());
              setSearchInput(value);
              setOffset(0);
            }}
          />
          <Button>Фильтры</Button>
        </div>
        <div className="list-panel-body">
          {animalsQuery.isError ? (
            <Typography.Text type="danger">{getErrorMessage(animalsQuery.error)}</Typography.Text>
          ) : null}
          <Table<Animal>
            rowKey="id"
            columns={columns}
            dataSource={animalsQuery.data?.items ?? []}
            loading={animalsQuery.isLoading}
            pagination={{
              current: offset / pageSize + 1,
              pageSize,
              total: animalsQuery.data?.total ?? 0,
              showSizeChanger: false,
            }}
            onChange={handleTableChange}
            onRow={(record) => ({ onDoubleClick: () => navigate(`/patients/${record.id}`) })}
            className="dense-table"
          />
        </div>
      </div>
    </div>
  );
}

const sexLabel: Record<string, string> = {
  MALE: 'Самец',
  FEMALE: 'Самка',
  UNKNOWN: 'Не указан',
};
