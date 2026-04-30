# Who Ate My Tokens

Claude Code의 로컬 JSONL 로그를 분석해서 스킬/태스크별 토큰 사용량을 리포트하는 CLI 도구.

## 설치

```bash
npm install -g @ese111/who-ate-my-tokens
```

## 사용법

### 1. 로그 동기화

Claude Code 세션 로그를 파싱해서 로컬 DB에 저장합니다.

```bash
who-ate-my-tokens sync
```

DB를 초기화하고 전체 재파싱:

```bash
who-ate-my-tokens sync --reset       # 확인 프롬프트 표시
who-ate-my-tokens sync --reset -y    # 확인 없이 바로 실행
```

### 2. 리포트

스킬/태스크별 토큰 사용량:

```bash
who-ate-my-tokens report --since 30d
who-ate-my-tokens report --since 7d
who-ate-my-tokens report --since 2026-04-01
```

모델별 토큰 사용량:

```bash
who-ate-my-tokens report --since 30d --by model
```

기간 형식: `7d`(일), `2w`(주), `3m`(개월), `24h`(시간), ISO 날짜

### 3. 검증

DB 데이터와 원본 JSONL의 정합성을 확인합니다.

```bash
who-ate-my-tokens verify
who-ate-my-tokens verify --detail              # 세션별 상세
who-ate-my-tokens verify --session abc123      # 특정 세션
```

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
