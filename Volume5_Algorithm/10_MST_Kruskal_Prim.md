---
difficulty: 4
reading_time: 30분
interview_frequency: 4
importance: 4
---

# 10. MST, Kruskal, Prim


## 학습 목표

- Graph의 밀도(Sparse/Dense)와 입력 표현(인접 리스트/행렬)을 보고 Kruskal과 Prim 중 어느 구현이 더 적합한지 판단할 수 있다.
- 게임 거점 연결 Network에서 MST 구성 후 장애가 발생했을 때, MST 속성 위반 여부를 Cut Property 관점에서 진단할 수 있다.
- MST와 최단 경로 Tree의 결과가 다를 때, 어떤 문제에 어떤 Tree를 적용해야 하는지 판단 기준을 제시할 수 있다.
- Union-Find Cycle 감지가 실패할 때, 경로 압축·랭크 병합 구현의 어느 부분이 잘못됐는지 진단할 수 있다.

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

- **Kruskal이 항상 Prim보다 빠르다**: Kruskal은 O(E log E)이지만 Dense Graph(E ≈ V²)에서는 Prim의 O(V²) 행렬 구현과 비슷하거나 오히려 느릴 수 있다. 입력 그래프의 밀도와 표현 방식에 따라 유리한 알고리즘이 다르다.
- **음수 Edge가 있으면 MST를 구할 수 없다**: 무방향 연결 문제에서 음수 Weight도 처리 가능하다.
- **MST는 항상 하나다**: 동점 Weight가 있으면 여러 개일 수 있다.
- **V개 Vertex의 MST는 V개 Edge다**: Tree이므로 V-1개다.
- **불연결 Graph에서도 하나의 MST가 나온다**: Minimum Spanning Forest만 가능하다.
- **Prim은 시작 Vertex에 따라 총비용이 달라진다**: MST 비용은 같고 Edge 집합은 달라질 수 있다.
- **Kruskal의 Union-Find가 최소 Weight를 선택한다**: 정렬이 순서를 만들고 Union-Find는 Cycle만 판정한다.
- **실제 Network에는 MST가 곧 최적 설계다**: 장애·용량·지연 제약은 별도다.

## 19. 면접 질문

### Q1. 게임 서버에서 거점 10개를 케이블로 연결하는 최소 비용 Infrastructure를 설계해야 합니다. MST로 구현할 때 발생할 수 있는 한계와, 실제 이중화를 위해 추가로 고려해야 할 사항을 설명하세요.

MST는 V-1개 Edge로 모든 거점을 연결하는 최소 비용 구조를 제시합니다. 그러나 Tree 구조 특성상 Edge 하나가 끊기면 두 Group으로 분리되므로 단일 장애 지점(SPOF)이 됩니다.

실제 이중화를 위해 다음을 추가로 고려해야 합니다. 첫째, 임계 Edge에 대한 2-Edge-Connected Subgraph를 구성하거나 중요 거점 간 보조 경로를 명시적으로 추가합니다. 둘째, MST를 비용 Baseline으로 쓰되 예상 트래픽 부하와 대역폭 제약을 반영해 Edge 용량을 재평가합니다. 셋째, Region 규제나 최대 허용 지연(Latency SLA)이 있으면 해당 제약을 Hard Constraint로 넣어 수정된 최소 비용 설계를 별도로 수행합니다. MST는 구축 비용 최솟값의 하한 기준을 제공하는 출발점이지 Production 최종 설계가 아닙니다.

### Q2. Kruskal 구현에서 Union-Find의 Find 연산이 O(N)으로 느려지는 버그가 발생했습니다. 경로 압축과 랭크 병합 중 어느 쪽 문제인지 진단하고 수정 방법을 설명하세요.

Find가 O(N)으로 떨어지는 원인은 Tree가 선형 체인으로 퇴화했을 때입니다. 이는 두 가지 경우로 나뉩니다.

경로 압축이 없으면 Find(x)가 루트까지 올라가면서 중간 노드의 parent를 갱신하지 않아 다음 호출에서도 같은 경로를 반복합니다. 수정은 Find 내부에서 재귀 또는 2-Pass 방식으로 모든 중간 노드의 parent를 루트로 직접 연결하는 것입니다.

랭크 병합이 없으면 작은 Tree가 항상 큰 Tree 아래에 붙지 않아 Tree 높이가 O(N)까지 자랄 수 있습니다. 수정은 Union 시 rank가 낮은 쪽을 높은 쪽 아래에 붙이고, 두 rank가 같을 때만 rank를 1 증가시키는 것입니다.

두 최적화를 함께 적용하면 Find의 Amortized 복잡도가 O(α(N))으로 줄어 사실상 상수 시간이 됩니다. 디버깅 시 Union 후 Tree 높이를 출력하거나 parent 배열을 시각화해 어느 쪽 최적화가 빠진 건지 확인합니다.

### Q3. 노드 10만 개, Edge 500만 개인 Dense Game World Graph에서 MST를 구해야 합니다. Kruskal과 Prim 중 어느 쪽이 적합한지 시간·공간 복잡도 근거와 함께 판단하세요.

E = 500만, V = 10만이므로 E/V = 50으로 Dense에 가깝습니다.

Kruskal은 Edge 정렬에 O(E log E) = O(500만 × log 500만) ≈ O(500만 × 23) ≈ 약 1.15억 연산이 필요하고, 500만 개 Edge 리스트를 메모리에 올려야 합니다.

Prim(인접 리스트 + Min Heap)은 O(E log V) = O(500만 × log 10만) ≈ O(500만 × 17) ≈ 약 8500만 연산으로 Kruskal보다 유리합니다. Edge는 인접 리스트로 읽으며 Heap에는 최대 E개 Entry가 쌓입니다.

만약 인접 행렬로 이미 구성된 경우 Prim O(V²) = O(10만²) = 100억으로 도리어 느립니다. 따라서 인접 리스트 기반이라면 Prim + Min Heap, Edge 리스트만 주어졌다면 Kruskal이 구현이 단순하고 성능도 경쟁력이 있습니다. Dense Graph에서 인접 행렬 Prim O(V²)은 E ≈ V² 수준(완전 그래프)일 때만 고려합니다.

### Q4. Kruskal로 구한 MST가 서버 배포 후 Edge 1개 추가로 인해 무효화되었습니다. 전체 재계산 없이 MST를 갱신할 수 있는 방법과 한계를 설명하세요.

새 Edge (u, v, w)가 추가될 때 MST 갱신 절차는 다음과 같습니다. 현재 MST에서 u와 v를 잇는 경로를 찾고 그 경로 상의 최대 Weight Edge를 구합니다. 새 Edge w가 그 최대 Weight보다 작으면 최대 Edge를 제거하고 새 Edge를 삽입합니다. 크거나 같으면 현재 MST를 그대로 유지합니다.

MST 경로 상 최대 Edge를 찾는 데 O(V) 시간이 필요하고, LCA + Sparse Table 등을 사전 구축하면 O(log V)로 줄일 수 있습니다. 이 방법은 Edge 1개 추가에 한정됩니다.

한계는 Edge 삭제나 Weight 변경이 동반되면 처리가 복잡해지고, 빈번한 변경이 누적되면 MST 트리 구조를 유지하는 자료구조(Link-Cut Tree 등)가 필요해 구현 난이도가 급격히 높아집니다. 게임 서버에서 거점이 동적으로 변하는 경우 배치 재계산 방식이 현실적인 대안일 수 있습니다.

### Q5. 게임 거점 간 MST를 사용해 플레이어 이동 경로를 안내했더니 최단 경로가 아닌 경우가 발생했습니다. 이 문제의 근본 원인과 올바른 자료구조 선택을 설명하세요.

근본 원인은 MST와 최단 경로 Tree의 목적 함수가 다르다는 것입니다. MST는 전체 V-1개 Edge의 Weight 합을 최소화하는 목표를 가집니다. 반면 플레이어 이동 경로 안내는 특정 출발지에서 각 거점까지의 경로 비용 합산 최솟값, 즉 단일 시작점 최단 경로를 요구합니다.

예를 들어 출발지 S에서 목적지 D까지 MST 경로가 S→A→B→D이더라도, 직접 Edge S→D가 존재하고 그 비용이 더 낮으면 MST는 전체 합 최소를 위해 S→D를 선택하지 않았을 수 있습니다.

올바른 자료구조는 출발 거점이 고정되었다면 Dijkstra를 사용해 단일 시작점 최단 경로 Tree를 구하고, 모든 거점 쌍 최단 경로가 필요하다면 Floyd-Warshall을 사용합니다. 거점 연결 구축 비용 최소화(인프라 설계)에는 MST를, 런타임 플레이어 경로 안내에는 최단 경로 알고리즘을 구분해서 적용해야 합니다.

### Q6. 실시간으로 거점이 추가·삭제되는 게임 서버에서 MST를 유지 관리해야 합니다. 정적 MST 대신 동적 MST 또는 주기적 재계산 중 어떤 전략을 선택하겠으며, 그 판단 기준은 무엇인가요?

판단 기준은 변경 빈도, Graph 규모, MST 정확도 요구 수준 세 가지입니다.

동적 MST(Link-Cut Tree 기반)는 Edge 추가·삭제마다 O(log² V) 또는 O(log V)로 MST를 갱신하지만 구현 복잡도가 매우 높고 상수 계수도 큽니다. 초당 수천 건 이상의 변경이 발생하고 항상 정확한 MST가 요구되는 경우에 적합합니다.

주기적 재계산은 배치 주기(예: 1초, 10초)마다 Kruskal 또는 Prim을 전체 실행합니다. 구현이 단순하고 Graph 스냅샷을 원자적으로 교체할 수 있어 운영이 쉽습니다. 변경이 산발적이거나 약간의 지연(Stale MST)이 허용되는 경우 현실적인 선택입니다.

게임 서버에서는 대부분 주기적 재계산이 더 실용적입니다. MST를 거점 연결 비용 추정이나 네트워크 토폴로지 힌트로 쓰는 경우 수 초의 지연은 허용 가능하고, Background Worker에서 재계산 후 Read-Only 스냅샷으로 원자적 교체하는 패턴을 사용하면 런타임 성능에 영향을 주지 않습니다. 동적 MST는 정확도가 비즈니스 크리티컬하고 팀에 해당 자료구조 구현 역량이 있을 때 검토합니다.

## 20. 예상 꼬리질문

- 거점 50개 Graph에서 Kruskal로 MST를 구했는데 실행 시간이 예상보다 10배 느렸습니다. 병목 지점을 어떻게 특정하고 어떤 수치를 먼저 확인하겠습니까?
  > 먼저 Edge 수를 확인한다. Edge가 V²에 가까운 Dense Graph라면 정렬 비용이 지배한다. 다음으로 Union-Find 구현에 경로 압축과 랭크 병합이 모두 적용되어 있는지 점검한다. 둘 중 하나라도 빠지면 Find가 O(N)까지 느려진다. 프로파일러로 정렬, Find, Union 각각의 시간 비중을 측정하고, Find 호출당 평균 경로 길이를 출력해 Tree 퇴화 여부를 진단한다.
- Prim Heap 구현에서 같은 목적지 Vertex에 대해 오래된 Entry가 수천 개 쌓인 상황을 발견했습니다. 메모리·성능 영향과 해결 방법을 설명하세요.
  > Lazy Heap 방식에서는 Tree에 새 Vertex가 추가될 때 나가는 Edge를 모두 Push해 같은 목적지에 대한 Entry가 여러 개 생긴다. 이 오래된 Entry들이 누적되면 Heap 크기가 O(E)까지 커져 메모리 사용량이 증가하고 Pop 시 오래된 Entry를 건너뛰는 비용이 누적된다. 해결 방법은 각 바깥 Vertex의 현재 최소 Key를 유지하고 Heap에서 꺼낼 때 이미 Tree에 포함된 Vertex면 Skip하는 것이다. Decrease-Key를 지원하는 Indexed Priority Queue로 전환하면 오래된 Entry 자체를 없앨 수 있다.
- MST 계산 결과에서 선택된 Edge 수가 V-1보다 적을 때, 코드 버그인지 Graph 입력 문제인지 어떻게 구별하겠습니까?
  > 먼저 Graph 입력의 연결성을 검증한다. BFS나 DFS로 모든 Vertex가 하나의 Component에 속하는지 확인한다. Connected이면 코드 버그다. 의심 지점은 Union-Find에서 같은 Component 판정이 잘못돼 유효한 Edge를 건너뛰거나, V-1개 선택 전에 루프가 조기 종료되는 경우다. 불연결 Graph라면 MST가 존재하지 않으며 Minimum Spanning Forest가 결과임을 API 계약에 명시해야 한다.
- 게임 거점 Network에 신규 지역이 추가되어 Edge가 200개 늘어났습니다. MST를 전체 재계산하지 않고 증분 갱신하는 방법과 그것이 불가능한 경우를 설명하세요.
  > 새 Edge (u, v, w)를 하나씩 추가할 때는 현재 MST에서 u와 v를 잇는 경로 상 최대 Weight Edge를 찾고, 새 Edge w가 더 작으면 기존 최대 Edge를 교체한다. 이 작업은 O(V)이며 LCA + Sparse Table을 사전 구축하면 O(log V)로 줄일 수 있다. 증분 갱신이 불가능한 경우는 Edge 삭제가 동반될 때다. 삭제는 MST 구조를 더 복잡하게 바꾸어 Link-Cut Tree 없이는 효율적으로 처리하기 어렵다.
- 두 거점을 잇는 Edge Weight가 동시에 3개 이상 동점일 때, Kruskal 결과 MST가 운영 환경마다 달라지는 문제가 발생했습니다. 결정성을 보장하려면 어떻게 처리하겠습니까?
  > 정렬 Key를 (weight, min(u,v), max(u,v))처럼 Edge를 유일하게 식별하는 보조 Key로 확장해 동점 Edge의 순서를 결정적으로 만든다. Java의 Arrays.sort는 Stable Sort이므로 추가 Key 없이 입력 순서를 보조 기준으로 사용할 수도 있다. 중요한 것은 어떤 환경에서도 동일한 정렬 기준이 일관되게 적용되는 것이며, 기준을 코드 주석과 문서에 명시해 재현 가능성을 보장한다.
- 서버 장애로 MST Edge 1개가 끊겼을 때, Kruskal 전체 재계산 없이 다음 최소 비용 Edge로 교체하는 방법과 그 복잡도를 설명하세요.
  > 끊긴 Edge (u, v)를 제거하면 MST가 두 Component로 분리된다. 두 Component를 잇는 후보 Edge 중 Weight가 최소인 Edge를 선택해 MST에 추가한다. 후보 Edge는 원본 Graph에서 두 Component를 가로지르는 Edge를 선형 탐색해 O(E)에 찾는다. 사전에 MST의 각 Edge에 대해 "대체 Edge"를 미리 계산해 두는 방식은 O(V²) 전처리 후 O(1) 교체가 가능하지만 구현 복잡도가 높다.
- Union-Find 없이 인접 행렬만으로 MST를 구현해야 하는 제약이 생겼을 때 어떤 알고리즘을 선택하고 어떻게 구현하겠습니까?
  > Prim의 O(V²) 인접 행렬 구현을 선택한다. visited 배열로 Tree에 포함된 Vertex를 관리하고, key[v] 배열에 각 바깥 Vertex의 현재 최소 연결 비용을 유지한다. 매 단계 미방문 Vertex 중 key 값이 최소인 것을 선형 탐색(O(V))으로 찾아 Tree에 추가하고, 인접 행렬 한 행을 읽어 key 값을 갱신한다. V번 반복으로 전체 O(V²)이며 Dense Graph에서는 Heap 방식과 동등하거나 더 빠를 수 있다.

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
