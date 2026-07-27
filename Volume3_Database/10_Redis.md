---
difficulty: 4
reading_time: 25분
interview_frequency: 5
importance: 5
---

# 10. Redis

> 게임 서버·백엔드 개발자를 위한 CS 면접 교재

## 학습 목표

- Redis 단일 명령 원자성의 범위와 여러 명령의 비즈니스 로직 원자화(Lua, WATCH) 방법을 설명할 수 있다.
- RDB와 AOF의 내구성 차이, Eviction 정책, Hot Key가 Event Loop에 미치는 영향을 설명할 수 있다.
- 비동기 복제로 인한 쓰기 손실 가능성과 Redis 분산 Lock의 Fencing Token 필요성을 설명할 수 있다.
- 게임 시즌 랭킹에서 Sorted Set을 활용하고 DB를 원본으로 유지하는 설계를 할 수 있다.

## 1. 개요

Redis는 주로 메모리에 데이터를 보관하며 String, Hash, Set, Sorted Set과 원자 명령을 제공하는 데이터 구조 서버다.

Redis는 Key에 단순 Byte String뿐 아니라 Hash, List, Set, Sorted Set, Stream 같은 자료구조를 저장하고 서버 측 명령으로 조작하는 인메모리 데이터 저장소다. 캐시, 세션, Rate Limit, 랭킹, 작업 조정과 메시지 처리에 활용할 수 있다.

메모리 중심이라 낮은 지연을 제공하지만 Network 왕복, 명령 복잡도, 단일 Key 크기, 영속화와 복제 비용은 남는다. Redis를 "DB보다 빠른 Hash Map"으로만 보면 만료, 메모리 제한, 장애 조치와 정합성 문제를 놓친다.

## 2. 왜 필요한가

RDBMS에서 매 요청마다 같은 프로필과 설정을 읽으면 DB Buffer와 Connection이 소모된다. 변경이 드물고 잠시 오래된 값이 허용되면 Redis에 캐시해 읽기 부하를 줄일 수 있다. Sorted Set은 점수 순위를, Set은 중복 없는 Membership을, 원자 증가 명령은 Rate Limit Counter를 간단히 표현한다.

반면 재화 원장과 결제처럼 손실·중복을 허용하기 어려운 데이터는 Redis를 원본으로 삼기 전에 Persistence와 Failover에서 실제 보장을 검토해야 한다. 흔한 구조는 RDBMS를 원본으로 두고 Redis를 재구축 가능한 읽기 최적화로 사용하는 것이다.

## 3. 핵심 동작 원리

```text
client command → single command execution → memory data structure
                                         → optional persistence/replica
```

### Event Loop와 명령 실행

Redis는 명령 실행을 중심 Event Loop에서 순차 처리하는 모델로 설명한다. 여러 Client가 동시에 요청해도 명령 하나의 핵심 실행이 다른 명령과 임의로 섞이지 않으므로 `INCR`, `HSET`, `ZADD` 같은 단일 명령은 원자적이다.

```text
Client A ─┐
Client B ─┼─> I/O Event Loop → Command A → Command B → Command C
Client C ─┘                       Memory Data Structure
```

한 명령이 오래 걸리면 뒤의 다른 Client 명령도 지연될 수 있다. 큰 Key 전체 삭제, 매우 큰 범위 조회, 복잡한 Lua Script와 O(N) 명령을 Hot Path에서 주의한다.

### 단일 명령 원자성과 복합 로직

두 명령은 각각 원자적이어도 사이에 다른 Client가 끼어들 수 있다.

```text
GET stock → 1
다른 Client가 stock을 0으로 변경
SET stock → 0  ← Lost Update
```

재고 차감은 Lua Script나 조건을 포함한 원자 명령으로 묶거나 최종 DB의 조건부 UPDATE로 보호한다.

```lua
-- Lua: 재고 차감 원자화 (Redis 내부에서 원자 실행)
local stock = tonumber(redis.call('GET', KEYS[1]) or '0')
if stock <= 0 then return 0 end
redis.call('DECR', KEYS[1])
return 1
-- 주의: Script 성공 후 애플리케이션 Crash 시 DB 지급과 불일치 가능
```

### MULTI·EXEC와 WATCH

`MULTI` 이후 명령은 Queue되고 `EXEC`에서 순서대로 실행된다. RDBMS 트랜잭션처럼 중간 오류가 전체를 자동 Rollback하는 모델이 아니다. `WATCH`는 지정 Key가 변경되었는지 감시하고 `EXEC` 전에 바뀌면 트랜잭션을 실패시키는 낙관적 동시성 제어다. Hot Key에서는 충돌 재시도가 폭증할 수 있다.

### TTL과 만료

Key에 TTL을 설정하면 일정 시간 뒤 만료된다. Redis는 접근 시 만료를 확인하는 수동적 방식과 주기적으로 일부 Key를 검사하는 능동적 방식을 함께 사용한다. TTL 시각이 지났다고 그 순간 별도 Thread가 모든 Key를 정확히 삭제하지는 않는다.

많은 Key에 같은 만료 시각을 주면 Cache Miss가 동시에 몰릴 수 있다. TTL에 무작위 Jitter를 더해 분산하고 중요한 Hot Key는 미리 갱신한다.

### Persistence: RDB와 AOF

```text
RDB: [Snapshot t0] ────────── [Snapshot t1]
     장애가 사이에 나면 최근 변경 손실 가능

AOF: command1 → command2 → command3 → fsync policy
```

RDB Snapshot은 특정 시점 전체 데이터를 파일로 만든다. Snapshot 사이 변경은 장애 시 잃을 수 있다. AOF는 변경 명령을 Log에 기록하며 Fsync 정책에 따라 내구성과 성능 Trade-off가 달라진다. 성공 응답 이후 어떤 장애에서 몇 초 데이터가 손실될 수 있는지를 정의한다.

### 비동기 복제와 Failover

Primary의 쓰기를 Replica가 비동기적으로 복제한다. Primary가 응답한 직후 Replica가 적용하기 전에 장애가 나고 Replica가 승격되면 최근 쓰기가 유실될 수 있다.

```text
Primary: Write 성공 응답
         │
         ↓ 비동기 복제 (지연 있음)
Replica: 아직 미적용 상태에서 Primary 장애
         → Replica 승격 → 최근 Write 손실 가능
```

### Redis 분산 Lock

```text
Client A Lock 획득, TTL 5초
Client A 7초 Pause (GC, 네트워크 지연 등)
5초: Lock 만료 → Client B 획득
7초: A가 깨어나 외부 Resource 변경
     A와 B가 동시에 작업 → 충돌
```

외부 저장소가 증가하는 Fencing Token을 받아 이전 Token의 쓰기를 거부해야 오래 멈춘 소유자의 작업을 막을 수 있다. Redis Lock만으로 DB의 UNIQUE와 조건부 UPDATE를 제거하지 않는다.

## 4. 쉬운 예시

Redis Cache는 자주 보는 공지문을 입구 게시판에 복사해 두는 것과 비슷하다. 원본은 DB에 있고 게시판이 사라지면 다시 붙일 수 있다. 오래된 상태나 빈 상태에서 많은 사람이 동시에 원본을 요청하면 DB를 압박하므로 무효화, TTL Jitter와 Stampede 방지가 필요하다.

```java
// Rate Limit: INCR + TTL (Lua로 원자화)
public boolean isAllowed(Jedis jedis, String userId, int limitPerMinute) {
    String key = "rate:" + userId;
    String luaScript =
        "local cnt = redis.call('INCR', KEYS[1])\n" +
        "if cnt == 1 then redis.call('EXPIRE', KEYS[1], 60) end\n" +
        "return cnt";
    long count = (long) jedis.eval(luaScript, List.of(key), List.of());
    return count <= limitPerMinute;
}
```

```java
// Sorted Set 랭킹 업데이트 + 조회
public void updateScore(Jedis jedis, String season, long playerId, double score) {
    String key = "ranking:" + season;
    jedis.zadd(key, score, "player:" + playerId);
}

public List<String> getTopN(Jedis jedis, String season, int n) {
    String key = "ranking:" + season;
    // Score 높은 순 상위 N명 (0-indexed)
    return jedis.zrevrange(key, 0, n - 1);
}
// 동점 처리, 시즌 종료 Snapshot, DB 원본 재구축 경로는 별도 설계 필요
```

```java
// Cache-Aside 패턴 + Null 캐싱
public PlayerProfile getProfile(Jedis jedis, long playerId) {
    String key = "profile:" + playerId;
    String cached = jedis.get(key);
    if (cached != null) {
        return "NULL".equals(cached) ? null : deserialize(cached, PlayerProfile.class);
    }
    PlayerProfile profile = db.findProfile(playerId);
    if (profile == null) {
        jedis.setex(key, 30, "NULL"); // Null 캐싱으로 DB 반복 조회 방지
    } else {
        jedis.setex(key, 300, serialize(profile));
    }
    return profile;
}
```

## 5. 비슷한 개념과 비교

| 구분 | Redis | RDBMS | In-process Cache |
|---|---|---|---|
| 접근 방식 | Network + Memory | SQL·Storage Engine | Process Memory 직접 |
| 자료 모델 | Key 기반 Data Structure | Relation·Constraint·Join | Library 객체 |
| 공유 범위 | 여러 Process·서버 | 여러 서비스 | 단일 Process |
| 지속성 | 설정에 따라 선택·손실 범위 | WAL·Transaction 중심 | Process 종료 시 소멸 |
| 강점 | 낮은 지연·Atomic Command | 복합 정합성·조회 | 가장 낮은 Network 비용 |
| 주요 약점 | 비동기 복제 손실·Hot Key | Connection 비용·지연 | 서버 간 불일치 |

| 자료형 | 대표 용도 | 주의점 |
|---|---|---|
| String | Cache·Counter(INCR) | 큰 Value 직렬화 비용 |
| Hash | 객체 Field 저장 | 큰 Hash 전체 Scan |
| Set | Membership·중복 제거 | 큰 집합 연산 비용 |
| Sorted Set | Ranking·시간 순 정렬 | Score 동점·큰 범위 조회 |
| List | 단순 Queue | 신뢰성 Queue 설계 별도 필요 |
| Stream | Consumer Group 이벤트 | Pending·Ack·Trim 운영 |

## 6. 장점과 단점

**Redis의 장점**

- 메모리 기반으로 낮은 지연과 높은 처리량을 제공한다.
- 다양한 자료구조와 원자 명령으로 캐시·랭킹·Rate Limit·세션을 간결하게 표현한다.
- TTL, 복제·Cluster 생태계로 확장이 쉽다.

**Redis의 단점**

- RAM 비용이 높고 메모리 한도 초과 시 Eviction 또는 쓰기 실패가 생긴다.
- 비동기 복제로 Failover 시 최근 쓰기가 유실될 수 있다.
- Hot Key가 Event Loop와 같은 Shard에 부하를 집중시킨다.
- 명령 하나의 원자성이 비즈니스 로직 전체 원자성을 보장하지 않는다.
- 큰 Key 삭제나 O(N) 명령이 Event Loop를 차단할 수 있다.

## 7. 게임 서버·백엔드 실무 예시

Sorted Set으로 시즌 랭킹을 구성하고 DB를 최종 원본으로 둔다. 시즌 종료 시 Redis 랭킹을 DB에 Snapshot으로 저장해 Redis 장애·삭제 후에도 결과를 재구축할 수 있도록 한다.

세션 Token→Player ID와 만료를 Redis에 저장하면 여러 API 서버가 공유할 수 있다. Redis 장애 시 모든 로그인 사용자를 차단할지 서명 Token으로 Fallback할지를 정한다.

Rate Limit에는 고정 Window Counter를 `INCR`와 첫 생성 시 TTL을 Lua로 묶어 원자화한다. 경계 시각 Burst와 제한 실패 시 허용할지 차단할지를 서비스 위험에 따라 결정한다.

Redis가 느려지면 Cache Miss와 Timeout 재시도가 DB를 동시에 압박할 수 있다. 짧은 Timeout, 제한된 Connection·Queue, Circuit Breaker와 DB 보호용 Admission Control을 둔다.

Big Key는 `KEYS *`로 운영 Primary를 막아 찾지 않는다. 점진적 SCAN과 Memory Sampling, Offline 분석을 사용한다. 큰 집합 삭제는 비동기 Free(`UNLINK`)와 점진 분할을 검토한다.

## 8. 자주 하는 오해

- **"Redis 명령 원자성이 전체 로직 원자성을 뜻한다"**: 단일 명령 원자성은 그 명령 하나가 중간 단계에서 다른 명령과 섞이지 않는다는 뜻이다. GET 후 SET처럼 두 명령 사이에는 다른 Client가 실행될 수 있고 Redis 명령과 DB 변경이 하나의 원자 작업이 되지도 않는다.
- **"TTL만 있으면 캐시 정합성이 해결된다"**: TTL은 Staleness의 최대 시간을 제한할 뿐이다. DB 변경 직후 오래된 캐시가 남는 기간 자체를 없애지 않는다. Cache Invalidation 또는 Versioned Key와 함께 사용해야 한다.
- **"TTL 시각에 모든 Key가 즉시 물리 삭제된다"**: Redis는 수동 만료(접근 시 확인)와 능동 만료(주기적 검사)를 함께 사용한다. TTL 시각에 별도 Thread가 즉시 정확히 삭제하지는 않는다. 논리적으로 만료된 Key는 접근 시 없는 것으로 취급된다.
- **"Pipeline이 여러 명령을 하나의 Atomic Transaction으로 만든다"**: Pipeline은 Network 왕복을 줄이기 위해 여러 명령을 한 번에 보내는 것이다. 명령 사이에 다른 Client 명령이 실행될 수 있고 하나의 원자 작업이 되지 않는다.
- **"Replica Ack가 있으면 어떤 장애에서도 Write 손실이 없다"**: Redis의 복제 Ack 관련 설정은 손실 가능성을 줄이지만 완전한 강한 Consensus Commit과 동일하지 않다. 네트워크 분할 등 장애 시나리오에서 동작을 제품 문서로 확인해야 한다.
- **"Pub/Sub이 끊긴 Consumer의 Message를 자동 보관한다"**: Pub/Sub은 현재 구독 중인 Client에게만 전달한다. 구독자가 끊겨 있으면 메시지가 유실된다. 신뢰성 있는 이벤트 전달이 필요하면 Stream의 Consumer Group을 사용한다.
- **"Redis 분산 Lock을 쓰면 DB 제약이 필요 없다"**: Redis Lock은 여러 프로세스의 진입을 조정하지만 DB Commit과 원자적으로 묶이지 않는다. Lease 만료나 GC Pause로 두 Client가 동시에 Lock을 가졌다고 믿을 수 있다. Fencing Token 없이는 외부 자원을 안전하게 보호하지 못한다. DB의 UNIQUE와 조건부 UPDATE는 최종 방어선으로 유지한다.
- **"Redis는 Memory만 사용하므로 지연이 항상 일정하다"**: Hot Key가 같은 Event Loop에 부하를 집중시키고 큰 Key 삭제·O(N) 명령이 뒤의 명령을 지연시킨다. Background Save의 Fork·Copy-on-Write도 메모리와 지연에 영향을 줄 수 있다.

## 9. 면접 질문

### Q1. Redis 단일 명령 원자성은 무엇을 의미하나요?

한 명령의 실행이 다른 명령과 중간 단계에서 섞이지 않는다는 의미다. GET 후 SET처럼 여러 명령 사이에는 다른 Client가 실행될 수 있고, Redis 명령과 DB 변경이 하나의 원자 작업이 되는 것도 아니다. 복합 로직은 Lua Script나 WATCH를 사용한다.

### Q2. RDB와 AOF를 비교해 주세요.

RDB는 특정 시점 전체 Snapshot이라 복구 파일이 Compact하지만 Snapshot 사이 변경 손실 가능성이 있다. AOF는 변경 명령을 이어 기록해 더 촘촘한 복구가 가능하지만 파일·쓰기 비용과 Rewrite가 필요하다. 실제 손실 범위는 Save·Fsync 정책에 달려 있다.

### Q3. Redis에서 Hot Key가 왜 문제인가요?

특정 Key의 모든 요청이 같은 Shard와 Event Loop, Network에 집중된다. 한 명령이 오래 걸리면 뒤의 명령 전체가 지연된다. Local Cache, Read Replica, Key 분할과 요청 합치기를 정합성 요구에 맞춰 적용한다.

### Q4. MULTI·EXEC는 RDBMS Transaction과 어떻게 다른가요?

`MULTI·EXEC`는 명령을 Queue해 순서대로 실행하지만 중간 실행 오류가 전체를 자동 Rollback하지 않는다. 문법 오류와 실행 오류의 동작이 다르고 부분 효과가 남을 수 있다. RDBMS Transaction의 ROLLBACK처럼 전체를 되돌리는 보장이 없다.

### Q5. Redis 분산 Lock은 DB 비관적 Lock을 대체할 수 있나요?

대체하지 못한다. Redis Lock은 여러 프로세스의 진입을 조정하지만 DB Commit과 원자적으로 묶이지 않는다. Lease 만료나 GC Pause로 두 Client가 동시에 유효하다고 믿을 수 있다. Fencing Token 없이는 안전하지 않으며 DB의 UNIQUE와 조건부 UPDATE가 최종 방어선이다.

### Q6. 게임 시즌 랭킹을 Sorted Set으로 구현할 때 주의할 점은 무엇인가요?

동점 시 순위 정의, Score의 부동소수점 표현 한계를 확인한다. 시즌 종료 시 Redis 랭킹을 DB에 Snapshot으로 저장해 Redis 장애·삭제 후 재구축 근거를 둔다. 상위 N명 조회는 `ZREVRANGE`로 하되 Key Cardinality와 범위를 제한한다. 점수 갱신이 매우 빈번하면 Hot Key가 될 수 있어 Cluster 설계를 검토한다.

## 10. 예상 꼬리질문

- WATCH는 어떻게 낙관적 충돌을 감지하나요?
- Pipeline 배치 크기가 너무 크면 어떤 문제가 생기나요?
- Redis 분산 Lock에서 Fencing Token이 왜 필요한가요?
- Big Key를 운영 중에 어떻게 안전하게 찾나요?
- Eviction 정책을 설정할 때 무엇을 고려하나요?
- Redis Cluster에서 Multi-key 명령 제약은 어떻게 다루나요?
- Pub/Sub 대신 Stream Consumer Group을 언제 선택하나요?

## 11. 30초 모범답변

> Redis는 메모리 기반 데이터 구조와 원자 명령으로 빠른 캐시·랭킹·세션을 제공하지만 최종 원본 여부, 영속성, Hot Key와 메모리 정책을 명확히 해야 합니다. 단일 명령 원자성은 비즈니스 로직 전체를 보장하지 않으며 비동기 복제로 Failover 시 최근 쓰기가 유실될 수 있습니다.

## 12. 1~2분 확장답변

> Redis는 메모리 기반 데이터 구조와 원자 명령으로 빠른 캐시·랭킹·세션을 제공하지만 최종 원본 여부, 영속성, Hot Key와 메모리 정책을 명확히 해야 합니다. 단일 명령 원자성은 비즈니스 로직 전체를 보장하지 않으며 Lua Script나 WATCH로 복합 로직을 묶어도 DB 변경과 한 원자 작업이 되지 않습니다. 비동기 복제로 Failover 시 최근 쓰기가 유실될 수 있고 분산 Lock은 Fencing Token 없이 안전하지 않습니다. 재화 원장과 결제는 DB를 원본으로 두고 Redis는 재구축 가능한 읽기 최적화로 사용합니다.

## 13. 핵심 요약

- Redis는 주로 메모리에 데이터를 보관하며 String, Hash, Set, Sorted Set과 원자 명령을 제공하는 데이터 구조 서버다.
- 단일 명령 원자성은 그 명령 안에서만 성립한다. GET 후 SET처럼 여러 명령 사이에는 다른 Client가 끼어들 수 있다.
- TTL은 Staleness 최대 시간을 제한할 뿐이다. DB 변경 직후 오래된 캐시가 남는 기간을 없애려면 Cache Invalidation 또는 Versioned Key가 필요하다.
- 비동기 복제로 Failover 시 최근 쓰기가 유실될 수 있다. 손실 허용 범위를 영속화 설정과 함께 정의한다.
- Redis 분산 Lock은 Lease 만료·GC Pause로 두 Client가 동시에 유효하다고 믿을 수 있다. Fencing Token 없이 안전하지 않으며 DB의 UNIQUE와 조건부 UPDATE가 최종 방어선이다.
- Hot Key는 Event Loop와 같은 Shard에 부하를 집중시킨다. Local Cache, Read Replica, Key 분할로 분산한다.
- Pub/Sub은 구독 중인 Client에게만 전달한다. 재생 가능한 이벤트 보관이 필요하면 Stream Consumer Group을 사용한다.
- 게임 랭킹은 Sorted Set으로 빠르게 읽고 DB에 최종 Snapshot을 저장해 Redis 장애 후 재구축할 수 있도록 한다.

## 한 줄 정리

> Redis는 메모리 기반 데이터 구조와 원자 명령으로 빠른 캐시·랭킹·세션을 제공하지만 최종 원본 여부, 영속성, Hot Key와 메모리 정책을 명확히 해야 합니다.
