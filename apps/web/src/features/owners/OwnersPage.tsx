import { PlusOutlined, SearchOutlined } from '@ant-design/icons';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { App, Button, Select, Space } from 'antd';
import { ColumnsType } from 'antd/es/table';
import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { getErrorMessage } from '../../api/errors';
import { InfiniteTable, useInfiniteListQuery } from '../../shared/ui/InfiniteTable';
import { LiveSearchInput } from '../../shared/ui/LiveSearchInput';
import { PageHeader } from '../../shared/ui/PageHeader';
import { formatDateTime } from '../../shared/utils/date';
import { createOwner, listOwners } from './owners.api';
import { OwnerFormDrawer } from './OwnerFormDrawer';
import { Owner, OwnerMutationInput } from './types';

export function OwnersPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const queryClient = useQueryClient();
  const { message } = App.useApp();
  const [search, setSearch] = useState(searchParams.get('search') ?? '');
  const [searchInput, setSearchInput] = useState(searchParams.get('search') ?? '');
  const [createOpen, setCreateOpen] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [hasAnimals, setHasAnimals] = useState<boolean>();
  const [hasVisits, setHasVisits] = useState<boolean>();
  const ownersQuery = useInfiniteListQuery({
    queryKey: ['owners', { search, hasAnimals, hasVisits }],
    queryFn: ({ limit, offset }) => listOwners({ search, hasAnimals, hasVisits, limit, offset }),
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
  }, [searchParams]);

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
        dataIndex: 'lastVisitAt',
        key: 'lastVisitAt',
        width: 180,
        render: formatDateTime,
      },
    ],
    [navigate],
  );

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
          <LiveSearchInput
            allowClear
            enterButton={<SearchOutlined />}
            placeholder="Поиск по ФИО, телефону, email, пациенту или микрочипу"
            value={searchInput}
            onChange={(event) => setSearchInput(event.target.value)}
            onSearch={(value) => {
              setSearch(value.trim());
              setSearchInput(value);
            }}
          />
          <Button onClick={() => setFiltersOpen(!filtersOpen)} aria-expanded={filtersOpen}>Фильтры</Button>
        </div>
        {filtersOpen ? <Space wrap style={{ padding: 12 }}>
          <Select aria-label="Наличие пациентов" placeholder="Пациенты" allowClear value={hasAnimals === undefined ? undefined : String(hasAnimals)} onChange={value => setHasAnimals(value === undefined ? undefined : value === 'true')} style={{ width: 200 }} options={[{ value: 'true', label: 'Есть пациенты' }, { value: 'false', label: 'Нет пациентов' }]} />
          <Select aria-label="Наличие приёмов" placeholder="Приёмы" allowClear value={hasVisits === undefined ? undefined : String(hasVisits)} onChange={value => setHasVisits(value === undefined ? undefined : value === 'true')} style={{ width: 200 }} options={[{ value: 'true', label: 'Есть приёмы' }, { value: 'false', label: 'Нет приёмов' }]} />
          <Button onClick={() => { setHasAnimals(undefined); setHasVisits(undefined); }}>Сбросить</Button>
        </Space> : null}
        <div className="list-panel-body">
        <Space direction="vertical" size={16} className="full-width">
          <InfiniteTable<Owner>
            query={ownersQuery}
            errorText={ownersQuery.isError ? getErrorMessage(ownersQuery.error) : undefined}
            rowKey="id"
            columns={columns}
            onRow={(record) => ({
              onDoubleClick: () => navigate(`/owners/${record.id}`),
            })}
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
