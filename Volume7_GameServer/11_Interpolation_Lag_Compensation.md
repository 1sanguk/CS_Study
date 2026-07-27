---
difficulty: 4
reading_time: 25분
interview_frequency: 5
importance: 5
---

# 11. Interpolation과 Lag Compensation

> 게임 서버·백엔드 개발자를 위한 CS 면접 교재

## 학습 목표

- Snapshot Interpolation이 왜 필요하고 Render Time을 약간 과거로 설정하는 이유를 설명할 수 있다.
- Interpolation과 Extrapolation의 Trade-off를 설명할 수 있다.
- Server Rewind(Lag Compensation) 절차를 단계별로 설명할 수 있다.
- Client Timestamp를 그대로 믿으면 안 되는 이유와 최대 Rewind Window 설정 방법을 설명할 수 있다.

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

아래는 Snapshot Buffer 기반 Interpolation과 Lag Compensation Rewind 흐름이다.

```
// Snapshot Buffer — Render Time은 현재보다 buffer_ms 과거
struct SnapBuffer {
    struct Entry { float serverTime; Vector2 pos; Quaternion rot; };
    std::deque<Entry> entries;  // 최신순
    float bufferMs = 100.0f;   // Jitter 기반 조절
};

// 원격 플레이어 렌더링
void RenderRemotePlayer(SnapBuffer& buf, float nowMs) {
    float renderTime = nowMs - buf.bufferMs;   // 100ms 과거 시점 렌더링
    // renderTime 앞뒤 두 Snapshot을 찾아 보간
    for (int i = 0; i < buf.entries.size() - 1; i++) {
        auto& s0 = buf.entries[i+1];  // 더 오래된 것
        auto& s1 = buf.entries[i];    // 더 최근 것
        if (s0.serverTime <= renderTime && renderTime <= s1.serverTime) {
            float alpha = (renderTime - s0.serverTime) / (s1.serverTime - s0.serverTime);
            Vector2 pos = Lerp(s0.pos, s1.pos, alpha);
            Quaternion rot = Slerp(s0.rot, s1.rot, alpha);
            DrawPlayer(pos, rot);
            return;
        }
    }
    // Underrun → 마지막 알려진 위치 유지 또는 Extrapolation
}

// Lag Compensation Rewind — Server 측
bool ValidateHitscan(PlayerHistory& history, float clientFireTime,
                     float maxRewindMs, Ray ray) {
    float serverTime = ClientTimeToServerTime(clientFireTime);
    float clampedTime = std::max(serverTime, CurrentServerTime() - maxRewindMs);

    // 해당 시점 Hitbox를 임시로 복원
    auto snapshot = history.FindNearest(clampedTime);
    ScopedHitboxRestore restore(history);  // RAII: 테스트 후 현재 상태 복원
    history.ApplySnapshot(snapshot);

    return RayIntersectsHitbox(ray, history.CurrentHitbox());
}
```

- `bufferMs`를 Jitter 95퍼센타일 기준으로 조절하면 Buffer Underrun 없이 부드러운 보간이 가능하다.
- `ScopedHitboxRestore`(RAII)로 Rewind 중 현재 World 상태를 손상시키지 않는다.

## 5. 비슷한 개념과 비교

| 방식 | 대상 | 표시 시점 | 안정성 | 지연 추가 | 주요 위험 |
|------|------|---------|--------|---------|---------|
| **Interpolation** | 원격 플레이어 | Buffer 크기만큼 과거 | 높음 | 있음(buffer_ms) | Underrun 시 튐 |
| **Extrapolation** | 원격 플레이어 | 현재 또는 미래 추정 | 낮음 | 없음 | 방향 전환 시 오버슈팅 |
| **Client Prediction** | 자기 캐릭터 | 즉시(현재) | 높음(Reconciliation) | 없음 | Reconciliation 튐 |
| **Lag Compensation** | Hit 판정 | 과거 Rewind | 서버 권위 | 없음(판정 보정) | 피해자 부당함, 악용 |

## 6. 장점과 단점

**장점**
- Interpolation으로 불규칙한 Snapshot 도착과 Jitter를 숨겨 원격 플레이어가 부드럽게 보인다.
- Lag Compensation으로 고지연 플레이어도 화면에서 조준한 것과 일치하는 Hit 판정을 받는다.
- Hitbox만 과거 위치로 복원하고 World 전체를 시뮬레이션하지 않아 비용이 낮다.
- RAII 복원으로 Rewind 후 현재 상태를 안전하게 복구한다.

**단점**
- Interpolation은 표시 지연을 추가하므로 buffer_ms가 클수록 반응 UI와 괴리가 생긴다.
- Extrapolation은 방향 전환 시 위치가 튀는 오버슈팅이 발생한다.
- Lag Compensation은 피해자 관점에서 은폐 후에도 맞는 경험을 줄 수 있다.
- 최대 Rewind Window 설정이 잘못되면 악용(임의 과거 조작)에 노출된다.

## 7. 게임 서버·백엔드 실무 예시

Server는 20Hz(50ms 간격) 기준으로 최대 250ms Window(5개 이상 상태)를 Ring Buffer에 보관한다. 공격 판정 시 Client Timestamp를 RTT 추정으로 Server 시간으로 변환하고 Window 내로 Clamp한다. Weapon Cooldown과 Sequence 범위도 함께 검증해 타임스탬프 조작을 차단한다.

Snapshot Jitter를 측정해 `bufferMs`를 동적으로 조절하고, Buffer Underrun 빈도·Rewind 거리·보정 Hit 비율을 지표로 수집한다.

## 8. 자주 하는 오해

- **Snapshot Buffer를 크게 잡으면 항상 부드럽다.** Buffer가 클수록 표시 지연이 증가해 UI 반응이 시각적으로 느리게 느껴진다. Jitter 95퍼센타일 기준 최솟값으로 설정한다.
- **Render Time을 서버 현재 시간과 동일하게 설정하면 된다.** Snapshot이 Network를 통해 도착하므로 Render Time을 RTT+Jitter만큼 과거로 잡아야 Buffer에 앞뒤 두 Snapshot이 존재할 수 있다.
- **Jitter가 작으면 Interpolation이 항상 부드럽다.** 패킷 손실로 Snapshot 사이 갭이 생기면 Underrun이 발생한다. 짧은 구간만 Extrapolation으로 보완하고 최대 시간 후에는 멈춘다.
- **Extrapolation은 Interpolation보다 항상 더 반응적이다.** 급정지나 방향 전환 시 잘못된 방향으로 오버슈팅해 위치가 튄다. 제한적 상황(단기 손실 보완)에만 사용한다.
- **Client Timestamp를 그대로 사용해도 Lag Compensation이 공정하다.** 클라이언트가 Timestamp를 조작해 임의의 과거 상태를 선택하면 Cheat가 된다. RTT 추정으로 Server 시간으로 변환하고 최대 Window로 Clamp해야 한다.
- **Lag Compensation은 공격자에게만 유리하다.** 피해자는 화면에서 벽 뒤로 숨은 뒤에도 맞을 수 있다. 경쟁 게임은 Rewind 상한과 고지연 플레이어 Match 분리 정책을 함께 고려한다.
- **전체 World를 Rewind해야 정확한 판정이 된다.** 공격 판정에 영향을 주는 Hitbox만 과거 위치로 복원하면 충분하다. 전체 시뮬레이션 재실행은 불필요하게 비용이 크다.

## 9. 면접 질문

### Q1. Snapshot Interpolation이 왜 필요하고 Render Time을 과거로 설정하는 이유는?
Network Snapshot은 불규칙하게 도착해 직접 렌더링하면 화면이 끊깁니다. Buffer에 Snapshot을 약간 쌓아두고 Render Time을 `현재 - buffer_ms`로 잡으면 앞뒤 두 Snapshot 사이를 보간할 수 있습니다. buffer_ms를 Jitter 95퍼센타일 기준으로 설정하면 Buffer Underrun 없이 부드러운 보간이 가능합니다.

### Q2. Interpolation과 Extrapolation의 Trade-off는 무엇인가요?
Interpolation은 이미 받은 두 Snapshot 사이를 계산하므로 안정적이지만 buffer_ms만큼 표시 지연이 생깁니다. Extrapolation은 마지막 속도·방향으로 미래를 추정해 지연을 줄이지만, 급정지나 방향 전환에서 오버슈팅이 발생합니다. Extrapolation은 단기 손실 보완에만 제한적으로 사용하고 최대 시간 후에는 멈춥니다.

### Q3. Server Rewind(Lag Compensation) 절차를 설명해 주세요.
발사 Packet의 Client Timestamp를 RTT 추정으로 Server 시간으로 변환합니다. 최대 Rewind Window로 Clamp해 허용 범위의 과거 시각을 구합니다. 해당 시각의 Hitbox를 Ring Buffer에서 임시 복원하고 Ray Test를 수행합니다. 판정 후 RAII 복원으로 현재 Hitbox 상태로 돌아옵니다.

### Q4. Client Timestamp를 그대로 믿으면 어떤 문제가 생기나요?
클라이언트가 Timestamp를 조작해 공격자에게 유리한 임의의 과거 Hitbox를 선택할 수 있습니다. RTT Heartbeat로 Server 시간을 추정하고, 발사 Packet의 Timestamp를 Server 시간 기준 최대 Rewind Window 내로 Clamp합니다. Weapon Cooldown과 Sequence 범위도 함께 검증합니다.

### Q5. Interpolation Buffer 크기는 어떻게 결정하나요?
Jitter(Snapshot 도착 간격의 변동)를 측정해 95퍼센타일 기준으로 설정합니다. 너무 작으면 Buffer Underrun(보간할 Snapshot이 없음)으로 화면이 끊기고, 너무 크면 표시 지연이 증가해 시각과 조작 간 괴리가 커집니다. 네트워크 상황에 따라 동적으로 조절합니다.

### Q6. Lag Compensation에서 공격자와 피해자의 공정성 문제는 어떻게 다루나요?
Lag Compensation은 고지연 공격자가 화면에서 조준한 것과 일치하는 Hit 판정을 받도록 보정합니다. 반면 피해자는 이미 숨은 후에도 맞는 경험을 할 수 있습니다. 최대 Rewind Window 상한을 제한하고, 고지연 플레이어를 별도 Match에 분리하는 정책을 경쟁 게임에서 함께 적용합니다.

## 10. 예상 꼬리질문

- Jitter가 갑자기 증가했을 때 Interpolation Buffer Underrun이 발생하면 어떻게 처리하나요?
- 순간 이동(Teleport)이 발생할 때 Interpolation이 잘못 보간하지 않으려면 어떻게 해야 하나요?
- Lag Compensation History Ring Buffer의 크기는 어떻게 계산하나요?
- Rewind 중 현재 World 상태를 보호하기 위해 어떤 방법을 사용하나요?
- 격투 게임의 Rollback Netcode가 FPS의 Lag Compensation과 다른 이유는 무엇인가요?
- 회전(Rotation) 보간에 Linear Interpolation이 아닌 Slerp를 사용하는 이유는?
- 피해자가 Lag Compensation을 이용한 Cheat라고 신고할 때 어떻게 대응하나요?

## 11. 30초 모범답변

> 원격 플레이어 Snapshot은 불규칙하게 도착하므로 Buffer에 쌓아 과거 두 상태를 보간해 부드럽게 표시합니다. Render Time을 Jitter 기반으로 과거로 설정해 Buffer Underrun을 막습니다. Lag Compensation은 발사 시점의 Hitbox History를 최대 Window 내에서 Rewind해 고지연 플레이어도 공정한 Hit 판정을 받도록 합니다.

## 12. 1~2분 확장답변

> Snapshot Interpolation은 Buffer에 Snapshot을 쌓고 Render Time을 `현재 - buffer_ms`로 잡아 앞뒤 두 상태를 보간합니다. buffer_ms는 Jitter 95퍼센타일 기준으로 설정합니다. 패킷 손실 구간은 단기 Extrapolation으로 보완하고 최대 시간 후에는 멈춥니다.
>
> Lag Compensation은 발사 Packet의 Client Timestamp를 RTT 추정으로 Server 시간으로 변환하고 최대 Window로 Clamp합니다. RAII 복원으로 Hitbox를 임시 과거 상태로 배치하고 Ray Test 후 현재 상태로 복원합니다.
>
> 공정성 측면에서 Rewind Window 상한을 제한하고 Weapon Cooldown·Sequence를 함께 검증합니다. Jitter·Buffer Underrun·Rewind 거리·보정 Hit 비율을 지표로 수집합니다.

## 13. 핵심 요약

- Snapshot Interpolation은 Buffer에 쌓은 과거 두 상태를 보간해 Jitter를 숨기고 원격 플레이어를 부드럽게 표시한다.
- Render Time을 `현재 - buffer_ms`로 잡아야 앞뒤 두 Snapshot이 존재할 수 있다.
- buffer_ms는 Jitter 95퍼센타일 기준으로 설정해 Underrun과 표시 지연을 균형 잡는다.
- Extrapolation은 단기 손실 보완에만 제한적으로 사용하고 최대 시간 후 멈춘다.
- Lag Compensation은 발사 시점 Hitbox History를 Rewind해 고지연 플레이어도 공정한 Hit 판정을 받게 한다.
- Client Timestamp를 RTT 추정으로 Server 시간으로 변환하고 최대 Window로 Clamp한다.
- RAII 복원으로 Rewind 중 현재 World 상태를 손상시키지 않는다.
- 피해자 공정성을 위해 Rewind 상한과 고지연 Match 분리 정책을 함께 고려한다.

## 한 줄 정리

> Interpolation은 Buffer된 과거 Snapshot을 보간해 Jitter를 숨기고, Lag Compensation은 발사 시점 Hitbox를 Rewind해 고지연 플레이어도 공정한 Hit 판정을 받게 하되, Client Timestamp를 RTT 기반으로 검증하고 최대 Window로 제한한다.
