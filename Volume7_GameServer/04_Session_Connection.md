---
difficulty: 3
reading_time: 25분
interview_frequency: 5
importance: 5
---

# 04. Session과 Connection

> 게임 서버·백엔드 개발자를 위한 CS 면접 교재

## 학습 목표

- Connection과 Session의 수명 분리 원칙과 필요성을 설명할 수 있다.
- Grace Period를 이용한 재접속 허용 설계를 설명할 수 있다.
- Generation Counter로 오래된 Connection 콜백을 폐기하는 방법을 설명할 수 있다.
- 중복 로그인 처리와 Session 인수인계 설계를 설명할 수 있다.

## 1. 개요
Connection은 Socket 기반 전송 경로이고 Session은 인증 사용자, Protocol 상태와 재접속 정보를 담는 응용 계층 대화 상태다.

## 2. 왜 필요한가
네트워크 단절과 사용자 상태 수명을 분리해 인증, 중복 로그인과 재접속을 안전하게 처리한다. 게임 서버는 정확성뿐 아니라 제한 시간 안의 처리와 장애 후 복구를 함께 제공해야 한다.

## 3. 핵심 동작 원리
```text
TCP connect→protocol handshake→authenticate→session bind→disconnect→grace period/reconnect
```
한 Session이 새 Connection에 재결합될 수 있고 Connection 하나가 인증 전 상태일 수 있다. Session Token, generation과 소유권 전환으로 오래된 연결 이벤트를 거부한다.

상태의 최종 소유자, Message 순서, Timeout과 실패 후 재처리 기준을 명시한다.

### Connection과 Session 구분

Connection은 TCP Socket 같은 Transport 연결이고 Session은 인증된 Player의 논리적 통신 상태다. Reconnect 시 새 Connection이 기존 Session을 이어받을 수 있고, 한 Account의 중복 Login 정책에 따라 Session을 교체할 수 있다.

```text
Socket Connection
   ↓ Handshake·Authentication
Logical Session
   ↓ Enter Lobby·Game
```

Socket이 연결되었다고 인증된 것은 아니다. 인증 전 Connection은 더 작은 Buffer·Timeout·Rate Limit을 적용해 Resource 공격을 줄인다.

### State Machine

```text
Accepted
  → Handshaking
  → Authenticating
  → Active
  → Closing
  → Closed
```

각 State에서 허용 Packet과 Timeout을 정한다. Active 이전 Game Command는 거부하고 Closing 이후 새 Send를 막는다. 여러 Thread가 State를 바꾸지 않게 Owner를 정하거나 원자 전이를 사용한다.

### 식별자

Socket Handle 재사용과 Pointer 주소를 Session ID로 사용하지 않는다. 추측하기 어려운 Connection ID와 인증된 Account·Character ID를 구분한다. Log에는 개인정보를 최소화하고 Correlation ID를 사용한다.

Session Registry가 ID→Session을 소유할 수 있다. 제거와 Lookup이 동시에 일어나면 수명 Race가 생기므로 Shard Owner Thread, Lock 또는 Safe Reference 전략이 필요하다.

### 인증과 재인증

Client가 Login Service에서 받은 짧은 수명의 Ticket을 Game Server에 제시할 수 있다. Server는 Signature, Audience, Expiry, Nonce·재사용 여부를 검증한다. Client가 보낸 Account ID만 신뢰하지 않는다.

Key Rotation과 Clock Skew를 고려하고 Ticket을 Log에 그대로 남기지 않는다. 인증 성공 후 Session에 권한과 Player ID를 Bind한다.

### Send Queue와 Backpressure

비동기 Send 중 다음 Packet은 Queue에 쌓일 수 있다. 느린 Client가 소비하지 못하면 Queue가 무제한 증가한다.

```text
Game Events → Session Send Queue → Socket
                  full
        Drop low priority / coalesce / disconnect
```

Position Snapshot은 최신 값으로 Coalesce할 수 있지만 결제 결과·중요 Event는 Drop하면 안 된다. Queue Byte 상한, Packet 수와 고수위 지속 시간을 기준으로 정책을 둔다.

### Receive Buffer와 Parsing

TCP는 Stream이므로 한 Receive에 Packet 하나가 온다는 보장이 없다. Session별 Accumulation Buffer에서 Frame을 반복 추출한다. 선언 Length 상한과 인증 전 Memory Budget을 검증한다.

Parser가 Packet Body Span을 비동기 Handler에 저장하면 Buffer 재사용 후 데이터가 바뀔 수 있다. 필요한 데이터는 소유 Copy·Typed Message로 넘긴다.

### 종료 경쟁

Read 실패, Write 실패, Timeout과 관리자 Kick이 동시에 종료를 요청할 수 있다. Close를 Idempotent하게 만들어 한 번만 최종 정리한다.

```text
Any error → TryTransition(Active→Closing)
Winner: Socket cancel·Registry remove·final notification
Others: already closing, return
```

Outstanding I/O Completion은 Close 후에도 도착할 수 있다. Completion이 Session Memory를 안전하게 참조하고 마지막 I/O 후 파괴되게 한다.

### Half-close와 TCP 상태

Peer가 Send를 종료해 Receive가 0을 반환해도 Local Send 방향의 의미는 Protocol에 따라 다르다. 일반 Game Protocol은 연결 전체를 닫을 수 있지만 Transport 상태를 이해한다. `CLOSE_WAIT` 누적은 Application이 Close하지 않은 신호일 수 있다.

### 중복 Login과 Reconnect

새 Connection이 같은 Account로 인증되면 기존 Session을 Kick, 새 연결 거부, 기기별 허용 중 정책을 정한다. 두 Session이 동시에 Inventory를 수정하지 않도록 Account Lease·Version을 사용할 수 있다.

Reconnect Grace 동안 Character를 World에 남길지, AI로 전환할지, 즉시 제거할지 게임 규칙을 정한다. 새 Connection은 Session Resume Token과 마지막 처리 Sequence를 검증한다.

### 관찰

State별 Connection 수, 인증 실패·Timeout, Connect Rate, Session 수명, Send Queue Byte, Slow Consumer, Close 이유와 Outstanding I/O를 측정한다. Error Log만으로 정상 Network 단절과 Server Bug를 구분하기 어렵다.

### 실무 설계 검토 체크리스트

- **Connection 수명**: Connection 수명의 입력이 어디서 생성되고 어느 실행 흐름이 상태를 소유하는지 먼저 정한다. 다른 구성 요소는 상태를 직접 고치지 않고 명시된 경계를 통해 요청한다.
- **Session 수명**: Session 수명의 정상 처리 순서를 Diagram으로 확인한다. 중간 단계가 실패했을 때 이미 반영된 상태와 다시 수행해도 되는 작업을 구분한다.
- **인증 상태**: 인증 상태에 적용할 최대 개수, Byte 또는 시간 한도를 정한다. 한도를 넘으면 대기, 거절, Drop 가운데 업무 의미에 맞는 정책을 사용한다.
- **Session ID**: Session ID 관련 Message에는 중복과 역순을 식별할 Sequence나 Version이 필요한지 판단한다. 오래된 작업이 새 Session 상태를 덮지 않게 한다.
- **Generation**: Generation가 느려질 때 상위 Queue와 호출자까지 지연이 전파되는 경로를 확인한다. Timeout과 Backpressure가 연쇄 Retry를 만들지 않게 한다.
- **Receive Buffer**: Receive Buffer의 평균 처리량만으로 용량을 결정하지 않는다. Peak 부하에서 p95·p99 지연, Memory와 Queue 깊이가 허용 범위인지 측정한다.
- **Send Queue**: Send Queue를 Client가 주장할 수 있다면 Server가 다시 계산하거나 검증할 항목을 정한다. 허용 오차와 반복 위반 처리 기준도 기록한다.
- **Backpressure**: Backpressure 변경은 이전 Client나 Server와 동시에 존재할 수 있다. Version 협상, 기본값과 단계적 배포로 전후 호환성을 확인한다.
- **Half Close**: Half Close 장애를 재현하는 Test를 만든다. Timeout, 연결 종료, 중복 Callback과 Process 재시작 뒤에도 자원과 상태가 한 번만 정리되는지 확인한다.
- **동시 Close**: 동시 Close 관련 Log에는 Match·Session·Sequence 같은 추적 Key를 남긴다. 민감 정보는 제외하고 원인 판별에 필요한 지표와 함께 조회한다.
- **Reconnect**: Reconnect 최적화는 실제 Profile 결과를 근거로 적용한다. CPU를 줄이는 대신 Memory, 복사 감소 대신 Lifetime 복잡도가 늘 수 있음을 비교한다.
- **중복 Login**: 중복 Login의 Owner를 배포 중 교체할 때 새 요청 차단, 진행 작업 Drain과 상태 이전 순서를 정의한다. 구 Version Callback은 식별 후 폐기한다.
- **Timeout**: Timeout 결과가 영속 데이터나 외부 서비스에 반영되면 성공 응답의 기준을 정한다. 불확실한 결과는 조회와 Reconciliation으로 확정한다.
- **Resource 정리**: Resource 정리 기능을 독립 Service나 Thread로 분리할지는 확장과 장애 격리 이득으로 판단한다. Network·Queue 이동과 운영 비용도 함께 계산한다.
- **감사 Log**: 감사 Log 정책은 정상 사용자 경험과 악용 방지를 함께 고려한다. 너무 넓은 허용 범위와 지나치게 엄격한 오탐 사이를 실제 분포로 조정한다.

이 항목은 Session과 Connection 설계 Review에서 실제 요구와 실패 조건을 빠뜨리지 않기 위한 기준이다. 모든 장치를 일괄 적용하지 않고 측정된 위험과 운영 목표에 필요한 항목만 선택한다.
### 장애 시나리오 연습

Session과 Connection은 정상 경로만 구현해서는 운영 준비가 끝나지 않는다. 다음 상황을 부하·Network Simulator와 장애 주입 Test로 재현한다.

- **Connection 수명**: Connection 수명 요청이 정상 처리됐지만 응답만 손실된 상황을 가정한다. 호출자가 재시도해도 같은 상태 변경이 두 번 발생하지 않도록 Sequence, Version 또는 Idempotency Key를 둔다.
- **Session 수명**: Session 수명 처리 시간이 평소의 열 배로 증가한 상황을 재현한다. 제한 Queue, Timeout과 Admission Control이 다른 Session과 Tick까지 지연을 퍼뜨리지 않는지 확인한다.
- **인증 상태**: 인증 상태 Owner가 배포나 장애로 사라진 상황을 Test한다. 새 Owner 선택, 진행 중 작업 처리와 구 Callback 폐기 순서가 명확해야 한다.
- **Session ID**: Session ID 입력이 최대 크기, 빈 값, 오래된 Timestamp와 잘못된 Enum을 포함하는 경우를 검증한다. 실패한 입력이 부분 상태를 남기거나 Process를 종료시키면 안 된다.
- **Generation**: Generation 관련 Message가 중복·역순·지연 도착하는 Network 조건을 주입한다. 최종 상태가 순서 정책과 허용 Window에 맞는지 Replay로 비교한다.
- **Receive Buffer**: Receive Buffer Capacity가 모두 사용된 Peak 상황에서 대기 시간을 무제한 늘리지 않는다. 업무 중요도에 따른 거절·Drop과 Client 재시도 안내가 함께 동작해야 한다.
- **Send Queue**: Send Queue 복구 뒤 상태가 맞는지 원본 Event, Snapshot 또는 DB와 대조한다. 자동 복구가 불가능한 차이는 경고와 수동 Reconciliation 대상으로 남긴다.

Session과 Connection에서는 각 Test는 성공 여부만 기록하지 않는다. 처리 시간 분포, Queue 최대치, Drop·Retry 수와 복구 소요 시간을 남겨 다음 배포의 기준값으로 사용한다.

## 4. 쉬운 예시
모바일 Player의 Wi-Fi가 끊겨 새 Socket으로 연결돼도 인증된 Session은 짧은 유예 시간 동안 유지할 수 있다. Resume Token과 Generation을 검증한 뒤 새 Connection을 연결하고 이전 Callback은 폐기한다.

## 5. 비슷한 개념과 비교
Connection은 전송 경로라 자주 바뀔 수 있고 Session은 인증·게임 상태를 이어 간다. 둘을 합치면 재접속은 단순하지만 중복 연결과 상태 복구가 어려워진다.
## 6. 장점과 단점
Session과 Connection을 올바르게 적용하면 상태와 처리 책임이 명확해지고 Peak 부하와 장애에 대한 예측 가능성이 높아진다. 반면 Connection 수명, Session 수명와 인증 상태 정책을 잘못 정하면 지연, 상태 불일치 또는 운영 복잡도가 늘어난다. 실제 요구와 측정 결과를 기준으로 필요한 범위만 적용한다.
## 7. 게임 서버·백엔드 실무 예시
모바일 전환으로 연결이 끊겨도 캐릭터를 즉시 삭제하지 않고 유예 시간 동안 보관한다. 새 연결 인증 후 generation을 올려 이전 Socket의 늦은 Packet을 폐기한다.

Session과 Connection 관점에서는 운영에서는 연결 수, Packet Rate, Queue 길이, Tick p99, Drop·Retry, Memory와 Thread 고갈을 같은 시간축에서 본다.

## 8. 자주 하는 오해
- TCP Connection이 살아 있으면 Session도 유효하다고 생각한다. 연결과 게임 Session의 수명 주기는 독립적으로 관리해야 하며 연결이 끊겨도 Session을 일정 시간 유지할 수 있다.
- Session이 끊기면 즉시 정리해야 한다고 생각한다. Grace Period 동안 재연결을 허용하는 설계로 일시적 네트워크 불안정에 대응할 수 있다.
- 인증 상태를 한 번 확인하면 세션 내내 신뢰할 수 있다고 생각한다. Token 만료, Revoke, 권한 변경을 주기적으로 확인해야 한다.
- Session ID만 있으면 플레이어를 신뢰할 수 있다고 생각한다. Session ID 도용 방지를 위해 IP 검증, 재발급 등 추가 방어가 필요하다.
- Generation 카운터가 있으면 오래된 Handle 문제가 완전히 없어진다고 생각한다. Generation은 재사용 충돌을 줄이지만 올바른 폐기 순서와 재사용 정책도 함께 설계해야 한다.
## 9. 면접 질문

### Q1. Connection과 Session의 차이를 설명해 주세요.
Connection은 Socket 기반 전송 경로로 수시로 바뀔 수 있습니다. Session은 인증된 사용자, Protocol 상태, 재접속 정보를 담는 응용 계층 대화 상태입니다. 둘의 수명을 분리하면 Connection이 끊겨도 Session을 유지해 재접속을 지원할 수 있습니다.

### Q2. 모바일 환경의 재접속을 어떻게 지원하나요?
Connection이 끊겨도 Session을 Grace Period(예: 30초) 동안 보관합니다. 새 Connection에서 인증 후 Resume Token을 검증해 기존 Session에 연결합니다. Generation을 증가시켜 이전 Connection의 늦은 콜백을 폐기합니다.

### Q3. Generation Counter는 어떤 문제를 해결하나요?
Connection 교체 후 이전 Socket의 비동기 콜백이 늦게 도착해 새 Session 상태를 덮어쓰는 문제를 방지합니다. 콜백이 도착하면 현재 Generation과 비교해 오래된 것을 폐기합니다.

### Q4. 중복 로그인을 어떻게 처리하나요?
새 Connection 인증 시 기존 Session을 확인합니다. 정책에 따라 기존을 만료하고 새 Connection을 붙이거나, 기존이 유지되면 새 연결을 거부합니다. 두 Session이 같은 캐릭터를 동시에 제어하면 안 됩니다.

### Q5. Session 생성·유지·종료 각 단계에서 무엇을 확인하나요?
생성 시 인증 Token 검증·중복 확인, 유지 중 Token 만료·Revoke 주기 확인, 종료 시 Outstanding I/O 완료 대기·캐릭터 상태 저장·Grace Period 타이머 설정이 필요합니다.

### Q6. Session 리소스 한도 초과 시 어떻게 처리하나요?
최대 Session 수에 도달하면 신규 연결을 거부하고 클라이언트에 재시도 안내를 보냅니다. 기존 Session 중 Grace Period 만료된 것을 우선 정리합니다. Session 수·Memory·연결 수를 함께 모니터링합니다.

## 10. 예상 꼬리질문

- Session과 Connection을 같은 객체로 관리하면 어떤 문제가 생기나요?
- Token 기반 인증과 Session 기반 인증의 차이는 무엇인가요?
- Session Affinity(Sticky Session)가 필요한 상황은 언제인가요?
- Session을 분산 서버에 공유할 때 어떤 문제가 있나요?
- Heartbeat와 Grace Period는 어떻게 연동하나요?
- 동시 접속 피크에서 Session 생성 병목을 어떻게 완화하나요?
- 배포 중 기존 Session을 Drain하는 절차는 어떻게 설계하나요?

## 11. 30초 모범답변

> Connection은 네트워크 경로이고 Session은 인증된 논리 상태입니다. 둘의 수명을 분리하면 모바일 Wi-Fi 전환처럼 Connection이 끊겨도 Session을 Grace Period 동안 유지해 재접속을 지원할 수 있습니다. 새 연결 인증 후 Generation을 올려 이전 Connection의 늦은 콜백을 폐기합니다.

## 12. 1~2분 확장답변

> Connection은 Socket 기반 전송 경로이고 Session은 인증·게임 상태를 담는 응용 계층 상태입니다. Connection이 끊겨도 Session을 Grace Period 동안 보관하면 재접속이 가능합니다. 새 Connection에서 Resume Token 검증 후 Generation을 증가시켜 이전 콜백을 폐기합니다.
>
> 중복 로그인은 기존 Session 만료 후 교체하거나 새 연결 거부로 처리하며, 두 Session이 같은 캐릭터를 동시에 제어하면 안 됩니다. Token 만료·Revoke를 주기적으로 확인해 인증 상태를 유효하게 유지합니다.
>
> Session 수·Memory·연결 수를 함께 모니터링하고, 최대 Session 한도 도달 시 Grace Period 만료 세션을 우선 정리합니다. 배포 중에는 기존 Session을 Drain하고 신규 Session 생성을 막은 뒤 배포합니다.

## 13. 핵심 요약

- Connection은 Socket 전송 경로, Session은 인증·게임 상태를 담는 응용 계층 대화 상태다.
- 수명 분리로 Connection 단절 후 Grace Period 동안 Session을 유지해 재접속을 지원한다.
- Resume Token과 Generation Counter로 재접속 인증과 오래된 콜백 폐기를 처리한다.
- 중복 로그인은 기존 만료 또는 새 연결 거부로 처리하며 두 Session이 같은 캐릭터를 제어하면 안 된다.
- Token 만료·Revoke를 주기적으로 확인해 인증 상태를 유지한다.
- Session 수·Memory·연결 수를 모니터링하고 한도 초과 시 만료 Session을 정리한다.
- 배포 중 Drain 절차로 기존 Session 완료 후 새 버전으로 전환한다.

## 한 줄 정리

> Connection은 네트워크 경로이고 Session은 인증된 논리 상태이며, 수명 분리와 Generation Counter·Grace Period로 재접속·중복 로그인·오래된 콜백을 안전하게 처리한다.
