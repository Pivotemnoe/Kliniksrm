import { useQuery } from '@tanstack/react-query';
import { Button, Form, Input, Select } from 'antd';
import { useState } from 'react';
import { Controller, useWatch } from 'react-hook-form';
import { AnimalSpeciesLabel } from '../../shared/ui/AnimalSpeciesIcon';
import { getAnimalCatalog } from './animals.api';

type AnimalCatalogFieldsProps = {
  control: any;
  setValue: any;
  speciesName?: string;
  breedName?: string;
  speciesLabel?: string;
  breedLabel?: string;
};

export function AnimalCatalogFields({
  control,
  setValue,
  speciesName = 'species',
  breedName = 'breed',
  speciesLabel = 'Вид',
  breedLabel = 'Порода',
}: AnimalCatalogFieldsProps) {
  const ownerStatedBreedValue = '__OWNER_STATED_BREED__';
  const catalogQuery = useQuery({
    queryKey: ['animals', 'catalog'],
    queryFn: getAnimalCatalog,
    staleTime: 10 * 60 * 1000,
  });
  const speciesValue = useWatch({ control, name: speciesName });
  const breedValue = useWatch({ control, name: breedName });
  const species = catalogQuery.data?.species ?? [];
  const selectedSpecies = species.find((item) => item.title === speciesValue);
  const breedOptions = selectedSpecies?.breeds.map((breed) => ({ value: breed.title, label: breed.title })) ?? [];
  const [ownerStatedBreedMode, setOwnerStatedBreedMode] = useState(false);
  const isOwnerStatedBreed = ownerStatedBreedMode || Boolean(breedValue && selectedSpecies && !breedOptions.some((breed) => breed.value === breedValue));

  return (
    <>
      <Controller
        control={control}
        name={speciesName}
        render={({ field, fieldState }) => (
          <Form.Item label={speciesLabel} validateStatus={fieldState.error ? 'error' : undefined} help={fieldState.error?.message}>
            <Select
              {...field}
              allowClear
              showSearch
              optionFilterProp="searchLabel"
              optionLabelProp="label"
              loading={catalogQuery.isLoading}
              options={species.map((item) => ({
                value: item.title,
                label: <AnimalSpeciesLabel species={item.title} showTooltip={false} />,
                searchLabel: item.title,
              }))}
              placeholder="Выберите вид"
              onChange={(value) => {
                field.onChange(value ?? '');
                setValue(breedName, '');
                setOwnerStatedBreedMode(false);
              }}
            />
          </Form.Item>
        )}
      />
      <Controller
        control={control}
        name={breedName}
        render={({ field, fieldState }) => (
          <Form.Item label={breedLabel} validateStatus={fieldState.error ? 'error' : undefined} help={fieldState.error?.message}>
            {isOwnerStatedBreed ? (
              <>
                <Input
                  {...field}
                  placeholder="Укажите породу со слов владельца"
                  disabled={!speciesValue}
                />
                <Button type="link" size="small" onClick={() => { setOwnerStatedBreedMode(false); field.onChange(''); }}>
                  Выбрать из реестра
                </Button>
              </>
            ) : (
              <Select
                value={field.value || undefined}
                allowClear
                showSearch
                optionFilterProp="label"
                disabled={!speciesValue}
                loading={catalogQuery.isLoading}
                options={[
                  ...breedOptions,
                  { value: ownerStatedBreedValue, label: 'Нет в реестре — указать со слов владельца' },
                ]}
                placeholder={speciesValue ? 'Выберите породу' : 'Сначала выберите вид'}
                onChange={(value) => {
                  if (value === ownerStatedBreedValue) {
                    setOwnerStatedBreedMode(true);
                    field.onChange('');
                    return;
                  }
                  field.onChange(value ?? '');
                }}
              />
            )}
          </Form.Item>
        )}
      />
    </>
  );
}
