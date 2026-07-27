---
difficulty: 4
reading_time: 25분
interview_frequency: 5
importance: 5
---

# 10. Client Prediction과 Reconciliation

> 게임 서버·백엔드 개발자를 위한 CS 면접 교재

## 학습 목표

- Client Prediction의 목적과 입력 Sequence 기반 동작 원리를 설명할 수 있다.
- Reconciliation 절차(권위 상태 적용 → Pending 제거 → 미확인 입력 재실행)를 단계별로 설명할 수 있다.
- 서버가 클라이언트의 최종 좌표를 그대로 적용하지 않는 이유와 검증 방법을 설명할 수 있다.
- 예측 적합 대상과 부적합 대상의 구분 기준을 설명할 수 있다.

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

아래는 Client-side Prediction + Reconciliation 흐름의 의사 코드다.

```
// Client 측
struct InputRecord { uint32_t seq; Vector2 dir; float dt; };
std::deque<InputRecord> pendingInputs;

void OnLocalInput(Vector2 dir, float dt) {
    InputRecord rec = { ++localSeq, dir, dt };
    pendingInputs.push_back(rec);
    ApplyInputLocally(rec);          // 즉시 화면에 반영 (Prediction)
    SendToServer(rec);               // 서버로 전송
}

// 서버 Snapshot 수신 시 Reconciliation
void OnServerSnapshot(ServerState state) {
    // 1. 서버 권위 상태로 즉시 되돌림
    SetPositionFromAuthority(state.position);

    // 2. 확인된 입력 제거
    while (!pendingInputs.empty() &&
           pendingInputs.front().seq <= state.lastProcessedSeq)
        pendingInputs.pop_front();

    // 3. 미확인 입력 재실행 (Replay)
    for (auto& rec : pendingInputs)
        ApplyInputLocally(rec);      // 예측 상태 재구성

    // 4. 차이가 작으면 Visual Smoothing, 크면 즉시 교정
    float diff = Distance(currentPos, state.position);
    if (diff < CORRECTION_THRESHOLD)
        SmoothTowards(state.position, 0.3f);
    else
        SetPositionFromAuthority(state.position);  // 텔레포트 교정
}
```

- 서버가 `lastProcessedSeq = 42`를 Snapshot에 포함하면 Client는 `seq <= 42`인 입력을 Pending에서 제거하고 43번부터 다시 실행한다.
- `CORRECTION_THRESHOLD`는 게임 장르와 Tick Rate에 따라 조정하며, 너무 크면 Cheat 여지가 생기고 너무 작으면 정상 Jitter에도 튄다.

## 5. 비슷한 개념과 비교

| 방식 | 반응성 | 서버 권위 | 구현 복잡도 | 적합한 상황 |
|------|--------|---------|-----------|-----------|
| **Server-only (Wait)** | RTT만큼 지연 | 완전 | 단순 | 턴제·RTS처럼 빠른 반응이 불필요한 경우 |
| **Client Prediction** | 즉시 반응 | 유지 (Reconciliation) | 높음 | FPS·액션 게임 자기 이동 |
| **Interpolation (타 플레이어)** | 약간 지연(버퍼) | 유지 | 중간 | 다른 플레이어 위치 표시 |
| **Dead Reckoning** | 즉시 추정 | 최종 보정 | 중간 | 위치 업데이트가 드문 경우 |
| **Rollback Netcode** | 즉시 반응 | 롤백 후 재실행 | 매우 높음 | 격투 게임처럼 입력 동기화가 핵심 |

## 6. 장점과 단점

**장점**
- RTT가 높아도 자신의 이동이 즉시 반응해 조작감이 크게 개선된다.
- 서버 권위를 유지하므로 Cheat 방지 기반이 유지된다.
- Reconciliation으로 서버와 클라이언트 상태가 주기적으로 수렴한다.
- 네트워크 품질과 무관하게 클라이언트 측 반응성이 일정하다.

**단점**
- 클라이언트와 서버 Simulation이 달라지면 오차가 누적되고 자주 튀는 현상이 생긴다.
- Pending Queue 관리, Replay 로직, Threshold 조정이 복잡하다.
- 발사·Hit 같은 결과 의존 이벤트는 Server 확인 후 확정해야 해서 느낌이 어색할 수 있다.
- Float 결정론 미보장 시 재실행 결과가 누적 오차를 만든다.

## 7. 게임 서버·백엔드 실무 예시

이동 입력에 Sequence·방향·Timestamp를 포함해 전송하고, 서버는 Snapshot에 `lastProcessedSeq`를 담아 응답한다. 서버는 클라이언트 최종 좌표를 그대로 적용하지 않고, 방향·최대 속도·지형 충돌을 독립 시뮬레이션으로 검증한다.

입력 손실 대비로 Unreliable 채널에서 최근 입력 2~3개를 중복 전송하고 서버는 Sequence로 중복 제거한다. Correction 거리·빈도·Pending 수·RTT Jitter를 지표로 수집해 네트워크 조건 변화를 감지한다.

## 8. 자주 하는 오해

- **Sequence 없이도 Reconciliation이 정확하게 작동한다.** 서버 Ack와 클라이언트 예측 상태를 매칭하려면 Sequence가 필수다. Sequence 없이는 어느 입력까지 반영됐는지 알 수 없다.
- **Pending Queue 입력은 항상 순서대로 처리된다.** UDP 손실·재전송에서 중복·역순이 발생한다. 서버는 Sequence로 중복 제거하고 클라이언트는 재전송한다.
- **Client와 서버 Simulation 결과가 다르면 항상 버그다.** Float 정밀도, Tick Rate, 다른 객체와의 충돌 순서로 일시적 불일치는 자연스럽다. Reconciliation으로 수렴시키는 것이 정상이다.
- **Server Ack가 오면 클라이언트 상태가 즉시 일치한다.** Ack 이후에도 미확인 Pending 입력이 남아 Replay가 필요하다. Reconciliation 후에도 클라이언트가 서버보다 몇 프레임 앞서 있다.
- **서버가 클라이언트 최종 좌표를 검증하면 충분하다.** 클라이언트는 좌표를 조작할 수 있다. 서버는 이동 방향·최대 속도·충돌·Cooldown을 독립 시뮬레이션으로 검증해야 한다.
- **Correction Threshold를 크게 잡으면 덜 튄다.** Threshold가 크면 소폭의 Cheat 이동을 허용하게 된다. 실제 Jitter 분포를 측정해 적절한 값을 설정해야 한다.
- **구매·보상도 Prediction해서 먼저 보여주면 UX가 좋아진다.** 되돌리기 어려운 상태 변경을 Prediction하면 서버가 거부했을 때 롤백 UX가 더 나빠진다. 서버 확인 후 확정하는 것이 안전하다.

## 9. 면접 질문

### Q1. Client Prediction의 목적과 동작 원리를 설명해 주세요.
RTT 동안 서버 응답을 기다리면 조작감이 나빠집니다. Client Prediction은 자신의 입력을 로컬에서 즉시 실행해 화면에 반영하고, 같은 입력을 Sequence와 함께 서버로 전송합니다. 서버는 독립적으로 판정하고 최종 상태를 권위로 사용합니다.

### Q2. Reconciliation 절차를 단계별로 설명해 주세요.
서버 Snapshot이 도착하면 세 단계로 처리합니다. 1단계: 서버 권위 상태를 클라이언트에 즉시 적용합니다. 2단계: `lastProcessedSeq` 이하의 확인된 입력을 Pending Queue에서 제거합니다. 3단계: 남은 미확인 입력을 순서대로 재실행해 현재 예측 상태를 재구성합니다. 차이가 작으면 Visual Smoothing, 크면 즉시 교정합니다.

### Q3. 서버가 클라이언트의 최종 좌표를 그대로 적용하지 않는 이유는?
클라이언트 코드는 수정·패치 가능하므로 좌표를 조작할 수 있습니다. 서버는 이동 방향·버튼·Duration을 받아 최대 속도·가속도·지형 충돌·Cooldown을 독립 시뮬레이션으로 검증합니다. 클라이언트 Timestamp도 조작 가능하므로 서버 시간 기준 Window로 제한합니다.

### Q4. 입력 손실 시 Pending Queue를 어떻게 처리하나요?
Unreliable 채널에서 최근 입력 2~3개를 Packet에 중복 포함해 손실을 보상합니다. 서버는 Sequence로 중복을 제거합니다. Pending 입력에 시간·개수 상한을 두고 오래 확인되지 않으면 재동기화를 요청하거나 연결 품질 UI를 표시합니다.

### Q5. 예측에 적합한 대상과 부적합한 대상의 기준은 무엇인가요?
자기 이동·무기 반동처럼 즉시 피드백이 가치 있고 되돌리기 쉬운 상태는 예측 대상입니다. 구매·보상·Match 결과처럼 되돌리기 어렵거나 다른 플레이어 상태처럼 미래 입력을 모르는 경우는 예측하지 않고 서버 확인 후 확정합니다.

### Q6. Correction Threshold는 어떻게 설정하나요?
Threshold가 너무 크면 소폭 Cheat 이동을 허용하고, 너무 작으면 정상 Jitter에 자꾸 화면이 튑니다. 실제 네트워크 환경에서 RTT·Jitter를 측정해 Jitter의 95퍼센타일 오차보다 약간 큰 값으로 시작합니다. 장르별 허용 오차도 다릅니다. FPS는 작고 MMORPG는 상대적으로 크게 설정합니다.

## 10. 예상 꼬리질문

- Rollback Netcode가 Client Prediction + Reconciliation과 다른 점은 무엇인가요?
- 클라이언트와 서버가 다른 Tick Rate를 사용할 때 Reconciliation이 어렵게 되는 이유는?
- 발사 효과를 먼저 보여주고 Hit 판정은 서버에서 처리할 때 UX를 어떻게 설계하나요?
- 재접속 시 Pending Queue를 어떻게 처리하나요?
- Prediction Replay 횟수가 많을 때 CPU 부하를 어떻게 줄이나요?
- Reconciliation 후에도 위치가 계속 튄다면 어떤 원인을 먼저 확인하나요?
- 다수의 플레이어가 같은 공간에 있을 때 Prediction 오차가 누적되는 이유는?

## 11. 30초 모범답변

> RTT 동안 서버 응답을 기다리면 조작감이 나빠집니다. Client Prediction은 입력을 로컬에서 즉시 실행하고, 서버 Snapshot이 오면 권위 상태를 적용 후 미확인 입력을 재실행합니다. 서버는 클라이언트 좌표가 아닌 이동 방향·속도·충돌을 독립 검증해 권위를 유지합니다.

## 12. 1~2분 확장답변

> Client Prediction은 이동 입력을 Sequence와 함께 로컬에서 즉시 실행해 RTT에 무관하게 반응합니다. 서버가 Snapshot에 `lastProcessedSeq`를 포함해 응답하면 세 단계로 Reconciliation합니다. 권위 상태 적용 → `lastProcessedSeq` 이하 확인 입력 제거 → 나머지 미확인 입력 재실행입니다.
>
> 서버는 클라이언트가 보낸 최종 좌표를 그대로 적용하지 않습니다. 이동 방향·최대 속도·지형 충돌·Cooldown을 독립 시뮬레이션으로 검증합니다. 클라이언트 Timestamp도 서버 시간 Window로 제한합니다.
>
> 예측 대상은 즉시 피드백이 가치 있고 되돌리기 쉬운 자기 이동에 집중합니다. 구매·보상은 서버 확인 후 확정합니다. Correction 거리·빈도·Pending 수·RTT Jitter를 지표로 수집해 품질을 감시합니다.

## 13. 핵심 요약

- Client Prediction은 서버 응답 전 자신의 입력을 로컬에서 즉시 실행해 반응성을 높인다.
- 입력마다 Sequence를 붙이고 Pending Queue에 보관하다 서버 Ack 후 제거한다.
- Reconciliation은 권위 상태 적용 → 확인 입력 제거 → 미확인 입력 재실행 세 단계다.
- 서버는 클라이언트 최종 좌표가 아닌 이동 방향·속도·충돌을 독립 검증해 권위를 유지한다.
- 작은 차이는 Visual Smoothing, 큰 차이는 즉시 교정한다.
- 구매·보상처럼 되돌리기 어려운 상태는 서버 확인 후 확정한다.
- Threshold가 너무 크면 Cheat 허용, 너무 작으면 Jitter 오탐이므로 실측 기반으로 조정한다.
- Correction 거리·빈도·Pending 수·RTT Jitter를 지표로 수집해 네트워크 품질 변화를 감지한다.

## 한 줄 정리

> Client Prediction은 입력을 즉시 로컬 실행하고, 서버 Snapshot 수신 시 권위 상태 복원 → 확인 입력 제거 → 미확인 입력 재실행으로 Reconciliation하며, 서버는 이동 방향·충돌·Cooldown을 독립 검증해 권위를 유지한다.
