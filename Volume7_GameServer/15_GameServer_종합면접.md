---
difficulty: 4
reading_time: 25분
interview_frequency: 5
importance: 5
---

# 15. Game Server 종합면접

> 게임 서버·백엔드 개발자를 위한 CS 면접 교재

## 학습 목표
- 핵심 원리와 등장 이유를 설명할 수 있다.
- 정확성·지연·운영 Trade-off를 설명할 수 있다.
- 게임 서버 설계와 장애 대응에 적용할 수 있다.

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
면접 설계에서는 Login Ticket부터 Session, 입력 Sequence, Tick Simulation, Snapshot, 결과 저장과 Reconnect까지 한 흐름으로 설명한다. 각 경계에서 Owner, Timeout, 중복과 관찰 지표를 덧붙인다.

## 5. 비슷한 개념과 비교
좋은 설계는 단일 기술을 절대화하지 않는다. 정확성, 반응성, 처리량과 복구 목표를 먼저 정한 뒤 각 선택의 비용을 설명한다.
## 6. 장점과 단점
Game Server 종합면접을 올바르게 적용하면 상태와 처리 책임이 명확해지고 Peak 부하와 장애에 대한 예측 가능성이 높아진다. 반면 요구사항 수치, Authority와 Session 정책을 잘못 정하면 지연, 상태 불일치 또는 운영 복잡도가 늘어난다. 실제 요구와 측정 결과를 기준으로 필요한 범위만 적용한다.
## 7. 게임 서버·백엔드 실무 예시
운영 시 연결·Packet Rate, Queue, Tick p99, Drop, GC·Lock, DB·Cache 지연을 연결한다. 배포는 Readiness, Match 중단, Drain과 Reconnect 순으로 설계한다.

Game Server 종합면접 관점에서는 평균보다 p95·p99, 지역·Network별 분포, Queue·Buffer 상한, Drop·Retry와 복구 성공률을 관찰한다.

## 8. 자주 하는 오해
- **요구사항 수치**을 도입하면 관련 문제가 자동으로 모두 해결된다고 생각한다.
- **Authority**을 도입하면 관련 문제가 자동으로 모두 해결된다고 생각한다.
- **Session**을 도입하면 관련 문제가 자동으로 모두 해결된다고 생각한다.
- **Framing**을 도입하면 관련 문제가 자동으로 모두 해결된다고 생각한다.
- **Serialization**을 도입하면 관련 문제가 자동으로 모두 해결된다고 생각한다.
## 9. 면접 질문
### Q1. 핵심 개념을 설명해 주세요.
게임 서버 면접의 핵심은 권위 상태, Network 전송, Tick·동시성, 지연 보정, 영속성과 장애 복구를 하나의 흐름으로 설명하는 것이다.
### Q2. 어떤 Trade-off가 있나요?
Authoritative Server가 최종 판정하고 Client는 Prediction·Interpolation으로 지연을 숨긴다. I/O와 Logic은 Queue로 분리하되 상태 소유와 순서를 보장한다.
### Q3. 실무 적용 사례는 무엇인가요?
운영 시 연결·Packet Rate, Queue, Tick p99, Drop, GC·Lock, DB·Cache 지연을 연결한다. 배포는 Readiness, Match 중단, Drain과 Reconnect 순으로 설계한다.
### Q4. 장애와 악용을 어떻게 제한하나요?
Game Server 종합면접 관점에서는 서버 검증, 시간·크기 상한, Version과 Idempotency, Backpressure와 지표를 적용한다.

## 10. 예상 꼬리질문
- 요구사항 수치의 최종 소유자는 어디에 두나요?
- Authority 처리에서 중복과 역순은 어떻게 구분하나요?
- Session의 상한을 넘으면 어떤 요청부터 제한하나요?
- Framing 장애를 어떻게 재현하고 복구를 검증하나요?
- Serialization 관련 p99가 증가하면 어떤 지표를 함께 보나요?
## 11. 30초 모범답변
> 게임 서버는 서버 권위를 기준으로 입력을 검증하고 Tick에서 상태를 갱신하며 Prediction·Interpolation으로 지연을 숨깁니다. 상태 소유권, Overload와 복구가 설계의 핵심입니다. 운영 시 연결·Packet Rate, Queue, Tick p99, Drop, GC·Lock, DB·Cache 지연을 연결한다.

## 12. 1~2분 확장답변
> 게임 서버는 서버 권위를 기준으로 입력을 검증하고 Tick에서 상태를 갱신하며 Prediction·Interpolation으로 지연을 숨깁니다. 상태 소유권, Overload와 복구가 설계의 핵심입니다. 설계에서는 서버가 최종 상태를 소유하고 Client 입력, Sequence와 시간을 검증합니다. 지연은 Prediction·Interpolation과 제한된 Rewind로 보정합니다. Queue, Pool과 Cache에는 상한을 두고 재접속·배포·중복 처리까지 정상 흐름으로 설계합니다.

## 13. 핵심 요약
- 게임 서버 면접의 핵심은 권위 상태, Network 전송, Tick·동시성, 지연 보정, 영속성과 장애 복구를 하나의 흐름으로 설명하는 것이다.
- 서버 권위와 입력 검증을 유지한다.
- Version·Sequence로 중복과 순서를 관리한다.
- 성능 구조에는 크기와 시간 상한이 필요하다.
- 복구와 p99를 운영 기준으로 둔다.

## 한 줄 정리
> 게임 서버는 서버 권위를 기준으로 입력을 검증하고 Tick에서 상태를 갱신하며 Prediction·Interpolation으로 지연을 숨깁니다. 상태 소유권, Overload와 복구가 설계의 핵심입니다.
