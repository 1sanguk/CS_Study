---
difficulty: 3
reading_time: 25분
interview_frequency: 5
importance: 5
---

# 05. Packet Framing


## 학습 목표

- TCP recv에서 Partial Read가 발생했을 때 Circular Buffer의 readPos·writePos로 불완전 Frame을 보관하고, Length 범위 검증을 메모리 할당 전에 수행해야 하는 시점을 판단할 수 있다.
- 인증 전 연결에서 거대한 Length 값으로 OOM 공격이 발생했을 때, 인증 전 Max Packet 상한(예: 4KB)과 인증 후 상한(64KB)을 구분 적용하는 설계 결정을 내릴 수 있다.
- 한 recv에 여러 Frame이 담겼을 때 while 파싱 루프 누락으로 Frame이 지연되는 문제를 진단하고, NeedMore·FrameReady·ProtocolError 세 결과를 명시적으로 반환하는 Parser 구조를 결정할 수 있다.
- Protocol Version이 바뀔 때 Envelope(length·type·version) Layout 고정과 Payload 내 신규 필드 확장 중 Rolling Deploy 호환성과 Breaking Change 위험을 기준으로 설계 방향을 결정할 수 있다.

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
| **Delimiter** | 특수 문자(`\r\n`)로 경계 표시 | 사람이 읽기 쉬움 | Payload 내 Escape 필요, O(n) 스캔 | HTTP/1.x 헤더 (Redis RESP는 Delimiter + 길이 prefix 혼합) |
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

- **TCP recv 한 번이 Packet 하나다**: TCP는 바이트 스트림이므로 recv 결과가 Packet 절반일 수도, 세 Packet을 합친 것일 수도 있다. Accumulation Buffer + while 파싱 루프가 필수다.
- **Length가 있으면 OOM이 없다**: Length 검증 전에 해당 크기로 `malloc`하면 공격자가 0xFFFFFFFF를 보내 메모리를 고갈시킨다. 검증을 할당 전에 수행해야 한다.
- **Delimiter 방식은 항상 단순하다**: Payload 안에 Delimiter 문자가 오면 Escape 처리가 필요하고, 최대 Line 길이를 검증하지 않으면 DoS 공격에 노출된다.
- **Magic Number가 있으면 잘못된 연결을 즉시 감지할 수 있다**: Magic Number 2~4바이트는 랜덤 노이즈에서 우연히 일치할 수 있다. Magic은 빠른 필터일 뿐이고 Length·Checksum 검증과 함께 사용해야 한다.
- **Frame 하나 처리 후 루프를 탈출한다**: 한 recv에 여러 Frame이 담겼을 때 하나만 처리하면 나머지가 다음 Network 이벤트까지 수백 ms 지연된다. FrameReady 동안 루프를 반복해야 한다.
- **Header가 작을수록 좋다**: Version·Flags·예비 필드를 생략하면 Protocol을 확장할 때 Breaking Change가 된다. 적절한 Header 여유(reserved 바이트)가 필요하다.
- **TLS가 있으면 Application Framing이 필요 없다**: TLS는 Transport 암호화만 제공하고 Application Message 경계는 보존하지 않는다. TLS 위에도 Length-prefix Framing이 필요하다.
- **UDP는 Message 경계가 보장되므로 Framing이 필요 없다**: UDP는 Datagram 단위로 경계를 유지하지만, MTU 초과 분할 재조립 시 Fragment 재조립 로직과 최대 크기 검증이 여전히 필요하다.

## 9. 면접 질문

### Q1. 신규 게임 서버 배포 후 특정 클라이언트에서 Parser Error가 급증했습니다. 어떤 원인을 먼저 의심하고 어떤 지표로 진단하나요?

배포 시점과 Error 급증 시점을 대조합니다. (1) **Protocol Version 불일치**: 신 서버가 기존 Envelope Layout을 변경했다면 구 클라이언트 Parser가 Length를 잘못 읽어 ProtocolError. `parser_error_by_client_version` 카운터로 버전별 분포 확인. (2) **Length 범위 벗어남**: `invalid_length_count`가 급증하면 신 서버의 Max Packet 상한이 구 서버보다 낮아진 경우. (3) **인증 전 Max Packet 축소**: 배포로 인증 전 상한을 4KB→1KB로 낮춰 Handshake Packet이 걸린 경우. (4) **특정 ISP MTU 차이**: MTU 1400B 환경에서 분할된 Fragment가 오는 경우 — `fragment_reassembly_failure` 지표와 ISP IP 대역을 대조합니다.

### Q2. 인증 전 클라이언트가 Length 필드에 0xFFFFFFFF를 보내 서버 OOM이 발생했습니다. 현재 구현의 취약점 위치와 방어 코드를 설명하세요.

취약점: `length = readLength()` 직후 `allocate(length)`를 호출했고, 검증 전에 4GB 할당이 시도됩니다. 방어 코드 순서: (1) Length를 읽은 직후, 할당 전에 `if length < HEADER_SIZE || length > MAX_PACKET: ProtocolError` 검증. (2) 인증 전 Connection의 `MAX_PACKET`을 4KB, 인증 후 64KB로 분리 적용. (3) 초당 ProtocolError 횟수가 임계값(예: 10회/초)을 넘으면 해당 IP를 Rate Limit 대상에 추가. (4) `parser_error_by_ip` 메트릭을 수집해 공격 IP를 Blacklist에 자동 등록하는 Circuit Breaker를 연결합니다.

### Q3. Circular Buffer readPos·writePos가 역전되어 같은 데이터를 두 번 파싱하는 버그가 재현됐습니다. 경계 조건을 어떻게 검증하나요?

역전은 주로 Consume(totalLen)에서 `readPos = (readPos + totalLen) % capacity`를 잘못 구현할 때 발생합니다. 검증 방법: (1) **단위 테스트**: capacity 경계를 넘는 Wrap-around 시나리오 — readPos=capacity-2, totalLen=4인 경우 새 readPos=2가 되는지 확인. (2) **Assert**: `readPos != writePos` 보장 상태에서 `Readable() == 0`이 되는지 확인 — 빈 조건 처리 방식 검증. (3) **Fuzz Testing**: libFuzzer로 임의 길이 Append→Consume 시퀀스를 주입해 readPos>capacity 발생 여부 탐지. (4) **Invariant Check**: Consume 후 `assert(readPos < capacity && Readable() >= 0)` 삽입해 Debug 빌드에서 조기 탐지합니다.

### Q4. recv 후 while 파싱 루프 없이 Frame 하나만 처리하는 구현에서 지연 민원이 발생했습니다. 어떻게 재현하고 수정하나요?

재현: Nagle Algorithm이 활성화된 클라이언트에서 60Hz Tick으로 2~3개 Packet이 한 recv에 합쳐져 도착할 때, 하나만 처리하면 나머지가 다음 Network 이벤트(최대 수백 ms)까지 지연됩니다. 재현 방법: 서버 측 `recv` 호출 후 `Buffer.Readable()`이 `HEADER_SIZE` 이상인데도 처리 안 된 Frame을 로그로 확인. 수정: `TryParseFrame`을 while 루프로 감싸 `FrameReady`를 반환하는 동안 계속 호출. `NeedMore` 또는 `ProtocolError`에서 탈출. 수정 후 Frame당 처리 지연을 Histogram으로 측정해 개선 폭을 확인합니다.

### Q5. UDP 게임 서버에서 MTU 1400B를 초과하는 스킬 이펙트 Packet이 분할 재조립 실패로 누락됩니다. Fragment 재조립 설계에서 어떤 검증이 필요한가요?

Application 계층 분할 재조립 설계: (1) **Fragment 식별**: Message ID(uint32) + Fragment Index(uint8) + Fragment Count(uint8) 헤더. (2) **최대 크기 검증**: 조각 Count × MTU가 최대 메시지 크기(예: 64KB)를 초과하면 폐기. (3) **Timeout**: 첫 Fragment 수신 후 500ms 이내에 전체 Count가 모이지 않으면 폐기 — 불완전 Fragment의 메모리 점유 공격 방지. (4) **메모리 상한**: 재조립 중인 메시지 수 × 최대 크기의 합이 세션당 상한(예: 1MB)을 넘으면 해당 세션 연결 종료. (5) **중복 Fragment**: 같은 Index가 두 번 오면 두 번째를 폐기해 공격자가 데이터를 덮어쓰지 못하게 합니다.

### Q6. Protocol Version 업그레이드 중 신 서버·구 클라이언트 조합에서 연결 즉시 끊기는 문제가 발생했습니다. Handshake Version 협상 실패를 어떻게 진단하고 수정하나요?

진단: (1) `connection_close_reason=version_mismatch` 로그를 신 서버 배포 시점과 대조. (2) Handshake Packet의 client_version 필드 분포를 확인 — 구 클라이언트가 지원하지 않는 Version을 신 서버가 최솟값으로 요구하는 경우. 수정: (1) 신 서버는 지원 가능한 버전 범위(min~max)를 Handshake에서 전달. (2) 구 클라이언트 Version이 min 이상이면 구 Layout으로 응답. (3) Rolling Deploy 동안 "구 서버 20%·신 서버 80%" 혼재 시 클라이언트가 연결 대상 버전을 식별할 수 있도록 Server Version을 Handshake 응답에 포함. (4) Staging에서 구 Client 바이너리와 신 Server를 함께 테스트해 Version Negotiation이 올바른지 확인합니다.

## 10. 예상 꼬리질문

- Partial Header가 도착한 상태에서 연결이 끊겼을 때 Circular Buffer에 남은 Byte가 다음 세션 재사용으로 이어지는 버그를 Session 초기화에서 어떻게 방지하나요?
- Frame Body를 Zero-copy Span으로 비동기 Handler에 넘겼는데 Buffer 재사용 후 데이터가 깨졌습니다. 수명을 보장하는 설계 방법(Reference-counted Segment, owning copy)을 비교해 주세요.
- 초당 1만 건 소형 Packet(100B) 서버에서 Circular Buffer를 16KB로 설정했는데 Buffer 부족이 발생했습니다. Buffer 크기 결정 기준(p99 recv 크기·Burst Factor)을 설명해 주세요.
- libFuzzer로 Parser를 검증했는데 Corpus 100만 건에서 Crash가 0건이었습니다. Fuzz 커버리지가 충분한지 확인하는 방법(Coverage Report, Edge Case 수동 추가)은 무엇인가요?
- 1KB 압축 데이터가 100MB로 해제되는 Compression Bomb 시도가 있었습니다. 해제 전 크기 제한을 어느 단계에서 어떻게 검증하나요?
- Rolling Deploy 중 구 Client(v1)·신 Server(v2) 조합에서 Reserved 필드 해석 차이로 Parser Error가 발생했습니다. Reserved 필드 호환성을 보장하는 방법은?
- Parser Error가 특정 ISP에서 집중됩니다. MTU 차이로 인한 Fragmentation인지, Protocol 오류인지 구분하는 지표(Packet 크기 분포, Fragment Count)는 무엇인가요?

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
