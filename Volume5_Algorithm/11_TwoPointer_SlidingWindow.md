---
difficulty: 3
reading_time: 25분
interview_frequency: 4
importance: 4
---

# 11. Two Pointer와 Sliding Window


## 학습 목표

- 정렬된 배열이나 합이 단조적인 배열에서 Two Pointer를 적용할 수 있는지 판단하고, 양끝·같은 방향 중 어느 방식이 적합한지 결정할 수 있다.
- 고정 길이와 가변 길이 Sliding Window의 차이를 파악하고, 문제 조건(고정 k vs 조건 만족 최소·최대)에 따라 적합한 구현 패턴을 선택할 수 있다.
- Sliding Window 구현에서 루프가 O(n²)으로 느려지는 버그를 발견했을 때, Pointer 역행 여부를 확인하고 O(n) 단조 이동으로 수정할 수 있다.
- 합의 단조성, 중복, 시간 경계와 동시성 조건을 실무 사례에 적용할 수 있다.

## 1. 개요

Two Pointer는 배열이나 문자열의 두 위치를 일정한 규칙으로 이동해 후보 범위를 줄이는 기법이다. Sliding Window는 연속 구간의 왼쪽·오른쪽 경계를 움직이며 구간 상태를 증분 갱신하는 Two Pointer Pattern이다.

```text
Two Pointer, 양끝
[1, 2, 4, 7, 11]
 L              R

Sliding Window, 같은 방향
[a, b, c, d, e, f]
    L ----- R
       → →
```

두 Pointer가 배열을 한 방향으로 제한된 횟수만 이동하면 중첩 Loop처럼 보여도 전체 이동 수는 O(n)이다. 그러나 이 이동 규칙이 정답 후보를 놓치지 않는 단조성·연속성 근거가 필요하다.

## 2. 왜 필요한가

모든 연속 구간은 O(n²)개이고, 각 구간 합을 다시 계산하면 O(n³)까지 갈 수 있다. 이전 Window에서 나가는 원소를 빼고 들어오는 원소를 더하면 구간 상태를 O(1)에 갱신할 수 있다.

Two Pointer와 Sliding Window는 다음 문제에 자주 쓰인다.

- 정렬 배열에서 합이 Target인 두 수
- 두 정렬 배열 Merge
- 중복 제거·조건에 맞는 압축
- 길이 k 연속 구간의 최대 합
- 합이 S 이상인 최소 길이 구간: 양수 배열
- 중복 문자가 없는 가장 긴 부분 문자열
- 시간 구간의 요청 수·동시 접속 수

모든 구간 문제에 적용되지는 않는다. 조건이 Window 확장·축소에 따라 예측 가능하게 변해야 한다.

## 3. 양끝 Two Pointer: 두 수의 합

오름차순 정렬 배열에서 합이 Target인 두 원소를 찾는다. 왼쪽은 최솟값, 오른쪽은 최댓값에서 시작한다.

```csharp
bool HasPairWithSum(int[] values, int target)
{
    int left = 0;
    int right = values.Length - 1;

    while (left < right)
    {
        long sum = (long)values[left] + values[right];
        if (sum == target) return true;

        if (sum < target)
            left++;
        else
            right--;
    }

    return false;
}
```

현재 합이 Target보다 작다면 `values[left]`와 현재보다 작은 어떤 오른쪽 값의 합도 더 작다. 따라서 현재 left를 포함하는 후보는 버리고 left를 증가시켜도 안전하다. 합이 크면 같은 논리로 right를 감소시킨다.

```text
values=[1,2,4,7,11], target=9

1+11=12 > 9 → R--
1+7 = 8 < 9 → L++
2+7 = 9     → 발견
```

정렬된 상태에서 시간 O(n), 보조 공간 O(1)이다. 원본이 정렬되지 않아 먼저 정렬하면 전체 O(n log n)이며 원래 Index를 반환하려면 값과 Index Pair를 함께 정렬해야 한다. Exact Pair만 찾는다면 Hash Set으로 평균 O(n), 공간 O(n) 해법도 있다.

## 4. 같은 방향 Two Pointer

두 Pointer가 모두 왼쪽에서 오른쪽으로 이동할 수 있다. 정렬 배열에서 중복 제거, 두 Sequence의 교집합, 느린 Pointer와 빠른 Pointer Pattern이 예다.

정렬 배열의 중복 제거에서는 `read`가 모든 원소를 읽고, `write`가 유일한 값의 다음 저장 위치를 가리킨다.

```text
Input:  [1,1,2,2,2,5]
read:    → → → → → →
write:  [1,2,5,_,_,_]
```

읽기는 n번, 쓰기도 최대 n번이므로 O(n)이다. In-place 변경이므로 원본 보존 여부와 반환해야 할 유효 길이를 명확히 한다.

Linked List의 Cycle 탐지에서 Slow는 한 칸, Fast는 두 칸 이동하는 Floyd의 Tortoise-Hare도 Two Pointer이지만 Sliding Window는 아니다. “Pointer 두 개”라는 형태보다 이동 불변식을 설명해야 한다.

## 5. 고정 길이 Sliding Window

길이 `k`인 모든 연속 구간의 최대 합을 구한다. 첫 Window 합을 계산하고 오른쪽으로 한 칸 이동할 때 새 원소를 더하고 빠진 원소를 뺀다.

```csharp
long MaxWindowSum(int[] values, int k)
{
    if (k <= 0 || k > values.Length)
        throw new ArgumentOutOfRangeException(nameof(k));

    long sum = 0;
    for (int i = 0; i < k; i++)
        sum += values[i];

    long best = sum;
    for (int right = k; right < values.Length; right++)
    {
        sum += values[right];
        sum -= values[right - k];
        best = Math.Max(best, sum);
    }

    return best;
}
```

```text
[2, 1, 5, 1, 3, 2], k=3

[2,1,5] sum=8
  [1,5,1] sum=7 = 8 - 2 + 1
    [5,1,3] sum=9 = 7 - 1 + 3
```

각 원소가 한 번 들어오고 한 번 나가므로 O(n), 합만 유지하면 O(1) 보조 공간이다. Window의 최소·최대는 단순 합처럼 역연산으로 제거하기 어려워 Monotonic Deque를 사용할 수 있다.

## 6. 가변 길이 Sliding Window

양수 배열에서 합이 `S` 이상인 최소 길이 연속 구간을 찾는다.

```csharp
int MinLengthAtLeast(int[] values, long target)
{
    int left = 0;
    int best = int.MaxValue;
    long sum = 0;

    for (int right = 0; right < values.Length; right++)
    {
        sum += values[right];

        while (sum >= target)
        {
            best = Math.Min(best, right - left + 1);
            sum -= values[left++];
        }
    }

    return best == int.MaxValue ? 0 : best;
}
```

Right를 늘리면 합이 줄지 않고, Left를 늘리면 합이 늘지 않는다는 양수 조건의 단조성을 사용한다. 합이 부족하면 확장하고, 조건을 만족하면 최소 길이를 위해 가능한 만큼 축소한다.

`for` 안에 `while`이 있어 O(n²)처럼 보이지만 Right는 n번, Left도 전체 실행 동안 최대 n번만 증가한다. 총 Pointer 이동이 2n 이하이므로 O(n)이다. 이를 분할 상환 관점으로 설명할 수 있다.

## 7. 음수 값에서 합 Window가 실패하는 이유

음수가 섞이면 Right 확장이 합을 낮추고 Left 축소가 합을 높일 수 있어 단조 이동 근거가 깨진다.

```text
values = [2, -1, 2], target=3

중간 합 변화가 확장·축소 방향과 일관되지 않음
```

합이 S 이상인 최소 길이 문제에 음수가 있으면 Prefix Sum과 Monotonic Deque 같은 다른 Algorithm이 필요할 수 있다. 합이 정확히 K인 구간 개수는 Prefix Sum Frequency Map으로 푸는 것이 일반적이다.

“Sliding Window는 연속 구간이면 모두 가능하다”가 아니라 제거·추가에 따른 조건 변화가 Pointer를 한 방향으로 움직일 수 있게 해야 한다.

## 8. 문자열 Window와 Frequency 상태

중복 문자가 없는 가장 긴 부분 문자열을 구할 때 Window 안 문자 빈도를 유지한다.

```text
right 문자를 추가
while 그 문자 빈도 > 1:
    left 문자를 제거
    left++
현재 Window 길이로 Best 갱신
```

```text
"abca"

[a,b,c] 유효
[a,b,c,a] a 중복
left를 b 위치까지 이동해 [b,c,a] 유효
```

문자 집합이 ASCII처럼 작고 고정이면 배열 Frequency가 빠르다. Unicode Code Point나 넓은 Token은 Hash Map을 사용할 수 있다. UTF-16 `char` 하나가 사용자가 보는 문자 하나와 같지 않을 수 있으므로 문자열 단위를 명시한다.

마지막 위치 Map을 사용하면 중복 문자의 이전 위치 다음으로 Left를 한 번에 이동할 수 있다.

```text
left = max(left, lastSeen[ch] + 1)
```

`max`가 없으면 Window 왼쪽보다 이전의 오래된 위치로 Left가 뒤로 이동하는 Bug가 생긴다.

## 9. 조건 유지와 답 갱신 시점

Sliding Window Template은 문제에 따라 답 갱신 시점이 다르다.

### 가장 긴 유효 구간

Right를 확장하고, 무효인 동안 Left를 줄여 다시 유효하게 만든 뒤 길이를 갱신한다.

```text
expand
while invalid: shrink
record longest valid
```

### 조건을 만족하는 최소 구간

Right를 확장하고, 유효한 동안 답을 기록한 뒤 더 줄일 수 있는지 Left를 이동한다.

```text
expand
while valid:
    record shortest
    shrink
```

이 둘을 같은 Template으로 무작정 복사하면 Off-by-One이나 답 누락이 생긴다. Window가 `[left, right]`인지 `[left, right)`인지와 길이 계산을 일관되게 유지한다.

## 10. Two Pointer vs Sliding Window vs 고정·가변 Window 비교

### Two Pointer vs Sliding Window

| 구분 | Two Pointer | Sliding Window |
|------|-------------|----------------|
| 대상 | 배열·문자열의 두 임의 위치 | 연속 구간(왼쪽·오른쪽 경계) |
| Pointer 수 | 2개 (양끝 또는 같은 방향) | 2개 (left, right — 항상 같은 방향) |
| Window 크기 | 고정 아님, 두 위치 간 관계만 사용 | 구간 상태를 증분 갱신하며 유지 |
| 조건 | 정렬·단조성으로 후보 제거 | 확장·축소 시 구간 조건 변화 단조성 |
| 대표 문제 | 두 수의 합, 중복 제거, Cycle 탐지 | 최대 합 구간, 최소 길이 구간, 중복 없는 최장 문자열 |

Sliding Window는 연속 구간을 유지하는 Two Pointer의 특수한 형태다. Two Pointer가 더 넓은 개념이며, Sliding Window는 반드시 연속 구간 상태를 증분 갱신한다는 조건을 추가로 만족한다.

### 고정 크기 Window vs 가변 크기 Window

| 구분 | 고정 크기 Window | 가변 크기 Window |
|------|----------------|----------------|
| Window 크기 | k로 고정 | 조건에 따라 동적으로 변함 |
| 수축 조건 | 매 스텝 left = right - k + 1로 결정 | 조건 만족·위반 여부에 따라 left 이동 |
| 시간 복잡도 | O(n), 합·최대값 등 O(1) 갱신 | O(n) (각 Pointer 최대 n번 이동) |
| 대표 문제 | 길이 k 최대 합, k Window 최댓값(Monotonic Deque) | 합 ≥ S 최소 구간(양수), 중복 없는 최장 문자열 |

가변 Window는 조건 변화가 단조로울 때만 O(n)을 보장한다. 음수 값이 섞이면 확장·축소 방향과 조건 변화 방향이 일치하지 않아 단조성이 깨진다.

## 11. Prefix Sum과 비교

Prefix Sum은 구간 합을 O(1)에 계산한다.

```text
prefix[0] = 0
prefix[i+1] = prefix[i] + values[i]
sum(left..right) = prefix[right+1] - prefix[left]
```

고정 Query가 많고 배열이 바뀌지 않으면 Prefix Sum이 유리하다. 그러나 모든 O(n²) 구간을 검사하면 합 계산만 O(1)일 뿐 전체는 O(n²)다.

Sliding Window는 조건이 단조일 때 후보 구간 자체를 O(n) 수준으로 줄인다. Prefix Sum과 Hash Map은 음수 포함 정확한 합 개수처럼 Window 단조성이 없는 문제에 적합할 수 있다.

## 11. Monotonic Deque Window

고정 길이 k Window의 최댓값을 매번 O(k) Scan하지 않고 Deque에 값의 Index를 내림차순으로 유지한다.

```text
새 Index r:
1. Deque 앞이 Window 밖이면 제거
2. 뒤에서 values[index] <= values[r]인 동안 제거
3. r을 뒤에 추가
4. 앞 Index가 현재 최대
```

뒤의 작은 값은 새 값보다 먼저 Window에서 나가면서 값도 작으므로 앞으로 최대가 될 수 없다. 각 Index는 한 번 들어오고 한 번 나가 O(n), Deque 공간 O(k)다.

값만 저장하지 않고 Index를 저장해야 Window 밖인지 판단하고 중복 값도 올바르게 처리할 수 있다.

## 12. Two Pointer 정당성 설명

두 수 합 예시는 현재 합이 작을 때 왼쪽 값을 유지한 채 오른쪽을 더 줄이면 합이 더 작아지므로 그 왼쪽과 만들 수 있는 후보를 안전하게 버린다는 논리를 사용한다.

가변 Window는 다음 불변식을 사용할 수 있다.

- Right까지의 원소가 Window 상태에 반영되어 있다.
- Left보다 작은 시작점은 이미 필요한 답을 기록했거나 조건상 더 나은 답이 될 수 없다.
- Pointer는 뒤로 돌아가지 않으며 제거된 후보에는 답이 없다.

정당성은 단순히 “둘 다 한 번 움직여 O(n)”만이 아니다. 왜 Pointer 이동이 가능한 후보를 누락하지 않는지도 설명해야 한다.

## 13. 게임 서버·백엔드 실무 예시

### 최근 60초 요청 수

Client별 요청 Timestamp를 오름차순 Queue에 저장하고 새 요청 시 현재 시각 기준 Window 밖의 Timestamp를 앞에서 제거한다.

```text
Window 정책: (now - 60s, now]

old timestamps --dequeue--> [최근 요청들] <--enqueue-- now
```

경계가 포함인지 제외인지 명확히 해야 한다. 정확히 60초 전 요청을 포함할지에 따라 비교가 `<`인지 `<=`인지 달라진다.

System Wall Clock은 시간 보정으로 뒤로 갈 수 있다. 한 Process 내 경과 시간에는 Monotonic Clock을 사용한다. 분산 Rate Limit은 서버별 Clock과 Window를 단순 합치는 문제보다 복잡하며 중앙 Store, Token Bucket, Fixed·Sliding Window 근사 등을 고려한다.

### 동시 접속 Peak

Login·Logout Event가 시간순으로 정렬되어 있으면 일정 시간 Window의 최대 접속 변화량을 계산할 수 있다. Event가 늦게 도착하거나 순서가 뒤섞이면 먼저 정렬하거나 Watermark·Late Event 정책이 필요하다.

### 전투 로그 분석

최근 k Tick의 평균 Damage는 Circular Buffer와 Rolling Sum으로 O(1)에 갱신할 수 있다. 값이 Overflow하지 않도록 넓은 누적형을 사용하고, 데이터가 없는 초기 Window를 k로 나눌지 실제 Sample 수로 나눌지 정의한다.

### Memory와 동시성

Client가 매우 많으면 Timestamp 하나씩 저장하는 정확한 Sliding Window의 Memory가 커진다. 시간 Bucket 집계는 Memory를 줄이지만 경계가 근사된다. Queue 공유 접근에는 Client별 소유 Shard나 Lock이 필요하며, 오래 활동하지 않은 Client 상태의 TTL 정리도 설계한다.

## 14. 구현 시 주의사항

- 정렬·양수·연속성 등 Pointer 이동 전제를 확인한다.
- Window 구간의 포함 방식을 한 가지로 유지한다.
- 합과 Timestamp 차이는 Overflow하지 않는 자료형을 사용한다.
- 중복 값·문자의 Frequency 제거를 정확히 한다.
- Left가 뒤로 이동하지 않게 한다.
- 빈 배열, k=0, k>n, 답 없음 Case를 정의한다.
- Streaming 입력 순서와 Late Event 정책을 정한다.
- 모든 결과를 반환하면 출력 크기 비용도 포함한다.

## 15. 장점과 단점

### 장점

- 조건이 맞으면 O(n²) 후보 탐색을 O(n)으로 줄일 수 있다.
- 연속 구간 Aggregate를 증분 갱신해 중복 계산을 제거한다.
- 배열 기반이라 Cache 효율과 구현 상수가 좋은 편이다.
- Streaming 데이터에서 오래된 항목을 제거하며 상태를 유지할 수 있다.

### 단점

- 단조성·정렬 전제가 깨지면 후보를 누락할 수 있다.
- 합의 음수, 비연속 부분집합에는 단순 Window가 맞지 않는다.
- 복잡한 Window 상태는 Frequency Map·Deque Memory가 필요하다.
- 시간 기반 Window는 Clock, 경계, Late Event와 분산 정합성을 다뤄야 한다.

## 16. 자주 하는 오해

- **Two Pointer와 Sliding Window는 완전히 같은 말이다**: Sliding Window는 연속 구간을 유지하는 Two Pointer Pattern이다.
- **중첩 while이 있으니 가변 Window는 O(n²)이다**: 각 Pointer 총 이동이 n 이하다.
- **연속 구간 합 문제에는 항상 Sliding Window를 쓴다**: 음수가 있으면 단조성이 깨질 수 있다.
- **정렬 전 Two Sum도 양끝 Pointer로 된다**: 합 비교로 절반 후보를 버릴 근거가 없다.
- **Prefix Sum을 쓰면 모든 구간 문제가 O(n)이다**: 구간 후보를 O(n²)개 검사하면 그대로 O(n²)다.
- **시간 Window는 비교 연산 하나면 끝난다**: Clock 종류, 경계, 지연 Event와 Memory 정책이 필요하다.
- **문자열의 char는 항상 한 글자다**: Encoding과 사용자 인식 문자 단위를 확인한다.

## 17. 면접 질문

### Q1. 게임 서버에서 최근 N초 내 특정 플레이어의 행동 패턴을 실시간으로 감지해야 합니다. Two Pointer와 Sliding Window 중 어느 방식이 적합하며, 시간 기반 Window 구현 시 주의할 점은 무엇인가요?

시간 기반 연속 구간을 유지하며 구간 상태를 증분 갱신해야 하므로 Sliding Window가 적합합니다. Timestamp Queue에 요청을 추가하고 (now - N초)보다 오래된 항목을 앞에서 제거하면 현재 Window 크기가 곧 감지 대상 행동 수입니다. 구현 시 경계 포함 여부(정확히 N초 전 이벤트를 포함할지), System Wall Clock 대신 Monotonic Clock 사용, 분산 환경에서 서버별 Clock 편차 처리, 활동이 없는 플레이어 상태 TTL 정리까지 고려해야 합니다.

### Q2. 게임 아이템 교환 시스템에서 두 플레이어의 아이템 합이 정확히 K가 되는 쌍을 찾아야 합니다. 아이템 ID 배열이 정렬되어 있을 때와 아닐 때 각각 어떤 전략을 선택하고 그 이유는 무엇인가요?

정렬된 경우 양끝 Two Pointer를 사용합니다. 합이 K보다 작으면 left를 증가시키고 크면 right를 감소시키는데, 정렬 덕분에 현재 left와 더 작은 오른쪽 값의 합은 K 이하가 되어 후보를 안전하게 버릴 수 있습니다. 시간 O(n), 공간 O(1)입니다. 정렬되지 않은 경우 Hash Set으로 K에서 현재 값을 뺀 보완 값을 조회합니다. 평균 O(n), 공간 O(n)이며 원본 순서를 보존하고 중복 쌍 처리 기준을 명확히 해야 합니다. 정렬 비용을 감수하고 O(n log n) 후 Two Pointer를 쓸지, 공간을 써서 Hash Set을 쓸지는 배열 재사용 여부와 메모리 제약에 따라 결정합니다.

### Q3. 가변 Sliding Window 기반 Rate Limiter가 부하 테스트에서 예상보다 10배 느리게 동작합니다. O(n)을 보장해야 하는 불변식이 깨지는 코드 패턴을 설명하고 수정 방법을 제시하세요.

O(n) 보장의 핵심 불변식은 "left와 right 모두 절대 뒤로 이동하지 않는다"는 것입니다. 깨지는 패턴은 두 가지입니다. 첫째, 조건 검사마다 left를 0으로 초기화하거나 이전 값보다 작게 설정하면 같은 원소를 여러 번 처리해 O(n²)이 됩니다. 둘째, 내부 while 루프에서 조건 판단이 잘못되어 left가 제자리걸음하거나 right보다 앞으로 나가는 경우가 있습니다. 수정 방법은 left 이동 전 현재 값을 저장해 역행 여부를 단언으로 검증하고, 각 원소가 Window에 정확히 한 번 들어오고 한 번 나가는지 단위 테스트로 확인합니다. 디버깅 시 left 이동 횟수를 카운팅해 n을 초과하는지 실행 중에 감지할 수 있습니다.

### Q4. 게임 경제 시스템에서 특정 구간의 골드 수익이 최대가 되는 구간을 찾아야 합니다. 골드가 음수(비용)도 될 수 있을 때 Sliding Window를 그대로 적용하면 어떤 문제가 생기고 어떻게 해결하겠습니까?

음수가 섞이면 Sliding Window의 단조성 전제가 깨집니다. right를 확장해도 합이 줄고, left를 축소해도 합이 늘 수 있어 Pointer 이동으로 후보를 안전하게 버릴 수 없습니다. 예를 들어 [3, -5, 8] 에서 합이 큰 구간을 찾을 때 left를 앞으로 이동하면 음수 구간을 포함해 합이 오히려 줄어드는 경우가 생깁니다. 최대 합 구간 문제는 Kadane 알고리즘으로 O(n)에 해결합니다. 현재 누적 합이 0 이하가 되면 이전 구간을 버리고 새로 시작하는 전략입니다. 정확히 K인 구간 개수처럼 조건이 복잡하면 Prefix Sum Frequency Map을 사용합니다.

### Q5. MMO 서버에서 최근 60프레임 내 최대 데미지를 실시간으로 추적해야 합니다. 고정 크기 Window에서 최대값 유지를 위해 선택할 자료구조와, 프레임이 60fps를 초과할 때 Window 크기 조정 전략을 설명하세요.

최대값 유지에는 Index를 값 내림차순으로 유지하는 Monotonic Deque를 사용합니다. 새 프레임 데미지가 들어오면 Deque 뒤에서 현재 값 이하인 Index를 제거하고 추가합니다. Window 밖(60프레임 이전) Index는 앞에서 제거합니다. Deque 앞 Index의 값이 항상 현재 Window 최댓값이며 각 Index가 한 번 들어오고 나가 O(n)입니다. 60fps 초과 상황에서는 두 가지 전략이 있습니다. 첫째, Wall Clock 기준으로 Window를 고정(1초 = 60프레임)하면 실제 프레임 수가 달라져도 시간 경계가 일정합니다. 이 경우 Deque의 Index를 Frame 번호가 아닌 Timestamp로 관리합니다. 둘째, 프레임 수 기준을 유지하되 가변 프레임 간격을 고려해 오래된 프레임 Timestamp가 Window 밖인지 매 프레임 확인합니다. 실시간 게임 서버에서는 Wall Clock 기반이 더 직관적이며 클라이언트 프레임률 변동에도 일관성을 유지할 수 있습니다.

### Q6. 게임 서버에서 플레이어 수백만 명의 Rate Limit 상태를 Sliding Window 방식으로 유지할 때, 플레이어당 Timestamp Queue가 Memory를 과도하게 소비합니다. 정확도를 어느 정도 희생하면서 Memory를 줄이는 설계를 어떻게 결정하겠습니까?

플레이어당 정확한 Timestamp를 저장하면 초당 100요청 허용 기준으로 60초 Window에서 최대 6,000개 Timestamp가 필요합니다. 100만 플레이어라면 단순 계산으로도 수십 GB에 달합니다. Memory를 줄이는 방법은 두 가지입니다. 첫째, Fixed Window 근사로 60초를 N개 Bucket으로 나눠 각 Bucket에 요청 수만 저장합니다. Bucket당 정수 하나이므로 플레이어당 N개 정수로 줄어들지만 Bucket 경계에서 실제 요청 분포와 집계 값이 다를 수 있습니다. 둘째, 비활성 플레이어 상태에 TTL을 적용해 일정 시간 요청이 없으면 Map에서 제거합니다. 둘을 병행하면 활성 플레이어에게만 Bucket 구조를 유지하고 비활성 상태는 즉시 해제할 수 있습니다. 선착순 이벤트처럼 정확도가 중요한 구간에는 Redis Sorted Set 기반 중앙 Sliding Window로 전환하고, 일반 API에는 Bucket 근사를 적용해 정확도 요구사항에 따라 전략을 분리합니다.

## 18. 예상 꼬리질문

- 정렬되지 않은 100만 개 아이템 ID 배열에서 합이 K인 쌍을 찾아야 할 때 정렬 후 Two Pointer와 Hash Set 중 어느 쪽을 선택하겠습니까? 배열을 여러 번 재사용하는 경우와 단발성 조회 경우를 나눠 설명해 주세요.
- 가변 Window에서 left가 뒤로 이동하는 버그가 생겼을 때 로그 없이 재현하기 어렵습니다. 코드 레벨에서 역행을 탐지하는 방법을 구체적으로 설명해 주세요.
- 합이 정확히 K인 구간 개수는 음수가 있을 때 어떻게 구하나요?
- Last Seen Map으로 Left를 한 번에 이동할 때 Map에 오래된 위치가 남아 있으면 어떤 버그가 생기고 어떻게 방어하나요?
- Monotonic Deque에 값 대신 Index를 넣는 이유는 무엇인가요?
- 게임 서버에서 Sliding Window Rate Limit 대신 Token Bucket을 선택하는 기준은 무엇인가요? 선착순 이벤트와 일반 API 각각 어떤 전략을 쓰겠습니까?
- Late Event가 있는 Streaming Window는 어떻게 처리하나요?

## 19. 30초 모범답변

> Two Pointer는 두 Index를 한 방향으로 이동하며 정렬·단조성을 이용해 불가능한 후보를 제거합니다. Sliding Window는 연속 구간에 들어오는 원소를 추가하고 나가는 원소를 제거해 상태를 재사용합니다. 각 Pointer가 최대 n번 이동하면 O(n)입니다. 다만 양수 합처럼 확장·축소에 따른 조건 변화가 단조로워야 하며 음수가 섞이면 다른 Algorithm이 필요할 수 있습니다.

## 20. 1~2분 확장답변

> Two Pointer는 양끝에서 좁히거나 같은 방향으로 이동하며 탐색 후보를 줄입니다. 정렬 Two Sum에서는 합이 작으면 왼쪽을 증가시키고 크면 오른쪽을 감소시킵니다. 정렬 덕분에 버리는 후보가 Target이 될 수 없다는 정당성이 있습니다. Sliding Window는 연속 구간의 합이나 Frequency를 유지하고 Right 확장과 Left 축소를 반복합니다. 중첩 while이 있어도 두 Pointer의 총 이동이 각각 n 이하여서 O(n)입니다.
>
> 고정 길이 합은 나가는 값을 빼고 들어오는 값을 더하며, 가변 합 Window는 양수처럼 조건 변화가 단조일 때 적용합니다. 음수가 있으면 Prefix Sum과 Map·Deque가 필요할 수 있습니다. 게임 서버의 최근 60초 요청 수에는 Timestamp Queue를 사용할 수 있지만 경계 포함, Monotonic Clock, Client 상태 TTL, 동시성과 분산 근사 정책까지 설계해야 합니다.

## 21. 핵심 요약

- Two Pointer는 두 Index의 단조 이동으로 불가능한 후보를 제거한다.
- Sliding Window는 연속 구간 상태를 추가·제거로 증분 갱신한다.
- Pointer가 각각 최대 n번 이동하면 중첩 Loop여도 전체 O(n)이다.
- 정렬 Two Sum은 합 비교로 한쪽 후보를 안전하게 버린다.
- 고정 Window 합은 O(1) 갱신, 최대값은 Monotonic Deque를 사용할 수 있다.
- 양수 합의 가변 Window는 단조성이 핵심이며 음수에서는 실패할 수 있다.
- Frequency·Last Seen으로 문자열 Window 상태를 유지한다.
- 시간 Window는 Clock·경계·Late Event·Memory·동시성까지 포함해 설계한다.

## 한 줄 정리

> Two Pointer와 Sliding Window는 후보와 구간 상태가 단조롭게 변한다는 근거로 각 원소를 제한된 횟수만 처리한다.
