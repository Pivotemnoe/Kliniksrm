import { SetMetadata } from '@nestjs/common';

export const ALLOW_REMOTE_MUTATION_KEY = 'allowRemoteMutation';

/**
 * Allows a narrowly scoped personal action from a remote read-only session.
 * Clinical, warehouse, financial and administrative mutations must never use it.
 */
export const AllowRemoteMutation = () => SetMetadata(ALLOW_REMOTE_MUTATION_KEY, true);
