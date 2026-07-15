---
difficulty: 3
reading_time: 20분
interview_frequency: 4
importance: 4
---

# 03. Stack, Queue, Deque

> 게임 서버·백엔드 개발자를 위한 CS 면접 교재

## 학습 목표

- 구조와 핵심 연산을 설명할 수 있다.
- 시간 복잡도와 메모리 특성을 비교할 수 있다.
- 게임 서버 요구에 맞는 자료구조를 선택할 수 있다.

## 1. 개요

Stack은 LIFO, Queue는 FIFO, Deque는 양쪽 끝 삽입·삭제를 제공하는 선형 자료구조다.

스택(Stack)은 가장 나중에 넣은 원소를 먼저 꺼내는 LIFO(Last In, First Out) 구조다. 큐(Queue)는 가장 먼저 넣은 원소를 먼저 꺼내는 FIFO(First In, First Out) 구조다. 덱(Deque, Double-ended Queue)은 앞과 뒤 양쪽에서 삽입·삭제할 수 있다.

세 이름은 데이터 저장 구현보다 허용하는 연산과 순서라는 추상 자료형(ADT)의 의미다. Stack을 동적 배열이나 연결 리스트로 만들 수 있고 Queue를 원형 배열이나 연결 리스트로 만들 수 있다. 인터페이스가 불필요한 임의 접근을 감춰 알고리즘 의도를 분명히 한다.

## 2. 왜 필요한가
호출·되돌리기, 도착 순서 처리, 양방향 Window처럼 접근 순서를 제한해 문제를 단순화한다. 자료구조 선택은 Big-O뿐 아니라 데이터 크기, 접근 패턴, 메모리 배치와 갱신 빈도에서 시작한다.

수식 괄호 검사와 DFS는 가장 최근의 미완료 작업으로 돌아가므로 Stack이 자연스럽다. 네트워크 패킷과 작업 요청은 일반적으로 도착한 순서대로 처리하므로 Queue가 의미를 표현한다. Sliding Window에서 앞의 오래된 값은 제거하고 뒤에 새 값을 넣으려면 Deque가 적합하다.

처리 순서가 자료구조에 포함되면 호출자가 실수로 중간 원소를 꺼내는 것을 막고 시간 복잡도를 예측하기 쉽다. 하지만 FIFO가 공정성과 기한을 모두 보장하지는 않는다. 긴 작업 하나가 앞에 있으면 뒤의 짧은 작업이 기다리는 Head-of-Line Blocking이 생길 수 있다.

## 3. 핵심 동작 원리
```text
Stack: push→top→pop / Queue: enqueue→front→dequeue / Deque: push/pop both ends
```
Stack과 Queue는 인터페이스 의미이고 배열이나 연결 리스트로 구현할 수 있다. 원형 배열 Queue는 앞 공간을 재사용한다.

평균·최악 복잡도와 함께 할당, Cache 지역성, 순회 비용, 참조 안정성을 봐야 한다.

### Stack

```text
push A       push B       push C       pop → C
┌───┐        ┌───┐        ┌───┐        ┌───┐
│ A │        │ B │        │ C │        │ B │
└───┘        ├───┤        ├───┤        ├───┤
             │ A │        │ B │        │ A │
             └───┘        ├───┤        └───┘
                          │ A │
                          └───┘
```

- `push(x)`: Top에 원소 추가
- `pop()`: Top 원소 제거·반환
- `top()` 또는 `peek()`: 제거 없이 Top 확인
- `isEmpty()`: 원소 존재 여부 확인

동적 배열 구현은 끝을 Top으로 사용해 연속성과 낮은 Overhead를 얻는다. Capacity 재할당 순간은 O(N)이지만 Push는 분할 상환 O(1)이다. 연결 리스트 구현은 Head를 Top으로 두면 Push·Pop O(1)이지만 노드 할당과 Pointer Overhead가 있다.

Stack Underflow는 빈 Stack에서 Pop·Top을 시도하는 오류다. 고정 크기 Stack에서는 Capacity를 넘는 Overflow도 처리해야 한다. 시스템 호출 Stack의 Overflow와 자료구조 Stack Capacity Overflow는 문맥을 구분한다.

### Queue

```text
enqueue D
                       front                rear
                         |                    |
Queue:                 [A] [B] [C] [D]
dequeue → A              → 다음 front는 B
```

- `enqueue(x)`: Rear에 추가
- `dequeue()`: Front 제거·반환
- `front()` 또는 `peek()`: 다음 처리 원소 확인

단순 배열에서 Dequeue할 때마다 모든 원소를 앞으로 옮기면 O(N)이다. Front Index를 증가시키면 이동은 피하지만 앞의 빈 공간을 재사용하지 않으면 배열 끝에 도달한다. 원형 버퍼가 이 문제를 해결한다.

연결 리스트 Queue는 Head·Tail을 모두 보관해 Enqueue와 Dequeue를 O(1)에 만든다. Tail 없이 Enqueue하면 마지막 노드를 찾는 O(N)이 된다. 각 노드 할당과 낮은 Cache 지역성은 남는다.

### 원형 Queue·Ring Buffer

고정 배열의 끝을 다음 위치가 처음으로 이어지는 것처럼 사용한다.

```text
capacity = 5

index:  0   1   2   3   4
       [D] [E] [_] [B] [C]
             ^       ^
            rear    front

next(i) = (i + 1) mod capacity
```

Front와 Rear Index가 끝을 넘으면 0으로 Wrap-around한다. 빈 상태와 가득 찬 상태를 구분하는 방법은 다음 중 하나다.

- `size`를 별도로 저장한다.
- 한 칸을 항상 비워 `next(rear) == front`를 Full로 본다.
- Index에 증가 세대나 별도 Flag를 사용한다.

Size 방식은 Capacity 전체를 쓰지만 Size 갱신이 필요하다. 한 칸 비우기는 단순하지만 실제 저장 가능 수가 하나 줄어든다. 동시 Ring Buffer는 Producer·Consumer Index의 원자성과 메모리 순서를 추가로 설계해야 한다.

### Dynamic Circular Queue

Queue가 가득 찼을 때 더 큰 배열로 늘릴 수 있다. 논리 순서가 물리 배열 끝에서 Wrap되어 있으면 두 구간을 새 배열의 0부터 연속으로 복사한다.

```text
Old physical: [D E _ B C], logical: B C D E
New physical: [B C D E _ _ _ _]
```

재할당은 O(N), Enqueue는 분할 상환 O(1)이다. 실시간 네트워크 Queue에서는 무제한 확장보다 고정·Bounded Capacity와 Overflow 정책이 더 중요할 수 있다.

### Deque

```text
push_front A ← [B][C][D] → push_back E
pop_front      ↑     ↑       pop_back
```

Deque는 `push_front`, `pop_front`, `push_back`, `pop_back`을 O(1)로 제공하는 것이 목표다. 원형 동적 배열 또는 고정 크기 Block들의 Map으로 구현할 수 있다. C++ `std::deque`는 일반적으로 하나의 완전 연속 배열이 아니며 참조·Iterator 무효화 규칙이 `vector`와 다르다.

Deque 하나로 Stack과 Queue 인터페이스를 모두 구현할 수 있다. 그러나 코드 의도를 위해 Stack·Queue 추상 타입을 쓰는 편이 나을 수 있다.

### 시간 복잡도

| 구조·연산 | Push/Enqueue | Pop/Dequeue | Peek | Search |
|---|---:|---:|---:|---:|
| Stack Top | 분할 상환 O(1) | O(1) | O(1) | O(N) |
| Queue Front/Rear | 분할 상환 O(1) | O(1) | O(1) | O(N) |
| Deque 양끝 | 분할 상환 O(1) | O(1) | O(1) | O(N) |

고정 Ring Buffer라면 재할당 없이 양끝 연산 O(1)을 제공할 수 있지만 Full 시 실패·덮어쓰기·대기 중 정책을 선택해야 한다. 원소 파괴·할당 비용은 Big-O 표 밖에 있다.

### Stack의 대표 알고리즘

#### 괄호 검사

열린 괄호를 Stack에 넣고 닫힌 괄호가 오면 Top과 짝이 맞는지 확인한다.

```text
Input: {[()]}
{ push → [ push → ( push → ) pop → ] pop → } pop
마지막 Stack Empty → 올바름
```

시간 O(N), 추가 공간 O(N) 최악이다.

#### 재귀 DFS 대체

재귀 호출은 호출 Stack을 사용한다. 깊이가 큰 Graph에서 Stack Overflow를 피하거나 순서를 직접 제어하려면 명시적 Stack을 쓴다.

```text
stack.push(start)
while stack not empty:
    node = stack.pop()
    if visited: continue
    visit node
    push neighbors
```

이웃을 Push하는 순서에 따라 방문 순서가 달라진다. 재귀와 같은 순서를 원하면 역순 Push가 필요할 수 있다.

### Queue의 대표 알고리즘

BFS는 시작점에서 거리별 Layer 순서로 방문하므로 Queue를 사용한다.

```text
Queue [Start]
dequeue Start → Neighbor A,B enqueue
Queue [A,B]
dequeue A → 다음 Neighbor enqueue
```

가중치 없는 Graph의 최단 Edge 수를 구할 수 있다. 방문 표시를 Dequeue 시점이 아니라 Enqueue 시점에 해야 같은 노드가 Queue에 여러 번 들어가는 것을 줄인다.

### Deque의 대표 알고리즘

Sliding Window 최댓값은 값이 감소하는 순서의 Index를 Deque에 유지해 각 원소를 한 번 넣고 한 번 빼 O(N)에 처리할 수 있다.

```text
Window size 3, values [2,1,5,3]

2: deque [2]
1: deque [2,1]
5: 뒤의 1,2 제거 → [5], max 5
3: deque [5,3], max 5
```

실제로는 중복 값과 Window 이탈을 처리하기 위해 값보다 Index를 저장한다.

### Bounded Queue와 역압력

Producer가 초당 10만 작업을 넣고 Consumer가 5만 처리하면 Queue는 초당 5만씩 증가한다. 무제한 Queue는 과부하를 없애지 않고 메모리와 긴 대기 시간으로 바꾼다.

```text
Producer 100k/s → [Queue +50k/s 누적] → Consumer 50k/s
```

Bounded Queue가 Full일 때 정책은 다음과 같다.

- Producer 대기: Backpressure를 직접 전파하지만 Thread 고갈 주의
- 즉시 거절: Client가 Backoff·Retry하거나 실패 처리
- 오래된 작업 Drop: 최신 상태만 중요한 위치 갱신에 적합
- 최신 작업 Drop: 이미 들어온 작업 보존이 중요할 때
- Key별 합치기: Player 위치처럼 최신 값 하나로 Coalescing

작업 의미에 맞춰 선택한다. 결제 명령을 위치 갱신처럼 Drop해서는 안 된다.

### FIFO와 공정성

FIFO는 Queue 진입 순서를 보존하지만 작업 처리 시간이 다르면 완료 순서까지 같지 않을 수 있다. 여러 Worker가 A, B를 차례로 가져가도 B가 먼저 끝날 수 있다. 엄격한 Key별 순서가 필요하면 같은 Key를 같은 Partition·Owner Queue로 Route한다.

긴 작업이 Queue Head를 막으면 짧은 작업의 지연이 커진다. 작업 유형별 Queue 분리, Priority Queue와 Deadline Scheduling을 고려한다. 우선순위만 사용하면 낮은 우선순위가 굶을 수 있어 Aging·Quota가 필요하다.

### 동시 Queue

Multi-producer Multi-consumer Queue는 Head·Tail과 Node 수명을 동기화해야 한다. 단순 컨테이너에 Lock을 둘 수도 있고 검증된 Lock-free Queue를 사용할 수도 있다. Lock-free는 ABA, Memory Reclamation과 Memory Ordering이 어려우므로 표준 Library를 우선한다.

Single-producer Single-consumer Ring Buffer는 역할이 고정되어 비교적 단순하고 Cache 친화적이다. Head·Tail을 서로 다른 Cache Line에 두어 False Sharing을 줄이는 최적화도 측정 후 적용한다.

## 4. 쉬운 예시
플레이어를 ID로 찾는 작업과 접속 순서대로 처리하는 작업은 요구가 다르다. 전자는 Key 조회 구조, 후자는 Queue가 자연스럽다. 한 구조로 모든 요구를 해결하려 하지 않는다.

Stack은 접시를 위에 쌓고 위에서 꺼내는 것과 비슷하다. Queue는 줄을 먼저 선 사람이 먼저 입장하는 것과 비슷하다. Deque는 양쪽 문으로 물건을 넣고 뺄 수 있는 통로와 비슷하다.

실제 기술에서는 Stack Top과 Queue Front·Rear Index 또는 Node Link를 조작한다. Queue는 단순 공정성 비유를 넘어 처리 속도 차이, Full 상태와 동시 Producer를 설계해야 한다.

## 5. 비슷한 개념과 비교
| 요구 | 유리한 구조 | 핵심 비용 |
|---|---|---|
| 순차 순회 | 연속 배열 | 중간 이동 |
| Key 조회 | Hash·Tree | Hash 충돌·균형 |
| 순서 제한 | Stack·Queue | 제한된 접근 |

| 구분 | Stack | Queue | Deque | Priority Queue |
|---|---|---|---|---|
| 꺼내는 기준 | 최근 삽입 | 먼저 삽입 | 선택한 양끝 | 가장 높은 우선순위 |
| 대표 구현 | Dynamic Array | Ring Buffer·List | Ring·Block | Heap |
| 대표 용도 | DFS·Undo | BFS·작업 처리 | Sliding Window | Scheduler·Timer |
| 주요 위험 | 깊이·Overflow | 무한 대기열 | 구현별 참조 규칙 | Starvation·동점 순서 |

Queue와 Message Broker도 구분한다. 프로세스 메모리 Queue는 빠르지만 Process Crash 시 사라질 수 있다. Broker는 Durable Log, Ack, Consumer Group과 재전송을 제공할 수 있지만 Network·운영 비용과 중복 처리가 있다.

## 6. 장점과 단점
적합한 자료구조는 코드를 단순하게 하고 예상 복잡도를 제공한다. 부적합한 구조는 불필요한 탐색·할당·메모리 이동을 만든다. 작은 데이터에서는 단순한 배열이 복잡한 구조보다 빠를 수 있다.

접근을 양끝으로 제한하면 O(1) 연산과 단순한 불변식을 제공한다. 배열 기반 구조는 Cache 친화적이지만 Resize·고정 Capacity를 다뤄야 하고, 연결 구조는 크기 변화가 쉽지만 할당·Pointer 비용이 있다. Queue는 Producer·Consumer 속도 차이를 흡수하지만 제한이 없으면 장애를 지연시킬 뿐이다.

## 7. 게임 서버·백엔드 실무 예시
네트워크 작업 큐는 FIFO를 사용하지만 우선순위와 역압력이 필요할 수 있다. 무제한 Queue는 부하를 지연과 메모리 문제로 바꾼다.

운영에서는 원소 수 분포, 연산 비율, 할당률, p99 지연을 측정한다. 동시 접근이 있다면 자료구조 자체와 별도로 소유권과 동기화를 설계한다.

### 네트워크 수신 Queue

I/O Thread가 Decode한 명령을 Game Room 소유 Thread의 Bounded Queue에 넣는다. Player별 Sequence를 검증하고 Queue가 Full이면 위치 갱신은 최신 값으로 합치되 구매·채팅은 명시 실패나 Durable 경로로 보낸다.

Queue Depth, 가장 오래된 작업 Age, Enqueue·Dequeue Rate, Full·Drop 수, Key별 편향과 처리 p99를 본다. Depth가 일정해도 오래 걸리는 작업이 순환하며 Age가 높을 수 있으므로 둘 다 본다.

### Tick Double Buffer

현재 Tick에서 들어오는 작업 Queue와 처리할 Queue를 Swap하면 처리 중 추가되는 작업과 경계를 분리할 수 있다.

```text
Tick N start: incoming Queue ↔ processing Queue swap
processing을 끝까지 처리
새 요청은 incoming에 쌓여 Tick N+1에서 처리
```

한 Tick 최대 작업 수와 남은 작업 Carry-over 정책이 필요하다. 모든 작업을 끝낼 때까지 Tick을 늘리면 Frame 시간이 폭증한다.

### Undo·Command Stack

운영 툴의 편집 명령에 반대 작업을 저장해 Undo Stack을 만들 수 있다. 새 명령을 실행하면 Undo에 Push하고 Undo 시 Redo Stack으로 옮긴다. 외부 결제나 이미 전파된 이벤트는 단순 역연산으로 완전히 되돌릴 수 없으므로 도메인 보상 작업이 필요하다.

### Timer

가장 이른 Deadline부터 처리하려면 FIFO Queue보다 Min-Heap이 적합하다. Deadline 범위가 제한되고 많은 Timer가 있으면 Timing Wheel을 검토한다. 구조 이름보다 어떤 순서로 다음 작업을 골라야 하는지가 선택 기준이다.

### 동시성

Queue Library가 Thread-safe여도 Enqueue한 명령의 업무 순서와 정확히 한 번 처리를 보장하지 않는다. Network 재전송·Producer 재시도는 중복 명령을 만들 수 있어 Command ID·Sequence와 멱등성을 둔다.

## 8. 자주 하는 오해
- Big-O가 같으면 실제 성능도 같다고 본다.
- 평균 O(1)을 최악 O(1)로 생각한다.
- 컨테이너가 모든 참조를 영구히 유지한다고 본다.
- 동시성 안전이 자동 제공된다고 본다.
- 원소 수가 작아도 복잡한 구조를 먼저 선택한다.
- Queue가 FIFO면 여러 Worker의 완료 순서도 FIFO라고 생각한다.
- 무제한 Queue가 Traffic Burst를 안전하게 해결한다고 본다.
- Deque는 항상 하나의 연속 Memory라고 생각한다.
- Thread-safe Queue면 Message 중복과 업무 순서도 자동 해결된다고 본다.

## 9. 면접 질문
### Q1. 구조와 핵심 연산을 설명해 주세요.
Stack은 LIFO, Queue는 FIFO, Deque는 양쪽 끝 삽입·삭제를 제공하는 선형 자료구조다.
### Q2. 시간 복잡도와 Trade-off는 무엇인가요?
Stack과 Queue는 인터페이스 의미이고 배열이나 연결 리스트로 구현할 수 있다. 원형 배열 Queue는 앞 공간을 재사용한다.
### Q3. 게임 서버 사용 사례는 무엇인가요?
네트워크 작업 큐는 FIFO를 사용하지만 우선순위와 역압력이 필요할 수 있다. 무제한 Queue는 부하를 지연과 메모리 문제로 바꾼다.
### Q4. 실제 성능은 무엇으로 달라지나요?
원소 수, 접근 지역성, 할당과 Resize, 충돌·균형, 동시 접근 방식으로 달라진다.

### Q5. 원형 Queue가 필요한 이유는 무엇인가요?

배열 Queue에서 Dequeue된 앞 공간을 원소 이동 없이 재사용하기 위해서다. Front와 Rear를 Capacity 기준으로 Wrap-around하고 Size나 빈 한 칸으로 Empty·Full을 구분한다.

### Q6. Queue를 무제한으로 두면 어떤 문제가 있나요?

Producer 속도가 Consumer보다 계속 빠를 때 Queue가 메모리와 대기 시간을 무한히 늘린다. 과부하가 늦게 드러나고 Timeout 재시도로 더 커질 수 있어 Capacity와 대기·거절·Drop·Coalescing 정책이 필요하다.

### Q7. Stack과 재귀는 어떤 관계인가요?

재귀 호출은 호출 Stack에 반환 위치와 지역 상태를 쌓는다. 명시적 Stack으로 DFS를 구현하면 깊이 제한과 방문 순서를 직접 제어하고 호출 Stack Overflow를 피할 수 있다.

## 10. 예상 꼬리질문
- 평균과 최악 복잡도는 어떻게 다른가요?
- 메모리 지역성이 왜 중요한가요?
- 삽입·삭제가 참조에 어떤 영향을 주나요?
- 동시 접근은 어떻게 보호하나요?
- 다른 자료구조와 조합할 수 있나요?
- Circular Queue의 Empty와 Full을 어떻게 구분하나요?
- Queue Depth와 Oldest Age를 함께 봐야 하는 이유는 무엇인가요?

## 11. 30초 모범답변
> Stack은 최근 원소부터, Queue는 먼저 온 원소부터, Deque는 양쪽 끝을 O(1)에 처리합니다. 구현보다 요구하는 처리 순서가 선택 기준입니다. 네트워크 작업 큐는 FIFO를 사용하지만 우선순위와 역압력이 필요할 수 있다.

## 12. 1~2분 확장답변
> Stack은 최근 원소부터, Queue는 먼저 온 원소부터, Deque는 양쪽 끝을 O(1)에 처리합니다. 구현보다 요구하는 처리 순서가 선택 기준입니다. 선택할 때는 조회, 삽입, 삭제, 순회 비율과 원소 수를 먼저 봅니다. Big-O 외에도 메모리 지역성, 할당, Resize와 최악 지연을 고려합니다. 게임 서버에서는 ID 조회, 작업 순서, 랭킹처럼 요구별로 구조를 분리하고 실제 부하로 검증합니다.

## 13. 핵심 요약
- Stack은 LIFO, Queue는 FIFO, Deque는 양쪽 끝 삽입·삭제를 제공하는 선형 자료구조다.
- 접근 패턴이 선택 기준이다.
- 평균과 최악 복잡도를 구분한다.
- 메모리 배치와 할당 비용을 고려한다.
- 동시성은 별도 설계가 필요하다.
- Stack·Queue·Deque는 저장 방식보다 꺼내는 순서를 제한하는 인터페이스가 핵심이다.
- 서버 Queue에는 Capacity, 역압력, 업무별 Drop·Retry와 순서 정책이 필요하다.

## 한 줄 정리
> Stack은 최근 원소부터, Queue는 먼저 온 원소부터, Deque는 양쪽 끝을 O(1)에 처리합니다. 구현보다 요구하는 처리 순서가 선택 기준입니다.
