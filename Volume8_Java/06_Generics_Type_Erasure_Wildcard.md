---
difficulty: 3
reading_time: 25분
interview_frequency: 5
importance: 5
---

# 06. Generics·Type Erasure와 Wildcard

> 게임 서버·백엔드 개발자를 위한 CS 면접 교재

## 학습 목표
- Type Erasure의 동작(Bound/Object로 치환, Bridge Method 생성)과 런타임 제약을 설명할 수 있다.
- Generic 불공변의 이유와 extends/super Wildcard(PECS 원칙)를 구분해 사용할 수 있다.
- Raw Type과 Heap Pollution의 위험성을 설명하고 Type Token으로 런타임 타입을 전달하는 방법을 알 수 있다.
- Packet Handler Registry 같은 게임 서버 컴포넌트에 Generic을 적용해 Compile Time 타입 안전성을 확보할 수 있다.

## 1. 개요
Generics는 Type을 Parameter로 받아 Compile Time Type Safety와 재사용성을 제공하며 Java Compiler는 대체로 Type Erasure로 이를 구현한다.

## 2. 왜 필요한가
Object와 Cast에 의존하던 Container API에서 잘못된 Type을 Compile 시점에 막고 공통 Algorithm을 Type-safe하게 재사용한다.

## 3. 핵심 동작 원리
```text
List<T> → compile checks → erase T to bound/Object → casts·bridge methods
```
이 흐름은 Generics·Type Erasure와 Wildcard의 상태와 실행 경계를 보여 준다. 정상 처리뿐 아니라 실패와 Resource 정리 위치를 함께 본다.

### 1) Type Erasure 동작과 Runtime 단일 Class
Type Erasure는 Type Parameter를 Bound 또는 Object로 바꾸고 필요한 Cast와 Bridge Method를 생성한다. 그래서 List<String>과 List<Integer>는 Runtime에 별도 Class가 생성되지 않는다.

### 2) Generic 불공변과 Type Safety 보장
Generic Type은 기본적으로 불공변이라 List<Integer>는 List<Number>의 Subtype이 아니다. 그렇지 않으면 List<Number> 경로로 Double을 넣어 Integer 기대를 깨뜨릴 수 있다.

### 3) extends·super Wildcard와 PECS 기준
? extends T는 T의 생산자에서 읽기에 유리하고 안전하게 값을 추가하기 어렵다. ? super T는 T 소비자에 값을 넣기 좋다. PECS는 Producer Extends, Consumer Super를 기억하는 기준이다.

### 4) Primitive 제한과 Heap Pollution 위험
Primitive는 Type Argument로 직접 사용할 수 없어 Wrapper와 Boxing이 필요하다. Raw Type, Unchecked Cast와 Generic Varargs는 Heap Pollution을 만들 수 있어 경고를 숨기지 않는다.

### 5) Packet Handler Registry 실무 적용
Packet Handler Registry가 Handler<TPacket>을 사용하면 잘못된 Packet과 Handler 조합을 Compile Time에 줄일 수 있다. Runtime Dispatch에는 Class Token이나 명시적 Type ID를 함께 둔다.

### 6) 단순한 Signature 선택 원칙
Generic은 중복과 Cast를 줄이지만 복잡한 Bound와 Wildcard는 API 가독성을 해친다. 호출자가 실제로 필요한 변성을 기준으로 가장 단순한 Signature를 사용한다.

### 추가 핵심 내용

Type Erasure는 Compile 뒤 Parameterized Type 정보를 대부분 제거하므로 `new T()`, `T.class`, `instanceof List<String>` 같은 표현을 직접 사용할 수 없다. Runtime Type이 필요하면 `Class<T>`, Factory 또는 Type Token을 전달한다.

`List<? extends Number>`에서는 원소를 Number로 읽을 수 있지만 정확한 실제 Type을 모르므로 null 외의 값을 안전하게 추가할 수 없다. `List<? super Integer>`에는 Integer를 넣을 수 있지만 읽은 값은 Object로 다룬다. Wildcard는 호출자가 필요한 생산·소비 방향에만 사용한다.

Raw Type은 Generic 검사를 우회해 잘못된 객체가 Collection에 들어가고 나중에 다른 위치에서 ClassCastException이 발생하게 한다. Unchecked Warning은 Type Safety 증명이 Compiler 밖으로 밀렸다는 신호다. Generic Varargs의 배열 Runtime Type과 Parameterized Type이 섞이면 Heap Pollution 가능성을 검토한다.

Bridge Method는 Erasure 뒤에도 Override 다형성을 유지하도록 Compiler가 생성할 수 있다. Reflection과 Stack Trace에서 합성 Method를 볼 수 있으므로 Source에 없는 Method라고 바로 이상 동작으로 판단하지 않는다.

## 4. 쉬운 예시

Type Erasure 제약, PECS Wildcard, Packet Handler Registry에 Generic을 적용하는 코드 예시다.

```java
// Generic 클래스: Compile Time 타입 안전성 확보
class Result<T> {
    private final T value;
    private final String error;
    Result(T value) { this.value = value; this.error = null; }
    static <T> Result<T> success(T v) { return new Result<>(v); }
    static <T> Result<T> fail(String msg) { ... }
    T get() { return value; }
}

// PECS 원칙: Producer Extends, Consumer Super
// 읽기 전용(Producer): ? extends T
void printAll(List<? extends Number> list) {
    for (Number n : list) System.out.println(n); // Number로 읽기 가능
    // list.add(1); // ← 컴파일 오류! 실제 List<Integer>일 수도 List<Double>일 수도 있음
}
printAll(List.of(1, 2, 3));     // List<Integer> ← OK
printAll(List.of(1.0, 2.0));   // List<Double>  ← OK

// 쓰기 전용(Consumer): ? super T
void addAll(List<? super Integer> dest, List<Integer> src) {
    dest.addAll(src); // Integer를 넣을 수 있음
    // Integer i = dest.get(0); // ← 컴파일 오류! Object로만 읽힘
}
List<Number> numbers = new ArrayList<>();
addAll(numbers, List.of(1, 2, 3)); // List<Number>는 List<? super Integer> ← OK

// Type Erasure 제약: 런타임에 제네릭 타입 정보 없음
List<String> strings = new ArrayList<>();
List<Integer> integers = new ArrayList<>();
System.out.println(strings.getClass() == integers.getClass()); // true! 동일한 Class
// ← 아래는 모두 컴파일 오류
// new T();
// T.class;
// obj instanceof List<String>;

// 런타임 타입이 필요할 때: Class Token(Type Token) 전달
class Deserializer<T> {
    private final Class<T> type;
    Deserializer(Class<T> type) { this.type = type; } // Class<T> 명시적 전달
    T deserialize(byte[] data) {
        return objectMapper.readValue(data, type); // 런타임에 타입 사용 가능
    }
}
Deserializer<PlayerMove> d = new Deserializer<>(PlayerMove.class);

// Packet Handler Registry: 잘못된 Handler 조합을 Compile Time에 방지
interface PacketHandler<T extends Packet> {
    void handle(Session session, T packet);
}

class HandlerRegistry {
    private final Map<Class<?>, PacketHandler<?>> handlers = new HashMap<>();

    <T extends Packet> void register(Class<T> type, PacketHandler<T> handler) {
        handlers.put(type, handler); // Compile Time: T 타입 일치 보장
    }

    @SuppressWarnings("unchecked")
    <T extends Packet> void dispatch(Session session, T packet) {
        PacketHandler<T> handler = (PacketHandler<T>) handlers.get(packet.getClass());
        if (handler != null) handler.handle(session, packet);
    }
}
registry.register(MovePacket.class, (session, move) -> processMoveInput(move));
// registry.register(MovePacket.class, (session, ChatPacket chat) -> ...); // 컴파일 오류!

// Raw Type 위험 예시
List rawList = new ArrayList();
rawList.add("hello");
rawList.add(42);                   // 경고 없이 다른 타입 삽입 가능
String s = (String) rawList.get(1); // 런타임 ClassCastException!
```

## 5. 비슷한 개념과 비교

| 구분 | 읽기 | 쓰기 | 타입 정보 | 적합 용도 |
|---|---|---|---|---|
| `List<T>` (불공변) | T | T | Compile Time | 일반 제네릭 컨테이너 |
| `List<? extends T>` | T (상위 타입) | 불가 (null 제외) | Compile Time | Producer: 읽어서 처리 |
| `List<? super T>` | Object | T (하위 포함) | Compile Time | Consumer: 값을 추가 |
| `List<?>` (비한정) | Object | 불가 | Compile Time | 타입 무관 순회·크기 |
| `List` (Raw Type) | Object | 모든 타입 (위험) | 없음 | 레거시 코드만 불가피하게 |

## 6. 장점과 단점

**Generics의 장점:**
- Compile Time에 타입 오류를 잡아 ClassCastException을 런타임 대신 개발 시점에 발견한다.
- Object와 Cast 없이 타입 안전한 범용 컨테이너·알고리즘을 재사용할 수 있다.
- Type Erasure로 제네릭 추가 시 기존 바이트코드와 하위 호환성을 유지한다.

**Generics의 단점:**
- Type Erasure로 런타임에 `new T()`, `T.class`, `instanceof List<String>` 같은 표현을 직접 사용할 수 없다.
- Primitive를 타입 인자로 사용할 수 없어 Wrapper Boxing 비용이 발생한다.
- 복잡한 Wildcard와 Bound(`? extends ? super`)는 API 가독성을 해치고 이해 난이도를 높인다.
- Raw Type·Unchecked Cast는 Heap Pollution을 일으키고 오류가 멀리 떨어진 Cast 지점에서 나타난다.

## 7. 게임 서버·백엔드 실무 예시

패킷 파싱 결과를 `Result<T>`로 감싸면 null 체크 없이 성공·실패를 명시적으로 처리할 수 있다. Packet Handler Registry에 `register(Class<T> type, PacketHandler<T> handler)`를 사용하면 잘못된 패킷-핸들러 조합을 Compile Time에 방지한다. `@SuppressWarnings("unchecked")`를 붙일 때는 해당 Cast가 실제로 안전한 이유를 주석으로 남기고, Unchecked Warning을 무조건 억제하지 않는다.

## 8. 자주 하는 오해
- `List<Integer>`가 `List<Number>`의 서브타입이라고 생각한다. Generic은 불공변이므로 `List<Integer>`는 `List<Number>`가 아니다. 허용되면 `List<Number>` 경로로 `Double`을 추가해 Integer를 기대하는 코드가 깨진다.
- Type Erasure 후에도 런타임에 `instanceof List<String>`으로 제네릭 타입을 확인할 수 있다고 생각한다. `List<String>`과 `List<Integer>`는 런타임에 동일한 Class이므로 `instanceof List<String>`은 컴파일 오류다. `instanceof List<?>`만 가능하다.
- `List<? extends T>`에도 원소를 안전하게 추가할 수 있다고 생각한다. 실제 타입이 `List<Integer>`일 수도 `List<Double>`일 수도 있어 컴파일러가 추가를 거부한다. null만 추가 가능하다.
- Raw Type 사용 시 경고만 나올 뿐 실제 문제는 없다고 생각한다. Raw Type은 타입 검사를 우회해 다른 타입의 객체가 컬렉션에 들어가고 나중에 전혀 다른 위치에서 ClassCastException이 발생한다.
- Generic 메서드를 타입 인자만 다르게 Overloading할 수 있다고 생각한다. Type Erasure로 `void process(List<String>)`과 `void process(List<Integer>)`는 Erasure 후 동일한 Signature가 되어 컴파일 오류가 발생한다.
- Bridge Method는 직접 작성한 코드라고 생각한다. Compiler가 Type Erasure 후에도 Override 다형성을 유지하기 위해 자동으로 생성하는 합성 메서드다. Reflection이나 Stack Trace에서 보이더라도 Source에 없다고 이상 동작으로 판단하지 않는다.
- `@SuppressWarnings("unchecked")`를 붙이면 타입 안전성이 보장된다고 생각한다. 경고를 억제할 뿐 실제 안전성은 개발자가 보장해야 한다. Cast가 실제로 안전한 이유를 주석으로 명시하고, 범위를 최소화해 꼭 필요한 줄에만 적용한다.

## 9. 면접 질문
### Q1. Generics와 Type Erasure를 설명해 주세요.
Generics는 타입을 파라미터로 받아 Compile Time에 타입 검사를 제공합니다. Compiler는 컴파일 시 Type Parameter를 Bound 또는 Object로 치환하고(Erasure), 필요한 Cast와 Bridge Method를 삽입합니다. 그 결과 `List<String>`과 `List<Integer>`는 런타임에 동일한 `List` Class가 되어 별도 메모리를 차지하지 않습니다.

### Q2. `List<Integer>`가 `List<Number>`가 아닌 이유는 무엇인가요?
Generic은 불공변(Invariant)입니다. `List<Integer>`가 `List<Number>`로 참조될 수 있다면 `List<Number>` 경로로 `Double`을 추가할 수 있고, 그 리스트를 `Integer`로 꺼낼 때 ClassCastException이 발생합니다. 불공변으로 Compile Time에 이런 타입 위반을 차단합니다.

### Q3. extends와 super Wildcard를 어떻게 구분하나요?
PECS 원칙: **P**roducer **E**xtends, **C**onsumer **S**uper. `? extends T`는 읽기(Producer)에 사용하고 쓰기가 불가능하며, `? super T`는 쓰기(Consumer)에 사용하고 읽으면 Object로만 처리됩니다. 예를 들어 컬렉션에서 읽어 처리하는 메서드는 `List<? extends Number>`, 값을 추가하는 메서드는 `List<? super Integer>`를 사용합니다.

### Q4. 런타임에 T의 Class가 필요하면 어떻게 하나요?
Type Erasure로 `T.class`를 직접 사용할 수 없습니다. 생성자나 팩토리 메서드에 `Class<T>` 파라미터를 명시적으로 전달하는 Type Token 패턴을 사용합니다. Jackson·Gson 같은 라이브러리의 `TypeReference<T>`도 같은 방식의 변형입니다.

### Q5. Raw Type이 위험한 이유는 무엇인가요?
Raw Type은 Generic 타입 검사를 우회해 어떤 타입의 객체도 컬렉션에 넣을 수 있습니다. 오류는 삽입 시점이 아니라 전혀 다른 위치에서 Cast를 시도할 때 ClassCastException으로 나타나 원인 추적이 어렵습니다. Raw Type은 제네릭 이전의 레거시 API와 호환할 때만 불가피하게 사용합니다.

### Q6. Bridge Method란 무엇이고 왜 생성되나요?
Type Erasure 후에도 Override 다형성을 유지하기 위해 Compiler가 자동으로 생성하는 합성 메서드입니다. 예를 들어 `class Foo implements Comparable<Foo>`에서 Erasure 후 `compareTo(Object)`가 필요한데 이를 `compareTo(Foo)`로 위임하는 Bridge Method가 생성됩니다. Reflection이나 Stack Trace에서 `isSynthetic()=true`인 메서드로 확인할 수 있습니다.

## 10. 예상 꼬리질문
- `List<? extends T>`에서 원소를 추가할 수 없는 이유를 컴파일러 관점에서 설명해 주세요.
- Type Erasure로 `new T()`나 `T[]{}`를 만들 수 없을 때 어떻게 우회하나요?
- Heap Pollution이란 무엇이고 Generic Varargs와 어떻게 연관되나요?
- `@SafeVarargs`는 어떤 경우에 사용하나요?
- Generic 메서드와 Wildcard 메서드 중 어떤 것을 선택하는 기준은 무엇인가요?
- Bridge Method는 Reflection으로 어떻게 확인하나요?
- 게임 서버 Packet Handler Registry에서 `@SuppressWarnings("unchecked")`를 어떻게 안전하게 사용하나요?

## 11. 30초 모범답변
> Generics는 Compile Time 타입 안전성과 재사용성을 제공합니다. Compiler는 Type Erasure로 파라미터를 Bound 또는 Object로 치환하고 Bridge Method를 삽입합니다. Producer는 `? extends`, Consumer는 `? super`(PECS)를 적용하고, 런타임 타입이 필요하면 `Class<T>` Token을 명시적으로 전달합니다.

## 12. 1~2분 확장답변
> Generics는 타입을 파라미터로 받아 Compile Time 타입 검사를 제공합니다. Compiler는 Type Erasure로 `List<String>`의 `String`을 `Object`(또는 Bound)로 치환하고 필요한 Cast와 Bridge Method를 삽입합니다. 그 결과 `List<String>`과 `List<Integer>`는 런타임에 동일한 Class이므로 `instanceof List<String>`은 불가능합니다.
>
> Generic은 불공변이므로 `List<Integer>`는 `List<Number>`가 아닙니다. 더 유연한 API가 필요하면 PECS를 적용합니다: 읽는 쪽(Producer)에는 `? extends T`, 쓰는 쪽(Consumer)에는 `? super T`를 사용합니다. 런타임 타입이 필요하면 `Class<T>` Token을 생성자에 전달합니다.
>
> 게임 서버 Packet Handler Registry에서 `register(Class<T>, PacketHandler<T>)`를 사용하면 잘못된 패킷-핸들러 조합을 Compile Time에 방지합니다. 내부 Dispatch에서 Unchecked Cast가 불가피할 때는 `@SuppressWarnings("unchecked")`를 최소 범위에만 적용하고 안전한 이유를 주석으로 남깁니다.

## 13. 핵심 요약

- Type Erasure: 컴파일 후 Type Parameter를 Bound/Object로 치환 + Cast·Bridge Method 삽입 → `List<String>`과 `List<Integer>`는 런타임에 동일한 Class.
- Generic 불공변: `List<Integer>`는 `List<Number>`가 아님 → 불변 허용 시 `List<Number>` 경로로 `Double` 삽입 가능 → Compile Time 차단.
- PECS 원칙: Producer Extends(`? extends T`, 읽기 전용), Consumer Super(`? super T`, 쓰기 가능) — Wildcard 방향을 연산 방향으로 결정.
- 런타임 타입 전달: `T.class` 사용 불가 → `Class<T>` Token을 생성자·팩토리에 명시적 전달.
- Raw Type 위험: 타입 검사 우회 → 삽입 시점이 아닌 Cast 시점에 ClassCastException → 레거시 API 호환 시에만 불가피하게 사용.
- Bridge Method: Compiler가 Erasure 후 Override 다형성 유지를 위해 자동 생성하는 합성 메서드 — Reflection에서 `isSynthetic()=true`.
- Heap Pollution: Raw Type·Unchecked Cast·Generic Varargs로 잘못된 타입이 컬렉션에 섞이는 상태 → `@SafeVarargs`로 Varargs 안전성 선언.
- Packet Handler Registry 패턴: `register(Class<T>, PacketHandler<T>)` → 잘못된 패킷-핸들러 조합을 Compile Time 방지, Dispatch 내부 Unchecked Cast는 최소 범위로 억제.

## 한 줄 정리
> Generics는 Compile Time 타입 안전성을 제공하고 Erasure로 런타임에 파라미터 타입 정보가 사라지므로, Wildcard는 PECS로 결정하고 런타임 타입은 Class Token으로 전달합니다.
