---
difficulty: 3
reading_time: 25분
interview_frequency: 5
importance: 5
---

# 03. Game Loop와 Tick


## 학습 목표

- Tick p99가 급등했을 때 Phase별 지표(입력 Queue 깊이·Combat 연산·Timer 만료 수·Snapshot Fan-out)로 병목 System을 특정하고, Catch-up 횟수 상한·낮은 우선순위 이월·Drop 중 Overrun 처리 방식을 결정할 수 있다.
- Buff 만료·Respawn Timer가 같은 Tick에 집중되는 Burst를 진단하고, Timer 수와 만료 패턴을 기준으로 Min Heap·Timing Wheel·Jitter 분산 중 적합한 구조를 결정할 수 있다.
- Simulation Tick Rate(30Hz)와 Snapshot 전송 주기(10Hz)를 분리하는 Trade-off를 진단하고, Client Interpolation 끊김·Bandwidth·일관성 요구를 기준으로 분리 비율과 Reliable 채널 적용 대상을 결정할 수 있다.
- Tick Thread가 DB 쓰기·I/O를 동기로 호출해 p99가 높아지는 상황을 진단하고, 외부 Worker 분리·Outbox Queue·Command Buffer 경계 중 장애 격리와 결정론 유지를 동시에 달성하는 패턴을 결정할 수 있다.

## 1. 개요
게임 루프는 입력 처리, Simulation, 상태 전파를 반복하며 Tick은 서버가 논리 상태를 갱신하는 한 주기다.

## 2. 왜 필요한가
동시 입력을 일관된 순서와 시간 기준으로 처리하고 부하와 네트워크 전송률을 제어한다. 게임 서버는 정확성뿐 아니라 제한 시간 안의 처리와 장애 후 복구를 함께 제공해야 한다.

## 3. 핵심 동작 원리
```text
collect inputs→simulate fixed dt→produce events/snapshot→sleep/catch-up→next tick
```
고정 Tick은 재현과 물리 안정성이 좋고 가변 dt는 실제 경과를 반영하지만 큰 dt에 불안정할 수 있다. Simulation Tick Rate와 Network Send Rate는 다르게 설정할 수 있다.

상태의 최종 소유자, Message 순서, Timeout과 실패 후 재처리 기준을 명시한다.

### Fixed Tick

Game Server는 일정 간격마다 입력을 수집하고 Simulation을 진행해 결과를 전송한다.

```text
Tick Start
  → queued input 적용
  → AI·Movement·Combat
  → 상태 변경 수집
  → Snapshot·Event 전송
Tick End
```

20 Hz면 Tick 간격은 50ms, 60 Hz면 약 16.67ms다. 높은 Tick Rate는 반응과 시간 해상도를 높이지만 CPU(Central Processing Unit)·Network 비용도 증가한다.

### Fixed와 Variable Delta

Fixed Delta는 같은 입력 Sequence에서 결정적 Simulation과 튜닝을 돕는다. Variable Delta는 실제 경과 시간을 사용하지만 부하 Spike가 Physics 안정성과 결과에 영향을 줄 수 있다.

Server는 Monotonic Clock으로 경과 시간을 측정한다. Wall Clock은 시간 보정으로 뒤로 갈 수 있어 Tick 간격에 부적합하다.

### Overrun과 Catch-up

Tick 작업이 Budget을 넘으면 다음 Tick이 늦어진다.

```text
Budget 50ms
Work   80ms
→ 30ms Overrun
```

밀린 Tick을 한꺼번에 반복하면 더 밀리는 Spiral of Death가 생길 수 있다. Catch-up 횟수 상한, 낮은 우선순위 작업 이월, Simulation 품질 저하와 Overload Admission을 설계한다. 시간을 건너뛰면 게임 규칙이 바뀔 수 있어 어떤 작업이 생략 가능한지 분류한다.

### Tick Phase와 순서

System 순서가 결과에 영향을 준다. Movement 후 Hit 판정인지, Damage 후 Death 처리인지 명시한다.

```text
Input → Movement → Collision → Combat → Death → Replication
```

같은 Phase에서 Container를 순회하며 즉시 Entity를 삭제하면 Iterator가 무효화될 수 있다. Command Buffer에 생성·삭제를 모아 안전한 경계에 적용한다.

### 입력 Queue

Network Thread가 입력을 받아 Session별 Sequence로 Queue에 넣고 Game Thread가 Tick 경계에서 처리할 수 있다. 미래 입력, 지나치게 오래된 입력과 한 Client의 폭주를 제한한다.

한 Tick에 모든 누적 Packet을 처리하면 공격자가 Budget을 독점할 수 있다. Session·Room별 입력 상한과 공정한 Scheduling이 필요하다.

### Timer

Buff 만료·Respawn은 절대 Wall-clock 조회를 곳곳에서 하는 대신 Tick 기반 Deadline이나 Monotonic 시간 Min Heap·Timing Wheel로 관리한다. 많은 Timer가 같은 Tick에 만료되는 Burst를 고려한다.

Tick Count는 Wraparound와 Server 재시작을 고려하고, 영속 Deadline은 UTC Timestamp와 별도로 저장할 수 있다.

### 결정성과 Replay

동일 초기 State, 입력 Sequence와 Random Seed에서 같은 결과를 만들면 장애 재현과 Replay에 유리하다. 비결정 요소는 다음과 같다.

- Unordered Container 순회
- Thread 실행 순서
- Floating Point Platform 차이
- Wall Clock·외부 Service 응답
- Random Seed 누락

완전한 Cross-platform 결정성이 필요하지 않아도 Input·중요 Event와 Version을 기록해 진단 가능하게 한다.

### Multi-thread Simulation

System을 병렬화하면 Barrier와 의존성이 생긴다. Read-only Snapshot, Spatial Partition과 Job Graph로 충돌을 줄인다. 작은 Job을 너무 많이 만들면 Queue·Synchronization 비용이 커진다.

World State를 한 Thread가 소유하고 I/O(Input/Output)·Persistence만 외부 Worker로 분리하는 구조는 단순한 출발점이다. Profile에서 CPU 병목이 확인된 뒤 병렬화한다.

### Replication 주기

Simulation Tick과 Network Snapshot 전송 주기는 같을 필요가 없다. 60 Hz Simulation, 20 Hz Snapshot처럼 Bandwidth를 절약하고 Client가 Interpolation할 수 있다. 중요 Event는 별도 Reliable Channel로 즉시 보낼 수 있다.

### 측정

평균 Tick뿐 아니라 Phase별 p95·p99·Max, Overrun Rate, Queue Depth, Entity 수, Timer 만료 수와 GC·Allocation을 같은 Timeline으로 본다. 한 Tick Spike의 입력·Room·System을 Trace할 수 있어야 한다.

### 실무 설계 검토 체크리스트

- **Tick Rate**: Tick Rate의 입력이 어디서 생성되고 어느 실행 흐름이 상태를 소유하는지 먼저 정한다. 다른 구성 요소는 상태를 직접 고치지 않고 명시된 경계를 통해 요청한다.
- **Fixed Delta**: Fixed Delta의 정상 처리 순서를 Diagram으로 확인한다. 중간 단계가 실패했을 때 이미 반영된 상태와 다시 수행해도 되는 작업을 구분한다.
- **입력 수집**: 입력 수집에 적용할 최대 개수, Byte 또는 시간 한도를 정한다. 한도를 넘으면 대기, 거절, Drop 가운데 업무 의미에 맞는 정책을 사용한다.
- **Simulation Phase**: Simulation Phase 관련 Message에는 중복과 역순을 식별할 Sequence나 Version이 필요한지 판단한다. 오래된 작업이 새 Session 상태를 덮지 않게 한다.
- **Timer**: Timer가 느려질 때 상위 Queue와 호출자까지 지연이 전파되는 경로를 확인한다. Timeout과 Backpressure가 연쇄 Retry를 만들지 않게 한다.
- **Tick Overrun**: Tick Overrun의 평균 처리량만으로 용량을 결정하지 않는다. Peak 부하에서 p95·p99 지연, Memory와 Queue 깊이가 허용 범위인지 측정한다.
- **Catch-up 상한**: Catch-up 상한를 Client가 주장할 수 있다면 Server가 다시 계산하거나 검증할 항목을 정한다. 허용 오차와 반복 위반 처리 기준도 기록한다.
- **Spiral 방지**: Spiral 방지 변경은 이전 Client나 Server와 동시에 존재할 수 있다. Version 협상, 기본값과 단계적 배포로 전후 호환성을 확인한다.
- **Worker 병렬화**: Worker 병렬화 장애를 재현하는 Test를 만든다. Timeout, 연결 종료, 중복 Callback과 Process 재시작 뒤에도 자원과 상태가 한 번만 정리되는지 확인한다.
- **상태 Snapshot**: 상태 Snapshot 관련 Log에는 Match·Session·Sequence 같은 추적 Key를 남긴다. 민감 정보는 제외하고 원인 판별에 필요한 지표와 함께 조회한다.
- **Interest Management**: Interest Management 최적화는 실제 Profile 결과를 근거로 적용한다. CPU를 줄이는 대신 Memory, 복사 감소 대신 Lifetime 복잡도가 늘 수 있음을 비교한다.
- **GC Pause**: GC Pause의 Owner를 배포 중 교체할 때 새 요청 차단, 진행 작업 Drain과 상태 이전 순서를 정의한다. 구 Version Callback은 식별 후 폐기한다.
- **시간 동기화**: 시간 동기화 결과가 영속 데이터나 외부 서비스에 반영되면 성공 응답의 기준을 정한다. 불확실한 결과는 조회와 Reconciliation으로 확정한다.
- **결정론**: 결정론 기능을 독립 Service나 Thread로 분리할지는 확장과 장애 격리 이득으로 판단한다. Network·Queue 이동과 운영 비용도 함께 계산한다.
- **Tick 지표**: Tick 지표 정책은 정상 사용자 경험과 악용 방지를 함께 고려한다. 너무 넓은 허용 범위와 지나치게 엄격한 오탐 사이를 실제 분포로 조정한다.

이 항목은 Game Loop와 Tick 설계 Review에서 실제 요구와 실패 조건을 빠뜨리지 않기 위한 기준이다. 모든 장치를 일괄 적용하지 않고 측정된 위험과 운영 목표에 필요한 항목만 선택한다.
### 장애 시나리오 연습

Game Loop와 Tick은 정상 경로만 구현해서는 운영 준비가 끝나지 않는다. 다음 상황을 부하·Network Simulator와 장애 주입 Test로 재현한다.

- **Tick Rate**: Tick Rate 요청이 정상 처리됐지만 응답만 손실된 상황을 가정한다. 호출자가 재시도해도 같은 상태 변경이 두 번 발생하지 않도록 Sequence, Version 또는 Idempotency Key를 둔다.
- **Fixed Delta**: Fixed Delta 처리 시간이 평소의 열 배로 증가한 상황을 재현한다. 제한 Queue, Timeout과 Admission Control이 다른 Session과 Tick까지 지연을 퍼뜨리지 않는지 확인한다.
- **입력 수집**: 입력 수집 Owner가 배포나 장애로 사라진 상황을 Test한다. 새 Owner 선택, 진행 중 작업 처리와 구 Callback 폐기 순서가 명확해야 한다.
- **Simulation Phase**: Simulation Phase 입력이 최대 크기, 빈 값, 오래된 Timestamp와 잘못된 Enum을 포함하는 경우를 검증한다. 실패한 입력이 부분 상태를 남기거나 Process를 종료시키면 안 된다.
- **Timer**: Timer 관련 Message가 중복·역순·지연 도착하는 Network 조건을 주입한다. 최종 상태가 순서 정책과 허용 Window에 맞는지 Replay로 비교한다.
- **Tick Overrun**: Tick Overrun Capacity가 모두 사용된 Peak 상황에서 대기 시간을 무제한 늘리지 않는다. 업무 중요도에 따른 거절·Drop과 Client 재시도 안내가 함께 동작해야 한다.
- **Catch-up 상한**: Catch-up 상한 복구 뒤 상태가 맞는지 원본 Event, Snapshot 또는 DB와 대조한다. 자동 복구가 불가능한 차이는 경고와 수동 Reconciliation 대상으로 남긴다.

Game Loop와 Tick에서는 각 Test는 성공 여부만 기록하지 않는다. 처리 시간 분포, Queue 최대치, Drop·Retry 수와 복구 소요 시간을 남겨 다음 배포의 기준값으로 사용한다.

## 4. 쉬운 예시: Tick Loop 설계와 Overrun 방지

**20Hz Tick Loop — Catch-up 상한 포함 의사코드**

```python
def tick_loop(hz=20):
    tick_ms = 1000 / hz          # 50ms per tick
    next_tick = monotonic_now()
    catch_up_limit = 3           # 최대 3 Tick 따라잡기

    while running:
        now = monotonic_now()
        behind = now - next_tick

        # Overrun: 최대 catch_up_limit번만 연속 실행
        runs = min(int(behind / tick_ms) + 1, catch_up_limit)
        for _ in range(runs):
            inputs = drain_input_queue(per_session_limit=10)  # 세션별 입력 상한
            simulate(inputs, dt=tick_ms)
            if tick_number % 3 == 0:   # 20Hz Sim, ~6Hz Snapshot
                send_snapshot()
            tick_number += 1

        next_tick += runs * tick_ms
        sleep_until(next_tick)
```

`catch_up_limit=3`이면 서버가 150ms 이상 밀려도 3번 이후는 포기하고 시간을 건너뛴다. Spiral of Death를 방지하되, 건너뛴 Tick 수를 경고 지표로 기록한다.

## 5. 비슷한 개념과 비교

| 구분 | Fixed Tick | Variable Delta |
|------|-----------|----------------|
| 결정론 | 보장 (같은 입력→같은 결과) | 불확실 (부동소수점 오차 누적) |
| Overrun 처리 | Catch-up 횟수 상한 필요 | Delta clamp으로 제어 |
| 물리 안정성 | 높음 (고정 적분 간격) | 낮음 (큰 Delta에서 발산 가능) |
| Replay·디버깅 | 쉬움 (Input·Seed 기록) | 어려움 (타이밍 재현 불가) |
| CPU 예측 | 일정 | 부하 Spike에 따라 가변 |
| 적합한 경우 | Competitive·MMORPG(Massively Multiplayer Online Role-Playing Game) | PvE Casual·Demo |
| Snapshot 분리 | 용이 (Tick/Snapshot Rate 독립) | 복잡 (Delta 기반 전송 기준 모호) |

## 6. 장점과 단점

### Game Loop·Fixed Tick의 장점

- 결정론: 같은 입력 Sequence·Seed에서 항상 같은 결과 → Replay·버그 재현 가능
- Overrun 제어: Catch-up 상한으로 Spiral of Death 방지
- Simulation/Snapshot 분리: CPU·Bandwidth를 독립적으로 제어
- Phase 순서 명시: Input→Movement→Combat→Death→Replication으로 상태 불변식 유지

### Game Loop·Fixed Tick의 단점

- Tick Budget 초과 시 전체 Session 지연 전파
- Timer Burst: 같은 Tick에 만료 집중 → Tick 편중 발생
- 높은 Tick Rate는 CPU·Network 비용 비례 증가
- 멀티코어 병렬화 시 Barrier·의존성 관리 복잡도 증가

## 7. 게임 서버·백엔드 실무 예시
30Hz Simulation에서 입력을 Sequence 순으로 처리하고 Snapshot은 10~20Hz로 보낼 수 있다. Tick Overrun 시 무제한 따라잡기보다 작업 예산, 품질 저하와 경고를 둔다.

Game Loop와 Tick 관점에서는 운영에서는 연결 수, Packet Rate, Queue 길이, Tick p99, Drop·Retry, Memory와 Thread 고갈을 같은 시간축에서 본다.

## 8. 자주 하는 오해

- **Tick Rate를 높이면 항상 게임 품질이 좋아진다**: 네트워크 트래픽·CPU·서버 비용이 비례해 증가하므로 장르와 요구에 맞게 선택해야 한다.
- **Fixed Delta를 쓰면 실시간성이 항상 보장된다**: Tick 처리 시간이 Delta를 초과하면 지연이 누적되어 Tick이 밀린다.
- **Tick 중 예외가 발생하면 해당 Tick을 스킵하면 된다**: State 불일치와 누적 오류가 발생할 수 있으므로 예외를 유발한 Command를 격리·Drop하고 안전한 복구 전략이 필요하다.
- **Timer는 시스템 시계를 그대로 사용하면 된다**: NTP(Network Time Protocol) 조정·DST(Daylight Saving Time)·모노토닉 보장이 없으면 시간이 역행하거나 불연속해질 수 있다.
- **서버와 클라이언트 Tick이 다르면 동기화가 불가능하다**: 서버 Tick과 클라이언트 렌더링 프레임은 분리 운영하며 Snapshot 전송과 Interpolation으로 동기화한다.
- **Catch-up을 무제한 허용하면 항상 따라잡을 수 있다**: Catch-up이 늘수록 부하가 증가해 다음 Tick도 Budget을 초과하는 Spiral of Death가 발생한다.
- **Tick Thread에서 DB 쓰기를 하면 일관성이 높아진다**: 동기 I/O가 Tick Thread를 블로킹해 p99가 수백 ms로 급등한다. Outbox Queue나 비동기 Worker로 분리해야 한다.

## 9. 면접 질문

### Q1. 배포 직후 Tick p99가 50ms에서 150ms로 급등했습니다. 원인을 특정하기 위해 어떤 지표를 어떤 순서로 확인하나요?

Phase별로 좁혀 나갑니다. (1) **입력 Queue 깊이**: 특정 Room·Session의 Queue가 폭발했는지 확인. (2) **Tick Phase 분포(Prometheus Histogram)**: Input→Movement→Combat→Replication 중 어느 Phase가 급증했는지 비교. (3) **Timer 만료 수**: 배포 시점에 Buff 만료·이벤트가 집중됐는지 확인. (4) **GC·Allocation**: C# JVM이면 Gen2 GC Pause, C++이면 jemalloc RSS 급증 여부. (5) **I/O 레이턴시**: Tick Thread에서 동기 DB·파일 쓰기가 추가됐는지 코드 diff와 Trace를 대조합니다.

### Q2. 30Hz 게임 서버에서 Catch-up 횟수 제한 없이 설계했을 때 어떤 장애가 발생하고, Spiral of Death를 방지하는 설계를 설명하세요.

Tick 처리가 Budget(33ms)을 초과하면 다음 Tick도 늦게 시작하고, 그 Tick도 초과하면 끝없이 밀리는 Spiral of Death가 발생합니다. 방지 설계: (1) Catch-up 상한 설정(예: 최대 3번). 3번을 초과하면 그 이후 Tick은 건너뛰고 경고 지표를 기록. (2) 낮은 우선순위 Phase(AI 경로 재계산 등)를 다음 Tick으로 이월. (3) Session별 입력 상한(예: Session당 Tick당 최대 10 Packet)으로 단일 Session의 Budget 독점 차단. (4) Tick Overrun Rate가 임계값(예: 5%)을 넘으면 신규 Room 생성을 Admission Control로 거절.

### Q3. 특정 Room의 Combat 연산이 Tick당 40ms를 차지해 전체 서버 p99에 영향을 줬습니다. 이 Room을 다른 Room과 격리하는 설계 방법을 설명하세요.

Room별 연산 시간 상한(Budget)을 설정합니다. (1) **Phase 시간 측정**: 매 Tick마다 Room별 Combat Phase 소요를 Histogram으로 기록. (2) **Budget 초과 감지**: 특정 Room이 Tick Budget의 50% 이상을 소비하면 해당 Room을 별도 Worker Thread 또는 별도 Process로 이전 대상으로 마킹. (3) **Room 격리**: Hot Room을 전용 Core·Pod로 마이그레이션하거나, 초과 Entity(ex: 100명 초과 Raid Room)는 별도 Process로 Fork. (4) **Backpressure**: 격리 대기 중에는 해당 Room의 신규 Entity 입장을 Admission Control로 제한.

### Q4. 60Hz Simulation + 20Hz Snapshot 분리 서버에서 클라이언트 화면에 Interpolation 끊김(Judder)이 발생했습니다. 원인과 대응 방법을 설명하세요.

Snapshot 전송이 20Hz(50ms 주기)로 고르지 않게 도착하면 Client Interpolation 버퍼가 비어 끊김이 발생합니다. 원인 진단: (1) Snapshot 전송 간격 분포 측정 — 50ms가 아닌 70ms·80ms 간격이 섞이는지. (2) Network Jitter vs 서버 Overrun 구분 — Tick p99와 Snapshot 전송 타임스탬프를 대조. 대응: (1) Snapshot 전송 스케줄을 Tick 완료 후 즉시 전송이 아닌 독립 타이머로 분리. (2) Client Buffer를 2~3 Snapshot 크기로 설정해 Jitter를 흡수. (3) Reliable Channel로 전송하는 중요 Event(사망·스킬 결과)와 Snapshot을 별도 채널로 분리해 Snapshot 지연이 Event 수신을 막지 않도록 설계.

### Q5. 이벤트 서버에서 Buff 만료 Timer 10만 개가 같은 Tick에 집중 만료되어 Tick Budget을 초과했습니다. 어떻게 분산 처리하나요?

Timer 등록 시 Jitter를 추가해 만료를 분산합니다. (1) **Jitter 주입**: `expire_at = base_time + random(0, tick_ms)` — 같은 이벤트로 생성된 Buff라도 ±1 Tick 범위에서 만료 시각을 분산. (2) **Timing Wheel**: Timer 수가 수만 개면 Min Heap의 O(log n) 대신 Timing Wheel(O(1) 삽입·만료)로 교체 검토. (3) **만료 예산**: Tick당 처리 Timer 수 상한(예: 1,000개)을 두고 초과분은 다음 Tick으로 이월. 만료 지연이 게임 규칙에 영향을 주지 않는 범위(1~2 Tick = 50~100ms)인지 기획팀과 합의. (4) **모니터링**: 같은 Tick에 만료된 Timer 수 Histogram을 기록해 이벤트 설계 시 Burst 위험을 사전 탐지.

### Q6. Tick Thread에서 DB 쓰기를 동기로 호출하다 p99가 50ms→300ms로 급등했습니다. I/O를 Tick Thread 밖으로 분리하는 패턴을 설명하세요.

Outbox Queue 패턴을 적용합니다. (1) **Tick Thread**: 상태 변경을 메모리에만 반영하고, 영속이 필요한 이벤트(아이템 획득·매치 결과)는 인메모리 Outbox Queue에 삽입. (2) **Persistence Worker**: 별도 Thread·Coroutine이 Outbox를 소비해 DB에 비동기 쓰기. 쓰기 실패 시 재시도·Dead Letter Queue로 격리. (3) **보장 수준**: Tick Thread는 쓰기 완료를 기다리지 않으므로 서버 재시작 시 Outbox에 남은 항목을 재처리하는 At-least-once 설계 필요. Idempotency Key로 중복 방지. (4) **모니터링**: Outbox Queue 깊이·Worker 처리 지연을 Tick p99와 같은 대시보드에서 확인.

## 10. 예상 꼬리질문

- Tick p99가 특정 Room에서만 높고 다른 Room은 정상일 때, 단일 서버에서 해당 Room을 격리하는 방법과 한계는 무엇인가요?
  > 해당 Room을 전용 Worker Thread 또는 별도 프로세스로 이동시켜 다른 Room의 Tick 예산을 보호합니다. 단일 서버 내 격리는 같은 CPU·메모리 자원을 공유하므로 극단적 부하는 결국 전체 서버에 영향을 줍니다. 근본 해결은 Room을 별도 서버로 이전하거나 Tick 내 Object 수 상한을 강제하는 것입니다.
- 20Hz Tick 서버에서 Session당 Tick당 10 Packet 상한을 설정했는데 정상 플레이어가 빠른 입력으로 Drop되는 민원이 발생했습니다. 상한 기준을 어떻게 재조정하나요?
  > Tick Rate(20Hz)당 최대 합법적 입력 수를 실제 클라이언트 로그(p99)로 측정한 뒤 여유 계수(1.5~2배)를 곱해 상한을 재설정합니다. 고정 상한 대신 슬라이딩 윈도우(초당 누적) 방식으로 전환하면 짧은 Burst는 허용하면서 지속적 과다 입력만 차단할 수 있습니다.
- Timer 10만 개를 Min Heap으로 관리하다 만료 Burst가 발생했습니다. Timing Wheel로 전환하는 기준(Timer 수·만료 패턴)과 구현 시 주의사항은 무엇인가요?
  > Timer 수가 수만 건을 초과하거나 만료가 특정 시각에 집중되는 패턴이면 Timing Wheel이 유리합니다. O(1) 삽입·삭제가 가능하지만, Wheel 해상도보다 정밀한 만료는 별도 처리가 필요하고 Wheel 크기(슬롯 수)와 해상도(tick 단위)를 예상 Timer 분포에 맞게 설계해야 합니다.
- Outbox Worker가 DB 쓰기를 처리 못 해 Queue가 100만 건 누적됐습니다. Tick Thread 영향 없이 백압력을 거는 방법은 무엇인가요?
  > Outbox Queue에 용량 상한(예: 10만 건)을 두고, 초과 시 Tick Thread가 비핵심 이벤트 생성을 줄이거나 Drop하도록 신호를 보냅니다. Tick Thread 자체를 블로킹하지 않으며, Queue 수위를 모니터링 지표로 노출해 DB 처리 지연을 조기에 감지합니다.
- Snapshot 20Hz 분리 서버에서 네트워크 지연이 100ms일 때 Client Interpolation Buffer를 몇 개로 설정해야 끊김 없이 동작하나요? 계산 근거를 설명해 주세요.
  > Snapshot 간격 50ms(20Hz), 네트워크 지연 100ms이면 최소 2~3 Snapshot이 항상 Buffer에 있어야 합니다. 일반적으로 지연의 2배÷Snapshot 간격 + 1 여유분, 즉 약 5프레임을 권장합니다. Jitter가 크면 Jitter 표준편차도 더해 Buffer 크기를 결정합니다.
- Catch-up 상한 3회로 설정했는데 서버 부하 급증 시 3회 초과 후 건너뛴 Tick의 Combat 결과(사망 판정 등)를 어떻게 처리해야 플레이어 불만을 최소화하나요?
  > 건너뛴 Tick의 사망·피격 판정은 서버 권위 기준으로 확정하되, 클라이언트에 지연 알림이나 회색 화면으로 시각 피드백을 줍니다. Critical 판정(사망)은 건너뛰지 않고 다음 Tick에 누적 처리하는 별도 우선 큐를 두거나, 해당 판정을 Catch-up 예외 대상으로 분류해 반드시 실행합니다.
- Tick Thread와 Persistence Worker 분리 후 서버 재시작 시 Outbox에 남은 이벤트가 DB에 이미 반영된 경우 중복 쓰기를 방지하는 Idempotency Key 설계를 설명해 주세요.
  > 각 이벤트에 전역 고유 `event_id`(UUID 또는 Tick 번호+시퀀스)를 부여하고, DB Upsert 시 이를 Primary Key로 사용합니다. 이미 반영된 `event_id`는 UNIQUE 제약으로 중복 삽입이 거부됩니다. Outbox 레코드는 DB 반영 확인 후 삭제하거나 `processed` 상태로 표시해 재처리를 방지합니다.

## 11. 30초 모범답변

> Game Loop는 입력·Simulation·전파를 반복하고, Tick은 논리 시간 단위입니다. Fixed Tick Rate로 결정론적 시뮬레이션을 보장하고, Catch-up 상한으로 Spiral of Death를 방지합니다. Simulation은 30Hz 내외, Snapshot 전송은 10~20Hz로 분리해 트래픽을 제어하고, DB 쓰기는 Outbox Queue로 Tick Thread 밖에서 처리합니다.

## 12. 1~2분 확장답변

> Game Loop는 입력 처리·Simulation·Snapshot 전파를 고정 주기(Tick)로 반복합니다. Fixed Tick Rate를 쓰면 같은 입력을 Replay했을 때 같은 결과를 얻을 수 있어 결정론적 시뮬레이션과 버그 재현이 쉬워집니다.
>
> Tick 처리 시간이 Budget을 초과하는 Overrun이 생기면 밀린 Tick을 무제한으로 따라잡으면 Spiral of Death가 됩니다. Catch-up 횟수를 3회로 제한하고, Session당 Tick당 입력 상한으로 Budget 독점을 막습니다. Tick p99와 Overrun 횟수를 Traffic과 함께 봐야 Spike 원인을 찾을 수 있습니다.
>
> Simulation Tick Rate(30Hz)와 Snapshot 전송 주파수(10Hz)를 분리하면 내부 논리 일관성을 유지하면서 네트워크 트래픽을 제어할 수 있습니다. DB 쓰기는 Outbox Queue를 통해 별도 Worker가 처리해 Tick Thread를 블로킹하지 않습니다.

## 13. 핵심 요약

- Game Loop는 입력·Simulation·전파를 고정 Tick Rate로 반복하는 서버의 주 실행 구조다.
- Fixed Delta는 결정론적 시뮬레이션과 Replay를 가능하게 한다.
- Catch-up 횟수 상한으로 Overrun 시 Spiral of Death를 방지한다.
- Simulation Tick Rate(20~60Hz)와 Snapshot 전송(10~20Hz)을 분리해 트래픽을 제어한다.
- Client Timestamp를 신뢰하지 않으며 단조 증가 Server Clock으로 허용 Window를 설정한다.
- DB 쓰기는 Outbox Queue·비동기 Worker로 분리해 Tick Thread 블로킹을 방지한다.
- Tick p99, Overrun 횟수, Queue 깊이를 Traffic과 같은 시간축으로 모니터링한다.

## 한 줄 정리

> Game Loop는 입력·Simulation·전파를 Fixed Tick으로 반복하며, Catch-up 상한·Snapshot Rate 분리·Outbox Worker로 Tick Thread 지연을 제어한다.
