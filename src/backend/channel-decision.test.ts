import { describe, expect, it } from "vitest";
import {
  type DecisionBackend,
  type DecisionInput,
  decideMember,
  decisionOutcome,
  decisionRefusal,
  decisionRequest,
} from "./channel-decision";

const input: DecisionInput = {
  title: "Launch",
  instructions: "Ship the launch",
  members: [
    { id: "agent-a", name: "Ada", title: "Designer", description: "Makes images" },
    { id: "agent-b", name: "Bo", title: "Writer", description: "Writes copy" },
  ],
  recent: [{ author: "Ada", text: "Banner is done" }],
  request: "Please write the announcement",
};

const jev: DecisionBackend = { kind: "jev", apiKey: "jev-key" };
const openrouter: DecisionBackend = { kind: "openrouter", apiKey: "or-key", model: "typesafe/jev-1.14" };
const cloudflare: DecisionBackend = {
  kind: "cloudflare",
  accountId: "0123456789abcdef0123456789abcdef",
  apiToken: "cf-token",
  model: "clef-flash",
};

function answer(choice: string, probabilities: Record<string, number>) {
  return { answers: { member: { type: "choice", choice, probabilities, confidence: 1 } } };
}

describe("decisionRequest", () => {
  it("asks Jev at its own address with its own model name", () => {
    const request = decisionRequest(jev, input);
    expect(request.url).toBe("https://api.typesafe.ai/v1/systemone");
    expect(request.headers.Authorization).toBe("Bearer jev-key");
    expect(request.body).toMatchObject({ model: "jev-latest" });
  });

  it("asks OpenRouter's decisions endpoint with the chosen model", () => {
    const request = decisionRequest(openrouter, input);
    expect(request.url).toBe("https://openrouter.ai/api/alpha/decisions");
    expect(request.body).toMatchObject({ model: "typesafe/jev-1.14" });
  });

  it("asks Workers AI of the account, with the model in the path and in the body", () => {
    const request = decisionRequest(cloudflare, input);
    expect(request.url).toBe(
      "https://api.cloudflare.com/client/v4/accounts/0123456789abcdef0123456789abcdef/ai/run/@cf/cloudflare/clef-flash",
    );
    expect(request.headers.Authorization).toBe("Bearer cf-token");
    expect(request.body).toMatchObject({ model: "clef-flash" });
  });

  it("offers each member under a short key, and none of them, without leaking ids as options", () => {
    const body = decisionRequest(jev, input).body;
    const options = body.questions.member?.criteria ?? {};
    expect(Object.keys(options)).toEqual(["m1", "m2", "none"]);
    expect(options.m1).toContain("Ada");
    expect(JSON.stringify(body)).not.toContain("agent-a");
  });

  it("sends no secret in the body", () => {
    for (const backend of [jev, openrouter, cloudflare])
      expect(JSON.stringify(decisionRequest(backend, input).body)).not.toMatch(/jev-key|or-key|cf-token/);
  });
});

describe("decisionOutcome", () => {
  const keys = ["m1", "m2", "none"];

  it("accepts the most likely member when it is sure enough", () => {
    expect(decisionOutcome(answer("m2", { m1: 0.1, m2: 0.85, none: 0.05 }), keys)).toEqual({
      key: "m2",
      probability: 0.85,
    });
  });

  it("reads the answer inside the envelope of Cloudflare's API", () => {
    const wrapped = { success: true, result: answer("m1", { m1: 0.9, m2: 0.05, none: 0.05 }) };
    expect(decisionOutcome(wrapped, keys)).toEqual({ key: "m1", probability: 0.9 });
  });

  it("refuses an answer below the threshold", () => {
    expect(decisionOutcome(answer("m1", { m1: 0.55, m2: 0.4, none: 0.05 }), keys)).toBeNull();
  });

  it("refuses 'none': no single member fits", () => {
    expect(decisionOutcome(answer("none", { m1: 0.1, m2: 0.1, none: 0.8 }), keys)).toBeNull();
  });

  it("refuses a choice that was not offered or is not the most likely one", () => {
    expect(decisionOutcome(answer("m9", { m9: 0.9 }), keys)).toBeNull();
    expect(decisionOutcome(answer("m1", { m1: 0.7, m2: 0.75, none: 0 }), keys)).toBeNull();
  });

  it("refuses probabilities that are not numbers and shapes that are not answers", () => {
    expect(decisionOutcome(answer("m1", { m1: Number.NaN, m2: 0.1, none: 0 }), keys)).toBeNull();
    expect(decisionOutcome({ answers: {} }, keys)).toBeNull();
    expect(decisionOutcome("text", keys)).toBeNull();
    expect(decisionOutcome(null, keys)).toBeNull();
  });
});

describe("decideMember", () => {
  const reply =
    (body: unknown, status = 200) =>
    async () =>
      new Response(JSON.stringify(body), { status });

  it("answers the id of the member that the model picked", async () => {
    const outcome = await decideMember(jev, input, {
      fetch: reply(answer("m2", { m1: 0.1, m2: 0.9, none: 0 })),
      timeoutMs: 1000,
    });
    expect(outcome).toMatchObject({ ok: true, agentId: "agent-b", probability: 0.9 });
  });

  it("falls back, with a reason, on an HTTP error", async () => {
    const outcome = await decideMember(jev, input, { fetch: reply({ error: "no" }, 429), timeoutMs: 1000 });
    expect(outcome).toEqual({ ok: false, reason: "http-429" });
  });

  it("falls back on a network failure without throwing", async () => {
    const failing = async () => {
      throw new Error("offline");
    };
    expect(await decideMember(jev, input, { fetch: failing, timeoutMs: 1000 })).toEqual({
      ok: false,
      reason: "network",
    });
  });

  it("falls back when the answer does not come within the time", async () => {
    const slow = (_url: string | URL | Request, init?: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
      });
    expect(await decideMember(jev, input, { fetch: slow, timeoutMs: 20 })).toEqual({ ok: false, reason: "timeout" });
  });

  it("falls back, and says why, when the model is unsure", async () => {
    const outcome = await decideMember(jev, input, {
      fetch: reply(answer("m1", { m1: 0.5, m2: 0.5, none: 0 })),
      timeoutMs: 1000,
    });
    expect(outcome).toEqual({ ok: false, reason: "below-threshold" });
  });

  it("does not ask when there is a single member: that is no decision", async () => {
    let asked = false;
    const spy = async () => {
      asked = true;
      return new Response("{}");
    };
    const single = { ...input, members: input.members.slice(0, 1) };
    expect(await decideMember(jev, single, { fetch: spy, timeoutMs: 1000 })).toEqual({
      ok: false,
      reason: "no-choice",
    });
    expect(asked).toBe(false);
  });
});

describe("decisionRefusal", () => {
  const keys = ["m1", "m2", "none"];

  it("tells apart the ways an answer is not used", () => {
    expect(decisionRefusal(answer("none", { m1: 0.1, m2: 0.1, none: 0.8 }), keys)).toBe("none");
    expect(decisionRefusal(answer("m1", { m1: 0.55, m2: 0.4, none: 0.05 }), keys)).toBe("below-threshold");
    expect(decisionRefusal(answer("m1", { m1: 0.7, m2: 0.75, none: 0 }), keys)).toBe("not-top");
    expect(decisionRefusal(answer("m9", { m9: 0.9 }), keys)).toBe("unknown-choice");
    expect(decisionRefusal(answer("m1", { m1: Number.NaN, m2: 0.1, none: 0 }), keys)).toBe("bad-probability");
    expect(decisionRefusal({ answers: {} }, keys)).toBe("shape");
    expect(decisionRefusal("text", keys)).toBe("shape");
  });
});
