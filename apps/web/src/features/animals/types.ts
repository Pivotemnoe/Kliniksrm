export type AnimalSex = 'MALE' | 'FEMALE' | 'UNKNOWN';

export type Animal = {
  id: string;
  ownerId: string;
  nickname: string;
  species: string | null;
  breed: string | null;
  sex: AnimalSex;
  birthDate: string | null;
  color: string | null;
  microchip: string | null;
  mark: string | null;
  comment: string | null;
  isSterilized: boolean;
  isFavorite: boolean;
  status: string | null;
  owner?: {
    id: string;
    fullName: string;
    phone: string | null;
    extraPhone: string | null;
  };
  weights?: AnimalWeightRecord[];
  vaccinations?: Vaccination[];
  _count?: {
    appointments: number;
    visits: number;
    tasks: number;
    bills?: number;
    vaccinations: number;
  };
  createdAt: string;
  updatedAt: string;
};

export type AnimalMutationInput = {
  nickname: string;
  species: string;
  breed: string;
  sex?: AnimalSex;
  birthDate?: string;
  color?: string;
  microchip?: string;
  mark?: string;
  comment?: string;
  isSterilized?: boolean;
  isFavorite?: boolean;
  status?: string;
};

export type AnimalBreedCatalogItem = {
  id: string;
  speciesId: string;
  title: string;
  sortOrder: number;
};

export type AnimalSpeciesCatalogItem = {
  id: string;
  code: string;
  title: string;
  sortOrder: number;
  breeds: AnimalBreedCatalogItem[];
};

export type AnimalCatalog = {
  species: AnimalSpeciesCatalogItem[];
};

export type AnimalWeightRecord = {
  id: string;
  animalId: string;
  weightKg: string;
  measuredAt: string;
  createdAt: string;
};

export type Vaccination = {
  id: string;
  animalId: string;
  title: string;
  status: string | null;
  vaccinatedAt: string | null;
  expiresAt: string | null;
  vaccineBatch: string | null;
  vaccineSeries: string | null;
  vaccineExpiresAt: string | null;
  smsReminder: boolean;
  ownerReminderEnabled: boolean;
  notes: string | null;
  revaccinationTask?: {
    id: string;
    status: string;
    dueAt: string | null;
    assigneeId: string | null;
    assigneeRoleCode: string | null;
    title: string;
  } | null;
  createdAt: string;
  updatedAt: string;
};

export type WeightMutationInput = {
  weightKg: number;
  measuredAt?: string;
};

export type VaccinationMutationInput = {
  title: string;
  status?: string | null;
  vaccinatedAt?: string | null;
  expiresAt?: string | null;
  vaccineBatch?: string | null;
  vaccineSeries?: string | null;
  vaccineExpiresAt?: string | null;
  smsReminder?: boolean;
  ownerReminderEnabled?: boolean;
  notes?: string | null;
  createRevaccinationTask?: boolean;
  revaccinationAssigneeId?: string | null;
  revaccinationAssigneeRoleCode?: string | null;
};
