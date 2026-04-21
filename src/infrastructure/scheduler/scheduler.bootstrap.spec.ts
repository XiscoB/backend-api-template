import { AppConfigService } from '../../config/app-config.service';
import { SchedulerBootstrapService } from './scheduler.bootstrap';
import { SchedulerLockService } from './scheduler-lock.service';
import { Schedule, SchedulerMode } from './scheduler.types';

type LockServiceMock = {
  acquireLock: jest.MockedFunction<SchedulerLockService['acquireLock']>;
  releaseLock: jest.MockedFunction<SchedulerLockService['releaseLock']>;
  updateLastRunTime: jest.MockedFunction<SchedulerLockService['updateLastRunTime']>;
  getInstanceId: jest.MockedFunction<SchedulerLockService['getInstanceId']>;
  cleanupStaleLocks: jest.MockedFunction<SchedulerLockService['cleanupStaleLocks']>;
};

type ConfigMock = Pick<
  AppConfigService,
  'inAppSchedulerEnabled' | 'schedulerMode' | 'schedulerTimezone'
>;

const createConfig = (): ConfigMock => ({
  inAppSchedulerEnabled: false,
  schedulerMode: SchedulerMode.CRON,
  schedulerTimezone: 'UTC',
});

const getExecuteJob = (
  service: SchedulerBootstrapService,
): ((schedule: Schedule) => Promise<void>) => {
  const unknownExecute = Reflect.get(service as object, 'executeJob') as
    | ((schedule: Schedule) => Promise<void>)
    | undefined;
  if (!unknownExecute) {
    throw new Error('executeJob method not found');
  }
  return unknownExecute.bind(service);
};

describe('SchedulerBootstrapService', () => {
  let lockService: LockServiceMock;
  let service: SchedulerBootstrapService;

  beforeEach(() => {
    lockService = {
      acquireLock: jest.fn(),
      releaseLock: jest.fn(),
      updateLastRunTime: jest.fn().mockResolvedValue(undefined),
      getInstanceId: jest.fn().mockReturnValue('instance-1'),
      cleanupStaleLocks: jest.fn().mockResolvedValue(0),
    };

    service = new SchedulerBootstrapService(
      createConfig() as AppConfigService,
      lockService as SchedulerLockService,
      [],
    );

    Reflect.set(service as object, 'isRunning', true);
  });

  it('skips schedule execution when lock acquisition fails (prevents double run)', async () => {
    lockService.acquireLock.mockResolvedValue({
      acquired: false,
      lockId: 'instance-1',
      reason: 'held by other replica',
    });
    const firstJob = jest.fn<Promise<void>, []>().mockResolvedValue(undefined);
    const secondJob = jest.fn<Promise<void>, []>().mockResolvedValue(undefined);
    const schedule: Schedule = {
      name: 'every-minute',
      cron: '* * * * *',
      jobs: [firstJob, secondJob],
    };

    await getExecuteJob(service)(schedule);

    expect(firstJob).not.toHaveBeenCalled();
    expect(secondJob).not.toHaveBeenCalled();
    expect(lockService.releaseLock).not.toHaveBeenCalled();
  });

  it('always releases lock in finally even when one job throws', async () => {
    lockService.acquireLock.mockResolvedValue({ acquired: true, lockId: 'instance-1' });
    lockService.releaseLock.mockResolvedValue(true);

    const failingJob = jest.fn<Promise<void>, []>().mockRejectedValue(new Error('job failure'));
    const nextJob = jest.fn<Promise<void>, []>().mockResolvedValue(undefined);
    const schedule: Schedule = {
      name: 'daily',
      cron: '0 5 * * *',
      jobs: [failingJob, nextJob],
    };

    await getExecuteJob(service)(schedule);

    expect(failingJob).toHaveBeenCalledTimes(1);
    expect(nextJob).toHaveBeenCalledTimes(1);
    expect(lockService.updateLastRunTime).toHaveBeenCalledWith('daily');
    expect(lockService.releaseLock).toHaveBeenCalledWith('daily');
  });

  it('keeps idempotent lock lifecycle across rapid sequential invocations', async () => {
    // Simulates race-like back-to-back triggers with controlled lock outcomes.
    lockService.acquireLock
      .mockResolvedValueOnce({ acquired: true, lockId: 'instance-1' })
      .mockResolvedValueOnce({ acquired: false, lockId: 'instance-1', reason: 'already running' });
    lockService.releaseLock.mockResolvedValue(true);

    const job = jest.fn<Promise<void>, []>().mockResolvedValue(undefined);
    const schedule: Schedule = {
      name: 'integrity-monitor',
      cron: '*/5 * * * *',
      jobs: [job],
    };

    await getExecuteJob(service)(schedule);
    await getExecuteJob(service)(schedule);

    expect(job).toHaveBeenCalledTimes(1);
    expect(lockService.releaseLock).toHaveBeenCalledTimes(1);
  });
});
