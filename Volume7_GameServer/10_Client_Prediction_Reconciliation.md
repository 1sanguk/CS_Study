---
difficulty: 4
reading_time: 25분
interview_frequency: 5
importance: 5
---

# 10. Client Prediction과 Reconciliation

> 게임 서버·백엔드 개발자를 위한 CS 면접 교재

## 학습 목표
- 핵심 원리와 등장 이유를 설명할 수 있다.
- 정확성·지연·운영 Trade-off를 설명할 수 있다.
- 게임 서버 설계와 장애 대응에 적용할 수 있다.

## 1. 개요
Client Prediction은 서버 응답 전 자신의 입력 결과를 즉시 보여 주고 Reconciliation은 권위 서버 상태와 차이를 수정하는 방식이다.

## 2. 왜 필요한가
왕복 지연 동안 입력 반응을 기다리면 조작감이 나빠지므로 즉시 반응과 서버 권위를 함께 유지한다. 사용자 경험을 개선하더라도 서버 권위와 복구 가능성을 훼손하지 않아야 한다.

## 3. 핵심 동작 원리
```text
client input seq N→predict locally→server simulate/ack N→client set server state→replay unacked inputs
```
Client와 서버 Simulation이 다르면 오차가 쌓인다. 입력 Sequence, 동일 규칙과 보정 Threshold가 필요하며 큰 차이는 즉시, 작은 차이는 부드럽게 보정할 수 있다.

Client Prediction과 Reconciliation 관점에서는 Sequence, Timestamp, Session Generation과 상태 Version으로 오래되거나 중복된 Message를 식별한다.
### 입력 지연과 예측

Server 결과를 기다린 뒤 움직이면 반응은 최소 RTT만큼 늦다. Client Prediction은 로컬 입력을 즉시 적용하고 Server는 같은 입력을 독립적으로 판정한다. Client 화면은 추정값이며 최종 상태의 Authority는 Server다.

### Input Sequence와 확인

Client는 입력마다 증가하는 Sequence를 붙이고 확인 전 입력을 보관한다.

```text
Client: #41 predict → #42 predict
Server: #41, #42 처리 → state + lastProcessed=42
Client: server state 적용 → <=42 제거 → 남은 입력 재실행
```

Server의 `lastProcessedInput`으로 반영 범위를 안다. UDP에서는 중복과 역순을 제거한다. TCP에서도 오래된 Snapshot과 Application 처리 순서를 구분하는 데 Sequence가 유용하다.

### Reconciliation

Client는 먼저 권위 상태로 되돌리고 확인된 입력을 Pending Queue에서 제거한다. 아직 처리되지 않은 입력을 순서대로 다시 실행해 현재 예측 상태를 만든다. 차이가 작으면 Rendering 위치를 짧게 보간하고 벽 통과처럼 큰 오류는 즉시 수정한다. 시각 Transform과 Collision Simulation 상태를 분리하면 보간 중 잘못된 판정을 줄일 수 있다.

### 결과가 달라지는 이유

같은 입력도 Float 정밀도, Tick Rate, Collision 순서, 다른 객체와 Random 때문에 다르게 나올 수 있다. 완전한 결정론이 필수는 아니지만 Prediction 대상은 단순하고 재현 가능하게 만든다. 이동 규칙을 공유하고 입력 Duration은 Server 허용 범위로 제한한다.

Server는 Client의 최종 좌표를 그대로 적용하지 않는다. 방향, 버튼과 Sequence를 받아 최대 속도, 가속도, 지형과 상태를 검증한다. Client Timestamp는 조작 가능하므로 Server 시간 기준 Window를 둔다.

### 예측 대상 선택

자기 이동과 무기 반동은 즉시 예측할 가치가 크다. 다른 Player는 미래 입력을 모르므로 보통 Interpolation한다. 구매, 보상과 Match 결과처럼 되돌리기 어려운 상태는 Server 확인 전에 확정하지 않는다. 발사 Effect는 먼저 보여도 Hit와 Damage는 Server 판정을 기다릴 수 있다.

### 손실과 재전송

Unreliable 전송에서는 최근 입력 여러 개를 중복 포함해 손실을 복구하고 Server는 Sequence로 중복 제거한다. Pending 입력에는 시간과 개수 상한을 둔다. 오래 확인되지 않으면 재동기화하거나 연결 상태를 표시한다.

### 공정성과 측정

Prediction은 반응성을 위한 기술이지 검증 생략 수단이 아니다. Server는 Cooldown, Resource와 Map Collision을 검사한다. 허용 오차가 크면 Cheat 여지가, 너무 작으면 Jitter 오탐이 커진다.

Correction 거리와 빈도, Pending 수, RTT·Jitter, Snapshot Age를 측정한다. Network Simulator로 지연, 손실, 중복과 Reordering을 주입하고 서로 다른 Tick Rate에서도 Replay Test한다.

### 실무 설계 검토 체크리스트

- **Input Sequence**: Input Sequence의 입력이 어디서 생성되고 어느 실행 흐름이 상태를 소유하는지 먼저 정한다. 다른 구성 요소는 상태를 직접 고치지 않고 명시된 경계를 통해 요청한다.
- **Pending Queue**: Pending Queue의 정상 처리 순서를 Diagram으로 확인한다. 중간 단계가 실패했을 때 이미 반영된 상태와 다시 수행해도 되는 작업을 구분한다.
- **Local Simulation**: Local Simulation에 적용할 최대 개수, Byte 또는 시간 한도를 정한다. 한도를 넘으면 대기, 거절, Drop 가운데 업무 의미에 맞는 정책을 사용한다.
- **Server Ack**: Server Ack 관련 Message에는 중복과 역순을 식별할 Sequence나 Version이 필요한지 판단한다. 오래된 작업이 새 Session 상태를 덮지 않게 한다.
- **Replay**: Replay가 느려질 때 상위 Queue와 호출자까지 지연이 전파되는 경로를 확인한다. Timeout과 Backpressure가 연쇄 Retry를 만들지 않게 한다.
- **Correction Threshold**: Correction Threshold의 평균 처리량만으로 용량을 결정하지 않는다. Peak 부하에서 p95·p99 지연, Memory와 Queue 깊이가 허용 범위인지 측정한다.
- **Visual Smoothing**: Visual Smoothing를 Client가 주장할 수 있다면 Server가 다시 계산하거나 검증할 항목을 정한다. 허용 오차와 반복 위반 처리 기준도 기록한다.
- **Collision State**: Collision State 변경은 이전 Client나 Server와 동시에 존재할 수 있다. Version 협상, 기본값과 단계적 배포로 전후 호환성을 확인한다.
- **결정론**: 결정론 장애를 재현하는 Test를 만든다. Timeout, 연결 종료, 중복 Callback과 Process 재시작 뒤에도 자원과 상태가 한 번만 정리되는지 확인한다.
- **Timestamp 검증**: Timestamp 검증 관련 Log에는 Match·Session·Sequence 같은 추적 Key를 남긴다. 민감 정보는 제외하고 원인 판별에 필요한 지표와 함께 조회한다.
- **Input 손실**: Input 손실 최적화는 실제 Profile 결과를 근거로 적용한다. CPU를 줄이는 대신 Memory, 복사 감소 대신 Lifetime 복잡도가 늘 수 있음을 비교한다.
- **재동기화**: 재동기화의 Owner를 배포 중 교체할 때 새 요청 차단, 진행 작업 Drain과 상태 이전 순서를 정의한다. 구 Version Callback은 식별 후 폐기한다.
- **예측 대상**: 예측 대상 결과가 영속 데이터나 외부 서비스에 반영되면 성공 응답의 기준을 정한다. 불확실한 결과는 조회와 Reconciliation으로 확정한다.
- **치팅 검증**: 치팅 검증 기능을 독립 Service나 Thread로 분리할지는 확장과 장애 격리 이득으로 판단한다. Network·Queue 이동과 운영 비용도 함께 계산한다.
- **보정 지표**: 보정 지표 정책은 정상 사용자 경험과 악용 방지를 함께 고려한다. 너무 넓은 허용 범위와 지나치게 엄격한 오탐 사이를 실제 분포로 조정한다.

이 항목은 Client Prediction과 Reconciliation 설계 Review에서 실제 요구와 실패 조건을 빠뜨리지 않기 위한 기준이다. 모든 장치를 일괄 적용하지 않고 측정된 위험과 운영 목표에 필요한 항목만 선택한다.
### 장애 시나리오 연습

Client Prediction과 Reconciliation은 정상 경로만 구현해서는 운영 준비가 끝나지 않는다. 다음 상황을 부하·Network Simulator와 장애 주입 Test로 재현한다.

- **Input Sequence**: Input Sequence 요청이 정상 처리됐지만 응답만 손실된 상황을 가정한다. 호출자가 재시도해도 같은 상태 변경이 두 번 발생하지 않도록 Sequence, Version 또는 Idempotency Key를 둔다.
- **Pending Queue**: Pending Queue 처리 시간이 평소의 열 배로 증가한 상황을 재현한다. 제한 Queue, Timeout과 Admission Control이 다른 Session과 Tick까지 지연을 퍼뜨리지 않는지 확인한다.
- **Local Simulation**: Local Simulation Owner가 배포나 장애로 사라진 상황을 Test한다. 새 Owner 선택, 진행 중 작업 처리와 구 Callback 폐기 순서가 명확해야 한다.
- **Server Ack**: Server Ack 입력이 최대 크기, 빈 값, 오래된 Timestamp와 잘못된 Enum을 포함하는 경우를 검증한다. 실패한 입력이 부분 상태를 남기거나 Process를 종료시키면 안 된다.
- **Replay**: Replay 관련 Message가 중복·역순·지연 도착하는 Network 조건을 주입한다. 최종 상태가 순서 정책과 허용 Window에 맞는지 Replay로 비교한다.
- **Correction Threshold**: Correction Threshold Capacity가 모두 사용된 Peak 상황에서 대기 시간을 무제한 늘리지 않는다. 업무 중요도에 따른 거절·Drop과 Client 재시도 안내가 함께 동작해야 한다.
- **Visual Smoothing**: Visual Smoothing 복구 뒤 상태가 맞는지 원본 Event, Snapshot 또는 DB와 대조한다. 자동 복구가 불가능한 차이는 경고와 수동 Reconciliation 대상으로 남긴다.

Client Prediction과 Reconciliation에서는 각 Test는 성공 여부만 기록하지 않는다. 처리 시간 분포, Queue 최대치, Drop·Retry 수와 복구 소요 시간을 남겨 다음 배포의 기준값으로 사용한다.

## 4. 쉬운 예시
Client는 이동 입력 41번을 즉시 실행하고 Server가 40번까지 처리한 Snapshot을 보내면 41번 이후 입력을 다시 적용한다. 작은 위치 차이는 화면만 부드럽게 보정하고 Collision 상태는 권위 결과를 따른다.

## 5. 비슷한 개념과 비교
Prediction은 자기 입력 반응을 빠르게 하지만 오차 교정이 필요하다. Server 응답만 기다리면 단순하고 정확하지만 RTT가 조작감으로 드러난다.
## 6. 장점과 단점
Client Prediction과 Reconciliation을 올바르게 적용하면 상태와 처리 책임이 명확해지고 Peak 부하와 장애에 대한 예측 가능성이 높아진다. 반면 Input Sequence, Pending Queue와 Local Simulation 정책을 잘못 정하면 지연, 상태 불일치 또는 운영 복잡도가 늘어난다. 실제 요구와 측정 결과를 기준으로 필요한 범위만 적용한다.
## 7. 게임 서버·백엔드 실무 예시
이동 입력을 sequence와 함께 보내고 서버가 마지막 처리 번호를 Snapshot에 포함한다. Client는 확인된 입력을 버리고 미확인 입력을 다시 적용한다.

Client Prediction과 Reconciliation 관점에서는 평균보다 p95·p99, 지역·Network별 분포, Queue·Buffer 상한, Drop·Retry와 복구 성공률을 관찰한다.

## 8. 자주 하는 오해
- **Input Sequence**을 도입하면 관련 문제가 자동으로 모두 해결된다고 생각한다.
- **Pending Queue**을 도입하면 관련 문제가 자동으로 모두 해결된다고 생각한다.
- **Local Simulation**을 도입하면 관련 문제가 자동으로 모두 해결된다고 생각한다.
- **Server Ack**을 도입하면 관련 문제가 자동으로 모두 해결된다고 생각한다.
- **Replay**을 도입하면 관련 문제가 자동으로 모두 해결된다고 생각한다.
## 9. 면접 질문
### Q1. 핵심 개념을 설명해 주세요.
Client Prediction은 서버 응답 전 자신의 입력 결과를 즉시 보여 주고 Reconciliation은 권위 서버 상태와 차이를 수정하는 방식이다.
### Q2. 어떤 Trade-off가 있나요?
Client와 서버 Simulation이 다르면 오차가 쌓인다. 입력 Sequence, 동일 규칙과 보정 Threshold가 필요하며 큰 차이는 즉시, 작은 차이는 부드럽게 보정할 수 있다.
### Q3. 실무 적용 사례는 무엇인가요?
이동 입력을 sequence와 함께 보내고 서버가 마지막 처리 번호를 Snapshot에 포함한다. Client는 확인된 입력을 버리고 미확인 입력을 다시 적용한다.
### Q4. 장애와 악용을 어떻게 제한하나요?
Client Prediction과 Reconciliation 관점에서는 서버 검증, 시간·크기 상한, Version과 Idempotency, Backpressure와 지표를 적용한다.

## 10. 예상 꼬리질문
- Input Sequence의 최종 소유자는 어디에 두나요?
- Pending Queue 처리에서 중복과 역순은 어떻게 구분하나요?
- Local Simulation의 상한을 넘으면 어떤 요청부터 제한하나요?
- Server Ack 장애를 어떻게 재현하고 복구를 검증하나요?
- Replay 관련 p99가 증가하면 어떤 지표를 함께 보나요?
## 11. 30초 모범답변
> Client Prediction은 입력을 즉시 Simulation하고 Reconciliation은 서버 상태에 미확인 입력을 재적용해 권위와 반응성을 함께 유지합니다. Client Prediction과 Reconciliation을 선택하거나 적용할 때는 정확성, 성능과 구현 복잡도의 균형을 함께 봐야 합니다. 이동 입력을 sequence와 함께 보내고 서버가 마지막 처리 번호를 Snapshot에 포함한다.

## 12. 1~2분 확장답변
> Client Prediction은 입력을 즉시 Simulation하고 Reconciliation은 서버 상태에 미확인 입력을 재적용해 권위와 반응성을 함께 유지합니다. 설계에서는 서버가 최종 상태를 소유하고 Client 입력, Sequence와 시간을 검증합니다. 지연은 Prediction·Interpolation과 제한된 Rewind로 보정합니다. Queue, Pool과 Cache에는 상한을 두고 재접속·배포·중복 처리까지 정상 흐름으로 설계합니다.

## 13. 핵심 요약
- Client Prediction은 서버 응답 전 자신의 입력 결과를 즉시 보여 주고 Reconciliation은 권위 서버 상태와 차이를 수정하는 방식이다.
- 서버 권위와 입력 검증을 유지한다.
- Version·Sequence로 중복과 순서를 관리한다.
- 성능 구조에는 크기와 시간 상한이 필요하다.
- 복구와 p99를 운영 기준으로 둔다.

## 한 줄 정리
> Client Prediction은 입력을 즉시 Simulation하고 Reconciliation은 서버 상태에 미확인 입력을 재적용해 권위와 반응성을 함께 유지합니다.
