---
difficulty: 3
reading_time: 20분
interview_frequency: 5
importance: 5
---

# 07. Boxing과 Unboxing


## 학습 목표

- 매 Tick·매 Packet처럼 고빈도 코드에서 Boxing이 발생하는 정확한 조건(Interface 대입·비Generic API(Application Programming Interface)·Enum Reflection)을 코드 수준에서 진단하고, Allocation Profiler로 확인해야 하는 시점을 판단할 수 있다.
- `List<T>`·`Dictionary<K,V>` 같은 Generic Collection이 Value Type을 직접 저장해 Boxing을 피하는 원리와, 내부에서 다시 `object`로 Cast할 때 Boxing이 재발생하는 조건을 구분하고 안전한 API 선택을 결정할 수 있다.
- Logging Hot Path·Combat Event Dispatcher·Enum Comparison처럼 숨은 Boxing이 발생하는 패턴을 진단하고, Source Generator·Generic Constraint·Typed Message 중 적절한 구조적 해결을 선택할 수 있다.
- 고빈도 Boxing이 Gen 0 Collection 빈도·p99 지연에 미치는 영향이 임계값을 넘는 조건을 Profiler로 확인하고, Unsafe 최적화 대신 구조적 해결이 우선되는 판단 기준을 결정할 수 있다.

## 1. 개요

Boxing은 Value Type 값을 `object` 또는 Interface 형태의 관리 Heap 객체로 감싸는 과정이다. Unboxing은 Boxing된 객체에서 호환되는 Value Type 값을 꺼내는 과정이다.

C#의 통합 타입 시스템은 모든 타입이 `object`로 취급될 수 있게 설계되었다. 이를 위해 Value Type을 `object`나 Interface에 저장할 때 자동으로 Boxing이 일어난다.

## 2. 왜 필요한가

C#의 단일 루트 타입 시스템에서 `object` 기반 API(예: 비Generic Collection, Logging, Reflection)에 Value Type을 전달할 수 있어야 한다. Boxing이 없으면 `ArrayList.Add(42)`처럼 `int`를 `object`에 넣을 방법이 없다.

문제는 Boxing이 자동으로 일어나 Heap Allocation이 발생하는지 코드만 봐서는 모를 때가 많다는 것이다. 고빈도 경로에서 누적되면 Allocation Rate와 GC(Garbage Collection) Pause에 실제 영향을 준다.

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

Box 객체에는 객체 Header·Type 정보와 Value Payload가 필요하며 Managed Heap Allocation이 발생한다. JIT(Just-In-Time compilation) 최적화로 일부 상황이 달라질 수 있지만 API 설계에서는 Boxing 가능성을 전제로 한다.

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

단, Generic 내부에서 다시 `object`로 Cast하거나 비Generic API를 호출하면 Boxing이 생길 수 있다. Source Code 모양만으로 단정하지 않고 Allocation Profiler와 IL(Intermediate Language)·JIT를 확인한다.

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

### Q1. Combat Event Boxing 장애 진단형

Combat Event를 `Dictionary<string, object>`로 전달하는 시스템에서 GC Gen 0 빈도가 목표보다 3배 높게 나왔습니다. Boxing이 원인임을 어떻게 진단하고, `readonly record struct DamageEvent`로 교체하는 순서와 회귀 검증 방법은 무엇입니까?

PerfView 또는 dotMemory에서 Call Stack별 Allocation을 확인해 `Boxing_Int32`·`Boxing_Single` 등의 Entry가 가장 많은 호출 경로를 탐지합니다. `Dictionary<string, object>` 생성 지점과 숫자 Field 삽입 코드를 추적합니다. 교체 순서는 `readonly record struct DamageEvent(int AttackerId, int TargetId, int Amount)`를 정의하고, 기존 Dictionary 생성 코드를 새 Struct 생성으로 교체한 뒤, 수신 측에서 Dictionary Key 조회를 구조체 Field 접근으로 변경합니다. 회귀 검증은 BenchmarkDotNet `[MemoryDiagnoser]`로 `Gen0` Allocation이 0에 가깝게 줄었는지 확인하고, dotMemory 비교 Snapshot으로 교체 전후 Boxing Allocation Count를 비교합니다.

### Q2. Logging Boxing 설계 판단형

`_logger.LogInformation("damage={0}", damage)`가 매 Tick 수만 번 호출됩니다. Boxing 발생 여부와 Source-generated Logger로 전환하는 판단 기준을 설명하고, 전환 후 Allocation Rate 감소를 어떻게 검증합니까?

`params object[]` Overload는 `damage`(int)를 Boxing하고 배열까지 Allocation합니다. 판단 기준은 Allocation Profiler에서 해당 호출이 Hot Path에 포함되는지, Level이 꺼졌을 때도 인자 평가가 일어나는지 확인합니다. Source-generated Logger로 전환하면 `[LoggerMessage(Level = LogLevel.Information, Message = "damage={Damage}")]` 어트리뷰트로 컴파일 타임 코드를 생성해 Boxing 없이 타입 안전한 Logging을 합니다. 검증은 BenchmarkDotNet `[MemoryDiagnoser]`로 Allocation Bytes 비교, PerfView로 전환 전후 `object[]` Allocation Call Stack을 비교합니다.

### Q3. EntityId Equality Boxing 설계 판단형

Struct `EntityId`가 `IEquatable<T>`를 구현하지 않은 상태로 `Dictionary<EntityId, Session>` Key로 사용됩니다. Boxing이 발생하는 정확한 경로와, `IEquatable<EntityId>` + `EqualityComparer<T>.Default` 적용 후 동작이 달라지는 점을 설명하십시오.

`IEquatable<T>` 미구현 시 `EqualityComparer<T>.Default`가 `ObjectEqualityComparer`를 선택해 `Equals(object? obj)` 경로를 사용합니다. 이 경로는 인자가 `object`이므로 Lookup마다 Boxing이 발생합니다. `IEquatable<EntityId>` 구현 후에는 `EqualityComparer<T>.Default`가 `GenericEqualityComparer`를 선택해 `Equals(EntityId other)` Typed 경로를 사용하므로 Boxing 없이 비교합니다. `GetHashCode`도 `override`해야 Dictionary 저장·조회 양쪽에서 일관된 Hash를 씁니다. 세션 수가 많은 서버에서 Lookup이 수만 번 반복되면 Boxing Allocation이 누적되므로 `IEquatable<T>` 구현은 Dictionary Key Struct의 기본 요건입니다.

### Q4. Boxing Hot Path Profiler 진단형

서버 Tick 루프에서 Allocation Profiler를 실행했더니 `Boxing_Int32`·`Boxing_Enum` Call Stack이 전체 Allocation의 40%를 차지했습니다. 코드베이스에서 원인 패턴을 탐지하는 방법과 우선순위별 수정 순서를 제시하십시오.

Call Stack에서 `Boxing_Int32` 진원지를 역추적해 `params object[]` Logging, Enum을 비Generic API에 전달하는 코드, Struct→Interface 대입 경로를 찾습니다. 탐지는 Roslyn Analyzer(`Meziantou.Analyzer`, `Roslynator`)로 `object` 파라미터에 Value Type이 전달되는 패턴을 정적 분석합니다. 수정 우선순위는 (1) 고빈도 Logging Hot Path → Source-generated Logger, (2) Enum Equality → `EqualityComparer<TEnum>.Default`, (3) Combat Event `Dictionary<string,object>` → Typed Struct/Record, (4) Struct→Interface 대입이 반복되는 경로 → Generic Constraint로 변경. 수정 후 BenchmarkDotNet `Gen0` 수치와 p99 지연 변화를 측정해 우선순위별 효과를 검증합니다.

### Q5. Mutable Boxed Struct 버그 진단형

Mutable Struct `HitInfo`를 `IDamageable` Interface 변수에 대입해 Interface 메서드로 `Amount`를 수정했더니 원본 `HitInfo`가 바뀌지 않는 버그가 발생했습니다. 원인을 진단하고 설계를 어떻게 수정하겠습니까?

Struct를 Interface 변수에 대입하면 Boxing이 발생해 Heap에 값의 복사본이 생깁니다. Interface 메서드 호출은 Box 안의 복사본을 수정하므로 원본 `HitInfo`는 변경되지 않습니다. 진단은 `IDamageable damageable = hitInfo;` 이후 `hitInfo.Amount`가 변경 전 값임을 확인합니다. 수정 방법은 세 가지입니다. 첫째, `HitInfo`를 `readonly struct`로 만들어 수정 자체를 방지합니다. 둘째, Interface가 아닌 Generic Constraint(`where T : IDamageable`)로 Boxing을 피하고 Typed 경로에서 직접 수정합니다. 셋째, 공유 수정이 필요하면 `class`로 전환해 Reference 의미를 갖게 합니다. Mutable Struct + Interface 조합은 항상 의도치 않은 복사를 만들므로 피해야 합니다.

### Q6. Generic Internal Boxing 설계 판단형

"`List<int>` 내부를 Generic API로만 사용하면 Boxing이 전혀 없다"고 주장하는 동료가 있습니다. 내부 Cast 또는 LINQ 체인에서 Boxing이 생기는 구체적 시나리오와 IL 수준 확인 방법을 제시하십시오.

`List<T>` 자체는 Value를 직접 저장하지만, 이를 `IEnumerable<int>`나 `IList<int>` Interface 변수에 대입하거나 `Cast<object>()`를 체인하면 Boxing이 발생합니다. LINQ에서 `list.Cast<object>().Where(...)`나 비Generic Delegate(`Action<object>`)에 Struct를 넘기면 Boxing이 생깁니다. `list.ForEach(x => Log(x))`에서 Log가 `object` Overload이면 `x`가 Boxing됩니다. IL 확인 방법은 dotnet-ildasm 또는 SharpLab(sharplab.io)에서 코드를 붙여 넣어 `box int32` Opcode가 있는지 확인합니다. BenchmarkDotNet `[MemoryDiagnoser]`로 `Gen0` 수치를 보거나, Allocation Profiler로 `Boxing_Int32` Stack이 LINQ 체인에서 발생하는지 검증합니다.

## 18. 예상 꼬리질문

- 실시간 서버에서 Entity State를 `IFormattable`·`IComparable` 두 Interface 변수에 교대로 대입하며 매 프레임 비교·포맷을 수행하는 코드가 있습니다. Allocation Profiler에서 이 경로가 Hot Path로 잡혔을 때, Generic Constraint로 Boxing을 제거하는 리팩토링 방향과 기존 API를 Breaking Change 없이 유지하는 방법을 설명하십시오.
  > Interface 변수 대입 대신 `where T : IFormattable, IComparable<T>` Generic Constraint로 메서드를 변환하면 JIT가 구체 타입을 알아 Boxing 없이 직접 호출합니다. 기존 API를 유지하려면 기존 메서드를 Generic 오버로드로 추가하고 기존 `object` 기반 메서드는 내부에서 Generic 경로로 위임하거나 `[Obsolete]`로 단계적 마이그레이션합니다. 내부 구현은 Generic으로 전환하되 기존 Signature를 유지해 Breaking Change를 피합니다.
- 실시간 서버에서 Skill Effect를 `object` 기반 Event Bus로 퍼뜨리다 GC Pause p99가 20ms를 초과했습니다. Typed Generic Event Dispatcher로 전환할 때 기존 Subscribe·Publish API의 Breaking Change를 최소화하는 방법은 무엇입니까?
  > `Dispatcher.Subscribe<DamageEvent>(handler)`, `Dispatcher.Publish(new DamageEvent(...))` 형태의 Generic API를 신규 추가하고 기존 `object` 기반 API는 내부에서 Generic 경로로 위임합니다. 기존 Subscribe를 `[Obsolete]`로 표시하고 마이그레이션 가이드를 제공합니다. 서비스별 전환 순서는 Profiler에서 Allocation이 가장 많은 Event 타입부터 적용합니다. 전환 후 BenchmarkDotNet으로 Gen0 수치를 측정해 효과를 검증합니다.
- `params object[]` Logging API를 Source-generated `LoggerMessage`로 마이그레이션할 때 Dynamic Format String을 쓰던 기존 호출 코드가 있습니다. 어떻게 처리합니까?
  > `[LoggerMessage]`는 Compile Time에 고정된 Format String이 필요하므로 Dynamic Format String은 직접 지원하지 않습니다. 해결 방법: 동적 포맷이 필요한 경우는 Log Level이 활성화된 상태에서만 실행하도록 `if (_logger.IsEnabled(LogLevel.X))` 가드를 두고, 문자열을 먼저 구성한 뒤 `_logger.Log(LogLevel.X, message)`로 전달합니다. 자주 사용하는 패턴은 고정 Format으로 추출하고, 진짜 동적이 필요한 경우만 별도 경로로 처리합니다.
- 신규 Combat 기능 배포 후 BenchmarkDotNet `[MemoryDiagnoser]` Gen0 수치가 배포 전 대비 2배로 늘었습니다. 변경된 코드에 `Dictionary<string, object>` 이벤트 패킹과 LINQ 체인이 동시에 추가되었을 때, Boxing Allocation과 다른 Heap Allocation을 빠르게 분리하는 진단 절차를 설명하십시오.
  > PerfView 또는 dotMemory에서 Allocation Call Stack을 수집합니다. `Boxing_Int32`·`Boxing_Enum` 타입이 상위에 있으면 Boxing이 주범, `Dictionary<>` 생성이나 `List<>` 할당이 상위이면 컨테이너 생성이 주범입니다. 두 경로를 분리하려면 변경된 코드 중 하나(Dictionary 이벤트 패킹 또는 LINQ 체인)만 활성화한 A/B 벤치마크를 실행해 Gen0 수치를 비교합니다. 이후 Boxing 원인은 `readonly record struct`로, LINQ 원인은 `for` 루프나 `Span` 기반으로 각각 수정합니다.
- Enum 값을 `IEqualityComparer<object>` 기반 Dictionary Key로 사용하면 왜 Boxing이 발생하고, `EqualityComparer<MyEnum>.Default`로 교체하면 어떻게 달라집니까? Key Lookup p99에 차이가 날 조건은 무엇입니까?
  > `IEqualityComparer<object>` 경로는 Enum 값을 `object`로 전달하므로 매 Lookup마다 Boxing Allocation이 발생합니다. `EqualityComparer<MyEnum>.Default`는 JIT가 Enum에 특화된 Comparer를 선택해 Boxing 없이 Typed 비교를 수행합니다. Lookup p99 차이가 나는 조건은 Lookup 빈도가 높고(매 Tick, 매 Packet 처리), Enum Dictionary Key 조회가 Hot Path에 있을 때입니다. Lookup이 드문 Control Plane에서는 차이가 측정 한계 이하일 수 있습니다.
- Hot Path에서 모든 Boxing을 제거했는데 오히려 Gen 0 Allocation이 늘었습니다. 어떤 상황에서 이런 역효과가 생기나요?
  > Boxing 제거를 위해 Value Type을 Class로 바꾸거나, Generic 내부에서 새 List·배열을 생성하거나, Closure를 만드는 Lambda를 추가한 경우 오히려 Heap 객체가 늘어납니다. 또한 Boxing 하나를 피하려고 추가한 Wrapper 객체가 더 큰 Allocation을 만들 수 있습니다. 근본 원인: Boxing 제거 자체가 목표가 아니라 총 Allocation 감소가 목표입니다. 수정 전후 전체 Allocation Call Stack을 비교해 증가한 타입이 무엇인지 확인합니다.
- 서버 업데이트 후 GC Gen 0 빈도가 갑자기 2배로 늘었고 Boxing 관련 Allocation이 의심됩니다. 재현 없이 프로덕션 상황에서 원인을 좁히는 진단 절차를 설명하십시오.
  > (1) dotnet-counters로 `gen-0-gc-count`와 `alloc-rate`를 실시간 수집해 증가 시점과 요청 패턴을 연관시킵니다. (2) 해당 시간대 배포 로그와 코드 변경 이력을 비교해 새로 추가된 `object` 파라미터, Logging 경로, Event Dictionary 패턴을 확인합니다. (3) Staging 환경에서 동일 부하로 PerfView나 dotMemory를 연결해 Call Stack별 Allocation을 수집합니다. (4) `Boxing_Int32`·`Boxing_Enum` Entry가 상위에 있으면 해당 호출 경로를 Typed API로 교체합니다. 재현이 어렵다면 Sampling Profiler를 프로덕션에 단시간 적용하는 방법도 고려합니다.

## 19. 30초 모범답변

> Boxing은 Value Type을 Heap 객체로 감싸 Allocation을 만드는 과정입니다. 실무에서는 `Dictionary<string, object>` 이벤트 패킹, `params object[]` Logging, Struct→Interface 대입이 대표적인 숨은 발생 경로입니다. 매 Tick 수만 번 반복되면 Allocation Rate와 Gen 0 Collection 빈도가 올라가 p99 지연에 실제로 나타납니다. PerfView나 dotMemory로 `Boxing_Int32` Call Stack을 확인하고, `readonly record struct` + Source-generated Logger 같은 구조적 수정을 먼저 적용합니다.

## 20. 1~2분 확장답변

> Boxing은 C# 단일 루트 타입 시스템에서 Value Type을 `object`·Interface로 다루기 위해 Managed Heap에 객체를 만들고 값을 복사하는 과정입니다. 자동으로 일어나 IL 또는 Allocation Profiler를 보기 전까지는 코드만 봐서는 모를 때가 많습니다.
>
> 실무에서 가장 자주 만나는 패턴은 세 가지입니다. 첫째, Skill/Combat Event를 `Dictionary<string, object>`로 퍼뜨리는 구조에서 `damage`, `attackerId` 같은 int 필드가 모두 Boxing됩니다. 둘째, `_logger.LogInformation("hit={0}", damage)`처럼 `params object[]` Overload를 쓰면 매 호출마다 int Boxing과 배열 Allocation이 함께 발생합니다. 셋째, `IEquatable<T>`를 구현하지 않은 Struct를 Dictionary Key로 쓰면 Lookup마다 `Equals(object)` 경로를 타 Boxing이 생깁니다.
>
> 라이브 서비스에서 실제로 문제가 된 경우는 매 Tick 수만 건의 이벤트가 `Dictionary<string, object>`를 통해 전달되면서 dotMemory Allocation Rate가 600MB/s를 넘고 Gen 0 Collection이 초당 80회 이상 발생한 케이스였습니다. `readonly record struct DamageEvent`로 교체하자 Allocation Rate가 90% 이상 감소하고 p99 지연이 목표 안으로 들어왔습니다. Source-generated `[LoggerMessage]`로 Logging Hot Path도 함께 정리했습니다.
>
> 핵심 판단 기준은 두 가지입니다. PerfView 또는 dotMemory에서 `Boxing_Int32`·`Boxing_Enum` Call Stack이 전체 Allocation의 유의미한 비율을 차지하는지 확인하고, BenchmarkDotNet `[MemoryDiagnoser]`로 수정 전후 `Gen0` 수치를 비교합니다. Boxing 0이 목표가 아니라 p99 지연과 Allocation Rate를 실측 기준으로 구조적 해결을 우선 적용하는 것이 원칙입니다.

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
