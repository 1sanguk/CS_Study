---
difficulty: 3
reading_time: 20분
interview_frequency: 4
importance: 4
---

# 04. Hash Table


## 학습 목표

- Hash 함수, Load Factor, Rehash Spike가 평균/최악 복잡도에 미치는 영향을 구분하고, 게임 서버 Lookup 지연 원인을 진단할 수 있다.
- Chaining vs Open Addressing의 메모리·Cache 지역성 트레이드오프를 비교하고, 세션 수와 충돌 빈도를 기준으로 적합한 방식을 선택할 수 있다.
- hashCode·equals 계약 위반, Mutable Key 수정, Hash Flooding이 조회 실패·O(N) 악화로 이어지는 시나리오를 설명하고 방어 방법을 제시할 수 있다.
- 게임 서버 세션 조회·아이템 캐시·LRU Cache에서 HashMap, ConcurrentHashMap, 외부 KV 저장소(Redis) 중 어느 것을 선택하는지 판단 근거를 설명할 수 있다.

## 1. 개요

해시 테이블은 Key의 Hash 값을 Bucket 위치로 변환해 평균 O(1) 조회·삽입·삭제를 제공한다.

해시 테이블(Hash Table)은 키를 해시 함수에 넣어 큰 정수 형태의 해시 값을 만들고 이를 버킷(Bucket) 인덱스로 축소한다. 해당 버킷의 후보만 실제 키 동등성으로 비교하므로 전체 원소를 순차 탐색하지 않고 평균적으로 빠르게 찾는다.

서로 다른 키가 같은 버킷에 갈 수 있는데 이를 해시 충돌(Hash Collision)이라고 한다. 충돌은 오류가 아니라 유한한 버킷에 많은 키를 매핑하면 피할 수 없는 정상 상황이다. 체이닝(Chaining)이나 개방 주소법(Open Addressing)으로 여러 키를 구분한다.

## 2. 왜 필요한가
정렬 순서보다 빠른 Key 기반 접근이 중요한 세션과 객체 조회에 필요하다. 자료구조 선택은 Big-O뿐 아니라 데이터 크기, 접근 패턴, 메모리 배치와 갱신 빈도에서 시작한다.

백만 연결 중 `session_id` 하나를 찾을 때 배열을 순차 탐색하면 O(N)이다. 균형 검색 트리는 O(log N)과 정렬 순회를 제공하지만 정렬이 필요 없고 동등 키 조회가 대부분이라면 Hash Table의 평균 O(1)이 단순하고 빠를 수 있다.

Hash Table은 원소 수보다 여유 있는 버킷 배열을 두고 해시 값 계산과 충돌 처리 Metadata를 저장한다. 메모리 Overhead와 Resize 순간 비용을 지불해 빠른 키 접근을 얻는다. 작은 원소 수에서는 정렬 배열의 지역성과 낮은 Overhead가 더 빠를 수 있다.

## 3. 핵심 동작 원리
```text
key→hash→bucket index→collision chain/probe→key equality
```
충돌은 Chaining 또는 Open Addressing으로 처리한다. Load Factor가 높으면 Resize나 탐사 비용이 증가한다. 평균 O(1)이지 최악 O(n)을 배제하지 않는다.

평균·최악 복잡도와 함께 할당, Cache 지역성, 순회 비용, 참조 안정성을 봐야 한다.

### 해시 함수와 동등성

해시 함수는 임의 길이 키를 고정 크기 정수로 변환한다. 같은 키는 테이블에 들어 있는 동안 같은 해시 값을 만들어야 한다.

```text
hash("player:101") = 0x8A31...
bucket_index = hash % bucket_count
```

좋은 일반 Hash는 실제 키 분포에서 버킷을 고르게 사용하고 계산이 충분히 빠르다. 해시 값이 다르면 키도 다르지만 해시 값이 같다고 키가 같은 것은 아니다. 최종적으로 Equality 비교가 필요하다.

다음 규칙을 지켜야 한다.

```text
if a == b, then hash(a) == hash(b)  // 반드시 필요
hash(a) == hash(b)                   // a == b를 의미하지 않음
```

대소문자를 무시하는 문자열 Equality를 쓰면서 Hash는 대소문자를 구분하면 같은 것으로 보는 두 키가 서로 다른 버킷에 들어가 조회가 실패할 수 있다. Hash와 Equality의 정규화 규칙을 일치시킨다.

### 버킷 인덱스

해시 값을 버킷 수 범위로 줄이는 데 나머지 연산이나 Bit Mask를 사용할 수 있다. 버킷 수가 2의 거듭제곱이면 하위 Bit가 Index에 직접 영향을 줄 수 있어 Hash의 하위 Bit 분포가 나쁘면 충돌이 몰릴 수 있다. 라이브러리가 추가 Mixing을 할 수 있으므로 구현을 직접 가정하지 않는다.

해시 함수는 모든 키를 완벽히 고르게 만들 필요가 있지만 불가능한 일반 상황이 많다. 목표는 예상·공격 입력에서 충분히 고른 분포와 낮은 충돌이다.

### Separate Chaining

각 버킷이 충돌 키들의 리스트·동적 배열·트리를 가리킨다.

```text
bucket 0 → [K8,V8] → [K21,V21]
bucket 1 → null
bucket 2 → [K2,V2]
bucket 3 → [K7,V7] → [K15,V15] → [K19,V19]
```

조회는 버킷을 찾고 Chain의 해시·키를 비교한다. 평균 Chain 길이가 짧으면 O(1)에 가깝다. 최악에는 모든 키가 한 버킷에 들어가 O(N)이다. 일부 런타임은 Chain이 길어지면 균형 트리로 바꿔 공격 최악을 완화할 수 있지만 키 비교 조건과 구현에 따라 다르다.

장점은 삭제와 높은 Load Factor 처리가 비교적 단순하고 노드 주소가 Rehash 전후에도 안정적인 구현이 가능하다는 점이다. 단점은 노드별 할당, Pointer Overhead와 낮은 Cache 지역성이다. Bucket 내부를 작은 연속 배열로 두는 변형도 있다.

### Open Addressing

모든 엔트리를 버킷 배열 자체에 저장한다. 충돌하면 정해진 탐사 순서로 다른 빈 슬롯을 찾는다.

```text
index:   0      1      2      3      4
       [K5]   [K1]   [K9]   [ _ ]  [K4]

hash(K9) → 1, slot 1 occupied
probe 2 → K9 저장
```

선형 탐사(Linear Probing)는 다음 슬롯을 차례로 확인해 Cache 친화적이지만 연속 Cluster가 커지는 Primary Clustering이 생긴다. Quadratic Probing과 Double Hashing은 탐사 간격을 바꿔 뭉침을 줄이지만 구현과 Cache 특성이 다르다. Robin Hood Hashing은 탐사 거리가 긴 엔트리가 짧은 엔트리의 자리를 가져 탐사 길이 분산을 줄이는 방식이다.

Open Addressing은 원소가 배열에 있어 지역성이 좋고 별도 노드 할당이 적다. Load Factor가 너무 높으면 빈 슬롯을 찾는 Probe 수가 급격히 늘어 여유 공간이 중요하다. Resize 시 엔트리 위치가 바뀌어 참조 안정성도 낮을 수 있다.

### 삭제와 Tombstone

Open Addressing에서 슬롯을 단순 Empty로 만들면 그 뒤 Probe Chain에 있는 키 조회가 조기에 멈출 수 있다.

```text
K1(home 1) at 1, K9(home 1) at 2
K1 삭제 후 slot 1을 Empty 처리
K9 조회: slot 1 Empty → 없다고 잘못 종료
```

삭제됨을 나타내는 Tombstone을 두거나 뒤 Cluster를 재배치한다. Tombstone이 쌓이면 Probe가 길어져 주기적 Rehash가 필요하다.

### Load Factor

```text
load_factor = number_of_elements / number_of_buckets
```

체이닝에서는 평균 Chain 길이, Open Addressing에서는 점유율과 Probe 길이에 영향을 준다. 임계값을 넘으면 더 큰 Bucket 배열을 만들고 모든 엔트리의 새 버킷 위치를 계산하는 Rehash를 수행한다.

Load Factor 임계값은 구현 전략에 따라 다르다. 무조건 낮게 설정하면 충돌은 줄 수 있지만 Memory와 Cache Footprint가 커진다. 높으면 Memory 효율은 좋아지지만 비교·Probe가 늘어난다.

### Rehash와 Resize

```text
Old buckets: 8, elements: 6
        ↓ allocate 16 buckets
각 Key의 hash를 새 bucket mask에 적용해 재배치
        ↓
New buckets: 16
```

Rehash는 O(N)이고 순간적으로 Old·New 배열 Memory가 함께 필요할 수 있다. 일반 Insert는 평균 O(1)이지만 Resize가 걸린 한 번은 O(N)이다. 예상 원소 수를 알면 `reserve`·초기 Capacity로 Hot Path의 Rehash를 줄인다.

일부 Concurrent·대형 Table은 Incremental Rehash로 Bucket 일부씩 옮겨 지연 Spike를 분산한다. 그동안 조회가 Old와 New Table을 모두 확인해야 해 상태가 복잡해진다.

### 시간 복잡도

| 연산 | 평균 | 최악 | 최악 원인 |
|---|---:|---:|---|
| 조회 | O(1) | O(N) | 모든 Key 충돌·긴 Probe |
| 삽입 | O(1) | O(N) | Rehash·충돌 |
| 삭제 | O(1) | O(N) | 긴 Chain·Probe |
| 전체 순회 | O(N+B) 가능 | O(N+B) | 빈 Bucket까지 순회 구현 |

B는 버킷 수다. Open Addressing 순회는 버킷 배열 전체를 훑을 수 있고 Chaining도 Bucket과 Node를 방문한다. Hash Table은 정렬 순서를 제공하지 않으며 반복 순서가 Resize·실행마다 달라질 수 있다.

### Mutable Key 문제

엔트리를 삽입한 뒤 Equality·Hash에 쓰는 Key 필드를 바꾸면 현재 Bucket 위치와 새 Hash가 불일치한다.

```text
insert key Player(name="A") → bucket 3
key.name = "B"              → hash now bucket 7
lookup "B" goes bucket 7, object remains bucket 3
```

Key는 불변 값으로 사용하거나 변경하려면 기존 Key로 삭제한 뒤 새 Key로 삽입한다. 객체 참조를 Key로 쓸 때 Equality가 Identity인지 값 기반인지 확인한다.

### Hash Flooding

공격자가 같은 버킷에 들어가는 많은 문자열을 보내면 평균 O(1)이 O(N)으로 악화되어 CPU DoS가 될 수 있다. 외부 입력 키에는 프로세스마다 무작위 Seed를 사용하는 Hash, 충돌 Chain Tree 변환, 요청 크기·키 수 제한을 사용한다.

암호학적 Hash가 일반 Map에 항상 필요한 것은 아니다. 보안 Hash는 계산 비용이 더 크다. 위협 모델과 런타임의 내장 Hash 방어를 확인한다.

### Hash Table과 동시성

한 스레드가 조회하는 동안 다른 스레드가 Rehash하면 Bucket 배열과 엔트리 위치가 바뀌어 Data Race와 메모리 손상이 생길 수 있다. 일반 `unordered_map`·`Dictionary`는 동시 쓰기를 자동 지원하지 않는다.

전체 Mutex, Shard별 Lock, Reader-Writer Lock이나 검증된 Concurrent Hash Map을 사용한다. “서로 다른 Key를 수정하므로 안전하다”는 보장은 Resize와 공통 Metadata 때문에 성립하지 않을 수 있다.

Concurrent Map의 `GetOrAdd` 성격 API도 Factory가 경쟁 중 여러 번 호출될 수 있고 하나만 저장될 수 있다. Factory의 외부 부작용이 정확히 한 번이라고 가정하지 않는다. 복합 연산은 제공하는 원자 API 범위를 확인한다.

### Stable Reference

Rehash와 삭제가 엔트리 주소·Iterator에 어떤 영향을 주는지는 컨테이너 구현마다 다르다. C++ Node 기반 `unordered_map`과 Flat Hash Map의 안정성이 다를 수 있고 관리형 Map의 내부 배열 이동도 있다. 값에 장기 Pointer가 필요하면 컨테이너 계약을 확인하거나 별도 Object Pool·Handle을 사용한다.

## 4. 쉬운 예시
플레이어를 ID로 찾는 작업과 접속 순서대로 처리하는 작업은 요구가 다르다. 전자는 Key 조회 구조, 후자는 Queue가 자연스럽다. 한 구조로 모든 요구를 해결하려 하지 않는다.

사물함 번호를 계산해 물건을 넣는 것과 비슷하다. 서로 다른 사용자가 같은 번호를 배정받으면 같은 사물함 안에서 이름표를 비교하거나 다음 빈 사물함을 찾는다. 실제 Hash Table에서는 Hash가 Bucket Index를 만들고 Chaining·Probe 뒤 Equality로 정확한 Key를 확인한다.

사물함 수가 너무 적으면 충돌이 많아지고, 너무 많으면 빈 공간이 낭비된다. Load Factor가 이 균형을 나타낸다.

게임 서버 세션 관리에 적용하면 다음과 같다.

```java
// 게임 서버 세션 관리: ConcurrentHashMap + computeIfAbsent
class SessionManager {
    // 초기 용량 8192, Load Factor 0.75 → 6144개까지 Rehash 없음
    private final ConcurrentHashMap<Long, Session> sessions =
        new ConcurrentHashMap<>(8192, 0.75f);

    Session getOrCreate(long playerId) {
        // computeIfAbsent: Key가 없을 때만 람다 실행 → 중복 생성 방지
        return sessions.computeIfAbsent(playerId, id -> new Session(id));
    }

    void remove(long playerId) {
        sessions.remove(playerId);
    }

    int activeCount() { return sessions.size(); }
}
```

- 초기 용량 8192 선택 이유: 동접 5000 × 1.5 버퍼, Rehash Spike 방지
- ConcurrentHashMap: 세그먼트 락으로 멀티스레드 안전, 단순 HashMap은 동시 삽입 시 Infinite Loop 위험(Java 7 이하) 또는 데이터 손실

## 5. 비슷한 개념과 비교
| 요구 | 유리한 구조 | 핵심 비용 |
|---|---|---|
| 순차 순회 | 연속 배열 | 중간 이동 |
| Key 조회 | Hash·Tree | Hash 충돌·균형 |
| 순서 제한 | Stack·Queue | 제한된 접근 |

| 구분 | Hash Table | Balanced Tree | Sorted Array |
|---|---|---|---|
| Key 조회 | 평균 O(1), 최악 O(N) | O(log N) | O(log N) |
| 삽입·삭제 | 평균 O(1) | O(log N) | O(N) 이동 |
| 정렬 순회 | 제공 안 함 | O(N) 순서 | O(N) 순서 |
| 범위 조회 | 부적합 | O(log N + K) | O(log N + K) |
| Memory | Bucket·여유·Metadata | Node Pointer·균형 정보 | 낮은 Overhead |
| 지역성 | 구현별, Flat 방식 좋음 | Pointer 추적 | 좋음 |

Hash Set은 Value 없이 Key 존재만 관리하는 Hash Table로 볼 수 있다. 중복 제거와 Membership에 적합하다. Bloom Filter는 더 적은 Memory로 “없음”을 빠르게 판단하지만 False Positive가 있고 원소 Value를 저장하지 않는다.

## 6. 장점과 단점
적합한 자료구조는 코드를 단순하게 하고 예상 복잡도를 제공한다. 부적합한 구조는 불필요한 탐색·할당·메모리 이동을 만든다. 작은 데이터에서는 단순한 배열이 복잡한 구조보다 빠를 수 있다.

**장점**
- O(1) 평균 조회·삽입·삭제 (단, 충돌·Rehash 시 최악 O(N))
- Key 기반 직접 접근으로 탐색 불필요
- 동적 크기 조정(Rehash)으로 미리 정확한 크기를 알 필요 없음
- LRU Cache, 빈도수 집계 등 다른 구조와 조합 용이

**단점**
- Rehash 시 O(N) 복사 + p99 Stutter 발생
- 메모리 Overhead: 빈 Bucket + 포인터·메타데이터 공간
- 반복 순서 비결정적 → 직렬화·재현에 사용 불가
- hashCode·equals 계약 위반 시 조회 실패 (컴파일 오류 없음)
- 외부 입력 Key 사용 시 Hash Flooding으로 O(N) 악화 가능

## 7. 게임 서버·백엔드 실무 예시
sessionId→Session, playerId→Player Map에 사용한다. 신뢰하지 않는 Key의 Hash 공격, Mutable Key, 동시 접근과 Resize 지연을 고려한다.

운영에서는 원소 수 분포, 연산 비율, 할당률, p99 지연을 측정한다. 동시 접근이 있다면 자료구조 자체와 별도로 소유권과 동기화를 설계한다.

### Session Map

`session_id → SessionHandle`을 Map에 저장한다. ID는 충분히 무작위이고 불변이어야 하며 외부가 대량의 공격 Key를 만들 수 있으므로 연결·요청 Rate Limit을 둔다. Session 객체를 Map 안에 직접 두면 Rehash 시 주소 안정성을 확인하고, 별도 Pool Handle이면 삭제 후 Generation을 검증한다.

### Entity Lookup + Dense Array

ID 조회는 Hash Map, 전체 Tick 순회는 Dynamic Array로 분리할 수 있다.

```text
Map: entity_id → dense_index
Array: [Entity A][Entity B][Entity C]
```

삭제는 Array Swap-and-pop 후 이동된 Entity의 Map Index를 갱신한다. 두 구조의 불변식을 같은 소유 Thread나 Lock으로 보호한다. 하나만 갱신되면 잘못된 Entity를 찾는다.

### Interest Management

공간 Cell ID→Entity Set Map을 사용할 수 있다. Entity 이동은 Old Cell Set 삭제와 New Cell Set 추가를 함께 수행한다. Hot Cell 하나의 Set이 매우 커질 수 있어 Cell 크기와 원소 분포를 측정한다. 공간 범위 조회에는 Grid·Tree 구조가 더 적합할 수 있다.

### Deduplication

한 Tick에 처리한 Command ID를 Hash Set으로 저장해 중복을 막을 수 있다. Set을 무제한 유지하면 Memory가 증가하므로 Sequence Window·TTL과 Session 종료 시 정리한다. 프로세스 재시작 후에도 중복 방지가 필요하면 Durable DB의 멱등성 Key가 필요하다.

### 운영 측정

원소 수·Bucket 수·Load Factor, 충돌·최대 Probe 길이, Rehash 횟수·시간, Lookup p99, Key·Value Byte, 할당률, Hot Key, Lock 경쟁을 본다. 표준 Library가 충돌 지표를 노출하지 않으면 벤치마크와 Profiling으로 실제 접근 비용을 확인한다.

최대 동시 Session을 추정해 시작 시 Reserve하면 Rehash를 줄일 수 있지만 공격자가 Capacity만큼 Memory를 차지하게 하지 않도록 Admission Limit을 함께 둔다.

## 8. 자주 하는 오해
- **충돌이 발생하면 Hash Table이 잘못 구현된 것이라고 생각한다** — 충돌은 오류가 아니라 유한한 Bucket에 많은 Key를 매핑할 때 수학적으로 불가피한 현상이다. Chaining·Open Addressing으로 처리하며, 충돌 자체보다 충돌 빈도와 최대 Chain 길이가 성능 지표다.
- **Hash 값이 같으면 Key도 같다고 본다** — Hash 충돌로 서로 다른 Key가 같은 Hash 값을 가질 수 있다. Bucket을 찾은 뒤 반드시 Equality 비교로 정확한 Key를 확인해야 한다.
- **`a == b`인데 Hash가 달라도 Table이 알아서 찾는다** — hashCode·equals 계약을 직접 구현할 때 `a == b`이면 `hash(a) == hash(b)`를 보장해야 한다. 계약이 깨지면 Table이 알아서 보정하지 않고 조회 실패가 발생한다.
- **다른 Key를 여러 Thread가 수정하면 일반 Map도 안전하다** — Resize와 내부 Metadata 갱신은 공유 상태이므로 서로 다른 Key를 건드려도 Data Race가 발생한다. ConcurrentHashMap 등 검증된 Concurrent 구현을 사용해야 한다.
- **Hash Table 반복 순서를 저장·전송 Protocol로 믿는다** — 반복 순서는 구현·Resize·실행마다 달라질 수 있어 비결정적이다. 직렬화나 순서 의존 Protocol에는 정렬된 구조를 별도로 사용해야 한다.
- **Mutable Key의 필드를 수정해도 기존 Key로 조회할 수 있다** — Hash는 삽입 시점에 Bucket 위치를 결정한다. 삽입 후 Key의 hashCode에 영향을 주는 필드를 변경하면 이전 Bucket에서 찾지 못해 조회 실패·유령 엔트리가 생긴다.
- **외부 입력 Key를 그대로 사용해도 Hash Table은 항상 O(1)이다** — 공격자가 동일 Hash 값을 가진 Key를 대량 삽입하면 모든 항목이 한 Bucket에 몰려 O(N)으로 악화된다(Hash Flooding). 외부 입력에는 무작위 Seed Hash가 필요하다.

## 9. 면접 질문
### Q1. Load Factor 0.9 vs 0.5 상황에서 게임 서버 세션 조회 지연 패턴은 어떻게 다르고, 임계값은 어떻게 선택하나요?

Load Factor 0.9에서는 Bucket 점유율이 높아 Chaining의 평균 Chain 길이가 길어지고, Open Addressing에서는 빈 Slot을 찾는 Probe 수가 급격히 증가한다. 결과적으로 평균 조회 시간이 늘고 Rehash Spike가 더 자주 발생해 p99 지연이 불안정해진다. Load Factor 0.5는 충돌이 적고 Probe가 짧아 안정적이지만 메모리 낭비가 크고 Rehash 빈도가 높아진다. 게임 서버에서는 일반적으로 0.7~0.75를 균형점으로 사용하고, 동접 피크를 예측해 초기 Capacity를 Reserve해 Rehash Spike 자체를 줄이는 것이 우선이다.

### Q2. 게임 서버 로직 스레드와 네트워크 스레드가 세션 Map에 동시에 접근할 때, HashMap 대신 ConcurrentHashMap을 선택하는 판단 기준은 무엇이고 그래도 원자성이 보장되지 않는 연산은 어떤 것인가요?

HashMap은 동시 쓰기 시 Resize 중 내부 배열 참조가 꼬여 Data Race·무한 루프(Java 7 이하)·데이터 유실이 발생한다. 로직 스레드(게임 틱)와 네트워크 스레드(패킷 수신)가 같은 Map을 읽고 쓰는 순간부터 ConcurrentHashMap이 필수다. ConcurrentHashMap은 Segment(Java 7) 또는 CAS+Synchronized per-bucket(Java 8+) 방식으로 버킷 단위 락을 사용해 동시 읽기를 허용하면서 쓰기 충돌을 최소화한다. 다만 `get → 조건 확인 → put` 처럼 두 연산 사이에 다른 스레드가 끼어드는 복합 연산은 원자성이 없다. 이 경우 `computeIfAbsent`, `putIfAbsent`, `compute` 같은 단일 원자 API를 사용해야 한다. `computeIfAbsent`는 람다가 경쟁 중 여러 번 호출될 수 있으므로 람다 안에서 외부 부작용(DB 삽입 등)이 정확히 한 번 실행된다고 가정하면 안 된다.

### Q3. 동접 5만 서버에서 세션 HashMap에 Rehash Spike가 발생했다. 어느 시점에 어떤 지표로 감지하고 어떻게 방지하는가?

Load Factor가 임계값(보통 0.75)을 넘는 시점에 Rehash가 트리거된다. 감지 지표로는 세션 삽입 p99 지연 급등, GC(Java) 또는 메모리 할당 급증, HashMap의 capacity 변화 로그를 본다. 방지하려면 시작 시 예상 최대 동접 수 × 1.5 / Load Factor 값으로 초기 Capacity를 Reserve한다. 예를 들어 동접 5만이면 `50000 * 1.5 / 0.75 = 100000`으로 초기화한다. 서비스 중 Spike가 발생하면 Incremental Rehash를 지원하는 구현으로 전환하거나, Redis 등 외부 KV 저장소로 세션을 이전한다.

### Q4. 플레이어 ID를 직접 구현한 PlayerKey 클래스를 Map Key로 쓸 때 equals가 true인데도 Map에서 찾지 못하는 버그가 발생했다. 원인 진단 순서와 방어 방법은 무엇인가요?

hashCode·equals 계약에서 `a.equals(b)`이면 반드시 `a.hashCode() == b.hashCode()`여야 한다. 이 계약이 깨지면 equals가 true이더라도 hashCode가 다른 탓에 서로 다른 Bucket으로 안내되어 조회 실패가 발생한다. 진단 순서는 다음과 같다. 첫째, 삽입 시 key의 hashCode를 로그로 남겨 조회 시 hashCode와 일치하는지 확인한다. 둘째, PlayerKey의 hashCode 구현이 equals에서 쓰는 모든 필드를 동일하게 사용하는지 검토한다. 예를 들어 equals는 `playerId + serverId`를 비교하는데 hashCode는 `playerId`만 사용하면 계약 위반이다. 셋째, Mutable Key 문제를 확인한다. 삽입 후 hashCode에 영향을 주는 필드(playerId, serverId 등)가 외부에서 변경되면 Bucket 위치와 실제 Hash 값이 달라져 조회 실패가 발생한다. 방어 방법으로는 PlayerKey를 불변 클래스로 설계하고, hashCode와 equals에서 사용하는 필드 집합을 일치시키며, @Override 어노테이션으로 컴파일 단계에서 메서드 시그니처 오류를 차단한다.

### Q5. 외부 플레이어가 보낸 문자열을 Key로 그대로 사용하는 게임 서버에서 Hash Flooding 공격이 발생했을 때, 어떤 증상으로 감지하고 어떤 순서로 방어하나요?

Hash Flooding은 공격자가 동일한 Hash 값을 가진 Key를 대량으로 삽입해 모든 Key가 한 Bucket에 몰리게 만들고, 평균 O(1) 조회를 O(N)으로 악화시켜 CPU를 고갈시키는 DoS 공격이다. 증상은 세션 조회·아이템 캐시 조회 p99가 수십 ms에서 수백 ms로 급등하고, CPU 사용률이 특정 스레드 한 개에서 100%에 가깝게 솟는 것으로 나타난다. GC 로그가 정상이고 DB 지연도 없는데 서버 전체가 느리면 Hash Flooding을 의심한다. 방어 순서는 다음과 같다. 첫째, 즉각 방어로 요청당 Key 수 제한과 개별 Key 길이 제한을 적용한다(예: Key 256바이트 초과 차단). 둘째, 해시 함수에 프로세스 시작 시 생성한 무작위 Seed를 적용한다(Java의 `String.hashCode`는 Seed가 없으므로 공격 가능하다). 셋째, Chaining 구현이라면 Chain 길이가 임계값(예: 8)을 넘을 때 균형 트리로 전환하는 옵션을 확인한다(Java HashMap의 TREEIFY_THRESHOLD). 넷째, 외부 입력 Key는 내부 무작위 UUID나 검증된 식별자로 치환하고 원본 문자열은 Map Key로 직접 사용하지 않는다.

### Q6. 게임 서버 세션 Map에 Chaining 방식을 쓰는 상황과 Open Addressing 방식을 쓰는 상황을 구분하는 기준은 무엇이고, 세션 삭제가 빈번한 환경에서 Open Addressing 선택 시 어떤 추가 비용이 생기나요?

Chaining은 세션 삭제가 빈번하고 Load Factor를 0.8 이상 높게 유지해야 할 때 유리하다. 노드를 Chain에서 제거하면 끝이므로 삭제 처리가 단순하고, Tombstone이 쌓이지 않는다. 반면 노드별 동적 할당과 Pointer 추적으로 Cache Miss가 잦아 조회 단가가 높다. Open Addressing은 엔트리가 배열 연속 메모리에 있어 Cache 지역성이 좋고 Pointer 할당 오버헤드가 없다. 세션 수가 적고(수천 이하) 조회 빈도가 매우 높으며 삭제보다 조회가 압도적인 환경에서 유리하다. 그러나 삭제가 빈번한 환경에서는 Tombstone 문제가 심각해진다. 슬롯을 단순 Empty로 바꾸면 뒤 Probe Chain에 있는 Key 조회가 조기 종료되므로 Tombstone 마커를 남겨야 한다. Tombstone이 쌓일수록 Probe 길이가 늘어 O(1)이 실질적으로 O(K)가 되며, 주기적인 Rehash로 Tombstone을 정리해야 한다. 결론적으로 세션 삭제(접속 해제)가 빈번한 게임 서버 환경에서는 Chaining(또는 ConcurrentHashMap)이 운영 복잡도 측면에서 더 안전하다.

## 10. 예상 꼬리질문
- Load Factor를 0.75보다 더 낮게(예: 0.5) 설정해야 하는 게임 서버 시나리오는 어떤 경우인가요?
- 게임 서버 틱(16ms 주기) 도중 Rehash Spike가 터지면 p99에 어떤 영향이 생기고, 사전에 막으려면 무엇을 해야 하나요?
- ConcurrentHashMap의 `computeIfAbsent`가 원자 연산임에도 람다가 두 번 실행될 수 있는 경우는 언제인가요?
- 세션 Map에서 Rehash 직후 기존 Session 포인터가 무효화되는 상황은 어떤 구현에서 발생하나요?
- HashMap에서 서로 다른 Key를 각각 다른 스레드가 수정할 때도 Data Race가 발생하는 이유는 무엇인가요?
- Hash Flooding 공격에서 Chain 길이가 TREEIFY_THRESHOLD(8)를 넘으면 Java HashMap이 어떻게 대응하고, 그 대응이 완전한 방어가 되지 않는 이유는 무엇인가요?
- 게임 서버에서 세션 Map과 Entity Dense Array를 함께 쓸 때, 세션 삭제 순간 두 구조의 불변식이 깨지는 시나리오와 방어 방법은 무엇인가요?
- 외부 플레이어 입력 문자열을 Map Key로 쓰지 않고 내부 UUID로 치환할 때 발생하는 추가 Lookup 비용은 어떻게 측정하나요?

## 11. 30초 모범답변
> Hash Table은 평균 O(1) 조회를 제공하지만 Load Factor와 Hash 분포가 실질 성능을 결정합니다. 게임 서버에서는 세 가지를 주로 판단합니다. 첫째, Load Factor를 0.75 이하로 유지하고 예상 최대 동접 × 1.5 / Load Factor로 초기 Capacity를 Reserve해 Rehash Spike 자체를 막습니다. 둘째, 로직·네트워크 스레드가 동시에 접근하면 HashMap이 아닌 ConcurrentHashMap을 씁니다. 셋째, 외부 플레이어 입력을 Map Key로 직접 쓰면 Hash Flooding으로 O(N) 악화가 가능하므로 무작위 Seed Hash나 내부 UUID 치환을 적용합니다.

## 12. 1~2분 확장답변
> Hash Table은 평균 O(1) 조회를 제공하지만 실무에서는 세 가지 장애 포인트를 구체적으로 관리합니다.
>
> 첫째, Rehash Spike 방지입니다. 동접 5만 서버라면 `50000 × 1.5 / 0.75 = 100000`으로 초기 Capacity를 Reserve해 서비스 중 Rehash가 발생하지 않게 합니다. Rehash는 O(N)이며 Java에서는 GC 압력까지 가중돼 16ms 틱 서버에서 터지면 p99가 수백 ms로 튈 수 있습니다. 감지 지표는 세션 삽입 p99 급등과 메모리 할당량 급증입니다.
>
> 둘째, 동시성 설계입니다. 로직 스레드와 네트워크 스레드가 동시에 세션 Map에 접근하면 HashMap은 Resize 중 Data Race로 데이터 유실이 발생합니다. ConcurrentHashMap을 쓰되, `get → check → put` 같은 복합 연산은 `computeIfAbsent`나 `compute` 같은 단일 원자 API로 대체합니다.
>
> 셋째, hashCode·equals 계약과 외부 입력 방어입니다. PlayerKey를 직접 구현할 때 equals에서 쓰는 필드를 hashCode에서 빠뜨리면 equals가 true여도 다른 Bucket을 가리켜 조회 실패가 발생합니다. 외부 플레이어 입력을 Key로 직접 사용하면 Hash Flooding으로 한 Bucket에 모든 항목이 몰려 O(N) CPU DoS가 가능합니다. 방어는 프로세스별 무작위 Seed Hash 적용과 Key 길이·수 제한입니다.

## 13. 핵심 요약
- 해시 테이블은 Key의 Hash 값을 Bucket 위치로 변환해 평균 O(1) 조회·삽입·삭제를 제공한다.
- 접근 패턴이 선택 기준이다.
- 평균과 최악 복잡도를 구분한다.
- 메모리 배치와 할당 비용을 고려한다.
- 동시성은 별도 설계가 필요하다.
- Hash Table의 평균 O(1)은 좋은 분포·적절한 Load Factor와 충돌 처리에 의존한다.
- 서버에서는 Rehash p99, Mutable Key·공격 입력과 Map·Array 복합 불변식을 함께 관리한다.
- 외부 입력 Key를 Hash Table에 직접 사용하면 Hash Flooding으로 O(N) 악화가 가능하므로, 게임 서버에서는 무작위 Seed Hash나 입력 길이 제한을 함께 적용한다.

## 한 줄 정리
> Hash Table은 Hash로 Bucket을 찾고 충돌 시 Key 비교로 대상을 확인해 평균 O(1) 접근을 제공합니다. Load Factor와 좋은 Hash가 성능을 좌우합니다.
