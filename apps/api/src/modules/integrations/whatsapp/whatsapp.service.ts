import { Injectable, Logger, NotImplementedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { IntegrationDisabledError, type IntegrationStatus } from '../integration.types';

export interface WhatsAppMessage {
  to: string;
  template: string;
  variables?: Record<string, string>;
  attachmentUrl?: string;
}

@Injectable()
export class WhatsappService {
  private readonly logger = new Logger(WhatsappService.name);

  constructor(private readonly config: ConfigService) {}

  status(): IntegrationStatus {
    return {
      key: 'whatsapp',
      label: 'WhatsApp Business',
      enabled: this.isEnabled(),
      configured: Boolean(
        this.config.get<string>('WHATSAPP_PHONE_ID') &&
          this.config.get<string>('WHATSAPP_TOKEN'),
      ),
      notes:
        'Stub. Cuando esté implementado: envío de cotizaciones por WhatsApp Business API con plantillas.',
    };
  }

  async sendMessage(_message: WhatsAppMessage): Promise<{ messageId: string }> {
    if (!this.isEnabled()) throw new IntegrationDisabledError('WhatsApp');
    this.logger.warn('WhatsappService.sendMessage called but integration is not implemented yet');
    throw new NotImplementedException('Integración WhatsApp pendiente');
  }

  private isEnabled(): boolean {
    return this.config.get<string>('INTEGRATION_WHATSAPP_ENABLED') === 'true';
  }
}
