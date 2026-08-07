---
difficulty: 4
reading_time: 30분
interview_frequency: 5
importance: 5
---

# 11. Data Structure 종합면접


## 학습 목표

- 연산 빈도·탐색 범위·동시성 조건에 따라 배열 기반·해시·트리·그래프 중 적합한 자료구조를 선택할 수 있다.
- Array부터 Union-Find까지 대표 구조의 강점과 한계를 비교할 수 있다.
- 여러 자료구조를 조합할 때 쓰기 정합성과 메모리 비용이 언제 병목이 되는지 판단하고 설계 결정을 내릴 수 있다.
- 게임 서버 설계 문제를 1~3분의 논리적인 면접 답변으로 구성할 수 있다.

## 1. 개요

자료구조 면접의 핵심은 이름과 Big-O를 암기하는 것이 아니다. 요구되는 연산, 데이터 크기와 분포, 최악 지연, 메모리 배치와 동시 접근을 근거로 구조를 선택하는 능력을 보여 주는 것이다.

예를 들어 “플레이어를 저장할 자료구조를 고르라”는 질문에는 하나의 정답이 없다.

- ID로 정확히 조회한다면 Hash Map이 자연스럽다.
- 접속 순서대로 처리한다면 Queue가 필요하다.
- 점수 범위를 조회한다면 균형 Tree가 유리하다.
- 가장 빠른 만료를 반복 처리한다면 Min Heap이 적합하다.
- 매 Tick 모든 플레이어를 순회한다면 연속 Array가 유리할 수 있다.

실무 시스템은 한 객체를 여러 관점으로 조회하므로 여러 Index를 함께 유지하기도 한다. 그 대가로 메모리와 갱신 정합성 비용이 증가한다.

## 2. 자료구조 선택 프레임

면접에서 다음 순서로 질문을 정리하면 성급한 선택을 피할 수 있다.

```text
요구사항
   ↓
핵심 연산과 빈도
   ↓
데이터 크기·분포·변경 패턴
   ↓
평균·최악 복잡도와 메모리
   ↓
참조 수명·동시성·실패 정책
   ↓
실제 부하 측정 후 선택
```

### 1단계: 핵심 연산

조회, 삽입, 삭제, 순회, 범위 검색, 최우선 선택 중 무엇이 중요한지 확인한다. 같은 `O(log n)`이라도 한 건 검색과 결과 `k`개 범위 순회는 요구가 다르다.

### 2단계: 데이터 특성

원소 수의 평균과 최대, Key 중복, 입력 정렬 여부, 읽기·쓰기 비율을 확인한다. 작은 데이터에서는 복잡한 Tree보다 단순 Array의 선형 탐색이 더 빠를 수 있다.

### 3단계: 성능 경계

평균 처리량만 보지 않고 최악 복잡도와 p99 지연을 본다. Hash 충돌, BST 편향, Dynamic Array 재할당, 한 Tick의 Timer 폭증처럼 드문 사건이 서버 지연을 만들 수 있다.

### 4단계: 운영 조건

메모리 상한, Cache 지역성, Allocator 비용, Iterator·참조 무효화, Thread 소유권과 Backpressure를 확인한다. 자료구조가 빠르더라도 무제한 Queue는 결국 메모리를 소진한다.

## 3. 대표 구조 한눈에 비교

| 구조 | 대표 강점 | 대표 약점 | 주요 용도 |
|---|---|---|---|
| Array·Dynamic Array | O(1) Index, 연속 순회 | 중간 삽입·삭제 O(n), 재할당 | Entity 순회, Packet Buffer |
| Linked List | 위치를 알 때 O(1) 연결 변경 | 탐색 O(n), Cache·할당 비용 | LRU 순서, 안정적 Node 연결 |
| Stack | LIFO O(1) | Top 외 접근 제한 | 호출·Undo·DFS |
| Queue·Deque | FIFO·양끝 O(1) | 임의 검색 부적합 | 작업 전달, BFS, Sliding Window |
| Hash Table | 정확한 Key 평균 O(1) | 순서 없음, 충돌·Rehash | Session ID, Cache Lookup |
| 균형 BST | 정렬·범위, 최악 O(log n) | Pointer·회전 비용 | Sorted Map, 시간·점수 범위 |
| Heap | Top O(1), Push·Pop O(log n) | 임의 검색 O(n) | Timer, Priority Scheduler, Top-K |
| Trie | Prefix 길이 기반 검색 | Node·자식 메모리 | 자동 완성, Prefix Routing |
| Graph | 임의 다대다 관계 | 순회 상태와 변경 관리 | Zone·친구·의존성 |
| Union-Find | 병합·연결 여부가 매우 빠름 | 경로·삭제 미지원 | Component, 무방향 Cycle, Kruskal |

이 표는 출발점일 뿐이다. 예를 들어 Linked List의 삭제가 O(1)이라는 말에는 삭제할 Node 위치를 이미 알고 있다는 조건이 있고, Hash 조회 O(1)은 평균 복잡도다. 조건을 함께 말해야 정확한 답변이 된다.

## 4. Array와 Linked List 선택

Array는 원소가 연속 Memory에 있어 Index 접근과 전체 순회가 빠르다. CPU Cache는 인접 데이터를 한 번에 가져오므로 게임 Tick처럼 모든 Entity를 반복 순회하는 작업에 유리하다.

Dynamic Array는 Capacity가 부족할 때 더 큰 공간을 할당하고 원소를 이동한다. 한 번의 Push가 O(n)일 수 있지만 여러 Push의 평균은 분할 상환 O(1)이다. 재할당 후 기존 Pointer·Reference·Iterator가 무효화될 수 있다.

Linked List는 Node 위치를 알고 있을 때 주변 Pointer만 바꿔 삽입·삭제한다. 그러나 위치를 찾는 데 O(n)이 들고 Node별 할당과 Pointer 추적 때문에 Cache 효율이 낮다.

```text
반복 순회·Index 접근 ──> Array 우선
중간 변경이 많음
  ├─ 위치를 매번 검색 ──> List 장점 감소
  └─ Node 위치를 보유 ──> Linked List 검토
```

LRU Cache는 Key를 찾는 Hash Map과 최근 사용 순서를 바꾸는 Doubly Linked List를 조합한다. Hash만으로는 순서를, List만으로는 빠른 Key 검색을 해결하지 못한다.

```java
// LRU Cache: HashMap(O(1) 조회) + LinkedList(O(1) 순서 유지) 조합
class LRUSessionCache {
    private final int capacity;
    private final Map<String, Node> map = new HashMap<>();
    private final Deque<Node> deque = new LinkedList<>();

    LRUSessionCache(int capacity) { this.capacity = capacity; }

    String get(String sessionId) {
        if (!map.containsKey(sessionId)) return null;
        Node node = map.get(sessionId);
        deque.remove(node);
        deque.addFirst(node);
        return node.value;
    }

    void put(String sessionId, String value) {
        if (map.containsKey(sessionId)) {
            deque.remove(map.get(sessionId));
        } else if (map.size() == capacity) {
            Node evicted = deque.removeLast();
            map.remove(evicted.key);
        }
        Node node = new Node(sessionId, value);
        deque.addFirst(node);
        map.put(sessionId, node);
    }

    record Node(String key, String value) {}
}
```

## 5. Stack·Queue·Deque 선택

Stack은 마지막에 들어온 항목을 먼저 처리하는 LIFO 구조다. DFS, Parsing, Undo에 적합하다. Queue는 먼저 들어온 항목을 먼저 처리하는 FIFO 구조이며 BFS와 작업 전달에 적합하다. Deque는 양끝 삽입·삭제를 제공해 Sliding Window나 Work Stealing에 활용할 수 있다.

```text
Network Thread --enqueue--> Bounded Queue --dequeue--> Game Thread
                          full이면?
              Drop / Block / Reject / Disconnect 정책 필요
```

Queue 선택에서 O(1) 연산만 말하면 부족하다. Producer가 Consumer보다 빠를 때 무제한 Queue가 메모리를 계속 소비하므로 Capacity와 Backpressure 정책이 필요하다. Lock-free Queue도 논리적 Race, 객체 수명, ABA, Memory Ordering까지 자동으로 해결하지 않는다.

## 6. Hash Table과 Tree 선택

Hash Table은 정확한 Key 검색이 평균 O(1)이고 게임 Session이나 Entity ID 조회에 적합하다. 좋은 Hash 분포, Equality 계약, Load Factor와 Rehash 비용을 고려한다. Mutable Key가 삽입 후 바뀌면 원래 Bucket에서 찾지 못할 수 있다.

균형 BST는 탐색·삽입·삭제가 최악 O(log n)이고 Key 순서를 유지한다. `lower_bound`, 범위 순회, 선행자·후속자에 유리하다.

| 질문 | Hash Table | 균형 Tree |
|---|---|---|
| ID 한 건 조회 | 평균적으로 유리 | O(log n) |
| 정렬 결과 | 별도 정렬 필요 | 중위 순회 |
| 범위 검색 | 직접 지원 안 함 | O(log n + k) |
| 최악 시간 | 충돌에 영향 | O(log n) 보장 |
| 메모리 | Bucket·여유 Capacity | Node·Pointer·균형 정보 |

“Hash가 O(1)이므로 항상 낫다”는 답은 순서 요구와 최악 지연을 빠뜨린다. 반대로 원소가 작고 갱신이 드물다면 정렬 Array의 이진 탐색이 Tree보다 Cache 효율적일 수 있다.

## 7. Heap과 균형 Tree 선택

Heap은 가장 우선인 원소 하나를 반복 처리할 때 적합하다. Top O(1), Push·Pop O(log n)이지만 전체가 정렬되지 않아 특정 ID 검색은 O(n)이다.

균형 Tree는 최솟값뿐 아니라 임의 Key 삭제, 범위 조회와 정렬 순회를 지원한다. Timer에서 만료가 가장 빠른 항목만 꺼내고 취소가 드물면 Min Heap과 Lazy Deletion이 단순하다. 취소·범위 조회가 잦으면 Tree 또는 Position Map을 결합한 Heap을 검토한다.

같은 우선순위의 처리 순서를 보장하려면 `(priority, sequence)` 복합 Key를 사용한다. 높은 우선순위 작업이 계속 들어오면 낮은 작업이 Starvation될 수 있으므로 Aging이나 처리 비율도 필요하다.

## 8. Tree·Trie·Graph 구분

Tree는 계층 구조다. 씬 Parent·Child나 Skill 선행 계층에 자연스럽다. BST는 Key 순서라는 추가 불변식을 가진 Tree이며 일반 계층 Tree와 목적이 다르다.

Trie는 문자열 Prefix를 경로로 표현한다. Exact Match만 필요하면 Hash가 단순하지만 자동 완성이나 Longest Prefix Match에는 Trie가 유리하다. 문자별 Node가 많아 자식 배열·Map 선택과 압축 Trie를 고려한다.

Graph는 Root나 계층에 제한되지 않는 다대다 관계를 표현한다. 친구·Portal·의존성처럼 Cycle과 여러 경로가 가능하다. Sparse Graph에는 보통 O(V+E) 공간의 인접 리스트, Dense Graph나 O(1) Edge 확인에는 O(V²) 인접 행렬을 검토한다.

Union-Find는 Graph 전체를 대체하지 않는다. Edge가 추가될 때 두 Vertex가 같은 Component인지 빠르게 확인하지만 이웃과 실제 경로, Edge 삭제를 제공하지 않는다.

## 9. 복잡도를 말하는 방법

면접에서는 연산 이름, 전제, 평균·최악을 함께 말한다.

- “Dynamic Array의 끝 삽입은 분할 상환 O(1), 재할당 한 번은 O(n)입니다.”
- “Hash 조회는 좋은 분포를 전제로 평균 O(1)이며 Rehash와 충돌을 고려합니다.”
- “BST 연산은 O(h)이고 균형 Tree에서 h가 O(log n)입니다.”
- “Heap의 Top은 O(1)이지만 특정 원소 검색은 O(n)입니다.”
- “인접 리스트 BFS는 각 Vertex와 Edge를 방문해 O(V+E)입니다.”
- “Union-Find는 두 최적화를 함께 쓰면 분할 상환 O(α(n))입니다.”

Big-O는 증가율을 설명할 뿐 실제 속도를 결정하지 않는다. 연속 Array의 O(n) 순회가 Pointer Tree의 O(log n) 작업을 여러 번 하는 것보다 빠를 수 있다. 원소 수, 비교 비용, Cache Miss와 할당 상수를 측정한다.

## 10. 여러 Index의 정합성

게임 Session을 ID Hash Map, 만료 Heap, 접속 순서 List에 동시에 등록할 수 있다.

```text
                 Session Object
                /       |       \
       ID Hash Map   Expiry Heap  Order List
```

조회별 성능은 좋아지지만 생성·갱신·삭제 시 세 구조를 함께 수정해야 한다. 중간 실패로 하나만 남으면 유령 Session이나 Double 처리 문제가 생긴다.

다음 원칙이 필요하다.

- 한 함수가 여러 Index 변경의 책임을 갖게 한다.
- 삽입 중 실패하면 앞선 변경을 Rollback한다.
- 객체 ID와 Generation을 사용해 재사용된 Slot을 구분한다.
- Debug Build에서 Index 간 불변식을 검사한다.
- Lazy Entry는 Version 비교로 오래된 항목을 식별한다.

보조 Index는 조회 비용을 갱신·메모리 비용으로 바꾸는 선택이다.

## 11. 메모리와 참조 수명

자료구조 선택에서 원소 데이터 외의 비용도 본다.

- Dynamic Array: Capacity 여유와 재할당
- Linked Structure: Node별 Pointer와 Allocator Metadata
- Hash Table: Bucket 배열과 낮은 Load Factor의 빈 공간
- Tree·Trie: Node Pointer, 색·높이, 자식 Container
- Graph: 무방향 Edge 중복 저장과 방문 Buffer

Container 수정 후 참조가 유효한지도 중요하다. Array 재할당은 주소를 바꾸고, Erase는 삭제 원소와 이후 Iterator를 무효화할 수 있다. 언어와 Container마다 계약이 다르므로 추측하지 않고 문서를 확인한다.

객체 Pool이나 Arena는 할당 비용과 파편화를 줄일 수 있지만 수명 단위가 맞아야 한다. Pool Slot 재사용에는 이전 Handle이 새 객체를 가리키지 않도록 Generation 검증이 필요하다.

## 12. 동시성과 자료구조

자료구조의 Big-O와 Thread-safety는 별개다. 공유 Map이나 Tree에 동시 쓰기가 발생하면 내부 연결과 Size가 깨질 수 있다.

선택 가능한 접근 방식은 다음과 같다.

- 단일 Thread가 소유하고 다른 Thread는 메시지로 요청한다.
- Mutex·Reader-Writer Lock으로 복합 연산 전체를 보호한다.
- Sharding으로 Key 범위별 Lock 경합을 줄인다.
- Immutable Snapshot을 교체해 읽기를 Lock 없이 만든다.
- 검증된 Concurrent Container를 사용한다.

`Contains` 후 `Insert`처럼 여러 호출로 이뤄진 논리는 각 메서드가 Thread-safe여도 Atomic하지 않다. 조건 확인과 변경을 하나의 임계 구역 또는 원자 API로 묶어야 한다.

## 13. 게임 서버 설계 예시

### Session과 Packet 처리

Session ID 조회에는 Hash Map, Network Thread에서 Game Thread로 전달하는 Packet에는 Bounded Queue가 적합하다. Tick에서는 활성 Entity를 연속 배열에 두어 순회 효율을 높일 수 있다. 세 구조는 서로 다른 요구를 해결한다.

### Timer 시스템

`(expireAt, timerId)` Min Heap으로 다음 만료를 찾는다. 취소가 적으면 Version 기반 Lazy Deletion을 사용하고, 무효 Entry 비율이 높으면 Rebuild한다. 한 Tick에 만료가 폭증할 수 있으므로 처리 Budget과 Overdue 지표를 둔다.

### 랭킹과 Matchmaking

ID별 현재 점수는 Hash Map, 점수 범위 후보는 `(score, playerId)` 균형 Tree로 관리할 수 있다. 점수가 바뀌면 Tree의 기존 Key를 삭제하고 새 Key를 삽입해야 한다. k번째 순위를 O(log n)에 구하려면 Subtree Size 확장이나 검증된 Sorted Set 서비스를 사용한다.

### 월드 연결

Zone과 Portal은 Graph로 표현한다. 비가중 최소 Hop은 BFS, 가중 최소 비용은 조건에 맞는 최단 경로 알고리즘을 사용한다. 통로가 추가되기만 하고 연결 여부만 반복 확인한다면 Union-Find를 보조로 사용할 수 있다.

## 14. 자주 하는 오해

- **Big-O가 낮으면 실제로 항상 빠르다**: 데이터 크기, Cache, 할당과 구현 상수가 다르다.
- **여러 자료구조를 조합하면 단일 구조보다 항상 성능이 좋다**: 조합은 동기화 비용, 정합성 유지 코드, 메모리 오버헤드를 수반한다. 단순한 시나리오에서는 단일 구조가 더 빠르고 안전하다. 조합이 유리한 경우는 두 구조의 각기 다른 연산 강점이 모두 필요할 때만이다.
- **Hash Table은 최악에도 O(1)이다**: 충돌과 Rehash 조건을 구분해야 한다.
- **면접에서 Big-O를 정확히 말하면 자료구조 답변은 충분하다**: Big-O는 점근 상한만 표현한다. 상수 인자, Cache 지역성, 메모리 할당 패턴, 동시성 안전성이 실제 성능을 결정한다. 시니어 면접에서는 "어떤 조건에서 이 구조를 선택했는가"와 "한계와 트레이드오프"를 함께 설명해야 한다.
- **자료구조 선택은 언어나 플랫폼과 무관하다**: Java의 ArrayList는 내부적으로 Object 배열이라 기본형 boxing 비용이 있다. C++의 std::unordered_map은 Java HashMap보다 Rehashing 비용이 크다. 플랫폼 메모리 모델, GC 유무, CPU 아키텍처가 자료구조 선택 기준을 바꾼다.
- **자료구조 선택은 처음 설계 시에만 중요하고 이후에는 교체하기 어렵다**: 잘 설계된 인터페이스로 감싸면 내부 자료구조는 교체 가능하다. 실제로 트래픽 증가로 ArrayList를 ConcurrentHashMap으로, TreeMap을 Redis Sorted Set으로 교체하는 사례가 많다. 처음 선택은 중요하지만 "바꿀 수 없다"는 관점은 리팩토링을 포기하는 기술 부채로 이어진다.
- **Index를 추가하면 성능만 좋아진다**: 메모리와 모든 쓰기의 갱신·정합성 비용이 늘어난다.
- **캐시 히트율과 메모리 지역성은 자료구조 선택과 무관하다**: Linked List는 Node가 힙에 분산 배치되어 Cache Miss가 잦다. 같은 O(n) 탐색이라도 Array는 연속 메모리 덕분에 Cache Line을 활용해 수 배 빠르다. 게임 서버 틱 루프처럼 반복 접근이 많은 환경에서는 자료구조의 메모리 배치가 성능을 결정한다.

## 15. 면접 질문

### Q1. 게임 서버에서 동접 5만 명의 세션을 관리해야 합니다. 세션 ID 조회, 만료 시각 기준 정리, 접속 순서 기반 처리를 모두 지원해야 할 때 단일 자료구조로 해결하려는 설계와 복수 Index 조합 설계 중 어떤 쪽을 선택하고 그 이유는 무엇인가요?

**30초 모범답변:** 단일 자료구조로 세 가지 연산을 모두 만족하는 구조는 없습니다. ID 조회는 HashMap, 만료 기준 정리는 Heap, 접속 순서 처리는 List가 각각 O(1)·O(log n)·O(1)로 적합합니다. 복수 Index 조합을 선택하되, 세 구조의 동기 갱신 실패 시 정합성 깨짐을 방지하는 Rollback 설계가 필수입니다.

**1~2분 모범답변:** 동접 5만 세션에서 조회·만료·순서를 모두 지원하려면 세 구조를 조합해야 합니다. ID→HashMap(O(1)), 만료→Min Heap(O(log n) push/pop), 순서→Doubly Linked List(O(1) 삽입·삭제)로 역할을 분리합니다. 단, 세션 생성 시 세 구조를 순서대로 삽입하다가 Heap 삽입 후 List 삽입에서 실패하면 HashMap과 Heap에만 세션이 남아 유령 세션이 됩니다. 방지 방법: 삽입 전 성공 가능 여부를 확인하거나, 실패 시 이미 삽입된 구조를 Rollback하는 단일 책임 함수를 사용합니다. 운영 중에는 세 구조의 원소 수 일치 여부를 주기적으로 검사하는 불변식 검증을 Debug 빌드에 넣습니다.

### Q2. 게임 서버 틱 루프에서 Entity를 Array 대신 Linked List로 관리했을 때 발생하는 Cache Miss 문제와 대응 방법은?

**30초 모범답변:** Linked List의 Node는 힙에 분산 배치되므로 순차 순회 시 Cache Line 미스가 빈번합니다. 틱 루프처럼 매 프레임 모든 Entity를 순회하는 경우 Array 기반 구조가 캐시 친화적입니다. Linked List는 중간 삽입·삭제가 잦고 순회보다 위치 접근이 없을 때 적합합니다.

**1~2분 모범답변:** 1만 Entity를 매 틱 순회할 때, Linked List는 Node마다 힙 포인터를 따라가므로 CPU Cache(보통 64B Cache Line)를 활용하지 못합니다. Array는 연속 메모리라 prefetch가 동작해 L1/L2 캐시 히트율이 높습니다. 실측 기준 같은 O(n) 탐색이라도 Array가 3~5배 빠른 사례가 있습니다. 해결책: Entity를 Array로 저장하되 삽입·삭제 인덱스를 별도 Free List로 관리하는 Slot Array 패턴을 사용합니다.

### Q3. 만료 시각과 Session ID를 함께 관리해야 하는 상황에서 Heap과 HashMap을 어떻게 조합하고 두 구조 간 정합성을 어떻게 유지하는가?

**30초 모범답변:** Heap은 최소 만료 시각을 O(log n)으로 꺼내는 데 최적이고, HashMap은 Session ID로 O(1) 조회에 최적입니다. 두 구조를 함께 쓸 때 Session 삭제 시 Heap에서의 제거 비용(O(n) 탐색 또는 Lazy Deletion)이 정합성 문제입니다.

**1~2분 모범답변:** 구현 전략 두 가지: (1) Position Map — HashMap에 Heap 내 인덱스를 함께 저장해 O(log n) 삭제. 단 Heap 재정렬 시마다 인덱스 갱신 필요. (2) Lazy Deletion — Heap에서 꺼낼 때 HashMap에 없으면 무효 처리. 구현이 단순하나 Heap에 만료된 항목이 누적됩니다. Session 갱신(만료 시각 변경)이 잦으면 Position Map, 삭제 위주면 Lazy Deletion이 유리합니다.

### Q4. Timer 자료구조를 설계해 보세요.

가장 빠른 만료를 반복 처리하므로 `(expireAt, id)` Min Heap을 사용합니다. 취소가 적으면 Version 기반 Lazy Deletion, 많으면 Position Map이나 Tree를 검토합니다. 동일 시간 순서, Tick 처리 상한, 무효 Entry 정리와 동시 등록 정책도 설계합니다.

### Q5. Session을 ID HashMap, 만료 Heap, 접속 순서 List 세 구조에 동시 등록하다가 Heap 삽입 직후 프로세스가 죽었습니다. 재시작 후 어떤 불일치가 발생하고 이를 방지하거나 탐지하는 방법은 무엇인가요?

**30초 모범답변:** Heap 삽입 후 List 삽입 전에 프로세스가 죽으면 재시작 후 HashMap과 Heap에는 세션이 있지만 List에는 없는 불일치가 생깁니다. 탐지 방법은 세 구조의 원소 수 불일치 검사이며, 방지는 삽입 실패 시 이전 구조를 즉시 Rollback하는 원자적 삽입 함수로 해결합니다.

**1~2분 모범답변:** 세 구조를 순서대로 삽입하는 중 Heap 삽입 성공→List 삽입 전 크래시가 나면 재시작 시 HashMap과 Heap에 같은 세션이 있고 List에는 없는 상태가 됩니다. 결과: 만료 Heap에서 세션이 꺼지지만 List 순서 처리에서는 해당 세션을 찾지 못해 누락 처리 또는 NPE 크래시가 발생합니다. 방지 전략 두 가지: (1) 삽입 함수 단일화 — 세 구조 삽입을 하나의 함수로 감싸고 예외 발생 시 역순으로 Rollback. (2) 복구 검증 — 재시작 시 세 구조 원소 수와 Key Set을 비교해 불일치가 있으면 Heap·List 기준으로 HashMap을 재구성. Generation 또는 Version 카운터를 세션 객체에 두면 Heap에서 꺼낸 Entry가 HashMap의 최신 세션과 일치하는지 확인할 수 있습니다.

### Q6. 틱 루프에서 동일한 O(n) 순회임에도 Hash Map 순회가 Array 순회보다 3배 느린 현상이 발생했습니다. 원인을 어떻게 진단하고 어떤 구조로 교체하는 판단을 내리나요?

**30초 모범답변:** Hash Map은 Bucket 배열에 불연속 메모리로 저장되어 순회 시 Cache Miss가 빈번합니다. 동일한 O(n)이라도 연속 Array는 Cache Line prefetch 덕분에 실측 3~5배 차이가 날 수 있습니다. 프로파일러로 Cache Miss율과 L1/L2 히트율을 확인하고, 순회가 주 연산이면 Array 기반 구조로 교체를 검토합니다.

**1~2분 모범답변:** Hash Map 순회가 Array보다 느린 원인 진단은 세 단계입니다. (1) 프로파일러(perf, VTune 등)로 L1/L2 Cache Miss율 확인. Hash Map은 각 Bucket이 힙 곳곳에 분산돼 64B Cache Line 활용율이 낮습니다. (2) HashMap의 Load Factor 확인. 낮은 Load Factor는 Bucket 배열을 희소하게 만들어 순회 시 빈 Bucket 스킵 비용이 추가됩니다. (3) Entity 접근 패턴 확인. 틱마다 전체 순회가 필요하다면 HashMap은 구조적으로 불리합니다. 교체 판단 기준: 읽기 대 쓰기 비율이 10:1 이상이고 매 틱 전체 순회가 핵심 연산이면 컴팩트 배열(SOA 또는 Slot Array)로 교체하고 ID 조회용 HashMap은 별도 Index로 유지합니다. 교체 후 p99 틱 지연과 Cache Miss율을 재측정해 개선 여부를 검증합니다.

## 16. 예상 꼬리질문

- 틱 루프에 Entity가 100개일 때는 HashMap 조회가 빠르던 게임 서버가 5,000개로 늘자 배열 선형 탐색이 더 빠른 것으로 프로파일링됐습니다. 어떤 기준으로 전환 시점을 판단하나요?
- 게임 서버 틱 루프 중 Entity 배열이 Capacity를 초과해 재할당이 발생하면 그 틱에서 지연이 발생합니다. 재할당 빈도와 메모리 낭비 사이에서 초기 Capacity를 어떻게 결정하나요?
- Session 객체를 HashMap Key로 사용하다가 세션 갱신 후 조회 실패가 발생했습니다. Mutable Key 문제임을 어떻게 진단하고, 재발 방지를 위한 Key 설계 원칙은 무엇인가요?
- 게임 서버 쿨다운 Timer에서 스킬이 취소될 때 Heap에서 해당 Entry를 빠르게 제거해야 합니다. Lazy Deletion과 Position Map 중 스킬 취소 빈도가 높은 경우 어느 쪽을 선택하고 그 이유는 무엇인가요?
- 게임 내 아이템 이름 자동완성 기능에서 입력 문자 수가 늘수록 Trie 탐색 노드 수가 커져 메모리가 문제가 됩니다. 압축 Trie 도입 기준과 정렬 Tree로 대체를 고려해야 하는 시점은 어떻게 판단하나요?
- Graph 연결 여부에 Union-Find를 쓰지 못하는 경우는 언제인가요?
- 라이브 서버에서 Entity 배열 재할당 후 다른 시스템이 보관하던 포인터로 접근하다가 크래시가 발생했습니다. Iterator·포인터 무효화 버그를 사전에 탐지하는 방법과 설계 수준의 예방 방안은 무엇인가요?

## 17. 30초 모범답변

> 자료구조는 이름보다 필요한 연산으로 선택합니다. 먼저 조회·삽입·삭제·순회·범위·최우선 선택의 빈도와 데이터 크기를 정하고, 평균과 최악 복잡도, 메모리 지역성, 할당과 동시성을 비교합니다. 예를 들어 ID 조회는 Hash, 범위는 균형 Tree, Timer는 Heap이 적합합니다. 여러 Index를 조합할 수 있지만 쓰기 정합성과 메모리 비용을 함께 관리하고 실제 부하로 검증해야 합니다.

## 18. 1~2분 확장답변

> 자료구조를 선택할 때 먼저 핵심 연산을 정의합니다. 매 Tick 전체 순회가 중요하면 연속 Array, 정확한 ID 조회는 Hash Map, 정렬·범위 검색은 균형 Tree, 최우선 항목 반복 처리는 Heap이 후보입니다. 관계 탐색은 Graph, 추가 중심의 연결 여부는 Union-Find가 적합합니다.
>
> 다음으로 복잡도의 전제를 봅니다. Dynamic Array Push는 분할 상환 O(1), Hash는 평균 O(1), BST는 높이 h에 O(h)이고 균형일 때 O(log n)입니다. Big-O 외에도 Cache 지역성, Node 할당, Capacity·Rehash, 참조 무효화와 p99 지연을 고려합니다. 게임 서버에서는 Session을 ID Hash, 만료 Heap, 접속 순서 List에 동시에 둘 수도 있지만 모든 Index를 함께 갱신해야 합니다. 공유 접근은 단일 Thread 소유나 Lock·Snapshot 정책을 정하고, Queue에는 상한과 Backpressure를 둡니다. 마지막에는 실제 데이터 분포와 읽기·쓰기 비율로 측정해 선택을 검증합니다.

## 19. 핵심 요약

- 자료구조는 필요한 연산과 빈도, 데이터 크기·분포에서 선택을 시작한다.
- Array는 연속 순회, Hash는 Exact Key, Tree는 정렬·범위, Heap은 최우선 선택에 강하다.
- Trie는 Prefix, Graph는 관계, Union-Find는 추가 중심 연결 여부를 표현한다.
- 평균·최악·분할 상환 복잡도와 그 전제를 함께 설명한다.
- Cache 지역성, Allocation, Capacity, 참조 무효화가 실제 성능에 영향을 준다.
- 여러 Index는 읽기를 빠르게 하지만 메모리와 쓰기 정합성 비용을 만든다.
- Thread-safety와 복합 연산의 Atomicity는 별도 설계다.
- 게임 서버에서는 Queue 상한, Tick Budget, Version·Generation과 운영 지표까지 고려한다.
- 최종 선택은 실제 부하의 처리량·p99 지연·메모리 측정으로 검증한다.

## 한 줄 정리

> 좋은 자료구조 선택은 Big-O 암기가 아니라 요구 연산, 데이터 배치, 최악 지연과 운영 비용을 근거로 한 Trade-off 결정이다.
