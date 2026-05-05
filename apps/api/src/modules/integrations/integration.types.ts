/**
 * Common interfaces shared by external integrations.
 * Implementations live alongside each connector (meli, arca, whatsapp) so they
 * can be swapped or stubbed independently while the rest of the system depends
 * only on these shapes.
 */

export interface IntegrationStatus {
  key: string;
  label: string;
  enabled: boolean;
  configured: boolean;
  notes?: string;
}

export class IntegrationDisabledError extends Error {
  constructor(integration: string) {
    super(`Integración ${integration} no está habilitada`);
  }
}
