export type ClientPortalSummary = {
  access: {
    status: 'INVITED' | 'ENABLED';
    invitedAt: string | null;
    inviteExpiresAt: string | null;
    lastLoginAt: string | null;
  };
  owner: PortalOwner;
  appointments: PortalAppointment[];
  visits: PortalVisit[];
  files: PortalFile[];
  bills: PortalBill[];
  notifications: PortalNotification[];
  onlineRequests: PortalOnlineRequest[];
};

export type ClientPortalDeliveryChannel = 'TELEGRAM' | 'MAX' | 'SMS' | 'EMAIL' | 'LOCAL';

export type ClientPortalCodeRequestResponse = {
  ok: boolean;
  expiresAt: string;
  deliveryChannel: ClientPortalDeliveryChannel;
  debugCode?: string;
};

export type ClientPortalCodeVerifyResponse = {
  token: string;
  expiresAt: string;
};

export type PortalOwner = {
  id: string;
  fullName: string;
  phone: string | null;
  extraPhone: string | null;
  email: string | null;
  address: string | null;
  balance: string | number;
  animals: PortalAnimal[];
};

export type PortalAnimal = {
  id: string;
  nickname: string;
  species: string | null;
  breed: string | null;
  sex: 'MALE' | 'FEMALE' | 'UNKNOWN';
  birthDate: string | null;
  color: string | null;
  microchip: string | null;
  mark: string | null;
  isSterilized: boolean;
  status: string | null;
  weights: Array<{ id: string; weightKg: string | number; measuredAt: string }>;
  vaccinations: Array<{
    id: string;
    title: string;
    status: string | null;
    vaccinatedAt: string | null;
    expiresAt: string | null;
    vaccineBatch: string | null;
    vaccineSeries: string | null;
    vaccineExpiresAt: string | null;
  }>;
};

export type PortalAppointment = {
  id: string;
  startsAt: string;
  endsAt: string | null;
  status: string;
  animal: Pick<PortalAnimal, 'id' | 'nickname' | 'species'>;
  employee: { id: string; fullName: string; position: string | null } | null;
  room: { id: string; name: string } | null;
};

export type PortalVisit = {
  id: string;
  status: string;
  startedAt: string;
  completedAt: string | null;
  totalAmount: string | number;
  animal: Pick<PortalAnimal, 'id' | 'nickname' | 'species'>;
  employee: { id: string; fullName: string; position: string | null } | null;
  exam: {
    purpose: string | null;
    anamnesis: string | null;
    examination: string | null;
    symptoms: string | null;
    manipulations: string | null;
    weightKg: string | number | null;
    temperatureC: string | number | null;
  } | null;
  diagnoses: Array<{
    id: string;
    diagnosisType: string | null;
    title: string;
    description: string | null;
    status: string | null;
  }>;
  recommendation: { treatmentPlan: string | null; careNotes: string | null } | null;
  hospitalRecords: Array<{
    id: string;
    recordType: string;
    title: string;
    recordedAt: string;
    completedAt: string | null;
    temperatureC: string | number | null;
    value: string | null;
    performedBy: { id: string; fullName: string } | null;
  }>;
  laboratoryOrders: Array<{
    id: string;
    status: string;
    createdAt: string;
    items: Array<{
      id: string;
      title: string;
      code: string | null;
      status: string;
      resultValue: string | null;
      resultText: string | null;
      unit: string | null;
      referenceRange: string | null;
      completedAt: string | null;
    }>;
  }>;
  documents: Array<{ id: string; title: string; body: string | null; status: string; createdAt: string }>;
};

export type PortalFile = {
  id: string;
  animalId: string | null;
  animalName: string | null;
  fileName: string;
  mimeType: string | null;
  sizeBytes: number | null;
  archiveCategory: string | null;
  documentDate: string | null;
  sourceLabel: string | null;
  sourceCreatedAt: string;
};

export type PortalBill = {
  id: string;
  status: string;
  source: string;
  totalAmount: string | number;
  paidAmount: string | number;
  createdAt: string;
  animal: Pick<PortalAnimal, 'id' | 'nickname'> | null;
  items: Array<{ id: string; title: string; quantity: string | number; totalAmount: string | number }>;
};

export type PortalNotification = {
  id: string;
  channel: string;
  subject: string | null;
  body: string;
  status: string;
  scheduledAt: string;
  sentAt: string | null;
  createdAt: string;
};

export type PortalOnlineRequest = {
  id: string;
  status: string;
  preferredAt: string | null;
  comment: string | null;
  createdAt: string;
  animal: Pick<PortalAnimal, 'id' | 'nickname' | 'species'> | null;
  appointment: { id: string; startsAt: string; status: string } | null;
};

export type CreatePortalOnlineRequestInput = {
  animalId?: string;
  animalNickname?: string;
  animalSpecies?: string;
  animalBreed?: string;
  preferredAt?: string;
  comment?: string;
};
