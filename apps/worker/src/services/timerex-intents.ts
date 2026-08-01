const RESCHEDULE_INTENT_RE =
  /(日程\s*変更|日程を\s*変更|予定を\s*変更|時間を\s*変更|変更させて|再調整|再予約|リスケ|キャンセル|間に合わ|遅れ|遅刻|都合が悪|都合悪|参加でき|参加出来|行けな|欠席|延期|ずらし)/;

export function isTimerexRescheduleIntent(text: string): boolean {
  return RESCHEDULE_INTENT_RE.test(text);
}
