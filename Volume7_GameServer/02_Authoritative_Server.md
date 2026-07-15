---
difficulty: 3
reading_time: 25분
interview_frequency: 5
importance: 5
---

# 02. Authoritative Server

> 게임 서버·백엔드 개발자를 위한 CS 면접 교재

## 학습 목표
- 핵심 정의와 등장 이유를 설명할 수 있다.
- 데이터·상태 흐름과 Trade-off를 설명할 수 있다.
- 게임 서버 운영과 장애 대응에 적용할 수 있다.

## 1. 개요
권위 서버는 게임의 최종 상태와 규칙 판정 권한을 서버가 가지고 Client 입력을 검증해 결과를 결정하는 모델이다.

## 2. 왜 필요한가
변조된 Client가 위치, 피해량과 재화를 임의 결정하지 못하게 하고 모든 참가자에게 일관된 결과를 제공한다. 게임 서버는 정확성뿐 아니라 제한 시간 안의 처리와 장애 후 복구를 함께 제공해야 한다.

## 3. 핵심 동작 원리
```text
Client input command→server validate→simulate→authoritative state→replicate
```
Client는 의도를 보내고 서버는 속도, Cooldown, 충돌과 순서를 검증한다. 모든 것을 서버에서 계산하면 보안은 강해지지만 CPU·지연 비용이 있어 예측과 보정을 조합한다.

상태의 최종 소유자, Message 순서, Timeout과 실패 후 재처리 기준을 명시한다.

### Authority의 의미

Authoritative Server는 최종 게임 상태와 규칙 판정 권한을 Server가 가진다는 뜻이다. Client 입력은 “내 Position은 x다”라는 사실 통보가 아니라 “앞으로 이동하고 싶다”는 요청에 가깝다.

```text
Client: input(seq=101, move=forward)
              ↓
Server: Session·상태·규칙 검증
              ↓
Server State Update
              ↓
Client들에게 확정 Snapshot·Event 전송
```

Client는 표시와 반응성을 위해 예측할 수 있지만 Server 결과와 충돌하면 Server가 우선한다.

### 신뢰 경계

Client가 보낸 값은 조작·재전송·지연·순서 변경될 수 있다. 다음을 검증한다.

- 해당 Session이 해당 Character를 제어하는가?
- 현재 State에서 가능한 Command인가?
- Cooldown·Resource·거리·시야 조건을 만족하는가?
- Sequence와 Timestamp가 허용 범위인가?
- Packet 크기·Enum·숫자 범위가 유효한가?

검증 실패를 모두 즉시 Ban으로 연결하지 않는다. Packet Loss, Clock 차이와 Client Bug도 있으므로 Drop·Correction·경고·탐지 점수·제재를 구분한다.

### 상태 전이 중심 처리

Command Handler가 임의 Field를 직접 수정하게 두기보다 Server State Machine의 유효한 전이로 처리한다.

```text
Alive --TakeDamage--> Dead
Dead  --Move--------> Reject
Dead  --Respawn-----> Alive
```

불변식은 HP 범위, Inventory 수량, 한 Item의 단일 소유, 한 Match의 단일 결과처럼 정의한다. Command 처리 전후에 불변식을 유지한다.

### 이동 검증

단순히 두 Position 거리만 비교하면 Latency·Acceleration·충돌을 놓친다. Server가 입력과 이전 상태로 Simulation하거나 최대 속도·가속도·Navigation·Collision을 검증한다.

```text
allowedDistance = maxSpeed × elapsed + tolerance
```

Tolerance가 너무 작으면 정상 Player를 수정하고, 너무 크면 Cheat 여지가 커진다. Network Jitter 분포와 게임 디자인을 기준으로 정한다.

### 전투 판정

Server는 발사 가능 State, Ammo, Fire Rate를 확인하고 Hit 판정 시 현재 또는 Lag-compensated 과거 Snapshot을 사용할 수 있다. Client가 보낸 Target ID와 Damage를 그대로 적용하지 않는다. Damage는 Server Data와 Buff·Armor 규칙에서 계산한다.

Random 결과는 Server RNG에서 생성하고 필요한 경우 Seed·Input을 Replay Log에 기록한다. 보안용 RNG와 게임 Simulation RNG 요구를 구분한다.

### 중복·순서 처리

Network Retry와 재전송으로 같은 Command가 여러 번 올 수 있다. Sequence Number로 오래된·중복 입력을 식별한다. UDP 입력은 일부 누락을 허용할 수 있고, 재화 지급 같은 Command는 Idempotency Key와 영속 중복 방지가 필요하다.

```text
lastProcessedSeq=100
seq=99  → old, drop
seq=101 → process
seq=101 → duplicate, drop
```

### Authority 분할

모든 판정을 하나의 Server가 할 필요는 없다. Game Instance는 전투, Inventory Service는 영구 Item, Account Service는 인증을 소유할 수 있다. 두 Authority가 같은 Field를 동시에 수정하지 않도록 경계를 정한다.

Cross-service 작업에는 부분 실패가 있다. Match 보상은 결과 ID로 한 번만 적용하고 Reconciliation할 수 있게 한다.

### 보안과 Anti-cheat

Authoritative 구조는 Cheat를 어렵게 하지만 Server도 Client가 볼 수 없는 정보까지 전송하면 Wall Hack에 악용될 수 있다. Interest Management로 필요한 Entity만 전송하고 민감 데이터는 최소화한다.

입력 빈도, 불가능한 이동, Aim Pattern을 탐지하되 Detection과 Punishment를 분리한다. Server 검증 비용 자체가 DoS 공격점이 되므로 Packet Rate와 계산 Budget을 제한한다.

### Trade-off

Server Authority는 공정성과 일관성을 높이지만 Latency, CPU·Bandwidth와 개발 복잡도를 증가시킨다. Client Prediction·Interpolation·Lag Compensation으로 체감을 개선하되 최종 상태는 Server가 결정한다. PvE Casual, Turn-based, Competitive Shooter에 필요한 강도가 다르다.

### 실무 설계 검토 체크리스트

- **신뢰 경계**: 신뢰 경계의 입력이 어디서 생성되고 어느 실행 흐름이 상태를 소유하는지 먼저 정한다. 다른 구성 요소는 상태를 직접 고치지 않고 명시된 경계를 통해 요청한다.
- **입력 Sequence**: 입력 Sequence의 정상 처리 순서를 Diagram으로 확인한다. 중간 단계가 실패했을 때 이미 반영된 상태와 다시 수행해도 되는 작업을 구분한다.
- **이동 검증**: 이동 검증에 적용할 최대 개수, Byte 또는 시간 한도를 정한다. 한도를 넘으면 대기, 거절, Drop 가운데 업무 의미에 맞는 정책을 사용한다.
- **전투 검증**: 전투 검증 관련 Message에는 중복과 역순을 식별할 Sequence나 Version이 필요한지 판단한다. 오래된 작업이 새 Session 상태를 덮지 않게 한다.
- **Cooldown**: Cooldown가 느려질 때 상위 Queue와 호출자까지 지연이 전파되는 경로를 확인한다. Timeout과 Backpressure가 연쇄 Retry를 만들지 않게 한다.
- **Client Timestamp**: Client Timestamp의 평균 처리량만으로 용량을 결정하지 않는다. Peak 부하에서 p95·p99 지연, Memory와 Queue 깊이가 허용 범위인지 측정한다.
- **Rollback 범위**: Rollback 범위를 Client가 주장할 수 있다면 Server가 다시 계산하거나 검증할 항목을 정한다. 허용 오차와 반복 위반 처리 기준도 기록한다.
- **치팅 오탐**: 치팅 오탐 변경은 이전 Client나 Server와 동시에 존재할 수 있다. Version 협상, 기본값과 단계적 배포로 전후 호환성을 확인한다.
- **Random Seed**: Random Seed 장애를 재현하는 Test를 만든다. Timeout, 연결 종료, 중복 Callback과 Process 재시작 뒤에도 자원과 상태가 한 번만 정리되는지 확인한다.
- **권위 분할**: 권위 분할 관련 Log에는 Match·Session·Sequence 같은 추적 Key를 남긴다. 민감 정보는 제외하고 원인 판별에 필요한 지표와 함께 조회한다.
- **중복 명령**: 중복 명령 최적화는 실제 Profile 결과를 근거로 적용한다. CPU를 줄이는 대신 Memory, 복사 감소 대신 Lifetime 복잡도가 늘 수 있음을 비교한다.
- **Replay 감사**: Replay 감사의 Owner를 배포 중 교체할 때 새 요청 차단, 진행 작업 Drain과 상태 이전 순서를 정의한다. 구 Version Callback은 식별 후 폐기한다.
- **접속 끊김**: 접속 끊김 결과가 영속 데이터나 외부 서비스에 반영되면 성공 응답의 기준을 정한다. 불확실한 결과는 조회와 Reconciliation으로 확정한다.
- **부하 제한**: 부하 제한 기능을 독립 Service나 Thread로 분리할지는 확장과 장애 격리 이득으로 판단한다. Network·Queue 이동과 운영 비용도 함께 계산한다.
- **판정 지표**: 판정 지표 정책은 정상 사용자 경험과 악용 방지를 함께 고려한다. 너무 넓은 허용 범위와 지나치게 엄격한 오탐 사이를 실제 분포로 조정한다.

이 항목은 Authoritative Server 설계 Review에서 실제 요구와 실패 조건을 빠뜨리지 않기 위한 기준이다. 모든 장치를 일괄 적용하지 않고 측정된 위험과 운영 목표에 필요한 항목만 선택한다.
### 장애 시나리오 연습

Authoritative Server은 정상 경로만 구현해서는 운영 준비가 끝나지 않는다. 다음 상황을 부하·Network Simulator와 장애 주입 Test로 재현한다.

- **신뢰 경계**: 신뢰 경계 요청이 정상 처리됐지만 응답만 손실된 상황을 가정한다. 호출자가 재시도해도 같은 상태 변경이 두 번 발생하지 않도록 Sequence, Version 또는 Idempotency Key를 둔다.
- **입력 Sequence**: 입력 Sequence 처리 시간이 평소의 열 배로 증가한 상황을 재현한다. 제한 Queue, Timeout과 Admission Control이 다른 Session과 Tick까지 지연을 퍼뜨리지 않는지 확인한다.
- **이동 검증**: 이동 검증 Owner가 배포나 장애로 사라진 상황을 Test한다. 새 Owner 선택, 진행 중 작업 처리와 구 Callback 폐기 순서가 명확해야 한다.
- **전투 검증**: 전투 검증 입력이 최대 크기, 빈 값, 오래된 Timestamp와 잘못된 Enum을 포함하는 경우를 검증한다. 실패한 입력이 부분 상태를 남기거나 Process를 종료시키면 안 된다.
- **Cooldown**: Cooldown 관련 Message가 중복·역순·지연 도착하는 Network 조건을 주입한다. 최종 상태가 순서 정책과 허용 Window에 맞는지 Replay로 비교한다.
- **Client Timestamp**: Client Timestamp Capacity가 모두 사용된 Peak 상황에서 대기 시간을 무제한 늘리지 않는다. 업무 중요도에 따른 거절·Drop과 Client 재시도 안내가 함께 동작해야 한다.
- **Rollback 범위**: Rollback 범위 복구 뒤 상태가 맞는지 원본 Event, Snapshot 또는 DB와 대조한다. 자동 복구가 불가능한 차이는 경고와 수동 Reconciliation 대상으로 남긴다.

Authoritative Server에서는 각 Test는 성공 여부만 기록하지 않는다. 처리 시간 분포, Queue 최대치, Drop·Retry 수와 복구 소요 시간을 남겨 다음 배포의 기준값으로 사용한다.

## 4. 쉬운 예시
Client가 좌표 100m 이동을 주장해도 Server는 마지막 위치와 입력 시간으로 가능한 최대 거리를 계산한다. 벽 충돌과 이동 제한을 통과한 결과만 권위 상태에 반영하고 위반 입력은 교정한다.

## 5. 비슷한 개념과 비교
서버 판정은 치팅과 상태 불일치를 줄이지만 RTT만큼 결과 확인이 늦다. Client Prediction은 반응성을 보완하지만 최종 판정과 보상은 Server에 남겨야 한다.
## 6. 장점과 단점
Authoritative Server을 올바르게 적용하면 상태와 처리 책임이 명확해지고 Peak 부하와 장애에 대한 예측 가능성이 높아진다. 반면 신뢰 경계, 입력 Sequence와 이동 검증 정책을 잘못 정하면 지연, 상태 불일치 또는 운영 복잡도가 늘어난다. 실제 요구와 측정 결과를 기준으로 필요한 범위만 적용한다.
## 7. 게임 서버·백엔드 실무 예시
공격 Packet의 damage 값을 믿지 않고 skillId, target과 input sequence를 받아 서버 데이터로 판정한다. 이상 행동은 거부뿐 아니라 지표·제재 파이프라인으로 기록한다.

Authoritative Server 관점에서는 운영에서는 연결 수, Packet Rate, Queue 길이, Tick p99, Drop·Retry, Memory와 Thread 고갈을 같은 시간축에서 본다.

## 8. 자주 하는 오해
- **신뢰 경계**을 도입하면 관련 문제가 자동으로 모두 해결된다고 생각한다.
- **입력 Sequence**을 도입하면 관련 문제가 자동으로 모두 해결된다고 생각한다.
- **이동 검증**을 도입하면 관련 문제가 자동으로 모두 해결된다고 생각한다.
- **전투 검증**을 도입하면 관련 문제가 자동으로 모두 해결된다고 생각한다.
- **Cooldown**을 도입하면 관련 문제가 자동으로 모두 해결된다고 생각한다.
## 9. 면접 질문
### Q1. 핵심 개념을 설명해 주세요.
권위 서버는 게임의 최종 상태와 규칙 판정 권한을 서버가 가지고 Client 입력을 검증해 결과를 결정하는 모델이다.
### Q2. 왜 필요한가요?
변조된 Client가 위치, 피해량과 재화를 임의 결정하지 못하게 하고 모든 참가자에게 일관된 결과를 제공한다.
### Q3. 실무에서는 어떻게 적용하나요?
공격 Packet의 damage 값을 믿지 않고 skillId, target과 input sequence를 받아 서버 데이터로 판정한다. 이상 행동은 거부뿐 아니라 지표·제재 파이프라인으로 기록한다.
### Q4. 장애 시 무엇을 확인하나요?
Authoritative Server 관점에서는 상태 소유자, Queue와 Buffer, Sequence, Timeout, Drop·Retry와 p99를 확인한다.

## 10. 예상 꼬리질문
- 신뢰 경계의 최종 소유자는 어디에 두나요?
- 입력 Sequence 처리에서 중복과 역순은 어떻게 구분하나요?
- 이동 검증의 상한을 넘으면 어떤 요청부터 제한하나요?
- 전투 검증 장애를 어떻게 재현하고 복구를 검증하나요?
- Cooldown 관련 p99가 증가하면 어떤 지표를 함께 보나요?
## 11. 30초 모범답변
> Authoritative Server는 Client 입력을 신뢰하지 않고 서버가 규칙과 최종 상태를 판정합니다. 지연을 줄이기 위해 Client Prediction을 쓰더라도 서버 결과가 기준입니다. 공격 Packet의 damage 값을 믿지 않고 skillId, target과 input sequence를 받아 서버 데이터로 판정한다.

## 12. 1~2분 확장답변
> Authoritative Server는 Client 입력을 신뢰하지 않고 서버가 규칙과 최종 상태를 판정합니다. 지연을 줄이기 위해 Client Prediction을 쓰더라도 서버 결과가 기준입니다. 설계에서는 상태 소유권, 입력 검증과 Message 순서를 먼저 정합니다. Network I/O와 Logic 실행을 분리하되 Queue에 상한과 Backpressure를 둡니다. 게임 서버에서는 평균 처리량보다 Tick과 Packet 지연의 p99, 재접속과 배포 시나리오까지 검증해야 합니다.

## 13. 핵심 요약
- 권위 서버는 게임의 최종 상태와 규칙 판정 권한을 서버가 가지고 Client 입력을 검증해 결과를 결정하는 모델이다.
- 상태 소유권과 입력 검증이 핵심이다.
- 순서·Timeout·재처리를 정의한다.
- Queue와 Buffer에는 상한이 필요하다.
- 운영에서는 p99와 Overload를 관찰한다.

## 한 줄 정리
> Authoritative Server는 Client 입력을 신뢰하지 않고 서버가 규칙과 최종 상태를 판정합니다. 지연을 줄이기 위해 Client Prediction을 쓰더라도 서버 결과가 기준입니다.
