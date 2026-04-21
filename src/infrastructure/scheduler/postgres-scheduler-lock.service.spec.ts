import { PostgresSchedulerLockService } from './postgres-scheduler-lock.service';

type SchedulerLockRecord = {
  jobName: string;
  lockedBy: string;
  lockedAt: Date;
  expiresAt: Date;
  lastRunAt?: Date | null;
};

type TransactionClient = {
  schedulerLock: {
    findUnique: jest.Mock;
    update: jest.Mock;
    create: jest.Mock;
  };
};

type PrismaMock = {
  $transaction: jest.Mock;
  schedulerLock: {
    updateMany: jest.Mock;
    update: jest.Mock;
    deleteMany: jest.Mock;
  };
};

describe('PostgresSchedulerLockService', () => {
  let service: PostgresSchedulerLockService;
  let prisma: PrismaMock;
  let tx: TransactionClient;

  beforeEach(() => {
    tx = {
      schedulerLock: {
        findUnique: jest.fn(),
        update: jest.fn(),
        create: jest.fn(),
      },
    };

    prisma = {
      $transaction: jest.fn(async (cb: (client: TransactionClient) => Promise<unknown>) => cb(tx)),
      schedulerLock: {
        updateMany: jest.fn(),
        update: jest.fn(),
        deleteMany: jest.fn(),
      },
    };

    service = new PostgresSchedulerLockService(prisma as never);
  });

  it('prevents double execution by denying lock when another instance holds non-expired lock', async () => {
    tx.schedulerLock.findUnique.mockResolvedValue({
      jobName: 'gdpr-cleanup',
      lockedBy: 'other-instance',
      lockedAt: new Date('2026-02-20T00:00:00.000Z'),
      expiresAt: new Date(Date.now() + 60_000),
    } as SchedulerLockRecord);

    const result = await service.acquireLock('gdpr-cleanup');

    expect(result.acquired).toBe(false);
    expect(result.reason).toMatch(/Lock held by other-instance/i);
    expect(tx.schedulerLock.update).not.toHaveBeenCalled();
  });

  it('acquires lock deterministically when existing lock is stale', async () => {
    tx.schedulerLock.findUnique.mockResolvedValue({
      jobName: 'report-job',
      lockedBy: 'crashed-instance',
      lockedAt: new Date('2026-02-19T00:00:00.000Z'),
      expiresAt: new Date(Date.now() - 1_000),
    } as SchedulerLockRecord);
    tx.schedulerLock.update.mockResolvedValue(undefined);

    const result = await service.acquireLock('report-job', 30_000);

    expect(result.acquired).toBe(true);
    expect(tx.schedulerLock.update).toHaveBeenCalledTimes(1);
  });

  it('releases lock only when current instance owns it', async () => {
    prisma.schedulerLock.updateMany.mockResolvedValue({ count: 1 });

    const released = await service.releaseLock('notifications-job');

    expect(released).toBe(true);
    expect(prisma.schedulerLock.updateMany).toHaveBeenCalledWith({
      where: {
        jobName: 'notifications-job',
        lockedBy: service.getInstanceId(),
      },
      data: {
        expiresAt: new Date(0),
      },
    });
  });

  it('keeps safety mechanism intact when lock release throws', async () => {
    prisma.schedulerLock.updateMany.mockRejectedValue(new Error('db unavailable'));

    const released = await service.releaseLock('critical-job');

    expect(released).toBe(false);
  });

  it('cleans only stale lock rows and reports deterministic count', async () => {
    prisma.schedulerLock.deleteMany.mockResolvedValue({ count: 2 });

    const cleaned = await service.cleanupStaleLocks();

    expect(cleaned).toBe(2);
    expect(prisma.schedulerLock.deleteMany).toHaveBeenCalledTimes(1);
  });
});
