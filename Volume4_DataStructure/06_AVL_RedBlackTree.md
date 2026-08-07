---
difficulty: 4
reading_time: 25분
interview_frequency: 4
importance: 4
---

# 06. AVL Tree와 Red-Black Tree


## 학습 목표

- 입력 데이터가 정렬된 순서로 들어올 때 단순 BST를 피해야 하는 이유를 최악 시간 복잡도로 설명하고, 균형 트리 도입 기준을 판단할 수 있다.
- LL·RR·LR·RL 불균형 패턴을 식별하고 각각에 필요한 회전 조합이 BST Key 순서를 보존하는지 확인할 수 있다.
- AVL Tree와 Red-Black Tree의 균형 조건과 Trade-off를 비교할 수 있다.
- 정렬 Map·Set, 범위 검색, 게임 서버 작업에 적절한 구조를 선택할 수 있다.

## 1. 개요

AVL Tree와 Red-Black Tree는 스스로 높이를 조절하는 이진 탐색 트리다. 둘 다 BST의 순서 불변식을 유지하면서 삽입·삭제 뒤 균형을 복구해 탐색·삽입·삭제의 최악 시간 복잡도를 `O(log n)`으로 보장한다.

단순 BST는 입력 순서에 민감하다. `1, 2, 3, 4, 5`를 차례로 삽입하면 오른쪽 자식만 이어져 높이가 `n`에 가까워진다. 이 경우 탐색은 연결 리스트 탐색과 같아진다.

```text
단순 BST                    균형을 유지한 BST

1                                  2
 \                               /   \
  2                             1      4
   \                                  / \
    3                                3   5
     \
      4
       \
        5

높이 O(n)                    높이 O(log n)
```

AVL은 좌우 서브트리의 높이 차이를 엄격하게 제한한다. Red-Black Tree는 노드의 색과 경로 규칙으로 높이를 완화해서 제한한다. 결과적으로 AVL은 보통 더 낮은 트리를 만들고, Red-Black Tree는 갱신 때 필요한 재조정을 줄이는 방향의 절충이다.

## 2. 왜 필요한가

서버에 들어오는 Key의 순서를 항상 통제할 수는 없다. 순차 ID, 시간순 Timestamp, 공격자가 조작한 입력처럼 이미 정렬된 값이 들어올 수 있다. 단순 BST의 평균 성능만 믿으면 특정 입력에서 지연이 `O(n)`으로 악화된다.

균형 트리는 다음 요구를 함께 만족할 때 유용하다.

- 입력 분포와 무관하게 주요 연산의 최악 시간을 제한해야 한다.
- Key의 정렬 순서가 필요하다.
- 범위 검색, 최소·최대, 다음·이전 Key 검색이 필요하다.
- 배열보다 삽입·삭제가 자주 발생한다.

Hash Table은 정확한 Key 조회가 평균 `O(1)`이지만 정렬 순서를 제공하지 않는다. 균형 트리는 주요 연산이 `O(log n)`인 대신 순서 기반 연산을 제공하며, Hash 충돌과 무관한 최악 시간 상한도 갖는다.

## 3. 회전의 핵심 원리

회전(Rotation)은 일부 노드의 부모·자식 연결을 바꿔 높이를 조절하는 연산이다. 중요한 점은 중위 순회 결과, 즉 BST의 Key 순서가 변하지 않는다는 것이다.

### 오른쪽 회전

```text
회전 전                    y를 기준으로 오른쪽 회전

        y                           x
       / \                         / \
      x   C        ───→           A   y
     / \                             / \
    A   B                           B   C

중위 순서: A, x, B, y, C     중위 순서: A, x, B, y, C
```

`x`가 위로 올라가고 `y`가 오른쪽 자식이 된다. `x`와 `y` 사이에 있던 `B`는 Key가 `x`보다 크고 `y`보다 작으므로 `y`의 왼쪽 자식으로 이동한다. 왼쪽 회전은 이를 좌우 반전한 연산이다.

회전 자체는 몇 개의 포인터와 높이·색 정보를 바꾸므로 `O(1)`이다. 하지만 위반 위치를 찾고 조상 방향으로 정보를 갱신하는 과정은 트리 높이에 비례한다. Root가 바뀌거나 부모 연결이 달라질 수 있으므로 구현할 때 부모 포인터와 컨테이너의 Root 참조까지 빠짐없이 갱신해야 한다.

## 4. AVL Tree

AVL Tree는 모든 노드에서 왼쪽과 오른쪽 서브트리 높이 차이의 절댓값을 1 이하로 유지한다.

```text
BalanceFactor(node) = height(left) - height(right)

허용 값: -1, 0, +1
```

삽입은 일반 BST처럼 수행한 뒤 삽입 경로를 Root 방향으로 올라가며 높이와 Balance Factor를 갱신한다. 처음으로 절댓값이 2가 된 노드에서 불균형 방향에 따라 회전한다.

### 네 가지 불균형

```text
LL: z의 왼쪽-왼쪽에 삽입     → z에서 오른쪽 회전
RR: z의 오른쪽-오른쪽에 삽입 → z에서 왼쪽 회전
LR: z의 왼쪽-오른쪽에 삽입   → 자식 왼쪽 회전 후 z 오른쪽 회전
RL: z의 오른쪽-왼쪽에 삽입   → 자식 오른쪽 회전 후 z 왼쪽 회전
```

예를 들어 `30, 20, 10` 순서로 넣으면 `30`에서 LL 불균형이 생긴다.

```text
      30                   20
     /                    /  \
    20       ───→        10   30
   /
  10
```

`30, 10, 20`은 LR 형태다. 먼저 `10`을 왼쪽으로 회전해 LL 형태로 만들고, `30`을 오른쪽으로 회전한다.

```text
     30             30              20
    /              /               /  \
   10      →       20       →      10   30
     \            /
      20         10
```

AVL 삽입에서는 가장 가까운 불균형 노드를 회전하면 그 서브트리 높이가 삽입 전 수준으로 복구되므로 대개 추가 구조 회전이 끝난다. 다만 조상의 높이 값은 갱신해야 한다.

삭제는 더 까다롭다. 노드 제거로 한쪽 높이가 줄어들면 조상 여러 곳에서 연속으로 불균형이 생길 수 있어 Root까지 여러 번 회전할 수 있다. 그래도 경로 길이가 `O(log n)`이므로 전체 삭제는 `O(log n)`이다.

AVL은 엄격하게 균형을 유지해 탐색 경로가 짧다. 조회가 압도적으로 많고 갱신이 상대적으로 적은 메모리 인덱스에서 고려할 수 있다. 반면 노드마다 높이 또는 Balance Factor를 저장하고, 갱신 시 더 빈번한 검사와 회전이 필요하다.

## 5. Red-Black Tree

Red-Black Tree는 각 노드에 Red 또는 Black 색을 저장하고 다음 규칙을 유지한다. 구현 설명에서는 `NIL` Leaf를 명시적인 Black Sentinel로 보는 경우가 많다.

1. 모든 노드는 Red 또는 Black이다.
2. Root는 Black이다.
3. 모든 `NIL` Leaf는 Black이다.
4. Red 노드의 자식은 모두 Black이다. 즉 Red가 연속될 수 없다.
5. 한 노드에서 후손 `NIL`까지 가는 모든 경로의 Black 노드 수가 같다.

마지막 경로의 Black 노드 수를 Black Height라고 한다. 가장 긴 경로에는 Black 사이에 Red가 하나씩 끼어들 수 있고, 가장 짧은 경로는 Black만으로 이뤄질 수 있다. 따라서 가장 긴 경로는 가장 짧은 경로의 두 배를 넘지 않으며 전체 높이는 `O(log n)`이다.

### 삽입 재조정

새 노드는 보통 Red로 삽입한다. Black으로 삽입하면 해당 경로의 Black Height가 즉시 증가하지만, Red는 부모가 Black이면 규칙을 깨지 않기 때문이다. 부모도 Red라면 “Red 연속” 위반이 생긴다.

재조정은 부모, 삼촌, 조부모의 색과 배치를 본다.

- **삼촌이 Red**: 부모와 삼촌을 Black, 조부모를 Red로 바꾸고 조부모에서 검사를 계속한다.
- **삼촌이 Black이고 꺾인 형태**: 부모에서 먼저 회전해 일자 형태로 만든다.
- **삼촌이 Black이고 일자 형태**: 조부모에서 회전하고 부모·조부모의 색을 바꾼다.
- 마지막에는 Root를 Black으로 만든다.

```text
부모와 삼촌이 Red인 경우

         B(Black)                   R(검사 계속)
        /       \                  /          \
     P(Red)     U(Red)    →     P(Black)     U(Black)
     /
  N(Red)
```

색 변경만으로 해결되는 경우가 있어 매번 회전하지는 않는다. 삽입 시 구조 회전 횟수는 제한적이지만 색 변경은 Root 방향으로 전파될 수 있다.

### 삭제 재조정

Red Leaf를 삭제하면 Black Height가 변하지 않는다. 문제가 되는 대표 상황은 Black 노드를 제거해 한 경로의 Black 수가 하나 부족해지는 경우다. 이를 흔히 Double Black 상태라는 개념으로 설명한다.

형제의 색, 형제 자식의 색에 따라 색 변경과 회전을 수행해 부족한 Black을 현재 위치에서 해결하거나 부모 방향으로 올린다. 세부 Case는 많지만 면접에서는 모든 Case를 암기하기보다 다음 흐름을 설명하는 편이 중요하다.

```text
BST 방식으로 삭제
   ↓
제거된 실제 노드가 Black인가?
   ↓ yes
형제·조카의 색을 확인
   ↓
색 변경 또는 회전으로 경로의 Black 수 복구
```

라이브 코딩에서 Red-Black 삭제를 처음부터 정확히 구현하는 것은 오류 가능성이 높다. 실무에서는 검증된 표준 컨테이너를 사용하고, 직접 구현해야 한다면 모든 불변식을 검사하는 테스트를 둔다.

## 6. AVL과 Red-Black Tree 비교

| 항목 | AVL Tree | Red-Black Tree |
|---|---|---|
| 균형 기준 | 좌우 높이 차이 ≤ 1 | 색과 Black Height 규칙 |
| 트리 높이 | 더 엄격하게 낮음 | AVL보다 다소 높을 수 있음 |
| 탐색 | 경로가 짧아 유리할 수 있음 | 최악 O(log n) |
| 삽입·삭제 | 높이 갱신과 회전이 더 잦음 | 완화된 균형으로 범용 갱신에 유리 |
| 노드 추가 정보 | 높이 또는 Balance Factor | 1 bit 성격의 색 정보 |
| 구현 난이도 | 회전 Case가 비교적 직관적 | 특히 삭제 재조정이 복잡함 |
| 대표 성격 | 조회 중심 | 조회·갱신 혼합의 Map·Set |

둘의 Big-O는 같다. 따라서 “Red-Black이 항상 더 빠르다” 또는 “AVL이 항상 더 빠르다”라고 말할 수 없다. 비교 횟수, 회전·색 변경, 노드 배치, Allocator, 원소 크기와 연산 비율에 따라 실제 결과가 달라진다.

AVL의 엄격한 균형은 읽기 성능을 돕지만 CPU Cache 관점에서 연결 노드 자체가 배열보다 불리할 수 있다. 작은 데이터는 정렬 배열의 이진 탐색이 더 단순하고 빠를 수 있다. 성능이 중요한 경로라면 실제 Key와 부하 분포로 측정해야 한다.

## 7. 다른 자료구조와 비교

| 요구 | 적합한 후보 | 이유와 비용 |
|---|---|---|
| 정확한 ID 한 건 조회 | Hash Table | 평균 O(1), 정렬 없음 |
| 정렬된 Key와 범위 조회 | 균형 BST | O(log n + k) 범위 순회 |
| 조회 위주 고정 데이터 | 정렬 배열 | 이진 탐색과 좋은 Cache 지역성 |
| 최우선 원소 반복 제거 | Heap | Top O(1), 삽입·제거 O(log n) |
| Disk 기반 대규모 Index | B+Tree | 높은 Fan-out으로 I/O 횟수 감소 |

B+Tree도 균형 탐색 트리지만 한 노드에 여러 Key와 자식을 둔다. Disk나 DB Page처럼 한 번의 I/O로 많은 Key를 읽는 환경에 맞춘 구조다. AVL·Red-Black Tree 같은 이진 트리를 그대로 Disk Index에 쓰면 높이와 Random I/O가 커질 수 있다.

## 8. 장점과 단점

### 장점

- 입력 순서와 무관하게 탐색·삽입·삭제의 최악 시간을 `O(log n)`으로 제한한다.
- Key의 정렬 순회와 범위 검색을 지원한다.
- 최소·최대, 선행자·후속자를 효율적으로 찾을 수 있다.
- 배열과 달리 중간 삽입·삭제 시 이후 원소 전체를 이동하지 않는다.

### 단점

- 회전과 균형 정보 갱신으로 단순 BST보다 구현이 복잡하다.
- 노드별 포인터와 균형 정보, 개별 할당 비용이 필요하다.
- 포인터 추적으로 Cache 지역성이 떨어질 수 있다.
- 기본 컨테이너가 동시성 안전을 제공하는 것은 아니다.
- 복합 인덱스를 여러 개 유지하면 갱신의 원자성과 정합성 관리가 필요하다.

## 9. 게임 서버·백엔드 실무 예시

### 예약 작업 Scheduler

게임 서버가 Buff 만료, 우편 발송, Session Timeout 작업을 `(실행 시각, 작업 ID)` 순서로 관리한다고 하자. 균형 트리를 사용하면 현재 시각 이하의 작업을 정렬 순서로 찾고, 특정 시간 범위의 작업을 조회할 수 있다.

하지만 가장 이른 작업을 꺼내기만 한다면 Min Heap이 더 단순할 수 있다. 임의 작업 취소가 많다면 ID용 Hash Map과 Heap을 함께 사용하거나, 균형 Tree 하나로 시간순 탐색과 삭제를 처리할 수 있다. 요구별 연산 비율을 기준으로 선택해야 한다.

```text
등록: (expireAt, timerId)
            ↓
       Balanced Tree
       /     |      \
  이전 시간  now   이후 시간
       └─ 만료 범위를 순서대로 처리
```

### 점수 구간과 Matchmaking

MMR을 Key로 플레이어를 정렬해 두면 자신의 점수 주변 범위를 탐색할 수 있다. 동점 플레이어가 있으므로 `(MMR, playerId)` 같은 복합 Key가 필요하다. 후보 `k`명을 찾는 비용은 시작 위치 탐색 `O(log n)`과 결과 순회 `O(k)`를 합쳐 `O(log n + k)`가 된다.

플레이어의 MMR이 바뀌면 기존 Key를 삭제하고 새 Key로 삽입해야 한다. 객체 내부의 Key만 수정하면 BST 위치와 Key가 불일치해 불변식이 깨진다. 정렬 컨테이너에 들어간 Key를 변경 가능한 상태로 두지 않거나, 반드시 제거 후 재삽입하는 API를 제공해야 한다.

```java
// Java TreeMap = Red-Black Tree 기반 정렬 Map
// 게임 서버: MMR 범위 기반 매칭 + 만료 이벤트 스케줄러
class MatchmakingQueue {
    // Key = MMR 점수, Value = 플레이어 ID 목록
    private final TreeMap<Integer, List<Long>> queue = new TreeMap<>();

    void enqueue(int mmr, long playerId) {
        queue.computeIfAbsent(mmr, k -> new ArrayList<>()).add(playerId);
    }

    // MMR ±100 범위 내 플레이어 목록 조회: O(log n + k)
    List<Long> findOpponents(int mmr, int range) {
        List<Long> candidates = new ArrayList<>();
        // subMap: [mmr-range, mmr+range] 범위 Red-Black Tree 내부 탐색
        queue.subMap(mmr - range, true, mmr + range, true)
             .values().forEach(candidates::addAll);
        return candidates;
    }
}

// 예약 이벤트 스케줄러: 만료 시간 기준 Red-Black Tree
class EventScheduler {
    private final TreeMap<Long, Runnable> events = new TreeMap<>();

    void schedule(long triggerAt, Runnable task) {
        events.put(triggerAt, task);
    }

    // 현재 시각 이하의 만료 이벤트 전부 실행: headMap = O(log n)
    void tick(long now) {
        NavigableMap<Long, Runnable> expired = events.headMap(now, true);
        expired.values().forEach(Runnable::run);
        expired.clear();
    }
}
```

Java TreeMap이 내부적으로 Red-Black Tree를 사용하므로 삽입·삭제 후 O(log n) 높이가 유지된다. subMap·headMap은 Red-Black Tree의 정렬 속성을 그대로 활용한다.

### 운영 고려사항

표준 라이브러리의 정렬 Map·Set이 어떤 Tree를 사용하는지는 구현 문서를 확인한다. 예를 들어 C++ 표준은 `std::map`의 복잡도와 동작을 규정하지만 내부 자료구조를 Red-Black Tree로 강제하지는 않는다. C# 컬렉션도 구체적 계약을 기준으로 선택해야 한다.

공유 컨테이너에 여러 Thread가 동시에 쓰면 회전 중 중간 상태를 다른 Thread가 볼 수 있다. Lock, 단일 Thread 소유, Copy-on-Write Snapshot 등 동시성 정책이 별도로 필요하다. p99 지연이 중요하면 노드 할당, Lock 경합, 비교 함수 비용까지 측정한다.

## 10. 자주 하는 오해

- **균형 트리는 모든 노드의 좌우 크기가 같다**: AVL도 높이 차이를 제한할 뿐 원소 수가 같을 필요는 없다.
- **회전하면 BST의 정렬 순서가 바뀐다**: 연결과 Root는 바뀌지만 중위 순서와 Key 불변식은 유지된다.
- **Red-Black Tree의 모든 Root-to-Leaf 경로 길이가 같다**: 같은 것은 Black 노드 수이며 실제 길이는 다를 수 있다.
- **Red 노드에는 Red 자식만 없으면 충분하다**: Black Height 등 다른 규칙도 함께 만족해야 한다.
- **AVL 삽입과 삭제의 재균형은 완전히 같다**: 삭제는 높이 감소가 조상으로 전파되어 여러 번 회전할 수 있다.
- **AVL Tree와 Red-Black Tree는 같은 균형 알고리즘을 사용한다**: AVL은 Balance Factor(±1) 기반 엄격한 균형을 유지하고, Red-Black은 Red-Red 금지와 Black Height 균등 규칙으로 느슨한 균형을 유지한다. 두 알고리즘은 완전히 다른 회전·재색칠 절차를 따른다.
- **Red-Black Tree의 색(Color) 정보는 트리 구조와 무관하므로 언제든 변경해도 된다**: Red-Black Tree의 5가지 불변식(루트는 Black, Red 자식은 Black, Black Height 균등 등) 중 일부는 색 정보에 직접 의존한다. 임의로 색을 바꾸면 Black Height가 맞지 않아 불변식이 깨지고 삽입·삭제 재균형 로직이 오작동한다.

## 11. 면접 질문

### Q1. 읽기 집약적인 랭킹 조회 서버에서 AVL Tree를 Red-Black Tree 대신 선택하는 것이 의미 있는 구체적인 조건은 무엇인가? 반대로 아이템 구매·MMR 변경처럼 삽입·삭제가 잦은 경우에는 왜 Red-Black Tree가 유리한가?

AVL은 모든 노드에서 좌우 높이 차이를 1 이하로 유지하므로 Red-Black Tree보다 트리 높이가 낮고 탐색 경로가 짧습니다. 랭킹 Top 100 조회나 MMR 범위 탐색처럼 읽기 연산 비율이 90% 이상이고 갱신은 드문 경우 AVL의 짧은 경로가 실질적으로 유리합니다. 반면 아이템 구매나 MMR 변경처럼 삽입·삭제가 빈번하면 AVL은 Balance Factor ±2 위반마다 회전을 수행하고 조상 방향으로 높이 갱신이 전파됩니다. Red-Black Tree는 색 변경만으로 해결되는 경우가 있어 구조 회전 횟수가 제한적이고 갱신 비용이 낮습니다. 결국 읽기가 압도적이면 AVL, 쓰기가 섞이면 Red-Black Tree가 현실적인 선택입니다. 다만 Big-O는 동일하므로 실제 Key 분포와 읽기·쓰기 비율을 측정한 뒤 선택해야 합니다.

### Q2. 동접 10만 규모 게임 서버에서 TreeMap 단독으로 MMR 랭킹을 처리하다가 성능 한계에 부딪히는 시점은 언제이며, 그때 샤딩 또는 Redis Sorted Set 전환을 판단하는 기준은 무엇인가?

TreeMap은 단일 JVM 힙에 올라가므로 플레이어 수가 수십만 수준이면 메모리는 감당 가능하지만 단일 Lock 아래 동시 쓰기가 몰릴 때가 문제입니다. Lock 경합이 심해지면 `synchronized(treeMap)` 블록 대기 시간이 늘고 GC 압박도 커집니다. 제 기준으로는 TreeMap 갱신 응답 시간의 p99가 10ms를 넘거나 Lock wait 비율이 30%를 넘기 시작하면 전환을 검토합니다. Redis Sorted Set은 단일 스레드 원자 연산으로 Lock 경합이 없고 `ZRANGEBYSCORE`로 범위 조회를 처리하며 서버 간 공유가 가능합니다. 반면 네트워크 RTT가 추가되고 JVM 내 계산보다 비쌉니다. 따라서 단일 서버 내 인메모리 범위 조회로 충분하다면 ConcurrentSkipListMap으로 먼저 대응하고, 여러 서버가 동일 랭킹을 공유해야 하거나 단일 프로세스 한계에 도달하면 Redis Sorted Set으로 전환합니다.

### Q3. 삽입·삭제 후 특정 MMR 구간 범위 조회 결과가 이상할 때, AVL 또는 Red-Black Tree의 불변식 위반을 어떻게 진단하는가?

먼저 범위 조회가 반환한 결과가 실제로 Key 순서를 벗어났는지 확인합니다. 중위 순회 결과가 정렬되지 않았다면 BST 불변식 자체가 깨진 것으로 회전 구현의 포인터 갱신 오류를 의심합니다. AVL이라면 각 노드의 Balance Factor를 재계산해 ±1을 벗어난 노드를 찾고, 삽입 경로 위 어느 단계에서 높이 갱신이 누락됐는지 역추적합니다. Red-Black Tree라면 임의 경로의 Black 노드 수를 세어 Black Height가 균등한지 확인하고, Red 노드 연속 여부를 검사합니다. 테스트 환경에서는 삽입·삭제 후마다 전체 트리를 순회하며 불변식을 검증하는 assertion을 추가합니다. 운영 환경에서 이런 버그가 터지면 대부분 회전 중 부모 포인터나 Root 참조를 빠뜨린 경우입니다.

### Q4. 게임 서버에서 멀티스레드 환경으로 TreeMap을 사용할 때 ReentrantReadWriteLock과 ConcurrentSkipListMap 중 어떤 기준으로 선택하는가? 각각 실패하는 시나리오도 설명하라.

읽기 비율이 높고 읽기 쓰레드가 많다면 ReentrantReadWriteLock이 유리합니다. 여러 쓰레드가 동시에 읽기 락을 공유하므로 읽기 처리량이 높아집니다. 하지만 쓰기 락이 잡히면 모든 읽기가 블록되고, 쓰기가 자주 발생하는 구간에서 읽기가 기아 상태에 빠질 수 있습니다. MMR 변경이 초당 수백 건씩 몰리는 시간대에 이 현상이 나타납니다. ConcurrentSkipListMap은 Lock-free에 가까운 CAS 기반이라 쓰기가 빈번해도 읽기가 블록되지 않고, 여러 쓰레드가 동시에 쓸 때도 충돌 범위가 좁습니다. 대신 TreeMap보다 메모리 사용량이 많고 랜덤 접근보다 순차 범위 조회에서 Cache 지역성이 떨어질 수 있습니다. 일반적으로 동접이 많고 쓰기도 꾸준히 섞이면 ConcurrentSkipListMap, 읽기가 압도적이고 쓰기가 간헐적이면 ReadWriteLock + TreeMap을 선택합니다.

### Q5. MMR 변경 시 TreeMap에서 기존 Key를 삭제하고 새 Key로 재삽입하지 않고 객체 내부 필드만 직접 수정하면 어떤 장애가 발생하는가? 실제 운영에서 이 버그를 어떻게 탐지하는가?

TreeMap은 삽입 시점의 Key 값으로 노드 위치를 결정합니다. Key에 해당하는 객체 필드를 외부에서 직접 수정하면 노드 물리 위치는 그대로인데 Key 값이 달라집니다. 이후 해당 Key로 조회하면 BST 탐색이 엉뚱한 방향으로 내려가 결과를 찾지 못하거나, 범위 조회에서 해당 플레이어가 빠지거나 중복으로 나타납니다. 매칭 대기열에서 이 버그가 나면 특정 MMR 구간에서 매칭이 성립하지 않거나 같은 플레이어가 중복 매칭됩니다. 탐지 방법으로는 TreeMap에 들어간 모든 Key의 스냅샷을 주기적으로 중위 순회로 검증해 정렬 순서가 깨지면 경보를 올립니다. 근본 해결은 TreeMap의 Key를 불변 객체로 설계하거나, 변경 API를 remove 후 put으로만 제공하는 것입니다.

### Q6. 100만 명 랭킹에서 상위 100명 범위 조회와 특정 플레이어 UID 단건 조회를 모두 지원해야 할 때, TreeMap 단독·HashMap 단독·TreeMap+HashMap 혼용 중 어떤 설계를 선택하고 그 이유는 무엇인가?

TreeMap+HashMap 혼용을 선택합니다. TreeMap 단독은 범위 조회는 `O(log n + k)`로 처리하지만 UID 단건 조회도 `O(log n)`입니다. 100만 명 규모에서 단건 조회 빈도가 높으면 `O(1)` 평균인 HashMap이 유리합니다. HashMap 단독은 UID 조회는 빠르지만 정렬 순서를 제공하지 않으므로 범위 조회 시 전체 순회가 필요합니다. 따라서 TreeMap으로 점수 기반 정렬·범위 조회를 처리하고, HashMap으로 UID→점수 매핑을 유지하는 혼용 구조가 두 요구를 각각 최적 복잡도로 처리합니다. 단, MMR 변경 시 두 자료구조를 함께 갱신해야 하므로 TreeMap에서 remove 후 put, HashMap에서 put을 한 트랜잭션처럼 묶어야 하며 실패 시 롤백 처리가 필요합니다.

## 12. 예상 꼬리질문

- 읽기 90%·쓰기 10% 비율의 랭킹 서버에서 AVL을 선택했는데 갱신 지연이 예상보다 높게 나왔다. 어떤 항목부터 측정하겠는가?
- ConcurrentSkipListMap을 쓰다가 범위 조회 정확도 문제가 생겼다. 원인으로 의심할 수 있는 것은 무엇인가?
- TreeMap 삽입·삭제 후 중위 순회 결과가 정렬 순서를 벗어나는 버그를 발견했다. 회전 구현 어느 부분을 먼저 점검하겠는가?
- Redis Sorted Set으로 전환 후 `ZRANGEBYSCORE` 응답이 TreeMap 범위 조회보다 느렸다. 가능한 원인은 무엇인가?
- MMR 변경이 초당 1,000건 발생하는 서버에서 ReentrantReadWriteLock + TreeMap 조합이 쓰기 기아를 일으키지 않으려면 어떤 설정을 확인해야 하는가?
- 복합 Key `(MMR, playerId)` 로 TreeMap을 구성했을 때 동점 플레이어의 삭제가 잘못된 노드를 제거하는 버그가 나타날 수 있다. 어떤 경우에 발생하며 어떻게 방지하는가?
- 게임 서버 재시작 시 TreeMap을 DB에서 복원해야 한다. 100만 건 삽입 시 소요 시간 추정과 Hot Reload 방법을 어떻게 설계하겠는가?
- AVL Tree의 삭제가 삽입보다 회전이 많이 발생하는 이유는 무엇이며, 이것이 게임 서버의 아이템 만료 처리 성능에 어떤 영향을 주는가?

## 13. 30초 모범답변

> AVL과 Red-Black Tree는 삽입·삭제 후 회전으로 높이를 `O(log n)`으로 유지하는 균형 BST입니다. AVL은 좌우 높이 차이를 1 이하로 엄격히 제한해 탐색 경로가 짧고 읽기 집약적 구조에 유리합니다. Red-Black Tree는 색 규칙으로 균형을 완화해 구조 회전 빈도가 낮아 삽입·삭제가 섞인 범용 Map·Set에 많이 쓰입니다. Java TreeMap이 Red-Black Tree 기반이라 MMR 범위 매칭 같은 실무에서 직접 활용됩니다. 단, 동시성 안전을 제공하지 않으므로 멀티스레드 환경에서는 ConcurrentSkipListMap이나 별도 Lock 전략이 필요합니다.

## 14. 1~2분 확장답변

> 단순 BST는 정렬된 입력이 들어오면 한쪽으로 편향되어 탐색이 `O(n)`까지 악화됩니다. 균형 트리는 삽입·삭제 후 회전으로 높이를 `O(log n)`으로 유지합니다. 회전은 포인터 일부를 바꾸지만 중간 서브트리를 Key 범위에 맞게 옮기기 때문에 중위 순서는 보존됩니다.
>
> AVL은 Balance Factor ±1을 강제해 트리 높이가 낮고 탐색 경로가 짧습니다. 읽기 비율이 압도적인 서버에서 유리하지만, 삽입·삭제마다 조상 방향으로 높이 갱신이 전파되고 불균형이 생기면 즉시 회전하므로 쓰기 비용이 Red-Black Tree보다 높습니다. Red-Black Tree는 Red 연속 금지와 Black Height 균등 규칙으로 높이를 느슨하게 제한합니다. 삽입 시 색 변경만으로 해결되는 Case가 있어 구조 회전이 줄고, 삭제도 Double Black 전파로 처리 범위를 최소화합니다. Java TreeMap이 이 구조를 사용해 MMR 범위 매칭이나 예약 스케줄러에 바로 활용할 수 있습니다.
>
> 멀티스레드 환경에서는 TreeMap이 스레드 안전을 보장하지 않으므로 읽기 비율이 높으면 ReentrantReadWriteLock, 쓰기가 빈번하면 Lock-free에 가까운 ConcurrentSkipListMap을 선택합니다. 동접 10만 이상에서 단일 TreeMap의 Lock 경합이 심해지면 p99 지연을 지표로 삼아 Redis Sorted Set 전환 시점을 판단합니다. 또한 TreeMap에 넣은 Key 객체를 외부에서 직접 수정하면 BST 불변식이 깨져 범위 조회 오류나 중복 매칭이 발생하므로, Key는 불변 객체로 설계하거나 remove 후 put으로만 변경해야 합니다.

## 15. 핵심 요약

- 단순 BST는 입력 순서에 따라 높이 `O(n)`으로 편향될 수 있다.
- 회전은 중위 순서와 BST 불변식을 유지하며 일부 서브트리의 높이를 바꾼다.
- AVL은 모든 노드에서 좌우 높이 차이를 1 이하로 제한한다.
- AVL의 LL·RR은 단일 회전, LR·RL은 이중 회전으로 복구한다.
- Red-Black Tree는 색, Red 연속 금지, 동일한 Black Height 규칙으로 높이를 제한한다.
- 두 구조 모두 탐색·삽입·삭제의 최악 시간 복잡도가 `O(log n)`이다.
- AVL은 엄격한 균형과 조회, Red-Black Tree는 갱신을 포함한 범용 사용에 강점이 있다.
- 정렬·범위가 필요하면 균형 Tree, 정확한 Key 조회 중심이면 Hash Table을 우선 검토한다.

## 한 줄 정리

> AVL과 Red-Black Tree는 서로 다른 균형 규칙으로 BST의 높이를 `O(log n)`에 묶어 예측 가능한 탐색 성능을 만든다.
