import { PlusOutlined } from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { App, Button, Space, Table, Typography } from 'antd';
import { ColumnsType } from 'antd/es/table';
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getErrorMessage } from '../../api/errors';
import { AnimalSpeciesLabel } from '../../shared/ui/AnimalSpeciesIcon';
import { AnimalFormDrawer } from '../animals/AnimalFormDrawer';
import { AnimalStatusTag } from '../animals/animalStatus';
import { Animal, AnimalMutationInput } from '../animals/types';
import { createOwnerAnimal, listOwnerAnimals } from './owners.api';

type OwnerAnimalsTabProps = {
  ownerId: string;
};

export function OwnerAnimalsTab({ ownerId }: OwnerAnimalsTabProps) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { message } = App.useApp();
  const [createOpen, setCreateOpen] = useState(false);
  const animalsQuery = useQuery({
    queryKey: ['owners', ownerId, 'animals'],
    queryFn: () => listOwnerAnimals(ownerId),
  });
  const createMutation = useMutation({
    mutationFn: (values: AnimalMutationInput) => createOwnerAnimal(ownerId, values),
    onSuccess: async (animal) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['owners', ownerId] }),
        queryClient.invalidateQueries({ queryKey: ['owners', ownerId, 'animals'] }),
        queryClient.invalidateQueries({ queryKey: ['animals'] }),
      ]);
      setCreateOpen(false);
      message.success('Пациент создан');
      navigate(`/patients/${animal.id}`);
    },
    onError: (error) => message.error(getErrorMessage(error)),
  });
  const columns = useMemo<ColumnsType<Animal>>(
    () => [
      {
        title: 'Кличка',
        dataIndex: 'nickname',
        key: 'nickname',
        render: (value: string, record) => (
          <Button type="link" className="table-link" onClick={() => navigate(`/patients/${record.id}`)}>
            {value}
          </Button>
        ),
      },
      { title: 'Вид', dataIndex: 'species', key: 'species', render: (value: string | null) => <AnimalSpeciesLabel species={value} /> },
      { title: 'Порода', dataIndex: 'breed', key: 'breed', render: (value: string | null) => value || '—' },
      { title: 'Пол', dataIndex: 'sex', key: 'sex', render: (value: string) => sexLabel[value] ?? value },
      { title: 'Состояние', dataIndex: 'status', key: 'status', render: (value: string | null) => <AnimalStatusTag status={value} /> },
    ],
    [navigate],
  );

  return (
    <Space direction="vertical" size={16} className="full-width">
      <div className="toolbar-row">
        <Typography.Text type="secondary">Пациенты владельца</Typography.Text>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreateOpen(true)}>
          Создать пациента
        </Button>
      </div>
      {animalsQuery.isError ? (
        <Typography.Text type="danger">{getErrorMessage(animalsQuery.error)}</Typography.Text>
      ) : null}
      <Table<Animal>
        rowKey="id"
        columns={columns}
        dataSource={animalsQuery.data ?? []}
        loading={animalsQuery.isLoading}
        pagination={false}
        onRow={(record) => ({ onDoubleClick: () => navigate(`/patients/${record.id}`) })}
      />
      <AnimalFormDrawer
        open={createOpen}
        title="Создать пациента"
        onClose={() => setCreateOpen(false)}
        onSubmit={(values) => createMutation.mutate(values)}
        isSubmitting={createMutation.isPending}
        submitError={createMutation.error}
      />
    </Space>
  );
}

const sexLabel: Record<string, string> = {
  MALE: 'Самец',
  FEMALE: 'Самка',
  UNKNOWN: 'Не указан',
};
