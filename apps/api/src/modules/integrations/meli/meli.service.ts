import { Injectable, Logger, NotImplementedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { IntegrationDisabledError, type IntegrationStatus } from '../integration.types';

@Injectable()
export class MeliService {
  private readonly logger = new Logger(MeliService.name);

  constructor(private readonly config: ConfigService) {}

  status(): IntegrationStatus {
    return {
      key: 'meli',
      label: 'MercadoLibre',
      enabled: this.isEnabled(),
      configured: Boolean(
        this.config.get<string>('MELI_CLIENT_ID') &&
          this.config.get<string>('MELI_CLIENT_SECRET'),
      ),
      notes:
        'Stub. Cuando esté implementado: sync de publicaciones, precios y órdenes desde MELI.',
    };
  }

  /** Sync ML listings — currently a stub. */
  async syncListings(): Promise<{ synced: number }> {
    if (!this.isEnabled()) throw new IntegrationDisabledError('MercadoLibre');
    this.logger.warn('MeliService.syncListings called but integration is not implemented yet');
    throw new NotImplementedException('Integración MELI pendiente');
  }

  /** Push price updates to ML for a product. */
  async pushPrice(_productId: string, _price: number): Promise<void> {
    if (!this.isEnabled()) throw new IntegrationDisabledError('MercadoLibre');
    throw new NotImplementedException('Integración MELI pendiente');
  }

  private isEnabled(): boolean {
    return this.config.get<string>('INTEGRATION_MELI_ENABLED') === 'true';
  }
}
