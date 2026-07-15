---
difficulty: 3
reading_time: 20분
interview_frequency: 5
importance: 5
---

# 07. Boxing과 Unboxing

> 게임 서버·백엔드 개발자를 위한 CS 면접 교재

## 학습 목표
- 타입·메모리·실행 의미를 설명할 수 있다.
- 주요 비용과 유사 개념을 비교할 수 있다.
- C# 게임 서버 성능과 안정성에 적용할 수 있다.

## 1. 개요
Boxing은 Value Type 값을 object나 Interface 형태의 관리 객체로 감싸고 Unboxing은 호환되는 원래 Value Type을 꺼내는 과정이다.

## 2. 왜 필요한가
통합 객체·Interface API에서 Value Type을 다룰 수 있지만 할당과 타입 검사가 발생한다. 관리 Runtime도 할당, 스케줄링과 외부 자원 비용을 없애지는 않는다.

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

## 12. 쉬운 예시
Boxing과 Unboxing에서는 네트워크 요청을 기다리는 동안 Thread를 점유하지 않는 것과 CPU 계산을 다른 Thread에서 실행하는 것은 다르다. 객체가 GC 대상이어도 Socket은 using 또는 Dispose로 적시에 닫는다.

## 13. 비슷한 개념과 비교
| 관점 | 관리 기능 | 개발자 책임 |
|---|---|---|
| Memory | GC·Type Safety | 할당률·Dispose |
| Async | Task·await | 취소·예외·Blocking 방지 |
| Value | Value·Reference 의미 | 크기·변경·Identity 선택 |

## 14. 장점과 단점
Boxing과 Unboxing에서는 관리 Runtime은 생산성과 메모리 안전성을 높이지만 GC Pause, Boxing, State Machine과 ThreadPool 경쟁 비용이 있다. Allocation을 무조건 제거하기보다 Hot Path를 측정한다.

## 15. 게임 서버·백엔드 실무 예시
매 Tick 숫자를 object 컬렉션이나 비제네릭 로깅 인자로 넘기면 할당률과 GC가 증가할 수 있다. 프로파일러로 Boxing Allocation을 찾는다.

Boxing과 Unboxing에서는 부하 시험에서 Allocation Rate, GC Pause, ThreadPool Queue, CPU와 p99를 수집하고 Timeout과 Cancellation을 전파한다.

## 16. 자주 하는 오해
- Value Type은 항상 Stack이라고 본다.
- GC가 모든 외부 자원을 즉시 정리한다고 본다.
- async가 새 Thread를 만든다고 생각한다.
- Task.Run이 모든 성능 문제를 해결한다고 본다.
- Pool을 사용하면 항상 빨라진다고 본다.

### 최종 실무 판단 기준

- **요구 확인**: Boxing은 Value Type 값을 object나 Interface 형태의 관리 객체로 감싸고 Unboxing은 호환되는 원래 Value Type을 꺼내는 과정이다. 이 내용을 적용하기 전에 데이터 규모, 호출 빈도와 허용 지연을 수치로 확인한다. 같은 기술도 요청량과 정확성 요구가 달라지면 적합한 선택이 달라질 수 있다.
- Boxing과 Unboxing에서는 **정확성 경계**: 관리 Runtime에도 실제 비용이 있다. 정상 흐름만 설명하지 않고 중복, 역순, 동시 실행과 부분 실패에서 어떤 불변식을 지켜야 하는지 함께 명시한다.
- Boxing과 Unboxing에서는 **비용 비교**: GC와 Dispose 역할을 구분한다. 평균 복잡도나 처리량 하나만 보지 않고 Memory, CPU, I/O, Lock 대기와 구현 복잡도까지 비교한다.
- **장애 대응**: Boxing과 Unboxing 관련 구성 요소가 느려지거나 중단됐을 때 Timeout, Retry 상한, Backpressure와 복구 순서를 정한다. Retry가 중복 부작용이나 연쇄 부하를 만들지 검증한다.
- **운영 검증**: Boxing과 Unboxing에서는 기능 Test와 함께 경계값, Peak 부하와 장애 주입 Test를 수행한다. 처리 시간 p95·p99, 오류율, Queue와 Resource 사용량을 관찰하고 변경 전후 결과를 비교한다.

Boxing과 Unboxing 답변에서는 이 기준으로 답하면 개념 정의에 그치지 않고 선택 조건, Trade-off와 실무 검증 방법까지 논리적으로 연결할 수 있다.

## 17. 면접 질문
### Q1. 핵심 개념을 설명해 주세요.
Boxing은 Value Type 값을 object나 Interface 형태의 관리 객체로 감싸고 Unboxing은 호환되는 원래 Value Type을 꺼내는 과정이다.
### Q2. 어떤 비용이 있나요?
Boxing은 Heap 할당과 복사를 만들 수 있고 Unboxing은 정확한 타입이 필요하다. Generic을 사용하면 많은 Boxing을 피할 수 있다.
### Q3. 게임 서버 적용 사례는 무엇인가요?
매 Tick 숫자를 object 컬렉션이나 비제네릭 로깅 인자로 넘기면 할당률과 GC가 증가할 수 있다. 프로파일러로 Boxing Allocation을 찾는다.
### Q4. 무엇을 측정하나요?
할당률, GC Pause와 승격, ThreadPool Queue, CPU와 p99 지연을 본다.

## 18. 예상 꼬리질문
- 관리 메모리와 비관리 자원은 어떻게 다른가요?
- 불필요한 Allocation은 어디서 생기나요?
- async 예외는 어떻게 전파되나요?
- Cancellation을 어디까지 전달하나요?
- Pool의 단점은 무엇인가요?

## 19. 30초 모범답변
> Boxing은 Value Type을 object 형태로 감싸는 할당이고 Unboxing은 정확한 원래 타입으로 꺼내는 과정입니다. Generic API로 불필요한 Boxing을 줄입니다. 매 Tick 숫자를 object 컬렉션이나 비제네릭 로깅 인자로 넘기면 할당률과 GC가 증가할 수 있다.

## 20. 1~2분 확장답변
> Boxing은 Value Type을 object 형태로 감싸는 할당이고 Unboxing은 정확한 원래 타입으로 꺼내는 과정입니다. Generic API로 불필요한 Boxing을 줄입니다. C# 서버에서는 값·참조 의미와 객체 수명을 먼저 정하고 비관리 자원은 Dispose합니다. I/O는 async로 겹쳐 처리하지만 CPU 작업과 Blocking을 구분합니다. 최적화는 Allocation, GC, ThreadPool과 p99 지표를 근거로 적용합니다.

## 21. 핵심 요약
- Boxing은 Value Type 값을 object나 Interface 형태의 관리 객체로 감싸고 Unboxing은 호환되는 원래 Value Type을 꺼내는 과정이다.
- 관리 Runtime에도 실제 비용이 있다.
- GC와 Dispose 역할을 구분한다.
- I/O 비동기와 CPU 병렬화를 구분한다.
- 지표로 Hot Path를 최적화한다.

## 한 줄 정리
> Boxing은 Value Type을 object 형태로 감싸는 할당이고 Unboxing은 정확한 원래 타입으로 꺼내는 과정입니다. Generic API로 불필요한 Boxing을 줄입니다.
