import { SetMetadata } from '@nestjs/common';

export const PERMISSIONS_KEY = 'requiredPermissions';

/**
 * Restrict an endpoint to roles that have ALL of the given permission keys.
 * Example: @Permissions('product:write')
 */
export const Permissions = (...keys: string[]): MethodDecorator & ClassDecorator =>
  SetMetadata(PERMISSIONS_KEY, keys);
