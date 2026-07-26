export type LicenseStatus = 'COMPATIBILITY' | 'UNLICENSED' | 'VALID' | 'EXPIRED' | 'INVALID' | 'MISMATCH';
export type SupportRequestStatus = 'NEW' | 'IN_PROGRESS' | 'WAITING_CLINIC' | 'RESOLVED' | 'CLOSED';
export type SupportRequestPriority = 'NORMAL' | 'HIGH' | 'CRITICAL';
export type AcceptanceStatus = 'PREPARED' | 'VERIFIED' | 'ACCEPTED' | 'REJECTED';

export type SupportRequest = {
  id: string;
  status: SupportRequestStatus;
  priority: SupportRequestPriority;
  subject: string;
  message: string;
  contact: string | null;
  diagnosticsIncluded: boolean;
  diagnosticSha256: string | null;
  externalReference: string | null;
  response: string | null;
  createdAt: string;
  updatedAt: string;
  createdBy: { id: string; fullName: string } | null;
  handledBy: { id: string; fullName: string } | null;
};

export type ServerAcceptance = {
  id: string;
  status: AcceptanceStatus;
  releaseVersion: string;
  releaseRevision: string | null;
  sourceServer: string | null;
  targetServer: string | null;
  archiveName: string;
  archiveSha256: string;
  notes: string | null;
  acceptedAt: string | null;
  createdAt: string;
  preparedBy: { id: string; fullName: string } | null;
  acceptedBy: { id: string; fullName: string } | null;
};

export type SupportOverview = {
  installation: { installationId: string; serverFingerprint: string | null; createdAt: string };
  license: {
    mode: 'compatibility' | 'advisory' | 'required';
    status: LicenseStatus;
    message: string;
    licenseId: string | null;
    customer: string | null;
    validUntil: string | null;
    features: string[];
    maxOffices: number | null;
    enforcementActive: boolean;
  };
  supportContact: { url: string | null; email: string | null };
  requests: SupportRequest[];
  acceptances: ServerAcceptance[];
  rules: {
    diagnosticsRequireDirectorConsent: boolean;
    diagnosticsContainPersonalData: boolean;
    programCodeEditableByClinic: boolean;
    clinicSettingsEditableByDirector: boolean;
    oldServerMustRemainIntactUntilAcceptance: boolean;
  };
};
