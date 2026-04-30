import { describe, it, expect } from "vitest";
import { ClaudeAdapter } from "../adapters/claude.js";

const adapter = new ClaudeAdapter();
const FAKE_PATH = "/home/.claude/projects/-Users-test-myproject/abc123.jsonl";
const SESSION = "abc123";

describe("ClaudeAdapter.parseContent", () => {
  it("기본 assistant 메시지를 파싱하면 TokenRecord가 생성된다", () => {
    const line = JSON.stringify({
      type: "assistant",
      timestamp: "2026-04-30T00:00:00Z",
      message: {
        id: "msg_001",
        model: "claude-sonnet-4-6",
        content: [{ type: "text", text: "hello" }],
        usage: {
          input_tokens: 100,
          output_tokens: 50,
          cache_read_input_tokens: 0,
          cache_creation_input_tokens: 0,
        },
      },
    });

    const result = adapter.parseContent(line, FAKE_PATH, SESSION, new Set(), null);

    expect(result.records).toHaveLength(1);
    const rec = result.records[0];
    expect(rec.message_id).toBe("msg_001");
    expect(rec.model).toBe("claude-sonnet-4-6");
    expect(rec.input_tokens).toBe(100);
    expect(rec.output_tokens).toBe(50);
    expect(rec.task_name).toBeNull();
    expect(rec.trigger_type).toBe("none");
    expect(rec.session_id).toBe(SESSION);
  });

  it("user 메시지에 command-name 태그가 있으면 user_slash 스킬로 감지된다", () => {
    const userLine = JSON.stringify({
      type: "user",
      promptId: "p1",
      message: {
        content: [{ type: "text", text: "<command-name>/autodev</command-name>\nticket AND-100" }],
      },
    });
    const assistantLine = JSON.stringify({
      type: "assistant",
      timestamp: "2026-04-30T00:01:00Z",
      message: {
        id: "msg_002",
        model: "claude-sonnet-4-6",
        content: [{ type: "text", text: "analyzing ticket..." }],
        usage: { input_tokens: 200, output_tokens: 80, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 },
      },
    });
    const text = [userLine, assistantLine].join("\n");

    const result = adapter.parseContent(text, FAKE_PATH, SESSION, new Set(), null);

    expect(result.records).toHaveLength(1);
    expect(result.records[0].task_name).toBe("autodev");
    expect(result.records[0].trigger_type).toBe("user_slash");
  });

  it("assistant content에 Skill tool_use 블록이 있으면 model_tool_call로 감지된다", () => {
    const line = JSON.stringify({
      type: "assistant",
      timestamp: "2026-04-30T00:02:00Z",
      message: {
        id: "msg_003",
        model: "claude-sonnet-4-6",
        content: [
          { type: "text", text: "I will run a review." },
          { type: "tool_use", name: "Skill", input: { skill: "review" } },
        ],
        usage: { input_tokens: 300, output_tokens: 120, cache_read_input_tokens: 10, cache_creation_input_tokens: 5 },
      },
    });

    const result = adapter.parseContent(line, FAKE_PATH, SESSION, new Set(), null);

    expect(result.records).toHaveLength(1);
    expect(result.records[0].task_name).toBe("review");
    expect(result.records[0].trigger_type).toBe("model_tool_call");
  });

  it("resumeState의 model_tool_call이 증분 파싱 경계를 넘어도 유지된다", () => {
    // 이전 청크에서 model_tool_call로 감지된 스킬 상태를 resumeState로 전달
    const resumeState = {
      active_skill: "review",
      active_trigger: "model_tool_call" as const,
      active_prompt_id: "p1",
    };

    // user 메시지 없이 assistant만 — 프롬프트 경계 리셋이 발생하지 않음
    const line = JSON.stringify({
      type: "assistant",
      timestamp: "2026-04-30T00:03:00Z",
      message: {
        id: "msg_004",
        model: "claude-sonnet-4-6",
        content: [{ type: "text", text: "continuing review..." }],
        usage: { input_tokens: 150, output_tokens: 60, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 },
      },
    });

    const result = adapter.parseContent(line, FAKE_PATH, SESSION, new Set(), resumeState);

    expect(result.records).toHaveLength(1);
    expect(result.records[0].task_name).toBe("review");
    expect(result.records[0].trigger_type).toBe("model_tool_call");
    // state도 유지되어야 함
    expect(result.state.active_trigger).toBe("model_tool_call");
    expect(result.state.active_skill).toBe("review");
  });

  it("existingIds에 이미 있는 message_id는 records에 포함되지 않는다", () => {
    const line1 = JSON.stringify({
      type: "assistant",
      timestamp: "2026-04-30T00:04:00Z",
      message: {
        id: "msg_existing",
        model: "claude-sonnet-4-6",
        content: [{ type: "text", text: "old message" }],
        usage: { input_tokens: 50, output_tokens: 20, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 },
      },
    });
    const line2 = JSON.stringify({
      type: "assistant",
      timestamp: "2026-04-30T00:05:00Z",
      message: {
        id: "msg_new",
        model: "claude-sonnet-4-6",
        content: [{ type: "text", text: "new message" }],
        usage: { input_tokens: 70, output_tokens: 30, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 },
      },
    });
    const text = [line1, line2].join("\n");

    const existingIds = new Set(["msg_existing"]);
    const result = adapter.parseContent(text, FAKE_PATH, SESSION, existingIds, null);

    expect(result.records).toHaveLength(1);
    expect(result.records[0].message_id).toBe("msg_new");
  });

  it("다른 promptId를 가진 user 메시지가 오면 activeSkill이 null로 리셋된다", () => {
    // 1) slash 커맨드로 스킬 활성화 (promptId: "p1")
    const userSlash = JSON.stringify({
      type: "user",
      promptId: "p1",
      message: {
        content: [{ type: "text", text: "<command-name>/autodev</command-name>\nAND-200" }],
      },
    });
    const assistant1 = JSON.stringify({
      type: "assistant",
      timestamp: "2026-04-30T00:06:00Z",
      message: {
        id: "msg_skill",
        model: "claude-sonnet-4-6",
        content: [{ type: "text", text: "running autodev..." }],
        usage: { input_tokens: 100, output_tokens: 40, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 },
      },
    });

    // 2) 다른 promptId를 가진 일반 user 메시지 → 스킬 리셋
    const userPlain = JSON.stringify({
      type: "user",
      promptId: "p2",
      message: {
        content: [{ type: "text", text: "explain this code" }],
      },
    });
    const assistant2 = JSON.stringify({
      type: "assistant",
      timestamp: "2026-04-30T00:07:00Z",
      message: {
        id: "msg_after_reset",
        model: "claude-sonnet-4-6",
        content: [{ type: "text", text: "sure, this code does..." }],
        usage: { input_tokens: 120, output_tokens: 60, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 },
      },
    });

    const text = [userSlash, assistant1, userPlain, assistant2].join("\n");
    const result = adapter.parseContent(text, FAKE_PATH, SESSION, new Set(), null);

    expect(result.records).toHaveLength(2);

    // 첫 번째 레코드는 스킬이 활성화된 상태
    const skillRecord = result.records.find(r => r.message_id === "msg_skill")!;
    expect(skillRecord.task_name).toBe("autodev");
    expect(skillRecord.trigger_type).toBe("user_slash");

    // 두 번째 레코드는 스킬이 리셋된 상태
    const resetRecord = result.records.find(r => r.message_id === "msg_after_reset")!;
    expect(resetRecord.task_name).toBeNull();
    expect(resetRecord.trigger_type).toBe("none");

    // 최종 state도 리셋 상태
    expect(result.state.active_skill).toBeNull();
    expect(result.state.active_trigger).toBe("none");
  });
});
