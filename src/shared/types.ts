export interface TokenRecord {
  session_id: string;
  project_path: string;
  provider: string;
  message_id: string;
  timestamp: string;
  model: string;
  input_tokens: number;
  output_tokens: number;
  cache_read_tokens: number;
  cache_create_tokens: number;
  reasoning_tokens: number;
  task_name: string | null;
  trigger_type: "user_slash" | "model_tool_call" | "none";
  request_id: string | null;
  git_branch: string | null;
  raw_source: string | null;
}

export interface RawJsonlEntry {
  type: string;
  promptId?: string;
  uuid?: string;
  timestamp?: string;
  sessionId?: string;
  cwd?: string;
  requestId?: string;
  gitBranch?: string;
  message?: {
    id?: string;
    role?: string;
    model?: string;
    content?: string | ContentBlock[];
    usage?: UsageBlock;
  };
  subtype?: string;
}

export interface ContentBlock {
  type: string;
  text?: string;
  name?: string;
  input?: Record<string, unknown>;
}

export interface UsageBlock {
  input_tokens?: number;
  output_tokens?: number;
  cache_read_input_tokens?: number;
  cache_creation_input_tokens?: number;
}

export interface SkillDetection {
  name: string;
  trigger_type: "user_slash" | "model_tool_call";
}

export interface ParseState {
  source_key: string;
  last_byte_offset: number;
  last_file_size: number;
  last_mtime_ms: number;
}

export interface TaskUsageRow {
  task_name: string;
  total_input: number;
  total_output: number;
  total_cache_read: number;
  total_cache_create: number;
  total_reasoning: number;
  total_tokens: number;
  runs: number;
  invocation_count: number;
  avg_tokens_per_run: number;
}
