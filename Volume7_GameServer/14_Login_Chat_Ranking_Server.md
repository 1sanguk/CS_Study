---
difficulty: 4
reading_time: 25분
interview_frequency: 5
importance: 5
---

# 14. Login, Chat, Ranking Server

> 게임 서버·백엔드 개발자를 위한 CS 면접 교재

## 학습 목표

- Login Server의 Token 발급 흐름과 Game Server에서의 검증 방법을 설명할 수 있다.
- Chat Server의 Channel Fan-out과 순서·중복·Backpressure 처리를 설명할 수 있다.
- Ranking Server에서 점수 원본 권위를 지키고 Redis Sorted Set과 영속 원본을 분리하는 이유를 설명할 수 있다.
- 세 서비스의 장애 격리 기준과 독립 확장이 필요한 시점을 설명할 수 있다.

## 1. 개요
Login은 신원·Session 발급, Chat은 실시간 Message Fan-out과 정책, Ranking은 점수 갱신과 정렬 조회를 담당하는 서비스다.

## 2. 왜 필요한가
기능별 상태, 부하와 정합성 요구가 달라 독립적으로 확장·보호할 수 있다. 사용자 경험을 개선하더라도 서버 권위와 복구 가능성을 훼손하지 않아야 한다.

## 3. 핵심 동작 원리
```text
Client→Login token→Gateway/Game / Chat channel→broker→connections / score event→ranking store→query cache
```
Login은 보안과 Rate Limit, Chat은 순서·중복·금칙어·Backpressure, Ranking은 동점 규칙·시즌과 최종 원본이 핵심이다. 반드시 별도 Microservice일 필요는 없다.

Login, Chat, Ranking Server 관점에서는 Sequence, Timestamp, Session Generation과 상태 Version으로 오래되거나 중복된 Message를 식별한다.
### Login Server

Login은 Credential을 직접 Game Server에 퍼뜨리지 않고 검증 뒤 짧은 수명의 Access Token이나 Session Ticket을 발급한다. Password는 적절한 Password Hash로 저장하고 TLS, Rate Limit과 실패 횟수 보호를 적용한다. Token에는 Subject, Expiry, Audience와 Session ID를 담을 수 있지만 민감 정보를 넣지 않는다.

```text
Client → Login: credential
Login → Identity/DB: verify
Login → Client: signed short-lived ticket
Client → Gateway/Game: ticket
```

Game Server는 서명, 만료와 Audience를 확인하고 필요하면 일회성 Ticket을 소비한다. Login 장애 시 기존 Match까지 즉시 끊을지, 신규 Login만 막을지 장애 경계를 분리한다.

### Chat Server

Chat은 Channel Membership과 Message Fan-out을 관리한다. 같은 Channel의 순서가 필요하면 Channel을 한 Partition Owner에 배치하고 Message Sequence를 부여한다. 전역 순서는 비싸고 대개 필요하지 않다. Offline Message가 필요한 귓속말과 휘발성 전투 Chat은 저장 정책이 다르다.

```text
sender → validate/rate limit → channel partition
       → moderation/filter → subscribers
```

Client가 보낸 Sender ID를 믿지 않고 인증 Session에서 정한다. 길이, Encoding, 금칙어, Spam과 차단 목록을 검사한다. 느린 Client의 Send Queue가 커지면 오래된 일반 Chat Drop 또는 연결 보호 정책을 쓴다. Message ID로 Retry 중복을 제거한다.

### Ranking Server

Ranking의 원본 점수는 권위 Game Result나 Transaction에서 만들어져야 한다. Client가 점수를 직접 제출하면 안 된다. Result Event에는 Match ID와 Version을 넣어 중복 갱신을 막는다. Redis Sorted Set은 빠른 순위 조회에 편리하지만 영속 원본, 복구와 Season 정책을 별도로 정한다.

동점 규칙은 먼저 달성한 시각, 승수 같은 Secondary Key까지 명시한다. Top N과 내 주변 순위 조회는 요구가 다르다. Cache가 잠시 낡아도 되는지, 보상 확정 시에는 어떤 Snapshot을 사용할지 정한다.

### 서비스 분리 기준

Login은 보안과 Burst, Chat은 Fan-out, Ranking은 정렬 조회 부하가 크다. 독립 확장과 장애 격리가 필요하면 분리한다. 작은 서비스에서는 Module로 시작해도 된다. 별도 Process가 되면 Timeout, Retry, Service Discovery, Schema 호환성과 관찰 비용이 생긴다.

### 장애와 정합성

Game 종료 뒤 Ranking Event 발행 전에 Process가 죽는 문제에는 DB Transactional Outbox나 재조정 Job을 사용할 수 있다. Chat Broker 장애 시 휘발 Message를 버릴지 재전송할지 정한다. Login Token Key 교체에서는 이전 Key와 새 Key를 겹쳐 검증해 무중단 전환한다.

운영 지표는 Login 성공률과 p99, Credential 실패와 Rate Limit, Chat Fan-out 지연·Drop·신고, Ranking Event Lag·중복·조회 p99다. Correlation ID로 인증부터 Game 입장까지 추적하되 개인정보와 Token을 Log에서 제거한다.

### 실무 설계 검토 체크리스트

- **Credential 검증**: Credential 검증의 입력이 어디서 생성되고 어느 실행 흐름이 상태를 소유하는지 먼저 정한다. 다른 구성 요소는 상태를 직접 고치지 않고 명시된 경계를 통해 요청한다.
- **Access Token**: Access Token의 정상 처리 순서를 Diagram으로 확인한다. 중간 단계가 실패했을 때 이미 반영된 상태와 다시 수행해도 되는 작업을 구분한다.
- **Ticket 만료**: Ticket 만료에 적용할 최대 개수, Byte 또는 시간 한도를 정한다. 한도를 넘으면 대기, 거절, Drop 가운데 업무 의미에 맞는 정책을 사용한다.
- **Key Rotation**: Key Rotation 관련 Message에는 중복과 역순을 식별할 Sequence나 Version이 필요한지 판단한다. 오래된 작업이 새 Session 상태를 덮지 않게 한다.
- **Login Rate Limit**: Login Rate Limit가 느려질 때 상위 Queue와 호출자까지 지연이 전파되는 경로를 확인한다. Timeout과 Backpressure가 연쇄 Retry를 만들지 않게 한다.
- **Channel Owner**: Channel Owner의 평균 처리량만으로 용량을 결정하지 않는다. Peak 부하에서 p95·p99 지연, Memory와 Queue 깊이가 허용 범위인지 측정한다.
- **Chat Sequence**: Chat Sequence를 Client가 주장할 수 있다면 Server가 다시 계산하거나 검증할 항목을 정한다. 허용 오차와 반복 위반 처리 기준도 기록한다.
- **Fan-out**: Fan-out 변경은 이전 Client나 Server와 동시에 존재할 수 있다. Version 협상, 기본값과 단계적 배포로 전후 호환성을 확인한다.
- **Spam 방지**: Spam 방지 장애를 재현하는 Test를 만든다. Timeout, 연결 종료, 중복 Callback과 Process 재시작 뒤에도 자원과 상태가 한 번만 정리되는지 확인한다.
- **Offline Message**: Offline Message 관련 Log에는 Match·Session·Sequence 같은 추적 Key를 남긴다. 민감 정보는 제외하고 원인 판별에 필요한 지표와 함께 조회한다.
- **점수 원본**: 점수 원본 최적화는 실제 Profile 결과를 근거로 적용한다. CPU를 줄이는 대신 Memory, 복사 감소 대신 Lifetime 복잡도가 늘 수 있음을 비교한다.
- **중복 Result**: 중복 Result의 Owner를 배포 중 교체할 때 새 요청 차단, 진행 작업 Drain과 상태 이전 순서를 정의한다. 구 Version Callback은 식별 후 폐기한다.
- **동점 규칙**: 동점 규칙 결과가 영속 데이터나 외부 서비스에 반영되면 성공 응답의 기준을 정한다. 불확실한 결과는 조회와 Reconciliation으로 확정한다.
- **Season 전환**: Season 전환 기능을 독립 Service나 Thread로 분리할지는 확장과 장애 격리 이득으로 판단한다. Network·Queue 이동과 운영 비용도 함께 계산한다.
- **서비스 지표**: 서비스 지표 정책은 정상 사용자 경험과 악용 방지를 함께 고려한다. 너무 넓은 허용 범위와 지나치게 엄격한 오탐 사이를 실제 분포로 조정한다.

이 항목은 Login, Chat, Ranking Server 설계 Review에서 실제 요구와 실패 조건을 빠뜨리지 않기 위한 기준이다. 모든 장치를 일괄 적용하지 않고 측정된 위험과 운영 목표에 필요한 항목만 선택한다.
### 장애 시나리오 연습

Login, Chat, Ranking Server은 정상 경로만 구현해서는 운영 준비가 끝나지 않는다. 다음 상황을 부하·Network Simulator와 장애 주입 Test로 재현한다.

- **Credential 검증**: Credential 검증 요청이 정상 처리됐지만 응답만 손실된 상황을 가정한다. 호출자가 재시도해도 같은 상태 변경이 두 번 발생하지 않도록 Sequence, Version 또는 Idempotency Key를 둔다.
- **Access Token**: Access Token 처리 시간이 평소의 열 배로 증가한 상황을 재현한다. 제한 Queue, Timeout과 Admission Control이 다른 Session과 Tick까지 지연을 퍼뜨리지 않는지 확인한다.
- **Ticket 만료**: Ticket 만료 Owner가 배포나 장애로 사라진 상황을 Test한다. 새 Owner 선택, 진행 중 작업 처리와 구 Callback 폐기 순서가 명확해야 한다.
- **Key Rotation**: Key Rotation 입력이 최대 크기, 빈 값, 오래된 Timestamp와 잘못된 Enum을 포함하는 경우를 검증한다. 실패한 입력이 부분 상태를 남기거나 Process를 종료시키면 안 된다.
- **Login Rate Limit**: Login Rate Limit 관련 Message가 중복·역순·지연 도착하는 Network 조건을 주입한다. 최종 상태가 순서 정책과 허용 Window에 맞는지 Replay로 비교한다.
- **Channel Owner**: Channel Owner Capacity가 모두 사용된 Peak 상황에서 대기 시간을 무제한 늘리지 않는다. 업무 중요도에 따른 거절·Drop과 Client 재시도 안내가 함께 동작해야 한다.
- **Chat Sequence**: Chat Sequence 복구 뒤 상태가 맞는지 원본 Event, Snapshot 또는 DB와 대조한다. 자동 복구가 불가능한 차이는 경고와 수동 Reconciliation 대상으로 남긴다.

Login, Chat, Ranking Server에서는 각 Test는 성공 여부만 기록하지 않는다. 처리 시간 분포, Queue 최대치, Drop·Retry 수와 복구 소요 시간을 남겨 다음 배포의 기준값으로 사용한다.

## 4. 쉬운 예시

세 서비스의 핵심 흐름을 간략히 정리한 코드다.

```
// Login: 짧은 수명 Ticket 발급
func Login(credential) -> Ticket:
    user = DB.VerifyPassword(credential)       // bcrypt 검증
    if rate_limit.Exceeded(credential.ip, user.id): return TooManyRequests
    ticket = JWT.Sign({sub: user.id, exp: now+300, aud: "gameserver"})
    return ticket   // 5분 수명, 서버 서명

// Game Server: Ticket 검증
func ValidateTicket(ticket) -> UserId:
    claims = JWT.Verify(ticket, publicKey)     // 서명·만료·Audience 확인
    if claims.aud != "gameserver": raise Unauthorized
    return claims.sub

// Chat: Channel Fan-out (Channel별 순서 보장)
func SendChat(session, channelId, text):
    sender = session.UserId                    // Client가 Sender 주장 불가
    if spam_filter.Block(sender, text): return
    seq = channel.NextSequence(channelId)      // 원자적 Sequence 발급
    msg = {seq, sender, text, ts: now()}
    channel.Broadcast(channelId, msg)          // 구독 Connection에 Fan-out
    if offline_storage.Required(channelId):
        db.SaveMessage(msg)

// Ranking: Result Event → 점수 반영 (클라이언트 제출 불가)
func OnMatchResult(event: MatchResult):
    if db.IsDuplicate(event.matchId): return   // 중복 방지 (Idempotency)
    db.SaveResult(event)                       // 영속 원본
    redis.ZIncrBy("ranking:"+event.season, event.delta, event.playerId)
```

- Chat에서 `sender = session.UserId`로 서버가 Sender를 결정한다. Client가 Sender를 주장하면 위장이 된다.
- Ranking의 점수는 반드시 서버의 Match Result Event에서 온다. 클라이언트가 점수를 직접 제출하면 안 된다.

## 5. 비슷한 개념과 비교

| 서비스 | 핵심 부하 | 상태 특성 | 주요 위험 | 독립 확장 필요 시점 |
|--------|---------|---------|---------|----------------|
| **Login** | 인증 Burst (피크 시 집중) | Stateless (Token 서명) | Credential 탈취, Brute Force | 로그인 피크가 Game 서버에 영향 줄 때 |
| **Chat** | Fan-out (1→N) | Channel 구독 목록 | Spam, 메시지 순서, 느린 Client | 채팅 트래픽이 게임 Logic에 영향 줄 때 |
| **Ranking** | 정렬 조회 (Top N) | Score + 동점 규칙 | 점수 조작, 중복 갱신 | 조회 부하가 높거나 시즌 초기 Burst |

## 6. 장점과 단점

**장점**
- 기능별 보안·Fan-out·정렬 부하가 달라 독립 확장과 장애 격리가 쉬워진다.
- Login이 짧은 수명 Token을 발급하면 탈취 피해 범위가 Token 수명으로 제한된다.
- Chat은 Channel별 Partition으로 전역 순서 없이 채널 내 순서를 효율적으로 유지한다.
- Ranking은 Redis로 빠르게 조회하고 DB를 영속 원본으로 분리해 Crash 후 복구가 가능하다.

**단점**
- 세 서비스가 별도 Process이면 Timeout·Retry·Service Discovery·Schema 호환성 관리 비용이 증가한다.
- Login → Game Server 간 Token 검증 트래픽이 늘면 검증 서비스가 병목이 된다.
- Chat Fan-out은 구독자가 많을수록 지연이 증가하고 느린 Client 처리 정책이 필요하다.
- Ranking Redis와 DB 간 일시적 불일치가 보상 확정 시 문제가 될 수 있다.

## 7. 게임 서버·백엔드 실무 예시

Login Token은 5분 수명으로 짧게 설정하고 Game Server 연결 수립 시 한 번만 검증한다. Token Key Rotation 시 이전 Key와 새 Key를 겹쳐 검증 기간을 두어 무중단 전환한다.

Ranking은 Redis Sorted Set으로 실시간 조회하고 DB·Event Log를 복구 원본으로 둔다. 시즌 전환은 Versioned Key(`ranking:season2`)로 전환해 이전 시즌 데이터를 보존한다. Match Result 중복 반영을 `matchId`로 방지한다.

## 8. 자주 하는 오해

- **Credential 검증은 로그인 시 한 번만 하면 된다.** 장기 Session 중 계정 도용·정지 상태 변경을 감지하려면 Token 갱신 시 재검증이 필요하다.
- **Access Token이 있으면 모든 리소스에 접근할 수 있다.** Authentication(신원 확인)과 Authorization(권한 확인)은 별개다. Ranking 수정 API는 Admin 권한만 허용해야 한다.
- **Token이 만료되면 즉시 로그아웃해야 한다.** 게임 중 Silent Refresh(백그라운드 갱신)로 중단 없이 Token을 교체할 수 있다.
- **Key Rotation하면 모든 기존 Token이 즉시 무효가 된다.** 이전 Key의 Token 유효기간 동안 구 Key도 검증하는 Overlap 기간을 두어야 한다.
- **Login Rate Limit은 IP 기준으로만 설정하면 된다.** CDN·NAT 환경에서 IP 기반 제한은 정상 사용자도 차단한다. IP + 계정 단위 제한을 함께 사용한다.
- **Chat에서 Client가 Sender를 지정하면 편하다.** Client가 Sender ID를 조작하면 다른 사람 명의로 메시지를 보낼 수 있다. 서버가 인증 Session에서 Sender를 결정한다.
- **Ranking은 Redis에만 저장하면 된다.** Redis는 영속성이 보장되지 않는다. Crash 복구와 시즌 집계를 위해 DB를 권위 원본으로 유지한다.

## 9. 면접 질문

### Q1. Login Server의 Token 발급 흐름을 설명해 주세요.
클라이언트가 Credential을 Login Server에 전송합니다. Login Server는 Password Hash를 검증하고 Rate Limit을 확인한 뒤 짧은 수명(5분)의 JWT를 서명해 반환합니다. 클라이언트는 이 Token으로 Game Server나 Gateway에 접속하고, Game Server는 서명·만료·Audience를 검증합니다.

### Q2. Chat Channel의 순서 보장과 Fan-out은 어떻게 처리하나요?
Channel을 한 Partition Owner에 배치해 Channel 내 Message Sequence를 원자적으로 발급합니다. 전역 순서는 비용이 크고 대개 불필요합니다. Fan-out은 Channel 구독자에게 브로드캐스트하되, 느린 클라이언트의 Send Queue에 상한을 두고 오래된 일반 Chat을 Drop합니다.

### Q3. Ranking에서 클라이언트가 점수를 제출하면 안 되는 이유와 설계는?
클라이언트 코드는 조작 가능하므로 점수를 직접 제출하면 치팅이 됩니다. 점수는 Game Server의 권위 Match Result Event에서 생성하고 `matchId`로 중복 반영을 막습니다. Redis Sorted Set으로 빠른 조회를 지원하고 DB를 영속 원본으로 분리합니다.

### Q4. Token Key Rotation 시 기존 Token이 무효가 되지 않으려면 어떻게 하나요?
새 Key로 서명하기 시작해도 이전 Key로 서명된 Token이 만료될 때까지 구 Key도 검증합니다. Key ID(kid)를 Token Header에 포함해 어떤 Key로 서명됐는지 구분합니다. Overlap 기간 동안 구/신 Key를 모두 검증합니다.

### Q5. 세 서비스를 분리해야 하는 기준은 무엇인가요?
Login은 Credential 처리 보안과 Burst 부하, Chat은 Fan-out 연결 수, Ranking은 정렬 조회 부하가 각각 다른 특성입니다. 한 기능의 부하·장애가 다른 기능에 영향을 주기 시작할 때 서비스를 분리합니다. 작은 규모에서는 Module 경계로 시작하고 측정 결과를 보며 분리합니다.

### Q6. Ranking 시즌 전환을 어떻게 처리하나요?
이전 시즌 Key(`ranking:season1`)를 보관하고 새 시즌 Key(`ranking:season2`)로 전환합니다. 전환 순간 읽기 Traffic을 새 Key로 원자적으로 전환합니다. 이전 시즌 Top N은 DB에서 집계해 별도로 저장하고 보상 지급 기준 Snapshot을 영속화합니다.

## 10. 예상 꼬리질문

- Login Server 장애 시 기존 Game Session까지 끊을지, 신규 Login만 막을지 어떻게 구분하나요?
- Chat에서 귓속말(DM)과 채널 Chat의 저장 정책을 어떻게 다르게 설계하나요?
- Ranking에서 Top N과 "내 주변 순위" 조회의 구현 방법 차이는?
- 동점 처리를 위한 Secondary Sort Key를 Redis Sorted Set에서 어떻게 인코딩하나요?
- Chat 금칙어 필터를 실시간으로 업데이트할 때 Service 재시작 없이 어떻게 적용하나요?
- Login 실패 횟수 제한을 분산 환경에서 어떻게 정확하게 집계하나요?
- Ranking DB와 Redis 간 불일치가 발생했을 때 복구 절차는?

## 11. 30초 모범답변

> Login은 짧은 수명 Token으로 인증을 격리하고, Chat은 Channel별 Partition으로 순서를 유지하며 Fan-out합니다. Ranking 점수는 서버의 권위 Match Result에서만 반영하고 Redis로 빠른 조회를, DB로 영속 원본을 분리합니다. 기능별 부하 특성이 다르므로 독립 확장이 필요할 때 서비스를 분리합니다.

## 12. 1~2분 확장답변

> Login Server는 Credential 검증 후 짧은 수명(5분) JWT를 서명해 반환합니다. Game Server는 서명·만료·Audience를 검증합니다. Rate Limit은 IP와 계정 단위를 함께 적용하고, Key Rotation 시 Overlap 기간으로 무중단 전환합니다.
>
> Chat은 Channel별 Partition Owner가 Sequence를 발급해 채널 내 순서를 보장합니다. 서버가 인증 Session에서 Sender를 결정하고 금칙어·Spam·길이를 검증합니다. 느린 클라이언트의 Queue에 상한을 두고 오래된 Chat을 Drop합니다.
>
> Ranking 점수는 서버의 권위 Match Result Event에서 생성합니다. Redis Sorted Set으로 실시간 순위를 조회하고 DB를 복구 원본으로 유지합니다. `matchId`로 중복 반영을 막고, 시즌 전환은 Versioned Key로 이전 시즌을 보존합니다.

## 13. 핵심 요약

- Login은 Credential 검증 후 짧은 수명 Token을 서명 발급하고 Game Server가 서명·만료·Audience를 검증한다.
- Key Rotation 시 Overlap 기간 동안 구/신 Key를 모두 검증해 무중단 전환한다.
- Chat Sender는 서버의 인증 Session이 결정하고 클라이언트가 주장하지 못한다.
- Channel별 Partition으로 채널 내 순서를 보장하고 전역 순서는 사용하지 않는다.
- Ranking 점수는 서버의 권위 Match Result에서만 생성하고 `matchId`로 중복 반영을 막는다.
- Redis Sorted Set으로 빠른 순위 조회를, DB로 영속 원본과 복구를 분리한다.
- 시즌 전환은 Versioned Key로 이전 시즌을 보존하고 보상 기준 Snapshot을 영속화한다.
- 기능별 부하·장애 특성이 다르므로 한 기능이 다른 기능에 영향을 줄 때 서비스를 분리한다.

## 한 줄 정리

> Login은 짧은 수명 Token으로 인증을 격리하고, Chat은 Channel별 Sequence로 Fan-out하며 서버가 Sender를 결정하고, Ranking은 서버 권위 Result에서만 점수를 반영하며 Redis 조회와 DB 원본을 분리한다.
