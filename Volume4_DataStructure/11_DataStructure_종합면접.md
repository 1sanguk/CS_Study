---
difficulty: 4
reading_time: 30분
interview_frequency: 5
importance: 5
---

# 11. Data Structure 종합면접

> 게임 서버·백엔드 개발자를 위한 CS 면접 교재

## 학습 목표

- 요구 연산과 데이터 특성으로 자료구조를 선택하는 과정을 설명할 수 있다.
- Array부터 Union-Find까지 대표 구조의 강점과 한계를 비교할 수 있다.
- 여러 자료구조를 조합할 때 생기는 정합성·메모리·동시성 비용을 설명할 수 있다.
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
- **Linked List 삭제는 무조건 O(1)이다**: 삭제 Node 위치를 찾는 비용은 별도다.
- **Hash Table은 최악에도 O(1)이다**: 충돌과 Rehash 조건을 구분해야 한다.
- **BST는 항상 O(log n)이다**: 단순 BST는 편향되면 O(n)이다.
- **Heap은 정렬된 자료구조다**: 부모·자식의 부분 순서만 보장한다.
- **Concurrent Container면 복합 로직도 안전하다**: 여러 호출 사이의 Race는 별도로 보호해야 한다.
- **Index를 추가하면 성능만 좋아진다**: 메모리와 모든 쓰기의 갱신·정합성 비용이 늘어난다.
- **하나의 구조로 모든 요구를 해결해야 한다**: 요구별 구조를 조합하되 불변식을 관리할 수 있다.

## 15. 면접 질문

### Q1. 자료구조를 선택하는 기준을 설명해 주세요.

먼저 조회·삽입·삭제·순회·범위·최우선 선택 중 핵심 연산과 빈도를 정합니다. 그다음 원소 수와 분포, 평균·최악 복잡도, 메모리 지역성과 할당, 참조 수명과 동시성을 비교합니다. 후보를 실제 데이터로 측정해 결정합니다.

### Q2. Array와 Linked List를 비교해 주세요.

Array는 연속 메모리라 O(1) Index 접근과 순회 Cache 효율이 좋지만 중간 삽입·삭제가 O(n)입니다. Linked List는 Node 위치를 알면 연결 변경이 O(1)이지만 탐색은 O(n)이고 Pointer·할당 비용이 큽니다.

### Q3. Hash Table과 균형 Tree는 언제 선택하나요?

정확한 Key 조회가 중심이면 평균 O(1) Hash를 우선 검토합니다. 정렬 순회, 범위 검색, 다음 Key 또는 예측 가능한 최악 O(log n)이 필요하면 균형 Tree가 적합합니다.

### Q4. Timer 자료구조를 설계해 보세요.

가장 빠른 만료를 반복 처리하므로 `(expireAt, id)` Min Heap을 사용합니다. 취소가 적으면 Version 기반 Lazy Deletion, 많으면 Position Map이나 Tree를 검토합니다. 동일 시간 순서, Tick 처리 상한, 무효 Entry 정리와 동시 등록 정책도 설계합니다.

### Q5. 여러 자료구조를 조합할 때 무엇을 주의하나요?

LRU의 Hash와 List처럼 각 조회를 빠르게 할 수 있지만 메모리와 쓰기 비용이 증가합니다. 삽입·삭제 시 모든 Index를 원자적으로 갱신하고 실패 Rollback, Version·Generation, 불변식 검증을 둬야 합니다.

### Q6. Big-O 외에 실제 성능에 영향을 주는 요소는 무엇인가요?

연속성에 따른 Cache Miss, Allocation과 Fragmentation, 원소·Key 비교 비용, Capacity와 Rehash, Lock 경합, 최악 입력 분포가 영향을 줍니다. 평균 처리량뿐 아니라 p95·p99 지연과 메모리도 측정합니다.

### Q7. 공유 자료구조의 동시성을 어떻게 설계하나요?

먼저 단일 Thread 소유가 가능한지 봅니다. 공유가 필요하면 복합 불변식을 포함한 Lock 범위를 정하고 Sharding이나 Snapshot으로 경합을 줄입니다. Concurrent API를 사용해도 Check-Then-Act 같은 여러 단계 로직은 별도 원자화합니다.

## 16. 예상 꼬리질문

- 작은 데이터에서는 왜 선형 Array가 Tree보다 빠를 수 있나요?
- Dynamic Array의 분할 상환 O(1)은 무엇을 뜻하나요?
- Hash와 Equality가 일치해야 하는 이유는 무엇인가요?
- Heap의 임의 삭제를 빠르게 하려면 무엇을 추가하나요?
- Trie와 정렬 Tree의 Prefix 검색을 비교해 주세요.
- Graph 연결 여부에 Union-Find를 쓰지 못하는 경우는 언제인가요?
- 자료구조 변경이 Pointer·Iterator에 미치는 영향은 어떻게 확인하나요?

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
