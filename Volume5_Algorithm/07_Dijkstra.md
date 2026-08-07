---
difficulty: 4
reading_time: 30분
interview_frequency: 5
importance: 5
---

# 07. Dijkstra


## 학습 목표

- 음수 가중치 Edge가 포함된 그래프에서 Dijkstra를 선택했을 때 어떤 불변식이 깨지는지 진단하고, Bellman-Ford로 전환해야 하는 기준을 제시할 수 있다.
- 게임 서버에서 Dijkstra 탐색이 Tick Budget을 초과할 때, Priority Queue 최적화와 탐색 조기 종료 중 어떤 전략이 적합한지 트레이드오프를 근거로 판단할 수 있다.
- Priority Queue에 오래된 Entry가 누적되어 Memory Peak가 발생하는 상황에서 Lazy Skip 전략의 한계와 Decrease-Key 구현 전환 기준을 판단할 수 있다.
- 경로 탐색 결과를 Cache로 제공하는 시스템에서 Map 변경 이벤트 발생 시 Stale 경로를 탐지하고 재탐색 트리거 조건을 설계할 수 있다.

## 1. 개요

Dijkstra Algorithm은 Edge 가중치가 음수가 아닌 Graph에서 한 시작점으로부터 각 Vertex까지의 최단 거리를 구한다. 방향·무방향 Graph 모두 적용할 수 있으며, 도달 가능한 목적지 하나만 필요하면 그 목적지가 확정될 때 일찍 종료할 수 있다.

```text
       4
  A --------> B
  |           |
 1|           |1
  v     2     v
  C --------> D

A→D 후보
A→B→D = 5
A→C→D = 3  ← 최단
```

핵심은 현재까지 알려진 거리 중 가장 작은 미확정 Vertex를 선택하고, 그 Vertex를 거쳐 이웃으로 가는 경로가 더 짧은지 갱신하는 것이다.

## 2. 왜 필요한가

BFS는 모든 Edge 비용이 같을 때 최소 Edge 수를 구한다. 실제 이동에서는 길이, 통행 시간, 위험도, Network 지연처럼 Edge마다 비용이 다를 수 있다. 이때 최소 Hop 경로가 최소 비용 경로와 다르다.

Dijkstra는 가능한 모든 경로를 열거하지 않고 다음 정보를 이용한다.

- 음수 Edge가 없으므로 경로를 더 연장한다고 비용이 줄지 않는다.
- 현재 최소 임시 거리를 가진 Vertex보다 더 싼 우회 경로는 나중에 나타날 수 없다.
- 확정 Vertex의 Edge만 Relax하며 최단 거리 영역을 바깥으로 확장한다.

게임 Zone 이동, Navigation Graph, Network Routing의 비용 계산, 배송·작업 의존 비용 등에서 사용된다.

## 3. 쉬운 예시

노드 5개짜리 소규모 그래프에서 A → E까지 최단 경로를 구한다. Priority Queue(Min-Heap)를 사용하며, Edge Relaxation 과정을 단계별로 확인할 수 있다.

```
그래프 구조:
A --4--> B
A --1--> C
C --2--> B
B --1--> D
C --5--> D
D --3--> E
B --6--> E
```

```csharp
using System;
using System.Collections.Generic;

class DijkstraExample
{
    static void Main()
    {
        // 인접 리스트: (이웃 노드, 가중치)
        var graph = new Dictionary<string, List<(string, int)>>
        {
            ["A"] = new() { ("B", 4), ("C", 1) },
            ["B"] = new() { ("D", 1), ("E", 6) },
            ["C"] = new() { ("B", 2), ("D", 5) },
            ["D"] = new() { ("E", 3) },
            ["E"] = new()
        };

        var dist   = new Dictionary<string, int>();
        var parent = new Dictionary<string, string>();
        var pq     = new PriorityQueue<(string node, int d), int>();

        foreach (var key in graph.Keys)
            dist[key] = int.MaxValue;

        dist["A"] = 0;
        pq.Enqueue(("A", 0), 0);

        while (pq.Count > 0)
        {
            var (u, poppedDist) = pq.Dequeue();

            // 오래된 Entry Skip
            if (poppedDist != dist[u]) continue;

            foreach (var (v, weight) in graph[u])
            {
                int candidate = dist[u] + weight;

                // Edge Relaxation: 더 짧은 경로 발견 시 갱신
                if (candidate < dist[v])
                {
                    dist[v]   = candidate;
                    parent[v] = u;
                    pq.Enqueue((v, candidate), candidate);
                }
            }
        }

        // 경로 복원
        var path  = new List<string>();
        var node  = "E";
        while (node != null)
        {
            path.Add(node);
            parent.TryGetValue(node, out node);
        }
        path.Reverse();

        Console.WriteLine($"A→E 최단 거리: {dist["E"]}");     // 7
        Console.WriteLine($"경로: {string.Join(" → ", path)}"); // A → C → B → D → E
    }
}
```

A에서 출발해 C(비용 1) → B(비용 3) → D(비용 4) → E(비용 7) 순으로 확정된다. A→B 직행(비용 4)보다 A→C→B(비용 3)가 짧아 Relaxation으로 갱신되는 과정이 핵심이다. 최종 최단 거리는 7이고 경로는 A → C → B → D → E다 (1+2+1+3=7).

## 4. 핵심 용어와 Relaxation

`dist[v]`는 현재까지 발견한 시작점에서 `v`까지의 최단 거리 상한이다. 초기에는 시작점만 0이고 나머지는 무한대다.

```text
dist[start] = 0
dist[others] = INF
```

Edge `(u, v, weight)`를 이용해 `v`의 더 짧은 경로를 발견했는지 확인하는 과정을 Relaxation이라고 한다.

```text
candidate = dist[u] + weight(u, v)

if candidate < dist[v]:
    dist[v] = candidate
    parent[v] = u
```

Relaxation은 제약을 느슨하게 만든다는 의미다. `dist[v]`가 실제 최단 거리보다 작아지는 것이 아니라, 처음의 느슨한 INF 상한을 더 정확한 값으로 낮춘다.

## 5. Priority Queue 구현

Min Priority Queue에 `(distance, vertex)`를 넣어 현재 임시 거리가 가장 작은 Vertex를 꺼낸다.

```text
dist[start] = 0
push (0, start)

while pq not empty:
    (poppedDist, u) = popMin()

    if poppedDist != dist[u]:
        continue

    for edge (u, v, weight):
        candidate = dist[u] + weight
        if candidate < dist[v]:
            dist[v] = candidate
            parent[v] = u
            push (candidate, v)
```

표준 Priority Queue가 이미 들어간 Entry의 Key를 낮추는 Decrease-Key를 제공하지 않는 경우가 많다. 그때 더 짧은 거리를 발견할 때 새 Entry를 추가하고, 이전 Entry는 나중에 꺼냈을 때 무시하는 Lazy 방식이 단순하다.

```text
B까지 거리 10 발견 → push(10, B)
나중에 거리 4 발견 → push(4, B)

pop(4, B)  → 현재 dist와 같음, 처리
pop(10, B) → 현재 dist=4와 다름, 오래된 Entry Skip
```

오래된 Entry를 걸러도 Queue에 들어가는 수와 Memory Peak는 커질 수 있다. 최악에는 성공한 Relaxation마다 Entry가 추가되어 O(E) 수준이 될 수 있다.

## 6. 단계별 예시

```text
Edge:
A→B 4, A→C 1, C→B 2, B→D 1, C→D 5
```

초기 상태다.

```text
dist[A]=0, B=INF, C=INF, D=INF
PQ: (0,A)
```

A를 꺼내 Relax한다.

```text
B=4, C=1
PQ: (1,C), (4,B)
```

C를 꺼낸다.

```text
C→B: 1+2=3 < 4 → B=3, push(3,B)
C→D: 1+5=6     → D=6
PQ: (3,B), (4,B), (6,D)
```

B를 거리 3으로 꺼낸다.

```text
B→D: 3+1=4 < 6 → D=4
PQ: (4,B-old), (4,D), (6,D-old)
```

오래된 `(4,B)`는 현재 `dist[B]=3`과 달라 건너뛴다. D를 4로 꺼내면 최단 거리가 확정된다. Parent는 `D←B←C←A`이므로 경로는 `A→C→B→D`다.

## 7. 정당성: 왜 최소 거리를 확정할 수 있는가

Priority Queue에서 꺼낸 거리 `dist[u]`가 최신이고 미확정 중 최소라고 하자. `u`까지 더 짧은 경로가 아직 발견되지 않았다고 가정해 모순을 만들 수 있다.

그 더 짧은 경로에서 확정된 영역을 처음 벗어나는 Edge `(x, y)`를 보자. `x`는 이미 확정되었으므로 `x`를 처리할 때 `y`가 Relax되었다. 모든 Edge 가중치가 음수가 아니므로 시작점에서 `y`까지 비용은 그 경로의 최종 `u` 비용보다 크지 않다. 따라서 `y`의 임시 거리는 `u`보다 작거나 같아 `u`보다 먼저 선택됐어야 한다. 이는 `u`가 최소라는 가정과 충돌한다.

결국 최신 최소 Entry를 꺼낼 때 그 거리는 최단 거리다. 이 증명에서 음수 가중치가 없다는 조건이 핵심이다.

## 8. 음수 Edge에서 실패하는 이유

음수 Edge가 있으면 이미 확정한 Vertex의 거리를 나중에 줄일 수 있다.

```text
S→A = 2
S→B = 5
B→A = -10

처음에는 A의 거리 2가 B의 5보다 작아 확정
하지만 S→B→A = -5
```

“최소 임시 거리의 Vertex는 나중에 더 짧아지지 않는다”는 논리가 깨진다. 음수 Edge가 있으면 Bellman-Ford 등을 고려한다. 음수 Cycle이 시작점에서 도달 가능하면 경로 비용을 계속 낮출 수 있어 유한한 최단 거리가 존재하지 않는다.

모든 Edge가 양수일 필요는 없고 0은 허용된다. 조건은 음수가 아닌 `weight >= 0`이다.

## 9. 시간·공간 복잡도

### 인접 리스트 + Binary Heap

각 Edge Relaxation과 Queue Push·Pop에 Log 비용이 든다. Lazy 중복 Entry를 허용하면 보통 `O((V+E) log V)` 또는 Queue 크기를 반영해 `O(E log E)`로 표현하며, 단순 Graph에서는 두 표기가 점근적으로 가까운 범주다. 면접에서는 구현 전제를 함께 밝힌다.

공간은 Graph O(V+E), 거리·Parent O(V), Priority Queue 최악 O(E)다.

### 인접 행렬 + 선형 최소 선택

매 단계 미확정 Vertex 전체에서 최솟값을 선형으로 찾으면 O(V²)다. Dense Graph나 V가 작은 경우 Heap 구현보다 단순하고 실제로 유리할 수 있다.

### 자료구조별 비교

| 구현 | 시간 | 적합한 상황 |
|---|---|---|
| 배열·행렬 + 선형 선택 | O(V²) | Dense, 작은 Graph |
| 인접 리스트 + Binary Heap | O((V+E) log V) | Sparse Graph |
| 특수 Heap | 이론상 개선 가능 | 구현 복잡도·상수 고려 |

Big-O만 보고 특수 Heap을 직접 구현하기보다 표준 Binary Heap과 실제 부하를 우선 검토한다.

## 10. 경로 복원과 동점

거리만 필요하면 `dist`로 충분하다. 실제 경로가 필요하면 더 짧은 거리로 갱신할 때 `parent[v]=u`를 저장한다. 목적지에서 시작점까지 Parent를 따라가고 뒤집는다.

도달 불가능하면 `dist[target]`은 INF이고 Parent Chain도 없다. 시작점과 목적지가 같으면 거리 0, 경로는 시작점 하나다.

같은 비용의 최단 경로가 여러 개일 수 있다. 비교 조건이 `<`이면 먼저 발견한 Parent를 유지한다. Hop 수가 적은 경로, Vertex ID가 작은 경로처럼 추가 기준이 필요하면 State와 비교 Key에 Tie-break를 포함해야 한다. 단순히 `<=`로 바꾸면 결정성이 생긴다고 보장할 수 없다.

## 11. 조기 종료와 다중 시작점

목적지 하나만 필요하면 목적지가 최신 최소 거리로 Pop되어 확정될 때 종료할 수 있다. 목적지를 처음 Push하거나 Relax한 순간 종료하면 안 된다. 나중에 더 짧은 경로가 발견될 수 있기 때문이다.

여러 시작점 중 가장 가까운 거리를 구하려면 모든 시작점을 거리 0으로 초기화해 Queue에 넣는다.

```text
for source in sources:
    dist[source] = 0
    push(0, source)
```

가상의 Super Source에서 각 시작점으로 0 Cost Edge가 있다고 보는 것과 같다. 여러 안전 Zone까지의 최소 비용이나 여러 서버 Region과의 최소 지연을 계산할 수 있다.

## 12. 다른 최단 경로와 비교

| 조건 | Algorithm | 대표 복잡도 | 핵심 주의점 |
|---|---|---|---|
| 무가중·동일 비용 | BFS | O(V+E) | Dijkstra보다 단순 |
| 가중치 0·1 | 0-1 BFS | O(V+E) | Deque 사용 |
| 음수 없음 | Dijkstra | O((V+E)logV) | 오래된 Entry |
| 음수 Edge 가능 | Bellman-Ford | O(VE) | 음수 Cycle 탐지 |
| DAG | Topological Relaxation | O(V+E) | 음수 Edge도 가능 |
| 모든 쌍·작은 Dense Graph | Floyd-Warshall | O(V³) | O(V²) Memory |

A*는 목적지까지의 Heuristic을 이용해 탐색 범위를 줄이는 Best-first Search다. Heuristic이 Admissible하고 조건을 만족하면 최적성을 유지할 수 있다. Dijkstra는 Heuristic이 0인 A*로 볼 수 있다.

최소 신장 트리 MST와 최단 경로 Tree는 목적이 다르다. MST는 전체 Vertex를 잇는 Edge 합을 최소화하고, Dijkstra Tree는 한 시작점에서 각 Vertex까지의 경로를 최소화한다.

## 13. 정수 Overflow와 INF

거리 합은 Edge 하나의 자료형보다 커질 수 있다. `dist[u] + weight`가 Overflow하면 음수나 작은 값으로 돌아가 잘못된 Relaxation을 한다.

```text
if dist[u] != INF:
    candidate = dist[u] + weight   // 더 넓은 정수형 사용
```

`INF`를 정수 최댓값으로 두고 무조건 더하지 않는다. 예상 최대 경로 비용을 계산해 64-bit 정수 범위를 확인하거나 Saturating 정책을 둔다. Floating Point 비용은 NaN, 오차, 비교 결정성을 고려한다.

## 14. 게임 서버·백엔드 실무 예시

### 월드 이동 비용

Zone을 Vertex, Portal을 Edge로 두고 이동 시간·위험도·통행료를 음수가 아닌 Weight로 정의한다. 여러 비용을 하나로 합칠 때 단위와 가중치 정책이 명확해야 한다.

```text
Town --2--> Field --3--> Dungeon
  \                       ↑
   └--------8-------------┘
```

모든 Portal 비용이 1이면 BFS가 더 단순하다. 목적지 방향을 잘 안내하는 거리 Heuristic이 있으면 A*로 방문 범위를 줄일 수 있다.

### 동적 Map과 Cache

문이 닫히거나 이동 비용이 변하면 이전 최단 경로 Cache가 오래된다. Cache Key에 Map Version, 이동 능력, Faction·잠금 조건을 포함한다. 결과 적용 전 Edge가 여전히 유효한지 확인하거나 Immutable Navigation Snapshot을 사용한다.

경로 Query가 많고 Graph가 거의 고정이면 주요 거점 간 거리를 Precompute할 수 있다. 반대로 변경이 잦으면 Cache 무효화 비용과 Stale 경로 정책을 설계해야 한다.

### Tick Budget

큰 Graph에서 Priority Queue와 Allocation이 Tick을 막을 수 있다. Pathfinding Worker로 분리하고 요청 취소, 방문 Node·시간 상한을 둔다. Budget을 넘으면 기존 경로 유지, 부분 경로, 근사 A*, 다음 Tick 재개 같은 Fallback을 사용한다.

관찰할 지표는 방문·확정 Vertex 수, Relax 횟수, Queue Push와 Peak Size, 오래된 Entry 비율, Cache Hit, 실행 시간 p95·p99와 취소율이다. Algorithm의 이론 복잡도와 실제 운영 병목을 함께 본다.

## 15. 장점과 단점

### 장점

- 음수 없는 가중 Graph의 단일 시작점 최단 거리를 효율적으로 구한다.
- 목표가 확정되면 조기 종료할 수 있다.
- Parent 저장으로 실제 최단 경로를 복원한다.
- 인접 리스트·Heap으로 Sparse Graph에 잘 맞는다.

### 단점

- 음수 Edge에서 정당성이 깨진다.
- Lazy Priority Queue는 오래된 Entry와 Memory Peak를 만든다.
- 많은 시작점·목적지 Query에는 반복 계산 비용이 크다.
- 동적 Graph에서는 Cache와 계산 결과가 빠르게 Stale해진다.
- 큰 탐색은 실시간 Tick의 Tail Latency를 만들 수 있다.

## 16. 자주 하는 오해

- **Dijkstra는 양수 Edge만 가능하다**: 0은 허용되고 음수가 문제다.
- **Vertex를 처음 발견할 때 거리가 확정된다**: 최신 최소 거리로 Pop될 때 확정된다.
- **visited를 Push할 때 표시하면 된다**: 더 짧은 경로의 Relaxation을 막을 수 있다.
- **Queue Entry는 Vertex마다 하나뿐이다**: Decrease-Key가 없으면 여러 오래된 Entry가 존재할 수 있다.
- **목적지를 처음 Relax하면 종료해도 된다**: 확정 Pop까지 기다려야 한다.
- **Dijkstra Tree는 MST다**: 시작점별 최단 경로와 전체 Edge 합 최소는 다른 목적이다.
- **복잡도는 항상 O(E log V) 하나다**: Graph 표현과 Queue 구현 전제를 밝혀야 한다.
- **음수 Cycle만 없으면 Dijkstra를 쓸 수 있다**: 음수 Edge 하나만 있어도 확정 논리가 깨진다.

## 17. 면접 질문

### Q1. MMO 서버에서 Zone 이동 요청이 초당 500건 들어올 때, Dijkstra 기반 경로 탐색의 성능 병목이 어디서 발생하는지 진단하고 해결 방향을 제시하세요.

병목은 세 곳에서 주로 발생합니다. 첫째, Min-Heap Push/Pop이 요청마다 O((V+E) log V) 비용을 유발해 동시 처리 시 CPU 사용률이 급등합니다. 둘째, Lazy 방식의 오래된 Entry 누적으로 Heap 크기가 O(E)까지 커져 GC 압력과 Cache Miss가 늘어납니다. 셋째, Graph가 크거나 Tick 내에 완료되지 않으면 Tail Latency가 발생합니다.

해결 방향으로는 요청을 Pathfinding Worker Thread로 분리해 Game Loop를 보호하고, 방문 Vertex 수·시간 상한을 두어 Budget 초과 시 근사 경로나 기존 경로를 Fallback으로 사용합니다. Graph가 거의 고정이라면 주요 Zone 간 거리를 Precompute해 Cache로 제공하고, Map Version을 Key로 포함해 Stale 경로를 탐지합니다. Heuristic을 구할 수 있다면 A*로 방문 범위를 줄이는 것도 유효합니다.

### Q2. Dijkstra 구현에서 이미 확정된 노드를 다시 방문하는 버그가 발생했습니다. Edge Relaxation 불변식 관점에서 원인을 진단하고 수정 방법을 설명하세요.

원인은 대부분 `visited` 처리 시점 오류입니다. Pop한 순간이 아니라 Push할 때 방문 표시를 하면, 이후에 더 짧은 경로로 Relaxation이 발생해도 해당 노드를 건너뛰게 됩니다. 반대로 방문 표시 없이 Skip 로직을 누락하면, 오래된 Entry가 Pop될 때 이미 확정된 노드를 재처리하게 됩니다.

Relaxation 불변식은 "Pop된 최신 최소 거리 Entry가 곧 최단 거리"입니다. 이를 보장하려면 Pop 시점에 `poppedDist != dist[u]`이면 오래된 Entry로 Skip하고, 확정된 노드의 Edge만 Relax해야 합니다. 음수 Edge가 없다는 조건이 이 불변식을 유지시키므로, 음수 Edge가 의심된다면 입력 검증을 먼저 수행합니다.

### Q3. Zone 100개짜리 대륙 이동 Graph에서 Dijkstra로 최단 경로를 탐색했는데 특정 Zone에 도달할 때마다 경로 비용이 음수로 내려가는 이상 현상이 발생했습니다. 로그에서 음수 비용 Edge가 확인됐을 때 Bellman-Ford로 전환 여부를 판단하는 기준과, 음수 Cycle이 존재할 경우 런타임에 탐지하는 방법을 설명하세요.

Bellman-Ford 전환 기준은 음수 Edge 존재 자체입니다. Dijkstra는 확정 Vertex의 거리가 이후 개선되지 않는다는 불변식에 의존하는데, 음수 Edge가 있으면 확정 이후에도 더 짧은 경로가 나타날 수 있어 이 불변식이 깨집니다.

전환 전 먼저 확인할 것은 음수 Edge가 시작점에서 도달 가능한 경로에 실제로 포함되는지입니다. 도달 불가능한 음수 Edge라면 Dijkstra 결과에 영향이 없으므로 불필요한 전환을 피합니다. 도달 가능하다면 Bellman-Ford로 전환하며, V-1번 Relaxation 후 추가 Relaxation이 일어나면 음수 Cycle이 있다고 판정합니다. 게임 서버 맥락에서는 이 판정 결과를 클라이언트에 "이동 불가 구역" 응답으로 내려 무한 루프 이동 시도를 사전 차단합니다.

Bellman-Ford의 O(VE) 비용이 라이브 서비스에 부담이 되면 음수 Edge를 가진 구간만 별도 Table로 관리하고 사전 검증 단계에서 필터링하는 방식도 현실적인 대안입니다.

### Q4. Priority Queue에 오래된 Entry가 쌓여 GC 압력이 높아지고 Heap 크기가 예상보다 10배 이상 커지는 현상이 발생했습니다. Lazy Skip 전략의 한계를 Memory 관점에서 설명하고, Decrease-Key 구현으로 전환해야 하는 판단 기준을 제시하세요.

Lazy Skip의 구조적 한계는 Relaxation 성공마다 기존 Entry를 제거하지 않고 새 Entry를 추가한다는 점입니다. 한 Vertex가 여러 경로로 갱신되면 그만큼 중복 Entry가 누적되어 Queue 크기가 최악 O(E)까지 커집니다. Dense Graph에서 간선이 많거나 갱신이 잦으면 Queue가 실제 Vertex 수의 수십 배 크기로 불어날 수 있으며, GC 언어에서는 객체 할당과 수거 비용이 Tick Budget을 직접 침범합니다.

Decrease-Key 전환 기준으로는 세 가지를 봅니다. 첫째, 프로파일링에서 오래된 Entry Skip 비율이 전체 Pop의 50% 이상이면 Queue 대부분이 낭비입니다. 둘째, Queue Peak Size가 Vertex 수의 5배 이상이면 Memory 효율이 나쁩니다. 셋째, 탐색당 GC 트리거가 측정되면 Lazy 방식이 Tick을 오염시키는 것입니다.

단, C#의 PriorityQueue나 Java의 PriorityQueue는 Decrease-Key를 제공하지 않아 직접 Indexed Priority Queue를 구현해야 합니다. 구현 복잡도가 높으므로 먼저 탐색 범위를 A*로 줄이거나 Graph 크기를 제한하는 방향을 검토한 뒤 전환을 결정합니다.

### Q5. 게임 서버에서 플레이어가 이동 중 장애물이 동적으로 추가될 때, prev 배열 기반 경로 복원이 유효하지 않아지는 시점과 재탐색 트리거 전략을 설명하세요.

prev 배열은 탐색 시점의 Graph 스냅샷을 기반으로 만들어집니다. 이동 중 장애물이 추가되어 경로 상의 Edge가 차단되면, prev 배열이 가리키는 경로는 더 이상 통과 불가능한 상태가 됩니다. 이 시점이 유효성이 깨지는 순간입니다.

재탐색 트리거 전략은 두 가지가 효과적입니다. 첫째, 플레이어가 다음 Waypoint로 이동하기 직전에 해당 Edge의 유효성을 서버에서 재확인하는 Edge Validation 방식입니다. 통과 불가 판정 시 현재 위치를 새 시작점으로 재탐색합니다. 둘째, 장애물 추가 이벤트 발생 시 영향 범위 내 경로를 사용 중인 플레이어 목록을 조회해 일괄 재탐색을 예약하는 Event-driven 방식입니다. 재탐색 비용이 큰 경우 현재 경로에서 우회 가능한 인접 노드만 부분 재탐색하거나, 다음 Tick으로 지연시켜 Tick Budget을 보호합니다.

### Q6. 100명의 플레이어가 동시에 같은 대형 던전 내에서 경로 탐색을 요청할 때, 각 요청마다 Dijkstra를 독립 실행하면 서버 Frame당 탐색 비용이 허용 Budget을 초과합니다. 탐색 결과를 공유 Cache로 제공하는 구조를 설계할 때 Map 변경 이벤트 발생 시 Stale 경로를 탐지하고 재탐색을 트리거하는 전략을 설명하세요.

Cache 구조는 `(출발 Zone, 목적 Zone, Map Version)` 조합을 Key로 씁니다. Map Version은 장애물 추가, 문 잠금, 비용 변경 이벤트마다 단조 증가하는 정수로 관리합니다. 플레이어가 경로를 요청할 때 현재 Map Version이 Cache Key의 Version과 다르면 Stale로 판정하고 재탐색을 예약합니다.

재탐색 트리거 전략은 두 단계로 나눕니다. 첫째, Map 변경 이벤트 발생 시 변경된 Edge와 인접한 Zone 목록을 추출해 해당 Zone이 포함된 Cache Entry를 무효화합니다. 전체 Cache를 날리는 것보다 영향 범위를 좁혀 불필요한 재탐색을 줄입니다. 둘째, 무효화된 경로 중 현재 사용 중인 플레이어가 있는 것만 즉시 재탐색 Queue에 넣고 나머지는 다음 요청 시 Lazy하게 재탐색합니다.

재탐색 Queue는 Worker Thread에서 Frame과 분리해 처리하고, Tick당 처리 수를 제한해 Map 변경이 집중될 때 탐색 폭주를 막습니다. 재탐색 완료 전에는 기존 경로를 임시로 유지하고 서버 측에서 다음 Waypoint 이동 전에 Edge 유효성을 실시간으로 재확인하는 방어 로직을 둡니다.

## 18. 예상 꼬리질문

- 게임 Zone 이동 비용이 모두 동일한 상황에서도 Dijkstra를 그대로 사용하겠습니까, 아니면 다른 알고리즘으로 교체하겠습니까? 그 판단 근거는 무엇인가요?
- 가중치가 0과 1뿐이면 어떻게 최적화하나요?
- Pathfinding Worker Thread가 하나뿐인데 대형 Graph에서 탐색 시간이 가변적으로 길어질 때 Tick Budget을 보호하는 방법은 무엇인가요?
- 같은 비용 경로의 Tie-break를 어떻게 정하나요?
- 수천 명의 플레이어가 서로 다른 시작 위치에서 같은 Boss Zone까지 최단 경로를 반복 요청할 때, 매번 독립 탐색 대신 어떤 구조로 비용을 줄이겠습니까?
- Dijkstra 기반 경로 탐색과 A* 탐색을 같은 게임 서버에서 혼용한다면 어떤 기준으로 어떤 상황에 각각 적용하겠습니까?
- 동적 Map의 경로 Cache는 어떻게 무효화하나요?

## 19. 30초 모범답변

> Dijkstra는 음수 Edge가 없는 Graph에서 시작점부터의 최단 거리를 구합니다. 현재 임시 거리가 가장 작은 Vertex를 Min Heap에서 꺼내 확정하고 이웃 Edge를 Relax합니다. Decrease-Key가 없으면 개선 거리마다 새 Entry를 넣고 Pop한 값이 현재 거리와 다르면 건너뜁니다. 인접 리스트와 Binary Heap에서 보통 O((V+E) log V)이며 Parent로 경로를 복원합니다.

## 20. 1~2분 확장답변

> Dijkstra는 `dist[start]=0`, 나머지는 INF로 시작합니다. Min Priority Queue에서 최신 거리가 가장 작은 Vertex를 꺼내고, `dist[u]+weight < dist[v]`이면 거리와 Parent를 갱신합니다. 음수 Edge가 없기 때문에 현재 최소 Vertex보다 더 짧은 우회 경로가 나중에 생길 수 없어 Pop 시 거리를 확정할 수 있습니다.
>
> 표준 Heap에 Decrease-Key가 없으면 같은 Vertex의 Entry를 여러 번 Push하고, 꺼낸 거리가 현재 dist와 다르면 오래된 Entry로 건너뜁니다. Sparse Graph에서 시간은 보통 O((V+E) log V), 거리·Parent는 O(V), Queue는 Lazy 구현에서 O(E)까지 커질 수 있습니다. 게임 월드 경로에는 Map Version을 Cache Key에 포함하고 Worker Thread, 방문 Node·시간 Budget과 부분 경로 Fallback을 둡니다. Edge 비용이 모두 같으면 BFS, 음수가 있으면 Bellman-Ford처럼 조건에 맞는 Algorithm을 선택합니다.

## 21. 핵심 요약

- Dijkstra는 음수 Edge가 없는 단일 시작점 최단 경로 Algorithm이다.
- Relaxation은 `dist[u]+w`가 더 작을 때 거리와 Parent를 갱신한다.
- 최신 최소 거리 Vertex는 음수 Edge가 없으므로 Pop 시 최단 거리가 확정된다.
- Decrease-Key가 없으면 개선 Entry를 추가하고 오래된 Pop을 건너뛴다.
- 인접 리스트와 Binary Heap에서 보통 O((V+E) log V), 공간은 O(V+E)다.
- 목적지는 처음 발견할 때가 아니라 확정 Pop 시 조기 종료한다.
- Parent로 경로를 복원하고 INF·덧셈 Overflow를 주의한다.
- 실무에서는 Graph Version, Queue Peak, 탐색 Budget과 Fallback을 관리한다.

## 한 줄 정리

> Dijkstra는 음수 없는 비용이라는 조건 아래 가장 가까운 미확정 Vertex를 안전하게 확정하며 최단 거리 영역을 확장한다.
