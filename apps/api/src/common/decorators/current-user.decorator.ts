import { ExecutionContext, createParamDecorator } from '@nestjs/common';
import type { Request } from 'express';
import type { AccessPayload } from '@/modules/auth/auth.service';

export const CurrentUser = createParamDecorator(
  (_: unknown, ctx: ExecutionContext): AccessPayload | undefined => {
    const req = ctx.switchToHttp().getRequest<Request & { user?: AccessPayload }>();
    return req.user;
  },
);
