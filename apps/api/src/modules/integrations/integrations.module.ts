import { Module } from '@nestjs/common';
import { ArcaService } from './arca/arca.service';
import { IntegrationsController } from './integrations.controller';
import { MeliService } from './meli/meli.service';
import { WhatsappService } from './whatsapp/whatsapp.service';

@Module({
  controllers: [IntegrationsController],
  providers: [MeliService, ArcaService, WhatsappService],
  exports: [MeliService, ArcaService, WhatsappService],
})
export class IntegrationsModule {}
