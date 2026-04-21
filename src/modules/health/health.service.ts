import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { HealthResponseDto, HealthStatus, ComponentHealth } from './v1/dto/health-response.dto';

/**
 * Health service.
 *
 * Version-agnostic service that checks the health of various components.
 */
@Injectable()
export class HealthService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Check the overall health of the application.
   */
  async checkHealth(): Promise<HealthResponseDto> {
    const components: Record<string, ComponentHealth> = {};

    // Check database connectivity
    components.database = await this.checkDatabase();

    // Determine overall status
    const allHealthy = Object.values(components).every((c) => c.status === HealthStatus.HEALTHY);
    const anyDegraded = Object.values(components).some((c) => c.status === HealthStatus.DEGRADED);

    let status: HealthStatus;
    if (allHealthy) {
      status = HealthStatus.HEALTHY;
    } else if (anyDegraded) {
      status = HealthStatus.DEGRADED;
    } else {
      status = HealthStatus.UNHEALTHY;
    }

    return {
      status,
      timestamp: new Date().toISOString(),
      components,
    };
  }

  /**
   * Simple liveness check (is the process running?).
   */
  getLiveness(): { status: string } {
    return { status: 'ok' };
  }

  /**
   * Check database connectivity.
   */
  private async checkDatabase(): Promise<ComponentHealth> {
    const startTime = Date.now();

    try {
      await this.prisma.$queryRaw`SELECT 1`;
      const latency = Date.now() - startTime;

      return {
        status: HealthStatus.HEALTHY,
        latency,
      };
    } catch (error) {
      return {
        status: HealthStatus.UNHEALTHY,
        message: 'Database connection failed',
      };
    }
  }
}
