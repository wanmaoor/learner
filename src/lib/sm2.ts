export interface Sm2Input {
  quality: number; // 0-5
  repetitions: number;
  easiness: number;
  interval: number; // days
}

export interface Sm2Output {
  repetitions: number;
  easiness: number;
  interval: number; // days
  nextReview: Date;
}

export function calculateSm2(input: Sm2Input): Sm2Output {
  let { quality, repetitions, easiness, interval } = input;

  // 防御 NaN/Infinity
  if (!Number.isFinite(easiness)) easiness = 2.5;
  if (!Number.isFinite(interval) || interval < 1) interval = 1;
  quality = Math.max(0, Math.min(5, Math.round(quality)));

  let newRepetitions: number;
  let newInterval: number;
  let newEasiness: number;

  if (quality >= 3) {
    // 正确回答
    if (repetitions === 0) {
      newInterval = 1;
    } else if (repetitions === 1) {
      newInterval = 6;
    } else {
      newInterval = Math.round(interval * easiness);
    }
    newRepetitions = repetitions + 1;
  } else {
    // 错误回答
    newInterval = 1;
    newRepetitions = 0;
  }

  // 更新 easiness factor
  newEasiness =
    easiness + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02));

  // easiness 下限 1.3
  if (newEasiness < 1.3) newEasiness = 1.3;

  // 计算下次复习日期
  const nextReview = new Date();
  nextReview.setDate(nextReview.getDate() + newInterval);

  return {
    repetitions: newRepetitions,
    easiness: newEasiness,
    interval: newInterval,
    nextReview,
  };
}
