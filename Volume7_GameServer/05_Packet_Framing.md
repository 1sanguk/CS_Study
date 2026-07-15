---
difficulty: 3
reading_time: 25분
interview_frequency: 5
importance: 5
---

# 05. Packet Framing

> 게임 서버·백엔드 개발자를 위한 CS 면접 교재

## 학습 목표
- 핵심 정의와 등장 이유를 설명할 수 있다.
- 데이터·상태 흐름과 Trade-off를 설명할 수 있다.
- 게임 서버 운영과 장애 대응에 적용할 수 있다.

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
길이 120인 Packet Header만 먼저 도착하면 Server는 120Byte가 모두 모일 때까지 기다린다. 다음 recv에서 나머지와 다음 Packet 일부가 함께 와도 Buffer Offset으로 정확히 두 Message를 분리한다.

## 5. 비슷한 개념과 비교
고정 길이는 Parsing이 단순하지만 작은 Message도 공간을 낭비한다. Length Prefix는 유연하지만 길이 위조와 최대 크기를 반드시 검증해야 한다.
## 6. 장점과 단점
Packet Framing을 올바르게 적용하면 상태와 처리 책임이 명확해지고 Peak 부하와 장애에 대한 예측 가능성이 높아진다. 반면 Length Prefix, Header 크기와 최대 Packet 정책을 잘못 정하면 지연, 상태 불일치 또는 운영 복잡도가 늘어난다. 실제 요구와 측정 결과를 기준으로 필요한 범위만 적용한다.
## 7. 게임 서버·백엔드 실무 예시
header에 totalLength, messageType, version을 두고 최대 크기보다 크거나 최소 Header보다 작은 값은 즉시 거부한다. 불완전 데이터는 Buffer에 보관하고 Complete Message만 Dispatch한다.

Packet Framing 관점에서는 운영에서는 연결 수, Packet Rate, Queue 길이, Tick p99, Drop·Retry, Memory와 Thread 고갈을 같은 시간축에서 본다.

## 8. 자주 하는 오해
- **Length Prefix**을 도입하면 관련 문제가 자동으로 모두 해결된다고 생각한다.
- **Header 크기**을 도입하면 관련 문제가 자동으로 모두 해결된다고 생각한다.
- **최대 Packet**을 도입하면 관련 문제가 자동으로 모두 해결된다고 생각한다.
- **Partial Read**을 도입하면 관련 문제가 자동으로 모두 해결된다고 생각한다.
- **Multiple Frames**을 도입하면 관련 문제가 자동으로 모두 해결된다고 생각한다.
## 9. 면접 질문
### Q1. 핵심 개념을 설명해 주세요.
패킷 프레이밍은 TCP 바이트 스트림에서 응용 메시지의 시작과 끝을 구분하는 규칙이다.
### Q2. 왜 필요한가요?
TCP의 Send·Receive 호출 경계가 보존되지 않으므로 부분 수신과 여러 메시지 결합을 정확히 파싱해야 한다.
### Q3. 실무에서는 어떻게 적용하나요?
header에 totalLength, messageType, version을 두고 최대 크기보다 크거나 최소 Header보다 작은 값은 즉시 거부한다. 불완전 데이터는 Buffer에 보관하고 Complete Message만 Dispatch한다.
### Q4. 장애 시 무엇을 확인하나요?
Packet Framing 관점에서는 상태 소유자, Queue와 Buffer, Sequence, Timeout, Drop·Retry와 p99를 확인한다.

## 10. 예상 꼬리질문
- Length Prefix의 최종 소유자는 어디에 두나요?
- Header 크기 처리에서 중복과 역순은 어떻게 구분하나요?
- 최대 Packet의 상한을 넘으면 어떤 요청부터 제한하나요?
- Partial Read 장애를 어떻게 재현하고 복구를 검증하나요?
- Multiple Frames 관련 p99가 증가하면 어떤 지표를 함께 보나요?
## 11. 30초 모범답변
> Packet Framing은 TCP Stream을 Length나 Delimiter로 Message 단위로 복원하는 과정입니다. 부분 수신과 합쳐진 수신을 처리하고 길이를 검증해야 합니다. header에 totalLength, messageType, version을 두고 최대 크기보다 크거나 최소 Header보다 작은 값은 즉시 거부한다.

## 12. 1~2분 확장답변
> Packet Framing은 TCP Stream을 Length나 Delimiter로 Message 단위로 복원하는 과정입니다. 부분 수신과 합쳐진 수신을 처리하고 길이를 검증해야 합니다. 설계에서는 상태 소유권, 입력 검증과 Message 순서를 먼저 정합니다. Network I/O와 Logic 실행을 분리하되 Queue에 상한과 Backpressure를 둡니다. 게임 서버에서는 평균 처리량보다 Tick과 Packet 지연의 p99, 재접속과 배포 시나리오까지 검증해야 합니다.

## 13. 핵심 요약
- 패킷 프레이밍은 TCP 바이트 스트림에서 응용 메시지의 시작과 끝을 구분하는 규칙이다.
- 상태 소유권과 입력 검증이 핵심이다.
- 순서·Timeout·재처리를 정의한다.
- Queue와 Buffer에는 상한이 필요하다.
- 운영에서는 p99와 Overload를 관찰한다.

## 한 줄 정리
> Packet Framing은 TCP Stream을 Length나 Delimiter로 Message 단위로 복원하는 과정입니다. 부분 수신과 합쳐진 수신을 처리하고 길이를 검증해야 합니다.
