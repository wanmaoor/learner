export interface StudentSnapshot {
  current_topic: string | null;
  mastery_map: Record<
    string,
    {
      accuracy: number;
      boundaries: Array<{
        text: string;
        confirmed: boolean;
        attempts: number;
      }>;
      sm2_interval: number;
      next_review: string | null;
    }
  >;
  review_due: string[];
}

interface MasteryInput {
  topic: string;
  accuracy: number | null;
  sm2Interval: number | null;
  nextReview: Date | null;
}

interface BoundaryInput {
  masteryTopic: string;
  boundaryText: string;
  confirmed: boolean | null;
  attempts: number | null;
}

const MAX_TOPICS_IN_SNAPSHOT = 20;

export function buildStudentSnapshot(
  masteryRecords: MasteryInput[],
  boundaries: BoundaryInput[]
): StudentSnapshot {
  // 按 accuracy 升序排列（最弱的在前）
  const sorted = [...masteryRecords].sort(
    (a, b) => (a.accuracy ?? 0) - (b.accuracy ?? 0)
  );

  // 截断到 top 20
  const truncated = sorted.slice(0, MAX_TOPICS_IN_SNAPSHOT);

  // 构建 mastery_map
  const masteryMap: StudentSnapshot["mastery_map"] = {};
  const now = new Date();
  const reviewDue: string[] = [];

  for (const record of truncated) {
    const topicBoundaries = boundaries
      .filter((b) => b.masteryTopic === record.topic)
      .map((b) => ({
        text: b.boundaryText,
        confirmed: b.confirmed ?? false,
        attempts: b.attempts ?? 0,
      }));

    masteryMap[record.topic] = {
      accuracy: record.accuracy ?? 0,
      boundaries: topicBoundaries,
      sm2_interval: record.sm2Interval ?? 1,
      next_review: record.nextReview?.toISOString() ?? null,
    };

    if (record.nextReview && record.nextReview <= now) {
      reviewDue.push(record.topic);
    }
  }

  // current_topic: 最弱的 topic
  const currentTopic = truncated.length > 0 ? truncated[0].topic : null;

  return {
    current_topic: currentTopic,
    mastery_map: masteryMap,
    review_due: reviewDue,
  };
}
