import { Injectable, Logger, NotImplementedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { IntegrationDisabledError, type IntegrationStatus } from '../integration.types';

export interface InvoiceRequest {
  quoteId: string;
  invoiceType: 'A' | 'B' | 'C';
  total: number;
  iva?: number;
}

@Injectable()
export class ArcaService {
  private readonly logger = new Logger(ArcaService.name);

  constructor(private readonly config: ConfigService) {}

  status(): IntegrationStatus {
    return {
      key: 'arca',
      label: 'ARCA / AFIP',
      enabled: this.isEnabled(),
      configured: Boolean(
        this.config.get<string>('ARCA_CUIT') && this.config.get<string>('ARCA_CERT'),
      ),
      notes:
        'Stub. Cuando esté implementado: emisión de factura electrónica vía ARCA (ex AFIP).',
    };
  }

  /** Issue an electronic invoice — currently a stub. */
  async issueInvoice(_payload: InvoiceRequest): Promise<{ cae: string; expiresAt: Date }> {
    if (!this.isEnabled()) throw new IntegrationDisabledError('ARCA');
    this.logger.warn('ArcaService.issueInvoice called but integration is not implemented yet');
    throw new NotImplementedException('Integración ARCA pendiente');
  }

  private isEnabled(): boolean {
    return this.config.get<string>('INTEGRATION_ARCA_ENABLED') === 'true';
  }
}
