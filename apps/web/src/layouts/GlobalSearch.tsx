import { SearchOutlined, UserOutlined } from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import { Empty, Input, Space, Spin, Typography } from 'antd';
import type { ReactNode } from 'react';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getErrorMessage } from '../api/errors';
import { hasPermission } from '../auth/permissions';
import { useCurrentEmployee } from '../auth/useAuth';
import { listAnimals } from '../features/animals/animals.api';
import { Animal } from '../features/animals/types';
import { listOwners } from '../features/owners/owners.api';
import { Owner } from '../features/owners/types';
import { useDebouncedValue } from '../shared/hooks/useDebouncedValue';
import { AnimalSpeciesLabel } from '../shared/ui/AnimalSpeciesIcon';

export function GlobalSearch() {
  const navigate = useNavigate();
  const { data: auth } = useCurrentEmployee();
  const canSearchOwners = hasPermission(auth?.employee, 'owners.read');
  const canSearchAnimals = hasPermission(auth?.employee, 'animals.read');
  const [value, setValue] = useState('');
  const [focused, setFocused] = useState(false);
  const term = value.trim();
  const debouncedTerm = useDebouncedValue(term, 250);
  const enabled = debouncedTerm.length >= 2 && (canSearchOwners || canSearchAnimals);
  const isWaitingForTerm = term.length >= 2 && debouncedTerm !== term;
  const ownersQuery = useQuery({
    queryKey: ['global-search', 'owners', debouncedTerm],
    queryFn: () => listOwners({ search: debouncedTerm, limit: 5, offset: 0 }),
    enabled: enabled && canSearchOwners,
  });
  const animalsQuery = useQuery({
    queryKey: ['global-search', 'animals', debouncedTerm],
    queryFn: () => listAnimals({ search: debouncedTerm, limit: 5, offset: 0 }),
    enabled: enabled && canSearchAnimals,
  });
  const owners = ownersQuery.data?.items ?? [];
  const animals = animalsQuery.data?.items ?? [];
  const hasResults = (canSearchOwners && owners.length > 0) || (canSearchAnimals && animals.length > 0);
  const isLoading = isWaitingForTerm || (canSearchOwners && ownersQuery.isFetching) || (canSearchAnimals && animalsQuery.isFetching);
  const isError = (canSearchOwners && ownersQuery.isError) || (canSearchAnimals && animalsQuery.isError);
  const popoverOpen = focused && term.length >= 2;

  function openPath(path: string) {
    setFocused(false);
    setValue('');
    navigate(path);
  }

  function submitSearch() {
    if (!term) {
      return;
    }

    setFocused(false);
    navigate(`${canSearchOwners ? '/owners' : '/patients'}?search=${encodeURIComponent(term)}`);
  }

  if (!canSearchOwners && !canSearchAnimals) {
    return null;
  }

  return (
    <div className="global-search-wrap">
      <Input
        allowClear
        className="global-search"
        prefix={<SearchOutlined />}
        placeholder="Поиск клиента, телефона, пациента"
        value={value}
        onChange={(event) => setValue(event.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => window.setTimeout(() => setFocused(false), 120)}
        onPressEnter={submitSearch}
      />
      {popoverOpen ? (
        <div className="global-search-results" onMouseDown={(event) => event.preventDefault()}>
          {isLoading ? (
            <div className="global-search-state">
              <Spin size="small" />
              <Typography.Text type="secondary">Ищем владельцев и пациентов</Typography.Text>
            </div>
          ) : null}
          {isError ? (
            <Typography.Text type="danger">
              {getErrorMessage(ownersQuery.error ?? animalsQuery.error)}
            </Typography.Text>
          ) : null}
          {!isLoading && !isError && hasResults ? (
            <Space direction="vertical" size={10} className="full-width">
              {canSearchOwners ? (
                <SearchSection title="Владельцы">
                  {owners.map((owner) => (
                    <button
                      key={owner.id}
                      type="button"
                      className="global-search-row"
                      onClick={() => openPath(`/owners/${owner.id}`)}
                    >
                      <UserOutlined />
                      <span>
                        <Typography.Text strong>{owner.fullName}</Typography.Text>
                        <Typography.Text type="secondary">{formatOwnerDetails(owner)}</Typography.Text>
                      </span>
                    </button>
                  ))}
                </SearchSection>
              ) : null}
              {canSearchAnimals ? (
                <SearchSection title="Пациенты">
                  {animals.map((animal) => (
                    <button
                      key={animal.id}
                      type="button"
                      className="global-search-row"
                      onClick={() => openPath(`/patients/${animal.id}`)}
                    >
                      <AnimalSpeciesLabel species={animal.species} fallback="Вид не указан" showTooltip={false} />
                      <span>
                        <Typography.Text strong>{animal.nickname}</Typography.Text>
                        <Typography.Text type="secondary">{formatAnimalDetails(animal)}</Typography.Text>
                      </span>
                    </button>
                  ))}
                </SearchSection>
              ) : null}
              <button type="button" className="global-search-all" onClick={submitSearch}>
                {canSearchOwners ? 'Открыть полный поиск по владельцам' : 'Открыть полный поиск по пациентам'}
              </button>
            </Space>
          ) : null}
          {!isLoading && !isError && !hasResults ? <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Ничего не найдено" /> : null}
        </div>
      ) : null}
    </div>
  );
}

function SearchSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="global-search-section">
      <Typography.Text type="secondary" className="global-search-section-title">
        {title}
      </Typography.Text>
      {children}
    </div>
  );
}

function formatOwnerDetails(owner: Owner) {
  return [owner.phone, owner.extraPhone, owner.email].filter(Boolean).join(' · ') || 'Контакт не указан';
}

function formatAnimalDetails(animal: Animal) {
  return [animal.owner?.fullName, animal.breed, animal.microchip ? `чип ${animal.microchip}` : null].filter(Boolean).join(' · ') || 'Данные не указаны';
}
