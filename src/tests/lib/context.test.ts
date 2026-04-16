import { describe, it, expect } from "vitest";
import { buildStudentSnapshot } from "@/lib/context";

describe("buildStudentSnapshot", () => {
  it("builds snapshot from mastery records and boundaries", () => {
    const masteryRecords = [
      {
        topic: "导数.复合函数求导",
        accuracy: 0.2,
        sm2Interval: 1,
        nextReview: new Date("2026-04-16"),
      },
    ];
    const boundaries = [
      {
        masteryTopic: "导数.复合函数求导",
        boundaryText: "遗漏内层导数",
        confirmed: true,
        attempts: 4,
      },
    ];

    const snapshot = buildStudentSnapshot(masteryRecords, boundaries);

    expect(snapshot.mastery_map["导数.复合函数求导"]).toBeDefined();
    expect(snapshot.mastery_map["导数.复合函数求导"].accuracy).toBe(0.2);
    expect(
      snapshot.mastery_map["导数.复合函数求导"].boundaries
    ).toHaveLength(1);
  });

  it("truncates to top 20 weakest when > 20 topics", () => {
    const masteryRecords = Array.from({ length: 30 }, (_, i) => ({
      topic: `topic-${i}`,
      accuracy: i / 30, // 0.0 到 0.97
      sm2Interval: 1,
      nextReview: new Date(),
    }));

    const snapshot = buildStudentSnapshot(masteryRecords, []);
    const topicCount = Object.keys(snapshot.mastery_map).length;
    expect(topicCount).toBeLessThanOrEqual(20);
    // 应该保留 accuracy 最低的 20 个
    expect(snapshot.mastery_map["topic-0"]).toBeDefined();
  });

  it("handles empty data (new user)", () => {
    const snapshot = buildStudentSnapshot([], []);
    expect(Object.keys(snapshot.mastery_map)).toHaveLength(0);
    expect(snapshot.review_due).toHaveLength(0);
  });
});
