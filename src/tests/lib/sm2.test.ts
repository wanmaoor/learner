import { describe, it, expect } from "vitest";
import { calculateSm2 } from "@/lib/sm2";

describe("SM-2 algorithm", () => {
  it("quality 5 (perfect) increases interval", () => {
    const result = calculateSm2({
      quality: 5,
      repetitions: 1,
      easiness: 2.5,
      interval: 1,
    });
    expect(result.interval).toBe(6);
    expect(result.repetitions).toBe(2);
    expect(result.easiness).toBeCloseTo(2.6, 1);
  });

  it("quality 0 (fail) resets interval to 1", () => {
    const result = calculateSm2({
      quality: 0,
      repetitions: 5,
      easiness: 2.5,
      interval: 30,
    });
    expect(result.interval).toBe(1);
    expect(result.repetitions).toBe(0);
  });

  it("easiness never goes below 1.3", () => {
    const result = calculateSm2({
      quality: 0,
      repetitions: 0,
      easiness: 1.3,
      interval: 1,
    });
    expect(result.easiness).toBeGreaterThanOrEqual(1.3);
  });

  it("first correct answer sets interval to 1", () => {
    const result = calculateSm2({
      quality: 4,
      repetitions: 0,
      easiness: 2.5,
      interval: 1,
    });
    expect(result.interval).toBe(1);
    expect(result.repetitions).toBe(1);
  });

  it("second correct answer sets interval to 6", () => {
    const result = calculateSm2({
      quality: 4,
      repetitions: 1,
      easiness: 2.5,
      interval: 1,
    });
    expect(result.interval).toBe(6);
    expect(result.repetitions).toBe(2);
  });

  it("third+ correct answer multiplies by easiness", () => {
    const result = calculateSm2({
      quality: 4,
      repetitions: 2,
      easiness: 2.5,
      interval: 6,
    });
    expect(result.interval).toBeCloseTo(15, 0);
    expect(result.repetitions).toBe(3);
  });

  it("handles NaN easiness by resetting to default", () => {
    const result = calculateSm2({
      quality: 4,
      repetitions: 0,
      easiness: NaN,
      interval: 1,
    });
    expect(result.easiness).toBe(2.5);
    expect(Number.isNaN(result.easiness)).toBe(false);
  });

  it("handles Infinity interval by resetting to 1", () => {
    const result = calculateSm2({
      quality: 4,
      repetitions: 0,
      easiness: 2.5,
      interval: Infinity,
    });
    expect(Number.isFinite(result.interval)).toBe(true);
  });
});
