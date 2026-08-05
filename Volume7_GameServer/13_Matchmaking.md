---
difficulty: 4
reading_time: 25분
interview_frequency: 5
importance: 5
---

# 13. Matchmaking

> 게임 서버·백엔드 개발자를 위한 CS 면접 교재

## 학습 목표

- Prometheus에서 특정 Region·Mode의 대기 시간 p95가 30초를 초과할 때, MMR 범위 확장 속도 설정 문제인지 인구 부족인지 Bucket Worker 처리량 부족인지 진단 순서를 결정할 수 있다.
- Redis Lua Script 기반 Ticket Claim에서 동일 Ticket이 두 Match에 중복으로 들어가는 버그가 발생했을 때, Claim 원자성 실패·Lease 만료 경쟁·Version 누락 중 원인을 좁혀 수정 방향을 결정할 수 있다.
- Server Capacity 예약 실패율이 5%를 초과하는 상황에서, Match 확정 전 TTL 선점 누락·Warm Pool 부재·Region 용량 부족 중 원인을 측정하고 재처리 정책을 선택할 수 있다.
- Dodge 패널티 도입 후 정상 사용자의 Match 취소율이 2배 증가했을 때, 오탐 기준·패널티 강도·MMR 범위 완화 한계 중 어떤 정책 파라미터를 먼저 조정해야 하는지 판단할 수 있다.

## 1. 개요
Matchmaking은 실력, 지연, Party, 대기 시간과 서버 용량 조건으로 함께 플레이할 참가자와 Game Server를 선택하는 과정이다.

## 2. 왜 필요한가
공정성만 최적화하면 대기가 길고 빠른 매칭만 추구하면 품질이 낮아지므로 여러 목표를 균형 잡아야 한다. 사용자 경험을 개선하더라도 서버 권위와 복구 가능성을 훼손하지 않아야 한다.

## 3. 핵심 동작 원리
```text
enqueue ticket→bucket by region/mode/rating→expand acceptable range over wait→form match→reserve server→confirm
```
MMR은 실력 추정치이고 Matchmaking 규칙은 이를 포함한 제약 최적화다. 시간이 지날수록 실력 범위를 넓히되 Region·Party·역할과 악용 방지를 고려한다.

Matchmaking 관점에서는 Sequence, Timestamp, Session Generation과 상태 Version으로 오래되거나 중복된 Message를 식별한다.
### Ticket과 제약 조건

Ticket에는 Player 또는 Party ID, Mode, Region, MMR, 역할, Platform, 입력 장치, 대기 시작 시각과 제한 조건이 들어간다. Party는 쪼개지지 않는 하나의 단위로 취급하고 대표 Rating 계산 방식을 정한다. Ticket 갱신과 취소에는 Version을 두어 Match 확정 뒤 늦은 취소가 상태를 되돌리지 않게 한다.

```text
enqueue → candidate search → quality score
 → server reservation → player confirmation → commit
```

### 공정성과 대기 시간

완전히 같은 MMR만 찾으면 인구가 적은 시간대에 Match가 만들어지지 않는다. 초기에는 좁은 Rating과 낮은 Ping 범위를 사용하고 대기 시간에 따라 범위를 점진적으로 넓힌다. 확장 속도는 Mode와 Region마다 다를 수 있다. 대기 시간을 줄이기 위해 공정성을 얼마나 양보할지 Product 지표로 결정한다.

MMR은 실력의 추정치일 뿐이다. 배치 경기, Party 조합, 역할과 팀 내 분산도 품질에 영향을 준다. 평균 MMR만 같고 한 팀의 분산이 매우 크면 체감 공정성이 낮을 수 있다.

### 후보 탐색과 분할

모든 Ticket을 서로 비교하면 비용이 커진다. Region, Mode와 큰 Rating Bucket으로 먼저 Partition하고 인접 Bucket만 탐색한다. 한 Bucket에 Queue가 몰리면 Worker를 Shard하되 같은 Ticket이 두 Match에 들어가지 않도록 원자적 Claim이나 상태 전이를 둔다.

```text
Queued → Claimed(matchId) → Reserved → Confirmed
   └──────── timeout/cancel → Queued 또는 Removed
```

Claim Worker가 죽으면 Lease 만료 뒤 회수한다. At-least-once 처리에서는 상태 Version과 Match ID로 중복 확정을 막는다.

### Game Server 예약

Player 조합만 정하고 Server Capacity를 확보하지 않으면 입장 단계에서 실패한다. Region, Build Version, Mode와 예상 Resource를 기준으로 Instance를 예약한다. Reservation에는 TTL을 두고 확인 실패 시 Capacity를 반환한다. Server 생성이 느리면 예측 Auto Scaling과 Warm Pool을 사용한다.

Match 확정과 Server 예약 사이의 부분 실패를 처리해야 한다. 일부 Player만 입장했으면 대체자를 넣을지 Match를 해산할지 Mode 규칙을 따른다.

### 악용과 품질 보호

의도적 취소, 낮은 MMR 계정과 고수의 Party, Region 우회 같은 악용이 있다. 반복 Dodge Penalty, Party MMR 보정과 신뢰도 신호를 사용할 수 있지만 오탐과 접근성을 고려한다. Client가 MMR이나 결과를 직접 결정하지 못하게 Server 기록을 사용한다.

### 지표와 검증

평균뿐 아니라 대기 시간 p50·p95, 예상 승률 분포, Ping, 취소율, 실패 예약, Rematch 비율과 인구 Segment를 본다. 빠른 Match가 실제 이탈률과 경기 품질을 개선하는지도 확인한다. 과거 Queue Event를 Replay해 Algorithm 변경 전후를 비교하고 인구 급감, 특정 역할 부족과 Region 장애를 Simulation한다.

### 실무 설계 검토 체크리스트

- **Ticket**: Ticket의 입력이 어디서 생성되고 어느 실행 흐름이 상태를 소유하는지 먼저 정한다. 다른 구성 요소는 상태를 직접 고치지 않고 명시된 경계를 통해 요청한다.
- **Party 단위**: Party 단위의 정상 처리 순서를 Diagram으로 확인한다. 중간 단계가 실패했을 때 이미 반영된 상태와 다시 수행해도 되는 작업을 구분한다.
- **MMR 범위**: MMR 범위에 적용할 최대 개수, Byte 또는 시간 한도를 정한다. 한도를 넘으면 대기, 거절, Drop 가운데 업무 의미에 맞는 정책을 사용한다.
- **Ping 범위**: Ping 범위 관련 Message에는 중복과 역순을 식별할 Sequence나 Version이 필요한지 판단한다. 오래된 작업이 새 Session 상태를 덮지 않게 한다.
- **대기 확장**: 대기 확장가 느려질 때 상위 Queue와 호출자까지 지연이 전파되는 경로를 확인한다. Timeout과 Backpressure가 연쇄 Retry를 만들지 않게 한다.
- **Bucket**: Bucket의 평균 처리량만으로 용량을 결정하지 않는다. Peak 부하에서 p95·p99 지연, Memory와 Queue 깊이가 허용 범위인지 측정한다.
- **원자적 Claim**: 원자적 Claim를 Client가 주장할 수 있다면 Server가 다시 계산하거나 검증할 항목을 정한다. 허용 오차와 반복 위반 처리 기준도 기록한다.
- **Lease**: Lease 변경은 이전 Client나 Server와 동시에 존재할 수 있다. Version 협상, 기본값과 단계적 배포로 전후 호환성을 확인한다.
- **취소 Version**: 취소 Version 장애를 재현하는 Test를 만든다. Timeout, 연결 종료, 중복 Callback과 Process 재시작 뒤에도 자원과 상태가 한 번만 정리되는지 확인한다.
- **Server Reservation**: Server Reservation 관련 Log에는 Match·Session·Sequence 같은 추적 Key를 남긴다. 민감 정보는 제외하고 원인 판별에 필요한 지표와 함께 조회한다.
- **Capacity TTL**: Capacity TTL 최적화는 실제 Profile 결과를 근거로 적용한다. CPU를 줄이는 대신 Memory, 복사 감소 대신 Lifetime 복잡도가 늘 수 있음을 비교한다.
- **확인 실패**: 확인 실패의 Owner를 배포 중 교체할 때 새 요청 차단, 진행 작업 Drain과 상태 이전 순서를 정의한다. 구 Version Callback은 식별 후 폐기한다.
- **Dodge 방지**: Dodge 방지 결과가 영속 데이터나 외부 서비스에 반영되면 성공 응답의 기준을 정한다. 불확실한 결과는 조회와 Reconciliation으로 확정한다.
- **인구 Segment**: 인구 Segment 기능을 독립 Service나 Thread로 분리할지는 확장과 장애 격리 이득으로 판단한다. Network·Queue 이동과 운영 비용도 함께 계산한다.
- **품질 지표**: 품질 지표 정책은 정상 사용자 경험과 악용 방지를 함께 고려한다. 너무 넓은 허용 범위와 지나치게 엄격한 오탐 사이를 실제 분포로 조정한다.

이 항목은 Matchmaking 설계 Review에서 실제 요구와 실패 조건을 빠뜨리지 않기 위한 기준이다. 모든 장치를 일괄 적용하지 않고 측정된 위험과 운영 목표에 필요한 항목만 선택한다.
### 장애 시나리오 연습

Matchmaking은 정상 경로만 구현해서는 운영 준비가 끝나지 않는다. 다음 상황을 부하·Network Simulator와 장애 주입 Test로 재현한다.

- **Ticket**: Ticket 요청이 정상 처리됐지만 응답만 손실된 상황을 가정한다. 호출자가 재시도해도 같은 상태 변경이 두 번 발생하지 않도록 Sequence, Version 또는 Idempotency Key를 둔다.
- **Party 단위**: Party 단위 처리 시간이 평소의 열 배로 증가한 상황을 재현한다. 제한 Queue, Timeout과 Admission Control이 다른 Session과 Tick까지 지연을 퍼뜨리지 않는지 확인한다.
- **MMR 범위**: MMR 범위 Owner가 배포나 장애로 사라진 상황을 Test한다. 새 Owner 선택, 진행 중 작업 처리와 구 Callback 폐기 순서가 명확해야 한다.
- **Ping 범위**: Ping 범위 입력이 최대 크기, 빈 값, 오래된 Timestamp와 잘못된 Enum을 포함하는 경우를 검증한다. 실패한 입력이 부분 상태를 남기거나 Process를 종료시키면 안 된다.
- **대기 확장**: 대기 확장 관련 Message가 중복·역순·지연 도착하는 Network 조건을 주입한다. 최종 상태가 순서 정책과 허용 Window에 맞는지 Replay로 비교한다.
- **Bucket**: Bucket Capacity가 모두 사용된 Peak 상황에서 대기 시간을 무제한 늘리지 않는다. 업무 중요도에 따른 거절·Drop과 Client 재시도 안내가 함께 동작해야 한다.
- **원자적 Claim**: 원자적 Claim 복구 뒤 상태가 맞는지 원본 Event, Snapshot 또는 DB와 대조한다. 자동 복구가 불가능한 차이는 경고와 수동 Reconciliation 대상으로 남긴다.

Matchmaking에서는 각 Test는 성공 여부만 기록하지 않는다. 처리 시간 분포, Queue 최대치, Drop·Retry 수와 복구 소요 시간을 남겨 다음 배포의 기준값으로 사용한다.

## 4. 쉬운 예시

아래는 Ticket 상태 기계와 원자적 Claim 흐름이다.

```
Ticket 상태 전이:
  Queued → Claimed(matchId) → Reserved(serverId) → Confirmed
     ↑           |                   |
     └─ timeout/cancel ───────────── ┘ (Lease 만료 → Queued 복귀)

// Ticket Claim (Redis Lua Script로 원자적 실행)
local ticket = redis.call("GET", KEYS[1])  -- ticketId
if not ticket then return 0 end            -- 이미 없음
local state = cjson.decode(ticket)
if state.status ~= "Queued" then return 0 end  -- 이미 다른 Worker가 Claim

state.status  = "Claimed"
state.matchId = ARGV[1]
state.claimAt = tonumber(ARGV[2])
redis.call("SET", KEYS[1], cjson.encode(state), "EX", 30)  -- 30초 Lease
return 1

-- Claim 성공한 Worker만 Match를 진행
-- 실패한 Worker는 다른 Ticket을 탐색
```

- Lua Script로 Claim을 원자적으로 수행해 두 Worker가 같은 Ticket을 이중으로 매칭하는 것을 방지한다.
- Claim Worker가 죽으면 30초 Lease 만료 후 `Queued` 상태로 자동 복귀한다.
- 처음 10초는 MMR ±50·같은 Region, 10~30초는 ±100, 30초 이후는 ±150으로 범위를 점진적으로 확장한다.

## 5. 비슷한 개념과 비교

| 전략 | 대기 시간 | 매칭 품질 | 적합한 상황 |
|------|---------|---------|-----------|
| **좁은 조건(엄격)** | 길다 | 높다 | 피크 시간대·경쟁 모드 |
| **넓은 조건(느슨)** | 짧다 | 낮다 | 비피크·캐주얼 모드 |
| **시간 기반 확장** | 균형 | 균형 | 대부분의 게임 |
| **랜덤 매칭** | 매우 짧다 | 매우 낮다 | 튜토리얼·소규모 게임 |
| **Rating 없는 역할 기반** | 역할 수급에 의존 | 역할 균형 우선 | MOBA·팀 역할 게임 |

## 6. 장점과 단점

**장점**
- MMR 기반 매칭으로 비슷한 실력의 플레이어가 만나 게임 품질이 높아진다.
- 시간 기반 범위 확장으로 피크·비피크 시간 모두 적정 대기 시간을 유지한다.
- Ticket Lease와 원자적 Claim으로 이중 매칭과 Zombie Ticket을 방지한다.
- Server Capacity 예약을 Match 확정 전에 수행해 입장 단계 실패를 줄인다.

**단점**
- 인구가 적은 시간대나 Region에서 조건 완화 없이는 매칭이 안 될 수 있다.
- Party MMR 조합 계산, 역할 균형, Shard 간 원자적 Claim이 구현 복잡도를 높인다.
- Server Capacity 예약 실패 시 이미 기다린 플레이어를 재배치해야 한다.
- MMR 조작(Smurf 계정, 의도적 패배) 방지가 별도 시스템이 필요하다.

## 7. 게임 서버·백엔드 실무 예시

Ticket에 `version`과 `idempotencyKey`를 두어 중복 Queue 진입을 막는다. `Queued → Claimed → Reserved → Confirmed` 상태 전이를 Redis나 DB로 원자적으로 관리한다. Server Reservation에는 TTL을 두고 확인 실패 시 Capacity를 자동 반환한다.

대기 시간 p50·p95·p99, 예상 승률 분포, 취소율, 예약 실패율을 Region·Mode·시간대별로 집계한다. 인구 급감 시나리오를 Simulation해 범위 확장 정책을 검증한다.

## 8. 자주 하는 오해

- **매칭 Ticket은 한 번만 처리하면 된다.** 네트워크 오류로 Ticket이 중복 제출될 수 있다. Idempotency Key로 중복 진입을 막고 Ticket Version으로 늦은 취소가 확정된 Match를 되돌리지 않게 한다.
- **Party 매칭 시 Party 평균 MMR만 보면 된다.** Party 내 MMR 편차가 크면 팀 내 실력 불균형이 생긴다. 편차 상한과 대표 Rating 계산 방식(평균·최고값 등)을 명시해야 한다.
- **MMR 범위를 넓히면 항상 빠르고 좋다.** 범위가 너무 넓으면 실력 차이가 극단적인 매칭이 만들어져 게임 경험이 나빠지고 이탈률이 높아진다.
- **Ping 조건은 방 생성 후 확인해도 된다.** 방 생성 후 고지연 플레이어를 제거하면 이미 확보한 Server Capacity가 낭비되고 다른 플레이어가 재매칭 비용을 부담한다.
- **대기가 길면 조건을 무제한으로 완화하면 된다.** 완화 한계를 명시하지 않으면 극단적 매칭이 발생한다. Mode별·Region별 최대 완화 범위를 Product 목표로 설정한다.
- **Server Capacity는 Match 확정 후 예약해도 된다.** 플레이어가 모두 확인하고 Capacity를 예약하려 할 때 용량이 없으면 Match를 처음부터 다시 해야 한다. Match 확정 전에 Capacity를 TTL로 선점한다.
- **MMR은 실력을 정확하게 반영한다.** MMR은 추정치이며 배치 경기·Smurf·역할 변경으로 부정확해진다. 추가 신호(역할·최근 게임 성적)를 조합해 보완한다.

## 9. 면접 질문

### Q1. Matchmaking 서버에서 특정 Region의 대기 시간 p95가 평소 10초에서 60초로 급등했습니다. 어떤 순서로 원인을 진단하겠습니까?
Prometheus에서 해당 Region·Mode의 Bucket Queue 깊이, Ticket 생성률 vs 매칭 완료율부터 확인합니다. 인구 급감이면 Queue 깊이는 낮고 생성률도 낮습니다. Worker 처리량 부족이면 Queue 깊이만 쌓입니다. MMR 범위 확장 설정 변경이 원인이면 취소율과 Claim 실패율이 동시에 오릅니다. Ticket Claim 실패율과 Lease 만료 복귀 비율을 함께 보면 Worker 경합 여부를 판별할 수 있습니다.

### Q2. Redis Lua Script 기반 원자적 Claim을 사용함에도 동일 Ticket이 두 Match에 중복으로 들어가는 버그가 발생했습니다. 가능한 원인과 수정 방법은 무엇입니까?
Redis 클러스터 환경에서 Ticket Key와 Lock Key가 서로 다른 Hash Slot에 있으면 Lua Script 원자성이 보장되지 않습니다. 두 Key를 동일 Hash Slot에 배치해야 합니다. 또한 Lease 만료 직전 두 Worker가 거의 동시에 Read → Version 검사 → Write 순서를 실행하면 경쟁이 생깁니다. SET NX + Version 검증을 하나의 Lua Script 안에 넣고, 클러스터 리샤딩 중 MOVED 응답으로 재시도가 누락되지 않도록 재시도 정책에 MOVED 처리를 추가합니다.

### Q3. 배포 후 Server Capacity 예약 실패율이 0.5%에서 7%로 올랐습니다. 어떤 지표를 보고 어떤 조치를 취합니까?
Region별 Instance 가용 수, Warm Pool 크기, Auto Scaling 반응 시간(평균 1~3분)을 먼저 확인합니다. Match TTL 만료 전 확인 실패로 Capacity가 제때 반환되지 않는지 확인합니다. 즉각 조치로 Warm Pool 크기를 예약 실패율의 2배 기준으로 임시 증가시킵니다. 근본 조치로는 Match 확정과 동시에 Reservation을 시작하도록 타이밍을 조정하고, Region별 Auto Scaling Min을 평균 부하 + 20% 버퍼로 상향합니다.

### Q4. 새벽 비피크 시간에 MMR 차이가 800점 이상인 매칭이 발생해 플레이어 불만이 집중됩니다. 범위 확장 상한을 어떻게 설계해야 합니까?
경쟁 모드는 최대 ±200, 캐주얼 모드는 ±400처럼 Mode별 확장 상한을 Product 목표로 명시합니다. 비피크 시간에 상한을 초과하면 대기 시간을 더 늘리거나, Cross-Region 확장(Ping 허용치를 50ms→100ms로 완화)으로 인구를 보충합니다. 알고리즘 변경 전에 과거 Queue Event Replay로 예상 승률 분포를 시뮬레이션해 기준값이 50% 근처인지 검증합니다.

### Q5. Party 내 MMR 편차가 500점인 고수·초보 조합이 비슷한 총합 MMR 상대를 만나 승률이 극단적으로 갈리는 문제가 보고됩니다. Party MMR 보정 정책을 어떻게 설계합니까?
대표 Rating을 단순 평균 대신 `Max(Party MMR) × 0.6 + Avg(Party MMR) × 0.4` 방식으로 계산해 최고값에 가중치를 부여합니다. 편차가 ±300을 초과하는 Party는 경쟁 모드 진입을 제한하거나 매칭 범위를 좁힙니다. 보정 강도(α)는 실제 승률 분포 데이터를 분석해 50% 근처로 수렴하도록 조정하며, Queue Event Replay로 사전 시뮬레이션 후 배포합니다.

### Q6. Matchmaking 알고리즘을 개선한 뒤 실제 게임 품질이 좋아졌는지 어떤 지표와 방법으로 검증합니까?
대기 시간 p50·p95 감소, 예상 승률 분포가 50% ± 5% 이내로 수렴, Match 취소율·Server 예약 실패율 감소를 Region·Mode별로 측정합니다. 과거 Queue Event Replay로 알고리즘 변경 전후를 오프라인 시뮬레이션해 비교합니다. A/B 테스트로 실제 이탈률과 게임 완료율 차이를 확인합니다. 알고리즘 효과를 측정할 때 인구 급감·서버 장애 같은 외부 변수를 메트릭과 함께 기록해 오염을 제거합니다.

## 10. 예상 꼬리질문

- Ticket Claim Lease를 30초로 설정했는데 특정 Worker가 죽었을 때 최악의 경우 매칭 지연이 몇 초 발생하고, Lease를 10초로 줄이면 어떤 부작용이 생기나요?
- Matchmaking이 100개 Shard로 분산된 상황에서 인접 Bucket 탐색 시 동일 Ticket을 여러 Shard가 동시에 Claim 시도하면 DB CAS Write QPS가 얼마나 증가하고, Redis Lua Script 대신 DB를 쓸 때 어떻게 완화하나요?
- 비피크 시간에 MMR ±500까지 확장됐는데 특정 Mode의 취소율이 10%를 초과했습니다. Prometheus 알람 기준은 어떻게 잡고 확장 속도를 동적으로 조절하는 방법은 무엇인가요?
- Region 장애로 5만 명 Ticket을 인접 Region으로 이전할 때 발생하는 재접속 폭풍을 Rate Limit(초당 1,000건)과 ±50% Jitter Backoff로 어떻게 분산하나요?
- 신규 Build Version(v2) 배포 중 구 버전(v1)·신 버전(v2) Player가 혼재할 때 Ticket에 Build Version 필드가 없으면 어떤 입장 실패가 발생하고, Rolling Deploy 기간의 Ticket Schema 하위 호환성을 어떻게 보장하나요?
- Queue Event Replay로 알고리즘 변경을 사전 검증할 때 Replay 속도를 실시간의 10배로 하면 Event 순서 재현이 보장되는지 확인해야 할 항목과 결과를 어떤 지표로 비교하나요?
- Dodge 패널티 도입 후 특정 Region에서 취소율 15%·평균 대기 시간 45초가 동시에 증가했습니다. Dodge 오탐과 인구 감소 중 어느 쪽이 원인인지 어떤 지표로 구분하나요?

## 11. 30초 모범답변

> Matchmaking은 실력·Ping·대기 시간·서버 용량을 균형 있게 최적화합니다. 처음에는 좁은 MMR 범위로 시작하고 대기 시간에 따라 점진적으로 확장합니다. Ticket을 원자적으로 Claim해 이중 매칭을 방지하고 Server Capacity를 Match 확정 전에 TTL로 선점합니다.

## 12. 1~2분 확장답변

> Matchmaking의 핵심 목표는 공정성·낮은 Ping·적절한 대기 시간·서버 용량을 동시에 만족하는 것입니다. 처음에는 좁은 MMR·같은 Region으로 시작하고 대기 시간에 따라 범위를 단계적으로 확장합니다. 빠른 매칭과 게임 품질 사이의 Trade-off를 이탈률 지표로 검증합니다.
>
> Ticket은 Redis Lua Script로 원자적으로 Claim해 이중 매칭을 방지합니다. Claim Lease(30초) 만료 시 자동으로 Queue에 복귀합니다. Server Capacity는 Match 확정 전에 TTL로 선점하고 예약 실패 시 Ticket을 재배치합니다.
>
> 운영에서는 대기 시간 p95·예상 승률 분포·취소율·예약 실패율을 Region·Mode별로 집계합니다. 과거 Queue Event를 Replay해 알고리즘 변경 효과를 사전 검증합니다.

## 13. 핵심 요약

- Matchmaking은 실력(MMR)·Ping·대기 시간·서버 용량을 균형 있게 최적화하는 과정이다.
- Ticket에는 Player/Party ID·Mode·Region·MMR·역할·Idempotency Key·Version이 포함된다.
- 처음에는 좁은 조건으로 시작하고 대기 시간에 따라 MMR 범위와 Ping 허용치를 단계적으로 확장한다.
- Ticket Claim은 Redis Lua Script 등으로 원자적으로 수행해 이중 매칭을 방지한다.
- Claim Lease 만료 시 Ticket이 자동으로 Queue에 복귀한다.
- Server Capacity는 Match 확정 전에 TTL로 선점하고 예약 실패 시 Ticket을 재배치한다.
- MMR은 서버가 계산하고 클라이언트가 제출하지 못하게 해 조작을 방지한다.
- 대기 시간 p95·예상 승률 분포·취소율·예약 실패율을 Region·Mode별로 집계한다.

## 한 줄 정리

> Matchmaking은 MMR·Ping·대기 시간·서버 용량을 균형 있게 최적화하며, 시간 기반 범위 확장과 원자적 Ticket Claim으로 공정성과 대기 시간을 모두 관리한다.
