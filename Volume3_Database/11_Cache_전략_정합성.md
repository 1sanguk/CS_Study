---
difficulty: 4
reading_time: 25분
interview_frequency: 5
importance: 5
---

# 11. Cache 전략과 정합성


## 학습 목표

- Cache-Aside의 읽기/쓰기 경로와 DB Commit 후 Cache 삭제 순서가 중요한 이유를 설명할 수 있다.
- Cache Stampede, Cache Avalanche, Cache Penetration 각 현상의 원인과 방지 방법을 설명할 수 있다.
- Write-Through와 Write-Behind의 내구성과 손실 Trade-off를 비교하고 게임 데이터에 맞는 전략을 선택할 수 있다.
- 게임 플레이어 프로필 캐시에서 Outbox 기반 무효화와 Versioned Key를 언제 사용할지 설계할 수 있다.

## 1. 개요

캐시는 느린 원본 앞에 자주 쓰는 데이터를 두어 지연과 부하를 줄이며 정합성 전략은 원본과 캐시의 갱신 순서와 실패 처리를 정한다.

캐시(Cache)는 원본 데이터의 일부를 더 빠르고 가까운 저장소에 복제해 반복 계산과 I/O(Input/Output)를 줄인다. 애플리케이션 프로세스 내부 메모리, Redis 같은 분산 캐시, CDN과 DB Buffer Pool 모두 넓은 의미의 캐시지만 이 문서는 애플리케이션과 원본 DB 사이의 읽기 캐시를 중심으로 다룬다.

캐시를 추가하면 상태가 하나에서 둘 이상으로 늘어난다. 원본이 바뀌었는데 캐시가 남거나, 캐시를 먼저 바꾼 뒤 DB 쓰기가 실패하는 문제가 생긴다. "Cache Hit Ratio를 높인다"보다 어떤 데이터가 원본이고 얼마 동안 오래된 값을 허용하며 실패 후 어떻게 복구할지를 먼저 정한다.

## 2. 왜 필요한가

플레이어 프로필이 초당 수만 번 읽히지만 몇 분에 한 번만 변경된다면 매 읽기를 DB에 보내는 것은 불필요하다. 캐시는 DB Connection, Buffer Page와 Network를 절약하고 사용자 지연을 줄인다. 계산 비용이 큰 랭킹 결과와 권한 집합도 일정 시간 재사용할 수 있다.

반면 재화 잔액처럼 변경 직후 정확한 값이 필요한 데이터는 오래된 캐시가 중복 구매와 잘못된 거절을 만들 수 있다. Cache 장애 때 모든 요청이 DB로 몰리면 원본까지 장애가 확대된다. 데이터별 정확성·신선도·재구축 비용과 DB의 최악 부하를 기준으로 캐시 적용 여부를 선택한다.

## 3. 핵심 동작 원리

### Cache-Aside 읽기

```text
Client → Application → Cache GET
                        ├─ Hit  → Return
                        └─ Miss → DB SELECT → Cache SET(TTL) → Return
```

애플리케이션이 Cache를 먼저 읽고 Miss면 원본 DB에서 읽어 Cache를 채운다. Miss가 동시에 많이 발생하면 여러 요청이 같은 DB Query를 수행할 수 있다. Cache 채우기 실패는 사용자 응답 실패로 이어질 필요가 없는 경우가 많다. DB 조회가 성공했으면 Cache SET 오류를 기록하고 원본 결과를 반환한다.

### Cache-Aside 쓰기: DB Commit 후 삭제

```text
1. DB Transaction Commit
2. Cache Key Delete (순서가 반드시 이 순서여야 함)
```

캐시 값을 직접 업데이트하기보다 삭제하면 다음 읽기가 DB에서 최신 값을 채운다.

**삭제 후 DB Commit 순서는 위험하다.**

```text
T1: Cache Delete
T2: Cache Miss → DB의 이전 값 Read → Cache에 이전 값 Fill
T1: DB Commit
결과: 이전 Cache가 다시 남음
```

DB Commit 후 삭제도 완벽한 원자성은 아니다. Commit과 삭제 사이에 Reader가 이전 Cache를 읽을 수 있고, Commit 뒤 Process가 죽으면 삭제가 누락된다. Cache-Aside는 짧은 Stale Window를 허용하고 TTL(Time To Live)·이벤트·재처리로 수렴시키는 전략이다.

### Write-Through

```text
Application → Cache Layer → DB Write
                    │ DB 성공
                    └→ Cache Update → Success
```

성공 응답 전에 둘을 갱신하므로 읽기 Cache가 최신일 가능성이 높다. DB 성공 후 Cache 갱신 실패 같은 부분 실패는 여전히 있다. 모든 쓰기 경로가 Cache를 통과해야 한다는 규약을 운영 Script·Batch까지 강제해야 한다.

### Write-Behind / Write-Back

```text
Client → Cache Write → Success 반환
              │
              └─ Queue → Async DB Flush
```

쓰기 지연과 Batch 효율은 좋지만 Cache 장애나 Queue 유실 시 DB에 반영되지 않은 성공 데이터가 사라질 수 있다. Cache를 이 구간의 원본으로 취급하고 Durable Log, 순서, 중복 제거, Retry, Dead Letter와 복구를 갖춰야 한다. 재화·결제에 단순 Redis Cache에 쓰고 나중에 DB로 옮기는 구현은 위험하다.

### Cache Stampede

```text
Hot Key 만료
   ├─ Request 1 ─ DB Query
   ├─ Request 2 ─ DB Query
   ├─ Request 3 ─ DB Query
   └─ ... 수천 개 동시 조회
```

완화 방법:
- Single Flight: 한 인스턴스에서 동일 Key 로딩 하나만 실행하고 결과를 공유한다.
- 분산 Lock: 한 프로세스만 재계산하고 나머지는 짧게 기다리거나 Stale 값을 제공한다.
- Soft TTL: 논리 만료 후 한 요청이 비동기 갱신하는 동안 Stale 값을 제공한다.
- TTL Jitter: 여러 Key의 동시 만료를 분산한다.

### Cache Avalanche

많은 Key가 동시에 만료되거나 Cache Cluster 전체가 장애 나 DB로 부하가 쏟아지는 현상이다. TTL 분산, Cache Cluster 다중화, Circuit Breaker, DB Connection·Query 동시성 상한과 Graceful Degradation으로 원본을 보호한다. Cache가 내려가면 무조건 모든 요청을 DB로 우회하는 Fallback은 DB까지 무너뜨릴 수 있다.

### Cache Penetration

존재하지 않는 ID 요청은 Cache에 값이 없어 매번 DB까지 통과한다. 짧은 TTL의 Negative Cache로 "없음" 결과를 저장하거나 입력 범위를 검증한다. "없음"을 너무 오래 Cache하면 방금 생성된 객체가 보이지 않을 수 있다.

### 무효화 이벤트

```text
DB Transaction: Update Profile + Insert Outbox Event
                           │ Commit
                           v
Outbox Publisher → Cache Invalidation Consumer → Delete Key
```

DB Commit 성공과 이벤트 발행 사이 Crash가 문제다. Transactional Outbox나 CDC로 Commit된 변경에서 이벤트를 재처리 가능하게 만든다. 이벤트는 중복·순서 변경될 수 있으므로 삭제는 멱등하게 유지한다.

### Versioned Key

```text
profile:101:version → 8
profile:101:v8      → payload
```

새 Version 포인터를 읽으면 이전 Cache와 충돌하지 않는다. 콘텐츠 배포처럼 Immutable Version을 전환하는 상황에 특히 유용하다.

## 4. 쉬운 예시

캐시는 식당이 자주 주문되는 반찬을 미리 준비하는 것과 비슷하다. 주문마다 새로 만들지 않아 빠르지만 레시피가 바뀌면 기존 반찬을 폐기해야 한다. DB가 원본이고 Cache Key 삭제나 Version 변경으로 다음 조회가 새 값을 로딩한다.

재화 잔액은 Cache Hit로 화면에 빠르게 보여 줄 수 있어도 구매 승인 판단은 원본 DB의 조건부 UPDATE를 사용한다. 화면의 잔액이 잠시 오래될 수 있다는 UX와 구매 결과의 정확성을 분리한다.

```java
// Cache-Aside: 읽기
public PlayerProfile getProfile(Jedis jedis, long playerId) {
    String key = "profile:" + playerId;
    String cached = jedis.get(key);
    if (cached != null) {
        return "NULL".equals(cached) ? null : deserialize(cached, PlayerProfile.class);
    }
    PlayerProfile profile = db.findProfile(playerId);
    if (profile == null) {
        jedis.setex(key, 30, "NULL"); // Negative Cache
    } else {
        jedis.setex(key, 300, serialize(profile)); // 300초 TTL
    }
    return profile;
}

// Cache-Aside: DB Commit 후 삭제 (순서 중요)
public void updateNickname(Connection conn, Jedis jedis, long playerId, String nickname)
        throws SQLException {
    conn.setAutoCommit(false);
    try {
        PreparedStatement update = conn.prepareStatement(
            "UPDATE player_profile SET nickname = ? WHERE player_id = ?");
        update.setString(1, nickname);
        update.setLong(2, playerId);
        update.executeUpdate();
        conn.commit(); // DB Commit 먼저
        jedis.del("profile:" + playerId); // Commit 성공 후 Cache 삭제
    } catch (SQLException e) {
        conn.rollback();
        throw e;
    }
}
```

```java
// Single Flight 패턴: Stampede 방지 (Java 예시)
private final ConcurrentHashMap<String, CompletableFuture<PlayerProfile>> inflight =
    new ConcurrentHashMap<>();

public PlayerProfile getProfileSingleFlight(Jedis jedis, long playerId) {
    String key = "profile:" + playerId;
    String cached = jedis.get(key);
    if (cached != null) return deserialize(cached, PlayerProfile.class);

    // 동일 Key에 대해 한 번만 DB 조회
    CompletableFuture<PlayerProfile> future = new CompletableFuture<>();
    CompletableFuture<PlayerProfile> existing = inflight.putIfAbsent(key, future);
    if (existing != null) return existing.join(); // 대기 후 공유

    try {
        PlayerProfile profile = db.findProfile(playerId);
        jedis.setex(key, 300, serialize(profile));
        future.complete(profile);
        return profile;
    } catch (Exception e) {
        future.completeExceptionally(e);
        throw e;
    } finally {
        inflight.remove(key);
    }
}
```

## 5. 비슷한 개념과 비교

| 전략 | Read 경로 | Write 경로 | 핵심 위험 |
|---|---|---|---|
| Cache-Aside | App이 Miss 시 DB Load | DB Commit 후 Cache 삭제 | Stale Window·Stampede |
| Read-Through | Cache Layer가 Load | 별도 전략 필요 | Loader 의존성·Negative |
| Write-Through | Cache에서 읽음 | Cache와 원본 동기 갱신 | 이중 쓰기 실패·지연 |
| Write-Around | Miss 시 DB Load | DB만 쓰고 Cache 무효화 | 쓰기 직후 Miss |
| Write-Behind | Cache에서 읽음 | Cache 성공 후 비동기 DB | 손실·순서·복구 복잡성 |

| 이상 현상 | 원인 | 방지 방법 |
|---|---|---|
| Cache Stampede | Hot Key 만료 시 동시 DB 조회 | Single Flight·분산 Lock·TTL Jitter |
| Cache Avalanche | 광범위 Key 동시 만료·Cluster 장애 | TTL 분산·Circuit Breaker·Admission Control |
| Cache Penetration | 없는 Key 반복 조회 | Negative Cache·입력 검증·Bloom Filter |
| Cache Pollution | 일회성 Scan이 Hot Data 축출 | Admission 정책·별도 Namespace |

## 6. 장점과 단점

**캐시의 장점**

- 지연과 원본 부하를 줄이고 트래픽 Burst를 흡수한다.
- 계산 비용이 큰 결과를 재사용해 DB·CPU(Central Processing Unit)를 절약한다.
- TTL 기반으로 점진 수렴하여 구조가 단순하다.

**캐시의 단점**

- 추가 복사본으로 상태가 늘어나고 무효화 경쟁이 생긴다.
- Memory·Network 비용이 발생하고 Cache 장애가 원본 장애로 번질 수 있다.
- 갱신 순서·실패 처리를 잘못 설계하면 오래된 값이 정확성 오류를 만든다.

**Cache 전략별 단점**

- Write-Through: 이중 쓰기 실패와 모든 경로가 Cache를 통과해야 한다는 규약.
- Write-Behind: Queue 손실 시 확정된 성공이 DB에 반영되지 않는 위험.
- Cache-Aside: Stale Window와 삭제 실패 시 TTL까지 이전 값 잔류.

## 7. 게임 서버·백엔드 실무 예시

플레이어 프로필은 `profile:{player_id}`를 Cache-Aside로 읽고 DB 수정 Transaction Commit 후 삭제한다. Outbox 이벤트로 삭제를 재시도하고 TTL을 최종 수렴 안전망으로 둔다. 닉네임 변경 응답에는 새 값을 직접 반환해 작성자가 바로 이전 Cache를 다시 읽지 않게 한다.

게임 설정은 버전이 붙은 Immutable Blob을 캐시하고 `active_config_version` 포인터만 전환한다. 이전 서버가 이전 Version을 읽어도 호환 기간 동안 유효하게 유지하고 점진적으로 제거한다.

랭킹은 DB 집계 결과를 30초 Soft TTL로 저장하고 한 Worker가 갱신하는 동안 다른 요청은 이전 랭킹을 반환할 수 있다. 시즌 보상 확정은 특정 Snapshot을 DB에 저장해 재현 가능하게 한다.

Redis가 느려지면 Cache Miss와 Timeout 재시도가 DB를 동시에 압박할 수 있다. 짧은 Timeout, 제한된 Connection·Queue, Circuit Breaker와 DB 보호용 Admission Control을 둔다.

## 8. 자주 하는 오해

- **"DB 갱신 후 Cache 값을 덮어쓰면 항상 정합적이다"**: 여러 Writer가 동시에 쓰면 나중에 Commit한 값을 이전 값이 덮을 수 있다. Cache 삭제가 덮어쓰기보다 안전하고, 삭제는 대체로 멱등하다.
- **"Cache 삭제와 DB Commit이 자동으로 하나의 Transaction이다"**: DB Commit과 Cache 삭제는 별개 작업이다. Commit 후 Process가 죽으면 삭제가 누락된다. Outbox 이벤트나 CDC로 재처리 경로를 만들어야 한다.
- **"Hit Ratio만 높으면 Cache 설계가 성공했다"**: 99% Hit여도 1% Miss가 DB 용량을 넘거나, 오래된 Cache가 업무 오류를 만들 수 있다. Stale 탐지, DB Fallback 처리량, p99 지연을 함께 관찰한다.
- **"Cache 장애 시 모든 요청을 DB로 보내면 가용성이 높아진다"**: 트래픽을 흡수하던 Cache가 사라지면 DB가 과부하로 쓰러질 수 있다. Circuit Breaker, Admission Control로 DB를 보호하고 핵심 기능만 Fallback한다.
- **"Negative Cache는 항상 길게 유지할수록 좋다"**: "없음"을 너무 오래 Cache하면 방금 생성된 객체가 기간 동안 보이지 않는다. 생성이 드문 데이터는 길게, 자주 생성되는 데이터는 짧게 설정한다.
- **"Cache Stampede는 Hot Key가 만료될 때만 발생한다"**: Stampede는 Cache Miss가 대규모로 동시 발생할 때 생긴다. 서버 재시작 후 Warm-up 미비, Cache Cluster 재접속 등에서도 발생한다.
- **"Write-Behind는 단순 Redis에 쓰고 나중에 DB로 옮기면 된다"**: Write-Behind에서 Cache를 이 구간의 원본으로 취급해야 한다. Durable Log, 순서 보장, 중복 제거, Retry, Dead Letter와 복구가 없으면 Redis 장애 시 확정된 성공 데이터를 잃는다.

## 9. 면접 질문

### Q1. Cache-Aside의 읽기/쓰기 경로를 설명해 주세요.

읽기는 Cache를 먼저 확인하고 Miss면 DB에서 읽어 Cache를 채운다. 쓰기는 DB를 원본으로 Commit한 뒤 Cache를 삭제한다. 구조는 단순하지만 Commit·삭제 사이 Stale Window와 삭제 실패를 TTL·이벤트로 보완한다.

### Q2. DB 갱신 후 Cache를 삭제할 때 순서가 왜 중요한가요?

Cache 삭제 후 DB Commit 순서라면 T2가 Cache Miss 뒤 DB의 이전 값을 읽어 채우고 T1이 Commit하면 이전 Cache가 다시 남는다. DB Commit 후 삭제해야 이 경쟁 조건을 줄일 수 있다. 단, Commit 뒤 Process Crash로 삭제가 누락되는 경우에는 Outbox 이벤트로 재시도 경로를 둔다.

### Q3. Cache Stampede는 무엇이며 어떻게 막나요?

인기 Key가 만료될 때 많은 요청이 동시에 원본을 조회하는 현상이다. Single Flight로 동일 Key 로딩을 합치거나, 분산 Lock으로 한 프로세스만 재계산하고 나머지는 Stale 값을 제공한다. TTL Jitter로 동시 만료도 분산한다.

### Q4. Cache Avalanche와 Cache Penetration을 설명해 주세요.

Cache Avalanche는 광범위 Key가 동시에 만료되거나 Cluster가 장애 나 DB로 부하가 쏟아지는 현상이다. TTL 분산과 Circuit Breaker로 원본을 보호한다. Cache Penetration은 없는 Key 반복 조회가 매번 DB를 통과하는 현상이다. Negative Cache와 입력 검증으로 막는다.

### Q5. Write-Through와 Write-Behind를 비교해 주세요.

Write-Through는 성공 전에 Cache와 원본을 동기 갱신해 내구성과 읽기 신선도를 높이지만 쓰기 지연과 이중 쓰기 실패가 있다. Write-Behind는 Cache 성공 후 비동기 원본 반영이라 빠르지만 Queue·Cache 장애의 손실과 순서·복구가 복잡하다. 재화·결제에는 Write-Behind가 위험하다.

### Q6. 재화 잔액에 Cache를 적용할 때 주의할 점은 무엇인가요?

재화 잔액은 화면 표시에 캐시를 사용해도 되지만 구매 승인 판단은 원본 DB의 조건부 UPDATE를 사용한다. 오래된 Cache가 중복 구매나 잘못된 거절을 만들 수 있다. UX의 표시 신선도와 비즈니스 로직의 정확성을 분리해 설계한다.

## 10. 예상 꼬리질문

- Outbox 기반 무효화가 단순 Cache 삭제보다 나은 이유는 무엇인가요?
- Versioned Key는 언제 일반 Cache 삭제보다 유용한가요?
- Bloom Filter를 Cache Penetration 방지에 사용할 때 주의할 점은 무엇인가요?
- Read-Your-Writes 일관성을 어떻게 구현하나요?
- 다단계 Cache(L1 In-process + L2 Redis)의 무효화는 어떻게 하나요?
- Delayed Double Delete의 한계는 무엇인가요?
- Hit Ratio 외에 Cache 성능 지표로 무엇을 봐야 하나요?

## 11. 30초 모범답변

> 캐시는 성능을 위해 정합성을 일부 지연시키는 복제본입니다. 원본, 갱신 순서, TTL, 무효화 실패와 Stampede 대응을 함께 설계해야 합니다. 재화처럼 정확성이 중요한 데이터는 캐시를 표시용으로만 사용하고 구매 판단은 DB의 조건부 UPDATE를 사용합니다.

## 12. 1~2분 확장답변

> 캐시는 성능을 위해 정합성을 일부 지연시키는 복제본입니다. Cache-Aside는 DB Commit 후 Cache 삭제 순서가 중요하며 삭제 실패를 Outbox 이벤트로 재시도하고 TTL을 최종 안전망으로 둡니다. Hot Key 만료 시 Stampede를 Single Flight·분산 Lock·TTL Jitter로 막고, Cache 장애 시 무조건 DB Fallback은 DB까지 장애를 확대할 수 있으므로 Circuit Breaker와 Admission Control을 둡니다. 재화처럼 정확성이 중요한 데이터는 캐시를 표시용으로만 사용하고 비즈니스 판단은 DB 원본으로 합니다.

## 13. 핵심 요약

- 캐시는 느린 원본 앞에 자주 쓰는 데이터를 두어 지연과 부하를 줄이며 정합성 전략은 원본과 캐시의 갱신 순서와 실패 처리를 정한다.
- Cache-Aside에서 DB Commit 후 Cache 삭제 순서가 중요하다. 삭제 후 Commit이면 경쟁 조건으로 이전 값이 다시 채워진다.
- Cache 삭제와 DB Commit은 별개 작업이다. 삭제 실패 시 Outbox 이벤트나 CDC로 재처리 경로를 만들어야 한다.
- Cache Stampede는 Single Flight, 분산 Lock, Soft TTL, TTL Jitter로 막는다.
- Cache 장애 시 무조건 DB로 Fallback하면 DB까지 무너진다. Circuit Breaker와 Admission Control로 원본을 보호한다.
- Write-Behind에서 Durable Log·순서·복구가 없으면 확정된 성공 데이터를 잃는다. 재화·결제에는 위험하다.
- Hit Ratio만으로 Cache 성공을 판단하지 않는다. Stale 탐지, DB Fallback 처리량, p99 지연을 함께 관찰한다.
- 재화처럼 정확성이 중요한 데이터는 캐시를 표시용으로만 사용하고 구매 판단은 DB의 조건부 UPDATE를 사용한다.

## 한 줄 정리

> 캐시는 성능을 위해 정합성을 일부 지연시키는 복제본입니다. 원본, 갱신 순서, TTL, 무효화 실패와 Stampede 대응을 함께 설계해야 합니다.
