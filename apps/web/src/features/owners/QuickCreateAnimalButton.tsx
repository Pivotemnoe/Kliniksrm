import { PlusOutlined } from '@ant-design/icons';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { App, Button } from 'antd';
import { useState } from 'react';
import { getErrorMessage } from '../../api/errors';
import { AnimalFormDrawer } from '../animals/AnimalFormDrawer';
import type { Animal, AnimalMutationInput } from '../animals/types';
import { createOwnerAnimal } from './owners.api';

type QuickCreateAnimalButtonProps = {
  ownerId?: string;
  disabled?: boolean;
  onCreated: (animal: Animal) => void;
};

type CreateAnimalVariables = {
  ownerId: string;
  values: AnimalMutationInput;
};

export function QuickCreateAnimalButton({ ownerId, disabled = false, onCreated }: QuickCreateAnimalButtonProps) {
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const createMutation = useMutation({
    mutationFn: ({ ownerId: selectedOwnerId, values }: CreateAnimalVariables) => createOwnerAnimal(selectedOwnerId, values),
    onSuccess: async (animal, variables) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['owners', variables.ownerId] }),
        queryClient.invalidateQueries({ queryKey: ['owners', variables.ownerId, 'animals'] }),
        queryClient.invalidateQueries({ queryKey: ['animals'] }),
      ]);
      onCreated(animal);
      setOpen(false);
      message.success('Питомец добавлен и выбран');
    },
    onError: (error) => message.error(getErrorMessage(error)),
  });

  return (
    <>
      <Button
        type="link"
        icon={<PlusOutlined />}
        className="form-field-action-button"
        disabled={disabled || !ownerId}
        title={!ownerId ? 'Сначала выберите владельца' : undefined}
        onClick={() => setOpen(true)}
      >
        Добавить питомца
      </Button>
      <AnimalFormDrawer
        open={open && Boolean(ownerId)}
        title="Добавить питомца существующему владельцу"
        onClose={() => setOpen(false)}
        onSubmit={(values) => {
          if (ownerId) createMutation.mutate({ ownerId, values });
        }}
        isSubmitting={createMutation.isPending}
        submitError={createMutation.error}
      />
    </>
  );
}
