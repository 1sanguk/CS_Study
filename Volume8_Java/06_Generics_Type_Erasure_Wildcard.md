---
difficulty: 3
reading_time: 25분
interview_frequency: 5
importance: 5
---

# 06. Generics·Type Erasure와 Wildcard

> 게임 서버·백엔드 개발자를 위한 CS 면접 교재

## 학습 목표
- Generics는 Type을 Parameter로 받아 Compile Time Type Safety와 재사용성을 제공하며 Java Compiler는 대체로 Type Erasure로 이를 구현한다.
- 핵심 동작과 Trade-off를 설명할 수 있다.
- Java 게임 서버 사례로 면접 답변을 구성할 수 있다.

## 1. 개요
Generics는 Type을 Parameter로 받아 Compile Time Type Safety와 재사용성을 제공하며 Java Compiler는 대체로 Type Erasure로 이를 구현한다.

## 2. 왜 필요한가
Object와 Cast에 의존하던 Container API에서 잘못된 Type을 Compile 시점에 막고 공통 Algorithm을 Type-safe하게 재사용한다.

## 3. 핵심 동작 원리
```text
List<T> → compile checks → erase T to bound/Object → casts·bridge methods
```
이 흐름은 Generics·Type Erasure와 Wildcard의 상태와 실행 경계를 보여 준다. 정상 처리뿐 아니라 실패와 Resource 정리 위치를 함께 본다.

### 1) 핵심 포인트
Type Erasure는 Type Parameter를 Bound 또는 Object로 바꾸고 필요한 Cast와 Bridge Method를 생성한다. 그래서 List<String>과 List<Integer>는 Runtime에 별도 Class가 생성되지 않는다.

### 2) 핵심 포인트
Generic Type은 기본적으로 불공변이라 List<Integer>는 List<Number>의 Subtype이 아니다. 그렇지 않으면 List<Number> 경로로 Double을 넣어 Integer 기대를 깨뜨릴 수 있다.

### 3) 핵심 포인트
? extends T는 T의 생산자에서 읽기에 유리하고 안전하게 값을 추가하기 어렵다. ? super T는 T 소비자에 값을 넣기 좋다. PECS는 Producer Extends, Consumer Super를 기억하는 기준이다.

### 4) 핵심 포인트
Primitive는 Type Argument로 직접 사용할 수 없어 Wrapper와 Boxing이 필요하다. Raw Type, Unchecked Cast와 Generic Varargs는 Heap Pollution을 만들 수 있어 경고를 숨기지 않는다.

### 5) 핵심 포인트
Packet Handler Registry가 Handler<TPacket>을 사용하면 잘못된 Packet과 Handler 조합을 Compile Time에 줄일 수 있다. Runtime Dispatch에는 Class Token이나 명시적 Type ID를 함께 둔다.

### 6) 핵심 포인트
Generic은 중복과 Cast를 줄이지만 복잡한 Bound와 Wildcard는 API 가독성을 해친다. 호출자가 실제로 필요한 변성을 기준으로 가장 단순한 Signature를 사용한다.

### 추가 핵심 내용

Type Erasure는 Compile 뒤 Parameterized Type 정보를 대부분 제거하므로 `new T()`, `T.class`, `instanceof List<String>` 같은 표현을 직접 사용할 수 없다. Runtime Type이 필요하면 `Class<T>`, Factory 또는 Type Token을 전달한다.

`List<? extends Number>`에서는 원소를 Number로 읽을 수 있지만 정확한 실제 Type을 모르므로 null 외의 값을 안전하게 추가할 수 없다. `List<? super Integer>`에는 Integer를 넣을 수 있지만 읽은 값은 Object로 다룬다. Wildcard는 호출자가 필요한 생산·소비 방향에만 사용한다.

Raw Type은 Generic 검사를 우회해 잘못된 객체가 Collection에 들어가고 나중에 다른 위치에서 ClassCastException이 발생하게 한다. Unchecked Warning은 Type Safety 증명이 Compiler 밖으로 밀렸다는 신호다. Generic Varargs의 배열 Runtime Type과 Parameterized Type이 섞이면 Heap Pollution 가능성을 검토한다.

Bridge Method는 Erasure 뒤에도 Override 다형성을 유지하도록 Compiler가 생성할 수 있다. Reflection과 Stack Trace에서 합성 Method를 볼 수 있으므로 Source에 없는 Method라고 바로 이상 동작으로 판단하지 않는다.
### 구현·운영 검증 기준

- **입력 계약**: Generics Type Erasure Wildcard에서 입력 계약가 영향을 주는 코드 경계를 실제 Method와 객체 수명으로 표시한다. 정상 Case와 함께 Null, 최대 크기, 동시 호출, 예외와 취소를 재현하고 결과 상태와 Resource가 계약대로 남는지 확인한다. 측정 가능한 지표와 실패 시 대응을 Review 항목에 포함한다.
- **상태 소유권**: Generics Type Erasure Wildcard에서 상태 소유권가 영향을 주는 코드 경계를 실제 Method와 객체 수명으로 표시한다. 정상 Case와 함께 Null, 최대 크기, 동시 호출, 예외와 취소를 재현하고 결과 상태와 Resource가 계약대로 남는지 확인한다. 측정 가능한 지표와 실패 시 대응을 Review 항목에 포함한다.
- **Null 처리**: Generics Type Erasure Wildcard에서 Null 처리가 영향을 주는 코드 경계를 실제 Method와 객체 수명으로 표시한다. 정상 Case와 함께 Null, 최대 크기, 동시 호출, 예외와 취소를 재현하고 결과 상태와 Resource가 계약대로 남는지 확인한다. 측정 가능한 지표와 실패 시 대응을 Review 항목에 포함한다.
- **Type 안전성**: Generics Type Erasure Wildcard에서 Type 안전성가 영향을 주는 코드 경계를 실제 Method와 객체 수명으로 표시한다. 정상 Case와 함께 Null, 최대 크기, 동시 호출, 예외와 취소를 재현하고 결과 상태와 Resource가 계약대로 남는지 확인한다. 측정 가능한 지표와 실패 시 대응을 Review 항목에 포함한다.
- **경계값**: Generics Type Erasure Wildcard에서 경계값가 영향을 주는 코드 경계를 실제 Method와 객체 수명으로 표시한다. 정상 Case와 함께 Null, 최대 크기, 동시 호출, 예외와 취소를 재현하고 결과 상태와 Resource가 계약대로 남는지 확인한다. 측정 가능한 지표와 실패 시 대응을 Review 항목에 포함한다.
- **동시 실행**: Generics Type Erasure Wildcard에서 동시 실행가 영향을 주는 코드 경계를 실제 Method와 객체 수명으로 표시한다. 정상 Case와 함께 Null, 최대 크기, 동시 호출, 예외와 취소를 재현하고 결과 상태와 Resource가 계약대로 남는지 확인한다. 측정 가능한 지표와 실패 시 대응을 Review 항목에 포함한다.
- **예외 전파**: Generics Type Erasure Wildcard에서 예외 전파가 영향을 주는 코드 경계를 실제 Method와 객체 수명으로 표시한다. 정상 Case와 함께 Null, 최대 크기, 동시 호출, 예외와 취소를 재현하고 결과 상태와 Resource가 계약대로 남는지 확인한다. 측정 가능한 지표와 실패 시 대응을 Review 항목에 포함한다.
- **자원 정리**: Generics Type Erasure Wildcard에서 자원 정리가 영향을 주는 코드 경계를 실제 Method와 객체 수명으로 표시한다. 정상 Case와 함께 Null, 최대 크기, 동시 호출, 예외와 취소를 재현하고 결과 상태와 Resource가 계약대로 남는지 확인한다. 측정 가능한 지표와 실패 시 대응을 Review 항목에 포함한다.
- **성능 비용**: Generics Type Erasure Wildcard에서 성능 비용가 영향을 주는 코드 경계를 실제 Method와 객체 수명으로 표시한다. 정상 Case와 함께 Null, 최대 크기, 동시 호출, 예외와 취소를 재현하고 결과 상태와 Resource가 계약대로 남는지 확인한다. 측정 가능한 지표와 실패 시 대응을 Review 항목에 포함한다.
- **Memory 사용**: Generics Type Erasure Wildcard에서 Memory 사용가 영향을 주는 코드 경계를 실제 Method와 객체 수명으로 표시한다. 정상 Case와 함께 Null, 최대 크기, 동시 호출, 예외와 취소를 재현하고 결과 상태와 Resource가 계약대로 남는지 확인한다. 측정 가능한 지표와 실패 시 대응을 Review 항목에 포함한다.
- **Version 호환**: Generics Type Erasure Wildcard에서 Version 호환가 영향을 주는 코드 경계를 실제 Method와 객체 수명으로 표시한다. 정상 Case와 함께 Null, 최대 크기, 동시 호출, 예외와 취소를 재현하고 결과 상태와 Resource가 계약대로 남는지 확인한다. 측정 가능한 지표와 실패 시 대응을 Review 항목에 포함한다.
- **관찰 지표**: Generics Type Erasure Wildcard에서 관찰 지표가 영향을 주는 코드 경계를 실제 Method와 객체 수명으로 표시한다. 정상 Case와 함께 Null, 최대 크기, 동시 호출, 예외와 취소를 재현하고 결과 상태와 Resource가 계약대로 남는지 확인한다. 측정 가능한 지표와 실패 시 대응을 Review 항목에 포함한다.
- **부하 상한**: Generics Type Erasure Wildcard에서 부하 상한가 영향을 주는 코드 경계를 실제 Method와 객체 수명으로 표시한다. 정상 Case와 함께 Null, 최대 크기, 동시 호출, 예외와 취소를 재현하고 결과 상태와 Resource가 계약대로 남는지 확인한다. 측정 가능한 지표와 실패 시 대응을 Review 항목에 포함한다.
- **장애 복구**: Generics Type Erasure Wildcard에서 장애 복구가 영향을 주는 코드 경계를 실제 Method와 객체 수명으로 표시한다. 정상 Case와 함께 Null, 최대 크기, 동시 호출, 예외와 취소를 재현하고 결과 상태와 Resource가 계약대로 남는지 확인한다. 측정 가능한 지표와 실패 시 대응을 Review 항목에 포함한다.
- **Test 전략**: Generics Type Erasure Wildcard에서 Test 전략가 영향을 주는 코드 경계를 실제 Method와 객체 수명으로 표시한다. 정상 Case와 함께 Null, 최대 크기, 동시 호출, 예외와 취소를 재현하고 결과 상태와 Resource가 계약대로 남는지 확인한다. 측정 가능한 지표와 실패 시 대응을 Review 항목에 포함한다.
- **보안 경계**: Generics Type Erasure Wildcard에서 보안 경계가 영향을 주는 코드 경계를 실제 Method와 객체 수명으로 표시한다. 정상 Case와 함께 Null, 최대 크기, 동시 호출, 예외와 취소를 재현하고 결과 상태와 Resource가 계약대로 남는지 확인한다. 측정 가능한 지표와 실패 시 대응을 Review 항목에 포함한다.
- **배포 전환**: Generics Type Erasure Wildcard에서 배포 전환가 영향을 주는 코드 경계를 실제 Method와 객체 수명으로 표시한다. 정상 Case와 함께 Null, 최대 크기, 동시 호출, 예외와 취소를 재현하고 결과 상태와 Resource가 계약대로 남는지 확인한다. 측정 가능한 지표와 실패 시 대응을 Review 항목에 포함한다.
- **면접 설명**: Generics Type Erasure Wildcard에서 면접 설명가 영향을 주는 코드 경계를 실제 Method와 객체 수명으로 표시한다. 정상 Case와 함께 Null, 최대 크기, 동시 호출, 예외와 취소를 재현하고 결과 상태와 Resource가 계약대로 남는지 확인한다. 측정 가능한 지표와 실패 시 대응을 Review 항목에 포함한다.

이 기준은 기능을 무조건 복잡하게 만들기 위한 목록이 아니다. Generics Type Erasure Wildcard의 실제 호출 빈도와 장애 영향을 기준으로 필요한 항목을 선택하고, 변경 전후의 정확성과 p99를 비교한다.

## 4. 쉬운 예시
Packet Handler Registry가 Handler<TPacket>을 사용하면 잘못된 Packet과 Handler 조합을 Compile Time에 줄일 수 있다. Runtime Dispatch에는 Class Token이나 명시적 Type ID를 함께 둔다.

## 5. 비슷한 개념과 비교
Generic은 중복과 Cast를 줄이지만 복잡한 Bound와 Wildcard는 API 가독성을 해친다. 호출자가 실제로 필요한 변성을 기준으로 가장 단순한 Signature를 사용한다.

## 6. 장점과 단점
Generics·Type Erasure와 Wildcard는 Type Safety, 실행 구조와 운영 예측성을 높일 수 있다. 반면 추상화, Runtime과 Memory 비용을 추가할 수 있으므로 호출 빈도와 변경 가능성을 측정해 적용한다.

## 7. 게임 서버·백엔드 실무 예시
Packet Handler Registry가 Handler<TPacket>을 사용하면 잘못된 Packet과 Handler 조합을 Compile Time에 줄일 수 있다. Runtime Dispatch에는 Class Token이나 명시적 Type ID를 함께 둔다. 처리량, p99, 오류율과 Resource 상한을 같은 시간축에서 관찰한다.

## 8. 자주 하는 오해
- Type Parameter의 Compile Time 보장과 Runtime 동작을 구분하지 않는다.
- Bound이 해결하는 문제와 남겨 두는 비용을 함께 설명하지 않는다.
- Invariant을 사용하면 동시성·Memory 문제가 자동으로 사라진다고 본다.
- Wildcard의 Version과 실행 환경 전제를 확인하지 않는다.
- PECS관련 평균 성능만 보고 경계값과 p99를 측정하지 않는다.
## 9. 면접 질문
### Q1. Generics와 Type Erasure를 설명해 주세요.
Generics는 Compile Time Type 검사를 제공하고 Compiler는 Type Parameter를 Bound 또는 Object로 지우며 필요한 Cast와 Bridge Method를 추가합니다.

### Q2. List<Integer>가 List<Number>가 아닌 이유는 무엇인가요?
Generic은 불공변입니다. 이를 허용하면 List<Number> 경로로 Double을 추가해 Integer List의 Type Safety를 깰 수 있습니다.

### Q3. extends와 super를 어떻게 구분하나요?
값을 생산해 읽는 쪽은 extends, T를 소비해 넣는 쪽은 super를 사용한다는 PECS 기준을 적용합니다.

### Q4. Runtime에 T의 Class가 필요하면 어떻게 하나요?
Erasure로 T.class를 직접 사용할 수 없으므로 Class<T>, 생성 Factory 또는 Type Token을 명시적으로 전달합니다.

### Q5. Raw Type이 위험한 이유는 무엇인가요?
Generic 검사를 우회해 잘못된 Type이 들어갈 수 있고 오류가 멀리 떨어진 Cast 지점에서 나타납니다.
## 10. 예상 꼬리질문
- Type Parameter의 보장과 한계는 무엇인가요?
- Bound의 보장과 한계는 무엇인가요?
- Invariant의 보장과 한계는 무엇인가요?
- Wildcard의 보장과 한계는 무엇인가요?
- PECS의 보장과 한계는 무엇인가요?

## 11. 30초 모범답변
> Generics는 Compile Time Type Safety와 재사용성을 제공하고 Compiler는 Type Parameter를 Bound나 Object로 지우며 필요한 Cast와 Bridge Method를 만듭니다. List는 불공변이고 Producer에는 extends, Consumer에는 super를 적용합니다. Runtime Type이 필요하면 Class Token처럼 명시적인 정보를 전달합니다.

## 12. 1~2분 확장답변
> Generics는 Type을 Parameter로 받아 Compile Time Type Safety와 재사용성을 제공하며 Java Compiler는 대체로 Type Erasure로 이를 구현한다. Object와 Cast에 의존하던 Container API에서 잘못된 Type을 Compile 시점에 막고 공통 Algorithm을 Type-safe하게 재사용한다. Type Erasure는 Type Parameter를 Bound 또는 Object로 바꾸고 필요한 Cast와 Bridge Method를 생성한다. 그래서 List<String>과 List<Integer>는 Runtime에 별도 Class가 생성되지 않는다. ? extends T는 T의 생산자에서 읽기에 유리하고 안전하게 값을 추가하기 어렵다. ? super T는 T 소비자에 값을 넣기 좋다. PECS는 Producer Extends, Consumer Super를 기억하는 기준이다. Packet Handler Registry가 Handler<TPacket>을 사용하면 잘못된 Packet과 Handler 조합을 Compile Time에 줄일 수 있다. Runtime Dispatch에는 Class Token이나 명시적 Type ID를 함께 둔다.

## 13. 핵심 요약
- Generics는 Type을 Parameter로 받아 Compile Time Type Safety와 재사용성을 제공하며 Java Compiler는 대체로 Type Erasure로 이를 구현한다.
- Type Erasure는 Type Parameter를 Bound 또는 Object로 바꾸고 필요한 Cast와 Bridge Method를 생성한다. 그래서 List<String>과 List<Integer>는 Runtime에 별도 Class가 생성되지 않는다.
- ? extends T는 T의 생산자에서 읽기에 유리하고 안전하게 값을 추가하기 어렵다. ? super T는 T 소비자에 값을 넣기 좋다. PECS는 Producer Extends, Consumer Super를 기억하는 기준이다.
- Packet Handler Registry가 Handler<TPacket>을 사용하면 잘못된 Packet과 Handler 조합을 Compile Time에 줄일 수 있다. Runtime Dispatch에는 Class Token이나 명시적 Type ID를 함께 둔다.

## 한 줄 정리
> Generics는 Compile Time Type Safety와 재사용성을 제공하고 Compiler는 Type Parameter를 Bound나 Object로 지우며 필요한 Cast와 Bridge Method를 만듭니다.
