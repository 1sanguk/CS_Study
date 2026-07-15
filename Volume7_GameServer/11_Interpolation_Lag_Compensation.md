---
difficulty: 4
reading_time: 25분
interview_frequency: 5
importance: 5
---

# 11. Interpolation과 Lag Compensation

> 게임 서버·백엔드 개발자를 위한 CS 면접 교재

## 학습 목표
- 핵심 원리와 등장 이유를 설명할 수 있다.
- 정확성·지연·운영 Trade-off를 설명할 수 있다.
- 게임 서버 설계와 장애 대응에 적용할 수 있다.

## 1. 개요
Interpolation은 과거 Snapshot 사이를 보간해 원격 객체를 부드럽게 표시하고 Lag Compensation은 과거 시점 상태를 기준으로 행동을 판정해 지연 영향을 보정한다.

## 2. 왜 필요한가
Network Snapshot은 불규칙하고 늦게 도착하므로 화면 떨림과 고지연 사용자의 불리함을 줄인다. 사용자 경험을 개선하더라도 서버 권위와 복구 가능성을 훼손하지 않아야 한다.

## 3. 핵심 동작 원리
```text
snapshots t0,t1 buffer→render t0+alpha / fire clientTime→server rewind history→ray test→restore
```
Interpolation은 의도적으로 약간 과거를 보여 지연을 추가한다. Extrapolation은 미래를 예측해 오차 위험이 있다. Lag Compensation은 공격자 경험을 개선하지만 피해자 관점의 부당함과 악용 제한이 필요하다.

Interpolation과 Lag Compensation 관점에서는 Sequence, Timestamp, Session Generation과 상태 Version으로 오래되거나 중복된 Message를 식별한다.
### Snapshot Interpolation

원격 Player의 Packet은 일정하게 도착하지 않는다. Client는 Snapshot을 짧게 Buffer하고 현재보다 약간 과거의 Rendering Time을 잡아 앞뒤 두 상태 사이를 보간한다.

```text
received: S100 -------- S101 ---- S102
render:          ^ between S100 and S101
```

위치는 Linear Interpolation, 회전은 Quaternion 보간을 쓸 수 있다. Animation 상태나 순간 이동은 단순 보간하면 안 된다. Teleport Flag나 거리 Threshold로 Buffer를 비우고 즉시 적용한다. 보간 지연이 크면 부드럽지만 화면이 더 과거를 보여 주고, 작으면 Jitter에 취약하다. RTT뿐 아니라 도착 간격의 변동인 Jitter를 기준으로 Buffer를 조절한다.

### Interpolation과 Extrapolation

Interpolation은 이미 받은 두 상태 사이를 계산하므로 안정적이지만 의도적 지연이 있다. Extrapolation은 마지막 속도로 미래를 추정해 지연을 줄이지만 급정지와 방향 전환에서 틀린다. 짧은 손실 구간만 제한적으로 추정하고 최대 시간 뒤에는 멈추거나 재동기화한다. 자기 캐릭터에는 Prediction, 원격 캐릭터에는 Interpolation을 주로 쓰는 이유가 입력 소유 여부다.

### Server Rewind

Hitscan 공격에서 Server가 현재 위치만 검사하면 고지연 사용자는 화면에서 조준했어도 빗나갈 수 있다. Lag Compensation은 최근 Player 위치와 Hitbox History를 Tick별로 보관한다. 공격 Packet의 시각을 Server Timeline으로 변환하고 허용 범위의 과거 상태로 되감아 Ray Test한 뒤 현재 상태로 복원한다.

```text
fire(client time)
 → map to server time
 → clamp rewind window
 → restore historical hitboxes
 → ray test
 → restore present
```

전체 World Simulation을 다시 실행하기보다 판정에 필요한 Hitbox만 과거 위치로 배치한다. History에는 Tick, Position, Rotation, 자세와 충돌 형태가 필요하다.

### 시간 동기화와 공정성

Client Timestamp를 그대로 믿으면 임의의 과거를 골라 공격할 수 있다. Heartbeat RTT와 Offset 추정으로 Server 시간을 계산하고 최대 Rewind Window를 둔다. 공격 시점은 입력 Sequence와 무기 Cooldown 범위에도 맞아야 한다. 지나치게 긴 보정은 공격자에게 유리하지만 피해자는 벽 뒤로 숨은 뒤 맞는 경험을 한다. 경쟁 게임은 보정 상한과 고지연 Match 분리 정책을 함께 고려한다.

### History와 성능

예를 들어 20Hz, 250ms Window라면 Player당 최소 5개 이상의 상태가 필요하다. 안전 여유를 포함한 Ring Buffer로 오래된 상태를 덮어쓴다. 모든 객체를 저장하지 말고 판정 대상과 필수 Field만 보관한다. Rewind 중 실제 현재 상태를 손상시키지 않도록 임시 Collision Scene이나 RAII 복원 범위를 사용한다.

운영에서는 Snapshot 도착 Jitter, 보간 Buffer Underrun, Extrapolation 시간, Rewind 거리와 보정 Hit 비율을 본다. 지연·손실·역순 도착을 주입하고 이동, 순간 이동, 문 뒤 숨기 같은 경계 시나리오를 Test한다.

### 실무 설계 검토 체크리스트

- **Snapshot Buffer**: Snapshot Buffer의 입력이 어디서 생성되고 어느 실행 흐름이 상태를 소유하는지 먼저 정한다. 다른 구성 요소는 상태를 직접 고치지 않고 명시된 경계를 통해 요청한다.
- **Render Time**: Render Time의 정상 처리 순서를 Diagram으로 확인한다. 중간 단계가 실패했을 때 이미 반영된 상태와 다시 수행해도 되는 작업을 구분한다.
- **Jitter**: Jitter에 적용할 최대 개수, Byte 또는 시간 한도를 정한다. 한도를 넘으면 대기, 거절, Drop 가운데 업무 의미에 맞는 정책을 사용한다.
- **Interpolation**: Interpolation 관련 Message에는 중복과 역순을 식별할 Sequence나 Version이 필요한지 판단한다. 오래된 작업이 새 Session 상태를 덮지 않게 한다.
- **Extrapolation**: Extrapolation가 느려질 때 상위 Queue와 호출자까지 지연이 전파되는 경로를 확인한다. Timeout과 Backpressure가 연쇄 Retry를 만들지 않게 한다.
- **Teleport**: Teleport의 평균 처리량만으로 용량을 결정하지 않는다. Peak 부하에서 p95·p99 지연, Memory와 Queue 깊이가 허용 범위인지 측정한다.
- **History Ring**: History Ring를 Client가 주장할 수 있다면 Server가 다시 계산하거나 검증할 항목을 정한다. 허용 오차와 반복 위반 처리 기준도 기록한다.
- **Rewind Window**: Rewind Window 변경은 이전 Client나 Server와 동시에 존재할 수 있다. Version 협상, 기본값과 단계적 배포로 전후 호환성을 확인한다.
- **Clock Offset**: Clock Offset 장애를 재현하는 Test를 만든다. Timeout, 연결 종료, 중복 Callback과 Process 재시작 뒤에도 자원과 상태가 한 번만 정리되는지 확인한다.
- **Hitbox 복원**: Hitbox 복원 관련 Log에는 Match·Session·Sequence 같은 추적 Key를 남긴다. 민감 정보는 제외하고 원인 판별에 필요한 지표와 함께 조회한다.
- **Timestamp 검증**: Timestamp 검증 최적화는 실제 Profile 결과를 근거로 적용한다. CPU를 줄이는 대신 Memory, 복사 감소 대신 Lifetime 복잡도가 늘 수 있음을 비교한다.
- **공격자 공정성**: 공격자 공정성의 Owner를 배포 중 교체할 때 새 요청 차단, 진행 작업 Drain과 상태 이전 순서를 정의한다. 구 Version Callback은 식별 후 폐기한다.
- **피해자 공정성**: 피해자 공정성 결과가 영속 데이터나 외부 서비스에 반영되면 성공 응답의 기준을 정한다. 불확실한 결과는 조회와 Reconciliation으로 확정한다.
- **손실 Test**: 손실 Test 기능을 독립 Service나 Thread로 분리할지는 확장과 장애 격리 이득으로 판단한다. Network·Queue 이동과 운영 비용도 함께 계산한다.
- **보정 지표**: 보정 지표 정책은 정상 사용자 경험과 악용 방지를 함께 고려한다. 너무 넓은 허용 범위와 지나치게 엄격한 오탐 사이를 실제 분포로 조정한다.

이 항목은 Interpolation과 Lag Compensation 설계 Review에서 실제 요구와 실패 조건을 빠뜨리지 않기 위한 기준이다. 모든 장치를 일괄 적용하지 않고 측정된 위험과 운영 목표에 필요한 항목만 선택한다.
### 장애 시나리오 연습

Interpolation과 Lag Compensation은 정상 경로만 구현해서는 운영 준비가 끝나지 않는다. 다음 상황을 부하·Network Simulator와 장애 주입 Test로 재현한다.

- **Snapshot Buffer**: Snapshot Buffer 요청이 정상 처리됐지만 응답만 손실된 상황을 가정한다. 호출자가 재시도해도 같은 상태 변경이 두 번 발생하지 않도록 Sequence, Version 또는 Idempotency Key를 둔다.
- **Render Time**: Render Time 처리 시간이 평소의 열 배로 증가한 상황을 재현한다. 제한 Queue, Timeout과 Admission Control이 다른 Session과 Tick까지 지연을 퍼뜨리지 않는지 확인한다.
- **Jitter**: Jitter Owner가 배포나 장애로 사라진 상황을 Test한다. 새 Owner 선택, 진행 중 작업 처리와 구 Callback 폐기 순서가 명확해야 한다.
- **Interpolation**: Interpolation 입력이 최대 크기, 빈 값, 오래된 Timestamp와 잘못된 Enum을 포함하는 경우를 검증한다. 실패한 입력이 부분 상태를 남기거나 Process를 종료시키면 안 된다.
- **Extrapolation**: Extrapolation 관련 Message가 중복·역순·지연 도착하는 Network 조건을 주입한다. 최종 상태가 순서 정책과 허용 Window에 맞는지 Replay로 비교한다.
- **Teleport**: Teleport Capacity가 모두 사용된 Peak 상황에서 대기 시간을 무제한 늘리지 않는다. 업무 중요도에 따른 거절·Drop과 Client 재시도 안내가 함께 동작해야 한다.
- **History Ring**: History Ring 복구 뒤 상태가 맞는지 원본 Event, Snapshot 또는 DB와 대조한다. 자동 복구가 불가능한 차이는 경고와 수동 Reconciliation 대상으로 남긴다.

Interpolation과 Lag Compensation에서는 각 Test는 성공 여부만 기록하지 않는다. 처리 시간 분포, Queue 최대치, Drop·Retry 수와 복구 소요 시간을 남겨 다음 배포의 기준값으로 사용한다.

## 4. 쉬운 예시
원격 Player는 100ms 과거 Snapshot 두 개 사이를 보간해 Jitter를 숨긴다. 발사 판정은 검증된 시각의 과거 Hitbox를 제한적으로 복원하되 최대 Rewind 시간을 넘기지 않는다.

## 5. 비슷한 개념과 비교
Interpolation은 안정적인 대신 표시 지연을 추가하고 Extrapolation은 즉각적이지만 틀릴 수 있다. Lag Compensation은 공격자와 피해자의 공정성을 함께 조정해야 한다.
## 6. 장점과 단점
Interpolation과 Lag Compensation을 올바르게 적용하면 상태와 처리 책임이 명확해지고 Peak 부하와 장애에 대한 예측 가능성이 높아진다. 반면 Snapshot Buffer, Render Time와 Jitter 정책을 잘못 정하면 지연, 상태 불일치 또는 운영 복잡도가 늘어난다. 실제 요구와 측정 결과를 기준으로 필요한 범위만 적용한다.
## 7. 게임 서버·백엔드 실무 예시
서버는 짧은 위치 History를 보관하고 신뢰 가능한 시간 범위만 Rewind한다. Client Timestamp를 그대로 믿지 않고 RTT 추정과 최대 보정 Window로 제한한다.

Interpolation과 Lag Compensation 관점에서는 평균보다 p95·p99, 지역·Network별 분포, Queue·Buffer 상한, Drop·Retry와 복구 성공률을 관찰한다.

## 8. 자주 하는 오해
- **Snapshot Buffer**을 도입하면 관련 문제가 자동으로 모두 해결된다고 생각한다.
- **Render Time**을 도입하면 관련 문제가 자동으로 모두 해결된다고 생각한다.
- **Jitter**을 도입하면 관련 문제가 자동으로 모두 해결된다고 생각한다.
- **Interpolation**을 도입하면 관련 문제가 자동으로 모두 해결된다고 생각한다.
- **Extrapolation**을 도입하면 관련 문제가 자동으로 모두 해결된다고 생각한다.
## 9. 면접 질문
### Q1. 핵심 개념을 설명해 주세요.
Interpolation은 과거 Snapshot 사이를 보간해 원격 객체를 부드럽게 표시하고 Lag Compensation은 과거 시점 상태를 기준으로 행동을 판정해 지연 영향을 보정한다.
### Q2. 어떤 Trade-off가 있나요?
Interpolation은 의도적으로 약간 과거를 보여 지연을 추가한다. Extrapolation은 미래를 예측해 오차 위험이 있다. Lag Compensation은 공격자 경험을 개선하지만 피해자 관점의 부당함과 악용 제한이 필요하다.
### Q3. 실무 적용 사례는 무엇인가요?
서버는 짧은 위치 History를 보관하고 신뢰 가능한 시간 범위만 Rewind한다. Client Timestamp를 그대로 믿지 않고 RTT 추정과 최대 보정 Window로 제한한다.
### Q4. 장애와 악용을 어떻게 제한하나요?
Interpolation과 Lag Compensation 관점에서는 서버 검증, 시간·크기 상한, Version과 Idempotency, Backpressure와 지표를 적용한다.

## 10. 예상 꼬리질문
- Snapshot Buffer의 최종 소유자는 어디에 두나요?
- Render Time 처리에서 중복과 역순은 어떻게 구분하나요?
- Jitter의 상한을 넘으면 어떤 요청부터 제한하나요?
- Interpolation 장애를 어떻게 재현하고 복구를 검증하나요?
- Extrapolation 관련 p99가 증가하면 어떤 지표를 함께 보나요?
## 11. 30초 모범답변
> Interpolation은 Snapshot Buffer의 과거 상태를 부드럽게 보여 주고 Lag Compensation은 제한된 과거 상태로 판정해 지연을 보정합니다. Interpolation과 Lag Compensation을 선택하거나 적용할 때는 정확성, 성능과 구현 복잡도의 균형을 함께 봐야 합니다. 서버는 짧은 위치 History를 보관하고 신뢰 가능한 시간 범위만 Rewind한다.

## 12. 1~2분 확장답변
> Interpolation은 Snapshot Buffer의 과거 상태를 부드럽게 보여 주고 Lag Compensation은 제한된 과거 상태로 판정해 지연을 보정합니다. 설계에서는 서버가 최종 상태를 소유하고 Client 입력, Sequence와 시간을 검증합니다. 지연은 Prediction·Interpolation과 제한된 Rewind로 보정합니다. Queue, Pool과 Cache에는 상한을 두고 재접속·배포·중복 처리까지 정상 흐름으로 설계합니다.

## 13. 핵심 요약
- Interpolation은 과거 Snapshot 사이를 보간해 원격 객체를 부드럽게 표시하고 Lag Compensation은 과거 시점 상태를 기준으로 행동을 판정해 지연 영향을 보정한다.
- 서버 권위와 입력 검증을 유지한다.
- Version·Sequence로 중복과 순서를 관리한다.
- 성능 구조에는 크기와 시간 상한이 필요하다.
- 복구와 p99를 운영 기준으로 둔다.

## 한 줄 정리
> Interpolation은 Snapshot Buffer의 과거 상태를 부드럽게 보여 주고 Lag Compensation은 제한된 과거 상태로 판정해 지연을 보정합니다.
