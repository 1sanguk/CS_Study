---
difficulty: 4
reading_time: 25분
interview_frequency: 5
importance: 5
---

# 15. Game Server 종합면접

> 게임 서버·백엔드 개발자를 위한 CS 면접 교재

## 학습 목표
- 게임 서버의 핵심 흐름(인증 → 세션 → 입력 처리 → Tick → 영속화 → 재접속)을 하나의 설계 논리로 설명할 수 있다.
- 각 Trade-off(서버 권위 vs 클라이언트 예측, 지연 vs 정확성, 처리량 vs 공정성)를 요구사항에 근거해 선택할 수 있다.
- 장애 시나리오(Queue 고갈, 세션 소실, 중복 처리, 부분 실패)에 대한 방어 설계를 설명할 수 있다.
- 관찰 지표(CCU, Tick p99, Queue 깊이, Drop Rate, 재접속 성공률)를 기반으로 문제를 진단하고 개선 방향을 제시할 수 있다.

## 1. 개요
게임 서버 면접의 핵심은 권위 상태, Network 전송, Tick·동시성, 지연 보정, 영속성과 장애 복구를 하나의 흐름으로 설명하는 것이다.

## 2. 왜 필요한가
단일 기능의 정답보다 부하·지연·치팅·배포 실패에서 어떤 Trade-off를 선택하는지 보여야 한다. 사용자 경험을 개선하더라도 서버 권위와 복구 가능성을 훼손하지 않아야 한다.

## 3. 핵심 동작 원리
```text
connect/auth→session→input sequence→tick validate/simulate→snapshot/events→persist→disconnect/reconnect
```
Authoritative Server가 최종 판정하고 Client는 Prediction·Interpolation으로 지연을 숨긴다. I/O와 Logic은 Queue로 분리하되 상태 소유와 순서를 보장한다.

Game Server 종합면접 관점에서는 Sequence, Timestamp, Session Generation과 상태 Version으로 오래되거나 중복된 Message를 식별한다.
### 설계 문제를 푸는 순서

면접에서 바로 기술 이름을 나열하기보다 요구를 먼저 좁힌다. 동시 접속자, 한 Match 인원, Tick Rate, 허용 지연, Packet 빈도, 영속화 범위와 장애 복구 목표를 질문한다. 그다음 Authority, State Owner, Data Flow와 실패 경계를 정한다.

```text
Requirement
 → authority/state ownership
 → normal data flow
 → ordering/idempotency
 → overload/failure
 → metrics/test
```

### 접속부터 입력 처리까지

Client는 Login에서 Ticket을 받고 Gateway나 Game Server에 연결한다. Session은 인증 상태와 Player Identity를 소유하고 Connection은 Socket 수명만 나타낸다. TCP Stream에서는 Length Prefix로 Packet을 분리하고 최대 길이를 검증한다. 역직렬화한 입력에는 Session Generation과 Sequence를 붙여 Logic Queue로 넘긴다.

Authoritative Server는 입력이 가능한 상태인지, 이동 속도와 Cooldown이 규칙에 맞는지 검증한다. Room Owner가 Tick 경계에서 입력을 적용해 Simulation하고 Snapshot이나 Event를 생성한다. I/O Thread가 Game Logic이나 DB를 기다리지 않게 역할을 분리한다.

### Tick과 지연 보정

Fixed Tick은 Simulation 시간 단위를 일정하게 하지만 Tick 예산 초과를 숨기지 않는다. Phase별 시간을 측정하고 Catch-up 상한을 둔다. Client는 자기 입력을 Prediction하고 Server 확인 뒤 미처리 입력을 Replay한다. 원격 객체는 Snapshot Buffer로 Interpolation한다. Hitscan은 제한된 과거 Hitbox History를 Rewind할 수 있지만 Client Timestamp를 신뢰하지 않고 공정성 상한을 둔다.

### Queue와 과부하

Queue는 Thread를 분리하지만 처리량을 만들지는 않는다. 모든 Queue에 Item 또는 Byte 상한을 둔다. 위치 Snapshot은 오래된 것을 최신 상태로 덮어쓸 수 있지만 Inventory와 결제 Event는 유실하면 안 된다. 느린 Client의 Send Queue, DB Connection Pool과 Worker Pool 고갈이 연쇄되지 않게 Admission Control과 Timeout을 둔다.

```text
arrival > capacity
 → queue grows
 → latency grows
 → timeout/retry
 → more load
```

Retry에는 Backoff와 Jitter를 쓰고 중복 가능한 명령에는 Idempotency Key를 둔다.

### 영속성과 장애

실시간 Position을 매 Tick DB에 쓰지 않는다. Game Instance가 Match 상태의 Authority가 되고 중요한 결과는 종료 시 Transaction으로 확정한다. 중간 복구가 필요하면 Snapshot과 Event Log를 사용한다. 결과 저장과 Event 발행의 원자성에는 Outbox, 실패 누락에는 Reconciliation을 고려한다.

Reconnect는 새 Connection을 기존 Session에 결합하는 절차다. Resume Token, Session Generation과 마지막 처리 Sequence를 교환한다. 보관 Window를 넘으면 전체 Snapshot으로 재동기화한다. 이전 Socket의 늦은 Callback은 Generation으로 폐기한다.

### 배포와 관찰

새 Version은 새 Match만 받게 하고 기존 Match는 Drain할 수 있다. Client와 Server가 동시에 갱신되지 않으므로 Packet Schema의 전후 호환성을 유지한다. Health는 Process 생존과 Traffic 수용 가능 상태를 구분한다.

핵심 지표는 CCU, Connection, Packet Rate, Tick p99, Queue 대기와 깊이, Pending Send Byte, Correction, DB Latency, Drop·Retry와 Reconnect 성공률이다. 평균만으로 Spike를 숨기지 않는다. Correlation ID와 Match ID로 Login부터 결과 저장까지 추적한다.

### 대표 Trade-off 답변

Thread를 늘리면 항상 빨라지는 것이 아니라 CPU-bound 작업에서는 Context Switch와 공유 상태 경쟁이 늘 수 있다. Microservice는 독립 확장에 유리하지만 Network 부분 실패와 운영 비용을 만든다. Pool은 Allocation을 줄이지만 Lifetime 버그와 Memory 보유를 만든다. UDP는 지연 제어가 유리하지만 신뢰성·순서·혼잡 정책을 Application이 설계해야 한다.

좋은 답변은 선택 하나를 절대화하지 않는다. 요구, 선택 이유, 대가, 실패 대응과 측정 방법까지 말한다.

### 실무 설계 검토 체크리스트

- **요구사항 수치**: 요구사항 수치의 입력이 어디서 생성되고 어느 실행 흐름이 상태를 소유하는지 먼저 정한다. 다른 구성 요소는 상태를 직접 고치지 않고 명시된 경계를 통해 요청한다.
- **Authority**: Authority의 정상 처리 순서를 Diagram으로 확인한다. 중간 단계가 실패했을 때 이미 반영된 상태와 다시 수행해도 되는 작업을 구분한다.
- **Session**: Session에 적용할 최대 개수, Byte 또는 시간 한도를 정한다. 한도를 넘으면 대기, 거절, Drop 가운데 업무 의미에 맞는 정책을 사용한다.
- **Framing**: Framing 관련 Message에는 중복과 역순을 식별할 Sequence나 Version이 필요한지 판단한다. 오래된 작업이 새 Session 상태를 덮지 않게 한다.
- **Serialization**: Serialization가 느려질 때 상위 Queue와 호출자까지 지연이 전파되는 경로를 확인한다. Timeout과 Backpressure가 연쇄 Retry를 만들지 않게 한다.
- **I/O Model**: I/O Model의 평균 처리량만으로 용량을 결정하지 않는다. Peak 부하에서 p95·p99 지연, Memory와 Queue 깊이가 허용 범위인지 측정한다.
- **Thread Owner**: Thread Owner를 Client가 주장할 수 있다면 Server가 다시 계산하거나 검증할 항목을 정한다. 허용 오차와 반복 위반 처리 기준도 기록한다.
- **Tick Budget**: Tick Budget 변경은 이전 Client나 Server와 동시에 존재할 수 있다. Version 협상, 기본값과 단계적 배포로 전후 호환성을 확인한다.
- **Prediction**: Prediction 장애를 재현하는 Test를 만든다. Timeout, 연결 종료, 중복 Callback과 Process 재시작 뒤에도 자원과 상태가 한 번만 정리되는지 확인한다.
- **Interpolation**: Interpolation 관련 Log에는 Match·Session·Sequence 같은 추적 Key를 남긴다. 민감 정보는 제외하고 원인 판별에 필요한 지표와 함께 조회한다.
- **Lag Compensation**: Lag Compensation 최적화는 실제 Profile 결과를 근거로 적용한다. CPU를 줄이는 대신 Memory, 복사 감소 대신 Lifetime 복잡도가 늘 수 있음을 비교한다.
- **Backpressure**: Backpressure의 Owner를 배포 중 교체할 때 새 요청 차단, 진행 작업 Drain과 상태 이전 순서를 정의한다. 구 Version Callback은 식별 후 폐기한다.
- **Persistence**: Persistence 결과가 영속 데이터나 외부 서비스에 반영되면 성공 응답의 기준을 정한다. 불확실한 결과는 조회와 Reconciliation으로 확정한다.
- **Reconnect**: Reconnect 기능을 독립 Service나 Thread로 분리할지는 확장과 장애 격리 이득으로 판단한다. Network·Queue 이동과 운영 비용도 함께 계산한다.
- **배포와 관찰**: 배포와 관찰 정책은 정상 사용자 경험과 악용 방지를 함께 고려한다. 너무 넓은 허용 범위와 지나치게 엄격한 오탐 사이를 실제 분포로 조정한다.

이 항목은 Game Server 종합면접 설계 Review에서 실제 요구와 실패 조건을 빠뜨리지 않기 위한 기준이다. 모든 장치를 일괄 적용하지 않고 측정된 위험과 운영 목표에 필요한 항목만 선택한다.
### 장애 시나리오 연습

Game Server 종합면접은 정상 경로만 구현해서는 운영 준비가 끝나지 않는다. 다음 상황을 부하·Network Simulator와 장애 주입 Test로 재현한다.

- **요구사항 수치**: 요구사항 수치 요청이 정상 처리됐지만 응답만 손실된 상황을 가정한다. 호출자가 재시도해도 같은 상태 변경이 두 번 발생하지 않도록 Sequence, Version 또는 Idempotency Key를 둔다.
- **Authority**: Authority 처리 시간이 평소의 열 배로 증가한 상황을 재현한다. 제한 Queue, Timeout과 Admission Control이 다른 Session과 Tick까지 지연을 퍼뜨리지 않는지 확인한다.
- **Session**: Session Owner가 배포나 장애로 사라진 상황을 Test한다. 새 Owner 선택, 진행 중 작업 처리와 구 Callback 폐기 순서가 명확해야 한다.
- **Framing**: Framing 입력이 최대 크기, 빈 값, 오래된 Timestamp와 잘못된 Enum을 포함하는 경우를 검증한다. 실패한 입력이 부분 상태를 남기거나 Process를 종료시키면 안 된다.
- **Serialization**: Serialization 관련 Message가 중복·역순·지연 도착하는 Network 조건을 주입한다. 최종 상태가 순서 정책과 허용 Window에 맞는지 Replay로 비교한다.
- **I/O Model**: I/O Model Capacity가 모두 사용된 Peak 상황에서 대기 시간을 무제한 늘리지 않는다. 업무 중요도에 따른 거절·Drop과 Client 재시도 안내가 함께 동작해야 한다.
- **Thread Owner**: Thread Owner 복구 뒤 상태가 맞는지 원본 Event, Snapshot 또는 DB와 대조한다. 자동 복구가 불가능한 차이는 경고와 수동 Reconciliation 대상으로 남긴다.

Game Server 종합면접에서는 각 Test는 성공 여부만 기록하지 않는다. 처리 시간 분포, Queue 최대치, Drop·Retry 수와 복구 소요 시간을 남겨 다음 배포의 기준값으로 사용한다.

## 4. 쉬운 예시

면접 시나리오: "100명 동시 접속 FPS Match 서버를 설계하시오"를 한 흐름으로 답변하는 의사 코드다.

```
// 1. Login & Session 생성
Client → LoginServer: credential
LoginServer → Client: JWT Ticket { sub: userId, exp: now+300, aud: "gameserver" }
Client → GameServer: connect + ticket

GameServer:
  userId = JWT.Verify(ticket)          // 서명·만료·aud 검증
  session = Session {
    id: newUUID(), generation: 0,
    userId, lastSeq: 0, connection: conn
  }

// 2. Packet Framing + 입력 처리
OnRecv(rawBytes):
  recvBuf.Append(rawBytes)
  while TryParseFrame(recvBuf, frame):  // Length-prefix, MAX_PACKET 검증
    msg = Deserialize(frame)            // 역직렬화 + NaN/범위 검증
    if msg.generation != session.generation: continue  // 오래된 generation 폐기
    if msg.seq <= session.lastSeq: continue            // 중복 Sequence 폐기
    session.lastSeq = msg.seq
    roomQueue[msg.roomId % WORKER_COUNT].Push(msg)     // roomId Partition

// 3. Tick (20Hz = 50ms)
WorkerLoop:
  for each msg in roomQueue[workerIdx]:
    // 서버 권위 검증
    if speed(msg.input) > MAX_SPEED: kick(session)
    if !isInGame(session): drop(msg)
    room.ApplyInput(msg)

  // Tick 경계에서 Simulation
  every 50ms:
    room.Simulate()                     // 물리 연산, Cooldown 처리
    snapshot = room.BuildSnapshot()
    BroadcastToAll(snapshot)            // 전체 Snapshot 전송

// 4. 재접속
Client → GameServer: connect + ResumeToken { sessionId, generation: 0 }
GameServer:
  session = Find(token.sessionId)
  if !VerifySignature(token) || token.IsExpired(): reject
  session.generation++                  // 구 Socket의 늦은 Callback 자동 폐기
  session.connection = newConn
  // 마지막 Sequence 이후 Delta 또는 Full Snapshot 전송

// 5. Match 종료 시 영속화
OnMatchEnd(result):
  DB.Transaction:
    SaveMatchResult(result)             // 최종 결과만 저장
    UpdateRanking(result.winners)       // Ranking 반영
    outbox.Publish(MatchEndEvent)       // Outbox 패턴으로 이벤트 발행
```

## 5. 비슷한 개념과 비교

| 설계 결정 | 선택 A | 선택 B | 판단 기준 |
|---|---|---|---|
| 서버 권위 | Authoritative (서버 최종 판정) | Client-side (신뢰) | 치팅 방지 요구 → 항상 서버 권위 |
| 입력 전송 | TCP + Length Prefix | UDP + Reliability Layer | 순서·신뢰성 필요 시 TCP, 지연 민감 시 UDP |
| Tick Rate | 20Hz (50ms) | 60Hz (16ms) | CPU 예산과 네트워크 비용으로 결정 |
| 동시성 모델 | Room Owner + Partitioned Queue | 전역 Lock | 확장성 요구 → Partition, 간단한 서버 → Lock |
| 지연 보정 | Interpolation only | Prediction + Reconciliation | 즉각적 조작감 필요 여부 |
| 영속화 시점 | Match 종료 시 일괄 Transaction | 실시간 매 Tick | DB 부하 vs 중간 복구 필요성 |
| 재접속 | Full Snapshot | Resume Token + Delta | 상태 크기와 네트워크 비용 |
| 배포 전략 | 무중단 Blue-Green | Rolling Update | Match 중단 허용 여부 |

## 6. 장점과 단점

**이 설계 접근법의 장점:**
- 서버 권위 원칙으로 치팅과 상태 불일치를 구조적으로 방지한다
- I/O Thread와 Logic Worker 분리로 각 계층을 독립적으로 확장할 수 있다
- Prediction·Interpolation·Lag Compensation 조합으로 네트워크 지연을 사용자 경험에서 숨긴다
- Bounded Queue와 Backpressure로 과부하 시 연쇄 장애(Cascade Failure)를 방지한다
- Session Generation으로 재접속·배포 중 오래된 Callback을 안전하게 폐기한다
- Outbox + Reconciliation으로 Match 결과 저장의 원자성을 보장한다

**이 설계 접근법의 단점:**
- 설계 복잡도가 높아 초기 구현 비용과 학습 곡선이 크다
- Tick Rate, Queue 상한, Rewind Window 등 파라미터 튜닝이 필요하다
- 분산 환경에서 Session Affinity·Sharding을 위한 추가 인프라가 필요하다
- Snapshot 전송과 Hitbox History 보관으로 메모리·대역폭 사용량이 증가한다
- 장애 시나리오 재현 테스트를 지속적으로 유지·관리하는 비용이 높다

## 7. 게임 서버·백엔드 실무 예시

**배포 중 Match 보호:**
새 버전을 배포할 때 진행 중인 Match를 강제 종료하면 사용자 경험을 크게 해친다. Readiness Probe에서 `newMatchAllowed` 플래그를 false로 바꾸어 신규 Match는 새 버전 서버가 받고, 기존 서버는 진행 중인 Match가 종료될 때까지 Drain 상태로 유지한다. Client와 Server가 동시에 갱신되지 않으므로 Packet Schema에는 필드 추가를 기본으로 하고 기존 필드를 제거하지 않아 전후 호환성을 지킨다.

**운영 중 지표 연계:**
Tick p99가 증가할 때 Queue 깊이와 Worker CPU를 함께 확인한다. Queue가 가득 찼으면 Logic 처리가 느려진 것이고, Queue가 비어 있는데 p99가 높으면 단일 Tick 내 연산 비용이 증가한 것이다. Drop Rate 증가와 Reconnect 성공률 하락이 함께 나타나면 서버 과부하가 아니라 네트워크 문제일 가능성이 높다. Correlation ID와 Match ID를 로그에 남겨 Login부터 결과 저장까지 단일 요청 흐름을 추적한다.

## 8. 자주 하는 오해
- 요구사항 수치 없이도 좋은 게임 서버 아키텍처를 설계할 수 있다고 생각한다. MAU, CCU, 허용 지연, Tick 예산은 설계 결정의 출발점이며 없으면 근거 없는 선택이 된다.
- Authoritative 서버는 규모에 상관없이 단일 프로세스로 운영할 수 있다고 생각한다. Room 수와 동시 접속자 증가에 따라 분산과 Sharding이 필요해지며 이를 미리 고려한 설계가 중요하다.
- Session 서버 없이 게임 서버가 인증까지 담당하면 구조가 단순해진다고 생각한다. 세션 관리와 게임 로직이 결합되면 장애 격리와 독립 확장이 어려워진다.
- Wire Protocol은 운영 중에도 쉽게 바꿀 수 있다고 생각한다. Packet Framing과 Serialization 형식 변경은 모든 클라이언트 버전과의 하위 호환성을 신중하게 고려해야 한다.
- Serialization 포맷이 효율적이면 대역폭 문제가 해결된다고 생각한다. 전송 빈도와 Broadcast 팬아웃이 포맷 효율보다 훨씬 큰 영향을 줄 수 있으므로 함께 최적화해야 한다.
- UDP를 사용하면 TCP의 Head-of-line Blocking 문제가 모두 해결된다고 생각한다. UDP 위에서 신뢰성·순서·혼잡 제어를 직접 구현해야 하므로 오히려 설계 복잡도가 증가한다.
- Client Prediction을 도입하면 서버가 모든 입력을 검증할 필요가 없다고 생각한다. Prediction은 지연 숨기기 기법이며 서버는 여전히 속도·위치·Cooldown을 독립적으로 검증해야 치팅을 방지할 수 있다.
- 재접속은 클라이언트 네트워크 라이브러리가 자동으로 처리한다고 생각한다. 서버는 새 Connection을 기존 Session에 결합하고 Generation을 교체해 오래된 Callback을 폐기하는 명시적 프로토콜이 필요하다.

## 9. 면접 질문
### Q1. 게임 서버 아키텍처를 설계할 때 가장 먼저 확인해야 할 요구사항은 무엇인가요?
CCU, 한 Match 인원, Tick Rate, 허용 지연(RTT), Packet 빈도, 영속화 범위와 장애 복구 목표(RTO·RPO)다. 이 수치가 없으면 Authoritative 서버를 단일 프로세스로 할지 분산할지, Tick Rate를 20Hz로 할지 60Hz로 할지 결정할 근거가 없다. 요구가 확인되면 Authority·State Owner·Data Flow·실패 경계 순으로 설계를 좁힌다.

### Q2. Login부터 Tick 처리까지 전체 데이터 흐름을 설명해 주세요.
Client가 LoginServer에서 JWT Ticket을 받고 GameServer에 연결한다. GameServer는 Ticket을 검증해 Session을 생성하고 TCP Stream에서 Length Prefix로 Packet을 분리한다. 역직렬화한 입력에 Session Generation과 Sequence를 붙여 roomId로 Partition된 Logic Queue에 Push한다. Worker는 이동 속도·Cooldown을 검증한 뒤 Tick 경계에서 Simulation하고 Snapshot을 Broadcast한다.

### Q3. 과부하 상황에서 서버를 보호하는 방법은 무엇인가요?
모든 Queue에 Item·Byte 상한을 두고 상한 초과 시 신규 Packet을 Drop하거나 연결을 거절하는 Admission Control을 적용한다. 위치 Snapshot처럼 최신 상태로 덮어쓸 수 있는 데이터는 낡은 것을 버리고, 결제·인벤토리 이벤트처럼 유실하면 안 되는 데이터는 별도 Queue로 분리한다. Retry에는 Exponential Backoff와 Jitter를 적용해 재시도 폭발을 막는다.

### Q4. 게임 서버 배포 중 진행 중인 Match를 어떻게 처리하나요?
Readiness Probe에서 `newMatchAllowed` 플래그를 내려 신규 Match는 새 버전 서버가 수용하고 기존 서버는 진행 중인 Match가 끝날 때까지 Drain 상태를 유지한다. Client와 Server가 동시에 갱신되지 않으므로 Packet Schema는 필드 추가 기반으로 전후 호환성을 유지한다. 구 버전 Callback이 새 Session에 적용되지 않도록 Session Generation으로 식별해 폐기한다.

### Q5. 재접속 시 Session 복원 절차를 설명해 주세요.
Client가 새 Connection에 ResumeToken(sessionId + HMAC 서명)을 싣어 보낸다. 서버는 sessionId로 Session을 찾아 서명과 만료를 검증한다. 검증 성공 시 `session.generation++`으로 이전 Socket의 늦은 Callback을 자동 폐기하고 새 Connection을 결합한다. 마지막 처리 Sequence 이후 Delta를 전송하고, 보관 Window를 넘겼으면 Full Snapshot으로 재동기화한다.

### Q6. 게임 서버의 핵심 관찰 지표는 무엇이고 어떻게 활용하나요?
CCU와 Connection 수로 현재 부하를 파악하고, Tick p99로 Logic 처리 지연을 감지한다. Queue 깊이와 Drop Rate가 함께 증가하면 처리 용량이 부족한 것이고, Drop이 늘지만 Queue는 정상이면 네트워크 문제다. Correction Rate가 높으면 클라이언트 예측 오류나 치팅 시도를 의심한다. DB Latency 상승과 Tick p99 상승이 동시에 나타나면 영속화 경로가 Logic Thread를 블록하는 것을 확인한다. 평균이 아닌 p95·p99 분포를 기준으로 임계치를 설정한다.

## 10. 예상 꼬리질문
- Queue가 가득 찼을 때 어떤 패킷을 먼저 Drop하나요? 위치 Snapshot과 결제 이벤트를 다르게 처리하는 이유는 무엇인가요?
- Tick p99가 갑자기 증가했을 때 어떤 순서로 원인을 파악하나요? (Queue 깊이 → Worker CPU → 단일 Tick 연산 비용)
- Match 결과를 DB에 저장하는 도중 서버가 죽으면 어떻게 복구하나요? Outbox와 Reconciliation의 역할을 구분해 설명해 주세요.
- Session Affinity 없이 여러 서버에서 Session을 공유하려면 어떻게 해야 하나요? (분산 캐시, Sticky Session 비교)
- Client Timestamp를 신뢰하지 않으면 Lag Compensation은 어떻게 구현하나요? 서버 기준 RTT 추정 방법을 설명해 주세요.
- 서비스 배포 시 Protocol 버전 호환을 어떻게 관리하나요? 기존 필드를 제거하지 않는 것 외에 어떤 전략이 있나요?
- CCU가 갑자기 3배 급증할 때 어느 지표를 가장 먼저 확인하고 어떤 조치를 취하나요?

## 11. 30초 모범답변
> 게임 서버 설계의 핵심은 서버 권위 원칙으로 모든 입력을 검증하고 Tick에서 상태를 갱신하는 것입니다. Client는 Prediction과 Interpolation으로 지연을 숨기고, I/O와 Logic은 Bounded Queue로 분리해 연쇄 장애를 방지합니다. 요구사항 수치(CCU·Tick 예산·허용 지연)를 먼저 확인하고, Tick p99·Drop Rate·Reconnect 성공률로 운영 상태를 관찰합니다.

## 12. 1~2분 확장답변
> 게임 서버 설계에서 가장 먼저 CCU, 한 Match 인원, Tick Rate, 허용 지연, 영속화 범위를 확인합니다. 이 수치가 모든 구조적 선택의 근거가 됩니다.
>
> 데이터 흐름은 Login JWT 검증부터 시작합니다. GameServer는 TCP Length Prefix로 Packet을 분리하고 역직렬화한 입력을 Session Generation과 Sequence로 검증한 뒤 roomId로 Partition된 Logic Queue에 넘깁니다. Worker는 이동 속도·Cooldown을 서버 권위로 검증하고 Tick 경계에서 Simulation 후 Snapshot을 Broadcast합니다.
>
> 지연 보정은 세 계층으로 나뉩니다. 자신의 캐릭터는 Client Prediction으로 즉각 반응하고 서버 확인 후 미처리 입력을 Replay합니다. 원격 캐릭터는 Snapshot Interpolation으로 부드럽게 보간하고, Hitscan은 제한된 과거 Hitbox History를 Rewind해 검증합니다.
>
> 과부하 방어는 모든 Queue에 상한을 두고 Admission Control로 연쇄 장애를 차단합니다. 재접속은 Resume Token과 Generation 교체로 오래된 Callback을 폐기하며, Match 결과는 Outbox + Reconciliation으로 원자성을 보장합니다. 배포는 진행 중인 Match를 Drain하고 Schema 전후 호환성을 유지합니다.

## 13. 핵심 요약
- 서버 권위 원칙: 모든 상태 변경의 최종 판정은 서버가 하고 클라이언트 입력은 속도·위치·Cooldown을 독립 검증한다.
- 요구사항 기반 설계: CCU, 허용 지연, Tick 예산, 영속화 범위를 먼저 확인하고 그에 맞는 구조를 선택한다.
- I/O와 Logic 분리: I/O Thread는 Packet 수신·송신만 담당하고 게임 로직은 Bounded Queue를 통해 별도 Worker에서 처리한다.
- 상한을 두는 습관: Queue, Buffer, Pool, Connection에 반드시 크기·시간 상한을 두어 연쇄 장애를 방지한다.
- 지연 보정 계층: Client Prediction + Server Reconciliation + Snapshot Interpolation + Lag Compensation을 요구에 맞게 조합한다.
- Session Generation: 재접속·배포·장애 복구 시 오래된 Callback과 Packet을 Generation Counter로 식별해 안전하게 폐기한다.
- 영속화 전략: 실시간 위치는 Tick마다 저장하지 않고 중요한 결과만 Match 종료 시 Transaction으로 확정한다.
- Outbox + Reconciliation: 결과 저장과 이벤트 발행의 원자성을 Outbox 패턴으로 보장하고 누락은 Reconciliation으로 복구한다.
- 배포 중 Match 보호: Readiness Probe로 신규 Match 수용을 차단하고 기존 Match가 끝날 때까지 Drain한다.
- 관찰 가능성: CCU, Tick p99, Queue 깊이, Drop·Retry Rate, Reconnect 성공률을 평균이 아닌 p95·p99 분포로 관찰한다.

## 한 줄 정리
> 게임 서버는 서버 권위로 입력을 검증하고 Tick에서 상태를 갱신하며 Prediction·Interpolation으로 지연을 숨기되, 요구사항 수치를 기준으로 설계하고 p99·Drop Rate로 운영한다.
