import { describe, it, expect } from "vitest";
import { GeminiAdapter } from "../adapters/gemini.js";

const adapter = new GeminiAdapter();
const FAKE_PATH = "/home/.gemini/tmp/proj123/chats/session-001.json";
const SESSION = "session-001";

describe("GeminiAdapter.parseContent", () => {
  it("gemini 타입 메시지에서 토큰 레코드를 생성한다", () => {
    const session = {
      sessionId: "sess_g1",
      messages: [
        {
          id: "msg_g1",
          timestamp: "2026-05-01T00:00:00Z",
          type: "gemini",
          model: "gemini-2.5-pro",
          tokens: { input: 200, output: 100, cached: 50, thoughts: 10 },
        },
      ],
    };

    const result = adapter.parseContent(JSON.stringify(session), FAKE_PATH, SESSION, new Set(), null);

    expect(result.records).toHaveLength(1);
    const rec = result.records[0];
    expect(rec.session_id).toBe("sess_g1");
    expect(rec.message_id).toBe("gemini:msg_g1");
    expect(rec.model).toBe("gemini-2.5-pro");
    expect(rec.input_tokens).toBe(200);
    expect(rec.output_tokens).toBe(100);
    expect(rec.cache_read_tokens).toBe(50);
    expect(rec.reasoning_tokens).toBe(10);
    expect(rec.provider).toBe("gemini");
  });

  it("gemini 타입이 아닌 메시지는 무시한다", () => {
    const session = {
      messages: [
        { id: "msg_u1", type: "user", tokens: { input: 50 } },
        {
          id: "msg_g2",
          type: "gemini",
          model: "gemini-2.5-pro",
          tokens: { input: 100, output: 50 },
        },
      ],
    };

    const result = adapter.parseContent(JSON.stringify(session), FAKE_PATH, SESSION, new Set(), null);

    expect(result.records).toHaveLength(1);
    expect(result.records[0].message_id).toBe("gemini:msg_g2");
  });

  it("existingIds에 있는 메시지는 건너뛴다", () => {
    const session = {
      messages: [
        {
          id: "msg_g3",
          type: "gemini",
          model: "gemini-2.5-pro",
          tokens: { input: 100, output: 50 },
        },
      ],
    };

    const existingIds = new Set(["gemini:msg_g3"]);
    const result = adapter.parseContent(JSON.stringify(session), FAKE_PATH, SESSION, existingIds, null);

    expect(result.records).toHaveLength(0);
  });

  it("잘못된 JSON이면 빈 결과를 반환한다", () => {
    const result = adapter.parseContent("not json", FAKE_PATH, SESSION, new Set(), null);

    expect(result.records).toHaveLength(0);
    expect(result.state).toEqual({});
  });

  it("tokens나 id가 없는 메시지는 건너뛴다", () => {
    const session = {
      messages: [
        { type: "gemini", model: "gemini-2.5-pro", tokens: { input: 100 } },
        { id: "msg_g4", type: "gemini", model: "gemini-2.5-pro" },
        {
          id: "msg_g5",
          type: "gemini",
          model: "gemini-2.5-pro",
          tokens: { input: 80, output: 40 },
        },
      ],
    };

    const result = adapter.parseContent(JSON.stringify(session), FAKE_PATH, SESSION, new Set(), null);

    expect(result.records).toHaveLength(1);
    expect(result.records[0].message_id).toBe("gemini:msg_g5");
  });
});
