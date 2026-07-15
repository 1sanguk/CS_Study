---
difficulty: 3
reading_time: 25분
interview_frequency: 5
importance: 5
---

# 07. Isolation Level

> 게임 서버·백엔드 개발자를 위한 CS 면접 교재

## 학습 목표

- 한 줄 정의와 등장 이유를 설명할 수 있다.
- 핵심 동작과 비교 개념을 설명할 수 있다.
- 게임 백엔드의 정합성과 성능 설계에 적용할 수 있다.

## 1. 개요

격리 수준은 동시 트랜잭션이 서로의 중간 결과를 어느 정도 관찰할지 정하는 기준이다.

격리 수준(Isolation Level)은 동시에 실행되는 트랜잭션의 결과를 어떤 직렬 실행처럼 보이게 할지, 어떤 이상 현상을 허용할지 정한다. SQL 표준에서 흔히 Read Uncommitted, Read Committed, Repeatable Read, Serializable 단계로 설명하지만 같은 이름의 실제 Lock·MVCC 동작은 DBMS마다 다를 수 있다.

격리는 데이터가 최신인지 여부만 다루는 설정이 아니다. 읽기 Snapshot의 범위, 충돌 쓰기의 대기·실패, 조건 범위에 새 행이 들어오는지와 불변식 검증에 영향을 준다. 트랜잭션별 업무 규칙을 먼저 정의하고 제품 문서와 동시성 테스트로 보장을 확인한다.

## 2. 왜 필요한가
완전 직렬 실행은 안전하지만 동시성이 낮으므로 허용 가능한 이상과 처리량 사이에서 선택한다. 데이터베이스 선택은 편의가 아니라 불변식, 조회 패턴, 장애 복구 요구에서 출발한다.

모든 트랜잭션을 실제로 하나씩 순서대로 실행하면 동시성 문제는 단순해지지만 여러 사용자가 같은 DB를 이용하는 처리량이 크게 낮아진다. 서로 다른 플레이어의 독립 작업은 동시에 실행하고 충돌하는 작업만 필요한 수준으로 조정하는 것이 목표다.

격리가 너무 약하면 미완료 값을 읽거나 같은 트랜잭션 안에서 결과가 바뀌고, 두 작업이 각각 유효하다고 판단했지만 함께 Commit된 결과가 불변식을 깰 수 있다. 격리를 강하게 하면 Lock 대기, Deadlock 또는 직렬화 실패·재시도가 늘 수 있다. “가장 높은 수준이 무조건 정답”이 아니라 정확성 요구와 충돌 빈도를 함께 본다.

## 3. 핵심 동작 원리
```text
Read Uncommitted→Read Committed→Repeatable Read→Serializable
```
Dirty Read는 미커밋 읽기, Non-repeatable Read는 같은 행 재조회 변화, Phantom은 조건 결과 집합 변화다. 실제 보장과 Snapshot 격리는 DB 구현을 확인해야 한다.

Isolation Level에서는 논리 모델과 물리 실행을 구분한다. 같은 SQL도 통계, 데이터 분포, 인덱스와 동시 부하에 따라 실행 비용이 달라진다.

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

`SET balance = balance - :amount WHERE balance >= :amount`처럼 DB에서 원자적으로 조건부 갱신하거나 `SELECT ... FOR UPDATE`, Version 기반 낙관적 Lock을 사용한다. 어떤 격리 수준이 Lost Update를 자동 감지하는지는 DBMS 구현을 확인한다.

#### Write Skew

두 트랜잭션이 서로 다른 행을 수정하지만 함께 지켜야 하는 조건을 각각 오래된 Snapshot에서 검사해 불변식을 깨는 문제다.

```text
Rule: 당직자 A와 B 중 최소 한 명은 on_call=true

T1: A,B 모두 조회 → B가 당직이므로 A를 false로 변경
T2: A,B 모두 조회 → A가 당직이므로 B를 false로 변경
둘 다 Commit → 당직자 0명
```

서로 같은 행에 쓰지 않아 단순 Write-Write 충돌로 잡히지 않을 수 있다. Snapshot Isolation이 Dirty·Non-repeatable Read를 막아도 Write Skew를 허용할 수 있다는 대표 예다. 불변식을 한 행·제약으로 표현하거나 관련 범위를 잠그고 Serializable을 사용한다.

### Read Uncommitted

미커밋 변경을 읽을 수 있는 가장 약한 수준으로 설명된다. Dirty Read가 가능하고 그 결과 Non-repeatable·Phantom도 가능하다. 하지만 일부 MVCC DBMS는 이 이름을 요청해도 실제로 Read Committed처럼 동작할 수 있다.

정확성이 필요한 게임 재화와 주문에는 일반적으로 적합하지 않다. 분석 근사치라고 해도 Dirty Data가 어떤 오류를 만들지 명확히 해야 한다.

### Read Committed

Commit된 데이터만 읽는다. 일반적으로 각 SQL 문 시작 시점의 Snapshot을 보는 방식이나 읽는 동안 Lock을 잡는 방식으로 구현될 수 있다. 같은 트랜잭션에서도 문장 사이 다른 Commit을 볼 수 있어 Non-repeatable Read와 Phantom이 가능하다.

```text
Transaction T1
Statement 1 Snapshot ──> committed state at S1
Statement 2 Snapshot ──> committed state at S2
```

짧은 CRUD 트랜잭션에서 동시성이 좋고 흔한 기본값이지만 모든 DB의 기본은 아니다. “Commit된 값만 읽으니 Lost Update도 없다”는 결론은 틀리다.

### Repeatable Read

같은 트랜잭션의 반복 읽기에서 같은 행 버전을 보도록 한다. MVCC 구현에서는 첫 읽기 시점 또는 트랜잭션 Snapshot을 유지할 수 있다. SQL 표준의 일반 설명에서는 Dirty와 Non-repeatable Read를 막지만 Phantom 허용 가능성으로 구분한다.

실제 제품은 더 강한 보장을 할 수 있다. 예를 들어 Snapshot으로 일반 조회의 Phantom이 보이지 않거나, 범위 Lock을 사용하는 특정 읽기에서 삽입을 막을 수 있다. 반대로 Snapshot이 고정되어도 Write Skew 같은 이상은 남을 수 있다. 제품 이름만 보고 비즈니스 안전성을 단정하지 않는다.

### Serializable

동시 실행 결과가 어떤 순서로 하나씩 실행한 결과와 동등하도록 하는 가장 강한 격리 수준이다. 구현은 범위 Lock으로 충돌 작업을 대기시키거나, 읽기·쓰기 의존성을 추적해 위험한 트랜잭션 하나를 직렬화 실패로 중단하는 방식일 수 있다.

Serializable은 모든 요청이 물리적으로 하나씩 실행된다는 뜻이 아니다. 충돌하지 않는 트랜잭션은 병렬 실행할 수 있다. 대신 애플리케이션은 Deadlock이나 Serialization Failure를 전체 트랜잭션 단위로 재시도할 준비가 필요하다.

```text
T1 ── read/write ──┐
                   ├─ Serializable 검사 → 가능한 직렬 순서 유지
T2 ── read/write ──┘                         또는 하나 Abort
```

### Snapshot Isolation

트랜잭션이 시작 시점 성격의 일관된 Snapshot을 읽고, 같은 행에 대한 Write-Write 충돌에서 한쪽을 실패시키는 모델로 설명할 수 있다. 읽기가 쓰기를 막지 않고 쓰기가 일반 읽기를 덜 막아 동시성이 좋다.

하지만 서로 다른 행을 쓰는 Write Skew가 가능할 수 있어 Serializable과 같지 않다. 일부 DBMS의 Repeatable Read나 별도 Snapshot 격리 기능이 어떤 보장을 제공하는지 제품 문서를 확인한다.

### Locking Read와 일반 Snapshot Read

MVCC DB에서도 `SELECT ... FOR UPDATE` 성격의 읽기는 현재 행을 잠그고 이후 변경을 위해 최신 상태를 읽는 별도 의미를 가진다. 일반 SELECT는 오래된 Snapshot을 보면서도 차단되지 않을 수 있다.

```sql
BEGIN;
SELECT balance
FROM player_wallet
WHERE player_id = 101
FOR UPDATE;

-- 검증 후 변경
UPDATE player_wallet SET balance = balance - 100
WHERE player_id = 101;
COMMIT;
```

Locking Read는 경쟁 요청을 직렬화하지만 Lock 대기와 Deadlock을 만든다. 가능하면 조건부 단일 UPDATE로 왕복과 Lock 시간을 줄이고, 복합 작업에 명시 Lock을 사용한다.

### 격리 수준 비교

아래 표는 SQL 표준을 단순화한 일반 설명이며 실제 제품 보장은 다를 수 있다.

| 수준 | Dirty Read | Non-repeatable Read | Phantom | 주요 비용·주의점 |
|---|---|---|---|---|
| Read Uncommitted | 가능 | 가능 | 가능 | 잘못된 중간 상태 관찰 |
| Read Committed | 방지 | 가능 | 가능 | 문장마다 결과 변화 가능 |
| Repeatable Read | 방지 | 방지 | 표준상 가능 | 제품별 Snapshot·Range Lock 차이 |
| Serializable | 방지 | 방지 | 방지 | 대기·Deadlock·Serialization Retry |

Lost Update와 Write Skew는 이 3개 현상 표만으로 충분히 설명되지 않는다. 사용하는 DB의 충돌 규칙과 애플리케이션 변경 패턴을 별도로 시험한다.

### 격리 수준 선택 절차

1. 지킬 불변식을 문장으로 적는다.
2. 동시에 실행될 수 있는 읽기·쓰기를 나열한다.
3. Dirty·반복 읽기·Phantom뿐 아니라 Lost Update·Write Skew를 시험한다.
4. 조건부 UPDATE, UNIQUE·CHECK와 행 Lock으로 더 직접 표현할 수 있는지 본다.
5. 필요한 최소 격리 수준과 예상 충돌 빈도를 선택한다.
6. Deadlock·Serialization Failure를 멱등하게 제한 재시도한다.
7. 실제 DB 버전에서 동시성 테스트와 실행 계획을 검증한다.

## 4. 쉬운 예시
Isolation Level에서는 플레이어가 아이템을 구매하면 재화 확인, 차감, 아이템 생성이 연결된다. 일부만 반영되거나 동시에 두 번 처리되지 않도록 제약 조건과 트랜잭션 경계를 설계한다.

영화관 좌석 하나를 두 사용자가 동시에 예약한다고 하자. 둘 다 “빈 좌석”을 읽고 별도 UPDATE하면 마지막 쓰기가 앞 결과를 덮거나 중복 결제가 발생할 수 있다. 다음처럼 상태를 조건으로 한 UPDATE와 영향 행 수로 승자를 정할 수 있다.

```sql
UPDATE seat
SET status = 'reserved', owner_id = :player_id
WHERE seat_id = :seat_id
  AND status = 'available';
```

한 요청만 1행을 갱신한다. 이 방식은 애플리케이션에서 읽고 나중에 쓰는 시간 간격을 줄인다. 결제까지 포함한다면 예약 만료, 요청 멱등성과 외부 결제 보상은 별도 상태 머신으로 설계한다.

## 5. 비슷한 개념과 비교
| 관점 | 질문 | 점검 항목 |
|---|---|---|
| 논리 모델 | 어떤 불변식인가 | Key·Constraint |
| 물리 실행 | 몇 Page를 읽는가 | Index·Plan |
| 동시성 | 무엇을 함께 허용하는가 | Transaction·Lock |

| 도구 | 강점 | 한계 |
|---|---|---|
| Isolation Level | Transaction 전체 관찰·충돌 규칙 | 제품별 구현, 재시도 비용 |
| Row Lock | 특정 Row 변경 직렬화 | 범위 불변식·Deadlock |
| UNIQUE/CHECK | 저장 시 명시 불변식 강제 | 복잡한 여러 Row 규칙 한계 |
| Conditional UPDATE | 경쟁 승자를 한 문장으로 결정 | 여러 자원 원자 작업에는 Transaction 필요 |
| Optimistic Version | 충돌 감지 후 재시도 | 높은 충돌에서 실패 증가 |

격리 수준과 복제 읽기 일관성도 구분한다. Primary의 Serializable 트랜잭션으로 Commit했어도 비동기 Replica에서 즉시 읽으면 복제 지연으로 이전 값을 볼 수 있다. 트랜잭션 격리는 일반적으로 한 DB 처리 경계의 동시 실행 문제다.

## 6. 장점과 단점
Isolation Level에서는 RDBMS는 제약과 트랜잭션, 유연한 조회가 강점이다. 인덱스 유지, Lock 경쟁, Schema 변경과 수평 확장 비용이 있다. 읽기 최적화가 쓰기 비용을 만들 수 있음을 고려한다.

약한 격리는 대기와 충돌 Abort를 줄여 처리량에 유리하지만 애플리케이션이 더 많은 이상 현상을 다뤄야 한다. 강한 격리는 직렬 실행과 같은 추론을 제공하지만 Lock 범위·보유 시간이 커지거나 직렬화 실패가 늘 수 있다. 정확성 버그 비용이 큰 결제·재화에서는 먼저 안전성을 확보하고 실제 충돌 지표로 최적화한다.

## 7. 게임 서버·백엔드 실무 예시
인벤토리 조회와 재화 차감의 요구가 다르다. 격리 수준만 믿지 말고 UPDATE 조건, UNIQUE, 명시 락과 재시도 정책으로 불변식을 지킨다.

Isolation Level에서는 운영에서는 처리량만 보지 않고 쿼리 p95·p99, 실행 계획, 읽은 행·Page, Lock 대기, Deadlock과 Connection Pool을 함께 관찰한다.

인벤토리 목록을 화면에 표시하는 읽기는 잠깐 서로 다른 Commit을 보더라도 요구에 따라 허용할 수 있다. 반면 장비 강화에서 재료 보유 확인과 차감·결과 지급은 같은 트랜잭션의 불변식이다. 목록 조회의 격리 요구를 강화 작업 전체에 그대로 적용할 필요는 없다.

길드 최대 인원 100명을 `SELECT COUNT(*)` 후 INSERT로 구현하면 동시 가입 둘이 모두 99를 보고 들어와 101명이 될 수 있다. 길드 행의 `member_count`를 조건부 갱신하고 Membership INSERT와 한 트랜잭션으로 묶거나, 길드 행을 Lock하고 검사한다. 단순 Snapshot Repeatable Read만으로 범위 불변식이 안전하다고 가정하지 않는다.

직렬화 실패와 Deadlock은 예상 가능한 동시성 결과로 분류한다. 요청 ID가 있는 멱등 작업만 전체 트랜잭션을 처음부터 재시도하고 지수 Backoff·Jitter와 최대 횟수를 둔다. 재시도율이 급증하면 성공으로 숨기지 말고 Hot Key, 긴 트랜잭션과 인덱스 범위를 분석한다.

운영 지표에는 격리 수준별 트랜잭션 수, Lock Wait 시간, Deadlock·Serialization Abort, 재시도 횟수, 오래된 Snapshot과 Version 정리 지연을 포함한다. 격리 수준 변경 전후에는 정확성 동시성 테스트와 처리량·p99를 함께 비교한다.

## 8. 자주 하는 오해
- 제약 조건을 애플리케이션 검사만으로 대체한다.
- 인덱스가 많을수록 모든 쿼리가 빨라진다고 본다.
- 트랜잭션이 외부 API까지 자동 원자화한다고 생각한다.
- 격리 수준 이름만으로 구현 동작을 단정한다.
- 평균 쿼리 시간만 보고 꼬리 지연을 무시한다.
- Repeatable Read면 모든 Phantom과 Lost Update가 모든 DB에서 방지된다고 본다.
- Snapshot Isolation과 Serializable을 같은 것으로 생각한다.
- Serializable은 모든 Transaction을 물리적으로 하나씩 실행한다고 본다.
- Read Committed이면 읽은 값을 기반으로 한 쓰기도 자동 안전하다고 생각한다.
- 격리 수준을 높이면 재시도 로직이 필요 없다고 본다.

## 9. 면접 질문
### Q1. 핵심 개념을 설명해 주세요.
격리 수준은 동시 트랜잭션이 서로의 중간 결과를 어느 정도 관찰할지 정하는 기준이다.
### Q2. 왜 필요한가요?
완전 직렬 실행은 안전하지만 동시성이 낮으므로 허용 가능한 이상과 처리량 사이에서 선택한다.
### Q3. 게임 백엔드에서는 어떻게 적용하나요?
인벤토리 조회와 재화 차감의 요구가 다르다. 격리 수준만 믿지 말고 UPDATE 조건, UNIQUE, 명시 락과 재시도 정책으로 불변식을 지킨다.
### Q4. 성능 문제는 무엇을 확인하나요?
실행 계획과 실제 행 수, Index 사용, Lock 대기와 꼬리 지연을 확인한다.

### Q5. Dirty Read, Non-repeatable Read, Phantom을 설명해 주세요.

Dirty Read는 미커밋 값을 읽는 것, Non-repeatable Read는 같은 행을 다시 읽었을 때 값이 바뀌는 것, Phantom은 같은 조건 조회의 행 집합이 INSERT·DELETE로 달라지는 것이다.

### Q6. Lost Update는 어떻게 막나요?

읽은 값을 애플리케이션에서 계산해 무조건 덮어쓰지 않는다. `SET value=value+:delta` 같은 원자 갱신, 상태·Version을 포함한 조건부 UPDATE, `FOR UPDATE` 성격의 Locking Read나 충돌을 감지하는 격리 수준을 사용한다.

### Q7. Snapshot Isolation과 Serializable의 차이는 무엇인가요?

Snapshot Isolation은 일관된 과거 Snapshot을 읽고 같은 행의 Write 충돌을 막을 수 있지만 서로 다른 행을 변경하는 Write Skew를 허용할 수 있다. Serializable은 결과가 어떤 직렬 순서와 동등하도록 Lock이나 의존성 검증으로 더 강하게 보장한다.

## 10. 예상 꼬리질문
- 논리 구조와 물리 구조는 어떻게 다른가요?
- 쓰기 성능에는 어떤 비용이 생기나요?
- 동시 요청에서 불변식을 어떻게 지키나요?
- 실행 계획이 예상과 달라지는 이유는 무엇인가요?
- 재시도 시 중복 처리를 어떻게 막나요?
- Write Skew의 예를 들어 주세요.
- 일반 SELECT와 `SELECT FOR UPDATE`는 어떻게 다른가요?

## 11. 30초 모범답변
> 격리 수준은 동시 트랜잭션의 관찰 범위를 조절해 정합성과 처리량을 교환합니다. 이름만이 아니라 사용하는 DB의 MVCC와 Lock 구현을 확인해야 합니다. 인벤토리 조회와 재화 차감의 요구가 다르다.

## 12. 1~2분 확장답변
> 격리 수준은 동시 트랜잭션의 관찰 범위를 조절해 정합성과 처리량을 교환합니다. 이름만이 아니라 사용하는 DB의 MVCC와 Lock 구현을 확인해야 합니다. 설계에서는 Schema와 제약으로 불변식을 표현하고, Query와 Index는 실제 접근 패턴으로 검증합니다. 동시 변경은 짧은 Transaction과 적절한 격리·Lock으로 보호하며, 타임아웃 재시도에는 멱등성 키를 적용합니다.

## 13. 핵심 요약
- 격리 수준은 동시 트랜잭션이 서로의 중간 결과를 어느 정도 관찰할지 정하는 기준이다.
- 불변식과 조회 패턴에서 설계를 시작한다.
- 논리 SQL과 물리 실행 계획을 구분한다.
- 읽기 최적화는 쓰기 비용을 만들 수 있다.
- 정합성과 재시도를 함께 설계한다.
- 표준 격리 수준 이름보다 실제 DB의 Snapshot·Lock·충돌 보장을 확인한다.
- Lost Update·Write Skew는 조건부 갱신·제약·Lock과 재시도로 직접 보호한다.

## 한 줄 정리
> 격리 수준은 동시 트랜잭션의 관찰 범위를 조절해 정합성과 처리량을 교환합니다. 이름만이 아니라 사용하는 DB의 MVCC와 Lock 구현을 확인해야 합니다.
