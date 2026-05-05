import {
  Body,
  Controller,
  Get,
  HttpCode,
  Post,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { z } from 'zod';
import { CurrentUser } from '@/common/decorators/current-user.decorator';
import { Public } from '@/common/decorators/public.decorator';
import { ZodValidation } from '@/common/pipes/zod-validation.pipe';
import { JwtAuthGuard } from '@/common/guards/jwt-auth.guard';
import { AuthService, type AuthenticatedUser, type AccessPayload } from './auth.service';
import { REFRESH_COOKIE, clearAuthCookies, setAuthCookies } from './auth.cookies';

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
});

@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly config: ConfigService,
  ) {}

  private get isProd(): boolean {
    return this.config.get<string>('NODE_ENV') === 'production';
  }

  @Public()
  @Throttle({ auth: { limit: 10, ttl: 60_000 } })
  @Post('login')
  @HttpCode(200)
  async login(
    @Body(ZodValidation(loginSchema)) body: z.infer<typeof loginSchema>,
    @Res({ passthrough: true }) res: Response,
  ): Promise<{ user: AuthenticatedUser }> {
    const result = await this.auth.login(body.email, body.password);
    setAuthCookies(res, result, this.isProd);
    return { user: result.user };
  }

  @Public()
  @Throttle({ auth: { limit: 30, ttl: 60_000 } })
  @Post('refresh')
  @HttpCode(200)
  async refresh(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<{ ok: true }> {
    const cookies = (req as Request & { cookies?: Record<string, string> }).cookies;
    const refresh = cookies?.[REFRESH_COOKIE];
    if (!refresh) throw new UnauthorizedException('Sin refresh token');
    const tokens = await this.auth.refresh(refresh);
    setAuthCookies(res, tokens, this.isProd);
    return { ok: true };
  }

  @Public()
  @Post('logout')
  @HttpCode(204)
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response): Promise<void> {
    const cookies = (req as Request & { cookies?: Record<string, string> }).cookies;
    await this.auth.logout(cookies?.[REFRESH_COOKIE]);
    clearAuthCookies(res);
  }

  @UseGuards(JwtAuthGuard)
  @Get('me')
  async me(@CurrentUser() user: AccessPayload): Promise<AuthenticatedUser> {
    return this.auth.getCurrentUser(user.sub);
  }
}

