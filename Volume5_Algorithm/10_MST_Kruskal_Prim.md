---
difficulty: 4
reading_time: 30분
interview_frequency: 4
importance: 4
---

# 10. MST, Kruskal, Prim

> 게임 서버·백엔드 개발자를 위한 CS 면접 교재

## 학습 목표

- 최소 신장 트리의 정의와 성립 조건을 설명할 수 있다.
- Cut Property를 이용해 안전한 Edge 선택을 설명할 수 있다.
- Kruskal과 Prim의 동작·자료구조·복잡도를 비교할 수 있다.
- MST와 최단 경로 Tree, 실제 이중화 Network 설계의 차이를 설명할 수 있다.

## 1. 개요

Spanning Tree는 연결된 무방향 Graph의 모든 Vertex를 포함하고 Cycle이 없는 부분 Graph다. Vertex가 `V`개이면 Edge는 정확히 `V-1`개다.

Minimum Spanning Tree, 즉 MST는 모든 Spanning Tree 중 Edge Weight의 합이 최소인 Tree다.

```text
       4
  A -------- B
  | \        |
 1|  \3      |2
  |   \      |
  C -------- D
       5

가능한 MST Edge: A-C(1), B-D(2), A-D(3)
총비용: 6
```

MST의 목적은 임의 두 점 사이 이동 거리를 각각 최소화하는 것이 아니라 전체 Vertex를 연결하는 구축 비용의 합을 최소화하는 것이다.

## 2. 입력 조건

기본 MST 문제는 다음 조건을 전제로 한다.

- 무방향 Graph
- 모든 Vertex가 연결됨
- Edge에 비교 가능한 Weight가 있음

Graph가 불연결이면 모든 Vertex를 잇는 하나의 Spanning Tree는 없다. 각 Connected Component의 MST를 구한 Minimum Spanning Forest는 만들 수 있다.

음수 Weight는 허용된다. 음수 Edge를 선택하는 것이 총합을 더 줄일 수 있고, MST는 Cycle을 만들지 않는 한 정상적으로 처리한다. Dijkstra의 음수 제한과 혼동하지 않는다.

방향 Graph의 최소 연결 문제는 Directed Minimum Spanning Arborescence 등 다른 문제이며 Kruskal·Prim을 그대로 적용하지 않는다.

## 3. MST의 기본 성질

Tree는 연결되어 있고 Cycle이 없다. 다음 성질이 유용하다.

- V개 Vertex의 Tree는 V-1개 Edge를 가진다.
- Tree의 임의 두 Vertex 사이 단순 경로는 하나다.
- Tree에 Edge 하나를 추가하면 Cycle이 정확히 하나 생긴다.
- Tree에서 Edge 하나를 제거하면 두 Component로 나뉜다.

Kruskal은 Cycle을 만들지 않는 Edge를 V-1개 선택하고, Prim은 현재 Tree와 바깥을 잇는 Edge를 선택하므로 연결성을 유지한다.

## 4. Cut Property

Cut은 Vertex 집합을 서로 겹치지 않는 두 Group으로 나누는 것이다. Cut을 가로지르는 Edge 중 Weight가 최소인 Edge는 어떤 MST에 포함될 수 있는 안전한 Edge다.

```text
Cut: {A, C} | {B, D}

왼쪽 Group      오른쪽 Group
 A, C    ----   B, D
          ↑ Cut을 가로지르는 Edge 중 최소 선택
```

교환 논증으로 설명할 수 있다. 어떤 MST가 최소 Crossing Edge `e`를 포함하지 않는다고 하자. `e`를 추가하면 Cycle이 생기고 그 Cycle에는 같은 Cut을 다시 가로지르는 Edge `f`가 있다. `e`가 최소이므로 `w(e) <= w(f)`다. `f`를 제거하고 `e`를 넣으면 연결된 Tree를 유지하면서 비용이 증가하지 않는다. 따라서 `e`를 포함하는 MST가 존재한다.

Kruskal과 Prim은 서로 다른 방식으로 Cut Property의 안전한 Edge를 선택한다.

## 5. Kruskal Algorithm

모든 Edge를 Weight 오름차순으로 정렬한다. 작은 Edge부터 보면서 서로 다른 Component를 연결하는 Edge만 선택한다. 같은 Component의 두 Vertex를 잇는 Edge는 Cycle을 만들므로 건너뛴다.

```text
1. 모든 Vertex를 독립 집합으로 초기화
2. Edge를 Weight 오름차순 정렬
3. Edge (u,v)를 순서대로 검사
4. Find(u) != Find(v)이면 선택하고 Union
5. V-1개를 선택하면 종료
```

```csharp
edges.Sort((a, b) => a.Weight.CompareTo(b.Weight));

long total = 0;
var selected = new List<Edge>();

foreach (var edge in edges)
{
    if (!dsu.Union(edge.From, edge.To))
        continue;

    selected.Add(edge);
    total += edge.Weight;

    if (selected.Count == vertexCount - 1)
        break;
}
```

`Union`이 False면 이미 같은 Component다. 경로 압축과 Size·Rank 기준 결합을 쓰는 Union-Find로 연결 여부를 거의 상수 시간에 처리한다.

## 6. Kruskal 단계별 예시

```text
Edge 정렬:
A-C(1), B-D(2), A-D(3), A-B(4), C-D(5)
```

1. A-C 선택: `{A,C}`가 하나의 Component다.
2. B-D 선택: `{B,D}`가 하나의 Component다.
3. A-D 선택: 두 Component를 연결해 모든 Vertex가 연결된다.
4. 선택 Edge가 V-1=3개이므로 종료한다.

A-B와 C-D는 더 이상 필요하지 않다. 같은 Weight가 있으면 다른 Edge를 선택한 또 다른 MST가 존재할 수 있다.

정렬이 O(E log E), Union-Find 연산 총합이 O(E α(V))이므로 전체는 O(E log E)다. Edge List 저장과 정렬에 O(E), Union-Find에 O(V) 공간이 필요하다.

## 7. Kruskal의 정당성

현재 선택한 Edge들은 여러 Connected Component Forest를 이룬다. 서로 다른 두 Component를 잇는 현재 가장 가벼운 Edge는 그 두 Group을 가르는 Cut의 최소 Edge이므로 Cut Property에 따라 안전하다.

같은 Component의 Edge를 건너뛰는 것은 이미 내부 경로가 있어 Edge를 추가하면 Cycle이 생기기 때문이다. 모든 선택이 안전하고 V-1개 선택 후 연결 Tree가 되므로 결과는 MST다.

## 8. Prim Algorithm

임의 시작 Vertex 하나에서 Tree를 키운다. 현재 Tree 안의 Vertex와 바깥 Vertex를 잇는 Edge 중 가장 가벼운 것을 선택한다.

```text
Tree={start}
   ↓
Tree에서 바깥으로 나가는 최소 Edge 선택
   ↓
새 Vertex와 Edge를 Tree에 추가
   ↓
모든 Vertex가 포함될 때까지 반복
```

인접 리스트와 Min Heap을 사용하면 현재 Tree에서 나가는 후보 Edge를 효율적으로 관리할 수 있다.

```csharp
visited[start] = true;
PushAllEdges(start);

while (pq.Count > 0 && selected.Count < vertexCount - 1)
{
    Edge edge = pq.Dequeue();
    if (visited[edge.To])
        continue;

    visited[edge.To] = true;
    selected.Add(edge);
    total += edge.Weight;
    PushAllEdges(edge.To);
}
```

무방향 Edge는 양쪽 인접 리스트에 저장한다. Queue에서 꺼낸 도착 Vertex가 이미 Tree 안이면 오래된 후보이므로 건너뛴다.

## 9. Prim의 두 구현

### Edge 기반 Lazy Heap

Tree에 새 Vertex가 들어올 때 나가는 Edge를 모두 Push한다. 구현이 단순하지만 같은 목적지의 여러 Edge가 Heap에 남을 수 있어 Queue 크기가 O(E)까지 간다. 시간은 O(E log E)로 표현할 수 있고 단순 Graph에서는 흔히 O(E log V) 범주로 설명한다.

### Vertex Key 기반 구현

각 바깥 Vertex를 Tree와 연결하는 현재 최소 Edge Weight `key[v]`를 유지한다. 더 싼 Edge를 발견하면 Key와 Parent를 갱신한다. Decrease-Key가 가능한 Heap이면 O(E log V), 없으면 새 Entry를 넣고 오래된 값을 건너뛴다.

### Dense Graph

인접 행렬에서 매번 미포함 Vertex 중 Key가 최소인 것을 선형 선택하면 O(V²)다. Edge가 V²에 가까운 Dense Graph에서는 Heap 방식과 비교할 만하고 구현도 단순하다.

## 10. Prim의 정당성

현재 MST에 포함한 Vertex 집합 S와 바깥 V-S가 Cut을 만든다. Prim이 선택하는 Edge는 이 Cut을 가로지르는 최소 Weight Edge다. Cut Property에 따라 어떤 MST에 안전하게 포함할 수 있다.

매 단계 새 Vertex 하나가 연결되므로 Cycle이 생기지 않고, V-1번 선택하면 모든 Vertex를 포함한 Tree가 된다. 모든 선택이 안전하므로 결과는 MST다.

시작 Vertex는 최종 MST 비용에 영향을 주지 않는다. 단, MST가 여러 개면 시작점과 Tie-break에 따라 선택된 Edge 집합은 달라질 수 있다.

## 11. Kruskal과 Prim 비교

| 항목 | Kruskal | Prim |
|---|---|---|
| 관점 | 전체 Edge 중 작은 순서 | 한 Tree를 바깥으로 확장 |
| 핵심 구조 | Edge 정렬 + Union-Find | 인접 리스트 + Min Heap |
| 대표 시간 | O(E log E) | O(E log V), 행렬 O(V²) |
| Sparse Graph | 자연스러움 | Heap으로 효율적 |
| Dense Graph | Edge 정렬량 큼 | O(V²) 구현 고려 |
| 불연결 Graph | Minimum Forest 생성 가능 | Component마다 다시 시작 |
| Streaming 후보 | 전체 정렬 필요 | 인접 Edge 접근 필요 |

둘 다 Sparse Graph에서 충분히 효율적이다. 실제 선택은 입력 표현, 표준 Library, Memory와 구현 단순성에 따른다.

## 12. MST와 최단 경로 Tree 차이

MST는 전체 Edge 합을 최소화한다. Dijkstra가 만드는 최단 경로 Tree는 한 시작점에서 각 Vertex까지 거리를 최소화한다.

```text
       2
S -------- A
|          |
|2        100
|          |
B -------- C
     2
S -------- C = 3인 직접 Edge도 있다고 하자
```

MST는 전체 연결 비용을 줄이기 위해 어떤 경로의 시작점 거리가 길어질 수 있다. 최단 경로 Tree는 시작점별 거리를 보존하지만 전체 Edge 합이 최소일 필요는 없다.

“모든 도시를 가장 싸게 연결”은 MST이고, “본사에서 각 도시까지 가장 빠르게”는 단일 시작점 최단 경로다. 목적 함수를 문장으로 구분한다.

## 13. MST의 유일성

모든 Edge Weight가 서로 다르면 MST는 유일하다. Weight가 같은 Edge가 있다고 반드시 여러 MST인 것은 아니지만 가능성이 생긴다.

Kruskal에서 같은 Weight Edge의 처리 순서가 달라도 총비용은 같고 Edge 집합은 다를 수 있다. 결과 결정성이 필요하면 `(weight, minVertexId, maxVertexId)`처럼 Tie-break를 고정한다.

특정 Edge가 모든 MST에 포함되는지, 두 번째로 작은 Spanning Tree는 무엇인지 같은 문제는 추가 분석이 필요하다. 기본 Kruskal 결과 하나만으로 단정하지 않는다.

## 14. 불연결 Graph와 검증

Kruskal 종료 후 선택 Edge 수가 V-1보다 작으면 Graph가 불연결이다. 이 결과를 오류로 볼지 Minimum Spanning Forest로 반환할지 API 계약을 정한다.

Prim도 시작 Component만 방문하고 Queue가 비게 된다. 모든 Vertex 방문 여부를 확인해야 한다.

```text
if selectedEdgeCount != V - 1:
    전체 MST 없음
```

단일 Vertex Graph는 Edge 0개의 MST와 총비용 0을 가진다. 빈 Graph의 의미는 Domain 정책으로 정한다.

## 15. Weight와 Overflow

개별 Edge Weight가 32-bit여도 V-1개 합은 범위를 넘을 수 있다. 총비용은 64-bit 이상으로 누적하고 입력 범위를 계산한다. Weight가 Floating Point면 NaN, 비교 오차와 결정성을 처리한다.

음수 Edge는 MST에 문제가 없지만 Self Loop는 어떤 Spanning Tree에도 필요하지 않다. Parallel Edge는 허용 가능하며 더 가벼운 Edge가 선택될 수 있다.

## 16. 게임 서버·백엔드 실무 예시

### 월드 거점 연결 비용

거점 사이 Portal 구축 비용이 있고 모든 거점을 최소 총비용으로 연결하려면 MST로 기본 Network를 제안할 수 있다. Kruskal 결과는 어떤 Portal 후보를 건설할지 직접 보여 준다.

```text
거점 후보 Edge
   ↓ 비용 정렬 + Union-Find
MST 기본 연결안
   ↓
가용성·지연·용량 제약 추가 검토
```

그러나 Tree는 Edge 하나가 끊기면 두 Group으로 분리된다. 실제 Game Network나 Data Center는 이중화, 최대 지연, 대역폭, Region 규제 같은 제약이 필요하다. MST는 최종 Production 설계가 아니라 비용 최소 Baseline일 수 있다.

### Cluster 배치 계획

서버 간 전용 Link 구축 비용을 최소화하는 Offline 계획에 사용할 수 있다. 실제 Traffic은 중앙 Edge에 집중될 수 있으므로 총 구축비 최소와 Runtime Latency·Capacity는 다르다. MST Edge별 예상 부하와 Failure Domain을 별도로 Simulation한다.

### 동적 Weight

비용이 바뀔 때마다 기본 MST를 다시 계산할 수 있지만 Graph가 매우 크고 변경이 빈번하면 Dynamic MST는 복잡하다. 변경 Batch를 모아 Background Worker에서 재계산하고 Graph Version별 결과를 원자적으로 교체할 수 있다.

지표로 V·E, 정렬 시간, Union 시도·성공 수, Heap Peak, 총비용, Component 수, 재계산 시간과 Version을 기록한다.

## 17. 장점과 단점

### 장점

- 모든 Vertex를 연결하는 전체 구축 비용의 최솟값을 구한다.
- Kruskal은 Edge List와 Union-Find로 구현이 명확하다.
- Prim은 인접 구조에서 하나의 Tree를 자연스럽게 확장한다.
- Cut Property로 선택의 정당성을 설명할 수 있다.

### 단점

- 방향 Graph에는 기본 형태를 적용할 수 없다.
- Tree 하나는 장애 이중화와 용량을 제공하지 않는다.
- 최단 경로와 최대 지연을 보장하지 않는다.
- 동적 Edge·Weight 변경의 효율적 갱신은 어렵다.
- 여러 MST가 있으면 결정성 정책이 필요하다.

## 18. 자주 하는 오해

- **MST는 임의 두 Vertex 사이 최단 경로를 보장한다**: 전체 Edge 합만 최소화한다.
- **음수 Edge가 있으면 MST를 구할 수 없다**: 무방향 연결 문제에서 음수 Weight도 처리 가능하다.
- **MST는 항상 하나다**: 동점 Weight가 있으면 여러 개일 수 있다.
- **V개 Vertex의 MST는 V개 Edge다**: Tree이므로 V-1개다.
- **불연결 Graph에서도 하나의 MST가 나온다**: Minimum Spanning Forest만 가능하다.
- **Prim은 시작 Vertex에 따라 총비용이 달라진다**: MST 비용은 같고 Edge 집합은 달라질 수 있다.
- **Kruskal의 Union-Find가 최소 Weight를 선택한다**: 정렬이 순서를 만들고 Union-Find는 Cycle만 판정한다.
- **실제 Network에는 MST가 곧 최적 설계다**: 장애·용량·지연 제약은 별도다.

## 19. 면접 질문

### Q1. MST를 설명해 주세요.

연결된 무방향 가중 Graph의 모든 Vertex를 Cycle 없이 연결하는 Spanning Tree 중 Edge Weight 합이 최소인 Tree입니다. V개 Vertex에서 V-1개 Edge를 가집니다.

### Q2. Kruskal은 어떻게 동작하나요?

Edge를 Weight 오름차순으로 정렬하고 Union-Find로 양 끝이 다른 Component인 Edge만 선택합니다. V-1개를 선택하면 종료하며 정렬 때문에 O(E log E)입니다.

### Q3. Prim은 어떻게 동작하나요?

임의 Vertex에서 시작해 현재 Tree와 바깥을 잇는 최소 Edge를 반복 선택합니다. 인접 리스트와 Min Heap에서 보통 O(E log V), Dense Graph의 행렬 구현은 O(V²)입니다.

### Q4. 두 Algorithm이 최적인 이유는 무엇인가요?

Cut을 가로지르는 최소 Weight Edge를 포함하는 MST가 존재한다는 Cut Property를 사용합니다. Kruskal은 Component 사이, Prim은 현재 Tree와 바깥 사이의 안전한 최소 Edge를 선택합니다.

### Q5. MST와 Dijkstra 최단 경로 Tree의 차이는 무엇인가요?

MST는 전체 선택 Edge Weight 합을 최소화하고, Dijkstra Tree는 한 시작점에서 각 Vertex까지 경로 비용을 최소화합니다. 서로 다른 목적 함수라 결과가 같지 않을 수 있습니다.

### Q6. Graph가 불연결이면 어떻게 되나요?

모든 Vertex를 포함하는 MST는 없습니다. Kruskal은 각 Component의 Minimum Spanning Forest를 만들며, 선택 Edge 수가 V-1인지 검사해 전체 연결 여부를 판단합니다.

## 20. 예상 꼬리질문

- Cut Property를 교환 논증으로 설명해 주세요.
- Cycle Property는 무엇인가요?
- 모든 Weight가 다르면 MST가 왜 유일한가요?
- Prim Heap의 오래된 Edge는 어떻게 처리하나요?
- Dense Graph에서는 어떤 구현이 유리할 수 있나요?
- Parallel Edge와 Self Loop는 어떻게 처리하나요?
- 실제 Network 이중화에는 왜 MST만으로 부족한가요?

## 21. 30초 모범답변

> MST는 연결된 무방향 가중 Graph의 모든 Vertex를 V-1개 Edge로 연결하면서 총 Weight를 최소화합니다. Kruskal은 Edge를 정렬하고 Union-Find로 Cycle을 피하며 O(E log E), Prim은 현재 Tree에서 나가는 최소 Edge를 Heap으로 선택해 보통 O(E log V)입니다. 둘 다 Cut을 가로지르는 최소 Edge가 안전하다는 Cut Property에 기반합니다.

## 22. 1~2분 확장답변

> 최소 신장 트리는 모든 Vertex를 연결하는 Tree 중 Edge 합이 가장 작은 구조입니다. Kruskal은 전체 Edge를 Weight순으로 보고 서로 다른 Component를 연결하는 Edge만 Union-Find로 선택합니다. 정렬이 지배해 O(E log E)입니다. Prim은 한 Vertex에서 시작해 현재 Tree와 바깥을 잇는 최소 Edge를 Priority Queue로 선택하며 Sparse Graph에서 보통 O(E log V), Dense Graph에서는 O(V²) 구현도 고려합니다.
>
> 정당성은 Cut Property로 설명합니다. Cut을 가로지르는 최소 Edge를 기존 MST의 Crossing Edge와 교환해도 비용이 증가하지 않아 안전합니다. MST는 전체 구축 비용을 최소화하지만 한 시작점 최단 거리나 장애 이중화를 보장하지 않습니다. 게임 거점 연결의 비용 Baseline에는 쓸 수 있지만 Production Network에는 추가 Edge, Capacity, Failure Domain과 최대 지연 제약을 별도로 반영해야 합니다.

## 23. 핵심 요약

- MST는 연결된 무방향 가중 Graph의 최소 비용 Spanning Tree다.
- V개 Vertex의 MST는 연결되고 Cycle이 없으며 Edge V-1개를 가진다.
- Cut을 가로지르는 최소 Edge는 어떤 MST에 포함될 수 있는 안전한 Edge다.
- Kruskal은 정렬+Union-Find로 O(E log E)에 동작한다.
- Prim은 Tree 경계의 최소 Edge를 선택하며 Heap에서 보통 O(E log V)다.
- 불연결 Graph에는 하나의 MST가 없고 Minimum Spanning Forest가 생긴다.
- MST는 최단 경로 Tree와 목적이 다르고 여러 정답이 있을 수 있다.
- 실무에서는 이중화·용량·지연과 동적 Version을 별도로 설계한다.

## 한 줄 정리

> MST는 Cut을 가로지르는 안전한 최소 Edge를 반복 선택해 전체 연결 구축 비용을 최소화한다.
