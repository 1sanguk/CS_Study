---
difficulty: 3
reading_time: 25분
interview_frequency: 5
importance: 5
---

# 08. Thread Model과 Work Queue

> 게임 서버·백엔드 개발자를 위한 CS 면접 교재

## 학습 목표
- 핵심 정의와 등장 이유를 설명할 수 있다.
- 데이터·상태 흐름과 Trade-off를 설명할 수 있다.
- 게임 서버 운영과 장애 대응에 적용할 수 있다.

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
I/O Thread가 같은 Room의 이동 Packet을 roomId로 Partition하면 한 Logic Worker가 순서대로 처리한다. Pathfinding 작업이 밀리면 Queue 상한에서 신규 작업을 거절해 Tick 지연 전파를 막는다.

## 5. 비슷한 개념과 비교
전역 Worker Pool은 부하 분산이 쉽고 Room Owner 모델은 공유 상태 Lock을 줄인다. Hot Room과 Queue 이동 비용을 측정해 소유 단위를 정한다.
## 6. 장점과 단점
Thread Model과 Work Queue을 올바르게 적용하면 상태와 처리 책임이 명확해지고 Peak 부하와 장애에 대한 예측 가능성이 높아진다. 반면 I/O Thread, Logic Worker와 Room Owner 정책을 잘못 정하면 지연, 상태 불일치 또는 운영 복잡도가 늘어난다. 실제 요구와 측정 결과를 기준으로 필요한 범위만 적용한다.
## 7. 게임 서버·백엔드 실무 예시
Session Packet을 playerId나 roomId로 Partition해 같은 Room 명령 순서를 유지한다. Queue 상한, 작업 시간 예산과 Overload 거부 정책을 둔다.

Thread Model과 Work Queue 관점에서는 운영에서는 연결 수, Packet Rate, Queue 길이, Tick p99, Drop·Retry, Memory와 Thread 고갈을 같은 시간축에서 본다.

## 8. 자주 하는 오해
- **I/O Thread**을 도입하면 관련 문제가 자동으로 모두 해결된다고 생각한다.
- **Logic Worker**을 도입하면 관련 문제가 자동으로 모두 해결된다고 생각한다.
- **Room Owner**을 도입하면 관련 문제가 자동으로 모두 해결된다고 생각한다.
- **Queue Partition**을 도입하면 관련 문제가 자동으로 모두 해결된다고 생각한다.
- **작업 Sequence**을 도입하면 관련 문제가 자동으로 모두 해결된다고 생각한다.
## 9. 면접 질문
### Q1. 핵심 개념을 설명해 주세요.
스레드 모델은 I/O와 게임 Logic을 어떤 Thread가 소유할지 정하고 Work Queue는 생산자와 소비자 사이 작업을 전달한다.
### Q2. 왜 필요한가요?
동시 실행으로 처리량을 높이면서 공유 상태 경쟁과 느린 작업의 전파를 제어한다.
### Q3. 실무에서는 어떻게 적용하나요?
Session Packet을 playerId나 roomId로 Partition해 같은 Room 명령 순서를 유지한다. Queue 상한, 작업 시간 예산과 Overload 거부 정책을 둔다.
### Q4. 장애 시 무엇을 확인하나요?
Thread Model과 Work Queue 관점에서는 상태 소유자, Queue와 Buffer, Sequence, Timeout, Drop·Retry와 p99를 확인한다.

## 10. 예상 꼬리질문
- I/O Thread의 최종 소유자는 어디에 두나요?
- Logic Worker 처리에서 중복과 역순은 어떻게 구분하나요?
- Room Owner의 상한을 넘으면 어떤 요청부터 제한하나요?
- Queue Partition 장애를 어떻게 재현하고 복구를 검증하나요?
- 작업 Sequence 관련 p99가 증가하면 어떤 지표를 함께 보나요?
## 11. 30초 모범답변
> 스레드 모델은 상태 소유와 실행 위치를 정하고 Work Queue는 경계를 연결합니다. Queue를 제한하고 같은 게임 상태의 순서를 보장해야 합니다. Session Packet을 playerId나 roomId로 Partition해 같은 Room 명령 순서를 유지한다.

## 12. 1~2분 확장답변
> 스레드 모델은 상태 소유와 실행 위치를 정하고 Work Queue는 경계를 연결합니다. Queue를 제한하고 같은 게임 상태의 순서를 보장해야 합니다. 설계에서는 상태 소유권, 입력 검증과 Message 순서를 먼저 정합니다. Network I/O와 Logic 실행을 분리하되 Queue에 상한과 Backpressure를 둡니다. 게임 서버에서는 평균 처리량보다 Tick과 Packet 지연의 p99, 재접속과 배포 시나리오까지 검증해야 합니다.

## 13. 핵심 요약
- 스레드 모델은 I/O와 게임 Logic을 어떤 Thread가 소유할지 정하고 Work Queue는 생산자와 소비자 사이 작업을 전달한다.
- 상태 소유권과 입력 검증이 핵심이다.
- 순서·Timeout·재처리를 정의한다.
- Queue와 Buffer에는 상한이 필요하다.
- 운영에서는 p99와 Overload를 관찰한다.

## 한 줄 정리
> 스레드 모델은 상태 소유와 실행 위치를 정하고 Work Queue는 경계를 연결합니다. Queue를 제한하고 같은 게임 상태의 순서를 보장해야 합니다.
