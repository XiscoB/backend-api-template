/**
 * Health status enum.
 */
export enum HealthStatus {
  HEALTHY = 'healthy',
  DEGRADED = 'degraded',
  UNHEALTHY = 'unhealthy',
}

/**
 * Individual component health.
 */
export interface ComponentHealth {
  status: HealthStatus;
  latency?: number;
  message?: string;
}

/**
 * Health check response DTO.
 */
export class HealthResponseDto {
  /** Overall health status */
  status!: HealthStatus;

  /** ISO timestamp of the health check */
  timestamp!: string;

  /** Health of individual components */
  components!: Record<string, ComponentHealth>;
}
