---
difficulty: 3
reading_time: 25분
interview_frequency: 5
importance: 5
---

# 03. Game Loop와 Tick

> 게임 서버·백엔드 개발자를 위한 CS 면접 교재

## 학습 목표

- Game Loop의 입력·Simulation·전파 단계 분리 원리를 설명할 수 있다.
- Fixed Tick과 Tick Budget이 일관성에 미치는 영향을 설명할 수 있다.
- Tick Overrun 발생 시 처리 전략과 모니터링 지표를 설명할 수 있다.
- Simulation Tick Rate와 Snapshot 전송 주파수를 분리하는 이유를 설명할 수 있다.

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

20 Hz면 Tick 간격은 50ms, 60 Hz면 약 16.67ms다. 높은 Tick Rate는 반응과 시간 해상도를 높이지만 CPU·Network 비용도 증가한다.

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

World State를 한 Thread가 소유하고 I/O·Persistence만 외부 Worker로 분리하는 구조는 단순한 출발점이다. Profile에서 CPU 병목이 확인된 뒤 병렬화한다.

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

## 4. 쉬운 예시
20Hz 서버는 50ms마다 입력 수집, Simulation, 결과 전파를 수행한다. 한 Tick이 70ms 걸렸다면 무제한 Catch-up으로 반복하지 않고 초과 Phase를 측정해 작업량이나 품질을 조절한다.

## 5. 비슷한 개념과 비교
고정 Tick은 규칙 재현과 시간 계산이 쉽지만 Overrun 관리가 필요하다. 가변 시간은 실제 경과를 반영하지만 큰 Delta와 결과 차이를 제한해야 한다.
## 6. 장점과 단점
Game Loop와 Tick을 올바르게 적용하면 상태와 처리 책임이 명확해지고 Peak 부하와 장애에 대한 예측 가능성이 높아진다. 반면 Tick Rate, Fixed Delta와 입력 수집 정책을 잘못 정하면 지연, 상태 불일치 또는 운영 복잡도가 늘어난다. 실제 요구와 측정 결과를 기준으로 필요한 범위만 적용한다.
## 7. 게임 서버·백엔드 실무 예시
30Hz Simulation에서 입력을 sequence 순으로 처리하고 Snapshot은 10~20Hz로 보낼 수 있다. Tick Overrun 시 무제한 따라잡기보다 작업 예산, 품질 저하와 경고를 둔다.

Game Loop와 Tick 관점에서는 운영에서는 연결 수, Packet Rate, Queue 길이, Tick p99, Drop·Retry, Memory와 Thread 고갈을 같은 시간축에서 본다.

## 8. 자주 하는 오해
- Tick Rate를 높이면 항상 게임 품질이 좋아진다고 생각한다. 네트워크 트래픽, CPU 사용량, 서버 비용이 비례해서 증가하므로 장르와 요구에 맞게 선택해야 한다.
- Fixed Delta를 쓰면 실시간성이 항상 보장된다고 생각한다. Tick 처리 시간이 Delta를 초과하면 지연이 누적되어 틱이 밀린다.
- Tick 중 예외가 발생하면 해당 Tick을 스킵하면 된다고 생각한다. State 불일치와 누적 오류가 발생할 수 있으므로 안전한 복구 전략이 필요하다.
- Timer는 시스템 시계를 그대로 사용하면 된다고 생각한다. NTP 조정, DST, 모노토닉 클럭 보장이 없으면 시간이 역행하거나 불연속해질 수 있다.
- 서버와 클라이언트 Tick이 다르면 동기화가 불가능하다고 생각한다. 서버 Tick과 클라이언트 렌더링 프레임은 분리 운영하며 Snapshot 전송으로 동기화한다.
## 9. 면접 질문

### Q1. Game Loop와 Tick을 설명해 주세요.
Game Loop는 입력 처리·Simulation·상태 전파를 반복하는 서버의 주 실행 구조입니다. Tick은 서버가 논리 상태를 한 번 갱신하는 주기이며, Fixed Tick Rate를 사용하면 결정론적 시뮬레이션과 일관된 처리가 가능합니다.

### Q2. Fixed Tick을 쓰는 이유는 무엇인가요?
Tick마다 경과 시간이 고정되면 같은 입력 Sequence를 Replay할 때 같은 결과를 얻을 수 있습니다. Variable Delta는 구현이 단순하지만 부동소수점 오차 누적과 결정론 보장이 어렵습니다.

### Q3. Tick Overrun이 발생하면 어떻게 처리하나요?
처리 시간이 Tick Budget을 초과하면 밀린 Tick을 무제한으로 따라잡으면 연쇄 지연이 됩니다. 최대 따라잡기 횟수를 제한하고 초과분은 Drop·Slow·경고로 처리하며, Tick p99와 Overrun 발생 횟수를 모니터링합니다.

### Q4. Simulation Tick Rate와 Snapshot 전송 주파수를 왜 분리하나요?
Simulation은 30~64Hz로 내부 논리 일관성을 유지하고, Snapshot 전송은 10~20Hz로 네트워크 트래픽을 제어합니다. 두 주파수가 같으면 트래픽과 CPU 부하가 커지고 수신 측도 Delta 보간이 어렵습니다.

### Q5. Tick 중 예외가 발생하면 어떻게 처리해야 하나요?
Tick 전체를 스킵하면 상태 불일치와 누적 오류가 생깁니다. 예외를 유발한 개별 Command를 격리·Drop하고 Room State를 안전한 마지막 Snapshot으로 복원하거나 Room을 종료합니다.

### Q6. 서버 Tick Time과 Client Time 불일치를 어떻게 다루나요?
Client Timestamp를 그대로 신뢰하지 않습니다. Server Time 기준으로 허용 Window를 설정하고 범위를 벗어난 입력을 Drop·Clamp합니다. NTP 대신 단조 증가 Clock(steady_clock, Environment.TickCount64)을 써서 역행을 방지합니다.

## 10. 예상 꼬리질문

- Variable Delta와 Fixed Delta의 결정론 보장 차이는 무엇인가요?
- Tick Budget을 초과하는 무거운 AI 계산은 어떻게 분리하나요?
- Snapshot 주파수가 낮을 때 Client 보간을 어떻게 구현하나요?
- Tick Thread와 I/O Thread를 분리하는 이유는 무엇인가요?
- Game Loop를 멀티코어로 확장할 때 어떤 문제가 있나요?
- Tick p99가 급등하면 어떤 지표를 먼저 확인하나요?
- Deterministic Simulation이 필요한 게임 장르는 어떤 경우인가요?

## 11. 30초 모범답변

> Game Loop는 입력·Simulation·전파를 반복하고, Tick은 논리 시간 단위입니다. Fixed Tick Rate로 결정론적 시뮬레이션을 보장하고, Tick Budget을 설정해 Overrun 시 무제한 따라잡기를 막습니다. Simulation은 30Hz 내외, Snapshot 전송은 10~20Hz로 분리해 트래픽을 제어합니다.

## 12. 1~2분 확장답변

> Game Loop는 입력 처리·Simulation·Snapshot 전파를 고정 주기(Tick)로 반복합니다. Fixed Tick Rate를 쓰면 같은 입력을 Replay했을 때 같은 결과를 얻을 수 있어 결정론적 시뮬레이션과 버그 재현이 쉬워집니다.
>
> Tick 처리 시간이 Budget을 초과하는 Overrun이 생기면 밀린 Tick을 무제한으로 따라잡으면 연쇄 지연이 됩니다. 따라잡기 횟수를 제한하고 초과분은 Drop·Slow·경고로 처리합니다. Tick p99와 Overrun 횟수를 Traffic과 함께 봐야 Spike 원인을 찾을 수 있습니다.
>
> Simulation Tick Rate(30~64Hz)와 Snapshot 전송 주파수(10~20Hz)를 분리하면 내부 논리 일관성을 유지하면서 네트워크 트래픽을 제어할 수 있습니다. Client는 Snapshot 사이 구간을 보간해 부드럽게 표시합니다.

## 13. 핵심 요약

- Game Loop는 입력·Simulation·전파를 고정 Tick Rate로 반복하는 서버의 주 실행 구조다.
- Fixed Delta는 결정론적 시뮬레이션과 Replay를 가능하게 한다.
- Tick Budget을 설정하고 Overrun 시 무제한 따라잡기를 방지한다.
- Simulation Tick Rate(30~64Hz)와 Snapshot 전송(10~20Hz)을 분리해 트래픽을 제어한다.
- Client Timestamp를 신뢰하지 않으며 단조 증가 Server Clock으로 허용 Window를 설정한다.
- Tick Thread는 I/O Thread와 분리해 Blocking이 Simulation에 영향을 주지 않게 한다.
- Tick p99, Overrun 횟수, Queue 깊이를 Traffic과 같은 시간축으로 모니터링한다.

## 한 줄 정리

> Game Loop는 입력·Simulation·전파를 Fixed Tick으로 반복하며, Tick Budget과 Tick/Snapshot Rate 분리로 일관성·지연·트래픽을 제어한다.
