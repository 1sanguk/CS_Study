---
difficulty: 3
reading_time: 20분
interview_frequency: 4
importance: 4
---

# 03. Stack, Queue, Deque


## 학습 목표

- LIFO·FIFO·양방향 접근 패턴이 각 자료구조를 결정하는 방식과 Circular Buffer·Deque 내부 구현 차이를 바탕으로, 요구 사항에 맞는 구조를 선택할 수 있다.
- O(1) 연산의 전제 조건과 Circular Buffer가 꽉 찼을 때 vs Linked List Queue의 처리 차이를 비교해, 실시간 시스템에서 어느 구현이 더 안전한지 판단할 수 있다.
- Producer-Consumer 속도 불일치 상황에서 Bounded Queue의 역할과 무제한 Queue의 위험을 분석해, 장애 발생 시 어느 설계가 더 빨리 드러나는지 설명할 수 있다.
- 게임 서버에서 패킷 수신·AI 틱·로그 비동기 처리에 Stack·Queue·Deque를 각각 선택하는 조건과 근거를 제시할 수 있다.

## 1. 개요

Stack은 LIFO, Queue는 FIFO, Deque는 양쪽 끝 삽입·삭제를 제공하는 선형 자료구조다.

스택(Stack)은 가장 나중에 넣은 원소를 먼저 꺼내는 LIFO(Last In First Out) 구조다. 큐(Queue)는 가장 먼저 넣은 원소를 먼저 꺼내는 FIFO(First In First Out) 구조다. 덱(Deque, Double-ended Queue)은 앞과 뒤 양쪽에서 삽입·삭제할 수 있다.

세 이름은 데이터 저장 구현보다 허용하는 연산과 순서라는 추상 자료형(ADT)의 의미다. Stack을 동적 배열이나 연결 리스트로 만들 수 있고 Queue를 원형 배열이나 연결 리스트로 만들 수 있다. 인터페이스가 불필요한 임의 접근을 감춰 알고리즘 의도를 분명히 한다.

## 2. 왜 필요한가
호출·되돌리기, 도착 순서 처리, 양방향 Window처럼 접근 순서를 제한해 문제를 단순화한다. 자료구조 선택은 Big-O뿐 아니라 데이터 크기, 접근 패턴, 메모리 배치와 갱신 빈도에서 시작한다.

수식 괄호 검사와 DFS(Depth-First Search)는 가장 최근의 미완료 작업으로 돌아가므로 Stack이 자연스럽다. 네트워크 패킷과 작업 요청은 일반적으로 도착한 순서대로 처리하므로 Queue가 의미를 표현한다. Sliding Window에서 앞의 오래된 값은 제거하고 뒤에 새 값을 넣으려면 Deque가 적합하다.

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

BFS(Breadth-First Search)는 시작점에서 거리별 Layer 순서로 방문하므로 Queue를 사용한다.

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

아래 코드는 게임 서버에서 I/O(Input/Output) Thread가 수신한 패킷을 Bounded Queue에 담고, Game Thread가 틱마다 꺼내 처리하는 패턴이다. Queue가 가득 차면 중요도에 따라 거부하거나 오래된 패킷을 덮어쓴다.

```java
// 게임 서버 패킷 수신 Queue (Bounded, Single-Producer Single-Consumer 가정)
class PacketQueue {
    private final ArrayDeque<Packet> queue;
    private final int maxSize;

    PacketQueue(int maxSize) {
        this.maxSize = maxSize;
        this.queue = new ArrayDeque<>(maxSize);
    }

    // I/O Thread 호출: 패킷 수신 → Enqueue
    // 가득 차면 false 반환 → 호출자가 Drop 또는 Client에게 Backpressure 전달
    boolean offer(Packet p) {
        if (queue.size() >= maxSize) {
            return false; // Bounded: 초과 시 거부
        }
        queue.addLast(p);
        return true;
    }

    // Game Thread 호출: 틱마다 최대 처리 한도만큼 Dequeue
    Packet poll() {
        return queue.pollFirst(); // 비어 있으면 null
    }

    int size() { return queue.size(); }
}

// 사용 예시
PacketQueue pq = new PacketQueue(1024);

// I/O Thread: 수신 루프
boolean accepted = pq.offer(receivedPacket);
if (!accepted) {
    metrics.increment("packet.dropped"); // 모니터링 필수
}

// Game Thread: 틱 처리 루프 (한 틱에 최대 256개)
int processed = 0;
Packet p;
while (processed < 256 && (p = pq.poll()) != null) {
    gameRoom.dispatch(p);
    processed++;
}
```

위 패턴에서 `ArrayDeque`는 내부적으로 Circular Buffer로 동작해 양끝 삽입·삭제가 분할 상환 O(1)이다. `maxSize`로 메모리 상한을 고정하므로 Producer 폭주가 OOM으로 이어지지 않는다. 멀티스레드 환경이라면 `LinkedBlockingDeque` 또는 별도 Lock으로 Head·Tail 접근을 보호해야 한다.

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

### Stack

**장점**
- LIFO 인터페이스가 재귀·Undo·DFS 의도를 코드 수준에서 명확히 표현한다.
- 배열 Top 조작만으로 Push·Pop이 분할 상환 O(1)이며 Cache 지역성이 높다.
- 임의 접근을 막아 중간 원소 실수 접근을 컴파일 수준에서 차단한다.

**단점**
- 고정 배열 Stack은 Capacity 초과 시 Stack Overflow가 발생하며 사전 크기 예측이 필요하다.
- 동적 배열 Stack은 재할당 시 단일 Push가 O(N)이 되어 실시간 시스템 p99에 영향을 줄 수 있다.
- LIFO 접근만 허용하므로 오래된 원소를 먼저 꺼내거나 임의 위치를 조회할 수 없다.

### Queue

**장점**
- FIFO 순서로 도착 순서를 자연스럽게 보존해 패킷 처리·작업 분배에 의도가 드러난다.
- Circular Buffer 구현은 재할당 없이 양끝 연산이 O(1)이며 메모리 상한을 고정할 수 있다.
- Bounded Queue는 Producer 폭주를 명시적 거부·Drop 정책으로 제어해 OOM을 예방한다.

**단점**
- 무제한 Queue는 Consumer 지연을 메모리 소진과 대기 시간 폭증으로 드러내 장애를 늦게 탐지하게 만든다.
- FIFO는 작업 처리 시간이 다르면 완료 순서를 보장하지 않아 Worker Pool에서 순서 의존 작업에 추가 설계가 필요하다.
- 원형 배열에서 Empty·Full 구분을 위해 Size 변수나 한 칸 비우기 등 별도 장치가 필요하다.

### Deque

**장점**
- 양끝 삽입·삭제를 O(1)로 제공해 Sliding Window·양방향 BFS 등 패턴을 단일 구조로 처리한다.
- Stack과 Queue 인터페이스를 동시에 구현할 수 있어 양방향 작업 흐름에 유연하다.
- Java `ArrayDeque`처럼 내부 Circular Buffer로 구현된 경우 Cache 지역성과 Resize 분할 상환을 함께 얻는다.

**단점**
- C++ `std::deque`처럼 Block 단위 구현은 연속 메모리가 아니므로 참조·Iterator 무효화 규칙이 `vector`와 달라 실수가 생기기 쉽다.
- 양끝 접근이 모두 필요 없는 경우 Stack·Queue보다 인터페이스가 넓어 코드 의도가 불분명해진다.
- 동시 접근 시 Head·Tail 두 Index를 모두 보호해야 해 단순 Stack보다 동기화 설계가 복잡하다.

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

- **Stack은 재귀 호출 깊이와 메모리 사용량 관계가 없다고 본다** — Call Stack은 실제 OS 메모리 영역이며 재귀가 깊어질수록 Frame이 쌓여 Stack Overflow가 발생한다. 명시적 Stack으로 재귀를 대체하면 Heap을 사용하므로 깊이 제한을 직접 제어할 수 있다.
- **평균 O(1)을 최악 O(1)로 생각한다** — 동적 배열 기반 Stack·Queue는 Resize 시 O(N) 복사가 발생한다. 실시간 서버에서는 분할 상환 평균이 아닌 단일 연산 최악 지연을 고려해 고정 Ring Buffer 또는 사전 Reserve를 검토해야 한다.
- **Circular Buffer에서 Head == Tail이면 항상 빈 Queue다** — Full 상태도 Head == Tail이 될 수 있어 Size 변수나 Flag 없이는 Empty와 Full을 구분할 수 없다. 한 칸을 비워두거나 별도 카운터를 유지해야 한다.
- **Queue가 FIFO면 여러 Worker의 완료 순서도 FIFO라고 생각한다** — Queue는 작업 배분 순서만 보장한다. 각 Worker의 처리 시간이 다르면 나중에 Dequeue한 짧은 작업이 먼저 완료될 수 있다. 엄격한 순서가 필요하면 같은 Key를 단일 Worker로 Route해야 한다.
- **무제한 Queue가 Traffic Burst를 안전하게 해결한다고 본다** — 무제한 Queue는 Burst를 흡수하는 것이 아니라 메모리 고갈과 대기 시간 폭증으로 변환할 뿐이다. Bounded Queue와 명시적 Drop·Backpressure 정책이 장애를 일찍 드러낸다.
- **Deque는 항상 하나의 연속 Memory라고 생각한다** — C++ `std::deque`는 Block 단위 분산 배열로 구현되어 연속 메모리가 아니다. 참조·Iterator 무효화 규칙이 `vector`와 다르며 잘못 가정하면 Dangling Reference가 발생한다.
- **Thread-safe Queue면 Message 중복과 업무 순서도 자동 해결된다고 본다** — Thread-safe는 동시 Enqueue·Dequeue의 Data Race를 막을 뿐이다. Network 재전송·Producer 재시도로 생기는 중복 명령과 업무 순서는 Command ID·Sequence와 멱등성 설계로 별도 처리해야 한다.
- **컨테이너가 모든 참조를 영구히 유지한다고 본다** — 동적 배열 기반 Queue는 Resize 시 내부 버퍼가 교체되어 기존 포인터·참조가 무효화된다. Pop 이후 반환된 포인터를 캐시해 두면 Dangling Reference가 된다.

## 9. 면접 질문

### Q1. 게임 서버에서 패킷 수신 Queue가 쌓이면서 지연이 발생할 때, Bounded Queue와 무제한 Queue 중 어떤 선택이 더 안전한가? 각각의 장애 패턴을 설명하라.

Bounded Queue는 가득 차면 즉시 거부·Drop·Backpressure로 과부하를 명시적으로 드러낸다. 알림이 빠르고 메모리 상한이 고정된다. 무제한 Queue는 Consumer가 따라잡지 못하면 메모리를 계속 소비하다 OOM이 발생하거나 대기 시간이 수 분 단위로 폭증한다. 장애가 늦게 나타나고 Timeout 재시도가 Queue를 더 키운다. 게임 서버에서는 패킷 종류별로 결제·채팅은 Bounded 거부, 위치 갱신은 최신 값으로 Coalescing하는 방식을 분리한다.

### Q2. 실시간 게임 서버에서 패킷 처리 Queue를 동적 배열 기반으로 구현할 때 Resize가 발생하면 어떤 문제가 생기는가? 이를 방지하기 위해 어떤 설계를 선택하겠는가?

동적 배열 Queue는 Capacity가 꽉 찼을 때 내부 버퍼를 2배로 늘리며 O(N) 복사가 발생한다. 틱이 33ms인 30Hz 서버에서 이 복사가 발생하면 단일 틱 처리 시간이 p99 기준 수 ms 튀어 Frame Stutter가 생길 수 있다. 이를 방지하려면 서버 시작 시 최대 예상 패킷 수(예: 1024~4096)를 사전 Reserve해 Resize 자체를 없애거나, 고정 크기 Ring Buffer를 사용해 재할당을 원천 차단한다. 후자가 실시간 서버에 더 안전한 이유는 최악 지연이 항상 O(1)로 고정되기 때문이다. 단, 용량 산정이 부족하면 Drop 정책이 즉시 발동되므로 p99 Queue Depth 모니터링으로 적정 크기를 사후 검증해야 한다.

### Q3. 게임 서버에서 AI 틱·패킷 수신·로그 비동기 처리에 Stack·Queue·Deque를 각각 어떻게 구분해 사용하는가?

AI 틱은 Tick Double Buffer 패턴으로 처리 Queue와 수신 Queue를 Swap해 Tick 경계를 분리한다. 패킷 수신은 FIFO Bounded Queue로 I/O Thread와 Game Thread 사이 속도 차이를 흡수하고 Full 시 Drop 정책을 적용한다. 로그 비동기 처리는 무제한 Queue를 쓰되 Log Thread가 지속 소비하고 프로세스 종료 시 Drain한다. Deque는 Sliding Window 최댓값처럼 앞에서 오래된 값을 제거하고 뒤에 새 값을 추가하는 패턴에 사용한다.

### Q4. Circular Buffer에서 Head == Tail이 Empty와 Full 두 가지를 의미할 수 있는데, 실제 코드에서 어떻게 구분하는가?

세 가지 방법이 있다. 첫째, Size 변수를 별도로 유지한다. Enqueue 시 증가, Dequeue 시 감소해 Size == 0이 Empty, Size == Capacity가 Full이다. 둘째, 한 칸을 항상 비워둔다. `next(rear) == front`를 Full로 보면 실제 저장 가능 수가 Capacity - 1이 된다. 셋째, Index에 세대 비트를 추가해 Head와 Tail의 세대가 같으면 Empty, 다르면 Full로 구분한다. 실무에서는 Size 방식이 가장 명확하다.

### Q5. 게임 서버의 Bounded Queue에서 maxSize를 얼마로 설정할지 판단 기준을 설명하라. 가득 찼을 때 Drop·Block·Resize 중 어느 정책이 게임 서버에 적합한가?

maxSize는 Consumer 처리량과 허용 최대 대기 시간을 기준으로 정한다. 예컨대 Game Thread가 틱당 256개를 처리하고 최대 4틱(133ms) 대기를 허용한다면 256 x 4 = 1024가 초기 기준이다. 실제로는 p99 Queue Depth 측정값에 여유를 더해 조정한다. 정책 선택은 패킷 유형별로 달라진다. Block은 I/O Thread를 멈춰 Thread 고갈을 일으키므로 실시간 서버에 부적합하다. Resize는 재할당 O(N) 복사로 틱 지연이 튀어 역시 부적합하다. Drop이 기본 선택이며, 위치 갱신처럼 최신 상태만 필요한 패킷은 오래된 것을 덮어쓰는 Coalescing을 쓰고, 구매·채팅처럼 유실되면 안 되는 패킷은 명시 거부 후 Client가 Retry하거나 Durable 경로(DB Write)로 우회한다.

### Q6. 멀티스레드 Worker Pool에서 같은 클라이언트의 패킷 처리 순서를 FIFO로 보장해야 하는데, 단일 공유 Queue만으로는 왜 부족한가? 어떻게 해결하는가?

단일 공유 Queue에서 여러 Worker가 패킷을 경쟁적으로 가져가면 Player A의 패킷 1번을 Worker 1이, 패킷 2번을 Worker 2가 동시에 처리할 수 있다. 처리 시간이 다르면 2번이 1번보다 먼저 완료되어 상태가 꼬인다. 해결 방법은 Player ID(또는 Room ID)를 Key로 해시해 고정 Worker에 Route하는 Partition 방식이다. `workerIndex = playerId % workerCount`로 같은 플레이어 패킷은 항상 같은 Worker Queue로 들어가 FIFO가 유지된다. Worker별 Queue는 독립되어 Lock 경합도 줄어든다. 단, 특정 Worker가 과부하될 수 있으므로 Worker별 Queue Depth를 모니터링하고 Hot Player 분산 정책을 별도로 설계해야 한다.

## 10. 예상 꼬리질문
- Queue Depth p99가 갑자기 튀었을 때, Producer 속도 문제인지 Consumer 처리 속도 문제인지 어떤 지표로 구분하는가?
- Tick Double Buffer에서 Swap 시점에 Lock을 걸지 않으면 어떤 Race Condition이 생기는가? Lock 없이 안전하게 처리할 수 있는 방법은 무엇인가?
- 게임 서버 AI FSM이 재귀 깊이 200을 초과할 수 있는 구조로 짜여 있다면 어떻게 Stack Overflow를 방지하겠는가?
- Single-Producer Single-Consumer Ring Buffer에서 Head·Tail을 서로 다른 Cache Line에 배치하는 이유는 무엇인가?
- Bounded Queue가 Full 상태일 때 오래된 패킷을 버리는 방식(Drop Oldest)과 새 패킷을 버리는 방식(Drop Newest) 중 게임 서버 위치 갱신에 어느 쪽이 더 적합한가?
- Worker Pool에서 특정 Worker의 Queue만 지속 가득 찰 때(Hot Partition) 어떻게 진단하고 완화하는가?
- 무제한 Queue에서 Consumer 처리량이 Producer보다 느릴 때 Queue가 계속 쌓이면 Timeout 재시도가 왜 상황을 더 악화시키는가?
- Stack 기반 Undo/Redo에서 외부 결제처럼 역연산이 불가능한 명령이 포함된 경우 어떻게 처리하는가?

## 11. 30초 모범답변
> Stack은 LIFO로 DFS·Undo·AI FSM 호출 스택에, Queue는 FIFO로 패킷 수신·작업 분배에, Deque는 Sliding Window 최댓값처럼 양방향 접근이 필요한 곳에 씁니다. 선택 기준은 꺼내는 순서입니다. 게임 서버에서는 패킷 Queue를 반드시 Bounded로 설계하고 maxSize를 틱당 처리량 × 허용 대기 틱 수로 산정합니다. Queue가 가득 찰 때 위치 갱신은 Drop Oldest로 Coalescing하고, 구매·채팅은 명시 거부 후 Client Retry로 처리합니다.

## 12. 1~2분 확장답변
> Stack·Queue·Deque 선택은 처리 순서 제약에서 시작합니다. Stack은 LIFO이므로 재귀 대체 DFS, AI FSM 상태 전환, 운영 툴 Undo/Redo에 자연스럽습니다. 재귀 기반 AI가 깊이 200을 넘을 가능성이 있으면 명시적 Stack으로 교체해 최대 깊이를 코드로 제한합니다.
>
> 패킷 수신 Queue는 Bounded FIFO Ring Buffer로 설계합니다. 동적 배열이면 Resize 시 O(N) 복사로 틱 지연이 p99 기준 수 ms 튀기 때문입니다. maxSize는 Game Thread 처리량(예: 256개/틱) × 허용 대기 틱 수(예: 4틱 = 133ms)로 1024를 초기값으로 잡고, p99 Queue Depth 측정으로 사후 조정합니다.
>
> 멀티스레드 Worker에서 같은 Player의 패킷 순서를 지키려면 단일 공유 Queue로 부족합니다. `playerId % workerCount`로 Route해 Player별 패킷이 항상 같은 Worker에 들어가게 해야 합니다. Hot Partition이 생기면 Worker별 Queue Depth를 메트릭으로 추적해 Worker 수 조정이나 Rebalancing을 적용합니다.
>
> Tick Double Buffer는 AI 틱 처리와 외부 패킷 수신이 같은 Queue에 동시 접근하는 문제를 해결합니다. 틱 시작 시 incoming Queue와 processing Queue를 Swap하고, Tick N은 processing만 소비하며, 새 요청은 incoming에 쌓여 Tick N+1에서 처리합니다. Swap 시점에 Atomic Pointer Swap 또는 Lock을 사용해 Race Condition을 막아야 합니다.
>
> 장애 진단은 Queue Depth와 Oldest Item Age를 함께 봅니다. Depth가 일정해도 Age가 높으면 처리 시간이 긴 작업이 앞을 막는 Head-of-Line Blocking입니다. p99 Dequeue Rate 대비 Enqueue Rate 차이로 Producer·Consumer 중 병목을 구분하고, Drop 수 메트릭이 급증하면 Consumer 처리량 부족 또는 maxSize 산정 오류를 먼저 확인합니다.

## 13. 핵심 요약
- Stack은 LIFO, Queue는 FIFO, Deque는 양쪽 끝 삽입·삭제를 제공하는 선형 자료구조다.
- 접근 패턴이 선택 기준이다.
- 평균과 최악 복잡도를 구분한다.
- 메모리 배치와 할당 비용을 고려한다.
- 동시성은 별도 설계가 필요하다.
- Stack·Queue·Deque는 저장 방식보다 꺼내는 순서를 제한하는 인터페이스가 핵심이다.
- 서버 Queue에는 Capacity, 역압력, 업무별 Drop·Retry와 순서 정책이 필요하다.
- 게임 서버에서 패킷·AI 틱·로그는 각각 Bounded FIFO Queue, Tick Double Buffer, 비동기 Drain Queue로 분리 설계해 구조 혼용에 따른 순서·메모리 문제를 방지한다.

## 한 줄 정리
> Stack은 최근 원소부터, Queue는 먼저 온 원소부터, Deque는 양쪽 끝을 O(1)에 처리합니다. 구현보다 요구하는 처리 순서가 선택 기준입니다.
