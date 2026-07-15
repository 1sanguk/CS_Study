---
difficulty: 4
reading_time: 30분
interview_frequency: 4
importance: 4
---

# 08. Bellman-Ford와 Floyd-Warshall

> 게임 서버·백엔드 개발자를 위한 CS 면접 교재

## 학습 목표

- Bellman-Ford의 반복 Relaxation과 음수 Cycle 탐지를 설명할 수 있다.
- Floyd-Warshall의 중간 Vertex DP 점화식과 Loop 순서를 설명할 수 있다.
- 단일 시작점과 모든 쌍 최단 경로 요구에 맞춰 Algorithm을 선택할 수 있다.
- 경로 복원, INF·Overflow, 사전 계산과 Graph Version 비용을 설명할 수 있다.

## 1. 개요

Bellman-Ford는 음수 Edge가 있을 수 있는 Graph에서 한 시작점으로부터 최단 거리를 구하고, 시작점에서 도달 가능한 음수 Cycle을 탐지한다. Floyd-Warshall은 모든 Vertex 쌍의 최단 거리를 Dynamic Programming으로 구한다.

```text
Bellman-Ford
start → 모든 Edge를 V-1번 Relax → 한 시작점 dist[]

Floyd-Warshall
모든 (i,j) 거리 → 중간 Vertex k를 하나씩 허용 → dist[][]
```

두 Algorithm 모두 음수 Edge를 처리할 수 있지만 목적과 비용이 다르다. Bellman-Ford는 O(VE), Floyd-Warshall은 O(V³) 시간과 O(V²) 공간이 필요하다.

## 2. 왜 필요한가

Dijkstra는 음수 Edge가 없는 Graph에서 효율적이지만 음수 Edge가 하나라도 있으면 이미 확정한 거리가 나중에 줄어들 수 있다. Bellman-Ford는 모든 Edge를 반복 Relax해 이러한 변경을 전파한다.

출발점과 목적지가 계속 바뀌는 작은 Graph에서는 매 Query마다 단일 시작점 Algorithm을 실행하는 대신 모든 쌍 거리를 미리 계산할 수 있다. Floyd-Warshall은 구현이 단순하고 Dense Graph에서도 비용이 V에만 의존해 작은 고정 Graph에 유용하다.

선택 전 다음을 확인한다.

- 한 시작점인가, 모든 쌍인가?
- 음수 Edge 또는 음수 Cycle이 가능한가?
- Vertex·Edge 수와 Graph 밀도는 얼마인가?
- Query 횟수와 Graph 변경 빈도는 얼마인가?
- 거리만 필요한가, 실제 경로도 필요한가?

## 3. Bellman-Ford의 Relaxation

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

## 4. 왜 V-1번 반복하는가

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

## 5. Bellman-Ford 구현과 조기 종료

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

## 6. 음수 Cycle 탐지

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

## 7. Bellman-Ford 경로 복원

Relaxation으로 개선될 때 `parent[v]=u`를 저장하고 목적지에서 역추적한다. 음수 Cycle 영향이 없고 도달 가능할 때만 유한 최단 경로를 복원할 수 있다.

음수 Cycle 자체를 복원하려면 V번째 갱신 Vertex에서 Parent를 V번 따라가 Cycle 내부로 들어간 뒤 다시 같은 Vertex가 나올 때까지 Parent를 추적할 수 있다. Parent 방향은 최단 경로의 역방향이므로 출력 시 뒤집거나 의미를 명확히 한다.

Parent Chain 추적에 방문 표시나 길이 상한을 두지 않으면 잘못된 데이터에서 무한 Loop가 날 수 있다.

## 8. Floyd-Warshall의 상태 정의

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

## 9. 초기화

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

## 10. Loop 순서가 중요한 이유

중간 Vertex 집합을 단계적으로 늘리는 DP이므로 `k`가 가장 바깥 Loop여야 한다. `i`, `j`, `k` 순서로 단순히 바꾸면 “0부터 k까지의 중간 Vertex를 모두 반영했다”는 불변식이 깨지고 일부 경로가 충분히 전파되지 않을 수 있다.

```text
for k: 이번에 허용할 새 중간 Vertex
  for i: 출발점
    for j: 도착점
```

행렬 곱처럼 세 Loop라서 순서를 자유롭게 바꿀 수 있는 것이 아니다. Cache 최적화로 Blocking을 적용하려면 DP 의존성을 보존하는 검증된 방식이 필요하다.

## 11. Floyd-Warshall 예시

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

## 12. Floyd-Warshall 경로 복원

`next[i][j]`에 i에서 j로 가는 최단 경로의 첫 다음 Vertex를 저장할 수 있다.

초기 직접 Edge에는 `next[i][j]=j`를 둔다. k를 거치는 경로로 개선되면 다음과 같이 갱신한다.

```text
next[i][j] = next[i][k]
```

경로를 출력할 때 i에서 시작해 `next[current][j]`를 반복한다. 도달 불가능이면 next가 없다. 음수 Cycle 영향이나 잘못된 Matrix에서 무한 Loop를 막기 위해 최대 V 수준의 검증 또는 Cycle 탐지를 둔다.

중간 Vertex `via[i][j]=k`를 저장하고 재귀적으로 i→k, k→j를 복원하는 방식도 있다.

## 13. Floyd-Warshall과 음수 Cycle

초기 `dist[i][i]=0`에서 Algorithm 종료 후 `dist[v][v] < 0`인 Vertex가 있으면 v에서 출발해 다시 v로 돌아오는 음수 Cycle이 있다.

특정 `(i,j)` 경로가 음수 Cycle의 영향을 받는 조건은 다음과 같다.

```text
i에서 k에 도달 가능
dist[k][k] < 0
k에서 j에 도달 가능
```

이 경우 i에서 j까지 비용을 Cycle 반복으로 계속 낮출 수 있어 유한 최단 거리가 없다. 단순히 Graph 어딘가에 음수 Cycle이 있다는 이유로 모든 쌍이 영향을 받는 것은 아니다.

## 14. Algorithm 선택 비교

| 요구·조건 | 적합한 후보 | 시간 | 공간 |
|---|---|---:|---:|
| 무가중 단일 시작 | BFS | O(V+E) | O(V) |
| 음수 없음 단일 시작 | Dijkstra | O((V+E)logV) | O(V+E) |
| 음수 Edge 단일 시작 | Bellman-Ford | O(VE) | O(V+E) |
| DAG 단일 시작 | 위상 순서 Relax | O(V+E) | O(V) |
| 모든 쌍, 작은 Graph | Floyd-Warshall | O(V³) | O(V²) |
| 모든 쌍, Sparse·큰 Graph | 시작점별 Dijkstra 등 | 조건에 따라 | 조건에 따라 |

Floyd-Warshall은 Query를 O(1) 거리 조회로 만들지만 Precompute와 Matrix Memory를 지불한다. Graph가 변경될 때 전체 재계산 또는 복잡한 동적 갱신이 필요하다.

## 15. INF와 Overflow

두 Algorithm 모두 도달 불가능한 INF에 Weight를 더하면 Overflow할 수 있다.

```text
if dist[u] != INF:
    candidate = dist[u] + weight

if dist[i][k] != INF and dist[k][j] != INF:
    candidate = dist[i][k] + dist[k][j]
```

예상 최대 절댓값과 최대 Edge 수를 계산해 64-bit 범위를 확인한다. 음수 값이 있으므로 unsigned 형은 부적합할 수 있다. Floating Point 환율 변환에서는 덧셈 거리로 바꾸기 위한 Log 변환과 오차 정책 같은 추가 수학이 필요하며 단순 예제를 그대로 Production에 적용하지 않는다.

## 16. 게임 서버·백엔드 실무 예시

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

## 17. 장점과 단점

### Bellman-Ford

- 장점: 음수 Edge, 단일 시작점 최단 거리, 도달 가능한 음수 Cycle 탐지
- 단점: O(VE)로 느리고 큰 Graph의 실시간 Query에 부담

### Floyd-Warshall

- 장점: 구현이 단순하고 모든 쌍 거리·경로 Query가 빠름, 음수 Cycle 확인 가능
- 단점: O(V³) 시간과 O(V²) Memory, 변경 시 Precompute 무효화

## 18. 자주 하는 오해

- **Bellman-Ford는 음수 Cycle이 있어도 최단 거리를 반환한다**: 영향받는 Vertex에는 유한 최단 거리가 없다.
- **V-1번은 모든 경로 길이가 V-1이기 때문이다**: 단순 최단 경로의 최대 Edge 수가 V-1이다.
- **한 Pass에서 갱신이 없는데도 계속해야 한다**: 거리 상태가 안정되어 조기 종료 가능하다.
- **불연결 Component의 음수 Cycle도 단일 시작점 결과에 항상 포함된다**: 시작점 도달 가능성을 확인해야 한다.
- **Floyd의 세 Loop 순서는 자유롭다**: k가 중간 Vertex 단계이므로 가장 바깥이어야 한다.
- **`dist[v][v]<0`이면 모든 쌍 거리가 무효다**: 해당 Cycle에 들어가고 나올 수 있는 쌍만 영향받는다.
- **모든 쌍이면 Floyd가 항상 최선이다**: V, 밀도, Query 수와 Memory를 비교해야 한다.
- **사전 계산 후 Graph 변경은 중요하지 않다**: Distance·Next Matrix는 Version과 함께 무효화해야 한다.

## 19. 면접 질문

### Q1. Bellman-Ford를 설명해 주세요.

음수 Edge가 있을 수 있는 Graph에서 모든 Edge를 V-1번 Relax해 한 시작점 최단 거리를 구합니다. 이후 한 번 더 Relax해 거리가 줄면 시작점에서 도달 가능한 음수 Cycle이 있습니다. 시간 O(VE), 공간 O(V+E)입니다.

### Q2. 왜 V-1번 Relax하나요?

음수 Cycle이 없는 최단 경로는 같은 Vertex를 반복하지 않는 단순 경로로 만들 수 있고, V개 Vertex의 단순 경로는 최대 V-1개 Edge를 사용합니다. i번 반복 후 최대 i개 Edge를 쓰는 최단 경로가 반영됩니다.

### Q3. Floyd-Warshall의 점화식을 설명해 주세요.

중간 Vertex로 0부터 k까지만 허용한 i→j 최단 거리를 생각합니다. k를 거치지 않는 기존 거리와 `dist[i][k]+dist[k][j]`를 비교해 더 작은 값을 저장합니다.

### Q4. Floyd-Warshall에서 k Loop가 왜 바깥인가요?

각 단계는 새 중간 Vertex k를 허용한 상태를 완성해야 합니다. 모든 i,j 쌍에 대해 k를 반영한 뒤 다음 k로 넘어가야 DP 불변식이 유지됩니다.

### Q5. Floyd-Warshall에서 경로와 음수 Cycle을 어떻게 확인하나요?

개선 시 `next[i][j]=next[i][k]`를 저장하면 Next Hop으로 경로를 복원할 수 있습니다. 종료 후 `dist[v][v]<0`이면 v를 포함한 음수 Cycle이 있습니다.

### Q6. 두 Algorithm은 언제 선택하나요?

음수 Edge가 있는 단일 시작점은 Bellman-Ford, 작은 Graph의 반복적인 모든 쌍 Query는 Floyd-Warshall을 검토합니다. Vertex·Edge 수, Graph 밀도, 변경 빈도와 Memory를 함께 봅니다.

## 20. 예상 꼬리질문

- Bellman-Ford를 조기 종료할 수 있는 조건은 무엇인가요?
- Graph 전체의 음수 Cycle을 찾으려면 어떻게 하나요?
- 음수 Cycle의 영향을 받는 목적지는 어떻게 판정하나요?
- Floyd 초기화에서 중복 Edge는 어떻게 처리하나요?
- 모든 쌍 경로를 저장하면 Memory는 얼마나 필요한가요?
- DAG에 음수 Edge가 있으면 어떤 Algorithm을 사용할 수 있나요?
- Precompute Matrix가 Stale해지는 상황은 어떻게 처리하나요?

## 21. 30초 모범답변

> Bellman-Ford는 모든 Edge를 V-1번 Relax해 음수 Edge가 있는 단일 시작점 최단 거리를 구하고, 추가 한 번의 갱신으로 도달 가능한 음수 Cycle을 탐지합니다. 시간은 O(VE)입니다. Floyd-Warshall은 중간 Vertex k를 하나씩 허용하며 `dist[i][j]`와 `dist[i][k]+dist[k][j]`를 비교해 모든 쌍 거리를 O(V³), 공간 O(V²)에 구합니다.

## 22. 1~2분 확장답변

> Bellman-Ford는 시작점 거리만 0으로 두고 Edge List 전체를 V-1번 Relax합니다. 음수 Cycle이 없는 단순 최단 경로는 최대 V-1개 Edge를 가지므로 충분합니다. 한 번 더 Relax했을 때 거리가 줄면 시작점에서 도달 가능한 음수 Cycle 때문에 유한 최단 거리가 없습니다. 갱신이 없는 Pass에서는 조기 종료할 수 있습니다.
>
> Floyd-Warshall은 `dist[i][j]`를 직접 경로와 k를 거치는 경로 중 최솟값으로 갱신합니다. k가 허용된 중간 Vertex 집합의 단계이므로 가장 바깥 Loop에 있어야 합니다. 모든 쌍 거리를 O(V³) 시간과 O(V²) Memory에 계산하고 Next Matrix로 경로도 복원할 수 있습니다. 게임 서버에서는 작은 고정 Zone Graph를 Build 때 사전 계산하는 데 적합하지만 Graph 변경 시 Version과 Matrix를 함께 교체해야 합니다. 큰 Graph의 실시간 경로에는 입력 조건에 맞는 다른 Algorithm과 Budget을 사용합니다.

## 23. 핵심 요약

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
