---
difficulty: 3
reading_time: 25분
interview_frequency: 5
importance: 5
---

# 02. BFS와 DFS

> 게임 서버·백엔드 개발자를 위한 CS 면접 교재

## 학습 목표

- BFS와 DFS의 탐색 순서와 자료구조를 설명할 수 있다.
- Graph·Grid에서 방문 처리와 시간·공간 복잡도를 분석할 수 있다.
- BFS가 비가중 최단 경로를 보장하는 이유와 적용 조건을 설명할 수 있다.
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

방향 비순환 Graph인 DAG의 위상 정렬은 DFS 종료 순서를 뒤집거나 진입 차수와 Queue를 사용하는 Kahn Algorithm으로 구할 수 있다.

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

- **BFS는 모든 가중 Graph의 최단 경로를 구한다**: 동일 Edge 비용에서 최소 Hop만 보장한다.
- **DFS가 먼저 찾은 경로가 최단이다**: 탐색 순서에 따른 한 경로일 뿐이다.
- **방문 표시는 Queue에서 꺼낼 때 해도 같다**: 중복 Enqueue로 Memory와 작업이 커질 수 있다.
- **BFS와 DFS는 항상 O(V+E)다**: 인접 리스트 기준이며 행렬에서는 O(V²)가 될 수 있다.
- **재귀 DFS는 Memory O(1)이다**: 호출 Stack이 깊이에 비례한다.
- **Tree 탐색에는 방문 배열이 항상 필요하다**: 부모로 되돌아가지 않는 Tree 순회는 생략 가능하지만 일반 Graph에는 필요하다.
- **BFS Queue는 최대 한 Level 크기뿐이다**: 처리 중 다음 Level도 함께 들어 있어 Frontier 규모를 넉넉히 봐야 한다.

## 15. 면접 질문

### Q1. BFS와 DFS를 비교해 주세요.

BFS는 Queue로 가까운 Level부터 탐색하고 비가중 최소 Hop을 보장합니다. DFS는 Stack이나 재귀로 한 경로를 깊게 탐색해 Cycle, 연결 요소, 위상 정렬 등에 자연스럽습니다. 인접 리스트에서는 둘 다 O(V+E)입니다.

### Q2. BFS가 비가중 최단 경로를 보장하는 이유는 무엇인가요?

FIFO Queue로 거리 d인 Vertex를 모두 처리한 뒤 d+1을 처리합니다. Vertex가 처음 발견된 경로보다 짧은 경로가 있다면 더 이전 Level에서 발견됐어야 하므로 첫 방문 거리가 최소입니다.

### Q3. 방문 표시는 언제 해야 하나요?

일반 BFS에서는 Queue에 넣을 때 표시합니다. 꺼낼 때 표시하면 여러 부모가 같은 Vertex를 중복으로 Enqueue할 수 있습니다. DFS도 탐색 진입 시 표시해 Cycle 반복을 막습니다.

### Q4. BFS와 DFS의 공간 복잡도를 비교해 주세요.

둘 다 최악 O(V)입니다. BFS는 넓은 Frontier에서 Queue가 커지고 DFS는 깊은 Chain에서 Stack이나 재귀 깊이가 커집니다. 입력 형태에 따라 실제 Peak가 다릅니다.

### Q5. 실제 최단 경로는 어떻게 복원하나요?

Vertex를 처음 발견할 때 `parent[next] = current`를 저장합니다. 목적지부터 Parent를 따라 시작점까지 역추적하고 결과를 뒤집습니다.

### Q6. 방향 Graph의 Cycle을 DFS로 어떻게 찾나요?

미방문, 현재 경로, 완료 상태를 구분합니다. DFS 중 현재 경로에 있는 GRAY Vertex로 향하는 Edge를 만나면 Back Edge이므로 Cycle입니다.

## 16. 예상 꼬리질문

- 인접 행렬에서 BFS 복잡도는 왜 O(V²)인가요?
- Multi-Source BFS는 어떻게 초기화하나요?
- 0-1 BFS는 일반 BFS와 무엇이 다른가요?
- 재귀 DFS를 반복으로 바꿀 때 방문 순서가 달라지는 이유는 무엇인가요?
- 연결 요소 개수는 어떻게 구하나요?
- 양방향 BFS가 유리한 조건은 무엇인가요?
- 방문 배열 초기화 비용을 줄이는 방법은 무엇인가요?

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
