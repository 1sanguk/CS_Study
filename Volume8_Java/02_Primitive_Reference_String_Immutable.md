---
difficulty: 2
reading_time: 25분
interview_frequency: 5
importance: 5
---

# 02. Primitive·Reference Type과 String·Immutability

> 게임 서버·백엔드 개발자를 위한 CS 면접 교재

## 학습 목표

- Java Primitive Type은 값 자체를 표현하고 Reference Type 변수는 Heap 객체를 가리키는 참조 값을 보관한다.
- 등장 이유와 핵심 동작을 설명할 수 있다.
- 게임 서버·백엔드 사례와 Trade-off를 면접 답변으로 연결할 수 있다.

## 1. 개요

Java Primitive Type은 값 자체를 표현하고 Reference Type 변수는 Heap 객체를 가리키는 참조 값을 보관한다.

## 2. 왜 필요한가

복사·동등성·Null·Memory와 변경 가능성을 정확히 이해해야 객체 상태 오류와 불필요한 Allocation을 줄일 수 있다.

## 3. 핵심 동작 원리

```text
primitive variable → value copy / reference variable → reference copy → shared object
```

이 흐름은 Primitive·Reference Type과 String·Immutability의 주요 처리 단계와 책임 경계를 나타낸다. 각 단계의 입력과 출력, 실패 시 복구 위치를 구분해야 한다.

### 1) 핵심 포인트

Java에는 boolean, byte, short, int, long, char, float, double의 Primitive Type이 있다. 크기와 숫자 승격 규칙을 알아야 Overflow와 비교 오류를 피할 수 있다. boolean의 구체적인 Memory 배치는 JVM 구현 대상이므로 Source 수준 규칙과 내부 배치를 구분한다.

### 2) 핵심 포인트

Reference 변수를 대입하면 객체 전체가 복사되는 것이 아니라 같은 객체를 가리키는 참조 값이 복사된다. 한 경로로 Mutable 객체를 바꾸면 다른 참조에서도 변경이 보인다. Method 인자도 항상 Pass-by-value이며 Reference가 값으로 전달되는 것이다.

### 3) 핵심 포인트

String은 Immutable이라 생성 뒤 내부 문자 Sequence가 바뀌지 않는다. 이 특성은 Hash Key 안정성, 공유와 Thread Safety에 유리하다. 문자열 결합이 반복되는 Loop에서는 중간 String이 많이 생길 수 있어 StringBuilder를 고려한다.

### 4) 핵심 포인트

String Pool은 동일한 Literal을 재사용할 수 있다. new String으로 만든 객체와 Literal은 내용이 같아도 Identity가 다를 수 있다. 문자열 내용은 equals로 비교하고 ==는 같은 객체 참조인지 확인한다.

### 5) 핵심 포인트

Immutable 객체는 Field를 final로 두는 것만으로 완성되지 않는다. Constructor에서 Mutable Collection을 그대로 보관하거나 Getter로 내부 List를 반환하면 외부에서 상태를 바꿀 수 있다. Defensive Copy와 불변 Collection을 사용한다.

### 6) 핵심 포인트

Wrapper Type은 Collection과 Generic에서 Primitive 값을 객체로 다룰 수 있게 한다. Autoboxing은 편리하지만 Allocation, Null Unboxing과 == Cache 범위 오해를 만든다. Hot Path에서는 Boxing 발생 여부를 Profile한다.

### 값과 객체를 다루는 기준

- **대입과 인자 전달**: Primitive는 값을 복사하고 Reference 변수는 참조 값을 복사한다. Method가 Parameter에 새 객체를 대입해도 호출자의 변수가 바뀌지 않지만 같은 Mutable 객체의 Field를 변경하면 호출자도 본다.
- **동등성**: Identity가 필요한 Entity와 값 동등성이 필요한 Value Object를 구분한다. equals를 Override하면 같은 값에 같은 hashCode가 나오도록 구현하고 Mutable Field를 Hash Key에 사용하지 않는다.
- **String 연산**: 짧은 상수 결합은 Compiler가 최적화할 수 있지만 Runtime Loop 결합은 중간 객체를 만들 수 있다. StringBuilder도 Thread 간 공유보다 요청 Scope에서 사용한다.
- **불변 객체**: Constructor에서 입력을 검증하고 Mutable 인자를 복사한다. Getter는 내부 Collection을 그대로 노출하지 않고 불변 View나 Copy를 반환한다.
- **Wrapper 주의점**: Integer가 Null일 때 int로 Unboxing하면 NullPointerException이 발생한다. Wrapper의 == 결과를 Cache 범위에 기대지 않고 값 비교에는 equals를 사용한다.
- **숫자 안전성**: int 곱셈이 Overflow한 뒤 long에 대입해도 이미 값이 깨졌다. 연산 전에 long으로 승격하고 재화·시간의 최대 범위를 계산한다.

### 게임 서버 점검 예시

PlayerSnapshot이 Mutable Inventory List를 그대로 보유하면 Snapshot 전송 전 원본 변경이 Packet 내용까지 바꿀 수 있다. Snapshot 생성 시 필요한 값만 복사하고 생성 뒤 상태를 변경하지 않는다. Profile에서 Boxing과 문자열 Allocation이 실제 Hot Path인지 확인한 뒤 Primitive 전용 구조나 Buffer API를 검토한다.
### 구현·운영 검증 기준

- **입력 계약**: Primitive Reference String Immutable에서 입력 계약가 영향을 주는 코드 경계를 실제 Method와 객체 수명으로 표시한다. 정상 Case와 함께 Null, 최대 크기, 동시 호출, 예외와 취소를 재현하고 결과 상태와 Resource가 계약대로 남는지 확인한다. 측정 가능한 지표와 실패 시 대응을 Review 항목에 포함한다.
- **상태 소유권**: Primitive Reference String Immutable에서 상태 소유권가 영향을 주는 코드 경계를 실제 Method와 객체 수명으로 표시한다. 정상 Case와 함께 Null, 최대 크기, 동시 호출, 예외와 취소를 재현하고 결과 상태와 Resource가 계약대로 남는지 확인한다. 측정 가능한 지표와 실패 시 대응을 Review 항목에 포함한다.
- **Null 처리**: Primitive Reference String Immutable에서 Null 처리가 영향을 주는 코드 경계를 실제 Method와 객체 수명으로 표시한다. 정상 Case와 함께 Null, 최대 크기, 동시 호출, 예외와 취소를 재현하고 결과 상태와 Resource가 계약대로 남는지 확인한다. 측정 가능한 지표와 실패 시 대응을 Review 항목에 포함한다.
- **Type 안전성**: Primitive Reference String Immutable에서 Type 안전성가 영향을 주는 코드 경계를 실제 Method와 객체 수명으로 표시한다. 정상 Case와 함께 Null, 최대 크기, 동시 호출, 예외와 취소를 재현하고 결과 상태와 Resource가 계약대로 남는지 확인한다. 측정 가능한 지표와 실패 시 대응을 Review 항목에 포함한다.
- **경계값**: Primitive Reference String Immutable에서 경계값가 영향을 주는 코드 경계를 실제 Method와 객체 수명으로 표시한다. 정상 Case와 함께 Null, 최대 크기, 동시 호출, 예외와 취소를 재현하고 결과 상태와 Resource가 계약대로 남는지 확인한다. 측정 가능한 지표와 실패 시 대응을 Review 항목에 포함한다.
- **동시 실행**: Primitive Reference String Immutable에서 동시 실행가 영향을 주는 코드 경계를 실제 Method와 객체 수명으로 표시한다. 정상 Case와 함께 Null, 최대 크기, 동시 호출, 예외와 취소를 재현하고 결과 상태와 Resource가 계약대로 남는지 확인한다. 측정 가능한 지표와 실패 시 대응을 Review 항목에 포함한다.
- **예외 전파**: Primitive Reference String Immutable에서 예외 전파가 영향을 주는 코드 경계를 실제 Method와 객체 수명으로 표시한다. 정상 Case와 함께 Null, 최대 크기, 동시 호출, 예외와 취소를 재현하고 결과 상태와 Resource가 계약대로 남는지 확인한다. 측정 가능한 지표와 실패 시 대응을 Review 항목에 포함한다.
- **자원 정리**: Primitive Reference String Immutable에서 자원 정리가 영향을 주는 코드 경계를 실제 Method와 객체 수명으로 표시한다. 정상 Case와 함께 Null, 최대 크기, 동시 호출, 예외와 취소를 재현하고 결과 상태와 Resource가 계약대로 남는지 확인한다. 측정 가능한 지표와 실패 시 대응을 Review 항목에 포함한다.
- **성능 비용**: Primitive Reference String Immutable에서 성능 비용가 영향을 주는 코드 경계를 실제 Method와 객체 수명으로 표시한다. 정상 Case와 함께 Null, 최대 크기, 동시 호출, 예외와 취소를 재현하고 결과 상태와 Resource가 계약대로 남는지 확인한다. 측정 가능한 지표와 실패 시 대응을 Review 항목에 포함한다.
- **Memory 사용**: Primitive Reference String Immutable에서 Memory 사용가 영향을 주는 코드 경계를 실제 Method와 객체 수명으로 표시한다. 정상 Case와 함께 Null, 최대 크기, 동시 호출, 예외와 취소를 재현하고 결과 상태와 Resource가 계약대로 남는지 확인한다. 측정 가능한 지표와 실패 시 대응을 Review 항목에 포함한다.
- **Version 호환**: Primitive Reference String Immutable에서 Version 호환가 영향을 주는 코드 경계를 실제 Method와 객체 수명으로 표시한다. 정상 Case와 함께 Null, 최대 크기, 동시 호출, 예외와 취소를 재현하고 결과 상태와 Resource가 계약대로 남는지 확인한다. 측정 가능한 지표와 실패 시 대응을 Review 항목에 포함한다.
- **관찰 지표**: Primitive Reference String Immutable에서 관찰 지표가 영향을 주는 코드 경계를 실제 Method와 객체 수명으로 표시한다. 정상 Case와 함께 Null, 최대 크기, 동시 호출, 예외와 취소를 재현하고 결과 상태와 Resource가 계약대로 남는지 확인한다. 측정 가능한 지표와 실패 시 대응을 Review 항목에 포함한다.
- **부하 상한**: Primitive Reference String Immutable에서 부하 상한가 영향을 주는 코드 경계를 실제 Method와 객체 수명으로 표시한다. 정상 Case와 함께 Null, 최대 크기, 동시 호출, 예외와 취소를 재현하고 결과 상태와 Resource가 계약대로 남는지 확인한다. 측정 가능한 지표와 실패 시 대응을 Review 항목에 포함한다.
- **장애 복구**: Primitive Reference String Immutable에서 장애 복구가 영향을 주는 코드 경계를 실제 Method와 객체 수명으로 표시한다. 정상 Case와 함께 Null, 최대 크기, 동시 호출, 예외와 취소를 재현하고 결과 상태와 Resource가 계약대로 남는지 확인한다. 측정 가능한 지표와 실패 시 대응을 Review 항목에 포함한다.
- **Test 전략**: Primitive Reference String Immutable에서 Test 전략가 영향을 주는 코드 경계를 실제 Method와 객체 수명으로 표시한다. 정상 Case와 함께 Null, 최대 크기, 동시 호출, 예외와 취소를 재현하고 결과 상태와 Resource가 계약대로 남는지 확인한다. 측정 가능한 지표와 실패 시 대응을 Review 항목에 포함한다.
- **보안 경계**: Primitive Reference String Immutable에서 보안 경계가 영향을 주는 코드 경계를 실제 Method와 객체 수명으로 표시한다. 정상 Case와 함께 Null, 최대 크기, 동시 호출, 예외와 취소를 재현하고 결과 상태와 Resource가 계약대로 남는지 확인한다. 측정 가능한 지표와 실패 시 대응을 Review 항목에 포함한다.
- **배포 전환**: Primitive Reference String Immutable에서 배포 전환가 영향을 주는 코드 경계를 실제 Method와 객체 수명으로 표시한다. 정상 Case와 함께 Null, 최대 크기, 동시 호출, 예외와 취소를 재현하고 결과 상태와 Resource가 계약대로 남는지 확인한다. 측정 가능한 지표와 실패 시 대응을 Review 항목에 포함한다.
- **면접 설명**: Primitive Reference String Immutable에서 면접 설명가 영향을 주는 코드 경계를 실제 Method와 객체 수명으로 표시한다. 정상 Case와 함께 Null, 최대 크기, 동시 호출, 예외와 취소를 재현하고 결과 상태와 Resource가 계약대로 남는지 확인한다. 측정 가능한 지표와 실패 시 대응을 Review 항목에 포함한다.

이 기준은 기능을 무조건 복잡하게 만들기 위한 목록이 아니다. Primitive Reference String Immutable의 실제 호출 빈도와 장애 영향을 기준으로 필요한 항목을 선택하고, 변경 전후의 정확성과 p99를 비교한다.

## 4. 쉬운 예시

Player 위치를 Mutable Vector 객체로 여러 Session에 공유하면 한 곳의 수정이 다른 Snapshot까지 바꿀 수 있다. 전송 DTO를 Immutable하게 만들거나 필요한 시점에 값을 복사해 Packet 생성 이후 상태가 변하지 않게 한다.

## 5. 비슷한 개념과 비교

Primitive는 값과 연산이 단순하고 Null이 없지만 Generic Type Argument로 직접 쓸 수 없다. Wrapper는 객체 API와 Null을 지원하지만 Boxing 비용과 NullPointerException 가능성이 있다.

## 6. 장점과 단점

Primitive·Reference Type과 String·Immutability을 올바르게 적용하면 코드 계약과 상태 흐름이 명확해지고 변경과 장애 진단이 쉬워진다. 반면 잘못된 추상화, 불필요한 객체와 Runtime 비용을 만들 수 있다. 실제 호출 빈도와 변경 축을 측정해 필요한 범위만 사용한다.

## 7. 게임 서버·백엔드 실무 예시

Player 위치를 Mutable Vector 객체로 여러 Session에 공유하면 한 곳의 수정이 다른 Snapshot까지 바꿀 수 있다. 전송 DTO를 Immutable하게 만들거나 필요한 시점에 값을 복사해 Packet 생성 이후 상태가 변하지 않게 한다. 운영에서는 처리량, 지연 p99, 오류율, Memory와 Thread 상태를 같은 시간축에서 관찰한다.

## 8. 자주 하는 오해
- Java가 객체 Reference를 전달하므로 Pass-by-reference라고 말한다.
- String 내용 비교에 ==를 사용한다.
- final Field만 선언하면 내부 Collection도 자동으로 불변이라고 본다.
- Wrapper의 Autoboxing과 Unboxing에는 예외 가능성이 없다고 생각한다.
- int 연산 결과를 long에 담으면 Overflow가 자동으로 방지된다고 본다.
## 9. 면접 질문
### Q1. Primitive와 Reference Type의 차이는 무엇인가요?
Primitive 변수는 언어가 정의한 값을 직접 나타내고 Reference 변수는 객체를 가리키는 참조 값을 가집니다. Reference를 복사하면 두 변수가 같은 Mutable 객체를 가리킬 수 있습니다.

### Q2. Java는 Pass-by-value인가요?
Java는 항상 값을 전달합니다. 객체 인자도 Reference 값의 복사본이 전달되므로 Parameter 재대입은 호출자 변수에 영향을 주지 않지만 참조 대상의 변경은 공유될 수 있습니다.

### Q3. String이 Immutable인 이유는 무엇인가요?
String은 생성 뒤 내용이 바뀌지 않아 Pool 공유, Hash Key 안정성과 Thread 간 읽기에 유리합니다. 반복 결합에는 중간 객체를 줄이기 위해 StringBuilder를 고려합니다.

### Q4. ==와 equals는 어떻게 다른가요?
Reference의 ==는 같은 객체를 가리키는지 확인하고 equals는 구현된 값 동등성을 검사합니다. Primitive의 ==는 값을 비교합니다.

### Q5. Immutable Class는 어떻게 설계하나요?
상태 변경 Method를 두지 않고 Field를 안전하게 초기화합니다. Mutable 인자를 Defensive Copy하고 내부 Mutable 객체를 Getter로 직접 노출하지 않습니다.
## 10. 예상 꼬리질문

- Primitive 범위의 핵심 계약과 실패 조건은 무엇인가요?
- Reference 복사의 핵심 계약과 실패 조건은 무엇인가요?
- Pass-by-value의 핵심 계약과 실패 조건은 무엇인가요?
- Null의 핵심 계약과 실패 조건은 무엇인가요?
- == 연산의 핵심 계약과 실패 조건은 무엇인가요?

## 11. 30초 모범답변

> Java는 Primitive 값과 객체 Reference를 모두 값으로 전달합니다. Reference를 복사하면 같은 Mutable 객체를 가리킬 수 있으므로 공유와 변경 범위를 관리해야 합니다. String은 Immutable이라 Hash Key와 공유에 안전하고, 내용 비교에는 equals를 사용합니다.

## 12. 1~2분 확장답변

> Java Primitive Type은 값 자체를 표현하고 Reference Type 변수는 Heap 객체를 가리키는 참조 값을 보관한다. 복사·동등성·Null·Memory와 변경 가능성을 정확히 이해해야 객체 상태 오류와 불필요한 Allocation을 줄일 수 있다. Reference 변수를 대입하면 객체 전체가 복사되는 것이 아니라 같은 객체를 가리키는 참조 값이 복사된다. 한 경로로 Mutable 객체를 바꾸면 다른 참조에서도 변경이 보인다. Method 인자도 항상 Pass-by-value이며 Reference가 값으로 전달되는 것이다. Primitive는 값과 연산이 단순하고 Null이 없지만 Generic Type Argument로 직접 쓸 수 없다. Wrapper는 객체 API와 Null을 지원하지만 Boxing 비용과 NullPointerException 가능성이 있다. Player 위치를 Mutable Vector 객체로 여러 Session에 공유하면 한 곳의 수정이 다른 Snapshot까지 바꿀 수 있다. 전송 DTO를 Immutable하게 만들거나 필요한 시점에 값을 복사해 Packet 생성 이후 상태가 변하지 않게 한다.

## 13. 핵심 요약

- Java Primitive Type은 값 자체를 표현하고 Reference Type 변수는 Heap 객체를 가리키는 참조 값을 보관한다.
- Java에는 boolean, byte, short, int, long, char, float, double의 Primitive Type이 있다. 크기와 숫자 승격 규칙을 알아야 Overflow와 비교 오류를 피할 수 있다. boolean의 구체적인 Memory 배치는 JVM 구현 대상이므로 Source 수준 규칙과 내부 배치를 구분한다.
- Primitive는 값과 연산이 단순하고 Null이 없지만 Generic Type Argument로 직접 쓸 수 없다. Wrapper는 객체 API와 Null을 지원하지만 Boxing 비용과 NullPointerException 가능성이 있다.
- Player 위치를 Mutable Vector 객체로 여러 Session에 공유하면 한 곳의 수정이 다른 Snapshot까지 바꿀 수 있다. 전송 DTO를 Immutable하게 만들거나 필요한 시점에 값을 복사해 Packet 생성 이후 상태가 변하지 않게 한다.

## 한 줄 정리

> Java는 Primitive 값과 객체 Reference를 모두 값으로 전달합니다.
