import { beforeEach, describe, expect, it, vi } from 'vitest';
import { stopStepDeliveriesForTag } from './step-stop-tags.js';

const mocks = vi.hoisted(() => ({
  completePendingFriendScenarios: vi.fn(),
}));

vi.mock('@line-crm/db', () => ({
  completePendingFriendScenarios: mocks.completePendingFriendScenarios,
}));

function fakeDb(tagName: string | null): D1Database {
  return {
    prepare: () => ({
      bind: () => ({
        first: async () => (tagName ? { name: tagName } : null),
      }),
    }),
  } as unknown as D1Database;
}

describe('stopStepDeliveriesForTag', () => {
  beforeEach(() => {
    mocks.completePendingFriendScenarios.mockReset();
    mocks.completePendingFriendScenarios.mockResolvedValue(2);
  });

  it('completes pending scenarios when the meeting booked tag is added', async () => {
    const result = await stopStepDeliveriesForTag(fakeDb('面談予約済み'), 'friend-1', 'tag-1');

    expect(result).toBe(2);
    expect(mocks.completePendingFriendScenarios).toHaveBeenCalledWith(expect.anything(), 'friend-1');
  });

  it('completes pending scenarios when the meeting done tag is added', async () => {
    const result = await stopStepDeliveriesForTag(fakeDb('面談実施済み'), 'friend-1', 'tag-2');

    expect(result).toBe(2);
    expect(mocks.completePendingFriendScenarios).toHaveBeenCalledWith(expect.anything(), 'friend-1');
  });

  it('does nothing for other tags', async () => {
    const result = await stopStepDeliveriesForTag(fakeDb('関心:案件を見たい'), 'friend-1', 'tag-3');

    expect(result).toBe(0);
    expect(mocks.completePendingFriendScenarios).not.toHaveBeenCalled();
  });
});
