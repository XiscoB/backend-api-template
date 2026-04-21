/* eslint-disable @typescript-eslint/unbound-method */
import { Test, TestingModule } from '@nestjs/testing';
import { NotificationAlertsJob } from './notification-alerts.job';
import { NotificationAlertsService } from './notification-alerts.service';
import { NotificationAlertsResult } from './alerts.types';
import { AlertDeliveryService, RecipientGroup } from '../../../infrastructure/delivery';

describe('NotificationAlertsJob', () => {
  let job: NotificationAlertsJob;
  const runChecksMock = jest.fn<
    ReturnType<NotificationAlertsService['runChecks']>,
    Parameters<NotificationAlertsService['runChecks']>
  >();
  const sendAlertMock = jest.fn<
    ReturnType<AlertDeliveryService['sendAlert']>,
    Parameters<AlertDeliveryService['sendAlert']>
  >();

  const mockAlertsService: Pick<NotificationAlertsService, 'runChecks'> = {
    runChecks: runChecksMock,
  };

  const mockAlertDeliveryService: Pick<AlertDeliveryService, 'sendAlert'> = {
    sendAlert: sendAlertMock,
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NotificationAlertsJob,
        { provide: NotificationAlertsService, useValue: mockAlertsService },
        { provide: AlertDeliveryService, useValue: mockAlertDeliveryService },
      ],
    }).compile();

    job = module.get<NotificationAlertsJob>(NotificationAlertsJob);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should do nothing if no alerts detected', async () => {
    runChecksMock.mockResolvedValue({
      alerts: [],
      checkedCount: 3,
    } as NotificationAlertsResult);

    await job.checkAndAlert();

    expect(runChecksMock).toHaveBeenCalledTimes(1);
    expect(sendAlertMock).not.toHaveBeenCalled();
  });

  it('should send alert if issues detected', async () => {
    runChecksMock.mockResolvedValue({
      alerts: [
        {
          type: 'HIGH_FAILURE_RATIO',
          severity: 'HIGH',
          title: 'High Failure Ratio',
          description: 'Something failed',
          metadata: {},
          timestamp: new Date(),
        },
      ],
      checkedCount: 3,
    } as NotificationAlertsResult);
    sendAlertMock.mockResolvedValue({ sent: true, recipientCount: 1 });

    await job.checkAndAlert();

    expect(sendAlertMock).toHaveBeenCalledTimes(1);
    const firstCallArg = sendAlertMock.mock.calls[0]?.[0];
    expect(firstCallArg).toBeDefined();
    expect(firstCallArg?.recipientGroup).toBe(RecipientGroup.INFRA_ALERTS);
    expect(firstCallArg?.severity).toBe('WARNING');
    expect(firstCallArg?.title).toContain('Notification Alert');
  });

  it('should not crash if check fails', async () => {
    runChecksMock.mockRejectedValue(new Error('DB Error'));

    await expect(job.checkAndAlert()).resolves.not.toThrow();
    expect(sendAlertMock).not.toHaveBeenCalled();
  });

  it('should not crash if alert delivery fails', async () => {
    runChecksMock.mockResolvedValue({
      alerts: [
        {
          type: 'HIGH_FAILURE_RATIO',
          severity: 'HIGH',
          title: 'Test',
          description: 'Test',
          metadata: {},
          timestamp: new Date(),
        },
      ],
      checkedCount: 1,
    } as NotificationAlertsResult);
    sendAlertMock.mockRejectedValue(new Error('Email Error'));

    await expect(job.checkAndAlert()).resolves.not.toThrow();
  });
});
