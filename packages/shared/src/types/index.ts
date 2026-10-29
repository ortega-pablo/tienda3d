export * from './costing';
export * from './pricing';
export * from './quotes';

export interface HealthResponse {
  status: 'ok';
  db: 'up' | 'down';
  timestamp: string;
}

export interface AuthenticatedUser {
  id: string;
  email: string;
  name: string;
  role: string;
  permissions: string[];
}
export * from './web-catalog';
export * from './web-orders';
export * from './web-quote-requests';
