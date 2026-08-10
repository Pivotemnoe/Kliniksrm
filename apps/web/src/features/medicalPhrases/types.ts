export type MedicalPhraseSource = 'SYSTEM' | 'EMPLOYEE' | 'DIAGNOSIS_TEMPLATE';

export type MedicalPhrase = {
  id: string;
  field: string;
  category: string | null;
  title: string;
  text: string;
  species: string | null;
  diagnosis: string | null;
  source: MedicalPhraseSource;
  isActive: boolean;
  isAccepted: boolean;
  isPinned: boolean;
  isSuggested: boolean;
  dismissedAt: string | null;
  employee: {
    id: string;
    fullName: string;
    position: string | null;
  } | null;
  usageCount: number;
  lastUsedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type MedicalPhrasesListResponse = {
  items: MedicalPhrase[];
  assistantEnabled: boolean;
  suggestionThreshold: number;
};

export type MedicalPhraseAssistantSettings = {
  enabled: boolean;
  suggestionThreshold: number;
};

export type SavePersonalMedicalPhrasePayload = {
  field: string;
  title?: string;
  text: string;
  species?: string;
  diagnosis?: string;
  isPinned?: boolean;
};

export type PersonalMedicalPhraseAction = 'ACCEPT' | 'REJECT' | 'PIN' | 'UNPIN';

export type ListMedicalPhrasesQuery = {
  field?: string;
  species?: string;
  diagnosis?: string;
  search?: string;
};

export type ManageMedicalPhrasesQuery = ListMedicalPhrasesQuery & {
  limit?: number;
  offset?: number;
  source?: MedicalPhraseSource;
  isActive?: boolean;
};

export type UpsertMedicalPhrasePayload = {
  field: string;
  title: string;
  text: string;
  category?: string | null;
  species?: string | null;
  diagnosis?: string | null;
  source?: Exclude<MedicalPhraseSource, 'EMPLOYEE'>;
  isActive?: boolean;
};
