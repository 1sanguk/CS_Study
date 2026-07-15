---
difficulty: 4
reading_time: 25분
interview_frequency: 5
importance: 5
---

# 08. DB Lock과 MVCC

> 게임 서버·백엔드 개발자를 위한 CS 면접 교재

## 학습 목표

- 정의와 등장 이유를 설명할 수 있다.
- 정합성·성능 Trade-off를 설명할 수 있다.
- 게임 백엔드 장애와 확장에 적용할 수 있다.

## 1. 개요

DB Lock은 충돌하는 접근을 대기시켜 일관성을 지키고 MVCC는 여러 버전으로 읽기와 쓰기의 충돌을 줄이는 방식이다.

DB 잠금(Lock)은 여러 트랜잭션이 같은 데이터에 접근할 때 허용 가능한 조합만 동시에 실행하도록 한다. MVCC(Multi-Version Concurrency Control)는 행의 여러 버전과 트랜잭션 가시성 정보를 이용해 독자가 자신의 Snapshot에 맞는 버전을 읽도록 한다. 일반 읽기가 Writer의 미커밋 변경을 기다리지 않게 할 수 있어 읽기 동시성을 높인다.

두 방식은 서로 배타적인 선택이 아니다. MVCC DB도 같은 행을 동시에 변경하는 Writer 사이에는 Lock이나 충돌 검사가 필요하고, 명시적 `FOR UPDATE` 읽기와 DDL에는 잠금을 사용한다. “Lock 방식 DB”와 “MVCC 방식 DB”로 단순 양분하기보다 읽기와 쓰기별 실제 동작을 본다.

## 2. 왜 필요한가
동시 트랜잭션이 같은 행을 변경하거나 읽을 때 Lost Update와 불일치를 막으면서 처리량을 유지해야 한다. 분산된 사본과 동시 변경이 늘수록 실패 경로를 정상 흐름처럼 설계해야 한다.

모든 읽기와 쓰기에 하나의 전역 Lock을 사용하면 정합성은 이해하기 쉽지만 독립적인 플레이어 작업도 직렬화되어 처리량이 낮다. 반대로 아무 제어 없이 실행하면 두 구매가 같은 잔액과 재고를 보고 모두 성공할 수 있다. DB는 행·페이지·테이블과 Key 범위 같은 단위로 충돌을 조정한다.

읽기 요청이 긴 분석 쿼리 때문에 Writer를 막고 Writer가 일반 조회를 막으면 온라인 서비스 지연이 커진다. MVCC는 Commit된 이전 버전을 Reader에게 보여 주어 많은 읽기·쓰기 충돌을 줄인다. 그 대신 오래된 버전 저장, 가시성 검사와 정리 비용이 생긴다.

## 3. 핵심 동작 원리
```text
writer→row lock→new version / reader→snapshot visible version
```
공유·배타 Lock과 행·범위 Lock이 있으며 MVCC 읽기도 버전 보존과 정리 비용이 있다. Snapshot 읽기와 현재 읽기의 동작은 다를 수 있다.

DB Lock과 MVCC에서는 성능 최적화는 새 상태와 실패 가능성을 추가한다. 원본이 무엇인지, 성공 응답의 기준과 재처리 방법을 먼저 정한다.

### Shared Lock과 Exclusive Lock

공유 잠금(Shared Lock, S)은 읽기용, 배타 잠금(Exclusive Lock, X)은 변경용으로 설명한다. 여러 S Lock은 서로 호환될 수 있지만 X Lock은 같은 자원의 다른 S·X와 충돌하는 것이 일반적이다.

| 보유 \ 요청 | S | X |
|---|---:|---:|
| S | 허용 | 대기 |
| X | 대기 | 대기 |

이 표는 기본 개념을 단순화한 것이다. Update Lock, Intent Lock, Schema Lock 등 실제 모드는 제품마다 더 다양하다. MVCC의 일반 SELECT는 S Lock을 오래 잡지 않고 버전을 읽을 수 있어 표와 다른 동시성을 보일 수 있다.

```text
T1: X Lock(Row 101) ─ Update ───────── Commit → Unlock
T2: X Lock(Row 101) 요청 ─ Waiting ───────────── 획득
T3: Snapshot Read → 이전 Commit Version 읽기 가능(MVCC 구현에 따라)
```

### Lock Granularity

잠금 단위가 작으면 서로 다른 행 작업을 동시에 처리하기 좋지만 잠금 객체와 관리 비용이 늘어난다. 단위가 크면 관리가 단순하지만 관련 없는 행까지 막는다.

- Row·Key Lock: 특정 행이나 인덱스 Key를 보호한다.
- Page Lock: 같은 Page의 여러 행을 함께 보호한다.
- Table Lock: 테이블 전체를 보호한다.
- Key-range·Gap 성격 Lock: 조건 범위에 새 Key가 들어오는 것을 제어한다.

“UPDATE 한 행이므로 Row Lock 하나만 잡는다”는 보장은 없다. 실행 계획이 많은 인덱스 범위를 읽거나 FK·보조 인덱스를 갱신하면 여러 Key와 페이지에 영향을 줄 수 있다. 적절한 인덱스는 검색 범위를 줄여 성능뿐 아니라 잠금 범위를 줄이는 데도 도움을 줄 수 있다.

### Intent Lock

다단계 자원에서 하위 행에 Lock이 있다는 사실을 상위 테이블 수준에 표시한다. 예를 들어 Intent Exclusive는 트랜잭션이 테이블 내부의 어떤 행에 X Lock을 가지고 있거나 얻으려는 의도를 나타낸다. 테이블 전체 X Lock을 요청하는 작업이 모든 행 Lock을 일일이 검사하지 않고 충돌 여부를 판단하도록 돕는다.

Intent Lock 자체가 테이블의 모든 행을 배타적으로 막는다는 뜻은 아니다. 실제 호환성은 DBMS Lock Mode 표를 확인한다.

### Lock Escalation

많은 행 Lock을 관리하는 비용을 줄이기 위해 DBMS가 Page나 Table 수준의 큰 Lock으로 승격할 수 있다. 승격되면 잠금 개수는 줄지만 다른 트랜잭션과의 충돌 범위가 갑자기 커진다. 모든 DBMS가 같은 정책으로 자동 승격하는 것은 아니다.

대량 UPDATE를 작은 Batch로 나누면 Lock·로그와 트랜잭션 시간을 줄일 수 있다. Batch 사이 부분 완료를 허용할 수 있는지, 재시작 위치와 멱등성을 함께 설계한다.

### Range Lock과 Phantom

`WHERE score BETWEEN 100 AND 200` 결과를 보호하려면 현재 존재하는 행만 잠그는 것으로는 부족할 수 있다. 다른 트랜잭션이 그 사이 Key 150을 INSERT하면 Phantom이 생긴다. Serializable이나 특정 Locking Read 구현은 인덱스 Key 사이 Gap·Range를 잠가 삽입을 제어할 수 있다.

```text
Index Keys: 100 ----- 140 -------- 200
             [ 보호할 Key Range ]
T2가 Key 150 Insert → Range Lock과 충돌 가능
```

범위 잠금은 인덱스 접근 경로와 관계가 깊다. 적절한 인덱스가 없으면 넓은 범위를 보호하거나 테이블 수준 영향이 커질 수 있다. 구체적인 Next-key Lock, Predicate Lock 구현은 제품별로 다르다.

### Deadlock

```text
T1: X Lock Player 1 → Player 2 대기
T2: X Lock Player 2 → Player 1 대기
```

DBMS는 Wait-for Graph의 순환을 탐지하고 한 트랜잭션을 희생자로 Rollback할 수 있다. Lock Timeout만으로 모든 Deadlock을 처리하는 것은 아니다. 애플리케이션은 Deadlock 오류를 예상 가능한 결과로 보고 외부 부작용 없는 전체 트랜잭션을 제한적으로 재시도한다.

자원 접근 순서를 통일하고, 필요한 인덱스를 두며, 사용자 입력과 외부 I/O를 Lock 보유 중 기다리지 않는다. Deadlock Graph에서 어떤 SQL이 어떤 Key를 어떤 순서로 잠갔는지 확인한다.

### MVCC Row Version

MVCC는 행 변경 시 기존 버전을 즉시 모든 Reader에게서 없애지 않고 트랜잭션 식별·시간 정보와 함께 보존한다.

```text
Row player_id=1

Version V1: balance=100, created by Tx 10, ended by Tx 20
Version V2: balance=80,  created by Tx 20, current

Old Snapshot → V1 visible
New Snapshot → V2 visible after Tx 20 Commit
```

Reader는 자신의 Snapshot보다 미래에 Commit된 버전이나 미커밋 버전을 제외하고 보이는 버전을 선택한다. 정확한 버전 저장 위치는 엔진마다 다르다. 행 내부에 새 튜플을 만들거나 Undo 영역에 이전 값을 저장할 수 있다.

### Snapshot 생성 시점

Read Committed MVCC에서는 각 SQL 문이 새 Snapshot을 얻어 같은 트랜잭션의 다음 문장에서 더 최신 Commit을 볼 수 있다. Repeatable Read·Snapshot 격리에서는 트랜잭션의 여러 일반 읽기가 같은 Snapshot을 공유할 수 있다. 시작 시점인지 첫 읽기 시점인지도 제품과 옵션에 따라 확인한다.

Snapshot Read는 과거의 일관된 보기를 제공하지만 “지금 재고를 차감해도 되는가” 같은 현재 상태 변경에는 그대로 사용할 수 없다. 조건부 UPDATE나 Locking Read가 필요하다.

### Update와 Write Conflict

MVCC에서 일반 Reader와 Writer가 덜 막혀도 두 Writer가 같은 행을 동시에 변경하면 충돌한다. 한 Writer가 Row Lock을 기다리거나, Commit 시 Version이 달라져 한쪽이 실패할 수 있다. 서로 다른 행을 쓰면서 여러 행 불변식을 깨는 Write Skew도 가능하므로 격리 수준과 제약을 함께 본다.

```sql
UPDATE inventory_item
SET quantity = quantity - 1
WHERE item_id = :item_id
  AND quantity >= 1;
```

조건부 UPDATE와 영향 행 수는 마지막 수량 경쟁에서 한 요청만 성공하게 한다. 사전 Snapshot SELECT만으로 판단하는 것보다 직접적이다.

### Version 정리

더 이상 어떤 활성 Snapshot도 볼 수 없는 이전 버전은 정리할 수 있다. PostgreSQL의 Vacuum 성격, InnoDB Undo Purge 성격처럼 구현과 용어는 다르다. 긴 트랜잭션이 오래된 Snapshot을 유지하면 그 이후 생성된 버전을 제거하지 못해 테이블·Undo가 커지고 조회가 긴 Version Chain을 따라갈 수 있다.

```text
Old Transaction Snapshot ─────────────────────────── active
Writes: V2, V3, V4, V5 생성
Cleanup: Old Snapshot 때문에 V1~V4 일부 보존 필요
```

“읽기 전용 트랜잭션은 Lock을 안 잡으니 오래 열어도 안전하다”는 말이 틀릴 수 있는 이유다. 오래된 활성 트랜잭션, Dead Tuple·Undo 증가, 정리 지연과 Replica 영향 지표를 본다.

### Vacuum·Purge와 공간

버전 정리는 논리적으로 죽은 행을 재사용 가능하게 만들 수 있지만 파일 크기가 즉시 운영체제에 반환되지는 않을 수 있다. 강제 전체 재작성은 큰 I/O·추가 공간과 Lock을 만들 수 있다. 정상적인 Background Cleanup이 따라갈 수 있도록 트랜잭션을 짧게 하고 쓰기량과 설정을 조정한다.

통계 갱신과 정리 작업이 지연되면 실행 계획 추정도 나빠질 수 있다. 정리 도구를 단순 저장 공간 청소가 아니라 MVCC 정상 운영의 일부로 본다.

### Lock과 Latch

DB Lock은 트랜잭션 간 논리 데이터 정합성을 보호하고 Commit·Rollback까지 유지될 수 있다. Latch·Mutex 성격의 내부 동기화는 Buffer Page와 B+Tree 구조 같은 메모리 내부 자료구조를 짧게 보호한다. 사용자가 Row Lock을 요청하는 것과 엔진 내부 Page Latch 경합은 다른 문제다.

Hot Page의 내부 Latch 경합은 Lock Wait 목록에 같은 방식으로 나타나지 않을 수 있다. DB 대기 이벤트와 엔진별 진단 지표로 구분한다.

## 4. 쉬운 예시
DB Lock과 MVCC에서는 두 서버가 동시에 마지막 아이템을 지급하려 할 때 애플리케이션의 사전 조회만으로는 부족하다. DB 조건부 갱신과 제약을 최종 방어선으로 두고 요청 ID로 재시도를 식별한다.

문서 편집에서 Reader는 저장된 이전 버전을 계속 읽고 Writer는 새 버전을 준비해 Commit할 수 있다. MVCC와 비슷하지만 실제 DB는 행마다 가시성 정보를 관리하고 Snapshot 규칙으로 어떤 버전을 보일지 결정한다. 두 Writer가 같은 문장을 동시에 수정하면 여전히 충돌을 해결해야 한다.

아이템 수량이 1일 때 두 서버가 일반 SELECT로 각각 1을 읽고 0을 쓰면 Lost Update가 생길 수 있다. `quantity=quantity-1 AND quantity>=1` 조건부 UPDATE는 Lock과 원자 변경을 통해 한 서버만 영향 행 1개를 얻도록 한다.

## 5. 비슷한 개념과 비교
| 방식 | 장점 | 비용 |
|---|---|---|
| 직렬화·Lock | 강한 정합성 | 대기·Deadlock |
| Version·MVCC | 읽기 동시성 | 충돌 재시도·버전 관리 |
| Cache·Replica | 낮은 지연·확장 | Stale Data·무효화 |

| 구분 | Lock 기반 현재 읽기 | MVCC Snapshot 읽기 |
|---|---|---|
| Reader 결과 | 현재 Row와 Lock 상태에 의존 | Snapshot에 보이는 Version |
| Reader-Writer | 서로 대기 가능 | 일반 읽기는 충돌 감소 |
| 비용 | Lock 관리·대기·Deadlock | Version 저장·가시성 검사·정리 |
| 적합 | 변경 전 최신 상태 확보 | 일관된 조회·읽기 동시성 |

낙관적 Lock의 Version 열과 MVCC도 구분한다. MVCC는 DB 내부가 여러 행 버전을 관리하는 동시성 제어 방식이다. 애플리케이션 낙관적 Lock은 `WHERE id=? AND version=?`으로 읽은 이후 변경 여부를 감지하는 패턴이다. 함께 사용할 수 있다.

## 6. 장점과 단점
DB Lock과 MVCC에서는 동시성 제어와 분산 구조는 정확성, 처리량, 가용성을 높인다. 반면 Lock 대기, 복제 지연, 중복 처리, 운영 복잡도가 생긴다. 모든 데이터에 같은 강도의 정합성을 적용하지 않는다.

Lock은 충돌 작업 순서를 명시적으로 제어하고 최신 상태 기반 변경을 쉽게 만들지만 대기·Deadlock과 범위 확대로 꼬리 지연을 만든다. MVCC는 Reader와 Writer 동시성을 높이고 일관된 Snapshot을 제공하지만 Version 공간, Cleanup과 오래된 Snapshot 비용이 있으며 Write 충돌을 제거하지 않는다.

## 7. 게임 서버·백엔드 실무 예시
인벤토리 변경은 조건부 UPDATE와 Lock으로 보호하고 긴 트랜잭션이 오래된 버전 정리를 막지 않게 한다. Deadlock은 짧은 재시도와 일관된 접근 순서로 대응한다.

DB Lock과 MVCC에서는 운영에서는 Cache Hit Ratio만 보지 않고 DB 부하, Lag, Lock 대기, Retry, Hot Key·Shard와 p99를 함께 본다.

### Lock 장애 진단

1. Blocked Session과 Blocking Session을 연결한다.
2. 각 Transaction 시작 시각, 마지막 SQL과 현재 Wait Event를 본다.
3. 보유·요청 Lock의 Table, Index와 Key 범위를 확인한다.
4. 실행 계획이 불필요하게 많은 Row·Range를 읽는지 본다.
5. 외부 I/O·사용자 대기와 Connection Pool 반환 누락을 확인한다.
6. Deadlock Graph에서 자원 획득 순서를 고정할 수 있는지 본다.

Blocking 쿼리를 무조건 Kill하면 일시 복구는 되지만 큰 Rollback이 추가 부하를 만들 수 있다. 영향과 복구 시간을 판단하고 원인을 수정한다.

### MVCC 운영 지표

오래 실행 중인 트랜잭션, 가장 오래된 Snapshot, Dead Version·Undo 크기, Cleanup 지연, Table Bloat 성격 지표와 Transaction ID 여유를 제품별로 관찰한다. 쓰기 급증 뒤 Cleanup I/O가 p99에 영향을 줄 수 있어 백그라운드 작업도 용량 계획에 포함한다.

게임 운영자가 대형 통계를 Repeatable Read 트랜잭션으로 수십 분 조회하면 온라인 Writer를 직접 막지 않더라도 Version 정리를 지연시킬 수 있다. 분석 Replica나 별도 Warehouse를 사용하거나 조회를 작은 범위로 나눈다. Replica에서도 긴 Query가 Replay·정리와 충돌할 수 있어 제품 동작을 확인한다.

핫 플레이어·길드 한 행의 Counter를 모든 요청이 갱신하면 Row Lock 대기와 Cache Line·Log 경합이 집중된다. 샤딩 Counter, 이벤트 집계 또는 단일 소유 Queue를 고려하되 정확한 실시간 합계가 필요한지 먼저 분류한다.

## 8. 자주 하는 오해
- MVCC면 쓰기 충돌이 없다고 본다.
- Redis 명령 원자성이 전체 로직 원자성을 뜻한다고 본다.
- TTL만 있으면 캐시 정합성이 해결된다고 본다.
- Replica가 Primary와 항상 같은 값을 반환한다고 본다.
- Sharding이 JOIN과 Transaction을 자동 분산한다고 본다.
- MVCC의 일반 SELECT가 항상 최신 Commit 값을 본다고 생각한다.
- Reader가 Writer를 막지 않으면 긴 읽기 Transaction 비용도 없다고 본다.
- Row 하나 UPDATE는 언제나 Row Lock 하나만 잡는다고 본다.
- Intent Lock이 Table 전체를 배타적으로 잠근다고 생각한다.
- Deadlock과 단순 Lock Wait을 같은 것으로 본다.

## 9. 면접 질문
### Q1. 핵심 개념을 설명해 주세요.
DB Lock은 충돌하는 접근을 대기시켜 일관성을 지키고 MVCC는 여러 버전으로 읽기와 쓰기의 충돌을 줄이는 방식이다.
### Q2. 어떤 Trade-off가 있나요?
공유·배타 Lock과 행·범위 Lock이 있으며 MVCC 읽기도 버전 보존과 정리 비용이 있다. Snapshot 읽기와 현재 읽기의 동작은 다를 수 있다.
### Q3. 게임 백엔드 적용 사례는 무엇인가요?
인벤토리 변경은 조건부 UPDATE와 Lock으로 보호하고 긴 트랜잭션이 오래된 버전 정리를 막지 않게 한다. Deadlock은 짧은 재시도와 일관된 접근 순서로 대응한다.
### Q4. 장애 시 무엇을 확인하나요?
DB Lock과 MVCC에서는 원본 상태, Lock과 Retry, Cache·Replica 지연, 중복 요청과 복구 절차를 확인한다.

### Q5. Shared Lock과 Exclusive Lock을 비교해 주세요.

Shared Lock은 일반적으로 여러 Reader가 함께 보유할 수 있고 Exclusive Lock은 변경을 위해 다른 충돌 Lock을 배제한다. MVCC 일반 읽기는 Shared Lock을 오래 유지하지 않고 Snapshot Version을 읽을 수 있어 실제 동작은 DBMS별로 확인한다.

### Q6. MVCC는 어떻게 Reader와 Writer 충돌을 줄이나요?

Writer가 새 행 버전을 만들고 Reader는 자신의 Snapshot에 보이는 이전 Commit 버전을 읽게 한다. Reader가 미완료 Writer를 기다리지 않을 수 있지만 같은 행 Writer 충돌과 여러 행 Write Skew는 남는다.

### Q7. 긴 읽기 전용 트랜잭션도 문제가 되나요?

오래된 Snapshot을 유지해 이후 생성된 Row Version의 정리를 막을 수 있다. Dead Tuple·Undo와 저장 공간이 늘고 Version Chain 탐색과 Cleanup 지연이 성능에 영향을 줄 수 있다.

## 10. 예상 꼬리질문
- 실패 후 재시도를 어떻게 안전하게 하나요?
- 오래된 읽기를 허용할 수 없는 데이터는 무엇인가요?
- Hot Key나 Hot Shard를 어떻게 찾나요?
- Failover 중 쓰기 결과를 어떻게 판단하나요?
- 분산 상태의 원본은 무엇인가요?
- Key-range Lock은 어떤 문제를 막나요?
- Lock Escalation은 왜 발생하나요?

## 11. 30초 모범답변
> Lock은 충돌 연산을 직렬화하고 MVCC는 Snapshot에 맞는 버전을 읽혀 읽기·쓰기 충돌을 줄입니다. MVCC도 쓰기 충돌과 버전 관리 비용은 남습니다. 인벤토리 변경은 조건부 UPDATE와 Lock으로 보호하고 긴 트랜잭션이 오래된 버전 정리를 막지 않게 한다.

## 12. 1~2분 확장답변
> Lock은 충돌 연산을 직렬화하고 MVCC는 Snapshot에 맞는 버전을 읽혀 읽기·쓰기 충돌을 줄입니다. MVCC도 쓰기 충돌과 버전 관리 비용은 남습니다. 먼저 데이터별 정합성과 지연 요구를 분류합니다. 강한 불변식은 DB Constraint와 짧은 Transaction으로 지키고, Cache와 Replica는 허용 가능한 Stale 범위에서 사용합니다. 장애와 Timeout은 중복될 수 있으므로 멱등성 키, 제한된 Retry와 관찰 지표를 함께 둡니다.

## 13. 핵심 요약
- DB Lock은 충돌하는 접근을 대기시켜 일관성을 지키고 MVCC는 여러 버전으로 읽기와 쓰기의 충돌을 줄이는 방식이다.
- 원본과 성공 기준을 명확히 한다.
- 성능 구조는 새로운 정합성 비용을 만든다.
- Timeout과 Retry에는 멱등성이 필요하다.
- 평균보다 Lag, Lock과 p99를 관찰한다.
- MVCC는 Lock을 제거하는 기술이 아니라 Version으로 일반 읽기 충돌을 줄이는 방식이다.
- Lock 범위·순서와 오래된 Snapshot·Version 정리를 함께 관찰한다.

## 한 줄 정리
> Lock은 충돌 연산을 직렬화하고 MVCC는 Snapshot에 맞는 버전을 읽혀 읽기·쓰기 충돌을 줄입니다. MVCC도 쓰기 충돌과 버전 관리 비용은 남습니다.
