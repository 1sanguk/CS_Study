---
difficulty: 3
reading_time: 25분
interview_frequency: 5
importance: 5
---

# 05. Packet Framing

> 게임 서버·백엔드 개발자를 위한 CS 면접 교재

## 학습 목표

- TCP 바이트 스트림에서 Packet 경계가 사라지는 이유와 Length-prefix Framing 원리를 설명할 수 있다.
- Partial Read·Multi-frame 상황을 Circular Buffer로 처리하는 파싱 루프를 설계할 수 있다.
- Length 검증 누락이 OOM을 유발하는 경로와 방어 방법을 설명할 수 있다.
- Fixed-size·Delimiter·Length-prefix 방식의 Trade-off와 게임 서버에서 Length-prefix를 선택하는 이유를 설명할 수 있다.

## 1. 개요
패킷 프레이밍은 TCP 바이트 스트림에서 응용 메시지의 시작과 끝을 구분하는 규칙이다.

## 2. 왜 필요한가
TCP의 Send·Receive 호출 경계가 보존되지 않으므로 부분 수신과 여러 메시지 결합을 정확히 파싱해야 한다. 게임 서버는 정확성뿐 아니라 제한 시간 안의 처리와 장애 후 복구를 함께 제공해야 한다.

## 3. 핵심 동작 원리
```text
receive buffer→need header length→validate size→wait full body→dispatch→consume
```
고정 길이는 단순하지만 낭비가 있고, 구분자는 Escape 문제가 있으며, Length Prefix는 효율적이지만 길이 검증이 필수다. UDP는 Datagram 경계가 있지만 내부 Message 형식은 필요하다.

상태의 최종 소유자, Message 순서, Timeout과 실패 후 재처리 기준을 명시한다.

### TCP는 Message가 아니라 Stream

TCP는 Byte 순서와 신뢰성을 제공하지만 Application Message 경계를 보존하지 않는다.

```text
Sender write: [Header+Body A] [Header+Body B]

Receiver read 가능:
[Header 일부]
[나머지 Header + Body A + Header B 일부]
[나머지 B]
```

따라서 한 `recv` 결과를 Packet 하나로 가정하면 안 된다. Accumulation Buffer에 붙이고 완전한 Frame이 있는 동안 반복 파싱한다.

### Length-prefix Framing

```text
| Length 4B | Type 2B | Version 1B | Flags 1B | Payload ... |
```

Length가 Header 포함인지 Payload만인지 Protocol에 명시한다. Network Byte Order, 최대 길이와 최소 Header 길이를 검증한다.

```text
if buffered < headerSize: wait
length = readLength()
if length < min || length > max: protocol error
if buffered < length: wait
extract one frame
repeat
```

Length를 검증하기 전에 그 크기로 Memory를 할당하면 공격자가 거대한 값을 보내 OOM을 유발할 수 있다. 인증 전에는 더 낮은 상한을 둔다.

### Delimiter와 Fixed-size

Text Protocol은 Newline 같은 Delimiter를 사용할 수 있다. Payload 안 Delimiter Escape와 최대 Line 길이가 필요하다. Delimiter를 찾는 Scan이 반복되어 O(n²)이 되지 않도록 검색 위치를 유지한다.

Fixed-size Frame은 파싱이 단순하지만 가변 Payload를 낭비하거나 별도 분할이 필요하다. 게임 Packet은 Length-prefix가 흔하지만 요구에 따라 선택한다.

### Receive Buffer 설계

매 Packet마다 앞부분을 지우며 전체 Byte를 이동하지 않는다. Read·Write Index가 있는 Circular Buffer 또는 Compact 조건을 사용한다.

```text
Buffer: [consumed][readable frame bytes][free]
          readPos              writePos
```

Frame Body를 Zero-copy Span으로 넘기면 Handler가 Buffer 재사용 전에 소비해야 한다. Async 경계를 넘기면 소유 Buffer Slice·Reference-counted Segment 또는 Copy가 필요하다.

### Partial Header와 Multiple Frames

Parser는 다음 세 결과를 구분하면 좋다.

- NeedMoreData
- FrameReady
- ProtocolError

Frame 하나를 얻은 후 Buffer에 남은 Byte로 다음 Frame도 즉시 파싱한다. 한 Read당 하나만 처리하면 합쳐 들어온 Packet이 다음 Network Event까지 지연될 수 있다.

### UDP와 Framing

UDP Datagram은 Message 경계를 보존하지만 MTU를 넘으면 IP Fragmentation이나 Application 분할이 필요하다. Datagram 안에도 Type·Sequence·Version·Payload Length와 무결성 검증을 둘 수 있다.

UDP에서 선언 Length가 실제 Datagram 길이와 일치하는지 확인한다. 분할 재조립은 Message ID, Fragment Index·Count, Timeout과 전체 크기 상한이 필요하며 공격자가 불완전 Fragment로 Memory를 점유하지 못하게 한다.

### Packet Type와 Dispatch

Type 값은 범위를 검증하고 인증·Session State별 허용 목록을 둔다. 거대한 Switch, Function Table이나 Generated Dispatcher 중 하나를 사용할 수 있다.

Unknown Type은 전후 호환을 위해 Skip할지 Protocol Violation으로 끊을지 Version 정책에 따라 정한다. Length가 있으므로 모르는 Message를 안전하게 건너뛸 수 있다.

### Version과 호환성

Handshake에서 Protocol Version·Feature를 협상한다. Header Layout 자체가 바뀌면 이전 Parser가 Length를 찾지 못할 수 있으므로 안정된 Envelope를 유지한다.

Optional Field와 Message Version을 Payload에 둘 수 있다. Rolling Deployment 동안 Old Client·New Server 조합을 Test한다.

### Compression과 Encryption

압축 전후 길이, 최대 해제 크기와 압축 비율을 제한해 Compression Bomb을 막는다. 작은 Packet은 압축 Header·CPU가 더 클 수 있다.

TLS 같은 Stream Encryption 위에서도 Application Framing은 필요하다. 자체 암호화를 설계하면 Nonce·인증 Tag·Replay 보호가 복잡하므로 검증된 Protocol을 사용한다.

### 장애와 관찰

Malformed Length, Unknown Type, Buffer Overflow를 Client ID·Remote·Version과 함께 집계하되 Payload 민감 정보는 Log하지 않는다. Frame 크기 분포, 합쳐진·분할 Read 비율, Parser Error, Buffer Capacity와 Allocation을 측정한다.

Fuzzing으로 임의 Byte, 잘린 Header, 최대·Overflow Length, 여러 Frame 조합을 입력해 Parser가 범위 밖 접근·무한 Loop 없이 실패하는지 검증한다.

### 실무 설계 검토 체크리스트

- **Length Prefix**: Length Prefix의 입력이 어디서 생성되고 어느 실행 흐름이 상태를 소유하는지 먼저 정한다. 다른 구성 요소는 상태를 직접 고치지 않고 명시된 경계를 통해 요청한다.
- **Header 크기**: Header 크기의 정상 처리 순서를 Diagram으로 확인한다. 중간 단계가 실패했을 때 이미 반영된 상태와 다시 수행해도 되는 작업을 구분한다.
- **최대 Packet**: 최대 Packet에 적용할 최대 개수, Byte 또는 시간 한도를 정한다. 한도를 넘으면 대기, 거절, Drop 가운데 업무 의미에 맞는 정책을 사용한다.
- **Partial Read**: Partial Read 관련 Message에는 중복과 역순을 식별할 Sequence나 Version이 필요한지 판단한다. 오래된 작업이 새 Session 상태를 덮지 않게 한다.
- **Multiple Frames**: Multiple Frames가 느려질 때 상위 Queue와 호출자까지 지연이 전파되는 경로를 확인한다. Timeout과 Backpressure가 연쇄 Retry를 만들지 않게 한다.
- **Receive Buffer**: Receive Buffer의 평균 처리량만으로 용량을 결정하지 않는다. Peak 부하에서 p95·p99 지연, Memory와 Queue 깊이가 허용 범위인지 측정한다.
- **Malformed Length**: Malformed Length를 Client가 주장할 수 있다면 Server가 다시 계산하거나 검증할 항목을 정한다. 허용 오차와 반복 위반 처리 기준도 기록한다.
- **Message Type**: Message Type 변경은 이전 Client나 Server와 동시에 존재할 수 있다. Version 협상, 기본값과 단계적 배포로 전후 호환성을 확인한다.
- **Version**: Version 장애를 재현하는 Test를 만든다. Timeout, 연결 종료, 중복 Callback과 Process 재시작 뒤에도 자원과 상태가 한 번만 정리되는지 확인한다.
- **압축 임계값**: 압축 임계값 관련 Log에는 Match·Session·Sequence 같은 추적 Key를 남긴다. 민감 정보는 제외하고 원인 판별에 필요한 지표와 함께 조회한다.
- **암호화 경계**: 암호화 경계 최적화는 실제 Profile 결과를 근거로 적용한다. CPU를 줄이는 대신 Memory, 복사 감소 대신 Lifetime 복잡도가 늘 수 있음을 비교한다.
- **UDP 단편화**: UDP 단편화의 Owner를 배포 중 교체할 때 새 요청 차단, 진행 작업 Drain과 상태 이전 순서를 정의한다. 구 Version Callback은 식별 후 폐기한다.
- **Dispatch**: Dispatch 결과가 영속 데이터나 외부 서비스에 반영되면 성공 응답의 기준을 정한다. 불확실한 결과는 조회와 Reconciliation으로 확정한다.
- **Fuzz Test**: Fuzz Test 기능을 독립 Service나 Thread로 분리할지는 확장과 장애 격리 이득으로 판단한다. Network·Queue 이동과 운영 비용도 함께 계산한다.
- **Packet 지표**: Packet 지표 정책은 정상 사용자 경험과 악용 방지를 함께 고려한다. 너무 넓은 허용 범위와 지나치게 엄격한 오탐 사이를 실제 분포로 조정한다.

이 항목은 Packet Framing 설계 Review에서 실제 요구와 실패 조건을 빠뜨리지 않기 위한 기준이다. 모든 장치를 일괄 적용하지 않고 측정된 위험과 운영 목표에 필요한 항목만 선택한다.
### 장애 시나리오 연습

Packet Framing은 정상 경로만 구현해서는 운영 준비가 끝나지 않는다. 다음 상황을 부하·Network Simulator와 장애 주입 Test로 재현한다.

- **Length Prefix**: Length Prefix 요청이 정상 처리됐지만 응답만 손실된 상황을 가정한다. 호출자가 재시도해도 같은 상태 변경이 두 번 발생하지 않도록 Sequence, Version 또는 Idempotency Key를 둔다.
- **Header 크기**: Header 크기 처리 시간이 평소의 열 배로 증가한 상황을 재현한다. 제한 Queue, Timeout과 Admission Control이 다른 Session과 Tick까지 지연을 퍼뜨리지 않는지 확인한다.
- **최대 Packet**: 최대 Packet Owner가 배포나 장애로 사라진 상황을 Test한다. 새 Owner 선택, 진행 중 작업 처리와 구 Callback 폐기 순서가 명확해야 한다.
- **Partial Read**: Partial Read 입력이 최대 크기, 빈 값, 오래된 Timestamp와 잘못된 Enum을 포함하는 경우를 검증한다. 실패한 입력이 부분 상태를 남기거나 Process를 종료시키면 안 된다.
- **Multiple Frames**: Multiple Frames 관련 Message가 중복·역순·지연 도착하는 Network 조건을 주입한다. 최종 상태가 순서 정책과 허용 Window에 맞는지 Replay로 비교한다.
- **Receive Buffer**: Receive Buffer Capacity가 모두 사용된 Peak 상황에서 대기 시간을 무제한 늘리지 않는다. 업무 중요도에 따른 거절·Drop과 Client 재시도 안내가 함께 동작해야 한다.
- **Malformed Length**: Malformed Length 복구 뒤 상태가 맞는지 원본 Event, Snapshot 또는 DB와 대조한다. 자동 복구가 불가능한 차이는 경고와 수동 Reconciliation 대상으로 남긴다.

Packet Framing에서는 각 Test는 성공 여부만 기록하지 않는다. 처리 시간 분포, Queue 최대치, Drop·Retry 수와 복구 소요 시간을 남겨 다음 배포의 기준값으로 사용한다.

## 4. 쉬운 예시

아래는 Length-prefix 방식의 파싱 루프 핵심 코드다.

```cpp
// Header: | totalLength(4B) | type(2B) | version(1B) | flags(1B) |
constexpr int HEADER_SIZE = 8;
constexpr int MAX_PACKET  = 65536;

enum ParseResult { NeedMore, FrameReady, ProtocolError };

ParseResult TryParseFrame(CircularBuffer& buf, Frame& outFrame) {
    if (buf.Readable() < HEADER_SIZE)
        return NeedMore;

    uint32_t totalLen = buf.PeekUInt32BE(0);   // Network Byte Order
    if (totalLen < HEADER_SIZE || totalLen > MAX_PACKET)
        return ProtocolError;                   // OOM 방어

    if (buf.Readable() < totalLen)
        return NeedMore;                        // Body 아직 안 왔음

    outFrame.type    = buf.PeekUInt16BE(4);
    outFrame.version = buf.PeekUInt8(6);
    outFrame.payload = buf.Slice(HEADER_SIZE, totalLen - HEADER_SIZE);
    buf.Consume(totalLen);
    return FrameReady;
}

// 호출 측 루프 — 한 recv에 여러 Frame이 왔을 때 전부 처리
void OnRecv(Session& session, std::span<const uint8_t> data) {
    session.recvBuf.Append(data);
    Frame frame;
    while (true) {
        auto result = TryParseFrame(session.recvBuf, frame);
        if (result == FrameReady)  session.Dispatch(frame);
        else if (result == NeedMore) break;
        else { session.Close(CloseReason::ProtocolError); break; }
    }
}
```

- `totalLen` 검증을 Memory 할당 전에 수행해 공격자가 2GB 값을 보내 OOM을 유발하는 것을 막는다.
- `while(true)` 루프로 한 recv에 합쳐진 Frame을 모두 처리해야 한다. 루프 없이 하나만 처리하면 나머지 Frame이 다음 Network 이벤트까지 지연된다.

## 5. 비슷한 개념과 비교

| 방식 | 원리 | 장점 | 단점 | 적합한 상황 |
|------|------|------|------|------------|
| **Fixed-size** | 모든 Frame 크기 고정 | 파싱 단순, Zero-copy 쉬움 | 짧은 Packet도 공간 낭비 | 상태 동기화처럼 크기가 고정된 경우 |
| **Delimiter** | 특수 문자(`\r\n`)로 경계 표시 | 사람이 읽기 쉬움 | Payload 내 Escape 필요, O(n) 스캔 | HTTP/1.x, Redis 같은 텍스트 Protocol |
| **Length-prefix** | Header에 Payload 길이 기록 | 유연, Multi-frame 파싱 효율 | Length 검증 필수, Header 오버헤드 | 게임 서버 바이너리 Protocol |
| **Chunk encoding** | 가변 Chunk 크기 반복 | Streaming 친화적 | 파싱 복잡 | HTTP/1.1 chunked, 스트리밍 API |

게임 서버는 바이너리 효율과 유연한 크기를 모두 원하므로 Length-prefix가 표준이다.

## 6. 장점과 단점

**장점**
- 정확한 Packet 경계 복원으로 Logic Layer에서 완전한 Message만 받는다.
- Header의 type·version 필드로 Dispatch와 Protocol 버전 협상이 가능하다.
- Length 범위 검증만으로 OOM·무한 대기 같은 공격 벡터를 차단한다.
- Circular Buffer + 파싱 루프 조합으로 불필요한 메모리 복사 없이 처리한다.

**단점**
- Length·Magic·Version 검증 로직을 직접 구현해야 한다.
- 길이 정의가 "Header 포함인지 Payload만인지" 팀 간 혼선이 생기기 쉽다.
- Partial Read 상태 머신이 복잡해 버그가 숨기 쉽고 Fuzz Testing이 필요하다.
- Protocol 변경 시 구 Client와의 호환성 검증 비용이 생긴다.

## 7. 게임 서버·백엔드 실무 예시

인증 전 클라이언트에는 더 낮은 Max Packet 한도(예: 4KB)를 적용하고, 인증 후 일반 Packet에는 64KB 한도를 적용한다. Handshake Packet 외 다른 Type이 오면 Protocol Error로 즉시 끊는다.

연결 수 · Packet Rate · Frame 크기 분포 · Parser Error 수를 메트릭으로 수집한다. Parser Error가 특정 IP에서 집중되면 Rate Limit이나 Ban을 적용한다.

배포 중 Protocol Version 변경 시 구 서버와 신 클라이언트 조합을 Staging에서 검증한다. Envelope(총 길이 · Type · Version)는 Layout을 고정하고 Payload 안에서 버전 협상 필드를 확장한다.

## 8. 자주 하는 오해

- **TCP recv 한 번이 Packet 하나다.** TCP는 바이트 스트림이므로 recv 결과가 Packet 절반일 수도, 세 Packet을 합친 것일 수도 있다. Accumulation Buffer + while 파싱 루프가 필수다.
- **Length가 있으면 OOM이 없다.** Length 검증 전에 해당 크기로 `malloc`하면 공격자가 0xFFFFFFFF를 보내 메모리를 고갈시킨다. 검증을 할당 전에 수행해야 한다.
- **Delimiter 방식은 항상 단순하다.** Payload 안에 Delimiter 문자가 오면 Escape 처리가 필요하고, 최대 Line 길이를 검증하지 않으면 DOS 공격에 노출된다.
- **Magic Number가 있으면 잘못된 연결을 즉시 감지할 수 있다.** Magic Number 2~4바이트는 랜덤 노이즈에서 우연히 일치할 수 있다. Magic은 빠른 필터일 뿐이고 Length·Checksum 검증과 함께 사용해야 한다.
- **Frame 하나 처리 후 루프를 탈출한다.** 한 recv에 여러 Frame이 담겼을 때 하나만 처리하면 나머지가 다음 Network 이벤트까지 수백 ms 지연된다. FrameReady 동안 루프를 반복해야 한다.
- **Header가 작을수록 좋다.** Version·Flags·예비 필드를 생략하면 Protocol을 확장할 때 Breaking Change가 된다. 적절한 Header 여유(reserved 바이트)가 필요하다.
- **TLS가 있으면 Application Framing이 필요 없다.** TLS는 Transport 암호화만 제공하고 Application Message 경계는 보존하지 않는다. TLS 위에도 Length-prefix Framing이 필요하다.
- **UDP는 Message 경계가 보장되므로 Framing이 필요 없다.** UDP는 Datagram 단위로 경계를 유지하지만, MTU 초과 분할 재조립 시 Fragment 재조립 로직과 최대 크기 검증이 여전히 필요하다.

## 9. 면접 질문

### Q1. TCP에서 별도 Packet Framing이 왜 필요한가요?
TCP는 바이트 순서와 신뢰성을 제공하지만 Application Message 경계를 보존하지 않습니다. send 두 번이 recv 한 번으로 합쳐지거나, send 한 번이 recv 두 번으로 쪼개질 수 있습니다. Length-prefix Header로 메시지 길이를 명시하고 Accumulation Buffer에 쌓아 완전한 Frame이 모일 때만 Dispatch합니다.

### Q2. Length-prefix 방식의 보안 취약점과 방어 방법은 무엇인가요?
공격자가 Length 필드에 0xFFFFFFFF 같은 거대 값을 보내면, 해당 크기로 메모리를 할당하다 OOM이 발생합니다. 방어 방법은 Length를 읽은 직후, 메모리 할당 전에 최솟값(HEADER_SIZE)과 최댓값(예: 64KB)을 검증하는 것입니다. 인증 전 클라이언트에는 더 낮은 한도를 적용합니다.

### Q3. Circular Buffer를 쓰는 이유와 동작 원리를 설명해 주세요.
매 Frame 소비 시 앞 바이트를 삭제하면 나머지를 앞으로 이동해야 해서 O(n) 복사가 발생합니다. Circular Buffer는 readPos·writePos 인덱스만 이동해 불필요한 복사를 없앱니다. readPos가 writePos를 따라잡으면 Buffer가 빈 것이고, writePos가 readPos를 따라잡으면 가득 찬 것입니다.

### Q4. 한 recv에서 여러 Frame이 왔을 때 어떻게 처리하나요?
recv 후 Buffer에 append하고 `TryParseFrame`을 `FrameReady`를 반환하는 동안 while 루프로 반복합니다. `NeedMore`가 되면 루프를 탈출해 다음 recv를 기다립니다. 루프 없이 Frame 하나만 처리하면 나머지 Frame이 다음 Network 이벤트까지 수십~수백 ms 지연됩니다.

### Q5. UDP Datagram에도 Framing이 필요한가요?
UDP는 Datagram 단위로 경계를 유지하므로 TCP 같은 경계 복원은 필요하지 않습니다. 그러나 MTU(보통 1500B)를 초과하는 메시지는 IP Fragmentation이나 Application 분할·재조립이 필요합니다. 재조립 시 Message ID·Fragment Index·Count·Timeout·최대 크기 검증이 필요하고, 불완전 Fragment로 메모리를 점유하는 공격을 막아야 합니다.

### Q6. Protocol Version이 바뀔 때 Header 호환성을 어떻게 유지하나요?
Envelope(totalLength·type·version)의 Layout을 고정하고 신규 필드는 Payload 안에서 확장합니다. Handshake에서 Client가 지원 버전을 알리고 Server가 사용 버전을 응답합니다. 구 Parser가 모르는 Type은 Length를 이용해 건너뜀(skip)으로써 전후 호환성을 유지합니다.

## 10. 예상 꼬리질문

- Partial Header가 도착한 상태에서 연결이 끊기면 어떻게 처리하나요?
- Frame Body를 Zero-copy Span으로 Handler에 넘길 때 생명주기를 어떻게 관리하나요?
- 같은 연결에서 짧은 Packet 수천 개와 큰 Packet 하나를 혼용할 때 Buffer 전략은?
- Fuzzing으로 Parser를 검증할 때 어떤 입력 패턴을 우선 테스트하나요?
- Compression Bomb을 막기 위해 어떤 검증을 추가하나요?
- Magic Number를 Header 앞에 두면 어떤 이점과 한계가 있나요?
- Rolling Deploy 중 구 Client와 신 Server가 공존할 때 Version Negotiation 실패를 어떻게 처리하나요?

## 11. 30초 모범답변

> TCP는 바이트 스트림이라 Application Message 경계를 보존하지 않습니다. Length-prefix Header로 메시지 길이를 명시하고, Accumulation Buffer에 쌓아 완전한 Frame이 모이면 Dispatch합니다. Length를 읽은 직후 최솟값·최댓값을 검증해 메모리 할당 전에 OOM 공격을 차단합니다.

## 12. 1~2분 확장답변

> TCP recv 결과는 메시지의 절반일 수도, 세 메시지를 합친 것일 수도 있습니다. Length-prefix Framing은 Header에 totalLength를 기록하고 Accumulation Buffer에 쌓다가 완전한 Frame이 모이면 Dispatch하는 방식입니다.
>
> 핵심 보안 이슈는 Length 검증 순서입니다. 메모리 할당 전에 최솟값(HEADER_SIZE)과 최댓값(64KB)을 검사하지 않으면, 공격자가 거대한 Length를 보내 OOM을 유발할 수 있습니다. 인증 전 클라이언트에는 더 낮은 한도를 적용합니다.
>
> 파싱 루프는 `FrameReady` 동안 계속 돌아야 합니다. 하나만 처리하고 탈출하면 합쳐진 Frame이 다음 이벤트까지 지연됩니다. Circular Buffer로 불필요한 바이트 이동을 없애고, Parser가 `NeedMore·FrameReady·ProtocolError` 세 결과를 명시적으로 반환하도록 설계합니다.
>
> 운영에서는 Frame 크기 분포·Parser Error 수·Buffer 사용률을 지표로 수집합니다. Parser Error가 특정 IP에서 집중되면 Rate Limit을 적용합니다.

## 13. 핵심 요약

- TCP는 바이트 스트림이므로 Application Message 경계가 없다. Length-prefix Framing으로 경계를 복원한다.
- Length 검증은 메모리 할당 전에 최솟값·최댓값을 검사해야 OOM 공격을 막는다.
- Accumulation Buffer에 recv 결과를 append하고 while 루프로 여러 Frame을 모두 처리한다.
- Circular Buffer는 readPos·writePos 인덱스만 이동해 불필요한 바이트 복사를 없앤다.
- Parser는 NeedMore·FrameReady·ProtocolError 세 결과를 명시적으로 반환해야 한다.
- Fixed-size는 파싱이 단순하고, Delimiter는 텍스트에 적합하며, Length-prefix는 게임 바이너리 Protocol 표준이다.
- Envelope(length·type·version) Layout을 고정하고 신규 필드는 Payload 안에서 확장해 전후 호환성을 유지한다.
- Fuzz Testing으로 잘린 Header, 최대 Length, 여러 Frame 조합을 검증해 범위 이탈·무한 루프를 잡는다.

## 한 줄 정리

> TCP 바이트 스트림에서 Application Message 경계를 복원하는 것이 Packet Framing이며, Length-prefix + Circular Buffer + while 파싱 루프로 Partial Read와 Multi-frame을 처리하고, 할당 전 Length 범위 검증으로 OOM 공격을 막는다.
