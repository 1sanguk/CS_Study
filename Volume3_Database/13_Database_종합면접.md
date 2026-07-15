---
difficulty: 4
reading_time: 25분
interview_frequency: 5
importance: 5
---

# 13. Database 종합면접

> 게임 서버·백엔드 개발자를 위한 CS 면접 교재

## 학습 목표

- 관계형 모델, Key·정규화와 JOIN을 연결해 설명할 수 있다.
- Index·Transaction·Isolation·Lock의 정확성·성능 Trade-off를 설명할 수 있다.
- Cache·Replication·Sharding을 포함한 게임 백엔드 장애와 확장에 적용할 수 있다.

## 1. 개요

DB 면접의 핵심은 데이터 불변식, 접근 패턴, 동시성, 장애 복구와 확장 전략을 하나의 흐름으로 설명하는 것이다.

좋은 답변은 “인덱스를 쓰면 빠르다”나 “트랜잭션은 ACID다”에서 끝나지 않는다. 어떤 업무 규칙을 Schema와 제약으로 지키고, 어떤 Query에 어떤 Index가 필요한지, 동시에 변경될 때 어떤 이상을 막으며, 장애와 Timeout 뒤 무엇을 재처리할지를 연결한다.

Cache, Replica와 Shard는 원본 DB의 정확성을 대체하는 마법이 아니다. 성능과 가용성을 위해 상태 사본과 배치 경계를 늘리는 선택이다. 허용 가능한 Staleness, 부분 실패, 원본과 재구축 경로를 함께 설명해야 한다.

## 2. 왜 필요한가

Schema와 Query만이 아니라 Transaction, Index, Cache, Replica가 함께 서비스 정확성과 지연을 결정한다. 분산된 사본과 동시 변경이 늘수록 실패 경로를 정상 흐름처럼 설계해야 한다.

아이템 구매 하나에도 상품·플레이어·잔액·인벤토리·거래 원장과 요청 중복이 연결된다. DB 제약 없이 애플리케이션 사전 조회만 하면 동시 요청이 통과할 수 있고, Transaction이 길면 Lock 대기와 Connection Pool 고갈이 생긴다. 조회를 Cache·Replica로 돌리면 구매 직후 이전 값을 볼 수 있다.

면접관은 보통 특정 용어보다 문제를 분해하는 능력을 확인한다. 정확성, 읽기·쓰기 경로, 동시 충돌, 장애 복구와 관찰 지표 순으로 답하면 설계 선택의 근거를 보여 줄 수 있다.

## 3. 핵심 동작 원리
```text
request→cache→SQL plan/index→transaction lock/MVCC→commit log→replica/event
```
정규화와 제약이 원본 정합성을 만들고 Index가 접근을 빠르게 한다. Transaction과 격리가 동시 변경을 보호하며 Cache·Replica·Shard는 성능과 확장을 위해 새로운 정합성 문제를 만든다.

Database 종합면접에서는 성능 최적화는 새 상태와 실패 가능성을 추가한다. 원본이 무엇인지, 성공 응답의 기준과 재처리 방법을 먼저 정한다.

### 1단계: 논리 모델과 불변식

```text
Player(player_id PK, nickname UNIQUE)
Wallet(player_id PK/FK, balance CHECK balance >= 0)
InventoryItem(item_instance_id PK, player_id FK, slot)
PurchaseRequest(request_id UNIQUE, player_id, status)
```

Key는 행의 정체성과 관계를 표현한다. 대리키를 써도 닉네임·요청 ID 같은 업무상 유일성에는 별도 UNIQUE가 필요하다. 외래키는 존재하지 않는 Player를 참조하는 Item을 막고 CHECK는 표현 가능한 값 범위를 보호한다.

정규화는 같은 사실의 중복과 삽입·수정·삭제 이상을 줄인다. 조회 성능 때문에 반정규화한다면 원본, 갱신 이벤트, 허용 지연과 재구축 방법을 정한다. 정규화 정도는 Table 수가 아니라 함수 종속성과 불변식으로 설명한다.

### 2단계: Query와 Index

SQL은 원하는 결과를 선언하고 Optimizer가 통계와 Index로 실행 계획을 선택한다. 같은 SQL도 데이터 분포와 Parameter에 따라 Plan이 달라질 수 있다. 추정 행과 실제 행, 읽은 Page, Join 방식, Sort·Spill과 Lookup을 확인한다.

```text
Query Pattern
WHERE server_id = ?
  AND score >= ?
ORDER BY score DESC, player_id
LIMIT 100
       ↓
Candidate Index(server_id, score DESC, player_id)
```

B+Tree는 높은 Fan-out과 연결된 정렬 리프로 단건·범위·정렬을 지원한다. 복합 Index는 선두 Prefix, 동등 조건, 범위와 ORDER BY 순서가 핵심이다. Covering은 Table Lookup을 줄이지만 Index 크기와 모든 쓰기 비용을 늘린다.

JOIN에서는 INNER·LEFT 같은 논리 결과와 Nested Loop·Hash·Merge 같은 물리 알고리즘을 구분한다. 관계 Cardinality가 일대다인지 다대다인지 확인하지 않으면 결과 행이 곱으로 늘 수 있다. ORM의 N+1과 Lazy Loading은 요청당 Query 수와 생성 SQL로 찾는다.

### 3단계: Transaction과 ACID

```text
BEGIN
  Insert PurchaseRequest(request_id) -- 중복 방지
  Conditional Update Wallet
  Insert InventoryItem
  Insert Ledger·Outbox
COMMIT
```

원자성은 전체 반영·취소, 일관성은 유효한 상태 전이, 격리성은 동시 Transaction의 관찰·충돌 제어, 지속성은 Commit 결과의 장애 후 복구다. WAL은 Data Page보다 Log를 먼저 안정적으로 기록하고 장애 후 Redo·Undo 성격 복구를 가능하게 한다.

Transaction은 짧게 유지한다. 사용자 입력과 외부 HTTP를 범위 안에서 기다리면 Lock·Version과 Connection을 오래 점유한다. DB Commit과 Message Publish를 연결하려면 Outbox를 같은 Transaction에 기록하고 Publisher·Consumer를 멱등하게 만든다.

Commit 응답 전에 Network가 끊기면 결과가 불확실할 수 있다. Timeout을 Rollback으로 간주하지 않고 `request_id`로 기존 결과를 조회하거나 같은 요청 효과를 한 번만 적용한다.

### 4단계: Isolation과 동시성 제어

Dirty Read는 미커밋 값, Non-repeatable Read는 같은 행의 재조회 변화, Phantom은 조건 결과 집합 변화다. Lost Update와 Write Skew도 별도로 고려한다. Snapshot Isolation은 일관된 버전을 읽어도 서로 다른 행을 쓰는 Write Skew를 허용할 수 있어 Serializable과 같지 않다.

```sql
UPDATE wallet
SET balance = balance - :amount
WHERE player_id = :id
  AND balance >= :amount;
```

단순 잔액 차감은 조건부 UPDATE와 영향 행 수가 사전 SELECT보다 직접적이다. 복합 불변식은 `SELECT FOR UPDATE` 성격의 비관적 Lock이나 Version 열 기반 낙관적 Lock, Serializable과 DB 제약을 사용한다.

MVCC는 Reader가 Snapshot에 보이는 이전 Row Version을 읽게 해 일반 Reader·Writer 충돌을 줄인다. Writer 충돌은 남고 긴 Snapshot은 이전 Version 정리를 지연시킨다. Lock Wait, Deadlock, Serialization Abort와 오래된 Transaction을 관찰한다.

낙관적 방식은 충돌이 낮고 재수행·Merge가 쉬울 때, 비관적 방식은 충돌이 높고 DB 내부 작업이 짧으며 재수행 비용이 클 때 고려한다. Hot Key에서 낙관적 무한 Retry나 Connection을 점유하는 긴 대기 대신 입구 Queue와 단일 소유 구조도 검토한다.

### 5단계: Cache

```text
Read : Cache Hit → Return
       Cache Miss → DB → Cache Fill(TTL)

Write: DB Commit → Cache Invalidate
                    실패 시 Outbox·CDC Retry + TTL 안전망
```

Cache-Aside는 단순하지만 Stale Window와 Stampede가 있다. TTL Jitter, Single Flight·Soft TTL, Negative Cache와 DB Fallback 상한으로 Stampede·Avalanche·Penetration을 구분 대응한다.

Cache 장애 시 모든 요청을 DB로 보내면 원본까지 무너질 수 있다. 짧은 Timeout, Circuit Breaker, 제한된 Fallback과 기능 강등을 둔다. Hit Ratio뿐 아니라 Miss QPS가 DB 용량을 넘는지, Stale Data가 업무 오류를 만드는지 본다.

### 6단계: Replication과 Sharding

Replication은 같은 데이터 사본으로 읽기와 가용성을 높이지만 비동기 Replica는 Lag와 Failover 손실 가능성이 있다. 쓰기 직후 Read-Your-Writes가 필요하면 Primary를 읽거나 Commit Log 위치를 따라잡은 Replica를 선택한다.

Sharding은 Shard Key로 데이터를 분할해 저장·쓰기 한계를 넘는다. 좋은 Key는 데이터와 요청을 고르게 분산하고 주요 Query·Transaction을 한 Shard에 모은다. Key 수가 균등해도 큰 Tenant·Hot Player 때문에 부하는 불균형할 수 있다.

```text
Player Request → Router(hash player_id) → Player Shard

Global Ranking:
Shard A Top N ─┐
Shard B Top N ─┼─ Merge / 별도 집계 Store
Shard C Top N ─┘
```

Cross-shard JOIN·Transaction과 전역 UNIQUE는 별도 서비스·Saga·Registry가 필요할 수 있다. Resharding은 Snapshot 복사, 변경 Log 동기화, Routing Version 전환과 검증을 포함한다. Replication과 Sharding을 추가하기 전에 단일 DB Query·Index·Archiving과 수직 확장 한계를 측정한다.

### 면접 답변 구성

1. 개념을 한 문장으로 정의한다.
2. 해결하려는 문제와 핵심 동작을 말한다.
3. 정확성·성능·운영 Trade-off를 비교한다.
4. 게임 서버 사례와 실패·복구를 붙인다.
5. 확인할 지표로 마무리한다.

예를 들어 “Index란?”에는 검색 Key와 Row 위치를 별도 B+Tree로 유지해 읽는 Page를 줄인다고 정의한다. 범위 조회와 낮은 트리 높이를 설명하고 쓰기·공간 비용, 선택도와 실행 계획을 언급한 뒤 랭킹 복합 Index 사례를 든다.

## 4. 쉬운 예시
Database 종합면접에서는 두 서버가 동시에 마지막 아이템을 지급하려 할 때 애플리케이션의 사전 조회만으로는 부족하다. DB 조건부 갱신과 제약을 최종 방어선으로 두고 요청 ID로 재시도를 식별한다.

구매 요청의 전체 흐름은 다음과 같다.

```text
Client(request_id)
   ↓
API: 상품·인증 확인
   ↓
DB Transaction
   ├─ request_id UNIQUE로 중복 확인
   ├─ balance >= price 조건부 차감
   ├─ Inventory·Ledger 생성
   └─ Outbox Event 기록
   ↓ COMMIT
응답 + Cache 무효화 Event
```

같은 request_id 재시도는 기존 결과를 반환한다. Cache의 잔액은 화면 표시용일 수 있지만 구매 승인에는 사용하지 않는다. Outbox Consumer가 Profile·Inventory Cache를 삭제하고 랭킹·분석 시스템은 비동기로 갱신한다.

## 5. 비슷한 개념과 비교
| 방식 | 장점 | 비용 |
|---|---|---|
| 직렬화·Lock | 강한 정합성 | 대기·Deadlock |
| Version·MVCC | 읽기 동시성 | 충돌 재시도·버전 관리 |
| Cache·Replica | 낮은 지연·확장 | Stale Data·무효화 |

| 혼동하기 쉬운 개념 | 핵심 차이 |
|---|---|
| Key / Index | 논리 식별·제약 / 물리 접근 구조 |
| JOIN 종류 / JOIN 알고리즘 | 결과에 남길 행 / 결과 계산 방법 |
| Atomicity / Isolation | 한 Transaction의 전체 반영 / 동시 Transaction 상호작용 |
| MVCC / Optimistic Version | DB 내부 Row Version / App의 변경 충돌 검증 |
| Cache / Replica | 선택 Data의 TTL 복사 / DB Log 기반 사본 |
| Replication / Sharding | 같은 Data 복제 / Data 분할 |
| Deadlock / Lock Wait | 순환해 진행 불가 / 보유자 종료 후 진행 가능한 대기 |

## 6. 장점과 단점
Database 종합면접에서는 동시성 제어와 분산 구조는 정확성, 처리량, 가용성을 높인다. 반면 Lock 대기, 복제 지연, 중복 처리, 운영 복잡도가 생긴다. 모든 데이터에 같은 강도의 정합성을 적용하지 않는다.

RDBMS의 장점은 Schema 제약, Transaction, 유연한 JOIN·집계와 검증된 복구다. 비용은 Index 쓰기, Lock·MVCC, Log Flush와 단일 노드 자원 한계다. Cache·Replica·Shard로 확장하면 지연과 처리량은 좋아질 수 있지만 Stale·부분 실패·Routing·재구축 비용이 추가된다.

정확성이 중요한 재화·결제와 잠시 오래되어도 되는 프로필·랭킹에 같은 정책을 적용하지 않는다. 데이터별 원본, 성공 기준, RPO·RTO와 허용 Staleness를 분류한다.

## 7. 게임 서버·백엔드 실무 예시
아이템 구매는 UNIQUE·CHECK, 짧은 트랜잭션, 조건부 UPDATE, 멱등성 키로 보호한다. 조회는 Index와 캐시로 최적화하고 Lag 허용 여부에 따라 Primary 또는 Replica를 선택한다.

Database 종합면접에서는 운영에서는 Cache Hit Ratio만 보지 않고 DB 부하, Lag, Lock 대기, Retry, Hot Key·Shard와 p99를 함께 본다.

### 느린 Query 진단

1. Query p95·p99와 호출 빈도, Parameter별 편향을 확인한다.
2. 실행 계획의 추정·실제 행, Scan·Lookup, Join 순서, Sort·Spill을 본다.
3. 읽은 Page와 Buffer Hit, Storage I/O를 확인한다.
4. Lock Wait와 긴 Transaction, Connection Pool 대기를 분리한다.
5. Index 추가 후 읽기뿐 아니라 쓰기·Log·공간 변화를 비교한다.

### DB 지연 폭증 진단

CPU·I/O·Memory, Active Connection과 Queue, Lock Blocking Chain·Deadlock, WAL Flush, 오래된 Snapshot·Version Cleanup, Replica Lag와 Cache Miss 급증을 같은 시간축에서 본다. 평균 Query 시간보다 가장 느린 Shard·Replica와 Hot Key를 찾는다.

### 장애 복구

Failover 중 성공 응답 여부가 불명확한 Write는 요청 ID와 원장으로 판정한다. Replica는 사용자 실수도 복제하므로 Backup과 시점 복구를 별도로 시험한다. Cache·Read Model은 원본 DB와 Event Log에서 재구축 가능해야 한다. Recovery Runbook을 문서로만 두지 않고 정기적으로 복원 시간을 측정한다.

## 8. 자주 하는 오해
- MVCC면 쓰기 충돌이 없다고 본다.
- Redis 명령 원자성이 전체 로직 원자성을 뜻한다고 본다.
- TTL만 있으면 캐시 정합성이 해결된다고 본다.
- Replica가 Primary와 항상 같은 값을 반환한다고 본다.
- Sharding이 JOIN과 Transaction을 자동 분산한다고 본다.
- Index를 추가하면 읽기만 빨라지고 다른 비용은 없다고 본다.
- Serializable이면 Retry가 필요 없다고 생각한다.
- Commit Timeout을 Rollback 증거로 본다.
- Cache Hit Ratio가 높으면 Stale과 DB Fallback은 무시해도 된다고 본다.
- Replication이 Backup을 대체한다고 생각한다.
- 전체 평균이 안정적이면 Hot Shard도 정상이라고 본다.

## 9. 면접 질문

### Q1. 핵심 개념을 설명해 주세요.
DB 면접의 핵심은 데이터 불변식, 접근 패턴, 동시성, 장애 복구와 확장 전략을 하나의 흐름으로 설명하는 것이다.

### Q2. 어떤 Trade-off가 있나요?
정규화와 제약이 원본 정합성을 만들고 Index가 접근을 빠르게 한다. Transaction과 격리가 동시 변경을 보호하며 Cache·Replica·Shard는 성능과 확장을 위해 새로운 정합성 문제를 만든다.

### Q3. 게임 백엔드 적용 사례는 무엇인가요?
아이템 구매는 UNIQUE·CHECK, 짧은 트랜잭션, 조건부 UPDATE, 멱등성 키로 보호한다. 조회는 Index와 캐시로 최적화하고 Lag 허용 여부에 따라 Primary 또는 Replica를 선택한다.

### Q4. 장애 시 무엇을 확인하나요?
Database 종합면접에서는 원본 상태, Lock과 Retry, Cache·Replica 지연, 중복 요청과 복구 절차를 확인한다.

### Q5. 인덱스가 있어도 사용되지 않는 이유는 무엇인가요?

결과 비율이 커서 Lookup보다 Table Scan이 저렴하거나 함수·암시적 변환으로 검색 범위를 만들기 어렵고, 통계가 데이터 분포를 잘못 추정할 수 있다. 실행 계획의 추정·실제 행과 읽은 Page를 확인한다.

### Q6. Transaction 격리 수준은 어떻게 선택하나요?

업무 불변식과 동시 읽기·쓰기를 적고 Dirty·Non-repeatable·Phantom뿐 아니라 Lost Update·Write Skew를 시험한다. UNIQUE·조건부 UPDATE·명시 Lock으로 직접 보호한 뒤 필요한 수준을 선택하고 Retry·대기 비용을 측정한다.

### Q7. MVCC를 사용하면 Lock이 필요 없나요?

아니다. 일반 Reader가 Snapshot Version을 읽어 Writer와 덜 충돌하지만 같은 행 Writer는 Lock·충돌 검사가 필요하고 현재 상태 변경에는 Locking Read가 필요할 수 있다. 긴 Snapshot의 Version 정리 비용도 남는다.

## 10. 예상 꼬리질문
- 실패 후 재시도를 어떻게 안전하게 하나요?
- 오래된 읽기를 허용할 수 없는 데이터는 무엇인가요?
- Hot Key나 Hot Shard를 어떻게 찾나요?
- Failover 중 쓰기 결과를 어떻게 판단하나요?
- 분산 상태의 원본은 무엇인가요?
- 자연키와 대리키는 어떻게 선택하나요?
- Nested Loop·Hash·Merge Join을 비교해 주세요.

## 11. 30초 모범답변

> 데이터베이스 설계는 불변식을 Schema·제약과 짧은 Transaction으로 지키고 Query Plan과 Index로 읽는 Page를 줄이는 일입니다. 동시 변경은 Isolation, Lock·MVCC와 조건부 갱신으로 보호합니다. Cache·Replication·Sharding은 성능과 가용성을 높이지만 Stale Data, Failover와 Cross-shard 실패를 추가하므로 원본·멱등성·복구 경로를 함께 설계해야 합니다.

## 12. 1~2분 확장답변

> 먼저 데이터의 Key, 관계와 불변식을 Schema의 UNIQUE·FK·CHECK로 표현하고 정규화로 중복 갱신을 줄입니다. Query는 실행 계획의 추정·실제 행, Join 방식과 Page 수를 보고 B+Tree·복합 Index를 설계합니다. 구매처럼 여러 변경은 짧은 Transaction으로 묶고 조건부 UPDATE와 요청 ID로 잔액 경쟁과 중복을 막습니다. Isolation 이름만 믿지 않고 Lost Update·Write Skew를 시험하며 Lock Wait, MVCC Version과 Retry를 관찰합니다. 읽기 확장은 Cache-Aside와 Replica를 사용하되 TTL·무효화, Lag와 Read-Your-Writes를 정의합니다. 단일 노드 쓰기 한계를 넘을 때 Shard Key로 분산하지만 Global Ranking, 전역 UNIQUE와 Cross-shard Transaction을 별도 설계합니다. 장애에서는 Commit 결과가 불확실할 수 있으므로 원장·멱등성·Outbox와 검증 가능한 복구 절차를 둡니다.

## 13. 핵심 요약
- DB 면접의 핵심은 데이터 불변식, 접근 패턴, 동시성, 장애 복구와 확장 전략을 하나의 흐름으로 설명하는 것이다.
- 원본과 성공 기준을 명확히 한다.
- 성능 구조는 새로운 정합성 비용을 만든다.
- Timeout과 Retry에는 멱등성이 필요하다.
- 평균보다 Lag, Lock과 p99를 관찰한다.
- Key·Constraint와 정규화로 원본 불변식을 표현한다.
- Query Plan의 실제 행·Page·Join·Sort를 보고 Index를 설계한다.
- Transaction·Isolation·Lock·MVCC는 동시 변경의 업무 규칙에서 선택한다.
- Cache·Replica는 허용 Staleness와 원본 보호를 전제로 사용한다.
- Sharding은 Key 배치와 Cross-shard 실패·재분배 비용을 추가한다.
- Timeout·Failover는 결과 불확실성을 만들므로 멱등성과 원장이 필요하다.

## 한 줄 정리

> 데이터베이스 면접의 핵심은 원본 불변식부터 Query·동시성·Cache·분산과 복구까지 하나의 증거 기반 흐름으로 연결하는 것이다.
