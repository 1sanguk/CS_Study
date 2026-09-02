---
difficulty: 4
reading_time: 30분
interview_frequency: 5
importance: 5
---

# 12. Algorithm 종합면접


## 학습 목표

- 입력 크기·정렬·가중치·반복 여부 등 문제 조건을 분석하여, Greedy·DP·Backtracking·Graph Algorithm 중 적합한 Pattern을 판단할 수 있다.
- Algorithm 정당성 검증 방법(Loop Invariant·교환 논증·점화식·단조성 후보 제거) 중 문제 유형에 맞는 도구를 선택하고, 증명 논리의 빠진 조건을 식별할 수 있다.
- 시간·공간 복잡도와 입력 상한으로 실행 가능성을 판단할 수 있다.
- 게임 서버의 실시간 Budget, 취소, 근사·사전 계산 전략을 함께 설계할 수 있다.

## 1. 개요

Algorithm 면접의 핵심은 외운 코드를 빠르게 적는 것이 아니다. 모호한 문제를 정확히 모델링하고, 단순한 해법에서 출발해 입력 조건에 맞는 Pattern을 찾고, 정당성과 비용을 설명한 뒤 경계 Case로 검증하는 능력을 보여 주는 것이다.

```text
요구 확인
   ↓
입력·출력·제약 모델링
   ↓
단순 해법과 병목
   ↓
적합한 Pattern·자료구조
   ↓
정당성 + 시간·공간 복잡도
   ↓
구현 + 경계 테스트 + 운영 한계
```

코드가 맞아도 왜 맞는지, 어떤 조건에서 실패하는지 설명하지 못하면 실무 적용 능력을 보여 주기 어렵다.

## 1-1. 쉬운 예시: 조건 기반 Algorithm 선택

```csharp
// 예시: 5노드 Zone Graph, 조건에 따라 Algorithm 선택
int V = 5;
// Edge: (from, to, weight)
var edges = new List<(int from, int to, int weight)>
{
    (0, 1, 4), (0, 2, 1), (2, 1, 2), (1, 3, 1), (3, 4, 3)
};

bool hasNegativeEdge = edges.Any(e => e.weight < 0);
bool allSameWeight   = edges.All(e => e.weight == edges[0].weight);
bool smallGraph      = V <= 300; // Floyd-Warshall O(V³) 허용 기준

if (allSameWeight)
    Console.WriteLine("→ BFS: 무가중 최단 O(V+E)");
else if (!hasNegativeEdge)
    Console.WriteLine("→ Dijkstra: 음수 없는 단일 출발 O((V+E)logV)");
else if (smallGraph)
    Console.WriteLine("→ Floyd-Warshall: 음수 포함 소규모 모든 쌍 O(V³)");
else
    Console.WriteLine("→ Bellman-Ford: 음수 Edge 단일 출발 O(VE)");
// 출력: → Dijkstra: 음수 없는 단일 출발 O((V+E)logV)
```

Edge 가중치 조건(음수 유무, 균일 여부)과 Graph 크기를 순서대로 체크하여 BFS·Dijkstra·Floyd-Warshall·Bellman-Ford 중 하나를 결정한다. 코드를 작성하기 전에 이 분기 논리를 말로 설명하면 면접관에게 설계 사고를 명확히 전달할 수 있다. V=300 기준은 O(V³) 연산이 약 2.7×10⁷으로 한 Tick 내 허용 가능한 상한을 나타낸다.

## 2. 문제를 받으면 먼저 확인할 것

### 입력과 출력

- 입력 크기와 최댓값은 얼마인가?
- 중복, 음수, 정렬 여부가 있는가?
- Graph라면 방향·가중치·Cycle·연결 여부는?
- 결과는 하나인가, 모든 결과인가, 개수·최댓값인가?
- 같은 최적값이 여러 개면 어떤 결과를 반환하는가?

### 실행 조건

- 한 번 실행하는가, Query가 반복되는가?
- 원본 데이터를 변경해도 되는가?
- 정확한 최적해가 필요한가, 근사가 허용되는가?
- Memory와 시간 제한은 얼마인가?
- Online Streaming인가, 전체 입력을 미리 볼 수 있는가?

이 질문 하나가 Algorithm을 바꾼다. 정렬되지 않은 데이터의 단일 조회는 선형 탐색이 낫지만 반복 Query라면 정렬·Index 구축 비용을 지불할 수 있다.

## 3. 단순 해법에서 시작하기

먼저 가장 명확한 Brute Force를 설명한다.

```text
모든 후보를 생성하고 조건 검사
시간 O(n²), 공간 O(1)
입력 n=10⁵에서는 불가능
→ 어떤 계산이 반복되는지 찾음
```

단순 해법은 정당성 기준과 최적화 방향을 제공한다. 바로 복잡한 해법으로 뛰어들면 누락된 조건을 놓치기 쉽다.

병목을 분류한다.

- 같은 Subproblem 반복 → DP·Memoization
- 매번 전체 구간 재계산 → Prefix Sum·Sliding Window
- 정렬된 후보를 선형 탐색 → Binary Search
- 모든 Pair 비교 → Hash·정렬·Two Pointer·공간 분할
- 최우선 후보 반복 검색 → Heap
- 불가능한 조합까지 탐색 → Backtracking Pruning

## 4. 복잡도와 입력 상한 연결

Big-O는 입력 증가에 따른 성장률이다. 실제 실행 횟수를 거칠게 계산해 현실성을 확인한다.

| 복잡도 | n이 커질 때 | 대표 Pattern |
|---|---|---|
| O(1) | 일정 | Index·Top 조회 |
| O(log n) | 매우 완만 | Binary Search |
| O(n) | 선형 | BFS 일부, Two Pointer |
| O(n log n) | 정렬 수준 | Sorting, Heap 기반 |
| O(n²) | 빠르게 증가 | 모든 Pair, 일부 DP |
| O(2ⁿ), O(n!) | 작은 n만 가능 | Subset·Permutation 탐색 |

복잡도는 전제를 포함해 말한다.

- Dynamic Array Push: 분할 상환 O(1), 단일 재할당 O(n)
- Hash 조회: 좋은 분포에서 평균 O(1)
- BFS: 인접 리스트에서 O(V+E)
- Dijkstra: 인접 리스트와 Binary Heap에서 O((V+E)logV)
- DP: 상태 수×상태당 전이 수

문자열 Hash, 비교 함수, 결과 k개 출력과 사전 정렬 비용도 포함한다.

## 5. 정당성을 설명하는 도구

### Loop Invariant

반복 시작·종료마다 참인 성질을 정의한다. Binary Search에서는 답이 남은 구간에 존재한다는 불변식, Dijkstra에서는 확정 Vertex의 거리가 최단이라는 불변식을 사용한다.

### 교환 논증

Greedy 선택을 포함하지 않는 최적해를 Greedy 선택을 포함하도록 교환해도 결과가 나빠지지 않음을 보인다. Activity Selection과 MST의 Cut Property가 예다.

### 귀납·점화식

DP 상태가 작은 상태의 올바른 답으로 구성됨을 보인다. Base Case가 맞고 모든 전이가 가능한 마지막 선택을 빠짐없이 다룬다는 식으로 설명한다.

### 후보 제거 근거

Binary Search·Two Pointer·Pruning에서는 버린 후보에 답이 없음을 증명한다. “이 방향이 더 좋아 보여서”가 아니라 정렬·단조성·상한 조건을 근거로 든다.

## 6. 탐색 Pattern 선택

### BFS와 DFS

비가중 최소 Hop은 BFS가 적합하다. Queue가 거리 Level을 보존한다. DFS는 한 경로를 깊게 탐색해 Cycle, 연결 요소, 위상 정렬에 자연스럽다.

인접 리스트에서 둘 다 O(V+E), 방문과 Queue·Stack은 O(V)다. BFS는 넓은 Frontier, DFS는 깊은 Stack에서 Memory가 커질 수 있다.

### Backtracking

조합·순열과 제약 문제에서 Choose→Recurse→Undo를 반복한다. 안전한 Pruning으로 실제 탐색을 줄이지만 최악 `2ⁿ`·`n!`은 남을 수 있다.

### Binary Search

정렬 배열 또는 단조 Predicate에서 후보 절반을 제거한다. Lower·Upper Bound와 Answer Search에서 구간 불변식과 Overflow를 확인한다.

## 7. Greedy·DP·Backtracking 구분

| 질문 | Greedy | DP | Backtracking |
|---|---|---|---|
| 결정 방식 | 현재 선택 확정 | 상태별 결과 비교 | 선택 후 필요하면 Undo |
| 정당성 | Greedy Choice 증명 | 점화식·최적 부분 구조 | 모든 후보+안전한 Pruning |
| 대표 비용 | 흔히 O(n log n) | 상태×전이 | 최악 지수 |
| 위험 | 반례 | 상태 폭발 | Tail Latency |

Greedy는 코드가 짧아도 선택 증명이 어렵다. DP는 미래 결정에 필요한 최소 상태가 핵심이다. Backtracking은 입력이 작거나 강한 Pruning이 있을 때 사용하며 Online에는 Budget을 둔다.

예를 들어 0/1 Knapsack은 가치/무게 Greedy가 실패할 수 있고 O(nW) DP가 가능하다. W가 너무 크면 Pseudo-polynomial 비용도 실행 불가능하므로 다른 근사·제약이 필요하다.

## 8. Graph Algorithm 선택표

| 문제 조건 | Algorithm | 대표 복잡도 | 핵심 제한 |
|---|---|---:|---|
| 무가중 최단 | BFS | O(V+E) | 동일 Edge 비용 |
| 0·1 가중치 | 0-1 BFS | O(V+E) | Weight 0 또는 1 |
| 음수 없는 단일 시작 | Dijkstra | O((V+E)logV) | 음수 Edge 불가 |
| 음수 Edge 단일 시작 | Bellman-Ford | O(VE) | 큰 Graph에 비쌈 |
| DAG 최단·최장 | 위상 순서 Relax | O(V+E) | Cycle 없음 |
| 모든 쌍·작은 Graph | Floyd-Warshall | O(V³) | O(V²) Memory |
| 최소 전체 연결 | MST | O(ElogE) 등 | 무방향 연결 Graph |

MST와 최단 경로를 혼동하지 않는다. MST는 전체 선택 Edge 합, Dijkstra는 한 시작점에서 각 Vertex 거리라는 서로 다른 목적 함수다.

## 9. 최단 경로 면접 답변 구조

1. Graph 방향과 Weight 조건을 확인한다.
2. 목적이 단일 시작·단일 목표·모든 쌍인지 확인한다.
3. Algorithm과 핵심 상태를 정의한다.
4. 언제 거리가 확정되는지 설명한다.
5. Relaxation과 경로 Parent를 설명한다.
6. 시간·공간과 실패 조건을 말한다.

Dijkstra는 목적지를 처음 발견했을 때가 아니라 최신 최소 거리로 Pop될 때 확정된다. Bellman-Ford는 V-1번 Relax 후 추가 갱신으로 도달 가능한 음수 Cycle을 찾는다. Floyd는 중간 Vertex k가 가장 바깥 Loop인 DP다.

## 10. 정렬·Pointer·Window Pattern

정렬은 순서를 만드는 O(n log n) 사전 비용으로 이후 탐색을 단순화한다.

- Binary Search: 값·경계 O(log n)
- Two Sum: 양끝 Pointer O(n)
- Interval Scheduling: 종료 시각 Greedy
- Kruskal: Edge Weight 정렬

Sliding Window는 연속 구간 상태를 재사용한다. 양수 합처럼 확장·축소에 따른 조건 변화가 단조로워야 한다. 음수가 있으면 Prefix Sum+Hash Map, Monotonic Deque 등 다른 해법이 필요할 수 있다.

중첩 while이어도 Left와 Right가 각각 최대 n번 이동하면 O(n)이다. 정당성에는 Pointer가 버린 후보가 답이 될 수 없는 이유를 포함한다.

## 11. 경계 Case Checklist

### 배열·문자열

- 빈 입력, 원소 하나
- 중복·모든 값 동일
- 음수·0·최댓값·Overflow
- 답이 처음·마지막·없음
- Unicode와 문자열 길이 단위

### Graph

- 단일 Vertex·Edge 없음
- 불연결 Component
- Self Loop·중복 Edge
- 방향성·음수·0 Weight
- Cycle·음수 Cycle
- 여러 최적 경로와 Tie-break

### 재귀·DP

- Base Case와 도달 불가능 상태
- 최대 깊이와 Stack Overflow
- INF 덧셈·경우의 수 Overflow
- 미계산 Sentinel과 실제 값 충돌
- 복구 누락·공간 최적화 후 경로 복원

손으로 작은 Example을 Trace하고 무작위 작은 입력에서는 Brute Force 결과와 비교하는 Property Test가 유용하다.

## 12. 구현 중 말해야 할 것

면접에서는 침묵한 채 코딩하기보다 중요한 결정을 짧게 설명한다.

- “반열린 구간 `[left,right)`로 유지하겠습니다.”
- “방문은 중복 Enqueue를 막기 위해 넣을 때 표시하겠습니다.”
- “거리 합 Overflow를 막기 위해 64-bit를 사용하겠습니다.”
- “이 DP 상태는 앞 i개와 남은 Capacity를 의미합니다.”
- “이 Pruning은 남은 최댓값을 모두 더해도 Best를 못 넘을 때만 적용합니다.”

구현 후에는 복잡도와 테스트를 다시 말한다. Library API가 어떤 동작·복잡도를 보장하는지도 확인한다.

## 13. 게임 서버 실전 시나리오

### NPC 경로 탐색

Grid 이동 비용이 모두 같으면 BFS, 다르면 Dijkstra 또는 A*를 검토한다. 동적 장애물에는 Navigation Snapshot Version을 사용한다. 요청을 Worker로 분리하고 방문 Node·시간 Budget과 기존 경로 유지 Fallback을 둔다.

### Matchmaking

후보 조합의 전역 최적은 지수 탐색이 될 수 있다. 역할·Region·MMR로 후보를 먼저 줄이고 유망한 조합부터 Backtracking한다. Budget을 넘으면 Best-so-far를 사용하거나 조건을 단계적으로 완화한다. 품질·대기 시간·Starvation을 함께 측정한다.

### Timer와 최근 Window

다음 만료는 Min Heap, 최근 60초 요청 수는 Timestamp Queue·Sliding Window가 적합하다. 같은 “시간” 데이터라도 필요한 연산이 다르다. 무효 Timer 정리와 Rate Window의 Clock·경계 정책을 정한다.

### 콘텐츠 사전 계산

작은 고정 Zone Graph의 모든 쌍 거리는 Floyd-Warshall, Quest 의존은 Topological Sort로 Build 시 검증할 수 있다. Runtime을 빠르게 만드는 대신 콘텐츠 Version과 재계산·원자 교체가 필요하다.

## 14. 실시간 Budget과 Fallback

이론상 종료하는 Algorithm도 한 Tick 안에 끝난다는 보장은 없다.

```text
입력 상한
  + 방문 Node 상한
  + Wall-clock Budget
  + Cancellation
          ↓ 초과
Defer / Partial / Approximate / Cached / Reject
```

실시간 서버에서는 평균보다 p99와 최대 지연이 중요하다. Algorithm 작업을 작은 단위로 나눠 여러 Tick에 이월하려면 상태를 재개 가능하게 저장한다. 취소 시 공유 상태를 남기지 않게 한다.

최적해가 늦게 오는 것보다 제한 시간 안의 충분히 좋은 해가 나을 수 있다. 다만 근사 품질과 실패 의미를 API 계약으로 명시한다.

## 15. 사전 계산과 Cache

Query가 많고 입력이 거의 고정이면 사전 계산으로 비용을 이동할 수 있다.

- Floyd Distance Matrix
- Level Threshold·Prefix Sum
- Navigation Landmark
- DP Lookup Table

대가로 Memory, Build 시간, Version과 무효화 비용이 생긴다. Cache Key에 Map·콘텐츠 Version, 이동 능력·조건을 빠뜨리면 다른 문제의 답을 재사용한다.

Cache Hit만 보지 않고 Miss 계산 비용, Stale 허용 여부, Warm-up과 Memory 상한을 측정한다.

## 16. 성능 측정

Algorithm별 내부 작업 지표가 원인 진단에 유용하다.

- BFS·Dijkstra: 방문 Vertex, Relax, Queue Peak
- Backtracking: 탐색 Node, Prune 이유, 최대 깊이
- DP: 계산 상태 수, Table Byte, Cache Hit
- Sorting·MST: 정렬 시간, 비교 수, Union 성공 수
- Window: 활성 Entry, 제거 수, Client State 수

입력 크기별 처리량, p50·p95·p99·최대, Allocation과 Memory Peak를 기록한다. Big-O가 같아도 Cache·Allocation·Lock에 따라 실제 결과가 다르다.

## 17. 자주 하는 오해

- **문제 이름을 보면 Algorithm이 자동으로 정해진다**: 입력 조건과 목적 함수를 먼저 확인한다.
- **정답 Example을 통과하면 정당성이 증명된다**: 불변식·교환·점화식 설명이 필요하다.
- **Precompute는 Runtime 비용을 없앤다**: Memory와 갱신·Version 비용으로 이동한다.
- **최적해를 반드시 끝까지 계산해야 한다**: 제품 요구에 따라 Budget과 근사를 설계할 수 있다.
- **면접에서 Brute Force를 말하면 능력 부족으로 보인다**: Brute Force는 정당성 기준과 최적화 방향을 제시하는 출발점이며, 바로 최적 해법으로 뛰어들면 조건 누락 위험이 있다.
- **Algorithm을 설명할 때 코드가 없으면 답이 아니다**: 정당성과 복잡도를 논리로 설명한 뒤 코드를 짜는 순서가 더 설득력 있다. 코드만 있고 증명이 없으면 오류를 찾기 어렵다.
- **경계 Case 테스트는 구현 완료 후 생각해도 된다**: 경계 Case(빈 입력, 단일 Vertex, Cycle, Overflow)는 설계 단계에서 Algorithm 선택과 구현 방식을 바꾸는 조건이다.
- **입력 크기가 작으면 Algorithm 선택이 중요하지 않다**: n=10²에서 O(n³)과 O(n log n)은 차이가 작지만, 게임 서버에서 같은 코드가 n=10⁵ 입력에도 재사용될 때 설계 부채가 된다.
- **면접에서 가장 빠른 Algorithm을 찾는 것이 목표다**: 입력 조건·실행 환경·구현 복잡도를 함께 고려한 최선의 트레이드오프를 설명하는 것이 목표다.

## 18. 면접 질문

### Q1. 게임 서버 Matchmaking 시스템에서 플레이어 조합의 전역 최적을 구해야 하는데, 입력 수가 최대 200명이라면 어떤 Algorithm 전략을 선택하고 그 이유는 무엇인가요?

200명 조합의 전역 최적은 지수 탐색이므로 직접 계산은 불가능합니다. 먼저 역할·Region·MMR로 후보를 필터링해 유망 후보만 Backtracking으로 탐색하고, 방문 Node와 Wall-clock Budget 상한을 두어 초과 시 Best-so-far를 반환합니다. 또는 상태를 MMR 구간으로 이산화해 DP로 근사 최적을 구하거나, 반복 Query라면 유사 조합 결과를 Cache하고 콘텐츠 Version이 바뀔 때 무효화합니다. 정확도·대기 시간·Starvation을 메트릭으로 측정해 전략을 조정합니다.

### Q2. MMR 기반 Matchmaking 로직을 Greedy로 구현했더니 대기열 후반부 플레이어가 계속 매칭에서 밀리는 Starvation이 발생했습니다. 이 문제의 원인이 Greedy 선택에 있다고 판단했을 때 DP나 Backtracking으로 전환하는 기준과 트레이드오프는 무엇인가요?

Greedy는 현재 MMR 차이가 가장 작은 후보를 즉시 확정하므로 오래 기다린 플레이어의 대기 시간 가중치를 목적 함수에 반영하기 어렵습니다. 이 경우 Greedy 선택이 Starvation을 구조적으로 만드는 것입니다. DP로 전환하려면 상태를 (대기열 슬롯, 누적 대기 시간, MMR 구간)으로 정의하고 대기 패널티를 포함한 점화식을 세워야 합니다. 그러나 플레이어 수가 200명 이상이 되면 상태 폭발이 발생하므로, 실무에서는 대기 시간이 임계치를 넘는 플레이어에게 MMR 허용 범위를 단계적으로 확대하는 완화 전략을 Greedy 위에 레이어로 추가하는 방식이 많습니다. Backtracking은 Tick Budget 안에서 Best-so-far를 반환하는 방식으로 사용하되, 완화 단계마다 탐색 공간이 달라지므로 Budget 초과 Fallback 정책을 API 계약으로 명시해야 합니다. 정확도·대기 시간·Starvation 비율을 메트릭으로 측정해 어느 전략이 실제 운영 목표를 충족하는지 검증합니다.

### Q3. Zone 기반 MMORPG에서 NPC 경로 탐색 장애가 보고됐습니다. Zone A에서는 경로가 정상이지만 Zone B에서는 Dijkstra가 목적지에 도달하지 못합니다. Graph 알고리즘 선택 관점에서 원인 후보를 어떻게 좁히고 어떤 Algorithm으로 교체하거나 보완하겠습니까?

먼저 Zone B의 Graph 구조를 확인합니다. Dijkstra는 음수 Edge가 있으면 오동작하므로, 경사 이동 비용이나 버프/디버프 기반 Edge 가중치에 음수가 섞였는지 점검합니다. 음수가 없다면 불연결 Component 여부를 확인합니다. Navigation Mesh 갱신 중 Edge가 누락됐거나 동적 장애물 처리로 일부 Vertex가 제거된 상태일 수 있습니다. 또한 Dijkstra의 Priority Queue에서 이미 확정된 Vertex를 재처리하는 버그로 거리가 INF로 남는 경우도 있으므로, 방문 완료 Check 로직을 검토합니다. 음수 Edge가 확인되면 Bellman-Ford로 교체하거나 음수 비용 Edge를 제거·재설계합니다. 불연결이라면 Zone 진입 가능 여부를 사전 검증하는 연결성 Check를 추가합니다. 교체 전후 동일 입력에서 경로 길이와 Vertex 방문 수를 비교하는 Regression Test를 실행하고, Tick당 처리 Node 수와 p99 지연을 모니터링합니다.

### Q4. 팀원이 구현한 Greedy 스케줄링 코드가 일부 입력에서 최적이 아닌 결과를 냈습니다. Greedy 선택의 정당성을 어떻게 검증하고, 반례를 찾는 접근 방식은 무엇인가요?

교환 논증으로 검증합니다. Greedy 선택을 포함하지 않는 최적해를 가정하고, 해당 선택을 Greedy 선택으로 교환했을 때 결과가 나빠지지 않음을 보입니다. 나빠진다면 Greedy가 틀린 것입니다. 반례 탐색은 n=2~4의 소규모 입력에서 Brute Force 결과와 Greedy 결과를 비교하는 Property Test로 시작합니다. 반례가 나오면 어떤 선택 조건이 빠졌는지 확인하고, 조건을 보완하거나 DP로 전환 여부를 판단합니다.

### Q5. 실시간 서버에서 지수 Algorithm을 어떻게 다루나요?

후보와 깊이 상한, 강한 Pruning과 유망 순서를 사용합니다. Node·시간 Budget과 Cancellation을 두고 초과 시 Best-so-far, 근사, 이월·거절 같은 Fallback을 정의합니다.

### Q6. Zone 간 최단 이동 경로를 런타임마다 Dijkstra로 계산하다가 서버 CPU가 급등하는 장애가 발생했습니다. 사전 계산으로 전환하기로 결정했다면 구체적으로 무엇을 사전 계산하고, 어떤 조건에서 이 Cache를 무효화하겠습니까?

Zone 간 Graph가 콘텐츠 패치 외에 거의 바뀌지 않는다면 Floyd-Warshall로 모든 쌍 최단 거리 Matrix를 빌드 타임에 계산해 메모리에 올립니다. 런타임 조회는 O(1)이 되어 CPU 급등 문제를 해결할 수 있습니다. 무효화 조건은 Map 콘텐츠 Version 변경(Zone 추가·삭제·Edge 비용 변경)과 이동 능력(비행·수중 이동 등) 조건이 달라지는 캐릭터 상태 변화입니다. Cache Key에 Map Version과 이동 조건 Hash를 포함하지 않으면 다른 문제의 답을 재사용하게 됩니다. 운영 관점에서는 Matrix 크기(Zone 수²×거리 값 Byte), Warm-up 시간, 패치 배포 시 재계산 시간을 측정해 허용 가능한지 확인합니다. Zone 수가 수천 개로 늘면 O(V³) 빌드 비용과 O(V²) 메모리가 문제가 되므로, 이 경우에는 Landmark 기반 근사 계산으로 전환하고 정확도 허용 범위를 API 계약으로 명시합니다.

### Q7. 게임 서버 경로 탐색 Algorithm을 교체했는데 일부 Zone에서 경로가 반환되지 않는 장애가 발생했습니다. 원인 후보를 어떻게 좁히고 검증하나요?

먼저 경로가 반환되지 않는 Zone의 공통 특성을 확인합니다. 불연결 Component, 음수 Edge, 자기 Loop, Cycle 여부를 점검합니다. 다음으로 해당 Zone의 입력을 최소 재현 케이스로 줄여 Algorithm을 직접 실행하고 방문 순서·Relaxation 결과를 로그로 확인합니다. 경계 Case(단일 Vertex, 목적지가 시작점과 동일, INF 초기값)를 순서대로 테스트합니다. 교체 전 Algorithm과 동일 입력에서 출력을 비교하는 Regression Test도 실행합니다.

## 19. 예상 꼬리질문

- Dynamic Array Push가 분할 상환 O(1)이라는 것을 게임 서버 엔티티 Pool 설계에서 활용한다면 재할당 급등 구간을 어떻게 예측하고 사전 할당 전략을 세우겠습니까?
  > 최대 엔티티 수를 운영 데이터로 파악해 initialCapacity로 사전 예약한다. 재할당은 Capacity가 2배씩 늘어날 때 발생하므로 최댓값의 다음 거듭제곱으로 미리 예약하면 재할당을 0회로 만들 수 있다. Pool 크기를 고정하고 초과 시 확장을 금지하거나 별도 Pool로 오버플로우를 처리해 Spike 자체를 제거한다.
- Matchmaking Queue에서 BFS 방식으로 가장 먼저 발견된 조합을 확정했더니 MMR 편차가 큰 매칭이 자주 발생합니다. Dijkstra 방식으로 전환해 가중 최적 조합을 찾을 때 확정 시점 기준이 어떻게 바뀌고 어떤 추가 비용이 생기나요?
  > BFS는 Hop 수 기준으로 처음 도달한 조합을 확정하지만, Dijkstra는 MMR 편차 합을 Edge 비용으로 정의하고 Priority Queue에서 최소 비용 조합이 Pop될 때 확정한다. 추가 비용은 Priority Queue의 O(log n) 삽입·삭제이며 전체 복잡도가 O((V+E) log V)로 증가한다. 실시간 Matchmaking에서는 확정 시점 지연이 대기 시간에 영향을 주므로 Budget을 함께 설정한다.
- NPC 순찰 경로 탐색에 Binary Search를 응용해 도달 가능 거리 임계값을 구하려 합니다. 탐색 대상 Predicate가 단조성을 만족하는지 어떻게 검증하고, 만족하지 않을 때 대안 접근은 무엇인가요?
  > 임계값이 커질수록 도달 가능 Zone 수가 단조 증가하면 Predicate가 단조다. 이를 여러 임계값 샘플에서 실제 도달 가능 Zone 수를 계산해 증가 여부를 확인한다. 지형 비용이 비선형이거나 음수 구간이 있으면 단조성이 깨질 수 있다. 단조성이 없으면 Binary Search 대신 가능한 임계값을 선형 탐색하거나 Dijkstra로 각 거리 임계값에서 도달 가능 집합을 직접 계산한다.
- Zone 연결 Graph에서 MST로 서버 간 통신 비용을 최소화하는 것과 Dijkstra로 특정 Zone 간 지연을 최소화하는 것이 실제 운영에서 충돌하는 사례를 설명하고, 어느 기준을 우선할지 판단하는 방법을 설명해 주세요.
  > MST는 전체 선택 Edge 합을 최소화하므로 중간 경유 Zone을 거치더라도 총비용이 낮은 연결을 선택한다. Dijkstra는 특정 Zone 쌍 간 직접 지연을 최소화하므로 MST에서 제외된 직접 연결 Edge가 Dijkstra 최단 경로에 포함될 수 있다. 플레이어 이동처럼 특정 Zone 간 응답 시간이 핵심이면 Dijkstra 기준을 우선하고, 인프라 회선 비용처럼 전체 연결 비용을 줄이는 것이 목표면 MST를 기준으로 한다. 두 기준이 모두 중요하면 MST로 초기 연결을 구성한 뒤 핵심 경로에 추가 Direct Link를 두는 방식을 고려한다.
- Timeout 후 부분 결과의 정확성을 어떻게 계약하나요?
  > API 응답에 `isComplete: false` 플래그와 함께 "현재까지 탐색한 최선 결과로 품질을 보장하지 않는다"는 계약을 명시한다. Best-so-far의 품질 하한(예: 최적해 대비 MMR 편차 20% 이내)을 SLA로 정의하고, 품질이 하한 미만이면 결과 대신 재시도 응답을 반환하는 정책을 둔다.
- 게임 서버에서 Algorithm 선택 후 실제 성능이 기대와 다를 때 가장 먼저 측정하는 지표는 무엇인가요?
  > 실제 입력 크기 분포와 최댓값을 먼저 확인한다. Big-O 분석은 입력 상한을 가정하므로 운영 실제값과 다를 수 있다. 그 다음 p99 지연, CPU 프로파일러로 핫 코드 비율, Cache Miss 횟수, Allocation 빈도 순으로 측정한다. Algorithm 차수 문제인지 I/O·Lock·Allocation 문제인지 구분해야 개선 방향이 달라진다.
- Matchmaking에서 Budget 초과로 Best-so-far를 반환했는데 플레이어 불만이 급증했습니다. 근사 품질의 허용 하한을 정하고 API 계약으로 명시하는 방법은 무엇인가요?
  > 플레이어 불만 데이터와 MMR 편차를 상관 분석해 허용 가능한 최대 편차 임계값을 정한다. 예를 들어 최적해 대비 MMR 편차 10% 이내를 허용 하한으로 설정하고, 이를 초과하는 Best-so-far는 반환하지 않고 대기 Cycle로 이월한다. API 응답 스키마에 매칭 품질 점수와 `isApproximate` 플래그를 포함해 클라이언트가 결과를 어떻게 처리할지 결정할 수 있도록 계약한다.

## 20. 30초 모범답변

> Algorithm 문제는 조건을 먼저 명확히 하고 Brute Force와 병목에서 시작합니다. 정렬·단조성, 반복 상태, Graph 가중치 같은 근거로 Pattern을 선택하고 불변식·교환 논증·점화식으로 정당성을 설명합니다. 시간은 입력 상한과 상태·전이 수로, 공간은 Stack과 보조 구조까지 분석합니다. 게임 서버에서는 최악 입력과 p99를 기준으로 Budget, 취소, Cache와 Fallback도 함께 설계합니다.

## 21. 1~2분 확장답변

> 먼저 입력 크기, 정렬·중복·음수, Graph 방향·가중치와 원하는 결과를 확인합니다. 단순 해법을 제시해 병목을 찾고, 무가중 최단은 BFS, 음수 없는 가중 최단은 Dijkstra, 반복 부분 문제는 DP, 안전한 지역 선택은 Greedy, 조합 제약은 Backtracking처럼 조건에 맞는 Pattern을 선택합니다.
>
> 다음으로 왜 맞는지를 설명합니다. Binary Search는 답이 구간에 남는 불변식, Greedy는 교환 논증, DP는 상태와 점화식, 최단 경로는 Relaxation과 확정 조건을 사용합니다. 복잡도에는 사전 정렬, 결과 출력, 재귀 Stack과 Memory를 포함합니다. 구현 후 빈 입력, 중복, Overflow, Cycle·도달 불가와 최대 입력을 테스트합니다. 게임 서버에서는 이론적 최적해만 보지 않고 방문 Node와 Wall-clock Budget, Cancellation, Best-so-far·근사·Cache Fallback, Map·콘텐츠 Version과 p99 지연까지 설계합니다.

## 22. 핵심 요약

- 입력·출력·크기·정렬·중복·가중치 조건을 먼저 확인한다.
- Brute Force는 정당성 기준과 최적화할 반복 작업을 보여 준다.
- Pattern 이름이 아니라 적용 전제와 목적 함수로 Algorithm을 선택한다.
- 불변식·교환 논증·점화식·단조성으로 정당성을 설명한다.
- 시간에는 상태·전이·정렬·출력, 공간에는 Stack·Table·Queue를 포함한다.
- Graph는 Weight 부호, 시작점 수, 모든 쌍 여부가 선택을 결정한다.
- Greedy·DP·Backtracking은 결정 확정 방식과 증명이 다르다.
- 경계·Overflow·Cycle·도달 불가·여러 정답을 테스트한다.
- 실시간 서버에는 입력·Node·시간 Budget, 취소와 Fallback이 필요하다.
- 사전 계산은 Runtime 비용을 Memory·Version·무효화 비용으로 이동한다.

## 한 줄 정리

> 좋은 Algorithm 답변은 Pattern 이름이 아니라 조건, 정당성, 비용과 운영 실패 한계를 하나의 논리로 연결한다.
