---
difficulty: 4
reading_time: 25분
interview_frequency: 5
importance: 5
---

# 10. Redis

> 게임 서버·백엔드 개발자를 위한 CS 면접 교재

## 학습 목표

- 정의와 등장 이유를 설명할 수 있다.
- 정합성·성능 Trade-off를 설명할 수 있다.
- 게임 백엔드 장애와 확장에 적용할 수 있다.

## 1. 개요

Redis는 주로 메모리에 데이터를 보관하며 String, Hash, Set, Sorted Set과 원자 명령을 제공하는 데이터 구조 서버다.

Redis는 Key에 단순 Byte String뿐 아니라 Hash, List, Set, Sorted Set, Stream 같은 자료구조를 저장하고 서버 측 명령으로 조작하는 인메모리 데이터 저장소다. 캐시, 세션, Rate Limit, 랭킹, 작업 조정과 메시지 처리에 활용할 수 있다.

메모리 중심이라 낮은 지연을 제공하지만 Network 왕복, 명령 복잡도, 단일 Key 크기, 영속화와 복제 비용은 남는다. Redis를 “DB보다 빠른 Hash Map”으로만 보면 만료, 메모리 제한, 장애 조치와 정합성 문제를 놓친다.

## 2. 왜 필요한가
낮은 지연의 캐시, 세션, Rate Limit, 랭킹과 임시 조정 상태가 필요하다. 분산된 사본과 동시 변경이 늘수록 실패 경로를 정상 흐름처럼 설계해야 한다.

RDBMS에서 매 요청마다 같은 프로필과 설정을 읽으면 DB Buffer와 Connection이 소모된다. 변경이 드물고 잠시 오래된 값이 허용되면 Redis에 캐시해 읽기 부하를 줄일 수 있다. Sorted Set은 점수 순위를, Set은 중복 없는 Membership을, 원자 증가 명령은 Rate Limit Counter를 간단히 표현한다.

반면 재화 원장과 결제처럼 손실·중복을 허용하기 어려운 데이터는 Redis를 원본으로 삼기 전에 Persistence와 Failover에서 실제로 무엇을 보장하는지 검토해야 한다. 흔한 구조는 RDBMS를 원본으로 두고 Redis를 재구축 가능한 읽기 최적화로 사용하는 것이다.

## 3. 핵심 동작 원리
```text
client command→single command execution→memory data→optional persistence/replica
```
Redis 명령 하나는 원자적으로 처리되지만 여러 명령의 비즈니스 연산은 Lua나 Transaction 등 별도 설계가 필요하다. 영속성과 복제 설정에 따라 장애 시 손실 가능성이 있다.

Redis에서는 성능 최적화는 새 상태와 실패 가능성을 추가한다. 원본이 무엇인지, 성공 응답의 기준과 재처리 방법을 먼저 정한다.

### Event Loop와 명령 실행

Redis는 전통적으로 명령 실행을 중심 Event Loop에서 순차 처리하는 모델로 설명한다. 여러 Client가 동시에 요청해도 한 인스턴스에서 명령 하나의 핵심 실행이 다른 명령과 임의로 섞이지 않으므로 `INCR`, `HSET`, `ZADD` 같은 단일 명령은 원자적이다.

```text
Client A ─┐
Client B ─┼─> I/O Event Loop → Command A → Command B → Command C
Client C ─┘                        Memory Data Structure
```

최근 버전은 Network I/O, Background Free와 Persistence 같은 작업에 Thread를 사용할 수 있지만 데이터 명령의 원자성 모델을 단순히 “완전 Multi-threaded”로 바꾸어 이해하면 안 된다. 사용 버전과 기능을 확인한다.

한 명령이 오래 걸리면 뒤의 다른 Client 명령도 지연될 수 있다. 큰 Key 전체 삭제, 매우 큰 범위 조회, 복잡한 Lua Script와 O(N) 명령을 Hot Path에서 주의한다. 명령 시간 복잡도와 실제 N을 함께 본다.

### 주요 자료형

| 자료형 | 대표 명령·용도 | 주의점 |
|---|---|---|
| String | GET·SET·INCR, Cache·Counter | 큰 Value, 직렬화 비용 |
| Hash | HGET·HSET, 객체 Field | Field 전체 Scan·큰 Hash |
| List | LPUSH·BRPOP, 단순 Queue | 중간 탐색, 신뢰성 Queue 설계 |
| Set | SADD·SISMEMBER, Membership | 큰 집합 연산 비용 |
| Sorted Set | ZADD·ZRANGE, Ranking | Score 동점·갱신·큰 범위 |
| Stream | XADD·Consumer Group, Event | Pending·Ack·Trim 운영 |

Redis 내부 인코딩은 원소 수와 크기에 따라 달라질 수 있다. 자료형 이름만으로 정확한 메모리 크기를 예측하지 않고 실제 Memory Usage와 Cardinality를 측정한다.

### 단일 명령 원자성과 복합 로직

다음 두 명령은 각각 원자적이어도 사이에 다른 Client가 끼어들 수 있다.

```text
GET stock → 1
다른 Client가 stock을 0으로 변경
SET stock → 0
```

재고 차감은 Lua Script나 조건을 포함한 원자 명령으로 묶거나 최종 DB의 조건부 UPDATE로 보호한다. Lua Script는 서버에서 실행되는 동안 여러 Redis 명령을 하나의 원자 실행처럼 묶을 수 있지만 오래 실행되면 전체 Event Loop를 막을 수 있다.

```lua
local stock = tonumber(redis.call('GET', KEYS[1]) or '0')
if stock <= 0 then return 0 end
redis.call('DECR', KEYS[1])
return 1
```

이 Script의 Redis 내부 변경은 원자적으로 실행되지만 DB 아이템 지급과 한 원자 트랜잭션이 되는 것은 아니다. Script 성공 후 애플리케이션 Crash, 응답 유실과 중복 재시도까지 설계해야 한다.

### MULTI·EXEC와 WATCH

`MULTI` 이후 명령은 Queue되고 `EXEC`에서 순서대로 실행된다. 일반적인 RDBMS 트랜잭션처럼 명령 중간 오류가 전체를 자동 Rollback하는 모델로 생각하면 안 된다. 문법 오류와 실행 시 타입 오류의 동작을 구분하고 부분 효과 가능성을 제품 문서로 확인한다.

`WATCH`는 지정 Key가 변경되었는지 감시하고 `EXEC` 전에 바뀌면 트랜잭션을 실패시키는 낙관적 동시성 제어다. Client가 최신 값을 다시 읽고 제한적으로 재시도해야 한다. Hot Key에서는 충돌 재시도가 폭증할 수 있다.

### Pipeline

Pipeline은 여러 명령을 응답마다 기다리지 않고 한 번에 보내 Network 왕복을 줄인다. 명령이 하나의 원자 작업이 되거나 Transaction이 되는 것은 아니다.

```text
Without Pipeline: request → response → request → response
With Pipeline   : request1,2,3 ───────> response1,2,3
```

Batch가 너무 크면 Client·Server Buffer 메모리와 한 요청의 지연이 늘 수 있다. 크기 상한과 오류별 결과 처리를 둔다.

### TTL과 만료

Key에 TTL을 설정하면 일정 시간 뒤 만료된다. Redis는 접근 시 만료를 확인하는 수동적 방식과 일부 Key를 주기적으로 검사하는 능동적 방식을 함께 사용할 수 있다. TTL 시각이 지났다고 그 순간 별도 Thread가 모든 Key를 정확히 삭제한다고 가정하지 않는다. 논리적으로 만료된 Key는 접근 시 없는 것으로 취급될 수 있다.

많은 Key에 같은 만료 시각을 주면 만료 처리와 Cache Miss가 동시에 몰릴 수 있다. TTL에 무작위 Jitter를 더해 분산하고, 중요한 Hot Key는 미리 갱신하는 전략을 고려한다.

TTL은 Cache Staleness의 최대 시간을 제한할 수 있지만 DB 변경 직후 오래된 Cache가 남는 기간 자체를 없애지 않는다. Cache Invalidation 또는 Versioned Key와 함께 사용한다.

### Memory Limit과 Eviction

Redis는 `maxmemory` 한도에 도달하면 설정된 Eviction 정책에 따라 Key를 제거하거나 쓰기 명령을 실패시킬 수 있다. LRU·LFU는 정확한 전역 순서가 아니라 Sampling 기반 근사 정책일 수 있다. TTL이 있는 Key만 대상으로 하는 정책과 전체 Key 대상 정책을 구분한다.

원본 데이터와 Cache를 같은 인스턴스에 섞고 `allkeys-lru` 성격 정책을 쓰면 중요한 원본 Key도 제거될 수 있다. 역할별 Cluster·인스턴스를 분리하고 Eviction을 정상 운영 사건으로 관찰한다.

메모리 사용량은 Payload 합보다 크다. Key·객체 Metadata, Allocator Fragmentation, Replication Buffer, Client Output Buffer와 Fork 시 Copy-on-Write 여유를 포함한다. `used_memory` 하나만 보지 않고 RSS와 Fragmentation을 함께 본다.

### Persistence: RDB와 AOF

RDB Snapshot은 특정 시점의 전체 데이터 Snapshot을 파일로 만든다. 복구와 Compact한 Backup에 유리하지만 Snapshot 사이 최근 변경은 장애 시 잃을 수 있다. Background Save 과정의 Fork와 Copy-on-Write가 메모리·지연에 영향을 줄 수 있다.

AOF(Append Only File)는 변경 명령을 Log에 기록한다. Fsync 정책에 따라 매 명령, 일정 주기, OS에 위임하는 성격의 내구성·성능 Trade-off가 달라진다. AOF Rewrite는 현재 상태를 재구성하는 더 작은 Log를 만들지만 I/O와 추가 공간이 필요하다.

```text
RDB: [Snapshot t0] -------- [Snapshot t1]
     장애가 사이에 나면 최근 변경 손실 가능

AOF: command1 → command2 → command3 → fsync policy
```

RDB와 AOF를 함께 사용할 수도 있다. 중요한 것은 설정 이름이 아니라 성공 응답 이후 어떤 장애에서 몇 초 데이터가 손실될 수 있는지와 복구 시간을 정의하는 것이다.

### Replication과 Failover

Primary의 쓰기를 Replica가 비동기적으로 복제하는 구성이 일반적이다. Primary가 응답한 직후 Replica가 적용하기 전에 장애가 나고 오래된 Replica가 승격되면 최근 쓰기가 유실될 수 있다. Replica Read도 Lag 때문에 Stale할 수 있다.

Failover는 Sentinel 또는 Cluster 관리 기능이 Primary 장애를 판단하고 Replica를 승격한다. 네트워크 분할에서는 이전 Primary와 새 Primary가 잠시 동시에 쓰기를 받을 가능성과 Client Route 갱신을 고려한다. Redis가 제공하는 최소 Replica Ack·Wait 관련 설정은 손실 가능성을 줄일 수 있지만 완전한 강한 Consensus Commit과 동일하다고 단정하지 않는다.

### Redis Cluster와 Sharding

Redis Cluster는 Key를 Hash Slot에 배치하고 Slot을 Node에 분산한다. Multi-key 명령과 Lua Script는 관련 Key가 같은 Slot에 있어야 하는 제약이 생길 수 있다. Hash Tag를 사용해 `{player:101}:profile`, `{player:101}:items`처럼 같은 부분으로 Slot을 맞출 수 있지만 한 Player가 Hot하면 같은 Shard에 부하가 집중된다.

Resharding 중 Redirect, 재시도와 Client Cluster 지원을 확인한다. Key 수는 균등해도 Value 크기와 요청 빈도가 다르면 Memory·CPU 부하는 불균형할 수 있다.

### Pub/Sub과 Stream

Pub/Sub은 현재 구독 중인 Client에게 메시지를 전달하며 구독자가 끊겨 있으면 일반적으로 나중에 재생할 영속 Queue가 아니다. 중요한 이벤트 복구에는 적합하지 않을 수 있다. Stream은 Entry ID, Consumer Group, Pending과 Ack를 제공하지만 Trim, 재처리, 중복 소비와 Poison Message 운영이 필요하다.

“Redis로 메시징한다”는 말만으로 전달 보장을 알 수 없다. Pub/Sub, List, Stream 중 무엇을 쓰고 Consumer 장애 시 메시지가 어디에 남는지 설명한다.

### 분산 Lock

단일 Redis에 `SET key token NX PX ttl`로 Lock을 획득하고 소유 Token이 같은 경우에만 Lua로 삭제할 수 있다. TTL은 Client Crash 뒤 영구 Lock을 막지만 작업이 TTL보다 길면 Lock이 만료되어 두 Client가 동시에 작업할 수 있다.

```text
Client A Lock 획득, TTL 5초
Client A 7초 Pause
5초: Lock 만료 → Client B 획득
7초: A가 깨어나 외부 Resource 변경
      A와 B가 동시에 유효하다고 믿음
```

외부 저장소는 증가하는 Fencing Token을 받아 이전 Token의 쓰기를 거부해야 오래 멈춘 소유자의 작업을 막을 수 있다. Redis Lock만으로 DB의 UNIQUE와 조건부 UPDATE를 제거하지 않는다. 여러 Redis Node 기반 분산 Lock 알고리즘의 안전성은 장애 모델과 요구 수준을 신중히 검토한다.

## 4. 쉬운 예시
Redis에서는 두 서버가 동시에 마지막 아이템을 지급하려 할 때 애플리케이션의 사전 조회만으로는 부족하다. DB 조건부 갱신과 제약을 최종 방어선으로 두고 요청 ID로 재시도를 식별한다.

Redis Cache는 자주 보는 공지문을 입구 게시판에 복사해 두는 것과 비슷하다. 원본 문서는 DB에 있고 게시판이 사라지면 다시 붙일 수 있다. 게시판이 오래되거나 빈 상태에서 많은 사람이 동시에 원본 문서를 요청할 수 있으므로 무효화, TTL Jitter와 Stampede 방지가 필요하다.

Sorted Set 랭킹은 Member별 Score를 저장하고 Score 순서로 범위를 읽는다.

```text
ZADD season:7:ranking 1200 player:101
ZADD season:7:ranking 1500 player:202

Score 순서: player:202(1500), player:101(1200)
```

동점 순위 정의, Score의 부동소수점 표현, 시즌 종료 Snapshot과 DB 원장 복구 방식을 정한다. 랭킹을 Redis에만 두면 장애·잘못된 삭제 뒤 재구축 근거가 없을 수 있다.

## 5. 비슷한 개념과 비교
| 방식 | 장점 | 비용 |
|---|---|---|
| 직렬화·Lock | 강한 정합성 | 대기·Deadlock |
| Version·MVCC | 읽기 동시성 | 충돌 재시도·버전 관리 |
| Cache·Replica | 낮은 지연·확장 | Stale Data·무효화 |

| 구분 | Redis | RDBMS | In-process Cache |
|---|---|---|---|
| 접근 | Network + Memory | SQL·Storage Engine | Process Memory 직접 |
| 자료 모델 | Key 기반 Data Structure | Relation·Constraint·Join | Library 객체 |
| 공유 범위 | 여러 Process | 여러 서비스 | 단일 Process 중심 |
| 지속성 | 설정에 따라 선택·손실 범위 | WAL·Transaction 중심 | Process 종료 시 소멸 |
| 강점 | 낮은 지연·Atomic Command | 복합 정합성·조회 | 가장 낮은 Network 비용 |

Memcached 같은 단순 Cache와 비교하면 Redis는 풍부한 자료형, Persistence와 Replication 기능을 제공한다. 그만큼 명령 의미와 운영 선택이 복잡하다.

## 6. 장점과 단점
Redis에서는 동시성 제어와 분산 구조는 정확성, 처리량, 가용성을 높인다. 반면 Lock 대기, 복제 지연, 중복 처리, 운영 복잡도가 생긴다. 모든 데이터에 같은 강도의 정합성을 적용하지 않는다.

장점은 낮은 지연, 다양한 자료구조와 원자 명령, TTL, 복제·Cluster 생태계다. 단점은 RAM 비용, 큰 명령의 Event Loop 차단, Hot Key, Eviction, 비동기 복제 손실과 Cache 정합성이다. 기능 하나를 추가할 때 Persistence·Memory·Failover와 원본 복구 경로를 함께 결정한다.

## 7. 게임 서버·백엔드 실무 예시
Sorted Set으로 시즌 랭킹을 구성하고 DB를 최종 원본으로 둔다. Hot Key, 큰 Key, 만료 폭주, 느린 명령과 메모리 eviction을 관찰한다.

Redis에서는 운영에서는 Cache Hit Ratio만 보지 않고 DB 부하, Lag, Lock 대기, Retry, Hot Key·Shard와 p99를 함께 본다.

### 세션

세션 Token→Player ID와 만료를 Redis에 저장하면 여러 API 서버가 공유할 수 있다. 보안상 Token 원문 대신 Hash 저장, TTL 갱신 정책, 전체 로그아웃과 계정 정지 전파를 설계한다. Redis 장애 시 모든 로그인 사용자를 차단할지 DB·서명 Token으로 Fallback할지도 정한다.

### Rate Limit

고정 Window Counter는 `INCR`와 첫 생성 시 TTL을 원자 Script로 묶을 수 있다. 경계 시각에 두 Window 요청이 몰리는 Burst를 허용할 수 있다. Sliding Window·Token Bucket은 더 정교하지만 Key·명령 비용이 증가한다. 제한 실패 시 허용할지 차단할지 서비스 위험에 따라 결정한다.

### Cache 장애

Redis가 느려지면 Cache Miss와 Timeout 재시도가 DB를 동시에 압박할 수 있다. 짧은 Timeout, 제한된 Connection·Queue, Circuit Breaker와 DB 보호용 Admission Control을 둔다. 모든 요청이 즉시 DB로 Fallback하는 것이 가용성을 오히려 낮출 수 있다.

### 관찰 지표

명령별 p95·p99와 Slow Log, Operations/s, Event Loop 지연, CPU·Memory·RSS·Fragmentation, Eviction·Expiration, Hit·Miss, Connected Client와 Output Buffer, Network 대역폭, Replication Lag·Backlog, Fork·Persistence 시간, Cluster별 Key·Byte·Hot Key 분포를 본다.

Big Key는 `KEYS *` 같은 전체 Scan으로 운영 Primary를 막아 찾지 않는다. 점진적 SCAN과 Memory Sampling, Offline 분석을 사용하고 Key Cardinality와 Value Byte를 제한한다. 삭제도 큰 집합은 비동기 Free 성격 기능과 점진 분할을 검토한다.

## 8. 자주 하는 오해
- MVCC면 쓰기 충돌이 없다고 본다.
- Redis 명령 원자성이 전체 로직 원자성을 뜻한다고 본다.
- TTL만 있으면 캐시 정합성이 해결된다고 본다.
- Replica가 Primary와 항상 같은 값을 반환한다고 본다.
- Sharding이 JOIN과 Transaction을 자동 분산한다고 본다.
- Redis는 Memory만 사용하므로 지연이 항상 일정하다고 본다.
- Pipeline이 여러 명령을 하나의 Atomic Transaction으로 만든다고 생각한다.
- TTL 시각에 모든 Key가 즉시 물리 삭제된다고 본다.
- Replica Ack가 있으면 어떤 장애에서도 Write 손실이 없다고 생각한다.
- Pub/Sub이 끊긴 Consumer의 Message를 자동 보관한다고 본다.
- Redis 분산 Lock을 쓰면 DB 제약이 필요 없다고 본다.

## 9. 면접 질문
### Q1. 핵심 개념을 설명해 주세요.
Redis는 주로 메모리에 데이터를 보관하며 String, Hash, Set, Sorted Set과 원자 명령을 제공하는 데이터 구조 서버다.
### Q2. 어떤 Trade-off가 있나요?
Redis 명령 하나는 원자적으로 처리되지만 여러 명령의 비즈니스 연산은 Lua나 Transaction 등 별도 설계가 필요하다. 영속성과 복제 설정에 따라 장애 시 손실 가능성이 있다.
### Q3. 게임 백엔드 적용 사례는 무엇인가요?
Sorted Set으로 시즌 랭킹을 구성하고 DB를 최종 원본으로 둔다. Hot Key, 큰 Key, 만료 폭주, 느린 명령과 메모리 eviction을 관찰한다.
### Q4. 장애 시 무엇을 확인하나요?
Redis에서는 원본 상태, Lock과 Retry, Cache·Replica 지연, 중복 요청과 복구 절차를 확인한다.

### Q5. Redis 단일 명령 원자성은 무엇을 의미하나요?

한 명령의 실행이 다른 명령과 중간 단계에서 섞이지 않는다는 의미다. GET 후 SET처럼 여러 명령 사이에는 다른 Client가 실행될 수 있고, Redis 명령과 DB 변경이 하나의 원자 작업이 되는 것도 아니다.

### Q6. RDB와 AOF를 비교해 주세요.

RDB는 특정 시점 전체 Snapshot이라 복구 파일이 Compact하지만 Snapshot 사이 변경 손실 가능성이 있다. AOF는 변경 명령을 이어 기록해 더 촘촘한 복구가 가능하지만 파일·쓰기 비용과 Rewrite가 필요하다. 실제 손실 범위는 Save·Fsync 정책에 달려 있다.

### Q7. Redis에서 Hot Key가 왜 문제인가요?

특정 Key의 모든 요청이 같은 Shard와 Event Loop, Network에 집중된다. Key 수가 균등해도 요청 빈도와 Value 크기가 치우칠 수 있다. Local Cache, Read Replica, Key 분할과 요청 합치기를 정합성 요구에 맞춰 적용한다.

## 10. 예상 꼬리질문
- 실패 후 재시도를 어떻게 안전하게 하나요?
- 오래된 읽기를 허용할 수 없는 데이터는 무엇인가요?
- Hot Key나 Hot Shard를 어떻게 찾나요?
- Failover 중 쓰기 결과를 어떻게 판단하나요?
- 분산 상태의 원본은 무엇인가요?
- MULTI·EXEC는 RDBMS Transaction과 어떻게 다른가요?
- Pipeline의 장점과 위험은 무엇인가요?

## 11. 30초 모범답변
> Redis는 메모리 기반 데이터 구조와 원자 명령으로 빠른 캐시·랭킹·세션을 제공하지만 최종 원본 여부, 영속성, Hot Key와 메모리 정책을 명확히 해야 합니다. Redis을 선택하거나 적용할 때는 정확성, 성능과 구현 복잡도의 균형을 함께 봐야 합니다. Sorted Set으로 시즌 랭킹을 구성하고 DB를 최종 원본으로 둔다.

## 12. 1~2분 확장답변
> Redis는 메모리 기반 데이터 구조와 원자 명령으로 빠른 캐시·랭킹·세션을 제공하지만 최종 원본 여부, 영속성, Hot Key와 메모리 정책을 명확히 해야 합니다. 먼저 데이터별 정합성과 지연 요구를 분류합니다. 강한 불변식은 DB Constraint와 짧은 Transaction으로 지키고, Cache와 Replica는 허용 가능한 Stale 범위에서 사용합니다. 장애와 Timeout은 중복될 수 있으므로 멱등성 키, 제한된 Retry와 관찰 지표를 함께 둡니다.

## 13. 핵심 요약
- Redis는 주로 메모리에 데이터를 보관하며 String, Hash, Set, Sorted Set과 원자 명령을 제공하는 데이터 구조 서버다.
- 원본과 성공 기준을 명확히 한다.
- 성능 구조는 새로운 정합성 비용을 만든다.
- Timeout과 Retry에는 멱등성이 필요하다.
- 평균보다 Lag, Lock과 p99를 관찰한다.
- Redis 기능은 Atomic Command, Memory, Persistence, Replication과 장애 손실 범위를 함께 평가한다.
- Cache·Ranking·Session의 원본과 재구축 경로, Hot Key·Big Key 보호를 명시한다.

## 한 줄 정리
> Redis는 메모리 기반 데이터 구조와 원자 명령으로 빠른 캐시·랭킹·세션을 제공하지만 최종 원본 여부, 영속성, Hot Key와 메모리 정책을 명확히 해야 합니다.
