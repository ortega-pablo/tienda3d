import { Controller, Get } from '@nestjs/common';
import { Public } from '@/common/decorators/public.decorator';
import { PrismaService } from '@/common/prisma/prisma.service';

interface HealthResponse {
  status: 'ok' | 'degraded';
  db: { up: boolean; latencyMs: number | null };
  uptime: number;
  version: string;
  timestamp: string;
}

@Controller()
export class HealthController {
  private readonly version = process.env.npm_package_version ?? 'dev';

  constructor(private readonly prisma: PrismaService) {}

  @Public()
  @Get('health')
  async health(): Promise<HealthResponse> {
    const start = Date.now();
    let dbUp = false;
    let latency: number | null = null;
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      dbUp = true;
      latency = Date.now() - start;
    } catch {
      dbUp = false;
    }
    return {
      status: dbUp ? 'ok' : 'degraded',
      db: { up: dbUp, latencyMs: latency },
      uptime: Math.floor(process.uptime()),
      version: this.version,
      timestamp: new Date().toISOString(),
    };
  }
}
