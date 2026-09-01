---
difficulty: 3
reading_time: 25분
interview_frequency: 5
importance: 5
---

# 07. Blocking과 Non-blocking I/O


## 학습 목표

- Event Loop CPU가 배포 직후 40%→95%로 급등했을 때, I/O Thread 내 동기 호출·Logic 오프로드 누락·EAGAIN 반복 중 병목 위치를 지표로 특정하고 분리 전략을 결정할 수 있다.
- epoll Edge-triggered 서버에서 특정 클라이언트 응답이 수백 ms 지연될 때, EAGAIN까지 읽지 않은 Event 누락인지 Partial Write EPOLLOUT 미등록인지 진단하고 수정 방향을 결정할 수 있다.
- Send Queue 64KB 상한 초과 시 위치 Snapshot 덮어쓰기·낮은 우선순위 Drop·연결 종료 중 메시지 종류와 게임 규칙을 기준으로 Backpressure 정책을 결정할 수 있다.
- IOCP 서버에서 Overlapped Buffer 조기 해제로 메모리 오염이 발생했을 때, Completion Event와 Buffer Lifetime을 연동하는 설계와 epoll Readiness 방식의 소유권 차이를 기준으로 수정 방향을 결정할 수 있다.

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

Non-blocking Socket은 지금 처리할 수 없으면 `EAGAIN` 또는 `WOULDBLOCK`을 반환한다. 계속 반복 호출하면 Busy Loop가 되므로 `epoll(event poll)`, `kqueue` 같은 방식으로 준비된 Socket만 찾는다.

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

Readiness는 “지금 시도하면 막히지 않는다”를, Completion은 “등록한 작업이 끝났다”를 알린다. Linux epoll은 대표적인 Readiness 방식이고 Windows IOCP(I/O Completion Port)는 Completion 방식이다. 둘 다 많은 연결을 적은 Thread로 다루지만 Buffer 소유권, 취소와 오류 계약이 다르다.

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

아래는 Linux epoll Edge-triggered 기반 Non-blocking I/O 핵심 루프다.

```cpp
// Edge-triggered이므로 EAGAIN까지 모두 읽어야 Event를 놓치지 않는다
void OnReadable(Session& session) {
    while (true) {
        ssize_t n = recv(session.fd, session.recvBuf.WriteHead(),
                         session.recvBuf.Writable(), 0);
        if (n > 0) {
            session.recvBuf.CommitWrite(n);
            ParseAndDispatch(session);  // Packet Framing 후 Logic Queue로
        } else if (n == 0) {
            session.Close(CloseReason::EOF_);  // 정상 종료
            break;
        } else {
            if (errno == EAGAIN || errno == EWOULDBLOCK) break;  // 다음 이벤트까지 대기
            session.Close(CloseReason::Error);
            break;
        }
    }
}

// Send — Partial Write 대응
void FlushSendQueue(Session& session) {
    while (!session.sendQueue.Empty()) {
        auto& chunk = session.sendQueue.Front();
        ssize_t n = send(session.fd, chunk.data + chunk.offset,
                         chunk.size - chunk.offset, MSG_NOSIGNAL);
        if (n > 0) {
            chunk.offset += n;
            if (chunk.offset == chunk.size) session.sendQueue.Pop();
        } else {
            if (errno == EAGAIN) {
                epoll_mod(session.fd, EPOLLIN | EPOLLOUT | EPOLLET);  // Writable Event 등록
            }
            break;
        }
    }
    if (session.sendQueue.Empty())
        epoll_mod(session.fd, EPOLLIN | EPOLLET);  // EPOLLOUT 해제
}
```

- `ParseAndDispatch`에서 DB Query나 Pathfinding을 직접 호출하면 다른 Socket 처리가 모두 지연된다. Logic Queue로 넘겨야 한다.
- Send Queue가 상한을 넘으면 오래된 위치 Snapshot을 덮어쓰거나 Drop한다.

## 5. 비슷한 개념과 비교

| 방식 | 동작 | Thread 비용 | 확장성 | 복잡도 |
|------|------|------------|--------|--------|
| **Thread-per-connection (Blocking)** | recv가 데이터 올 때까지 대기 | 연결당 1 Thread | 수백 연결 | 코드 단순 |
| **Select/Poll (Readiness)** | 준비된 FD 중 하나를 알림 | 공유 Thread | 수천 연결 | FD Set 복사 O(n) |
| **epoll (Readiness)** | Kernel이 준비된 FD만 반환 | 공유 Thread | 수만 연결 | ET/LT 구분 필요 |
| **IOCP(I/O Completion Port) (Completion)** | 작업 완료 후 Buffer와 함께 통지 | Thread Pool | 수만 연결 | Buffer Lifetime 관리 |
| **io_uring (Completion)** | Ring Buffer로 시스템 콜 배치 | Thread Pool | 수만 연결 | 비교적 최신 API |

## 6. 장점과 단점

**장점**
- 소수의 Thread로 수만 개의 연결을 처리할 수 있어 메모리와 Context Switch 비용을 줄인다.
- I/O Thread가 Byte 이동과 Framing만 담당해 책임이 명확하다.
- Send Queue + Backpressure 설계로 느린 클라이언트가 서버 전체에 영향을 주지 않는다.
- Event 기반 아키텍처는 연결 수 증가에 비례해 스케일이 가능하다.

**단점**
- Partial Read/Write, EAGAIN 처리, Buffer 수명 관리가 Blocking보다 복잡하다.
- Edge-triggered epoll에서 EAGAIN까지 모두 읽지 않으면 다음 Event를 놓칠 수 있다.
- IOCP에서 Overlapped Buffer를 Completion 전에 해제하면 메모리 오염이 발생한다.
- I/O Thread에서 무거운 작업을 하면 Non-blocking의 장점이 사라진다.

## 7. 게임 서버·백엔드 실무 예시

I/O Thread는 epoll Event Loop만 돌리고 완전한 Packet이 파싱되면 Session ID와 함께 Logic Queue에 넣는다. Logic Thread는 Tick마다 Queue를 드레인해 게임 상태를 업데이트한다.

Send Queue 상한(예: 64KB)을 넘으면 위치 Snapshot 같은 상태 메시지는 덮어쓰고, 인벤토리 변경 같은 중요 메시지는 대기시키거나 연결을 끊는다. 연결 수·Event Loop 지연·EAGAIN 비율·Send Queue 크기를 지표로 수집한다.

## 8. 자주 하는 오해

- **Non-blocking I/O를 사용하면 처리량이 항상 더 높아진다.** Event Loop 안에서 DB 조회나 파일 I/O를 동기로 호출하면 Single Thread 병목이 생겨 오히려 Thread-per-connection보다 나빠진다.
- **Single Thread Event Loop는 동시성 문제가 없다.** 외부 콜백, Signal Handler, 공유 전역 변수 접근에서 Race가 여전히 발생한다. Timer 콜백이 다른 Thread에서 호출되는 경우도 있다.
- **Readiness Event가 오면 완전한 Packet이 도착했다.** Readiness는 "지금 읽을 바이트가 있다"는 신호이며 완전한 Frame 보장이 아니다. Accumulation Buffer와 Framing이 여전히 필요하다.
- **Non-blocking recv가 -1을 반환하면 항상 오류다.** `errno == EAGAIN || errno == EWOULDBLOCK`은 "지금 읽을 데이터 없음"으로 정상 신호다. 루프를 탈출하고 다음 Event를 기다려야 한다.
- **IOCP Completion Event가 오면 Buffer를 바로 해제해도 된다.** Completion이 오기 전에 Buffer를 해제하면 메모리 오염이 발생한다. Overlapped 구조체와 Buffer는 Completion까지 살아 있어야 한다.
- **epoll Edge-triggered에서 한 번만 읽으면 충분하다.** ET에서는 상태 변화 시 한 번만 알린다. EAGAIN까지 반복해서 읽지 않으면 다음 데이터가 올 때까지 Event를 받지 못한다.
- **Partial Write는 잘 발생하지 않으므로 처리하지 않아도 된다.** 커널 Send Buffer가 가득 찼을 때 `send`는 일부만 전송하고 반환한다. 반환값을 확인해 남은 데이터를 Send Queue에 유지해야 한다.
- **Thread-per-connection 방식은 Non-blocking 방식보다 항상 열등하다.** 관리 서버처럼 연결 수가 수십~수백 개에 불과한 환경에서는 코드 단순성이 오히려 유리하다. 연결 수와 I/O 특성을 측정한 뒤 선택해야 한다.

## 9. 면접 질문

### Q1. I/O Thread의 Event Loop CPU 사용률이 배포 직후 40%→95%로 급등했습니다. 병목 위치를 어떤 순서로 진단하나요?
먼저 `perf record -g` 또는 `async-profiler`로 Hot Function을 확인합니다. ParseAndDispatch가 지배적이면 I/O Thread 내 무거운 Logic이 원인이므로 Logic Queue 오프로드를 점검합니다. epoll_wait 호출 비율이 낮고 다른 시스템 콜이 많다면 Redis·DB 동기 호출을 의심합니다. EAGAIN 반환 횟수 지표가 급증하면 Burst 트래픽으로 루프 비용이 과다한 상황이므로 per-session 처리 상한을 도입합니다.

### Q2. epoll Edge-triggered 서버에서 특정 클라이언트 응답이 수백 ms 지연됐습니다. EAGAIN까지 읽지 않은 Event 누락인지 어떻게 확인하나요?
해당 FD의 recv 루프에 로그를 추가해 마지막 EAGAIN 반환 시각과 다음 epoll_wait Event 도착 시각의 차이를 측정합니다. EAGAIN 없이 루프를 탈출한 기록이 있으면 중간에 break가 삽입됐거나 0 바이트 반환을 EOF로 오해한 것입니다. Level-triggered로 임시 전환해 같은 지연이 사라지는지 확인하면 ET Event 누락임을 확정할 수 있습니다.

### Q3. 10만 CCU 서버에서 특정 Session의 Send Queue가 64KB 상한에 반복 도달합니다. 위치 Snapshot과 인벤토리 변경에 서로 다른 Backpressure를 어떻게 설계하나요?
Session별 Send Queue를 우선순위별로 분리합니다. 위치 Snapshot처럼 최신 상태만 의미 있는 메시지는 Drop-oldest 정책으로 새 값이 오면 이전 Entry를 덮어씁니다. 인벤토리 변경·결제 확인처럼 모든 이벤트가 중요한 메시지는 별도 큐에 보관하고 상한 초과 시에도 Drop하지 않습니다. 총 Send Queue가 64KB를 초과하면 연결 종료를 Slow Consumer 지표와 함께 기록합니다.

### Q4. IOCP 서버에서 Overlapped Buffer를 Completion 전에 해제해 메모리 오염이 발생했습니다. Buffer Lifetime을 안전하게 관리하는 설계를 설명하세요.
Overlapped 구조체와 Buffer를 같은 할당 블록에 묶어 소유권을 Completion에 위임합니다. `WSARecv` 등록 시 Buffer 참조 카운트를 1 증가시키고 Completion Port에서 통지를 받은 뒤에만 해제합니다. epoll Readiness 방식과 달리 IOCP는 Kernel이 I/O를 수행하는 동안 Buffer를 점유하므로 앱에서 임의로 해제하면 안 됩니다. Completion을 기다리지 않고 Session을 종료할 경우 CancelIoEx 호출 후 Completion 통지를 받아 Buffer를 정상 해제해야 합니다.

### Q5. I/O Thread에서 Redis 조회를 동기로 호출하다 Event Loop 지연이 50ms를 초과해 1만 Session 전체에 영향을 줬습니다. Logic 오프로드 설계를 설명하세요.
I/O Thread는 Byte 이동과 Packet Framing만 담당하고, 완전한 Packet이 파싱되면 (Session ID, Packet) 쌍을 Logic Queue에 전달합니다. Logic Thread Pool이 Redis 조회 등 무거운 작업을 처리하고 결과를 Session의 Send Queue에 넣습니다. Logic Queue 깊이와 처리 지연을 Prometheus Histogram으로 수집해 오프로드 미완료 구간을 탐지합니다. I/O Thread에서 허용하는 처리 시간 예산(예: 1ms)을 설정하고 초과 시 알람을 발생시킵니다.

### Q6. 비동기 I/O 진행 중 Session이 Timeout으로 종료됐을 때, 등록된 IOCP Overlapped 작업과 epoll 이벤트를 안전하게 취소하는 방법을 설명하세요.
IOCP는 `CancelIoEx`로 진행 중인 Overlapped 작업을 취소하고 ERROR_OPERATION_ABORTED Completion을 기다린 뒤 Buffer를 해제합니다. epoll은 `epoll_ctl(EPOLL_CTL_DEL)`로 FD를 감시 목록에서 제거하고 Socket을 닫으면 이미 반환된 이벤트 외에 추가 통지를 막을 수 있습니다. Session 상태를 Closing으로 전환 후 Completion 통지나 이벤트 핸들러가 실행될 때 Session이 이미 Closing인지 확인해 이중 해제를 방지합니다.

## 10. 예상 꼬리질문

- epoll_wait가 반환한 100개 이벤트 중 읽기와 쓰기가 혼재할 때, 쓰기를 먼저 처리하면 Send Queue 크기에 어떤 영향을 주나요?
- Event Loop를 4개 Thread로 병렬화했는데 같은 Session 이벤트가 두 Thread에서 동시에 처리되는 버그가 발생했습니다. Connection-to-Thread 고정 없이 어떻게 방지하나요?
- io_uring Submission Queue에 10만 건을 등록했는데 Kernel이 처리 완료 전에 추가 등록하면 SQ Full 오류가 발생합니다. Backpressure를 어떻게 설계하나요?
- Non-blocking send에서 EAGAIN이 반환될 때 EPOLLOUT을 등록하지 않으면 어떤 현상이 발생하고, 필요하지 않을 때 EPOLLOUT을 그대로 두면 어떤 문제가 생기나요?
- Session별 Send Queue에서 1MB 대형 Packet이 Head에 쌓여 100B 소형 Packet이 수백 ms 지연되는 Head-of-Line Blocking이 발생했습니다. Chunking 없이 해결하는 방법은 무엇인가요?
- Event Loop CPU 100% 상황에서 perf record로 Hot Function을 찾았더니 ParseAndDispatch가 지배적이었습니다. Logic Queue 오프로드 외에 I/O Thread 내에서 먼저 시도할 수 있는 최적화는 무엇인가요?
- IOCP Completion Thread 수를 2→32로 늘렸더니 처리량이 오히려 감소했습니다. False Sharing과 Lock 경합 중 어느 쪽이 원인인지 진단하는 방법과 최적 Thread 수 결정 기준을 설명하세요.

## 11. 30초 모범답변

> Blocking recv는 데이터가 없으면 Thread를 기다리게 해 대규모 연결에서 Thread 비용이 큽니다. Non-blocking과 epoll을 조합하면 소수의 Thread로 수만 연결을 처리할 수 있습니다. I/O Thread는 Byte 이동과 Framing만 담당하고 무거운 Logic은 별도 Queue로 오프로드해야 합니다.

## 12. 1~2분 확장답변

> Blocking recv는 데이터가 없으면 Thread가 기다려 연결마다 Thread를 배치해야 합니다. 수만 연결에서는 Stack 메모리와 Context Switch 비용이 감당하기 어렵습니다. epoll 같은 Non-blocking I/O는 소수의 Thread로 수만 FD를 감시하며 준비된 것만 처리합니다.
>
> Edge-triggered epoll은 EAGAIN까지 모두 읽어야 다음 Event를 받을 수 있습니다. Partial Read는 Accumulation Buffer, Partial Write는 Send Queue와 EPOLLOUT 재등록으로 처리합니다.
>
> I/O Thread에서 DB Query나 Pathfinding을 직접 실행하면 Single Thread 병목이 생깁니다. 완전한 Packet이 Framing되면 Logic Queue로 넘기고, Send Queue에 Byte 상한을 두어 느린 클라이언트가 서버 전체를 늦추지 않도록 합니다.

## 13. 핵심 요약

- Blocking recv는 Thread를 기다리게 해 대규모 연결에서 Thread 비용이 문제가 된다.
- epoll+Non-blocking으로 소수의 Thread가 수만 연결의 I/O를 처리할 수 있다.
- Edge-triggered epoll은 EAGAIN까지 반복해서 읽어야 다음 Event를 놓치지 않는다.
- Partial Read는 Accumulation Buffer, Partial Write는 Send Queue + EPOLLOUT 재등록으로 처리한다.
- I/O Thread는 Byte 이동·Framing만 담당하고 무거운 Logic은 Logic Queue로 오프로드한다.
- Send Queue에 Byte 상한을 두고 중요도에 따라 Drop·덮어쓰기·연결 종료를 적용한다.
- Readiness(epoll)는 앱이 recv 시점에 Buffer를 소유하고, Completion(IOCP)은 등록 Buffer를 Completion까지 유지해야 한다.
- Event Loop 지연·EAGAIN 비율·Send Queue 크기를 지표로 수집해 병목을 감시한다.

## 한 줄 정리

> Blocking은 Thread를 기다리게 하고 Non-blocking + epoll은 소수의 Thread로 수만 연결을 처리하며, I/O Thread는 Byte 이동·Framing만 담당하고 무거운 Logic은 Queue로 오프로드해야 한다.
