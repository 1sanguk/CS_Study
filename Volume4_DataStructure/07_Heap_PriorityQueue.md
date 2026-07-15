---
difficulty: 3
reading_time: 25분
interview_frequency: 4
importance: 4
---

# 07. Heap과 Priority Queue

> 게임 서버·백엔드 개발자를 위한 CS 면접 교재

## 학습 목표

- Heap과 Priority Queue의 차이를 설명할 수 있다.
- Binary Heap의 배열 표현과 삽입·삭제 과정을 설명할 수 있다.
- Heapify의 시간 복잡도와 Heap Sort의 특성을 설명할 수 있다.
- 타이머, 작업 Scheduling, Top-K 요구에 적절한 구조를 선택할 수 있다.

## 1. 개요

Priority Queue는 원소를 넣은 순서가 아니라 우선순위가 가장 높은 원소부터 꺼내는 추상 자료형(ADT)이다. Heap은 Priority Queue를 구현하는 대표 자료구조다. 즉 Priority Queue는 제공할 동작을 정의하고, Heap은 그 동작을 구현하는 한 방법이다.

Binary Heap은 다음 두 조건을 만족한다.

1. **형태 조건**: 마지막 Level을 제외한 모든 Level이 차 있고 마지막 Level은 왼쪽부터 채워지는 완전 이진 트리다.
2. **Heap 조건**: Min Heap은 부모 Key가 자식 Key 이하이고, Max Heap은 부모 Key가 자식 Key 이상이다.

Min Heap의 Root에는 전체 최솟값이 있고 Max Heap의 Root에는 전체 최댓값이 있다. 그러나 형제와 서로 다른 Subtree 사이에는 정렬 관계가 없다. Heap은 전체 정렬이 아니라 최우선 원소를 빠르게 선택하기 위한 부분 순서다.

## 2. 왜 필요한가

예약 작업 `n`개 중 가장 이른 작업 하나를 반복해서 찾아야 한다고 하자. 배열을 매번 선형 탐색하면 한 번 선택에 `O(n)`이 든다. 새 작업이 들어올 때마다 전체 배열을 정렬하면 갱신 비용이 크다.

Heap은 필요한 만큼만 순서를 유지한다.

- 최우선 원소 확인: `O(1)`
- 원소 삽입: `O(log n)`
- 최우선 원소 제거: `O(log n)`
- 임의 원소 검색: `O(n)`

전체 순서가 필요하지 않고 다음에 처리할 하나만 중요할 때 좋은 절충이다. 게임 서버의 Timer, Pathfinding의 다음 후보, Backend Worker의 우선순위 작업, Streaming Top-K가 대표 사례다.

## 3. 배열로 표현하는 Binary Heap

완전 이진 트리는 빈 위치 없이 Level 순서로 채워지므로 포인터 노드 대신 연속 배열에 저장할 수 있다. 0부터 시작하는 Index에서는 다음 관계가 성립한다.

```text
parent(i)      = (i - 1) / 2       // 정수 나눗셈, i > 0
leftChild(i)   = 2 * i + 1
rightChild(i)  = 2 * i + 2

Min Heap 예시

Index:  0   1   2   3   4   5
Value: [2,  5,  4,  9,  7,  8]

          2(0)
        /      \
      5(1)     4(2)
     /   \      /
   9(3) 7(4)  8(5)
```

배열 표현은 자식 포인터가 필요 없고 메모리 지역성이 좋다. 마지막 위치에 삽입하고 마지막 원소를 제거하므로 Dynamic Array와도 잘 맞는다. Capacity 증가 시 재할당과 참조 무효화가 생길 수 있다는 점은 별도로 고려한다.

## 4. 삽입: Sift-Up

새 원소는 완전 이진 트리의 형태를 유지하기 위해 배열 마지막에 추가한다. 그 위치에서 부모와 비교해 Heap 조건을 위반하면 서로 바꾸는 과정을 반복한다. 이를 Sift-Up 또는 Bubble-Up이라고 한다.

Min Heap `[2, 5, 4, 9, 7, 8]`에 `3`을 삽입해 보자.

```text
마지막에 3 추가: [2, 5, 4, 9, 7, 8, 3]
3 < 부모 4 교환: [2, 5, 3, 9, 7, 8, 4]
3 >= 부모 2 종료: [2, 5, 3, 9, 7, 8, 4]
```

한 번 비교할 때마다 한 Level 위로 이동한다. 완전 이진 트리의 높이는 `O(log n)`이므로 삽입의 최악 시간은 `O(log n)`이다. 이미 부모보다 우선순위가 낮으면 한 번의 비교로 끝날 수 있다.

## 5. 최우선 원소 제거: Sift-Down

Root를 제거하면 배열 첫 위치가 빈다. 배열 마지막 원소를 Root로 옮기고 크기를 하나 줄인 뒤, 두 자식 중 더 우선순위가 높은 자식과 교환하며 내려간다. Min Heap에서는 더 작은 자식을 선택한다.

```text
초기 Heap:        [2, 5, 3, 9, 7, 8, 4]
Root 2 제거,
마지막 4 이동:    [4, 5, 3, 9, 7, 8]
자식 5, 3 중
작은 3과 교환:    [3, 5, 4, 9, 7, 8]
Heap 조건 복구 완료
```

두 자식 중 잘못된 자식을 고르면 다른 쪽에 더 높은 우선순위 원소가 남아 Heap 조건이 깨진다. Sift-Down도 최대 높이만큼 이동하므로 `O(log n)`이다. Root 값을 읽는 `peek` 또는 `top`은 구조를 바꾸지 않아 `O(1)`이다.

## 6. Heapify는 왜 O(n)인가

원소 `n`개를 하나씩 빈 Heap에 삽입하면 `O(n log n)`이다. 이미 배열에 원소가 있다면 마지막 내부 노드부터 Root 방향으로 Sift-Down하는 Bottom-Up Heapify로 `O(n)`에 Heap을 만들 수 있다.

```text
마지막 Leaf Index       = n - 1
마지막 Parent Index     = floor(n / 2) - 1

for i = lastParent down to 0:
    siftDown(i)
```

각 Sift-Down이 최악 `O(log n)`인데도 전체가 `O(n log n)`이 아닌 이유는 대부분의 노드가 아래쪽에 있어 거의 이동하지 않기 때문이다. Leaf는 전체의 약 절반이며 작업이 없고, 한 Level 위 노드는 한 단계 정도만 내려간다. 각 높이별 노드 수와 이동량의 합은 `n`에 비례한다.

면접에서는 복잡한 급수 증명보다 “비싼 작업을 하는 상단 노드는 적고, 다수의 하단 노드는 거의 이동하지 않아 전체 합이 O(n)”이라고 설명하면 충분하다.

## 7. 임의 검색·삭제와 우선순위 변경

Heap은 Root 이외의 순서를 보장하지 않는다. 특정 ID를 찾기 위해 이진 탐색을 사용할 수 없으며 기본적으로 `O(n)` 선형 탐색이 필요하다.

임의 Index `i`를 알고 있다면 해당 원소를 마지막 원소로 덮고 배열 크기를 줄인 뒤 재조정할 수 있다. 새 값이 부모보다 우선하면 Sift-Up, 아니면 Sift-Down을 수행하므로 삭제 자체는 `O(log n)`이다. 문제는 Index를 찾는 비용이다.

빈번한 취소나 우선순위 변경이 필요하면 `id → heap index` Hash Map을 함께 유지할 수 있다.

```text
Heap Array                 Position Map
[T7, T3, T9, T1]          T7→0, T3→1, T9→2, T1→3
       │
       └─ swap할 때 두 ID의 Index도 함께 갱신
```

보조 Map으로 위치 조회는 평균 `O(1)`, 삭제·변경은 `O(log n)`이 된다. 하지만 모든 교환마다 Map을 정확히 갱신해야 한다. Heap만 변경되거나 Map만 변경되면 잘못된 원소를 제거하는 심각한 오류가 생긴다.

또 다른 방법은 Lazy Deletion이다. 취소된 Entry를 즉시 Heap에서 찾지 않고 `cancelled` Set이나 Version으로 무효 표시한다. Root에서 꺼낼 때 오래된 Entry면 버리고 다음 원소를 본다. 구현은 단순하지만 무효 Entry가 누적되어 메모리와 일시적인 정리 지연이 커질 수 있다.

## 8. 동일 우선순위와 안정성

일반 Heap은 같은 우선순위 원소의 입력 순서를 보장하지 않는다. 공정한 처리가 필요하면 비교 Key에 단조 증가 Sequence를 추가한다.

```text
Priority Key = (priority, enqueueSequence)

(10, 101)과 (10, 102)라면 먼저 들어온 101을 먼저 처리
```

Min/Max 방향과 Tie-break 규칙을 명확히 해야 한다. `priority` 숫자가 클수록 높은지, 작은 Deadline이 높은지 API 이름만으로 불분명할 수 있다. 비교 함수를 한 곳에 두고 단위 테스트로 동일 우선순위, 최솟값·최댓값, 경계값을 검증한다.

변경 가능한 객체를 Heap에 넣은 뒤 비교에 사용되는 필드를 외부에서 직접 바꾸면 배열 위치와 우선순위가 불일치한다. 전용 Update API에서 Sift를 수행하거나 기존 Entry를 무효화하고 새 Entry를 넣어야 한다.

## 9. 비슷한 구조와 비교

| 구조 | 최우선 확인 | 삽입 | 최우선 제거 | 임의 Key 조회 | 정렬·범위 |
|---|---:|---:|---:|---:|---:|
| Binary Heap | O(1) | O(log n) | O(log n) | O(n) | 부적합 |
| 정렬 배열 | O(1) | O(n) | 끝이면 O(1) | O(log n) | 유리 |
| 비정렬 배열 | O(n) | O(1) | O(n) | O(n) | 부적합 |
| 균형 BST | O(log n) | O(log n) | O(log n) | O(log n) | 유리 |
| Hash Table | 순서 없음 | 평균 O(1) | 순서 없음 | 평균 O(1) | 부적합 |

최우선 원소를 반복 처리하면 Heap이 자연스럽다. 특정 범위의 모든 Deadline을 순서대로 조회하거나 임의 Key 삭제가 핵심이면 균형 BST가 더 단순할 수 있다. 원소가 작고 거의 바뀌지 않으면 정렬 배열이 Cache 효율과 구현 복잡도에서 유리할 수 있다.

Priority Queue는 Heap과 동의어가 아니다. 정렬 배열, 균형 Tree, Bucket Queue 등으로도 구현할 수 있다. 우선순위 범위가 작은 정수라면 Bucket별 Queue가 더 빠를 수도 있다.

## 10. Heap Sort와 Top-K

Heap Sort는 배열을 Max Heap으로 만든 뒤 Root 최댓값을 배열 끝과 교환하고 Heap 크기를 줄이는 과정을 반복한다. Heapify `O(n)`과 `n`번의 제거 `O(n log n)`으로 전체 시간은 `O(n log n)`이며 추가 배열을 거의 쓰지 않는 In-place 정렬이 가능하다.

다만 일반적인 Heap Sort는 Stable Sort가 아니며, 연속 구간을 순차적으로 다루는 정렬보다 Cache 효율이 좋지 않을 수 있다.

가장 큰 `k`개만 필요하다면 크기 `k`의 Min Heap을 유지한다. 새 값이 Root보다 클 때만 Root를 교체하면 모든 원소를 정렬하지 않고 `O(n log k)`에 Top-K를 구할 수 있다. 실시간 피해량 상위 100명 같은 집계에 활용할 수 있다.

## 11. 장점과 단점

### 장점

- 전체를 정렬하지 않고 최우선 원소를 `O(1)`에 확인한다.
- 삽입과 최우선 제거를 `O(log n)`에 수행한다.
- 배열 기반이라 포인터 Tree보다 메모리 오버헤드와 Cache 측면에서 유리하다.
- Bottom-Up Heapify로 기존 배열을 `O(n)`에 Heap으로 만들 수 있다.
- Top-K와 Streaming 선택 문제에 적합하다.

### 단점

- Root 외의 원소는 정렬되어 있지 않아 임의 검색이 `O(n)`이다.
- 같은 우선순위의 입력 순서를 기본적으로 보장하지 않는다.
- 취소·Key 변경을 효율화하려면 Position Map이나 Lazy Deletion이 필요하다.
- 보조 Index와 Heap의 정합성 관리가 복잡해진다.
- Dynamic Array 재할당과 공유 접근 동기화는 별도 문제다.

## 12. 게임 서버·백엔드 실무 예시

### Timer와 예약 작업

Min Heap의 Key를 `(expireAt, timerId)`로 두면 가장 빨리 만료되는 Timer가 Root에 온다. Tick마다 Root만 확인해 현재 시각 이하인 동안 꺼내 실행한다.

```text
Timer 등록 ──push O(log n)──> Min Heap
                                 │
Game Tick ── now >= top.time? ───┤
                                 └─ yes: pop·실행, 다시 검사
```

Timer를 취소할 때 Heap 전체를 검색하면 `O(n)`이다. 취소 빈도가 낮으면 Lazy Deletion이 단순하다. 취소가 많고 Heap이 오래 유지된다면 Position Map, 주기적 Rebuild, 무효 Entry 비율 제한을 고려한다.

한 Tick에 만료 Timer가 폭증하면 모두 즉시 실행해 Tick Budget을 넘길 수 있다. 자료구조가 빠르더라도 실행 작업량은 별개다. Tick당 처리 상한, 지연 허용 범위, Overdue 지표와 Queue 크기 경보가 필요하다.

### Pathfinding과 작업 Queue

Dijkstra와 A*는 다음으로 확장할 비용이 가장 작은 정점을 Min Priority Queue에서 꺼낸다. 동일 정점의 더 좋은 경로가 발견됐을 때 Decrease-Key를 지원하지 않는 라이브러리라면 새 거리 Entry를 추가하고, 꺼낼 때 현재 최적 거리와 다르면 버리는 Lazy 방식도 사용한다.

Backend Worker의 Priority Queue에는 긴급 결제 보정과 일반 통계 작업이 함께 들어갈 수 있다. 높은 우선순위 작업이 계속 유입되면 낮은 우선순위 작업이 Starvation될 수 있다. 대기 시간이 길수록 우선순위를 올리는 Aging이나 우선순위별 처리 비율을 둔다.

### 동시성

일반 Priority Queue는 Thread-safe하지 않다. 여러 Thread가 배열 교환과 크기 변경을 동시에 수행하면 구조가 깨질 수 있다. 단일 소유 Thread에 메시지로 등록하거나 Lock으로 `push`, `pop`, 보조 Map 갱신 전체를 하나의 임계 구역으로 묶는다. 무제한 유입은 메모리 장애를 만들 수 있으므로 Capacity와 Backpressure도 설계한다.

## 13. 자주 하는 오해

- **Heap 전체는 정렬되어 있다**: 부모와 자식 사이의 부분 순서만 보장한다.
- **Heap과 Priority Queue는 같은 개념이다**: Priority Queue는 ADT이고 Heap은 대표 구현이다.
- **Heap에서 임의 Key도 O(log n)에 찾는다**: 위치 정보가 없으면 검색은 O(n)이다.
- **Heapify는 O(n log n)이다**: Bottom-Up Heapify는 O(n)이고, 하나씩 삽입하면 O(n log n)이다.
- **같은 우선순위는 입력 순서대로 나온다**: Sequence 같은 Tie-break Key가 없으면 안정성을 보장하지 않는다.
- **우선순위 필드를 직접 바꿔도 된다**: 위치가 자동 조정되지 않으므로 Heap 조건이 깨진다.
- **Priority Queue만 쓰면 Scheduler가 공정하다**: 지속적인 고우선 작업은 낮은 우선순위를 굶길 수 있다.

## 14. 면접 질문

### Q1. Heap과 Priority Queue의 차이는 무엇인가요?

Priority Queue는 가장 높은 우선순위 원소를 먼저 꺼내는 동작을 정의한 추상 자료형이고, Heap은 이를 구현하는 대표 자료구조입니다. Priority Queue는 균형 Tree나 정렬 배열 등으로도 구현할 수 있습니다.

### Q2. Binary Heap의 삽입과 삭제를 설명해 주세요.

삽입은 완전 이진 트리 형태를 위해 배열 끝에 추가한 뒤 부모와 비교하며 Sift-Up합니다. Root 삭제는 마지막 원소를 Root로 옮긴 뒤 더 우선인 자식과 교환하며 Sift-Down합니다. 둘 다 트리 높이만큼 이동해 `O(log n)`입니다.

### Q3. Heap의 Root가 최솟값이면 왜 이진 탐색은 할 수 없나요?

Min Heap은 부모가 자식보다 작다는 관계만 보장합니다. 왼쪽과 오른쪽 Subtree 사이의 대소 관계가 없으므로 비교 한 번으로 한쪽을 버릴 수 없고 임의 Key 검색은 최악 `O(n)`입니다.

### Q4. Bottom-Up Heapify가 O(n)인 이유는 무엇인가요?

Root 근처의 소수 노드는 많이 내려갈 수 있지만, 전체의 절반인 Leaf는 작업이 없고 대부분의 하단 노드는 한두 단계만 이동합니다. 높이별 노드 수와 작업량을 합하면 n에 비례합니다.

### Q5. Heap에서 임의 원소 삭제를 빠르게 하려면 어떻게 하나요?

ID에서 Heap Index를 찾는 Hash Map을 함께 유지합니다. Index를 찾은 후 마지막 원소로 대체하고 Sift-Up 또는 Sift-Down하면 `O(log n)`입니다. 모든 Swap에서 Position Map도 갱신해야 합니다.

### Q6. 게임 서버 Timer에 Heap을 쓸 때 고려할 점은 무엇인가요?

Min Heap으로 가장 이른 만료를 빠르게 찾을 수 있습니다. 취소 방식, 동일 시각 Tie-break, 무효 Entry 정리, 한 Tick의 만료 폭증, 동시 접근과 Queue 상한까지 함께 설계해야 합니다.

## 15. 예상 꼬리질문

- Min Heap과 Max Heap의 비교 함수는 어떻게 다른가요?
- 배열에서 부모와 자식 Index는 어떻게 계산하나요?
- Decrease-Key는 어떻게 구현하나요?
- Lazy Deletion의 장단점은 무엇인가요?
- Heap Sort의 복잡도와 안정성은 어떤가요?
- Top-K를 Heap으로 구하면 복잡도는 얼마인가요?
- 낮은 우선순위 작업의 Starvation은 어떻게 막나요?

## 16. 30초 모범답변

> Heap은 부모가 자식보다 우선하는 완전 이진 트리이며 Priority Queue의 대표 구현입니다. 배열로 저장해 Root의 최우선 원소를 `O(1)`에 확인하고, 삽입은 Sift-Up, 제거는 Sift-Down으로 `O(log n)`에 처리합니다. 전체가 정렬된 것은 아니어서 임의 검색은 `O(n)`이며, 게임 서버에서는 만료 Timer나 우선순위 작업 관리에 사용할 수 있습니다.

## 17. 1~2분 확장답변

> Priority Queue는 가장 우선인 원소를 먼저 꺼내는 ADT이고 Binary Heap은 대표 구현입니다. Heap은 완전 이진 트리라 배열에 빈칸 없이 저장할 수 있고, Min Heap에서는 모든 부모가 자식보다 작거나 같습니다. 그래서 최솟값은 Root에 있지만 형제나 서로 다른 Subtree의 순서는 보장하지 않습니다.
>
> 삽입은 배열 끝에 넣고 부모 방향으로 Sift-Up하며, Root 제거는 마지막 값을 Root로 옮기고 더 작은 자식 방향으로 Sift-Down합니다. 두 연산은 높이에 비례해 `O(log n)`, Top 확인은 `O(1)`입니다. 임의 ID 검색은 `O(n)`이므로 취소가 빈번하면 Position Map을 함께 유지하거나 Lazy Deletion을 사용합니다. 게임 서버 Timer에서는 가장 빠른 만료를 효율적으로 처리할 수 있지만, 만료 폭증의 Tick Budget, 동일 우선순위 순서, 취소 Entry 정리와 동시성 정책까지 설계해야 합니다.

## 18. 핵심 요약

- Priority Queue는 우선순위 동작을 정의한 ADT이고 Heap은 대표 구현이다.
- Binary Heap은 완전 이진 트리 형태와 부모·자식 Heap 조건을 가진다.
- 배열 Index만으로 부모와 자식을 계산할 수 있어 메모리 지역성이 좋다.
- Top은 `O(1)`, 삽입과 최우선 제거는 `O(log n)`, 임의 검색은 `O(n)`이다.
- Bottom-Up Heapify는 하단 노드의 작업이 작아 전체 `O(n)`이다.
- 임의 삭제는 Position Map, 단순 취소는 Lazy Deletion을 고려할 수 있다.
- 동일 우선순위 순서와 변경 가능한 Key는 명시적으로 처리해야 한다.
- Timer 운영에서는 실행 Budget, 오래된 Entry, 동시성, Backpressure까지 본다.

## 한 줄 정리

> Heap은 전체 정렬 비용 없이 가장 우선인 원소를 빠르게 반복 선택하도록 만든 배열 기반 완전 이진 트리다.
