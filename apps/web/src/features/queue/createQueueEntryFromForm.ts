import { createOwner, createOwnerAnimal } from '../owners/owners.api';
import { createQueueEntry } from './queue.api';
import { saveRegistrationAnimalEdit } from '../animals/registrationAnimal';
import type { QueueFormSubmitInput } from './QueueFormDrawer';

export async function createQueueEntryFromForm({ animalEdit, ...values }: QueueFormSubmitInput) {
  if (!values.createCards) {
    await saveRegistrationAnimalEdit(animalEdit, values.animalId, values.ownerId);
    return createQueueEntry(values);
  }

  const owner = await createOwner(values.createCards.owner);
  const animal = await createOwnerAnimal(owner.id, values.createCards.animal);
  const { createCards, ...queueInput } = values;

  return createQueueEntry({
    ...queueInput,
    ownerId: owner.id,
    animalId: animal.id,
    ownerName: undefined,
    phone: undefined,
    ownerAddress: undefined,
    animalNickname: undefined,
    animalSpecies: undefined,
    animalBreed: undefined,
    animalSex: undefined,
  });
}
