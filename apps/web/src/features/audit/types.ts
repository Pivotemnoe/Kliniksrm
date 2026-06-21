export type AuditActor = {
  id: string;
  fullName: string;
  position: string | null;
  status: string;
};

export type AuditLogItem = {
  id: string;
  actorId: string | null;
  action: string;
  entityType: string;
  entityId: string | null;
  metadata: unknown;
  ipAddress: string | null;
  createdAt: string;
  actor?: AuditActor | null;
};
