---
difficulty: 3
reading_time: 25분
interview_frequency: 4
importance: 4
---

# 09. Graph

> 게임 서버·백엔드 개발자를 위한 CS 면접 교재

## 학습 목표

- Graph의 Vertex·Edge와 방향·가중치 개념을 설명할 수 있다.
- 인접 행렬과 인접 리스트의 공간·연산 Trade-off를 비교할 수 있다.
- BFS·DFS에서 방문 처리가 필요한 이유를 설명할 수 있다.
- 게임 월드, 친구 관계, 의존성 같은 실무 관계를 Graph로 모델링할 수 있다.

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

## 7. 경로 복원과 연결 요소

도달 여부만 필요하면 `visited`로 충분하다. 실제 경로를 반환하려면 처음 방문할 때 `parent[child] = current`를 기록하고 목적지에서 시작점까지 역추적한 뒤 뒤집는다.

```text
parent[D] = B
parent[B] = A

D → B → A 역추적
A → B → D 순서로 뒤집기
```

무방향 Graph에서 아직 방문하지 않은 Vertex마다 BFS나 DFS를 시작하면 연결 요소(Connected Component)의 개수를 구할 수 있다. Edge가 추가되기만 하고 연결 여부를 반복 확인한다면 Union-Find가 더 효율적일 수 있다. 반면 실제 경로나 이웃 목록이 필요하면 Graph 표현이 필요하다.

## 8. Cycle과 DAG

무방향 Graph의 DFS에서는 방문한 이웃이 부모가 아니라면 Cycle이 있다. 방금 지나온 양방향 Edge를 Cycle로 오해하지 않도록 부모를 구분한다.

방향 Graph에서는 현재 DFS 경로에 들어 있는 Vertex를 별도로 표시한다. 방문 완료 Vertex가 아니라 “아직 재귀 Stack 안에 있는 Vertex”로 향하는 Back Edge가 Cycle을 뜻한다.

Cycle이 없는 방향 Graph를 DAG(Directed Acyclic Graph)라고 한다. Build 순서, Quest 선행 조건, Batch Job 의존성은 DAG로 모델링할 수 있다. 위상 정렬은 모든 선행 Edge가 먼저 처리되는 순서를 구한다. Cycle이 있으면 전체 위상 순서가 존재하지 않는다.

## 9. 장점과 단점

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

## 10. 게임 서버·백엔드 실무 예시

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

## 11. 자주 하는 오해

- **Graph는 항상 인접 행렬로 구현한다**: Sparse Graph에서는 인접 리스트가 일반적으로 메모리와 이웃 순회에 유리하다.
- **BFS는 모든 최단 경로를 구한다**: 비가중 또는 동일 가중치 Graph에서 최소 Edge 수를 보장한다.
- **DFS에서는 방문 배열이 없어도 된다**: 일반 Graph에는 Cycle이 있어 무한 반복할 수 있다.
- **Tree와 Graph는 완전히 별개다**: Tree는 연결되고 Cycle이 없는 Graph의 특수한 형태다.
- **Edge가 적으면 탐색은 항상 빠르다**: 시작점에서 도달 가능한 범위와 고차수 Vertex에 따라 많은 Vertex를 방문할 수 있다.
- **Union-Find가 Graph를 대체한다**: 연결 여부와 병합에는 강하지만 실제 경로, 이웃, Edge 삭제는 제공하지 않는다.
- **자료구조만 Thread-safe면 일관된 경로가 나온다**: 탐색 도중 변경을 허용할지, Snapshot 일관성을 요구할지도 정해야 한다.

## 12. 면접 질문

### Q1. Graph와 Tree의 차이를 설명해 주세요.

Graph는 Vertex와 Edge로 임의의 관계를 표현하며 Cycle과 여러 경로를 가질 수 있습니다. Tree는 연결되고 Cycle이 없는 Graph로, `V`개 Vertex에 `V-1`개 Edge가 있으며 두 Vertex 사이 단순 경로가 하나뿐입니다.

### Q2. 인접 행렬과 인접 리스트를 비교해 주세요.

인접 행렬은 `O(V²)` 공간을 사용하고 특정 Edge를 `O(1)`에 확인하지만 이웃 순회가 `O(V)`입니다. 인접 리스트는 `O(V+E)` 공간과 `O(degree)` 이웃 순회가 가능해 Sparse Graph에 유리하지만 특정 Edge 확인은 자식 Container에 따라 비용이 듭니다.

### Q3. Graph 순회에서 방문 처리가 필요한 이유는 무엇인가요?

Graph는 Cycle과 여러 진입 경로를 가질 수 있어 같은 Vertex를 반복 방문할 수 있기 때문입니다. BFS에서는 Queue에 넣을 때 방문 표시해 중복 Enqueue를 막는 것이 좋습니다.

### Q4. BFS와 DFS를 어떻게 선택하나요?

비가중 Graph의 최소 Hop이나 가까운 Level부터 탐색해야 하면 BFS를 사용합니다. 경로를 깊게 탐색하거나 Cycle, 위상 정렬 같은 구조적 처리가 필요하면 DFS가 자연스럽습니다. 둘 다 인접 리스트에서 기본적으로 `O(V+E)`입니다.

### Q5. 방향 Graph의 Cycle은 어떻게 찾나요?

DFS에서 전체 방문 여부와 현재 DFS 경로에 포함되었는지를 구분합니다. 현재 경로의 Vertex로 향하는 Back Edge를 만나면 Cycle입니다. 또는 진입 차수를 사용하는 위상 정렬에서 모든 Vertex를 처리하지 못해도 Cycle을 판단할 수 있습니다.

### Q6. 게임 월드 Graph 설계에서 무엇을 고려하나요?

Portal의 방향성, 가중치 의미, 잠금 조건과 Graph 변경 Version을 정의합니다. 필요한 결과가 도달 여부인지 최소 Hop인지 최소 비용인지에 따라 알고리즘을 선택하고, 탐색 Budget과 Snapshot 일관성도 고려합니다.

## 13. 예상 꼬리질문

- 무방향 Edge를 인접 리스트에 어떻게 저장하나요?
- Dense Graph와 Sparse Graph의 기준은 무엇인가요?
- BFS로 실제 경로를 어떻게 복원하나요?
- 재귀 DFS의 위험과 대안은 무엇인가요?
- DAG와 위상 정렬은 어떤 관계인가요?
- Edge List가 유리한 알고리즘은 무엇인가요?
- Graph가 탐색 중 변경된다면 어떤 일관성 정책을 쓸 수 있나요?

## 14. 30초 모범답변

> Graph는 Vertex와 Edge로 다대다 관계를 표현하며 방향과 가중치를 가질 수 있습니다. 인접 행렬은 `O(V²)` 공간으로 Edge 확인이 `O(1)`이고, 인접 리스트는 `O(V+E)` 공간으로 Sparse Graph의 이웃 순회에 유리합니다. BFS와 DFS에서는 Cycle로 인한 중복을 막기 위해 방문 집합이 필요하며, 게임 서버에서는 Zone 이동이나 친구 관계를 모델링할 수 있습니다.

## 15. 1~2분 확장답변

> Graph는 객체를 Vertex, 관계를 Edge로 표현합니다. 방향 Graph는 단방향 관계, 가중 Graph는 거리나 비용을 나타냅니다. 표현 방식으로 인접 행렬은 특정 Edge를 `O(1)`에 확인하지만 `O(V²)` 공간을 사용하고, 인접 리스트는 `O(V+E)` 공간과 Degree에 비례한 이웃 순회가 가능해 Sparse Graph에 적합합니다.
>
> 순회에는 Queue 기반 BFS와 Stack 또는 재귀 기반 DFS가 있습니다. 인접 리스트에서 둘 다 `O(V+E)`이며 Cycle과 다중 경로 때문에 방문 표시가 필요합니다. BFS는 비가중 최소 Hop, DFS는 깊은 탐색과 Cycle·위상 정렬의 기반으로 자주 사용합니다. 게임 월드에서는 Zone과 Portal을 Graph로 표현할 수 있지만, Portal 비용이 다르면 BFS가 아니라 Dijkstra처럼 가중치 조건에 맞는 알고리즘을 골라야 합니다. 실무에서는 Graph 변경 중 Snapshot, 고차수 Vertex, 탐색 Budget과 동시성도 함께 설계합니다.

## 16. 핵심 요약

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
