---
difficulty: 3
reading_time: 25분
interview_frequency: 5
importance: 5
---

# 06. Transaction과 ACID


## 학습 목표

- ACID 각 속성이 보장하는 범위와 보장하지 않는 것을 구분해 설명할 수 있다.
- WAL이 지속성을 제공하는 원리와 긴 트랜잭션의 비용을 설명할 수 있다.
- COMMIT 결과 불확실 시 멱등성 설계가 필요한 이유를 설명할 수 있다.
- 게임 아이템 구매 트랜잭션에서 외부 HTTP 호출과 Outbox 패턴을 올바르게 배치할 수 있다.

## 1. 개요

트랜잭션은 여러 DB 연산을 하나의 논리 작업으로 묶으며 ACID(Atomicity, Consistency, Isolation, Durability)는 원자성, 일관성, 격리성, 지속성의 성질이다.

트랜잭션(Transaction)은 데이터베이스 상태를 하나의 유효한 상태에서 다른 유효한 상태로 바꾸는 논리 작업 단위다. 여러 SQL 문이 포함될 수 있고, 일부만 반영되어서는 안 되는 비즈니스 경계를 표현한다.

ACID라는 단어만으로 모든 동시성 문제와 외부 시스템 정합성이 자동 해결되지는 않는다. 실제 보장은 DBMS, 저장 엔진, 격리 수준, Commit 설정과 트랜잭션 경계에 따라 달라진다.

## 2. 왜 필요한가

재화 차감과 아이템 지급 중 일부만 성공하면 비즈니스 불변식이 깨지므로 모두 반영하거나 모두 취소해야 한다.

플레이어가 100 골드로 아이템을 구매할 때 골드만 차감되고 아이템 생성이 실패하면 데이터는 기술적으로 저장되었어도 업무적으로 잘못된 상태다. 두 변경을 같은 트랜잭션으로 묶으면 둘 다 Commit되거나 둘 다 Rollback된다.

동시에 두 구매 요청이 들어오면 둘 다 같은 잔액을 읽을 수 있다. 원자성만으로는 동시 트랜잭션의 관찰을 직렬화하지 않는다. 조건부 UPDATE, Lock·MVCC(Multi-Version Concurrency Control)와 적절한 격리 수준으로 잔액 음수라는 불변식을 지켜야 한다.

## 3. 핵심 동작 원리

```text
BEGIN → read/check → update money → insert item → COMMIT or ROLLBACK
```

### ACID 각 속성

- **Atomicity(원자성)**: 전체 반영 또는 전체 취소. 실행 중 오류가 나면 아직 Commit하지 않은 변경을 Rollback한다.
- **Consistency(일관성)**: 트랜잭션 전후 불변식을 만족하는 상태 전이. DB 제약과 애플리케이션 로직이 함께 표현한다.
- **Isolation(격리성)**: 동시에 실행되는 트랜잭션이 서로의 중간 상태와 변경에 어떤 영향을 받는지 제어한다.
- **Durability(지속성)**: Commit 성공을 받은 결과가 프로세스나 시스템 장애 후에도 복구될 수 있는 성질이다.

원자성은 DB 트랜잭션 밖의 이메일, HTTP 결제, 메시지 전송까지 자동으로 되돌리지 못한다. Consistency는 분산 시스템의 Replica 즉시 일치와 문맥이 다르다.

### WAL과 데이터 페이지

```text
Transaction이 Buffer Pool의 Page 변경
          │
          v
   WAL Record 생성
          │
COMMIT → 필요한 Log를 Durable Storage에 Flush
          │
          v
Data Page는 나중에 Background Flush 가능
```

WAL(Write-Ahead Logging)은 변경된 데이터 페이지보다 로그를 먼저 안정적으로 기록한다. Commit 시 모든 페이지를 즉시 저장하지 않아도 지속성과 복구를 제공한다. 장애 후 로그를 재생해 Commit 변경을 복원하고 미완료 작업을 정리한다.

### COMMIT 결과 불확실 시

서버가 COMMIT을 보낸 뒤 응답을 받기 전에 네트워크가 끊기면 DB가 Commit했는지 Rollback했는지 모른다.

```text
App ── COMMIT ──> DB
                  DB Commit 완료
App <── 응답 X ── Network 단절
App 관점: 결과 불명
```

타임아웃을 Rollback 증거로 간주해 같은 구매를 재시도하면 중복 지급이 생길 수 있다. 요청 ID를 UNIQUE로 저장하고 같은 ID 재시도에 기존 결과를 반환하는 멱등 처리가 필요하다.

### 긴 트랜잭션의 문제

트랜잭션을 오래 열면 Lock을 오래 보유해 다른 쓰기를 막는다. MVCC 엔진에서도 오래된 Snapshot 때문에 이전 Row Version 정리가 지연되어 저장 공간이 늘 수 있다. Connection Pool 연결도 점유해 요청 대기가 확산된다.

사용자 입력, 외부 HTTP, 긴 CPU(Central Processing Unit) 계산을 트랜잭션 안에서 기다리지 않는다.

### Transactional Outbox

DB 트랜잭션과 메시지 브로커 Publish를 원자적으로 한 번에 Commit할 수 없는 구성이 흔하다.

```text
BEGIN
  Update Purchase
  Insert Outbox(event_id, payload)
COMMIT
       ↓
Outbox Publisher → Message Broker → Idempotent Consumer
```

Transactional Outbox는 비즈니스 변경과 발행할 이벤트를 같은 DB 트랜잭션에 저장한다. Publisher 재시도로 이벤트가 중복될 수 있으므로 Consumer도 Event ID로 멱등 처리한다.

## 4. 쉬운 예시

```java
// 트랜잭션 경계 + 멱등성 키 예시
public PurchaseResult purchaseItem(Connection conn, String requestId,
        long playerId, int price, String itemCode) throws SQLException {
    conn.setAutoCommit(false);
    try {
        // 1. 요청 ID 중복 확인 (멱등성: 같은 requestId 재시도 시 기존 결과 반환)
        PreparedStatement checkDup = conn.prepareStatement(
            "SELECT result FROM purchase_request WHERE request_id = ?");
        checkDup.setString(1, requestId);
        ResultSet rs = checkDup.executeQuery();
        if (rs.next()) return PurchaseResult.from(rs.getString("result"));

        // 2. 잔액 조건부 차감
        PreparedStatement deduct = conn.prepareStatement(
            "UPDATE player SET balance = balance - ? " +
            "WHERE player_id = ? AND balance >= ?");
        deduct.setInt(1, price);
        deduct.setLong(2, playerId);
        deduct.setInt(3, price);
        if (deduct.executeUpdate() == 0) {
            conn.rollback();
            return PurchaseResult.INSUFFICIENT;
        }

        // 3. 아이템 생성 + 요청 ID 기록 (한 트랜잭션)
        PreparedStatement addItem = conn.prepareStatement(
            "INSERT INTO inventory (player_id, item_code) VALUES (?, ?)");
        addItem.setLong(1, playerId);
        addItem.setString(2, itemCode);
        addItem.executeUpdate();

        PreparedStatement logReq = conn.prepareStatement(
            "INSERT INTO purchase_request (request_id, player_id, result) " +
            "VALUES (?, ?, 'SUCCESS')");
        logReq.setString(1, requestId);
        logReq.setLong(2, playerId);
        logReq.executeUpdate();

        conn.commit();
        return PurchaseResult.SUCCESS;
        // 외부 HTTP(알림, PG)는 commit() 성공 후에만 실행
    } catch (SQLException e) {
        conn.rollback(); // 반드시 Rollback
        throw e;
    }
}
```

```sql
-- 트랜잭션 흐름 SQL
BEGIN;

UPDATE player SET balance = balance - 100
WHERE player_id = 101 AND balance >= 100;  -- 조건부: 잔액 확인 + 차감 원자화

-- 영향받은 행 0이면 ROLLBACK
INSERT INTO inventory_item(player_id, item_code) VALUES (101, 'SWORD_001');

COMMIT;
-- 두 변경이 모두 반영되거나 모두 취소됨
```

## 5. 비슷한 개념과 비교

| 개념 | 해결 범위 | 해결하지 않는 것 |
|---|---|---|
| DB Transaction | 한 DB 경계의 원자 변경·격리·복구 | 외부 HTTP·Broker 자동 Rollback |
| Lock | 충돌 접근 순서 제어 | 장애 후 지속성 전체 |
| Constraint | 저장 데이터 불변식 검사 | 모든 도메인 Workflow |
| Idempotency | 같은 요청 반복의 중복 효과 방지 | 서로 다른 동시 요청의 경쟁 |
| Outbox | DB 변경과 이벤트를 함께 Commit | Consumer 중복 자동 제거 |

| ACID 속성 | 보장하는 것 | 보장하지 않는 것 |
|---|---|---|
| Atomicity | DB 변경의 전부 또는 전무 | 외부 HTTP·메시지 롤백 |
| Consistency | 선언된 제약·불변식 만족 | 모든 도메인 규칙 |
| Isolation | 동시 트랜잭션 상호 영향 제어 | 격리 수준에 따라 허용 현상 다름 |
| Durability | Commit 결과의 장애 후 복구 | 복제 Lag, 미러링 장애 등 |

## 6. 장점과 단점

**트랜잭션의 장점**

- 부분 실패와 동시 변경을 명확한 경계에서 제어한다.
- WAL로 장애 후 복구 가능한 상태를 만든다.
- Lock·MVCC로 동시 트랜잭션의 불변식을 보호한다.

**트랜잭션의 단점**

- Lock 대기, Deadlock, Rollback 비용이 생긴다.
- MVCC에서도 오래된 Snapshot은 Version 정리를 지연시킨다.
- Connection Pool 연결을 점유해 긴 트랜잭션은 요청 대기를 확산시킨다.

**트랜잭션 설계 시 주의 사항**

- 외부 HTTP, 사용자 입력, 긴 CPU 계산을 트랜잭션 안에 두지 않는다.
- Commit 후 응답 불확실 시 멱등성이 없으면 중복 처리가 생긴다.
- 격리를 강하게 하고 범위를 넓힐수록 동시 처리량과 가용성이 낮아질 수 있다.

## 7. 게임 서버·백엔드 실무 예시

아이템 구매를 짧은 트랜잭션으로 묶고 외부 HTTP 호출은 Commit 성공 후에 실행한다. COMMIT 결과를 못 받은 재시도에는 요청 ID와 멱등성이 필요하다.

클라이언트 가격을 신뢰하지 않고 서버가 상품 가격과 판매 가능 여부를 트랜잭션 직전에 다시 확인한다. 거래 원장은 현재 잔액뿐 아니라 감사와 복구 근거를 제공하고 원장 행의 중복을 요청 ID UNIQUE로 막는다.

운영 지표에는 초당 Commit·Rollback, Transaction p95·p99, 활성·장기 트랜잭션 수, Lock Wait, Deadlock, Log Flush 지연, Connection Pool 대기를 포함한다.

배포 코드가 예외를 잡으면서 Rollback을 빠뜨리면 연결이 Pool에서 계속 Transaction 상태일 수 있다. 언어의 `try-with-resources`·RAII로 Commit하지 않은 경로의 Rollback을 보장한다.

## 8. 자주 하는 오해

- **"ACID Consistency는 Replica 간 즉시 일치다"**: ACID의 C는 트랜잭션 전후 불변식을 만족하는 상태 전이다. 분산 시스템의 Strong Consistency(Replica 즉시 일치)와 문맥이 다르다.
- **"COMMIT Timeout이면 반드시 Rollback됐다"**: 네트워크가 끊기면 DB가 Commit했는지 Rollback했는지 모른다. 타임아웃을 Rollback 증거로 간주해 재시도하면 중복이 생길 수 있다.
- **"Auto-commit에서도 여러 SQL이 자동으로 한 Transaction이다"**: Auto-commit에서는 각 문장이 독립 트랜잭션이 될 수 있다. 여러 문장을 묶으려면 명시적 BEGIN/COMMIT 경계가 필요하다.
- **"Transaction 안에서 HTTP를 호출하면 함께 Rollback된다"**: DB 트랜잭션은 DB 상태만 관리한다. 외부 HTTP, 이메일, 메시지 전송은 트랜잭션과 별개이므로 Outbox 패턴이나 Saga가 필요하다.
- **"MVCC를 쓰면 긴 Transaction 비용이 없다"**: MVCC도 오래된 Snapshot이 있으면 이전 Row Version 정리가 지연되어 저장 공간이 늘 수 있다. Lock은 줄지만 Connection Pool 점유와 Version 비용은 남는다.
- **"Deadlock은 재시도하면 자동으로 해결된다"**: 재시도가 같은 락 순서로 같은 경쟁을 반복하면 계속 Deadlock이 생길 수 있다. 자원 획득 순서를 고정하고 트랜잭션을 짧게 유지해야 한다.
- **"Savepoint로 트랜잭션을 쪼개면 비용이 없다"**: Savepoint는 중간 지점 이후를 되돌리는 기능이지 Lock과 Version 보존 비용을 없애지는 않는다. 긴 트랜잭션의 근본 비용은 해결하지 못한다.

## 9. 면접 질문

### Q1. ACID를 각각 설명해 주세요.

원자성은 전체 반영 또는 전체 취소, 일관성은 선언된 불변식을 만족하는 상태 전이, 격리성은 동시 트랜잭션의 상호 관찰 제어, 지속성은 Commit 결과가 장애 후에도 복구되는 성질이다. 원자성은 DB 트랜잭션 밖의 외부 API를 자동으로 되돌리지 않고, Consistency는 분산 시스템의 Replica 즉시 일치와 다르다.

### Q2. WAL은 왜 필요한가요?

변경된 데이터 페이지보다 로그를 먼저 안정적으로 기록해 Commit 시 모든 페이지를 즉시 저장하지 않아도 지속성과 복구를 제공하기 위해서다. 장애 후 로그로 Commit 변경을 재실행하고 미완료 작업을 정리한다. 순차 로그 기록으로 무작위 데이터 페이지 I/O를 줄인다.

### Q3. COMMIT 응답을 받지 못하면 어떻게 하나요?

Commit 여부가 불확실하므로 타임아웃을 Rollback 증거로 간주해 재시도하면 중복이 생길 수 있다. 요청 ID를 DB에 UNIQUE하게 저장하고 같은 ID 재시도에 기존 결과를 반환하는 멱등 처리를 설계한다.

### Q4. 긴 트랜잭션이 왜 문제가 되나요?

Lock을 오래 보유해 다른 쓰기를 막고 Deadlock 가능성을 높인다. MVCC에서도 오래된 Snapshot이 이전 Row Version 정리를 지연시켜 저장 공간이 늘어난다. Connection Pool 연결을 오래 점유해 요청 대기가 확산된다. 외부 HTTP나 사용자 입력 대기를 트랜잭션 안에 두면 이 문제가 심화된다.

### Q5. Transactional Outbox 패턴이 필요한 이유는 무엇인가요?

DB Commit과 메시지 브로커 Publish를 원자적으로 한 번에 처리할 수 없는 구성에서 이벤트 누락을 막기 위해서다. 비즈니스 변경과 발행할 이벤트를 같은 DB 트랜잭션에 저장하고 별도 Publisher가 Outbox를 읽어 발행한다. Publisher 재시도로 중복이 생길 수 있으므로 Consumer도 Event ID로 멱등 처리한다.

### Q6. 게임 아이템 구매에서 트랜잭션 경계를 어떻게 설계하나요?

요청 ID 중복 확인, 조건부 잔액 차감, 아이템 생성, 요청 ID 기록을 한 트랜잭션으로 묶는다. 클라이언트 가격을 신뢰하지 않고 서버가 상품 가격을 직전에 확인한다. 외부 HTTP(알림, 결제 PG)는 Commit 성공 후에만 실행한다. 이벤트 발행이 필요하면 Outbox를 트랜잭션 안에 기록한다.

## 10. 예상 꼬리질문

- Atomicity와 Isolation은 어떻게 다른가요?
- Group Commit의 장단점은 무엇인가요?
- Deadlock이 발생했을 때 어떻게 감지하나요?
- 롤백은 데이터 페이지를 어떻게 되돌리나요?
- Savepoint와 Nested Transaction의 차이는 무엇인가요?
- 거래 원장을 설계할 때 무엇을 고려하나요?
- 분산 트랜잭션과 Saga의 차이는 무엇인가요?

## 11. 30초 모범답변

> 트랜잭션은 여러 연산을 하나의 작업으로 묶고 ACID로 부분 반영, 동시 실행 오류와 장애 후 손실을 제어합니다. 단 원자성은 DB 밖의 HTTP와 메시지를 자동으로 되돌리지 않으며, COMMIT 응답을 못 받으면 재시도 중복이 생길 수 있습니다. 요청 ID로 멱등 처리하고 외부 부작용은 Outbox 패턴으로 분리합니다.

## 12. 1~2분 확장답변

> 트랜잭션은 여러 연산을 하나의 작업으로 묶고 ACID로 부분 반영, 동시 실행 오류와 장애 후 손실을 제어합니다. WAL은 변경 로그를 데이터 페이지보다 먼저 기록해 지속성과 빠른 복구를 제공합니다. 긴 트랜잭션은 Lock을 오래 보유하고 MVCC에서도 이전 Version 정리를 지연시키므로 외부 HTTP나 사용자 입력 대기를 안에 두지 않습니다. COMMIT 응답을 못 받으면 결과가 불확실하므로 요청 ID UNIQUE로 멱등 처리합니다. DB Commit과 이벤트 발행을 같이 원자화할 수 없을 때는 Transactional Outbox로 같은 트랜잭션에 이벤트를 기록하고 별도 Publisher가 발행합니다.

## 13. 핵심 요약

- 트랜잭션은 여러 DB 연산을 하나의 논리 작업으로 묶으며 ACID는 원자성, 일관성, 격리성, 지속성의 성질이다.
- 원자성은 DB 트랜잭션 밖의 이메일, HTTP, 메시지 전송까지 자동으로 되돌리지 못한다.
- WAL은 변경 로그를 데이터 페이지보다 먼저 안정적으로 기록해 지속성과 복구를 제공한다.
- COMMIT 응답을 받지 못하면 Commit 여부가 불확실하다. 타임아웃을 Rollback으로 간주하면 중복이 생길 수 있다. 요청 ID를 UNIQUE로 저장해 멱등 처리한다.
- 긴 트랜잭션은 Lock을 오래 보유하고 MVCC에서도 Version 정리를 지연시키며 Connection Pool을 점유한다.
- ACID의 Consistency는 트랜잭션 전후 불변식을 만족하는 상태 전이다. 분산 시스템의 Replica 즉시 일치와 다르다.
- Transactional Outbox는 비즈니스 변경과 이벤트를 같은 트랜잭션에 저장해 DB Commit과 이벤트 발행의 원자성을 확보한다. Consumer는 Event ID로 멱등 처리한다.
- 게임 아이템 구매에서는 요청 ID 확인, 조건부 차감, 아이템 생성, 요청 ID 기록을 한 트랜잭션으로 묶는다. 외부 HTTP는 Commit 성공 후에만 실행한다.

## 한 줄 정리

> 트랜잭션은 여러 연산을 하나의 작업으로 묶고 ACID로 부분 반영, 동시 실행 오류와 장애 후 손실을 제어합니다. DB 밖의 부작용과 COMMIT 불확실성에는 별도 멱등성과 Outbox 패턴이 필요합니다.
