---
difficulty: 4
reading_time: 30분
interview_frequency: 5
importance: 5
---

# 12. Algorithm 종합면접

> 게임 서버·백엔드 개발자를 위한 CS 면접 교재

## 학습 목표

- 문제 조건을 Algorithm Pattern과 연결하는 과정을 설명할 수 있다.
- 해법의 정당성을 불변식·교환 논증·점화식으로 설명할 수 있다.
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
- **Big-O가 같으면 실제 성능도 같다**: Cache, 상수, I/O와 Allocation이 다르다.
- **Dijkstra는 모든 가중 Graph에 가능하다**: 음수 Edge에서 실패한다.
- **Greedy는 가장 큰 값을 고르는 방식이다**: 안전한 선택 증명이 핵심이다.
- **DP는 재귀에 Cache를 붙이는 것이다**: 상태·전이 설계가 핵심이다.
- **Pruning을 하면 Backtracking이 다항 시간이 된다**: 최악 지수는 남을 수 있다.
- **Precompute는 Runtime 비용을 없앤다**: Memory와 갱신·Version 비용으로 이동한다.
- **최적해를 반드시 끝까지 계산해야 한다**: 제품 요구에 따라 Budget과 근사를 설계할 수 있다.

## 18. 면접 질문

### Q1. Algorithm 문제를 해결하는 순서를 설명해 주세요.

입력·출력과 크기, 정렬·중복·가중치 조건을 확인합니다. 단순 해법과 복잡도를 제시하고 반복 계산이나 단조성에서 최적화 Pattern을 찾습니다. 정당성과 시간·공간을 설명한 뒤 경계·최악 입력으로 검증합니다.

### Q2. Greedy, DP, Backtracking을 어떻게 구분하나요?

현재 선택을 확정해도 된다는 증명이 있으면 Greedy, 같은 상태가 반복되고 상태별 최적값을 비교하면 DP, 모든 선택을 탐색하되 불가능한 Branch를 복구하며 자르면 Backtracking입니다.

### Q3. Graph 최단 경로 Algorithm을 어떻게 선택하나요?

Weight가 모두 같으면 BFS, 음수 없는 가중치는 Dijkstra, 음수 Edge는 Bellman-Ford, 작은 Graph의 모든 쌍은 Floyd-Warshall을 검토합니다. DAG라면 위상 순서 Relaxation이 O(V+E)입니다.

### Q4. 정당성은 어떻게 설명하나요?

반복 불변식, 교환 논증, DP 점화식과 귀납, 후보 제거의 단조성 중 문제에 맞는 도구를 사용합니다. 버린 후보에 답이 없고 종료 상태가 요구 답임을 설명합니다.

### Q5. 실시간 서버에서 지수 Algorithm을 어떻게 다루나요?

후보와 깊이 상한, 강한 Pruning과 유망 순서를 사용합니다. Node·시간 Budget과 Cancellation을 두고 초과 시 Best-so-far, 근사, 이월·거절 같은 Fallback을 정의합니다.

### Q6. 사전 계산을 선택하는 기준은 무엇인가요?

입력이 거의 고정이고 Query가 많아 Build 비용을 분할 상환할 수 있을 때 고려합니다. Matrix·Table Memory, 변경 빈도, Version·무효화와 Warm-up 비용을 함께 비교합니다.

### Q7. 구현 후 무엇을 검증하나요?

빈 입력, 경계·중복·Overflow, 도달 불가·Cycle과 여러 정답을 테스트합니다. Brute Force와 작은 Random Case를 비교하고 실제 최대 입력에서 시간·Memory와 p99를 측정합니다.

## 19. 예상 꼬리질문

- 평균·최악·분할 상환 복잡도는 어떻게 다른가요?
- BFS와 Dijkstra의 확정 시점은 어떻게 다른가요?
- Binary Search와 Sliding Window에 필요한 단조성은 무엇인가요?
- DP 공간 최적화가 경로 복원에 어떤 영향을 주나요?
- MST와 최단 경로 Tree는 어떻게 다른가요?
- 위상 정렬 결과의 유일성은 어떻게 판단하나요?
- Timeout 후 부분 결과의 정확성을 어떻게 계약하나요?

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
