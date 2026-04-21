import { MemoryRateLimiter } from './memory-rate-limiter';

describe('MemoryRateLimiter', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-02-20T00:00:00.000Z'));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('enforces bounded capacity by evicting oldest bucket when full', async () => {
    const limiter = new MemoryRateLimiter({ maxEntries: 2, minimumTtlSeconds: 1 });

    await expect(limiter.consume({ key: 'k1', limit: 1, windowSeconds: 60 })).resolves.toBe(true);
    await expect(limiter.consume({ key: 'k2', limit: 1, windowSeconds: 60 })).resolves.toBe(true);
    await expect(limiter.consume({ key: 'k3', limit: 1, windowSeconds: 60 })).resolves.toBe(true);

    expect(limiter.getBucketCount()).toBe(2);

    await expect(limiter.consume({ key: 'k1', limit: 1, windowSeconds: 60 })).resolves.toBe(true);
  });

  it('cleans expired entries on access', async () => {
    const limiter = new MemoryRateLimiter({ maxEntries: 10, minimumTtlSeconds: 1 });

    await expect(limiter.consume({ key: 'alpha', limit: 3, windowSeconds: 1 })).resolves.toBe(true);
    expect(limiter.getBucketCount()).toBe(1);

    jest.advanceTimersByTime(1100);

    await expect(limiter.consume({ key: 'beta', limit: 3, windowSeconds: 1 })).resolves.toBe(true);
    expect(limiter.getBucketCount()).toBe(1);
  });

  it('cleanup removes expired entries deterministically', async () => {
    const limiter = new MemoryRateLimiter({ maxEntries: 10, minimumTtlSeconds: 1 });

    await expect(limiter.consume({ key: 'a', limit: 3, windowSeconds: 1 })).resolves.toBe(true);
    await expect(limiter.consume({ key: 'b', limit: 3, windowSeconds: 1 })).resolves.toBe(true);
    expect(limiter.getBucketCount()).toBe(2);

    jest.advanceTimersByTime(1100);
    limiter.cleanup();

    expect(limiter.getBucketCount()).toBe(0);
  });
});
