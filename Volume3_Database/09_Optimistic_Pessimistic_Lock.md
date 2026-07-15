---
difficulty: 4
reading_time: 25분
interview_frequency: 5
importance: 5
---

# 09. Optimistic Lock과 Pessimistic Lock

> 게임 서버·백엔드 개발자를 위한 CS 면접 교재

## 학습 목표

- 정의와 등장 이유를 설명할 수 있다.
- 정합성·성능 Trade-off를 설명할 수 있다.
- 게임 백엔드 장애와 확장에 적용할 수 있다.

## 1. 개요

낙관적 Lock은 충돌이 드물다고 보고 버전 검증으로 실패를 감지하며 비관적 Lock은 먼저 DB Lock을 획득해 충돌 접근을 막는다.

낙관적 동시성 제어(Optimistic Concurrency Control)는 작업 중 다른 변경을 막지 않고 Commit 또는 UPDATE 시점에 읽었던 상태가 그대로인지 확인한다. 상태가 바뀌었다면 실패시키고 다시 읽어 재시도하거나 사용자에게 충돌을 알린다. 이름에 Lock이 있지만 Version 열을 쓰는 전형적인 방식은 장시간 DB Lock을 보유하지 않는다.

비관적 잠금(Pessimistic Lock)은 충돌 가능성이 높거나 충돌 후 작업을 되돌리기 어렵다고 보고 변경 전에 행이나 범위를 잠근다. 다른 트랜잭션은 잠금이 풀릴 때까지 기다리거나 즉시 실패한다. 두 방식 모두 정확한 트랜잭션 경계, 제약 조건과 오류 처리가 필요하다.

## 2. 왜 필요한가
동일 자원 갱신 빈도와 실패 비용에 따라 대기 또는 재시도를 선택해야 한다. 분산된 사본과 동시 변경이 늘수록 실패 경로를 정상 흐름처럼 설계해야 한다.

프로필처럼 같은 행을 동시에 수정하는 일이 드물면 모든 편집 동안 다른 작업을 잠그는 것은 불필요한 대기다. 읽은 Version을 저장하고 UPDATE 때 비교하면 대부분 한 번에 성공하고 드문 충돌만 처리할 수 있다.

반대로 한정 수량 1개를 수천 요청이 경쟁하면 대부분의 낙관적 시도가 실패해 DB CPU와 로그, 재시도 트래픽을 낭비할 수 있다. 비관적 Lock으로 접근을 줄 세우는 것도 대기열과 Connection을 많이 점유한다. 이런 Hot Key에는 조건부 원자 UPDATE, 입구 Queue, 분산된 재고 Bucket 등 도메인 구조 변경까지 검토한다.

선택 기준은 “읽기가 많으면 낙관적, 쓰기가 많으면 비관적”보다 구체적이어야 한다. 같은 자원에 대한 동시 충돌률, Lock을 보유할 시간, 충돌 시 다시 수행할 계산·외부 작업 비용, 사용자에게 Merge를 요청할 수 있는지를 본다.

## 3. 핵심 동작 원리
```text
optimistic: read version→UPDATE WHERE version=n→affected rows check / pessimistic: SELECT FOR UPDATE→change→commit
```
낙관적 방식은 대기가 적지만 충돌 시 작업을 다시 해야 한다. 비관적 방식은 충돌을 선제 차단하지만 Lock 대기와 Deadlock 위험이 있다.

Optimistic Lock과 Pessimistic Lock에서는 성능 최적화는 새 상태와 실패 가능성을 추가한다. 원본이 무엇인지, 성공 응답의 기준과 재처리 방법을 먼저 정한다.

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

클라이언트나 서비스가 Version 7을 읽은 뒤 다음 조건으로 변경한다.

```sql
UPDATE player_profile
SET nickname = :new_name,
    version = version + 1
WHERE player_id = 101
  AND version = 7;
```

영향 행이 1개면 Version 7 상태를 자신이 Version 8로 바꾼 것이다. 0개면 행이 없거나 다른 트랜잭션이 먼저 Version을 변경했다. 두 경우를 구분하려면 재조회할 수 있다. ORM이 Version·Timestamp 성격 열을 자동 조건에 넣어 주기도 하지만 생성 SQL과 영향 행 검사를 확인한다.

```text
T1: Read version 7 ───────── UPDATE WHERE version=7 → 1 Row, version 8
T2: Read version 7 ───────── UPDATE WHERE version=7 → 0 Row, Conflict
```

Version 검사는 읽기와 쓰기 사이의 변경을 감지한다. Transaction 밖에서 오랜 시간 사용자가 편집해도 DB Lock을 잡지 않는다. 충돌 시 최신 데이터를 보여 주고 사용자가 다시 편집하거나, 변경 필드가 독립적이면 안전한 Merge 규칙을 적용한다.

### Version 열 선택

정수 Version은 매 변경 시 원자적으로 증가시키기 쉽다. Timestamp는 시간 해상도와 DB·애플리케이션 시계 차이, 같은 시각의 여러 변경을 고려해야 한다. DBMS가 제공하는 Row Version·Transaction ID 성격 기능은 의미와 수명, Backup·복구 후 보장을 확인한다.

업데이트할 모든 경로가 Version을 변경해야 한다. 운영 Script나 Batch가 Version을 빼고 수정하면 낙관적 검사가 변경을 놓칠 수 있다. Trigger, 공통 Repository와 권한으로 우회 경로를 관리한다.

Version의 목표는 순서를 전역 시간처럼 제공하는 것이 아니라 해당 Aggregate를 읽은 이후 변경 여부를 감지하는 것이다. 여러 테이블에 걸친 불변식은 행 하나의 Version만으로 보호되지 않을 수 있다.

### 낙관적 재시도

충돌했다고 항상 자동 재시도할 수 있는 것은 아니다. 프로필에서 두 사용자가 같은 필드를 다르게 수정했다면 최신 값 위에 이전 요청을 다시 적용하면 다른 변경을 덮을 수 있다. 사용자에게 충돌을 알려 Merge가 필요할 수 있다.

재화 차감처럼 연산이 `-10`이라는 의도라면 최신 잔액을 다시 읽고 조건을 검증해 재실행할 수 있다. 하지만 가격 조회, 랜덤 결과, 외부 결제와 메시지 발행을 이미 수행했다면 전체 재시도가 부작용을 중복시킬 수 있다. 요청 ID와 멱등성, 외부 작업 분리가 선행되어야 한다.

자동 재시도에는 최대 횟수, 지수 Backoff와 Jitter, 전체 요청 기한을 둔다. 충돌률이 높아지면 재시도로 숨기지 말고 Hot Key와 작업 모델을 개선한다.

### 비관적 Lock 흐름

```sql
BEGIN;

SELECT quantity
FROM limited_item
WHERE item_id = 5001
FOR UPDATE;

-- 현재 상태 검증 후 변경
UPDATE limited_item
SET quantity = quantity - 1
WHERE item_id = 5001;

COMMIT;
```

`FOR UPDATE` 성격의 Locking Read는 선택된 행에 배타적 변경 의도를 가진 Lock을 얻고 다른 Writer를 대기시킨다. 실제 Lock Mode와 범위는 DBMS, 격리 수준, 인덱스와 조건에 따라 달라진다. 조건 범위에 따라 Gap·Key-range Lock이 생길 수도 있다.

Lock은 Commit 또는 Rollback까지 유지되는 것이 일반적이다. 읽은 뒤 애플리케이션이 외부 HTTP를 호출하면 그 시간 동안 경쟁 요청과 Connection이 대기한다. 필요한 외부 데이터는 먼저 준비하고 Lock 안에서는 최신 상태 재검증과 짧은 DB 변경만 수행한다.

### NOWAIT와 SKIP LOCKED

일부 DBMS는 Lock을 기다리지 않고 즉시 오류를 내는 NOWAIT, 이미 잠긴 행을 건너뛰는 SKIP LOCKED 성격 기능을 제공한다.

작업 Queue에서 여러 Worker가 다음 미처리 작업을 가져갈 때 SKIP LOCKED로 서로 다른 행을 선택할 수 있다. 그러나 잠긴 작업이 계속 건너뛰어져 기아 상태가 될 수 있고 처리 순서가 엄격하지 않다. 사용자 재고 조회에서 잠긴 행을 조용히 생략하면 잘못된 결과가 되므로 의미에 맞춰 사용한다.

NOWAIT는 오래 기다리기보다 빠르게 “현재 처리 중”을 반환할 수 있다. 즉시 재시도 루프를 만들면 DB를 압박하므로 Backoff나 Queue가 필요하다.

### 조건부 UPDATE는 별도 강력한 선택지

단순 카운터·재고 차감은 먼저 SELECT로 잠근 뒤 UPDATE하지 않고 한 문장의 조건부 UPDATE로 해결할 수 있다.

```sql
UPDATE limited_item
SET quantity = quantity - 1
WHERE item_id = 5001
  AND quantity > 0;
```

DB는 변경하는 행의 Lock과 조건 재검사를 처리하고 영향 행 수로 성공을 결정한다. 네트워크 왕복과 Transaction 시간을 줄인다. 지급 기록 등 여러 변경이 필요하면 같은 Transaction에 이어서 수행한다.

조건부 UPDATE는 낙관적 Version 방식과 유사하게 “조건이 유지되었을 때만 쓰기”를 수행하지만 반드시 범용 Version 열을 쓰는 것은 아니다. 업무 상태 자체를 조건으로 사용한다.

### Pessimistic Lock과 Deadlock

두 플레이어 거래에서 T1은 A→B, T2는 B→A 순으로 Lock하면 Deadlock이 생긴다. 플레이어 ID 오름차순처럼 전역 획득 순서를 정한다. 적절한 인덱스 없이 범위를 스캔하면 예상보다 많은 Key를 잠가 Deadlock과 대기가 늘 수 있다.

```text
Transaction T1: lock Player 10 → lock Player 20
Transaction T2: lock Player 10 → lock Player 20
                 동일 순서로 Circular Wait 방지
```

Deadlock 탐지로 한 트랜잭션이 Rollback될 수 있으므로 비관적 방식도 실패가 없는 것은 아니다. Timeout, Deadlock과 연결 단절을 정상 오류 흐름으로 처리한다.

### Aggregate 경계

낙관적 Version은 함께 변경되어야 하는 데이터 묶음의 경계에 둔다. 주문 Header Version만 검사하고 Line Item을 다른 경로가 독립 수정한다면 전체 주문 불변식을 놓칠 수 있다. 모든 변경이 Header Version을 증가시키거나 DB Constraint·Lock으로 보완한다.

비관적 Lock도 대표 행 하나를 잠근다고 관련 모든 행의 변경이 자동 차단되지는 않는다. 모든 코드 경로가 대표 행을 먼저 잠그는 규약을 지키거나 FK·범위 Lock과 제약으로 강제해야 한다.

### 선택 기준

| 질문 | 낙관적 방식에 유리 | 비관적 방식에 유리 |
|---|---|---|
| 충돌 빈도 | 낮음 | 높음·예측 가능 |
| 작업 시간 | 사용자 편집처럼 김 | DB 내부에서 매우 짧음 |
| 충돌 후 비용 | 재계산·Merge 가능 | 재수행 비용 큼 |
| 대기 허용 | 실패를 빠르게 반환 | 짧은 순차 대기 허용 |
| 외부 부작용 | Commit 전 분리·멱등 필요 | Lock 중 외부 호출 금지 |

이 표는 출발점이다. 높은 충돌에서 비관적 Lock으로 모든 요청을 Connection에 세워 두는 것보다 입구 Queue나 단일 소유자가 나을 수 있다. 실제 충돌률·Lock Wait·Retry와 p99를 측정한다.

## 4. 쉬운 예시
Optimistic Lock과 Pessimistic Lock에서는 두 서버가 동시에 마지막 아이템을 지급하려 할 때 애플리케이션의 사전 조회만으로는 부족하다. DB 조건부 갱신과 제약을 최종 방어선으로 두고 요청 ID로 재시도를 식별한다.

위키 문서를 편집한다고 하자. 사용자가 Version 7 문서를 열어 오랫동안 편집하는 동안 다른 사용자가 Version 8로 저장했다. Version 7 조건의 저장은 실패하고 최신 변경과 Merge하도록 하는 것이 낙관적 방식이다. 편집을 시작할 때부터 다른 사용자를 수분 동안 막는 비관적 Lock은 협업성과 장애 복구에 불리하다.

반대로 창고 직원이 하나뿐인 귀중품을 꺼내는 매우 짧은 작업에서는 먼저 보관함을 잠그고 수량을 확인한 뒤 꺼내는 방식이 이해하기 쉽다. 실제 DB에서는 `FOR UPDATE`와 짧은 Transaction 또는 조건부 UPDATE로 구현한다.

## 5. 비슷한 개념과 비교
| 방식 | 장점 | 비용 |
|---|---|---|
| 직렬화·Lock | 강한 정합성 | 대기·Deadlock |
| Version·MVCC | 읽기 동시성 | 충돌 재시도·버전 관리 |
| Cache·Replica | 낮은 지연·확장 | Stale Data·무효화 |

| 구분 | Optimistic Version | Pessimistic DB Lock | MVCC |
|---|---|---|---|
| 목적 | 읽은 뒤 변경 감지 | 변경 전 충돌 차단 | Snapshot Reader 동시성 |
| 대기 | 일반 읽기 중 없음 | Lock Wait 가능 | 일반 Reader·Writer 대기 감소 |
| 충돌 결과 | 영향 0행·예외, Retry·Merge | 대기·Timeout·Deadlock | Writer 충돌은 별도 처리 |
| 구현 예 | `WHERE version=?` | `SELECT FOR UPDATE` | DB 내부 Row Version |

분산 Lock과 DB 비관적 Lock도 구분한다. Redis·ZooKeeper 성격의 Lock은 여러 프로세스의 작업 진입을 조정할 수 있지만 DB Commit과 원자적으로 묶이지 않으며 Lease 만료·네트워크 분할·Fencing Token을 고려해야 한다. 최종 DB 조건과 제약을 제거하는 근거가 되지 않는다.

## 6. 장점과 단점
Optimistic Lock과 Pessimistic Lock에서는 동시성 제어와 분산 구조는 정확성, 처리량, 가용성을 높인다. 반면 Lock 대기, 복제 지연, 중복 처리, 운영 복잡도가 생긴다. 모든 데이터에 같은 강도의 정합성을 적용하지 않는다.

낙관적 방식은 긴 사용자 작업 중 DB 자원을 점유하지 않고 충돌이 낮을 때 처리량이 좋다. 단점은 충돌 후 계산·사용자 입력을 다시 적용해야 하고 높은 충돌에서 Retry 폭증이 생긴다는 점이다. 비관적 방식은 충돌을 미리 순서화해 복잡한 변경을 단순화하지만 Lock Wait, Deadlock, Connection 점유와 꼬리 지연을 만든다.

## 7. 게임 서버·백엔드 실무 예시
프로필 수정은 version 열 기반 낙관적 Lock이 적합할 수 있고 한정 수량 선착순 지급은 조건부 UPDATE나 비관적 Lock을 고려한다. 외부 호출을 Lock 안에 두지 않는다.

Optimistic Lock과 Pessimistic Lock에서는 운영에서는 Cache Hit Ratio만 보지 않고 DB 부하, Lag, Lock 대기, Retry, Hot Key·Shard와 p99를 함께 본다.

### 프로필 수정

클라이언트에 Version을 포함해 전달하고 수정 요청에도 Version을 받는다. 0행 갱신이면 최신 프로필을 읽어 “다른 곳에서 변경됨”을 반환한다. 닉네임 UNIQUE 충돌은 Version 충돌과 별도 오류다. 클라이언트가 임의 Version을 생략하거나 최신으로 바꿔 보내지 못하도록 API 계약을 지킨다.

### 길드 가입

길드 정원은 여러 Membership 행의 범위 불변식이다. 길드 Header의 `member_count`를 `member_count < capacity` 조건으로 증가시키고 Membership INSERT와 한 Transaction으로 묶을 수 있다. 단일 길드가 Hot Key가 되면 실패 재시도 대신 가입 Queue와 Admission 제어를 검토한다.

### 매치 Worker Queue

여러 Worker가 DB 작업 Queue를 소비할 때 `FOR UPDATE SKIP LOCKED` 성격으로 서로 다른 대기 행을 가져올 수 있다. 처리 중 Worker Crash에 대비해 상태, Lease 만료, 시도 횟수와 멱등 작업 ID를 둔다. Lock을 잡은 채 실제 긴 매치 생성 작업을 하지 않고 짧게 Claim 상태만 Commit한다.

### 관찰 지표

낙관적 충돌률, 요청당 Retry 수와 최종 실패율, 비관적 Lock 획득·보유·대기 시간, Deadlock·Timeout, Blocking Connection과 Hot Key별 분포를 본다. 평균 성공 시간만 보면 충돌 사용자와 Queue 꼬리를 놓친다.

낙관적 충돌이 1%에서 30%로 늘었다면 단순 Retry 횟수를 올리지 않는다. 특정 플레이어·길드·상품 집중, 읽기 후 계산 시간, Version Aggregate 범위를 확인한다. 비관적 Lock p99가 늘면 Transaction 안의 외부 호출, 누락된 인덱스와 Lock 순서를 확인한다.

## 8. 자주 하는 오해
- MVCC면 쓰기 충돌이 없다고 본다.
- Redis 명령 원자성이 전체 로직 원자성을 뜻한다고 본다.
- TTL만 있으면 캐시 정합성이 해결된다고 본다.
- Replica가 Primary와 항상 같은 값을 반환한다고 본다.
- Sharding이 JOIN과 Transaction을 자동 분산한다고 본다.
- 낙관적 Lock은 충돌해도 자동으로 항상 안전하게 재시도된다고 본다.
- 비관적 Lock을 쓰면 Deadlock과 실패가 없다고 생각한다.
- `FOR UPDATE`가 사용자 편집 시간 전체를 잠그는 데 적합하다고 본다.
- MVCC와 Version 열 기반 낙관적 Lock을 같은 기능으로 본다.
- 분산 Lock이 DB Constraint와 조건부 UPDATE를 대체한다고 생각한다.

## 9. 면접 질문
### Q1. 핵심 개념을 설명해 주세요.
낙관적 Lock은 충돌이 드물다고 보고 버전 검증으로 실패를 감지하며 비관적 Lock은 먼저 DB Lock을 획득해 충돌 접근을 막는다.
### Q2. 어떤 Trade-off가 있나요?
낙관적 방식은 대기가 적지만 충돌 시 작업을 다시 해야 한다. 비관적 방식은 충돌을 선제 차단하지만 Lock 대기와 Deadlock 위험이 있다.
### Q3. 게임 백엔드 적용 사례는 무엇인가요?
프로필 수정은 version 열 기반 낙관적 Lock이 적합할 수 있고 한정 수량 선착순 지급은 조건부 UPDATE나 비관적 Lock을 고려한다. 외부 호출을 Lock 안에 두지 않는다.
### Q4. 장애 시 무엇을 확인하나요?
Optimistic Lock과 Pessimistic Lock에서는 원본 상태, Lock과 Retry, Cache·Replica 지연, 중복 요청과 복구 절차를 확인한다.

### Q5. 낙관적 Lock을 SQL로 어떻게 구현하나요?

행에 Version 열을 두고 읽은 Version을 UPDATE의 WHERE에 포함한다. 성공 시 Version을 증가시키고 영향 행이 0개면 다른 변경이 있었다고 판단해 최신 상태를 다시 읽고 Merge·재시도 또는 충돌 응답을 선택한다.

### Q6. 낙관적 Lock 충돌은 무조건 재시도하나요?

아니다. 같은 필드를 다른 값으로 수정한 사용자 편집은 자동 Retry가 상대 변경을 덮을 수 있어 Merge나 사용자 확인이 필요하다. 재화 연산도 외부 부작용과 멱등성을 확인한 뒤 최신 상태에서 전체 조건을 다시 검증해야 한다.

### Q7. 비관적 Lock은 언제 적합한가요?

충돌 가능성이 높고 Transaction이 DB 안에서 짧으며 충돌 후 전체 작업을 다시 수행하는 비용이 큰 경우 고려한다. Lock 보유 중 외부 I/O를 하지 않고 일정한 자원 순서, Timeout과 Deadlock Retry를 설계한다.

## 10. 예상 꼬리질문
- 실패 후 재시도를 어떻게 안전하게 하나요?
- 오래된 읽기를 허용할 수 없는 데이터는 무엇인가요?
- Hot Key나 Hot Shard를 어떻게 찾나요?
- Failover 중 쓰기 결과를 어떻게 판단하나요?
- 분산 상태의 원본은 무엇인가요?
- Version 열은 어떤 경로에서 증가해야 하나요?
- NOWAIT와 SKIP LOCKED는 언제 사용하나요?

## 11. 30초 모범답변
> 낙관적 Lock은 버전 충돌을 검출해 재시도하고 비관적 Lock은 먼저 잠가 충돌을 차단합니다. 충돌 빈도와 재시도 비용으로 선택합니다. 프로필 수정은 version 열 기반 낙관적 Lock이 적합할 수 있고 한정 수량 선착순 지급은 조건부 UPDATE나 비관적 Lock을 고려한다.

## 12. 1~2분 확장답변
> 낙관적 Lock은 버전 충돌을 검출해 재시도하고 비관적 Lock은 먼저 잠가 충돌을 차단합니다. 충돌 빈도와 재시도 비용으로 선택합니다. 먼저 데이터별 정합성과 지연 요구를 분류합니다. 강한 불변식은 DB Constraint와 짧은 Transaction으로 지키고, Cache와 Replica는 허용 가능한 Stale 범위에서 사용합니다. 장애와 Timeout은 중복될 수 있으므로 멱등성 키, 제한된 Retry와 관찰 지표를 함께 둡니다.

## 13. 핵심 요약
- 낙관적 Lock은 충돌이 드물다고 보고 버전 검증으로 실패를 감지하며 비관적 Lock은 먼저 DB Lock을 획득해 충돌 접근을 막는다.
- 원본과 성공 기준을 명확히 한다.
- 성능 구조는 새로운 정합성 비용을 만든다.
- Timeout과 Retry에는 멱등성이 필요하다.
- 평균보다 Lag, Lock과 p99를 관찰한다.
- 낙관적 방식은 충돌을 없애지 않고 감지하며, Retry 가능성은 Domain 의미가 결정한다.
- 비관적 방식은 짧은 DB 경계에서만 사용하고 높은 충돌에는 Queue·소유권 구조도 검토한다.

## 한 줄 정리
> 낙관적 Lock은 버전 충돌을 검출해 재시도하고 비관적 Lock은 먼저 잠가 충돌을 차단합니다. 충돌 빈도와 재시도 비용으로 선택합니다.
