import { SearchOutlined } from '@ant-design/icons';
import { Button, Typography } from 'antd';
import { ColumnsType } from 'antd/es/table';
import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { getErrorMessage } from '../../api/errors';
import { AnimalSpeciesLabel } from '../../shared/ui/AnimalSpeciesIcon';
import { InfiniteTable, useInfiniteListQuery } from '../../shared/ui/InfiniteTable';
import { LiveSearchInput } from '../../shared/ui/LiveSearchInput';
import { PageHeader } from '../../shared/ui/PageHeader';
import { formatAnimalAge } from '../../shared/utils/animalBirthDate';
import { AnimalStatusTag } from './animalStatus';
import { listAnimals } from './animals.api';
import { Animal } from './types';

export function AnimalsPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [search, setSearch] = useState(searchParams.get('search') ?? '');
  const [searchInput, setSearchInput] = useState(searchParams.get('search') ?? '');
  const ownerId = searchParams.get('ownerId') ?? '';
  const animalsQuery = useInfiniteListQuery({
    queryKey: ['animals', { search, ownerId }],
    queryFn: ({ limit, offset }) => listAnimals({ search, ownerId, limit, offset }),
  });

  useEffect(() => {
    const nextSearch = searchParams.get('search') ?? '';
    setSearch(nextSearch);
    setSearchInput(nextSearch);
  }, [searchParams]);

  const columns = useMemo<ColumnsType<Animal>>(
    () => [
      {
        title: 'Состояние',
        dataIndex: 'status',
        key: 'status',
        render: (value: string | null) => <AnimalStatusTag status={value} />,
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
      { title: 'Возраст', dataIndex: 'birthDate', key: 'birthDate', render: (value: string | null) => formatAnimalAge(value) },
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

  return (
    <div className="page">
      <PageHeader title="Пациенты" extra={<Button>Избранные</Button>} />
      <div className="list-panel">
        <div className="list-panel-header">
          <LiveSearchInput
            allowClear
            enterButton={<SearchOutlined />}
            placeholder="Поиск по кличке, владельцу, породе или микрочипу"
            className="search-input"
            value={searchInput}
            onChange={(event) => setSearchInput(event.target.value)}
            onSearch={(value) => {
              setSearch(value.trim());
              setSearchInput(value);
            }}
          />
          <Button>Фильтры</Button>
        </div>
        <div className="list-panel-body">
          <InfiniteTable<Animal>
            query={animalsQuery}
            errorText={animalsQuery.isError ? getErrorMessage(animalsQuery.error) : undefined}
            rowKey="id"
            columns={columns}
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
