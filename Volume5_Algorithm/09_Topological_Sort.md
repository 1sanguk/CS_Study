---
difficulty: 4
reading_time: 25분
interview_frequency: 4
importance: 4
---

# 09. Topological Sort

> 게임 서버·백엔드 개발자를 위한 CS 면접 교재

## 학습 목표

- 위상 정렬의 DAG 전제와 결과의 의미를 설명할 수 있다.
- Kahn Algorithm의 진입 차수 갱신과 Cycle 판정을 설명할 수 있다.
- DFS 종료 순서 방식과 현재 경로를 이용한 Cycle 탐지를 설명할 수 있다.
- 의존 작업의 실행 순서·병렬 단계·최장 경로를 실무에 적용할 수 있다.

## 1. 개요

Topological Sort는 방향 Graph의 모든 Edge `u → v`에 대해 `u`가 `v`보다 먼저 나오도록 Vertex를 일렬로 배치하는 Algorithm이다. 선행 조건을 만족하는 실행 순서를 만든다.

```text
A → C ← B
    ↓
    D

가능한 순서: A, B, C, D
가능한 순서: B, A, C, D
불가능:      C, A, B, D
```

위상 정렬은 DAG(Directed Acyclic Graph), 즉 방향 Cycle이 없는 Graph에서만 전체 Vertex에 대해 가능하다. 결과는 일반적으로 하나가 아니며 관계가 없는 Vertex의 상대 순서는 자유롭다.

## 2. 왜 필요한가

“A가 끝나야 B를 실행할 수 있다” 같은 의존성을 처리하는 문제에 사용한다.

- Project Build와 Package Dependency
- 서버 Component 기동 순서
- Quest·Skill 선행 조건
- Batch Job Workflow
- 대학 과목 선수 조건
- Spreadsheet 수식 평가 순서

Cycle이 있으면 어떤 작업도 먼저 시작할 수 없는 모순이 생길 수 있다.

```text
Auth → DB Migration → Config
  ↑                    ↓
  └────────────────────┘

Auth는 Config를 기다리고,
Config는 Migration을 기다리고,
Migration은 Auth를 기다림
```

위상 정렬은 순서 생성뿐 아니라 의존 Cycle을 검출하는 Validation 도구다.

## 3. Graph 모델링

Edge 방향을 정확히 정해야 한다. “Task A가 Task B보다 먼저”라면 `A → B`로 둔다. 문제 입력이 “B를 하기 위한 선수 A”처럼 역방향으로 표현될 수 있으므로 문장을 Edge 의미로 다시 적는다.

진입 차수(In-degree)는 Vertex로 들어오는 Edge 수다. `A → B`라면 B의 진입 차수가 하나 증가한다. 진입 차수 0인 Vertex는 아직 처리되지 않은 선행 작업이 없다.

```text
A → C ← B
C → D

indegree[A] = 0
indegree[B] = 0
indegree[C] = 2
indegree[D] = 1
```

같은 Edge가 입력에 중복으로 들어오면 진입 차수도 두 번 증가한다. Domain에서 중복 의존을 하나로 봐야 한다면 입력 단계에서 Dedup해야 한다. 한쪽만 Dedup하면 차수가 맞지 않아 Cycle처럼 보일 수 있다.

## 4. Kahn Algorithm

진입 차수가 0인 모든 Vertex를 Queue에 넣는다. 하나를 꺼내 결과에 추가하고, 그 Vertex에서 나가는 Edge를 제거한 것처럼 이웃의 진입 차수를 감소시킨다. 새로 0이 된 이웃을 Queue에 넣는다.

```text
1. 모든 Vertex의 indegree 계산
2. indegree 0을 Queue에 삽입
3. Queue에서 Vertex를 꺼내 결과에 추가
4. 모든 다음 Vertex의 indegree 감소
5. 새로 0이 되면 Queue에 삽입
6. Queue가 빌 때까지 반복
```

```csharp
List<int> TopologicalSort(List<int>[] graph, int[] indegree)
{
    var queue = new Queue<int>();
    var order = new List<int>();

    for (int v = 0; v < graph.Length; v++)
        if (indegree[v] == 0)
            queue.Enqueue(v);

    while (queue.Count > 0)
    {
        int current = queue.Dequeue();
        order.Add(current);

        foreach (int next in graph[current])
        {
            indegree[next]--;
            if (indegree[next] == 0)
                queue.Enqueue(next);
        }
    }

    return order;
}
```

입력 진입 차수 배열을 직접 변경한다. 원본이 이후에도 필요하면 복사하거나 Algorithm 전용 배열을 만든다.

## 5. 단계별 예시

```text
Edge: A→C, B→C, C→D, B→E

초기 indegree
A=0, B=0, C=2, D=1, E=1
Queue=[A,B]
```

A를 처리하면 C의 차수는 1이다. B를 처리하면 C는 0, E도 0이 되어 Queue에 들어간다.

```text
Output=[A,B]
Queue=[C,E]
```

C를 처리하면 D가 0이 된다. 가능한 최종 순서는 `A,B,C,E,D` 또는 Queue 정책에 따라 `A,B,C,D,E` 등이다. 모든 Edge에서 출발 Vertex가 도착 Vertex보다 앞에 있으므로 둘 다 올바르다.

## 6. Kahn 방식의 정당성

현재 진입 차수가 0이라는 것은 아직 처리하지 않은 Vertex 중 해당 Vertex로 들어오는 선행 Edge가 없다는 뜻이다. 따라서 지금 결과 뒤에 배치해도 어떤 선행 조건도 위반하지 않는다.

Vertex를 제거한 뒤 나가는 Edge의 진입 차수를 줄이면 남은 Graph에서 새롭게 선행 조건이 모두 해결된 Vertex가 0이 된다. 이 과정을 반복해 안전한 Vertex를 하나씩 확정한다.

DAG에는 적어도 하나의 진입 차수 0 Vertex가 있다. 모든 Vertex의 진입 차수가 1 이상이면 임의 Vertex에서 부모 Edge를 계속 거슬러 올라갈 때 유한 Vertex 안에서 반복되어 Cycle이 생기기 때문이다.

## 7. Cycle 탐지

Queue가 비었는데 처리한 Vertex 수가 V보다 작다면 남은 Graph에는 Cycle이 있다.

```text
A → B → C
    ↑   ↓
    └───┘

초기에는 A만 indegree 0
A 제거 후 B와 C는 Cycle 안에서 서로 차수를 유지
Queue가 비고 처리 수 < V
```

Kahn 방식은 Cycle 존재를 쉽게 판단하지만 어떤 Edge들이 Cycle을 이루는지 바로 출력하지는 않는다. 미처리 Vertex Subgraph에서 DFS를 실행해 Back Edge와 Parent를 추적하면 구체적인 Cycle 경로를 복원할 수 있다.

운영 Validation에서는 “Cycle이 있습니다”보다 `QuestA → QuestB → QuestC → QuestA`를 보여 주는 것이 훨씬 유용하다.

## 8. DFS 방식

DFS에서 한 Vertex의 모든 다음 Vertex를 처리한 뒤 결과 Stack에 넣는다. 모든 DFS가 끝난 후 역순으로 꺼내면 위상 순서가 된다.

```csharp
void Dfs(int current)
{
    state[current] = Visiting;

    foreach (int next in graph[current])
    {
        if (state[next] == Visiting)
            throw new CycleDetectedException();
        if (state[next] == Unvisited)
            Dfs(next);
    }

    state[current] = Done;
    order.Add(current); // 종료 시 추가
}

order.Reverse();
```

상태를 세 가지로 구분한다.

- Unvisited: 아직 탐색하지 않음
- Visiting: 현재 DFS 경로에 있음
- Done: 모든 후손 탐색 완료

Visiting Vertex로 향하는 Edge는 Back Edge이며 방향 Cycle을 뜻한다. Done Vertex로 가는 Edge는 Cycle 증거가 아니다.

DFS 재귀 깊이는 최악 O(V)라 긴 Chain에서 Stack Overflow가 날 수 있다. 명시적 Stack으로 바꾸거나 Kahn 방식을 사용한다.

## 9. Kahn과 DFS 비교

| 항목 | Kahn | DFS 종료 순서 |
|---|---|---|
| 핵심 상태 | 진입 차수 + Queue | 3색 방문 + Stack |
| Cycle 판정 | 처리 수 < V | Visiting Back Edge |
| 병렬 가능 작업 | indegree 0 집합으로 명확 | 별도 계산 필요 |
| 구체적 Cycle 복원 | 추가 DFS 필요 | Parent로 자연스러움 |
| Stack Overflow | 없음 | 재귀 구현에서 가능 |
| 결과 순서 | Queue 정책 영향 | 인접 순서 영향 |

둘 다 인접 리스트에서 시간 O(V+E), 공간 O(V+E) Graph 외에 상태 O(V)를 사용한다.

## 10. 결과가 여러 개인 경우

동시에 진입 차수 0인 Vertex가 두 개 이상이면 둘 사이에는 현재 처리 순서를 강제하는 의존성이 없다. 여러 위상 순서가 존재할 수 있다.

항상 ID가 작은 Vertex를 먼저 출력해야 한다면 FIFO Queue 대신 Min Heap을 사용한다. 이 경우 Queue 연산 때문에 O((V+E) log V) 수준이 된다.

Kahn Algorithm에서 매 단계 진입 차수 0 후보가 정확히 하나라면 위상 순서가 유일하다. 후보가 여러 개였던 순간이 있으면 적어도 두 순서를 만들 수 있다. 단, 중복 Edge와 Graph 모델이 올바르다는 전제가 필요하다.

결정적인 순서는 Replay, Build Artifact 재현성, 테스트 안정성에 중요하다. “아무 위상 순서”가 논리적으로 충분해도 Tie-break를 명시할 수 있다.

## 11. 모든 위상 순서 열거

모든 가능한 순서를 요구하면 단일 Kahn 실행으로 끝나지 않는다. 현재 진입 차수 0인 후보 각각을 선택하고, 차수를 변경한 뒤 재귀 탐색하고 복구하는 Backtracking이 필요하다.

```text
choose zero-indegree vertex
→ decrease neighbors
→ recurse
→ restore indegrees
```

가능한 순서 수가 Factorial까지 커질 수 있으므로 출력 크기 자체가 매우 크다. 실무에서는 하나의 결정적 순서나 유일성 여부만 필요한 경우가 많다.

## 12. DAG에서의 DP와 최장 경로

위상 순서에서는 모든 선행 Vertex가 먼저 처리된다. 따라서 DAG의 상태 전이를 순서대로 Relax할 수 있다.

```text
earliestFinish[v]
= duration[v] + max(earliestFinish[parent])
```

음수 Edge가 있어도 DAG에는 Cycle이 없으므로 위상 순서로 단일 Pass 최단·최장 경로를 O(V+E)에 계산할 수 있다. Dijkstra의 음수 제한이 필요하지 않다.

전체 Workflow 완료 시간은 Critical Path, 즉 의존성을 따라 합이 가장 긴 경로로 결정된다. 각 작업의 가장 이른 시작·종료 시간을 계산해 병목 Task를 찾을 수 있다.

## 13. Level과 병렬 실행

현재 진입 차수 0인 모든 작업은 서로의 선행 조건이 아니므로 이론적으로 같은 단계에서 병렬 실행할 수 있다.

```text
Level 0: A, B
          \ /
Level 1:  C, E
           |
Level 2:  D
```

하지만 Graph 의존성이 없다는 것만으로 Runtime Resource 충돌까지 없다는 뜻은 아니다. 같은 DB Table, File, CPU·Memory 제한을 공유하면 별도 Scheduling 제약이 필요하다.

작업이 성공해야만 다음 진입 차수를 감소시키는지, 실패 시 후속 작업을 Skip·Retry할지도 Workflow Engine의 정책이다. 정적 위상 정렬과 동적 실행 상태를 구분한다.

## 14. 게임 서버·백엔드 실무 예시

### 서버 Component 기동

DB Connection이 준비된 뒤 Repository, 그 뒤 Match Service를 시작해야 한다고 하자.

```text
Config → DB → Repository → MatchService
   └────────→ Metrics
```

배포 전에 Graph를 위상 정렬하고 Cycle이면 기동을 거부한다. 같은 Level의 독립 Component는 병렬 초기화할 수 있지만 Resource 상한을 둔다. 종료 순서는 의존 방향의 역순이 자연스러운 경우가 많다.

### Quest·Skill 데이터 검증

선행 Quest를 Edge로 표현해 Cycle과 존재하지 않는 참조를 검증한다. 위상 순서대로 Unlock 조건 Cache를 만들 수 있다. 콘텐츠 Version이 바뀔 때 새 DAG를 완전히 검증한 뒤 Snapshot을 원자적으로 교체한다.

Cycle 메시지에는 구체적인 경로와 콘텐츠 ID를 포함한다. 단순히 처리 수가 부족하다는 로그만으로는 어느 설정을 고칠지 알기 어렵다.

### Build·Batch Workflow

각 Task의 Duration으로 Earliest Finish를 계산하고 Critical Path를 찾아 전체 Build 병목을 진단한다. 실제 실행은 실패·재시도·Timeout·중복 실행의 Idempotency를 추가로 설계해야 한다.

운영 지표로 Vertex·Edge 수, 최대 진입 차수, 동시에 Ready인 Task 수, Critical Path 길이, Cycle 검출 횟수와 Version별 검증 시간을 본다.

## 15. 구현 시 주의사항

- Edge 방향과 진입 차수 의미를 먼저 문장으로 정의한다.
- 중복 Edge를 허용할지, Dedup할지 일관되게 처리한다.
- Kahn이 입력 차수 배열을 변경한다는 점을 고려한다.
- 결과 길이가 V인지 확인해 Cycle을 판정한다.
- 모든 Vertex가 연결되어 있다고 가정하지 않는다.
- 결정성이 필요하면 Queue·인접 목록 Tie-break를 정한다.
- 재귀 DFS의 최대 깊이와 Stack을 확인한다.
- 잘못된 외부 Vertex ID를 내부 Index로 검증·매핑한다.

## 16. 장점과 단점

### 장점

- 의존성을 만족하는 실행 순서를 O(V+E)에 계산한다.
- Cycle을 검출해 잘못된 설정·Workflow를 사전에 차단한다.
- DAG DP, 최단·최장 경로와 병렬 Level 계산의 기반이 된다.
- Kahn과 DFS 중 진단·실행 요구에 맞는 방식을 선택할 수 있다.

### 단점

- Cycle이 있으면 전체 위상 순서가 존재하지 않는다.
- 일반적으로 결과가 하나가 아니어서 결정성 정책이 필요하다.
- 동적 의존 변경마다 차수와 순서를 다시 관리해야 한다.
- 정적 순서는 Runtime Resource 충돌과 실패 정책을 해결하지 않는다.

## 17. 자주 하는 오해

- **위상 정렬은 무방향 Graph에도 적용한다**: 선행 방향이 있는 DAG가 대상이다.
- **결과는 항상 하나다**: 관계없는 Vertex의 순서는 여러 개일 수 있다.
- **Queue가 비면 성공이다**: 처리한 Vertex 수가 V인지 확인해야 한다.
- **DFS에서 방문한 Vertex를 다시 만나면 모두 Cycle이다**: 현재 경로인 Visiting으로 향할 때 Cycle이다.
- **Kahn의 Queue는 처음에 하나만 들어간다**: 모든 진입 차수 0 Vertex를 넣는다.
- **위상 순서대로 실행하면 병렬 충돌도 없다**: 비의존 Resource 충돌은 별도다.
- **중복 Edge는 결과에 영향이 없다**: 진입 차수 계산과 감소가 일치하지 않으면 오작동한다.
- **Cycle 존재만 알리면 운영에 충분하다**: 실제 의존 경로를 제공해야 진단이 쉽다.

## 18. 면접 질문

### Q1. Topological Sort를 설명해 주세요.

DAG의 모든 Edge `u→v`에 대해 u가 v보다 먼저 나오도록 Vertex를 배치하는 Algorithm입니다. 선행 작업 순서와 의존 Cycle 검증에 사용하며 결과는 여러 개일 수 있습니다.

### Q2. Kahn Algorithm은 어떻게 동작하나요?

모든 진입 차수를 계산해 0인 Vertex를 Queue에 넣습니다. 하나씩 꺼내 결과에 추가하고 나가는 Edge의 도착 Vertex 차수를 줄입니다. 새로 0이 되면 Queue에 넣습니다.

### Q3. Kahn 방식으로 Cycle을 어떻게 판정하나요?

Queue가 빌 때까지 처리한 Vertex 수가 V보다 작으면 남은 Vertex는 서로의 진입 Edge를 없애지 못하는 Cycle에 포함되어 있습니다. 따라서 전체 위상 순서가 없습니다.

### Q4. DFS 방식은 어떻게 동작하나요?

각 Vertex의 모든 다음 Vertex를 DFS로 처리한 뒤 종료 순서에 추가하고 마지막에 뒤집습니다. 현재 경로인 Visiting Vertex를 다시 만나면 방향 Cycle입니다.

### Q5. 위상 순서가 유일한지는 어떻게 알 수 있나요?

Kahn Algorithm의 매 단계에서 선택 가능한 진입 차수 0 Vertex가 정확히 하나라면 유일합니다. 어느 단계든 후보가 여러 개면 그들의 순서를 바꾼 다른 결과가 가능합니다.

### Q6. DAG의 작업 완료 시간을 어떻게 계산하나요?

위상 순서대로 각 Task의 가장 이른 시작 시간을 선행 Task 종료의 최댓값으로 갱신합니다. 종료 시간은 시작 시간과 Duration의 합이며 전체 완료 시간은 Critical Path에 의해 결정됩니다.

## 19. 예상 꼬리질문

- DAG에는 왜 진입 차수 0 Vertex가 항상 있나요?
- ID가 가장 작은 위상 순서를 만들려면 무엇을 사용하나요?
- 모든 위상 순서를 구하면 복잡도는 어떻게 되나요?
- 구체적인 Cycle 경로는 어떻게 복원하나요?
- 중복 Dependency는 어떻게 처리하나요?
- DAG에서 음수 Edge 최단 경로를 어떻게 구하나요?
- 정적 의존 순서와 Runtime Scheduler의 차이는 무엇인가요?

## 20. 30초 모범답변

> Topological Sort는 DAG의 모든 방향 Edge가 앞에서 뒤로 향하도록 Vertex 순서를 만듭니다. Kahn Algorithm은 진입 차수 0인 Vertex를 Queue에서 처리하고 이웃 차수를 줄이며 O(V+E)에 동작합니다. 처리 수가 V보다 작으면 Cycle입니다. 결과는 여러 개일 수 있고, 서버 Component 기동이나 Quest 선행 조건 검증에 사용할 수 있습니다.

## 21. 1~2분 확장답변

> 위상 정렬은 선행 관계가 있는 방향 비순환 Graph에서 실행 가능한 순서를 구합니다. Kahn 방식은 모든 진입 차수를 계산하고 0인 Vertex를 Queue에 넣습니다. Vertex를 처리하며 나가는 Edge를 제거한 것처럼 이웃 차수를 줄이고 새로 0이 된 Vertex를 넣습니다. DAG에서는 남은 Graph에 항상 진입 차수 0 Vertex가 있으므로 모든 Vertex를 처리하며, 처리 수가 V보다 작으면 Cycle입니다.
>
> DFS 방식은 후손을 모두 처리한 종료 순서를 뒤집고, 현재 경로인 Visiting Vertex를 만나 Cycle을 찾습니다. 두 방식 모두 O(V+E)입니다. 여러 후보가 동시에 Ready면 위상 순서는 여러 개이며 결정성이 필요하면 Min Heap이나 안정된 Tie-break를 사용합니다. 게임 서버에서는 Component 기동과 Quest 설정을 배포 전에 검증하고, Cycle이 있으면 구체적인 경로를 로그로 남깁니다. 같은 Level의 Task는 병렬화할 수 있지만 Runtime Resource 충돌과 실패·재시도는 별도 Scheduler 정책입니다.

## 22. 핵심 요약

- 위상 정렬은 DAG의 모든 Edge 방향을 지키는 Vertex 순서다.
- Kahn은 진입 차수 0 Queue, DFS는 종료 순서 역순을 사용한다.
- 인접 리스트에서 두 방식 모두 O(V+E), 상태 공간 O(V)다.
- Kahn의 처리 수가 V보다 작거나 DFS에서 Back Edge를 만나면 Cycle이다.
- 여러 Ready Vertex가 있으면 결과가 여러 개일 수 있다.
- 위상 순서로 DAG DP, 최단·최장 경로와 Critical Path를 계산할 수 있다.
- 결정성, 중복 Edge, 원본 차수 변경과 재귀 깊이를 주의한다.
- 정적 의존성과 Runtime Resource·실패 Scheduling은 구분한다.

## 한 줄 정리

> Topological Sort는 Cycle 없는 의존 Graph에서 지금 실행해도 안전한 작업을 반복 선택해 전체 선행 순서를 만든다.
