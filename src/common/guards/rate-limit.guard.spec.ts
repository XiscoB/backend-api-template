import { Test, TestingModule } from '@nestjs/testing';
import { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { RateLimitGuard } from './rate-limit.guard';
import { RATE_LIMITER } from '../rate-limit/rate-limiter.interface';
import { IdentityService } from '../../modules/identity/identity.service';
import { RedisService } from '../../infrastructure/redis/redis.service';
import { RateLimiterUnavailableError } from '../rate-limit/resilient-rate-limiter';
import type Redis from 'ioredis';

/**
 * Subset of Redis client methods used by the RateLimitGuard.
 * Used for test mocks.
 */
type MockRedisClient = Pick<Redis, 'get' | 'ttl'>;

/**
 * Mock response interface for testing header emission.
 */
interface MockResponse {
  setHeader: jest.Mock;
}

/**
 * Mock request interface for testing.
 */
interface MockRequest {
  ip: string;
  user?: { sub?: string; id?: string };
}

/**
 * Creates a typed mock Redis client for testing.
 */
function createMockRedisClient(overrides: { get?: jest.Mock; ttl?: jest.Mock }): MockRedisClient {
  return {
    get: overrides.get ?? jest.fn().mockResolvedValue(null),
    ttl: overrides.ttl ?? jest.fn().mockResolvedValue(-2),
  } as MockRedisClient;
}

/**
 * Unit tests for RateLimitGuard
 *
 * These tests verify:
 * 1. Conditional header emission logic (shouldEmitHeaders)
 * 2. Safe handling of Redis metadata queries (getHeaderMetadata)
 * 3. Proper behavior across driver configurations
 *
 * All tests use mocks - no Redis or HTTP required.
 */
describe('RateLimitGuard', () => {
  let guard: RateLimitGuard;
  let mockReflector: { getAllAndOverride: jest.Mock };
  let mockRateLimiter: { consume: jest.Mock };
  let mockIdentityService: { getIdentityByExternalUserId: jest.Mock };
  let mockConfigService: { get: jest.Mock };
  let mockRedisService: {
    isHealthy: jest.Mock;
    getClient: jest.Mock<MockRedisClient>;
    buildKey: jest.Mock;
  };

  // Helper to create mock execution context
  const createMockContext = (
    ip = '127.0.0.1',
  ): ExecutionContext & { getMockResponse: () => MockResponse } => {
    const mockResponse: MockResponse = {
      setHeader: jest.fn(),
    };
    const mockRequest: MockRequest = {
      ip,
      user: undefined,
    };

    const context = {
      switchToHttp: (): {
        getRequest: () => MockRequest;
        getResponse: () => MockResponse;
        getNext: () => jest.Mock;
      } => ({
        getRequest: (): MockRequest => mockRequest,
        getResponse: (): MockResponse => mockResponse,
        getNext: jest.fn(),
      }),
      getHandler: () => jest.fn(),
      getClass: () => jest.fn(),
      getArgs: jest.fn(),
      getArgByIndex: jest.fn(),
      switchToRpc: jest.fn(),
      switchToWs: jest.fn(),
      getType: jest.fn().mockReturnValue('http'),
      getMockResponse: (): MockResponse => mockResponse,
    } as ExecutionContext & { getMockResponse: () => MockResponse };

    return context;
  };

  beforeEach(async () => {
    // Create mocks
    mockReflector = {
      getAllAndOverride: jest.fn(),
    };

    mockRateLimiter = {
      consume: jest.fn().mockResolvedValue(true),
    };

    mockIdentityService = {
      getIdentityByExternalUserId: jest.fn(),
    };

    mockConfigService = {
      get: jest.fn(),
    };

    mockRedisService = {
      isHealthy: jest.fn(),
      getClient: jest.fn<MockRedisClient, []>(),
      buildKey: jest.fn((feature, key) => `test:${feature}:${key}`),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RateLimitGuard,
        { provide: Reflector, useValue: mockReflector },
        { provide: RATE_LIMITER, useValue: mockRateLimiter },
        { provide: IdentityService, useValue: mockIdentityService },
        { provide: ConfigService, useValue: mockConfigService },
        { provide: RedisService, useValue: mockRedisService },
      ],
    }).compile();

    guard = module.get<RateLimitGuard>(RateLimitGuard);
  });

  describe('Header Emission Logic (shouldEmitHeaders)', () => {
    it('should NOT emit headers when RATE_LIMIT_DRIVER=memory', async () => {
      // Arrange
      mockConfigService.get.mockReturnValue('memory');
      mockReflector.getAllAndOverride.mockReturnValue('rl-public-flexible');
      const context = createMockContext();

      // Act
      await guard.canActivate(context);

      // Assert - setHeader should not be called
      const response = context.getMockResponse();
      expect(response.setHeader).not.toHaveBeenCalled();
    });

    it('should NOT emit headers when RATE_LIMIT_DRIVER=redis but Redis is unhealthy', async () => {
      // Arrange
      mockConfigService.get.mockReturnValue('redis');
      mockRedisService.isHealthy.mockReturnValue(false);
      mockReflector.getAllAndOverride.mockReturnValue('rl-public-flexible');
      const context = createMockContext('rl-public-flexible');

      // Act
      await guard.canActivate(context);

      // Assert
      const response = context.getMockResponse();
      expect(response.setHeader).not.toHaveBeenCalled();
    });

    it('should emit headers when RATE_LIMIT_DRIVER=redis and Redis is healthy', async () => {
      // Arrange
      mockConfigService.get.mockReturnValue('redis');
      mockRedisService.isHealthy.mockReturnValue(true);
      mockReflector.getAllAndOverride.mockReturnValue('rl-public-flexible');

      const mockClient = createMockRedisClient({
        get: jest.fn().mockResolvedValue('5'),
        ttl: jest.fn().mockResolvedValue(30),
      });
      mockRedisService.getClient.mockReturnValue(mockClient);

      const context = createMockContext('rl-public-flexible');

      // Act
      await guard.canActivate(context);

      // Assert
      const response = context.getMockResponse();
      expect(response.setHeader).toHaveBeenCalledWith('X-RateLimit-Limit', 300);
      expect(response.setHeader).toHaveBeenCalledWith('X-RateLimit-Remaining', expect.any(Number));
      expect(response.setHeader).toHaveBeenCalledWith('X-RateLimit-Reset', expect.any(Number));
    });
  });

  describe('Metadata Query Safety (getHeaderMetadata)', () => {
    beforeEach(() => {
      // Setup for Redis driver
      mockConfigService.get.mockReturnValue('redis');
      mockRedisService.isHealthy.mockReturnValue(true);
      mockReflector.getAllAndOverride.mockReturnValue('rl-public-flexible');
    });

    it('should suppress headers when Redis client throws an error', async () => {
      // Arrange
      const mockClient = createMockRedisClient({
        get: jest.fn().mockRejectedValue(new Error('Connection refused')),
        ttl: jest.fn().mockRejectedValue(new Error('Connection refused')),
      });
      mockRedisService.getClient.mockReturnValue(mockClient);

      const context = createMockContext('rl-public-flexible');

      // Act
      await guard.canActivate(context);

      // Assert - headers suppressed due to error
      const response = context.getMockResponse();
      expect(response.setHeader).not.toHaveBeenCalled();
    });

    it('should handle negative TTL values safely', async () => {
      // Arrange - TTL returns -1 (no TTL) or -2 (key doesn't exist)
      const mockClient = createMockRedisClient({
        get: jest.fn().mockResolvedValue('10'),
        ttl: jest.fn().mockResolvedValue(-1),
      });
      mockRedisService.getClient.mockReturnValue(mockClient);

      const context = createMockContext('rl-public-flexible');

      // Act - should not throw
      await guard.canActivate(context);

      // Assert - headers emitted with safe values
      const response = context.getMockResponse();
      expect(response.setHeader).toHaveBeenCalledWith('X-RateLimit-Limit', 300);
      // Remaining should be calculated correctly
      expect(response.setHeader).toHaveBeenCalledWith('X-RateLimit-Remaining', 290);
    });

    it('should handle null count from Redis (key does not exist)', async () => {
      // Arrange
      const mockClient = createMockRedisClient({
        get: jest.fn().mockResolvedValue(null),
        ttl: jest.fn().mockResolvedValue(-2),
      });
      mockRedisService.getClient.mockReturnValue(mockClient);

      const context = createMockContext('rl-public-flexible');

      // Act
      await guard.canActivate(context);

      // Assert - count defaults to 0, remaining = limit
      const response = context.getMockResponse();
      expect(response.setHeader).toHaveBeenCalledWith('X-RateLimit-Remaining', 300);
    });
  });

  describe('Guard without RedisService (Memory-only)', () => {
    it('should function correctly without RedisService injected', async () => {
      // Create guard without RedisService
      const moduleWithoutRedis: TestingModule = await Test.createTestingModule({
        providers: [
          RateLimitGuard,
          { provide: Reflector, useValue: mockReflector },
          { provide: RATE_LIMITER, useValue: mockRateLimiter },
          { provide: IdentityService, useValue: mockIdentityService },
          { provide: ConfigService, useValue: mockConfigService },
          // No RedisService provided
        ],
      }).compile();

      const guardWithoutRedis = moduleWithoutRedis.get<RateLimitGuard>(RateLimitGuard);

      // Arrange
      mockConfigService.get.mockReturnValue('memory');
      mockReflector.getAllAndOverride.mockReturnValue('rl-public-flexible');
      const context = createMockContext('rl-public-flexible');

      // Act - should not throw
      const result = await guardWithoutRedis.canActivate(context);

      // Assert
      expect(result).toBe(true);
      const response = context.getMockResponse();
      expect(response.setHeader).not.toHaveBeenCalled();
    });
  });

  describe('Undecorated Endpoints', () => {
    it('should skip rate limiting for endpoints without @RateLimit decorator', async () => {
      // Arrange - no decorator metadata
      mockReflector.getAllAndOverride.mockReturnValue(undefined);
      const context = createMockContext();

      // Act
      const result = await guard.canActivate(context);

      // Assert
      expect(result).toBe(true);
      expect(mockRateLimiter.consume).not.toHaveBeenCalled();
    });
  });

  describe('Fail-Closed Safety', () => {
    it('should deny with 429 when limiter reports unavailable protection', async () => {
      mockReflector.getAllAndOverride.mockReturnValue('rl-public-flexible');
      mockRateLimiter.consume.mockRejectedValue(
        new RateLimiterUnavailableError({
          mode: 'memory_fallback',
          driver: 'redis',
          reason: 'double_backend_failure',
          backendError: 'memory failure',
        }),
      );

      const context = createMockContext();

      await expect(guard.canActivate(context)).rejects.toMatchObject({
        status: 429,
      });
    });
  });

  describe('User Scope Identity Ownership', () => {
    it('uses resolved internal identity id (not JWT sub) for user-scoped buckets', async () => {
      mockReflector.getAllAndOverride.mockReturnValue('rl-auth-semi-strict');
      mockIdentityService.getIdentityByExternalUserId.mockResolvedValue({ id: 'identity-777' });

      const context = createMockContext();
      const request = context.switchToHttp().getRequest<MockRequest>();
      request.user = { sub: 'jwt-sub-777' };

      await guard.canActivate(context);

      expect(mockRateLimiter.consume).toHaveBeenCalledWith(
        expect.objectContaining({ key: 'user:rl-auth-semi-strict:identity-777' }),
      );
    });

    it('denies user-scoped endpoint when authenticated identity is missing', async () => {
      mockReflector.getAllAndOverride.mockReturnValue('rl-auth-semi-strict');
      mockIdentityService.getIdentityByExternalUserId.mockResolvedValue(null);

      const context = createMockContext();
      const request = context.switchToHttp().getRequest<MockRequest>();
      request.user = { sub: 'jwt-sub-missing-identity' };

      await expect(guard.canActivate(context)).rejects.toMatchObject({
        response: {
          code: 'RATE_LIMIT_NO_IDENTITY',
        },
      });
      expect(mockRateLimiter.consume).not.toHaveBeenCalled();
    });

    it('denies user-scoped endpoint when request has no authenticated principal', async () => {
      mockReflector.getAllAndOverride.mockReturnValue('rl-auth-semi-strict');

      const context = createMockContext();

      await expect(guard.canActivate(context)).rejects.toMatchObject({
        response: {
          code: 'RATE_LIMIT_NO_IDENTITY',
        },
      });
      expect(mockRateLimiter.consume).not.toHaveBeenCalled();
    });
  });
});
