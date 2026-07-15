---
difficulty: 4
reading_time: 25분
interview_frequency: 5
importance: 5
---

# 13. Matchmaking

> 게임 서버·백엔드 개발자를 위한 CS 면접 교재

## 학습 목표
- 핵심 원리와 등장 이유를 설명할 수 있다.
- 정확성·지연·운영 Trade-off를 설명할 수 있다.
- 게임 서버 설계와 장애 대응에 적용할 수 있다.

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
처음 10초는 비슷한 MMR과 같은 Region만 찾고 이후 Rating 범위를 점진적으로 넓힌다. 팀이 만들어지면 Game Instance Capacity를 TTL로 예약하고 모든 Player 확인 뒤 Match를 확정한다.

## 5. 비슷한 개념과 비교
좁은 조건은 품질을 높이지만 대기가 길고 넓은 조건은 빠르지만 공정성이 낮아질 수 있다. MMR, Ping, Party와 서버 용량을 하나의 품질 함수로 본다.
## 6. 장점과 단점
Matchmaking을 올바르게 적용하면 상태와 처리 책임이 명확해지고 Peak 부하와 장애에 대한 예측 가능성이 높아진다. 반면 Ticket, Party 단위와 MMR 범위 정책을 잘못 정하면 지연, 상태 불일치 또는 운영 복잡도가 늘어난다. 실제 요구와 측정 결과를 기준으로 필요한 범위만 적용한다.
## 7. 게임 서버·백엔드 실무 예시
Ticket에 version과 idempotency key를 두고 중복 Queue 진입을 막는다. 서버 예약 실패 시 Match를 원자적으로 취소·재배치하고 지표를 Segment별로 본다.

Matchmaking 관점에서는 평균보다 p95·p99, 지역·Network별 분포, Queue·Buffer 상한, Drop·Retry와 복구 성공률을 관찰한다.

## 8. 자주 하는 오해
- **Ticket**을 도입하면 관련 문제가 자동으로 모두 해결된다고 생각한다.
- **Party 단위**을 도입하면 관련 문제가 자동으로 모두 해결된다고 생각한다.
- **MMR 범위**을 도입하면 관련 문제가 자동으로 모두 해결된다고 생각한다.
- **Ping 범위**을 도입하면 관련 문제가 자동으로 모두 해결된다고 생각한다.
- **대기 확장**을 도입하면 관련 문제가 자동으로 모두 해결된다고 생각한다.
## 9. 면접 질문
### Q1. 핵심 개념을 설명해 주세요.
Matchmaking은 실력, 지연, Party, 대기 시간과 서버 용량 조건으로 함께 플레이할 참가자와 Game Server를 선택하는 과정이다.
### Q2. 어떤 Trade-off가 있나요?
MMR은 실력 추정치이고 Matchmaking 규칙은 이를 포함한 제약 최적화다. 시간이 지날수록 실력 범위를 넓히되 Region·Party·역할과 악용 방지를 고려한다.
### Q3. 실무 적용 사례는 무엇인가요?
Ticket에 version과 idempotency key를 두고 중복 Queue 진입을 막는다. 서버 예약 실패 시 Match를 원자적으로 취소·재배치하고 지표를 Segment별로 본다.
### Q4. 장애와 악용을 어떻게 제한하나요?
Matchmaking 관점에서는 서버 검증, 시간·크기 상한, Version과 Idempotency, Backpressure와 지표를 적용한다.

## 10. 예상 꼬리질문
- Ticket의 최종 소유자는 어디에 두나요?
- Party 단위 처리에서 중복과 역순은 어떻게 구분하나요?
- MMR 범위의 상한을 넘으면 어떤 요청부터 제한하나요?
- Ping 범위 장애를 어떻게 재현하고 복구를 검증하나요?
- 대기 확장 관련 p99가 증가하면 어떤 지표를 함께 보나요?
## 11. 30초 모범답변
> Matchmaking은 실력·지연·대기 시간·서버 용량을 함께 최적화합니다. 대기 시간에 따라 범위를 확장하고 Ticket 중복과 서버 예약 실패를 처리해야 합니다. Ticket에 version과 idempotency key를 두고 중복 Queue 진입을 막는다.

## 12. 1~2분 확장답변
> Matchmaking은 실력·지연·대기 시간·서버 용량을 함께 최적화합니다. 대기 시간에 따라 범위를 확장하고 Ticket 중복과 서버 예약 실패를 처리해야 합니다. 설계에서는 서버가 최종 상태를 소유하고 Client 입력, Sequence와 시간을 검증합니다. 지연은 Prediction·Interpolation과 제한된 Rewind로 보정합니다. Queue, Pool과 Cache에는 상한을 두고 재접속·배포·중복 처리까지 정상 흐름으로 설계합니다.

## 13. 핵심 요약
- Matchmaking은 실력, 지연, Party, 대기 시간과 서버 용량 조건으로 함께 플레이할 참가자와 Game Server를 선택하는 과정이다.
- 서버 권위와 입력 검증을 유지한다.
- Version·Sequence로 중복과 순서를 관리한다.
- 성능 구조에는 크기와 시간 상한이 필요하다.
- 복구와 p99를 운영 기준으로 둔다.

## 한 줄 정리
> Matchmaking은 실력·지연·대기 시간·서버 용량을 함께 최적화합니다. 대기 시간에 따라 범위를 확장하고 Ticket 중복과 서버 예약 실패를 처리해야 합니다.
