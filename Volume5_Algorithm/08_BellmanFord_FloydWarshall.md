---
difficulty: 4
reading_time: 30분
interview_frequency: 4
importance: 4
---

# 08. Bellman-Ford와 Floyd-Warshall


## 학습 목표

- 게임 경제 시스템 Exchange 그래프에서 음수 Cycle이 의심될 때, Bellman-Ford V번째 Relaxation 결과로 Cycle 존재 여부를 진단하고 서버 긴급 조치 순서를 제시할 수 있다.
- Zone Graph가 콘텐츠 업데이트로 변경될 때, Floyd-Warshall 사전 계산 Matrix를 점진적으로 무효화할지 전체 재계산할지 판단 기준을 제시할 수 있다.
- 단일 시작점과 모든 쌍 최단 경로 요구, 음수 Edge 유무, Graph 크기와 변경 빈도를 함께 보고 Bellman-Ford·Floyd-Warshall·Dijkstra 중 적합한 Algorithm을 선택할 수 있다.
- 경로 복원·INF Overflow·Precompute Matrix의 Version 불일치 상황에서 각 위험 요인을 식별하고 안전한 처리 방침을 결정할 수 있다.

## 1. 개요

Bellman-Ford는 음수 Edge가 있을 수 있는 Graph에서 한 시작점으로부터 최단 거리를 구하고, 시작점에서 도달 가능한 음수 Cycle을 탐지한다. Floyd-Warshall은 모든 Vertex 쌍의 최단 거리를 Dynamic Programming으로 구한다.

```text
Bellman-Ford
start → 모든 Edge를 V-1번 Relax → 한 시작점 dist[]

Floyd-Warshall
모든 (i,j) 거리 → 중간 Vertex k를 하나씩 허용 → dist[][]
```

두 Algorithm 모두 음수 Edge를 처리할 수 있지만 목적과 비용이 다르다. Bellman-Ford는 O(VE), Floyd-Warshall은 O(V³) 시간과 O(V²) 공간이 필요하다.

## 2. 쉬운 예시 — Bellman-Ford 3노드 그래프

아래 그래프에서 `S` → `B`의 최단 거리를 Bellman-Ford로 구한다.

```text
S --6--> A
S --4--> B
A --(-3)--> B
```

Edge 목록: `(S→A, 6)`, `(S→B, 4)`, `(A→B, -3)`
초기: `dist[S]=0, dist[A]=INF, dist[B]=INF`

**1회 Relaxation**

| Edge | 조건 | 결과 |
|------|------|------|
| S→A(6) | 0+6 < INF | dist[A] = 6 |
| S→B(4) | 0+4 < INF | dist[B] = 4 |
| A→B(-3) | 6+(-3)=3 < 4 | dist[B] = 3 |

V-1=2번이 필요하지만 2회 Pass에서 갱신이 없으므로 조기 종료한다.
최종 결과: `dist[A]=6, dist[B]=3` — S→A→B 경로가 최단 경로.

```csharp
// 3노드 Bellman-Ford 동작 확인 예제
int[] dist = { 0, int.MaxValue, int.MaxValue }; // S=0, A=1, B=2
int[][] edges = { new[]{0,1,6}, new[]{0,2,4}, new[]{1,2,-3} };

for (int i = 1; i <= 2; i++) // V-1 = 2회
{
    bool changed = false;
    foreach (var e in edges)
    {
        if (dist[e[0]] == int.MaxValue) continue;
        long cand = (long)dist[e[0]] + e[2];
        if (cand < dist[e[1]])
        {
            dist[e[1]] = (int)cand;
            changed = true;
        }
    }
    if (!changed) break; // 갱신 없으면 조기 종료
}
// dist[2] == 3 → S→A→B 경로
```

V번째 Relaxation에서도 거리가 줄면 음수 Cycle이 있다는 뜻이다.

## 3. 왜 필요한가

Dijkstra는 음수 Edge가 없는 Graph에서 효율적이지만 음수 Edge가 하나라도 있으면 이미 확정한 거리가 나중에 줄어들 수 있다. Bellman-Ford는 모든 Edge를 반복 Relax해 이러한 변경을 전파한다.

출발점과 목적지가 계속 바뀌는 작은 Graph에서는 매 Query마다 단일 시작점 Algorithm을 실행하는 대신 모든 쌍 거리를 미리 계산할 수 있다. Floyd-Warshall은 구현이 단순하고 Dense Graph에서도 비용이 V에만 의존해 작은 고정 Graph에 유용하다.

선택 전 다음을 확인한다.

- 한 시작점인가, 모든 쌍인가?
- 음수 Edge 또는 음수 Cycle이 가능한가?
- Vertex·Edge 수와 Graph 밀도는 얼마인가?
- Query 횟수와 Graph 변경 빈도는 얼마인가?
- 거리만 필요한가, 실제 경로도 필요한가?

## 4. Bellman-Ford의 Relaxation

`dist[v]`는 현재 발견된 시작점에서 `v`까지 거리의 상한이다.

```text
dist[start] = 0
dist[others] = INF

for edge (u, v, w):
    if dist[u] != INF and dist[u] + w < dist[v]:
        dist[v] = dist[u] + w
        parent[v] = u
```

Edge List의 모든 Edge를 한 번 순회하면 최단 경로에 사용하는 Edge 수가 한 단계 더 긴 경로 정보까지 전파된다. Edge 순서에 따라 한 Pass에서 더 멀리 전파될 수도 있지만 정당성은 최악 기준으로 본다.

```text
S --4--> A ---(-2)---> B --3--> C

초기: S=0, A=B=C=INF
반복 Relaxation으로 S→A→B→C 비용이 전파
```

## 5. 왜 V-1번 반복하는가

음수 Cycle이 없는 Graph의 단순 최단 경로는 같은 Vertex를 반복할 필요가 없다. Vertex를 반복하면 Cycle을 제거해도 비용이 증가하지 않는 더 단순한 경로를 만들 수 있다. Vertex가 V개인 단순 경로의 Edge 수는 최대 V-1개다.

`i`번째 전체 Relaxation 후에는 최대 `i`개의 Edge를 사용하는 최단 경로가 올바르게 반영된다는 불변식을 사용할 수 있다.

```text
0회: 시작점 자신, Edge 0개
1회: Edge 최대 1개인 최단 경로
2회: Edge 최대 2개인 최단 경로
...
V-1회: 모든 단순 최단 경로
```

따라서 V-1번이면 음수 Cycle이 없는 도달 가능한 모든 최단 거리가 계산된다.

## 6. Bellman-Ford 구현과 조기 종료

```csharp
for (int i = 1; i <= vertexCount - 1; i++)
{
    bool changed = false;

    foreach (var edge in edges)
    {
        if (dist[edge.From] == INF)
            continue;

        long candidate = dist[edge.From] + edge.Weight;
        if (candidate >= dist[edge.To])
            continue;

        dist[edge.To] = candidate;
        parent[edge.To] = edge.From;
        changed = true;
    }

    if (!changed)
        break;
}
```

한 Pass에서 갱신이 하나도 없으면 이후 반복에서도 바뀌지 않으므로 조기 종료할 수 있다. 최악 복잡도 O(VE)는 그대로지만 음수 Edge가 적고 거리가 빨리 안정되는 입력에서 실제 시간을 줄인다.

공간은 Edge List O(E), 거리와 Parent O(V)다. Graph가 인접 리스트여도 모든 Edge를 순회할 수 있지만 Bellman-Ford에는 Edge List가 단순하다.

## 7. 음수 Cycle 탐지

V-1번 이후 모든 Edge를 한 번 더 Relax한다. 여전히 거리를 줄일 수 있다면 시작점에서 도달 가능한 음수 Cycle의 영향을 받는다.

```text
A --1--> B
↑       -3
└--1---- C

Cycle A→B→C→A 비용 = -1
Cycle을 돌 때마다 경로 비용 감소
유한한 최단 거리 없음
```

중요한 조건은 시작점에서 Cycle에 도달 가능해야 한다는 것이다. `dist[u] == INF`인 Edge는 검사하지 않으면 다른 불연결 Component의 음수 Cycle을 단일 시작점 결과로 잘못 보고하지 않는다.

Graph 전체의 음수 Cycle 존재 여부가 목적이면 모든 Vertex에 거리 0인 가상 Super Source를 연결하거나, 모든 거리를 0으로 시작하는 방식으로 모든 Component를 도달 가능하게 만들 수 있다.

음수 Cycle로부터 도달 가능한 Vertex들의 거리도 정의되지 않는다. 단순 Boolean 탐지 외에 어떤 목적지가 영향을 받는지 필요하면 추가 Graph 순회로 전파한다.

## 8. Bellman-Ford 경로 복원

Relaxation으로 개선될 때 `parent[v]=u`를 저장하고 목적지에서 역추적한다. 음수 Cycle 영향이 없고 도달 가능할 때만 유한 최단 경로를 복원할 수 있다.

음수 Cycle 자체를 복원하려면 V번째 갱신 Vertex에서 Parent를 V번 따라가 Cycle 내부로 들어간 뒤 다시 같은 Vertex가 나올 때까지 Parent를 추적할 수 있다. Parent 방향은 최단 경로의 역방향이므로 출력 시 뒤집거나 의미를 명확히 한다.

Parent Chain 추적에 방문 표시나 길이 상한을 두지 않으면 잘못된 데이터에서 무한 Loop가 날 수 있다.

## 9. Floyd-Warshall의 상태 정의

Floyd-Warshall은 다음 DP 상태를 사용한다.

```text
D(k)[i][j]
= 중간 Vertex로 {0..k}만 사용할 수 있을 때 i에서 j까지 최단 거리
```

새 중간 Vertex `k`를 허용할 때 최단 경로는 두 경우다.

1. `k`를 거치지 않는 기존 경로
2. `i → k`와 `k → j`를 이어 `k`를 거치는 경로

```text
dist[i][j] = min(
    dist[i][j],
    dist[i][k] + dist[k][j]
)
```

이전 단계와 현재 단계의 Table을 같은 배열에 덮어써도 의존성이 안전해 공간 O(V²)로 구현할 수 있다.

## 10. 초기화

```text
dist[i][i] = 0
직접 Edge i→j가 있으면 dist[i][j] = weight
Edge가 없으면 dist[i][j] = INF
```

같은 두 Vertex 사이에 Edge가 여러 개면 가장 작은 Weight로 초기화한다. 방향 Graph에서는 `dist[i][j]`와 `dist[j][i]`가 다르다.

```csharp
for (int k = 0; k < n; k++)
{
    for (int i = 0; i < n; i++)
    {
        for (int j = 0; j < n; j++)
        {
            if (dist[i, k] == INF || dist[k, j] == INF)
                continue;

            dist[i, j] = Math.Min(
                dist[i, j],
                dist[i, k] + dist[k, j]);
        }
    }
}
```

## 11. Loop 순서가 중요한 이유

중간 Vertex 집합을 단계적으로 늘리는 DP이므로 `k`가 가장 바깥 Loop여야 한다. `i`, `j`, `k` 순서로 단순히 바꾸면 “0부터 k까지의 중간 Vertex를 모두 반영했다”는 불변식이 깨지고 일부 경로가 충분히 전파되지 않을 수 있다.

```text
for k: 이번에 허용할 새 중간 Vertex
  for i: 출발점
    for j: 도착점
```

행렬 곱처럼 세 Loop라서 순서를 자유롭게 바꿀 수 있는 것이 아니다. Cache 최적화로 Blocking을 적용하려면 DP 의존성을 보존하는 검증된 방식이 필요하다.

## 12. Floyd-Warshall 예시

```text
A→B = 4
A→C = 10
B→C = 3
```

초기에는 `dist[A][C]=10`이다. B를 중간 Vertex로 허용하면 다음을 비교한다.

```text
직접 A→C = 10
B 경유 A→B→C = 4+3 = 7

dist[A][C] = 7
```

모든 k 단계가 끝나면 모든 Vertex를 중간에 사용할 수 있으므로 모든 쌍 최단 거리가 완성된다.

시간은 세 중첩 Loop O(V³), 거리 Matrix 공간은 O(V²)다. V가 10배면 시간은 약 1,000배, Memory는 약 100배가 되어 입력 상한을 엄격히 봐야 한다.

## 13. Floyd-Warshall 경로 복원

`next[i][j]`에 i에서 j로 가는 최단 경로의 첫 다음 Vertex를 저장할 수 있다.

초기 직접 Edge에는 `next[i][j]=j`를 둔다. k를 거치는 경로로 개선되면 다음과 같이 갱신한다.

```text
next[i][j] = next[i][k]
```

경로를 출력할 때 i에서 시작해 `next[current][j]`를 반복한다. 도달 불가능이면 next가 없다. 음수 Cycle 영향이나 잘못된 Matrix에서 무한 Loop를 막기 위해 최대 V 수준의 검증 또는 Cycle 탐지를 둔다.

중간 Vertex `via[i][j]=k`를 저장하고 재귀적으로 i→k, k→j를 복원하는 방식도 있다.

## 14. Floyd-Warshall과 음수 Cycle

초기 `dist[i][i]=0`에서 Algorithm 종료 후 `dist[v][v] < 0`인 Vertex가 있으면 v에서 출발해 다시 v로 돌아오는 음수 Cycle이 있다.

특정 `(i,j)` 경로가 음수 Cycle의 영향을 받는 조건은 다음과 같다.

```text
i에서 k에 도달 가능
dist[k][k] < 0
k에서 j에 도달 가능
```

이 경우 i에서 j까지 비용을 Cycle 반복으로 계속 낮출 수 있어 유한 최단 거리가 없다. 단순히 Graph 어딘가에 음수 Cycle이 있다는 이유로 모든 쌍이 영향을 받는 것은 아니다.

## 15. Algorithm 선택 비교

| 요구·조건 | 적합한 후보 | 시간 | 공간 |
|---|---|---:|---:|
| 무가중 단일 시작 | BFS(Breadth-First Search) | O(V+E) | O(V) |
| 음수 없음 단일 시작 | Dijkstra | O((V+E)logV) | O(V+E) |
| 음수 Edge 단일 시작 | Bellman-Ford | O(VE) | O(V+E) |
| DAG(Directed Acyclic Graph) 단일 시작 | 위상 순서 Relax | O(V+E) | O(V) |
| 모든 쌍, 작은 Graph | Floyd-Warshall | O(V³) | O(V²) |
| 모든 쌍, Sparse·큰 Graph | 시작점별 Dijkstra 등 | 조건에 따라 | 조건에 따라 |

Floyd-Warshall은 Query를 O(1) 거리 조회로 만들지만 Precompute와 Matrix Memory를 지불한다. Graph가 변경될 때 전체 재계산 또는 복잡한 동적 갱신이 필요하다.

## 16. INF와 Overflow

두 Algorithm 모두 도달 불가능한 INF에 Weight를 더하면 Overflow할 수 있다.

```text
if dist[u] != INF:
    candidate = dist[u] + weight

if dist[i][k] != INF and dist[k][j] != INF:
    candidate = dist[i][k] + dist[k][j]
```

예상 최대 절댓값과 최대 Edge 수를 계산해 64-bit 범위를 확인한다. 음수 값이 있으므로 unsigned 형은 부적합할 수 있다. Floating Point 환율 변환에서는 덧셈 거리로 바꾸기 위한 Log 변환과 오차 정책 같은 추가 수학이 필요하며 단순 예제를 그대로 Production에 적용하지 않는다.

## 17. 게임 서버·백엔드 실무 예시

### 작은 Zone Graph 사전 계산

Dungeon 내부 Zone이 수십 개이고 구조가 콘텐츠 Version 동안 고정이라면 Floyd-Warshall로 모든 쌍 이동 비용과 Next Hop을 사전 계산할 수 있다. Runtime Query는 Matrix 조회와 경로 복원으로 단순해진다.

```text
콘텐츠 Build
   ↓ Floyd-Warshall
Distance Matrix + Next Matrix + Map Version
   ↓ 배포
Runtime O(1) 거리 Query
```

문이 열리거나 Weight가 바뀌면 Matrix가 Stale해진다. 변경 Version별 재계산, Snapshot 교체와 이전 Version 요청 처리 정책이 필요하다.

### 경제 설정의 비정상 Cycle

아이템 변환을 Edge로 보고 변환을 반복할수록 가치가 증가하는 Cycle이 있는지 검증할 수 있다. 실제 곱셈 비율 문제는 Log 변환 등 정확한 모델링이 필요하다. Cycle 검출 결과에는 구성 Edge를 복원해 콘텐츠 담당자가 설정을 수정할 수 있게 한다.

모든 “보상 증가 Cycle”이 음수 최단 경로와 직접 같은 것은 아니다. 비용 정의와 변환 방향을 먼저 수학적으로 정당화해야 한다.

### 운영 기준

O(VE)와 O(V³)는 Tick 요청 경로에서 큰 Graph에 사용하기 어렵다. Build Pipeline이나 Background Worker에서 실행하고 Vertex·Edge 상한, Timeout과 취소를 둔다. 지표로 반복 횟수, Relax 갱신 수, Matrix Byte, Precompute 시간, Graph Version과 Cache Hit를 기록한다.

## 18. 장점과 단점

### Bellman-Ford

**장점**

- 음수 Edge가 있는 Graph에서도 단일 시작점 최단 거리를 올바르게 계산한다.
- 시작점에서 도달 가능한 음수 Cycle을 탐지할 수 있다.
- Edge List만 있으면 되어 구현이 단순하다.
- 조기 종료 최적화로 빠르게 안정되는 입력에서 실제 실행 시간을 줄일 수 있다.

**단점**

- 시간 복잡도 O(VE)로 Dijkstra보다 느리다.
- 큰 Graph의 실시간 Query 경로에 사용하기 어렵다.
- 음수 Cycle이 있으면 영향받는 Vertex에 유한 최단 거리를 계산할 수 없다.

### Floyd-Warshall

**장점**

- 세 중첩 Loop만으로 구현이 단순하다.
- 모든 쌍 거리·경로를 사전 계산하면 Runtime Query가 O(1)이다.
- 음수 Edge를 처리할 수 있고 대각선 검사로 음수 Cycle 유무를 확인할 수 있다.
- Dense Graph에서 V에만 의존하여 Sparse Graph 대비 비교적 예측 가능한 비용을 가진다.

**단점**

- 시간 복잡도 O(V³)로 V가 커지면 비용이 급격히 증가한다.
- O(V²) Memory가 필요해 Vertex 수가 많으면 Memory 부담이 크다.
- Graph 변경 시 Matrix 전체 또는 일부를 재계산해야 한다.

## 19. 자주 하는 오해

- **Bellman-Ford는 음수 Cycle이 있어도 최단 거리를 반환한다**: 영향받는 Vertex에는 유한 최단 거리가 없다.
- **V-1번은 모든 경로 길이가 V-1이기 때문이다**: 단순 최단 경로의 최대 Edge 수가 V-1이다.
- **한 Pass에서 갱신이 없는데도 계속해야 한다**: 거리 상태가 안정되어 조기 종료 가능하다.
- **불연결 Component의 음수 Cycle도 단일 시작점 결과에 항상 포함된다**: 시작점 도달 가능성을 확인해야 한다.
- **Floyd의 세 Loop 순서는 자유롭다**: k가 중간 Vertex 단계이므로 가장 바깥이어야 한다.
- **`dist[v][v]<0`이면 모든 쌍 거리가 무효다**: 해당 Cycle에 들어가고 나올 수 있는 쌍만 영향받는다.
- **모든 쌍이면 Floyd가 항상 최선이다**: V, 밀도, Query 수와 Memory를 비교해야 한다.
- **사전 계산 후 Graph 변경은 중요하지 않다**: Distance·Next Matrix는 Version과 함께 무효화해야 한다.

## 20. 면접 질문

### Q1. 게임 경제 아이템 교환 시스템에서 교환 루프를 돌수록 아이템이 무한 증식되는 의심 신고가 들어왔습니다. 아이템 교환을 Edge로 모델링했을 때, 어떤 Algorithm으로 이 문제를 진단하고 어떤 결과가 나오면 이상이라고 판단하나요?

아이템 교환 비용을 음수로 표현해 Exchange Graph를 구성한 뒤 Bellman-Ford를 사용합니다. 출발 아이템을 시작점으로 V-1번 Relaxation을 수행하고, V번째 Relaxation에서 거리가 줄어드는 Edge가 발생하면 음수 Cycle — 즉 교환을 반복할수록 자원이 증식되는 루프 — 이 존재한다고 판단합니다. 탐지 즉시 해당 Exchange Route를 비활성화하고 영향받은 Vertex 목록을 Cycle에서 도달 가능한 아이템 집합으로 뽑아 콘텐츠 담당자에게 전달합니다.

### Q2. Bellman-Ford를 구현했는데 V-1번이 아니라 V-2번만 Relax해서 배포했습니다. 또는 반대로 V번 이상 Relax했습니다. 각각 어떤 버그가 발생하나요?

V-2번 Relax하면 최대 V-2개 Edge를 쓰는 경로까지만 확정됩니다. V-1개 Edge를 사용하는 최단 경로(예: 선형으로 V개 Vertex가 이어진 Graph)가 반영되지 않아 해당 목적지 거리가 실제보다 크거나 INF로 남습니다. 반대로 V번 이상 Relax하면 음수 Cycle이 없는 Graph에서는 결과가 동일하지만 — 갱신이 없으므로 — 음수 Cycle이 있는 Graph에서는 V번째 Relaxation에서 거리가 줄어들어 Cycle이 있다고 잘못 보고될 위험이 생깁니다. 조기 종료 없이 V번째까지 허용하면 Cycle 탐지 로직과 정상 Relaxation 로직이 충돌해 false positive 또는 무한 갱신 상태로 이어질 수 있습니다.

### Q3. Dungeon Zone이 500개로 늘어나면서 Floyd-Warshall 사전 계산이 배포 타임아웃에 걸렸고 Matrix 크기도 Memory 한계에 가까워졌습니다. 어떻게 대처하나요?

V=500이면 O(V³)=1.25억 연산이고 O(V²)=250,000 셀 × 8B ≒ 2MB입니다. 연산 자체는 허용 범위지만 타임아웃이 발생한다면 먼저 코드 내 불필요한 체크나 함수 호출 오버헤드를 제거합니다. 그래도 부족하면 Zone 구조를 분석해 실제 Query가 필요한 Zone 쌍만 포함하는 부분 Graph로 줄이거나, Zone을 Cluster로 묶어 Cluster 간 Floyd-Warshall + Cluster 내부 Dijkstra를 분리하는 두 단계 접근을 검토합니다. 콘텐츠 업데이트 중 Zone이 동적으로 추가된다면 Matrix 전체 재계산이 아닌 추가된 Zone과 기존 쌍만 갱신하는 점진적 무효화 전략도 고려합니다.

### Q4. Floyd-Warshall 구현에서 Loop 순서를 k-i-j가 아닌 i-j-k로 잘못 작성했습니다. 어떤 잘못된 결과가 나오나요? 구체적인 예시로 설명해 주세요.

i-j-k 순서에서 특정 (i,j) 쌍을 먼저 확정하면, 나중에 허용될 중간 Vertex k의 정보가 아직 반영되지 않은 상태에서 k를 경유하는 경로를 계산합니다. 예를 들어 A→B→C 경로에서 B가 중간 Vertex일 때, B가 아직 최신 정보로 갱신되기 전에 A→C를 계산하면 A→B→C 비용이 과대 평가됩니다. 즉, 최단 경로가 실제보다 긴 값으로 남거나 도달 가능한 경로가 INF로 남아, 같은 Graph에 k-i-j 순서로 돌린 결과와 다른 Matrix를 출력합니다. 이 버그는 조건에 따라 일부 쌍만 틀리므로 넓은 E2E 테스트 없이는 발견하기 어렵습니다.

### Q5. 운영 중 Floyd-Warshall 사전 계산 Matrix에서 `dist[v][v] < 0`인 Zone이 발견됐습니다. 즉각적인 대응 절차와 데이터 롤백 전략을 설명해 주세요.

발견 즉시 해당 Zone이 포함된 경로 Query를 차단하거나 최후 안전값(INF 또는 직전 정상 Version)을 반환하도록 Circuit Breaker를 적용합니다. 동시에 음수 Cycle에서 도달 가능한 Zone 집합을 BFS/DFS로 식별해 영향 범위를 좁힙니다. Matrix는 직전 정상 Snapshot으로 교체하고 콘텐츠 담당자에게 음수 Cycle을 구성하는 Edge 목록과 Weight를 전달합니다. 설정 수정 후 Build Pipeline에서 재계산하고 `dist[v][v] < 0` 검사를 배포 전 자동화 검증 단계에 추가해 재발을 방지합니다.

### Q6. 게임 서버에서 Zone 이동 경로를 제공하는 서비스를 새로 설계해야 합니다. Zone 수는 약 200개이고 Zone 간 이동 비용에 음수 가중치는 없습니다. 다만 이벤트 기간에는 일부 Zone 이동 비용이 실시간으로 변경됩니다. 이 조건에서 Bellman-Ford와 Floyd-Warshall 중 무엇을 선택하겠습니까, 아니면 둘 다 쓰지 않겠습니까?

음수 가중치가 없으므로 Bellman-Ford의 O(VE) 비용 지불 이유가 없습니다. Zone 200개에서 Floyd-Warshall은 O(200³)=800만 연산으로 사전 계산은 가능하지만, 이벤트 중 가중치가 실시간 변경된다면 변경마다 전체 Matrix를 재계산해야 해 배포 사이클과 맞지 않습니다. 저라면 Floyd-Warshall을 기본 사전 계산에 쓰되 실시간 변경이 발생하는 Zone 쌍에 대해서는 Dijkstra를 요청 시점에 실행하는 Hybrid 전략을 택합니다. 변경 빈도가 낮으면 Version 관리로 Matrix를 통째 교체하고, 빈도가 높으면 Floyd-Warshall 전체 사전 계산을 포기하고 Dijkstra만 사용하는 방향으로 전환합니다.

## 21. 예상 꼬리질문

- 조기 종료 최적화를 적용했는데 음수 Cycle이 있는 Graph에서 종료가 너무 늦거나 빨리 되는 경우가 생길 수 있나요?
- 게임 경제 Exchange Graph에서 음수 Cycle을 탐지했을 때, 영향받는 아이템 집합을 어떻게 추출해서 콘텐츠 담당자에게 넘기나요?
- Floyd-Warshall Matrix에서 `dist[v][v] < 0`인 Vertex가 두 개 이상 발견됐습니다. 이 경우 음수 Cycle 영향을 받는 (i,j) 쌍을 어떻게 판정하나요?
- Zone Graph가 패치로 Edge 10개가 추가됐을 때, Matrix 전체를 재계산할지 해당 Zone 쌍만 Dijkstra로 갱신할지 판단 기준은 무엇인가요?
- Bellman-Ford Parent Chain을 역추적해 경로를 복원하는 도중 무한 Loop가 발생했습니다. 어떤 조건에서 이 상황이 생기고 어떻게 방어하나요?
- Zone 200개 Floyd-Warshall Matrix를 Redis에 캐시할 때 Serialization 포맷과 TTL을 어떻게 설정하겠습니까?
- Graph 업데이트가 1초에 수십 회 발생하는 상황에서 Floyd-Warshall 사전 계산 전략 자체가 의미 없어지는 기준은 어디라고 보나요?

## 22. 30초 모범답변

> Bellman-Ford는 모든 Edge를 V-1번 Relax해 음수 Edge가 있는 단일 시작점 최단 거리를 구하고, 추가 한 번의 갱신으로 도달 가능한 음수 Cycle을 탐지합니다. 시간은 O(VE)입니다. Floyd-Warshall은 중간 Vertex k를 하나씩 허용하며 `dist[i][j]`와 `dist[i][k]+dist[k][j]`를 비교해 모든 쌍 거리를 O(V³), 공간 O(V²)에 구합니다.

## 23. 1~2분 확장답변

> Bellman-Ford는 시작점 거리만 0으로 두고 Edge List 전체를 V-1번 Relax합니다. 음수 Cycle이 없는 단순 최단 경로는 최대 V-1개 Edge를 가지므로 충분합니다. 한 번 더 Relax했을 때 거리가 줄면 시작점에서 도달 가능한 음수 Cycle 때문에 유한 최단 거리가 없습니다. 갱신이 없는 Pass에서는 조기 종료할 수 있습니다.
>
> Floyd-Warshall은 `dist[i][j]`를 직접 경로와 k를 거치는 경로 중 최솟값으로 갱신합니다. k가 허용된 중간 Vertex 집합의 단계이므로 가장 바깥 Loop에 있어야 합니다. 모든 쌍 거리를 O(V³) 시간과 O(V²) Memory에 계산하고 Next Matrix로 경로도 복원할 수 있습니다. 게임 서버에서는 작은 고정 Zone Graph를 Build 때 사전 계산하는 데 적합하지만 Graph 변경 시 Version과 Matrix를 함께 교체해야 합니다. 큰 Graph의 실시간 경로에는 입력 조건에 맞는 다른 Algorithm과 Budget을 사용합니다.

## 24. 핵심 요약

- Bellman-Ford는 음수 Edge가 가능한 단일 시작점 최단 경로를 O(VE)에 구한다.
- V-1번 Relax는 단순 최단 경로의 최대 Edge 수에 근거한다.
- 추가 Relaxation은 시작점에서 도달 가능한 음수 Cycle을 탐지한다.
- Floyd-Warshall은 중간 Vertex를 늘리는 DP로 모든 쌍 거리를 O(V³)에 구한다.
- Floyd의 k Loop는 DP 단계이므로 가장 바깥에 있어야 한다.
- Next·Parent를 저장하면 경로를 복원할 수 있다.
- INF 덧셈과 정수 Overflow, 음수 Cycle 영향 범위를 확인한다.
- Precompute는 빠른 Query 대신 O(V²) Memory와 Graph Version 갱신 비용을 지불한다.

## 한 줄 정리

> Bellman-Ford는 Edge 수를 늘려 음수 비용을 전파하고, Floyd-Warshall은 허용 중간점을 늘려 모든 쌍 최단 거리를 완성한다.
