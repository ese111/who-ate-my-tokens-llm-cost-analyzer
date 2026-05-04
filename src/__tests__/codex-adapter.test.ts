import { describe, it, expect } from "vitest";
import { CodexAdapter } from "../adapters/codex.js";

const adapter = new CodexAdapter();
const FAKE_PATH = "/home/.codex/sessions/sess_001.jsonl";
const SESSION = "sess_001";

function line(obj: Record<string, unknown>): string {
  return JSON.stringify(obj);
}

describe("CodexAdapter.parseContent", () => {
  it("session_meta에서 cwd를 추출하고 token_count에서 레코드를 생성한다", () => {
    const text = [
      line({ type: "session_meta", payload: { cwd: "/home/project" } }),
      line({ type: "turn_context", payload: { model: "gpt-5.4" } }),
      line({
        type: "event_msg",
        timestamp: "2026-05-01T00:00:00Z",
        payload: {
          type: "token_count",
          info: {
            total_token_usage: { input_tokens: 100, output_tokens: 50, total_tokens: 150 },
            last_token_usage: { input_tokens: 100, output_tokens: 50 },
          },
        },
      }),
    ].join("\n");

    const result = adapter.parseContent(text, FAKE_PATH, SESSION, new Set(), null);

    expect(result.records).toHaveLength(1);
    const rec = result.records[0];
    expect(rec.project_path).toBe("/home/project");
    expect(rec.model).toBe("gpt-5.4");
    expect(rec.input_tokens).toBe(100);
    expect(rec.output_tokens).toBe(50);
    expect(rec.provider).toBe("codex");
  });

  it("cumulative total이 변하지 않으면 중복 레코드를 생성하지 않는다", () => {
    const tokenEvent = (totalIn: number, totalOut: number, lastIn: number, lastOut: number) =>
      line({
        type: "event_msg",
        timestamp: "2026-05-01T00:00:00Z",
        payload: {
          type: "token_count",
          info: {
            total_token_usage: { input_tokens: totalIn, output_tokens: totalOut },
            last_token_usage: { input_tokens: lastIn, output_tokens: lastOut },
          },
        },
      });

    const text = [
      tokenEvent(100, 50, 100, 50),
      tokenEvent(100, 50, 0, 0),
      tokenEvent(200, 80, 100, 30),
    ].join("\n");

    const result = adapter.parseContent(text, FAKE_PATH, SESSION, new Set(), null);
    expect(result.records).toHaveLength(2);
  });

  it("resumeState로 이전 cumulative 값을 이어받는다", () => {
    const resumeState = {
      current_model: "gpt-5.4-mini",
      prev_total_input: 500,
      prev_total_output: 200,
    };

    const text = line({
      type: "event_msg",
      timestamp: "2026-05-01T00:01:00Z",
      payload: {
        type: "token_count",
        info: {
          total_token_usage: { input_tokens: 600, output_tokens: 250 },
          last_token_usage: { input_tokens: 100, output_tokens: 50 },
        },
      },
    });

    const result = adapter.parseContent(text, FAKE_PATH, SESSION, new Set(), resumeState);

    expect(result.records).toHaveLength(1);
    expect(result.records[0].model).toBe("gpt-5.4-mini");
    expect(result.records[0].input_tokens).toBe(100);
    expect(result.state.prev_total_input).toBe(600);
    expect(result.state.prev_total_output).toBe(250);
  });

  it("existingIds에 있는 메시지는 건너뛴다", () => {
    const text = line({
      type: "event_msg",
      timestamp: "2026-05-01T00:00:00Z",
      payload: {
        type: "token_count",
        info: {
          total_token_usage: { input_tokens: 100, output_tokens: 50 },
          last_token_usage: { input_tokens: 100, output_tokens: 50 },
        },
      },
    });

    const existingIds = new Set([`codex:${SESSION}:100:50`]);
    const result = adapter.parseContent(text, FAKE_PATH, SESSION, existingIds, null);

    expect(result.records).toHaveLength(0);
  });
});
