# Who Ate My Tokens

Claude Code의 로컬 JSONL 로그를 분석해서 스킬/태스크별 토큰 사용량을 리포트하는 CLI 도구.

## 설치

```bash
npm install -g @ese111/who-ate-my-tokens
```

## 사용법

### 빠른 시작

```bash
# 1. 설치
npm install -g @ese111/who-ate-my-tokens

# 2. 로그 동기화 (최초 1회 필수)
who-ate-my-tokens sync

# 3. 리포트 확인
who-ate-my-tokens report
```

### `sync` — 로그 동기화

`~/.claude/projects/` 디렉토리의 JSONL 세션 로그를 파싱해서 로컬 SQLite DB(`~/.claude/skillsToken/data.sqlite`)에 저장합니다. 증분 파싱을 지원하므로 변경된 파일의 새 바이트만 읽습니다.

```bash
who-ate-my-tokens sync
```

| 옵션 | 설명 |
|------|------|
| `--reset` | DB를 초기화하고 전체 재파싱 (확인 프롬프트 표시) |
| `-y, --force` | `--reset`과 함께 사용. 확인 없이 바로 실행 |

```bash
who-ate-my-tokens sync --reset       # 확인 프롬프트 표시
who-ate-my-tokens sync --reset -y    # 확인 없이 바로 실행
```

### `report` — 토큰 사용량 리포트

```bash
who-ate-my-tokens report [options]
```

| 옵션 | 기본값 | 설명 |
|------|--------|------|
| `-s, --since <period>` | `30d` | 조회 기간 |
| `-b, --by <grouping>` | `task` | 그룹 기준: `task` 또는 `model` |

**기간 형식:**

| 형식 | 예시 | 설명 |
|------|------|------|
| `Nd` | `7d`, `30d` | N일 전부터 |
| `Nh` | `24h` | N시간 전부터 |
| `Nw` | `2w` | N주 전부터 |
| `Nm` | `3m` | N개월 전부터 |
| ISO 날짜 | `2026-04-01` | 특정 날짜부터 |

```bash
# 스킬/태스크별 (기본)
who-ate-my-tokens report
who-ate-my-tokens report --since 7d

# 모델별
who-ate-my-tokens report --by model
who-ate-my-tokens report --since 2w --by model
```

### `verify` — 데이터 정합성 검증

DB에 저장된 데이터가 원본 JSONL과 일치하는지 확인합니다. 커버리지(누락/초과), 토큰 수 불일치, 태스크 귀속 불일치를 검사합니다.

```bash
who-ate-my-tokens verify [options]
```

| 옵션 | 설명 |
|------|------|
| `-d, --detail` | 세션별 불일치 상세 내역 표시 |
| `-s, --session <id>` | 특정 세션만 검증 (prefix match) |

```bash
who-ate-my-tokens verify                       # 전체 요약
who-ate-my-tokens verify --detail              # 세션별 상세
who-ate-my-tokens verify --session abc123      # 특정 세션만
```

### 환경 변수

| 변수 | 기본값 | 설명 |
|------|--------|------|
| `CLAUDE_CONFIG_DIR` | `~/.claude` | Claude Code 설정 디렉토리 경로 |

## 리포트 예시

```
Skill/Task Token Usage (since 2026. 3. 31.)
48 sessions, 8698 API calls

┌───────────────────┬──────┬────────┬───────────┬─────────────┬──────────────┬────────┬─────────┐
│ Task              │ Runs │  Input │    Output │  Cache Read │ Cache Create │  Total │ Avg/Run │
├───────────────────┼──────┼────────┼───────────┼─────────────┼──────────────┼────────┼─────────┤
│ (general)         │  178 │ 30,861 │ 2,560,307 │ 751,664,066 │   17,976,417 │ 772.2M │    4.3M │
│ pr                │   53 │  6,344 │    77,629 │  34,471,472 │      603,805 │  35.2M │  663.4K │
│ autodev           │    2 │     60 │    26,095 │   3,540,608 │      344,511 │   3.9M │    2.0M │
│ ...               │      │        │           │             │              │        │         │
│ Total             │      │        │           │             │              │ 872.6M │         │
└───────────────────┴──────┴────────┴───────────┴─────────────┴──────────────┴────────┴─────────┘
```

## 동작 원리

1. `~/.claude/projects/` 디렉토리의 JSONL 세션 로그를 읽음
2. assistant 메시지에서 토큰 사용량(input, output, cache read, cache create, reasoning) 추출
3. 스킬/태스크 경계를 감지해서 각 토큰을 해당 스킬에 귀속
4. SQLite DB에 저장하고 집계 리포트 생성

증분 파싱을 지원해서 변경된 파일의 새 바이트만 읽습니다.

## License

MIT
