---
difficulty: 4
reading_time: 25분
interview_frequency: 5
importance: 5
---

# 11. Cache 전략과 정합성

> 게임 서버·백엔드 개발자를 위한 CS 면접 교재

## 학습 목표

- 정의와 등장 이유를 설명할 수 있다.
- 정합성·성능 Trade-off를 설명할 수 있다.
- 게임 백엔드 장애와 확장에 적용할 수 있다.

## 1. 개요

캐시는 느린 원본 앞에 자주 쓰는 데이터를 두어 지연과 부하를 줄이며 정합성 전략은 원본과 캐시의 갱신 순서와 실패 처리를 정한다.

캐시(Cache)는 원본 데이터의 일부를 더 빠르고 가까운 저장소에 복제해 반복 계산과 I/O를 줄인다. 애플리케이션 프로세스 내부 메모리, Redis 같은 분산 캐시, CDN과 DB Buffer Pool 모두 넓은 의미의 캐시지만 이 문서는 애플리케이션과 원본 DB 사이의 읽기 캐시를 중심으로 다룬다.

캐시를 추가하면 상태가 하나에서 둘 이상으로 늘어난다. 원본이 바뀌었는데 캐시가 남거나, 캐시를 먼저 바꾼 뒤 DB 쓰기가 실패하는 문제가 생긴다. “Cache Hit Ratio를 높인다”보다 어떤 데이터가 원본이고 얼마 동안 오래된 값을 허용하며 실패 후 어떻게 복구할지를 먼저 정한다.

## 2. 왜 필요한가
읽기 성능을 높이면서 오래된 값, Cache Stampede와 이중 쓰기 실패를 제어해야 한다. 분산된 사본과 동시 변경이 늘수록 실패 경로를 정상 흐름처럼 설계해야 한다.

플레이어 프로필이 초당 수만 번 읽히지만 몇 분에 한 번만 변경된다면 매 읽기를 DB에 보내는 것은 불필요하다. 캐시는 DB Connection, Buffer Page와 Network를 절약하고 사용자 지연을 줄인다. 계산 비용이 큰 랭킹 결과와 권한 집합도 일정 시간 재사용할 수 있다.

반면 재화 잔액처럼 변경 직후 정확한 값이 필요한 데이터는 오래된 캐시가 중복 구매와 잘못된 거절을 만들 수 있다. Cache 장애 때 모든 요청이 DB로 몰리면 원본까지 장애가 확대된다. 데이터별 정확성·신선도·재구축 비용과 DB의 최악 부하를 기준으로 캐시 적용 여부를 선택한다.

## 3. 핵심 동작 원리
```text
Cache Aside: read cache miss→DB→cache fill / write DB→invalidate cache
```
Cache Aside는 단순하지만 Miss와 오래된 값 창이 있다. Write Through는 캐시와 원본을 함께 갱신하고 Write Back은 지연 쓰기로 빠르지만 손실·복구가 복잡하다.

Cache 전략과 정합성에서는 성능 최적화는 새 상태와 실패 가능성을 추가한다. 원본이 무엇인지, 성공 응답의 기준과 재처리 방법을 먼저 정한다.

### Cache-Aside 읽기

애플리케이션이 Cache를 먼저 읽고 Miss면 원본 DB에서 읽어 Cache를 채운다. Cache가 장애여도 원본을 읽는 Fallback을 구현하기 쉬워 널리 쓰인다.

```text
Client → Application → Cache GET
                         ├─ Hit  → Return
                         └─ Miss → DB SELECT → Cache SET(TTL) → Return
```

Miss가 동시에 많이 발생하면 여러 요청이 같은 DB Query를 수행할 수 있다. Cache 채우기 실패가 사용자 응답 실패로 이어질 필요는 없는 경우가 많다. DB 조회는 성공했으므로 Cache SET 오류를 기록하고 원본 결과를 반환할 수 있다.

Cache에 넣기 전 직렬화 형식, Schema Version과 TTL을 정한다. 큰 객체 전체를 캐시하면 일부 필드만 필요해도 Network와 Memory를 소비한다. 반대로 너무 세분화하면 요청당 Key 수와 일관성 경계가 늘어난다.

### Cache-Aside 쓰기: DB 갱신 후 삭제

```text
1. DB Transaction Commit
2. Cache Key Delete
```

캐시 값을 직접 업데이트하기보다 삭제하면 다음 읽기가 DB에서 최신 값을 채운다. DB 쓰기가 실패하면 Cache를 건드릴 필요가 없다. 삭제가 실패하면 오래된 값이 TTL까지 남을 수 있으므로 Retry·이벤트 무효화와 TTL을 안전망으로 둔다.

삭제 후 DB Commit 순서는 위험하다.

```text
T1: Cache Delete
T2: Cache Miss → DB의 이전 값 Read → Cache에 이전 값 Fill
T1: DB Commit
결과: 이전 Cache가 다시 남음
```

DB Commit 후 삭제도 완벽한 원자성은 아니다. Commit과 삭제 사이에 Reader가 이전 Cache를 읽을 수 있고, Commit 뒤 Process가 죽으면 삭제가 누락된다. Cache-Aside는 짧은 Stale Window를 허용하고 TTL·이벤트·재처리로 수렴시키는 전략이다.

### 지연 이중 삭제

일부 설계는 DB 갱신 전 Cache를 삭제하고 Commit 후 즉시 또는 짧은 지연 뒤 다시 삭제해 위 경쟁을 줄이려 한다. 그러나 적절한 지연은 Reader Query 시간과 환경에 의존하고, Process Crash와 두 번째 삭제 실패는 남는다. 복잡성 대비 보장을 명확히 분석하고 Outbox·CDC 기반 무효화 같은 더 관찰 가능한 방식을 검토한다.

### Write-Through

애플리케이션이 Cache 계층에 쓰면 Cache 계층이 원본에도 동기적으로 기록한다. 성공 응답 전에 둘을 갱신하므로 읽기 Cache가 최신일 가능성이 높고 쓰기 직후 Hit를 만들 수 있다.

```text
Application → Cache Layer → DB Write
                 │ DB 성공
                 └→ Cache Update → Success
```

DB 성공 후 Cache 갱신 실패 같은 부분 실패는 여전히 있다. 둘이 단일 분산 Transaction으로 묶이지 않는다면 Retry와 무효화가 필요하다. 모든 쓰기가 Cache를 통과해야 한다는 규약도 운영 Script·Batch까지 강제해야 한다.

### Write-Around

쓰기는 원본 DB에만 하고 Cache는 갱신하지 않는다. 다음 읽기 Miss에서 채운다. 쓰고 곧 읽지 않는 데이터가 Cache를 오염시키는 것을 막지만 이미 Cache가 있으면 삭제·Version 변경으로 Stale을 처리해야 한다.

### Write-Behind / Write-Back

Cache에 먼저 쓰고 사용자에게 성공을 반환한 뒤 원본 DB에 비동기 반영한다. 쓰기 지연과 Batch 효율은 좋지만 Cache 장애나 Queue 유실 시 DB에 반영되지 않은 성공 데이터가 사라질 수 있다.

```text
Client → Cache Write → Success
             │
             └─ Queue → Async DB Flush
```

Cache를 이 구간의 원본으로 취급하고 Durable Log, 순서, 중복 제거, Retry, Dead Letter와 복구를 갖춰야 한다. 단순 Redis Cache에 쓰고 언젠가 DB로 옮기는 구현은 재화·결제에 위험하다. 허용 가능한 손실이 있는 통계 집계나 재생 가능한 이벤트에서 제한적으로 사용한다.

### Read-Through와 Refresh-Ahead

Read-Through에서는 Cache Library·Proxy가 Miss 시 원본 Loader를 호출해 애플리케이션에서 로딩 로직을 숨긴다. Cache-Aside와 책임 위치가 다르다. Loader 실패, Negative Cache와 Key별 동시 로딩 동작을 확인한다.

Refresh-Ahead는 TTL이 끝나기 전에 인기 Key를 비동기 갱신한다. 요청 지연과 Stampede를 줄일 수 있지만 사용되지 않을 데이터까지 갱신하고 원본 부하를 지속시킬 수 있다. Hot Key와 갱신 예산을 제한한다.

### TTL과 신선도

TTL은 Cache 항목이 원본과 달라질 수 있는 최대 시간을 제한하는 안전망이다. 짧으면 신선하지만 Miss와 DB 부하가 늘고, 길면 Hit는 높지만 오래된 값이 지속된다. 데이터의 변경 빈도와 허용 Staleness에서 정한다.

모든 Key에 같은 TTL을 주지 않는다. 정적 아이템 설명은 길게, 자주 바뀌는 접속 상태는 짧게 둘 수 있다. TTL에 Jitter를 넣어 같은 배치에서 생성된 Key가 한꺼번에 만료되는 것을 줄인다.

TTL은 삭제 이벤트 누락의 회복 상한일 수 있지만 정확한 즉시 무효화를 제공하지 않는다. 또한 Cache 구현의 만료 시각·Eviction과 Clock 특성을 확인한다.

### Cache Stampede

인기 Key 하나가 만료되어 수천 요청이 동시에 DB를 조회하는 현상이다.

```text
Hot Key 만료
   ├─ Request 1 ─ DB Query
   ├─ Request 2 ─ DB Query
   ├─ Request 3 ─ DB Query
   └─ ... 수천 개
```

완화 방법은 다음과 같다.

- Single Flight·Request Coalescing: 한 인스턴스에서 동일 Key 로딩 하나만 실행하고 결과를 공유한다.
- 분산 Lock: 한 프로세스만 재계산하고 나머지는 짧게 기다리거나 Stale 값을 사용한다.
- Soft TTL: 논리 만료 후 한 요청이 비동기 갱신하는 동안 잠시 Stale 값을 제공한다.
- Refresh-Ahead: 만료 전에 인기 Key를 갱신한다.
- TTL Jitter: 여러 Key의 동시 만료를 분산한다.

분산 Lock이 만료되거나 로더가 실패했을 때 모든 대기 요청이 동시에 다시 시도하지 않도록 Backoff와 실패 Cache를 둔다.

### Cache Avalanche

많은 Key가 동시에 만료되거나 Cache Cluster 전체가 장애 나 DB로 부하가 쏟아지는 현상이다. Stampede가 하나의 Hot Key 중심이라면 Avalanche는 넓은 Key 집합·인프라 장애 중심으로 구분할 수 있다.

TTL 분산, Cache Cluster 다중화, 요청 Rate Limit, Circuit Breaker, DB Connection·Query 동시성 상한과 Graceful Degradation으로 원본을 보호한다. Cache가 내려가면 무조건 모든 요청을 DB로 우회하는 Fallback은 DB까지 무너뜨릴 수 있다.

### Cache Penetration

존재하지 않는 ID 요청은 Cache에 값이 없어 매번 DB까지 통과한다. 공격이나 잘못된 Client가 무작위 ID를 반복하면 원본 부하가 된다.

짧은 TTL의 Negative Cache로 “없음” 결과를 저장하거나 입력 범위를 검증한다. 대규모 존재 집합에는 Bloom Filter를 앞에 둘 수 있지만 False Positive가 있고 삭제·갱신 관리가 필요하다. “없음”을 너무 오래 Cache하면 방금 생성된 객체가 보이지 않을 수 있다.

### Cache Pollution

한 번만 읽는 대량 Scan이 자주 쓰는 Hot Data를 Cache에서 밀어낼 수 있다. 관리 Batch는 Cache를 우회하거나 별도 Namespace·인스턴스를 사용하고, 항목 크기와 Admission 정책을 고려한다. Hit Ratio가 높아도 큰 값 몇 개가 Memory와 Network를 차지할 수 있어 Byte Hit Ratio도 본다.

### 무효화 이벤트

DB 변경 후 이벤트를 발행해 여러 Cache Layer를 삭제할 수 있다. 하지만 DB Commit 성공과 이벤트 발행 사이 Crash가 문제다. Transactional Outbox나 CDC(Change Data Capture)로 Commit된 변경에서 이벤트를 재처리 가능하게 만든다.

```text
DB Transaction: Update Profile + Insert Outbox Event
                         │ Commit
                         v
Outbox Publisher → Cache Invalidation Consumer → Delete Key
```

이벤트는 중복·순서 변경될 수 있다. 삭제는 대체로 멱등하지만 “이벤트 값으로 Cache 업데이트”한다면 Version을 포함해 오래된 이벤트가 최신 값을 덮지 못하게 한다.

### Versioned Key

변경마다 Version을 Key에 포함할 수 있다.

```text
profile:101:version → 8
profile:101:v8      → payload
```

새 Version 포인터를 읽으면 이전 Cache와 충돌하지 않는다. 오래된 Version Key 정리와 포인터 자체의 일관성, 요청당 추가 조회 비용이 있다. 콘텐츠 배포처럼 Immutable Version을 전환하는 상황에 특히 유용하다.

### 다단계 Cache

```text
Request → L1 In-process Cache → L2 Redis → DB
```

L1은 Network 왕복 없이 빠르지만 인스턴스마다 별도 복사본이라 무효화가 더 어렵다. L2 Redis 삭제만으로 각 프로세스 L1이 즉시 사라지지 않는다. 짧은 L1 TTL, Pub/Sub 무효화와 Version을 조합한다. 각 단계의 Stale 시간이 합쳐질 수 있음을 고려한다.

### Read-Your-Writes

사용자가 프로필을 수정한 직후 Cache나 Replica에서 이전 값을 읽으면 실패처럼 느낀다. 쓰기 성공 응답에 새 데이터를 포함하고 일정 시간 Primary·DB에서 읽거나, Session에 Version을 기록해 Cache Version이 따라올 때까지 우회할 수 있다. 전체 사용자에게 강한 일관성을 주지 않고 작성자에게만 읽기 일관성을 강화하는 방법이다.

## 4. 쉬운 예시
Cache 전략과 정합성에서는 두 서버가 동시에 마지막 아이템을 지급하려 할 때 애플리케이션의 사전 조회만으로는 부족하다. DB 조건부 갱신과 제약을 최종 방어선으로 두고 요청 ID로 재시도를 식별한다.

캐시는 식당이 자주 주문되는 반찬을 미리 준비하는 것과 비슷하다. 주문마다 새로 만들지 않아 빠르지만 레시피가 바뀌면 기존 반찬을 폐기해야 한다. 비유의 실제 기술 동작은 DB가 원본이고 Cache Key 삭제나 Version 변경으로 다음 조회가 새 값을 로딩한다는 것이다.

재화 잔액은 Cache Hit로 화면에 빠르게 보여 줄 수 있어도 구매 승인 판단은 원본 DB의 조건부 UPDATE를 사용한다. 화면의 잔액이 잠시 오래될 수 있다는 UX와 구매 결과의 정확성을 분리한다.

## 5. 비슷한 개념과 비교
| 방식 | 장점 | 비용 |
|---|---|---|
| 직렬화·Lock | 강한 정합성 | 대기·Deadlock |
| Version·MVCC | 읽기 동시성 | 충돌 재시도·버전 관리 |
| Cache·Replica | 낮은 지연·확장 | Stale Data·무효화 |

| 전략 | Read 경로 | Write 경로 | 핵심 위험 |
|---|---|---|---|
| Cache-Aside | App이 Miss 시 DB Load | DB Commit 후 Cache 삭제 | Stale Window·Stampede |
| Read-Through | Cache Layer가 Load | 별도 전략 필요 | Loader 의존성 |
| Write-Through | Cache에서 읽음 | Cache와 원본 동기 갱신 | 이중 쓰기 실패·지연 |
| Write-Around | Miss 시 DB Load | DB만 쓰고 Cache 무효화 | 쓰기 직후 Miss |
| Write-Behind | Cache에서 읽음 | Cache 성공 후 비동기 DB | 손실·순서·복구 복잡성 |

Cache와 Replica도 다르다. Cache는 선택된 데이터를 다른 형식과 TTL로 보관하고 Miss 시 원본을 읽는다. DB Replica는 로그를 재생해 DB 전체 또는 일부의 저장 구조를 복제하며 Query와 Transaction 기능을 제공할 수 있다. 둘 다 Stale Read가 가능하지만 원인과 운영 방식이 다르다.

## 6. 장점과 단점
Cache 전략과 정합성에서는 동시성 제어와 분산 구조는 정확성, 처리량, 가용성을 높인다. 반면 Lock 대기, 복제 지연, 중복 처리, 운영 복잡도가 생긴다. 모든 데이터에 같은 강도의 정합성을 적용하지 않는다.

캐시는 지연과 원본 부하를 줄이고 트래픽 Burst를 흡수한다. 단점은 추가 복사본, 무효화 경쟁, Memory·Network 비용과 Cache 장애가 원본 장애로 번지는 위험이다. Cache가 없는 상태에서도 핵심 서비스가 제한된 처리량으로 버틸 수 있도록 원본 용량과 Admission Control을 계획한다.

## 7. 게임 서버·백엔드 실무 예시
프로필은 DB 갱신 후 캐시 삭제를 사용하고 짧은 TTL과 이벤트 무효화를 조합한다. 인기 랭킹 키에는 요청 합치기, 분산 Lock, TTL jitter로 Stampede를 줄인다.

Cache 전략과 정합성에서는 운영에서는 Cache Hit Ratio만 보지 않고 DB 부하, Lag, Lock 대기, Retry, Hot Key·Shard와 p99를 함께 본다.

### 플레이어 프로필

`profile:{player_id}`를 Cache-Aside로 읽고 DB 수정 Transaction Commit 후 삭제한다. Outbox 이벤트로 삭제를 재시도하고 TTL을 최종 수렴 안전망으로 둔다. 닉네임 변경 응답에는 새 값을 직접 반환해 작성자가 바로 오래된 Cache를 다시 읽지 않게 한다.

### 게임 설정

버전이 붙은 Immutable 설정 Blob을 캐시하고 `active_config_version` 포인터만 전환한다. 이전 서버가 이전 Version을 읽어도 호환 기간 동안 유효하게 유지하고 점진적으로 제거한다. 전체 Key 삭제보다 배포 Rollback과 디버깅이 쉽다.

### 랭킹

DB 집계 결과를 30초 Soft TTL로 저장하고 한 Worker가 갱신하는 동안 다른 요청은 이전 랭킹을 반환할 수 있다. 랭킹은 약간 오래되어도 되지만 시즌 보상 확정은 특정 Snapshot을 DB에 저장해 재현 가능하게 한다.

### 운영 지표

Hit·Miss와 Byte Hit Ratio, Key별 p95·p99, Cache Timeout·Error, Eviction·Memory·Network, Hot Key, Load 동시 수와 Single Flight 대기, Negative Hit, DB Fallback QPS, 무효화 이벤트 Lag·실패와 Stale 탐지 결과를 본다.

높은 Hit Ratio만으로 성공을 판단하지 않는다. 99% Hit여도 1% Miss가 DB 용량을 넘거나, 오래된 Cache가 업무 오류를 만들 수 있다. Cache 장애 훈련에서 Fallback Rate Limit과 핵심·비핵심 기능의 강등이 동작하는지 검증한다.

## 8. 자주 하는 오해
- MVCC면 쓰기 충돌이 없다고 본다.
- Redis 명령 원자성이 전체 로직 원자성을 뜻한다고 본다.
- TTL만 있으면 캐시 정합성이 해결된다고 본다.
- Replica가 Primary와 항상 같은 값을 반환한다고 본다.
- Sharding이 JOIN과 Transaction을 자동 분산한다고 본다.
- DB 갱신 후 Cache 값을 덮어쓰면 항상 정합적이라고 본다.
- Cache 삭제와 DB Commit이 자동으로 하나의 Transaction이라고 생각한다.
- Hit Ratio만 높으면 Cache 설계가 성공했다고 본다.
- Cache 장애 시 모든 요청을 DB로 보내면 가용성이 높아진다고 생각한다.
- Negative Cache는 항상 길게 유지할수록 좋다고 본다.

## 9. 면접 질문
### Q1. 핵심 개념을 설명해 주세요.
캐시는 느린 원본 앞에 자주 쓰는 데이터를 두어 지연과 부하를 줄이며 정합성 전략은 원본과 캐시의 갱신 순서와 실패 처리를 정한다.
### Q2. 어떤 Trade-off가 있나요?
Cache Aside는 단순하지만 Miss와 오래된 값 창이 있다. Write Through는 캐시와 원본을 함께 갱신하고 Write Back은 지연 쓰기로 빠르지만 손실·복구가 복잡하다.
### Q3. 게임 백엔드 적용 사례는 무엇인가요?
프로필은 DB 갱신 후 캐시 삭제를 사용하고 짧은 TTL과 이벤트 무효화를 조합한다. 인기 랭킹 키에는 요청 합치기, 분산 Lock, TTL jitter로 Stampede를 줄인다.
### Q4. 장애 시 무엇을 확인하나요?
Cache 전략과 정합성에서는 원본 상태, Lock과 Retry, Cache·Replica 지연, 중복 요청과 복구 절차를 확인한다.

### Q5. Cache-Aside를 설명해 주세요.

읽기는 Cache를 먼저 확인하고 Miss면 DB에서 읽어 Cache를 채운다. 쓰기는 DB를 원본으로 Commit한 뒤 Cache를 삭제한다. 구조는 단순하지만 Commit·삭제 사이 Stale Window와 삭제 실패, Miss Stampede를 TTL·이벤트와 요청 합치기로 보완한다.

### Q6. Cache Stampede는 무엇이며 어떻게 막나요?

인기 Key가 만료될 때 많은 요청이 동시에 원본을 조회하는 현상이다. Single Flight, 분산 Lock, Soft TTL·Stale 제공, Refresh-Ahead와 TTL Jitter로 같은 계산·DB 조회를 합친다.

### Q7. Write-Through와 Write-Behind를 비교해 주세요.

Write-Through는 성공 전에 Cache와 원본을 동기 갱신해 내구성과 읽기 신선도를 높이지만 쓰기 지연과 이중 쓰기 실패가 있다. Write-Behind는 Cache 성공 후 비동기 원본 반영이라 빠르지만 Queue·Cache 장애의 손실과 순서·복구가 복잡하다.

## 10. 예상 꼬리질문
- 실패 후 재시도를 어떻게 안전하게 하나요?
- 오래된 읽기를 허용할 수 없는 데이터는 무엇인가요?
- Hot Key나 Hot Shard를 어떻게 찾나요?
- Failover 중 쓰기 결과를 어떻게 판단하나요?
- 분산 상태의 원본은 무엇인가요?
- Cache Penetration과 Avalanche는 무엇인가요?
- Delayed Double Delete의 한계는 무엇인가요?

## 11. 30초 모범답변
> 캐시는 성능을 위해 정합성을 일부 지연시키는 복제본입니다. 원본, 갱신 순서, TTL, 무효화 실패와 Stampede 대응을 함께 설계해야 합니다. 프로필은 DB 갱신 후 캐시 삭제를 사용하고 짧은 TTL과 이벤트 무효화를 조합한다.

## 12. 1~2분 확장답변
> 캐시는 성능을 위해 정합성을 일부 지연시키는 복제본입니다. 원본, 갱신 순서, TTL, 무효화 실패와 Stampede 대응을 함께 설계해야 합니다. 먼저 데이터별 정합성과 지연 요구를 분류합니다. 강한 불변식은 DB Constraint와 짧은 Transaction으로 지키고, Cache와 Replica는 허용 가능한 Stale 범위에서 사용합니다. 장애와 Timeout은 중복될 수 있으므로 멱등성 키, 제한된 Retry와 관찰 지표를 함께 둡니다.

## 13. 핵심 요약
- 캐시는 느린 원본 앞에 자주 쓰는 데이터를 두어 지연과 부하를 줄이며 정합성 전략은 원본과 캐시의 갱신 순서와 실패 처리를 정한다.
- 원본과 성공 기준을 명확히 한다.
- 성능 구조는 새로운 정합성 비용을 만든다.
- Timeout과 Retry에는 멱등성이 필요하다.
- 평균보다 Lag, Lock과 p99를 관찰한다.
- Cache 전략은 원본, 허용 Staleness, 무효화 실패와 DB 보호 정책까지 포함한다.
- Stampede·Penetration·Avalanche는 요청 합치기·Jitter·Negative Cache·Admission Control로 구분 대응한다.

## 한 줄 정리
> 캐시는 성능을 위해 정합성을 일부 지연시키는 복제본입니다. 원본, 갱신 순서, TTL, 무효화 실패와 Stampede 대응을 함께 설계해야 합니다.
