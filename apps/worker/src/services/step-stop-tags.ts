import { completePendingFriendScenarios } from '@line-crm/db';

const STEP_DELIVERY_STOP_TAG_NAMES = new Set([
  '面談予約済み',
  '面談実施済み',
]);

export async function stopStepDeliveriesForTag(
  db: D1Database,
  friendId: string,
  tagId: string,
): Promise<number> {
  const tag = await db
    .prepare('SELECT name FROM tags WHERE id = ?')
    .bind(tagId)
    .first<{ name: string }>();

  if (!tag || !STEP_DELIVERY_STOP_TAG_NAMES.has(tag.name)) {
    return 0;
  }

  return completePendingFriendScenarios(db, friendId);
}
