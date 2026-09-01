---
difficulty: 4
reading_time: 25분
interview_frequency: 5
importance: 5
---

# 12. Replication과 Sharding


## 학습 목표

- 비동기 복제에서 Replica Lag, Failover 시 RPO/RTO, Split-brain을 설명할 수 있다.
- Range/Hash/Directory Sharding의 차이와 Shard Key 선택 기준을 설명할 수 있다.
- Cross-shard Query, Transaction, Global Uniqueness 문제와 Scatter-Gather, Saga 적용을 설명할 수 있다.
- 게임 Player Aggregate를 player_id로 샤딩하고 길드·글로벌 랭킹의 Cross-shard 연산을 처리하는 설계를 할 수 있다.

## 1. 개요

복제는 같은 데이터를 여러 노드에 복사하고 샤딩은 데이터를 키 범위나 해시로 여러 노드에 분할한다.

복제(Replication)는 Primary의 변경을 하나 이상의 Replica에 전달해 같은 논리 데이터의 사본을 유지한다. 읽기 부하를 분산하고 Primary 장애 시 Replica를 승격해 복구 시간을 줄일 수 있다. 샤딩(Sharding)은 전체 데이터를 Shard Key 규칙으로 나눠 각 노드가 일부만 저장·처리하게 한다. 단일 노드의 저장 용량과 쓰기 처리량 한계를 넘기 위한 수평 분할이다.

복제와 샤딩은 서로 대체하지 않는다. 각 Shard를 다시 Primary·Replica로 복제할 수 있고, 이 경우 Routing, Failover와 정합성 운영이 더 복잡해진다.

## 2. 왜 필요한가

읽기 트래픽이 쓰기보다 훨씬 크면 Primary 하나에 모든 조회를 보내지 않고 Replica로 분산할 수 있다. 그러나 Replica가 적용하지 못한 최신 변경을 읽으면 사용자에게 이전 상태를 보여 줄 수 있다.

데이터와 쓰기량이 한 DB 서버의 CPU(Central Processing Unit), Memory, Storage·IOPS 한계를 넘으면 Replica를 늘려도 모든 쓰기가 여전히 Primary에 모인다. Sharding은 플레이어별 쓰기를 여러 Primary로 분산한다. 대신 한 트랜잭션·JOIN으로 처리하던 관계가 Shard를 넘으면 분산 조정과 부분 실패를 다뤄야 한다.

## 3. 핵심 동작 원리

```text
Primary Write → Log Stream → Replica 적용 → Read 제공
Shard Key → Shard Router → Shard A/B/C 각각 처리
```

### 3.1 Replication

#### 변경 전달

```text
Client Write
    ↓
Primary Transaction Commit
    ↓ 변경 Log Stream
Replica A → Log 수신 → 적용 → Read 제공
Replica B → Log 수신 → 적용 → Read 제공
```

Primary가 WAL(Write-Ahead Logging)·Binlog 성격의 변경 로그를 보내고 Replica가 순서대로 적용한다. Replica가 로그를 받은 시점과 Query에 보이도록 적용한 시점은 다를 수 있다. Lag를 시간 하나로만 측정하지 않고 수신 위치와 재생 위치, Byte·Transaction 차이를 함께 본다.

#### 동기·비동기 복제

```text
Async : Primary Commit → Client Success → Replica Ack는 나중
Sync  : Primary Commit → Replica 조건 충족 → Client Success
```

비동기 복제는 쓰기 지연과 가용성은 좋지만 Replica가 받기 전 Primary가 영구 장애 나면 최근 Commit이 유실될 수 있다. 동기 복제는 손실 가능성을 줄이지만 느린 Replica와 Network 문제가 Commit 지연에 영향을 준다. "동기"가 Replica 메모리 수신인지 Durable 기록인지 제품 설정을 확인한다.

#### Replica Read와 Staleness

사용자가 프로필을 변경한 직후 Replica를 읽으면 이전 값을 볼 수 있다. Read-Your-Writes를 제공하는 방법:
- 쓰기 후 일정 시간 동안 Primary에서 읽는다.
- Commit Log 위치 Token을 전달해 그 위치까지 적용한 Replica만 읽는다.
- 쓰기 응답에 새 상태를 포함하고 UI가 바로 재조회하지 않게 한다.
- Stale 허용 데이터만 Replica로 Route한다.

#### Failover

```text
Old Primary X
Replica A (log position 100) → New Primary
Replica B (log position 98)  → A를 따라 Catch-up
Clients → 새 Endpoint
```

장애 감지는 Network 분할과 느린 서버를 구분하기 어렵다. 이전 Primary가 살아 있는데 격리되지 않은 채 쓰기를 받으면 Split-brain과 상충 데이터가 생긴다. Fencing, Lease·Consensus 기반 관리와 단일 쓰기 Endpoint가 필요하다. Failover는 장애 감지 → 승격 → DNS·Proxy·Connection Pool 갱신 → Application Retry까지의 RTO(Recovery Time Objective)를 측정한다. 데이터 손실 허용 범위는 RPO(Recovery Point Objective)로 정의한다.

### 3.2 Sharding

#### Shard Routing

```text
Request(player_id=101)
        ↓
Shard Router: shard_for(101)
        ↓
Shard 2 Primary → Replica 2A, 2B
```

Shard Key가 Query에 없으면 모든 Shard에 요청하는 Scatter-Gather가 필요할 수 있다.

#### Range vs Hash vs Directory Sharding

Range Sharding은 범위 Query와 순차 Migration이 쉽고 Routing이 직관적이다. 새 ID가 계속 가장 높은 범위에 들어오면 최신 Shard 하나에 쓰기가 몰릴 수 있다.

Hash Sharding은 Key를 비교적 균등하게 분산한다. 그러나 범위 연속성을 잃고 N이 바뀌면 대부분 Key의 위치가 달라지는 단순 Modulo 방식은 확장 비용이 크다. Consistent Hashing이나 Virtual Bucket으로 일부 Bucket만 이동할 수 있다.

Directory Sharding은 별도 Directory가 `player_id → shard_id` 매핑을 저장해 특정 Tenant를 개별 이동할 수 있다. Directory 자체의 가용성, Cache 정합성, 조회 비용이 필요하다.

#### Cross-shard Query

```text
Shard A Top 100 ─┐
Shard B Top 100 ─┼─ Aggregator → Global Top 100
Shard C Top 100 ─┘
```

가장 느린 Shard가 전체 지연을 결정한다. 자주 읽는 글로벌 뷰는 이벤트 파이프라인으로 별도 랭킹 저장소에 미리 집계할 수 있다.

#### Cross-shard Transaction

서로 다른 Shard의 플레이어가 재화를 교환하면 두 DB Transaction을 하나로 묶기 어렵다.

```text
Trade State: REQUESTED
  → A Shard 자산 Reserve (멱등)
  → B Shard 자산 Reserve (멱등)
  → 양쪽 Commit / 실패 시 Release 보상 (멱등)
```

보상은 과거를 지우는 Rollback과 다르다. 각 단계가 멱등해야 하고 중간 상태를 누가 복구하는지 정한다.

#### Shard Key 선택 기준

좋은 Shard Key는 높은 Cardinality와 고른 데이터·요청 분포를 가지며 주요 Query·Transaction이 한 Shard에 모이게 한다. 값이 안정적이고 Routing 시 쉽게 알 수 있어야 한다.

#### Resharding

```
1. 대상 Shard에 Snapshot 복사
2. 복사 중 변경 Log·CDC 적용
3. Old와 New 차이를 따라잡음
4. 짧은 쓰기 정지 또는 Dual Write·Forwarding으로 Cutover
5. Routing Map Version 변경
6. 검증 후 Old 데이터 제거
```

Row 수·Checksum·업무 집계로 Migration 결과를 검증하고 Rollback 경로를 둔다.

## 4. 쉬운 예시

도서관 책 한 권을 여러 지점에 복사해 두는 것은 복제와 비슷하다. 가까운 지점에서 읽을 수 있지만 새 개정판이 모든 지점에 도착하기 전에는 이전 내용을 볼 수 있다. 책 종류를 지점별로 나눠 보관하는 것은 샤딩과 비슷하다. 한 지점 용량은 줄지만 여러 분야를 함께 찾으려면 여러 지점을 방문해야 한다.

```java
// 단순 Hash Sharding 예시 (Consistent Hashing은 별도 라이브러리 사용 권장)
public DataSource getShardDataSource(long playerId) {
    int shardIndex = (int) (playerId % SHARD_COUNT);
    return shardDataSources.get(shardIndex);
}

// Cross-shard Saga 패턴 (trade 교환)
public void executeTrade(long fromPlayerId, long toPlayerId, int itemId)
        throws Exception {
    // 1. Trade 레코드 생성 (글로벌 상태 저장)
    String tradeId = UUID.randomUUID().toString();
    tradeRepository.create(tradeId, fromPlayerId, toPlayerId, itemId, "REQUESTED");

    // 2. A 자산 Reserve (멱등: tradeId로 중복 방지)
    DataSource fromDs = getShardDataSource(fromPlayerId);
    if (!reserveItem(fromDs, tradeId, fromPlayerId, itemId)) {
        tradeRepository.update(tradeId, "FAILED");
        return;
    }

    // 3. B 자산 Grant (멱등)
    DataSource toDs = getShardDataSource(toPlayerId);
    if (!grantItem(toDs, tradeId, toPlayerId, itemId)) {
        releaseItem(fromDs, tradeId, fromPlayerId, itemId); // 보상
        tradeRepository.update(tradeId, "FAILED");
        return;
    }

    tradeRepository.update(tradeId, "COMPLETED");
}
```

```sql
-- Global Uniqueness: 닉네임 전역 Registry
-- Shard에 Player를 생성하기 전에 먼저 예약
INSERT INTO nickname_registry (nickname, player_id, expires_at)
VALUES (:nickname, :playerId, NOW() + INTERVAL 5 MINUTE)
ON DUPLICATE KEY UPDATE player_id = player_id; -- UNIQUE 제약으로 중복 방지

-- 예약 성공 후 Player Shard에 생성, 실패 시 Registry 정리
```

## 5. 비슷한 개념과 비교

| 구분 | Replication | Sharding |
|---|---|---|
| 데이터 배치 | 같은 데이터 사본 | 서로 다른 데이터 부분 |
| 주 목적 | 읽기 확장·가용성·복구 | 저장·쓰기 수평 확장 |
| 쓰기 처리 | Primary에 집중 (Replica는 읽기 전용) | 여러 Shard Primary로 분산 |
| 핵심 위험 | Lag·Failover 손실·Split-brain | Key 선택·Hot Shard·Cross-shard 연산 |

| Sharding 방식 | 강점 | 약점 |
|---|---|---|
| Range | 범위 Query 유리, Routing 직관적 | Write Hot Shard (최신 범위 집중) |
| Hash | 균등 분산 | 범위 Query 불리, N 변경 비용 |
| Directory | 세밀 이동, 대형 Tenant 분리 | Directory 가용성·Cache 정합성 비용 |

Partitioning과 Sharding 용어도 문맥에 따라 겹친다. 한 DB 인스턴스 안에서 테이블을 Partition으로 나누는 기능과 여러 독립 DB 노드에 분산하는 Sharding을 구분한다. 내부 Partition은 관리·Pruning에 도움을 주지만 단일 노드 자원 한계를 그대로 가질 수 있다.

## 6. 장점과 단점

**복제의 장점**

- 읽기 처리량과 장애 복구 선택지를 늘린다.
- Primary 부하를 줄이고 분석·Backup을 Replica로 분리한다.

**복제의 단점**

- Lag와 Failover 중 불확실성이 생긴다.
- 저장 비용이 사본 수 배가 된다.
- Replica를 늘려도 Primary 쓰기 처리량은 비례하지 않는다.

**샤딩의 장점**

- 데이터·쓰기 부하를 수평 분산해 단일 노드 한계를 넘는다.
- 플레이어별 데이터가 한 Shard에 모이면 로컬 트랜잭션이 가능하다.

**샤딩의 단점**

- Cross-shard JOIN·Transaction, Backup·Schema 변경과 Rebalancing을 모든 Shard에서 조정해야 한다.
- 전역 UNIQUE 제약이 자동 적용되지 않는다.
- 운영 복잡도가 크게 높아진다.

## 7. 게임 서버·백엔드 실무 예시

계정 ID를 Shard Key로 사용하면 플레이어 데이터(재화, 인벤토리, 퀘스트)가 모이지만 길드·랭킹은 여러 Shard를 넘을 수 있다. 글로벌 ID와 집계 파이프라인을 별도로 설계한다.

읽기 분류:
- 결제·재화 변경 직후 검증: Primary 읽기 또는 같은 Transaction 결과 사용
- 프로필·친구 목록: 짧은 Lag 허용 여부에 따라 Replica
- 운영 분석·통계: 전용 Replica·Warehouse
- 시즌 보상 확정: 특정 Snapshot과 재현 가능한 원본

글로벌 랭킹 Top 100은 각 Shard의 Top 100 후보를 Aggregator에서 Merge한다. 자주 읽으면 이벤트 파이프라인으로 별도 랭킹 저장소에 미리 집계한다.

Schema Migration을 모든 Shard에 순차 적용할 때 일부만 새 Schema가 될 수 있다. Expand-Contract 배포를 사용하고 Shard별 Version과 실패를 추적한다.

Backup은 각 Shard의 시점이 다르면 Cross-shard 거래 상태가 맞지 않을 수 있다. Replica는 사용자 실수나 논리 삭제도 그대로 복제하므로 Backup을 대체하지 않는다.

## 8. 자주 하는 오해

- **"Replica를 늘리면 Primary 쓰기 처리량도 비례한다"**: Replica는 읽기를 분산하지만 모든 쓰기는 여전히 Primary에 모인다. Primary 쓰기 처리량이 한계라면 Sharding이 필요하다.
- **"동기 Replication이면 Replica Query가 즉시 최신이다"**: 동기 설정이 Replica Durable 기록을 기다리더라도 Replica Query에 적용된 상태가 즉시 최신임을 보장하지 않는다. 수신·기록·적용 단계가 다르다.
- **"Failover는 Endpoint만 바꾸면 끝난다"**: 장애 감지, Replica 승격, DNS·Proxy·Connection Pool 갱신, Application Retry와 나머지 Replica 재구성까지 전체 RTO를 측정해야 한다. Failover 중 Commit 결과가 불확실한 요청도 처리해야 한다.
- **"Key 수가 균등하면 Shard 부하도 균등하다"**: 유명 길드·Player 한 Key의 요청량과 Row 크기가 크면 Hot Shard가 된다. 데이터 Byte, QPS, Lock·Storage I/O 중 어느 것이 집중되는지를 Shard별로 관찰해야 한다.
- **"Consistent Hashing이 Hot Key를 자동 해결한다"**: Consistent Hashing은 Resharding 시 이동 데이터를 줄인다. 특정 Key에 요청이 집중되는 Hot Key는 Hash 방식과 무관하게 발생하며 Read Replica·Cache·Key 분할로 별도 대응해야 한다.
- **"Replica가 있으므로 Backup은 필요 없다"**: Replica는 Primary의 모든 변경(사용자 실수, 악의적 삭제, 논리 오류)을 그대로 복제한다. 특정 시점 복구가 필요하면 별도 Backup이 필요하다.
- **"Sharding이 JOIN과 Transaction을 자동 분산한다"**: Sharding은 데이터 배치를 나눌 뿐이다. Cross-shard JOIN은 Scatter-Gather나 사전 집계가 필요하고 Cross-shard Transaction은 2PC 또는 Saga로 별도 설계해야 한다.
- **"Shard 수를 늘리면 Cross-shard 문제가 줄어든다"**: Shard 수를 늘리면 Fan-out 범위가 커져 Cross-shard 문제가 오히려 악화될 수 있다. 주요 Query가 Local하게 처리되도록 Shard Key와 데이터 모델을 먼저 설계해야 한다.

## 9. 면접 질문

### Q1. 동기 복제와 비동기 복제를 비교해 주세요.

비동기는 Replica 확인 전에 성공해 쓰기 지연과 가용성은 좋지만 Failover 시 최근 Write 손실 가능성이 있다. 동기는 정해진 Replica 기록 조건을 기다려 RPO를 줄이지만 느린 Replica·Network 장애가 Commit 지연에 영향을 준다. Ack가 메모리 수신·Durable 기록·적용 중 무엇인지 제품 설정을 확인한다.

### Q2. Replica에서 Read-Your-Writes를 어떻게 제공하나요?

쓰기 후 일정 기간 Primary에 고정하거나 Commit Log 위치 Token을 전달해 그 위치까지 적용한 Replica만 읽는다. 쓰기 응답에 새 상태를 포함하거나 Stale 허용 Query만 Replica로 Route하는 방법도 있다.

### Q3. Shard Key는 어떻게 선택하나요?

데이터와 요청이 고르게 분포하고 주요 Query·Transaction이 한 Shard에 모이며 Routing 시 쉽게 알 수 있는 안정적 Key를 선택한다. Cardinality뿐 아니라 Hot Tenant, 범위 Query와 Cross-shard 관계를 함께 분석한다.

### Q4. Cross-shard Transaction을 어떻게 처리하나요?

2PC는 Coordinator와 Prepare 상태 비용이 있다. 대신 각 단계를 멱등하게 만들고 Trade 상태를 별도 테이블에 기록하는 Saga·Escrow 패턴을 사용한다. 실패 시 보상(Reserve 해제)을 멱등하게 실행하고 영구 실패를 누가 복구하는지 정한다.

### Q5. Failover 시 고려할 사항은 무엇인가요?

장애 감지, Replica 승격, DNS·Proxy·Connection Pool 갱신, Application Retry와 나머지 Replica 재구성까지 전체 RTO를 측정한다. 비동기 Replica 승격 시 이전 Primary가 성공 응답한 최근 쓰기가 없을 수 있다. Split-brain을 막기 위해 Fencing과 Consensus 기반 관리가 필요하다. Failover 중 Commit 결과가 불확실한 요청은 요청 ID와 멱등성으로 재처리한다.

### Q6. 게임 Player 데이터를 player_id로 샤딩할 때 길드·글로벌 랭킹 연산을 어떻게 처리하나요?

플레이어 Aggregate(재화, 인벤토리, 퀘스트)는 player_id Shard에 Local하게 처리한다. 글로벌 랭킹은 각 Shard의 Top N 후보를 Aggregator에서 Merge하거나 이벤트 파이프라인으로 별도 랭킹 저장소에 사전 집계한다. 길드 거래처럼 Cross-shard Transaction은 Saga와 Escrow로 분리 설계한다.

## 10. 예상 꼬리질문

- RPO와 RTO를 어떻게 정의하고 측정하나요?
- Split-brain을 어떻게 방지하나요?
- Resharding 중 다운타임 없이 Cutover하는 방법은 무엇인가요?
- Global UNIQUE 제약을 Sharded 환경에서 어떻게 구현하나요?
- Schema Migration을 여러 Shard에 동시 적용할 때 어떻게 하나요?
- Hot Shard를 감지하고 해소하는 방법은 무엇인가요?
- Replica와 Backup의 차이는 무엇인가요?

## 11. 30초 모범답변

> Replication은 같은 데이터 사본으로 읽기와 가용성을 높이고 Sharding은 데이터를 분할해 용량을 확장합니다. Replica는 읽기를 분산하지만 Primary 쓰기 처리량은 비례하지 않습니다. Cross-shard Transaction은 2PC 대신 Saga·Escrow 패턴으로 멱등하게 설계합니다.

## 12. 1~2분 확장답변

> Replication은 같은 데이터 사본으로 읽기와 가용성을 높이고 Sharding은 데이터를 분할해 용량을 확장합니다. 비동기 복제는 Failover 시 최근 Write가 유실될 수 있어 요청 ID와 멱등성으로 재처리합니다. Shard Key는 주요 Query·Transaction이 Local하게 처리되도록 선택하고 Cross-shard Transaction은 Saga로 분리 설계합니다. Replica를 늘려도 Primary 쓰기 처리량은 비례하지 않으며, Replica는 사용자 실수를 복제하므로 Backup을 대체하지 않습니다.

## 13. 핵심 요약

- 복제는 같은 데이터를 여러 노드에 복사하고 샤딩은 데이터를 키 범위나 해시로 여러 노드에 분할한다.
- 비동기 복제는 Failover 시 최근 Write가 유실될 수 있다. RPO를 정의하고 요청 ID와 멱등성으로 재처리한다.
- Replica를 늘리면 읽기 처리량은 늘지만 Primary 쓰기 처리량은 비례하지 않는다. 쓰기 한계는 Sharding이 필요하다.
- Failover는 장애 감지, 승격, Routing 갱신, Retry까지의 전체 RTO를 측정해야 한다. Split-brain은 Fencing으로 막는다.
- Hash Sharding은 Key를 균등 분산하지만 Hot Key는 해결하지 못한다. Key 수가 균등해도 요청량·Row 크기가 편중하면 Hot Shard가 된다.
- Cross-shard JOIN은 Scatter-Gather나 사전 집계, Cross-shard Transaction은 Saga·Escrow로 각 단계를 멱등하게 설계한다.
- Replica는 Primary 변경을 그대로 복제해 사용자 실수도 복제된다. Backup을 대체하지 않는다.
- 단일 DB에서 Index·Query·수직 확장과 Replica로 충분하다면 Sharding을 서두르지 않는다. Sharding은 데이터 모델과 운영 절차 전체를 바꾸는 결정이다.

## 한 줄 정리

> Replication은 같은 데이터 사본으로 읽기와 가용성을 높이고 Sharding은 데이터를 분할해 용량을 확장합니다. Lag, Failover, Shard Key와 Cross-shard 연산 비용이 핵심입니다.
