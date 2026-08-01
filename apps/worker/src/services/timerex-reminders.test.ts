import { describe, expect, test } from 'vitest';
import { computeTimerexReminders } from './timerex-reminders.js';

describe('computeTimerexReminders', () => {
  test('creates two-days-before, day-before, and two-hours-before reminders', () => {
    const out = computeTimerexReminders(
      '2099-06-10T10:00:00.000Z',
      new Date('2099-06-01T00:00:00.000Z'),
    );

    expect(out).toEqual([
      { kind: 'two_days_before', scheduled_at: '2099-06-08T09:00:00.000Z' },
      { kind: 'day_before', scheduled_at: '2099-06-09T09:00:00.000Z' },
      { kind: 'hours_before', scheduled_at: '2099-06-10T08:00:00.000Z' },
    ]);
  });

  test('drops reminders whose scheduled time has already passed', () => {
    const out = computeTimerexReminders(
      '2099-06-10T10:00:00.000Z',
      new Date('2099-06-09T10:00:00.000Z'),
    );

    expect(out).toEqual([
      { kind: 'hours_before', scheduled_at: '2099-06-10T08:00:00.000Z' },
    ]);
  });

  test('returns empty list for invalid start datetime', () => {
    expect(computeTimerexReminders('invalid-date')).toEqual([]);
    expect(computeTimerexReminders(null)).toEqual([]);
  });
});
