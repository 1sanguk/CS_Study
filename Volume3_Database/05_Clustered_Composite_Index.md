---
difficulty: 3
reading_time: 25분
interview_frequency: 5
importance: 5
---

# 05. Clustered Index와 Composite Index

> 게임 서버·백엔드 개발자를 위한 CS 면접 교재

## 학습 목표

- 한 줄 정의와 등장 이유를 설명할 수 있다.
- 핵심 동작과 비교 개념을 설명할 수 있다.
- 게임 백엔드의 정합성과 성능 설계에 적용할 수 있다.

## 1. 개요

클러스터드 인덱스는 행 데이터의 물리적 배치와 밀접한 기본 구조이고 복합 인덱스는 여러 열을 순서 있게 하나의 키로 구성한다.

클러스터드 인덱스(Clustered Index)는 테이블 행 자체의 저장 순서·리프 구조와 밀접하게 연결된 인덱스다. 일반적으로 한 테이블의 행을 서로 다른 두 순서로 동시에 배치할 수 없으므로 하나만 둘 수 있다는 설명이 핵심이다. 다만 DBMS마다 “클러스터드”를 구현하고 부르는 방식이 다르므로 제품 독립적인 절대 구조로 말하지 않는다.

복합 인덱스(Composite Index)는 `(server_id, score, player_id)`처럼 둘 이상의 열을 정해진 순서로 하나의 검색 키로 만든다. 인덱스는 첫 열로 먼저 정렬되고 같은 첫 열 안에서 두 번째 열, 이어 세 번째 열 순으로 정렬된다. 열 집합만 같아도 순서가 다르면 지원하는 쿼리가 달라진다.

## 2. 왜 필요한가
조회 패턴에 맞는 행 배치와 열 순서로 정렬·필터 비용을 줄인다. 데이터베이스 선택은 편의가 아니라 불변식, 조회 패턴, 장애 복구 요구에서 출발한다.

단일 열 인덱스를 여러 개 두는 것만으로 여러 조건과 정렬을 항상 효율적으로 처리할 수는 없다. 서버 3의 랭킹 상위 100명을 찾을 때 `server_id`로 범위를 좁히고 그 안에서 `score` 순서가 이미 유지되면 별도 정렬과 많은 행 읽기를 줄일 수 있다.

클러스터드 키는 모든 행의 물리 배치와 보조 인덱스의 행 참조 방식에 영향을 줄 수 있어 선택의 파급 범위가 크다. 자주 변경되는 큰 무작위 키를 선택하면 페이지 분할, 행 이동과 보조 인덱스 크기가 증가할 수 있다. 반대로 단조 증가 키는 삽입 지역성이 좋지만 동시 쓰기가 끝 페이지에 몰릴 수 있다.

## 3. 핵심 동작 원리
```text
index (server_id, score, player_id)→left prefix search→leaf row
```
복합 인덱스는 보통 선두 열부터 조건이 연결될 때 효과적이다. 동등 조건, 범위 조건, 정렬과 선택도를 고려한다. DB 제품별 클러스터드 구현은 다르다.

Clustered Index와 Composite Index에서는 논리 모델과 물리 실행을 구분한다. 같은 SQL도 통계, 데이터 분포, 인덱스와 동시 부하에 따라 실행 비용이 달라진다.

### Clustered와 Nonclustered의 개념

```text
Clustered B+Tree
Root → Internal → Leaf [전체 Row Data 또는 행 저장 구조]

Nonclustered B+Tree
Root → Internal → Leaf [Index Key + Row Locator]
                                   |
                                   v
                          Clustered Key 또는 Row 위치
```

SQL Server 계열 설명에서는 Clustered Index 리프가 데이터 페이지이고 Nonclustered 리프가 Clustered Key 또는 RID를 행 로케이터로 가진다. InnoDB에서는 테이블이 Primary Key 중심의 Clustered 구조로 저장되고 Secondary Index 리프가 Primary Key 값을 포함하는 방식으로 설명한다. PostgreSQL의 `CLUSTER`는 인덱스 순서로 테이블을 재배치하지만 이후 쓰기에서도 물리 순서를 자동으로 계속 유지하는 동일 개념의 Clustered Index는 아니다.

면접에서 특정 제품이 정해지지 않았다면 “행 저장과 밀접하고 제품별 구현 차이가 있다”고 전제한다. “모든 DB에서 PK가 무조건 Clustered Index다” 같은 단정은 피한다.

### Clustered Key 선택 기준

클러스터드 키에는 다음 성질이 유리할 수 있다.

- 좁음: 보조 인덱스 로케이터와 페이지에 반복될 수 있어 크기를 줄인다.
- 안정적임: 값 변경은 행 위치와 참조 갱신을 유발할 수 있다.
- 고유함: 행을 명확히 식별한다. 비고유 키에는 엔진이 내부 식별자를 더할 수 있다.
- 삽입 패턴이 예측 가능함: 무작위 분할과 단일 Hot Page 사이를 부하에 맞춰 판단한다.

업무상 의미가 큰 이메일을 Clustered Key로 선택하면 길고 변경 가능하다. 짧은 대리키를 PK·Clustered Key로 두고 이메일은 UNIQUE Nonclustered Index로 보호하는 설계가 흔하다. 그러나 시간 범위 조회가 압도적으로 중요하거나 저장 엔진이 다른 구조라면 선택이 달라질 수 있다.

### Secondary Lookup 비용

Secondary Index로 조건을 찾은 뒤 필요한 열이 인덱스에 없으면 행 로케이터로 Clustered 구조를 다시 탐색한다. 이를 Key Lookup, Bookmark Lookup 또는 Table Lookup 관점으로 설명할 수 있다.

```text
Secondary Index(status)
    ↓ 10만 Entry
각 Entry의 PK로 Clustered Lookup 10만 번
    ↓
많은 Random Page 접근
```

결과가 적으면 효율적이지만 수만 행이면 반복 Lookup보다 Clustered/Table Scan이 저렴할 수 있다. Covering Index로 필요한 열을 포함하면 Lookup을 줄일 수 있지만 인덱스 크기와 쓰기 비용이 늘어난다.

### Composite Index의 정렬 순서

`(server_id, score, player_id)`는 사전식 순서로 정렬된다.

```text
(1, 900, 7)
(1, 900, 9)
(1, 950, 2)
(2, 100, 4)
(2, 800, 1)
```

`server_id = 1`이면 연속 범위를 찾을 수 있고 그 안에서 score 순서를 활용한다. `score = 900`만 조건으로 주면 서로 다른 server_id 구간에 흩어져 있어 일반적으로 선두 탐색이 어렵다. 일부 DBMS는 Skip Scan 등 최적화를 사용할 수 있지만 기본 설계를 예외 기능에 의존하지 않는다.

다음 쿼리를 생각해 보자.

```sql
SELECT player_id, score
FROM ranking
WHERE server_id = 3
  AND score >= 1000
ORDER BY score DESC, player_id
LIMIT 100;
```

`server_id`는 동등 조건, `score`는 범위와 정렬, `player_id`는 동일 score의 결정적 순서를 제공한다. `(server_id, score DESC, player_id)` 후보가 자연스럽다. 출력 열까지 포함되어 Covering 가능한지도 제품의 INCLUDE 기능과 함께 본다.

### Leftmost Prefix

복합 인덱스 `(A, B, C)`는 일반적으로 다음 선두 Prefix 검색에 유리하다.

- `A = ?`
- `A = ? AND B = ?`
- `A = ? AND B = ? AND C = ?`
- `A = ? AND B BETWEEN ? AND ?`

`B = ?` 또는 `C = ?`만으로는 B+Tree의 시작 범위를 직접 좁히기 어렵다. `A = ? AND C = ?`에서는 A 범위를 찾은 뒤 C는 잔여 필터로 적용될 수 있지만 B를 건너뛰어 C까지 탐색 경계를 정교하게 만들기 어렵다.

“복합 인덱스는 첫 열만 사용한다”는 말도 과도한 단순화다. 엔진은 인덱스 스캔 중 나머지 열을 필터하거나 Index Condition Pushdown 성격의 최적화를 할 수 있다. 핵심은 탐색 범위와 읽은 엔트리 수를 얼마나 줄이는지다.

### 동등 조건과 열 순서

`WHERE A = ? AND B = ?`처럼 두 열 모두 동등 조건이면 논리적으로 `(A,B)`와 `(B,A)` 모두 한 지점 범위를 만들 수 있다. “선택도가 높은 열을 무조건 앞에”라는 규칙만으로 결정하지 않는다. 다른 쿼리가 A만 사용하는지 B만 사용하는지, 정렬·범위, 압축과 데이터 분포를 함께 본다.

예를 들어 모든 쿼리가 `tenant_id`를 반드시 조건으로 사용하고 테넌트 격리가 중요하면 `(tenant_id, entity_id)`가 자연스럽다. `entity_id`가 전역 유일해도 테넌트별 범위·삭제와 로컬리티 요구를 고려한다.

### 범위 조건 이후 열

복합 인덱스에서 앞 열이 범위 조건이면 뒤 열은 하나의 연속 탐색 범위를 추가로 좁히기 어렵다.

```sql
WHERE created_at >= :start
  AND status = 'success'
```

`(created_at, status)`는 날짜 범위 안의 여러 status 값이 섞인다. status는 인덱스에서 필터될 수 있지만 날짜 범위 전체를 읽을 가능성이 있다. `(status, created_at)`은 status 동등 범위를 먼저 좁힌 뒤 날짜 범위를 읽는다. 다만 날짜만 조회하는 다른 쿼리와 status 분포를 함께 고려한다.

### ORDER BY와 방향

인덱스 순서가 WHERE로 고정된 Prefix 뒤의 ORDER BY와 맞으면 Sort를 피할 수 있다. `(server_id, score DESC, player_id ASC)`처럼 혼합 방향 지원은 DBMS와 버전에 따라 다를 수 있다. 전체 역방향 스캔으로 모두 반대 방향을 처리할 수 있는 경우와 혼합 방향을 구분한다.

ORDER BY 열 사이에 인덱스의 고정되지 않은 열이 끼면 전체 정렬을 그대로 제공하지 못할 수 있다. 실행 계획의 Sort 연산과 읽은 행 수로 확인한다.

### INCLUDE와 Key 열

일부 DBMS는 검색·정렬 Key가 아닌 출력 전용 열을 INCLUDE로 리프에 저장한다. Key 순서와 크기를 불필요하게 늘리지 않고 Covering할 수 있다.

```text
INDEX KEY (server_id, score DESC, player_id)
INCLUDE (nickname, guild_name_snapshot)
```

포함 열은 검색 경계나 정렬에 일반적으로 쓰이지 않으며 리프 페이지 크기와 쓰기 비용을 늘린다. 자주 바뀌는 큰 문자열을 포함하면 업데이트와 버퍼 효율이 나빠질 수 있다.

### Index Intersection

옵티마이저가 단일 열 인덱스 여러 개의 결과를 결합할 수 있는 DBMS도 있다. 그러나 복합 인덱스가 제공하는 결합 정렬과 Covering을 항상 대체하지는 못한다. Bitmap·Row ID 결합 자체의 비용과 결과 Cardinality가 있다. “각 조건에 단일 인덱스 하나씩 만들면 된다”는 설계는 실행 계획으로 검증한다.

## 4. 쉬운 예시
Clustered Index와 Composite Index에서는 플레이어가 아이템을 구매하면 재화 확인, 차감, 아이템 생성이 연결된다. 일부만 반영되거나 동시에 두 번 처리되지 않도록 제약 조건과 트랜잭션 경계를 설계한다.

전화번호부가 `(성, 이름, 생년)` 순으로 정렬되어 있다고 하자. 성을 알면 해당 구간을 찾고 그 안에서 이름과 생년 순으로 좁힐 수 있다. 이름만 알면 모든 성 구간을 확인해야 한다. 복합 인덱스의 선두 Prefix와 비슷하다.

비유 뒤의 실제 동작은 B+Tree가 `(성, 이름, 생년)`을 하나의 사전식 키로 비교한다는 것이다. `성='김' AND 이름='민수'`는 연속 범위지만 `이름='민수'`만으로는 트리 루트에서 어느 성 구간으로 갈지 하나로 정할 수 없다.

## 5. 비슷한 개념과 비교
| 관점 | 질문 | 점검 항목 |
|---|---|---|
| 논리 모델 | 어떤 불변식인가 | Key·Constraint |
| 물리 실행 | 몇 Page를 읽는가 | Index·Plan |
| 동시성 | 무엇을 함께 허용하는가 | Transaction·Lock |

| 구분 | Clustered Index | Nonclustered Index |
|---|---|---|
| 리프 | 행 저장과 밀접 | Key와 Row Locator·포함 열 |
| 개수 | 일반적으로 한 배치 순서 | 여러 개 가능 |
| 장점 | Key 범위의 Row 지역성 | 다양한 조회 경로 제공 |
| 비용 | Key 선택이 전체 Table에 영향 | 추가 저장·쓰기·Lookup |

| 구분 | 단일 열 Index | Composite Index |
|---|---|---|
| 검색 | 한 열 접근 | 여러 조건·정렬 결합 |
| 재사용 | 해당 열 단독 쿼리에 단순 | 선두 Prefix Query 중심 |
| 크기 | 상대적으로 작음 | Key 열 증가로 커질 수 있음 |

## 6. 장점과 단점
Clustered Index와 Composite Index에서는 RDBMS는 제약과 트랜잭션, 유연한 조회가 강점이다. 인덱스 유지, Lock 경쟁, Schema 변경과 수평 확장 비용이 있다. 읽기 최적화가 쓰기 비용을 만들 수 있음을 고려한다.

클러스터드 배치는 범위 행의 지역성과 특정 조회를 높일 수 있지만 한 가지 순서만 선택할 수 있고 Key 변경·무작위 삽입의 영향이 크다. 복합 인덱스는 조건·정렬·Covering을 한 구조에서 지원하지만 열 순서가 쿼리에 맞지 않으면 효과가 작고 중복 인덱스와 쓰기 증폭을 만든다.

## 7. 게임 서버·백엔드 실무 예시
서버별 랭킹은 (server_id, score DESC, player_id) 후보가 된다. 무작위 큰 PK는 보조 인덱스 크기와 페이지 분할에 영향을 줄 수 있어 실제 엔진을 확인한다.

Clustered Index와 Composite Index에서는 운영에서는 처리량만 보지 않고 쿼리 p95·p99, 실행 계획, 읽은 행·Page, Lock 대기, Deadlock과 Connection Pool을 함께 관찰한다.

### 쿼리에서 역설계하기

인덱스는 열 목록이 아니라 중요 쿼리에서 시작한다.

1. WHERE의 동등 조건과 범위 조건을 구분한다.
2. JOIN Key와 ORDER BY, LIMIT를 적는다.
3. 반환 행 수와 데이터 분포, 테넌트별 편향을 확인한다.
4. 동등 Prefix 뒤에 범위·정렬 열을 배치하는 후보를 만든다.
5. 출력 열 Covering의 이익과 크기를 비교한다.
6. 기존 인덱스가 후보의 선두 Prefix로 중복되는지 확인한다.
7. 실제 실행 계획, 읽은 Page, Sort·Lookup과 쓰기 비용을 측정한다.

인벤토리 조회 `WHERE player_id=? ORDER BY slot`에는 `(player_id, slot)`이 자연스럽다. `slot`만 조회하는 운영 쿼리가 드물다면 별도 slot 선두 인덱스는 필요 없을 수 있다. `(player_id, slot)` UNIQUE는 한 플레이어의 슬롯 중복도 동시에 보호한다.

이벤트 로그 `WHERE player_id=? AND created_at>=? ORDER BY created_at`에는 `(player_id, created_at)`이 유리하다. 보존 기간 삭제가 `created_at`만으로 대량 실행된다면 이 쿼리는 선두 Prefix를 사용하지 못하므로 파티셔닝이나 별도 날짜 인덱스를 포함한 전체 운영 패턴을 본다.

큰 무작위 UUID PK를 InnoDB 성격의 Clustered Key로 쓰면 모든 Secondary Index 리프에 큰 PK가 반복될 수 있다. 짧은 내부 Key를 추가하면 공간은 줄 수 있지만 외부 UUID→내부 Key Lookup과 두 Unique 제약 비용이 생긴다. 실제 인덱스 크기와 쓰기량으로 선택한다.

## 8. 자주 하는 오해
- 제약 조건을 애플리케이션 검사만으로 대체한다.
- 인덱스가 많을수록 모든 쿼리가 빨라진다고 본다.
- 트랜잭션이 외부 API까지 자동 원자화한다고 생각한다.
- 격리 수준 이름만으로 구현 동작을 단정한다.
- 평균 쿼리 시간만 보고 꼬리 지연을 무시한다.
- 모든 DBMS에서 Primary Key가 반드시 Clustered라고 생각한다.
- Composite Index의 열 집합만 같으면 순서는 무관하다고 본다.
- 선택도가 높은 열을 항상 첫 번째에 둬야 한다고 외운다.
- 범위 조건 뒤 열은 전혀 읽히거나 필터에 쓰이지 않는다고 단정한다.
- 단일 열 Index 여러 개가 Composite Index를 항상 대체한다고 본다.

## 9. 면접 질문
### Q1. 핵심 개념을 설명해 주세요.
클러스터드 인덱스는 행 데이터의 물리적 배치와 밀접한 기본 구조이고 복합 인덱스는 여러 열을 순서 있게 하나의 키로 구성한다.
### Q2. 왜 필요한가요?
조회 패턴에 맞는 행 배치와 열 순서로 정렬·필터 비용을 줄인다.
### Q3. 게임 백엔드에서는 어떻게 적용하나요?
서버별 랭킹은 (server_id, score DESC, player_id) 후보가 된다. 무작위 큰 PK는 보조 인덱스 크기와 페이지 분할에 영향을 줄 수 있어 실제 엔진을 확인한다.
### Q4. 성능 문제는 무엇을 확인하나요?
실행 계획과 실제 행 수, Index 사용, Lock 대기와 꼬리 지연을 확인한다.

### Q5. Clustered와 Nonclustered Index의 차이는 무엇인가요?

Clustered Index는 행 데이터의 저장 구조와 밀접해 리프가 행 자체를 담거나 행 배치를 결정한다. Nonclustered Index는 별도 Key 순서와 행 Locator를 저장해 추가 접근 경로를 제공한다. 정확한 리프와 Locator 형태는 DBMS마다 다르다.

### Q6. Composite Index의 열 순서는 어떻게 정하나요?

중요 쿼리의 동등 조건, 범위 조건, ORDER BY와 LIMIT에서 역설계한다. 보통 동등 조건 Prefix로 범위를 좁히고 범위·정렬 열을 이어 붙이지만 다른 쿼리의 선두 Prefix 재사용, 선택도와 데이터 분포도 함께 본다.

### Q7. `(A,B,C)` Index로 어떤 조건을 효율적으로 찾나요?

일반적으로 A, A+B, A+B+C 같은 선두 Prefix 조건에 유리하다. A 없이 B나 C만으로는 시작 범위를 좁히기 어렵다. A와 C 조건에서는 A 범위를 탐색하고 C를 잔여 필터로 사용할 수 있지만 B를 건너뛰어 C까지 연속 탐색 경계를 만들기는 어렵다.

## 10. 예상 꼬리질문
- 논리 구조와 물리 구조는 어떻게 다른가요?
- 쓰기 성능에는 어떤 비용이 생기나요?
- 동시 요청에서 불변식을 어떻게 지키나요?
- 실행 계획이 예상과 달라지는 이유는 무엇인가요?
- 재시도 시 중복 처리를 어떻게 막나요?
- 범위 조건 이후 열은 어떻게 사용되나요?
- Composite Index가 ORDER BY를 만족하는 조건은 무엇인가요?

## 11. 30초 모범답변
> 클러스터드 인덱스는 행 저장 구조와 연결되고 복합 인덱스는 열 순서가 핵심입니다. 쿼리의 동등·범위·정렬 패턴으로 설계해야 합니다. 서버별 랭킹은 (server_id, score DESC, player_id) 후보가 된다.

## 12. 1~2분 확장답변
> 클러스터드 인덱스는 행 저장 구조와 연결되고 복합 인덱스는 열 순서가 핵심입니다. 쿼리의 동등·범위·정렬 패턴으로 설계해야 합니다. 설계에서는 Schema와 제약으로 불변식을 표현하고, Query와 Index는 실제 접근 패턴으로 검증합니다. 동시 변경은 짧은 Transaction과 적절한 격리·Lock으로 보호하며, 타임아웃 재시도에는 멱등성 키를 적용합니다.

## 13. 핵심 요약
- 클러스터드 인덱스는 행 데이터의 물리적 배치와 밀접한 기본 구조이고 복합 인덱스는 여러 열을 순서 있게 하나의 키로 구성한다.
- 불변식과 조회 패턴에서 설계를 시작한다.
- 논리 SQL과 물리 실행 계획을 구분한다.
- 읽기 최적화는 쓰기 비용을 만들 수 있다.
- 정합성과 재시도를 함께 설계한다.
- Clustered 구조는 제품별 차이를 전제로 행 배치와 Locator 영향을 설명한다.
- Composite Index는 동등·범위·정렬·출력과 실제 Query 빈도에서 역설계한다.

## 한 줄 정리
> 클러스터드 인덱스는 행 저장 구조와 연결되고 복합 인덱스는 열 순서가 핵심입니다. 쿼리의 동등·범위·정렬 패턴으로 설계해야 합니다.
