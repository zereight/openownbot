import { describe, expect, it } from "vitest";
import { answerExcerpt, conditionAnswer } from "./workflow-walk";

describe("conditionAnswer", () => {
  it("reads yes or no as the first word, whatever follows", () => {
    expect(conditionAnswer("yes")).toBe("yes");
    expect(conditionAnswer("  No.\nbecause")).toBe("no");
    expect(conditionAnswer("**Yes**")).toBe("yes");
  });

  it("refuses an answer that does not start with yes or no", () => {
    expect(conditionAnswer("예")).toBeNull();
    expect(conditionAnswer("The answer is yes")).toBeNull();
    expect(conditionAnswer("")).toBeNull();
  });
});

describe("answerExcerpt", () => {
  it("keeps a short answer as it is, on one line", () => {
    expect(answerExcerpt("  예,\n리뷰 필요 ")).toBe("예, 리뷰 필요");
  });

  it("cuts a long answer and says so", () => {
    const excerpt = answerExcerpt("가".repeat(500));
    expect(excerpt.length).toBeLessThanOrEqual(241);
    expect(excerpt.endsWith("…")).toBe(true);
  });

  it("says that the answer was empty instead of returning nothing", () => {
    expect(answerExcerpt(" \n ")).toBe("(empty)");
  });
});
