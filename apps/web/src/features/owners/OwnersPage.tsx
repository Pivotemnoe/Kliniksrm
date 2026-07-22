import { PlusOutlined, SearchOutlined } from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { App, Button, Input, Space, Table, Typography } from 'antd';
import { ColumnsType, TablePaginationConfig } from 'antd/es/table';
import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { getErrorMessage } from '../../api/errors';
import { PageHeader } from '../../shared/ui/PageHeader';
import { createOwner, listOwners } from './owners.api';
import { OwnerFormDrawer } from './OwnerFormDrawer';
import { Owner, OwnerMutationInput } from './types';

const pageSize = 10;

export function OwnersPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const queryClient = useQueryClient();
  const { message } = App.useApp();
  const [search, setSearch] = useState(searchParams.get('search') ?? '');
  const [searchInput, setSearchInput] = useState(searchParams.get('search') ?? '');
  const [offset, setOffset] = useState(0);
  const [createOpen, setCreateOpen] = useState(false);
  const ownersQuery = useQuery({
    queryKey: ['owners', { search, limit: pageSize, offset }],
    queryFn: () => listOwners({ search, limit: pageSize, offset }),
  });
  const createMutation = useMutation({
    mutationFn: (values: OwnerMutationInput) => createOwner(values),
    onSuccess: async (owner) => {
      await queryClient.invalidateQueries({ queryKey: ['owners'] });
      setCreateOpen(false);
      message.success('Владелец создан');
      navigate(`/owners/${owner.id}`);
    },
    onError: (error) => message.error(getErrorMessage(error)),
  });

  useEffect(() => {
    const nextSearch = searchParams.get('search') ?? '';
    setSearch(nextSearch);
    setSearchInput(nextSearch);
    setOffset(0);
  }, [searchParams]);

  useEffect(() => {
    const trimmedSearch = searchInput.trim();
    const timeoutId = window.setTimeout(() => {
      if (trimmedSearch !== search) {
        setSearch(trimmedSearch);
        setOffset(0);
      }
    }, 250);

    return () => window.clearTimeout(timeoutId);
  }, [search, searchInput]);

  const columns = useMemo<ColumnsType<Owner>>(
    () => [
      {
        title: 'Владелец',
        dataIndex: 'fullName',
        key: 'fullName',
        render: (value: string, record) => (
          <Button type="link" className="table-link" onClick={() => navigate(`/owners/${record.id}`)}>
            {value}
          </Button>
        ),
      },
      {
        title: 'Телефон',
        dataIndex: 'phone',
        key: 'phone',
        render: (value: string | null) => value || '—',
      },
      {
        title: 'Баланс',
        dataIndex: 'balance',
        key: 'balance',
        render: (value: string) => `${value} ₽`,
      },
      {
        title: 'Пациент',
        key: 'animals',
        width: 120,
        render: (_, record) => record._count?.animals ?? record.animals?.length ?? 0,
      },
      {
        title: 'Последний приём',
        key: 'lastVisit',
        render: () => '—',
      },
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
      <PageHeader
        title="Владельцы"
        extra={
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreateOpen(true)}>
            Добавить владельца и пациента
          </Button>
        }
      />
      <div className="list-panel">
        <div className="list-panel-header">
          <Input.Search
            allowClear
            enterButton={<SearchOutlined />}
            placeholder="Поиск по ФИО, телефону, email, пациенту или микрочипу"
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
        <Space direction="vertical" size={16} className="full-width">
          {ownersQuery.isError ? (
            <Typography.Text type="danger">{getErrorMessage(ownersQuery.error)}</Typography.Text>
          ) : null}
          <Table<Owner>
            rowKey="id"
            columns={columns}
            dataSource={ownersQuery.data?.items ?? []}
            loading={ownersQuery.isLoading}
            onRow={(record) => ({
              onDoubleClick: () => navigate(`/owners/${record.id}`),
            })}
            pagination={{
              current: offset / pageSize + 1,
              pageSize,
              total: ownersQuery.data?.total ?? 0,
              showSizeChanger: false,
            }}
            onChange={handleTableChange}
            className="dense-table"
          />
        </Space>
        </div>
      </div>
      <OwnerFormDrawer
        open={createOpen}
        title="Регистрация владельца"
        onClose={() => setCreateOpen(false)}
        onSubmit={(values) => createMutation.mutate(values)}
        isSubmitting={createMutation.isPending}
        submitError={createMutation.error}
      />
    </div>
  );
}
