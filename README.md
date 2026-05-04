# Who Ate My Tokens

Claude Code, Codex, Gemini의 로컬 로그를 분석해서 토큰 사용량과 비용을 리포트하는 CLI 도구.

## 설치

```bash
npm install -g @ese111/who-ate-my-tokens
```

## 사용법

### 빠른 시작

```bash
# 1. 로그 동기화 (최초 1회 필수)
who-ate-my-tokens sync

# 2. 리포트 확인
who-ate-my-tokens report
```

### `sync` — 로그 동기화

각 AI 도구의 로컬 로그를 파싱해서 SQLite DB에 저장합니다.

| Provider | 로그 경로 | 포맷 |
|----------|----------|------|
| Claude Code | `~/.claude/projects/*/*.jsonl` | JSONL (증분 파싱) |
| Codex | `~/.codex/sessions/**/*.jsonl` | JSONL (증분 파싱) |
| Gemini | `~/.gemini/tmp/*/chats/session-*.json` | JSON (전체 파싱) |

```bash
who-ate-my-tokens sync
who-ate-my-tokens sync --reset        # DB 초기화 후 전체 재파싱
who-ate-my-tokens sync --reset -y     # 확인 없이 바로 실행
```

| 옵션 | 설명 |
|------|------|
| `--reset` | DB를 초기화하고 전체 재파싱 (확인 프롬프트 표시) |
| `-y, --yes` | `--reset`과 함께 사용. 확인 없이 바로 실행 |

### `report` — 토큰 사용량 리포트

```bash
who-ate-my-tokens report [options]
```

| 옵션 | 기본값 | 설명 |
|------|--------|------|
| `-s, --since <period>` | `30d` | 조회 기간 |
| `-b, --by <grouping>` | `task` | 그룹 기준: `task`, `model`, `provider` |
| `-p, --provider <name>` | 전체 | 프로바이더 필터: `claude`, `codex`, `gemini` |
| `--json` | - | JSON 형식으로 출력 |

**기간 형식:**

| 형식 | 예시 | 설명 |
|------|------|------|
| `Nd` | `7d`, `30d` | N일 전부터 |
| `Nh` | `24h` | N시간 전부터 |
| `Nw` | `2w` | N주 전부터 |
| `Nm` | `3m` | N개월 전부터 |
| ISO 날짜 | `2026-04-01` | 특정 날짜부터 |

```bash
# 태스크별 (기본)
who-ate-my-tokens report
who-ate-my-tokens report --since 7d

# 모델별 (비용 추정 포함)
who-ate-my-tokens report --by model

# 프로바이더별
who-ate-my-tokens report --by provider

# Claude만 필터
who-ate-my-tokens report -p claude --since 2w

# JSON 출력 (스크립트 연동용)
who-ate-my-tokens report --by model --json
```

### `verify` — 데이터 정합성 검증

DB에 저장된 데이터가 원본 JSONL과 일치하는지 확인합니다. 커버리지(누락/초과), 토큰 수 불일치, 태스크 귀속 불일치를 검사합니다.

```bash
who-ate-my-tokens verify                       # 전체 요약
who-ate-my-tokens verify --detail              # 세션별 상세
who-ate-my-tokens verify --session abc123      # 특정 세션만
```

| 옵션 | 설명 |
|------|------|
| `-d, --detail` | 세션별 불일치 상세 내역 표시 |
| `-s, --session <id>` | 특정 세션만 검증 (prefix match) |

## 리포트 예시

### 태스크별

```
Skill/Task Token Usage (since 2026. 4. 27.)
18 sessions, 2454 API calls

┌───────────────────┬──────┬───────────┬─────────┬─────────────┬──────────────┬────────┬─────────┐
│ Task              │ Runs │     Input │  Output │  Cache Read │ Cache Create │  Total │ Avg/Run │
├───────────────────┼──────┼───────────┼─────────┼─────────────┼──────────────┼────────┼─────────┤
│ (general)         │   37 │ 2,165,283 │ 713,163 │ 188,063,707 │    4,703,252 │ 195.7M │    5.3M │
│ autodev           │    7 │     5,764 │ 151,203 │  23,866,699 │      899,367 │  24.9M │    3.6M │
│ pr-review         │    3 │        71 │  13,507 │   7,322,133 │      335,714 │   7.7M │    2.6M │
│ ...               │      │           │         │             │              │        │         │
│ Total             │      │           │         │             │              │ 236.5M │         │
└───────────────────┴──────┴───────────┴─────────┴─────────────┴──────────────┴────────┴─────────┘
```

### 프로바이더별

```
Token Usage by Provider (since 2026. 4. 4.)

┌──────────┬──────────┬───────┬───────────┬───────────┬─────────────┬───────────┬────────┐
│ Provider │ Sessions │ Calls │     Input │    Output │  Cache Read │ Reasoning │  Total │
├──────────┼──────────┼───────┼───────────┼───────────┼─────────────┼───────────┼────────┤
│ claude   │       51 │ 9,006 │    48,932 │ 2,931,824 │ 869,768,262 │         0 │ 895.0M │
│ codex    │        4 │   126 │ 6,953,751 │    71,487 │   6,057,344 │    30,930 │  13.1M │
│ Total    │          │       │           │           │             │           │ 908.1M │
└──────────┴──────────┴───────┴───────────┴───────────┴─────────────┴───────────┴────────┘
```

### 모델별 (비용 추정)

```
Token Usage by Model (since 2026. 4. 4.)

┌──────────┬─────────────────┬───────┬────────┬────────┬─────────────┬──────────────┬────────┬───────────┐
│ Provider │ Model           │ Calls │  Input │ Output │  Cache Read │ Cache Create │  Total │ Est. Cost │
├──────────┼─────────────────┼───────┼────────┼────────┼─────────────┼──────────────┼────────┼───────────┤
│ claude   │ claude-opus-4-6 │ 8,996 │ 48,932 │  2.9M  │       869M  │        22.3M │ 895.0M │  $1942.81 │
│ codex    │ gpt-5.4         │    60 │  3.9M  │ 29,319 │        3.4M │            0 │   7.4M │       N/A │
│ codex    │ gpt-5.4-mini    │    66 │  3.0M  │ 42,168 │        2.7M │            0 │   5.8M │       N/A │
└──────────┴─────────────────┴───────┴────────┴────────┴─────────────┴──────────────┴────────┴───────────┘
```

> Claude 모델은 공개된 API 가격 기준으로 비용을 추정합니다. Codex/Gemini는 가격 정보가 없어 N/A로 표시됩니다.

## 동작 원리

1. 각 AI 도구의 로컬 로그 파일을 읽음
2. assistant 메시지에서 토큰 사용량(input, output, cache read, cache create, reasoning) 추출
3. Claude의 경우 스킬/태스크 경계를 감지해서 각 토큰을 해당 스킬에 귀속
4. SQLite DB에 저장하고 집계 리포트 생성

증분 파싱(Claude, Codex)을 지원해서 변경된 파일의 새 바이트만 읽습니다.

### 환경 변수

| 변수 | 기본값 | 설명 |
|------|--------|------|
| `CLAUDE_CONFIG_DIR` | `~/.claude` | Claude Code 설정 디렉토리 경로 |

## License

MIT
