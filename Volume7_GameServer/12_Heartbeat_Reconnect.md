---
difficulty: 4
reading_time: 25분
interview_frequency: 5
importance: 5
---

# 12. Heartbeat와 Reconnect

> 게임 서버·백엔드 개발자를 위한 CS 면접 교재

## 학습 목표
- 핵심 원리와 등장 이유를 설명할 수 있다.
- 정확성·지연·운영 Trade-off를 설명할 수 있다.
- 게임 서버 설계와 장애 대응에 적용할 수 있다.

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
마지막 게임 Packet 이후 Heartbeat 응답도 기한을 넘기면 Server는 연결을 종료한다. Client는 Jitter가 포함된 Backoff로 재시도하고 마지막 Event Sequence를 보내 누락 상태만 동기화한다.

## 5. 비슷한 개념과 비교
TCP Keepalive는 전송 경로 생존을 돕고 Application Heartbeat는 서비스 응답성을 판단한다. Reconnect는 새 연결과 이전 Session 상태를 별도로 복구해야 한다.
## 6. 장점과 단점
Heartbeat와 Reconnect을 올바르게 적용하면 상태와 처리 책임이 명확해지고 Peak 부하와 장애에 대한 예측 가능성이 높아진다. 반면 Heartbeat Sequence, 마지막 Traffic와 Timeout 정책을 잘못 정하면 지연, 상태 불일치 또는 운영 복잡도가 늘어난다. 실제 요구와 측정 결과를 기준으로 필요한 범위만 적용한다.
## 7. 게임 서버·백엔드 실무 예시
지수 Backoff와 Jitter로 동시 재접속 폭주를 막는다. Session Token, 마지막 Event ID와 generation으로 중복 Connection과 누락 상태를 처리한다.

Heartbeat와 Reconnect 관점에서는 평균보다 p95·p99, 지역·Network별 분포, Queue·Buffer 상한, Drop·Retry와 복구 성공률을 관찰한다.

## 8. 자주 하는 오해
- **Heartbeat Sequence**을 도입하면 관련 문제가 자동으로 모두 해결된다고 생각한다.
- **마지막 Traffic**을 도입하면 관련 문제가 자동으로 모두 해결된다고 생각한다.
- **Timeout**을 도입하면 관련 문제가 자동으로 모두 해결된다고 생각한다.
- **Grace Period**을 도입하면 관련 문제가 자동으로 모두 해결된다고 생각한다.
- **TCP Keepalive**을 도입하면 관련 문제가 자동으로 모두 해결된다고 생각한다.
## 9. 면접 질문
### Q1. 핵심 개념을 설명해 주세요.
Heartbeat는 주기적 Message와 응답 기한으로 연결 생존을 판단하고 Reconnect는 새 연결을 기존 논리 Session에 안전하게 결합하는 절차다.
### Q2. 어떤 Trade-off가 있나요?
Heartbeat 간격이 짧으면 부하와 오탐이 늘고 길면 감지가 늦다. Reconnect는 새 Socket일 뿐 이전 Message 전달 상태를 자동 복구하지 않는다.
### Q3. 실무 적용 사례는 무엇인가요?
지수 Backoff와 Jitter로 동시 재접속 폭주를 막는다. Session Token, 마지막 Event ID와 generation으로 중복 Connection과 누락 상태를 처리한다.
### Q4. 장애와 악용을 어떻게 제한하나요?
Heartbeat와 Reconnect 관점에서는 서버 검증, 시간·크기 상한, Version과 Idempotency, Backpressure와 지표를 적용한다.

## 10. 예상 꼬리질문
- Heartbeat Sequence의 최종 소유자는 어디에 두나요?
- 마지막 Traffic 처리에서 중복과 역순은 어떻게 구분하나요?
- Timeout의 상한을 넘으면 어떤 요청부터 제한하나요?
- Grace Period 장애를 어떻게 재현하고 복구를 검증하나요?
- TCP Keepalive 관련 p99가 증가하면 어떤 지표를 함께 보나요?
## 11. 30초 모범답변
> Heartbeat는 응답 기한으로 논리적 생존을 확인하고 Reconnect는 인증된 새 연결을 기존 Session에 재결합합니다. Backoff, Generation과 상태 재동기화가 필요합니다. 지수 Backoff와 Jitter로 동시 재접속 폭주를 막는다.

## 12. 1~2분 확장답변
> Heartbeat는 응답 기한으로 논리적 생존을 확인하고 Reconnect는 인증된 새 연결을 기존 Session에 재결합합니다. Backoff, Generation과 상태 재동기화가 필요합니다. 설계에서는 서버가 최종 상태를 소유하고 Client 입력, Sequence와 시간을 검증합니다. 지연은 Prediction·Interpolation과 제한된 Rewind로 보정합니다. Queue, Pool과 Cache에는 상한을 두고 재접속·배포·중복 처리까지 정상 흐름으로 설계합니다.

## 13. 핵심 요약
- Heartbeat는 주기적 Message와 응답 기한으로 연결 생존을 판단하고 Reconnect는 새 연결을 기존 논리 Session에 안전하게 결합하는 절차다.
- 서버 권위와 입력 검증을 유지한다.
- Version·Sequence로 중복과 순서를 관리한다.
- 성능 구조에는 크기와 시간 상한이 필요하다.
- 복구와 p99를 운영 기준으로 둔다.

## 한 줄 정리
> Heartbeat는 응답 기한으로 논리적 생존을 확인하고 Reconnect는 인증된 새 연결을 기존 Session에 재결합합니다. Backoff, Generation과 상태 재동기화가 필요합니다.
