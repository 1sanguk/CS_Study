---
difficulty: 3
reading_time: 25분
interview_frequency: 5
importance: 5
---

# 08. Thread Model과 Work Queue

> 게임 서버·백엔드 개발자를 위한 CS 면접 교재

## 학습 목표

- I/O Thread와 Logic Worker를 분리해야 하는 이유와 역할 경계를 설명할 수 있다.
- Room Owner 모델로 공유 상태 Lock을 없애는 원리를 설명할 수 있다.
- Bounded Work Queue의 필요성과 가득 찼을 때의 Backpressure 정책을 설명할 수 있다.
- roomId Partition으로 Packet 순서를 보장하는 방법과 오래된 작업을 폐기하는 방법을 설명할 수 있다.

## 1. 개요
스레드 모델은 I/O와 게임 Logic을 어떤 Thread가 소유할지 정하고 Work Queue는 생산자와 소비자 사이 작업을 전달한다.

## 2. 왜 필요한가
동시 실행으로 처리량을 높이면서 공유 상태 경쟁과 느린 작업의 전파를 제어한다. 게임 서버는 정확성뿐 아니라 제한 시간 안의 처리와 장애 후 복구를 함께 제공해야 한다.

## 3. 핵심 동작 원리
```text
I/O threads→bounded queue→room/worker threads→result queue→I/O send
```
Thread-per-connection은 단순하지만 대규모 연결에서 Stack과 Context Switch 비용이 크다. Thread Pool은 재사용하지만 Blocking 작업이 쌓이면 고갈된다. Room Actor는 상태를 한 Thread 흐름에 직렬화한다.

상태의 최종 소유자, Message 순서, Timeout과 실패 후 재처리 기준을 명시한다.
### 역할 분리

게임 서버에는 Network I/O, Game Logic, DB, Timer와 Log 작업이 있다. 같은 Thread에서 모두 처리하면 DB 지연 하나가 Tick까지 멈춘다. 역할 분리는 지연을 격리하지만 Queue 이동과 동기화 비용을 만든다.

```text
Socket → I/O Thread → bounded Work Queue → Logic Worker
                                         ↓
Socket ← I/O Thread ← bounded Send Queue ─┘
```

연결마다 Thread를 두면 순차 코드로 쓰기 쉽지만 대규모 연결에서 Stack과 Context Switch 부담이 크다. Event Loop는 적은 Thread를 사용하지만 Buffer Lifetime과 Partial I/O 처리가 복잡하다. `async/await`가 순차 코드처럼 보여도 연결마다 Thread를 만든다는 뜻은 아니다.

### 상태 소유권

여러 Worker가 같은 Room을 수정하면 Lock과 순서 문제가 생긴다. Room이나 Player를 특정 Worker에 고정하면 상태 변경을 한 실행 흐름으로 직렬화할 수 있다.

```text
hash(roomId) % workerCount → owner worker
```

다른 Room과의 상호작용은 Message로 전달한다. 특정 Hot Room은 Owner 하나를 병목으로 만들 수 있다. Owner 이동에는 진행 중 Message, Timer와 상태를 함께 옮기는 절차가 필요하다.

### Queue 순서와 오래된 작업

전역 Queue는 Load Balance가 쉽지만 같은 Session Packet을 여러 Worker가 동시에 처리할 수 있다. Key 기반 Partition으로 같은 Room을 같은 Worker에 보낸다. Item에는 Session 참조뿐 아니라 Session Generation, Player ID와 Packet Sequence를 넣는다. Queue 대기 중 Disconnect와 Slot 재사용이 일어나도 오래된 작업이 새 Session에 적용되면 안 된다.

Priority Queue에서는 높은 우선순위만 계속 처리해 일반 작업이 굶지 않도록 처리 비율이나 Aging을 둔다.

### Bounded Queue

무제한 Queue는 부하를 숨기다가 Memory를 소진하고 오래된 요청을 뒤늦게 실행한다. Item 또는 Byte 상한을 정하고 가득 차면 신규 로그인 거부, 비핵심 상태 Drop, Producer 제한 가운데 의미에 맞는 정책을 쓴다. 도착률이 처리량보다 오래 높으면 Worker 수 조정만으로 안정화되지 않는다. DB Lock, 공유 Cache Line과 Allocation 병목을 Profile한다.

### Pool 크기와 종료

CPU-bound Logic Worker는 Core 수 근처에서 시작해 측정한다. 너무 많은 Thread는 Context Switch와 Cache 경쟁을 늘린다. Blocking DB 작업은 별도 Pool로 격리하되 DB Connection 수보다 지나치게 많은 Worker를 두면 대기만 늘 수 있다.

Graceful Shutdown은 새 작업 수락을 막고 필수 Queue를 Drain한 뒤 Worker를 종료한다. 저장 작업과 버려도 되는 Telemetry를 구분한다. Worker 예외를 최상위에서 기록하고 재처리의 중복 안전성을 정한다. 운영에서는 Queue 대기 시간, 처리 p99, Worker 이용률, Reject와 Drop 수를 함께 본다.

### 실무 설계 검토 체크리스트

- **I/O Thread**: I/O Thread의 입력이 어디서 생성되고 어느 실행 흐름이 상태를 소유하는지 먼저 정한다. 다른 구성 요소는 상태를 직접 고치지 않고 명시된 경계를 통해 요청한다.
- **Logic Worker**: Logic Worker의 정상 처리 순서를 Diagram으로 확인한다. 중간 단계가 실패했을 때 이미 반영된 상태와 다시 수행해도 되는 작업을 구분한다.
- **Room Owner**: Room Owner에 적용할 최대 개수, Byte 또는 시간 한도를 정한다. 한도를 넘으면 대기, 거절, Drop 가운데 업무 의미에 맞는 정책을 사용한다.
- **Queue Partition**: Queue Partition 관련 Message에는 중복과 역순을 식별할 Sequence나 Version이 필요한지 판단한다. 오래된 작업이 새 Session 상태를 덮지 않게 한다.
- **작업 Sequence**: 작업 Sequence가 느려질 때 상위 Queue와 호출자까지 지연이 전파되는 경로를 확인한다. Timeout과 Backpressure가 연쇄 Retry를 만들지 않게 한다.
- **Queue 상한**: Queue 상한의 평균 처리량만으로 용량을 결정하지 않는다. Peak 부하에서 p95·p99 지연, Memory와 Queue 깊이가 허용 범위인지 측정한다.
- **Priority**: Priority를 Client가 주장할 수 있다면 Server가 다시 계산하거나 검증할 항목을 정한다. 허용 오차와 반복 위반 처리 기준도 기록한다.
- **Starvation**: Starvation 변경은 이전 Client나 Server와 동시에 존재할 수 있다. Version 협상, 기본값과 단계적 배포로 전후 호환성을 확인한다.
- **Worker 수**: Worker 수 장애를 재현하는 Test를 만든다. Timeout, 연결 종료, 중복 Callback과 Process 재시작 뒤에도 자원과 상태가 한 번만 정리되는지 확인한다.
- **Blocking 격리**: Blocking 격리 관련 Log에는 Match·Session·Sequence 같은 추적 Key를 남긴다. 민감 정보는 제외하고 원인 판별에 필요한 지표와 함께 조회한다.
- **DB Pool**: DB Pool 최적화는 실제 Profile 결과를 근거로 적용한다. CPU를 줄이는 대신 Memory, 복사 감소 대신 Lifetime 복잡도가 늘 수 있음을 비교한다.
- **예외 경계**: 예외 경계의 Owner를 배포 중 교체할 때 새 요청 차단, 진행 작업 Drain과 상태 이전 순서를 정의한다. 구 Version Callback은 식별 후 폐기한다.
- **Graceful Shutdown**: Graceful Shutdown 결과가 영속 데이터나 외부 서비스에 반영되면 성공 응답의 기준을 정한다. 불확실한 결과는 조회와 Reconciliation으로 확정한다.
- **Hot Room**: Hot Room 기능을 독립 Service나 Thread로 분리할지는 확장과 장애 격리 이득으로 판단한다. Network·Queue 이동과 운영 비용도 함께 계산한다.
- **Queue 지표**: Queue 지표 정책은 정상 사용자 경험과 악용 방지를 함께 고려한다. 너무 넓은 허용 범위와 지나치게 엄격한 오탐 사이를 실제 분포로 조정한다.

이 항목은 Thread Model과 Work Queue 설계 Review에서 실제 요구와 실패 조건을 빠뜨리지 않기 위한 기준이다. 모든 장치를 일괄 적용하지 않고 측정된 위험과 운영 목표에 필요한 항목만 선택한다.
### 장애 시나리오 연습

Thread Model과 Work Queue은 정상 경로만 구현해서는 운영 준비가 끝나지 않는다. 다음 상황을 부하·Network Simulator와 장애 주입 Test로 재현한다.

- **I/O Thread**: I/O Thread 요청이 정상 처리됐지만 응답만 손실된 상황을 가정한다. 호출자가 재시도해도 같은 상태 변경이 두 번 발생하지 않도록 Sequence, Version 또는 Idempotency Key를 둔다.
- **Logic Worker**: Logic Worker 처리 시간이 평소의 열 배로 증가한 상황을 재현한다. 제한 Queue, Timeout과 Admission Control이 다른 Session과 Tick까지 지연을 퍼뜨리지 않는지 확인한다.
- **Room Owner**: Room Owner Owner가 배포나 장애로 사라진 상황을 Test한다. 새 Owner 선택, 진행 중 작업 처리와 구 Callback 폐기 순서가 명확해야 한다.
- **Queue Partition**: Queue Partition 입력이 최대 크기, 빈 값, 오래된 Timestamp와 잘못된 Enum을 포함하는 경우를 검증한다. 실패한 입력이 부분 상태를 남기거나 Process를 종료시키면 안 된다.
- **작업 Sequence**: 작업 Sequence 관련 Message가 중복·역순·지연 도착하는 Network 조건을 주입한다. 최종 상태가 순서 정책과 허용 Window에 맞는지 Replay로 비교한다.
- **Queue 상한**: Queue 상한 Capacity가 모두 사용된 Peak 상황에서 대기 시간을 무제한 늘리지 않는다. 업무 중요도에 따른 거절·Drop과 Client 재시도 안내가 함께 동작해야 한다.
- **Priority**: Priority 복구 뒤 상태가 맞는지 원본 Event, Snapshot 또는 DB와 대조한다. 자동 복구가 불가능한 차이는 경고와 수동 Reconciliation 대상으로 남긴다.

Thread Model과 Work Queue에서는 각 Test는 성공 여부만 기록하지 않는다. 처리 시간 분포, Queue 최대치, Drop·Retry 수와 복구 소요 시간을 남겨 다음 배포의 기준값으로 사용한다.

## 4. 쉬운 예시

아래는 roomId Partition 기반 Work Queue와 오래된 작업 폐기 패턴이다.

```cpp
struct WorkItem {
    uint32_t roomId;
    uint64_t sessionGeneration;  // 오래된 콜백 폐기용
    uint32_t packetSequence;
    std::function<void()> handler;
};

// roomId로 Worker를 고정 — 같은 Room은 항상 같은 Worker가 처리
class PartitionedWorkQueue {
    static constexpr int WORKER_COUNT = 4;
    BoundedQueue<WorkItem> queues_[WORKER_COUNT];  // 상한: 각 1000개

public:
    bool Enqueue(WorkItem item) {
        int idx = item.roomId % WORKER_COUNT;
        if (!queues_[idx].TryPush(item)) {
            // Queue 가득 참 → 해당 Room 신규 작업 거부
            metrics_.DropCount.fetch_add(1);
            return false;
        }
        return true;
    }

    void WorkerLoop(int workerIdx) {
        while (running_) {
            WorkItem item;
            if (!queues_[workerIdx].TryPop(item)) { YieldOrSleep(); continue; }

            // Session이 이미 끊겼거나 Generation이 달라진 경우 폐기
            auto session = SessionManager::Find(item.roomId);
            if (!session || session->generation != item.sessionGeneration) continue;

            item.handler();  // 같은 roomId는 이 Worker에서만 실행 → Lock 불필요
        }
    }
};
```

- `roomId % WORKER_COUNT`로 파티션하면 같은 Room의 Packet이 항상 같은 Worker에서 순서대로 실행된다.
- `sessionGeneration` 비교로 Disconnect 후 재접속된 새 Session에 오래된 작업이 적용되는 것을 막는다.
- Queue 가득 찼을 때 Drop하고 메트릭에 기록하면 운영에서 병목 Room을 식별할 수 있다.

## 5. 비슷한 개념과 비교

| 모델 | 특징 | Lock 필요 | 확장성 | 순서 보장 |
|------|------|----------|--------|---------|
| **Thread-per-connection** | 연결마다 Thread | 공유 상태는 필요 | 수백 연결 | 자연스럽게 보장 |
| **Global Thread Pool** | 전역 Queue + N Worker | Room 상태에 Lock 필요 | 높음 | 보장 안 됨 |
| **Partitioned Queue** | roomId로 Worker 고정 | Room 내 Lock 불필요 | 높음 | Room 단위 보장 |
| **Actor Model** | 객체마다 Mailbox | Actor 내 Lock 불필요 | 높음 | Actor 단위 보장 |
| **Single Thread Event Loop** | 모든 Logic 직렬화 | 불필요 | 낮음 (CPU 병목) | 완전 보장 |

## 6. 장점과 단점

**장점**
- I/O Thread와 Logic Worker를 분리해 DB 지연이 Tick에 전파되지 않는다.
- roomId Partition으로 Room 내 공유 상태에 Lock 없이 순서를 보장한다.
- Bounded Queue로 부하 초과 시 빠른 거부를 통해 메모리 소진을 막는다.
- Worker 수를 Core 수 근처로 제한해 Context Switch와 Cache 경쟁을 최소화한다.

**단점**
- 여러 Queue 경계를 넘는 작업은 디버깅과 지연 추적이 복잡하다.
- 특정 Room에 부하가 몰리는 Hot Room 문제가 생기면 Partition을 재설계해야 한다.
- Graceful Shutdown 시 Queue를 모두 Drain하는 절차가 필요하다.
- Room 간 상호작용(이벤트·전투)은 Message 전달 방식이므로 지연이 추가된다.

## 7. 게임 서버·백엔드 실무 예시

I/O Thread가 Packet을 Framing해 `roomId % WORKER_COUNT`로 분류하고 Partitioned Queue에 넣는다. Logic Worker는 Queue를 드레인하며 Tick마다 Room 상태를 업데이트한다. DB 조회는 별도 DB Thread Pool로 오프로드하고 완료 후 결과를 Logic Queue로 다시 보낸다.

Queue 상한, Worker별 처리 p99, Drop 수, Queue 대기 시간을 지표로 수집한다. 특정 Worker의 Queue가 지속적으로 차면 해당 Room을 별도 Worker로 분리(Hot Room 격리)한다.

## 8. 자주 하는 오해

- **I/O Thread에서 게임 로직을 직접 처리해도 된다.** I/O Thread가 DB 조회나 경로 탐색으로 블로킹되면 같은 Thread가 담당하는 수천 연결의 I/O가 모두 지연된다.
- **Logic Worker 수를 Core 수보다 많이 늘리면 성능이 좋아진다.** CPU-bound Worker는 Core 수를 넘으면 Context Switch 비용이 증가하고 L1/L2 Cache가 경쟁한다. Blocking DB Worker는 별도 Pool로 격리해야 한다.
- **Room Owner Thread 하나가 전담하면 동기화가 완전히 필요 없다.** DB·Matchmaking 같은 외부 시스템의 비동기 콜백이 다른 Thread에서 오면 여전히 동기화가 필요하다.
- **전역 단일 Queue로 관리하면 구조가 단순하다.** Multi-producer + Multi-consumer 전역 Queue는 Lock Contention 병목이 생긴다. Room별 Partition이 확장성에 유리하다.
- **Queue에 넣은 순서대로 실행이 보장된다.** Priority Queue나 다중 Consumer 구조에서는 삽입 순서와 실행 순서가 다를 수 있다. Sequence 번호로 순서를 별도로 검증해야 한다.
- **무제한 Queue는 부하 증가를 흡수해 좋다.** 무제한 Queue는 부하를 숨기다가 메모리를 소진하고 오래된 요청을 뒤늦게 실행한다. 상한과 빠른 거부가 안전하다.
- **Graceful Shutdown 시 Queue를 즉시 비워도 된다.** 저장·결제·랭킹 업데이트 같은 중요 작업은 Drain이 필요하다. 반면 위치 Snapshot 같은 비핵심 작업은 버려도 된다.

## 9. 면접 질문

### Q1. I/O Thread와 Logic Worker를 왜 분리해야 하나요?
I/O Thread가 DB 조회나 경로 탐색 같은 무거운 Logic을 처리하면 같은 Thread가 담당하는 수천 연결의 I/O 이벤트가 모두 지연됩니다. I/O Thread는 Byte 이동과 Framing만 담당하고 완전한 Packet을 Bounded Work Queue에 넣어 Logic Worker로 오프로드합니다.

### Q2. Room Owner 모델이 Lock을 줄이는 원리를 설명해 주세요.
`hash(roomId) % workerCount`로 같은 Room의 모든 작업을 특정 Worker에 고정합니다. 그 Worker만 Room 상태를 수정하므로 Room 내부 처리에서 Lock이 필요 없습니다. Room 간 상호작용은 Message Queue로 전달합니다.

### Q3. Bounded Work Queue가 필요한 이유와 가득 찼을 때 어떻게 처리하나요?
무제한 Queue는 부하를 숨기다가 메모리를 소진하고 오래된 요청을 뒤늦게 실행합니다. Bounded Queue는 가득 차면 빠르게 거부해 생산자에게 신호를 줍니다. 메시지 종류에 따라 신규 로그인 거부, 비핵심 상태 Drop, Producer Rate Limit 중 적절한 정책을 선택합니다.

### Q4. Queue Partition으로 Packet 순서를 어떻게 보장하나요?
`roomId % workerCount`로 같은 Room의 Packet을 같은 Worker Queue에 넣으면 단일 Consumer가 삽입 순서대로 처리합니다. 작업 항목에 `sessionGeneration`과 `packetSequence`를 포함해 Queue 대기 중 Disconnect·재접속이 발생해도 오래된 작업을 폐기합니다.

### Q5. Logic Worker 수를 Core 수보다 많이 늘리면 왜 성능이 떨어지나요?
CPU-bound 작업에서 Thread 수가 Core 수를 초과하면 Context Switch 비용이 증가하고 L1/L2 Cache가 경쟁하며 처리량이 감소합니다. Blocking DB 작업이 있으면 DB Connection 수에 맞는 별도 Pool로 격리하되 Worker 수를 DB Connection 수보다 지나치게 많이 두면 대기만 늘어납니다.

### Q6. Graceful Shutdown 시 Work Queue를 어떻게 정리하나요?
새 작업 수락을 먼저 막고 저장·결제·랭킹 업데이트 같은 필수 Queue를 Drain합니다. 위치 Snapshot·로그 같은 비핵심 Queue는 버립니다. Worker가 종료 신호를 받으면 현재 작업을 완료하고 종료합니다. 종료 Timeout 내에 Drain이 완료되지 않으면 강제 종료하고 미처리 항목을 로깅합니다.

## 10. 예상 꼬리질문

- Hot Room이 생겼을 때 부하를 분산하는 방법은 무엇인가요?
- Priority Queue에서 낮은 우선순위 작업이 굶는(Starvation) 문제를 어떻게 해결하나요?
- Room 간 전투처럼 여러 Room이 관련된 작업을 어떻게 처리하나요?
- Queue 대기 시간이 갑자기 증가했을 때 병목을 어떻게 찾나요?
- Worker 예외가 발생했을 때 Room 상태를 어떻게 복구하나요?
- `async/await`와 Thread Pool 기반 Work Queue의 실질적인 차이는 무엇인가요?
- Tick-driven Logic과 Event-driven Work Queue를 어떻게 통합하나요?

## 11. 30초 모범답변

> 게임 서버의 I/O Thread와 Logic Worker를 분리해야 DB 지연이 Tick에 전파되지 않습니다. `roomId % workerCount`로 파티션하면 같은 Room의 작업이 한 Worker에서 순서대로 실행되어 Lock이 불필요합니다. Bounded Queue로 부하 초과 시 빠르게 거부해 메모리 소진을 막습니다.

## 12. 1~2분 확장답변

> I/O Thread가 DB 조회나 경로 탐색을 직접 처리하면 같은 Thread의 수천 연결이 모두 지연됩니다. I/O Thread는 Byte 이동·Framing만 담당하고 완전한 Packet을 Bounded Work Queue에 넣습니다.
>
> `roomId % workerCount` Partition으로 같은 Room 작업을 같은 Worker에 고정하면 Room 내 Lock이 불필요합니다. 작업 항목에 `sessionGeneration`을 담아 Disconnect 후 오래된 콜백을 폐기합니다.
>
> Bounded Queue는 가득 차면 빠르게 거부해 메모리 소진을 막습니다. CPU-bound Worker는 Core 수 근처로 제한하고 Blocking DB 작업은 별도 Pool로 격리합니다. Queue 대기 시간·Drop 수·Worker 이용률을 지표로 수집해 Hot Room과 병목을 감지합니다.

## 13. 핵심 요약

- I/O Thread는 Byte 이동·Framing만 담당하고 Logic Worker로 오프로드해야 DB 지연이 Tick에 전파되지 않는다.
- `roomId % workerCount` Partition으로 같은 Room 작업을 한 Worker에 고정하면 Room 내 Lock이 불필요하다.
- Bounded Queue는 부하 초과 시 빠르게 거부해 메모리 소진을 막는다.
- 작업 항목에 `sessionGeneration`·`packetSequence`를 포함해 오래된 콜백을 폐기한다.
- CPU-bound Worker는 Core 수 근처로, Blocking DB Worker는 별도 Pool로 관리한다.
- Hot Room이 생기면 해당 Room을 전용 Worker로 격리한다.
- Graceful Shutdown 시 필수 Queue를 Drain하고 비핵심 Queue는 버린다.
- Queue 대기 시간·Drop 수·Worker p99를 지표로 수집해 병목 Room과 Worker 고갈을 감지한다.

## 한 줄 정리

> I/O Thread와 Logic Worker를 분리하고, roomId Partition으로 같은 Room 작업을 한 Worker에 직렬화해 Lock을 없애며, Bounded Queue로 Backpressure를 가하고 sessionGeneration으로 오래된 콜백을 폐기한다.
