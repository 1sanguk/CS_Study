---
difficulty: 3
reading_time: 25분
interview_frequency: 5
importance: 5
---

# 01. Game Server Architecture

> 게임 서버·백엔드 개발자를 위한 CS 면접 교재

## 학습 목표
- 핵심 정의와 등장 이유를 설명할 수 있다.
- 데이터·상태 흐름과 Trade-off를 설명할 수 있다.
- 게임 서버 운영과 장애 대응에 적용할 수 있다.

## 1. 개요
게임 서버 아키텍처는 Gateway, Login, Matchmaking, Game, Chat, Persistence 같은 책임과 통신·상태 경계를 배치하는 구조다.

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

실시간 전투 중 HP·Position은 Game Instance가 Authority이고 DB는 매 Tick 진실의 원천으로 사용하지 않는다. Match 종료 결과는 한 번만 확정해 Persistence Service로 전달한다.

강한 일관성이 필요한 결제·재화와 지연 허용 가능한 Ranking·통계는 다른 전략을 쓴다. Cache는 조회를 빠르게 하지만 무효화와 Stale 허용 범위를 명시한다.

### 확장 단위

- Connection 수: Gateway·I/O 확장
- Room·Match 수: Instance 수평 확장
- 한 World의 Player 수: Zone·Cell Partition과 Interest Management
- DB Write: Batch·Partition·Shard
- Chat Fan-out: Channel Partition·Pub/Sub

무엇이 병목인지 모른 채 Server 수만 늘리면 Shared DB나 Hot Key가 새 병목이 된다. CPU, Network, Tick, Queue, DB Connection과 p99를 함께 본다.

### 장애와 배포

Service Discovery와 Health Check는 Process가 살아 있다는 것과 새 Traffic을 받을 준비가 됐다는 것을 구분한다. Readiness 실패 시 Routing에서 제외하고 기존 Session은 Drain한다.

Game Match 중 Binary를 즉시 교체하기 어렵다면 새 Match만 새 Version에 배치하고 기존 Match가 끝날 때까지 두 Version을 운영한다. Protocol·Data Schema의 전후 호환성이 필요하다.

### 관찰 가능성

Correlation ID로 Login→Matchmaking→Game→Persistence 흐름을 추적한다. Metrics는 Connection, CCU, Room 수, Tick p99, Queue Depth, Packet Drop, DB Latency와 Error Rate를 포함한다. Log만으로 고빈도 Server를 운영하면 비용과 검색 지연이 커져 Metrics·Trace를 조합한다.

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

## 4. 쉬운 예시
초기 협동 게임은 Login과 Lobby를 한 서비스로 두고 Match Room만 상태 서버로 분리할 수 있다. CCU가 늘어 Chat Fan-out이 병목이 되면 그때 Chat을 별도 확장한다. 분리 기준은 유행하는 구조가 아니라 독립적인 부하와 장애 경계다.

## 5. 비슷한 개념과 비교
단순 Monolith는 호출과 Transaction이 명확하지만 독립 확장에 한계가 있다. 역할 분리는 장애 격리와 배포 자유도를 높이는 대신 Network 실패와 데이터 정합성 비용을 추가한다.
## 6. 장점과 단점
Game Server Architecture을 올바르게 적용하면 상태와 처리 책임이 명확해지고 Peak 부하와 장애에 대한 예측 가능성이 높아진다. 반면 Authority 경계, Stateful 배치와 Gateway 용량 정책을 잘못 정하면 지연, 상태 불일치 또는 운영 복잡도가 늘어난다. 실제 요구와 측정 결과를 기준으로 필요한 범위만 적용한다.
## 7. 게임 서버·백엔드 실무 예시
로그인 API는 무상태로 수평 확장하고 Game Room은 특정 프로세스가 권위 상태를 소유한다. 서버 Directory와 Drain 절차로 배포 중 새 매치를 막는다.

Game Server Architecture 관점에서는 운영에서는 연결 수, Packet Rate, Queue 길이, Tick p99, Drop·Retry, Memory와 Thread 고갈을 같은 시간축에서 본다.

## 8. 자주 하는 오해
- 게임 서버는 항상 Stateful해야 한다고 생각한다. 로그인, 매치메이킹, API 서버는 Stateless로도 충분하며 수평 확장에 유리하다.
- Authoritative 서버를 두면 치팅이 완전히 불가능하다고 생각한다. 검증 범위와 비용을 설계해야 하며 완벽한 차단은 없다.
- 분산 아키텍처를 도입하면 지연이 사라진다고 생각한다. 서비스 간 hop이 늘어날수록 네트워크 왕복 비용이 증가한다.
- Service Discovery가 있으면 장애가 자동 복구된다고 생각한다. 자동 등록·해제는 Health Check 및 Circuit Breaker와 별도로 설계해야 한다.
- Room을 분리하면 모든 동기화 문제가 사라진다고 생각한다. 월드 이벤트, 친구 목록, 글로벌 채팅 등 Room 간 상호작용은 여전히 설계가 필요하다.
## 9. 면접 질문
### Q1. 핵심 개념을 설명해 주세요.
게임 서버 아키텍처는 Gateway, Login, Matchmaking, Game, Chat, Persistence 같은 책임과 통신·상태 경계를 배치하는 구조다.
### Q2. 왜 필요한가요?
서로 다른 부하·상태·장애 특성을 분리해 확장과 배포, 장애 격리를 가능하게 한다.
### Q3. 실무에서는 어떻게 적용하나요?
로그인 API는 무상태로 수평 확장하고 Game Room은 특정 프로세스가 권위 상태를 소유한다. 서버 Directory와 Drain 절차로 배포 중 새 매치를 막는다.
### Q4. 장애 시 무엇을 확인하나요?
Game Server Architecture 관점에서는 상태 소유자, Queue와 Buffer, Sequence, Timeout, Drop·Retry와 p99를 확인한다.

## 10. 예상 꼬리질문
- Authority 경계의 최종 소유자는 어디에 두나요?
- Stateful 배치 처리에서 중복과 역순은 어떻게 구분하나요?
- Gateway 용량의 상한을 넘으면 어떤 요청부터 제한하나요?
- Service Discovery 장애를 어떻게 재현하고 복구를 검증하나요?
- Room Partition 관련 p99가 증가하면 어떤 지표를 함께 보나요?
## 11. 30초 모범답변
> 게임 서버 아키텍처는 기능 분리보다 상태 소유권과 실패 경계를 정하는 일입니다. 독립 확장이 필요한 책임만 분리하고 통신 실패와 운영 비용을 함께 설계합니다. 로그인 API는 무상태로 수평 확장하고 Game Room은 특정 프로세스가 권위 상태를 소유한다.

## 12. 1~2분 확장답변
> 게임 서버 아키텍처는 기능 분리보다 상태 소유권과 실패 경계를 정하는 일입니다. 독립 확장이 필요한 책임만 분리하고 통신 실패와 운영 비용을 함께 설계합니다. 설계에서는 상태 소유권, 입력 검증과 Message 순서를 먼저 정합니다. Network I/O와 Logic 실행을 분리하되 Queue에 상한과 Backpressure를 둡니다. 게임 서버에서는 평균 처리량보다 Tick과 Packet 지연의 p99, 재접속과 배포 시나리오까지 검증해야 합니다.

## 13. 핵심 요약
- 게임 서버 아키텍처는 Gateway, Login, Matchmaking, Game, Chat, Persistence 같은 책임과 통신·상태 경계를 배치하는 구조다.
- 상태 소유권과 입력 검증이 핵심이다.
- 순서·Timeout·재처리를 정의한다.
- Queue와 Buffer에는 상한이 필요하다.
- 운영에서는 p99와 Overload를 관찰한다.

## 한 줄 정리
> 게임 서버 아키텍처는 기능 분리보다 상태 소유권과 실패 경계를 정하는 일입니다. 독립 확장이 필요한 책임만 분리하고 통신 실패와 운영 비용을 함께 설계합니다.
