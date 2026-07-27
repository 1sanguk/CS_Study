---
difficulty: 4
reading_time: 25분
interview_frequency: 5
importance: 5
---

# 08. DB Lock과 MVCC

> 게임 서버·백엔드 개발자를 위한 CS 면접 교재

## 학습 목표

- Shared Lock과 Exclusive Lock의 호환 규칙, Intent Lock, Lock Escalation을 설명할 수 있다.
- MVCC에서 행 버전이 어떻게 생성·관리·정리되는지, Reader가 어떤 버전을 선택하는지 설명할 수 있다.
- MVCC도 쓰기 충돌(Write-Write, Write Skew)이 남는 이유와 조건부 UPDATE의 역할을 설명할 수 있다.
- 긴 읽기 트랜잭션이 Version 정리를 어떻게 지연시키는지와 Lock 장애 진단 순서를 설명할 수 있다.

## 1. 개요

DB Lock은 충돌하는 접근을 대기시켜 일관성을 지키고 MVCC는 여러 버전으로 읽기와 쓰기의 충돌을 줄이는 방식이다.

DB 잠금(Lock)은 여러 트랜잭션이 같은 데이터에 접근할 때 허용 가능한 조합만 동시에 실행하도록 한다. MVCC(Multi-Version Concurrency Control)는 행의 여러 버전과 트랜잭션 가시성 정보를 이용해 독자가 자신의 Snapshot에 맞는 버전을 읽도록 한다. 일반 읽기가 Writer의 미커밋 변경을 기다리지 않게 할 수 있어 읽기 동시성을 높인다.

두 방식은 배타적인 선택이 아니다. MVCC DB도 같은 행을 동시에 변경하는 Writer 사이에는 Lock이나 충돌 검사가 필요하고, 명시적 `FOR UPDATE` 읽기와 DDL에는 잠금을 사용한다. "Lock 방식 DB"와 "MVCC 방식 DB"로 단순 양분하기보다 읽기와 쓰기별 실제 동작을 본다.

## 2. 왜 필요한가

동시 트랜잭션이 같은 행을 변경하거나 읽을 때 Lost Update와 불일치를 막으면서 처리량을 유지해야 한다. 모든 읽기와 쓰기에 하나의 전역 Lock을 사용하면 독립적인 플레이어 작업도 직렬화되어 처리량이 낮다. 반대로 아무 제어 없이 실행하면 두 구매가 같은 잔액과 재고를 보고 모두 성공할 수 있다.

읽기 요청이 긴 분석 쿼리 때문에 Writer를 막고 Writer가 일반 조회를 막으면 온라인 서비스 지연이 커진다. MVCC는 Commit된 이전 버전을 Reader에게 보여 주어 많은 읽기·쓰기 충돌을 줄인다. 그 대신 오래된 버전 저장, 가시성 검사와 정리 비용이 생긴다.

## 3. 핵심 동작 원리

```text
writer → row lock → new version 생성
reader → snapshot visible version 선택 (lock 없이 이전 버전 읽기 가능)
```

### Shared Lock과 Exclusive Lock

공유 잠금(Shared Lock, S)은 읽기용, 배타 잠금(Exclusive Lock, X)은 변경용으로 설명한다.

| 보유 \ 요청 | S | X |
|---|---:|---:|
| S | 허용 | 대기 |
| X | 대기 | 대기 |

여러 S Lock은 서로 호환될 수 있지만 X Lock은 같은 자원의 다른 S·X와 충돌하는 것이 일반적이다. Update Lock, Intent Lock, Schema Lock 등 실제 모드는 제품마다 더 다양하다. MVCC의 일반 SELECT는 S Lock을 오래 잡지 않고 버전을 읽을 수 있어 표와 다른 동시성을 보일 수 있다.

```text
T1: X Lock(Row 101) ─ Update ───────── Commit → Unlock
T2: X Lock(Row 101) 요청 ─ Waiting ───────────── 획득
T3: Snapshot Read → 이전 Commit Version 읽기 가능(MVCC 구현에 따라)
```

### Lock Granularity

잠금 단위가 작으면 서로 다른 행 작업을 동시에 처리하기 좋지만 관리 비용이 늘어난다. 단위가 크면 관리가 단순하지만 관련 없는 행까지 막는다.

- Row·Key Lock: 특정 행이나 인덱스 Key를 보호한다.
- Page Lock: 같은 Page의 여러 행을 함께 보호한다.
- Table Lock: 테이블 전체를 보호한다.
- Key-range·Gap Lock: 조건 범위에 새 Key가 들어오는 것을 제어한다.

실행 계획이 많은 인덱스 범위를 읽거나 FK·보조 인덱스를 갱신하면 여러 Key와 페이지에 영향을 줄 수 있다.

### Intent Lock

하위 행에 Lock이 있다는 사실을 상위 테이블 수준에 표시한다. Intent Exclusive는 테이블 내부의 어떤 행에 X Lock을 가지거나 얻으려는 의도를 나타낸다. 테이블 전체 X Lock 요청이 모든 행 Lock을 일일이 검사하지 않고 충돌 여부를 판단하도록 돕는다. Intent Lock 자체가 테이블의 모든 행을 배타적으로 막는다는 뜻은 아니다.

### Lock Escalation

많은 행 Lock 관리 비용을 줄이기 위해 DBMS가 Page나 Table 수준의 큰 Lock으로 승격할 수 있다. 승격되면 잠금 개수는 줄지만 다른 트랜잭션과의 충돌 범위가 갑자기 커진다. 모든 DBMS가 같은 정책으로 자동 승격하는 것은 아니다.

### Deadlock

```text
T1: X Lock Player 1 → Player 2 대기
T2: X Lock Player 2 → Player 1 대기
```

DBMS는 Wait-for Graph의 순환을 탐지하고 한 트랜잭션을 희생자로 Rollback할 수 있다. Lock Timeout만으로 모든 Deadlock을 처리하는 것은 아니다. Deadlock은 대기 순환이지만 단순 Lock Wait은 아직 Deadlock이 아닌 대기다.

자원 접근 순서를 통일하고, 필요한 인덱스를 두며, 사용자 입력과 외부 I/O를 Lock 보유 중 기다리지 않는다.

### MVCC Row Version

MVCC는 행 변경 시 기존 버전을 즉시 없애지 않고 트랜잭션 식별·시간 정보와 함께 보존한다.

```text
Row player_id=1

Version V1: balance=100, created by Tx 10, ended by Tx 20
Version V2: balance=80,  created by Tx 20, current

Old Snapshot → V1 visible
New Snapshot → V2 visible after Tx 20 Commit
```

Reader는 자신의 Snapshot보다 미래에 Commit된 버전이나 미커밋 버전을 제외하고 보이는 버전을 선택한다.

### Snapshot 생성 시점

Read Committed MVCC에서는 각 SQL 문이 새 Snapshot을 얻어 같은 트랜잭션의 다음 문장에서 더 최신 Commit을 볼 수 있다. Repeatable Read·Snapshot 격리에서는 트랜잭션의 여러 일반 읽기가 같은 Snapshot을 공유할 수 있다. Snapshot Read는 과거의 일관된 보기를 제공하지만 "지금 재고를 차감해도 되는가" 같은 현재 상태 변경에는 그대로 사용할 수 없다. 조건부 UPDATE나 Locking Read가 필요하다.

### MVCC도 남는 쓰기 충돌

MVCC로 일반 Reader와 Writer가 덜 막혀도 두 Writer가 같은 행을 동시에 변경하면 충돌한다. 한 Writer가 Row Lock을 기다리거나, Commit 시 Version이 달라져 한쪽이 실패할 수 있다. 서로 다른 행을 쓰면서 여러 행 불변식을 깨는 Write Skew도 가능하다.

### Version 정리

더 이상 어떤 활성 Snapshot도 볼 수 없는 이전 버전은 정리할 수 있다. 긴 트랜잭션이 오래된 Snapshot을 유지하면 그 이후 생성된 버전을 제거하지 못해 테이블·Undo가 커지고 조회가 긴 Version Chain을 따라갈 수 있다.

```text
Old Transaction Snapshot ─────────────────────────── active
Writes: V2, V3, V4, V5 생성
Cleanup: Old Snapshot 때문에 V1~V4 일부 보존 필요
```

"읽기 전용 트랜잭션은 Lock을 안 잡으니 오래 열어도 안전하다"는 말이 틀릴 수 있는 이유다.

## 4. 쉬운 예시

아이템 수량이 1일 때 두 서버가 일반 SELECT로 각각 1을 읽고 0을 쓰면 Lost Update가 생길 수 있다.

```sql
-- BAD: SELECT 후 UPDATE - 두 서버가 둘 다 quantity=1을 읽고 INSERT 가능
SELECT quantity FROM item_stock WHERE item_id = 9001;
-- ... 둘 다 1 > 0 판단 ...
UPDATE item_stock SET quantity = quantity - 1 WHERE item_id = 9001;

-- GOOD: 조건부 UPDATE - 한 서버만 영향 행 1개
UPDATE item_stock
SET quantity = quantity - 1
WHERE item_id = 9001
  AND quantity >= 1;
-- affected_rows == 0이면 재고 없음 처리
```

```java
// Java: 조건부 UPDATE로 재고 차감 + 실패 처리
public boolean deductStock(Connection conn, long itemId) throws SQLException {
    PreparedStatement deduct = conn.prepareStatement(
        "UPDATE item_stock SET quantity = quantity - 1 " +
        "WHERE item_id = ? AND quantity >= 1");
    deduct.setLong(1, itemId);
    int affected = deduct.executeUpdate();
    return affected > 0; // false면 재고 없음
}
```

```sql
-- Lock 장애 진단: 블로킹 세션 확인 (MySQL 예시)
SELECT
    waiting.trx_id AS waiting_trx,
    waiting.trx_query AS waiting_query,
    blocking.trx_id AS blocking_trx,
    blocking.trx_query AS blocking_query,
    TIMESTAMPDIFF(SECOND, waiting.trx_started, NOW()) AS waiting_seconds
FROM information_schema.innodb_trx AS waiting
JOIN information_schema.innodb_trx AS blocking
    ON waiting.trx_id != blocking.trx_id
WHERE waiting.trx_state = 'LOCK WAIT';

-- 오래된 트랜잭션 (Version 정리를 막는 원인)
SELECT trx_id, trx_started, trx_query
FROM information_schema.innodb_trx
ORDER BY trx_started ASC
LIMIT 5;
```

## 5. 비슷한 개념과 비교

| 구분 | Lock 기반 현재 읽기 | MVCC Snapshot 읽기 |
|---|---|---|
| Reader 결과 | 현재 Row와 Lock 상태에 의존 | Snapshot에 보이는 Version |
| Reader-Writer 관계 | 서로 대기 가능 | 일반 읽기는 충돌 감소 |
| 쓰기 충돌 | Lock으로 직렬화 | 여전히 Writer 간 충돌 있음 |
| 비용 | Lock 관리·대기·Deadlock | Version 저장·가시성 검사·정리 |
| 적합 | 최신 상태 기반 변경 | 일관된 조회·읽기 동시성 |

| 방식 | 강점 | 주요 비용·한계 |
|---|---|---|
| Row Lock (FOR UPDATE) | 최신 상태 기반 원자 변경 | Lock 대기, Deadlock |
| 조건부 UPDATE | SELECT 없이 한 문장으로 경쟁 해결 | 여러 자원 원자화에는 Transaction 필요 |
| MVCC 일반 읽기 | Reader-Writer 충돌 감소 | Write Skew, Version 정리 비용 |
| Range Lock | 범위 Phantom 방지 | 삽입 차단 범위 확대 |

낙관적 Lock의 Version 열과 MVCC는 다르다. MVCC는 DB 내부가 여러 행 버전을 관리하는 방식이다. 애플리케이션 낙관적 Lock은 `WHERE id=? AND version=?`으로 읽은 이후 변경 여부를 감지하는 패턴이다. 함께 사용할 수 있다.

## 6. 장점과 단점

**DB Lock의 장점**

- 충돌 작업 순서를 명시적으로 제어하고 최신 상태 기반 변경을 직관적으로 표현한다.
- Deadlock 탐지로 순환 대기를 자동으로 해소할 수 있다.

**DB Lock의 단점**

- Lock 대기·Deadlock과 Lock 범위 확대로 꼬리 지연이 생긴다.
- 긴 트랜잭션이 Lock을 오래 보유하면 다른 쓰기를 막는다.

**MVCC의 장점**

- Reader와 Writer 동시성을 높이고 일관된 Snapshot을 제공한다.
- 긴 분석 쿼리가 짧은 CRUD Writer를 막지 않을 수 있다.

**MVCC의 단점**

- Version 저장 공간과 정리 비용이 생긴다.
- 긴 읽기 트랜잭션이 Snapshot을 오래 유지하면 Version 정리가 지연된다.
- Writer 간 충돌(Write-Write, Write Skew)은 MVCC로 제거되지 않는다.

## 7. 게임 서버·백엔드 실무 예시

인벤토리 변경은 조건부 UPDATE와 Lock으로 보호하고 긴 트랜잭션이 오래된 Version 정리를 막지 않게 한다. Deadlock은 짧은 재시도와 일관된 접근 순서로 대응한다.

핫 플레이어·길드 한 행의 Counter를 모든 요청이 갱신하면 Row Lock 대기가 집중된다. 샤딩 Counter, 이벤트 집계 또는 단일 소유 Queue를 고려하되 정확한 실시간 합계가 필요한지 먼저 분류한다.

게임 운영자가 대형 통계를 Repeatable Read 트랜잭션으로 수십 분 조회하면 온라인 Writer를 직접 막지 않더라도 Version 정리를 지연시킬 수 있다. 분석 Replica나 별도 Warehouse를 사용하거나 조회를 작은 범위로 나눈다.

Lock 장애 진단 순서:
1. Blocked Session과 Blocking Session을 연결한다.
2. 각 Transaction 시작 시각, 마지막 SQL과 현재 Wait Event를 본다.
3. 보유·요청 Lock의 Table, Index와 Key 범위를 확인한다.
4. 실행 계획이 불필요하게 많은 Row·Range를 읽는지 본다.
5. 외부 I/O·사용자 대기와 Connection Pool 반환 누락을 확인한다.
6. Deadlock Graph에서 자원 획득 순서를 고정할 수 있는지 본다.

Blocking 쿼리를 무조건 Kill하면 일시 복구는 되지만 큰 Rollback이 추가 부하를 만들 수 있다.

## 8. 자주 하는 오해

- **"MVCC면 쓰기 충돌이 없다"**: MVCC는 일반 읽기와 쓰기의 충돌을 줄이지만 두 Writer가 같은 행을 변경하면 충돌이 남는다. Write Skew도 막지 않는다.
- **"MVCC의 일반 SELECT가 항상 최신 Commit 값을 본다"**: MVCC 일반 SELECT는 트랜잭션 시작·문장 시작 Snapshot을 보기 때문에 다른 트랜잭션이 Commit했어도 Snapshot 이후 변경은 보이지 않는다.
- **"Reader가 Writer를 막지 않으면 긴 읽기 Transaction 비용도 없다"**: 긴 읽기 트랜잭션은 오래된 Snapshot을 유지해 이후 생성된 Row Version 정리를 막는다. Dead Tuple·Undo와 저장 공간이 늘고 Version Chain 탐색이 느려질 수 있다.
- **"Row 하나 UPDATE는 언제나 Row Lock 하나만 잡는다"**: 실행 계획이 많은 인덱스 범위를 읽거나 FK·보조 인덱스를 갱신하면 여러 Key와 페이지에 Lock이 걸릴 수 있다.
- **"Intent Lock이 Table 전체를 배타적으로 잠근다"**: Intent Lock은 하위 행에 Lock이 있다는 의도 표시다. 테이블 전체를 배타적으로 막는 것이 아니라 Table Lock 요청과의 충돌 검사를 효율화한다.
- **"Deadlock과 단순 Lock Wait은 같다"**: Lock Wait는 아직 Deadlock이 아닌 대기다. Deadlock은 두 트랜잭션이 서로를 기다리는 순환 대기이며 DBMS가 한쪽을 Rollback해 해소한다.
- **"Lock 타임아웃이면 항상 Deadlock이 생긴 것이다"**: 타임아웃은 지정 시간 내 Lock 획득 실패다. Deadlock 없이 느린 단일 Lock에도 발생한다. 두 상황은 다른 원인과 해결책이 필요하다.

## 9. 면접 질문

### Q1. Shared Lock과 Exclusive Lock의 호환 규칙은 무엇인가요?

S Lock은 여러 Reader가 함께 보유할 수 있고 X Lock은 변경을 위해 다른 S·X Lock과 충돌한다. MVCC 일반 읽기는 S Lock을 오래 유지하지 않고 Snapshot Version을 읽을 수 있어 실제 동작은 DBMS별로 확인한다.

### Q2. MVCC는 어떻게 Reader와 Writer 충돌을 줄이나요?

Writer가 새 행 버전을 만들고 Reader는 자신의 Snapshot에 보이는 이전 Commit 버전을 읽게 한다. Reader가 미완료 Writer를 기다리지 않을 수 있다. 그러나 같은 행 Writer 충돌과 여러 행 Write Skew는 남는다.

### Q3. MVCC도 쓰기 충돌이 남는 이유는 무엇인가요?

MVCC는 읽기 동시성을 높이지만 두 Writer가 같은 행을 동시에 변경하면 한쪽이 Lock을 대기하거나 Commit 시 Version 충돌로 실패한다. 또한 서로 다른 행을 쓰면서 함께 지켜야 하는 불변식을 깨는 Write Skew는 MVCC만으로 감지하지 않는다.

### Q4. 긴 읽기 트랜잭션이 왜 문제가 되나요?

오래된 Snapshot을 유지해 이후 생성된 Row Version의 정리를 막을 수 있다. Dead Tuple·Undo와 저장 공간이 늘고 Version Chain 탐색이 느려질 수 있다. Lock은 잡지 않더라도 DB의 MVCC 운영에 실질적 비용을 만든다.

### Q5. Deadlock 발생 시 어떻게 대응하나요?

DBMS가 희생자를 Rollback하므로 애플리케이션이 Deadlock 오류를 예상 가능한 결과로 보고 멱등 설계된 전체 트랜잭션을 제한 재시도한다. 근본 원인은 자원 획득 순서를 통일하고, Lock 보유 중 외부 대기를 제거하며, 적절한 인덱스를 두어 Lock 범위를 줄이는 것이다.

### Q6. Lock 장애 진단 순서를 설명해 주세요.

Blocked Session과 Blocking Session을 연결한 뒤 각 트랜잭션 시작 시각, 마지막 SQL과 현재 Wait Event를 확인한다. 보유·요청 Lock의 Table, Index와 Key 범위를 보고 실행 계획이 불필요하게 넓은 범위를 읽는지 확인한다. 외부 I/O나 사용자 대기가 Lock 보유 중에 있는지, Connection Pool 반환 누락은 없는지 확인한다.

## 10. 예상 꼬리질문

- Lock Escalation은 왜 발생하고 어떻게 막나요?
- Range Lock은 어떤 문제를 막나요?
- Key-range Lock과 Gap Lock은 어떻게 다른가요?
- Hot Counter Row의 Lock 경합을 어떻게 줄이나요?
- MVCC Version 정리가 지연되면 어떤 증상이 나타나나요?
- Intent Lock과 일반 Table Lock의 관계는 무엇인가요?
- Deadlock Graph에서 무엇을 읽어야 하나요?

## 11. 30초 모범답변

> Lock은 충돌 연산을 직렬화하고 MVCC는 Snapshot에 맞는 버전을 읽혀 읽기·쓰기 충돌을 줄입니다. MVCC도 Writer 간 충돌과 Version 관리 비용은 남습니다. 인벤토리 변경은 조건부 UPDATE로 보호하고 긴 읽기 트랜잭션은 Version 정리 지연을 유발하므로 짧게 유지합니다.

## 12. 1~2분 확장답변

> Lock은 충돌 연산을 직렬화하고 MVCC는 Snapshot에 맞는 버전을 읽혀 읽기·쓰기 충돌을 줄입니다. MVCC도 쓰기 충돌과 Version 관리 비용은 남습니다. MVCC 일반 SELECT는 Snapshot을 보기 때문에 최신 상태 기반 변경에는 조건부 UPDATE나 `FOR UPDATE`가 필요합니다. 긴 읽기 트랜잭션은 Lock은 잡지 않아도 오래된 Snapshot이 Version 정리를 지연시켜 저장 공간과 Version Chain 탐색 비용을 늘립니다. Deadlock은 획득 순서를 통일하고 Lock 보유 중 외부 대기를 없애며 인덱스로 Lock 범위를 줄여 예방합니다.

## 13. 핵심 요약

- DB Lock은 충돌하는 접근을 대기시켜 일관성을 지키고 MVCC는 여러 버전으로 읽기와 쓰기의 충돌을 줄이는 방식이다.
- MVCC는 일반 읽기와 쓰기 충돌을 줄이지만 Writer 간 충돌(Write-Write, Write Skew)은 제거하지 않는다.
- MVCC 일반 SELECT는 Snapshot을 보기 때문에 최신 상태 기반 변경에는 조건부 UPDATE나 Locking Read가 필요하다.
- 긴 읽기 트랜잭션도 오래된 Snapshot이 Version 정리를 지연시켜 저장 공간과 조회 성능에 영향을 준다.
- Intent Lock은 하위 행에 Lock이 있다는 의도 표시이며 테이블 전체를 배타적으로 막는 것이 아니다.
- Deadlock은 Wait-for Graph 순환이고 단순 Lock Wait과 다르다. DBMS가 희생자를 Rollback하며 애플리케이션은 멱등 재시도가 필요하다.
- Row 하나 UPDATE도 실행 계획에 따라 여러 Key와 페이지에 Lock이 걸릴 수 있다.
- Lock 장애 진단은 Blocking Session, 마지막 SQL, Lock 범위, 실행 계획, 외부 대기 순서로 확인한다.

## 한 줄 정리

> Lock은 충돌 연산을 직렬화하고 MVCC는 Snapshot에 맞는 버전을 읽혀 읽기·쓰기 충돌을 줄입니다. MVCC도 쓰기 충돌과 버전 관리 비용은 남습니다.
