---
difficulty: 3
reading_time: 25분
interview_frequency: 4
importance: 4
---

# 06. Backtracking

> 게임 서버·백엔드 개발자를 위한 CS 면접 교재

## 학습 목표

- 재귀 호출 스택에서 상태가 복구되지 않는 버그를 발견했을 때, Backtracking 불변식(선택→탐색→복구)의 어느 단계가 깨졌는지 진단할 수 있다.
- DFS와 Backtracking의 실행 흐름 차이를 바탕으로, 주어진 문제가 완전 탐색 DFS로 충분한지 Backtracking Pruning이 필요한지 판단할 수 있다.
- 조합·순열에서 방문 상태와 중복 제거를 올바르게 구현할 수 있다.
- 지수적 탐색에 시간·Node Budget과 Fallback을 적용할 수 있다.

## 1. 개요

Backtracking은 후보를 하나 선택해 부분 해를 만들고, 더 진행할 수 없거나 해가 될 가능성이 없으면 선택을 취소한 뒤 다른 후보를 시도하는 탐색 방식이다.

```text
현재 상태
   ↓ choose
후보를 상태에 반영
   ↓ validate
가능하면 재귀 탐색
   ↓ return
선택을 정확히 복구
```

모든 후보를 무작정 끝까지 만드는 완전 탐색과 달리, 중간 상태에서 불가능함을 판단하면 그 아래 Subtree 전체를 건너뛴다. 이를 Pruning 또는 가지치기라고 한다.

## 2. 왜 필요한가

순열, 조합, 배치, 제약 충족 문제는 가능한 경우가 매우 많다. 원소 `n`개의 모든 순열은 `n!`, 각 원소의 선택·미선택 조합은 `2ⁿ`개다. 입력이 조금만 커져도 전체 열거가 어렵다.

Backtracking은 다음 문제에 적합하다.

- 가능한 모든 조합·순열 생성
- N-Queens, Sudoku와 같은 제약 충족
- 합이 Target이 되는 후보 조합
- 특정 조건의 경로 찾기
- Party 역할·Skill 조합 탐색
- 작은 입력의 최적 배치와 반례 탐색

Pruning이 많은 실제 입력에서는 빠를 수 있지만 최악 시간은 여전히 지수적이다. “가지치기를 하므로 빠르다”가 아니라 입력 상한과 Pruning 효과를 분석해야 한다.

## 3. 쉬운 예시: 숫자 조합 찾기

1부터 4 사이 숫자 중 합이 정확히 3이 되는 모든 조합을 찾는 문제다. 선택한 숫자를 path에 추가하고, 목표 합을 달성하면 저장하고, 초과하면 중단하며, 재귀가 돌아올 때 path에서 제거한다.

```csharp
List<List<int>> results = new();

void FindCombinations(int start, int target, List<int> path)
{
    if (target == 0)          // 합이 정확히 맞으면 저장
    {
        results.Add(new List<int>(path));
        return;
    }

    for (int i = start; i <= 4; i++)
    {
        if (i > target) break;   // 이미 초과 → 더 큰 수는 불필요 (Pruning)

        path.Add(i);             // Choose: 후보 선택
        FindCombinations(i + 1, target - i, path);   // 재귀 탐색
        path.RemoveAt(path.Count - 1);  // Undo: 선택 취소
    }
}

FindCombinations(1, 3, new List<int>());
// 결과: [1,2], [3]
```

`path.Add` → 재귀 → `path.RemoveAt`이 Choose→Recurse→Undo의 최소 구조다. `if (i > target) break`가 불가능한 Branch를 잘라내는 Pruning이다.

## 4. DFS와 Backtracking의 차이

DFS는 Graph나 Tree를 깊이 우선으로 방문하는 순회 순서다. Backtracking은 선택 상태를 변경하고, 제약을 검사하며, 돌아올 때 상태를 복구하는 문제 해결 Pattern이다. Backtracking은 대개 DFS 형태로 구현하지만 모든 DFS가 Backtracking은 아니다.

| 구분 | DFS | Backtracking |
|------|-----|--------------|
| 탐색 범위 | 연결된 모든 Vertex를 빠짐없이 방문 | 제약 위반 또는 Bound 초과 Branch는 건너뜀 |
| 상태 복구 여부 | visited를 되돌리지 않음 (전역 방문 기록 유지) | Choose 전 상태로 반드시 Undo해야 함 |
| 목적 | Graph·Tree 순회 및 연결성 확인 | 제약을 만족하는 후보 조합·배치·경로 탐색 |
| 메모리 사용 | 재귀 깊이 O(d), visited 배열 O(V) | 재귀 깊이 O(d), 현재 경로 O(d), 결과 O(출력 크기) |
| 방문 배열 의미 | 전체 탐색에서 한 번 방문한 Vertex 표시 | 현재 경로에서만 유효, 복귀 시 해제 |
| 대표 용도 | 연결 요소 탐색, 위상 정렬, 최단 경로 전처리 | 순열·조합, N-Queens, Sudoku, Party 배치 |

Graph DFS의 `visited`는 보통 한 번 방문한 Vertex를 다시 방문하지 않게 유지한다. 순열 Backtracking의 `used`는 현재 경로에서만 사용을 막고 재귀가 돌아오면 해제해야 한다. 같은 이름의 방문 배열이라도 의미와 수명이 다르다.

## 5. 기본 Template과 불변식

```csharp
void Search(State state)
{
    if (IsComplete(state))
    {
        SaveAnswer(state);
        return;
    }

    foreach (var candidate in GetCandidates(state))
    {
        if (!CanChoose(state, candidate))
            continue;

        Choose(state, candidate);
        Search(state);
        Undo(state, candidate);
    }
}
```

핵심 불변식은 `Search` 호출 전과 반환 후 외부에서 관찰하는 상태가 같아야 한다는 것이다. 한 후보 탐색이 다음 후보에 영향을 남기면 탐색 Tree가 오염된다.

```text
Before candidate A: path=[1], used={1}
Choose A:           path=[1,A], used={1,A}
Recurse
Undo A:             path=[1], used={1}  ← 정확히 복원
Try candidate B
```

예외, Early Return, Timeout이 발생해도 복구되어야 한다. 언어에 따라 `try/finally`나 Scope 기반 Guard를 사용할 수 있다. 단순 재귀에서도 `Choose`와 `Undo`를 붙여 배치해 대칭성을 눈에 보이게 한다.

## 6. 순열 생성

서로 다른 원소 `n`개 중 모든 순열을 만든다. 현재 경로에 이미 사용한 원소를 `used`로 표시한다.

```csharp
void Permute(int[] values, List<int> path, bool[] used)
{
    if (path.Count == values.Length)
    {
        results.Add(path.ToArray());
        return;
    }

    for (int i = 0; i < values.Length; i++)
    {
        if (used[i]) continue;

        used[i] = true;
        path.Add(values[i]);

        Permute(values, path, used);

        path.RemoveAt(path.Count - 1);
        used[i] = false;
    }
}
```

결과를 저장할 때 `path` 자체의 참조를 저장하면 이후 변경으로 모든 결과가 같아질 수 있다. Snapshot을 복사해야 한다.

순열 개수는 `n!`이고 각 결과를 길이 `n`으로 복사하면 출력 비용까지 `O(n·n!)`이다. 모든 결과를 반환해야 하는 문제에서는 출력 크기보다 빠를 수 없다. 재귀 Stack과 현재 경로는 O(n), 모든 결과 저장 공간은 O(n·n!)이다.

## 7. 조합 생성

`n`개 중 `k`개를 순서 없이 고를 때는 다음 탐색 시작 Index를 전달한다. 이미 고려한 앞쪽 원소를 다시 선택하지 않아 `[1,2]`와 `[2,1]` 같은 중복을 막는다.

```csharp
void Combine(int[] values, int start, int k, List<int> path)
{
    if (path.Count == k)
    {
        results.Add(path.ToArray());
        return;
    }

    int need = k - path.Count;
    for (int i = start; i <= values.Length - need; i++)
    {
        path.Add(values[i]);
        Combine(values, i + 1, k, path);
        path.RemoveAt(path.Count - 1);
    }
}
```

`i <= n - need`는 남은 원소 수가 필요한 수보다 적은 Branch를 시작하지 않는 Pruning이다. 조합 수는 `C(n,k)`이고 결과 복사까지 O(k·C(n,k))가 든다.

문제에서 순서가 의미가 있는지 먼저 확인한다. Party 구성원 집합은 조합에 가깝고, Skill 실행 순서는 순열에 가깝다.

## 8. Pruning의 원칙

Pruning은 해당 Branch 아래에 유효한 답 또는 현재 최적보다 나은 답이 절대로 없음을 보장할 때만 안전하다.

### 제약 위반 Pruning

현재 합이 제한을 초과하고 남은 수가 모두 음수가 아니라면 더 진행해도 복구할 수 없으므로 중단한다. 음수가 가능하면 합이 초과했다는 이유만으로 중단할 수 없다.

### 남은 후보 수 Pruning

선택해야 할 수보다 남은 후보가 적으면 중단한다.

### Bound Pruning

최적화 문제에서 현재 값과 남은 후보로 만들 수 있는 낙관적 상한조차 현재 Best보다 좋지 않으면 중단한다. 이를 Branch and Bound라고 한다.

```text
currentScore + optimisticRemaining <= bestScore
→ 이 Branch에서는 Best 갱신 불가능
→ prune
```

Bound는 실제 가능한 최대보다 작게 잡으면 최적해를 잘라 오답이 된다. 최대화 문제의 상한은 실제 달성 가능 값보다 같거나 커야 안전하다.

### 후보 순서

좋은 답을 빨리 발견하면 Best Bound가 강해져 이후 Branch를 더 많이 자를 수 있다. 유망한 후보를 먼저 시도하는 Heuristic은 최악 복잡도를 바꾸지 않아도 실제 성능을 크게 개선한다.

## 9. 중복 후보 처리

입력 값에 중복이 있으면 Index가 달라도 같은 결과가 생성될 수 있다. 정렬 후 같은 재귀 Level에서 이전과 같은 값을 건너뛰는 방식이 흔하다.

```csharp
Array.Sort(values);

for (int i = start; i < values.Length; i++)
{
    if (i > start && values[i] == values[i - 1])
        continue;

    // choose values[i]
}
```

`i > start` 조건이 중요하다. 같은 Level의 동일 선택만 건너뛰며, 더 깊은 Level에서 같은 값을 다시 사용하는 것이 허용되는 문제까지 막지 않는다.

중복 제거 규칙은 문제에 따라 달라진다.

- 각 Index를 한 번만 사용하는가?
- 같은 Value의 여러 복사본을 구분하는가?
- 후보를 무제한 재사용할 수 있는가?
- 결과의 순서를 구분하는가?

정렬과 `Set`으로 결과만 Dedup할 수도 있지만 중복 Branch를 모두 탐색하고 Memory까지 사용하므로 가능한 한 생성 단계에서 제거한다.

## 10. N-Queens 예시

`n × n` Board에 Queen `n`개를 서로 공격하지 않게 배치한다. 한 Row에 하나씩 놓는다면 현재 Row만 상태 깊이로 사용하고, 이미 사용한 Column과 두 대각선을 Set이나 Boolean 배열로 관리한다.

```text
column = c
diag1  = row - c
diag2  = row + c
```

```text
Row 0: 후보 Column 선택
   ↓
Column·Diagonal 충돌 검사 O(1)
   ↓
표시 → 다음 Row → 해제
```

매 배치마다 이전 Queen 전체를 Scan하는 대신 세 방문 구조로 충돌을 O(1)에 확인한다. 추가 공간은 O(n) 수준이다. 탐색 최악은 여전히 매우 크지만 제약 Pruning으로 단순 `nⁿ` 배치보다 크게 줄어든다.

## 11. 정당성 설명

Backtracking이 모든 해를 찾는 이유는 탐색 Tree의 각 Level에서 가능한 후보를 빠짐없이 시도하고, 안전하다고 증명된 Branch만 제거하기 때문이다.

1. 각 완전한 선택 Sequence는 탐색 Tree의 Root-to-Leaf 경로 하나에 대응한다.
2. 모든 유효 후보를 Loop에서 탐색하므로 유효 경로를 누락하지 않는다.
3. Pruning 조건은 그 아래에 유효 해가 없음을 보장한다.
4. Undo로 다음 Branch가 독립된 올바른 상태에서 시작한다.

중복 제거가 있다면 동일 결과의 대표 경로 하나는 남는다는 점도 설명해야 한다.

## 12. 시간·공간 복잡도

Branching Factor를 `b`, 최대 깊이를 `d`라고 하면 거친 상한은 O(bᵈ)다. 부분집합은 O(2ⁿ), 순열은 O(n!), 조합 결과 수는 C(n,k)다.

실제 시간은 방문한 탐색 Node 수 × Node당 검사·복구 비용이다. Pruning은 방문 Node를 줄이지만 최악 상한이 그대로일 수 있다. 출력 문제는 결과 복사 비용도 포함한다.

공간은 보통 최대 재귀 깊이와 변경 상태에 비례한다. DFS 방식은 한 경로만 유지해 O(d)일 수 있지만 모든 결과를 저장하면 출력 크기만큼 추가된다.

Memoization을 붙일 수 있는지는 상태가 동일할 때 이후 결과도 동일한지에 달려 있다. 단순 경로 출력처럼 도달 경로 자체가 결과이면 상태 합치기가 어렵다. 같은 최적값만 필요하고 상태를 Compact하게 표현할 수 있다면 DP로 바뀔 수 있다.

## 13. 게임 서버·백엔드 실무 예시

### Party 역할 조합

Tank 1명, Healer 1명, Dealer 3명과 MMR 범위를 만족하는 Party를 찾는다고 하자. 후보를 역할별로 나누고 가장 후보가 적은 역할부터 선택하면 빠르게 실패를 발견할 수 있다.

```text
Choose Tank
  ↓ MMR·Region 조건 검사
Choose Healer
  ↓ 평균 MMR Bound
Choose Dealers
  ↓ 완성 Party 평가
```

그러나 온라인 Matchmaking에서 모든 조합을 끝까지 탐색하면 요청 폭증 시 지연이 무한히 늘 수 있다. 방문 Node 수나 시간 Budget을 두고, 초과하면 현재까지 가장 좋은 조합을 반환하거나 검색 범위를 완화해 다음 Cycle에 재시도한다.

### Dungeon·Puzzle 배치

Room Template을 Grid에 배치하며 문 연결, 겹침, 도달 가능 조건을 검사할 수 있다. 가장 제약이 강한 Cell이나 후보가 적은 Slot부터 선택하는 Minimum Remaining Values Heuristic은 실패 Branch를 일찍 드러낸다.

콘텐츠 생성처럼 Offline 작업은 더 긴 Budget을 쓸 수 있고 Seed를 고정해 재현 가능하게 한다. 실패 시 방문 Node와 마지막 선택 경로를 기록해 설정 오류를 진단한다.

### 서버 운영 원칙

Backtracking은 Tail Latency 위험이 크다. 다음을 명시한다.

- 입력 후보 수와 깊이 상한
- 탐색 Node·Wall-clock Budget
- Cancellation 확인 주기
- Budget 초과 시 Best-so-far·근사·재시도·거절 정책
- 후보 순서와 Random Seed의 결정성
- 방문 Node, Prune 이유별 횟수, 최대 깊이와 p99 지연

공유 상태를 직접 변경하며 탐색하면 다른 Thread가 중간 상태를 볼 수 있다. 요청별 Local 상태나 Snapshot을 사용하고, 전역 Best를 병렬 갱신한다면 동기화와 결정성을 별도로 설계한다.

## 14. 장점과 단점

### 장점

- 조합·순열과 복잡한 제약을 직관적으로 표현한다.
- 안전한 Pruning으로 많은 불가능한 경우를 생성 전에 제거한다.
- 한 경로만 유지해 전체 탐색 Tree보다 Memory 사용이 작다.
- 첫 해, 모든 해, 최적해 등 목적에 맞게 쉽게 변형할 수 있다.

### 단점

- 최악 시간은 지수적·Factorial이며 입력 증가에 매우 민감하다.
- Choose·Undo 비대칭은 찾기 어려운 상태 오염 Bug를 만든다.
- 잘못된 Pruning은 최적해나 유효해를 누락한다.
- 재귀 깊이와 결과 저장 Memory가 커질 수 있다.
- 실시간 요청에서 예측 불가능한 Tail Latency를 만들 수 있다.

## 15. 자주 하는 오해

- **Backtracking은 DFS와 같은 말이다**: DFS는 순회 순서, Backtracking은 선택·복구·Pruning Pattern이다.
- **Pruning을 하면 복잡도가 항상 다항식이 된다**: 최악 지수 상한은 남을 수 있다.
- **재귀 반환 시 Local 상태는 모두 자동 복구된다**: 공유 List·배열·Set 변경은 직접 Undo해야 한다.
- **결과에 현재 Path 참조를 넣으면 Snapshot이 저장된다**: 이후 변경되므로 복사해야 한다.
- **중복 결과는 마지막에 Set으로 지우면 충분하다**: Correct할 수 있지만 중복 탐색 비용은 그대로다.
- **합이 Target을 넘으면 항상 중단할 수 있다**: 음수 후보가 있으면 다시 줄어들 수 있다.
- **첫 해를 찾으면 그것이 최적해다**: 후보 순서에 따른 첫 해일 뿐, 최적성 증명이 필요하다.

## 16. 면접 질문

### Q1. 게임 서버에서 N명의 플레이어를 역할(Tank·Healer·Dealer)에 따라 파티로 자동 편성해야 합니다. Backtracking으로 구현할 때 어떤 문제가 생기고 어떻게 해결하겠습니까?

후보 조합이 많아질수록 탐색 시간이 지수적으로 증가하여 실시간 요청에서 Tail Latency가 폭증합니다. 해결 방법은 세 가지입니다. 첫째, MMR 범위 같은 제약을 빠르게 검사해 불가능한 Branch를 조기에 Pruning합니다. 둘째, 후보가 가장 적은 역할(Tank)부터 선택해 실패를 일찍 발견합니다. 셋째, 탐색 Node 수나 Wall-clock Budget을 두고 초과하면 현재까지 가장 점수가 높은 조합을 반환하거나 MMR 범위를 완화해 다음 Cycle에 재시도하는 Fallback을 둡니다.

### Q2. 재귀 Backtracking으로 구현된 퍼즐 솔버가 깊은 트리에서 스택 오버플로우를 일으킵니다. 근본 원인과 해결 방법을 설명하세요.

근본 원인은 두 가지입니다. 첫째, Pruning이 약해 실제 답과 무관한 Branch까지 깊이 탐색해 재귀 깊이가 한계를 넘습니다. 둘째, Choose·Undo 비대칭으로 상태가 오염되어 이미 불가능한 경로를 계속 탐색합니다. 해결 방법은 우선 Pruning 조건을 강화해 탐색 깊이 상한을 줄이는 것입니다. 그래도 깊이가 크면 재귀를 명시적 Stack으로 변환해 Heap에서 관리합니다. 서버 환경이라면 Thread Stack 크기를 늘리는 것보다 탐색 깊이 상한(`maxDepth`)을 설정하고 초과 시 실패를 반환하는 것이 안전합니다.

### Q3. Backtracking 코드에서 Choose와 Undo가 비대칭으로 구현된 경우, 어떤 증상이 나타나고 코드 리뷰에서 어떻게 잡아내나요?

Choose와 Undo가 비대칭이면 탐색이 진행될수록 상태가 누적 오염됩니다. 대표 증상은 세 가지입니다. 첫째, 이미 결과 List에 저장한 배열이 이후 재귀에 의해 바뀌어 모든 결과가 동일해집니다. 둘째, used 배열이 복구되지 않아 실제로는 가능한 후보가 선택 불가로 표시되고 결과가 누락됩니다. 셋째, 합계나 카운터가 증가만 하고 복구되지 않아 Pruning이 너무 일찍 발생합니다. 코드 리뷰에서는 Choose를 수행한 모든 변수에 대응하는 Undo가 정확히 반대 순서로 존재하는지 확인합니다. 또한 예외나 Early Return 경로에서 Undo가 우회되지 않는지 `try/finally`나 Scope Guard 적용 여부를 봅니다. 결과 저장 시 참조가 아닌 Snapshot 복사인지도 확인합니다.

### Q4. 아이템 뽑기 조합이나 던전 보상 구성처럼 입력 후보에 중복 값이 있는 경우, 같은 보상 조합이 여러 번 생성되는 버그를 어떻게 진단하고 수정하나요?

결과 List에 동일한 조합이 여러 번 들어있다면 같은 재귀 Level에서 동일한 값을 가진 다른 Index를 각각 선택해 중복 Branch가 생성된 것입니다. 진단은 탐색 중 선택 경로를 로그로 남겨 어느 Level에서 같은 값이 반복 진입하는지 확인합니다. 수정은 입력을 먼저 정렬하고 `i > start && values[i] == values[i-1]`이면 해당 Index를 건너뜁니다. `i > start` 조건이 반드시 필요한 이유는 더 깊은 Level에서 같은 값을 다시 사용하는 것은 허용해야 하기 때문입니다. 이 조건을 `i > 0`으로 잘못 쓰면 중복 제거가 과도해져 유효한 조합까지 누락됩니다.

### Q5. 매칭 서버에서 Backtracking 탐색이 평소에는 10ms 이내에 완료되다가 특정 입력에서만 타임아웃이 발생합니다. 어떤 순서로 원인을 찾겠습니까?

먼저 타임아웃이 발생한 요청의 입력 후보 수와 깊이를 확인합니다. Pruning이 평소보다 덜 발생하는 입력 패턴이 있는지 봅니다. 구체적으로는 방문 Node 수를 측정해 정상 요청과 비교하고, Prune 이유별 카운터가 타임아웃 요청에서 급감했는지 확인합니다. 원인이 Pruning 약화라면 후보 정렬 순서나 Bound 계산 로직을 검토합니다. 후보 수 자체가 급증했다면 입력 밸리데이션 또는 후보 사전 필터링 단계가 누락됐는지 봅니다. 단기 대응으로는 방문 Node Budget을 하드 상한으로 설정하고 초과 시 현재까지 가장 좋은 조합을 반환하는 Best-so-far Fallback을 적용합니다. 재현 가능한 입력을 저장해 오프라인에서 탐색 트리를 시각화해 Pruning이 적용되는 지점을 분석합니다.

### Q6. 파티 편성 Backtracking을 여러 Thread에서 병렬로 돌릴 때, 전역 Best 갱신 과정에서 발생할 수 있는 문제와 결정성 확보 방법을 설명하세요.

전역 Best를 여러 Thread가 동시에 읽고 쓰면 Race Condition이 발생해 낮은 점수의 조합이 Best로 덮어씌워질 수 있습니다. 또한 Thread 스케줄링 순서에 따라 동일 입력에서 다른 결과가 나와 재현이 어렵습니다. 해결은 두 단계입니다. 첫째, 전역 Best는 Atomic CAS나 Lock으로 보호하며, 현재 값보다 개선된 경우에만 갱신합니다. 둘째, 결정성 확보를 위해 각 Thread에 고정 Seed를 부여하거나 탐색 공간을 입력 Hash 기반으로 분할해 동일 입력이면 항상 동일한 공간을 탐색하도록 합니다. 실무에서는 병렬 탐색 결과를 취합할 때 타이브레이크 기준을 명시적으로 정의해 동점 시 어느 결과를 선택할지 결정론적으로 처리합니다.

## 17. 예상 꼬리질문

- 파티 편성 탐색에서 후보를 Tank 먼저 고를 때와 Dealer 먼저 고를 때 방문 Node 수가 얼마나 달라지나요?
- Branch and Bound의 낙관적 상한은 어떤 조건을 만족해야 하나요?
- Backtracking 결과를 메모리에 모두 저장할 수 없을 때 어떤 방식으로 처리하나요?
- 재귀에서 예외나 Early Return 시 Undo를 보장하려면 어떻게 하나요?
- Backtracking 탐색에서 같은 입력인데 결과가 달라지는 버그가 생겼습니다. 가장 먼저 무엇을 확인하나요?
- Backtracking을 DP로 바꿀 수 있는 조건은 무엇인가요?
- 병렬 탐색에서 전역 Best와 결정성을 어떻게 관리하나요?

## 18. 30초 모범답변

> Backtracking은 후보를 선택하고 재귀 탐색한 뒤 상태를 복구해 다른 후보를 시도하며, 유효해가 될 수 없는 Branch를 조기에 제거합니다. DFS는 탐색 순서이고 Backtracking은 선택·Undo·Pruning을 포함한 문제 해결 Pattern입니다. 최악은 `2ⁿ`이나 `n!` 같은 지수 시간이므로 안전한 가지치기, 후보 순서, 입력과 시간 Budget이 중요합니다.

## 19. 1~2분 확장답변

> Backtracking은 선택 공간을 Tree로 보고 현재 후보를 Path와 방문 상태에 반영한 뒤 깊이 탐색하고, 반환 시 정확히 Undo합니다. 각 호출 전후의 외부 상태가 같아야 다음 Branch가 독립적으로 탐색됩니다. 제약을 이미 위반했거나 낙관적 상한도 현재 Best보다 좋지 않으면 그 Subtree를 Pruning할 수 있지만, 그 아래에 답이 없다는 증명이 필요합니다.
>
> 순열은 used 배열로 현재 경로의 중복 사용을 막고 최악 n!, 조합은 시작 Index로 순서 중복을 제거하며 결과 수는 C(n,k)입니다. 입력 중복은 정렬 후 같은 Level의 같은 값을 건너뛸 수 있습니다. 게임 서버의 Party 조합 탐색에서는 후보가 적은 역할부터 보고 MMR Bound로 가지치기할 수 있지만 최악 지수 시간은 남습니다. 따라서 방문 Node·시간 상한, Cancellation과 Best-so-far Fallback을 두고 Prune 횟수와 p99 지연을 측정해야 합니다.

## 20. 핵심 요약

- Backtracking은 Choose→Validate→Recurse→Undo를 반복한다.
- DFS는 순회 순서이고 Backtracking은 상태 변경·복구·Pruning Pattern이다.
- 호출 전후 상태가 같아야 한다는 복구 불변식이 핵심이다.
- Pruning은 Branch 아래에 답이 없거나 Best 개선이 불가능할 때만 안전하다.
- 순열은 최악 n!, 부분집합은 2ⁿ이며 출력 복사 비용도 포함한다.
- 정렬과 Level별 Skip으로 중복 결과 생성을 줄일 수 있다.
- 후보 순서는 좋은 답과 실패를 빨리 찾아 Pruning 효과를 높인다.
- 실시간 서버에는 입력·Node·시간 Budget, Cancellation과 Fallback이 필수다.

## 한 줄 정리

> Backtracking은 선택을 되돌릴 수 있게 관리하며 불가능한 탐색 가지를 안전하게 잘라내는 제약 기반 DFS다.
