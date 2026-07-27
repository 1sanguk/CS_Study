---
difficulty: 4
reading_time: 25분
interview_frequency: 5
importance: 5
---

# 12. Heartbeat와 Reconnect

> 게임 서버·백엔드 개발자를 위한 CS 면접 교재

## 학습 목표

- Heartbeat가 왜 필요하고 TCP Keepalive와 차이를 설명할 수 있다.
- Heartbeat 간격·Timeout 설정 기준과 Reconnect 상태 기계를 단계별로 설명할 수 있다.
- Resume Token 검증 항목과 Session Generation으로 오래된 콜백을 폐기하는 방법을 설명할 수 있다.
- 재접속 폭풍(Thundering Herd)을 Exponential Backoff + Jitter로 완화하는 방법을 설명할 수 있다.

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

### Q1. Heartbeat가 왜 필요하고 TCP Keepalive와의 차이는 무엇인가요?
TCP 연결 객체가 살아 있어도 Wi-Fi 전환이나 NAT Mapping 만료로 실제 통신이 불가능한 상태가 될 수 있습니다. TCP Keepalive는 OS가 수행하는 전송 경로 점검이고 기본 간격이 2시간으로 게임 서버에 너무 깁니다. Application Heartbeat는 Application 응답성을 직접 확인하며 간격을 자유롭게 조절합니다.

### Q2. Heartbeat 간격과 Timeout을 어떻게 설정하나요?
RTT와 Jitter를 측정해 정합니다. 간격이 짧으면 Battery·부하가 늘고 Jitter를 장애로 오탐합니다. Timeout은 단일 응답 실패가 아닌 연속 실패나 충분한 Grace Period로 판단합니다. 실시간 Match는 간격 3~5초·Timeout 10~15초, Lobby는 더 길게 설정합니다.

### Q3. Reconnect 상태 기계를 단계별로 설명해 주세요.
Disconnected → Exponential Backoff(Jitter 포함) → 새 Connection 수립 → Resume Token 인증 → Session Generation 교체 → 누락 이벤트 Delta 재전송 또는 Full Snapshot → Active 순서입니다. 이전 Socket의 늦은 콜백은 Generation이 달라 자동 폐기됩니다.

### Q4. Resume Token 검증에서 어떤 항목을 확인하나요?
Session ID로 기존 Session을 조회하고, Token 서명·만료 시간·Audience를 검증합니다. 이미 사용된 Token인지(Replay 방지)도 확인합니다. 검증 성공 시 Session Generation을 증가시키고 새 Connection을 연결합니다.

### Q5. 재접속 폭풍(Thundering Herd)을 어떻게 방지하나요?
Exponential Backoff(1s, 2s, 4s...)에 Random Jitter(±30%)를 추가해 수만 클라이언트가 동시에 재시도하지 않도록 분산합니다. 서버는 `Retry-After` 응답으로 대기 시간을 안내합니다. 인증·State Sync 경로에도 Rate Limit과 Capacity 제한을 둡니다.

### Q6. Match 중 연결이 끊겼을 때 캐릭터를 어떻게 처리하나요?
Grace Period(예: 30초) 동안 캐릭터를 AI 제어나 정지 상태로 유지합니다. Grace 내 재접속 시 상태를 복원합니다. Grace 만료 시 캐릭터를 제거하고 Match 결과를 처리합니다. 악의적 연결 끊기로 패배를 회피하지 못하도록 패배 판정 정책과 함께 설계합니다.

## 10. 예상 꼬리질문

- 게임 Packet이 자주 오는데도 별도 Ping을 보내야 하나요?
- Token 만료 후 Reconnect를 어떻게 처리하나요?
- Server Restart 후 기존 Session을 어떻게 복원하나요?
- Grace Period 도중 악의적 연결 끊기를 어떻게 탐지하나요?
- Delta Sync와 Full Snapshot 중 어느 쪽을 선택하는 기준은 무엇인가요?
- 같은 Account의 두 연결이 동시에 Resume을 시도하면 어떻게 처리하나요?
- Heartbeat RTT를 이용해 Clock Offset을 추정하는 방법은 무엇인가요?

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
