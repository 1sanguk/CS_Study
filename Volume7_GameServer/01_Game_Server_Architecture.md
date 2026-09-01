---
difficulty: 3
reading_time: 25분
interview_frequency: 5
importance: 5
---

# 01. Game Server Architecture


## 학습 목표
- Stateful Game Instance 노드에서 CPU·Memory가 임계값을 초과하거나 Tick p99가 기준을 벗어날 때 신규 Room 배치를 중단하고 Drain해야 하는 시점 기준과, Sticky Routing이 Hot Spot을 유발하는 조건을 진단해 조치 우선순위를 판단할 수 있다.
- Login→Matchmaking→Game→Persistence 흐름에서 응답 손실 후 재시도로 아이템·재화 중복 처리가 발생할 때, Idempotency Key·Version 조건부 갱신·Outbox 중 Authority 경계와 재처리 허용 여부를 기준으로 적합한 패턴을 결정할 수 있다.
- Game Instance 예고 없는 재시작 시 Memory 상태 복구를 위해 Snapshot 주기 저장·Event Log·주기 DB Flush 중 RPO·RTO 요구사항을 기준으로 어느 방식을 조합할지 판단하고, 복구 불가 범위를 설계 결정으로 명시할 수 있다.
- Tick p99가 특정 이벤트 이후 급등했을 때 Connection 수·Queue Depth·Packet Drop·DB Latency·GC Pause 지표 중 어느 것이 원인인지 순서대로 좁히고, Network I/O와 Logic Thread 분리가 실제로 도움이 되는 조건을 판단할 수 있다.

## 1. 개요
게임 서버 아키텍처는 Gateway, Login, Matchmaking, Game, Chat, Persistence 같은 책임과 통신·상태 경계를 배치하는 구조다. MMO(Massively Multiplayer Online) 게임처럼 대규모 동시 접속자를 처리하려면 서버 역할을 명확히 분리해야 한다.

## 2. 왜 필요한가
서로 다른 부하·상태·장애 특성을 분리해 확장과 배포, 장애 격리를 가능하게 한다. 게임 서버는 정확성뿐 아니라 제한 시간 안의 처리와 장애 후 복구를 함께 제공해야 한다.

## 3. 핵심 동작 원리
```text
Client→Gateway/Login→Matchmaker→Game Server→DB/Cache/Event
```
초기에는 단순한 Monolith가 운영에 유리할 수 있다. 서비스 분리는 네트워크 실패, 배포와 데이터 정합성 비용을 추가하므로 독립 확장·소유 경계가 분명할 때 선택한다.

상태의 최종 소유자, Message 순서, Timeout과 실패 후 재처리 기준을 명시한다.

### 서버 역할 분리

게임 서비스는 하나의 Process가 모든 기능을 수행할 수도 있지만 규모가 커지면 역할을 분리한다.

```text
Client
  ↓
Gateway·Load Balancer
  ├─ Login·Account
  ├─ Lobby·Matchmaking
  ├─ Game Instance·World
  ├─ Chat
  └─ Ranking·Persistence
```

분리는 독립 확장과 장애 격리, 배포 주기 분리에 유리하다. 반면 Network Hop, 분산 Transaction, 관찰·운영 복잡도가 늘어난다. 처음부터 Microservice 수를 늘리기보다 부하·소유 데이터·장애 경계를 기준으로 나눈다.

Login은 인증과 Token 발급, Lobby는 Character·Party·Match 진입, Game Server는 실시간 상태와 전투 판정, Persistence 계층은 영속 저장을 담당할 수 있다. 어떤 서비스가 데이터의 최종 Authority인지 명시한다.

### Stateful과 Stateless

HTTP 인증 API는 요청마다 필요한 상태를 DB·Cache에서 읽는 Stateless 형태로 수평 확장하기 쉽다. 실시간 Game Instance는 Player·Monster·Map 상태를 Memory에 유지하는 Stateful Server가 자연스럽다.

Stateful Server를 확장하려면 Session·Room을 어느 Instance에 배치할지 Routing이 필요하다. Instance 장애 시 Memory 상태를 잃을 수 있어 Snapshot·Event Log·주기 저장과 복구 범위를 설계한다.

```text
MatchId → Instance Directory → GameServer-17
```

Sticky Routing은 단순하지만 특정 Instance에 Hot Room이 몰릴 수 있다. Room 단위 배치, Capacity·CPU 기반 Admission과 Drain을 사용한다.

### 단일 Process와 분산 구조

한 Process 안 Module 호출은 빠르고 Transaction 경계가 단순하다. 분산 호출은 Timeout, Retry, 중복 처리, 부분 실패가 기본 상태다.

```text
Game → Inventory 저장 요청
        ├─ 성공했지만 응답 손실
        └─ Retry 시 중복 지급 위험
```

Idempotency Key, Version 조건부 갱신, Outbox와 Reconciliation이 필요하다. Network 호출을 Local 함수처럼 생각하지 않는다.

### 데이터 소유권과 일관성

실시간 전투 중 HP·Position은 Game Instance가 Authority이고 DB(Database)는 매 Tick 진실의 원천으로 사용하지 않는다. Match 종료 결과는 한 번만 확정해 Persistence Service로 전달한다.

강한 일관성이 필요한 결제·재화와 지연 허용 가능한 Ranking·통계는 다른 전략을 쓴다. Cache는 조회를 빠르게 하지만 무효화와 Stale 허용 범위를 명시한다.

### 확장 단위

- Connection 수: Gateway·I/O(Input/Output) 확장
- Room·Match 수: Instance 수평 확장
- 한 World의 Player 수: Zone·Cell Partition과 Interest Management
- DB Write: Batch·Partition·Shard
- Chat Fan-out: Channel Partition·Pub/Sub

무엇이 병목인지 모른 채 Server 수만 늘리면 Shared DB나 Hot Key가 새 병목이 된다. CPU, Network, Tick, Queue, DB Connection과 p99를 함께 본다.

### 장애와 배포

Service Discovery와 Health Check는 Process가 살아 있다는 것과 새 Traffic을 받을 준비가 됐다는 것을 구분한다. Readiness 실패 시 Routing에서 제외하고 기존 Session은 Drain한다.

Game Match 중 Binary를 즉시 교체하기 어렵다면 새 Match만 새 Version에 배치하고 기존 Match가 끝날 때까지 두 Version을 운영한다. Protocol·Data Schema의 전후 호환성이 필요하다.

### 관찰 가능성

Correlation ID로 Login→Matchmaking→Game→Persistence 흐름을 추적한다. Metrics는 Connection, CCU(Concurrent Connected Users), Room 수, Tick p99, Queue Depth, Packet Drop, DB Latency와 Error Rate를 포함한다. Log만으로 고빈도 Server를 운영하면 비용과 검색 지연이 커져 Metrics·Trace를 조합한다.

### 실무 선택 원칙

Architecture는 Diagram의 Box 수가 아니라 Authority, State, Failure와 Scale 경계다. 새 Service를 분리할 때 독립 배포·확장 이득이 Network·정합성 비용보다 큰지 확인한다. 장애 주입으로 한 Service Timeout이 전체 Tick과 Login을 연쇄 차단하지 않는지 검증한다.

### 실무 설계 검토 체크리스트

- **Authority 경계**: Authority 경계의 입력이 어디서 생성되고 어느 실행 흐름이 상태를 소유하는지 먼저 정한다. 다른 구성 요소는 상태를 직접 고치지 않고 명시된 경계를 통해 요청한다.
- **Stateful 배치**: Stateful 배치의 정상 처리 순서를 Diagram으로 확인한다. 중간 단계가 실패했을 때 이미 반영된 상태와 다시 수행해도 되는 작업을 구분한다.
- **Gateway 용량**: Gateway 용량에 적용할 최대 개수, Byte 또는 시간 한도를 정한다. 한도를 넘으면 대기, 거절, Drop 가운데 업무 의미에 맞는 정책을 사용한다.
- **Service Discovery**: Service Discovery 관련 Message에는 중복과 역순을 식별할 Sequence나 Version이 필요한지 판단한다. 오래된 작업이 새 Session 상태를 덮지 않게 한다.
- **Room Partition**: Room Partition가 느려질 때 상위 Queue와 호출자까지 지연이 전파되는 경로를 확인한다. Timeout과 Backpressure가 연쇄 Retry를 만들지 않게 한다.
- **DB 소유권**: DB 소유권의 평균 처리량만으로 용량을 결정하지 않는다. Peak 부하에서 p95·p99 지연, Memory와 Queue 깊이가 허용 범위인지 측정한다.
- **Cache 정합성**: Cache 정합성를 Client가 주장할 수 있다면 Server가 다시 계산하거나 검증할 항목을 정한다. 허용 오차와 반복 위반 처리 기준도 기록한다.
- **Timeout 예산**: Timeout 예산 변경은 이전 Client나 Server와 동시에 존재할 수 있다. Version 협상, 기본값과 단계적 배포로 전후 호환성을 확인한다.
- **Retry와 멱등성**: Retry와 멱등성 장애를 재현하는 Test를 만든다. Timeout, 연결 종료, 중복 Callback과 Process 재시작 뒤에도 자원과 상태가 한 번만 정리되는지 확인한다.
- **배포 Drain**: 배포 Drain 관련 Log에는 Match·Session·Sequence 같은 추적 Key를 남긴다. 민감 정보는 제외하고 원인 판별에 필요한 지표와 함께 조회한다.
- **Schema 호환성**: Schema 호환성 최적화는 실제 Profile 결과를 근거로 적용한다. CPU를 줄이는 대신 Memory, 복사 감소 대신 Lifetime 복잡도가 늘 수 있음을 비교한다.
- **장애 격리**: 장애 격리의 Owner를 배포 중 교체할 때 새 요청 차단, 진행 작업 Drain과 상태 이전 순서를 정의한다. 구 Version Callback은 식별 후 폐기한다.
- **Admission Control**: Admission Control 결과가 영속 데이터나 외부 서비스에 반영되면 성공 응답의 기준을 정한다. 불확실한 결과는 조회와 Reconciliation으로 확정한다.
- **관찰 가능성**: 관찰 가능성 기능을 독립 Service나 Thread로 분리할지는 확장과 장애 격리 이득으로 판단한다. Network·Queue 이동과 운영 비용도 함께 계산한다.
- **재해 복구**: 재해 복구 정책은 정상 사용자 경험과 악용 방지를 함께 고려한다. 너무 넓은 허용 범위와 지나치게 엄격한 오탐 사이를 실제 분포로 조정한다.

이 항목은 Game Server Architecture 설계 Review에서 실제 요구와 실패 조건을 빠뜨리지 않기 위한 기준이다. 모든 장치를 일괄 적용하지 않고 측정된 위험과 운영 목표에 필요한 항목만 선택한다.
### 장애 시나리오 연습

Game Server Architecture은 정상 경로만 구현해서는 운영 준비가 끝나지 않는다. 다음 상황을 부하·Network Simulator와 장애 주입 Test로 재현한다.

- **Authority 경계**: Authority 경계 요청이 정상 처리됐지만 응답만 손실된 상황을 가정한다. 호출자가 재시도해도 같은 상태 변경이 두 번 발생하지 않도록 Sequence, Version 또는 Idempotency Key를 둔다.
- **Stateful 배치**: Stateful 배치 처리 시간이 평소의 열 배로 증가한 상황을 재현한다. 제한 Queue, Timeout과 Admission Control이 다른 Session과 Tick까지 지연을 퍼뜨리지 않는지 확인한다.
- **Gateway 용량**: Gateway 용량 Owner가 배포나 장애로 사라진 상황을 Test한다. 새 Owner 선택, 진행 중 작업 처리와 구 Callback 폐기 순서가 명확해야 한다.
- **Service Discovery**: Service Discovery 입력이 최대 크기, 빈 값, 오래된 Timestamp와 잘못된 Enum을 포함하는 경우를 검증한다. 실패한 입력이 부분 상태를 남기거나 Process를 종료시키면 안 된다.
- **Room Partition**: Room Partition 관련 Message가 중복·역순·지연 도착하는 Network 조건을 주입한다. 최종 상태가 순서 정책과 허용 Window에 맞는지 Replay로 비교한다.
- **DB 소유권**: DB 소유권 Capacity가 모두 사용된 Peak 상황에서 대기 시간을 무제한 늘리지 않는다. 업무 중요도에 따른 거절·Drop과 Client 재시도 안내가 함께 동작해야 한다.
- **Cache 정합성**: Cache 정합성 복구 뒤 상태가 맞는지 원본 Event, Snapshot 또는 DB와 대조한다. 자동 복구가 불가능한 차이는 경고와 수동 Reconciliation 대상으로 남긴다.

Game Server Architecture에서는 각 Test는 성공 여부만 기록하지 않는다. 처리 시간 분포, Queue 최대치, Drop·Retry 수와 복구 소요 시간을 남겨 다음 배포의 기준값으로 사용한다.

## 4. 쉬운 예시: Room 배치와 Idempotency

**Room 배치 — Admission Control 의사코드**

```python
# Matchmaker가 Game Server에 Room 배치 요청
def allocate_room(server_id, room_id, idempotency_key):
    server = server_registry[server_id]
    if server.cpu > 0.80 or server.tick_p99_ms > 20:
        raise ServerOverloaded("Drain 대상: 신규 Room 거절")
    
    # 중복 요청 방지 (Idempotency Key)
    if idempotency_key in processed_keys:
        return existing_result[idempotency_key]  # 이전 결과 반환
    
    room = server.create_room(room_id)
    processed_keys[idempotency_key] = room
    return room
```

**Tick Loop — I/O와 Logic 분리**

```
Network I/O Thread          Logic Tick Thread (16ms)
─────────────────           ────────────────────────
recv(packet)         →  [bounded Queue]  →  dequeue
                                             process
send(response)       ←  [response Queue] ←  enqueue
```

I/O Thread가 World State를 직접 수정하지 않고 Message Queue로만 전달한다. Queue 상한 초과 시 새 패킷을 Drop하거나 Client를 Disconnect해 Tick이 밀리지 않게 한다.

## 5. 비슷한 개념과 비교

| 구분 | Monolith | 역할 분리 (서비스 분리) |
|------|---------|-------------|
| 배포 단위 | 전체 함께 | 서비스별 독립 |
| 확장 방법 | 전체만 확장 | 병목 서비스만 확장 |
| 장애 격리 | 어려움 (한 버그가 전체 영향) | 서비스별 격리 |
| 통신 비용 | 함수 호출 (0 hop) | Network Hop (왕복 비용 증가) |
| 정합성 | Local Transaction | 분산 Transaction·Idempotency 필요 |
| 운영 복잡도 | 낮음 | Trace·Discovery·배포 파이프라인 필요 |
| 적합한 시기 | 초기·소규모·CCU 안정기 | 독립 부하·장애 경계가 명확한 시점 |
## 6. 장점과 단점

### 역할 분리 아키텍처의 장점

- 독립 확장: 병목 서비스(Matchmaking·Chat)만 선택적으로 Scale-out
- 장애 격리: Chat 장애가 Game Room Tick에 영향을 주지 않도록 경계 분리
- 배포 자유도: Game Server를 내리지 않고 Login·Ranking 서버만 배포
- Authority 명확화: 상태 소유자를 명시해 불일치·충돌 감소

### 역할 분리 아키텍처의 단점

- Network Hop 증가: 서비스 간 호출마다 왕복 비용 발생, p99 누적 증가
- 분산 정합성 비용: Idempotency Key·Outbox·Reconciliation 설계 부담
- 운영 복잡도: Trace·Service Discovery·Circuit Breaker·다중 배포 파이프라인 필요
- Stateful 이전 불가: Room 메모리 상태는 다른 Instance로 Live 이전이 어려움
## 7. 게임 서버·백엔드 실무 예시
로그인 API(Application Programming Interface)는 무상태로 수평 확장하고 Game Room은 특정 프로세스가 권위 상태를 소유한다. 서버 Directory와 Drain 절차로 배포 중 새 매치를 막는다.

Game Server Architecture 관점에서는 운영에서는 연결 수, Packet Rate, Queue 길이, Tick p99, Drop·Retry, Memory와 Thread 고갈을 같은 시간축에서 본다.

## 8. 자주 하는 오해

- **게임 서버는 항상 Stateful해야 한다**: Login·Matchmaking·API는 요청마다 DB·Cache에서 상태를 읽는 Stateless 구조로 수평 확장이 쉽다. Stateful은 실시간 전투처럼 Memory 상태 유지가 필수인 곳에만 적용한다.
- **Authoritative 서버를 두면 치팅이 완전히 불가능하다**: 서버가 최종 Authority여도 클라이언트 입력 속도·범위 검증 설계가 필요하다. 협력 치팅, API 직접 호출, 인가 우회는 별도로 막아야 한다.
- **서비스를 분리하면 지연이 줄어든다**: 서비스 Hop이 늘어날수록 Network 왕복 비용이 누적된다. 분리의 이득은 독립 확장·장애 격리이며, Tick 지연 감소가 목적이라면 분리는 오히려 역효과다.
- **Service Discovery가 있으면 장애가 자동 복구된다**: Service Discovery는 Health Check 기반 라우팅 제외만 처리한다. Timeout·Retry·Circuit Breaker·진행 중 작업 Drain·상태 복구는 별도로 설계해야 한다.
- **Room을 분리하면 모든 동기화 문제가 사라진다**: 글로벌 채팅·친구 목록·Cross-Room 이벤트·랭킹처럼 Room 간 상호작용은 여전히 일관성 설계가 필요하다.
- **CCU가 늘면 Game Server 수만 늘리면 된다**: Server를 늘려도 공유 DB·Hot Key·Gateway·Matchmaking 중앙 서비스가 새 병목이 된다. CPU·Queue·DB Connection·p99를 함께 측정해야 한다.
- **Heartbeat 응답이 오면 서버가 정상이다**: Heartbeat는 Process 생존만 확인한다. Tick 처리량 저하, Queue 포화, Memory 임박, GC Pause 급증은 별도 지표(dotnet-counters·perf·p99 Tick)로 확인해야 한다.
## 9. 면접 질문

### Q1. Game Server 1대에서 CPU 95%·Tick p99 80ms가 지속됩니다. 해당 노드에 Room이 300개 있고 Matchmaker가 계속 새 Room을 배치하고 있습니다. Drain 시점 기준과 절차, 기존 Room을 다른 노드로 이전할 수 없는 근본 이유는 무엇인가요?

Drain 트리거를 CPU 80% 또는 Tick p99 20ms 초과로 설정하고, 해당 임계값을 넘는 순간 Matchmaker의 신규 Room 배치 요청을 거절합니다. 기존 300개 Room은 Match가 끝날 때까지 정상 처리하고 종료 후 Process를 재시작하거나 교체합니다. 기존 Room을 Live 이전할 수 없는 이유는 Memory의 Player·Monster·Physics 상태가 다른 Process 주소 공간에 있어 TCP 소켓과 함께 원자적으로 이전하는 표준 방법이 없기 때문입니다. 이전 가능한 설계는 Room 상태를 Redis나 DB에 직렬화하고 Client에게 재접속을 요청하는 방식이나, Match 중단 허용 범위와 RPO를 먼저 결정해야 합니다.

### Q2. Login→Game 서버 흐름에서 아이템 지급 요청 응답이 손실돼 Login 서버가 재시도하니 아이템이 중복 지급됐습니다. Idempotency Key를 어느 계층에 적용해야 하고, Game 서버 측에서 중복을 막는 설계는 무엇인가요?

Idempotency Key(requestId)를 호출자(Login 서버)가 UUID(Universally Unique Identifier)로 생성해 요청에 포함합니다. Game 서버는 처리 전에 Redis 또는 DB에 `requestId`를 기록하고, 동일 Key가 이미 존재하면 이전 결과를 그대로 반환합니다. 처리와 Key 저장은 동일 DB Transaction에 묶거나, Outbox 패턴으로 이벤트와 Key 기록을 함께 커밋합니다. Key TTL은 재시도 최대 Window(예: 5분)보다 길게 설정합니다. 주의: Key 저장 성공·처리 실패 시 부분 상태가 남을 수 있어 Version 조건부 갱신(Compare-and-Swap)을 함께 사용하면 안전합니다.

### Q3. 실시간 Battle Room 서버가 예고 없이 재시작됐습니다. 진행 중인 Match 상태를 복구하는 방법을 설계하세요. Snapshot과 Event Log 방식의 RPO·RTO 차이와, 어떤 조건에서 어느 쪽을 선택하나요?

Snapshot 방식은 N초마다 전체 Room 상태를 DB/Redis에 직렬화합니다. RPO는 Snapshot 주기(예: 5초), RTO는 마지막 Snapshot 로드 시간입니다. 단순하지만 Snapshot 간 이벤트가 유실됩니다. Event Log 방식은 매 Tick 또는 매 상태 변경마다 이벤트를 Append-only로 기록합니다. RPO는 최근 이벤트(수십 ms), RTO는 Replay 시간이며 이벤트 수에 비례합니다. 선택 기준: PvP Battle처럼 단 1Tick 유실도 허용 불가한 경우 Event Log 방식 + Replay, 협동 PvE처럼 5초 롤백이 허용되면 Snapshot. 실무에서는 Snapshot + Event Log 조합으로 Snapshot 기점에서 Log Replay를 수행해 RPO와 RTO를 균형 맞춥니다.

### Q4. Matchmaking 서버가 Game Server에 Room 생성 요청 후 타임아웃이 발생했습니다. Matchmaking은 Room을 '생성됨'으로 표시했고 Client가 접속을 시도합니다. 어떤 데이터 불일치가 생기고, 방지 설계는 무엇인가요?

Room이 실제로 생성됐는지 알 수 없는 상태에서 '생성됨'으로 표시하면, (1) Room이 미생성됐으나 Client가 접속을 시도해 연결 실패, (2) Room이 생성됐으나 Matchmaking이 재시도해 Room이 중복 생성되는 두 불일치가 발생합니다. 방지 설계: (1) Idempotency Key로 중복 생성 방지, (2) Matchmaking이 타임아웃 후 Room 상태를 조회(Query)해 확인 후 결정, (3) Room 상태를 Pending→Created→Active 3단계로 분리하고 Created 확인 전까지 Client 접속을 허용하지 않음. 결국 "응답 없음 = 실패"가 아닌 "응답 없음 = 불확실"로 처리해야 합니다.

### Q5. 단일 Game Server Process에서 Network I/O Thread와 Logic Tick Thread를 분리했을 때, I/O Thread가 World State를 직접 수정하면 어떤 문제가 생기나요? Message Queue 설계의 핵심 결정 사항을 설명하세요.

I/O(Input/Output) Thread가 World State를 직접 수정하면, Tick Thread가 같은 State를 읽는 순간 Data Race가 발생합니다. 결과적으로 플레이어 위치·HP 등이 Tick 중간에 변경돼 물리·전투 계산이 일관성 없는 상태로 실행됩니다. Lock으로 보호하면 Tick마다 경합이 생겨 p99가 올라갑니다. Message Queue 설계 핵심: (1) **Queue 크기**: Tick 1회 처리량 × 최대 허용 Tick 지연 수로 상한 설정(예: 16ms Tick × 10 = 160ms 분량), (2) **Drop 정책**: 가득 찬 경우 해당 Client를 Disconnect 또는 최신 패킷만 유지(Position 갱신은 누적 불필요), (3) **Backpressure**: I/O Thread가 Queue Full 시 수신 패킷을 Drop해 Tick Thread 과부하 방지. Queue는 단방향(I/O→Tick, Tick→I/O)으로 두 방향 모두 설계해야 합니다.

### Q6. 배포 시 진행 중인 Game Room이 있는 서버에 새 Binary를 올려야 합니다. Blue-Green과 Rolling 배포 각각에서 Room Session 처리 방법과, Protocol·Schema 버전 호환성 보장 방법을 설명하세요.

Blue-Green: 새 Version의 Green 서버를 준비하고 새 Match만 Green으로 라우팅합니다. Blue 서버의 기존 Room이 모두 종료될 때까지 두 Version을 동시 운영합니다. 단순하지만 서버 리소스 2배 필요, Room이 오래 지속되면 Blue 수명도 길어집니다. Rolling: 노드 한 대씩 Drain(신규 Room 배치 중단) → 기존 Room 종료 대기 → Binary 교체 → 복귀 순서로 진행합니다. 리소스는 절약되나 두 Version이 동시에 운영되는 기간이 생깁니다. Protocol 호환성: Client↔Server 패킷 Schema에 Version 필드를 포함해, Server는 구 Version 패킷도 파싱하고 신규 필드는 Optional로 추가합니다. 두 Server Version이 공유 Redis·DB Schema를 동시에 쓰므로 Column 추가는 허용, Column 삭제·Type 변경은 다음 배포로 분리합니다.

## 10. 예상 꼬리질문

- Sticky Routing으로 Room을 특정 Game Server에 고정했는데 해당 서버에 Heavy Room이 집중돼 CPU 90%가 됐습니다. 다른 서버로 Room을 이전할 수 없다면 단기적으로 부하를 줄이는 방법과, 이 상황을 사전에 방지하는 Admission Control 설계는 무엇인가요?
- Game Instance가 Tick 중에 DB 쓰기를 동기 호출했더니 p99가 100ms → 300ms로 급등했습니다. Tick 경로에서 DB 호출을 제거하는 방법과, Match 종료 결과를 안전하게 Persistence 서비스로 전달하는 설계를 설명해 주세요.
- Zone Partition에서 플레이어가 Zone 경계를 넘을 때 두 Game Server가 동시에 해당 플레이어를 Authority로 갖는 순간을 없애려면 Transfer 과정을 어떻게 설계해야 하나요?
- Matchmaking 서버가 Scale-out으로 Pod가 2대→10대로 늘었을 때, 기존 대기열이 Pod별로 분산되면 어떤 중복 매칭이 발생하나요? 공유 Redis Queue로 해결할 때의 한계와 대안을 설명해 주세요.
- 로그인 서버에서 JWT Stateless 검증만 사용하는데 강제 로그아웃(ban·kick) 기능이 필요합니다. Stateless 검증으로 즉각 ban이 불가능한 이유와, Token Revocation 구현 시 Redis Denylist 방식의 부하와 TTL 설정 기준을 설명해 주세요.
- Correlation ID를 Login→Matchmaking→Game→Persistence 전 흐름에 전파했을 때, 특정 플레이어의 아이템 중복 지급 장애를 재현하기 위해 최소한 어떤 로그 항목과 메트릭을 남겨야 하나요?
- Game Server 배포 중 Rolling Drain을 진행하는데 특정 Room이 2시간 이상 지속되고 있습니다. 이 Room을 더 기다릴지 강제 종료할지 결정하는 기준과, 강제 종료 시 플레이어에게 보상을 지급하는 흐름을 설계해 주세요.
## 11. 30초 모범답변
> 게임 서버 아키텍처는 기능 분리보다 상태 소유권과 실패 경계를 정하는 일입니다. 독립 확장이 필요한 책임만 분리하고 통신 실패와 운영 비용을 함께 설계합니다. 로그인 API는 무상태로 수평 확장하고 Game Room은 특정 프로세스가 권위 상태를 소유한다.

## 12. 1~2분 확장답변
> 게임 서버 아키텍처는 기능 분리보다 상태 소유권과 실패 경계를 정하는 일입니다. 독립 확장이 필요한 책임만 분리하고 통신 실패와 운영 비용을 함께 설계합니다. 설계에서는 상태 소유권, 입력 검증과 Message 순서를 먼저 정합니다. Network I/O와 Logic 실행을 분리하되 Queue에 상한과 Backpressure를 둡니다. 게임 서버에서는 평균 처리량보다 Tick과 Packet 지연의 p99, 재접속과 배포 시나리오까지 검증해야 합니다.

## 13. 핵심 요약

- 게임 서버 아키텍처의 핵심은 기능 분리보다 Authority 경계·State 소유권·장애 격리 경계다.
- Stateful Game Instance는 Memory 상태를 유지해 Tick 지연을 최소화하지만 장애 시 Live 이전이 어렵다.
- 서비스 분리는 독립 확장·배포·장애 격리 이득이 Network Hop·정합성 비용보다 클 때 선택한다.
- 분산 호출은 Timeout·중복·부분 실패가 기본 상태다. Idempotency Key·Outbox·Reconciliation이 필요하다.
- Tick 경로에 동기 DB 호출을 넣지 않는다. I/O와 Logic Thread를 Message Queue로 분리한다.
- Admission Control(CPU·p99 임계값 기반 Drain)로 Hot Spot Instance 보호와 신규 배치 차단을 자동화한다.
- 배포 시 Blue-Green 또는 Rolling Drain으로 진행 중인 Room Session을 보호하고, Protocol Schema는 전후 호환을 유지한다.
- 관찰 가능성: Connection·CCU·Tick p99·Queue Depth·DB Latency·p99를 Correlation ID로 단일 흐름으로 추적한다.
- 평균 처리량이 아닌 p99·p99.9를 Traffic 타임라인과 함께 보고 Tail Latency와 Tick Spike를 진단한다.

## 한 줄 정리
> 게임 서버 아키텍처는 기능 분리보다 상태 소유권과 실패 경계를 정하는 일입니다. 독립 확장이 필요한 책임만 분리하고 통신 실패와 운영 비용을 함께 설계합니다.
