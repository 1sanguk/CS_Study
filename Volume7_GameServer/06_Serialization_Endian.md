---
difficulty: 3
reading_time: 25분
interview_frequency: 5
importance: 5
---

# 06. Serialization과 Endian


## 학습 목표

- 이동 Packet의 x·y 좌표를 float32로 직렬화했는데 서버와 클라이언트 시뮬레이션 결과가 Tick마다 누적 차이가 날 때, IEEE754 float 비결정론 조건을 진단하고 정수 고정소수점 전환 여부를 결정할 수 있다.
- 신규 서버 배포 후 구 클라이언트에서 역직렬화 오류가 발생했을 때, Field 번호 재사용·Reserved 미처리·Fixture Test 누락 중 Breaking Change 원인을 특정하고 호환성 복구 설계를 결정할 수 있다.
- 역직렬화 경계에서 NaN·배열 원소 수 초과·문자열 최대 Byte 위반을 진단하고, Packet Drop·Session 종료·Rate Limit 중 오류 유형과 빈도를 기준으로 대응 정책을 결정할 수 있다.
- 60Hz 1만 CCU 서버에서 Protobuf Serialization CPU가 30%를 넘었을 때, Custom Binary·Protobuf·JSON 중 Payload 크기와 Parsing CPU 실측 결과를 기준으로 형식을 결정할 수 있다.

## 1. 개요
직렬화는 객체를 전송·저장 가능한 Byte 표현으로 바꾸고 Endian은 여러 Byte 정수의 Byte 순서를 정하는 규칙이다.

## 2. 왜 필요한가
서로 다른 언어·플랫폼이 같은 필드 의미와 숫자를 일관되게 해석해야 한다. 게임 서버는 정확성뿐 아니라 제한 시간 안의 처리와 장애 후 복구를 함께 제공해야 한다.

## 3. 핵심 동작 원리
```text
object fields→schema/version→encode bytes→network→decode/validate→object
```
Binary는 작고 빠를 수 있지만 Debug와 호환성 관리가 필요하고 Text는 가독성이 좋지만 크기·Parsing 비용이 크다. Network Byte Order는 Big Endian(MSB(Most Significant Byte) 우선)이다.

상태의 최종 소유자, Message 순서, Timeout과 실패 후 재처리 기준을 명시한다.
### Schema와 Wire Format

직렬화의 핵심은 객체를 Byte로 바꾸는 것보다 송신자와 수신자가 같은 의미를 공유하게 하는 것이다. Message Type, Schema Version, Field 자료형과 필수 여부를 정한다. 언어마다 크기가 달라질 수 있는 형식은 Wire에서 `int32`, `uint64`처럼 고정한다. 문자열은 Encoding과 Byte 길이, 시간은 기준 시각과 단위를 합의한다.

```text
PlayerMove
  1: playerId uint64
  2: sequence uint32
  3: x, y     float32
```

메모리 구조체를 그대로 보내면 Padding, Alignment, Compiler와 Endian 차이 때문에 깨질 수 있다. Field를 규약대로 명시적으로 Encode·Decode한다.

### Text와 Binary

JSON(JavaScript Object Notation)은 사람이 읽고 도구로 확인하기 쉽지만 Field Name 반복, Parsing과 Allocation 비용이 있다. Protocol Buffers나 MessagePack 같은 Binary 형식은 크기와 처리 비용을 줄이기 좋지만 Schema와 Debug 도구가 필요하다. 운영 API에는 JSON, 고빈도 이동 Packet에는 Binary가 적합할 수 있다. 실제 Payload 크기, CPU와 Allocation을 측정해 선택한다.

### Endian

값 `0x12345678`은 Big Endian에서 `12 34 56 78`, Little Endian에서 `78 56 34 12` 순서다. 송신 시 Host 표현을 Wire 표현으로, 수신 시 반대로 변환한다. 한 Byte 값에는 Endian 문제가 없고 여러 Byte 숫자를 해석할 때 생긴다. Float도 임의 Memory Copy보다 Protocol이 정의한 변환을 쓴다.

### 버전 호환성

Client와 Server는 동시에 배포되지 않는다. 새 Field는 선택 항목으로 추가하고 이전 수신자가 모르는 Field를 건너뛰게 한다. 기존 Field 번호나 의미를 재사용하지 않는다. 삭제한 번호는 Reserved 처리한다. 필수 의미가 바뀌면 Version 협상이나 새 Message Type을 사용한다.

```text
old client → fields 1,2   → new server: field 3 기본값
new client → fields 1,2,3 → old server: field 3 건너뜀
```

이전 Payload를 새 코드가 읽고 새 Payload를 허용 범위에서 이전 코드가 읽는 Fixture Test를 둔다. 실제 Packet Sample Replay도 배포 사고를 줄인다.

### 안전한 역직렬화

Network 입력은 신뢰하지 않는다. Packet 최대 길이, 문자열과 배열 원소 수, 남은 Buffer, 중첩 깊이, Enum 범위, NaN·Infinity와 Integer Overflow를 검증한다. Decode와 Validation을 마친 객체만 Logic Queue에 넣는다. 실패 시 Packet만 버릴지 Session을 닫을지 정책을 정한다.

Fuzz Test와 경계값 Test로 Length 처리 오류를 찾는다. 오류 Log에는 인증 Token 같은 원문을 남기지 않는다. Zero-copy는 복사를 줄이지만 Buffer Lifetime을 복잡하게 하므로 Queue가 처리하기 전에 Pool Buffer가 반환되지 않도록 소유권을 명확히 한다.

### 실무 설계 검토 체크리스트

- **Wire Schema**: Wire Schema의 입력이 어디서 생성되고 어느 실행 흐름이 상태를 소유하는지 먼저 정한다. 다른 구성 요소는 상태를 직접 고치지 않고 명시된 경계를 통해 요청한다.
- **고정 폭 숫자**: 고정 폭 숫자의 정상 처리 순서를 Diagram으로 확인한다. 중간 단계가 실패했을 때 이미 반영된 상태와 다시 수행해도 되는 작업을 구분한다.
- **문자열 Encoding**: 문자열 Encoding에 적용할 최대 개수, Byte 또는 시간 한도를 정한다. 한도를 넘으면 대기, 거절, Drop 가운데 업무 의미에 맞는 정책을 사용한다.
- **Endian 변환**: Endian 변환 관련 Message에는 중복과 역순을 식별할 Sequence나 Version이 필요한지 판단한다. 오래된 작업이 새 Session 상태를 덮지 않게 한다.
- **Float 표현**: Float 표현가 느려질 때 상위 Queue와 호출자까지 지연이 전파되는 경로를 확인한다. Timeout과 Backpressure가 연쇄 Retry를 만들지 않게 한다.
- **필수 Field**: 필수 Field의 평균 처리량만으로 용량을 결정하지 않는다. Peak 부하에서 p95·p99 지연, Memory와 Queue 깊이가 허용 범위인지 측정한다.
- **선택 Field**: 선택 Field를 Client가 주장할 수 있다면 Server가 다시 계산하거나 검증할 항목을 정한다. 허용 오차와 반복 위반 처리 기준도 기록한다.
- **Field 번호**: Field 번호 변경은 이전 Client나 Server와 동시에 존재할 수 있다. Version 협상, 기본값과 단계적 배포로 전후 호환성을 확인한다.
- **Version 협상**: Version 협상 장애를 재현하는 Test를 만든다. Timeout, 연결 종료, 중복 Callback과 Process 재시작 뒤에도 자원과 상태가 한 번만 정리되는지 확인한다.
- **기본값**: 기본값 관련 Log에는 Match·Session·Sequence 같은 추적 Key를 남긴다. 민감 정보는 제외하고 원인 판별에 필요한 지표와 함께 조회한다.
- **길이 검증**: 길이 검증 최적화는 실제 Profile 결과를 근거로 적용한다. CPU를 줄이는 대신 Memory, 복사 감소 대신 Lifetime 복잡도가 늘 수 있음을 비교한다.
- **중첩 제한**: 중첩 제한의 Owner를 배포 중 교체할 때 새 요청 차단, 진행 작업 Drain과 상태 이전 순서를 정의한다. 구 Version Callback은 식별 후 폐기한다.
- **Zero-copy**: Zero-copy 결과가 영속 데이터나 외부 서비스에 반영되면 성공 응답의 기준을 정한다. 불확실한 결과는 조회와 Reconciliation으로 확정한다.
- **Fixture Test**: Fixture Test 기능을 독립 Service나 Thread로 분리할지는 확장과 장애 격리 이득으로 판단한다. Network·Queue 이동과 운영 비용도 함께 계산한다.
- **직렬화 지표**: 직렬화 지표 정책은 정상 사용자 경험과 악용 방지를 함께 고려한다. 너무 넓은 허용 범위와 지나치게 엄격한 오탐 사이를 실제 분포로 조정한다.

이 항목은 Serialization과 Endian 설계 Review에서 실제 요구와 실패 조건을 빠뜨리지 않기 위한 기준이다. 모든 장치를 일괄 적용하지 않고 측정된 위험과 운영 목표에 필요한 항목만 선택한다.
### 장애 시나리오 연습

Serialization과 Endian은 정상 경로만 구현해서는 운영 준비가 끝나지 않는다. 다음 상황을 부하·Network Simulator와 장애 주입 Test로 재현한다.

- **Wire Schema**: Wire Schema 요청이 정상 처리됐지만 응답만 손실된 상황을 가정한다. 호출자가 재시도해도 같은 상태 변경이 두 번 발생하지 않도록 Sequence, Version 또는 Idempotency Key를 둔다.
- **고정 폭 숫자**: 고정 폭 숫자 처리 시간이 평소의 열 배로 증가한 상황을 재현한다. 제한 Queue, Timeout과 Admission Control이 다른 Session과 Tick까지 지연을 퍼뜨리지 않는지 확인한다.
- **문자열 Encoding**: 문자열 Encoding Owner가 배포나 장애로 사라진 상황을 Test한다. 새 Owner 선택, 진행 중 작업 처리와 구 Callback 폐기 순서가 명확해야 한다.
- **Endian 변환**: Endian 변환 입력이 최대 크기, 빈 값, 오래된 Timestamp와 잘못된 Enum을 포함하는 경우를 검증한다. 실패한 입력이 부분 상태를 남기거나 Process를 종료시키면 안 된다.
- **Float 표현**: Float 표현 관련 Message가 중복·역순·지연 도착하는 Network 조건을 주입한다. 최종 상태가 순서 정책과 허용 Window에 맞는지 Replay로 비교한다.
- **필수 Field**: 필수 Field Capacity가 모두 사용된 Peak 상황에서 대기 시간을 무제한 늘리지 않는다. 업무 중요도에 따른 거절·Drop과 Client 재시도 안내가 함께 동작해야 한다.
- **선택 Field**: 선택 Field 복구 뒤 상태가 맞는지 원본 Event, Snapshot 또는 DB와 대조한다. 자동 복구가 불가능한 차이는 경고와 수동 Reconciliation 대상으로 남긴다.

Serialization과 Endian에서는 각 Test는 성공 여부만 기록하지 않는다. 처리 시간 분포, Queue 최대치, Drop·Retry 수와 복구 소요 시간을 남겨 다음 배포의 기준값으로 사용한다.

## 4. 쉬운 예시

아래는 C++에서 Endian 변환과 필드별 직렬화를 직접 구현한 예시다.

```cpp
// Protocol: PlayerMove
// | playerId(8B) | sequence(4B) | x(4B) | y(4B) |  = 20B fixed

// Endian 변환 유틸
uint32_t htonl_f(float f) {
    uint32_t tmp;
    memcpy(&tmp, &f, 4);   // Float 비트 패턴 복사 (UB 없이)
    return htonl(tmp);     // Host → Network Byte Order
}
float ntohl_f(uint32_t n) {
    uint32_t tmp = ntohl(n);
    float f;
    memcpy(&f, &tmp, 4);
    return f;
}

// 직렬화
void SerializePlayerMove(uint8_t* buf, uint64_t playerId,
                         uint32_t seq, float x, float y) {
    uint64_t id_n = htobe64(playerId);
    uint32_t seq_n = htonl(seq);
    uint32_t x_n   = htonl_f(x);
    uint32_t y_n   = htonl_f(y);
    memcpy(buf,      &id_n,  8);
    memcpy(buf + 8,  &seq_n, 4);
    memcpy(buf + 12, &x_n,   4);
    memcpy(buf + 16, &y_n,   4);
}

// 역직렬화 + 검증
bool DeserializePlayerMove(const uint8_t* buf, size_t len,
                           PlayerMove& out) {
    if (len < 20) return false;                         // 길이 먼저
    uint64_t id_n; memcpy(&id_n, buf,      8);
    uint32_t seq_n; memcpy(&seq_n, buf + 8,  4);
    uint32_t x_n;   memcpy(&x_n,   buf + 12, 4);
    uint32_t y_n;   memcpy(&y_n,   buf + 16, 4);

    out.playerId = be64toh(id_n);
    out.sequence = ntohl(seq_n);
    out.x        = ntohl_f(x_n);
    out.y        = ntohl_f(y_n);

    if (!isfinite(out.x) || !isfinite(out.y)) return false;  // NaN/Inf 차단
    if (out.x < -1000 || out.x > 1000) return false;         // 맵 범위 검증
    return true;
}
```

- `memcpy`로 Float 비트를 복사하는 이유: `*(uint32_t*)&f`는 Strict Aliasing UB다.
- 역직렬화에서 길이 검증 → Endian 변환 → 논리 검증 순서를 지킨다.

## 5. 비슷한 개념과 비교

| 형식 | 예시 | 크기 | 가독성 | Schema 필요 | 호환성 관리 |
|------|------|------|--------|------------|------------|
| **JSON** | `{"x":1.5}` | 크다 | 높다 | 불필요 | Field 추가 쉬움 |
| **Protocol Buffers** | 이진 + .proto | 작다 | 없음 | 필요 | Field 번호로 관리 |
| **MessagePack** | 이진 | 중간 | 없음 | 선택 | Tag 기반 |
| **Custom Binary** | 직접 정의 | 최소 | 없음 | 직접 관리 | 수작업 버전 관리 |
| **FlatBuffers** | 이진 Zero-copy | 작다 | 없음 | 필요 | 추가만 허용 |

운영 REST API에는 JSON, 고빈도 이동 Packet에는 Protobuf나 Custom Binary가 적합하다.

## 6. 장점과 단점

**장점**
- 언어·플랫폼이 달라도 합의된 Wire 형식으로 동일한 데이터를 주고받을 수 있다.
- Field 번호와 선택 필드로 Old Client–New Server 조합을 무중단 배포 중에도 지원한다.
- Binary 형식은 Payload 크기와 Parsing CPU를 줄여 고빈도 Packet에서 효과적이다.
- 역직렬화 경계에서 입력을 검증해 Logic Layer로는 신뢰할 수 있는 데이터만 전달한다.

**단점**
- Binary 형식은 Wireshark나 로그로 직접 읽기 어렵고 Debug 도구가 필요하다.
- Schema 변경 시 이전/이후 버전 호환성을 직접 검증해야 한다.
- Custom Binary는 Length·Endian·Padding 등 직접 구현 실수가 숨기 쉽다.
- Float 결정론 문제로 서버 시뮬레이션에서 IEEE754 Float를 그대로 쓰기 어렵다.

## 7. 게임 서버·백엔드 실무 예시

이동 Packet은 Custom Binary(20B 고정)로 크기를 최소화하고, 채팅·로그인 등 저빈도 Packet은 Protobuf를 사용한다. 역직렬화 실패 시 해당 Packet만 버리고 Session을 유지하되, 같은 Session에서 실패가 반복되면 연결을 끊는다.

Schema .proto 파일을 서버·클라이언트 공용 저장소에서 단일 소스로 관리해 팀 간 불일치를 막는다. Fixture Test에서 구 버전 Packet을 신 버전 코드가 읽고, 신 버전 Packet을 구 버전 코드가 읽는 케이스를 자동화한다.

## 8. 자주 하는 오해

- **Protobuf를 쓰면 Schema 버전 관리가 필요 없다**: Field 번호 재사용이나 필수 필드 제거는 Breaking Change다. 번호를 Reserved 처리하고 삭제한 필드는 재사용하지 않아야 한다.
- **고정 폭 숫자를 쓰면 범위 초과 걱정이 없다**: uint16으로 받은 좌표가 맵 크기를 벗어날 수 있다. 타입 범위 내에서도 논리 범위 검증이 별도로 필요하다.
- **UTF-8로 보내면 문자열 Encoding 문제가 해결된다**: Null 종료 여부, 최대 Byte 길이, 제어 문자 처리도 명시해야 한다. 이름 필드에 제어 문자나 SQL 삽입 시도가 올 수 있다.
- **Float를 그대로 직렬화하면 결정론적 시뮬레이션이 가능하다**: Float 연산은 FPU(Floating Point Unit) 설정과 컴파일러 최적화(-ffast-math 등)에 따라 결과가 달라진다. 서버 Authoritative 시뮬레이션에는 정수 고정소수점이 필요하다.
- **Endian만 맞추면 플랫폼 간 호환성이 완전히 보장된다**: 구조체 Padding, 비트 필드 순서, `int` 크기 차이가 여전히 남는다. Field를 명시적으로 Encode·Decode해야 안전하다.
- **역직렬화 실패 시 연결을 끊으면 그만이다**: 단순 파싱 오류인지 악의적 공격인지 구분하고, 오류 빈도를 IP별로 집계해 Rate Limit을 적용해야 한다.
- **Zero-copy 역직렬화를 쓰면 성능이 항상 좋다**: Buffer를 Handler가 소비하기 전에 Pool로 반환하면 Dangling Pointer가 생긴다. Lifetime 관리 비용이 복사보다 클 수 있다.
- **NaN·Infinity는 Float 연산 결과에서만 나온다**: 공격자가 NaN Byte 패턴을 직접 보낼 수 있다. 역직렬화 직후 `isfinite()` 검증이 필요하다.

## 9. 면접 질문

### Q1. Competitive PvP 서버에서 클라이언트와 서버의 x좌표 시뮬레이션 결과가 매 Tick 0.001씩 누적 차이가 발생합니다. Float 비결정론이 원인인지 어떻게 진단하나요?

(1) **재현 조건 격리**: 같은 입력 Sequence를 서버에서 두 번 실행해 결과가 다른지 확인 — 다르면 비결정 요소(멀티스레드 실행 순서·외부 상태) 의심. (2) **Float 연산 확인**: `-ffast-math` 컴파일 옵션 제거 후 차이 감소 여부, SIMD Width 차이(SSE vs AVX) 확인. (3) **Replay 검증**: 서버 입력·RNG Seed·Tick 결과를 로그로 기록 후 재실행해 동일 결과 여부 확인. (4) **고정소수점 전환 판단 기준**: 누적 오차가 이동 Tolerance(예: 10cm)를 넘거나 Correction 빈도가 초당 3회 이상이면 좌표를 정수(mm 단위)로 직렬화하는 고정소수점으로 전환합니다.

### Q2. 신규 서버 배포 후 구 클라이언트에서 unknown_field_error가 급증했습니다. Field 번호 재사용과 Reserved 미처리 중 어떤 Breaking Change인지 어떻게 특정하나요?

(1) **Field 번호 재사용 확인**: 현재 .proto와 배포 전 .proto를 diff — 삭제된 Field 번호가 신 Field에 재사용됐다면, 구 클라이언트가 해당 번호를 이전 타입으로 해석해 파싱 오류 발생. (2) **Reserved 미처리 확인**: 삭제된 Field 번호가 `reserved` 선언 없이 제거됐다면, 신 서버가 구 Field를 건너뛰지 못하고 오류. (3) **Fixture Test 실행**: 구 버전 Packet 바이너리를 신 코드로 파싱해 실패하는 케이스 확인. 방어: (1) 삭제한 Field 번호는 즉시 `reserved` 처리. (2) CI에 Backward Compatibility Fixture Test를 추가해 배포 전 검증합니다.

### Q3. 이동 Packet 역직렬화에서 x=NaN이 Logic Layer까지 전파돼 Combat 좌표가 NaN으로 오염됐습니다. 어떤 단계에서 차단하나요?

역직렬화 경계에서 Logic Layer 진입 전에 차단해야 합니다. (1) **Float 변환 직후**: `if (!isfinite(out.x) || !isfinite(out.y)) return ProtocolError` — Endian 변환 직후 수행. (2) **논리 범위 검증**: `if (out.x < MAP_MIN || out.x > MAP_MAX) return ProtocolError` — isfinite 이후 순서. (3) **오류 정책**: NaN 탐지는 Parser Bug가 아닌 악의적 시도일 가능성이 높으므로 Packet Drop + `deserialize_nan_count_by_ip` 카운터 증가. IP별 카운터가 10회/분을 넘으면 Rate Limit 적용. (4) **Logic Layer 방어**: 이미 전파됐다면 Combat System 입력에 Sanitize Guard(`if (!isfinite(x)) reject`)를 추가 배포합니다.

### Q4. 60Hz 1만 CCU 서버에서 Protobuf Serialization CPU가 30%를 차지합니다. Custom Binary로 전환할 기준과 실측 방법을 설명하세요.

(1) **실측**: `perf record`·VTune으로 직렬화 함수별 CPU 시간을 측정. Protobuf Encoding에서 Allocation·Varint 인코딩이 Hot Path인지 확인. (2) **Payload 크기 비교**: 이동 Packet을 Protobuf vs Custom Binary(20B 고정)로 10만 건 비교 — Bandwidth 차이 측정. (3) **전환 기준**: CPU ≥ 10% 개선 또는 Payload 크기 ≥ 30% 감소 중 하나 이상이고, Schema 변경 빈도가 낮은 Packet(이동·좌표)에만 Custom Binary 적용. (4) **비용**: 저빈도 Packet(채팅·결제)은 Protobuf를 유지해 Schema 버전 관리 비용을 줄이고, 고빈도 Packet만 Custom Binary로 전환합니다.

### Q5. 채팅 메시지에 닉네임 필드(UTF-8)를 추가했는데 null 바이트 포함 닉네임이 DB 저장 오류를 유발했습니다. 역직렬화 경계에서 어떻게 방어하나요?

역직렬화 경계에서 UTF-8 문자열을 검증합니다. (1) **Byte 길이 상한**: 수신 후 즉시 `if (nickname.length > 256) ProtocolError` — Unicode 코드포인트 수가 아닌 Byte 기준. (2) **Null 바이트 차단**: `if (nickname.contains('\0')) ProtocolError` — DB 문자열 종료 문자 주입 방지. (3) **UTF-8 유효성**: 유효하지 않은 UTF-8 바이트 시퀀스 거부 — 이모지·멀티바이트 문자 처리 보장. (4) **제어 문자**: ASCII 0x00~0x1F, 0x7F 차단 — SQL 주입·CRLF 주입 방지. (5) 검증 순서: Byte 길이 → UTF-8 유효성 → Null 바이트 → 제어 문자 → 논리 검증 순서를 고정합니다.

### Q6. Rolling Deploy 중 신 서버와 구 서버가 50% 혼재할 때 신 클라이언트가 신 Field(field 5)를 보냈는데 구 서버가 잘못 처리했습니다. 원인과 방어 설계를 설명하세요.

원인: 구 서버 .proto에 field 5가 없어 건너뛰어야 하는데, 구현이 Unknown Field를 건너뛰지 않고 ProtocolError로 처리하는 경우입니다. (1) **원인 확인**: 구 서버 `unknown_field_drop` vs `unknown_field_error` 카운터 비교. (2) **즉시 수정**: 구 서버 Parser를 Unknown Field Skip 모드로 배포(Wire Type에 따라 Varint·Length-delimited·Fixed를 건너뜀). (3) **방어 설계**: Forward Compatibility Test — CI에서 신 Packet을 구 코드가 읽는 케이스를 의무화. (4) **배포 순서**: 신 Client 배포 전에 구 서버의 Forward Compatibility를 먼저 배포해 Unknown Field를 안전하게 처리하도록 합니다.

## 10. 예상 꼬리질문

- .proto 파일을 서버·클라이언트가 서로 다른 저장소에서 관리하다 Field 번호가 달라졌습니다. 단일 소스 저장소로 전환할 때 기존 두 저장소의 불일치를 어떻게 해소하나요?
- 구조체 memcpy 직렬화를 쓰다가 ARM 서버 도입 후 Alignment Fault가 발생했습니다. Strict Aliasing과 Alignment 문제를 동시에 피하는 안전한 방법은 무엇인가요?
- Varint(Protobuf) 인코딩 필드가 포함된 Packet의 Max Length를 사전 계산해야 하는 이유와, Encode 전 크기 추정이 틀렸을 때 어떤 문제가 생기나요?
- FlatBuffers로 전환 후 빌드 시간이 2배 늘었습니다. .fbs Schema 파일 증가로 인한 코드 생성 비용을 최소화하는 방법은 무엇인가요?
- CI Fixture Test에서 구 Packet을 신 코드가 파싱하는 케이스가 통과했는데 프로덕션에서 실패했습니다. 실제 구 Packet과 Fixture의 차이를 어떻게 좁히나요?
- 채팅 문자열 최대 Byte를 256B로 설정했는데 이모지가 많은 메시지가 코드포인트 256 기준으로 통과하고 Byte 기준으로는 초과합니다. 올바른 검증 순서와 기준을 설명해 주세요.
- 직렬화 오류 로그에서 어떤 필드는 기록하고 어떤 필드는 제외해야 하는지 기준과 이유를 설명해 주세요.



## 11. 30초 모범답변

> Serialization은 언어·플랫폼이 다른 시스템 간에 객체를 합의된 Byte 형식으로 주고받는 과정입니다. Endian은 멀티바이트 정수의 Byte 순서 규칙으로, 송수신 양쪽이 Network Byte Order(Big Endian)로 맞춥니다. 역직렬화에서는 길이·범위·NaN을 메모리 할당 전에 검증해야 합니다.

## 12. 1~2분 확장답변

> Serialization의 목적은 이기종 시스템이 같은 데이터를 동일하게 해석하게 하는 것입니다. JSON은 가독성이 높고 Schema 없이도 되지만 크기와 Parsing 비용이 크고, Protobuf 같은 Binary는 크기와 CPU가 작지만 Schema 관리가 필요합니다. 고빈도 이동 Packet에는 Binary, 운영 API에는 JSON이 적합합니다.
>
> Endian은 4바이트 정수의 Byte 저장 순서입니다. Network 표준은 Big Endian이므로 `htonl()/ntohl()`로 변환합니다. Float는 `*(uint32_t*)&f` 패턴이 Strict Aliasing UB이므로 `memcpy`로 비트를 복사한 뒤 Endian 변환합니다.
>
> 역직렬화는 네트워크 입력을 신뢰하지 않는 경계입니다. 길이, Enum 범위, NaN·Infinity, 문자열 최대 바이트를 검증해야 합니다. Schema 버전 호환성은 Field 번호 예약·선택 필드·Fixture Test로 유지합니다.

## 13. 핵심 요약

- Serialization은 이기종 언어·플랫폼이 객체를 합의된 Byte 형식으로 교환하는 규약이다.
- Endian은 멀티바이트 정수의 Byte 저장 순서이며, 네트워크 표준은 Big Endian이다.
- 송신 시 Host → Network Byte Order, 수신 시 반대로 변환한다.
- Float는 `memcpy`로 비트를 복사한 뒤 Endian 변환해야 Strict Aliasing UB를 피한다.
- 역직렬화는 네트워크 입력 신뢰 경계로, 길이·범위·NaN을 메모리 할당 전에 검증한다.
- 새 Field는 선택 항목으로 추가하고 삭제한 Field 번호는 Reserved 처리해 호환성을 유지한다.
- Fixture Test로 구 버전 Packet을 신 코드가, 신 버전 Packet을 구 코드가 읽는 케이스를 자동화한다.
- Binary 형식은 크기·CPU 효율이 높고, JSON은 가독성이 높아 용도에 따라 혼용한다.

## 한 줄 정리

> Serialization은 이기종 시스템 간 객체를 합의된 Byte 형식으로 교환하는 규약이며, Endian 변환으로 Byte 순서를 통일하고 역직렬화 경계에서 길이·범위·NaN을 검증해야 한다.
