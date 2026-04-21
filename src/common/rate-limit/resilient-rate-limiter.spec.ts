import { AppConfigService } from '../../config/app-config.service';
import { RateLimiterUnavailableError, ResilientRateLimiter } from './resilient-rate-limiter';

type RateLimitConfig = {
  driver: 'memory' | 'redis';
  fallbackEnabled: boolean;
  memoryTtlSeconds: number;
  memoryMaxEntries: number;
  probeCooldownMs: number;
  cleanupIntervalMs: number;
};

type MockRedisClient = {
  incr: jest.MockedFunction<(key: string) => Promise<number>>;
  expire: jest.MockedFunction<(key: string, seconds: number) => Promise<number>>;
};

function createConfig(overrides?: Partial<RateLimitConfig>): AppConfigService {
  const config: RateLimitConfig = {
    driver: 'redis',
    fallbackEnabled: true,
    memoryTtlSeconds: 1,
    memoryMaxEntries: 100,
    probeCooldownMs: 1000,
    cleanupIntervalMs: 500,
    ...overrides,
  };

  return {
    get rateLimitDriver(): 'memory' | 'redis' {
      return config.driver;
    },
    get rateLimitFallbackEnabled(): boolean {
      return config.fallbackEnabled;
    },
    get rateLimitFallbackMemoryTtlSeconds(): number {
      return config.memoryTtlSeconds;
    },
    get rateLimitFallbackMemoryMaxEntries(): number {
      return config.memoryMaxEntries;
    },
    get rateLimitFallbackProbeCooldownMs(): number {
      return config.probeCooldownMs;
    },
    get rateLimitFallbackCleanupIntervalMs(): number {
      return config.cleanupIntervalMs;
    },
  } as AppConfigService;
}

function createRedisService(overrides?: { healthy?: boolean; incr?: MockRedisClient['incr'] }): {
  isHealthy: jest.MockedFunction<() => boolean>;
  getClient: jest.MockedFunction<() => MockRedisClient>;
  buildKey: jest.MockedFunction<(feature: string, key: string) => string>;
} {
  const incrMock = overrides?.incr ?? jest.fn().mockResolvedValue(1);
  const expireMock: MockRedisClient['expire'] = jest.fn().mockResolvedValue(1);

  return {
    isHealthy: jest.fn().mockReturnValue(overrides?.healthy ?? true),
    getClient: jest.fn().mockReturnValue({
      incr: incrMock,
      expire: expireMock,
    }),
    buildKey: jest.fn((feature: string, key: string) => `${feature}:${key}`),
  };
}

describe('ResilientRateLimiter', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-02-20T00:00:00.000Z'));
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it('boots in memory fallback mode when redis is unhealthy at startup', async () => {
    const redisService = createRedisService({ healthy: false });
    const limiter = new ResilientRateLimiter(createConfig());
    Object.defineProperty(limiter, 'redisService', { value: redisService });

    limiter.onModuleInit();

    await expect(limiter.consume({ key: 'user-1', limit: 1, windowSeconds: 10 })).resolves.toBe(
      true,
    );
    await expect(limiter.consume({ key: 'user-1', limit: 1, windowSeconds: 10 })).resolves.toBe(
      false,
    );
  });

  it('does not probe redis on every fallback request before cooldown', async () => {
    const failingIncr: MockRedisClient['incr'] = jest
      .fn()
      .mockRejectedValue(new Error('redis down'));
    const redisService = createRedisService({ healthy: true, incr: failingIncr });
    const limiter = new ResilientRateLimiter(createConfig({ probeCooldownMs: 5000 }));
    Object.defineProperty(limiter, 'redisService', { value: redisService });

    limiter.onModuleInit();

    await expect(limiter.consume({ key: 'ip-1', limit: 10, windowSeconds: 10 })).resolves.toBe(
      true,
    );
    await expect(limiter.consume({ key: 'ip-2', limit: 10, windowSeconds: 10 })).resolves.toBe(
      true,
    );
    await expect(limiter.consume({ key: 'ip-3', limit: 10, windowSeconds: 10 })).resolves.toBe(
      true,
    );

    expect(failingIncr).toHaveBeenCalledTimes(1);
  });

  it('restores redis mode when cooldown probe succeeds', async () => {
    const redisIncr: MockRedisClient['incr'] = jest
      .fn()
      .mockRejectedValueOnce(new Error('temporary redis failure'))
      .mockResolvedValueOnce(1)
      .mockResolvedValueOnce(2);
    const redisService = createRedisService({ healthy: true, incr: redisIncr });
    const limiter = new ResilientRateLimiter(createConfig({ probeCooldownMs: 1000 }));
    Object.defineProperty(limiter, 'redisService', { value: redisService });

    limiter.onModuleInit();

    await expect(limiter.consume({ key: 'key-a', limit: 10, windowSeconds: 10 })).resolves.toBe(
      true,
    );

    jest.advanceTimersByTime(1000);

    await expect(limiter.consume({ key: 'key-b', limit: 10, windowSeconds: 10 })).resolves.toBe(
      true,
    );
    await expect(limiter.consume({ key: 'key-c', limit: 10, windowSeconds: 10 })).resolves.toBe(
      true,
    );

    expect(redisIncr).toHaveBeenCalledTimes(3);
  });

  it('fails closed with 429 when redis and memory both fail in same request', async () => {
    const redisIncr: MockRedisClient['incr'] = jest.fn().mockRejectedValue(new Error('redis down'));
    const redisService = createRedisService({ healthy: true, incr: redisIncr });
    const limiter = new ResilientRateLimiter(createConfig());
    Object.defineProperty(limiter, 'redisService', { value: redisService });

    limiter.onModuleInit();

    const memoryLimiterRef = {
      consume: jest
        .fn<Promise<boolean>, [{ key: string; limit: number; windowSeconds: number }]>()
        .mockRejectedValue(new Error('memory failure')),
    };

    Object.defineProperty(limiter, 'memoryRateLimiter', {
      value: memoryLimiterRef,
    });

    await expect(limiter.consume({ key: 'x', limit: 1, windowSeconds: 10 })).rejects.toBeInstanceOf(
      RateLimiterUnavailableError,
    );

    await expect(limiter.consume({ key: 'x', limit: 1, windowSeconds: 10 })).rejects.toMatchObject({
      status: 429,
    });
  });

  it('starts cleanup timer once and clears it on destroy', () => {
    const redisService = createRedisService({ healthy: true });
    const limiter = new ResilientRateLimiter(createConfig());
    Object.defineProperty(limiter, 'redisService', { value: redisService });

    const setIntervalSpy = jest.spyOn(global, 'setInterval');
    const clearIntervalSpy = jest.spyOn(global, 'clearInterval');

    limiter.onModuleInit();
    limiter.onModuleInit();
    limiter.onModuleDestroy();

    expect(setIntervalSpy).toHaveBeenCalledTimes(1);
    expect(clearIntervalSpy).toHaveBeenCalledTimes(1);
  });
});
