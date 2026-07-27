---
difficulty: 3
reading_time: 20분
interview_frequency: 5
importance: 5
---

# 07. Boxing과 Unboxing

> 게임 서버·백엔드 개발자를 위한 CS 면접 교재

## 학습 목표

- Boxing·Unboxing이 발생하는 정확한 조건과 비용을 설명할 수 있다.
- Generic Collection·API가 Boxing을 피하는 원리를 설명할 수 있다.
- 숨은 Boxing 발생 패턴(Logging, Enum, Interface 변환)을 식별할 수 있다.
- 게임 서버 Hot Path에서 Allocation Rate와 GC 영향을 판단할 수 있다.

## 1. 개요

Boxing은 Value Type 값을 `object` 또는 Interface 형태의 관리 Heap 객체로 감싸는 과정이다. Unboxing은 Boxing된 객체에서 호환되는 Value Type 값을 꺼내는 과정이다.

C#의 통합 타입 시스템은 모든 타입이 `object`로 취급될 수 있게 설계되었다. 이를 위해 Value Type을 `object`나 Interface에 저장할 때 자동으로 Boxing이 일어난다.

## 2. 왜 필요한가

C#의 단일 루트 타입 시스템에서 `object` 기반 API(예: 비Generic Collection, Logging, Reflection)에 Value Type을 전달할 수 있어야 한다. Boxing이 없으면 `ArrayList.Add(42)`처럼 `int`를 `object`에 넣을 방법이 없다.

문제는 Boxing이 자동으로 일어나 Heap Allocation이 발생하는지 코드만 봐서는 모를 때가 많다는 것이다. 고빈도 경로에서 누적되면 Allocation Rate와 GC Pause에 실제 영향을 준다.

## 3. 핵심 동작 원리
```text
int value→box object allocation+copy→object ref / unbox exact type→value copy
```
Boxing은 Heap 할당과 복사를 만들 수 있고 Unboxing은 정확한 타입이 필요하다. Generic을 사용하면 많은 Boxing을 피할 수 있다.

Boxing과 Unboxing에서는 값 복사, 객체 도달 가능성, Continuation 실행 위치와 자원 Scope를 구분해야 한다.

### Boxing의 실제 의미

Value Type을 `object`, `System.ValueType` 또는 구현한 Interface Type으로 변환할 때 Runtime은 값을 담을 관리 객체를 만들고 값을 복사한다.

```csharp
int value = 42;
object boxed = value;
```

`boxed`는 원래 Local `value`의 Alias가 아니다. 이후 value를 바꿔도 Box 안의 값은 바뀌지 않는다.

```csharp
value = 100;
Console.WriteLine(boxed); // 42
```

Box 객체에는 객체 Header·Type 정보와 Value Payload가 필요하며 Managed Heap Allocation이 발생한다. JIT 최적화로 일부 상황이 달라질 수 있지만 API 설계에서는 Boxing 가능성을 전제로 한다.

## 4. Unboxing

Unboxing은 Box 안에 저장된 정확한 Value Type을 확인하고 그 값에 접근한 뒤 일반 대입에서는 다시 값을 Copy한다.

```csharp
object boxed = 42;
int value = (int)boxed;
```

Boxed `int`를 `long`으로 직접 Unbox할 수 없다.

```csharp
long wrong = (long)boxed; // InvalidCastException
long ok = (int)boxed;     // int로 Unbox 후 숫자 변환
```

Null을 Non-nullable Value Type으로 Unbox해도 예외가 발생한다. Pattern Matching으로 Type을 안전하게 검사할 수 있다.

```csharp
if (boxed is int number)
    Use(number);
```

## 5. Interface 호출과 Boxing

Struct를 Interface 변수에 저장하면 Boxing될 수 있다.

```csharp
struct Counter : IFormattable { /* ... */ }

Counter counter = new();
IFormattable format = counter; // Boxing
```

Generic Constraint를 사용하면 JIT가 Struct의 구체 Type을 알고 Boxing 없이 호출할 수 있는 경우가 많다.

```csharp
static string Format<T>(T value) where T : IFormattable
    => value.ToString(null, null);
```

단, Generic 내부에서 다시 `object`로 Cast하거나 비Generic API를 호출하면 Boxing이 생길 수 있다. Source Code 모양만으로 단정하지 않고 Allocation Profiler와 IL·JIT를 확인한다.

## 6. Generic Collection과 비Generic Collection

```csharp
ArrayList oldList = new();
oldList.Add(1);             // Boxing
int x = (int)oldList[0];    // Unboxing

List<int> list = new();
list.Add(1);                // int 그대로 저장
int y = list[0];
```

`List<T>`, `Dictionary<TKey,TValue>` 같은 Generic Collection은 Value Type을 구체 Storage에 저장해 반복 Boxing을 피한다. Type Safety도 Compile Time에 제공한다.

## 7. 흔한 숨은 Boxing

### object Parameter와 params object[]

```csharp
void Log(string format, params object[] args);
Log("damage={0}", damage); // int Boxing + object[] Allocation 가능
```

현대 Logging은 Source Generator, Generic Overload, Interpolated String Handler로 불필요한 Boxing·Formatting을 줄일 수 있다. Logging Level이 꺼져 있어도 인자 평가·Allocation이 일어나는지 확인한다.

### 문자열 보간과 Format

Runtime·Overload에 따라 Value Type Formatting이 Boxing될 수 있다. `ISpanFormattable`, `string.Create`, Handler가 Allocation을 줄일 수 있지만 가독성과 실제 Hot Path를 먼저 본다.

### Enum과 Reflection

Enum을 `object` API, Reflection, 비Generic Equality에 넘길 때 Boxing이 생길 수 있다. `EqualityComparer<T>.Default`는 Generic Code에서 적절한 비교 구현을 선택한다.

### LINQ와 Interface Enumeration

Struct Enumerator가 구체 Type으로 사용되면 Allocation이 없을 수 있지만 `IEnumerable<T>`나 Interface로 변환되는 경로, Closure·Iterator State Machine에서 Allocation이 생길 수 있다. LINQ가 무조건 Boxing한다거나 무조건 느리다고 단정하지 않고 Profile한다.

## 8. Boxed Mutable Struct

Mutable Struct를 Boxing하면 Box 안에 Copy가 들어간다. Interface 호출이 Box 내부 값을 바꿔도 원래 Struct는 바뀌지 않는다.

```text
original struct ──copy──> boxed struct object
      │                         │
서로 독립된 상태              Interface 호출 대상
```

Reflection이나 특수 Reference 접근은 더 복잡할 수 있지만 일반 코드에서는 Value Copy 의미를 유지한다. Mutable Struct 자체가 혼동을 만들기 쉬워 작은 Immutable Struct를 권장한다.

## 9. Boxing과 GC 비용

한 번의 작은 Boxing은 보통 큰 문제가 아니다. 매 Tick·Packet마다 수십만 번 반복되면 Allocation Rate가 높아지고 Gen 0 Collection 빈도와 CPU·Pause를 증가시킨다.

```text
100,000 boxes/sec × 객체 크기
 → Allocation Throughput 증가
 → Gen 0 빈도 증가
 → 일부 생존 시 승격
```

오래 보관되는 Collection에 Box를 넣으면 상위 Generation으로 승격되어 더 비싼 수집까지 영향을 줄 수 있다. Allocation Byte, Count, Call Stack과 GC Pause를 같은 시간축에서 본다.

## 10. 피하는 방법

- Generic API·Collection 사용
- Value Type 전용 Overload 제공
- `IEquatable<T>`와 `EqualityComparer<T>.Default` 사용
- Hot Logging에 Source-generated Logger·Handler 사용
- `object` 기반 Event Payload 대신 Typed Message 사용
- 반복 Reflection·Dynamic 호출을 Cache하거나 Typed 경로로 변경
- Profile에서 확인된 Hot Path만 최적화

Boxing을 피하려고 모든 Struct를 Class로 바꾸면 Heap 객체가 더 늘 수 있다. 목적은 Boxing 0이 아니라 전체 Allocation·CPU·복잡도를 줄이는 것이다.

## 11. 게임 서버 실무

Combat Event를 `Dictionary<string, object>`로 표현하면 Damage·EntityId 같은 숫자가 모두 Boxing되고 Runtime Cast가 필요하다. Typed readonly Struct·Record로 표현하면 Type Safety와 연속 Storage에 유리하다.

```csharp
readonly record struct DamageEvent(int AttackerId, int TargetId, int Amount);
```

Metrics Label·Logging에 숫자를 `object`로 넘기는 경로도 고빈도일 수 있다. Sampled Logging, Source Generator와 Aggregate Counter로 Event당 Allocation을 피한다.

Network Serialization Library가 Interface·Reflection을 사용하는지, Source-generated Serializer가 Value Type을 직접 처리하는지 측정한다. 개발 편의가 중요한 Control Plane과 Allocation이 민감한 Data Plane을 구분할 수 있다.

### Equality 호출의 주의점

Value Type의 `Equals(object)` 경로는 인자가 object이므로 Boxing을 만들 수 있다. Generic `IEquatable<T>.Equals(T)`를 구현하면 `EqualityComparer<T>.Default`와 Generic Collection이 Typed 경로를 사용할 수 있다.

```csharp
readonly struct EntityId : IEquatable<EntityId>
{
    public bool Equals(EntityId other) => Value == other.Value;
    public override bool Equals(object? obj)
        => obj is EntityId other && Equals(other);
}
```

Hash Code와 Equality가 일치해야 하며, Boxing을 줄이려다 의미가 다른 비교를 만들면 안 된다.

### 최적화 판단

Boxing Allocation 하나를 제거하는 Code가 복잡한 Unsafe 경로와 유지보수 비용을 만든다면 전체 이득을 측정한다. Event당 Allocation이 Hot Path에서 누적되는지, Box가 Gen 0에서 바로 죽는지, CPU와 p99에 실제 상관이 있는지 확인한다. 먼저 Typed API와 Generic이라는 구조적 해결을 적용하고 Micro-optimization은 마지막에 한다. Release Build의 실제 부하와 Allocation Call Stack을 근거로 결정한다.

## 12. 쉬운 예시: 데미지 이벤트 전달

`Dictionary<string, object>`로 이벤트 속성을 담으면 숫자 값이 전부 Boxing된다.

```csharp
// 모든 숫자마다 Boxing Heap Allocation
var evt = new Dictionary<string, object>
{
    ["attackerId"] = attackerId, // int → boxed
    ["targetId"]   = targetId,  // int → boxed
    ["amount"]     = amount,    // int → boxed
};
```

Typed `readonly record struct`로 바꾸면 Boxing이 없어진다.

```csharp
readonly record struct DamageEvent(int AttackerId, int TargetId, int Amount);
var evt = new DamageEvent(attackerId, targetId, amount); // Heap Allocation 없음
```

매 Tick 수천 건 처리하면 전자는 Gen 0 Collection 빈도를 눈에 띄게 높인다.

## 13. 비슷한 개념 비교

| 관점 | 비Generic API | Generic API | Typed Struct/Record |
|---|---|---|---|
| Boxing 여부 | 발생 (`object` 경로) | 대부분 없음 | 없음 |
| Type Safety | 런타임 Cast | Compile Time 검사 | Compile Time 검사 |
| 메모리 | 추가 Heap 객체 | Value 직접 저장 | 연속 배치 가능 |
| 주요 위험 | 숨은 Allocation | 내부 Cast 시 Boxing | Mutable Copy 혼동 |

## 14. 장점과 단점

### Boxing이 제공하는 이점

- 통합 타입 시스템 덕분에 어떤 타입이든 `object`로 다룰 수 있다.
- 비Generic 레거시 API와 상호 운용이 가능하다.

### Boxing의 비용

- Heap Allocation과 GC 추적 대상이 늘어 Allocation Rate가 높아진다.
- 고빈도 Boxing은 Gen 0 Collection 빈도와 CPU·Pause 시간을 증가시킨다.
- Unboxing 시 정확한 타입 Cast가 필요해 Runtime 오류 위험이 있다.
- Boxed Mutable Struct를 Interface로 수정해도 원본은 바뀌지 않아 혼동이 생긴다.

## 15. 게임 서버·백엔드 실무 예시

### Combat Event Dispatcher

Skill System이 데미지·힐 이벤트를 `Dictionary<string, object>`로 퍼뜨리면 매 이벤트마다 숫자 필드 수만큼 Boxing이 발생한다.

```csharp
// 문제 패턴: 매 이벤트마다 Boxing
void Dispatch(string type, Dictionary<string, object> data) { ... }
Dispatch("damage", new() { ["amount"] = 100 }); // Boxing 발생

// 개선: Typed Message
interface IGameEvent { }
readonly record struct DamageEvent(int AttackerId, int TargetId, int Amount) : IGameEvent;
void Dispatch<T>(T evt) where T : IGameEvent { ... }
Dispatch(new DamageEvent(1, 2, 100)); // Boxing 없음
```

### Logging Hot Path

```csharp
// params object[]로 Boxing 발생 가능
_logger.LogInformation("damage={0} target={1}", damage, targetId);

// Source-generated Logger로 Boxing 없음
[LoggerMessage(Level = LogLevel.Information, Message = "damage={Damage} target={TargetId}")]
partial void LogDamage(int damage, int targetId);
```

### Profiler로 확인

dotMemory, PerfView, BenchmarkDotNet으로 Call Stack별 Allocation Byte와 Count를 보고 Boxing이 어느 호출 경로에서 누적되는지 확인한다.

## 16. 자주 하는 오해

- **Generic Collection은 항상 Boxing이 없다**: Generic Collection 내부에서 `object`로 Cast하거나 비Generic Interface를 호출하면 Boxing이 생길 수 있다. IL을 확인한다.
- **LINQ는 항상 Boxing한다**: `List<T>`의 `foreach`는 Struct Enumerator로 Boxing 없이 동작할 수 있다. `IEnumerable<T>`로 변환되는 경로에서 Allocation이 생긴다. 추측하지 않고 Profile한다.
- **Boxing 한 번은 무시할 수 있다**: 매 Tick·매 Packet 처리처럼 고빈도면 누적 Allocation이 GC Pause에 실제 영향을 준다.
- **Unboxing 실패는 컴파일 오류다**: Unboxing 타입 불일치는 런타임 `InvalidCastException`이다. `is` Pattern Matching으로 안전하게 처리한다.
- **Boxed Struct를 Interface로 수정하면 원본도 바뀐다**: Box 안에 값의 복사본이 있어 Interface 호출이 Box 내부를 수정해도 원본 Struct는 바뀌지 않는다.
- **`object` 기반 API를 Generic으로 바꾸면 항상 빨라진다**: 내부 구현이 `object`로 다시 Cast하거나 Reflection을 쓰면 이득이 없다. 실제 IL과 Profile로 확인한다.
- **Boxing 제거를 위해 Unsafe나 복잡한 코드를 써야 한다**: 대부분은 Generic API 사용, Typed Message 설계, Source Generator로 구조적으로 해결된다.

## 17. 면접 질문

### Q1. Boxing과 Unboxing을 설명해 주세요.

Boxing은 Value Type 값을 `object` 또는 Interface 형태의 Managed Heap 객체로 감싸는 과정입니다. Unboxing은 Box 객체에서 정확한 원래 Value Type을 꺼내는 과정입니다. Boxing은 Heap Allocation과 값 복사를 만들고, Unboxing은 타입 검사 후 값을 복사합니다.

### Q2. Generic Collection이 Boxing을 피하는 이유는 무엇인가요?

`List<int>`는 `int`를 직접 저장하는 특화 코드를 JIT가 생성해 `object` 변환 없이 Value를 다룹니다. 비Generic `ArrayList`는 모든 원소가 `object`여서 `int`를 추가할 때 Boxing이 발생합니다.

### Q3. 숨은 Boxing이 자주 발생하는 패턴은 무엇인가요?

비Generic Logging API(`params object[]`), Struct를 Interface 변수에 대입, Enum을 `object` API에 전달, 비Generic Equality 비교 등입니다. Source Generator Logger, Generic Constraint, `IEquatable<T>` 구현으로 피할 수 있습니다.

### Q4. Boxing이 성능에 미치는 영향은 어느 수준인가요?

단발 Boxing은 보통 무시할 만합니다. 매 Tick·Packet처럼 고빈도 경로에서 수만 건 반복되면 Allocation Rate가 높아지고 Gen 0 GC 빈도와 Pause가 늘어 p99 지연에 영향을 줍니다.

### Q5. Boxed Mutable Struct를 Interface로 수정하면 어떻게 되나요?

Box 안에 원본의 복사본이 들어가 있으므로 Interface 호출이 Box 내부 복사본을 수정해도 원본 Struct는 바뀌지 않습니다. Mutable Struct 자체가 혼동을 만들므로 작은 `readonly struct`를 권장합니다.

### Q6. Unboxing 실패는 언제 발생하나요?

Box 타입과 다른 타입으로 Cast하면 `InvalidCastException`이 발생합니다. Boxed `int`를 `long`으로 바로 Unbox할 수 없습니다. `is` Pattern Matching이나 `as` 연산자로 안전하게 처리합니다.

## 18. 예상 꼬리질문

- Struct가 Interface를 구현하면 항상 Boxing이 발생하나요?
- `params object[]` 대신 사용할 수 있는 패턴은 무엇인가요?
- `EqualityComparer<T>.Default`가 Boxing을 피하는 원리는 무엇인가요?
- BenchmarkDotNet으로 Boxing 여부를 어떻게 확인하나요?
- JIT Devirtualization이 Boxing에 영향을 주는 경우는 언제인가요?
- `CollectionsMarshal.AsSpan`은 어떤 상황에서 쓰나요?
- Gen 0 GC 빈도가 높아지면 어떤 지표를 확인하나요?

## 19. 30초 모범답변

> Boxing은 Value Type을 `object`나 Interface 형태의 Heap 객체로 감싸는 과정이고, Unboxing은 정확한 원래 타입으로 꺼내는 과정입니다. Generic API와 Typed Message로 대부분의 Boxing을 구조적으로 피할 수 있습니다. 고빈도 경로의 누적 Boxing은 Gen 0 Collection 빈도를 높이므로 Profiler로 확인 후 최적화합니다.

## 20. 1~2분 확장답변

> Boxing은 C# 단일 루트 타입 시스템에서 Value Type을 `object`·Interface로 다루기 위해 Managed Heap 객체로 감싸는 과정입니다. 자동으로 일어나 코드만 봐서는 발생 여부를 모를 때가 많습니다.
>
> 비Generic Collection(`ArrayList`), `params object[]` Logging, Struct를 Interface 변수에 대입, Enum Reflection이 대표적인 숨은 Boxing 패턴입니다. `List<T>` 같은 Generic Collection은 Value를 직접 저장해 Boxing을 피하고 Compile Time Type Safety도 제공합니다.
>
> 게임 서버에서 Combat Event를 `Dictionary<string, object>`로 전달하면 수치 필드마다 Boxing이 발생합니다. `readonly record struct DamageEvent`로 Typed Message를 만들면 Allocation 없이 전달됩니다. Source-generated Logger로 Logging Hot Path의 Boxing도 없앱니다. 최적화는 단발 제거가 아니라 Profiler로 Hot Path를 확인한 뒤 구조적으로 해결합니다.

## 21. 핵심 요약

- Boxing은 Value Type을 Managed Heap 객체로 감싸는 과정이며 Allocation과 Copy가 발생한다.
- Unboxing은 정확한 원래 타입으로만 가능하며, 타입 불일치는 런타임 예외다.
- Generic Collection·API는 JIT 특화 코드로 Boxing 없이 Value Type을 다룬다.
- 숨은 Boxing 패턴: 비Generic API, `params object[]`, Struct→Interface 대입, Enum Reflection.
- 고빈도 Boxing 누적은 Gen 0 Collection 빈도와 p99 지연에 실제 영향을 준다.
- 구조적 해결(Generic, Typed Message, Source Generator)을 먼저 적용한다.
- Boxed Mutable Struct를 Interface로 수정해도 원본은 바뀌지 않는다.
- Profile에서 확인된 Hot Path만 최적화하고 Boxing 0이 목적이 아니다.

## 한 줄 정리

> Boxing은 Value Type을 `object`·Interface 형태로 감싸는 Heap Allocation이며, Generic API와 Typed Message로 구조적으로 피하고 고빈도 누적만 Profiler로 확인해 최적화한다.
