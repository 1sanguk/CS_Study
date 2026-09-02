---
difficulty: 3
reading_time: 25분
interview_frequency: 4
importance: 4
---

# 09. Graph


## 학습 목표

- 방향·가중치 유무에 따라 Graph 종류를 분류하고, 밀도(Dense/Sparse)와 Edge 변경 빈도를 기준으로 인접 행렬·인접 리스트 중 적합한 표현을 선택할 수 있다.
- Cycle 존재 여부와 Graph 밀도에 따라 BFS(Breadth-First Search)·DFS(Depth-First Search) 중 적합한 탐색 방식을 선택하고, 방문 표시 시점(Queue 삽입 vs 꺼낼 때)이 결과에 미치는 차이를 판단할 수 있다.
- Cycle 존재 가능성을 기준으로 방문 집합 없이 순회 가능한 경우와 반드시 필요한 경우를 구분하고, 방문 표시 없이 탐색할 경우 발생하는 문제를 판단할 수 있다.
- 게임 월드, 친구 관계, 의존성 같은 실무 관계를 Graph로 모델링할 때 방향성·가중치·중복 Edge 허용 여부를 결정 기준에 따라 선택할 수 있다.

## 1. 개요

Graph는 객체를 나타내는 Vertex와 객체 사이 관계를 나타내는 Edge로 구성된 자료구조다. Tree도 Graph의 한 종류지만, 일반 Graph는 Root나 부모·자식 계층이 없어도 되고 여러 경로와 Cycle을 가질 수 있다.

```text
Vertex: A, B, C, D
Edge:   A-B, A-C, B-D, C-D

       A
      / \
     B   C
      \ /
       D
```

Graph는 “무엇과 무엇이 연결되어 있는가”를 직접 표현한다. 게임 Zone 이동, 친구 관계, Party 초대, 서버 간 연결, Build 의존성, 도로 비용처럼 다대다 관계에 적합하다.

## 2. Graph의 분류

### 방향 Graph와 무방향 Graph

방향 Graph(Directed Graph)의 Edge `A → B`는 A에서 B로만 이동할 수 있다는 뜻이다. 팔로우 관계, Quest 선행 조건, 단방향 Portal이 예다. 무방향 Graph(Undirected Graph)의 `A—B`는 양방향 관계다. 상호 친구나 양방향 통로가 예다.

무방향 Edge 하나를 인접 리스트로 저장할 때는 보통 `A`의 목록에 `B`, `B`의 목록에 `A`를 모두 넣는다. 따라서 저장된 항목 수는 Edge 수 `E`의 약 두 배다.

### 가중 Graph와 비가중 Graph

가중 Graph는 Edge에 거리, 시간, 비용, 지연 같은 값을 둔다. 같은 연결이라도 목적에 따라 가중치가 달라질 수 있다.

```text
A --5ms--> B
A --2ms--> C --2ms--> B

Edge 수가 적은 경로: A→B
지연이 작은 경로:    A→C→B
```

최소 Hop 수는 BFS로 구할 수 있지만 가중치 합이 최소인 경로는 가중치 조건에 맞는 Dijkstra, Bellman-Ford 같은 알고리즘이 필요하다. 자료구조와 알고리즘의 전제를 함께 확인해야 한다.

### Simple Graph, Multi-Graph, Self Loop

같은 두 Vertex 사이에 Edge를 하나만 허용할지, 여러 Edge를 허용할지 정책을 정해야 한다. 항공편처럼 출발지와 도착지가 같아도 시간별 연결이 여러 개일 수 있다. 자기 자신으로 향하는 Self Loop도 Domain에 따라 허용 여부가 다르다.

Graph라는 이름만으로 중복 Edge 처리, 방향성, 가중치 의미가 정해지지 않는다. 모델의 불변식을 먼저 문서화해야 한다.

## 3. 인접 행렬

Vertex가 `V`개일 때 `V × V` 배열의 `[u][v]`에 Edge 존재 여부나 가중치를 저장한다.

```text
Graph: A—B, A—C, B—C

      A B C
   A  0 1 1
   B  1 0 1
   C  1 1 0
```

무방향 Graph의 행렬은 대칭이다. 방향 Graph에서는 `[u][v]`와 `[v][u]`가 다를 수 있다.

### 특성

- 공간: `O(V²)`
- Edge `(u, v)` 존재 확인: `O(1)`
- Edge 추가·삭제: `O(1)`
- Vertex `u`의 모든 이웃 열거: 한 행을 훑어 `O(V)`
- Vertex 추가: 배열 크기 변경 때문에 비쌀 수 있음

Edge가 가능한 쌍 대부분에 존재하는 Dense Graph나 Vertex 수가 작고 고정된 경우에 적합하다. Bitset으로 존재 여부만 저장하면 메모리를 줄이고 집합 연산을 Word 단위로 수행할 수도 있다.

## 4. 인접 리스트

각 Vertex마다 연결된 이웃 목록을 저장한다.

```text
A: B → C
B: A → D
C: A → D
D: B → C
```

### 특성

- 공간: `O(V + E)`
- 모든 이웃 열거: `O(degree(u))`
- Edge 존재 확인: 단순 목록이면 `O(degree(u))`
- Edge 추가: 목록 끝 삽입 기준 보통 `O(1)`
- Edge 삭제: 대상을 찾는 비용이 필요

현실의 친구 관계나 Zone 연결처럼 가능한 모든 쌍 중 일부만 연결된 Sparse Graph에 유리하다. 이웃 목록을 Hash Set으로 두면 존재 확인과 삭제의 평균 비용을 낮출 수 있지만 메모리와 Hash 비용이 늘어난다. 정렬 Vector를 사용하면 Cache 지역성과 결정적인 순회 순서를 얻지만 중간 삽입·삭제가 비싸다.

## 5. 표현 방식 비교

| 요구 | 인접 행렬 | 인접 리스트 |
|---|---|---|
| 공간 | O(V²) | O(V+E) |
| 특정 Edge 확인 | O(1) | O(degree), Container에 따라 다름 |
| 이웃 순회 | O(V) | O(degree) |
| Sparse Graph | 메모리 낭비 | 유리 |
| Dense Graph | 단순하고 유리 | Entry·Pointer 비용 증가 |
| Vertex 추가 | 크기 변경 부담 | 비교적 쉬움 |
| Cache·Bit 연산 | 연속 저장에 유리 | 구현에 따라 분산 |

Graph 밀도는 `E`가 `V²`에 얼마나 가까운지로 생각할 수 있다. 단순히 “행렬은 빠르고 리스트는 느리다”가 아니다. 자주 수행하는 연산, Vertex 수 변화, 메모리와 순회 패턴을 함께 본다.

Edge List는 `(u, v, weight)` 목록만 저장하는 또 다른 표현이다. 모든 Edge를 정렬하는 Kruskal 알고리즘이나 Batch 입력에는 단순하지만 특정 Vertex의 이웃 찾기는 비효율적이다. 하나의 Graph도 알고리즘별로 다른 View를 만들 수 있다.

## 6. BFS와 DFS의 기본 원리

Graph 순회에서는 이미 방문한 Vertex를 기록해야 한다. 일반 Graph는 Cycle이 있어 방문 표시가 없으면 같은 Vertex를 무한히 반복할 수 있다.

```text
A → B → C
↑       ↓
└───────┘
```

### BFS

BFS는 Queue를 사용해 시작점에서 가까운 Level부터 방문한다. 비가중 Graph 또는 모든 Edge 비용이 같은 Graph에서 최소 Edge 수 경로를 찾을 수 있다.

```text
enqueue(start), visited(start)
while queue not empty:
    u = dequeue()
    for v in neighbors(u):
        if not visited(v):
            visited(v)
            parent[v] = u
            enqueue(v)
```

방문 표시는 Queue에 넣을 때 해야 한다. 꺼낼 때 표시하면 여러 이웃이 같은 Vertex를 중복으로 넣어 Queue와 작업량이 커질 수 있다.

### DFS

DFS는 한 경로를 끝까지 탐색한 뒤 되돌아온다. 재귀 호출 Stack이나 명시적인 Stack으로 구현한다. 도달 가능성, 연결 요소, Cycle 탐지, 위상 정렬 등 여러 알고리즘의 기반이다.

재귀 DFS는 간단하지만 매우 긴 Chain에서는 호출 Stack Overflow가 날 수 있다. 외부 입력 크기가 크거나 깊이를 통제할 수 없다면 명시적 Stack을 고려한다.

인접 리스트 Graph에서 BFS와 DFS는 각 Vertex와 Edge를 제한된 횟수 방문하므로 `O(V + E)`다. 공간은 방문 배열, Queue·Stack 등에 `O(V)`가 든다. 인접 행렬에서는 각 Vertex의 이웃을 찾기 위해 행 전체를 보므로 `O(V²)`가 될 수 있다.

## 7. 쉬운 예시: Zone 이동 경로 탐색 (Java)

게임 서버에서 Zone(구역) 이동 가능 경로를 인접 리스트로 표현하고, BFS로 최소 이동 횟수를 구하는 예시다.

```java
// 게임 서버: Zone 이동 가능 경로 탐색 (인접 리스트 + BFS)
class ZoneGraph {
    private final Map<Integer, List<Integer>> adj = new HashMap<>();

    void addEdge(int from, int to) {
        adj.computeIfAbsent(from, k -> new ArrayList<>()).add(to);
        adj.computeIfAbsent(to, k -> new ArrayList<>()).add(from); // 무방향
    }

    // BFS: startZone에서 targetZone까지 최소 이동 횟수
    int shortestPath(int start, int target) {
        if (start == target) return 0;
        Set<Integer> visited = new HashSet<>();
        Queue<Integer> queue = new ArrayDeque<>();
        queue.offer(start);
        visited.add(start); // 방문 표시는 Queue에 넣을 때 — 꺼낼 때 하면 동일 노드 중복 삽입
        int depth = 0;
        while (!queue.isEmpty()) {
            int size = queue.size();
            depth++;
            for (int i = 0; i < size; i++) {
                int zone = queue.poll();
                for (int neighbor : adj.getOrDefault(zone, Collections.emptyList())) {
                    if (neighbor == target) return depth;
                    if (visited.add(neighbor)) queue.offer(neighbor);
                }
            }
        }
        return -1; // 도달 불가
    }
}
```

방문 표시를 Queue에서 꺼낼 때 하면 같은 노드가 여러 번 삽입되어 비가중 최단 경로가 보장되지 않고 탐색 비용이 급증할 수 있다.

## 8. 경로 복원과 연결 요소

도달 여부만 필요하면 `visited`로 충분하다. 실제 경로를 반환하려면 처음 방문할 때 `parent[child] = current`를 기록하고 목적지에서 시작점까지 역추적한 뒤 뒤집는다.

```text
parent[D] = B
parent[B] = A

D → B → A 역추적
A → B → D 순서로 뒤집기
```

무방향 Graph에서 아직 방문하지 않은 Vertex마다 BFS나 DFS를 시작하면 연결 요소(Connected Component)의 개수를 구할 수 있다. Edge가 추가되기만 하고 연결 여부를 반복 확인한다면 Union-Find가 더 효율적일 수 있다. 반면 실제 경로나 이웃 목록이 필요하면 Graph 표현이 필요하다.

## 9. Cycle과 DAG

무방향 Graph의 DFS에서는 방문한 이웃이 부모가 아니라면 Cycle이 있다. 방금 지나온 양방향 Edge를 Cycle로 오해하지 않도록 부모를 구분한다.

방향 Graph에서는 현재 DFS 경로에 들어 있는 Vertex를 별도로 표시한다. 방문 완료 Vertex가 아니라 “아직 재귀 Stack 안에 있는 Vertex”로 향하는 Back Edge가 Cycle을 뜻한다.

Cycle이 없는 방향 Graph를 DAG(Directed Acyclic Graph)라고 한다. Build 순서, Quest 선행 조건, Batch Job 의존성은 DAG로 모델링할 수 있다. 위상 정렬은 모든 선행 Edge가 먼저 처리되는 순서를 구한다. Cycle이 있으면 전체 위상 순서가 존재하지 않는다.

## 10. 장점과 단점

### 장점

- 계층에 제한되지 않는 다대다 관계를 직접 표현한다.
- 방향, 가중치, 속성을 Edge에 담아 다양한 Domain을 모델링한다.
- 도달 가능성, 최단 경로, 연결 요소, 의존성 순서 같은 문제의 기반이 된다.
- 밀도와 연산에 맞춰 행렬·리스트·Edge List를 선택할 수 있다.

### 단점

- Cycle과 중복 방문 때문에 순회 상태 관리가 필요하다.
- 표현 방식에 따라 메모리와 Edge 조회 비용이 크게 달라진다.
- 동적 삭제, 동시 변경, 분산된 Graph는 정합성 관리가 복잡하다.
- 대규모 고차수 Vertex는 메모리와 단일 요청 지연을 집중시킬 수 있다.

## 11. 게임 서버·백엔드 실무 예시

### 월드 Zone 연결

Zone을 Vertex, Portal을 방향 Edge로 표현할 수 있다. 잠긴 Portal, Level 제한, 이동 비용은 Edge 속성이나 탐색 조건이 된다. 단순 도달 여부는 BFS·DFS로, 최소 이동 횟수는 BFS로, 이동 시간이 다른 최소 비용 경로는 Dijkstra 같은 알고리즘으로 구한다.

```text
Town ──1── Field ──4── Dungeon
  └────5─────── Harbor

Vertex: Zone
Edge: 이동 가능 관계
Weight: 예상 이동 시간
```

실시간으로 문이 열리고 닫히면 Graph Version 또는 Snapshot을 관리해야 한다. Pathfinding 중 구조가 바뀌면 결과가 어느 Version을 기준으로 했는지 정의해야 한다.

### 친구·Party 관계

친구는 무방향 Edge, 팔로우는 방향 Edge에 가깝다. “친구의 친구 추천”은 2-Hop 이웃 탐색으로 표현할 수 있지만 인기 사용자처럼 Degree가 매우 큰 Vertex는 후보 폭증을 만든다. 결과 상한, 차단 관계 Filter, Privacy 정책이 필요하다.

분산 환경에서는 전체 Social Graph가 한 Process에 있지 않을 수 있다. Graph 자료구조만 선택해 문제가 끝나는 것이 아니라 Partition Key, Remote 조회 수, Cache와 정합성까지 설계한다.

### 의존성 Graph

서버 시작 Component나 콘텐츠 Build Task의 의존성을 방향 Edge로 표현한다. 위상 정렬에 실패하면 Cycle 경로를 함께 출력해 운영자가 잘못된 설정을 찾도록 한다. 단순히 “처리 불가”만 반환하면 진단이 어렵다.

공유 Graph를 여러 Thread가 수정하면 이웃 Container 순회 중 무효화가 생길 수 있다. Read-heavy라면 Immutable Snapshot을 교체하고, 갱신이 잦으면 Lock 범위나 단일 소유 Thread를 설계한다. 지표로 Vertex·Edge 수, Degree 분포, 탐색 방문 수, Queue 최대 크기, p99 지연을 본다.

## 12. 자주 하는 오해

- **Graph는 항상 인접 행렬로 구현한다**: Sparse Graph에서는 인접 리스트가 일반적으로 메모리와 이웃 순회에 유리하다.
- **BFS는 모든 최단 경로를 구한다**: 비가중 또는 동일 가중치 Graph에서 최소 Edge 수를 보장한다.
- **DFS에서는 방문 배열이 없어도 된다**: 일반 Graph에는 Cycle이 있어 무한 반복할 수 있다.
- **Tree와 Graph는 완전히 별개다**: Tree는 연결되고 Cycle이 없는 Graph의 특수한 형태다.
- **Edge가 적으면 탐색은 항상 빠르다**: 시작점에서 도달 가능한 범위와 고차수 Vertex에 따라 많은 Vertex를 방문할 수 있다.
- **Union-Find가 Graph를 대체한다**: 연결 여부와 병합에는 강하지만 실제 경로, 이웃, Edge 삭제는 제공하지 않는다.
- **자료구조만 Thread-safe면 일관된 경로가 나온다**: 탐색 도중 변경을 허용할지, Snapshot 일관성을 요구할지도 정해야 한다.

## 13. 면접 질문

### Q1. 게임 서버 Zone 연결을 Graph로 모델링할 때와 Tree로 충분한 상황을 어떻게 구분하는가? Cycle 존재 여부가 선택에 어떤 영향을 미치는가?

Zone 사이에 순환 이동이 가능하거나(Town → Field → Dungeon → Town), 하나의 Zone에 여러 경로로 진입할 수 있으면 Tree로는 표현할 수 없고 Graph가 필요합니다. Tree는 부모가 하나이고 Cycle이 없기 때문입니다. 반면 "마을에서 방사형으로 뻗는 던전 구조"처럼 Zone 간 이동이 항상 단방향 계층을 이루고 순환이 없다면 Tree로 충분합니다. Cycle이 존재하는 순간 Tree 불변식(V개 Vertex에 V-1개 Edge, 단일 경로)이 깨지므로, 모델링 전에 Cycle 허용 여부를 먼저 결정하고 자료구조를 선택해야 합니다.

### Q2. 실시간으로 Zone 연결이 추가·삭제되는 게임 월드 Graph에서 인접 리스트를 사용할 때 Edge 삭제 비용 문제와, 이를 완화하는 방법은 무엇인가?

인접 리스트의 이웃 목록이 단순 ArrayList라면 Edge 삭제는 대상 Vertex를 선형 탐색 후 제거하는 `O(degree)` 비용이 발생합니다. 고차수 Zone(허브 역할 마을)에서는 이 비용이 눈에 띄게 커질 수 있습니다. 완화 방법으로는 이웃 목록을 HashSet으로 바꿔 삭제를 평균 `O(1)`로 낮추거나, 삭제를 "논리 삭제(Tombstone)"로 표시하고 순회 시 필터링해 실제 재구성 비용을 지연시키는 방식이 있습니다. 단, HashSet은 메모리 오버헤드와 Cache 비효율이 따르므로 삭제 빈도와 순회 빈도를 함께 고려해 자료구조를 선택해야 합니다.

### Q3. BFS에서 방문 표시를 Queue에 넣을 때 해야 하는 이유를 설명하고, 꺼낼 때 처리할 경우 어떤 버그가 발생하는가? 실제 게임 서버 Zone 탐색에서 이 버그가 드러나는 시나리오는?

BFS에서 방문 표시를 Queue에 넣을 때 하지 않으면, 같은 Vertex가 여러 이웃으로부터 중복 삽입됩니다. 예를 들어 Zone A와 Zone B가 모두 Zone C와 연결된 상황에서, A와 B가 같은 Level에 있을 때 둘 다 C를 Queue에 넣습니다. C를 꺼낼 때야 방문 표시를 하면 이미 Queue 안에 C가 두 번 들어있어 C의 이웃을 두 번 처리하게 됩니다. 게임 서버 Zone 탐색에서는 "startZone → targetZone까지 최소 이동 횟수"를 구할 때 depth 카운터가 실제보다 작게 잘못 계산되거나, 탐색 도중 같은 Zone 처리가 반복되어 응답 지연이 급격히 늘어나는 형태로 버그가 드러납니다.

### Q4. 수만 개 Zone을 가진 대규모 게임 월드에서 BFS 탐색 시 p99 응답 지연이 갑자기 튀는 상황이 발생했다. 원인을 어떻게 진단하고, 어떤 방식으로 개선하는가?

p99가 튀는 주요 원인으로 세 가지를 먼저 확인합니다. 첫째, 고차수 Hub Zone(허브 역할의 마을·필드)에서 이웃을 전부 Queue에 넣는 순간 Heap 할당이 급증하고 GC 압박으로 Stop-the-World가 발생할 수 있습니다. 지표로 Queue 최대 크기와 방문 Vertex 수를 Metric으로 남겨 탐색이 예상보다 넓게 퍼지는 Zone을 특정합니다. 둘째, 인접 리스트가 Sparse하게 분산된 경우 Cache Miss가 쌓여 탐색 후반 지연이 커질 수 있습니다. 셋째, 탐색 Budget(최대 방문 수 또는 최대 Depth)이 없어 도달 불가 Graph에서 전체 탐색을 수행하는 경우입니다. 개선 방향으로는 탐색 Budget 상한 설정, Bidirectional BFS로 탐색 공간을 절반으로 줄이기, 자주 사용되는 경로는 Cache에 결과를 저장하고 Zone 구조 변경 시 무효화하는 방법을 적용합니다.

### Q5. 운영 중인 게임 서버에서 퀘스트 선행 조건 DAG에 기획자가 잘못된 설정을 추가해 Cycle이 생겼다. 서버를 재시작하지 않고 Cycle 여부를 실시간으로 감지하고 운영자에게 알리는 방법은?

두 가지 접근이 있습니다. 첫째, 설정 변경 API에서 Edge를 추가하기 전에 임시로 Graph에 Edge를 넣고 위상 정렬을 다시 돌려 Cycle 여부를 검증하는 방식입니다. Cycle이 감지되면 변경을 거부하고 Cycle 경로를 포함한 오류 메시지를 반환합니다. 단순히 "적용 불가"만 반환하면 운영자가 어디가 문제인지 찾기 어려우므로, DFS Back Edge 추적으로 Cycle에 포함된 Quest ID 목록을 함께 출력해야 합니다. 둘째, 위상 정렬의 진입 차수 기반 Kahn's Algorithm을 사용하면 처리되지 못한 Vertex 집합이 Cycle 후보가 되므로 진단이 상대적으로 쉽습니다. Edge 추가마다 전체 위상 정렬을 반복하면 `O(V+E)` 비용이 발생하므로, 설정 변경이 잦으면 변경된 Vertex 주변만 검사하는 Incremental Cycle Detection을 검토합니다.

### Q6. 여러 스레드가 Zone Graph를 읽고 한 스레드가 실시간으로 Portal을 추가·삭제하는 구조에서, 탐색 도중 Graph 구조가 바뀌면 어떤 문제가 생기고 Snapshot 일관성을 어떻게 보장하는가?

탐색 도중 Edge가 삭제되면 이미 Queue에 들어간 Vertex의 이웃 목록이 변경되어 NPE·ConcurrentModificationException이 발생하거나, 삭제된 Zone을 목적지로 반환하는 논리 오류가 생깁니다. 보장 방법으로는 두 가지를 검토합니다. 첫째, Immutable Snapshot 교체 방식입니다. 쓰기 스레드는 새로운 Graph 복사본에 변경을 가한 뒤 `AtomicReference`로 교체하고, 읽기 스레드는 탐색 시작 시점의 Reference를 캡처해 끝까지 사용합니다. Read-heavy 환경에서 Lock 없이 일관성을 보장하지만 변경마다 복사 비용이 발생합니다. 둘째, 쓰기 시 Fine-grained Lock 방식입니다. Vertex 단위 또는 Segment 단위로 ReadWriteLock을 두어 읽기 스레드 다수와 쓰기 스레드 하나가 공존하되, 탐색 경로에 Lock 순서를 고정해 Deadlock을 방지합니다. 운영 중에는 탐색 중 Snapshot Version이 교체된 횟수, Lock 대기 시간을 Metric으로 수집해 어느 쪽 방식이 실제 지연을 줄이는지 비교합니다.

## 14. 예상 꼬리질문

- Zone Graph에서 허브 역할의 Vertex(인기 마을 등) Degree가 수천에 달할 때, 이 Vertex를 탐색 기점으로 사용하면 어떤 문제가 생기나요?
  > 이 Vertex를 Queue에 넣는 순간 이웃 수천 개가 한꺼번에 Queue에 추가되어 메모리 할당이 급증하고 GC 부담이 커진다. 탐색 Budget(최대 방문 수 또는 최대 Depth)을 설정하지 않으면 고차수 Vertex 하나가 응답 지연 전체를 차지할 수 있다.
- 인접 리스트 이웃 목록을 ArrayList에서 HashSet으로 바꾸면 삭제 비용은 낮아지지만 어떤 부작용이 생기나요?
  > HashSet은 순회 순서가 비결정적이어서 경로 탐색 결과가 실행마다 달라질 수 있다. 또한 원소당 해시 계산과 Entry 객체 할당 비용이 추가되어 이웃 수가 적은 Sparse 노드에서는 오히려 느릴 수 있다. 재현 가능한 탐색 결과가 필요하면 정렬 자료구조를 고려해야 한다.
- BFS로 경로를 복원할 때 parent 배열에 기록하는 시점이 늦으면 어떤 버그가 생기나요?
  > 방문 표시와 마찬가지로 Queue에서 꺼낼 때 parent를 기록하면 같은 Vertex가 여러 이웃에 의해 Queue에 중복 삽입될 때 나중에 기록된 parent가 이전 것을 덮어쓴다. 결과적으로 복원된 경로가 최단 경로가 아닌 다른 경로를 참조하는 버그가 생긴다. parent 기록은 Queue에 넣는 시점에 해야 한다.
- 게임 서버 Zone Graph 깊이가 수천 레벨에 달할 때 재귀 DFS 대신 명시적 Stack을 선택하는 기준은 무엇인가요?
  > 스레드 스택 크기와 재귀 호출 프레임 크기로 추정한 한계의 50% 이상을 재귀 깊이가 넘을 가능성이 있을 때 전환한다. 외부 입력으로 Graph 깊이를 통제할 수 없는 경우라면 재귀를 처음부터 쓰지 않는 것이 원칙이다.
- 퀘스트 의존성 DAG에서 위상 정렬에 실패했을 때 단순히 실패만 반환하면 왜 운영에 문제가 생기나요?
  > 운영자가 어떤 Quest가 Cycle을 이루는지 알 수 없어 설정 수정이 어렵다. DFS Back Edge 추적으로 Cycle에 포함된 Quest ID 목록을 오류 메시지와 함께 출력해야 즉각 진단이 가능하다. "처리 불가"만 반환하면 원인 파악에 추가 디버깅 시간이 필요하다.
- 음수 이동 비용이 있는 Zone Graph에서 Dijkstra를 그대로 쓰면 어떤 문제가 발생하고, 어떤 알고리즘으로 전환해야 하나요?
  > Dijkstra는 이미 확정된 노드를 다시 방문하지 않는다는 가정이 음수 가중치에서 깨진다. 음수 Edge를 통해 확정된 노드로 더 짧은 경로가 나타나도 무시하므로 잘못된 최단 거리를 반환한다. 음수 Edge가 있으면 Bellman-Ford로 전환해야 하며, 음수 Cycle이 있으면 최단 경로 자체가 정의되지 않는다.
- Graph가 탐색 중 변경된다면 Immutable Snapshot 교체와 Fine-grained Lock 중 어떤 조건에서 어느 쪽을 선택하나요?
  > Read-heavy이고 쓰기가 드물면 Snapshot 교체가 Lock 없는 읽기를 제공해 읽기 p99에 유리하지만 변경마다 복사 비용이 발생한다. 쓰기가 빈번하고 변경 단위가 Vertex/Edge 수준으로 세밀하면 Fine-grained Lock이 복사 비용 없이 변경을 처리할 수 있다. Lock 순서를 고정하지 않으면 Deadlock이 발생하므로 Vertex ID 기준 오름차순 Lock 획득 같은 규칙이 필요하다.

## 15. 30초 모범답변

> Graph는 Vertex와 Edge로 다대다 관계를 표현합니다. Zone처럼 Edge가 드문 Sparse Graph에는 인접 리스트(`O(V+E)`)를, Vertex가 적고 Edge 확인이 잦은 Dense Graph에는 인접 행렬(`O(1)` 확인)을 선택합니다. 탐색에서 BFS는 비가중 최소 Hop에, DFS는 Cycle 감지·위상 정렬에 씁니다. 둘 다 Cycle 때문에 방문 집합이 필수입니다. 여러 스레드가 Graph를 동시에 읽고 쓸 때는 탐색 시작 시점의 Snapshot을 고정하거나 Lock 범위를 명확히 정해야 경로 결과가 일관됩니다.

## 16. 1~2분 확장답변

> Graph는 객체를 Vertex, 관계를 Edge로 표현합니다. 방향 Graph는 단방향 관계, 가중 Graph는 거리나 비용을 나타냅니다. 표현 방식으로 인접 행렬은 특정 Edge를 `O(1)`에 확인하지만 `O(V²)` 공간을 사용하고, 인접 리스트는 `O(V+E)` 공간과 Degree에 비례한 이웃 순회가 가능해 Zone처럼 Sparse한 구조에 적합합니다.
>
> 순회에는 Queue 기반 BFS와 Stack 또는 재귀 기반 DFS가 있습니다. 인접 리스트에서 둘 다 `O(V+E)`이며 Cycle 때문에 방문 표시가 필수입니다. BFS는 비가중 최소 Hop에, DFS는 Cycle 감지·위상 정렬의 기반으로 씁니다. Zone 이동 비용이 다르면 BFS 대신 Dijkstra를 써야 하며, 음수 비용이 있으면 Dijkstra가 틀린 결과를 낼 수 있어 Bellman-Ford로 전환해야 합니다.
>
> 실무에서 p99 지연이 튀면 먼저 탐색 도중 Queue 최대 크기와 방문 Vertex 수를 지표로 확인합니다. 고차수 Hub Zone에서 이웃이 한꺼번에 Queue에 쏟아지면 GC 부담이 커지므로 탐색 Budget 상한을 두거나 자주 사용되는 경로를 Cache합니다. 퀘스트 선행 조건 DAG에 Cycle이 생기면 설정 변경 API에서 Edge 추가 전 위상 정렬로 검증하고, Cycle을 이루는 Quest ID 목록을 오류와 함께 반환해 운영자가 즉시 진단할 수 있도록 합니다. 여러 스레드가 Graph를 동시에 사용할 때는 탐색 시작 시 `AtomicReference`로 Snapshot을 캡처하거나, Vertex 단위 ReadWriteLock을 두어 Lock 순서를 고정하고 Deadlock을 방지합니다.

## 17. 핵심 요약

- Graph는 Vertex와 Edge로 계층에 제한되지 않는 관계를 표현한다.
- 방향성, 가중치, 중복 Edge와 Self Loop 정책을 명시해야 한다.
- 인접 행렬은 `O(V²)` 공간과 `O(1)` Edge 확인, 인접 리스트는 `O(V+E)` 공간과 효율적인 이웃 순회를 제공한다.
- 인접 리스트의 BFS·DFS는 `O(V+E)`이며 Cycle 때문에 방문 상태가 필요하다.
- BFS는 비가중 최소 Hop, DFS는 깊은 탐색과 Cycle·의존성 처리에 적합하다.
- 실제 경로는 방문 시 Parent를 기록해 역추적한다.
- Union-Find는 동적 병합의 연결 여부에는 강하지만 경로와 Edge 삭제를 제공하지 않는다.
- 실무에서는 밀도, Degree 분포, 변경 Version, 탐색 Budget과 동시성을 함께 본다.

## 한 줄 정리

> Graph는 다대다 관계를 Vertex와 Edge로 표현하며, 밀도와 핵심 연산에 따라 인접 행렬 또는 인접 리스트를 선택한다.
