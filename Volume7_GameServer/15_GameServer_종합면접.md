---
difficulty: 4
reading_time: 25분
interview_frequency: 5
importance: 5
---

# 15. Game Server 종합면접


## 학습 목표
- Tick p99가 평소 8ms에서 50ms로 급등했을 때, Logic Queue 깊이·Worker CPU·단일 Tick 연산 비용·DB Latency 중 어느 경로가 병목인지 Prometheus 지표로 진단 순서를 결정할 수 있다.
- Match 종료 직후 서버 프로세스가 죽어 결과 저장이 중단됐을 때, Outbox 미발행·DB Transaction 불완전·Reconciliation Job 미실행 중 어느 장애인지 좁히고 복구 순서를 결정할 수 있다.
- CCU가 3배 급증하는 상황에서 Queue 상한·Admission Control·Drop 정책 중 어떤 수단을 먼저 활성화해야 연쇄 장애를 막을 수 있는지 판단할 수 있다.
- 배포 중 Client v1과 Server v2가 혼재할 때, 오래된 Packet Field 제거·신규 Field 추가·Generation Mismatch 중 어떤 호환성 문제가 발생할 수 있는지 식별하고 무중단 전환 순서를 결정할 수 있다.

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
- **요구사항 수치 없이도 좋은 게임 서버 아키텍처를 설계할 수 있다.** MAU, CCU, 허용 지연, Tick 예산은 설계 결정의 출발점이며 없으면 근거 없는 선택이 된다.
- **Authoritative 서버는 규모에 상관없이 단일 프로세스로 운영할 수 있다.** Room 수와 동시 접속자 증가에 따라 분산과 Sharding이 필요해지며 이를 미리 고려한 설계가 중요하다.
- **Session 서버 없이 게임 서버가 인증까지 담당하면 구조가 단순해진다.** 세션 관리와 게임 로직이 결합되면 장애 격리와 독립 확장이 어려워진다.
- **Wire Protocol은 운영 중에도 쉽게 바꿀 수 있다.** Packet Framing과 Serialization 형식 변경은 모든 클라이언트 버전과의 하위 호환성을 신중하게 고려해야 한다.
- **Serialization 포맷이 효율적이면 대역폭 문제가 해결된다.** 전송 빈도와 Broadcast 팬아웃이 포맷 효율보다 훨씬 큰 영향을 줄 수 있으므로 함께 최적화해야 한다.
- **UDP를 사용하면 TCP의 Head-of-line Blocking 문제가 모두 해결된다.** UDP 위에서 신뢰성·순서·혼잡 제어를 직접 구현해야 하므로 오히려 설계 복잡도가 증가한다.
- **Client Prediction을 도입하면 서버가 모든 입력을 검증할 필요가 없다.** Prediction은 지연 숨기기 기법이며 서버는 여전히 속도·위치·Cooldown을 독립적으로 검증해야 치팅을 방지할 수 있다.
- **재접속은 클라이언트 네트워크 라이브러리가 자동으로 처리한다.** 서버는 새 Connection을 기존 Session에 결합하고 Generation을 교체해 오래된 Callback을 폐기하는 명시적 프로토콜이 필요하다.

## 9. 면접 질문

### Q1. Tick p99가 평소 8ms에서 50ms로 급등했습니다. 어떤 순서로 원인을 진단하겠습니까?
Prometheus에서 Logic Queue 깊이를 먼저 확인합니다. Queue가 가득 찼으면 처리량 부족이고, Queue가 비어 있는데 p99가 높으면 단일 Tick 내 연산 비용 증가입니다. Worker CPU를 확인해 특정 Worker만 100%이면 Hot Room 문제입니다. DB Latency 상승과 Tick p99가 동시에 올랐으면 영속화 경로가 Logic Thread를 블록하는 구조입니다. perf record로 hot path를 프로파일링해 Tick 시간 예산을 Phase별로 측정합니다.

### Q2. Match 종료 직후 서버 프로세스가 재시작됐는데 일부 플레이어의 Ranking이 반영되지 않았습니다. 어떤 경로로 발생했고 복구 방법은 무엇입니까?
Event Log에서 해당 matchId의 DB 저장 성공 여부와 Outbox 발행 여부를 확인합니다. DB Transaction은 성공했는데 Outbox 발행 전에 프로세스가 죽으면 Ranking Event가 누락됩니다. Reconciliation Job이 DB 상태와 Ranking을 주기적으로 대조해 누락된 matchId를 재처리합니다. 재발 방지: DB에 결과를 저장할 때 Outbox 레코드를 동일 Transaction에 함께 삽입해 원자성을 보장합니다.

### Q3. CCU가 예상의 3배로 급증했습니다. Queue 상한·Admission Control·Drop 정책 중 어떤 순서로 대응하고 연쇄 장애를 어떻게 방지합니까?
가장 먼저 신규 Match 수용을 Admission Control로 제한해 부하 증가를 차단합니다. Logic Queue 깊이가 상한의 80%를 넘으면 위치 Snapshot처럼 덮어쓸 수 있는 패킷을 Drop-oldest로 버립니다. 결제·인벤토리처럼 유실 불가 이벤트는 별도 Priority Queue로 분리해 Drop 대상에서 제외합니다. Retry에는 Exponential Backoff + ±50% Jitter를 적용해 복구 시 Thundering Herd를 방지합니다.

### Q4. 배포 후 v1 Client의 일부 Packet이 v2 Server에서 처리되지 않는 장애가 보고됩니다. Protocol 하위 호환성 깨짐의 원인과 무중단 전환 방법은 무엇입니까?
기존 Field 번호를 재사용하거나 Field를 제거하면 구 Client Packet이 역직렬화에 실패합니다. Field 추가만 허용하고 기존 Field는 제거하지 않는 규칙을 CI에서 강제합니다. Rolling Deploy 기간에 v1·v2 Server가 동시에 존재하므로 Gateway가 Packet Header의 Version 필드로 적합한 서버 버전으로 라우팅합니다. 배포 완료 후 v1 Client 비율이 0이 된 시점에 deprecated Field를 정리합니다.

### Q5. 재접속 후 플레이어 위치가 수초 전 상태로 되돌아가는 버그가 보고됩니다. Session 복원 절차 중 어디서 발생하고 어떻게 수정합니까?
Resume Token 검증 성공 후 Delta를 전송할 때 마지막 처리 Sequence를 기준으로 Delta를 계산해야 하는데, Full Snapshot의 마지막 Broadcast 기준으로 잘못 계산되면 그 사이에 처리된 입력이 누락됩니다. Session 복원 시 `session.lastAppliedSeq`를 Delta 계산 기준으로 사용하고, 보관 Window를 넘겼으면 Full Snapshot으로 재동기화하도록 분기합니다. `session.generation++`으로 이전 Socket의 늦은 Callback을 폐기하는 순서도 확인합니다.

### Q6. Correction Rate가 갑자기 3배 증가했는데 RTT와 네트워크 품질은 정상입니다. 서버 측 어떤 변경이 이 현상을 일으킬 수 있고 어떻게 확인합니까?
서버 Simulation 로직 변경(이동 속도 상한, 충돌 판정 범위)이 Client Prediction과 불일치를 일으키는 가장 흔한 원인입니다. 배포 이력에서 Tick Simulation 관련 변경을 확인합니다. -ffast-math 같은 컴파일 옵션 변경으로 Float 연산 결정론이 깨지면 Client·Server 간 좌표가 누적 오차로 벌어질 수 있습니다. Correction이 특정 Room이나 Player에 집중되는지 지표로 확인해 치팅 시도와 구분합니다.

## 10. 예상 꼬리질문

- Logic Queue 상한을 1,000개로 설정했는데 피크 시간에 Tick 1회에 500개 이벤트가 몰려 Drop 알람이 반복됩니다. 상한을 단순히 2,000개로 늘릴 때의 위험과 Priority Queue·별도 Worker로 분리하는 대안 중 어떤 기준으로 선택하나요?
  > 상한을 단순히 2,000개로 늘리면 처리 지연이 같이 늘어나 Tick p99가 악화될 수 있고, 서버 과부하 시 복구 시간도 길어집니다. 이벤트 성격이 다르다면 Priority Queue·별도 Worker 분리가 적합합니다. 결제·인벤토리처럼 유실 불가 이벤트는 별도 Priority Queue와 전담 Worker로 분리해 Drop 대상에서 제외하고, 위치 Snapshot처럼 최신 값만 의미 있는 이벤트는 Drop-oldest 정책으로 제한합니다. 이벤트 종류가 동질적이라면 상한 확장과 함께 Processing Rate를 높이는(Worker 추가) 방향을 먼저 검토합니다.
- CCU 10,000명 FPS Match 서버에서 60Hz Tick Snapshot 브로드캐스트가 초당 60만 건 발생합니다. AOI(Area of Interest) 필터링으로 실제 대역폭을 어느 정도 줄일 수 있고 구현 복잡도와의 Trade-off는 무엇인가요?
  > AOI 필터링은 플레이어당 가시 범위(예: 반경 100m) 내 객체만 Snapshot을 전송해 대역폭을 대폭 줄입니다. 100명 Match에서 평균 가시 반경 내 플레이어가 10명이라면 브로드캐스트를 최대 90% 감소시킬 수 있습니다. 복잡도 측면에서 Spatial Grid나 Quad-tree로 가시 대상을 효율적으로 조회해야 하고, 가시 영역 경계에서 객체가 갑자기 나타나는 Pop-in 현상을 완화하는 Hysteresis 처리도 필요합니다. AOI는 대역폭이 명확한 병목일 때 도입하고, 먼저 Snapshot 크기 압축과 전송 빈도 조정을 검토합니다.
- Match 결과 Outbox에 쌓인 이벤트 중 일부가 Ranking에 두 번 반영됩니다. matchId Idempotency Key가 존재하는데도 중복이 생기는 구체적인 원인과 DB UNIQUE 제약 설계 방법은 무엇인가요?
  > Idempotency Key를 애플리케이션 레벨에서만 체크하고 DB UNIQUE 제약이 없으면 두 프로세스가 동시에 같은 matchId를 처리할 때 중복이 삽입될 수 있습니다. 해결 방법으로 ranking_events 테이블에 matchId + eventType 복합 UNIQUE 제약을 추가하고, INSERT는 INSERT IGNORE 또는 ON CONFLICT DO NOTHING으로 처리합니다. Reconciliation Job이 중복 실행되는 경우도 이 DB 제약으로 방어됩니다. Outbox 테이블에도 동일하게 UNIQUE 제약을 두어 발행 단계에서 중복을 차단합니다.
- Packet Schema에 Reserved Field를 미리 두는 관행이 Rolling Update 기간 중 어떤 Field 해석 오류를 방지하고, 오히려 역직렬화 버그를 유발하는 시나리오는 무엇인가요?
  > Reserved Field는 미래 사용을 위해 번호를 예약해 기존 Field와 번호가 충돌하는 것을 방지합니다. Rolling Update 중 v2 Server가 신규 Field 번호를 Reserved 범위에서 할당하면 v1 Client가 알 수 없는 Field로 무시(unknown field skip)하므로 역직렬화가 깨지지 않습니다. 반면 Reserved Field에 기본값이 설정되지 않으면 v1 Client에서 Reserved Field가 0이나 빈 문자열로 역직렬화되어 의도하지 않은 기본값이 로직에 영향을 줄 수 있습니다. Reserved Field를 사용할 때는 항상 optional로 선언하고 부재 시 기본값을 명시합니다.
- 서버 Tick Rate를 20Hz에서 60Hz로 올렸을 때 CPU와 트래픽이 3배 증가했는데 Tick p99는 오히려 낮아졌습니다. 이 현상의 원인과 최적 Tick Rate를 결정하는 기준은 무엇인가요?
  > 20Hz에서 Tick 1회당 처리해야 하는 이벤트가 50ms치 입력 전부였다면, Batch 크기가 커서 일부 Tick이 예산을 초과해 p99가 높았습니다. 60Hz에서는 Tick당 처리량이 1/3로 줄어 각 Tick의 연산 부하가 균일하게 낮아져 p99가 개선됩니다. 최적 Tick Rate 결정 기준은 Tick 예산 대비 최대 연산 비용, Snapshot 전송 대역폭, 클라이언트 반응성 요구입니다. CPU와 대역폭 증가를 감당할 수 있고 p99 개선 효과가 명확하다면 높은 Tick Rate가 유리합니다.
- Resume Token에 HMAC-SHA256 서명을 사용하는데 배포 중 서명 Key가 교체되면 재접속 중인 클라이언트의 Token 검증이 실패합니다. Key Rotation과 Grace Period를 어떻게 조율하나요?
  > Key Rotation 시 구 Key와 신규 Key를 동시에 보관하는 Grace Period(예: 5분)를 설정합니다. 서버는 신규 Key로 서명 검증을 먼저 시도하고 실패하면 구 Key로 재시도합니다. Grace Period 내에 재접속을 시도한 클라이언트는 구 Key 서명이 유효하면 인증을 허용하고 새 Token을 발급합니다. Grace Period 종료 후에는 구 Key를 폐기하고 구 Key로 서명된 Token은 재발급을 요구합니다.
- Logic Worker 수를 CPU Core 수(32개)보다 많은 64개로 늘렸는데 Tick p99가 오히려 올라갔습니다. perf stat에서 어떤 지표를 먼저 확인하고 최적 Worker 수를 어떻게 결정하나요?
  > perf stat에서 context-switches와 cache-misses를 먼저 확인합니다. Worker 수가 Core 수를 초과하면 Context Switch 비용이 증가하고 Cache Miss가 늘어 Tick 연산이 느려집니다. 또한 공유 Queue나 Lock Contention(lock_contention 지표)이 증가했는지 확인합니다. 최적 Worker 수는 CPU-bound 작업이면 Core 수와 동일하게 설정하고, I/O 대기가 포함된 혼합 작업이면 Core 수의 1.5배까지 늘리며 p99를 측정해 결정합니다.

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
