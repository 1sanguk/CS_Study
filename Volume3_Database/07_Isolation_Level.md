---
difficulty: 3
reading_time: 25분
interview_frequency: 5
importance: 5
---

# 07. Isolation Level


## 학습 목표

- Dirty Read, Non-repeatable Read, Phantom, Lost Update, Write Skew 각 이상 현상이 어떤 조건에서 발생하는지 설명할 수 있다.
- SQL 표준 격리 수준 이름과 실제 DBMS 구현(MVCC, Locking)의 차이를 설명할 수 있다.
- Snapshot Isolation이 Write Skew를 막지 못하는 이유와 Serializable과의 차이를 설명할 수 있다.
- 게임 길드 가입 인원 한도와 동시 재화 차감에서 격리 수준과 조건부 UPDATE를 어떻게 배치하는지 설계할 수 있다.

## 1. 개요

격리 수준은 동시 트랜잭션이 서로의 중간 결과를 어느 정도 관찰할지 정하는 기준이다.

격리 수준(Isolation Level)은 동시에 실행되는 트랜잭션의 결과를 어떤 직렬 실행처럼 보이게 할지, 어떤 이상 현상을 허용할지 정한다. SQL 표준에서 흔히 Read Uncommitted, Read Committed, Repeatable Read, Serializable 단계로 설명하지만 같은 이름의 실제 Lock·MVCC(Multi-Version Concurrency Control) 동작은 DBMS마다 다를 수 있다.

격리는 데이터가 최신인지 여부만 다루는 설정이 아니다. 읽기 Snapshot의 범위, 충돌 쓰기의 대기·실패, 조건 범위에 새 행이 들어오는지와 불변식 검증에 영향을 준다. 트랜잭션별 업무 규칙을 먼저 정의하고 제품 문서와 동시성 테스트로 보장을 확인한다.

## 2. 왜 필요한가

모든 트랜잭션을 실제로 하나씩 순서대로 실행하면 동시성 문제는 단순해지지만 여러 사용자가 같은 DB를 이용하는 처리량이 크게 낮아진다. 서로 다른 플레이어의 독립 작업은 동시에 실행하고 충돌하는 작업만 필요한 수준으로 조정하는 것이 목표다.

격리가 너무 약하면 미완료 값을 읽거나 같은 트랜잭션 안에서 결과가 바뀌고, 두 작업이 각각 유효하다고 판단했지만 함께 Commit된 결과가 불변식을 깰 수 있다. 격리를 강하게 하면 Lock 대기, Deadlock 또는 직렬화 실패·재시도가 늘 수 있다. "가장 높은 수준이 무조건 정답"이 아니라 정확성 요구와 충돌 빈도를 함께 본다.

## 3. 핵심 동작 원리

```text
Read Uncommitted → Read Committed → Repeatable Read → Serializable
(이상 현상 허용 多)                                    (이상 현상 허용 少)
(Lock·재시도 비용 少)                                  (Lock·재시도 비용 多)
```

### 동시 실행 이상 현상

#### Dirty Read

다른 트랜잭션이 아직 Commit하지 않은 값을 읽는 현상이다.

```text
T1: UPDATE wallet SET balance=0   -- 미커밋
T2: SELECT balance → 0
T1: ROLLBACK                      -- 실제 잔액은 원래 값
```

T2는 결국 존재하지 않게 된 상태를 기반으로 로직을 수행한다. Read Committed 이상에서는 일반적으로 방지한다.

#### Non-repeatable Read

한 트랜잭션이 같은 행을 두 번 읽는 사이 다른 트랜잭션이 Commit해 값이 달라지는 현상이다.

```text
T1: SELECT balance → 100
T2: UPDATE balance=50; COMMIT
T1: SELECT balance → 50
```

Read Committed에서 각 문장이 새 Snapshot을 보는 구현이라면 발생할 수 있다. Repeatable Read는 같은 트랜잭션의 일반 읽기가 같은 버전을 보도록 할 수 있지만 제품별 Locking Read와 쓰기 의미는 별도로 확인한다.

#### Phantom Read

같은 조건 범위를 다시 조회했을 때 다른 트랜잭션의 INSERT·DELETE로 결과 행 집합이 달라지는 현상이다.

```text
T1: SELECT count(*) FROM item WHERE player_id=1 → 9
T2: INSERT item(player_id=1, ...); COMMIT
T1: 같은 SELECT → 10
```

단일 행 값 변화가 아니라 조건을 만족하는 행의 출현·소멸이라는 점이 Non-repeatable Read와 다르다. 범위 Lock 또는 Serializable 검증, Snapshot 방식에 따라 관찰 결과가 달라진다.

#### Lost Update

두 트랜잭션이 같은 값을 읽어 계산한 뒤 쓰면서 한쪽 갱신이 덮이는 문제다.

```text
balance = 100
T1: read 100, calculate 80
T2: read 100, calculate 70
T1: write 80
T2: write 70  -- T1의 차감 효과가 사라짐
```

`SET balance = balance - :amount WHERE balance >= :amount`처럼 DB에서 원자적으로 조건부 갱신하거나 `SELECT ... FOR UPDATE`, Version 기반 낙관적 Lock을 사용한다.

#### Write Skew

두 트랜잭션이 서로 다른 행을 수정하지만 함께 지켜야 하는 조건을 각각 오래된 Snapshot에서 검사해 불변식을 깨는 문제다.

```text
Rule: 당직자 A와 B 중 최소 한 명은 on_call=true

T1: A,B 모두 조회 → B가 당직이므로 A를 false로 변경
T2: A,B 모두 조회 → A가 당직이므로 B를 false로 변경
둘 다 Commit → 당직자 0명
```

서로 같은 행에 쓰지 않아 단순 Write-Write 충돌로 잡히지 않을 수 있다. Snapshot Isolation이 Dirty·Non-repeatable Read를 막아도 Write Skew를 허용할 수 있다. 불변식을 한 행·제약으로 표현하거나 관련 범위를 잠그고 Serializable을 사용한다.

### 격리 수준별 동작

#### Read Uncommitted

미커밋 변경을 읽을 수 있는 가장 약한 수준이다. 일부 MVCC DBMS는 이 이름을 요청해도 실제로 Read Committed처럼 동작할 수 있다. 정확성이 필요한 게임 재화와 주문에는 일반적으로 적합하지 않다.

#### Read Committed

Commit된 데이터만 읽는다. 각 SQL 문 시작 시점의 Snapshot을 보는 방식이나 읽는 동안 Lock을 잡는 방식으로 구현될 수 있다. 같은 트랜잭션에서도 문장 사이 다른 Commit을 볼 수 있어 Non-repeatable Read와 Phantom이 가능하다.

```text
Transaction T1
Statement 1 Snapshot ──> committed state at S1
Statement 2 Snapshot ──> committed state at S2
```

짧은 CRUD 트랜잭션에서 동시성이 좋고 흔한 기본값이지만 모든 DB의 기본은 아니다. "Commit된 값만 읽으니 Lost Update도 없다"는 결론은 틀리다.

#### Repeatable Read

같은 트랜잭션의 반복 읽기에서 같은 행 버전을 보도록 한다. MVCC 구현에서는 첫 읽기 시점 또는 트랜잭션 Snapshot을 유지할 수 있다. 실제 제품은 더 강한 보장을 할 수 있다. Snapshot으로 일반 조회의 Phantom이 보이지 않거나 범위 Lock으로 삽입을 막는 경우가 있다. 반대로 Write Skew는 남을 수 있다.

#### Serializable

동시 실행 결과가 어떤 순서로 하나씩 실행한 결과와 동등하도록 하는 가장 강한 격리 수준이다. 범위 Lock으로 충돌 작업을 대기시키거나, 읽기·쓰기 의존성을 추적해 위험한 트랜잭션 하나를 직렬화 실패로 중단하는 방식으로 구현될 수 있다.

```text
T1 ── read/write ──┐
                   ├─ Serializable 검사 → 가능한 직렬 순서 유지
T2 ── read/write ──┘                       또는 하나 Abort
```

Serializable은 충돌하지 않는 트랜잭션은 병렬 실행한다. 모든 요청이 물리적으로 하나씩 실행되지는 않는다. 애플리케이션은 Deadlock이나 Serialization Failure를 전체 트랜잭션 단위로 재시도할 준비가 필요하다.

#### Snapshot Isolation

트랜잭션이 시작 시점의 일관된 Snapshot을 읽고 같은 행에 대한 Write-Write 충돌에서 한쪽을 실패시키는 모델이다. 읽기가 쓰기를 막지 않아 동시성이 좋다. 하지만 서로 다른 행을 쓰는 Write Skew가 가능할 수 있어 Serializable과 같지 않다.

### Locking Read와 일반 Snapshot Read

MVCC DB에서도 `SELECT ... FOR UPDATE`는 현재 행을 잠그고 최신 상태를 읽는 별도 의미를 가진다. 일반 SELECT는 오래된 Snapshot을 보면서도 차단되지 않을 수 있다.

```sql
BEGIN;
SELECT balance
FROM player_wallet
WHERE player_id = 101
FOR UPDATE;

UPDATE player_wallet SET balance = balance - 100
WHERE player_id = 101;
COMMIT;
```

Locking Read는 경쟁 요청을 직렬화하지만 Lock 대기와 Deadlock을 만든다. 가능하면 조건부 단일 UPDATE로 왕복과 Lock 시간을 줄이고, 복합 작업에 명시 Lock을 사용한다.

## 4. 쉬운 예시

길드 최대 인원 100명 제한을 동시 요청에서 지키는 예시다. `SELECT COUNT(*)` 후 INSERT로 구현하면 둘이 동시에 99를 읽고 들어와 101명이 될 수 있다.

```sql
-- BAD: READ 후 WRITE 사이 경쟁 (격리 수준만으로 보호 안 됨)
SELECT COUNT(*) FROM guild_member WHERE guild_id = :guildId;  -- 둘 다 99 읽음
-- ... 99 < 100이라 판단 ...
INSERT INTO guild_member (guild_id, player_id) VALUES (:guildId, :playerId); -- 둘 다 삽입

-- GOOD: guild 행을 Lock해서 검사 + 조건부 갱신
BEGIN;
SELECT member_count FROM guild WHERE guild_id = :guildId FOR UPDATE;
UPDATE guild
SET member_count = member_count + 1
WHERE guild_id = :guildId AND member_count < 100;
-- 영향 행 0이면 ROLLBACK (인원 초과)
INSERT INTO guild_member (guild_id, player_id) VALUES (:guildId, :playerId);
COMMIT;
```

```java
// Java: 격리 수준 설정과 직렬화 실패 재시도
public boolean joinGuild(Connection conn, long guildId, long playerId)
        throws SQLException {
    conn.setAutoCommit(false);
    conn.setTransactionIsolation(Connection.TRANSACTION_REPEATABLE_READ);
    try {
        PreparedStatement lock = conn.prepareStatement(
            "SELECT member_count FROM guild WHERE guild_id = ? FOR UPDATE");
        lock.setLong(1, guildId);
        ResultSet rs = lock.executeQuery();
        if (!rs.next() || rs.getInt("member_count") >= 100) {
            conn.rollback();
            return false;
        }

        PreparedStatement inc = conn.prepareStatement(
            "UPDATE guild SET member_count = member_count + 1 " +
            "WHERE guild_id = ? AND member_count < 100");
        inc.setLong(1, guildId);
        if (inc.executeUpdate() == 0) {
            conn.rollback();
            return false;
        }

        PreparedStatement insert = conn.prepareStatement(
            "INSERT INTO guild_member (guild_id, player_id) VALUES (?, ?)");
        insert.setLong(1, guildId);
        insert.setLong(2, playerId);
        insert.executeUpdate();

        conn.commit();
        return true;
    } catch (SQLException e) {
        conn.rollback();
        throw e; // 상위에서 Deadlock/직렬화 실패 감지 후 제한 재시도
    }
}
```

```java
// 직렬화 실패 재시도 패턴 (지수 Backoff + 최대 횟수)
public boolean joinGuildWithRetry(long guildId, long playerId) {
    int maxRetries = 3;
    for (int attempt = 0; attempt < maxRetries; attempt++) {
        try (Connection conn = dataSource.getConnection()) {
            return joinGuild(conn, guildId, playerId);
        } catch (SQLException e) {
            if (!isRetryable(e) || attempt == maxRetries - 1) throw new RuntimeException(e);
            long delay = (long) Math.pow(2, attempt) * 50; // 50ms, 100ms, 200ms
            Thread.sleep(delay + ThreadLocalRandom.current().nextInt(50)); // Jitter
        }
    }
    return false;
}
```

## 5. 비슷한 개념과 비교

| 이상 현상 | 발생 조건 | 최소 방지 수준 (표준) |
|---|---|---|
| Dirty Read | 미커밋 값 읽기 | Read Committed |
| Non-repeatable Read | 같은 행 재조회 시 값 변화 | Repeatable Read |
| Phantom Read | 같은 조건 범위의 행 집합 변화 | Serializable (표준) |
| Lost Update | 읽은 값 기반 쓰기 충돌 | 조건부 UPDATE 또는 Lock |
| Write Skew | 서로 다른 행 쓰기로 불변식 위반 | Serializable (또는 명시 Lock) |

| 도구 | 강점 | 한계 |
|---|---|---|
| Isolation Level | 트랜잭션 관찰·충돌 규칙 제어 | 제품별 구현, 재시도 비용 |
| Row Lock (FOR UPDATE) | 특정 Row 변경 직렬화 | 범위 불변식, Deadlock |
| UNIQUE/CHECK | 저장 시 명시 불변식 강제 | 복잡한 다중 Row 규칙 |
| 조건부 UPDATE | 경쟁 승자를 한 문장으로 결정 | 여러 자원 원자 작업엔 Transaction 필요 |
| Optimistic Version | 충돌 감지 후 재시도 | 높은 충돌 빈도에서 실패 증가 |

격리 수준과 복제 읽기 일관성도 구분한다. Primary의 Serializable 트랜잭션으로 Commit했어도 비동기 Replica에서 즉시 읽으면 복제 지연으로 이전 값을 볼 수 있다. 트랜잭션 격리는 일반적으로 한 DB 처리 경계의 동시 실행 문제다.

## 6. 장점과 단점

**격리 수준을 높이면**

- 정합성 보장이 강해지고 불변식 위반 위험이 줄어든다.
- 직렬 실행처럼 추론할 수 있어 비즈니스 로직이 단순해진다.
- Lock 보유 범위가 넓어지거나 직렬화 실패 재시도가 늘어난다.

**격리 수준을 낮추면**

- Lock 대기와 충돌 Abort가 줄어 처리량에 유리하다.
- 이상 현상(Dirty·Phantom·Write Skew)을 애플리케이션이 직접 다뤄야 한다.
- Non-repeatable Read나 Lost Update가 몰래 발생하면 데이터 손상 원인 추적이 어렵다.

**격리 수준 선택 시 주의 사항**

- SQL 표준 이름과 DBMS 구현이 다를 수 있다. 제품 문서와 동시성 테스트로 확인한다.
- 격리를 강하게 해도 외부 HTTP나 메시지 발행은 DB 트랜잭션으로 원자화되지 않는다.
- 직렬화 실패·Deadlock에 대한 멱등 재시도는 격리 수준과 무관하게 필요하다.

## 7. 게임 서버·백엔드 실무 예시

인벤토리 목록을 화면에 표시하는 읽기는 잠깐 서로 다른 Commit을 보더라도 요구에 따라 허용할 수 있다. 반면 장비 강화에서 재료 보유 확인과 차감·결과 지급은 같은 트랜잭션의 불변식이다.

길드 최대 인원 100명을 `SELECT COUNT(*)` 후 INSERT로 구현하면 동시 가입 둘이 모두 99를 보고 들어와 101명이 될 수 있다. 길드 행의 `member_count`를 조건부 갱신하고 Membership INSERT와 한 트랜잭션으로 묶거나, 길드 행을 `FOR UPDATE`로 Lock하고 검사한다.

직렬화 실패와 Deadlock은 예상 가능한 동시성 결과로 분류한다. 요청 ID가 있는 멱등 작업만 전체 트랜잭션을 처음부터 재시도하고 지수 Backoff·Jitter와 최대 횟수를 둔다. 재시도율이 급증하면 성공으로 숨기지 말고 Hot Key, 긴 트랜잭션과 인덱스 범위를 분석한다.

운영 지표에는 Lock Wait 시간, Deadlock·Serialization Abort 수, 재시도 횟수, 오래된 Snapshot과 Version 정리 지연을 포함한다.

## 8. 자주 하는 오해

- **"Repeatable Read면 모든 DB에서 Phantom과 Lost Update가 방지된다"**: Repeatable Read의 실제 보장은 DBMS마다 다르다. 일부는 Snapshot으로 Phantom이 보이지 않지만 Write Skew와 Lost Update는 별도로 확인해야 한다.
- **"Snapshot Isolation과 Serializable은 같다"**: Snapshot Isolation은 일관된 Snapshot으로 읽기와 Write-Write 충돌을 막지만 Write Skew를 허용할 수 있다. Serializable은 결과가 어떤 직렬 순서와 동등하도록 더 강하게 보장한다.
- **"Serializable은 모든 Transaction을 물리적으로 하나씩 실행한다"**: Serializable은 결과의 동등성을 보장하지 물리적 직렬 실행을 뜻하지 않는다. 충돌하지 않는 트랜잭션은 병렬 실행할 수 있다.
- **"Read Committed면 읽은 값을 기반으로 한 쓰기도 자동 안전하다"**: Read Committed는 미커밋 값 읽기만 막는다. 읽은 값으로 계산해 쓰는 사이 다른 트랜잭션이 Commit하면 Lost Update가 생길 수 있다.
- **"격리 수준을 높이면 재시도 로직이 필요 없다"**: Serializable에서도 Deadlock과 Serialization Failure가 생기고 애플리케이션이 전체 트랜잭션을 재시도해야 한다. 멱등 설계와 제한 재시도는 어느 격리 수준에서도 필요하다.
- **"MVCC를 쓰면 Phantom Read가 항상 방지된다"**: MVCC로 일반 SELECT에서는 Phantom이 보이지 않을 수 있지만 `FOR UPDATE`처럼 현재 상태를 잠그는 읽기에서는 다른 결과를 볼 수 있다. DB 구현을 확인한다.
- **"격리 수준만 높이면 모든 불변식이 안전하다"**: 격리 수준은 DB 내 동시 실행 이상을 제어한다. 외부 HTTP·메시지 발행과의 정합성은 Outbox 패턴이나 Saga로 별도 설계해야 한다.

## 9. 면접 질문

### Q1. 동시 실행 이상 현상 5가지를 설명해 주세요.

Dirty Read는 미커밋 값을 읽는 것, Non-repeatable Read는 같은 행을 다시 읽었을 때 값이 바뀌는 것, Phantom은 같은 조건 조회의 행 집합이 INSERT·DELETE로 달라지는 것이다. Lost Update는 둘이 같은 값을 읽어 계산한 뒤 쓰면서 한쪽 갱신이 덮이는 것, Write Skew는 서로 다른 행을 써서 함께 지켜야 하는 불변식을 깨는 것이다.

### Q2. SQL 표준 격리 수준 4가지를 설명해 주세요.

Read Uncommitted는 미커밋 값을 허용한다. Read Committed는 Commit된 값만 읽고 각 문장마다 새 Snapshot을 본다. Repeatable Read는 트랜잭션 시작 Snapshot을 유지해 같은 행 재조회가 일관되다. Serializable은 결과가 어떤 직렬 순서와 동등하도록 가장 강하게 보장한다. 실제 DBMS 구현은 이름과 다를 수 있어 제품 문서를 확인해야 한다.

### Q3. Snapshot Isolation과 Serializable의 차이는 무엇인가요?

Snapshot Isolation은 일관된 과거 Snapshot으로 읽고 같은 행의 Write 충돌을 막을 수 있지만 서로 다른 행을 변경하는 Write Skew를 허용할 수 있다. Serializable은 결과가 어떤 직렬 순서와 동등하도록 Lock이나 의존성 검증으로 더 강하게 보장한다.

### Q4. Write Skew의 예를 들어 설명해 주세요.

당직 시스템에서 A와 B 중 한 명은 항상 on_call이어야 한다는 규칙이 있다. T1이 B가 당직임을 확인하고 A를 off로 바꾸는 동시에 T2가 A가 당직임을 확인하고 B를 off로 바꾼다. 둘 다 Commit하면 당직자가 0명이 된다. 서로 다른 행을 썼으므로 단순 Write-Write 충돌로 잡히지 않는다. 불변식을 한 행의 CHECK로 표현하거나 관련 범위를 Lock하거나 Serializable을 사용해야 한다.

### Q5. 게임 길드 인원 한도를 동시 요청에서 어떻게 지키나요?

`SELECT COUNT(*)` 후 INSERT 방식은 둘이 동시에 99를 읽고 들어와 101명이 될 수 있다. 길드 행에 `member_count`를 두고 `FOR UPDATE`로 잠근 뒤 `member_count < 100` 조건부 UPDATE와 INSERT를 한 트랜잭션으로 묶는다. UPDATE 영향 행이 0이면 Rollback한다.

### Q6. 격리 수준을 Serializable로 높이면 재시도 로직이 필요 없나요?

Serializable에서도 Deadlock과 Serialization Failure가 발생하고 애플리케이션이 전체 트랜잭션을 재시도해야 한다. 재시도가 멱등하지 않으면 중복 처리가 생긴다. 요청 ID로 멱등 설계를 하고 지수 Backoff·Jitter와 최대 횟수 제한으로 재시도한다.

## 10. 예상 꼬리질문

- 같은 DB 엔진에서 Repeatable Read와 Snapshot Isolation은 어떻게 다른가요?
- Deadlock 감지와 해소 방식을 설명해 주세요.
- 일반 SELECT와 `SELECT FOR UPDATE`는 어떻게 다른가요?
- 비동기 Replica에서 읽으면 격리 수준이 의미 없나요?
- 분산 시스템에서 Write Skew를 어떻게 막나요?
- Optimistic Lock과 Pessimistic Lock 중 어떤 상황에서 무엇을 선택하나요?
- Serialization Failure와 Deadlock을 코드에서 어떻게 구분하나요?

## 11. 30초 모범답변

> 격리 수준은 동시 트랜잭션의 관찰 범위를 조절해 정합성과 처리량을 교환합니다. 이름만이 아니라 사용하는 DB의 MVCC와 Lock 구현을 확인해야 하며, Snapshot Isolation은 Write Skew를 허용할 수 있어 Serializable과 다릅니다. 격리를 높여도 Deadlock과 직렬화 실패에 대한 멱등 재시도는 필요합니다.

## 12. 1~2분 확장답변

> 격리 수준은 Dirty Read, Non-repeatable Read, Phantom을 표준으로 설명하지만 Lost Update와 Write Skew는 이 세 가지로 충분히 표현되지 않습니다. Snapshot Isolation은 Write Skew를 허용할 수 있고 Serializable과 다릅니다. 실제 DBMS는 표준 이름보다 강하거나 다른 보장을 할 수 있으므로 제품 문서와 동시성 테스트로 확인합니다. 게임 길드 인원 한도처럼 범위 불변식은 격리 수준만으로 부족하고 `FOR UPDATE`와 조건부 UPDATE를 조합해야 합니다. Serializable에서도 직렬화 실패가 생기므로 멱등 설계와 제한 재시도는 어느 수준에서도 필요합니다.

## 13. 핵심 요약

- 격리 수준은 동시 트랜잭션이 서로의 중간 결과를 어느 정도 관찰할지 정하는 기준이다.
- Dirty Read, Non-repeatable Read, Phantom 외에도 Lost Update와 Write Skew가 있으며 격리 수준 이름만으로 방지 여부를 단정하지 않는다.
- Snapshot Isolation은 일관된 Snapshot을 읽고 Write-Write 충돌을 막지만 Write Skew를 허용할 수 있어 Serializable과 다르다.
- SQL 표준 격리 수준 이름과 실제 DBMS 구현이 다를 수 있으므로 제품 문서와 동시성 테스트로 확인한다.
- Serializable도 충돌하지 않는 트랜잭션은 병렬 실행한다. 물리적 직렬 실행이 아니라 결과의 동등성을 보장한다.
- 범위 불변식은 격리 수준 단독으로 부족하고 `FOR UPDATE`, 조건부 UPDATE, UNIQUE 등을 조합해야 한다.
- Serializable에서도 Deadlock과 Serialization Failure가 생기므로 멱등 설계와 제한 재시도가 필요하다.
- 복제 Lag으로 비동기 Replica에서 읽으면 Primary 격리 수준과 무관하게 이전 값을 볼 수 있다.

## 한 줄 정리

> 격리 수준은 동시 트랜잭션의 관찰 범위를 조절해 정합성과 처리량을 교환합니다. 이름만이 아니라 사용하는 DB의 MVCC와 Lock 구현을 확인해야 합니다.
