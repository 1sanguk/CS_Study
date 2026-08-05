---
difficulty: 3
reading_time: 25분
interview_frequency: 5
importance: 5
---

# 03. Binary Search

> 게임 서버·백엔드 개발자를 위한 CS 면접 교재

## 학습 목표

- 배열의 단조성 위반 여부를 확인하고 Binary Search 적용 가능 여부를 판단할 수 있다.
- 정확한 값, lower bound, upper bound를 구분해 구현할 수 있다.
- 구간 종류(닫힌·반열린)와 답 정의를 먼저 정해 Loop 불변식이 유지되는지 추론하고 구현 오류를 예방할 수 있다.
- Answer Search를 게임 서버 수용량·설정 경계 문제에 적용할 수 있다.

## 1. 개요

Binary Search는 탐색 공간의 중간값을 검사하고 답이 있을 수 없는 절반을 제거하는 과정을 반복한다. 배열의 원소 `n`개를 절반씩 줄이므로 시간 복잡도는 O(log n)이다.

```text
정렬 배열: [2, 5, 8, 12, 16, 23, 38]
Target 16

[2, 5, 8, 12, 16, 23, 38]
          mid=12, 16은 오른쪽
             [16, 23, 38]
                  mid=23, 16은 왼쪽
             [16] → 발견
```

정확한 Key 하나를 찾는 것뿐 아니라 첫 번째 `target 이상`, 첫 번째 `target 초과`, 조건을 만족하는 최소·최대 답을 찾는 데도 사용한다.

## 2. 성립 조건

중간 결과를 보고 한쪽 절반에 답이 없다고 확신할 수 있어야 한다.

### 정렬된 배열

오름차순 배열에서 `array[mid] < target`이면 `mid` 이하에는 Target이 없다. 따라서 왼쪽을 버릴 수 있다. 정렬되지 않았다면 이 추론이 성립하지 않는다.

### 단조 Predicate

Answer Search에서는 Boolean 조건이 한 번만 바뀌어야 한다.

```text
x 증가에 따른 canHandle(x)

true true true true false false false
                   ↑
              마지막 true 경계
```

True와 False가 여러 번 교차하면 중간 결과만으로 어느 절반을 버릴지 알 수 없다. “정렬된 배열”은 값 탐색의 전제이고, 더 일반적인 핵심은 탐색 공간의 단조성이다.

## 3. 정확한 값 탐색

`left`와 `right`가 모두 포함되는 닫힌 구간 `[left, right]` Template이다.

```csharp
int BinarySearch(int[] values, int target)
{
    int left = 0;
    int right = values.Length - 1;

    while (left <= right)
    {
        int mid = left + (right - left) / 2;

        if (values[mid] == target)
            return mid;
        if (values[mid] < target)
            left = mid + 1;
        else
            right = mid - 1;
    }

    return -1;
}
```

Loop 시작 시 “Target이 존재한다면 `[left, right]` 안에 있다”를 불변식으로 둔다. Mid가 Target보다 작으면 `mid`까지 제거하므로 `left = mid + 1`, 크면 `right = mid - 1`로 갱신한다. `mid`를 그대로 남기면 구간 크기가 줄지 않아 무한 Loop가 될 수 있다.

빈 배열은 `right=-1`이므로 Loop에 들어가지 않는다. 원소 하나, 첫·마지막 원소, 없는 Target도 같은 불변식으로 처리된다.

## 4. Mid Overflow

다음 계산은 `left + right`가 정수 범위를 넘을 수 있다.

```text
mid = (left + right) / 2          // Overflow 가능
mid = left + (right - left) / 2   // 안전한 형태
```

일반 배열 Index가 실제로 최대 정수 근처까지 가는 경우는 드물어도, Answer Search에서 큰 시간·수용량 범위를 다루면 현실적인 오류가 된다. 합계와 Predicate 내부 곱셈도 더 넓은 정수형을 사용한다.

## 5. Lower Bound

Lower Bound는 정렬 배열에서 `target 이상`인 첫 위치다. Target이 없으면 삽입해도 정렬을 유지할 위치이며, 모든 원소보다 크면 `n`을 반환한다.

반열린 구간 `[left, right)` Template을 사용해 보자. `right`는 후보 범위 밖의 끝 위치이며 초기값은 `n`이다.

```csharp
int LowerBound(int[] values, int target)
{
    int left = 0;
    int right = values.Length;

    while (left < right)
    {
        int mid = left + (right - left) / 2;
        if (values[mid] < target)
            left = mid + 1;
        else
            right = mid;
    }

    return left;
}
```

`values[mid] >= target`이면 Mid가 답일 가능성이 있으므로 버리지 않고 `right = mid`로 남긴다. 종료 시 `left == right`가 첫 번째 조건 만족 위치다.

```text
values = [1, 3, 3, 3, 7], target = 3
lower_bound → index 1
```

정확히 Target이 존재하는지는 반환 Index가 `n`보다 작고 `values[index] == target`인지 추가 확인한다.

게임 서버 MMR 배열에서 점수 구간 탐색 예시를 Java로 구현하면 다음과 같다.

```java
// Lower Bound: MMR 1500 이상 첫 번째 플레이어 인덱스
int lowerBound(int[] mmrArr, int target) {
    int left = 0, right = mmrArr.length;
    while (left < right) {                        // 반열린 구간 [left, right)
        int mid = left + (right - left) / 2;      // Overflow 안전한 mid 계산
        if (mmrArr[mid] < target) left = mid + 1;
        else right = mid;
    }
    return left; // target 이상인 첫 번째 인덱스 (없으면 length 반환)
}

// Upper Bound: MMR 2000 이하 마지막 플레이어 인덱스 (lowerBound(2001) - 1)
// MMR 1500~2000 구간 플레이어 수: upperBound(2000) - lowerBound(1500)
int countInRange(int[] mmrArr, int lo, int hi) {
    return lowerBound(mmrArr, hi + 1) - lowerBound(mmrArr, lo);
}
```

## 6. Upper Bound와 중복 개수

Upper Bound는 `target 초과`인 첫 위치다.

```csharp
int UpperBound(int[] values, int target)
{
    int left = 0;
    int right = values.Length;

    while (left < right)
    {
        int mid = left + (right - left) / 2;
        if (values[mid] <= target)
            left = mid + 1;
        else
            right = mid;
    }

    return left;
}
```

Lower와 차이는 Equality를 어느 쪽에 포함하는가다.

```text
values = [1, 3, 3, 3, 7]
lower_bound(3) = 1
upper_bound(3) = 4
3의 개수 = 4 - 1 = 3
```

특정 범위 `[a, b]`에 있는 원소 수는 `upper_bound(b) - lower_bound(a)`로 구할 수 있다. 정렬된 로그 Timestamp에서 시간 구간 Event 수를 셀 때 유용하다.

## 7. 경계 탐색을 이해하는 법

Template을 외우기보다 세 가지를 먼저 정한다.

1. 답의 정의: 첫 True인가, 마지막 True인가?
2. 탐색 구간: `[left, right]`인가, `[left, right)`인가?
3. Mid가 답일 가능성이 있을 때 어느 경계에 남기는가?

```text
첫 True 찾기
false false false true true true
                  ↑ answer

predicate(mid) == true  → mid를 포함해 왼쪽 탐색
predicate(mid) == false → mid를 버리고 오른쪽 탐색
```

마지막 True를 찾는 닫힌 구간에서는 Mid 계산을 위쪽으로 올림해야 구간이 두 원소일 때 정체되지 않는 Template도 있다.

```text
mid = left + (right - left + 1) / 2
```

어떤 Template이든 매 반복에서 구간이 반드시 줄고, 답 후보를 제거하지 않는다는 불변식을 설명할 수 있어야 한다.

## 8. 답에 대한 이진 탐색

배열에 답이 직접 들어 있지 않아도 가능한 답의 범위가 정수이고 Predicate가 단조라면 Binary Search를 적용할 수 있다. 흔히 Parametric Search 또는 Answer Search라고 부른다.

예: 서버 한 대가 동시 플레이어 `x`명을 처리할 수 있는지 Load Model로 판정한다고 하자.

```text
canHandle(x):
  x가 작으면 true
  어느 경계를 넘으면 false

목표: canHandle(x)가 true인 최대 x
```

각 Mid에서 Simulation이나 계산으로 가능 여부를 확인하고 True면 더 큰 쪽, False면 더 작은 쪽을 탐색한다. Predicate 한 번의 비용을 `P(n)`, 답 범위 크기를 `R`이라 하면 전체는 `O(P(n) log R)`이다.

Answer Search가 실제 Benchmark를 직접 반복 실행하는 방식이라면 Noise 때문에 Predicate가 단조롭지 않을 수 있다. 같은 `x`에서도 GC, Network, Neighbor 부하로 결과가 바뀐다. 이론적 Capacity 계산에는 적용할 수 있지만 운영 부하 시험에는 반복 측정과 통계적 판단이 필요하다.

## 9. 정렬 비용과 전체 복잡도

정렬되지 않은 데이터 한 번에서 Target 하나만 찾으려면 선형 탐색 O(n)이 보통 낫다. Binary Search를 위해 먼저 정렬하면 O(n log n)이고 검색 O(log n)을 더해도 전체는 O(n log n)이다.

검색이 `q`번 반복되면 비교가 달라진다.

```text
매번 선형 검색: O(qn)
한 번 정렬 + q번 이진 탐색: O(n log n + q log n)
```

원본 순서를 보존해야 하는지, 갱신이 얼마나 잦은지도 본다. 삽입이 빈번한 정렬 배열은 위치 탐색 O(log n) 이후 이동 O(n)이 든다. 이 경우 균형 Tree나 Hash 구조가 더 적합할 수 있다.

## 10. Binary Search와 자료구조

Binary Search는 Random Access가 가능한 연속 배열에 잘 맞는다. Linked List는 Mid 위치까지 이동하는 데 O(n)이 들어 절반 제거의 이점을 살리기 어렵다.

균형 BST도 비교로 탐색 범위를 줄여 O(log n)에 Key를 찾지만 Node Pointer를 따라간다. 정렬 배열은 Cache 지역성이 좋고 조회 중심 데이터에 유리하며, Tree는 삽입·삭제와 범위 갱신에 유리하다.

DB Index의 B+Tree 검색도 계층적으로 범위를 줄이지만 Binary Search와 동일한 자료구조는 아니다. Page I/O를 줄이기 위해 한 Node에 많은 Key와 자식을 둔다.

Binary Search는 정렬 배열에서만 동작하므로, 삽입·삭제가 빈번하면 균형 BST나 Hash Table이 적합하다.

| 구조 | 탐색 | 삽입 | 삭제 | 메모리 | 적합한 경우 |
|------|------|------|------|-------|-----------|
| 정렬 배열 + Binary Search | O(log n) | O(n) | O(n) | 연속 | 읽기 위주, 정적 데이터 |
| 균형 BST (TreeMap) | O(log n) | O(log n) | O(log n) | 포인터 오버헤드 | 삽입·삭제·탐색 균형 |
| Hash Table | O(1) 평균 | O(1) 평균 | O(1) 평균 | 해시 버킷 | 정확 일치 조회 |
| Linked List | O(n) | O(1) 위치 알 때 | O(1) 위치 알 때 | 포인터 | 순서 유지 삽입·삭제 |

## 11. 실수하기 쉬운 Case

- 빈 배열
- 원소 하나
- Target이 첫 원소 또는 마지막 원소
- Target이 최솟값보다 작거나 최댓값보다 큼
- 중복 원소에서 첫·마지막 위치
- 모든 원소가 동일
- 답이 범위 끝에 있음
- 답이 전혀 없음
- `left + right`와 Predicate 계산 Overflow

테스트는 정상 Example뿐 아니라 이 경계를 포함해야 한다. 특히 Lower Bound가 `n`을 반환하는 것은 실패가 아니라 올바른 삽입 위치일 수 있다.

## 12. 게임 서버·백엔드 실무 예시

### 레벨 요구 경험치

누적 경험치 Threshold가 정렬되어 있다고 하자.

```text
Level Threshold: [0, 100, 300, 700, 1500]
Player XP: 650

첫 threshold > 650 = index 3
현재 Level 경계 = index 2
```

`upper_bound(xp) - 1`로 현재 Level Index를 찾을 수 있다. XP가 0 미만이거나 최대 Level을 넘는 Case를 별도로 정의한다.

### Matchmaking 점수 범위

MMR로 정렬된 배열에서 `[rating-gap, rating+gap]` 후보 구간을 Lower·Upper Bound로 찾을 수 있다. 경계 탐색은 O(log n), 후보 `k`명 처리는 O(k)이므로 전체 O(log n+k)다.

실시간으로 플레이어가 자주 입장·퇴장하면 정렬 배열 유지 비용 O(n)이 커진다. 균형 Tree나 외부 Sorted Set을 고려한다. Algorithm뿐 아니라 갱신 Pattern을 본다.

### 최대 수용량 Answer Search

Shard `s`개에 Player `x`명을 분배했을 때 CPU·Memory 제한을 넘지 않는지 결정적인 Model로 판단하고 가능한 최대 `x`를 찾을 수 있다. 합계와 곱셈은 64-bit 범위를 사용하고, Predicate가 정말 “작은 x는 가능, 큰 x는 불가능”인지 검증한다.

설정 Table은 읽기 전용 Snapshot으로 배포하면 Binary Search 중 동시 변경 문제를 없앨 수 있다. 배열이 탐색 중 재정렬되면 결과는 보장되지 않는다.

## 13. 장점과 단점

### 장점

- 탐색 공간을 절반씩 줄여 O(log n)에 값과 경계를 찾는다.
- Lower·Upper Bound로 중복과 범위 Query를 효율적으로 처리한다.
- 단조 Predicate가 있으면 배열 밖의 정답 범위에도 적용할 수 있다.
- 반복문 구현은 보조 공간 O(1)이다.

### 단점

- 정렬 또는 단조성 전제가 없으면 사용할 수 없다.
- 경계 포함 방식이 섞이면 Off-by-One과 무한 Loop가 발생하기 쉽다.
- 정렬되지 않은 한 번의 조회에는 정렬 비용이 더 클 수 있다.
- Linked List처럼 Random Access가 느린 구조에는 적합하지 않다.
- Predicate가 비싸면 전체 비용은 `O(P(n) log R)`이다.

## 14. 자주 하는 오해

- **Binary Search는 정렬되지 않은 배열에서도 평균적으로 된다**: 절반 제거 근거가 없어 정답을 보장하지 않는다.
- **Target이 없으면 Lower Bound도 실패한다**: 정렬을 유지할 삽입 위치를 반환한다.
- **중복에서는 아무 위치나 반환해도 항상 충분하다**: 첫·마지막 위치나 개수가 필요하면 경계 탐색을 해야 한다.
- **`mid = (left+right)/2`는 항상 안전하다**: 합 Overflow 가능성이 있다.
- **Binary Search를 쓰면 전체가 O(log n)이다**: 사전 정렬, Predicate, 결과 `k`개 처리 비용을 더해야 한다.
- **실수 범위도 정수와 완전히 같다**: 종료 횟수나 허용 오차를 정하지 않으면 정밀도 문제와 무한 반복이 생긴다.
- **Benchmark 성공 여부는 자동으로 단조 Predicate다**: Noise와 외부 부하로 결과가 뒤집힐 수 있다.

## 15. 면접 질문

### Q1. 레벨 임계값 배열에서 Binary Search가 잘못된 결과를 반환할 때 어떤 전제가 위반된 것인지 진단하는 방법은?

**30초 모범답변:** Binary Search 전제는 단조성(정렬·비감소·비증가). 잘못된 결과가 나오면 (1) 배열이 중간에 비정렬 구간이 있는지 (2) 비교 함수가 전이성을 위반하는지 (3) 실수 비교에서 부동소수점 오차가 있는지 순서로 점검합니다.

**1~2분 모범답변:** 진단 절차: (1) 배열 전체를 한 번 순회해 `arr[i] > arr[i+1]`인 지점을 찾음 — 있으면 정렬 위반 (2) 비교 함수가 있으면 동일 입력에서 다른 결과가 나오는지 확인 — 있으면 비결정적 Comparator (3) 실수 Target을 쓰면 `==` 대신 `Math.abs(a - b) < epsilon` 사용. 게임 서버에서 레벨 임계값 배열은 레벨업 이벤트로 동적으로 갱신되는 경우 Binary Search 도중 배열이 변경되어 단조성이 깨질 수 있으므로 읽기 Lock 또는 Snapshot 복사 후 탐색합니다.

### Q2. MMR 배열에서 특정 점수 구간에 속하는 플레이어 수를 O(log n)에 구할 때 Lower Bound와 Upper Bound를 어떻게 조합하는가?

**30초 모범답변:** `count = lowerBound(hi+1) - lowerBound(lo)`. Lower Bound는 target 이상의 첫 번째 인덱스를 반환하므로, 두 번 호출해 범위를 지정합니다. 두 호출 모두 O(log n)이므로 전체 O(log n)입니다.

**1~2분 모범답변:** Lower Bound 정의: `arr[i] >= target`인 최소 i. Upper Bound: `arr[i] > target`인 최소 i (= lowerBound(target+1)). 구간 [lo, hi] 플레이어 수 = `lowerBound(hi+1) - lowerBound(lo)`. 중요한 엣지: lowerBound 반환값이 배열 길이이면 해당 target 이상이 없음을 의미하므로 음수 결과 방지를 위해 `Math.max(0, result)` 처리. Java에서는 `Arrays.binarySearch()` 대신 직접 구현 권장 — 표준 라이브러리는 중복 원소에서 어느 인덱스를 반환할지 보장하지 않습니다.

### Q3. Answer Binary Search에서 탐색 범위를 `int`로 선언했다가 플레이어 수가 수십만을 넘는 순간 잘못된 최대값을 반환하는 버그가 발생했습니다. 어디서 문제가 생긴 것이고 어떻게 수정하나요?

**30초 모범답변:** `mid = (left + right) / 2`에서 `left + right`가 int 최댓값(약 21억)을 초과해 음수로 Wrap되면 mid가 음수가 되어 탐색 범위가 무너집니다. `mid = left + (right - left) / 2`로 교체하고, Predicate 내부의 플레이어 수 합산·곱셈도 `long`으로 선언해야 합니다.

**1~2분 모범답변:** Answer Binary Search에서 `left=1_000_000, right=2_000_000`이면 합산이 3_000_000으로 int 범위 내지만, 실제 동접 상한을 `Integer.MAX_VALUE`까지 열어두거나 Predicate 내부에서 `players * costPerPlayer` 같은 곱셈을 하면 Overflow가 발생합니다. 수정 포인트는 세 곳입니다. (1) mid 계산을 `left + (right - left) / 2`로 변경. (2) 탐색 범위 변수를 `long`으로 선언. (3) Predicate 내부 산술에 `long` 캐스팅 추가. 버그 진단 시에는 `left`, `right`, `mid` 값을 로그로 찍어 mid가 음수인지 확인합니다. 게임 서버에서 동접 수용 상한 탐색은 수십만~수백만 단위로 쉽게 int 경계를 넘으므로 Answer Binary Search 구현 시 기본값을 `long`으로 잡아야 합니다.

### Q4. MMR 매칭 서버 배포 직후 특정 점수대 플레이어가 항상 매칭 대기열에서 빠지는 신고가 들어왔습니다. Lower Bound 구현 코드가 의심될 때 어떤 순서로 진단하나요?

**30초 모범답변:** 먼저 경계값 로그를 남겨 `left`, `right`, `mid`, 반환 인덱스를 확인합니다. 다음으로 문제 점수를 직접 입력해 반환 인덱스가 배열 범위를 벗어나거나 예상 위치와 다른지 봅니다. 구간 포함 방식(`left < right` vs `left <= right`)과 `right = mid` vs `right = mid - 1` 갱신 중 하나가 잘못됐을 가능성이 높습니다.

**1~2분 모범답변:** 진단 절차는 다음 순서입니다. (1) 로그에서 경계 조건 확인 — `while(left < right)`인데 `right = mid - 1`로 갱신하면 정답 인덱스를 버리는 Off-by-One이 발생합니다. (2) 탐색 구간 불변식 확인 — 반열린 구간 `[left, right)`에서 `right`는 후보 밖의 끝이므로 `right = mid`로만 줄여야 하고 `right = mid - 1`로 쓰면 정답을 제거합니다. (3) 경계 케이스 재현 — 문제 점수가 배열 최솟값, 최댓값, 또는 배열에 없는 값인지 테스트합니다. (4) 단위 테스트 추가 — `target`이 배열의 첫·마지막 원소와 일치할 때, 배열 전체가 동일값일 때 결과가 맞는지 확인합니다. 수정 후에는 경계 테스트 케이스를 CI에 포함해 재발을 방지합니다.

### Q5. Shard 수가 고정된 서버에서 처리 가능한 최대 동시 플레이어 수를 이진 탐색으로 구할 때 Predicate를 어떻게 설계하고 단조성 위반을 어떻게 검증하는가?

**30초 모범답변:** Predicate: `f(x) = (x명이 n개 Shard에서 처리 가능한가?)`. 단조성: x가 증가할수록 f는 True→False로 한 번만 전환(단조 감소). 이진 탐색으로 마지막 True인 x를 찾습니다. 단조성 검증: 부하 시뮬레이션에서 x=100, 500, 1000에서 f(x) 호출해 결과가 단조인지 확인합니다.

**1~2분 모범답변:** Answer Binary Search(매개변수 탐색) 설계: (1) 탐색 범위 설정 — `left=0, right=MAX_PLAYERS` (2) `mid` 값으로 `canHandle(mid)` 호출 — mid명을 n개 Shard에 균등 분배했을 때 각 Shard의 처리 시간이 Budget 이내인지 시뮬레이션 (3) `canHandle(mid)==true`면 `left=mid+1`, false면 `right=mid` (4) 종료 시 `left-1`이 최대값. 단조성 위반 예: Shard 간 세션 이동 비용이 플레이어 수에 비선형적이면 중간에 False→True→False 패턴 가능 — 이 경우 Binary Search 대신 Ternary Search 또는 전수 탐색이 필요합니다.

### Q6. 플레이어 세션 로그가 시간순으로 정렬되지 않은 상태에서 특정 이벤트를 한 번 조회해야 합니다. 이진 탐색을 위해 정렬하는 것이 유리한가요, 선형 탐색이 유리한가요? 판단 기준을 말해 주세요.

**30초 모범답변:** 한 번만 조회한다면 선형 탐색 O(n)이 유리합니다. 정렬 O(n log n) 후 이진 탐색 O(log n)을 더해도 총 O(n log n)으로 더 비쌉니다. 동일 로그를 q번 반복 조회하거나 이미 정렬 상태가 보장된다면 이진 탐색이 유리한 기준점이 달라집니다.

**1~2분 모범답변:** 판단 기준은 조회 횟수, 갱신 빈도, 정렬 유지 비용 세 가지입니다. (1) 한 번 조회: 정렬 O(n log n) > 선형 O(n) → 선형 탐색. (2) q번 반복 조회(q가 충분히 큼): `O(n log n + q log n)` < `O(qn)` → 한 번 정렬 후 이진 탐색. (3) 실시간 갱신이 빈번: 정렬 배열 삽입은 O(n) 이동 비용 → 균형 BST나 외부 Sorted Set 고려. 게임 서버에서 세션 로그는 실시간으로 쌓이므로 정렬 배열 유지보다 Sorted Set(Redis ZSet 등)이나 DB 인덱스를 이용한 Range 쿼리가 현실적입니다. 이진 탐색 직접 구현은 갱신이 드물고 배열이 이미 정렬된 설정 테이블 조회에 적합합니다.

## 16. 예상 꼬리질문

- MMR 매칭 서버에서 Lower Bound 구현 중 경계 조건 실수로 같은 점수대 플레이어가 매칭에서 누락되는 버그가 발생했습니다. 어디서 문제가 생길 수 있고 어떻게 진단하나요?
- 쿨다운 타이머 만료 여부를 이진 탐색으로 조회할 때, 같은 만료 시각을 가진 스킬이 여러 개 있다면 가장 나중에 만료되는 것을 정확히 찾아야 합니다. Upper Bound와 Lower Bound 중 어떤 것을 쓰고 Mid 갱신을 어떻게 설계하나요?
- 랭킹 배열에서 특정 점수 이상 플레이어를 조회했는데 Lower Bound가 배열 길이를 반환했습니다. 이 값을 그대로 인덱스로 사용하면 어떤 장애가 발생하고, 운영 코드에서 어떻게 처리해야 하나요?
- 레벨 임계값 배열에 같은 경험치 값이 중복 등록되어 있을 때 Upper Bound를 쓰면 현재 레벨 인덱스 계산 결과가 달라집니다. 이 경우 어떤 결과가 나오고 어떻게 수정하나요?
- Shard 분배 시뮬레이션 Predicate를 Answer Binary Search에 적용했는데 특정 플레이어 수 구간에서 canHandle 결과가 True→False→True로 뒤집혔습니다. 원인이 무엇이고 이 경우 어떻게 대응하나요?
- 스킬 쿨다운 배율 같은 실수 설정값의 최적 상한선을 이진 탐색으로 찾을 때, 반복 횟수를 정하지 않으면 어떤 문제가 생기고 실무에서는 종료 조건을 어떻게 결정하나요?
- 정렬 배열과 균형 Tree 중 무엇을 선택하나요?

## 17. 30초 모범답변

> Binary Search는 정렬되거나 Predicate가 단조인 탐색 공간에서 Mid를 기준으로 답이 없는 절반을 제거해 O(log n)에 값이나 경계를 찾습니다. Lower Bound는 Target 이상인 첫 위치, Upper Bound는 Target 초과인 첫 위치입니다. 구현에서는 구간 불변식, Off-by-One, 구간이 반드시 줄어드는지와 Mid Overflow를 주의합니다.

## 18. 1~2분 확장답변

> Binary Search의 핵심 전제는 중간값의 결과로 한쪽 절반을 안전하게 버릴 수 있는 정렬 또는 단조성입니다. 정확한 값 탐색은 Target과 Mid를 비교하고, Lower Bound는 Target 이상인 첫 위치, Upper Bound는 Target 초과인 첫 위치를 찾습니다. 닫힌 구간과 반열린 구간 중 하나를 택해 불변식을 유지해야 하며 `mid = left + (right-left)/2`로 Overflow를 피합니다.
>
> 배열에 답이 직접 없어도 `canHandle(x)`처럼 False에서 True 또는 True에서 False로 한 번만 바뀌는 Predicate가 있으면 최소·최대 가능 값을 찾을 수 있습니다. 이때 전체 복잡도는 Predicate 비용을 P, 답 범위를 R이라 할 때 O(P log R)입니다. 게임 서버에서는 경험치 Level 경계나 MMR 후보 범위를 찾는 데 쓸 수 있습니다. 다만 정렬 유지 비용, 동시 변경, 결과 k개 처리와 Predicate의 단조성을 함께 검증해야 합니다.

## 19. 핵심 요약

- Binary Search는 정렬 또는 단조성으로 답이 없는 절반을 반복 제거한다.
- 정확한 탐색 시간은 O(log n), 반복 구현의 보조 공간은 O(1)이다.
- Lower Bound는 `target 이상`, Upper Bound는 `target 초과`인 첫 위치다.
- 구간의 포함 방식과 답 정의를 먼저 정하고 Loop 불변식을 유지한다.
- Mid와 Predicate 산술의 정수 Overflow를 방지한다.
- Answer Search는 단조 Predicate의 최소·최대 경계를 찾는다.
- 전체 비용에는 정렬, Predicate, 결과 순회와 갱신 유지 비용도 포함한다.
- 빈 입력, 중복, 양끝, 없는 답을 포함한 경계 테스트가 중요하다.

## 한 줄 정리

> Binary Search는 정렬·단조성이라는 근거로 후보 절반을 버리며 값뿐 아니라 경계와 최대·최소 가능 답을 찾는다.
