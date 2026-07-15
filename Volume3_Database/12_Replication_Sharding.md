---
difficulty: 4
reading_time: 25분
interview_frequency: 5
importance: 5
---

# 12. Replication과 Sharding

> 게임 서버·백엔드 개발자를 위한 CS 면접 교재

## 학습 목표

- 정의와 등장 이유를 설명할 수 있다.
- 정합성·성능 Trade-off를 설명할 수 있다.
- 게임 백엔드 장애와 확장에 적용할 수 있다.

## 1. 개요

복제는 같은 데이터를 여러 노드에 복사하고 샤딩은 데이터를 키 범위나 해시로 여러 노드에 분할한다.

복제(Replication)는 Primary의 변경을 하나 이상의 Replica에 전달해 같은 논리 데이터의 사본을 유지한다. 읽기 부하를 분산하고 Primary 장애 시 Replica를 승격해 복구 시간을 줄일 수 있다. 샤딩(Sharding)은 전체 데이터를 Shard Key 규칙으로 나눠 각 노드가 일부만 저장·처리하게 한다. 단일 노드의 저장 용량과 쓰기 처리량 한계를 넘기 위한 수평 분할이다.

복제와 샤딩은 서로 대체하지 않는다. 각 Shard를 다시 Primary·Replica로 복제할 수 있다. 이 경우 데이터 배치와 사본 수가 동시에 늘어 Routing, Failover와 정합성 운영이 더 복잡해진다.

## 2. 왜 필요한가
복제는 읽기 확장과 가용성을, 샤딩은 단일 노드의 저장·쓰기 한계를 넘기 위해 필요하다. 분산된 사본과 동시 변경이 늘수록 실패 경로를 정상 흐름처럼 설계해야 한다.

읽기 트래픽이 쓰기보다 훨씬 크면 Primary 하나에 모든 조회를 보내지 않고 Replica로 분산할 수 있다. 분석·백업을 Replica에서 수행해 Primary 영향을 줄일 수도 있다. 그러나 Replica가 적용하지 못한 최신 변경을 읽으면 사용자에게 이전 상태를 보여 줄 수 있다.

데이터와 쓰기량이 한 DB 서버의 CPU, Memory, Storage·IOPS 한계를 넘으면 Replica를 늘려도 모든 쓰기가 여전히 Primary에 모인다. Sharding은 플레이어별 쓰기를 여러 Primary로 분산한다. 대신 한 트랜잭션·JOIN으로 처리하던 관계가 Shard를 넘으면 분산 조정과 부분 실패를 다뤄야 한다.

## 3. 핵심 동작 원리
```text
primary write→log→replicas / shard key→router→shard A,B,C
```
비동기 복제는 Replica Lag과 장애 전환 시 손실 가능성이 있다. 샤딩은 Cross-shard JOIN·Transaction, Rebalancing과 Hot Shard를 복잡하게 한다.

Replication과 Sharding에서는 성능 최적화는 새 상태와 실패 가능성을 추가한다. 원본이 무엇인지, 성공 응답의 기준과 재처리 방법을 먼저 정한다.

## 3.1 Replication

### 변경 전달

```text
Client Write
    ↓
Primary Transaction Commit
    ↓ 변경 Log Stream
Replica A → Log 수신 → 적용 → Read 제공
Replica B → Log 수신 → 적용 → Read 제공
```

Primary가 WAL·Binlog 성격의 변경 로그를 보내고 Replica가 순서대로 적용한다. 물리 복제는 저장 페이지·로그 수준, 논리 복제는 Row 변경·논리 이벤트 수준으로 설명할 수 있다. 제품마다 DDL, Sequence, Large Object와 Filter 지원이 다르다.

Replica가 로그를 받은 시점과 Query에 보이도록 적용한 시점은 다를 수 있다. Network 수신 Lag, 적용 Queue와 긴 Transaction 때문에 지연된다. Lag를 시간 하나로만 측정하지 않고 수신 위치와 재생 위치, Byte·Transaction 차이를 함께 본다.

### 동기·비동기 복제

비동기 복제는 Primary가 Replica 적용을 기다리지 않고 Commit 성공을 반환한다. 쓰기 지연과 가용성은 좋지만 Replica가 받기 전 Primary가 영구 장애 나면 최근 Commit이 유실될 수 있다.

동기 또는 준동기 복제는 하나 이상의 Replica가 로그를 받거나 Durable하게 기록했다는 확인을 성공 조건에 포함할 수 있다. 손실 가능성을 줄이지만 느린 Replica와 Network 문제가 Commit 지연·가용성에 영향을 준다. “동기”가 Replica Query 적용 완료까지 보장하는지, 메모리 수신인지 Durable 기록인지 제품 설정을 확인한다.

```text
Async : Primary Commit → Client Success → Replica Ack는 나중
Sync  : Primary Commit → Replica 조건 충족 → Client Success
```

### Replica Read와 Staleness

사용자가 프로필을 변경한 직후 Replica를 읽으면 이전 값을 볼 수 있다. Read-Your-Writes를 제공하는 방법은 다음과 같다.

- 쓰기 후 일정 시간 또는 Session 동안 Primary에서 읽는다.
- Commit Log 위치·Token을 Client 문맥에 저장하고 Replica가 그 위치까지 적용한 뒤 읽는다.
- 쓰기 응답에 새 상태를 포함하고 UI가 바로 재조회하지 않게 한다.
- Stale 허용 데이터만 Replica로 Route한다.

시간 기반 Primary 고정은 단순하지만 Lag가 고정 시간보다 길 수 있고 Primary 부하를 늘린다. Log 위치 기반은 정확하지만 Routing과 DB 지원이 복잡하다.

Replica에서 두 번 읽어도 더 최신 Replica에서 더 오래된 Replica로 Route되면 시간이 거꾸로 간 것처럼 보일 수 있다. Session을 같은 Replica에 고정하거나 적용 위치가 충분한 Replica를 선택해 Monotonic Read 요구를 제공할 수 있다.

### Failover

Primary 장애를 감지하면 가장 최신의 적합한 Replica를 새 Primary로 승격하고 Client Routing을 바꾼다.

```text
Old Primary X
Replica A (log position 100) → New Primary
Replica B (log position 98)  → A를 따라 Catch-up
Clients → 새 Endpoint
```

장애 감지는 Network 분할과 느린 서버를 구분하기 어렵다. 이전 Primary가 실제로 살아 있는데 격리되지 않은 채 쓰기를 받으면 Split-brain과 상충 데이터가 생길 수 있다. Fencing, Lease·Consensus 기반 관리와 단일 쓰기 Endpoint가 필요하다.

비동기 Replica가 승격되면 이전 Primary가 성공 응답한 최근 쓰기가 없을 수 있다. Client Timeout과 Failover 중 Commit 결과도 불확실하다. 요청 ID와 멱등성, 거래 원장으로 재처리한다.

Failover는 단순 승격 시간만이 아니다. 장애 감지, 승격, DNS·Proxy·Connection Pool 갱신, Application Retry와 Replica 재구성까지의 RTO를 측정한다. 데이터 손실 허용 범위는 RPO로 정의한다.

### Replica의 다른 용도와 위험

긴 분석 Query와 Backup을 Replica로 옮겨 Primary 부하를 줄일 수 있다. 하지만 Replica CPU·I/O가 포화되면 Log 적용이 느려져 Lag가 커진다. 오래된 Snapshot Query가 Version 정리와 Replay를 방해할 수도 있다.

Replica는 무한 확장 도구가 아니다. Primary가 모든 Replica에 Log를 전송하는 Network 비용이 있고 Replica별 Connection·Cache Warm-up이 필요하다. Cascade Replication은 Primary Fan-out을 줄이지만 하위 Replica Lag과 Failover 경로가 길어진다.

## 3.2 Sharding

### Shard Routing

```text
Request(player_id=101)
        ↓
Shard Router: shard_for(101)
        ↓
Shard 2 Primary → Replica 2A, 2B
```

애플리케이션 라이브러리, Proxy 또는 DB 시스템이 Shard Map을 보고 대상 노드를 선택한다. Shard Key가 Query에 없으면 모든 Shard에 요청하는 Scatter-Gather가 필요할 수 있다.

Routing 정보도 Version과 장애 복구가 필요하다. Rebalancing 중 Old·New 위치가 함께 존재할 수 있어 요청이 오래된 Map을 사용했을 때 Redirect·재시도하는 규칙을 둔다.

### Range Sharding

Player ID 1~100만은 Shard A, 다음 범위는 B처럼 연속 Key 범위를 배치한다. 범위 Query와 순차 Migration이 쉽고 Routing이 직관적이다. 새 ID가 계속 가장 높은 범위에 들어오면 최신 Shard 하나에 쓰기가 몰릴 수 있고 특정 인기 범위가 Hot해질 수 있다.

### Hash Sharding

`hash(player_id) mod N` 같은 방식은 Key를 비교적 균등하게 분산한다. 그러나 N이 바뀌면 대부분 Key의 위치가 달라지는 단순 Modulo 방식은 확장 비용이 크다. Consistent Hashing이나 고정된 많은 Virtual Bucket을 물리 Shard에 매핑해 일부 Bucket만 이동할 수 있다.

Hash는 범위 연속성을 잃는다. Player ID 범위 스캔은 여러 Shard를 조회해야 한다. 균등한 Key 수가 균등 부하를 보장하지도 않는다. 유명 길드·Player 한 Key의 요청량과 Row 크기가 크면 Hot Shard가 된다.

### Directory Sharding

별도 Directory가 `player_id → shard_id` 매핑을 저장한다. 특정 Player·Tenant를 개별 이동하고 부하를 세밀하게 조절할 수 있다. Directory 자체의 가용성, Cache 정합성, 조회 비용과 Migration 중 Version 관리가 필요하다.

### Shard Key 선택

좋은 Shard Key는 높은 Cardinality와 고른 데이터·요청 분포를 가지며 주요 Query와 Transaction이 한 Shard에 모이게 한다. 값이 안정적이고 Routing 시 쉽게 알 수 있어야 한다.

Player 중심 게임에서는 `player_id`가 인벤토리·재화·퀘스트를 한 Shard에 두기 좋다. 길드 거래와 글로벌 랭킹은 여러 Player Shard를 넘는다. 모든 도메인을 한 Key로 완벽히 Local하게 만들 수 없으므로 Cross-shard 요구를 별도 서비스·집계 모델로 분리한다.

`region_id`만 Shard Key로 쓰면 지역별 사용자 수 차이로 불균형할 수 있다. `(region_id, hash(player_id))`로 지역 내 여러 Shard를 두면 균형은 좋아지지만 지역 전체 집계가 여러 Shard를 돈다.

### Global ID

각 Shard의 Auto-increment ID가 겹치면 외부 이벤트와 다른 Shard에서 행을 고유하게 식별하기 어렵다. Shard ID를 포함한 ID, UUID 또는 시간·노드 성격 ID 생성기를 사용할 수 있다. 충돌, 정렬성, 시계 역행, 정보 노출과 Index 크기를 비교한다.

ID 생성 서비스가 단일 장애점이 되지 않도록 범위 할당과 다중화를 고려한다. 전역 유일 ID가 있어도 업무상 UNIQUE 제약을 모든 Shard에 자동 적용하지는 못한다.

### Cross-shard Query

글로벌 랭킹 Top 100은 각 Shard의 Top 100 후보를 가져와 Merge할 수 있다.

```text
Shard A Top 100 ─┐
Shard B Top 100 ─┼─ Aggregator → Global Top 100
Shard C Top 100 ─┘
```

Shard 수만큼 Network 왕복이 늘고 가장 느린 Shard가 전체 지연을 결정한다. Partial Failure 시 일부 결과를 반환할지 실패할지 정한다. 자주 읽는 글로벌 뷰는 이벤트 파이프라인으로 별도 랭킹 저장소에 미리 집계할 수 있다.

Pagination의 글로벌 OFFSET은 각 Shard에서 많은 후보를 읽어야 한다. Shard별 Cursor와 Merge 순서를 포함한 복합 Cursor를 설계하거나 검색 전용 시스템을 사용한다.

### Cross-shard Transaction

서로 다른 Shard의 플레이어가 재화를 교환하면 두 DB Transaction을 하나로 묶기 어렵다. 2PC 같은 분산 트랜잭션은 Coordinator와 Prepare 상태, 장애 복구와 가용성 비용이 있다. 지원되지 않거나 운영 복잡도가 큰 경우 Saga·Escrow·이벤트 기반 상태 머신을 사용한다.

```text
Trade State: REQUESTED
  → A Shard 자산 Reserve
  → B Shard 자산 Reserve
  → 양쪽 Commit / 실패 시 Release 보상
```

보상은 과거를 지우는 Rollback과 다르다. 각 단계가 멱등해야 하고 중간 상태가 사용자에게 어떻게 보이는지, 영구 실패를 누가 복구하는지 정한다. 가능하면 함께 거래하는 데이터를 같은 Shard에 배치해 분산 트랜잭션 빈도를 줄인다.

### Global Uniqueness

닉네임 UNIQUE를 각 Shard에만 두면 서로 다른 Shard에서 같은 닉네임이 생성될 수 있다. 전역 Registry 서비스·테이블에 닉네임을 먼저 예약하거나 닉네임을 Shard Key로 Routing하는 별도 인덱스를 둔다. Registry 예약과 Player 생성 사이 실패를 상태 머신과 만료·복구로 처리한다.

### Resharding

Shard를 추가하거나 Hot Tenant를 옮길 때 데이터 이동과 요청 Routing을 동시에 다뤄야 한다.

1. 대상 Shard에 Snapshot 복사
2. 복사 중 변경 Log·CDC 적용
3. Old와 New 차이를 따라잡음
4. 짧은 쓰기 정지 또는 Dual Write·Forwarding으로 Cutover
5. Routing Map Version 변경
6. 검증 후 Old 데이터 제거

Dual Write는 한쪽만 성공하는 부분 실패와 순서 역전을 만든다. CDC 기반 복제와 단일 쓰기 원본, Version 비교를 선호한다. Row 수·Checksum·업무 집계로 Migration 결과를 검증하고 Rollback 경로를 둔다.

### Hot Shard

Hot Shard는 데이터 Byte, QPS, 특정 Query CPU, Lock·Storage I/O 중 하나가 집중될 수 있다. Shard 평균만 보면 특정 Node의 p99를 놓친다. Shard Key별 Heavy Hitter, Tenant 크기와 시간대 분포를 관찰한다.

큰 Tenant를 전용 Shard로 이동하거나 Key에 Bucket을 추가하고, 읽기 Replica·Cache와 비동기 집계를 사용한다. Bucket을 늘리면 Transaction과 Query가 여러 Bucket을 넘을 수 있으므로 부하와 Locality 사이를 비교한다.

## 4. 쉬운 예시
Replication과 Sharding에서는 두 서버가 동시에 마지막 아이템을 지급하려 할 때 애플리케이션의 사전 조회만으로는 부족하다. DB 조건부 갱신과 제약을 최종 방어선으로 두고 요청 ID로 재시도를 식별한다.

도서관 책 한 권을 여러 지점에 복사해 두는 것은 복제와 비슷하다. 가까운 지점에서 읽을 수 있지만 새 개정판이 모든 지점에 도착하기 전에는 이전 내용을 볼 수 있다. 책 종류를 지점별로 나눠 보관하는 것은 샤딩과 비슷하다. 한 지점 용량은 줄지만 여러 분야를 함께 찾으려면 여러 지점을 방문해야 한다.

실제 기술에서는 Replica가 Log를 순서대로 적용하고 Shard Router가 Key로 대상 DB를 고른다. 복제 지연과 Network 분할, Cross-shard 부분 실패를 명시적으로 처리한다는 점이 비유보다 중요하다.

## 5. 비슷한 개념과 비교
| 방식 | 장점 | 비용 |
|---|---|---|
| 직렬화·Lock | 강한 정합성 | 대기·Deadlock |
| Version·MVCC | 읽기 동시성 | 충돌 재시도·버전 관리 |
| Cache·Replica | 낮은 지연·확장 | Stale Data·무효화 |

| 구분 | Replication | Sharding |
|---|---|---|
| 데이터 배치 | 같은 데이터 사본 | 서로 다른 데이터 부분 |
| 주 목적 | 읽기 확장·가용성·복구 | 저장·쓰기 수평 확장 |
| 쓰기 | Primary에 집중 가능 | 여러 Shard Primary로 분산 |
| 핵심 위험 | Lag·Failover 손실·Split-brain | Key 선택·Hot Shard·Cross-shard 연산 |

Partitioning과 Sharding 용어도 문맥에 따라 겹친다. 한 DB 인스턴스 안에서 테이블을 Partition으로 나누는 기능과 여러 독립 DB 노드에 분산하는 Sharding을 구분하면 된다. 내부 Partition은 관리·Pruning에 도움을 주지만 단일 노드 자원 한계를 그대로 가질 수 있다.

## 6. 장점과 단점
Replication과 Sharding에서는 동시성 제어와 분산 구조는 정확성, 처리량, 가용성을 높인다. 반면 Lock 대기, 복제 지연, 중복 처리, 운영 복잡도가 생긴다. 모든 데이터에 같은 강도의 정합성을 적용하지 않는다.

복제는 읽기 처리량과 장애 복구 선택지를 늘리지만 저장 비용, Lag와 Failover 중 불확실성을 만든다. 샤딩은 데이터·쓰기 부하를 수평 분산하지만 Routing, 전역 제약, JOIN·Transaction, Backup·Schema 변경과 Rebalancing을 모든 Shard에서 조정해야 한다.

단일 DB에서 Index·Query·Archiving·수직 확장과 Replica로 충분하다면 Sharding을 서두르지 않는다. Sharding은 성능 최적화가 아니라 데이터 모델과 운영 절차 전체를 바꾸는 결정이다.

## 7. 게임 서버·백엔드 실무 예시
계정 ID를 Shard Key로 사용하면 플레이어 데이터가 모이지만 길드·랭킹은 여러 Shard를 넘을 수 있다. 글로벌 ID와 집계 파이프라인을 별도로 설계한다.

Replication과 Sharding에서는 운영에서는 Cache Hit Ratio만 보지 않고 DB 부하, Lag, Lock 대기, Retry, Hot Key·Shard와 p99를 함께 본다.

### 읽기 분류

- 결제·재화 변경 직후 검증: Primary 읽기 또는 같은 Transaction 결과 사용
- 프로필·친구 목록: 짧은 Lag 허용 여부에 따라 Replica
- 운영 분석·통계: 전용 Replica·Warehouse
- 시즌 보상 확정: 특정 Snapshot과 재현 가능한 원본

Endpoint 이름만 Read/Write로 나누지 않고 각 Query의 Staleness 허용 범위를 코드와 문서에 표시한다.

### Player Shard

Player Aggregate를 `player_id`로 배치하면 재화, 인벤토리와 퀘스트 Transaction이 Local하다. 친구 관계는 두 Player를 연결하므로 Edge를 양쪽에 복제하거나 별도 Social Service에 둔다. 중복 Edge 갱신은 이벤트와 Repair Job으로 수렴시키고 차단·권한 같은 강한 규칙의 원본을 정한다.

### 배포와 Backup

Schema Migration을 모든 Shard에 순차 적용할 때 일부만 새 Schema가 될 수 있다. 애플리케이션은 구·신 Schema를 함께 처리하는 Expand-Contract 배포를 사용하고 Shard별 Version과 실패를 추적한다.

Backup은 각 Shard의 시점이 다르면 Cross-shard 거래 상태가 맞지 않을 수 있다. 복구 목표에 따라 Log 위치·Timestamp를 맞추고 Saga·Outbox를 재생한다. 복제본은 사용자 실수나 논리 삭제도 그대로 복제하므로 Backup을 대체하지 않는다.

### 운영 지표

Replica별 수신·적용 Lag, Replay 위치, Read p99·오류, Primary·Replica CPU·I/O, Failover 횟수·시간·유실 추정, Shard별 Row·Byte·QPS·쓰기·Lock·Storage, Cross-shard Fan-out p99, Routing 실패, Migration 진행률과 무결성 검증을 본다.

전체 평균 대신 가장 느린 Replica와 가장 Hot한 Shard를 본다. 자동 Rebalancing이 동시에 많은 데이터를 이동해 Network·I/O를 포화시키지 않도록 속도 제한과 Traffic Window를 둔다.

## 8. 자주 하는 오해
- MVCC면 쓰기 충돌이 없다고 본다.
- Redis 명령 원자성이 전체 로직 원자성을 뜻한다고 본다.
- TTL만 있으면 캐시 정합성이 해결된다고 본다.
- Replica가 Primary와 항상 같은 값을 반환한다고 본다.
- Sharding이 JOIN과 Transaction을 자동 분산한다고 본다.
- Replica를 늘리면 Primary 쓰기 처리량도 비례한다고 생각한다.
- 동기 Replication이면 Replica Query가 즉시 최신이라고 단정한다.
- Failover는 Endpoint만 바꾸면 끝난다고 본다.
- Key 수가 균등하면 Shard 부하도 균등하다고 생각한다.
- Consistent Hashing이 Hot Key를 자동 해결한다고 본다.
- Replica가 있으므로 Backup은 필요 없다고 생각한다.

## 9. 면접 질문
### Q1. 핵심 개념을 설명해 주세요.
복제는 같은 데이터를 여러 노드에 복사하고 샤딩은 데이터를 키 범위나 해시로 여러 노드에 분할한다.
### Q2. 어떤 Trade-off가 있나요?
비동기 복제는 Replica Lag과 장애 전환 시 손실 가능성이 있다. 샤딩은 Cross-shard JOIN·Transaction, Rebalancing과 Hot Shard를 복잡하게 한다.
### Q3. 게임 백엔드 적용 사례는 무엇인가요?
계정 ID를 Shard Key로 사용하면 플레이어 데이터가 모이지만 길드·랭킹은 여러 Shard를 넘을 수 있다. 글로벌 ID와 집계 파이프라인을 별도로 설계한다.
### Q4. 장애 시 무엇을 확인하나요?
Replication과 Sharding에서는 원본 상태, Lock과 Retry, Cache·Replica 지연, 중복 요청과 복구 절차를 확인한다.

### Q5. 동기 복제와 비동기 복제를 비교해 주세요.

비동기는 Replica 확인 전에 성공해 쓰기 지연과 가용성은 좋지만 Failover 시 최근 Write 손실 가능성이 있다. 동기는 정해진 Replica 기록 조건을 기다려 RPO를 줄이지만 Network·Replica 장애가 Commit 지연과 가용성에 영향을 준다. Ack가 수신·Durable·적용 중 무엇인지 확인한다.

### Q6. Replica에서 Read-Your-Writes를 어떻게 제공하나요?

쓰기 후 일정 기간 Primary에 고정하거나 Commit Log 위치 Token을 전달해 그 위치까지 적용한 Replica만 읽는다. 쓰기 응답의 새 상태를 사용하거나 Stale 허용 Query만 Replica로 보내는 방법도 있다.

### Q7. Shard Key는 어떻게 선택하나요?

데이터와 요청이 고르게 분포하고 주요 Query·Transaction이 한 Shard에 모이며 Routing 시 쉽게 알 수 있는 안정적 Key를 선택한다. Cardinality뿐 아니라 Hot Tenant, 범위 Query와 Cross-shard 관계를 함께 분석한다.

## 10. 예상 꼬리질문
- 실패 후 재시도를 어떻게 안전하게 하나요?
- 오래된 읽기를 허용할 수 없는 데이터는 무엇인가요?
- Hot Key나 Hot Shard를 어떻게 찾나요?
- Failover 중 쓰기 결과를 어떻게 판단하나요?
- 분산 상태의 원본은 무엇인가요?
- RPO와 RTO는 무엇인가요?
- Split-brain을 어떻게 방지하나요?

## 11. 30초 모범답변
> Replication은 같은 데이터 사본으로 읽기와 가용성을 높이고 Sharding은 데이터를 분할해 용량을 확장합니다. Lag, Failover, Shard Key와 Cross-shard 연산 비용이 핵심입니다. 계정 ID를 Shard Key로 사용하면 플레이어 데이터가 모이지만 길드·랭킹은 여러 Shard를 넘을 수 있다.

## 12. 1~2분 확장답변
> Replication은 같은 데이터 사본으로 읽기와 가용성을 높이고 Sharding은 데이터를 분할해 용량을 확장합니다. Lag, Failover, Shard Key와 Cross-shard 연산 비용이 핵심입니다. 먼저 데이터별 정합성과 지연 요구를 분류합니다. 강한 불변식은 DB Constraint와 짧은 Transaction으로 지키고, Cache와 Replica는 허용 가능한 Stale 범위에서 사용합니다. 장애와 Timeout은 중복될 수 있으므로 멱등성 키, 제한된 Retry와 관찰 지표를 함께 둡니다.

## 13. 핵심 요약
- 복제는 같은 데이터를 여러 노드에 복사하고 샤딩은 데이터를 키 범위나 해시로 여러 노드에 분할한다.
- 원본과 성공 기준을 명확히 한다.
- 성능 구조는 새로운 정합성 비용을 만든다.
- Timeout과 Retry에는 멱등성이 필요하다.
- 평균보다 Lag, Lock과 p99를 관찰한다.
- Replication은 사본의 Lag·Failover 보장, Sharding은 배치 Key·Cross-shard 실패를 중심으로 설계한다.
- 확장 구조의 성공 기준은 평균이 아니라 최악 Replica·Hot Shard와 복구 가능성이다.

## 한 줄 정리
> Replication은 같은 데이터 사본으로 읽기와 가용성을 높이고 Sharding은 데이터를 분할해 용량을 확장합니다. Lag, Failover, Shard Key와 Cross-shard 연산 비용이 핵심입니다.
