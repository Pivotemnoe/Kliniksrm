import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert, Button, Form, Input, InputNumber, Space, Table, Typography } from 'antd';
import { ColumnsType } from 'antd/es/table';
import { Controller, useForm } from 'react-hook-form';
import { z } from 'zod';
import { getErrorMessage } from '../../api/errors';
import { optionalString } from '../../shared/utils/forms';
import { createWeightRecord, listWeightRecords } from './animals.api';
import { AnimalWeightRecord, WeightMutationInput } from './types';

const weightSchema = z.object({
  weightKg: z.number().min(0.001, 'Укажите вес').max(999),
  measuredAt: optionalString(),
});

type WeightFormValues = z.infer<typeof weightSchema>;
type WeightFormInput = z.input<typeof weightSchema>;

type AnimalWeightsTabProps = {
  animalId: string;
};

export function AnimalWeightsTab({ animalId }: AnimalWeightsTabProps) {
  const queryClient = useQueryClient();
  const { control, handleSubmit, reset } = useForm<WeightFormInput, unknown, WeightFormValues>({
    resolver: zodResolver(weightSchema),
    defaultValues: { weightKg: 0, measuredAt: '' },
  });
  const weightsQuery = useQuery({
    queryKey: ['animals', animalId, 'weights'],
    queryFn: () => listWeightRecords(animalId),
  });
  const createMutation = useMutation({
    mutationFn: (values: WeightMutationInput) => createWeightRecord(animalId, values),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['animals', animalId] }),
        queryClient.invalidateQueries({ queryKey: ['animals', animalId, 'weights'] }),
      ]);
      reset({ weightKg: 0, measuredAt: '' });
    },
  });
  const columns: ColumnsType<AnimalWeightRecord> = [
    { title: 'Дата', dataIndex: 'measuredAt', key: 'measuredAt', render: formatDate },
    { title: 'Вес, кг', dataIndex: 'weightKg', key: 'weightKg' },
  ];

  return (
    <Space direction="vertical" size={16} className="full-width">
      <Form layout="inline" onFinish={handleSubmit((values) => createMutation.mutate(values))}>
        <Controller
          control={control}
          name="weightKg"
          render={({ field, fieldState }) => (
            <Form.Item validateStatus={fieldState.error ? 'error' : undefined} help={fieldState.error?.message}>
              <InputNumber
                min={0}
                step={0.1}
                addonAfter="кг"
                value={field.value}
                onChange={(value) => field.onChange(value ?? 0)}
              />
            </Form.Item>
          )}
        />
        <Controller
          control={control}
          name="measuredAt"
          render={({ field, fieldState }) => (
            <Form.Item validateStatus={fieldState.error ? 'error' : undefined} help={fieldState.error?.message}>
              <Input type="date" {...field} />
            </Form.Item>
          )}
        />
        <Button type="primary" htmlType="submit" loading={createMutation.isPending}>
          Добавить вес
        </Button>
      </Form>
      {createMutation.isError ? <Alert type="error" showIcon message={getErrorMessage(createMutation.error)} /> : null}
      {weightsQuery.isError ? <Typography.Text type="danger">{getErrorMessage(weightsQuery.error)}</Typography.Text> : null}
      <Table<AnimalWeightRecord>
        rowKey="id"
        columns={columns}
        dataSource={weightsQuery.data ?? []}
        loading={weightsQuery.isLoading}
        pagination={false}
      />
    </Space>
  );
}

function formatDate(value: string) {
  return new Date(value).toLocaleString('ru-RU');
}
