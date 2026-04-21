import { RedisRateLimiter } from './redis-rate-limiter';

type RedisClientMock = {
  incr: jest.MockedFunction<(key: string) => Promise<number>>;
  expire: jest.MockedFunction<(key: string, seconds: number) => Promise<number>>;
  ping: jest.MockedFunction<() => Promise<string>>;
};

type RedisServiceMock = {
  getClient: jest.MockedFunction<() => RedisClientMock>;
  buildKey: jest.MockedFunction<(feature: string, key: string) => string>;
};

describe('RedisRateLimiter', () => {
  let redisClient: RedisClientMock;
  let redisService: RedisServiceMock;
  let limiter: RedisRateLimiter;

  beforeEach(() => {
    redisClient = {
      incr: jest.fn(),
      expire: jest.fn().mockResolvedValue(1),
      ping: jest.fn().mockResolvedValue('PONG'),
    };
    redisService = {
      getClient: jest.fn().mockReturnValue(redisClient),
      buildKey: jest.fn((feature, key) => `${feature}:${key}`),
    };

    limiter = new RedisRateLimiter(redisService as never);
  });

  it('allows requests up to exact limit and rejects first request above limit', async () => {
    redisClient.incr
      .mockResolvedValueOnce(1)
      .mockResolvedValueOnce(2)
      .mockResolvedValueOnce(3)
      .mockResolvedValueOnce(4);

    await expect(limiter.consume({ key: 'user-a', limit: 3, windowSeconds: 60 })).resolves.toBe(
      true,
    );
    await expect(limiter.consume({ key: 'user-a', limit: 3, windowSeconds: 60 })).resolves.toBe(
      true,
    );
    await expect(limiter.consume({ key: 'user-a', limit: 3, windowSeconds: 60 })).resolves.toBe(
      true,
    );
    await expect(limiter.consume({ key: 'user-a', limit: 3, windowSeconds: 60 })).resolves.toBe(
      false,
    );
  });

  it('sets window expiry only on first request in the window', async () => {
    redisClient.incr.mockResolvedValueOnce(1).mockResolvedValueOnce(2);

    await limiter.consume({ key: 'user-b', limit: 10, windowSeconds: 30 });
    await limiter.consume({ key: 'user-b', limit: 10, windowSeconds: 30 });

    expect(redisClient.expire).toHaveBeenCalledTimes(1);
    expect(redisClient.expire).toHaveBeenCalledWith('ratelimit:user-b', 30);
  });

  it('behaves deterministically under rapid sequential calls', async () => {
    redisClient.incr
      .mockResolvedValueOnce(1)
      .mockResolvedValueOnce(2)
      .mockResolvedValueOnce(3)
      .mockResolvedValueOnce(4)
      .mockResolvedValueOnce(5);

    const results = await Promise.all([
      limiter.consume({ key: 'rapid', limit: 4, windowSeconds: 10 }),
      limiter.consume({ key: 'rapid', limit: 4, windowSeconds: 10 }),
      limiter.consume({ key: 'rapid', limit: 4, windowSeconds: 10 }),
      limiter.consume({ key: 'rapid', limit: 4, windowSeconds: 10 }),
      limiter.consume({ key: 'rapid', limit: 4, windowSeconds: 10 }),
    ]);

    expect(results).toEqual([true, true, true, true, false]);
  });

  it('throws explicitly when external store is unavailable (no silent fail-open)', async () => {
    redisClient.incr.mockRejectedValue(new Error('redis unavailable'));

    await expect(limiter.consume({ key: 'user-c', limit: 2, windowSeconds: 20 })).rejects.toThrow(
      'redis unavailable',
    );
  });
});
