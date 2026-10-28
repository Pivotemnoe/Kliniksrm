import { SetMetadata } from '@nestjs/common';
// A passive read/receipt may only shorten activity; it never bypasses session/role/trust checks.
export const PASSIVE_SESSION_ACTIVITY = 'auth:passive-session-activity';
export const AllowPassiveSessionActivity = () => SetMetadata(PASSIVE_SESSION_ACTIVITY, true);
