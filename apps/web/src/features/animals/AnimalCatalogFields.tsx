import { useQuery } from '@tanstack/react-query';
import { Form, Select } from 'antd';
import { useEffect } from 'react';
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

  useEffect(() => {
    if (breedValue && selectedSpecies && !selectedSpecies.breeds.some((breed) => breed.title === breedValue)) {
      setValue(breedName, '');
    }
  }, [breedName, breedValue, selectedSpecies, setValue]);

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
            <Select
              {...field}
              allowClear
              showSearch
              optionFilterProp="label"
              disabled={!speciesValue}
              loading={catalogQuery.isLoading}
              options={breedOptions}
              placeholder={speciesValue ? 'Выберите породу' : 'Сначала выберите вид'}
              onChange={(value) => field.onChange(value ?? '')}
            />
          </Form.Item>
        )}
      />
    </>
  );
}
