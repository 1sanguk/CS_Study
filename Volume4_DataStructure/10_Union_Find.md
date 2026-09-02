---
difficulty: 3
reading_time: 25분
interview_frequency: 4
importance: 4
---

# 10. Union-Find


## 학습 목표

- 길드 동맹·서버 분할 등 Connectivity 판단이 필요한 상황에서 Union-Find와 BFS(Breadth-First Search)/DFS(Depth-First Search) 중 어느 것을 선택할지 결정할 수 있다.
- Tree 편향이 우려되는 조건에서 경로 압축과 Rank·Size 결합의 효과를 비교하고 적합한 최적화 조합을 선택할 수 있다.
- Union-Find의 O(α(n)) 비용이 성립하는 조건과 Rollback·동시성 요구 시 포기해야 하는 최적화를 구분하여 설계 결정을 내릴 수 있다.
- 연결 요소 수 관리, 무방향 Cycle 판정, Kruskal 선택 조건 중 어느 기법을 사용해야 하는지 각 상황의 요구 조건에 따라 구분하고 결정을 내릴 수 있다.

## 1. 개요

Union-Find는 여러 원소를 서로 겹치지 않는 집합, 즉 서로소 집합(Disjoint Set)으로 관리하는 자료구조다. Disjoint Set Union의 약자인 DSU라고도 한다.

제공하는 핵심 연산은 세 가지다.

- `MakeSet(x)`: 원소 `x`만 포함하는 새 집합을 만든다.
- `Find(x)`: `x`가 속한 집합의 대표 원소인 Root를 찾는다.
- `Union(a, b)`: `a`와 `b`가 속한 두 집합을 하나로 합친다.

두 원소가 같은 집합인지 확인하려면 `Find(a) == Find(b)`를 비교한다. 실제 연결 경로를 구하는 것이 아니라 같은 연결 요소에 속하는지만 빠르게 답한다.

## 2. 왜 필요한가

무방향 Graph에 Edge가 계속 추가될 때 다음 질문을 반복한다고 하자.

- 두 Zone이 연결되어 있는가?
- 새 Edge를 추가하면 Cycle이 생기는가?
- 현재 독립된 Network Group이 몇 개인가?

매 질문마다 BFS나 DFS를 수행하면 `O(V+E)`가 들 수 있다. Union-Find는 연결 요소를 대표 Root로 압축해 병합과 연결 여부 확인을 매우 빠르게 처리한다.

다만 Edge 추가에 특화된 구조다. 어느 경로로 연결되는지, 두 Vertex 사이 거리는 얼마인지, Edge를 삭제한 뒤에도 연결되는지는 기본 Union-Find가 답하지 못한다.

## 3. Parent Tree 표현

각 원소는 부모 Index를 저장하고, 집합의 대표 Root는 자기 자신을 부모로 가리킨다.

```text
parent = [0, 0, 0, 3, 3, 5]

집합 {0,1,2}        집합 {3,4}       집합 {5}
      0                 3               5
     / \                |
    1   2               4
```

초기에는 모든 원소가 독립 집합이다.

```text
for x in 0..n-1:
    parent[x] = x
    size[x] = 1
```

`Find(x)`는 `parent[x] == x`인 Root까지 부모를 따라간다. `Union(a, b)`는 두 Root를 찾고 한 Root의 부모를 다른 Root로 바꾼다. Root가 아닌 임의 Node끼리 연결하면 대표 구조를 일관되게 관리하기 어려우므로 반드시 Root를 결합한다.

## 4. 단순 구현의 문제

아무 기준 없이 한 Root를 다른 Root 아래에 붙이면 긴 Chain이 생길 수 있다.

```text
0 ← 1 ← 2 ← 3 ← 4

Find(4): 4 → 3 → 2 → 1 → 0
```

높이가 `n`이면 Find가 `O(n)`까지 악화된다. Union도 내부에서 Find를 호출하므로 느려진다. 이를 줄이는 두 핵심 최적화가 경로 압축과 Rank·Size 기준 결합이다.

## 5. 경로 압축

경로 압축(Path Compression)은 Find 과정에서 방문한 모든 Node가 Root를 직접 가리키게 만든다.

```text
압축 전: 4 → 3 → 2 → 1 → 0
Find(4) 실행
압축 후:
        0
      / | | \
     1  2 3  4
```

C# 형태의 재귀 구현은 다음과 같다.

```csharp
int Find(int x)
{
    if (parent[x] == x)
        return x;

    parent[x] = Find(parent[x]);
    return parent[x];
}
```

단순히 Root를 반환하는 데서 끝나지 않고 `parent[x]`에 Root를 다시 저장하는 줄이 핵심이다. 이후 같은 경로의 Find가 훨씬 짧아진다.

매우 깊은 입력에서 재귀 Stack이 우려되면 반복문으로 Root를 먼저 찾고, 다시 경로를 걸으며 부모를 Root로 바꿀 수 있다. Path Halving처럼 이동하면서 한 단계 건너 조부모를 가리키게 하는 변형도 있다.

## 6. Union by Size와 Union by Rank

두 Tree를 합칠 때 작은 Tree를 큰 Tree 아래에 붙이면 높이 증가를 억제할 수 있다.

```text
size[rootA] = 8, size[rootB] = 3

rootB → rootA
size[rootA] = 11
```

Union by Size는 원소 수가 작은 Root를 큰 Root 아래에 붙인다. Union by Rank는 높이의 상한을 나타내는 Rank가 낮은 Root를 높은 Root 아래에 붙인다. Rank가 같을 때만 새 Root의 Rank를 하나 높인다.

경로 압축 후 Rank는 실제 현재 높이와 정확히 같지 않을 수 있다. Rank는 결합 결정을 위한 상한 정보이지 매번 재계산하는 실제 높이가 아니다. Size는 집합 크기 Query에도 활용할 수 있지만 Root에서만 유효하게 관리하는 것이 일반적이다.

```csharp
bool Union(int a, int b)
{
    int rootA = Find(a);
    int rootB = Find(b);

    if (rootA == rootB)
        return false;

    if (size[rootA] < size[rootB])
        (rootA, rootB) = (rootB, rootA);

    parent[rootB] = rootA;
    size[rootA] += size[rootB];
    return true;
}
```

반환값 `false`는 이미 같은 집합이었다는 뜻으로, 무방향 Graph의 Edge 추가에서 Cycle 판정에 사용할 수 있다.

## 7. 시간·공간 복잡도

경로 압축과 Union by Rank 또는 Size를 함께 사용하면 `m`번 연산의 분할 상환 시간은 `O(m α(n))`이다. 한 연산당 `O(α(n))`으로 표현한다. `α`는 역 Ackermann 함수이며 현실적인 입력 크기에서는 5보다 작아 사실상 상수에 가깝다.

정확한 표현은 “항상 O(1)”이 아니다. 개별 한 번의 Find는 아직 압축되지 않은 경로를 따라갈 수 있고, 이론적 상한은 역 Ackermann 함수다. 여러 연산 전체에 비용을 나눠 보는 분할 상환 분석이다.

Parent와 Size·Rank 배열을 저장하므로 공간은 `O(n)`이다. 원소가 연속 정수 ID가 아니면 외부 ID를 연속 Index로 매핑하는 Hash Map이 추가로 필요할 수 있다.

| 구성 | 대표 성능 |
|---|---|
| 최적화 없는 Parent Tree | 최악 O(n) |
| Size·Rank 결합만 사용 | O(log n) 높이 제한 |
| 경로 압축만 사용 | 반복 Find가 빨라짐 |
| 두 최적화 함께 사용 | 분할 상환 O(α(n)) |

## 8. Cycle 판정과 연결 요소

무방향 Graph의 Edge `(u, v)`를 하나씩 처리한다.

1. `Find(u) == Find(v)`이면 이미 경로가 있으므로 이 Edge를 추가하면 Cycle이 생긴다.
2. 다르면 `Union(u, v)`로 두 연결 요소를 합친다.

```text
처리 Edge: A-B, B-C, C-A

A-B: 다른 집합 → Union
B-C: 다른 집합 → Union
C-A: 같은 집합 → Cycle
```

방향 Graph에서는 같은 방식으로 일반적인 Cycle을 판정할 수 없다. `A → B`, `C → B`를 처리할 때 방향을 무시한 연결성과 방향 Cycle은 다른 개념이다. 방향 Cycle에는 DFS의 현재 경로 표시나 위상 정렬을 사용한다.

초기 집합 수를 `n`으로 두고 서로 다른 두 집합을 Union할 때마다 1씩 줄이면 현재 연결 요소 수를 유지할 수 있다.

## 9. Kruskal 알고리즘에서의 역할

Kruskal 최소 신장 트리 알고리즘은 가중치가 작은 Edge부터 검사한다. 서로 다른 연결 요소를 잇는 Edge만 선택하고 같은 요소 안의 Edge는 Cycle을 만들므로 버린다. 이 연결 여부 판정을 Union-Find가 담당한다.

```text
모든 Edge를 Weight 오름차순 정렬
          ↓
for each (u, v, weight):
    if Find(u) != Find(v):
        Edge 선택
        Union(u, v)
```

전체 복잡도는 Edge 정렬 `O(E log E)`가 지배하고 Union-Find 연산은 거의 선형에 가깝다. Union-Find가 최소 가중치를 결정하는 것은 아니며, 정렬된 Edge를 Cycle 없이 선택하도록 돕는다.

## 10. 삭제가 어려운 이유

Union-Find는 집합을 합칠 때 이전 경계를 잃는다. 경로 압축은 여러 Node를 Root에 직접 연결해 원래 어떤 Edge로 이어졌는지도 보존하지 않는다.

```text
A-B-C, B-C Edge를 삭제한다고 하자.

다른 우회 Edge가 있는가?
삭제 후 두 Component로 나뉘는가?

Parent 배열만으로는 판단 불가
```

Edge 삭제가 드물고 Offline 처리가 가능하면 Query를 역순으로 처리해 삭제를 추가로 바꾸거나, Rollback Union-Find와 Divide-and-Conquer를 사용할 수 있다. 실시간 동적 연결은 훨씬 복잡한 Dynamic Connectivity 자료구조나 삭제 후 제한된 BFS 재계산이 필요하다.

Rollback이 필요하면 일반 경로 압축은 변경 기록을 많이 만들어 되돌리기 어렵다. Rank·Size 결합만 사용하고 변경 Stack을 기록하는 변형이 흔하다. 요구에 따라 최적화 선택도 달라진다.

## 11. 다른 구조와 비교

| 요구 | Union-Find | BFS·DFS + Graph |
|---|---|---|
| 두 원소의 연결 여부 | 매우 빠름 | Query마다 탐색 가능 |
| 집합 병합 | 매우 빠름 | Graph Edge 추가 |
| 실제 경로 | 지원 안 함 | Parent 기록으로 가능 |
| 거리·최단 경로 | 지원 안 함 | 알고리즘으로 가능 |
| Edge 삭제 | 기본 지원 안 함 | Edge 삭제 후 재탐색 가능 |
| 이웃 열거 | 지원 안 함 | 인접 구조로 가능 |

Union-Find의 Parent Tree는 원래 Graph의 경로가 아니다. `parent[x]`는 집합 대표를 찾기 위한 내부 구조일 뿐 실제 Edge를 의미하지 않는다. 실제 연결 정보도 필요하다면 Graph와 Union-Find를 함께 유지해야 한다.

## 12. 장점과 단점

### 장점

- 연결 여부와 집합 병합을 분할 상환 `O(α(n))`에 처리한다.
- 배열 기반 구현이 단순하고 메모리 지역성이 좋다.
- 무방향 Cycle 판정과 Kruskal에 잘 맞는다.
- 집합 수와 Root별 Size 같은 Aggregate를 함께 유지할 수 있다.

### 단점

- 실제 경로, 거리, 이웃 정보를 제공하지 않는다.
- 기본 구조는 Edge 삭제와 집합 분할을 지원하지 않는다.
- 방향 Graph의 일반 Cycle 판정에는 바로 적용할 수 없다.
- 경로 압축은 Rollback과 동시 갱신을 어렵게 한다.

## 13. 게임 서버·백엔드 실무 예시

### 길드 동맹 Group

길드 동맹이 합쳐지기만 하는 이벤트 처리라면 길드 ID를 원소로 두고 Union할 수 있다. 같은 동맹인지 `Find`로 확인하고 Root에 전체 인원 수 같은 Aggregate를 둘 수 있다.

그러나 동맹 탈퇴와 해체가 실시간으로 자주 발생하면 기본 Union-Find는 적합하지 않다. 탈퇴 후 남은 길드가 어떤 Component로 갈라지는지 알 수 없기 때문이다. 이 경우 실제 동맹 Graph를 보존하고 재계산 또는 다른 동적 구조를 사용한다.

아래는 길드 동맹 Union-Find를 Java로 구현한 예시다.

```java
class GuildUnionFind {
    private final int[] parent;
    private final int[] rank;

    GuildUnionFind(int n) {
        parent = new int[n];
        rank = new int[n];
        for (int i = 0; i < n; i++) parent[i] = i;
    }

    int find(int x) {
        if (parent[x] != x) parent[x] = find(parent[x]); // 경로 압축
        return parent[x];
    }

    boolean union(int a, int b) {
        int ra = find(a), rb = find(b);
        if (ra == rb) return false; // 이미 같은 길드
        if (rank[ra] < rank[rb]) { int t = ra; ra = rb; rb = t; }
        parent[rb] = ra;
        if (rank[ra] == rank[rb]) rank[ra]++;
        return true;
    }

    boolean isAlly(int a, int b) { return find(a) == find(b); }
}
```

### 월드 연결 검증

맵 생성 과정에서 통로를 하나씩 추가하며 두 방이 이미 연결되어 있는지 확인할 수 있다. 서로 다른 집합만 연결하면 Cycle 없는 Maze를 만들 수 있고, 모든 방이 하나의 집합인지 확인해 도달 가능성을 검증할 수 있다.

```text
Room 생성: 각 방 MakeSet
통로 후보 (A, B):
  Find(A) != Find(B) → 통로 생성 + Union
  Find(A) == Find(B) → Cycle 생성 여부에 따라 Skip
```

### 서버 Cluster 병합

Offline 장애 분석에서 서버 간 통신 성공 Edge를 합쳐 독립된 Network Component를 찾을 수 있다. 하지만 시간에 따라 Edge가 사라지는 Online 상태라면 Snapshot별로 다시 계산하거나 Offline Query 기법이 필요하다.

동시 Union과 Find는 일반 배열 구현에서 자동으로 Thread-safe하지 않다. 두 Root를 찾은 뒤 다른 Thread가 Parent를 바꾸면 Size가 잘못 합산될 수 있다. Partition별 단일 Writer, Lock, Batch 처리처럼 일관된 소유 정책을 둔다. Lock-free DSU는 가능하지만 단순 CAS 몇 번으로 끝나는 문제가 아니므로 검증된 구현이 필요하다.

## 14. 자주 하는 오해

- **Union-Find는 실제 연결 경로를 저장한다**: Parent는 대표 검색용이며 원래 Edge 경로가 아니다.
- **연산은 엄밀히 O(1)이다**: 두 최적화를 쓰면 분할 상환 `O(α(n))`이다.
- **Union은 입력 Node를 바로 연결한다**: 먼저 각 Node의 Root를 찾아 Root끼리 합쳐야 한다.
- **Rank는 항상 현재 실제 높이다**: 경로 압축 뒤에는 높이 상한을 위한 정보로 봐야 한다.
- **방향 Graph Cycle도 Find 결과만 비교하면 된다**: 이 방법은 무방향 연결성에 해당한다.
- **Edge 삭제는 Parent를 되돌리면 된다**: 경로 압축과 여러 Edge 때문에 단순 복원이 불가능하다.
- **Find는 읽기 전용이다**: 경로 압축을 수행하는 Find는 Parent 배열을 수정한다.

## 15. 면접 질문

### Q1. 길드 동맹 시스템에서 Union-Find가 적합한 경우와 BFS/DFS가 필요한 경우를 어떤 기준으로 구분하는가?

**30초 답변:** Union-Find는 동맹 여부, 즉 같은 집합인지만 판단할 때 적합합니다. 실제 경로나 최단 거리, 특정 멤버 탐색이 필요하면 BFS/DFS가 필요합니다. 두 연산의 비용 차이는 O(α(n)) vs O(V+E)이며 이 비교가 선택 기준입니다.

**1~2분 답변:** 구체적으로, 길드 동맹 여부 확인은 Union-Find가 O(α(n))으로 최적입니다. 반면 길드 멤버 목록 조회, 특정 플레이어까지 최단 경로, 동맹 네트워크 시각화 등은 경로 정보가 필요하므로 Graph 탐색이 필수입니다. Union-Find는 경로 자체를 저장하지 않습니다. parent는 대표자 포인터일 뿐이며 원래 Edge 정보가 없습니다. 경로 복원이 필요한 순간이 Union-Find를 Graph 탐색으로 교체해야 하는 신호입니다.

### Q2. 경로 압축이 Find를 수정하는 부수 효과가 Rollback 요구와 충돌할 때 어떻게 설계하는가?

**30초 답변:** 경로 압축은 find() 호출 시 parent를 직접 갱신합니다. Rollback이 필요하면 이 갱신을 되돌려야 하므로 경로 압축을 포기하고 Union by Size/Rank만 사용합니다. 또는 변경 이력 Stack을 유지하는 방법을 선택합니다.

**1~2분 답변:** Rollback Union-Find(DSU with rollback)는 경로 압축을 제거하고 변경된 (node, oldParent, oldRank) 쌍을 Stack에 기록합니다. 롤백 시 Stack을 역순으로 복원합니다. 복잡도는 경로 압축 없이 Union by Rank만 사용하므로 O(log n)입니다. 온라인 쿼리(실시간 동맹 변경)보다 오프라인 배치 처리나 트랜잭션 취소 시나리오에 적합합니다.

### Q3. Union by Size와 Union by Rank 중 어떤 상황에서 어느 쪽을 선택하고, 실제 높이와 Rank가 달라질 때 어떤 문제가 생기는가?

**30초 답변:** Union by Size는 집합 크기를 추적하므로 크기 쿼리가 필요하면 선택합니다. Rank는 경로 압축 후 실제 높이와 달라질 수 있지만 이는 정상 동작으로 상한만 보장합니다. 성능 차이는 미미하므로 크기 정보 필요 여부가 실질적인 선택 기준입니다.

**1~2분 답변:** Union by Rank에서 Rank는 경로 압축 후 실제 높이가 아닌 상한값입니다. 압축 후에도 Rank를 낮추지 않는 것은 의도된 설계로, 재계산 비용을 줄입니다. 실제 높이가 중요한 로직에 Rank를 사용하면 부정확한 결과가 나올 수 있습니다. Union by Size는 크기를 정확히 유지하므로 길드 최대 멤버 수 쿼리, 큰 집합에 작은 집합을 합치는 부하 분산 시나리오에서 더 직관적입니다.

### Q4. 동시 길드 동맹 요청이 들어올 때 Union-Find에서 발생할 수 있는 Race Condition은 무엇이고 어떻게 대응하는가?

두 Thread가 각자 Find를 완료하고 Union 직전에 다른 Thread가 Parent를 바꾸면 Size가 잘못 합산되거나 같은 Root에 중복 Union이 발생할 수 있습니다. 가장 단순한 대응은 길드 ID 범위별 Partition 락을 두고 단일 Writer가 Union을 처리하는 것입니다. Lock-free DSU는 이론상 가능하지만 CAS 몇 번으로 끝나는 문제가 아니므로 검증된 구현이 아니면 도입하지 않습니다. 실무에서는 동맹 요청을 Queue에 넣고 단일 Worker가 순차 처리하는 방식이 가장 안전합니다.

### Q5. Edge 삭제가 필요한 동맹 탈퇴 요청이 실시간으로 들어올 때 Union-Find만으로 처리할 수 없는 이유는 무엇이고 대안을 어떻게 선택하는가?

Union-Find는 집합을 합칠 때 이전 경계 정보를 잃습니다. 경로 압축이 원래 Edge 구조를 덮어쓰기 때문에 특정 Edge를 제거한 뒤 Component가 어떻게 분리되는지 Parent 배열만으로 판단할 수 없습니다. 대안 선택 기준은 두 가지입니다. 탈퇴가 드물고 Offline 처리가 가능하면 Query를 역순으로 처리해 삭제를 추가로 바꾸는 Offline 기법을 씁니다. 실시간이 필요하면 실제 Graph를 별도 보존하고 탈퇴 후 BFS로 재계산하거나, Dynamic Connectivity 자료구조를 도입합니다.

### Q6. Kruskal에서 Union-Find를 교체하거나 제거해야 하는 상황은 언제인가?

Kruskal은 Edge를 가중치순 정렬 후 Cycle 없이 선택하므로 정적 Graph에서는 Union-Find가 적합합니다. 그러나 Edge가 실시간으로 추가·삭제되는 환경에서는 매 변경마다 MST를 재계산해야 합니다. 이 경우 Dynamic MST 알고리즘이나, 변경 빈도가 낮으면 주기적 배치 재계산으로 교체합니다. 또한 분산 환경에서 각 노드가 독립 Partition을 소유하는 경우 Union-Find의 전역 배열 공유가 병목이 됩니다. 이때는 Partition별 로컬 Union-Find를 두고 Cross-Partition Edge만 별도 처리하는 계층 구조를 설계합니다.

## 16. 예상 꼬리질문

- 길드 ID가 불연속 정수이거나 신규 길드가 런타임에 추가될 때 Parent 배열 초기화 전략을 어떻게 바꾸나요?
  > 배열 대신 HashMap을 사용해 Key로 길드 ID, Value로 Parent ID를 저장합니다. `MakeSet` 시점에 `map.put(id, id)`로 초기화하므로 불연속 ID와 런타임 추가를 모두 수용합니다. 조회 빈도가 높아 HashMap 오버헤드가 문제가 되면, 신규 길드 ID를 연속 정수로 매핑하는 외부 Index를 두고 내부는 배열 기반으로 유지합니다.
- 동맹 인원 수 상한 정책을 Union 시점에 강제해야 할 때 Union by Size와 Union by Rank 중 어느 쪽이 유리하고 그 이유는 무엇인가요?
  > Union by Size가 유리합니다. Size는 Root에서 현재 집합의 실제 원소 수를 정확히 유지하므로 Union 전에 `size[rootA] + size[rootB] > MAX_ALLY_SIZE` 조건을 즉시 확인할 수 있습니다. Union by Rank는 높이의 상한을 나타내는 메타데이터로 실제 원소 수와 다를 수 있어 인원 상한 판단에 직접 사용하기 어렵습니다.
- 경로 압축을 활성화한 상태에서 동시 Find가 같은 Node에 발생하면 Parent 배열에 어떤 쓰기 충돌이 생기고, 이를 방치해도 되는 이유 또는 방치하면 안 되는 조건은 무엇인가요?
  > 두 스레드가 동시에 경로 압축을 수행하면 같은 노드의 parent를 서로 다른 값으로 쓸 수 있습니다. 그러나 경로 압축의 목표는 어느 조상이든 결국 동일한 Root에 도달하는 것이므로, Java나 C#의 메모리 모델에서 Word-size 쓰기가 원자적이면 양쪽 모두 유효한 Root를 기록하게 됩니다. 이를 방치해도 되는 조건은 Find가 멱등이고 결과의 정확성만 요구되는 경우입니다. 방치하면 안 되는 조건은 Size나 Rank 값을 읽어 Union 결정에 사용하는 경우로, Parent 변경과 Size 갱신이 원자적으로 이뤄지지 않으면 Size가 잘못 합산될 수 있습니다.
- 읽기 요청이 많은 환경에서 경로 압축 Find의 상태 변경 때문에 캐시 레이어 또는 Read-Only Replica와 연동할 수 없는 시나리오를 설명하고 어떻게 우회하나요?
  > 경로 압축 Find는 Parent 배열을 수정하므로 읽기 전용 복제본이나 캐시에서는 실행할 수 없습니다. Read-Only Replica에서 Find를 호출하면 Parent 갱신 쓰기가 실패해 예외가 발생하거나 최악의 경우 데이터 불일치가 생깁니다. 우회 방법은 두 가지입니다. 첫째로 경로 압축을 제거하고 Union by Rank만 사용하면 Find가 실제로 읽기 전용이 됩니다. 둘째로 Snapshot을 사전에 완전 압축된 상태로 생성해 Read-Only 환경에 배포하면 조회 시 추가 압축이 불필요합니다.
- 서버 클러스터 장애 분석에서 연결 요소 수가 갑자기 증가했을 때, Union-Find 카운터 감소 로직의 버그와 실제 네트워크 단절 중 어느 쪽인지 어떻게 구분해 디버깅하나요?
  > Union 성공 시 연결 요소 수를 1 감소시켜야 하는데, Union 함수가 이미 같은 집합인 경우 false를 반환하면 카운터를 감소시키지 않아야 합니다. 카운터 버그라면 Union 호출 로그에서 이미 같은 집합에 Union을 시도한 기록이 없는데도 카운터가 감소하지 않거나 Union 횟수와 카운터 감소 횟수가 불일치합니다. 실제 네트워크 단절이라면 특정 시각 이후 Edge 추가 이벤트가 줄고 네트워크 지표에서 패킷 손실이 나타납니다. Union 호출 시 (시각, nodeA, nodeB, beforeRoot, afterRoot, componentCount)를 로그로 남기면 두 경우를 명확히 구분할 수 있습니다.
- 퀘스트 의존성 그래프에서 특정 퀘스트 완료 조건을 트랜잭션 단위로 취소해야 할 때 Rollback Union-Find를 도입하면 감수해야 하는 성능 비용은 얼마이고, 그 비용이 허용 가능한 상황의 판단 기준은 무엇인가요?
  > 경로 압축을 제거하고 Union by Rank만 사용하므로 Find 복잡도가 O(α(n))에서 O(log n)으로 증가합니다. 롤백 시 기록된 변경 Stack을 역순으로 복원하는 비용이 Union 당 O(1) 추가됩니다. 이 비용이 허용 가능한 상황은 Union·Find 연산보다 롤백 트랜잭션이 드물게 발생하고, O(log n) 성능이 SLA를 만족하는 경우입니다. 퀘스트 수가 수천 개 이하이면 O(log n)과 O(α(n))의 실측 차이는 미미하므로 대부분의 게임 서버에서 허용 가능합니다.
- 멀티스레드 환경에서 Find와 Union을 각각 Lock-free로 구현할 수 없는 이유를 CAS 연산 관점에서 설명하고, 실무에서 Lock-free DSU 도입을 거절해야 하는 기준은 무엇인가요?
  > Find에서 경로 압축은 여러 노드의 Parent를 순차적으로 갱신하는데, 각 CAS는 개별 노드에 대해 원자적이지만 여러 노드에 걸친 변경 전체가 원자적이지 않습니다. 다른 스레드가 그 사이에 Union을 수행하면 Root가 바뀌어 이미 CAS한 노드가 새 Root를 가리키지 않는 불일치가 생깁니다. Union도 두 Root를 찾은 뒤 Parent를 바꾸는 두 단계가 필요한데, 그 사이에 다른 Union이 개입하면 Size가 이중 계산될 수 있습니다. 실무에서 Lock-free DSU 도입을 거절해야 하는 기준은 검증된 구현체가 없고 CAS 실패 재시도 루프가 고경합 시 Livelock으로 이어질 수 있으며, Lock 기반 구현의 성능이 SLA를 만족하는 경우입니다.

## 17. 30초 모범답변

> Union-Find는 서로소 집합을 대표 Root로 관리하며 Find로 소속 집합을 찾고 Union으로 두 집합을 합칩니다. 경로 압축과 Size 또는 Rank 기준 결합을 함께 쓰면 연산이 분할 상환 `O(α(n))`으로 사실상 상수에 가깝습니다. 무방향 Graph의 연결 여부, Cycle 판정, Kruskal에 유용하지만 실제 경로나 Edge 삭제는 지원하지 않습니다.

## 18. 1~2분 확장답변

> Union-Find는 각 원소가 Parent를 따라 대표 Root에 도달하는 Forest 형태로 서로소 집합을 관리합니다. Find는 Root를 반환하고, Union은 두 원소의 Root를 찾아 하나를 다른 쪽 아래에 연결합니다. 단순하게 연결하면 Tree가 편향될 수 있으므로 Find 경로의 Node를 Root에 직접 붙이는 경로 압축과 작은 Tree를 큰 Tree 아래에 붙이는 Size·Rank 기준 결합을 사용합니다. 두 최적화를 함께 쓰면 여러 연산의 분할 상환 복잡도가 `O(α(n))`입니다.
>
> 무방향 Graph에서 Edge 양 끝의 Root가 이미 같으면 그 Edge는 Cycle을 만들고, Kruskal은 이 판정으로 최소 신장 트리를 구성합니다. 다만 Parent Tree는 실제 Graph 경로가 아니어서 경로 복원이나 거리 조회는 할 수 없습니다. 집합을 합치면서 이전 경계를 잃기 때문에 Edge 삭제와 Component 분할도 기본적으로 지원하지 않습니다. 게임 서버에서는 추가만 있는 월드 연결이나 Offline 동맹 Group 처리에 적합하지만 탈퇴가 빈번하면 실제 Graph나 다른 구조가 필요합니다.

## 19. 핵심 요약

- Union-Find는 서로소 집합을 Root가 있는 Parent Forest로 표현한다.
- MakeSet은 독립 집합 생성, Find는 대표 검색, Union은 두 Root 병합을 수행한다.
- 경로 압축은 Find 경로를 Root에 직접 연결한다.
- Size·Rank 기준 결합은 작은 Tree를 큰 Tree 아래에 붙여 높이를 억제한다.
- 두 최적화를 함께 쓰면 연산은 분할 상환 `O(α(n))`, 공간은 `O(n)`이다.
- 무방향 연결 여부, Cycle 판정, 연결 요소 수, Kruskal에 적합하다.
- 실제 경로·거리·이웃, 방향 Cycle, 기본 Edge 삭제는 지원하지 않는다.
- 경로 압축 Find는 상태를 수정하며 동시성과 Rollback 요구를 별도로 고려한다.

## 한 줄 정리

> Union-Find는 경로 압축과 크기 기반 결합으로 “같은 집합인가”와 “두 집합을 합쳐라”를 거의 상수 시간에 처리한다.
