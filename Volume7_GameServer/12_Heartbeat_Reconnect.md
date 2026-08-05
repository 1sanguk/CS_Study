---
difficulty: 4
reading_time: 25분
interview_frequency: 5
importance: 5
---

# 12. Heartbeat와 Reconnect

> 게임 서버·백엔드 개발자를 위한 CS 면접 교재

## 학습 목표

- Heartbeat Timeout 오탐이 증가해 정상 플레이어가 반복 강제 종료되는 상황에서, 단일 실패 판정인지 Jitter p99 기반 Grace Period 부족인지 진단하고 Timeout 기준을 결정할 수 있다.
- 서버 재시작 후 5만 클라이언트가 동시에 재접속해 인증 서버가 과부하에 빠졌을 때, Exponential Backoff + Jitter 범위와 Retry-After 응답 전략을 기준으로 폭풍 완화 설계를 결정할 수 있다.
- Reconnect 시 이전 Session의 늦은 Callback이 새 Session에 적용되는 버그가 발생했을 때, Session Generation 불일치 여부를 진단하고 Generation 교체 시점 설계를 결정할 수 있다.
- Grace Period 동안 악의적 연결 끊기가 반복되는 경우, Grace Period 단축·패배 판정·Penalty 중 게임 규칙과 사용자 경험을 기준으로 정책을 결정할 수 있다.

## 1. 개요
Heartbeat는 주기적 Message와 응답 기한으로 연결 생존을 판단하고 Reconnect는 새 연결을 기존 논리 Session에 안전하게 결합하는 절차다.

## 2. 왜 필요한가
TCP만으로 즉시 알 수 없는 단절, NAT·Proxy 유휴 만료와 모바일 Network 전환을 감지·복구한다. 사용자 경험을 개선하더라도 서버 권위와 복구 가능성을 훼손하지 않아야 한다.

## 3. 핵심 동작 원리
```text
heartbeat seq→pong/ack→deadline / disconnect→backoff→authenticate resume token→session generation swap→state sync
```
Heartbeat 간격이 짧으면 부하와 오탐이 늘고 길면 감지가 늦다. Reconnect는 새 Socket일 뿐 이전 Message 전달 상태를 자동 복구하지 않는다.

Heartbeat와 Reconnect 관점에서는 Sequence, Timestamp, Session Generation과 상태 Version으로 오래되거나 중복된 Message를 식별한다.
### 연결 생존 판단

TCP 연결 객체가 존재한다고 상대 Application이 정상이라는 뜻은 아니다. Wi-Fi 전환, NAT Mapping 만료와 Process 정지에서는 즉시 Close가 오지 않을 수 있다. Heartbeat는 마지막 정상 송수신 시각을 갱신하고 기한이 지나면 논리적으로 끊긴 것으로 판단한다.

```text
Client ─ ping(seq, time) → Server
Client ← pong(seq, time) ─ Server
          deadline 초과 → suspect → disconnect
```

게임 Packet이 계속 오면 별도 Ping을 생략해도 된다. 중요한 것은 “마지막 정상 Traffic”의 기준을 한곳에서 관리하는 것이다.

### 간격과 Timeout

간격이 짧으면 빠르게 감지하지만 Battery, Packet과 Server 부하가 늘고 일시적 Jitter를 장애로 오판한다. Timeout은 단일 응답 한 번보다 연속 실패나 충분한 Grace Period로 판단한다. Lobby와 실시간 Match는 허용 시간이 다를 수 있다. OS TCP Keepalive는 유용하지만 간격과 정책이 Application 요구보다 길 수 있어 별도 Heartbeat를 둔다.

### Reconnect 상태 기계

Reconnect는 새 Socket을 여는 것만으로 끝나지 않는다. 인증된 Resume Token으로 이전 논리 Session을 찾고 새 Connection에 더 큰 Session Generation을 부여한다.

```text
Disconnected → Backoff → Connect → Authenticate Resume
 → generation swap → full/delta sync → Active
```

이전 Socket의 늦은 Callback과 Packet은 Generation이 다르면 폐기한다. 같은 Account의 두 연결을 허용할지, 새 연결이 이전 것을 교체할지 정책을 둔다. Token은 만료, 서명, Audience와 재사용 범위를 검증한다.

### 전달 상태 복구

연결 복구는 유실 Message를 자동 복구하지 않는다. Client가 마지막으로 확인한 Server Event Sequence와 Server가 처리한 Input Sequence를 교환한다. 보관 Window 안이면 누락 Event만 재전송하고, 너무 오래됐으면 전체 Snapshot을 보낸다. 재화 지급처럼 중요한 명령은 Idempotency Key와 영속 기록으로 중복 실행을 막는다.

Match 중 Player를 즉시 제거하지 않고 짧은 Reconnect Grace 동안 Character를 AI나 정지 상태로 유지할 수 있다. 이 정책은 악의적 연결 끊기로 패배를 회피하지 못하게 해야 한다.

### Backoff와 재접속 폭풍

장애 후 수만 Client가 동시에 재시도하면 복구 중 Server를 다시 압박한다. Exponential Backoff에 Random Jitter를 넣고 Server가 Retry-After를 제공한다. 인증과 State Sync에도 Rate Limit, Capacity와 우선순위를 둔다. Match 복귀를 Lobby 조회보다 우선할 수 있다.

### 운영과 Test

Heartbeat RTT, Timeout, Reconnect 성공률, 재동기화 Byte, Resume 거부 이유와 동시 Session 충돌을 측정한다. 비행기 모드, NAT 변경, Server Restart, 이전 Packet 지연과 Token 만료를 자동 Test한다. 정상 종료와 Timeout을 구분해 사용자가 원인을 이해할 메시지도 제공한다.

### 실무 설계 검토 체크리스트

- **Heartbeat Sequence**: Heartbeat Sequence의 입력이 어디서 생성되고 어느 실행 흐름이 상태를 소유하는지 먼저 정한다. 다른 구성 요소는 상태를 직접 고치지 않고 명시된 경계를 통해 요청한다.
- **마지막 Traffic**: 마지막 Traffic의 정상 처리 순서를 Diagram으로 확인한다. 중간 단계가 실패했을 때 이미 반영된 상태와 다시 수행해도 되는 작업을 구분한다.
- **Timeout**: Timeout에 적용할 최대 개수, Byte 또는 시간 한도를 정한다. 한도를 넘으면 대기, 거절, Drop 가운데 업무 의미에 맞는 정책을 사용한다.
- **Grace Period**: Grace Period 관련 Message에는 중복과 역순을 식별할 Sequence나 Version이 필요한지 판단한다. 오래된 작업이 새 Session 상태를 덮지 않게 한다.
- **TCP Keepalive**: TCP Keepalive가 느려질 때 상위 Queue와 호출자까지 지연이 전파되는 경로를 확인한다. Timeout과 Backpressure가 연쇄 Retry를 만들지 않게 한다.
- **Resume Token**: Resume Token의 평균 처리량만으로 용량을 결정하지 않는다. Peak 부하에서 p95·p99 지연, Memory와 Queue 깊이가 허용 범위인지 측정한다.
- **Session Generation**: Session Generation를 Client가 주장할 수 있다면 Server가 다시 계산하거나 검증할 항목을 정한다. 허용 오차와 반복 위반 처리 기준도 기록한다.
- **Event Sequence**: Event Sequence 변경은 이전 Client나 Server와 동시에 존재할 수 있다. Version 협상, 기본값과 단계적 배포로 전후 호환성을 확인한다.
- **Input Ack**: Input Ack 장애를 재현하는 Test를 만든다. Timeout, 연결 종료, 중복 Callback과 Process 재시작 뒤에도 자원과 상태가 한 번만 정리되는지 확인한다.
- **전체 Sync**: 전체 Sync 관련 Log에는 Match·Session·Sequence 같은 추적 Key를 남긴다. 민감 정보는 제외하고 원인 판별에 필요한 지표와 함께 조회한다.
- **Delta Sync**: Delta Sync 최적화는 실제 Profile 결과를 근거로 적용한다. CPU를 줄이는 대신 Memory, 복사 감소 대신 Lifetime 복잡도가 늘 수 있음을 비교한다.
- **Backoff**: Backoff의 Owner를 배포 중 교체할 때 새 요청 차단, 진행 작업 Drain과 상태 이전 순서를 정의한다. 구 Version Callback은 식별 후 폐기한다.
- **Jitter**: Jitter 결과가 영속 데이터나 외부 서비스에 반영되면 성공 응답의 기준을 정한다. 불확실한 결과는 조회와 Reconciliation으로 확정한다.
- **Reconnect 폭풍**: Reconnect 폭풍 기능을 독립 Service나 Thread로 분리할지는 확장과 장애 격리 이득으로 판단한다. Network·Queue 이동과 운영 비용도 함께 계산한다.
- **복구 지표**: 복구 지표 정책은 정상 사용자 경험과 악용 방지를 함께 고려한다. 너무 넓은 허용 범위와 지나치게 엄격한 오탐 사이를 실제 분포로 조정한다.

이 항목은 Heartbeat와 Reconnect 설계 Review에서 실제 요구와 실패 조건을 빠뜨리지 않기 위한 기준이다. 모든 장치를 일괄 적용하지 않고 측정된 위험과 운영 목표에 필요한 항목만 선택한다.
### 장애 시나리오 연습

Heartbeat와 Reconnect은 정상 경로만 구현해서는 운영 준비가 끝나지 않는다. 다음 상황을 부하·Network Simulator와 장애 주입 Test로 재현한다.

- **Heartbeat Sequence**: Heartbeat Sequence 요청이 정상 처리됐지만 응답만 손실된 상황을 가정한다. 호출자가 재시도해도 같은 상태 변경이 두 번 발생하지 않도록 Sequence, Version 또는 Idempotency Key를 둔다.
- **마지막 Traffic**: 마지막 Traffic 처리 시간이 평소의 열 배로 증가한 상황을 재현한다. 제한 Queue, Timeout과 Admission Control이 다른 Session과 Tick까지 지연을 퍼뜨리지 않는지 확인한다.
- **Timeout**: Timeout Owner가 배포나 장애로 사라진 상황을 Test한다. 새 Owner 선택, 진행 중 작업 처리와 구 Callback 폐기 순서가 명확해야 한다.
- **Grace Period**: Grace Period 입력이 최대 크기, 빈 값, 오래된 Timestamp와 잘못된 Enum을 포함하는 경우를 검증한다. 실패한 입력이 부분 상태를 남기거나 Process를 종료시키면 안 된다.
- **TCP Keepalive**: TCP Keepalive 관련 Message가 중복·역순·지연 도착하는 Network 조건을 주입한다. 최종 상태가 순서 정책과 허용 Window에 맞는지 Replay로 비교한다.
- **Resume Token**: Resume Token Capacity가 모두 사용된 Peak 상황에서 대기 시간을 무제한 늘리지 않는다. 업무 중요도에 따른 거절·Drop과 Client 재시도 안내가 함께 동작해야 한다.
- **Session Generation**: Session Generation 복구 뒤 상태가 맞는지 원본 Event, Snapshot 또는 DB와 대조한다. 자동 복구가 불가능한 차이는 경고와 수동 Reconciliation 대상으로 남긴다.

Heartbeat와 Reconnect에서는 각 Test는 성공 여부만 기록하지 않는다. 처리 시간 분포, Queue 최대치, Drop·Retry 수와 복구 소요 시간을 남겨 다음 배포의 기준값으로 사용한다.

## 4. 쉬운 예시

아래는 Heartbeat Sequence 추적과 Reconnect 시 Generation 교체 흐름이다.

```cpp
// Server 측 Heartbeat 타이머 관리
struct HeartbeatState {
    uint32_t expectedSeq = 0;
    TimePoint lastSeen;
    static constexpr int TIMEOUT_MS = 10000;   // 10초
};

void OnPing(Session& session, uint32_t seq) {
    session.heartbeat.lastSeen = Now();
    SendPong(session, seq);   // Echo Sequence로 RTT 측정 가능
}

void CheckHeartbeat(Session& session) {
    auto elapsed = Elapsed(session.heartbeat.lastSeen);
    if (elapsed > HeartbeatState::TIMEOUT_MS) {
        session.Close(CloseReason::HeartbeatTimeout);
        // Grace Period 타이머 시작 — Session은 아직 보관
    }
}

// Reconnect: Resume Token 검증 후 Generation 교체
bool HandleResume(NewConn& newConn, ResumeToken token) {
    auto session = SessionStore::Find(token.sessionId);
    if (!session) return false;                    // Session 없음(Grace 만료)
    if (!VerifyTokenSignature(token)) return false;
    if (token.IsExpired()) return false;

    // 새 Connection에 더 큰 Generation 부여
    session->generation++;
    session->connection = newConn;

    // 누락 이벤트 재전송 또는 Full Snapshot
    uint32_t clientLastSeq = token.lastReceivedEventSeq;
    if (EventLog::CanReplay(clientLastSeq))
        ReplayDelta(session, clientLastSeq);
    else
        SendFullSnapshot(session);

    return true;
}
```

- `session->generation++` 후 이전 Socket의 콜백이 도착하면 Generation이 달라 폐기된다.
- Grace Period(예: 30초) 동안 Session을 보관하다 만료되면 캐릭터를 제거한다.

## 5. 비슷한 개념과 비교

| 방식 | 감지 대상 | 계층 | 간격 조절 | Application 상태 확인 |
|------|---------|------|---------|---------------------|
| **TCP Keepalive** | 전송 경로 생존 | OS/TCP | 분 단위 고정 | 불가 |
| **Application Heartbeat (Ping/Pong)** | Application 응답성 | Application | 자유 조절 | 가능 |
| **HTTP Long Polling** | 데이터 수신 대기 | Application | 응답 시 갱신 | 제한적 |
| **WebSocket Ping/Pong** | 프레임 레벨 생존 | WebSocket | 자유 조절 | 제한적 |

TCP Keepalive는 OS 기본값(보통 2시간)이 Application 요구보다 너무 길기 때문에 별도 Application Heartbeat가 필요하다.

## 6. 장점과 단점

**장점**
- Heartbeat로 TCP 연결은 살아있지만 Application이 응답하지 않는 "Zombie Connection"을 감지한다.
- Grace Period로 모바일 Wi-Fi 전환 같은 일시 단절에서 자동 재접속을 지원한다.
- Session Generation으로 이전 Socket의 늦은 콜백이 새 Session에 영향을 주지 않는다.
- Exponential Backoff + Jitter로 서버 장애 복구 중 재접속 폭풍을 완화한다.

**단점**
- Heartbeat 간격을 짧게 하면 Battery·Packet 부하가 늘고 Jitter 오탐이 증가한다.
- Reconnect 상태 기계, Resume Token 서명 검증, 상태 재동기화가 구현 복잡도를 높인다.
- Grace Period 동안 Match 중 악의적 연결 끊기를 패배 회피로 악용할 수 있다.
- 상태 Replay Window가 만료되면 Full Snapshot을 전송해야 해서 부하가 발생한다.

## 7. 게임 서버·백엔드 실무 예시

실시간 Match는 Heartbeat 간격 3~5초, Timeout 10~15초로 설정한다. Lobby는 간격을 더 길게 잡는다. 게임 Packet이 자주 오면 별도 Ping을 생략하고 마지막 Packet 시각으로 생존을 판단한다.

Reconnect는 Exponential Backoff(1s, 2s, 4s, 최대 30s)에 Random Jitter(±30%)를 더해 서버 복구 중 폭풍을 완화한다. 서버는 `Retry-After` 헤더로 대기 시간을 안내한다.

## 8. 자주 하는 오해

- **Heartbeat에 응답이 없으면 즉시 연결을 끊어야 한다.** 일시적 Jitter나 단기 패킷 손실도 있으므로 단일 실패보다 연속 실패나 충분한 Grace Period로 판단한다.
- **최근 Traffic이 있으면 Heartbeat를 생략해도 된다.** 서버→클라이언트 단방향 Push(Broadcast)에서는 클라이언트→서버 방향 생존을 별도로 확인해야 한다.
- **TCP Keepalive를 켜면 Application Heartbeat가 필요 없다.** TCP Keepalive는 OS가 TCP 레벨 경로를 검사할 뿐 Application 응답성을 확인하지 않는다. 기본 간격도 2시간으로 게임 서버에 적합하지 않다.
- **Reconnect하면 이전 Message 전달 상태가 자동 복구된다.** 새 Socket은 이전 Socket의 전달 미완료 메시지를 알지 못한다. 마지막 Event Sequence를 교환해 누락 이벤트를 명시적으로 재전송해야 한다.
- **Grace Period 동안 모든 재연결을 허용해야 한다.** Token 만료·서명 검증 실패 시 거부해야 한다. 악의적 연결 끊기로 패배를 회피하는 정책도 함께 설계한다.
- **재접속 성공률만 추적하면 충분하다.** Grace Period 만료 이유(Token 만료·Session 없음·인증 실패)와 재동기화 Byte를 별도로 집계해야 병목을 찾을 수 있다.
- **모든 서버가 Heartbeat 간격을 동일하게 사용해야 한다.** 실시간 Match는 짧은 간격, Lobby는 긴 간격, 배경 Download는 매우 긴 간격으로 상황별로 달라야 한다.

## 9. 면접 질문

### Q1. Heartbeat Timeout 오탐으로 정상 플레이어가 반복 강제 종료되는 민원이 증가했습니다. 어떻게 진단하나요?
Timeout 발생 직전 RTT 히스토그램을 확인합니다. RTT p99가 현재 Timeout(예: 10초)의 80% 이상이면 Jitter가 큰 환경에서 정상 응답이 Timeout보다 늦게 도착하는 것입니다. Timeout을 15초로 늘리거나 단일 실패 대신 연속 3회 실패를 기준으로 변경합니다. 모바일 환경(Wi-Fi ↔ LTE 전환)에서는 Network 전환 지연이 3~5초에 달하므로 Grace Period를 포함한 충분한 유예를 둡니다. Timeout 발생 이유를 RTT 초과·연속 실패·NAT 만료로 분류해 집계합니다.

### Q2. 서버 재시작 후 5만 클라이언트가 1분 내에 동시 재접속해 인증 서버 CPU가 100%에 도달했습니다. Backoff 설계를 설명하세요.
Exponential Backoff(초기 1초, 최대 30초)에 Random Jitter(±50%)를 적용해 재시도 분산 범위를 늘립니다. 5만 클라이언트가 동시에 재시도하면 최대 15초 분산 효과가 생겨 초당 재시도 수를 1/15 수준으로 낮춥니다. 인증 서버가 과부하 시 `503 Retry-After: 30`을 응답해 클라이언트가 30초 후 재시도하도록 지시합니다. Match 복귀 요청을 Lobby 로그인보다 우선 처리해 진행 중인 게임의 영향을 최소화합니다. Rate Limit(초당 인증 요청 1,000건 상한)으로 인증 서버를 보호합니다.

### Q3. 재접속 후 이전 Session의 위치 이동 콜백이 새 Session에 적용돼 캐릭터가 순간이동하는 버그가 발생했습니다. 수정 방법을 설명하세요.
Reconnect 시 `session->generation++`로 Generation을 증가시키는 로직을 먼저 확인합니다. 이전 Socket에서 Work Queue에 이미 Enqueue된 콜백이 새 Generation을 확인하지 않고 실행되는 경우입니다. 모든 콜백 실행 전에 `if (callback_generation != session->generation) discard`를 추가합니다. Generation 증가와 새 Connection 바인딩이 원자적으로 일어나야 합니다. Session Lock 없이 단일 Owner Thread에서 Generation 교체를 처리하면 Race Condition을 방지할 수 있습니다.

### Q4. Match 중 특정 플레이어가 패배 직전 반복적으로 연결을 끊는 패턴이 탐지됐습니다. Grace Period를 유지하면서 악용을 방지하는 정책을 설명하세요.
플레이어별 Grace Period 사용 이력을 누적해 Match당 2회 이상 Timeout이 발생하면 재접속 Grace를 10초로 단축합니다. Grace Period가 만료되면 패배 처리하고 MMR 페널티를 부과합니다. 연속 3 Match에서 패배 직전 Timeout이 반복되면 24시간 이상의 연결 불안정 경고를 부과합니다. Grace Period 동안 캐릭터를 AI 제어로 유지하되 AI가 패배 회피 행동(예: 도주)을 하지 않도록 제한합니다.

### Q5. Resume Token 검증 실패가 갑자기 3배로 증가했습니다. 만료·서명 불일치·Session 없음 중 어느 것이 원인인지 어떻게 진단하나요?
Resume Token 검증 실패 이유를 이유별로 분류해 집계합니다. `token_expired` 비율이 높으면 Token 유효 기간(예: 5분)이 Grace Period(30초)보다 길더라도 서버 시계가 클라이언트와 크게 차이나는 경우입니다. `session_not_found` 비율이 높으면 Grace Period가 만료되기 전에 Session이 정리되는 경합 조건을 의심합니다. `signature_mismatch`가 높으면 Token 서명 키가 롤링 배포 중 일부 서버에서 교체됐을 가능성이 있습니다. 이유별 카운터를 Prometheus로 수집해 배포 직후 급증 패턴을 확인합니다.

### Q6. 서버 재시작 후 기존 Session을 어떻게 복원하나요?
Session 상태를 Redis나 DB에 영속화해 서버 재시작 후 Resume Token으로 조회합니다. 재시작 전에 Client가 마지막으로 확인한 Event Sequence를 저장하고, 재시작 후 Reconnect 시 누락 이벤트를 Event Log에서 Delta 재전송합니다. Event Log가 없거나 Window 밖이면 Full Snapshot을 전송합니다. 재화 지급·아이템 처리처럼 중요한 명령은 Idempotency Key와 함께 저장해 재시작 후 중복 실행을 방지합니다.

## 10. 예상 꼬리질문

- 게임 Packet이 초당 20개 이상 오는 환경에서 별도 Ping을 추가하면 어떤 부작용이 있고, 마지막 Packet 시각으로 생존을 판단할 때 서버→클라이언트 단방향 Push 상황에서는 어떤 문제가 생기나요?
- PC에서 로그인한 상태로 모바일에서 같은 Account로 Reconnect를 시도했습니다. 기존 PC 연결을 강제 종료하는 정책과 두 연결을 병존 허용하는 정책 중 FPS·MMORPG 각각에서 어떤 쪽이 적합한가요?
- Delta Sync를 위한 Event Log 보관 Window를 30초로 설정했는데 Grace Period가 60초라면 어떤 문제가 생기나요?
- Heartbeat Ping Sequence를 이용해 서버와 클라이언트 Clock Offset을 추정하는 방법을 설명하세요. NTP가 있는 환경에서는 이 추정이 필요한가요?
- Grace Period 30초를 모두 소진했는데 재접속이 5초 만에 이루어졌다면, 캐릭터가 이미 Match에서 제거된 상황을 클라이언트에게 어떻게 안내하나요?
- Resume Token에 `jti`(JWT ID) 필드를 추가해 Replay 방지를 구현했는데 Redis에서 `jti`를 저장·조회하는 비용이 Reconnect 처리량을 제한하고 있습니다. 어떻게 최적화하나요?
- Reconnect 성공률이 특정 통신사 사용자에서만 60%로 낮습니다. 원인을 어떻게 진단하고 Grace Period나 Token TTL 조정 외에 어떤 대안을 검토하나요?

## 11. 30초 모범답변

> TCP 연결이 살아 있어도 Application이 멈추거나 NAT Mapping이 만료되면 실제 통신이 불가능합니다. Application Heartbeat로 응답성을 주기적으로 확인하고 Grace Period 동안 Session을 보관합니다. Reconnect 시 Resume Token 검증 후 Session Generation을 증가시켜 이전 콜백을 폐기하고 누락 이벤트를 재동기화합니다.

## 12. 1~2분 확장답변

> TCP Keepalive는 OS 레벨 경로 점검으로 기본 간격이 2시간이라 게임 서버에 부적합합니다. Application Heartbeat는 응답성을 직접 확인하며 간격을 자유롭게 조절합니다. 실시간 Match는 간격 3~5초, Timeout 10~15초로 설정합니다.
>
> Reconnect는 새 Socket을 이전 논리 Session에 안전하게 결합하는 절차입니다. Resume Token 서명·만료를 검증하고 Session Generation을 증가시켜 이전 Socket의 늦은 콜백을 폐기합니다. 마지막 Event Sequence를 교환해 Delta 재전송 또는 Full Snapshot으로 상태를 복원합니다.
>
> 서버 장애 후 수만 클라이언트가 동시에 재접속하는 폭풍을 막기 위해 Exponential Backoff + Jitter를 사용합니다. Heartbeat RTT·Reconnect 성공률·재동기화 Byte·Grace Period 만료 이유를 지표로 수집합니다.

## 13. 핵심 요약

- TCP Keepalive는 경로 점검만 하고 간격이 기본 2시간이라 Application Heartbeat가 별도로 필요하다.
- Heartbeat 간격은 RTT·Jitter 기반으로, Timeout은 연속 실패 기준으로 설정한다.
- Grace Period 동안 Session을 보관해 일시 단절 후 재접속을 지원한다.
- Reconnect는 Resume Token 검증 → Session Generation 증가 → Delta/Full Sync 세 단계다.
- Session Generation으로 이전 Socket의 늦은 콜백을 폐기한다.
- Exponential Backoff + Jitter로 재접속 폭풍을 완화하고 서버가 Retry-After를 제공한다.
- Match 중 연결 끊김 시 Grace Period 동안 캐릭터를 AI/정지로 유지하고 재접속을 기다린다.
- Heartbeat RTT·Reconnect 성공률·재동기화 Byte를 지표로 수집한다.

## 한 줄 정리

> Application Heartbeat로 Zombie Connection을 감지하고, Grace Period 동안 Session을 보관하며, Reconnect 시 Resume Token 검증 후 Session Generation을 증가시켜 이전 콜백을 폐기하고 누락 이벤트를 재동기화한다.
