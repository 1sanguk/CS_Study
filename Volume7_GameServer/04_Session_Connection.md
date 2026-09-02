---
difficulty: 3
reading_time: 25분
interview_frequency: 5
importance: 5
---

# 04. Session과 Connection


## 학습 목표

- 모바일 네트워크 전환으로 재접속 실패율이 높아질 때, Grace Period 기간·Resume Token 검증·Generation Counter 폐기 순서 중 실패 단계를 지표로 특정하고 정책을 조정하는 판단을 내릴 수 있다.
- 동일 Account가 두 기기에서 동시 Login해 Inventory가 중복 수정될 위험이 생길 때, 기존 Session Kick·새 연결 거부·Account Lease 중 충돌 위험과 사용자 경험을 기준으로 정책을 결정할 수 있다.
- Send Queue가 특정 Session에서 고수위 상태로 지속될 때, Position Snapshot Coalesce·낮은 우선순위 Drop·강제 종료 중 메시지 종류와 게임 규칙을 기준으로 Backpressure 정책을 결정할 수 있다.
- Session Registry에서 ID Lookup과 삭제가 동시에 발생해 크래시가 재현될 때, Shard Owner Thread·Lock·Safe Reference 중 CCU 규모와 Tick Budget을 기준으로 수명 관리 전략을 결정할 수 있다.

## 1. 개요
Connection은 Socket 기반 전송 경로이고 Session은 인증 사용자, Protocol 상태와 재접속 정보를 담는 응용 계층 대화 상태다.

## 2. 왜 필요한가
네트워크 단절과 사용자 상태 수명을 분리해 인증, 중복 로그인과 재접속을 안전하게 처리한다. 게임 서버는 정확성뿐 아니라 제한 시간 안의 처리와 장애 후 복구를 함께 제공해야 한다.

## 3. 핵심 동작 원리
```text
TCP connect→protocol handshake→authenticate→session bind→disconnect→grace period/reconnect
```
한 Session이 새 Connection에 재결합될 수 있고 Connection 하나가 인증 전 상태일 수 있다. Session Token, generation과 소유권 전환으로 오래된 연결 이벤트를 거부한다.

상태의 최종 소유자, Message 순서, Timeout과 실패 후 재처리 기준을 명시한다.

### Connection과 Session 구분

Connection은 TCP(Transmission Control Protocol) Socket 같은 Transport 연결이고 Session은 인증된 Player의 논리적 통신 상태다. Reconnect 시 새 Connection이 기존 Session을 이어받을 수 있고, 한 Account의 중복 Login 정책에 따라 Session을 교체할 수 있다.

```text
Socket Connection
   ↓ Handshake·Authentication
Logical Session
   ↓ Enter Lobby·Game
```

Socket이 연결되었다고 인증된 것은 아니다. 인증 전 Connection은 더 작은 Buffer·Timeout·Rate Limit을 적용해 Resource 공격을 줄인다.

### State Machine

```text
Accepted
  → Handshaking
  → Authenticating
  → Active
  → Closing
  → Closed
```

각 State에서 허용 Packet과 Timeout을 정한다. Active 이전 Game Command는 거부하고 Closing 이후 새 Send를 막는다. 여러 Thread가 State를 바꾸지 않게 Owner를 정하거나 원자 전이를 사용한다.

### 식별자

Socket Handle 재사용과 Pointer 주소를 Session ID로 사용하지 않는다. 추측하기 어려운 Connection ID와 인증된 Account·Character ID를 구분한다. Log에는 개인정보를 최소화하고 Correlation ID를 사용한다.

Session Registry가 ID→Session을 소유할 수 있다. 제거와 Lookup이 동시에 일어나면 수명 Race가 생기므로 Shard Owner Thread, Lock 또는 Safe Reference 전략이 필요하다.

### 인증과 재인증

Client가 Login Service에서 받은 짧은 수명의 Ticket을 Game Server에 제시할 수 있다. Server는 Signature, Audience, Expiry, Nonce·재사용 여부를 검증한다. Client가 보낸 Account ID만 신뢰하지 않는다.

Key Rotation과 Clock Skew를 고려하고 Ticket을 Log에 그대로 남기지 않는다. 인증 성공 후 Session에 권한과 Player ID를 Bind한다.

### Send Queue와 Backpressure

비동기 Send 중 다음 Packet은 Queue에 쌓일 수 있다. 느린 Client가 소비하지 못하면 Queue가 무제한 증가한다.

```text
Game Events → Session Send Queue → Socket
                  full
        Drop low priority / coalesce / disconnect
```

Position Snapshot은 최신 값으로 Coalesce할 수 있지만 결제 결과·중요 Event는 Drop하면 안 된다. Queue Byte 상한, Packet 수와 고수위 지속 시간을 기준으로 정책을 둔다.

### Receive Buffer와 Parsing

TCP는 스트림 기반 프로토콜이므로 한 Receive에 Packet 하나가 온다는 보장이 없다. Session별 Accumulation Buffer에서 Frame을 반복 추출한다. 선언 Length 상한과 인증 전 Memory Budget을 검증한다.

Parser가 Packet Body Span을 비동기 Handler에 저장하면 Buffer 재사용 후 데이터가 바뀔 수 있다. 필요한 데이터는 소유 Copy·Typed Message로 넘긴다.

### 종료 경쟁

Read 실패, Write 실패, Timeout과 관리자 Kick이 동시에 종료를 요청할 수 있다. Close를 Idempotent하게 만들어 한 번만 최종 정리한다.

```text
Any error → TryTransition(Active→Closing)
Winner: Socket cancel·Registry remove·final notification
Others: already closing, return
```

Outstanding I/O Completion은 Close 후에도 도착할 수 있다. Completion이 Session Memory를 안전하게 참조하고 마지막 I/O 후 파괴되게 한다.

### 중복 Login과 Reconnect

새 Connection이 같은 Account로 인증되면 기존 Session을 Kick, 새 연결 거부, 기기별 허용 중 정책을 정한다. 두 Session이 동시에 Inventory를 수정하지 않도록 Account Lease·Version을 사용할 수 있다.

Reconnect Grace 동안 Character를 World에 남길지, AI로 전환할지, 즉시 제거할지 게임 규칙을 정한다. 새 Connection은 Session Resume Token과 마지막 처리 Sequence를 검증한다.

### 실무 설계 검토 체크리스트

- **Connection 수명**: Connection 수명의 입력이 어디서 생성되고 어느 실행 흐름이 상태를 소유하는지 먼저 정한다.
- **Session 수명**: Session 수명의 정상 처리 순서를 Diagram으로 확인한다. 중간 단계가 실패했을 때 이미 반영된 상태와 다시 수행해도 되는 작업을 구분한다.
- **인증 상태**: 인증 상태에 적용할 최대 개수, Byte 또는 시간 한도를 정한다. 한도를 넘으면 대기, 거절, Drop 가운데 업무 의미에 맞는 정책을 사용한다.
- **Send Queue**: Send Queue를 기준으로 메시지 우선순위별 Drop 정책과 Coalesce 대상을 명시한다.
- **Generation**: Generation Counter 증가 이후 이전 Connection의 비동기 콜백이 도착하는 Race를 Test 시나리오로 검증한다.
- **중복 Login**: 중복 Login의 Kick 시점과 Inventory 쓰기 완료 시점 Race를 Account Lease로 방지한다.
- **Drain**: 배포 중 Drain 절차로 신규 Session 생성을 막고 Grace Period 만료 Session부터 정리한다.

이 항목은 Session과 Connection 설계 Review에서 실제 요구와 실패 조건을 빠뜨리지 않기 위한 기준이다.

## 4. 쉬운 예시: 재접속 처리와 Generation Counter

**재접속 시 Session 인수인계 의사코드**

```python
class Session:
    def __init__(self, account_id):
        self.account_id = account_id
        self.generation  = 0       # Connection 교체마다 증가
        self.connection  = None
        self.state       = "Authenticating"

def handle_reconnect(account_id, resume_token, new_conn):
    session = session_registry.get(account_id)
    if session is None or session.state == "Closed":
        return reject("no active session — grace period expired")

    if not verify_resume_token(session, resume_token):
        return reject("invalid resume token")

    old_gen          = session.generation
    session.generation += 1        # 이전 Connection 콜백 무효화
    session.connection = new_conn
    session.state      = "Active"

    # old_gen 이하 generation의 비동기 콜백을 모두 폐기
    discard_callbacks(account_id, max_gen=old_gen)
    return resume_game_state(session)
```

`generation`을 올린 뒤 도착하는 이전 Connection 콜백은 `max_gen` 비교로 폐기한다. Grace Period 만료 후 `session.state == "Closed"` 처리로 재접속 창을 제한한다.

## 5. 비슷한 개념과 비교

| 구분 | Connection 수명 | Session 수명 |
|------|----------------|-------------|
| 생성 조건 | TCP Handshake | 인증 성공 |
| 소멸 조건 | Socket 끊김·Timeout | Grace Period 만료·Kick |
| 재생성 | 매번 새 객체 | 동일 Account에 재연결 |
| 인증 의존 | 없음 (연결만으로는 인증 아님) | 필수 |
| 상태 보유 | Byte Stream·Send Queue | Inventory·Position·권한 |
| Reconnect 지원 | 불가 (새 Connection = 새 객체) | 가능 (Generation으로 교체) |
| 식별자 | Socket Handle (재사용 위험) | 불투명 Session ID |

## 6. 장점과 단점

### Connection·Session 수명 분리의 장점

- 네트워크 단절 후 Grace Period 동안 캐릭터 유지, 재접속 지원
- Generation Counter로 이전 Connection 비동기 콜백을 안전하게 폐기
- 중복 Login 정책으로 동일 Account 동시 Inventory 수정 충돌 방지
- 인증 전 Connection에 소규모 Buffer·Timeout 적용으로 Resource 공격 완화

### Connection·Session 수명 분리의 단점

- Grace Period 동안 Session 보관으로 메모리·캐릭터 AI 처리 비용 발생
- Generation Counter 폐기 순서가 잘못되면 정상 콜백도 폐기 위험
- 분산 서버에서 Session 공유 시 Redis 등 외부 저장소와 Race 발생
- Close 경쟁 조건(Read/Write 실패·Timeout 동시 요청) 처리 복잡도 증가

## 7. 게임 서버·백엔드 실무 예시
모바일 전환으로 연결이 끊겨도 캐릭터를 즉시 삭제하지 않고 유예 시간 동안 보관한다. 새 연결 인증 후 generation을 올려 이전 Socket의 늦은 Packet을 폐기한다.

Session과 Connection 관점에서 운영 중에는 연결 수, Packet Rate, Queue 길이, Tick p99, Drop·Retry, Memory와 Thread 고갈을 같은 시간축에서 본다.

## 8. 자주 하는 오해

- **TCP Connection이 살아 있으면 Session도 유효하다**: 연결과 게임 Session의 수명 주기는 독립적으로 관리해야 하며 연결이 끊겨도 Session을 Grace Period 동안 유지할 수 있다.
- **Session이 끊기면 즉시 정리해야 한다**: Grace Period 동안 재연결을 허용하는 설계로 일시적 네트워크 불안정에 대응할 수 있다.
- **인증 상태를 한 번 확인하면 세션 내내 신뢰할 수 있다**: Token 만료·Revoke·권한 변경을 주기적으로 확인해야 하며, Ban된 계정이 수십 초 동안 플레이를 계속할 수 있다.
- **Session ID만 있으면 플레이어를 신뢰할 수 있다**: Session ID 도용 방지를 위해 Resume Token 검증·Nonce 재사용 방지 등 추가 방어가 필요하다.
- **Generation Counter가 있으면 오래된 Handle 문제가 완전히 없어진다**: Generation은 재사용 충돌을 줄이지만 올바른 폐기 순서와 Generation Wraparound 정책도 함께 설계해야 한다.
- **인증된 Connection은 즉시 Game Command를 처리해야 한다**: State Machine 없이 Authenticating 상태에서 Game Command를 수락하면 권한 없는 상태 변경이 일어날 수 있다.
- **Send Queue가 가득 차면 모든 Packet을 Drop해도 된다**: 결제 결과·중요 Event는 Drop하면 안 되며, Position Snapshot 같은 낮은 우선순위만 Drop하거나 Coalesce하는 우선순위별 정책이 필요하다.

## 9. 면접 질문

### Q1. 모바일 전환 직후 재접속 실패율이 30%로 급등했습니다. Grace Period·Resume Token·Generation 중 어느 단계에서 실패하는지 어떤 지표로 특정하나요?

단계별 카운터를 비교합니다. (1) **Grace Period 만료**: `reconnect_attempt` vs `session_not_found` 비율 — session_not_found가 높으면 Grace Period(예: 30초)가 모바일 전환 소요 시간보다 짧음. (2) **Resume Token 검증 실패**: `token_invalid` 카운터 — Clock Skew가 크거나 Token이 Connection ID를 포함해 새 Connection에서 재사용 불가한 경우. (3) **Generation 불일치**: `stale_generation_drop` 카운터 급증 — 이전 Connection의 콜백이 Generation 증가 이전에 Session을 수정하는 Race. 각 단계의 실패 카운터를 Prometheus로 분리해 다른 실패 원인과 구분합니다.

### Q2. 동일 Account가 PC와 모바일에서 동시 Login해 Inventory가 두 Session에서 중복 수정됐습니다. 기존 Session Kick과 Account Lease 중 어떻게 선택하고 구현하나요?

경쟁적 게임은 기존 Session Kick을 선택합니다. 구현: (1) 새 Login 인증 시 Session Registry에서 Account ID로 기존 Session 조회. (2) 기존 Session에 Kick 신호 전송 → `TryTransition(Active→Closing)`. (3) Kick 완료 후 새 Session 생성. Inventory 중복 수정 방지: Account 단위 Optimistic Lock — DB에 Version 필드를 두고 충돌 시 나중 쓰기를 거부합니다. 기기별 다중 Session을 허용하는 캐주얼 게임은 Account Lease(Redis 분산 Lock, TTL=게임 세션 최대 시간)로 동일 Inventory 동시 접근을 직렬화합니다.

### Q3. 특정 Session의 Send Queue가 16MB 상한에 도달해 강제 종료됩니다. 정상 플레이어와 Slow Consumer를 구분하는 지표와 Backpressure 정책을 설명하세요.

구분 지표: (1) **Send Queue 고수위 지속 시간** — 일시적 급증(네트워크 순간 지연)은 수백 ms, Slow Consumer는 수 초~수십 초 지속. (2) **TCP Send Buffer 소비**: `ss -tmip` 또는 `netstat -tn`에서 Send Buffer가 계속 증가하면 Client가 수신을 못 하는 것. (3) **RTT 분포**: RTT가 정상(예: 50ms)인데 Queue가 쌓이면 Client가 읽기를 멈춘 Slow Consumer. Backpressure 정책: (1) 고수위(예: 8MB) 초과 시 Position·Entity 상태 Snapshot만 최신 값으로 Coalesce — 이전 값 Drop. (2) 결제·아이템 획득·사망 Event는 별도 Reliable Queue에 유지. (3) 16MB 상한 초과 시 강제 종료 전 클라이언트에 Slow Consumer 경고를 보내고 30초 Grace를 줍니다.

### Q4. Session 삭제와 Lookup이 동시에 발생해 이미 삭제된 Session Pointer에 접근하는 크래시가 재현됐습니다. Shard Owner Thread로 해결하는 설계를 설명하세요.

Session Registry를 N개의 Shard로 분할하고 각 Shard를 단일 Owner Thread가 관리합니다. (1) **Shard 결정**: `shard_id = session_id % N`. (2) **모든 Lookup·삭제는 해당 Shard Thread에 Task로 제출** — 직접 Pointer 접근 금지. (3) **수명 관리**: Session 삭제는 Owner Thread에서만 수행. 삭제 후 다른 Thread가 보관하던 Pointer는 `weak_ptr` 또는 Generation 비교로 유효성 확인. Shard 수 결정 기준: CPU Core 수의 절반(예: 32코어 → 16 Shard)으로 시작해 `shard_wait_time_p99`가 Tick Budget의 10% 이하인지 확인합니다.

### Q5. 배포 중 Session Drain이 예상(30분)보다 오래 걸려 2시간이 경과했습니다. Drain을 빠르게 완료하면서 재접속 플레이어에게 영향을 최소화하는 절차를 설명하세요.

(1) **신규 Session 차단**: 배포 시작 시 Load Balancer에서 해당 Pod의 신규 연결을 차단. (2) **Grace Period 단계적 단축**: 배포 시작 후 15분이 지나면 Grace Period를 30초→5초로 축소해 Drain 속도를 높임. (3) **Room 강제 종료 기준**: Drain 시작 후 30분 경과한 Room은 결과를 저장하고 종료. 플레이어에게 '서버 점검 예고' 팝업을 제공해 미리 준비. (4) **Drain Timeout 강제**: 2시간 Deadline에 도달하면 남은 Session을 강제 종료하고 Inventory 등 영속 상태를 DB에 저장. (5) **모니터링**: `active_session_count`, `room_count`, `drain_age_p99`를 대시보드에서 실시간 확인합니다.

### Q6. Ban된 계정의 Session Token을 즉시 Revoke해야 하는데 Redis Denylist 반영 지연으로 30초 동안 Play할 수 있었습니다. Token 검증 주기와 즉시 Revoke를 동시에 달성하는 설계를 설명하세요.

(1) **Revoke 즉시 반영 경로**: Ban 처리 시 Redis Denylist에 Token JTI(JWT ID)를 기록(TTL=Token 만료 시간). Game Server는 중요 Game Command 처리 전(예: 아이템 획득·결제) Redis를 조회해 JTI를 검증. (2) **정기 검증 주기 단축**: 일반 이동 Packet은 30초 주기 검증도 허용하되, 경제적 영향이 있는 Command는 매 요청마다 검증. (3) **Push 알림**: Ban 발생 시 Auth Service가 해당 Session이 연결된 Game Server에 WebSocket·gRPC(Google Remote Procedure Call) Push로 즉시 Kick 명령 전송. Game Server는 해당 Account ID의 Session을 바로 종료. (4) **지연 허용 기준**: 30초 허용 가능한 Command(채팅·이동)와 즉시 반영 필요한 Command(결제·아이템)를 정책으로 구분합니다.

## 10. 예상 꼬리질문

- Grace Period를 30초로 설정했는데 Mobile 플레이어 재접속 성공률이 낮습니다. `session_not_found` vs `token_invalid` 카운터로 원인을 구분한 뒤 Grace Period를 어떻게 조정하나요?
  > `session_not_found`가 많으면 Grace Period가 짧아 Session이 이미 만료된 것이고, `token_invalid`가 많으면 재접속 Token 자체가 문제입니다. 전자라면 Grace Period를 Mobile 평균 재접속 시간의 2배(예: 60초)로 늘리고, 후자라면 Token 발급 로직과 만료 시간을 점검합니다.
- 중복 Login Kick 중 기존 Session이 Inventory를 DB에 쓰고 있었습니다. Kick 시점과 DB 쓰기 완료 시점의 Race를 Optimistic Lock Version으로 어떻게 처리하나요?
  > Inventory 레코드에 `version` 필드를 두고, 기존 Session이 읽은 버전과 Update 시점의 버전이 일치할 때만 쓰기를 허용합니다. Kick 후 새 Session이 동일 레코드를 읽으면 버전이 달라 기존 Session의 지연 쓰기가 충돌을 일으키므로, 실패한 트랜잭션은 재시도하거나 오류로 처리합니다.
- Send Queue 고수위(8MB)에서 Coalesce를 적용했는데 특정 이벤트(사망 판정)가 누락됐습니다. 우선순위별 Queue를 분리할 때 몇 개의 Queue가 적절한지 기준은 무엇인가요?
  > 일반적으로 2~3개(High/Normal/Low)로 분리하면 충분합니다. High Queue에는 사망·결제 등 신뢰성이 필요한 이벤트를, Normal에는 위치·상태 갱신을, Low에는 채팅·알림처럼 Drop 허용 이벤트를 배치합니다. Queue 수가 많아질수록 운영 복잡도가 증가하므로 실제 이벤트 유형과 Drop 허용 여부 기준으로 최소화합니다.
- 3만 CCU 서버에서 Session Registry를 16 Shard로 분할했는데 특정 Shard에 Hot Spot이 생겼습니다. 분산이 고르지 않은 원인을 어떻게 진단하나요?
  > 각 Shard별 Session 수 분포를 측정해 특정 해시 범위에 ID가 몰리는지 확인합니다. userId가 순번 증가 방식이면 나머지(%) 해싱에서 편중이 발생할 수 있으므로, Consistent Hashing이나 128비트 균등 해시 함수로 교체합니다. 접근 빈도 자체가 문제라면 자주 조회되는 Session을 In-process 캐시로 보완합니다.
- 배포 Drain 중 Grace Period를 30초→5초로 단축했을 때 재접속 중이던 플레이어가 실패합니다. 단축 시작 시 이미 Grace Period 중인 Session을 어떻게 보호하나요?
  > 단축 정책 적용 전에 이미 Grace Period 상태인 Session에 플래그를 표시해 기존 30초 기한을 유지합니다. 이후 신규 진입 Session에만 5초 규칙을 적용하면 전환 중인 플레이어를 보호할 수 있습니다. 배포 완료 후 플래그 Session이 소멸하면 전체가 새 정책으로 통일됩니다.
- Generation Counter가 uint32 최대값에 도달해 Wraparound됐습니다. 이전 Session 콜백이 새 Generation 0과 충돌하는 상황을 어떻게 방지하나요?
  > Generation 비교 시 단순 `==` 대신 유효 범위 창(예: 현재 Generation ± N)으로 판단하거나, uint64로 확장해 실질적으로 Wraparound가 발생하지 않도록 합니다. 콜백 발송 시 Session Handle에 Generation을 묶어두고, 처리 전 현재 Session의 Generation과 일치하는지 확인해 불일치 시 폐기합니다.
- Redis Denylist에 JTI(JWT ID)를 저장할 때 Token 만료 전 대규모 Ban(1만 계정)이 발생하면 Redis 메모리가 급증합니다. TTL 설계와 메모리 상한을 어떻게 설정하나요?
  > 각 JTI의 TTL을 해당 Token 만료 시각과 동일하게 설정해 자동 만료를 활용합니다. Redis `maxmemory`와 `maxmemory-policy allkeys-lru`를 설정해 상한 초과 시 오래된 항목부터 제거합니다. 대규모 Ban 시에는 계정 단위 Ban 플래그를 별도 Hash에 저장하고 JTI 개별 등록 대신 계정 레벨 검증으로 전환해 메모리 급증을 완화합니다.

## 11. 30초 모범답변

> Connection은 네트워크 경로이고 Session은 인증된 논리 상태입니다. 수명을 분리하면 모바일 Wi-Fi 전환처럼 Connection이 끊겨도 Session을 Grace Period 동안 유지해 재접속을 지원할 수 있습니다. 새 연결 인증 후 Generation을 올려 이전 Connection의 늦은 콜백을 폐기하고, Ban은 Redis Denylist Push로 즉시 Kick합니다.

## 12. 1~2분 확장답변

> Connection은 Socket 기반 전송 경로이고 Session은 인증·게임 상태를 담는 응용 계층 상태입니다. Connection이 끊겨도 Session을 Grace Period 동안 보관하면 재접속이 가능합니다. 새 Connection에서 Resume Token 검증 후 Generation을 증가시켜 이전 콜백을 폐기합니다.
>
> 중복 Login은 기존 Session Kick 후 새 Session을 생성하며, Inventory 동시 수정은 Optimistic Lock Version으로 방지합니다. Send Queue 고수위에서는 Position Snapshot을 Coalesce하고 결제·사망 Event는 별도 Reliable Queue로 보호합니다.
>
> Session Registry는 Shard Owner Thread로 Lookup-Delete Race를 방지하고, Ban은 Redis Denylist Push로 즉시 Kick해 지연을 최소화합니다.

## 13. 핵심 요약

- Connection은 Socket 전송 경로, Session은 인증·게임 상태를 담는 응용 계층 대화 상태다.
- 수명 분리로 Connection 단절 후 Grace Period 동안 Session을 유지해 재접속을 지원한다.
- Resume Token과 Generation Counter로 재접속 인증과 이전 Connection 콜백 폐기를 처리한다.
- 중복 Login은 기존 Kick 또는 Account Lease로 처리하며 두 Session이 같은 Inventory를 수정하면 안 된다.
- Send Queue 고수위에서 우선순위별 Coalesce·Drop으로 중요 Event를 보호한다.
- Session Registry는 Shard Owner Thread로 Lookup-Delete Race를 방지한다.
- Ban은 Redis Denylist JTI Push로 즉시 반영해 지연 시간을 최소화한다.

## 한 줄 정리

> Connection은 네트워크 경로이고 Session은 인증된 논리 상태이며, 수명 분리·Generation Counter·Grace Period·Redis Denylist Push로 재접속·중복 Login·오래된 콜백·즉시 Ban을 안전하게 처리한다.
