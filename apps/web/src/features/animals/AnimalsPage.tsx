import { SearchOutlined } from '@ant-design/icons';
import { Button, Select, Space, Typography } from 'antd';
import { ColumnsType } from 'antd/es/table';
import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { getErrorMessage } from '../../api/errors';
import { AnimalSpeciesLabel } from '../../shared/ui/AnimalSpeciesIcon';
import { InfiniteTable, useInfiniteListQuery } from '../../shared/ui/InfiniteTable';
import { LiveSearchInput } from '../../shared/ui/LiveSearchInput';
import { PageHeader } from '../../shared/ui/PageHeader';
import { formatAnimalAge } from '../../shared/utils/animalBirthDate';
import { AnimalStatusTag, animalStatusOptions } from './animalStatus';
import { listAnimals } from './animals.api';
import { Animal } from './types';

export function AnimalsPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [search, setSearch] = useState(searchParams.get('search') ?? '');
  const [searchInput, setSearchInput] = useState(searchParams.get('search') ?? '');
  const ownerId = searchParams.get('ownerId') ?? '';
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [species, setSpecies] = useState<string>();
  const [sex, setSex] = useState<string>();
  const [status, setStatus] = useState<string>();
  const [isFavorite, setIsFavorite] = useState(false);
  const animalsQuery = useInfiniteListQuery({
    queryKey: ['animals', { search, ownerId, species, sex, status, isFavorite }],
    queryFn: ({ limit, offset }) => listAnimals({ search, ownerId, species, sex, status, isFavorite: isFavorite || undefined, limit, offset }),
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
      <PageHeader title="Пациенты" extra={<Button type={isFavorite ? 'primary' : 'default'} onClick={() => setIsFavorite(!isFavorite)}>Избранные</Button>} />
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
          <Button onClick={() => setFiltersOpen(!filtersOpen)} aria-expanded={filtersOpen}>Фильтры</Button>
        </div>
        {filtersOpen ? <Space wrap style={{ padding: 12 }}>
          <Select aria-label="Вид животного" placeholder="Вид" allowClear value={species} onChange={setSpecies} style={{ width: 160 }} options={['Кошка', 'Собака'].map(value => ({ value, label: value }))} />
          <Select aria-label="Пол животного" placeholder="Пол" allowClear value={sex} onChange={setSex} style={{ width: 160 }} options={Object.entries(sexLabel).map(([value, label]) => ({ value, label }))} />
          <Select aria-label="Состояние животного" placeholder="Состояние" allowClear value={status} onChange={setStatus} style={{ width: 180 }} options={animalStatusOptions} />
          <Button onClick={() => { setSpecies(undefined); setSex(undefined); setStatus(undefined); setIsFavorite(false); }}>Сбросить</Button>
        </Space> : null}
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
