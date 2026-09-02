---
difficulty: 3
reading_time: 25분
interview_frequency: 5
importance: 5
---

# 02. BFS와 DFS


## 학습 목표

- Graph 문제에서 최단 경로가 필요하면 BFS, 모든 경로·연결 확인이 필요하면 DFS를 선택하는 기준을 판단할 수 있다.
- Graph·Grid에서 방문 처리와 시간·공간 복잡도를 분석할 수 있다.
- Edge 가중치와 Graph 형태를 보고 BFS·Dijkstra·0-1 BFS 중 어느 알고리즘이 최단 경로를 보장하는지 선택할 수 있다.
- 경로 복원, 연결 요소, Cycle 탐지와 게임 월드 탐색에 적용할 수 있다.

## 1. 개요

BFS(Breadth-First Search)는 시작점에서 가까운 Vertex부터 Level 단위로 넓게 탐색한다. FIFO Queue를 사용한다. DFS(Depth-First Search)는 한 경로를 가능한 깊게 내려간 뒤 되돌아오며 다른 경로를 탐색한다. 재귀 호출 Stack이나 명시적인 Stack을 사용한다.

```text
        A
      /   \
     B     C
    / \     \
   D   E     F

BFS 예: A, B, C, D, E, F
DFS 예: A, B, D, E, C, F
```

실제 순서는 인접 목록의 순서에 따라 달라질 수 있다. 핵심은 BFS가 거리 Level을 지키고 DFS가 한 Branch를 먼저 끝낸다는 점이다.

## 2. 왜 필요한가

Graph는 Cycle과 여러 경로를 가질 수 있으므로 단순 반복만으로 체계적으로 탐색하기 어렵다. BFS와 DFS는 다음 문제의 기본 도구다.

- 시작점에서 특정 Vertex에 도달할 수 있는가?
- 비가중 Graph의 최소 이동 횟수는 얼마인가?
- 연결된 Group은 몇 개인가?
- Grid의 섬·영역은 몇 개인가?
- Graph에 Cycle이 있는가?
- 의존성 순서가 가능한가?
- 조건을 만족하는 경로를 하나 또는 모두 찾을 수 있는가?

두 Algorithm의 시간 복잡도는 비슷하지만 탐색 순서와 최대 Memory, 얻을 수 있는 보장이 다르다. 문제에서 요구하는 결과를 먼저 확인해야 한다.

## 3. BFS의 동작 원리

시작점을 Queue에 넣고, 앞에서 하나를 꺼내 아직 방문하지 않은 이웃을 뒤에 넣는다.

```text
queue.enqueue(start)
visited[start] = true

while queue is not empty:
    current = queue.dequeue()
    for next in neighbors(current):
        if visited[next]: continue
        visited[next] = true
        queue.enqueue(next)
```

FIFO이므로 거리 `d`인 Vertex들이 거리 `d+1`인 Vertex보다 먼저 처리된다.

```text
Queue 진행

[A]
 A 처리 → [B, C]
 B 처리 → [C, D, E]
 C 처리 → [D, E, F]
```

### 방문 표시는 넣을 때 한다

여러 Vertex가 같은 이웃을 가리킬 수 있다.

```text
 A → B
  \  ↓
   → C
```

Queue에서 꺼낼 때 방문 표시하면 A와 B가 C를 각각 Queue에 넣을 수 있다. 결과 자체는 중복을 걸러 맞출 수 있어도 Queue 크기와 작업량이 커진다. 일반 BFS에서는 발견해서 Enqueue하는 순간 방문 처리한다.

## 4. BFS와 비가중 최단 경로

BFS는 모든 Edge 비용이 동일한 Graph에서 시작점으로부터 최소 Edge 수를 구한다. 시작점의 거리를 0으로 두고, 처음 방문한 이웃의 거리를 `distance[current] + 1`로 기록한다.

왜 최단인지 생각해 보자. Queue는 거리 `d`인 Vertex를 모두 처리한 후 거리 `d+1`을 처리한다. 어떤 Vertex를 처음 발견했을 때 그보다 짧은 경로가 있었다면 더 작은 Level에서 먼저 발견됐어야 한다. 따라서 첫 방문 거리가 최소다.

```text
distance[start] = 0
distance[next] = distance[current] + 1
parent[next] = current
```

실제 경로는 `parent`를 목적지부터 시작점까지 역추적한 뒤 뒤집는다.

```text
parent[D] = B
parent[B] = A

D → B → A  역추적
A → B → D  뒤집은 최단 경로
```

Edge 가중치가 다르면 BFS의 Level이 비용 합과 일치하지 않는다. 음수가 없는 일반 가중 Graph는 Dijkstra, 가중치가 0 또는 1뿐이면 0-1 BFS를 고려한다.

## 5. DFS의 동작 원리

DFS는 현재 Vertex를 방문하고 방문하지 않은 이웃에 대해 같은 작업을 재귀적으로 수행한다.

```text
dfs(current):
    visited[current] = true
    for next in neighbors(current):
        if not visited[next]:
            dfs(next)
```

호출 Stack이 현재 경로를 기억한다. 더 내려갈 이웃이 없으면 호출이 반환되어 이전 Vertex로 Backtrack한다.

```text
A → B → D
        └─ 더 없음, B로 복귀
B → E
    └─ 더 없음, A로 복귀
A → C → F
```

명시적인 Stack으로도 구현할 수 있다.

```text
stack.push(start)
while stack is not empty:
    current = stack.pop()
    if visited[current]: continue
    visited[current] = true
    for next in reverse(neighbors(current)):
        stack.push(next)
```

재귀와 동일한 순서를 원하면 Stack의 LIFO 특성 때문에 이웃을 역순으로 넣어야 할 수 있다. 문제에서 방문 순서를 요구하지 않으면 순서 자체는 중요하지 않다.

## 6. 시간·공간 복잡도

인접 리스트 Graph에서 방문 처리를 하면 각 Vertex를 한 번 방문하고 각 Edge를 제한된 횟수 확인한다.

- 시간: BFS와 DFS 모두 `O(V + E)`
- 방문 배열: `O(V)`
- BFS Queue: 최악 `O(V)`
- DFS Stack·재귀 깊이: 최악 `O(V)`

무방향 Graph는 Edge를 양쪽 인접 목록에서 두 번 확인하지만 `2E`는 상수를 제거해 O(E)다.

인접 행렬에서는 한 Vertex의 이웃을 찾을 때 행의 `V`칸을 모두 확인하므로 전체가 O(V²)다. 복잡도는 Algorithm 이름만이 아니라 Graph 표현에 따라 달라진다.

BFS와 DFS의 보조 공간은 둘 다 최악 O(V)이지만 사용 형태가 다르다. 폭이 매우 넓은 Graph에서는 BFS Queue가 커지고, 깊은 Chain에서는 DFS Stack이 커진다.

```text
넓은 Tree: BFS Queue에 한 Level의 많은 Node
깊은 Chain: DFS 호출 Stack에 V개 Node
```

## 7. Grid에서의 탐색

2차원 Grid도 각 Cell을 Vertex, 상하좌우 이동을 Edge로 보는 Graph다. `R × C` Grid의 시간과 방문 공간은 O(RC)다.

```text
directions = [(1,0), (-1,0), (0,1), (0,-1)]

for each direction:
    nr = row + dr
    nc = col + dc
    if out of bounds: continue
    if blocked or visited: continue
```

자주 발생하는 오류는 행·열 경계 혼동, 장애물 검사 누락, 시작 Cell을 방문 처리하지 않는 것이다. 대각선 이동 허용 여부도 문제의 Edge 정의에 해당한다.

Grid 자체를 수정할 수 있다면 별도 `visited` 배열 대신 방문 Cell 값을 바꿔 공간을 줄일 수 있다. 그러나 원본을 보존해야 하거나 동시에 다른 Reader가 사용한다면 부작용이 문제가 된다.

## 8. Multi-Source BFS

시작점이 여러 개라면 모든 시작점을 거리 0으로 Queue에 먼저 넣는다. 이후 일반 BFS를 수행하면 각 Vertex까지 가장 가까운 시작점의 거리를 구한다.

```text
for source in sources:
    queue.enqueue(source)
    visited[source] = true
    distance[source] = 0
```

불이 여러 곳에서 번지는 시간, 여러 Spawn Point 중 가장 가까운 위치, 여러 서버 Region까지의 최소 Hop을 계산할 때 유용하다. 시작점별로 BFS를 따로 실행하는 것보다 한 번의 O(V+E) 탐색으로 해결할 수 있다.

## 9. 연결 요소

아직 방문하지 않은 모든 Vertex에서 BFS나 DFS를 새로 시작한다. 탐색 한 번이 하나의 연결 요소를 방문한다.

```text
componentCount = 0
for vertex in vertices:
    if visited[vertex]: continue
    traverse(vertex)
    componentCount++
```

무방향 Graph의 Component 개수와 Grid의 섬 개수를 구할 수 있다. Edge가 추가되기만 하고 연결 여부 Query가 매우 많다면 Union-Find가 더 적합할 수 있다. 실제 경로나 Edge 삭제가 필요하면 Graph 탐색이 필요하다.

## 10. Cycle 탐지

### 무방향 Graph

DFS에서 이미 방문한 이웃이 현재 Vertex의 부모가 아니라면 Cycle이 있다. 무방향 Edge가 양쪽에 저장되므로 방금 건너온 부모 Edge를 Cycle로 오해하지 않아야 한다.

### 방향 Graph

상태를 세 가지로 구분할 수 있다.

- `WHITE`: 미방문
- `GRAY`: 현재 DFS 경로에 있음
- `BLACK`: 탐색 완료

현재 GRAY Vertex로 향하는 Edge를 만나면 Back Edge이며 방향 Cycle이 존재한다. 이미 완료된 BLACK Vertex로 가는 Edge는 Cycle을 뜻하지 않는다.

```text
A(GRAY) → B(GRAY) → C(GRAY)
  ↑                  |
  └──────────────────┘  Back Edge → Cycle
```

방향 비순환 Graph인 DAG(Directed Acyclic Graph)의 위상 정렬은 DFS 종료 순서를 뒤집거나 진입 차수와 Queue를 사용하는 Kahn Algorithm으로 구할 수 있다.

## 11. BFS와 DFS 비교

| 항목 | BFS | DFS |
|---|---|---|
| 핵심 구조 | Queue | Stack·재귀 |
| 탐색 순서 | 가까운 Level부터 | 한 Branch를 깊게 |
| 비가중 최단 Hop | 보장 | 보장하지 않음 |
| 경로 하나 탐색 | 가능 | 자연스러움 |
| 연결 요소 | 가능 | 가능 |
| Cycle·위상 정렬 | 가능하지만 방식 다름 | 자연스러움 |
| Memory 위험 | 넓은 Frontier | 깊은 재귀 Stack |

DFS가 목적지를 빨리 찾을 수도 있지만 처음 찾은 경로가 최단이라는 보장은 없다. BFS는 최단을 보장하지만 목표와 가까운 Level의 모든 Frontier를 저장해 Memory가 클 수 있다.

양방향 BFS는 시작점과 목적지 양쪽에서 탐색해 중간에서 만난다. Branching Factor가 큰 비가중 Graph에서 탐색 범위를 크게 줄일 수 있지만 역방향 Edge 조회가 가능해야 하고 두 방문 집합과 경로 결합이 필요하다.

## 12. 게임 서버·백엔드 실무 예시

### Zone 최소 이동 횟수

Zone을 Vertex, Portal을 Edge로 두고 모든 Portal 이동 비용을 1로 보면 BFS로 최소 이동 횟수를 구한다. 잠긴 Portal은 이웃 확장 시 조건으로 제외한다.

```text
Town ─ Field ─ Dungeon
  └──── Harbor

Queue는 Town에서 1 Hop, 2 Hop 순서로 확장
```

```java
// BFS: Zone 최단 이동 경로 탐색 (모든 Edge 비용 = 1)
int bfsShortestPath(Map<Integer, List<Integer>> adj, int start, int target) {
    Queue<Integer> queue = new LinkedList<>();
    Set<Integer> visited = new HashSet<>();
    queue.offer(start);
    visited.add(start);  // 방문 표시는 Queue에 넣을 때
    int distance = 0;
    while (!queue.isEmpty()) {
        int size = queue.size();
        for (int i = 0; i < size; i++) {
            int cur = queue.poll();
            if (cur == target) return distance;
            for (int next : adj.getOrDefault(cur, List.of())) {
                if (!visited.contains(next)) {
                    visited.add(next);
                    queue.offer(next);
                }
            }
        }
        distance++;
    }
    return -1;
}

// DFS: 연결 여부 확인 (재귀)
boolean dfsConnected(Map<Integer, List<Integer>> adj, int cur, int target, Set<Integer> visited) {
    if (cur == target) return true;
    visited.add(cur);
    for (int next : adj.getOrDefault(cur, List.of())) {
        if (!visited.contains(next) && dfsConnected(adj, next, target, visited)) return true;
    }
    return false;
}
```

Portal별 이동 시간이 다르면 최소 Hop과 최소 시간이 다르므로 Dijkstra가 필요하다. “최단”의 비용 정의를 먼저 확인한다.

### 맵 연결 검증

콘텐츠 배포 전에 Spawn Zone에서 DFS나 BFS를 수행하고 필수 Dungeon이 모두 방문되는지 검사할 수 있다. 방문하지 못한 Zone 목록과 막힌 Edge를 출력하면 단순 실패보다 진단에 유용하다.

### 실시간 Pathfinding Budget

큰 월드에서 BFS Frontier가 폭증하면 한 Tick을 넘길 수 있다. 탐색 Node 수와 시간 Budget을 두고 작업을 여러 Tick에 나누거나, 가까운 근사 목표를 사용하고, 요청을 취소할 수 있게 한다.

탐색 중 Map이 변경될 수 있다면 어느 Version을 기준으로 결과를 계산하는지 정의한다. Immutable Navigation Snapshot을 읽거나, 결과 적용 전 경로의 유효성을 다시 검사할 수 있다.

방문 배열을 매 요청마다 초기화하면 큰 O(V) 비용이 추가될 수 있다. 정수 Visit Generation을 저장해 현재 탐색 ID와 비교하면 전체 배열 Clear를 피할 수 있다. Generation Overflow 시 안전한 초기화 정책이 필요하다.

## 13. 구현 시 주의사항

- 시작점을 Enqueue·Push할 때 방문 처리한다.
- 없는 Vertex, 막힌 시작점, 시작점과 목적지가 같은 Case를 처리한다.
- Graph가 불연결일 수 있음을 가정한다.
- 재귀 DFS 깊이가 입력 상한을 견디는지 확인한다.
- 경로가 필요하면 발견 시 Parent를 기록한다.
- 인접 순서가 결과의 결정성에 영향을 주는지 확인한다.
- Queue·Stack과 방문 배열의 Memory 상한을 계산한다.
- 여러 Thread가 Graph를 변경한다면 Snapshot·Lock 정책을 정한다.

## 14. 자주 하는 오해

- **BFS는 항상 DFS보다 메모리를 적게 사용한다**: BFS는 같은 Level의 모든 노드를 Queue에 보관하므로 넓은 Graph(Branching Factor가 큰 경우)에서 메모리가 O(V)까지 증가한다. DFS는 현재 경로의 Stack만 유지하므로 깊이 D에서 O(D). 좁고 깊은 Graph에서는 DFS가 오히려 메모리 효율적이다. 넓고 얕은 Graph에서는 BFS가 불리하다.
- **DFS가 먼저 찾은 경로가 최단이다**: 탐색 순서에 따른 한 경로일 뿐이다.
- **방문 표시는 Queue에서 꺼낼 때 해도 같다**: 중복 Enqueue로 Memory와 작업이 커질 수 있다.
- **BFS와 DFS는 항상 O(V+E)다**: 인접 리스트 기준이며 행렬에서는 O(V²)가 될 수 있다.
- **재귀 DFS는 Memory O(1)이다**: 호출 Stack이 깊이에 비례한다.
- **BFS와 DFS의 탐색 결과는 구현 방식에 무관하게 항상 동일하다**: 재귀 DFS와 명시적 Stack DFS는 이웃 처리 순서가 다를 수 있어 방문 순서가 달라진다. 인접 목록 순서도 결과에 영향을 준다. 순서가 결정적이어야 한다면 이웃을 정렬하거나 처리 순서를 명시해야 한다.
- **BFS Queue는 최대 한 Level 크기뿐이다**: 처리 중 다음 Level도 함께 들어 있어 Frontier 규모를 넉넉히 봐야 한다.

## 15. 면접 질문

### Q1. 게임 서버 Zone 이동 탐색에서 Portal 비용이 모두 1일 때와 가중치가 다를 때 BFS·Dijkstra·0-1 BFS 선택 기준은?

**30초 모범답변**: 모든 간선 비용이 동일하면 BFS로 충분(O(V+E)). 비용이 0·1 두 종류뿐이면 0-1 BFS(Deque). 일반 양수 가중치면 Dijkstra. 음수 있으면 Bellman-Ford.

**1~2분 모범답변**: 게임 서버의 Zone Portal은 대부분 비용이 1이므로 BFS가 기본 선택. 그러나 이동 피로도나 레벨 제한을 비용으로 모델링하면 가중치가 생긴다. 비용이 0과 1뿐(예: 같은 Zone 내 이동=0, Portal 이동=1)이면 Deque 기반 0-1 BFS로 O(V+E) 유지. 피로도가 다양한 양수값이면 PriorityQueue 기반 Dijkstra로 O((V+E) log V). 알고리즘 선택 기준은 가중치 범위이며, 먼저 가중치 유무→음수 여부→0·1 여부 순으로 판단.

### Q2. BFS Frontier가 단일 Tick Budget을 초과할 만큼 폭증할 때 탐색 범위를 어떻게 제한하는가?

**30초 모범답변**: Budget 기반 탐색 중단(방문 노드 수 제한), 또는 탐색을 여러 Tick으로 분할하는 Incremental BFS 사용. 탐색 결과를 Cache해 동일 출발지 재탐색 방지.

**1~2분 모범답변**: BFS Frontier는 최악 O(V) — 게임 서버에서 Zone 수가 수천 개면 단일 Tick(16ms)에 처리 불가. 대응 전략: (1) Max Depth 제한 — 탐색 반경을 N Hop 이내로 제한해 Frontier 크기 상한 설정 (2) Incremental BFS — BFS 상태(Queue·visited)를 유지하며 Tick마다 일정량만 처리, 결과는 비동기로 전달 (3) Precomputed Paths — 정적 맵이면 서버 시작 시 Zone 간 최단 거리를 AllPairs BFS로 사전 계산해 캐싱. 동적 맵(Zone 연결 변경)이면 변경된 구역만 재계산하는 Incremental 방식 적용.

### Q3. 대규모 게임 서버에서 수백 개의 플레이어 요청이 동시에 Zone 탐색을 수행할 때, 요청별로 독립적인 방문 상태가 필요한 이유는 무엇이고 공유 방문 배열을 사용했을 때 어떤 장애가 발생하는가?

**30초 모범답변**: 공유 방문 배열을 사용하면 요청 A의 방문 표시가 요청 B의 탐색 경로를 잘못 차단한다. 잠금 없이 사용하면 Race Condition으로 일부 Zone이 탐색에서 누락되거나 결과가 오염된다. 각 요청은 독립적인 visited 구조를 가져야 하며, 재사용하려면 Generation 카운터나 Thread-Local 구조가 필요하다.

**1~2분 모범답변**: 공유 방문 배열의 문제는 두 가지다. (1) 논리적 오염: 요청 A가 Zone 5를 방문 표시한 상태에서 요청 B가 탐색하면 Zone 5를 이미 방문된 것으로 판단해 올바른 경로를 건너뛴다. (2) Race Condition: 멀티 스레드 환경에서 visited[zone] 읽기·쓰기가 원자적이지 않으면 두 요청이 같은 Zone을 동시에 방문하거나 방문 기록이 유실된다.

해결 방안: 요청별로 `new boolean[V]`를 할당하면 독립성은 보장되지만 초당 수백 건 요청 시 GC 압박이 문제가 된다. Generation 카운터 방식은 전역 배열 하나에 `int[] visitGen`을 두고 현재 요청 ID와 비교한다 — 초기화 없이 O(1)로 방문 여부를 확인. Thread-Local 배열은 스레드당 한 번 할당 후 재사용하되 요청 시작 시 Generation만 증가시킨다. Generation이 int 최대값에 도달하면 전체 배열을 0으로 초기화하고 Generation을 1로 재설정하는 안전 경로가 필요하다.

### Q4. 메모리가 제한된 환경에서 BFS가 DFS보다 불리한 경우와 DFS의 Stack Overflow 위험을 동시에 회피하는 설계는?

**30초 모범답변**: BFS는 넓은 Graph에서 Queue 크기가 O(V)까지 증가해 메모리 부담. DFS 재귀는 깊은 Graph에서 Stack Overflow. 두 위험을 동시에 피하려면 명시적 Stack을 쓰는 반복 DFS 또는 Depth 제한 DFS(IDDFS) 사용.

**1~2분 모범답변**: 구체적 선택: (1) 반복 DFS — 시스템 Call Stack 대신 자체 Stack(ArrayDeque)으로 DFS 구현, Stack Overflow 위험 제거. BFS처럼 전체 Frontier를 보관하지 않아 메모리 O(D). (2) IDDFS(Iterative Deepening DFS) — 깊이 한계를 점진적으로 늘리며 DFS 반복. BFS의 최단 경로 보장 + DFS의 O(D) 메모리. 단점은 중복 방문으로 시간 오버헤드. (3) Bidirectional BFS — 출발지·목적지 양쪽에서 동시 탐색해 Frontier 크기를 절반으로 줄임. 트레이드오프는 구현 복잡도 증가.

### Q5. 퀘스트 의존성 그래프에서 특정 퀘스트가 영구 삭제됐을 때, 해당 퀘스트에 의존하는 모든 후속 퀘스트를 BFS로 추출하고 플레이어에게 완료 불가 알림을 보내야 한다. 이 탐색이 실패하거나 불완전한 결과를 내는 조건은?

**30초 모범답변**: 의존성 그래프가 방향 그래프일 때 삭제된 퀘스트를 시작점으로 BFS를 돌리면 영향받는 하위 퀘스트를 전부 추출할 수 있다. 실패 조건은 (1) 의존성 Edge가 역방향으로 저장돼 있지 않아 후속 탐색이 불가능한 경우 (2) 그래프에 Cycle이 있어 무한 순회가 발생하는 경우 (3) 삭제 시점과 탐색 시점 사이에 새 의존성이 추가되어 결과가 불완전한 경우다.

**1~2분 모범답변**: 의존성 그래프에서 "삭제된 퀘스트 → 영향받는 퀘스트" 방향으로 BFS를 하려면 역방향 인접 리스트(in-edge 기준)가 사전 구성되어 있어야 한다. 정방향만 저장했다면 전체 그래프를 순회해 영향받는 퀘스트를 찾아야 하므로 O(V+E) 비용이 불가피하다.

실패 시나리오: (1) Cycle 존재 — 퀘스트 A가 B에 의존하고 B가 다시 A에 의존하는 잘못된 데이터가 있으면 BFS visited 처리 없이는 무한 루프 발생. (2) 동시 수정 — 탐색 중 다른 트랜잭션이 의존성 Edge를 추가하면 탐색 시작 당시의 스냅샷 기준이 아닌 혼합된 상태로 결과가 나온다. 해결: 그래프 스냅샷을 트랜잭션 단위로 잠금 후 탐색하거나 탐색 결과를 적용 전에 현재 상태와 diff로 검증한다. (3) 알림 중복 — BFS 결과가 같은 퀘스트를 여러 경로로 도달할 수 있으므로 visited 없이 탐색하면 플레이어에게 동일 알림이 중복 발송된다.

### Q6. 길드 동맹 네트워크에서 순환 동맹(A→B→C→A)을 방지하려고 DFS Cycle 탐지를 도입했다. 동맹 신청이 실시간으로 들어오는 환경에서 DFS Cycle 탐지가 잘못된 결과를 내거나 허용해서는 안 되는 순환 동맹을 통과시키는 상황은?

**30초 모범답변**: DFS Cycle 탐지는 탐색 시점의 그래프 스냅샷을 기준으로 동작한다. 실시간 환경에서는 (1) 두 동맹 신청이 동시에 처리될 때 각각 Cycle 없음으로 판정되지만 둘 다 적용하면 Cycle이 생기는 TOCTOU 문제, (2) DFS 중 다른 스레드가 Edge를 추가해 탐색 중인 그래프가 변경되는 Race Condition이 발생한다.

**1~2분 모범답변**: 순수 DFS Cycle 탐지는 단일 스레드 정적 그래프 가정에서 동작한다. 동적 환경에서의 실패 패턴:

(1) TOCTOU: 길드 X→Y 신청과 Y→X 신청이 10ms 차이로 동시에 들어온다. 두 요청이 각각 DFS를 돌릴 때는 모두 Cycle 없음. 두 Edge를 모두 적용하면 X→Y→X Cycle 완성. 해결: 동맹 추가를 직렬화하는 분산 Lock(예: Redis SETNX)이나 Optimistic Locking으로 Edge 추가 전 버전을 확인.

(2) 스냅샷 불일치: DFS 탐색 시작 후 완료 전에 다른 트랜잭션이 Edge를 추가하면 탐색이 변경 전 그래프를 기준으로 완료되어 잘못된 허용 판정. 해결: 탐색 전 그래프를 Immutable 스냅샷으로 복사하거나 Read Lock을 유지하며 탐색.

(3) 대규모 그래프에서의 성능 문제: 길드 수가 10만 개면 매 동맹 신청마다 O(V+E) DFS는 응답 시간 SLA를 초과한다. 대안: Union-Find로 연결 여부를 O(α(V))에 확인하고 Cycle 탐지도 O(α(V))로 처리. 단, Edge 삭제가 필요하면 Union-Find는 쓸 수 없어 DFS 또는 오프라인 재계산으로 돌아가야 한다.

## 16. 예상 꼬리질문

- 게임 Zone 맵을 인접 행렬로 표현한 서버에서 Zone 수가 10,000개로 늘어났을 때 BFS 탐색이 실시간 Tick 안에 처리 불가능해지는 시점과 인접 리스트로 전환하는 판단 기준은?
  > 인접 행렬 BFS는 한 Vertex의 이웃을 찾기 위해 행 전체 V칸을 순회해 O(V²) 시간이 걸린다. Zone이 10,000개면 단일 BFS에 최대 10⁸ 연산이 필요하며, 16ms Tick에 처리 불가능하다. 인접 리스트로 전환하면 O(V+E)로 줄어드는데, 평균 이웃 수(E/V)가 V보다 현저히 작은 Sparse Graph일 때 전환 효과가 크다. 메모리 접근 패턴과 프로파일링 결과를 기준으로 결정한다.
- 게임 서버에서 여러 Spawn Point를 동시에 활성화할 때 단일 BFS로 처리하지 않고 Spawn Point별로 BFS를 따로 실행하면 어떤 문제가 생기는가?
  > Spawn Point별 독립 BFS는 N개 시작점에 대해 각각 O(V+E) 비용이 발생해 전체 O(N(V+E))가 된다. Multi-Source BFS는 모든 시작점을 거리 0으로 Queue에 동시에 넣고 한 번의 O(V+E)로 각 Vertex까지 가장 가까운 Spawn Point 거리를 구한다. 따라서 Spawn Point 수가 늘수록 독립 BFS는 Tick Budget을 초과할 위험이 있다.
- Zone 내 이동 비용이 0, Portal 이동 비용이 1인 게임 맵에서 Dijkstra를 그대로 쓰면 어떤 성능 문제가 생기고, 0-1 BFS는 어떤 조건에서 그 비용을 제거하는가?
  > Dijkstra는 Priority Queue 연산으로 O((V+E) log V) 비용이 들지만, 0-1 BFS는 Deque를 사용해 비용 0 Edge는 front에, 비용 1 Edge는 back에 삽입하므로 O(V+E)로 동일한 최단 거리를 구한다. 가중치가 정확히 0과 1 두 종류만 있을 때 Deque의 단조성이 보장되어 0-1 BFS가 성립한다. 세 번째 비용이 등장하면 Dijkstra 또는 Bellman-Ford가 필요하다.
- 퀘스트 의존성 검증 서버에서 재귀 DFS로 Cycle을 탐지하다 Stack Overflow가 발생했다. 반복 DFS로 교체할 때 기존 GRAY/BLACK 상태 관리를 어떻게 유지해야 하는가?
  > 반복 DFS에서는 명시적 Stack에 (vertex, 처리 단계) 쌍을 저장한다. 처음 꺼낼 때 GRAY로 표시하고 이웃을 Stack에 넣으며, 이웃이 모두 처리된 뒤 해당 Vertex를 BLACK으로 바꾸는 시점을 Stack에서 처리 완료 신호를 분리해 구현한다. 구체적으로는 Stack에서 꺼낼 때 GRAY이면 BLACK 전환 마커를 다시 넣고, GRAY 이웃을 만나면 Back Edge(Cycle)로 판정한다.
- 길드 네트워크에서 연결 요소를 BFS로 관리하다 멤버 탈퇴로 Edge가 빈번히 삭제될 때 연결 요소를 매번 전체 재계산하는 방식의 한계와 대안은?
  > 매 삭제마다 O(V+E) 전체 재계산을 반복하면 삭제 빈도가 높을수록 누적 비용이 커진다. Edge 삽입에는 Union-Find가 O(α(V))로 효율적이지만, 삭제를 지원하지 않는 것이 한계다. 대안으로 삭제를 배치로 모아 주기적으로 전체 재계산하거나, Link-Cut Tree 같은 동적 연결성 자료구조를 사용하면 삭제를 포함한 연결성 Query를 O(log V)에 처리할 수 있다.
- 게임 월드에서 두 플레이어 간 최단 Zone 경로를 구할 때 단방향 BFS 대신 양방향 BFS를 적용하면 실제로 탐색 비용이 줄어드는 조건은? Portal 구조가 단방향(방향 Graph)일 때는 어떤 문제가 생기는가?
  > 양방향 BFS는 출발지와 목적지에서 동시에 탐색해 Frontier가 만나는 중간 지점에서 종료한다. Branching Factor가 b이고 최단 경로 길이가 d일 때 단방향은 O(b^d), 양방향은 O(b^(d/2))로 탐색 범위를 크게 줄인다. 방향 Graph에서는 역방향 Edge가 필요하므로 역방향 인접 리스트를 별도로 유지해야 한다. 역방향 Edge를 구성하지 않으면 목적지 쪽에서 탐색이 불가능해 일반 BFS로 대체해야 한다.
- 초당 수백 건의 Zone 탐색 요청을 처리하는 게임 서버에서 요청마다 O(V) 방문 배열을 초기화하면 어떤 병목이 생기는가? Generation 카운터 방식을 적용할 때 Overflow 시 안전하게 처리하는 방법은?
  > O(V) 초기화를 초당 수백 번 반복하면 Zone 수가 커질수록 CPU 시간이 선형으로 증가하며 Cache를 오염시킨다. Generation 카운터 방식은 전역 정수 배열 visitGen에 현재 요청 ID를 저장해, visitGen[v] == currentId일 때 방문으로 판정해 초기화 비용을 없앤다. int Overflow 시 카운터가 0으로 순환해 이전 요청과 충돌할 수 있으므로, Overflow 직전 전체 배열을 0으로 초기화하고 currentId를 1로 재설정하는 안전 경로를 마련한다.

## 17. 30초 모범답변

> BFS는 FIFO Queue로 시작점과 가까운 Level부터 탐색해 모든 Edge 비용이 같을 때 최소 Hop을 보장합니다. DFS는 Stack이나 재귀로 한 Branch를 깊게 탐색해 Cycle·연결 요소·의존성 처리에 적합합니다. 인접 리스트에서는 둘 다 O(V+E), 방문과 Queue·Stack 공간은 O(V)이며, 일반 Graph에서는 Cycle 때문에 방문 상태가 필요합니다.

## 18. 1~2분 확장답변

> BFS는 시작점을 Queue에 넣고 꺼낸 Vertex의 미방문 이웃을 뒤에 넣습니다. 거리 d인 Vertex가 d+1보다 먼저 처리되므로 비가중 Graph에서 첫 방문 거리가 최소입니다. 경로가 필요하면 발견 시 Parent를 기록합니다. DFS는 재귀나 명시적 Stack으로 한 경로를 끝까지 내려간 뒤 Backtrack하며 방향 Cycle 탐지나 위상 정렬에 자연스럽습니다.
>
> 인접 리스트에서는 두 Algorithm 모두 각 Vertex와 Edge를 방문해 O(V+E)이고, 방문 배열과 Queue·Stack은 최악 O(V)입니다. BFS는 넓은 Graph에서 Queue가, DFS는 깊은 Graph에서 Stack이 커질 수 있습니다. 게임 서버의 Zone 최소 이동 횟수는 BFS로 구할 수 있지만 Portal 비용이 다르면 Dijkstra가 필요합니다. 실시간 경로 탐색에는 방문 Node Budget, 취소와 Fallback, Map Snapshot과 p99 지연까지 설계합니다.

## 19. 핵심 요약

- BFS는 Queue로 Level 순서, DFS는 Stack·재귀로 깊이 우선 탐색한다.
- 일반 Graph에서는 Cycle과 다중 경로 때문에 방문 상태가 필요하다.
- BFS는 동일 가중치 Graph에서 첫 방문 거리로 최소 Hop을 보장한다.
- 실제 경로는 발견 시 Parent를 저장해 역추적한다.
- 인접 리스트의 BFS·DFS 시간은 O(V+E), 보조 공간은 최악 O(V)이다.
- BFS는 넓은 Frontier, DFS는 깊은 Stack에서 Memory 위험이 커진다.
- Multi-Source BFS는 모든 시작점을 거리 0으로 동시에 넣는다.
- 가중치, Graph 표현, 변경 Version과 실시간 Budget을 확인해야 한다.

## 한 줄 정리

> BFS는 가까운 Level과 비가중 최단 거리에, DFS는 깊은 구조 탐색과 Cycle·의존성 처리에 적합하다.
