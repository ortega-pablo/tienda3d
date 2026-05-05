import { Controller, Get, UseGuards } from '@nestjs/common';
import { Permissions } from '@/common/decorators/permissions.decorator';
import { PermissionsGuard } from '@/common/guards/permissions.guard';
import { ArcaService } from './arca/arca.service';
import type { IntegrationStatus } from './integration.types';
import { MeliService } from './meli/meli.service';
import { WhatsappService } from './whatsapp/whatsapp.service';

@UseGuards(PermissionsGuard)
@Controller('integrations')
export class IntegrationsController {
  constructor(
    private readonly meli: MeliService,
    private readonly arca: ArcaService,
    private readonly whatsapp: WhatsappService,
  ) {}

  @Permissions('user:read')
  @Get()
  list(): IntegrationStatus[] {
    return [this.meli.status(), this.arca.status(), this.whatsapp.status()];
  }
}
