---
difficulty: 2
reading_time: 25분
interview_frequency: 5
importance: 5
---

# 05. Collections Framework·List·Set·Map

> 게임 서버·백엔드 개발자를 위한 CS 면접 교재

## 학습 목표

- List·Set·Map 인터페이스의 계약 차이와 연산 요구에 따른 구현체 선택 기준을 설명할 수 있다.
- HashMap의 hashCode·equals 계약과 Mutable Key를 사용했을 때의 위험을 설명할 수 있다.
- ConcurrentHashMap 단일 메서드와 복합 연산의 Thread Safety 차이를 설명하고 compute로 해결할 수 있다.
- 게임 서버 세션 조회·Tick 입력·랭킹 구조별 적합한 Collection을 요구에 근거해 선택할 수 있다.

## 1. 개요

Java Collections Framework는 여러 객체를 저장·조회·순회하기 위한 Interface와 구현체의 공통 계약을 제공한다.

## 2. 왜 필요한가

접근 순서, 중복, 정렬, 동시성 요구에 맞는 자료구조를 선택해 정확성과 예측 가능한 성능을 얻기 위해 필요하다.

## 3. 핵심 동작 원리

```text
requirement → List/Set/Map interface → ArrayList/HashSet/HashMap/TreeMap implementation
```

이 흐름은 Collections Framework·List·Set·Map의 주요 처리 단계와 책임 경계를 나타낸다. 각 단계의 입력과 출력, 실패 시 복구 위치를 구분해야 한다.

### List·Set·Map 인터페이스와 연산 선택

List는 순서와 중복을 허용하고 Set은 중복 없는 원소 집합, Map은 Key와 Value 관계를 표현한다. 구현 선택 전에 필요한 연산이 Index 접근, Membership, Key 조회, 정렬 또는 순서 유지인지 정한다.

### ArrayList vs LinkedList 내부 구조

ArrayList는 연속 Reference 배열을 사용해 Index 조회와 순회 Locality가 좋다. 중간 삽입·삭제는 원소 이동이 필요하고 Capacity가 부족하면 더 큰 배열로 복사한다. LinkedList는 위치를 이미 알아도 Node 할당과 Cache Miss 비용이 있어 실제 요구를 측정한다.

### HashMap의 hashCode·equals 계약

HashMap은 hashCode로 Bucket을 찾고 equals로 정확한 Key를 확인한다. Key가 Map 안에서 hashCode에 영향을 주는 상태를 바꾸면 다시 찾지 못할 수 있다. equals가 같으면 hashCode도 같아야 한다는 계약을 지킨다.

### HashSet·TreeSet·TreeMap 특성

HashSet은 내부적으로 Hash 기반 Key 저장을 사용해 중복을 판단한다. TreeSet과 TreeMap은 정렬 순서와 범위 Query를 제공하지만 비교 결과가 equals와 모순되면 예상하지 못한 중복 판정이 생길 수 있다.

### 순서 보장과 LinkedHashMap·TreeMap

HashMap은 일반적으로 삽입 순서를 계약하지 않는다. LinkedHashMap은 삽입 또는 접근 순서를 유지해 간단한 LRU 구성에 쓸 수 있고 TreeMap은 Comparator 순서로 정렬한다. 필요한 계약보다 강한 구현은 추가 Memory와 갱신 비용을 만든다.

### 동시성과 ConcurrentHashMap 복합 연산

일반 Collection은 동시 변경에 자동으로 안전하지 않다. ConcurrentHashMap도 단일 Method는 Thread-safe하지만 get 후 put 같은 복합 불변식을 자동 보장하지 않는다. compute, 명시적 Lock 또는 상태 Owner를 사용한다.

### Collection 선택과 계약

- **주요 연산**: 자료 수보다 조회·삽입·삭제·순회의 비율을 먼저 본다. 작은 Collection에서는 Big-O보다 연속 Memory와 단순성이 더 중요할 수 있다.
- **Capacity**: ArrayList와 HashMap의 예상 크기를 알면 적절한 초기 Capacity로 재할당을 줄일 수 있다. 지나치게 크게 잡으면 Memory와 Cache Footprint가 늘어난다.
- **Key 안정성**: HashMap에 넣은 Key의 equals·hashCode 관련 Field를 변경하지 않는다. Player ID처럼 불변 식별자를 Key로 사용한다.
- **순회 변경**: 일반 Iterator 순회 중 구조를 직접 바꾸지 않는다. Iterator remove, 별도 수집 후 변경 또는 목적에 맞는 Concurrent Collection을 사용한다.
- **정렬 계약**: Comparator는 반사성·추이성과 일관된 순서를 제공해야 한다. 점수 동점 규칙까지 넣어 재시작 후에도 결정적인 결과를 만든다.
- **복합 원자성**: ConcurrentHashMap의 compute 계열을 사용할 때 Mapping Function을 짧게 유지한다. 외부 I/O나 같은 Map의 복잡한 재진입을 피한다.

### 게임 서버 사례

Session 조회는 playerId HashMap, Tick 입력 순서는 Queue, Timer 만료는 PriorityQueue처럼 요구별 구조를 나눈다. Top Ranking과 전체 원본 저장도 같은 구조로 해결하지 않는다. 부하 Test에서는 평균 시간 외에 Rehash 순간, GC Allocation과 Hot Key 경쟁을 관찰한다.

## 4. 쉬운 예시

게임 서버에서 구조별 적합한 Collection을 선택하는 패턴과 hashCode·equals 계약 위반, ConcurrentHashMap 복합 연산 문제를 보여주는 예시다.

```java
// 게임 서버 구조별 Collection 선택
Map<UUID, Session> sessions = new ConcurrentHashMap<>(); // 세션 조회: O(1) avg
Queue<InputEvent> tickQueue = new ArrayDeque<>();         // Tick 입력 순서 처리
PriorityQueue<Timer> timers = new PriorityQueue<>(        // 타이머 만료 처리
    Comparator.comparingLong(Timer::expireAt));
TreeMap<Long, List<Player>> ranking = new TreeMap<>(      // 점수 기반 정렬·범위 Query
    Comparator.reverseOrder());

// hashCode·equals 계약 위반 예시
class Player {
    String name;    // mutable!
    int score;
    @Override public int hashCode() { return name.hashCode(); }
    @Override public boolean equals(Object o) { ... }
}

Player p = new Player("Alice", 100);
Map<Player, Integer> map = new HashMap<>();
map.put(p, 1);
p.name = "Bob";           // hashCode 변경!
System.out.println(map.get(p)); // null ← 원래 Bucket에서 찾지 못함
// 수정: 불변 UUID를 Key로 사용
Map<UUID, Player> safeMap = new HashMap<>();

// ConcurrentHashMap 복합 연산 문제
ConcurrentHashMap<UUID, Integer> killCount = new ConcurrentHashMap<>();
// ← 위험: get → put 사이에 다른 Thread가 개입 가능
Integer count = killCount.get(playerId);
killCount.put(playerId, count == null ? 1 : count + 1); // Race Condition!
// ← 안전: compute로 원자적 갱신
killCount.compute(playerId, (id, c) -> c == null ? 1 : c + 1);
// ← 또는 merge 사용
killCount.merge(playerId, 1, Integer::sum);

// Iterator 순회 중 구조 변경 금지
List<Player> players = new ArrayList<>(activePlayers);
for (Player p : players) {
    if (p.isDisconnected()) players.remove(p); // ConcurrentModificationException!
}
// 수정: 별도 수집 후 변경
List<Player> toRemove = players.stream()
    .filter(Player::isDisconnected).collect(Collectors.toList());
players.removeAll(toRemove);

// LinkedHashMap으로 간단한 LRU 캐시
Map<UUID, Snapshot> lruCache = new LinkedHashMap<>(16, 0.75f, true) {
    protected boolean removeEldestEntry(Map.Entry e) {
        return size() > MAX_CACHE_SIZE; // 가장 오래 접근 안 한 항목 제거
    }
};

// HashMap Rehash 방지: 초기 Capacity 지정
// 100개 원소 예상 시 → Capacity = 100 / 0.75 ≈ 134 → 128 or 256 지정
Map<UUID, Session> preAllocated = new HashMap<>(256);
```

## 5. 비슷한 개념과 비교

| 구현체 | 내부 구조 | Key/Index 조회 | 삽입 | 정렬·순서 | Thread Safety |
|---|---|---|---|---|---|
| ArrayList | 동적 배열 | O(1) Index | O(1) 끝 / O(n) 중간 | 삽입 순서 유지 | 없음 |
| LinkedList | 이중 연결 리스트 | O(n) | O(1) Node 위치 알면 | 삽입 순서 유지 | 없음 |
| HashMap | Hash Table | O(1) avg | O(1) avg | 보장 없음 | 없음 |
| LinkedHashMap | Hash + 연결 리스트 | O(1) avg | O(1) avg | 삽입·접근 순서 | 없음 |
| TreeMap | Red-Black Tree | O(log n) | O(log n) | Comparator 정렬 | 없음 |
| ConcurrentHashMap | Striped Lock | O(1) avg | O(1) avg | 보장 없음 | 단일 메서드 |
| PriorityQueue | Heap | O(log n) poll | O(log n) | 우선순위 순서 | 없음 |

## 6. 장점과 단점

**올바른 Collection 선택의 장점:**
- 연산 요구에 맞는 구조를 선택해 예측 가능한 시간복잡도를 얻을 수 있다.
- HashMap의 평균 O(1) Key 조회로 수천 명의 세션 조회를 빠르게 처리한다.
- ConcurrentHashMap의 Striped Lock으로 synchronized Map보다 높은 동시성 처리량을 얻는다.
- LinkedHashMap으로 추가 구현 없이 간단한 LRU 캐시를 만들 수 있다.

**잘못된 Collection 선택의 단점:**
- Mutable Key를 HashMap에 사용하면 삽입 후 값 변경으로 조회 불가 버그가 생긴다.
- equals만 Override하고 hashCode를 Override하지 않으면 HashSet에서 중복이 제거되지 않는다.
- ConcurrentHashMap의 복합 연산(get→put)을 원자적으로 착각하면 Race Condition이 발생한다.
- ArrayList 초기 Capacity를 지정하지 않으면 Rehash 시 GC 압박과 순간 지연이 발생한다.

## 7. 게임 서버·백엔드 실무 예시

Tick 처리 중 세션 조회는 `ConcurrentHashMap<UUID, Session>`으로 O(1)에 처리하고, 킬 카운트 같은 카운터는 `compute`로 원자적으로 갱신한다. 타이머 만료 처리는 `PriorityQueue<Timer>`로 최소 만료 시간 순서로 처리하고, 점수 기반 랭킹은 `TreeMap<Long, List<Player>>`의 `descendingKeySet()`으로 상위 N명을 조회한다. 부하 테스트에서는 평균 조회 시간 외에 Rehash 순간 지연, GC Allocation, Hot Key 경쟁을 관찰한다.

## 8. 자주 하는 오해
- LinkedList는 모든 삽입·삭제에서 ArrayList보다 빠르다고 본다. Node 할당과 Cache Miss 비용이 있어 실제로는 소규모 List에서 ArrayList가 더 빠른 경우가 많다. 위치를 이미 아는 Iterator를 통한 변경이 아니면 LinkedList의 이점이 없다.
- HashMap이 삽입 순서를 유지한다고 의존한다. HashMap의 순회 순서는 구현 내부와 Rehash에 따라 바뀔 수 있다. 삽입 순서가 필요하면 LinkedHashMap을 사용한다.
- equals만 Override해도 Hash Collection 계약이 완성된다고 생각한다. equals가 true인 두 객체는 반드시 같은 hashCode를 반환해야 한다. hashCode를 Override하지 않으면 동등한 객체가 HashSet에 중복으로 저장된다.
- ConcurrentHashMap이면 여러 메서드의 복합 연산도 자동으로 원자적이라고 본다. 단일 메서드(get·put·remove)는 Thread-safe하지만 get 후 put처럼 두 연산 사이에 다른 Thread가 개입할 수 있다. compute·merge·putIfAbsent로 원자성을 확보한다.
- TreeMap Comparator가 0을 반환하면 두 Key가 equals라고 본다. TreeMap은 Comparator 결과가 0이면 같은 Key로 취급해 덮어쓴다. 점수가 같은 플레이어를 별도로 보관하려면 Comparator에 보조 Key(playerId)를 추가해야 한다.
- ArrayList 중간 삭제가 LinkedList보다 항상 느리다고 생각한다. LinkedList는 중간 노드를 찾는 데 O(n)이 걸린다. 인덱스로 접근해 삭제하면 LinkedList도 O(n)이고, 메모리 연속성 덕분에 ArrayList가 실제로 더 빠를 수 있다.
- synchronized List나 Map은 ConcurrentHashMap과 같은 동시성 보장을 제공한다고 생각한다. Collections.synchronizedMap은 모든 메서드에 단일 Lock을 걸어 처리량이 낮다. ConcurrentHashMap은 Striped Lock으로 높은 동시성을 지원하고 compute 같은 원자 복합 연산을 제공한다.

## 9. 면접 질문
### Q1. List, Set과 Map의 차이는 무엇인가요?
List는 삽입 순서를 유지하고 중복을 허용합니다. Set은 중복 없는 원소 집합이며 순서 보장 여부는 구현체마다 다릅니다. Map은 Key와 Value의 쌍을 저장하고 Key로 Value를 조회합니다. 구현체를 고르기 전에 필요한 연산(Index 접근·Key 조회·정렬·순서 유지)을 먼저 정합니다.

### Q2. ArrayList와 LinkedList는 어떻게 선택하나요?
ArrayList는 동적 배열 기반으로 Index 조회가 O(1)이고 Cache Locality가 좋아 순회가 빠릅니다. LinkedList는 Node 기반으로 미리 위치를 알 때 삽입·삭제가 O(1)이지만 Node 할당·Cache Miss 비용이 있어 실제로는 대부분의 경우 ArrayList가 더 빠릅니다. Deque가 필요한 경우 LinkedList 또는 ArrayDeque를 비교합니다.

### Q3. HashMap의 equals·hashCode 계약은 무엇인가요?
equals가 true인 두 객체는 반드시 같은 hashCode를 반환해야 합니다. HashMap은 hashCode로 Bucket을 찾고 equals로 정확한 Key를 확인하는 두 단계로 동작합니다. hashCode가 같아도 equals는 false일 수 있어(Hash 충돌) Bucket에서 equals 비교가 필요합니다. equals만 Override하고 hashCode를 Override하지 않으면 HashSet에서 중복 제거가 실패합니다.

### Q4. HashMap Key가 Mutable하면 어떤 문제가 있나요?
Key를 삽입한 후 hashCode에 영향을 주는 필드가 바뀌면 원래 Bucket에서 Key를 찾지 못합니다. get·remove 모두 잘못된 Bucket을 탐색해 null을 반환합니다. 해결책은 불변 객체(UUID·String 등)를 Key로 사용하거나 hashCode가 불변 필드만 사용하도록 설계하는 것입니다.

### Q5. ConcurrentHashMap의 복합 연산은 어떻게 처리하나요?
단일 메서드(get·put·remove)는 Thread-safe하지만 get 후 put처럼 분리된 두 연산 사이에 다른 Thread가 개입할 수 있습니다. 원자적 갱신에는 `compute(key, (k, v) -> ...)`, `merge(key, value, mergeFunction)`, `putIfAbsent(key, value)`를 사용합니다. 더 복잡한 불변식은 외부 Lock이나 상태 소유 Thread가 관리합니다.

### Q6. HashMap에서 충돌이 많아지면 내부적으로 어떻게 처리되나요?
Java 8부터 같은 Bucket의 원소가 8개를 초과하면 연결 리스트에서 Red-Black Tree로 전환해 최악 조회를 O(n)에서 O(log n)으로 개선합니다. Load Factor(기본 0.75)를 초과하면 Bucket 수를 2배로 늘리는 Rehash가 발생합니다. Rehash는 모든 원소를 재배치하는 비용이 있으므로 예상 크기를 알면 초기 Capacity를 `size / loadFactor + 1`로 지정합니다.

## 10. 예상 꼬리질문
- ArrayList와 LinkedList 중 실제로 LinkedList를 선택하는 경우는 어떤 상황인가요?
- HashMap의 충돌이 많아지면 내부적으로 어떻게 변환되나요? (연결 리스트 → Tree)
- ConcurrentHashMap이 `Collections.synchronizedMap`과 다른 점은 무엇인가요?
- HashSet의 원소 중복 제거가 올바르게 동작하려면 무엇이 필요한가요?
- TreeMap의 Comparator 결과가 0인데 equals가 false인 경우 어떻게 되나요?
- 게임 서버에서 플레이어 세션 관리에 HashMap 대신 ConcurrentHashMap을 사용하는 이유는 무엇인가요?
- LinkedHashMap으로 LRU 캐시를 구현할 때 어떤 생성자 옵션이 필요하나요?

## 11. 30초 모범답변

> List는 순서와 중복, Set은 중복 제거, Map은 Key 조회를 표현합니다. 구현체는 연산 요구에 따라 선택하고 게임 서버에서는 세션 조회는 ConcurrentHashMap, Tick 입력은 Queue, 타이머는 PriorityQueue처럼 용도별로 분리합니다. HashMap에는 불변 Key를 사용하고 ConcurrentHashMap의 복합 연산은 compute로 원자성을 확보합니다.

## 12. 1~2분 확장답변

> List는 삽입 순서와 중복을 허용하고, Set은 중복 없는 원소 집합, Map은 Key-Value 관계를 표현합니다. 구현체 선택은 필요한 연산이 Index 접근인지 Key 조회인지 정렬 범위인지에 따라 달라집니다.
>
> ArrayList는 동적 배열 기반으로 Index 조회와 순회 Locality가 좋습니다. HashMap은 hashCode로 Bucket을 찾고 equals로 Key를 확인하는 두 단계로 동작하므로 equals를 Override하면 hashCode도 반드시 함께 Override해야 합니다. Key는 불변 객체를 사용하고 초기 Capacity를 지정해 Rehash를 줄입니다.
>
> ConcurrentHashMap은 단일 메서드가 Thread-safe하지만 get→put 같은 복합 연산은 compute·merge를 사용해야 원자성을 보장합니다. TreeMap은 Comparator 정렬과 범위 Query를 제공하지만 Comparator가 0이면 같은 Key로 덮어씁니다. 게임 서버에서는 세션은 ConcurrentHashMap, Tick 입력은 ArrayDeque, 타이머는 PriorityQueue, 점수 랭킹은 TreeMap으로 요구에 맞게 분리합니다.

## 13. 핵심 요약

- List·Set·Map 선택 기준: 순서·중복 필요 → List, 중복 제거·멤버십 → Set, Key 조회 → Map — 연산 요구를 먼저 정한다.
- ArrayList vs LinkedList: ArrayList는 Index 조회·순회 O(1) Locality 우세, LinkedList는 위치를 이미 아는 변경에만 유리 — 대부분 ArrayList가 실측 성능 우위.
- HashMap 내부 동작: hashCode → Bucket 선택 → equals로 정확한 Key 확인 — Java 8부터 충돌 8개 초과 시 Tree로 전환.
- hashCode·equals 계약: equals true → hashCode 반드시 같음 — hashCode만 같아도 equals는 false 가능 (Hash 충돌).
- Mutable Key 위험: 삽입 후 hashCode 관련 필드 변경 → 원래 Bucket에서 찾지 못함 → UUID·String 같은 불변 Key 사용.
- ConcurrentHashMap 복합 연산: get→put 분리는 Race Condition 발생 → compute·merge·putIfAbsent로 원자성 확보.
- TreeMap Comparator 주의: 결과가 0이면 equals와 무관하게 같은 Key로 덮어씀 → 동점 처리 시 보조 Key 추가.
- 게임 서버 패턴: 세션 조회 ConcurrentHashMap, Tick 입력 ArrayDeque, 타이머 PriorityQueue, 랭킹 TreeMap — 하나의 Collection으로 모든 요구 해결하지 않는다.

## 한 줄 정리

> Collection은 연산 요구(Index·Key·정렬·순서)에 맞는 구현체를 선택하고, HashMap에는 불변 Key와 hashCode·equals를 함께 Override하며, ConcurrentHashMap 복합 연산은 compute로 원자성을 확보합니다.
