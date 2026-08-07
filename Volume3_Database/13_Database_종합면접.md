---
difficulty: 4
reading_time: 25분
interview_frequency: 5
importance: 5
---

# 13. Database 종합면접


## 학습 목표

- 관계형 모델의 Key·정규화·JOIN을 연결하고 UNIQUE·FK·CHECK로 불변식을 표현할 수 있다.
- Index·Transaction·Isolation·Lock·MVCC를 동시 변경의 업무 규칙에서 선택해 설명할 수 있다.
- Cache-Aside·Replica·Shard의 정합성 비용(Stale·Lag·Cross-shard)과 원본 복구 경로를 설명할 수 있다.
- 게임 아이템 구매 플로우를 논리 모델→Query→Transaction→격리→Cache→확장 순서로 연결해 설명할 수 있다.

## 1. 개요

DB 면접의 핵심은 데이터 불변식, 접근 패턴, 동시성, 장애 복구와 확장 전략을 하나의 흐름으로 설명하는 것이다.

좋은 답변은 "인덱스를 쓰면 빠르다"나 "트랜잭션은 ACID다"에서 끝나지 않는다. 어떤 업무 규칙을 Schema와 제약으로 지키고, 어떤 Query에 어떤 Index가 필요한지, 동시에 변경될 때 어떤 이상을 막으며, 장애와 Timeout 뒤 무엇을 재처리할지를 연결한다.

Cache, Replica와 Shard는 원본 DB의 정확성을 대체하는 마법이 아니다. 성능과 가용성을 위해 상태 사본과 배치 경계를 늘리는 선택이다. 허용 가능한 Staleness, 부분 실패, 원본과 재구축 경로를 함께 설명해야 한다.

## 2. 왜 필요한가

아이템 구매 하나에도 상품·플레이어·잔액·인벤토리·거래 원장과 요청 중복이 연결된다. DB 제약 없이 애플리케이션 사전 조회만 하면 동시 요청이 통과할 수 있고, Transaction이 길면 Lock 대기와 Connection Pool 고갈이 생긴다. 조회를 Cache·Replica로 돌리면 구매 직후 이전 값을 볼 수 있다.

면접관은 특정 용어보다 문제를 분해하는 능력을 확인한다. 정확성, 읽기·쓰기 경로, 동시 충돌, 장애 복구와 관찰 지표 순으로 답하면 설계 선택의 근거를 보여 줄 수 있다.

## 3. 핵심 동작 원리

```text
request → cache → SQL plan/index → transaction lock/MVCC → commit log → replica/event
```

### 1단계: 논리 모델과 불변식

```text
Player(player_id PK, nickname UNIQUE, email UNIQUE)
Wallet(player_id PK/FK, balance CHECK balance >= 0)
InventoryItem(item_instance_id PK, player_id FK, item_code)
PurchaseRequest(request_id UNIQUE, player_id, status, created_at)
```

대리키를 써도 닉네임·요청 ID 같은 업무상 유일성에는 별도 UNIQUE가 필요하다. FK는 존재하지 않는 Player를 참조하는 Item을 막고 CHECK는 값 범위를 보호한다. 정규화는 같은 사실의 중복과 삽입·수정·삭제 이상을 줄인다.

### 2단계: Query와 Index

SQL은 원하는 결과를 선언하고 Optimizer가 통계와 Index로 실행 계획을 선택한다. 추정 행과 실제 행, 읽은 Page, Join 방식, Sort·Spill과 Lookup을 확인한다.

```text
Query Pattern
WHERE server_id = ? AND score >= ?
ORDER BY score DESC, player_id
LIMIT 100

Candidate Index: (server_id, score DESC, player_id)
```

B+Tree는 높은 Fan-out과 연결된 정렬 리프로 단건·범위·정렬을 지원한다. 복합 Index는 선두 Prefix, 동등 조건, 범위와 ORDER BY 순서가 핵심이다.

### 3단계: Transaction과 ACID

```text
BEGIN
  Insert PurchaseRequest(request_id) -- 중복 방지 (UNIQUE)
  Conditional Update Wallet (balance >= price)
  Insert InventoryItem
  Insert Ledger + Outbox Event
COMMIT
```

Transaction은 짧게 유지한다. 사용자 입력과 외부 HTTP를 범위 안에서 기다리면 Lock·Connection을 오래 점유한다. Commit 응답 전에 Network가 끊기면 결과가 불확실할 수 있다. Timeout을 Rollback으로 간주하지 않고 `request_id`로 기존 결과를 조회한다.

### 4단계: Isolation과 동시성 제어

Lost Update와 Write Skew도 별도로 고려한다. Snapshot Isolation은 Write Skew를 허용할 수 있어 Serializable과 같지 않다.

```sql
-- 조건부 UPDATE: 사전 SELECT 없이 잔액 차감
UPDATE wallet
SET balance = balance - :amount
WHERE player_id = :id AND balance >= :amount;
-- affected_rows=0이면 잔액 부족
```

### 5단계: Cache

```text
Read : Cache Hit → Return
       Cache Miss → DB → Cache Fill(TTL)

Write: DB Commit → Cache Invalidate
                    실패 시 Outbox·CDC Retry + TTL 안전망
```

Cache 장애 시 모든 요청을 DB로 보내면 원본까지 무너질 수 있다. 짧은 Timeout, Circuit Breaker, 제한된 Fallback과 기능 강등을 둔다.

### 6단계: Replication과 Sharding

비동기 Replica는 Lag와 Failover 손실 가능성이 있다. 쓰기 직후 Read-Your-Writes가 필요하면 Primary를 읽거나 Commit Log 위치를 따라잡은 Replica를 선택한다.

```text
Player Request → Router(hash player_id) → Player Shard

Global Ranking:
Shard A Top N ─┐
Shard B Top N ─┼─ Merge / 별도 집계 Store
Shard C Top N ─┘
```

### 면접 답변 구성

1. 개념을 한 문장으로 정의한다.
2. 해결하려는 문제와 핵심 동작을 말한다.
3. 정확성·성능·운영 Trade-off를 비교한다.
4. 게임 서버 사례와 실패·복구를 붙인다.
5. 확인할 지표로 마무리한다.

## 4. 쉬운 예시

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

```java
public PurchaseResult purchaseItem(Connection conn, String requestId,
        long playerId, String itemCode, int price) throws SQLException {
    conn.setAutoCommit(false);
    try {
        // 1. 중복 확인 (멱등성)
        PreparedStatement check = conn.prepareStatement(
            "SELECT result FROM purchase_request WHERE request_id = ?");
        check.setString(1, requestId);
        ResultSet rs = check.executeQuery();
        if (rs.next()) return PurchaseResult.from(rs.getString("result"));

        // 2. 잔액 조건부 차감 (조건부 UPDATE로 경쟁 해결)
        PreparedStatement deduct = conn.prepareStatement(
            "UPDATE wallet SET balance = balance - ? " +
            "WHERE player_id = ? AND balance >= ?");
        deduct.setInt(1, price);
        deduct.setLong(2, playerId);
        deduct.setInt(3, price);
        if (deduct.executeUpdate() == 0) {
            conn.rollback();
            return PurchaseResult.INSUFFICIENT;
        }

        // 3. 인벤토리 생성 + 요청 기록 + Outbox (한 Transaction)
        conn.prepareStatement(
            "INSERT INTO inventory_item (player_id, item_code) VALUES (?, ?)")
            .executeUpdate();
        conn.prepareStatement(
            "INSERT INTO purchase_request (request_id, player_id, result) VALUES (?, ?, 'SUCCESS')")
            .executeUpdate();
        conn.prepareStatement(
            "INSERT INTO outbox (event_type, payload) VALUES ('PURCHASE', ?)")
            .executeUpdate();

        conn.commit();
        // 외부 HTTP·메시지 발행은 Commit 성공 후 Outbox Publisher가 처리
        return PurchaseResult.SUCCESS;
    } catch (SQLException e) {
        conn.rollback();
        throw e;
    }
}
```

Cache의 잔액은 화면 표시용일 수 있지만 구매 승인에는 사용하지 않는다. 같은 `request_id` 재시도는 기존 결과를 반환한다.

## 5. 비슷한 개념과 비교

| 혼동하기 쉬운 개념 | 핵심 차이 |
|---|---|
| Key / Index | 논리 식별·제약 / 물리 접근 구조 |
| JOIN 종류 / JOIN 알고리즘 | 결과에 남길 행 / 결과 계산 방법 |
| Atomicity / Isolation | 한 Transaction의 전체 반영 / 동시 Transaction 상호작용 |
| MVCC / Optimistic Version | DB 내부 Row Version / App의 변경 충돌 검증 |
| Cache / Replica | 선택 Data의 TTL 복사 / DB Log 기반 사본 |
| Replication / Sharding | 같은 Data 복제 / Data 분할 |
| Deadlock / Lock Wait | 순환해 진행 불가 / 보유자 종료 후 진행 가능한 대기 |

| 단계 | 도구 | 새로 생기는 비용 |
|---|---|---|
| 불변식 표현 | UNIQUE·FK·CHECK·정규화 | Schema 변경·제약 충돌 처리 |
| 접근 최적화 | B+Tree Index·실행 계획 | 쓰기 비용·공간·통계 부정확 |
| 동시성 제어 | Transaction·Isolation·Lock·MVCC | Lock Wait·Deadlock·Version 정리 |
| 읽기 확장 | Cache-Aside·Replica | Stale·무효화·Lag·Failover |
| 쓰기 확장 | Sharding | Cross-shard·Hot Shard·전역 UNIQUE |

## 6. 장점과 단점

**RDBMS 단일 서버의 장점**

- Schema 제약과 Transaction으로 불변식 보호가 명확하다.
- 유연한 JOIN·집계와 검증된 복구 생태계가 있다.
- 운영 단순성 덕분에 장애 원인 추적이 쉽다.

**RDBMS 단일 서버의 단점**

- Index 쓰기 비용, Lock·MVCC, Log Flush와 단일 노드 자원 한계가 있다.
- 대규모 읽기·쓰기에서 처리량과 가용성이 한계에 부딪힌다.

**확장 구조(Cache·Replica·Shard)의 장점**

- 읽기 지연과 처리량을 크게 개선한다.
- Primary 부하를 줄이고 가용성을 높인다.

**확장 구조의 단점**

- Stale·부분 실패·Routing·재구축 비용이 추가된다.
- 운영 복잡도가 높아져 장애 진단이 어려워진다.
- 확장 구조를 추가하기 전 단일 DB에서 할 수 있는 최적화를 먼저 측정한다.

## 7. 게임 서버·백엔드 실무 예시

아이템 구매는 UNIQUE·CHECK, 짧은 Transaction, 조건부 UPDATE, 멱등성 키로 보호한다. 조회는 Index와 캐시로 최적화하고 Lag 허용 여부에 따라 Primary 또는 Replica를 선택한다.

**느린 Query 진단:**
1. Query p95·p99와 호출 빈도, Parameter별 편향을 확인한다.
2. 실행 계획의 추정·실제 행, Scan·Lookup, Join 순서, Sort·Spill을 본다.
3. 읽은 Page와 Buffer Hit, Storage I/O를 확인한다.
4. Lock Wait와 긴 Transaction, Connection Pool 대기를 분리한다.
5. Index 추가 후 읽기뿐 아니라 쓰기·Log·공간 변화를 비교한다.

**DB 지연 폭증 진단:**
CPU·I/O·Memory, Active Connection과 Queue, Lock Blocking Chain·Deadlock, WAL Flush, 오래된 Snapshot·Version Cleanup, Replica Lag와 Cache Miss 급증을 같은 시간축에서 본다. 평균 Query 시간보다 가장 느린 Shard·Replica와 Hot Key를 찾는다.

**장애 복구:**
Failover 중 성공 응답 여부가 불명확한 Write는 요청 ID와 원장으로 판정한다. Replica는 사용자 실수도 복제하므로 Backup과 시점 복구를 별도로 시험한다. Cache·Read Model은 원본 DB와 Event Log에서 재구축 가능해야 한다.

## 8. 자주 하는 오해

- **"Index를 추가하면 읽기만 빨라지고 다른 비용은 없다"**: Index는 모든 쓰기에 B+Tree 갱신 비용, 추가 저장 공간과 Lock 범위 확장을 만든다. 많은 Index는 쓰기 처리량을 낮추고 Lock 경합을 늘릴 수 있다.
- **"Serializable이면 Retry가 필요 없다"**: Serializable에서도 Deadlock과 Serialization Failure가 발생하고 전체 트랜잭션을 재시도해야 한다. 멱등 설계와 제한 재시도는 어느 격리 수준에서도 필요하다.
- **"Commit Timeout을 Rollback 증거로 본다"**: Commit 응답을 받지 못하면 Commit 여부가 불확실하다. Timeout을 Rollback으로 간주해 같은 요청을 재시도하면 중복이 생길 수 있다. 요청 ID로 기존 결과를 조회해야 한다.
- **"Cache Hit Ratio가 높으면 Stale과 DB Fallback은 무시해도 된다"**: 99% Hit여도 1% Miss가 DB 용량을 넘거나 오래된 Cache가 업무 오류를 만들 수 있다. Miss QPS가 DB 용량 내인지, Stale Data가 비즈니스 오류를 만드는지 함께 본다.
- **"Replication이 Backup을 대체한다"**: Replica는 Primary의 모든 변경(사용자 실수, 악의적 삭제)을 그대로 복제한다. 특정 시점 복구가 필요하면 별도 Backup이 필요하다.
- **"전체 평균이 안정적이면 Hot Shard도 정상이다"**: 평균은 Hot Shard를 숨긴다. 가장 느린 Replica와 가장 Hot한 Shard의 p99를 별도로 관찰해야 한다.
- **"DB 불변식은 애플리케이션 코드에서만 보호한다"**: 애플리케이션 사전 조회만으로는 동시 요청이 둘 다 통과할 수 있다. UNIQUE·CHECK·FK·조건부 UPDATE가 최종 방어선이다. 애플리케이션 검증과 DB 제약을 중복해 사용한다.
- **"JOIN 결과 행 수는 항상 큰 테이블과 같거나 작다"**: 일대다 JOIN에서 결과 행이 곱으로 늘어난다. 다대다 JOIN이나 중복 Key가 있으면 더 늘어날 수 있다. 실행 계획의 예상 행 수를 확인해야 한다.

## 9. 면접 질문

### Q1. 아이템 구매를 논리 모델→Query→Transaction→격리→Cache→확장 순서로 설명해 주세요.

Schema에 Wallet(balance CHECK >=0), PurchaseRequest(request_id UNIQUE)로 불변식을 표현한다. 랭킹 조회는 복합 Index, 구매는 조건부 UPDATE로 Lock 없이 경쟁을 해결한다. 잔액 차감·인벤토리 생성·Outbox를 한 Transaction으로 묶고 외부 HTTP는 Commit 후 분리한다. 격리는 조건부 UPDATE로 Lost Update를 막고 중복 요청은 요청 ID로 처리한다. 잔액은 Cache-Aside로 표시용으로 사용하고 구매 판단은 DB를 사용한다. 확장 시 player_id로 샤딩하면 글로벌 랭킹은 Scatter-Gather나 별도 집계를 사용한다.

### Q2. 인덱스가 있어도 사용되지 않는 이유는 무엇인가요?

결과 비율이 커서 Lookup보다 Table Scan이 저렴하거나 함수·암시적 변환으로 인덱스 탐색 범위를 만들기 어려울 때다. 통계가 데이터 분포를 잘못 추정하거나 복합 Index의 선두 열이 조건에 없을 때도 사용되지 않는다. 실행 계획의 추정·실제 행과 읽은 Page를 확인한다.

### Q3. Transaction 격리 수준은 어떻게 선택하나요?

업무 불변식과 동시 읽기·쓰기를 적고 Dirty·Non-repeatable·Phantom뿐 아니라 Lost Update·Write Skew를 시험한다. UNIQUE·조건부 UPDATE·명시 Lock으로 직접 보호한 뒤 필요한 수준을 선택하고 Retry·대기 비용을 측정한다. 격리 수준 이름과 실제 DBMS 구현이 다를 수 있어 제품 문서를 확인한다.

### Q4. MVCC를 사용하면 Lock이 필요 없나요?

아니다. 일반 Reader가 Snapshot Version을 읽어 Writer와 덜 충돌하지만 같은 행 Writer는 Lock·충돌 검사가 필요하다. 현재 상태 변경에는 `FOR UPDATE` 성격의 Locking Read가 필요할 수 있다. 긴 Snapshot의 Version 정리 비용도 남는다.

### Q5. Commit Timeout이 발생했을 때 재시도를 어떻게 안전하게 하나요?

Timeout은 Commit 여부가 불확실한 상태다. Rollback 증거가 아니므로 같은 요청을 무조건 재시도하면 중복이 생긴다. 요청 ID를 DB에 UNIQUE하게 저장하고 재시도 시 기존 결과를 조회해 반환한다. 결과가 없으면 처음부터 재시도한다.

### Q6. DB 장애 시 진단 순서를 설명해 주세요.

CPU·I/O·Memory 등 인프라 지표를 먼저 확인한다. Lock Blocking Chain과 Deadlock, Long-running Transaction을 찾는다. WAL Flush 지연, 오래된 Snapshot·Version Cleanup 지연을 본다. Replica Lag와 Cache Miss 급증이 연쇄 문제를 만드는지 확인한다. 평균이 아닌 가장 느린 Shard·Replica의 p99를 관찰한다.

## 10. 예상 꼬리질문

- 자연키와 대리키는 어떻게 선택하나요?
- Nested Loop·Hash·Merge Join을 비교해 주세요.
- Outbox 패턴이 DB와 메시지 발행의 정합성을 어떻게 보장하나요?
- Cache 장애 시 원본 DB를 어떻게 보호하나요?
- 단일 DB에서 Sharding이 필요한 시점은 언제인가요?
- Recovery Runbook을 어떻게 검증하나요?
- 면접에서 DB 설계를 설명할 때 어떤 순서로 답변하면 좋나요?

## 11. 30초 모범답변

> 데이터베이스 설계는 불변식을 Schema·제약과 짧은 Transaction으로 지키고 Query Plan과 Index로 읽는 Page를 줄이는 일입니다. 동시 변경은 조건부 UPDATE, 격리 수준, Lock·MVCC로 보호합니다. Cache·Replication·Sharding은 성능과 가용성을 높이지만 Stale Data, Failover와 Cross-shard 실패를 추가하므로 원본·멱등성·복구 경로를 함께 설계해야 합니다.

## 12. 1~2분 확장답변

> 먼저 Key, 관계와 불변식을 Schema의 UNIQUE·FK·CHECK로 표현하고 정규화로 중복 갱신을 줄입니다. Query는 실행 계획의 추정·실제 행, Join 방식과 Page 수를 보고 B+Tree·복합 Index를 설계합니다. 구매처럼 여러 변경은 짧은 Transaction으로 묶고 조건부 UPDATE와 요청 ID로 잔액 경쟁과 중복을 막습니다. Isolation 이름만 믿지 않고 Lost Update·Write Skew를 시험하며 Lock Wait, MVCC Version과 Retry를 관찰합니다. 읽기 확장은 Cache-Aside와 Replica를 사용하되 TTL·무효화, Lag와 Read-Your-Writes를 정의합니다. 단일 노드 쓰기 한계를 넘을 때 Shard Key로 분산하지만 Global Ranking, 전역 UNIQUE와 Cross-shard Transaction을 별도 설계합니다.

## 13. 핵심 요약

- DB 면접의 핵심은 데이터 불변식, 접근 패턴, 동시성, 장애 복구와 확장 전략을 하나의 흐름으로 설명하는 것이다.
- 불변식은 UNIQUE·FK·CHECK와 정규화로 DB가 최종 방어선이 되도록 표현한다. 애플리케이션 검증만으로는 동시 요청이 통과한다.
- Index는 쓰기 비용, 공간, Lock 범위를 만든다. 선택도·Sargable 조건·복합 Index 선두 열 기준으로 설계한다.
- Transaction은 짧게 유지하고 외부 HTTP는 Commit 후 분리한다. Commit Timeout은 Rollback이 아니므로 요청 ID로 기존 결과를 조회한다.
- 격리 수준 이름과 DBMS 구현이 다를 수 있다. Lost Update·Write Skew를 실제로 시험한다.
- Cache는 표시용으로 사용하고 구매 판단은 DB의 조건부 UPDATE를 사용한다. Cache 장애 시 DB를 Circuit Breaker로 보호한다.
- Replica는 읽기를 분산하지만 Primary 쓰기 처리량은 비례하지 않는다. Replica는 Backup을 대체하지 않는다.
- Sharding은 Key 배치와 Cross-shard 실패·전역 UNIQUE 문제를 추가한다. 전체 평균이 아닌 Hot Shard의 p99를 관찰한다.
- 장애 복구는 Commit 결과 불확실성, 멱등성·원장·Outbox와 검증 가능한 Runbook을 포함한다.

## 한 줄 정리

> 데이터베이스 면접의 핵심은 원본 불변식부터 Query·동시성·Cache·분산과 복구까지 하나의 증거 기반 흐름으로 연결하는 것이다.
