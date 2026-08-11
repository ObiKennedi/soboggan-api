import { SetMetadata } from '@nestjs/common';

export const LOG_ACTIVITY_KEY = 'logActivity';

export interface LogActivityOptions {
  action: string;
  entityType?: string;
}

/**
 * Tags a controller method for automatic activity logging.
 * Usage: @LogActivity({ action: 'ACCOUNT_CREATED', entityType: 'Account' })
 */
export const LogActivity = (options: LogActivityOptions) =>
  SetMetadata(LOG_ACTIVITY_KEY, options);
