---
difficulty: 3
reading_time: 25분
interview_frequency: 5
importance: 5
---

# 07. Blocking과 Non-blocking I/O

> 게임 서버·백엔드 개발자를 위한 CS 면접 교재

## 학습 목표
- 핵심 정의와 등장 이유를 설명할 수 있다.
- 데이터·상태 흐름과 Trade-off를 설명할 수 있다.
- 게임 서버 운영과 장애 대응에 적용할 수 있다.

## 1. 개요
Blocking I/O는 작업 완료까지 호출 Thread가 기다리고 Non-blocking I/O는 즉시 가능한 결과나 미완료를 반환한다.

## 2. 왜 필요한가
많은 연결의 대기 시간에 Thread를 하나씩 점유하지 않고 제한된 Thread로 I/O를 처리한다. 게임 서버는 정확성뿐 아니라 제한 시간 안의 처리와 장애 후 복구를 함께 제공해야 한다.

## 3. 핵심 동작 원리
```text
socket readiness/completion→event loop→read/write until would-block→session buffer
```
Non-blocking은 곧 비동기 완료 모델과 완전히 같은 말이 아니다. Readiness 모델은 준비 후 호출하고 Completion 모델은 작업 완료 통지를 받는다. 부분 송수신과 Backpressure가 필요하다.

상태의 최종 소유자, Message 순서, Timeout과 실패 후 재처리 기준을 명시한다.
### Blocking과 Thread 비용

Blocking `recv`는 데이터가 없으면 호출 Thread를 기다리게 한다. 연결마다 Thread를 두면 흐름은 단순하지만 연결 수가 많을 때 Stack Memory, Scheduler와 Context Switch 비용이 커진다. Blocking 자체가 느리다는 뜻은 아니다. 연결이 적은 관리 Server에서는 단순성이 더 유리할 수 있다. 제한된 공유 Worker가 예측 불가능한 I/O를 기다릴 때 다른 요청까지 지연되는 것이 문제다.

### Non-blocking과 I/O Multiplexing

Non-blocking Socket은 지금 처리할 수 없으면 `EAGAIN` 또는 `WOULDBLOCK`을 반환한다. 계속 반복 호출하면 Busy Loop가 되므로 `epoll`, `kqueue` 같은 방식으로 준비된 Socket만 찾는다.

```text
Event Loop
  → ready event 대기
  → accept
  → would-block까지 read
  → packet framing
  → pending send flush
```

Level-triggered는 준비 상태가 남으면 다시 알리고 Edge-triggered는 상태 변화 중심으로 알린다. Edge-triggered에서는 보통 `EAGAIN`까지 처리해야 Event를 놓치지 않는다.

### Readiness와 Completion

Readiness는 “지금 시도하면 막히지 않는다”를, Completion은 “등록한 작업이 끝났다”를 알린다. Linux epoll은 대표적인 Readiness 방식이고 Windows IOCP는 Completion 방식이다. 둘 다 많은 연결을 적은 Thread로 다루지만 Buffer 소유권, 취소와 오류 계약이 다르다.

### 부분 송수신

Readable이라고 Packet 전체가 온 것은 아니다. Receive Buffer에 누적하고 Framing 규칙으로 완전한 Packet만 분리한다. `send`도 전체 Byte를 한 번에 보내지 않을 수 있다. 남은 Offset을 저장하고 다음 Writable Event에서 계속 보낸다.

```text
send queue: [A의 남은 부분][B]
writable → 가능한 만큼 전송 → offset 갱신
```

여러 Thread가 같은 Socket에 임의로 쓰지 않도록 Session별 단일 Send Queue나 Owner를 둔다.

### Event Loop와 Logic 분리

I/O Thread에서 DB Query, 압축, Pathfinding을 동기 실행하면 모든 Connection의 Event 처리가 늦어진다. I/O Thread는 Byte 이동과 최소 Parsing을 맡고 무거운 작업은 제한된 Logic Queue로 넘긴다. 반대로 아주 작은 작업까지 모두 넘기면 Queue와 Cache 비용이 커지므로 시간 예산을 측정한다.

### Backpressure와 종료

생산 속도가 전송 속도보다 빠르면 Send Queue가 증가한다. Session별 Byte 상한, 최신 상태 덮어쓰기, 중요도 기반 Drop, Rate Limit과 종료 정책이 필요하다. 위치 Snapshot은 오래된 것을 버릴 수 있지만 Inventory 변경은 임의로 버리면 안 된다.

EOF, Reset, Timeout과 Cancel을 구분한다. Close와 비동기 Callback 경합에 대비해 Session Lifetime과 한 번만 실행되는 종료 전이를 둔다. Queue Byte, Event Loop 지연, `EAGAIN`, Drop과 연결 종료 원인을 운영 지표로 본다.

### 실무 설계 검토 체크리스트

- **Blocking 범위**: Blocking 범위의 입력이 어디서 생성되고 어느 실행 흐름이 상태를 소유하는지 먼저 정한다. 다른 구성 요소는 상태를 직접 고치지 않고 명시된 경계를 통해 요청한다.
- **Event Loop**: Event Loop의 정상 처리 순서를 Diagram으로 확인한다. 중간 단계가 실패했을 때 이미 반영된 상태와 다시 수행해도 되는 작업을 구분한다.
- **Readiness**: Readiness에 적용할 최대 개수, Byte 또는 시간 한도를 정한다. 한도를 넘으면 대기, 거절, Drop 가운데 업무 의미에 맞는 정책을 사용한다.
- **Completion**: Completion 관련 Message에는 중복과 역순을 식별할 Sequence나 Version이 필요한지 판단한다. 오래된 작업이 새 Session 상태를 덮지 않게 한다.
- **Partial Read**: Partial Read가 느려질 때 상위 Queue와 호출자까지 지연이 전파되는 경로를 확인한다. Timeout과 Backpressure가 연쇄 Retry를 만들지 않게 한다.
- **Partial Write**: Partial Write의 평균 처리량만으로 용량을 결정하지 않는다. Peak 부하에서 p95·p99 지연, Memory와 Queue 깊이가 허용 범위인지 측정한다.
- **Would-block**: Would-block를 Client가 주장할 수 있다면 Server가 다시 계산하거나 검증할 항목을 정한다. 허용 오차와 반복 위반 처리 기준도 기록한다.
- **Edge Trigger**: Edge Trigger 변경은 이전 Client나 Server와 동시에 존재할 수 있다. Version 협상, 기본값과 단계적 배포로 전후 호환성을 확인한다.
- **Send Queue**: Send Queue 장애를 재현하는 Test를 만든다. Timeout, 연결 종료, 중복 Callback과 Process 재시작 뒤에도 자원과 상태가 한 번만 정리되는지 확인한다.
- **Receive Backpressure**: Receive Backpressure 관련 Log에는 Match·Session·Sequence 같은 추적 Key를 남긴다. 민감 정보는 제외하고 원인 판별에 필요한 지표와 함께 조회한다.
- **Socket 오류**: Socket 오류 최적화는 실제 Profile 결과를 근거로 적용한다. CPU를 줄이는 대신 Memory, 복사 감소 대신 Lifetime 복잡도가 늘 수 있음을 비교한다.
- **취소**: 취소의 Owner를 배포 중 교체할 때 새 요청 차단, 진행 작업 Drain과 상태 이전 순서를 정의한다. 구 Version Callback은 식별 후 폐기한다.
- **Buffer Lifetime**: Buffer Lifetime 결과가 영속 데이터나 외부 서비스에 반영되면 성공 응답의 기준을 정한다. 불확실한 결과는 조회와 Reconciliation으로 확정한다.
- **Thread 격리**: Thread 격리 기능을 독립 Service나 Thread로 분리할지는 확장과 장애 격리 이득으로 판단한다. Network·Queue 이동과 운영 비용도 함께 계산한다.
- **I/O 지표**: I/O 지표 정책은 정상 사용자 경험과 악용 방지를 함께 고려한다. 너무 넓은 허용 범위와 지나치게 엄격한 오탐 사이를 실제 분포로 조정한다.

이 항목은 Blocking과 Non-blocking I/O 설계 Review에서 실제 요구와 실패 조건을 빠뜨리지 않기 위한 기준이다. 모든 장치를 일괄 적용하지 않고 측정된 위험과 운영 목표에 필요한 항목만 선택한다.
### 장애 시나리오 연습

Blocking과 Non-blocking I/O은 정상 경로만 구현해서는 운영 준비가 끝나지 않는다. 다음 상황을 부하·Network Simulator와 장애 주입 Test로 재현한다.

- **Blocking 범위**: Blocking 범위 요청이 정상 처리됐지만 응답만 손실된 상황을 가정한다. 호출자가 재시도해도 같은 상태 변경이 두 번 발생하지 않도록 Sequence, Version 또는 Idempotency Key를 둔다.
- **Event Loop**: Event Loop 처리 시간이 평소의 열 배로 증가한 상황을 재현한다. 제한 Queue, Timeout과 Admission Control이 다른 Session과 Tick까지 지연을 퍼뜨리지 않는지 확인한다.
- **Readiness**: Readiness Owner가 배포나 장애로 사라진 상황을 Test한다. 새 Owner 선택, 진행 중 작업 처리와 구 Callback 폐기 순서가 명확해야 한다.
- **Completion**: Completion 입력이 최대 크기, 빈 값, 오래된 Timestamp와 잘못된 Enum을 포함하는 경우를 검증한다. 실패한 입력이 부분 상태를 남기거나 Process를 종료시키면 안 된다.
- **Partial Read**: Partial Read 관련 Message가 중복·역순·지연 도착하는 Network 조건을 주입한다. 최종 상태가 순서 정책과 허용 Window에 맞는지 Replay로 비교한다.
- **Partial Write**: Partial Write Capacity가 모두 사용된 Peak 상황에서 대기 시간을 무제한 늘리지 않는다. 업무 중요도에 따른 거절·Drop과 Client 재시도 안내가 함께 동작해야 한다.
- **Would-block**: Would-block 복구 뒤 상태가 맞는지 원본 Event, Snapshot 또는 DB와 대조한다. 자동 복구가 불가능한 차이는 경고와 수동 Reconciliation 대상으로 남긴다.

Blocking과 Non-blocking I/O에서는 각 Test는 성공 여부만 기록하지 않는다. 처리 시간 분포, Queue 최대치, Drop·Retry 수와 복구 소요 시간을 남겨 다음 배포의 기준값으로 사용한다.

## 4. 쉬운 예시
한 Event Loop가 1만 Socket을 감시하다 Readable Event를 받으면 would-block까지 읽고 즉시 돌아간다. DB 조회는 별도 제한 Queue로 보내 다른 Socket 처리를 막지 않는다.

## 5. 비슷한 개념과 비교
Blocking은 흐름이 단순하지만 대기 Thread 비용이 있고 Non-blocking은 연결 확장성이 좋지만 부분 I/O와 Buffer 수명이 복잡하다.
## 6. 장점과 단점
Blocking과 Non-blocking I/O을 올바르게 적용하면 상태와 처리 책임이 명확해지고 Peak 부하와 장애에 대한 예측 가능성이 높아진다. 반면 Blocking 범위, Event Loop와 Readiness 정책을 잘못 정하면 지연, 상태 불일치 또는 운영 복잡도가 늘어난다. 실제 요구와 측정 결과를 기준으로 필요한 범위만 적용한다.
## 7. 게임 서버·백엔드 실무 예시
I/O Thread는 Socket Event만 처리하고 Packet을 Work Queue로 넘긴다. 느린 Client 송신 Queue에 상한을 두고 중요하지 않은 Snapshot을 합친다.

Blocking과 Non-blocking I/O 관점에서는 운영에서는 연결 수, Packet Rate, Queue 길이, Tick p99, Drop·Retry, Memory와 Thread 고갈을 같은 시간축에서 본다.

## 8. 자주 하는 오해
- **Blocking 범위**을 도입하면 관련 문제가 자동으로 모두 해결된다고 생각한다.
- **Event Loop**을 도입하면 관련 문제가 자동으로 모두 해결된다고 생각한다.
- **Readiness**을 도입하면 관련 문제가 자동으로 모두 해결된다고 생각한다.
- **Completion**을 도입하면 관련 문제가 자동으로 모두 해결된다고 생각한다.
- **Partial Read**을 도입하면 관련 문제가 자동으로 모두 해결된다고 생각한다.
## 9. 면접 질문
### Q1. 핵심 개념을 설명해 주세요.
Blocking I/O는 작업 완료까지 호출 Thread가 기다리고 Non-blocking I/O는 즉시 가능한 결과나 미완료를 반환한다.
### Q2. 왜 필요한가요?
많은 연결의 대기 시간에 Thread를 하나씩 점유하지 않고 제한된 Thread로 I/O를 처리한다.
### Q3. 실무에서는 어떻게 적용하나요?
I/O Thread는 Socket Event만 처리하고 Packet을 Work Queue로 넘긴다. 느린 Client 송신 Queue에 상한을 두고 중요하지 않은 Snapshot을 합친다.
### Q4. 장애 시 무엇을 확인하나요?
Blocking과 Non-blocking I/O 관점에서는 상태 소유자, Queue와 Buffer, Sequence, Timeout, Drop·Retry와 p99를 확인한다.

## 10. 예상 꼬리질문
- Blocking 범위의 최종 소유자는 어디에 두나요?
- Event Loop 처리에서 중복과 역순은 어떻게 구분하나요?
- Readiness의 상한을 넘으면 어떤 요청부터 제한하나요?
- Completion 장애를 어떻게 재현하고 복구를 검증하나요?
- Partial Read 관련 p99가 증가하면 어떤 지표를 함께 보나요?
## 11. 30초 모범답변
> Blocking은 완료까지 Thread를 기다리게 하고 Non-blocking은 즉시 제어를 돌려줍니다. 대규모 연결에서는 Event 기반 I/O와 Buffer·Backpressure를 함께 설계합니다. I/O Thread는 Socket Event만 처리하고 Packet을 Work Queue로 넘긴다.

## 12. 1~2분 확장답변
> Blocking은 완료까지 Thread를 기다리게 하고 Non-blocking은 즉시 제어를 돌려줍니다. 대규모 연결에서는 Event 기반 I/O와 Buffer·Backpressure를 함께 설계합니다. 설계에서는 상태 소유권, 입력 검증과 Message 순서를 먼저 정합니다. Network I/O와 Logic 실행을 분리하되 Queue에 상한과 Backpressure를 둡니다. 게임 서버에서는 평균 처리량보다 Tick과 Packet 지연의 p99, 재접속과 배포 시나리오까지 검증해야 합니다.

## 13. 핵심 요약
- Blocking I/O는 작업 완료까지 호출 Thread가 기다리고 Non-blocking I/O는 즉시 가능한 결과나 미완료를 반환한다.
- 상태 소유권과 입력 검증이 핵심이다.
- 순서·Timeout·재처리를 정의한다.
- Queue와 Buffer에는 상한이 필요하다.
- 운영에서는 p99와 Overload를 관찰한다.

## 한 줄 정리
> Blocking은 완료까지 Thread를 기다리게 하고 Non-blocking은 즉시 제어를 돌려줍니다. 대규모 연결에서는 Event 기반 I/O와 Buffer·Backpressure를 함께 설계합니다.
