jest.mock('node-cron', () => ({
  schedule: jest.fn().mockReturnValue({ stop: jest.fn() }),
  validate: jest.fn().mockReturnValue(true),
}));

jest.mock('../src/db/workflows', () => ({
  getPendingNotifications: jest.fn(),
  markNotificationSent: jest.fn(),
}));

import {
  sendPendingNotifications,
  scheduleRecurringNotifications,
  getScheduledJobCount,
  _stopAllJobs,
} from '../src/workflows/notifications';
import { getPendingNotifications, markNotificationSent } from '../src/db/workflows';
import cron from 'node-cron';

const mockGetPending    = jest.mocked(getPendingNotifications);
const mockMarkSent      = jest.mocked(markNotificationSent);
const mockCronSchedule  = jest.mocked(cron.schedule);
const mockCronValidate  = jest.mocked(cron.validate);

const mockClient = {
  sendMessage: jest.fn(),
} as unknown as import('whatsapp-web.js').Client;

const ONE_TIME = {
  id: 'n1', recipient: '5511999', content: 'Lembrete de reunião',
  status: 'pending' as const, created_at: '',
  scheduled_at: undefined, cron_expr: undefined,
};

const RECURRING = {
  id: 'n2', recipient: '5511999', content: 'Relatório semanal',
  status: 'pending' as const, created_at: '',
  scheduled_at: undefined, cron_expr: '0 9 * * 1', // every Monday at 09:00
};

beforeEach(() => {
  jest.clearAllMocks();
  _stopAllJobs();
  mockMarkSent.mockResolvedValue(undefined);
  (mockClient.sendMessage as jest.Mock).mockResolvedValue(undefined);
  mockCronValidate.mockReturnValue(true);
  mockCronSchedule.mockReturnValue({ stop: jest.fn() } as any);
});

// ── sendPendingNotifications ───────────────────────────────────────────────────

describe('sendPendingNotifications()', () => {
  test('sends one-time notification and marks it as sent', async () => {
    mockGetPending.mockResolvedValue([ONE_TIME]);

    await sendPendingNotifications(mockClient);

    expect(mockClient.sendMessage).toHaveBeenCalledWith('5511999@c.us', 'Lembrete de reunião');
    expect(mockMarkSent).toHaveBeenCalledWith('n1');
  });

  test('skips recurring notifications (cron_expr set)', async () => {
    mockGetPending.mockResolvedValue([RECURRING]);

    await sendPendingNotifications(mockClient);

    expect(mockClient.sendMessage).not.toHaveBeenCalled();
    expect(mockMarkSent).not.toHaveBeenCalled();
  });

  test('sends multiple one-time notifications in order', async () => {
    const n2 = { ...ONE_TIME, id: 'n2', content: 'Segundo lembrete' };
    mockGetPending.mockResolvedValue([ONE_TIME, n2]);

    await sendPendingNotifications(mockClient);

    expect(mockClient.sendMessage).toHaveBeenCalledTimes(2);
    expect(mockMarkSent).toHaveBeenCalledTimes(2);
  });

  test('continues sending remaining notifications if one fails', async () => {
    const n2 = { ...ONE_TIME, id: 'n2', content: 'Segundo' };
    mockGetPending.mockResolvedValue([ONE_TIME, n2]);
    (mockClient.sendMessage as jest.Mock)
      .mockRejectedValueOnce(new Error('send failed'))
      .mockResolvedValueOnce(undefined);

    await sendPendingNotifications(mockClient);

    // First failed — not marked sent; second succeeded
    expect(mockMarkSent).toHaveBeenCalledTimes(1);
    expect(mockMarkSent).toHaveBeenCalledWith('n2');
  });

  test('does nothing when no pending notifications', async () => {
    mockGetPending.mockResolvedValue([]);

    await sendPendingNotifications(mockClient);

    expect(mockClient.sendMessage).not.toHaveBeenCalled();
  });
});

// ── scheduleRecurringNotifications ────────────────────────────────────────────

describe('scheduleRecurringNotifications()', () => {
  test('creates a cron job for a valid recurring notification', async () => {
    mockGetPending.mockResolvedValue([RECURRING]);

    await scheduleRecurringNotifications(mockClient);

    expect(mockCronSchedule).toHaveBeenCalledWith('0 9 * * 1', expect.any(Function));
    expect(getScheduledJobCount()).toBe(1);
  });

  test('does not double-schedule the same notification', async () => {
    mockGetPending.mockResolvedValue([RECURRING]);

    await scheduleRecurringNotifications(mockClient);
    await scheduleRecurringNotifications(mockClient); // second call

    expect(mockCronSchedule).toHaveBeenCalledTimes(1);
    expect(getScheduledJobCount()).toBe(1);
  });

  test('skips one-time notifications (no cron_expr)', async () => {
    mockGetPending.mockResolvedValue([ONE_TIME]);

    await scheduleRecurringNotifications(mockClient);

    expect(mockCronSchedule).not.toHaveBeenCalled();
    expect(getScheduledJobCount()).toBe(0);
  });

  test('skips notifications with invalid cron expression', async () => {
    mockCronValidate.mockReturnValue(false);
    mockGetPending.mockResolvedValue([RECURRING]);

    await scheduleRecurringNotifications(mockClient);

    expect(mockCronSchedule).not.toHaveBeenCalled();
    expect(getScheduledJobCount()).toBe(0);
  });

  test('schedules multiple recurring notifications independently', async () => {
    const r2 = { ...RECURRING, id: 'n3', cron_expr: '0 18 * * 5' }; // every Friday 18:00
    mockGetPending.mockResolvedValue([RECURRING, r2]);

    await scheduleRecurringNotifications(mockClient);

    expect(mockCronSchedule).toHaveBeenCalledTimes(2);
    expect(getScheduledJobCount()).toBe(2);
  });

  test('the scheduled task calls sendMessage when fired', async () => {
    mockGetPending.mockResolvedValue([RECURRING]);
    let capturedCallback: (() => Promise<void>) | null = null;
    mockCronSchedule.mockImplementation((_expr, fn) => {
      capturedCallback = fn as () => Promise<void>;
      return { stop: jest.fn() } as any;
    });

    await scheduleRecurringNotifications(mockClient);
    expect(capturedCallback).not.toBeNull();

    await capturedCallback!();
    expect(mockClient.sendMessage).toHaveBeenCalledWith('5511999@c.us', 'Relatório semanal');
  });
});

// ── _stopAllJobs / getScheduledJobCount ───────────────────────────────────────

describe('_stopAllJobs()', () => {
  test('stops all running jobs and clears the registry', async () => {
    const mockStop = jest.fn();
    mockCronSchedule.mockReturnValue({ stop: mockStop } as any);
    mockGetPending.mockResolvedValue([RECURRING]);
    await scheduleRecurringNotifications(mockClient);
    expect(getScheduledJobCount()).toBe(1);

    _stopAllJobs();

    expect(mockStop).toHaveBeenCalled();
    expect(getScheduledJobCount()).toBe(0);
  });
});
