---
difficulty: 3
reading_time: 25분
interview_frequency: 5
importance: 5
---

# 05. Clustered Index와 Composite Index


## 학습 목표

- Clustered Index가 행 저장과 밀접한 이유와 Secondary Lookup 비용을 설명할 수 있다.
- Composite Index의 Leftmost Prefix 규칙과 동등·범위 조건이 열 순서에 미치는 영향을 설명할 수 있다.
- Clustered Key 선택이 Secondary Index 크기와 삽입 패턴에 미치는 영향을 설명할 수 있다.
- 게임 서버에서 서버별 랭킹 조회에 적합한 Composite Index를 설계할 수 있다.

## 1. 개요

클러스터드 인덱스는 행 데이터의 물리적 배치와 밀접한 기본 구조이고 복합 인덱스는 여러 열을 순서 있게 하나의 키로 구성한다.

클러스터드 인덱스(Clustered Index)는 테이블 행 자체의 저장 순서·리프 구조와 밀접하게 연결된 인덱스다. 한 테이블의 행을 서로 다른 두 순서로 동시에 배치할 수 없으므로 하나만 둘 수 있다는 설명이 핵심이다. 다만 DBMS마다 구현과 명칭이 다르므로 제품 독립적인 절대 구조로 말하지 않는다.

복합 인덱스(Composite Index)는 `(server_id, score, player_id)`처럼 둘 이상의 열을 정해진 순서로 하나의 검색 키로 만든다. 열 집합만 같아도 순서가 다르면 지원하는 쿼리가 달라진다.

## 2. 왜 필요한가

조회 패턴에 맞는 행 배치와 열 순서로 정렬·필터 비용을 줄인다.

단일 열 인덱스를 여러 개 두는 것만으로 여러 조건과 정렬을 항상 효율적으로 처리할 수는 없다. 서버 3의 랭킹 상위 100명을 찾을 때 `server_id`로 범위를 좁히고 그 안에서 `score` 순서가 유지되면 별도 정렬과 많은 행 읽기를 줄일 수 있다.

클러스터드 키는 모든 행의 물리 배치와 보조 인덱스의 행 참조 방식에 영향을 줄 수 있어 선택의 파급 범위가 크다. 자주 변경되는 큰 무작위 키를 선택하면 페이지 분할, 행 이동과 보조 인덱스 크기가 증가할 수 있다.

## 3. 핵심 동작 원리

```text
Clustered B+Tree
Root → Internal → Leaf [전체 Row Data 또는 행 저장 구조]

Nonclustered B+Tree
Root → Internal → Leaf [Index Key + Row Locator]
                                   ↓
                          Clustered Key 또는 Row 위치
```

### Clustered Key 선택 기준

클러스터드 키에는 다음 성질이 유리하다.
- **좁음**: 보조 인덱스 로케이터에 반복되어 크기를 줄인다.
- **안정적임**: 값 변경은 행 위치와 참조 갱신을 유발할 수 있다.
- **고유함**: 행을 명확히 식별한다.
- **삽입 예측 가능**: 무작위 분할과 단일 Hot Page 사이를 부하에 맞춰 판단한다.

InnoDB는 PK를 Clustered Key로 사용한다. PostgreSQL의 `CLUSTER`는 일회성 재배치이고 이후 쓰기에서 물리 순서를 자동으로 유지하지 않는다. "모든 DB에서 PK가 반드시 Clustered다"처럼 일반화하지 않는다.

### Secondary Lookup 비용

Secondary Index로 조건에 맞는 행을 찾은 뒤 필요한 열이 인덱스에 없으면 Row Locator로 Clustered 구조를 다시 탐색한다.

```text
Secondary Index(status) → 10만 Entry
각 Entry의 PK로 Clustered Lookup 10만 번
→ 많은 Random Page 접근
```

결과가 적으면 효율적이지만 수만 행이면 반복 Lookup보다 Full Scan이 저렴할 수 있다.

### Composite Index의 Leftmost Prefix

`(A, B, C)` 인덱스는 선두 열부터 사전식으로 정렬된다.

```text
인덱스 (server_id, score, player_id) 정렬 순서:
(1, 900, 7)
(1, 900, 9)
(1, 950, 2)
(2, 100, 4)
(2, 800, 1)
```

`server_id = 1`이면 연속 범위를 바로 찾고 그 안에서 score 순서를 활용한다. `score = 900`만 조건이면 여러 server_id 구간에 흩어져 선두 탐색이 어렵다.

### 범위 조건 이후 열

복합 인덱스에서 앞 열이 범위 조건이면 뒤 열은 탐색 경계를 추가로 좁히기 어렵다. 잔여 필터(Index Condition Pushdown)로 적용될 수 있지만 날짜 범위 전체를 읽을 가능성이 있다.

### ORDER BY와 방향

인덱스 순서가 WHERE로 고정된 Prefix 뒤의 ORDER BY와 맞으면 Sort를 피할 수 있다. 혼합 방향 지원은 DBMS와 버전에 따라 다를 수 있으므로 실행 계획으로 확인한다.

## 4. 쉬운 예시

```sql
-- 서버별 랭킹 Composite Index 설계
CREATE INDEX idx_ranking_server_score
  ON ranking (server_id, score DESC, player_id);

-- 유리한 쿼리: server_id 동등 + score 범위 + score 정렬
SELECT player_id, score
FROM ranking
WHERE server_id = 3
  AND score >= 1000
ORDER BY score DESC
LIMIT 100;
-- server_id 동등 → score 범위 → score 정렬 Sort 생략 가능

-- 선두 없는 조건: 인덱스 활용 어려움
SELECT player_id
FROM ranking
WHERE score >= 1000;
-- idx_ranking_server_score 활용 어려움 → score 단독 인덱스가 필요하면 별도 생성
```

```sql
-- Leftmost Prefix 예시: idx_composite (A, B, C)
-- 유리한 조건
WHERE A = 1               -- A 탐색 O
WHERE A = 1 AND B = 2     -- A, B 탐색 O
WHERE A = 1 AND B >= 100  -- A 동등 + B 범위 O

-- 불리한 조건: 선두 없음
WHERE B = 2               -- A 없음: 전체 스캔 가능성
WHERE A = 1 AND C = 5     -- A 범위 후 C는 잔여 필터 (탐색 경계 아님)
```

```sql
-- InnoDB Clustered Key 선택: UUID PK vs BIGINT PK
-- BAD: UUID PK → CHAR(36)은 36바이트가 모든 Secondary Index 리프에 반복
CREATE TABLE player (
    player_id CHAR(36) PRIMARY KEY,
    nickname  VARCHAR(32),
    score     INT
);
CREATE INDEX idx_score ON player (score);
-- idx_score 리프: (score, player_id CHAR(36) = 36바이트) 반복

-- GOOD: 짧은 BIGINT PK → Secondary Index 크기 감소
CREATE TABLE player (
    id        BIGINT AUTO_INCREMENT PRIMARY KEY,  -- 8바이트
    player_id CHAR(36) NOT NULL UNIQUE,           -- 비즈니스 키
    nickname  VARCHAR(32),
    score     INT
);
CREATE INDEX idx_score ON player (score);
-- idx_score 리프: (score, id 8바이트) 반복
```

## 5. 비슷한 개념과 비교

| 구분 | Clustered Index | Nonclustered Index |
|---|---|---|
| 리프 | 행 저장과 밀접 | Key와 Row Locator |
| 개수 | 일반적으로 한 배치 순서 | 여러 개 가능 |
| 장점 | Key 범위의 Row 지역성 | 다양한 조회 경로 |
| 비용 | Key 선택이 전체 테이블에 영향 | 추가 저장·쓰기·Lookup |

| 복합 인덱스 조건 | 탐색 효율 |
|---|---|
| `A = ?` | 선두 범위 좁힘 O |
| `A = ? AND B = ?` | 두 열 모두 좁힘 O |
| `A = ? AND B >= ?` | A 동등 + B 범위 O |
| `B = ?` (A 없음) | 선두 없음: 탐색 범위 좁히기 어려움 |
| `A = ? AND B >= ? AND C = ?` | B 범위 후 C는 잔여 필터 |

열 집합이 같아도 순서가 다르면 지원하는 쿼리가 달라진다. `(server_id, score)`와 `(score, server_id)`는 서로 다른 쿼리에 유리하다.

## 6. 장점과 단점

**Clustered Index의 장점**

- Key 범위의 행이 물리적으로 인접해 범위 조회 I/O가 줄어든다.
- Clustered 키로 직접 행을 찾으면 Lookup이 없다.

**Clustered Index의 단점**

- 한 가지 순서만 선택할 수 있어 다른 조회 패턴에는 보조 인덱스가 필요하다.
- 무작위 키 삽입은 Page Split을 늘리고 단조 증가 키는 마지막 페이지가 Hot Spot이 될 수 있다.
- Clustered Key가 크면 모든 Secondary Index 리프에 반복되어 크기가 늘어난다.

**Composite Index의 장점**

- 조건·정렬·Covering을 한 구조에서 지원해 단일 열 인덱스보다 효율적으로 처리할 수 있다.
- Leftmost Prefix 쿼리가 많을 때 여러 단일 인덱스를 대체할 수 있다.

**Composite Index의 단점**

- 열 순서가 쿼리에 맞지 않으면 탐색 효율이 작다.
- 열이 늘어날수록 인덱스 크기와 쓰기 비용이 증가한다.
- 비슷한 Prefix의 중복 인덱스는 쓰기 비용만 늘린다.

## 7. 게임 서버·백엔드 실무 예시

서버별 랭킹은 `(server_id, score DESC, player_id)` 후보가 된다. 무작위 큰 PK는 보조 인덱스 크기와 페이지 분할에 영향을 줄 수 있어 실제 엔진을 확인한다.

인덱스는 열 목록이 아니라 중요 쿼리에서 역설계한다.

1. WHERE의 동등 조건과 범위 조건을 구분한다.
2. JOIN Key, ORDER BY, LIMIT를 적는다.
3. 반환 행 수와 데이터 분포, 테넌트별 편향을 확인한다.
4. 동등 Prefix 뒤에 범위·정렬 열을 배치하는 후보를 만든다.
5. 출력 열 Covering의 이익과 크기를 비교한다.
6. 기존 인덱스가 후보의 선두 Prefix로 중복되는지 확인한다.
7. 실제 실행 계획, 읽은 Page, Sort·Lookup과 쓰기 비용을 측정한다.

인벤토리 조회 `WHERE player_id=? ORDER BY slot`에는 `(player_id, slot)` UNIQUE가 슬롯 중복 방지와 정렬을 동시에 제공한다. 이벤트 로그 `WHERE player_id=? AND created_at>=? ORDER BY created_at`에는 `(player_id, created_at)`이 유리하다.

## 8. 자주 하는 오해

- **"모든 DB에서 Primary Key가 반드시 Clustered Index다"**: InnoDB는 PK를 Clustered Key로 사용하지만 PostgreSQL의 CLUSTER는 일회성 재배치이고 제품마다 구현이 다르다. "제품별 차이가 있다"고 전제한다.
- **"Composite Index는 열 집합이 같으면 순서는 무관하다"**: B+Tree는 선두 열부터 사전식으로 정렬된다. `(server_id, score)`와 `(score, server_id)`는 지원하는 쿼리가 다르다.
- **"선택도가 높은 열을 항상 첫 번째에 둬야 한다"**: 동등 조건 Prefix로 범위를 먼저 좁히는 것이 더 중요하다. 다른 쿼리의 Prefix 재사용, 정렬, 데이터 분포도 함께 본다.
- **"범위 조건 뒤 열은 전혀 필터에 쓰이지 않는다"**: 탐색 경계를 추가로 좁히기 어렵지만 Index Condition Pushdown으로 잔여 필터로 적용될 수 있다. 탐색 범위와 필터 적용을 구분한다.
- **"단일 열 Index 여러 개가 Composite Index를 항상 대체한다"**: Index Intersection이 가능한 DBMS도 있지만 결합 정렬과 Covering을 항상 대체하지는 못한다. 실행 계획으로 확인한다.
- **"Clustered Key는 자주 바뀌어도 괜찮다"**: Clustered Key 변경은 행 위치 이동과 모든 Secondary Index의 Locator 갱신을 유발할 수 있다. 안정적이고 변경이 드문 키를 선택한다.
- **"UUID PK는 항상 성능 문제가 있다"**: UUID 자체가 문제가 아니라 InnoDB 성격의 Clustered 구조에서 무작위 삽입이 Page Split을 늘린다. 시간 순서 UUID(UUIDv7 등)나 짧은 대리키가 대안이 될 수 있다. 측정으로 검증한다.

## 9. 면접 질문

### Q1. Clustered와 Nonclustered Index의 차이를 설명해 주세요.

Clustered Index는 행 데이터의 저장 구조와 밀접해 리프가 행 자체를 담거나 행 배치를 결정한다. Nonclustered Index는 별도 Key 순서와 행 Locator를 저장해 추가 접근 경로를 제공한다. Nonclustered로 찾은 행이 Clustered 구조에 없는 열을 필요로 하면 Lookup이 발생한다. 정확한 리프와 Locator 형태는 DBMS마다 다르다.

### Q2. Composite Index의 열 순서는 어떻게 정하나요?

중요 쿼리의 동등 조건, 범위 조건, ORDER BY와 LIMIT에서 역설계한다. 보통 동등 조건 Prefix로 범위를 먼저 좁히고 범위·정렬 열을 이어 붙인다. 다른 쿼리의 Prefix 재사용, 데이터 분포와 Covering 이점도 함께 본다. 선택도만으로 결정하지 않는다.

### Q3. `(A,B,C)` Index로 어떤 조건을 효율적으로 찾나요?

A, A+B, A+B+C 같은 선두 Prefix 조건에 유리하다. A 없이 B나 C만으로는 시작 범위를 좁히기 어렵다. A가 범위 조건이면 B는 탐색 경계를 추가로 좁히기 어렵고 잔여 필터로 적용될 수 있다.

### Q4. Secondary Index Lookup이란 무엇이고 언제 문제가 되나요?

Secondary Index로 조건에 맞는 행을 찾은 뒤 인덱스에 없는 열이 필요하면 Row Locator로 Clustered 구조를 다시 탐색하는 것이다. 결과 행이 적으면 효율적이지만 수만 행이면 무작위 접근이 누적되어 Full Scan보다 비쌀 수 있다. Covering Index로 필요한 열을 포함하면 Lookup을 줄일 수 있다.

### Q5. Clustered Key는 어떤 기준으로 선택하나요?

짧고, 안정적이며(변경이 드물고), 고유한 값이 유리하다. 큰 무작위 키는 모든 Secondary Index 리프에 반복되어 크기가 늘어나고 Page Split이 잦다. 자주 변경되면 행 위치 이동과 Secondary Index Locator 갱신이 발생한다. 삽입 패턴도 Hot Spot과 분산을 고려한다.

### Q6. 서버별 랭킹 범위 조회 인덱스를 어떻게 설계하나요?

`server_id` 동등 조건으로 범위를 좁히고 그 안에서 `score` 범위와 정렬을 활용하는 `(server_id, score DESC, player_id)` 후보를 만든다. `player_id`는 동일 score의 결정적 순서와 Covering 효과를 준다. 단 점수가 자주 갱신되면 인덱스도 함께 갱신되므로 읽기·쓰기 비율을 측정해 결정한다.

## 10. 예상 꼬리질문

- 범위 조건 이후 열은 어떻게 사용되나요?
- Composite Index가 ORDER BY를 만족하는 조건은 무엇인가요?
- InnoDB에서 PK가 Secondary Index에 어떤 영향을 주나요?
- 단조 증가 PK와 UUID PK의 차이는 무엇인가요?
- INCLUDE 열이 Key 열과 어떻게 다른가요?
- Index Intersection이란 무엇인가요?
- 인덱스 열 순서를 바꿔야 할 때 어떻게 하나요?

## 11. 30초 모범답변

> 클러스터드 인덱스는 행 저장 구조와 연결되고 복합 인덱스는 열 순서가 핵심입니다. 복합 인덱스는 선두 열부터 사전식으로 정렬되므로 선두 Prefix 쿼리에 유리합니다. 서버별 랭킹에서는 `(server_id, score DESC, player_id)` 순서로 server_id 동등 조건으로 범위를 좁히고 score 정렬 Sort를 피할 수 있습니다.

## 12. 1~2분 확장답변

> 클러스터드 인덱스는 행 저장 구조와 연결되어 Clustered Key로 직접 행을 찾으면 Lookup이 없지만 Secondary Index는 Row Locator로 다시 탐색하는 Lookup이 발생합니다. Clustered Key는 짧고 안정적인 값이 유리하며 UUID를 CHAR(36)으로 쓰면 모든 Secondary Index 리프에 36바이트가 반복됩니다 (BINARY(16) 저장 시 16바이트). 복합 인덱스는 선두 열부터 사전식으로 정렬되어 동등 조건 Prefix 뒤에 범위·정렬 열을 배치하는 것이 일반적입니다. 열 집합이 같아도 순서가 다르면 지원하는 쿼리가 달라집니다. 인덱스는 중요 쿼리에서 역설계해 동등·범위·ORDER BY·LIMIT와 반환 열을 분석하고 실행 계획으로 검증합니다.

## 13. 핵심 요약

- Clustered Index는 행 데이터의 저장 구조와 밀접하게 연결된다. 제품마다 구현 방식이 다르므로 절대 구조로 말하지 않는다.
- Secondary Index로 찾은 뒤 인덱스에 없는 열이 필요하면 Lookup이 발생한다. 결과 행이 많으면 무작위 접근이 누적되어 Full Scan보다 비쌀 수 있다.
- Clustered Key는 짧고 안정적이며 고유한 값이 유리하다. 큰 무작위 키는 Page Split을 늘리고 모든 Secondary Index 리프에 반복된다.
- Composite Index는 선두 열부터 사전식으로 정렬된다. 열 집합이 같아도 순서가 다르면 지원하는 쿼리가 달라진다.
- Leftmost Prefix: 동등 조건 Prefix로 범위를 먼저 좁히고 범위·정렬 열을 이어 붙인다. 선두 없이 중간 열만 조건이면 탐색 범위를 좁히기 어렵다.
- 범위 조건 이후 열은 탐색 경계를 추가로 좁히기 어렵지만 잔여 필터로 적용될 수 있다.
- 인덱스는 중요 쿼리에서 역설계한다. 동등·범위·ORDER BY·LIMIT와 반환 열을 분석하고 실행 계획으로 검증한다.
- 단일 열 인덱스 여러 개가 Composite Index를 대체하는지는 Index Intersection 지원과 실행 계획으로 확인한다. 결합 정렬과 Covering 효과를 항상 제공하지는 않는다.

## 한 줄 정리

> 클러스터드 인덱스는 행 저장 구조와 연결되고 복합 인덱스는 선두 열부터 사전식 정렬이 핵심입니다. 쿼리의 동등·범위·정렬 패턴에서 역설계하고 실행 계획으로 검증합니다.
