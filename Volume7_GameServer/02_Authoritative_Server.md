---
difficulty: 3
reading_time: 25분
interview_frequency: 5
importance: 5
---

# 02. Authoritative Server


## 학습 목표

- PvP 게임에서 Cheat 탐지가 정상 플레이어를 오탐하는 빈도가 높아질 때, 이동 허용 오차(maxSpeed × elapsed + tolerance)의 Network Jitter 분포 기반 튜닝 방법과, 반복 위반 횟수·편차 크기 기준으로 즉시 Drop·경고·탐지 점수 축적·제재 중 어느 단계를 선택할지 판단할 수 있다.
- 공격 Packet에서 Client가 보낸 damage·position·target을 그대로 적용했을 때 발생하는 취약점을 진단하고, skillId·Cooldown·시야 범위·버프 상태를 서버 측에서 재계산해야 하는 필드와 Client 신뢰 허용 필드를 Authority 경계 기준으로 구분해 설계 결정을 내릴 수 있다.
- 네트워크 재전송으로 같은 Command가 중복·역순 도착할 때, Sequence Number·Idempotency Key·Version 조건부 갱신 중 부작용(재화 지급·아이템 획득) 유무와 서비스 Authority 경계를 기준으로 적합한 중복 방지 패턴을 결정할 수 있다.
- Authoritative Server의 입력 검증 로직이 DoS 공격면이 되는 조건을 진단하고, Packet Rate Limit·검증 예산(Budget) 상한·우선순위별 Drop 정책 중 서버 Tick 안정성과 정상 플레이어 경험을 동시에 보호하는 조합을 결정할 수 있다.

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

## 4. 쉬운 예시: 공격 Packet 검증과 중복 처리

**Server 측 공격 검증 의사코드**

```python
def handle_attack(session, packet):
    actor = get_actor(session.actor_id)
    skill  = get_skill(packet.skill_id)          # DB 기준 스탯

    # 1. 시전 가능 상태 확인
    if actor.state != ALIVE:
        return reject("dead actor")
    # 2. Cooldown 서버 시간 기준 검증
    if now() < actor.skill_cooldowns[skill.id]:
        return reject("cooldown not ready")
    # 3. 중복·역순 입력 방지
    if packet.seq <= session.last_seq:
        return drop("old or duplicate seq")
    # 4. 시야·사거리 검증
    target = get_actor(packet.target_id)
    if distance(actor, target) > skill.range:
        return reject("out of range")

    # 5. 서버 기준 데미지 계산 (Client 값 무시)
    damage = calc_damage(skill, actor.stats, target.buffs)
    target.apply_damage(damage)
    session.last_seq = packet.seq
    broadcast_hit(actor, target, damage)
```

Client가 보낸 `damage` 필드는 사용하지 않는다. 서버가 `skill.id`로 DB 스탯을 조회하고 Cooldown·사거리·시야를 서버 시간과 서버 좌표 기준으로 검증한 뒤 데미지를 재계산한다.

## 5. 비슷한 개념과 비교

| 구분 | Authoritative Server | Client-side Authority |
|------|---------------------|-----------------------|
| 최종 상태 결정 | 서버 | 클라이언트 |
| Cheat 방어 | 강함 (서버가 검증) | 취약 (클라이언트 신뢰) |
| 지연 (RTT) | 판정이 RTT만큼 지연 | 즉각 반응 |
| 반응성 보완 | Client Prediction + 보정 | 불필요 |
| 서버 CPU | 검증·Simulation 부하 | 낮음 |
| 공정성·일관성 | 높음 | 낮음 (클라이언트마다 다름) |
| 적합한 장르 | Competitive·MMORPG | PvE Casual·Turn-based |
## 6. 장점과 단점

### Authoritative Server의 장점

- 공정성: 모든 참가자에게 동일한 최종 상태를 보장
- Cheat 방어: Client 조작이 최종 상태에 반영되지 않음
- 일관성: Cooldown·데미지·재화를 서버 단일 기준으로 계산
- Replay 가능: 서버 입력 로그로 전체 Match 재현 가능

### Authoritative Server의 단점

- RTT만큼 판정 지연: Client Prediction으로 보완하지 않으면 조작감 저하
- 서버 CPU 증가: 이동·전투 Simulation, 검증 비용이 Tick마다 발생
- 개발 복잡도: Prediction·Reconciliation·Rollback 로직 필요
- 검증 자체가 DoS 공격면: Packet Rate·검증 Budget 제한 필요
## 7. 게임 서버·백엔드 실무 예시
공격 Packet의 damage 값을 믿지 않고 skillId, target과 input sequence를 받아 서버 데이터로 판정한다. 이상 행동은 거부뿐 아니라 지표·제재 파이프라인으로 기록한다.

Authoritative Server 관점에서는 운영에서는 연결 수, Packet Rate, Queue 길이, Tick p99, Drop·Retry, Memory와 Thread 고갈을 같은 시간축에서 본다.

## 8. 자주 하는 오해

- **서버에서 모든 검증을 하면 플레이가 불가능할 정도로 지연된다**: Input 전송과 State 수신만으로도 플레이 가능하며, Client Prediction으로 체감 지연을 보완한다. 검증 비용은 Budget으로 제어한다.
- **이동 검증은 목적지 좌표 범위만 확인하면 된다**: 속도·가속도·Navigation Mesh·장애물 충돌 등 복합 조건이 필요하다. 좌표만 보면 벽 통과나 텔레포트 Cheat를 막지 못한다.
- **전투 검증은 서버에서 데미지 계산만 하면 된다**: 사거리·시야(LOS)·Cooldown·버프·디버프 상태 전체가 서버 기준이어야 한다. 어느 하나만 클라이언트를 신뢰하면 해당 값으로 Exploit이 생긴다.
- **클라이언트가 보낸 Cooldown 완료 신호를 믿어도 된다**: Cooldown은 서버 시간 기준으로 계산해야 한다. 클라이언트가 시간을 조작하거나 신호를 재전송하면 무한 연속기가 가능해진다.
- **Wall Hack은 Authoritative 서버만 있으면 자동으로 막힌다**: 서버가 최종 Authority여도 Interest Management를 적용하지 않으면 Client가 볼 수 없는 Enemy 위치 등이 패킷에 포함돼 Wall Hack에 악용된다.
- **Sequence Number만 있으면 중복 Command를 완전히 막는다**: Sequence로 오래된 입력을 Drop할 수 있지만, 재화 지급·아이템 획득처럼 부작용이 있는 Command는 Idempotency Key와 영속 저장 기반 중복 방지가 추가로 필요하다.
- **검증 실패는 모두 즉시 Ban으로 처리해야 한다**: Packet Loss·Clock Drift·Client Bug도 검증 실패를 유발한다. Drop·경고·탐지 점수 축적·제재로 단계를 구분하지 않으면 정상 플레이어가 오탐으로 제재된다.
## 9. 면접 질문

### Q1. PvP 슈팅 서버에서 이동 검증 오탐으로 정상 플레이어가 Correction을 받는 빈도가 초당 5회를 넘었습니다. tolerance 값을 어떻게 조정하고, 조정 후 실제 Cheat 허용 여지가 얼마나 커지는지 어떻게 측정하나요?

tolerance를 줄이면 오탐이 줄지만 허용 Cheat 거리가 줄어들고, 늘리면 정상 Correction이 감소하지만 Cheat 여지가 커집니다. 조정 순서: (1) 클라이언트 RTT 분포와 Jitter를 수집(예: p99 RTT 80ms, Jitter ±20ms), (2) tolerance = maxSpeed × (RTT_p99 + Jitter) × 안전 계수(1.2)로 재계산, (3) 실제 Cheat 허용 여지는 해당 tolerance 거리를 Replay 로그에서 실측. 운영 시에는 Correction 빈도, 실제 이동 속도 분포, Cheat 탐지 이벤트를 같은 대시보드에서 보고 tolerance 변경이 세 지표에 미치는 영향을 동시에 측정합니다.

### Q2. 공격 Packet에 Client가 damage=9999로 조작해 전송했습니다. 서버가 이 값을 그대로 적용하는 취약점이 발생한 근본 원인과, 서버가 재계산해야 하는 필드 목록을 설계하세요.

근본 원인: Client 입력 Packet의 damage 필드를 Authority 검증 없이 State에 적용했습니다. 서버가 재계산해야 하는 필드: skillId 기반 기본 데미지(DB), 공격자 스탯·버프 배율, 방어자 Armor·저항, Crit 여부(서버 RNG), 사거리·시야(서버 좌표), Cooldown 잔여(서버 시간). Client 신뢰 허용 필드: 이동 방향(서버 검증 후 적용), 스킬 발동 의도(skill_id·target_id). 설계 원칙: "Client는 의도(skill_id, target_id)만 보내고 결과(damage, 상태변화)는 서버가 계산한다."

### Q3. 재화 지급 Command가 네트워크 재전송으로 두 번 도착해 골드가 중복 지급됐습니다. Sequence Number만으로는 이를 막지 못한 이유와, Idempotency Key를 적용하는 설계를 설명하세요.

Sequence Number는 같은 세션 내에서 오래된·중복 입력을 Drop하지만, 서버 재시작 후 세션이 끊기고 재연결되면 Sequence가 초기화돼 이전 Command와 구분할 수 없습니다. 재화 지급처럼 부작용이 있는 Command는 Idempotency Key(UUID)를 호출자가 생성해 요청에 포함하고, 서버는 처리 전 Redis 또는 DB에 Key를 기록합니다. 동일 Key가 존재하면 이전 결과를 반환합니다. Key 저장과 재화 지급은 동일 DB Transaction에 묶거나 Outbox 패턴으로 원자적으로 커밋합니다. Key TTL은 재시도 최대 Window(5분)보다 길게 설정합니다.

### Q4. 적 위치를 알 수 없어야 하는데 클라이언트가 패킷을 파싱해 숨어 있는 Enemy 좌표를 추출해 Wall Hack을 구현했습니다. 서버 설계에서 어떻게 방지하나요?

Interest Management를 적용합니다. 서버는 각 플레이어의 시야 범위·Zone 경계 기준으로 해당 클라이언트가 '알아야 할' Entity 목록을 계산하고, 시야 밖 Enemy 상태는 전송하지 않습니다. 구현: (1) 매 Tick 또는 Entity 이동 시 시야 범위(예: 반경 50m) 안의 Entity 집합을 계산, (2) 이전 Tick 집합과 비교해 Enter/Leave 이벤트를 전송, (3) 시야 밖 Entity는 좌표·HP 등 어떤 필드도 Packet에 포함하지 않음. 추가로 서버가 보내는 Entity 수를 Tick당 상한으로 제어해 Fan-out 부하도 방지합니다.

### Q5. 입력 검증 서버가 초당 100만 건의 조작된 Packet을 받아 CPU 100%에 도달했습니다. 검증 로직 자체가 DoS 공격면이 된 상황에서 어떻게 방어하나요?

계층별 방어를 적용합니다. (1) **Gateway/Load Balancer**: IP 당 초당 Packet 수 상한(예: 초당 100 Packet)을 Rate Limit으로 차단. (2) **Session 계층**: 인증되지 않은 Session의 Packet은 서명 검증만 하고 즉시 Drop. 무거운 비즈니스 검증은 인증 성공 후만 실행. (3) **검증 Budget**: Tick당 검증에 사용할 CPU 시간 상한을 설정하고, 초과 시 우선순위가 낮은 Packet(이동 빈도 갱신 등)부터 Drop. (4) **Blacklist**: 반복 위반 IP/세션은 Circuit Breaker로 일정 시간 차단. 측정 지표: Packet Reject Rate·Validation CPU·Tick p99를 함께 모니터링합니다.

### Q6. Competitive PvP 서버에서 Lag Compensation으로 과거 Snapshot을 참조하는 범위를 최대 200ms로 설정했습니다. 이 수치가 너무 크면 어떤 문제가 생기고, 적정 Window를 결정하는 기준은 무엇인가요?

최대 Rollback Window가 너무 크면, 저지연(10ms) 클라이언트가 고지연(200ms) 적을 기준 시점보다 훨씬 과거 위치에서 판정해 "내가 분명히 피했는데 맞은" 경험이 발생합니다. 반대로 너무 작으면 고지연 플레이어가 Hit 판정을 거의 받지 못합니다. 결정 기준: (1) 대상 플레이어 RTT 분포의 p95(예: 150ms), (2) 장르의 공정성 우선순위(경쟁적일수록 Window를 좁힘), (3) Corrective Hit 빈도를 Replay 로그로 측정해 실제 플레이어 체감 불만 구간을 파악. 운영 중에는 RTT 분포 변화(새 지역 유입 등)에 따라 Window를 A/B 테스트로 조정합니다.

## 10. 예상 꼬리질문

- 이동 검증 tolerance를 p99 RTT 기반으로 튜닝했는데도 특정 지역 플레이어(RTT 300ms 이상)의 오탐이 계속 발생합니다. 지역별 tolerance를 분리하는 방법과, 단일 서버에서 이를 관리하는 구조를 설명해 주세요.
- 공격 Command에 Sequence Number와 Idempotency Key를 모두 적용했을 때 두 가지의 역할이 어떻게 다르고, 서버 재시작 후 Key가 초기화되면 어떤 중복이 발생할 수 있나요?
- Server RNG로 생성한 크리티컬 히트 결과가 클라이언트 예측과 달라 보정이 발생했습니다. RNG Seed를 Replay Log에 기록하는 방법과, 보안용 RNG와 Simulation RNG를 분리해야 하는 이유를 설명해 주세요.
- Authoritative Server에서 Match 결과를 Persistence Service로 한 번만 전달해야 하는데 결과 전송 도중 서버가 재시작됐습니다. 중복 전송 없이 정확히 한 번 전달을 보장하는 설계를 설명해 주세요.
- 입력 검증 실패를 단계별(Drop→경고→탐지 점수→제재)로 처리하는데, 탐지 점수 임계값을 넘어 자동 제재가 적용됐을 때 오탐 복구 절차와 운영 지표(False Positive Rate)를 어떻게 관리하나요?
- Authority를 Game Instance와 Inventory Service로 분할했을 때, 전투 중 아이템 사용 Command가 두 서비스에 걸친 상태를 변경해야 합니다. 부분 실패 시 일관성을 보장하는 방법을 설명해 주세요.
- 클라이언트 예측이 서버 보정과 충돌해 플레이어 위치가 순간 이동처럼 점프하는 현상이 발생했습니다. 보정을 매끄럽게 처리하는 방법(보간·속도 제한·Rubber-banding)과, 보정 빈도가 높을 때 서버 측 설계에서 무엇을 먼저 점검해야 하나요?

## 11. 30초 모범답변

> Authoritative Server는 Client 입력을 신뢰하지 않고 서버가 규칙·최종 상태를 판정합니다. Client는 반응성을 위해 예측하지만 서버 결과와 충돌하면 서버가 기준입니다. 공격 Packet의 damage는 서버 데이터로 재계산하고, Cooldown은 서버 시간 기준으로 검증합니다. 이상 행동은 거부뿐 아니라 탐지 점수 축적과 제재 파이프라인으로 기록합니다.

## 12. 1~2분 확장답변

> Authoritative Server는 최종 상태와 규칙 판정 권한을 서버가 가집니다. Client는 "앞으로 이동하겠다"는 의도를 보내고 서버가 속도·Cooldown·충돌·순서를 검증한 뒤 확정 결과를 모든 참가자에게 전달합니다.
>
> 이동 검증에서 허용 거리는 최대 속도×경과 시간+여유치로 계산합니다. 전투에서는 Client가 보낸 damage를 사용하지 않고 서버 스탯·버프·Armor 규칙으로 재계산합니다. 중복·역순 입력은 Sequence Number로 처리하고, 재화 지급은 Idempotency Key로 이중 지급을 막습니다.
>
> 검증 실패를 모두 즉시 Ban하면 Packet Loss나 Client Bug를 제재할 수 있으므로 Drop·경고·탐지 점수 축적으로 단계를 구분합니다. 지연을 숨기기 위해 Client Prediction을 사용하지만 서버 보정을 매끄럽게 처리하는 것이 핵심입니다.

## 13. 핵심 요약

- Authoritative Server는 Client 입력을 요청으로 받아 서버가 검증·판정해 최종 상태를 결정한다.
- Client가 보낸 damage·위치·재화 값을 그대로 적용하지 않는다.
- 이동 허용 오차는 속도×시간+여유치이며 Network Jitter 분포로 튜닝한다.
- Cooldown·전투 판정은 서버 Time과 서버 데이터 기준이다.
- 중복·역순 입력은 Sequence Number로 처리하며 재화는 Idempotency Key를 추가한다.
- 검증 실패는 Drop·경고·탐지 점수·제재로 단계별 처리한다.
- Authority는 여러 서비스로 분할 가능하며 같은 Field를 두 Authority가 수정하지 않도록 경계를 정한다.
- Client Prediction은 반응성을 높이지만 서버 결과와 충돌하면 서버가 우선한다.

## 한 줄 정리

> Authoritative Server는 Client 입력을 신뢰하지 않고 서버가 규칙·최종 상태를 판정하며, Client Prediction은 표시를 위한 임시 예측이고 서버 결과가 항상 기준이다.
