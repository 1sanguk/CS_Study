---
difficulty: 3
reading_time: 25분
interview_frequency: 5
importance: 5
---

# 06. Serialization과 Endian

> 게임 서버·백엔드 개발자를 위한 CS 면접 교재

## 학습 목표
- 핵심 정의와 등장 이유를 설명할 수 있다.
- 데이터·상태 흐름과 Trade-off를 설명할 수 있다.
- 게임 서버 운영과 장애 대응에 적용할 수 있다.

## 1. 개요
직렬화는 객체를 전송·저장 가능한 Byte 표현으로 바꾸고 Endian은 여러 Byte 정수의 Byte 순서를 정하는 규칙이다.

## 2. 왜 필요한가
서로 다른 언어·플랫폼이 같은 필드 의미와 숫자를 일관되게 해석해야 한다. 게임 서버는 정확성뿐 아니라 제한 시간 안의 처리와 장애 후 복구를 함께 제공해야 한다.

## 3. 핵심 동작 원리
```text
object fields→schema/version→encode bytes→network→decode/validate→object
```
Binary는 작고 빠를 수 있지만 Debug와 호환성 관리가 필요하고 Text는 가독성이 좋지만 크기·Parsing 비용이 크다. Network Byte Order는 Big Endian이다.

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

JSON은 사람이 읽고 도구로 확인하기 쉽지만 Field Name 반복, Parsing과 Allocation 비용이 있다. Protocol Buffers나 MessagePack 같은 Binary 형식은 크기와 처리 비용을 줄이기 좋지만 Schema와 Debug 도구가 필요하다. 운영 API에는 JSON, 고빈도 이동 Packet에는 Binary가 적합할 수 있다. 실제 Payload 크기, CPU와 Allocation을 측정해 선택한다.

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
C# Client가 uint32 점수와 UTF-8 이름을 Encode하면 C++ Server도 같은 폭과 Encoding으로 읽어야 한다. 새 선택 Field를 추가할 때 이전 Client가 모르는 값을 건너뛰는지도 Fixture로 검증한다.

## 5. 비슷한 개념과 비교
Text Format은 관찰이 쉽고 Binary Format은 크기와 Parsing 비용을 줄이기 좋다. 선택은 Packet 빈도, Schema 변경과 Debug 요구를 함께 비교한다.
## 6. 장점과 단점
Serialization과 Endian을 올바르게 적용하면 상태와 처리 책임이 명확해지고 Peak 부하와 장애에 대한 예측 가능성이 높아진다. 반면 Wire Schema, 고정 폭 숫자와 문자열 Encoding 정책을 잘못 정하면 지연, 상태 불일치 또는 운영 복잡도가 늘어난다. 실제 요구와 측정 결과를 기준으로 필요한 범위만 적용한다.
## 7. 게임 서버·백엔드 실무 예시
필드 번호와 기본값으로 이전 Client와 호환하고 필수·선택 필드를 구분한다. 입력 길이, Enum 범위와 중첩 깊이를 검증해 Memory 공격을 막는다.

Serialization과 Endian 관점에서는 운영에서는 연결 수, Packet Rate, Queue 길이, Tick p99, Drop·Retry, Memory와 Thread 고갈을 같은 시간축에서 본다.

## 8. 자주 하는 오해
- **Wire Schema**을 도입하면 관련 문제가 자동으로 모두 해결된다고 생각한다.
- **고정 폭 숫자**을 도입하면 관련 문제가 자동으로 모두 해결된다고 생각한다.
- **문자열 Encoding**을 도입하면 관련 문제가 자동으로 모두 해결된다고 생각한다.
- **Endian 변환**을 도입하면 관련 문제가 자동으로 모두 해결된다고 생각한다.
- **Float 표현**을 도입하면 관련 문제가 자동으로 모두 해결된다고 생각한다.
## 9. 면접 질문
### Q1. 핵심 개념을 설명해 주세요.
직렬화는 객체를 전송·저장 가능한 Byte 표현으로 바꾸고 Endian은 여러 Byte 정수의 Byte 순서를 정하는 규칙이다.
### Q2. 왜 필요한가요?
서로 다른 언어·플랫폼이 같은 필드 의미와 숫자를 일관되게 해석해야 한다.
### Q3. 실무에서는 어떻게 적용하나요?
필드 번호와 기본값으로 이전 Client와 호환하고 필수·선택 필드를 구분한다. 입력 길이, Enum 범위와 중첩 깊이를 검증해 Memory 공격을 막는다.
### Q4. 장애 시 무엇을 확인하나요?
Serialization과 Endian 관점에서는 상태 소유자, Queue와 Buffer, Sequence, Timeout, Drop·Retry와 p99를 확인한다.

## 10. 예상 꼬리질문
- Wire Schema의 최종 소유자는 어디에 두나요?
- 고정 폭 숫자 처리에서 중복과 역순은 어떻게 구분하나요?
- 문자열 Encoding의 상한을 넘으면 어떤 요청부터 제한하나요?
- Endian 변환 장애를 어떻게 재현하고 복구를 검증하나요?
- Float 표현 관련 p99가 증가하면 어떤 지표를 함께 보나요?
## 11. 30초 모범답변
> Serialization은 객체를 합의된 Byte Schema로 변환하며 Endian은 다중 Byte 값의 순서를 정합니다. Version 호환성과 신뢰하지 않는 입력 검증이 핵심입니다. 필드 번호와 기본값으로 이전 Client와 호환하고 필수·선택 필드를 구분한다.

## 12. 1~2분 확장답변
> Serialization은 객체를 합의된 Byte Schema로 변환하며 Endian은 다중 Byte 값의 순서를 정합니다. Version 호환성과 신뢰하지 않는 입력 검증이 핵심입니다. 설계에서는 상태 소유권, 입력 검증과 Message 순서를 먼저 정합니다. Network I/O와 Logic 실행을 분리하되 Queue에 상한과 Backpressure를 둡니다. 게임 서버에서는 평균 처리량보다 Tick과 Packet 지연의 p99, 재접속과 배포 시나리오까지 검증해야 합니다.

## 13. 핵심 요약
- 직렬화는 객체를 전송·저장 가능한 Byte 표현으로 바꾸고 Endian은 여러 Byte 정수의 Byte 순서를 정하는 규칙이다.
- 상태 소유권과 입력 검증이 핵심이다.
- 순서·Timeout·재처리를 정의한다.
- Queue와 Buffer에는 상한이 필요하다.
- 운영에서는 p99와 Overload를 관찰한다.

## 한 줄 정리
> Serialization은 객체를 합의된 Byte Schema로 변환하며 Endian은 다중 Byte 값의 순서를 정합니다. Version 호환성과 신뢰하지 않는 입력 검증이 핵심입니다.
