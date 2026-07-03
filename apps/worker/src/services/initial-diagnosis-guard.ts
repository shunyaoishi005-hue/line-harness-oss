const STRUCTURE_INITIAL_DIAGNOSIS_SCENARIO_NAME = 'SP_初回診断_v1';
const STRUCTURE_DIAGNOSIS_COMPLETE_TAG_NAME = '診断:完了';

export async function shouldSkipCompletedInitialDiagnosis(
  db: D1Database,
  friendId: string,
  scenario: { name?: string | null },
): Promise<boolean> {
  if (scenario.name !== STRUCTURE_INITIAL_DIAGNOSIS_SCENARIO_NAME) {
    return false;
  }

  const completedTag = await db
    .prepare(
      `SELECT 1
       FROM friend_tags ft
       INNER JOIN tags t ON t.id = ft.tag_id
       WHERE ft.friend_id = ? AND t.name = ?
       LIMIT 1`,
    )
    .bind(friendId, STRUCTURE_DIAGNOSIS_COMPLETE_TAG_NAME)
    .first();

  return !!completedTag;
}
