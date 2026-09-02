---
difficulty: 3
reading_time: 25분
interview_frequency: 4
importance: 4
---

# 07. Heap과 Priority Queue


## 학습 목표

- 삽입·삭제 추적 시 Sift 방향이 잘못 선택됐을 때 어떤 Heap 조건 위반이 발생하는지 진단하고, Min/Max Heap 배열 표현에서 부모·자식 Index를 계산할 수 있다.
- Bottom-Up Heapify와 반복 삽입의 시간 복잡도 차이(O(n) vs O(n log n))를 설명하고, 각각이 적합한 상황을 구분할 수 있다.
- Priority Queue 구현체 후보(Heap, 정렬 배열, 균형 BST(Binary Search Tree)) 중 주어진 삽입·삭제·조회 패턴에 가장 적합한 구조를 트레이드오프 근거와 함께 선택할 수 있다.
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

```java
// 게임 서버: Priority Queue 기반 스킬 쿨다운 타이머
class CooldownTimer {
    // Min-Heap: 만료 시각 기준 정렬 (가장 빨리 끝나는 쿨다운이 top)
    private final PriorityQueue<CooldownEvent> heap =
        new PriorityQueue<>(Comparator.comparingLong(e -> e.expireAt));

    void schedule(long skillId, long expireAt) {
        heap.offer(new CooldownEvent(skillId, expireAt));
    }

    // 틱마다 호출: 현재 시각 이전에 만료된 쿨다운 처리
    void tick(long now) {
        while (!heap.isEmpty() && heap.peek().expireAt <= now) {
            CooldownEvent event = heap.poll(); // O(log n)
            notifySkillReady(event.skillId);
        }
    }
}

// Max-Heap: 높은 우선순위 패킷 먼저 처리
PriorityQueue<Packet> packetQueue =
    new PriorityQueue<>(Comparator.comparingInt((Packet p) -> p.priority).reversed());
```

Java `PriorityQueue`는 기본 Min-Heap이다. `Comparator.reversed()`로 Max-Heap으로 전환할 수 있다. Heap 내부 임의 원소 조회·수정은 `O(n)`이므로 우선순위 필드를 직접 바꾸면 Heap 조건이 깨진다.

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

### Q1. 게임 서버 Timer 시스템에서 쿨다운 취소 빈도가 높을 때, Position Map으로 즉시 제거하는 방식과 Lazy Deletion 중 어떤 전략을 선택하며 그 근거는 무엇인가?

취소 빈도가 높다면 일반적으로 Position Map 방식이 유리합니다. Lazy Deletion은 무효 Entry가 누적되어 Heap 크기가 실제 활성 Timer 수보다 커지고, 만료 처리 시 무효 Entry를 반복 건너뛰는 비용이 생깁니다. 반면 Position Map은 모든 Swap마다 Map을 동기화해야 하므로 구현 복잡도가 올라갑니다. 취소 빈도가 낮고 Heap이 짧게 유지되는 경우에는 Lazy Deletion이 단순하고 실용적입니다. 실무에서는 무효 Entry 비율을 모니터링하고, 일정 비율을 넘으면 주기적 Rebuild를 하이브리드로 적용하기도 합니다.

### Q2. Priority Queue 기반 작업 큐에서 낮은 우선순위 작업이 무기한 처리되지 않는 Starvation이 발생했다. 원인과 완화 방법을 설명하라.

Starvation의 원인은 높은 우선순위 작업이 지속적으로 유입되어 낮은 우선순위 작업이 항상 뒤로 밀리는 것입니다. 완화 방법으로는 첫째, Aging 기법을 사용해 대기 시간이 길어질수록 작업의 우선순위를 점진적으로 높입니다. 둘째, 우선순위별 처리 비율(예: 높음 70%, 낮음 30%)을 정해 낮은 우선순위 작업도 일정 비율 처리되도록 합니다. 셋째, 최대 대기 시간 상한을 두고 초과 시 강제로 처리합니다. 운영 측면에서는 우선순위별 Queue 깊이와 대기 시간을 지표로 수집해 Starvation을 사전에 감지해야 합니다.

### Q3. 이미 Heap에 삽입된 Timer의 만료 시각을 외부에서 직접 수정했을 때 어떤 문제가 생기고, 운영 중에 이를 어떻게 탐지하는가?

Heap은 삽입 당시의 Key 값으로 위치를 결정합니다. 삽입 이후 외부에서 만료 시각 필드를 직접 바꾸면 배열 내 위치는 구식 Key 기준 그대로이므로 Heap 조건이 조용히 깨집니다. Root가 최솟값이 아닌 채로 Tick이 돌면 아직 만료되지 않은 Timer가 먼저 실행되거나, 이미 지나간 Timer가 계속 Heap 안에 남아 있게 됩니다. 탐지 방법으로는 첫째, 전체 Heap을 순회하며 부모-자식 Key 관계를 검증하는 `assertHeapInvariant()` 함수를 QA·스테이징에서 주기적으로 실행합니다. 둘째, Root의 만료 시각이 현재 시각보다 과거인데도 실행 대상 조건에 걸리지 않는 케이스를 로깅해 이상 패턴을 감지합니다. 셋째, Timer 객체를 불변으로 설계해 만료 시각 변경이 필요하면 기존 Entry를 취소하고 새 Entry를 삽입하는 전용 API만 허용합니다.

### Q4. 게임 서버의 틱 루프에서 Timer 처리 중 p99 지연이 평소의 3배로 튀었다. 어떤 원인을 먼저 의심하고 어떤 순서로 진단하는가?

첫 번째로 한 틱에 만료된 Timer 수를 확인합니다. 특정 시각에 대량 등록된 Timer가 동시에 만료되어 Tick Budget을 초과했을 가능성이 높습니다. `pop` 횟수가 평소 대비 수십 배 급증했는지를 메트릭으로 확인합니다. 두 번째로 Heap 크기를 봅니다. 취소되지 않은 무효 Entry가 누적되어 Heap이 비정상적으로 크면 Sift-Down 단계가 늘어나 `O(log n)`의 n이 커진 효과가 납니다. 세 번째로 GC 로그를 확인합니다. 만료 Timer 콜백이 객체를 대량 생성했다면 Minor GC가 지연을 유발할 수 있습니다. 네 번째로 Tick 처리 내부에서 I/O(Input/Output)나 Lock 대기가 발생하는지 확인합니다. 자료구조 자체는 빠르더라도 콜백 안에서 DB 호출이 섞이면 지연이 폭증합니다. 원인이 Timer 폭증이면 틱당 처리 상한을 두고 초과분은 다음 틱으로 넘깁니다.

### Q5. 삽입이 거의 없고 조회(범위 탐색·임의 Key 접근)가 빈번한 게임 서버 컴포넌트에서, 정렬 배열이 Heap보다 나을 수 있는 이유와 그 전환 판단 기준은 무엇인가?

정렬 배열은 이진 탐색으로 임의 Key를 `O(log n)`에 찾고, 만료 범위 전체를 연속 메모리 슬라이스로 꺼낼 수 있습니다. Heap은 임의 Key 조회가 `O(n)`이고 범위 탐색도 순회가 필요합니다. 반면 정렬 배열의 삽입은 시프트 비용 때문에 `O(n)`입니다. 따라서 삽입 빈도가 낮고 조회가 지배적인 경우, 특히 원소 수가 수천 이하라면 Cache 친화적인 정렬 배열이 실제 처리량에서 앞설 수 있습니다. 전환 판단 기준으로는 삽입과 조회의 비율을 프로파일링해 삽입이 전체의 5~10% 미만이고 범위 탐색이 자주 발생한다면 정렬 배열을 선택합니다. 원소 수가 늘어날수록 삽입 시프트 비용이 커지므로 임계점을 벤치마크로 측정해 결정합니다.

### Q6. Aging 기반으로 낮은 우선순위 작업의 우선순위를 점진적으로 올릴 때, 공정성과 기아 방지 사이에서 어떤 균형 설계를 선택하고 그 근거는 무엇인가?

Aging은 대기 시간 t마다 우선순위를 δ만큼 높여 낮은 우선순위 작업도 결국 처리되도록 보장합니다. 균형 설계에서 핵심 변수는 두 가지입니다. 첫째, Aging 속도(δ)를 너무 빠르게 설정하면 낮은 우선순위 작업이 빠르게 높은 우선순위와 동등해져 우선순위 제어 자체가 무의미해집니다. 너무 느리면 기아가 방지되지 않습니다. 실무에서는 SLA 기준의 최대 허용 대기 시간을 역산해 Aging 속도를 정합니다. 예를 들어 최대 30초 대기를 허용한다면 30초 내에 우선순위가 최상위에 도달하도록 δ를 설정합니다. 둘째, 우선순위 상한선(cap)을 두어 Aging된 작업이 실시간 긴급 작업과 동일 레벨로 올라가지 않도록 합니다. 긴급 작업 전용 최상위 구간을 예약하고, 일반 작업의 Aging 상한은 그 바로 아래로 제한합니다. 운영 지표로는 우선순위별 대기 시간 분포와 Aging 발동 횟수를 수집해 설정값이 실제 트래픽 패턴에 맞는지 주기적으로 검증합니다.

## 15. 예상 꼬리질문

- Position Map 방식에서 Heap Swap 도중 프로세스가 죽으면 어떤 정합성 문제가 생기고 어떻게 복구하는가?
  > Heap 배열과 Position Map이 중간 상태로 남아 서로 다른 Index를 가리킨다. 재시작 시 Heap 배열을 진실 원천으로 삼고 Position Map을 전체 재스캔으로 재구성하거나, Timer를 외부 Durable 저장소에서 다시 로드해 Heap을 처음부터 빌드한다.
- Lazy Deletion을 쓸 때 무효 Entry가 전체의 몇 퍼센트를 넘으면 주기적 Rebuild를 고려해야 하는가? 그 기준은 어디서 오는가?
  > 일반적으로 무효 Entry 비율이 30~50%를 넘으면 Heap 크기 대비 유효 원소 수가 절반 이하가 되어 Sift-Down 단계가 불필요하게 늘어난다. 기준은 이론적이 아니라 실측에서 나온다. 무효 Entry 비율과 pop 평균 지연을 함께 수집해 지연이 목표치를 초과하는 시점이 Rebuild 트리거다.
- 게임 서버에서 동일 만료 시각의 Timer가 수천 개 동시에 등록되는 이벤트 상황에서 Tie-break를 Sequence로 처리할 때 어떤 overflow 문제가 생길 수 있는가?
  > 단조 증가 Sequence를 `int`로 선언하면 약 21억 회 등록 후 음수로 Wrap돼 Heap 정렬이 역전된다. `long`을 사용하면 실질적으로 Overflow가 없지만, 이벤트 기간에 짧은 시간 동안 수천만 건이 몰린다면 Sequence 소비 속도를 모니터링해야 한다.
- Priority Queue에 Capacity 상한을 두고 Backpressure를 적용할 때, 상한 초과 시 새 요청을 거부하는 것과 기존 최저 우선순위 항목을 밀어내는 방식 중 어느 쪽을 언제 선택하는가?
  > 새 요청 거부는 생산자에게 명확한 실패 신호를 주어 재시도·대기를 유도한다. 긴급도가 높은 신규 요청이 기존 낮은 우선순위보다 중요할 때는 밀어내기(evict-min)가 적합하다. 밀어내기는 버려진 작업의 후속 처리 책임이 명확해야 하므로, 멱등성 없는 작업에는 위험하다.
- Aging으로 우선순위를 올린 작업이 처리된 뒤 원래 우선순위로 복원해야 하는 경우가 있는가? 있다면 어떻게 구현하는가?
  > 재시도 정책처럼 동일 작업이 다시 Queue에 들어갈 때 원래 우선순위로 복원해야 한다면, 작업 객체에 원본 우선순위 필드를 별도 보존하고 재삽입 시 사용한다. Aging으로 변경된 우선순위를 Heap 내부에서 직접 복원하려면 Position Map과 Sift가 필요하다.
- Heap 기반 Timer와 Time Wheel 구조를 비교할 때 어떤 조건에서 Time Wheel이 유리한가?
  > 만료 시각이 고정 해상도(예: 1ms 단위)로 제한되고 Timer 수가 많으며 만료 범위가 좁을 때 Time Wheel이 유리하다. 특정 슬롯을 직접 O(1)에 찾아 등록·취소할 수 있어 대규모 Timer를 낮은 지연으로 처리한다. 반면 만료 시각이 매우 넓게 분산되면 Wheel 크기가 커지거나 계층이 필요해진다.
- 단일 Thread Tick 루프에서 Timer 콜백이 또 다른 Timer를 등록할 경우 재진입(re-entrancy) 문제를 어떻게 처리하는가?
  > Tick 루프가 Heap에서 꺼내 콜백을 실행하는 도중 콜백이 같은 Heap에 push하면 순회 중 구조가 변경된다. 콜백 실행 중 새 등록 요청을 별도 임시 Queue에 모아두고, 현재 Tick의 처리가 끝난 뒤 일괄 Heap에 삽입하는 방식으로 재진입을 격리한다.
- Position Map 없이 Heap에서 특정 Timer를 취소할 때 `O(n)` 탐색 대신 쓸 수 있는 다른 트릭이 있는가?
  > Timer ID와 Generation(버전) 번호를 함께 저장하고, 취소 시 해당 ID의 Generation을 무효화한다. pop할 때 꺼낸 Entry의 Generation이 현재 Generation과 다르면 이미 취소된 것으로 간주하고 버린다. 이는 Lazy Deletion의 변형으로 Position Map 없이 O(1) 취소를 흉내 낸다.

## 16. 30초 모범답변

> Heap은 부모가 자식보다 우선하는 완전 이진 트리이며 Priority Queue의 대표 구현입니다. 게임 서버 Timer 설계에서는 취소 빈도를 먼저 판단합니다. 취소가 빈번하면 Position Map으로 O(log n) 즉시 제거를 선택하고, 취소가 드물면 Lazy Deletion으로 구현 복잡도를 낮춥니다. Starvation 완화는 대기 시간 기반 Aging과 우선순위 상한선을 함께 설정해 긴급 작업 구간을 보호합니다. 삽입 이후 Timer 객체의 만료 Key를 외부에서 직접 변경하면 Heap 조건이 조용히 깨지므로, 불변 객체 설계와 전용 Update API로 방지해야 합니다.

## 17. 1~2분 확장답변

> Priority Queue는 가장 우선인 원소를 먼저 꺼내는 ADT이고 Binary Heap은 대표 구현입니다. Heap은 완전 이진 트리라 배열에 빈칸 없이 저장할 수 있고, Min Heap에서는 모든 부모가 자식보다 작거나 같습니다. 최솟값은 Root에 있지만 형제나 서로 다른 Subtree의 순서는 보장하지 않습니다.
>
> 삽입은 배열 끝에 넣고 Sift-Up, Root 제거는 마지막 값을 Root로 옮기고 Sift-Down합니다. 두 연산 모두 `O(log n)`, Top 확인은 `O(1)`입니다.
>
> 취소 전략 선택은 무효 Entry 누적 비율로 판단합니다. Lazy Deletion은 무효 Entry가 전체의 30~50%를 초과하면 Heap 크기 증가로 Sift 단계가 늘어나 실질적인 성능 저하가 발생합니다. 이 시점에 Position Map 방식 또는 주기적 Rebuild로 전환합니다. Position Map은 모든 Swap마다 Map을 정확히 동기화해야 하므로 Swap 도중 버그가 생기면 잘못된 원소를 제거하는 심각한 오류로 이어집니다. `assertHeapInvariant()` 검증을 스테이징에서 정기 실행해 불변식 위반을 조기에 잡습니다.
>
> p99 지연이 급등하면 진단 순서는 다음과 같습니다. 먼저 한 Tick의 `pop` 횟수가 평소 대비 급증했는지 확인합니다. Timer 폭증이면 Tick당 처리 상한을 두고 초과분을 다음 Tick으로 미룹니다. 다음으로 Heap 크기가 비정상적으로 크면 무효 Entry 누적을 의심합니다. 마지막으로 콜백 내부에서 I/O나 Lock 대기가 섞였는지 확인합니다. 자료구조가 빠르더라도 콜백 실행량이 많으면 Tick Budget은 초과합니다.

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
