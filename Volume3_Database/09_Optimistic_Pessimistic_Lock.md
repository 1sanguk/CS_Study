---
difficulty: 4
reading_time: 25분
interview_frequency: 5
importance: 5
---

# 09. Optimistic Lock과 Pessimistic Lock

> 게임 서버·백엔드 개발자를 위한 CS 면접 교재

## 학습 목표

- 낙관적 Lock의 Version 패턴에서 영향 행 수로 충돌을 감지하는 원리를 설명할 수 있다.
- 비관적 Lock(FOR UPDATE)과 조건부 UPDATE 중 어떤 상황에서 무엇을 선택할지 설명할 수 있다.
- 낙관적 충돌 재시도가 항상 가능하지 않은 이유와 외부 부작용 분리의 필요성을 설명할 수 있다.
- 게임 프로필 수정, 한정 수량 선착순 지급, 길드 가입에서 각 방식을 어떻게 적용하는지 설계할 수 있다.

## 1. 개요

낙관적 Lock은 충돌이 드물다고 보고 버전 검증으로 실패를 감지하며 비관적 Lock은 먼저 DB Lock을 획득해 충돌 접근을 막는다.

낙관적 동시성 제어(Optimistic Concurrency Control)는 작업 중 다른 변경을 막지 않고 UPDATE 시점에 읽었던 상태가 그대로인지 확인한다. 상태가 바뀌었다면 실패시키고 다시 읽어 재시도하거나 사용자에게 충돌을 알린다. 이름에 Lock이 있지만 Version 열을 쓰는 전형적인 방식은 장시간 DB Lock을 보유하지 않는다.

비관적 잠금(Pessimistic Lock)은 충돌 가능성이 높거나 충돌 후 작업을 되돌리기 어렵다고 보고 변경 전에 행이나 범위를 잠근다. 다른 트랜잭션은 잠금이 풀릴 때까지 기다리거나 즉시 실패한다.

## 2. 왜 필요한가

동일 자원 갱신 빈도와 실패 비용에 따라 대기 또는 재시도를 선택해야 한다. 프로필처럼 같은 행을 동시에 수정하는 일이 드물면 모든 편집 동안 다른 작업을 잠그는 것은 불필요한 대기다. 읽은 Version을 저장하고 UPDATE 때 비교하면 대부분 한 번에 성공하고 드문 충돌만 처리할 수 있다.

반대로 한정 수량 1개를 수천 요청이 경쟁하면 대부분의 낙관적 시도가 실패해 Retry 트래픽을 낭비할 수 있다. 비관적 Lock도 접근을 줄 세우므로 Lock Wait과 Connection을 점유한다. 이런 Hot Key에는 조건부 원자 UPDATE, 입구 Queue, 분산된 재고 Bucket 등 도메인 구조 변경까지 검토한다.

## 3. 핵심 동작 원리

```text
낙관적: read version → UPDATE WHERE version=n → affected rows check (0이면 충돌)
비관적: SELECT FOR UPDATE → change → commit
조건부 UPDATE: UPDATE ... WHERE 업무상태 조건 → affected rows check
```

### 낙관적 Lock의 Version 패턴

테이블에 변경할 때마다 증가하는 Version 열을 둔다.

```text
player_profile
┌───────────┬──────────┬─────────┐
│ player_id │ nickname │ version │
├───────────┼──────────┼─────────┤
│ 101       │ Knight   │ 7       │
└───────────┴──────────┴─────────┘
```

```sql
-- Version 7을 읽은 뒤 조건에 포함해 갱신
UPDATE player_profile
SET nickname = :new_name,
    version  = version + 1
WHERE player_id = 101
  AND version   = 7;
-- affected_rows=1 → 성공, =0 → 다른 트랜잭션이 먼저 변경
```

```text
T1: Read version 7 ──── UPDATE WHERE version=7 → 1 Row, version 8
T2: Read version 7 ──── UPDATE WHERE version=7 → 0 Row, Conflict
```

모든 변경 경로가 Version을 증가시켜야 한다. 운영 Script나 Batch가 Version을 빼고 수정하면 낙관적 검사가 변경을 놓친다.

### 낙관적 재시도 한계

재화 차감처럼 연산이 `-10`이라는 의도라면 최신 잔액을 다시 읽고 조건을 검증해 재실행할 수 있다. 그러나 가격 조회, 랜덤 결과, 외부 결제와 메시지 발행을 이미 수행했다면 전체 재시도가 부작용을 중복시킨다. 요청 ID와 멱등성, 외부 작업 분리가 선행되어야 한다.

같은 필드를 다른 값으로 수정한 사용자 편집은 자동 Retry가 상대 변경을 덮을 수 있어 Merge나 사용자 확인이 필요하다. 자동 재시도에는 최대 횟수, 지수 Backoff와 Jitter, 전체 요청 기한을 둔다.

### 비관적 Lock 흐름

```sql
BEGIN;
SELECT quantity
FROM limited_item
WHERE item_id = 5001
FOR UPDATE;  -- 다른 Writer 대기

UPDATE limited_item
SET quantity = quantity - 1
WHERE item_id = 5001;

COMMIT;
-- Lock은 Commit 또는 Rollback까지 유지
```

Lock 보유 중 외부 HTTP를 호출하면 그 시간 동안 경쟁 요청과 Connection이 대기한다. 필요한 외부 데이터는 Lock 전에 준비하고 Lock 안에서는 최신 상태 재검증과 짧은 DB 변경만 수행한다.

### 조건부 UPDATE (별도 강력한 선택지)

단순 카운터·재고 차감은 SELECT 후 UPDATE 대신 한 문장의 조건부 UPDATE로 해결할 수 있다.

```sql
UPDATE limited_item
SET quantity = quantity - 1
WHERE item_id = 5001
  AND quantity > 0;
-- affected_rows=0이면 재고 없음 처리
```

DB는 변경하는 행의 Lock과 조건 재검사를 처리하고 영향 행 수로 성공을 결정한다. 네트워크 왕복과 Transaction 시간을 줄인다. 여러 변경이 필요하면 같은 Transaction에 이어서 수행한다.

### NOWAIT와 SKIP LOCKED

일부 DBMS는 Lock을 기다리지 않고 즉시 오류를 내는 NOWAIT, 이미 잠긴 행을 건너뛰는 SKIP LOCKED 기능을 제공한다. Worker Queue에서 여러 Worker가 다음 미처리 작업을 가져갈 때 SKIP LOCKED로 서로 다른 행을 선택할 수 있다. 단, 잠긴 작업이 계속 건너뛰어져 기아 상태가 될 수 있고 처리 순서가 엄격하지 않다.

### Deadlock 방지

두 플레이어 거래에서 T1은 A→B, T2는 B→A 순으로 Lock하면 Deadlock이 생긴다. 플레이어 ID 오름차순처럼 전역 획득 순서를 정한다.

```text
Transaction T1: lock Player 10 → lock Player 20
Transaction T2: lock Player 10 → lock Player 20
                동일 순서로 Circular Wait 방지
```

## 4. 쉬운 예시

위키 문서를 편집한다고 하자. 사용자가 Version 7 문서를 열어 오랫동안 편집하는 동안 다른 사용자가 Version 8로 저장했다. Version 7 조건의 저장은 실패하고 최신 변경과 Merge하도록 한다. 편집 시작 때부터 다른 사용자를 수분 동안 막는 비관적 Lock은 협업성과 장애 복구에 불리하다.

```java
// 낙관적 Lock: 프로필 수정
public boolean updateNickname(Connection conn, long playerId,
        int currentVersion, String newNickname) throws SQLException {
    conn.setAutoCommit(false);
    try {
        PreparedStatement update = conn.prepareStatement(
            "UPDATE player_profile " +
            "SET nickname = ?, version = version + 1 " +
            "WHERE player_id = ? AND version = ?");
        update.setString(1, newNickname);
        update.setLong(2, playerId);
        update.setInt(3, currentVersion);
        int affected = update.executeUpdate();
        conn.commit();
        return affected > 0; // false면 충돌 - 최신 상태 재조회 후 Merge 또는 사용자 알림
    } catch (SQLException e) {
        conn.rollback();
        throw e;
    }
}
```

```java
// 비관적 Lock: 한정 수량 선착순 지급
public boolean claimLimitedItem(Connection conn, long itemId, long playerId)
        throws SQLException {
    conn.setAutoCommit(false);
    try {
        // FOR UPDATE로 다른 Writer 대기
        PreparedStatement lock = conn.prepareStatement(
            "SELECT quantity FROM limited_item WHERE item_id = ? FOR UPDATE");
        lock.setLong(1, itemId);
        ResultSet rs = lock.executeQuery();
        if (!rs.next() || rs.getInt("quantity") <= 0) {
            conn.rollback();
            return false;
        }

        PreparedStatement deduct = conn.prepareStatement(
            "UPDATE limited_item SET quantity = quantity - 1 WHERE item_id = ?");
        deduct.setLong(1, itemId);
        deduct.executeUpdate();

        PreparedStatement grant = conn.prepareStatement(
            "INSERT INTO player_item (player_id, item_id) VALUES (?, ?)");
        grant.setLong(1, playerId);
        grant.setLong(2, itemId);
        grant.executeUpdate();

        conn.commit();
        return true;
    } catch (SQLException e) {
        conn.rollback();
        throw e;
    }
}
```

반대로 수량 차감만 필요하다면 조건부 UPDATE 한 문장이 `SELECT FOR UPDATE` + `UPDATE` 두 왕복보다 단순하다.

```java
// 조건부 UPDATE: 수량 차감만 할 때
public boolean deductStock(Connection conn, long itemId) throws SQLException {
    PreparedStatement deduct = conn.prepareStatement(
        "UPDATE limited_item SET quantity = quantity - 1 " +
        "WHERE item_id = ? AND quantity > 0");
    deduct.setLong(1, itemId);
    return deduct.executeUpdate() > 0;
}
```

## 5. 비슷한 개념과 비교

| 구분 | 낙관적 Version | 비관적 DB Lock | 조건부 UPDATE |
|---|---|---|---|
| 충돌 처리 시점 | UPDATE 시 감지 | 진입 시 차단 | UPDATE 조건 검사 |
| DB Lock 보유 | 없음 (짧은 Transaction) | 획득 후 Commit까지 | UPDATE 실행 중만 |
| 충돌 결과 | 영향 0행, Retry·Merge | Lock Wait·Timeout·Deadlock | 영향 0행 |
| 재시도 필요 | 있음 (Domain 의미 검토 필수) | Deadlock 발생 시 있음 | 없음 (한 문장으로 완결) |
| 적합 | 드문 충돌, 긴 사용자 편집 | 잦은 충돌, 짧은 DB 작업 | 단일 자원 단순 차감 |

| 선택 기준 | 낙관적 방식에 유리 | 비관적 방식에 유리 |
|---|---|---|
| 충돌 빈도 | 낮음 | 높음·예측 가능 |
| 작업 시간 | 사용자 편집처럼 김 | DB 내부에서 짧음 |
| 충돌 후 비용 | 재계산·Merge 가능 | 재수행 비용 큼 |
| 대기 허용 | 실패를 빠르게 반환 | 짧은 순차 대기 허용 |

분산 Lock(Redis)과 DB 비관적 Lock도 구분한다. Redis Lock은 여러 프로세스의 작업 진입을 조정할 수 있지만 DB Commit과 원자적으로 묶이지 않으며 Lease 만료·네트워크 분할·Fencing Token을 고려해야 한다. DB Constraint와 조건부 UPDATE를 제거하는 근거가 되지 않는다.

## 6. 장점과 단점

**낙관적 Lock의 장점**

- 긴 사용자 작업 중 DB 자원을 점유하지 않아 Connection 효율이 좋다.
- 충돌이 낮을 때 처리량이 높고 Lock 대기·Deadlock이 없다.

**낙관적 Lock의 단점**

- 충돌 후 계산·사용자 입력을 다시 적용해야 한다.
- 높은 충돌에서 Retry 폭증이 생기고 외부 부작용 분리를 꼼꼼히 설계해야 한다.
- 모든 변경 경로가 Version을 증가시켜야 하는 규약이 필요하다.

**비관적 Lock의 장점**

- 충돌을 미리 순서화해 복잡한 변경을 단순화한다.
- Lock 안에서 최신 상태가 보장되어 추가 검증이 단순하다.

**비관적 Lock의 단점**

- Lock Wait, Deadlock, Connection 점유와 꼬리 지연을 만든다.
- Lock 보유 중 외부 I/O가 있으면 다른 요청 대기가 길어진다.

## 7. 게임 서버·백엔드 실무 예시

프로필 수정은 Version 열 기반 낙관적 Lock이 적합할 수 있고 한정 수량 선착순 지급은 조건부 UPDATE나 비관적 Lock을 고려한다. 외부 호출을 Lock 안에 두지 않는다.

길드 정원은 여러 Membership 행의 범위 불변식이다. 길드 Header의 `member_count`를 `member_count < capacity` 조건으로 증가시키고 Membership INSERT와 한 Transaction으로 묶는다. 단일 길드가 Hot Key가 되면 가입 Queue와 Admission 제어를 검토한다.

여러 Worker가 DB 작업 Queue를 소비할 때 `FOR UPDATE SKIP LOCKED`로 서로 다른 대기 행을 가져올 수 있다. 처리 중 Worker Crash에 대비해 Lease 만료, 시도 횟수와 멱등 작업 ID를 둔다. Lock을 잡은 채 긴 작업을 하지 않고 짧게 Claim 상태만 Commit한다.

낙관적 충돌률이 1%에서 30%로 늘었다면 Retry 횟수를 올리지 않는다. 특정 플레이어·길드·상품 집중, 읽기 후 계산 시간, Version Aggregate 범위를 확인한다. 비관적 Lock p99가 늘면 Transaction 안의 외부 호출, 누락된 인덱스와 Lock 순서를 확인한다.

## 8. 자주 하는 오해

- **"낙관적 Lock은 충돌해도 항상 안전하게 자동 재시도된다"**: 재시도가 항상 가능하지 않다. 같은 필드를 다른 값으로 수정한 경우 자동 Retry가 상대 변경을 덮을 수 있고 외부 결제·메시지 발행을 이미 수행했다면 전체 재시도가 중복 부작용을 만든다.
- **"비관적 Lock을 쓰면 Deadlock과 실패가 없다"**: 비관적 Lock도 Deadlock이 발생하고 DBMS가 희생자를 Rollback한다. Lock Timeout도 실패다. 모든 경로에서 일관된 자원 획득 순서, Timeout과 Deadlock Retry가 필요하다.
- **"FOR UPDATE가 사용자 편집 시간 전체를 잠그는 데 적합하다"**: `FOR UPDATE`는 Commit 또는 Rollback까지 Lock을 유지한다. 사용자 편집 수분 동안 다른 요청을 모두 대기시키면 Connection과 처리량에 심각한 영향을 준다. 긴 편집에는 낙관적 Version이 적합하다.
- **"MVCC와 Version 열 기반 낙관적 Lock은 같은 기능이다"**: MVCC는 DB 내부가 여러 행 버전을 관리하는 동시성 제어 방식이다. 낙관적 Lock은 애플리케이션이 `WHERE version=?`으로 읽은 이후 변경 여부를 감지하는 패턴이다. 함께 사용할 수 있다.
- **"분산 Lock(Redis)이 DB Constraint와 조건부 UPDATE를 대체한다"**: Redis Lock은 여러 프로세스의 진입을 조정하지만 DB Commit과 원자적으로 묶이지 않는다. Lease 만료·네트워크 분할·Fencing Token을 고려해야 하며 DB의 최종 방어선은 유지해야 한다.
- **"낙관적 충돌률이 높아지면 Retry 횟수를 늘리면 된다"**: Retry가 많아지면 DB CPU와 로그, 트래픽이 더 늘어나는 악순환이 생긴다. Hot Key 분산, 조건부 UPDATE로의 전환, 입구 Queue와 같은 도메인 구조 변경을 검토해야 한다.
- **"조건부 UPDATE는 낙관적 Lock도 비관적 Lock도 아니라 별개 개념이다"**: 조건부 UPDATE는 업무 상태를 WHERE에 포함해 "조건이 유지되었을 때만 쓰기"를 수행한다는 점에서 낙관적 방식과 유사하다. 단, 범용 Version 열을 쓰지 않고 업무 조건 자체를 감지 기준으로 사용한다.

## 9. 면접 질문

### Q1. 낙관적 Lock을 SQL로 어떻게 구현하나요?

행에 Version 열을 두고 읽은 Version을 UPDATE의 WHERE에 포함한다. 성공 시 Version을 증가시키고 영향 행이 0개면 다른 변경이 있었다고 판단한다. 변경 종류에 따라 최신 상태를 다시 읽고 Merge·재시도 또는 충돌 응답을 선택한다.

### Q2. 낙관적 Lock 충돌은 무조건 재시도하나요?

아니다. 같은 필드를 다른 값으로 수정한 사용자 편집은 자동 Retry가 상대 변경을 덮을 수 있어 Merge나 사용자 확인이 필요하다. 외부 결제·메시지 발행을 이미 수행했다면 전체 재시도가 중복 부작용을 만든다. 재화 연산처럼 의도가 명확한 경우에만 최신 상태에서 전체 조건을 다시 검증해 재실행한다.

### Q3. 비관적 Lock은 언제 적합한가요?

충돌 가능성이 높고 Transaction이 DB 안에서 짧으며 충돌 후 전체 작업을 다시 수행하는 비용이 큰 경우 고려한다. Lock 보유 중 외부 I/O를 하지 않고 일정한 자원 순서, Timeout과 Deadlock Retry를 설계한다.

### Q4. 게임 프로필 수정과 한정 수량 지급에서 각각 어떤 방식을 선택하나요?

프로필 수정은 충돌이 드물고 사용자 편집 시간이 길어 낙관적 Version 방식이 적합하다. 0행 갱신 시 최신 데이터를 보여 주고 Merge를 유도한다. 한정 수량 지급은 충돌이 잦고 재수행 비용이 있으므로 조건부 UPDATE(`quantity > 0`) 또는 비관적 Lock을 고려한다. 수천 명 경쟁이면 입구 Queue를 검토한다.

### Q5. NOWAIT와 SKIP LOCKED는 언제 사용하나요?

NOWAIT는 Lock 대기 없이 즉시 "현재 처리 중"을 반환할 때 사용한다. 즉시 Retry 루프를 만들면 DB를 압박하므로 Backoff나 Queue가 필요하다. SKIP LOCKED는 Worker Queue에서 여러 Worker가 서로 다른 행을 가져갈 때 유용하다. 인벤토리 조회처럼 잠긴 행을 조용히 생략하면 잘못된 결과가 되므로 의미에 맞춰 사용한다.

### Q6. 분산 Lock(Redis)이 DB 비관적 Lock을 대체할 수 있나요?

대체하지 못한다. Redis Lock은 여러 프로세스의 진입을 조정하지만 DB Commit과 원자적으로 묶이지 않는다. Lease 만료·네트워크 분할·Fencing Token 없이 중복 처리가 생길 수 있다. DB의 조건부 UPDATE와 Constraint가 최종 방어선이다.

## 10. 예상 꼬리질문

- Version 열은 어떤 경로에서도 증가해야 하나요?
- Timestamp와 정수 Version 중 어떤 것이 유리한가요?
- 낙관적 충돌률이 급증했을 때 도메인 구조를 어떻게 바꾸나요?
- `FOR UPDATE SKIP LOCKED`로 Worker Queue를 구현할 때 주의할 점은 무엇인가요?
- 분산 Lock과 DB Lock을 함께 쓸 때 주의할 점은 무엇인가요?
- Aggregate 경계가 낙관적 Lock 설계에 어떤 영향을 주나요?
- 낙관적 충돌 재시도가 사용자에게 노출되는 경우는 언제인가요?

## 11. 30초 모범답변

> 낙관적 Lock은 Version 충돌을 검출해 재시도하고 비관적 Lock은 먼저 잠가 충돌을 차단합니다. 충돌 빈도와 재시도 비용으로 선택합니다. 프로필 수정처럼 충돌이 드물고 편집이 긴 작업에는 낙관적 방식, 한정 수량 지급처럼 충돌이 잦고 짧은 작업에는 조건부 UPDATE나 비관적 Lock을 고려합니다.

## 12. 1~2분 확장답변

> 낙관적 Lock은 Version 충돌을 검출해 재시도하고 비관적 Lock은 먼저 잠가 충돌을 차단합니다. 낙관적 재시도가 항상 안전하지는 않습니다. 외부 결제·메시지 발행을 이미 수행했다면 전체 재시도가 중복을 만들므로 외부 부작용은 Commit 성공 후로 분리하고 멱등성을 설계해야 합니다. 충돌률이 높아지면 Retry 횟수를 올리지 않고 Hot Key 분산과 조건부 UPDATE로 전환합니다. 비관적 Lock도 Deadlock이 생기고 Lock 보유 중 외부 I/O가 있으면 대기가 길어지므로 Lock 안에서는 짧은 DB 변경만 수행합니다.

## 13. 핵심 요약

- 낙관적 Lock은 충돌이 드물다고 보고 버전 검증으로 실패를 감지하며 비관적 Lock은 먼저 DB Lock을 획득해 충돌 접근을 막는다.
- 낙관적 충돌 재시도는 Domain 의미와 외부 부작용을 먼저 확인해야 한다. 자동 Retry가 항상 안전하지 않다.
- 비관적 Lock도 Deadlock이 생기고 Lock 보유 중 외부 I/O가 있으면 대기가 길어진다. Lock 안에서는 짧은 DB 변경만 수행한다.
- 조건부 UPDATE는 업무 상태를 WHERE에 포함해 SELECT 없이 경쟁 승자를 결정한다. 단순 차감에서 가장 직접적인 선택지다.
- MVCC와 Version 열 낙관적 Lock은 다르다. MVCC는 DB 내부 버전 관리, 낙관적 Lock은 애플리케이션의 변경 감지 패턴이다.
- 분산 Lock은 DB Commit과 원자적으로 묶이지 않아 DB Constraint와 조건부 UPDATE를 대체하지 못한다.
- 낙관적 충돌률이 급증하면 Retry 횟수가 아닌 Hot Key 분산과 도메인 구조를 개선한다.
- `FOR UPDATE SKIP LOCKED`는 Worker Queue에서 여러 Worker가 서로 다른 행을 가져갈 때 유용하지만 기아와 순서 보장 없음에 주의한다.

## 한 줄 정리

> 낙관적 Lock은 버전 충돌을 검출해 재시도하고 비관적 Lock은 먼저 잠가 충돌을 차단합니다. 충돌 빈도와 재시도 비용으로 선택합니다.
