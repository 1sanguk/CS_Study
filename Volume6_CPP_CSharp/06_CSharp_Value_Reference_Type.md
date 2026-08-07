---
difficulty: 3
reading_time: 20분
interview_frequency: 5
importance: 5
---

# 06. C# Value Type과 Reference Type


## 학습 목표

- Struct 배열·Class 참조를 혼합한 코드에서 대입이 독립 복사인지 참조 공유인지 판단하고, Position·Session처럼 게임 서버 객체마다 Struct·Class 중 어느 것이 적합한지 결정할 수 있다.
- Session·Position 예시에서 'Stack vs Heap' 저장 위치가 아닌 복사 의미와 Identity를 기준으로 타입 선택이 바뀌는 조건을 판단할 수 있다.
- 큰 Mutable Struct를 `ref`·`in`으로 전달할 때 방어적 Copy가 발생하는 조건을 진단하고, `readonly struct`·`ref return`이 필요한 시점을 결정할 수 있다.
- Message Queue에 Mutable Class를 넣는 설계에서 Consumer 오염 버그를 진단하고, Immutable Record·Struct Snapshot 중 상황에 맞는 방식을 선택할 수 있다.

## 1. 개요

Value Type 변수는 값 자체를 포함하고 대입 시 독립적인 복사본이 만들어진다. Reference Type 변수는 관리 Heap 객체에 대한 참조를 담으며 대입하면 같은 객체를 두 변수가 가리킨다.

C#에서 `struct`·숫자형·`bool`·`enum`은 Value Type, `class`·배열·`string`·Delegate·Interface는 Reference Type이다. 선택 기준은 "값이 독립적으로 복사되어야 하는지(Value), 아니면 여러 곳에서 같은 객체를 공유해야 하는지(Reference)"다.

## 2. 왜 필요한가

복사, 공유, Null 가능성, 할당·GC 비용을 예측해 API를 설계하기 위해 두 Type 범주를 구분한다.

```csharp
// Value Type: 두 위치가 독립 복사본을 가짐
Position a = new Position { X = 1 };
Position b = a;
b.X = 99; // a.X는 여전히 1

// Reference Type: 두 변수가 같은 객체를 가리킴
Player p1 = new Player { Level = 1 };
Player p2 = p1;
p2.Level = 99; // p1.Level도 99
```

API 설계에서 어느 쪽을 선택하느냐에 따라 "받은 값을 수정해도 원본이 안전한가"가 결정된다.

## 3. 핵심 동작 원리
```text
struct a→copy b independent fields / class a,b→same object reference
```
Value Type이 항상 Stack에 있고 Reference Type이 항상 Heap에 있다는 설명은 부정확하다. 저장 위치는 포함 관계와 최적화에 따라 달라지며 핵심은 값 의미와 참조 의미다.

C# Value Type과 Reference Type에서는 값 복사, 객체 도달 가능성, Continuation 실행 위치와 자원 Scope를 구분해야 한다.

### 변수에 저장되는 의미

Value Type 변수는 값 자체를 포함하고 대입 시 Field 값이 복사된다. Reference Type 변수는 객체 Reference 값을 포함하고 대입 시 Reference가 복사된다.

```csharp
int a = 10;
int b = a;
b = 20; // a는 10

Player p1 = new() { Level = 10 };
Player p2 = p1;
p2.Level = 20; // p1과 p2가 같은 객체를 가리킴
```

Value Type에는 `struct`, 숫자형, `bool`, `enum`, `Nullable<T>`가 있고 Reference Type에는 `class`, 배열, Delegate, `string`, Interface가 있다.

“Value Type은 Stack, Reference Type은 Heap”은 정확한 정의가 아니다. Class의 Struct Field는 객체 내부 Managed Heap에 있고 Storage 위치는 Context와 Runtime 최적화에 따라 달라진다. 핵심은 값 복사와 객체 Identity다.

## 4. Struct Copy와 내부 Reference

```csharp
struct Position
{
    public float X;
    public float Y;
}

Position p1 = new() { X = 1, Y = 2 };
Position p2 = p1;
p2.X = 10; // p1.X는 1
```

Struct 안에 Reference Field가 있으면 Reference 값만 복사되어 내부 객체는 공유될 수 있다.

```csharp
struct PartyInfo
{
    public List<int> Members;
}
```

`PartyInfo` Copy가 `Members` List까지 Deep Copy하지 않는다. 변경 가능한 Reference를 가진 Struct는 값처럼 보이면서 내부 상태를 공유해 혼란을 만든다.

## 5. Parameter 전달

C# Parameter는 기본적으로 값 전달이다. Reference Type Parameter도 Reference 값의 Copy다.

```csharp
void Change(Player player)
{
    player.Level = 20;       // 호출자와 같은 객체 수정
    player = new Player();   // 호출자 변수 자체는 안 바뀜
}
```

호출자의 변수 자체를 바꾸려면 `ref`, 반드시 값을 써서 반환하면 `out`, 큰 Struct를 읽기 전용 Reference로 전달하면 `in`을 사용한다.

```csharp
void Replace(ref Player player) => player = new Player();
```

`ref`는 Alias를 만들어 가독성과 수명을 복잡하게 할 수 있으므로 반환값으로 표현할 수 있는지 먼저 본다.

## 6. ref local, ref return, Span

배열의 Struct 원소를 일반 변수로 받으면 Copy가 된다.

```csharp
Position copy = positions[0];
copy.X = 10; // 배열 원소는 그대로

ref Position original = ref positions[0];
original.X = 10; // 배열 원소 수정
```

Compiler의 Ref Escape 분석은 Local Storage의 Reference가 수명 밖으로 탈출하는 것을 막는다. `Span<T>`와 `ref struct`는 Heap Boxing·일반 Field 저장·비동기 경계 사용이 제한된다. 내부 Memory Reference가 대상보다 오래 살지 않게 하는 규칙이다.

`List<T>` Indexer에서 Struct를 꺼내면 값 Copy이므로 수정 후 다시 넣어야 한다. 고급 `CollectionsMarshal.AsSpan`은 내부 Storage를 노출해 List 크기 변경 시 무효화될 수 있으므로 Hot Path에서 계약을 알고 사용한다.

## 7. readonly struct와 방어적 Copy

작은 Value Type은 불변으로 설계하면 이해하기 쉽다.

```csharp
public readonly struct Vector2
{
    public float X { get; }
    public float Y { get; }
}
```

Readonly Context에서 Mutable Struct Member를 호출하면 원본 보호를 위해 방어적 Copy가 생길 수 있다. 큰 Struct에서는 숨은 비용이다. `in T`도 작은 Struct에서는 간접 접근 비용이 Copy 절감보다 클 수 있어 측정한다.

## 8. Equality와 Identity

Class는 기본적으로 객체 Identity Equality를 사용한다. Struct는 값 Equality 의미에 가깝다. 성능이 중요한 Struct Key는 `IEquatable<T>`를 구현하고 `Equals`와 `GetHashCode` 계약을 맞춘다.

```text
Equals(a,b) == true
→ GetHashCode(a) == GetHashCode(b)
```

`record class`와 `record struct`는 값 기반 Equality 생성을 돕는다. Equality에 포함되는 Mutable Field를 Hash Key로 사용 후 변경하면 Dictionary에서 찾지 못할 수 있다.

Reference 동일성을 확인하려면 `ReferenceEquals`를 사용한다. `==`는 Type이 값 Equality로 Overload했을 수 있다.

## 9. string의 특수성

`string`은 Reference Type이지만 Immutable이다.

```csharp
string a = "game";
string b = a;
b += "server"; // 새 문자열, a는 그대로
```

그래서 대입 후 독립 값처럼 보인다. 반복 연결은 Temporary Allocation과 GC 부하를 만들 수 있어 `StringBuilder`, Span 기반 Formatting을 고려한다.

## 10. Struct와 Class 선택

Struct는 작고 불변이며 하나의 논리적 값을 표현하고 Boxing이 드문 경우에 적합하다. Position, ID, Timestamp Wrapper가 예다. 큰 Mutable Struct는 Copy 비용과 수정 대상 혼동이 크다.

Class는 Identity, 공유 Reference, 상속과 긴 수명 객체에 적합하지만 Heap Allocation·GC와 간접 접근 비용이 있다. 절대 Byte 기준 하나로 정하지 않고 Collection 배치, Copy 빈도와 JIT 결과를 측정한다.

## 11. 게임 서버 실무

Position·Velocity를 Struct 배열로 저장하면 연속 Memory 순회에 유리할 수 있다. Session·Player처럼 여러 System이 동일 Identity를 공유하고 비동기 작업과 연결되는 객체는 Class가 자연스럽다.

Message Queue에 Mutable Class를 넣고 Producer가 나중에 변경하면 Consumer가 다른 값을 본다. Immutable Record나 Value Snapshot을 사용한다. Struct여도 내부 List Reference가 Mutable하면 깊은 불변성이 아니다.

Value Copy는 공유 Race를 일부 줄이지만 Reference Field까지 복제하지 않는다. GC가 객체 수명을 관리해도 여러 Thread의 객체 Member 접근은 Data Race·논리 Race가 될 수 있다.

Interop에서 Managed Object 주소를 Native Code가 저장하려면 Pinning과 수명 계약이 필요하다. 과도한 Pinning은 GC Compact를 방해하므로 `fixed` Scope, `GCHandle`, `SafeHandle`을 목적에 맞게 사용한다.

### Nullable Value Type

Value Type은 기본적으로 Null이 될 수 없지만 `Nullable<T>`, 축약형 `T?`로 값 존재 여부를 표현한다.

```csharp
int? score = null;
if (score is int value)
    Use(value);
```

`Nullable<T>`는 `HasValue`와 `Value` 의미를 가진 Value Type이다. Nullable Reference Annotation의 `Player?`와 문법은 비슷하지만 후자는 Compiler의 Nullability 분석 Metadata이며 Runtime Representation이 다르다.

### Default 값과 초기화

Struct의 `default`는 모든 Field가 0·false·null의 Default가 된 값이다. Domain에서 Default가 유효하지 않은 ID나 Timestamp라면 Factory와 Validation을 두고 `IsValid` 의미를 명시한다. Parameterless Constructor가 있어도 배열 Allocation 등 일부 경로에서 Default 값이 존재할 수 있음을 고려한다.

성능 검증에는 Allocation Rate만 아니라 Struct Copy 크기, Boxing, Cache Miss와 GC Pause를 함께 본다. Benchmark는 최적화된 Release Build와 실제 Collection·호출 Pattern으로 수행한다.

## 12. 쉬운 예시: 좌표와 플레이어

Position은 두 Entity 사이에 공유될 이유가 없는 독립 값이므로 `struct`가 자연스럽다. Player는 인벤토리, 세션, 전투 System 등 여러 곳에서 같은 객체를 참조해야 하므로 `class`가 자연스럽다.

```csharp
// struct: 각 Entity가 독립 좌표
public readonly struct Position
{
    public float X { get; }
    public float Y { get; }
    public Position(float x, float y) => (X, Y) = (x, y);
}

// class: 여러 System이 같은 Player를 공유
public class Player
{
    public int PlayerId { get; }
    public Inventory Inventory { get; }
    public Position Position { get; set; }
}
```

`Player.Position`은 `struct`이지만 `Player` 객체 내부 Managed Heap에 저장된다. "Struct는 Stack"이라는 설명이 맞지 않는 이유다.

## 13. 비슷한 개념 비교

| 관점 | Value Type(`struct`) | Reference Type(`class`) |
|---|---|---|
| 대입 결과 | 독립 복사본 | 같은 객체를 두 변수가 가리킴 |
| Null 가능성 | 없음 (`T?`로 래핑) | 기본 가능 |
| GC 부담 | Heap Allocation 없음 | GC 추적 필요 |
| Equality 기본 | Field 값 Equality | Reference Identity |
| 공유 상태 | 없음 (복사 독립) | 공유됨 |
| 주요 위험 | Mutable Struct 복사 혼동 | Null 역참조, 공유 Race |

## 14. 장점과 단점

### Value Type 장점

- Heap Allocation이 없어 GC 추적 대상이 되지 않는다.
- 배열로 저장하면 연속 Memory 배치로 Cache 효율이 높다.
- 대입 시 독립 복사본이 생겨 공유 Race가 생기지 않는다.

### Value Type 단점

- 크고 Mutable한 Struct는 복사 비용과 "어떤 복사본을 수정했나" 혼동이 크다.
- `List<T>` Indexer로 꺼낸 Struct를 수정하면 원본이 안 바뀐다.
- Reference Field를 가진 Struct는 내부 객체가 공유되어 값처럼 보이면서 부작용이 생긴다.

### Reference Type 장점

- 여러 System이 동일 Identity를 공유하고 변경이 반영된다.
- 다형성과 상속, 긴 수명 객체 관리에 자연스럽다.

### Reference Type 단점

- Heap Allocation과 GC 추적 비용이 있다.
- Null 역참조와 공유 상태 Race 위험이 있다.

## 15. 게임 서버·백엔드 실무 예시

### Position·Velocity Struct 배열

ECS 패턴에서 Position·Velocity를 `struct` 배열로 저장하면 연속 Memory 순회로 Tick 처리 Cache 효율이 높아진다.

```csharp
Position[] positions = new Position[10_000];
Velocity[] velocities = new Velocity[10_000];

for (int i = 0; i < positions.Length; i++)
    positions[i] = new Position(positions[i].X + velocities[i].Dx * dt,
                                positions[i].Y + velocities[i].Dy * dt);
```

### Session은 class

Session은 비동기 I/O, 상태 Machine, 패킷 Buffer를 포함하며 여러 System이 같은 Session을 참조한다. `class`가 자연스럽다. Session을 `struct`로 만들면 복사본이 생겨 상태가 분기된다.

### Message Queue와 불변성

Mutable `class`를 Queue에 넣고 Producer가 뒤에 변경하면 Consumer가 다른 값을 본다.

```csharp
// 위험: Producer가 Enqueue 후 수정하면 Consumer가 다른 값을 봄
var msg = new Message();
queue.Enqueue(msg);
msg.Content = "changed"; // Consumer에도 영향

// 안전: Immutable record나 Struct Snapshot
record struct MessageSnapshot(string Content, long Timestamp);
queue.Enqueue(new MessageSnapshot(content, timestamp));
```

## 16. 자주 하는 오해

- **Value Type은 항상 Stack에 있다**: Class Field의 Struct는 Managed Heap의 객체 내부에 저장된다. 저장 위치는 포함 관계와 최적화에 따라 다르며 핵심은 복사 의미다.
- **Reference Type 대입은 Deep Copy다**: Reference 값(주소)이 복사되므로 두 변수가 같은 객체를 가리킨다. 독립 복사를 원하면 명시적 Clone이나 record의 `with` 식이 필요하다.
- **`string`은 Value Type처럼 동작하므로 Value Type이다**: `string`은 Reference Type이지만 Immutable이어서 값처럼 보인다. 대입 후 한쪽을 수정(새 연결)해도 원본이 바뀌지 않는 것은 Immutability 때문이다.
- **`readonly struct`는 복사가 없다**: `readonly struct`는 불변성을 보장하지 복사를 막지 않는다. `in T` 매개변수도 Readonly Context에서 Mutable Member 호출 시 방어적 Copy가 생길 수 있다.
- **Mutable Struct를 `ref` 없이 함수에 넘기면 수정이 반영된다**: 값 전달이므로 복사본이 생긴다. 원본을 수정하려면 `ref`를 써야 한다.
- **Struct에 Reference Field가 있어도 복사하면 완전히 독립된다**: Reference Field는 Reference 값만 복사되므로 내부 객체가 공유된다.
- **`Nullable<int>`와 Nullable Reference Annotation `Player?`는 동일하다**: `Nullable<T>`는 Runtime에 실제 값이 있는 Value Type Wrapper이며, `Player?`는 Compiler 분석 Metadata이다. Runtime Representation이 다르다.

## 17. 면접 질문

### Q1. ECS 서버에서 Position·Velocity를 `class[]` 대신 `struct[]`로 전환했을 때 예상하는 Cache 효율 차이와, 도리어 성능이 나빠질 수 있는 조건은 무엇입니까?

`struct[]`는 연속 Memory에 Field 값이 배치되어 순차 Tick 접근 시 Cache Line 활용이 높습니다. `class[]`는 배열이 Reference를 담아 객체마다 별도 Heap Allocation, Cache Miss가 발생합니다. 그러나 Position·Velocity를 함께 읽지 않고 각각 별도 배열로 분리하면 두 배열을 번갈아 읽을 때 Cache Line이 경쟁합니다. 또 Struct 크기가 커지면 Copy 비용이 늘고 Cache Line 당 원소 수가 줄어 효율이 낮아집니다. BenchmarkDotNet으로 실제 Cache Miss와 throughput을 측정해 결정합니다.

### Q2. `List<Position>` Indexer로 꺼낸 Struct를 수정했는데 Entity 위치가 갱신되지 않는 버그가 발생했습니다. 원인을 설명하고 `ref local`·`CollectionsMarshal.AsSpan`으로 수정하는 방법을 설명하십시오.

`List<T>` Indexer `get`은 Struct의 복사본을 반환합니다. `pos.X = 10;`은 복사본에만 적용되고 List 내부 배열은 변경되지 않습니다. 수정 방법은 두 가지입니다. 첫째, `ref Position pos = ref CollectionsMarshal.AsSpan(list)[i]; pos.X = 10;`으로 내부 배열 원소 Reference를 직접 얻어 수정합니다. 단 Span이 살아 있는 동안 List Add·Remove를 하면 내부 배열이 재할당되어 Span이 무효화되므로, 수정 구간 동안 List 크기를 변경하지 않아야 합니다. 둘째, 값을 꺼내 수정 후 다시 넣는 방식(`list[i] = new Position(10, pos.Y)`)을 사용합니다.

### Q3. Message Queue에 Mutable Session Message 객체를 넣었는데 Consumer가 예상과 다른 Content를 읽는 Race가 발생했습니다. 원인을 진단하고, Immutable record·Struct Snapshot 중 어느 것으로 수정하겠습니까?

Mutable Class 참조를 Queue에 넣으면 Producer가 Enqueue 후 객체를 수정할 때 같은 객체를 참조하는 Consumer도 다른 값을 봅니다. 진단은 `lock` 없이 참조를 공유하는 경로와 수정 시점을 Logging으로 확인합니다. 수정 방법은 두 가지입니다. Content가 수정 불가 단순 값이면 `record struct MessageSnapshot(string Content, long Timestamp);`로 값 복사 Snapshot을 사용합니다. 복잡한 중첩 구조나 상속이 필요하면 `record class`(Immutable init-only Property)를 사용하되, 내부 Collection이 있으면 `IReadOnlyList<T>`로 노출합니다. Struct Snapshot이 더 가볍지만 내부에 Reference Field가 있으면 Deep Copy가 아님을 명심합니다.

### Q4. 64바이트 Struct를 자주 호출되는 함수에 `in T`로 전달했습니다. 항상 Copy 비용이 줄어드나요? 방어적 Copy가 생기는 조건과 효과를 측정하는 방법을 설명하십시오.

`in T`는 읽기 전용 Reference를 전달해 Struct 복사를 피합니다. 그러나 Readonly Context에서 Mutable Instance Member(Property Setter·Mutable Method)를 호출하면 Compiler가 원본 보호를 위해 방어적 Copy를 만들어 오히려 Copy가 발생합니다. `readonly struct`로 선언하면 Compiler가 모든 Member가 읽기 전용임을 알아 방어적 Copy 없이 Reference를 그대로 씁니다. 효과 측정은 BenchmarkDotNet에서 `[MemoryDiagnoser]`와 `[DisassemblyDiagnoser]`로 IL·Assembly를 확인하거나, Allocation Count로 복사 여부를 검증합니다. 작은 Struct(16바이트 이하)는 간접 접근 비용이 Copy 비용보다 클 수 있어 측정 후 결정합니다.

### Q5. Session 객체를 `struct`로 만들면 어떤 문제가 발생합니까? 비동기 I/O Callback과 여러 System이 동일 Session을 참조하는 시나리오에서 각각 설명하십시오.

`struct` Session은 대입·함수 전달 시 복사본이 생깁니다. 비동기 I/O Callback에서 복사본이 받는 수신 데이터는 호출자의 원본 Session에 반영되지 않아 상태가 분기됩니다. 여러 System(전투, 인벤토리, 패킷 Handler)이 각자 복사본을 가지면 상태 변경이 전파되지 않아 불일치가 생깁니다. `async` 메서드에서 Struct의 `this`는 Reference가 아니므로 `await` 이후 상태 변경이 안전하지 않습니다. Session처럼 Identity를 공유하고 긴 수명을 가지며 비동기 경계를 넘는 객체는 반드시 `class`를 사용합니다.

### Q6. `record struct PlayerSnapshot`에 `List<int> ItemIds`를 포함해 Message Queue에 Snapshot으로 Enqueue했는데 Consumer에서 ItemIds 내용이 달라지는 버그가 발생했습니다. 원인을 진단하고 설계 수정 방법을 제시하십시오.

`record struct` 복사 시 `List<int>` Reference 값만 복사됩니다. 생산자와 소비자가 같은 `List<int>` 객체를 가리키므로 Producer가 이후 List를 수정하면 Consumer도 바뀐 내용을 봅니다. 수정 방법은 두 가지입니다. 첫째, Enqueue 시 `new List<int>(original.ItemIds)`로 Deep Copy해 List를 별도 인스턴스로 만듭니다. 둘째, `IReadOnlyList<int>` 또는 `ItemIds.ToArray()`·`ImmutableArray<int>`로 Immutable 표현으로 바꿔 수정 자체를 막습니다. Struct Snapshot이 가볍더라도 내부 Reference Field가 있으면 값 의미가 아니라 얕은 복사임을 설계에 명시합니다.

## 18. 예상 꼬리질문

- ECS Tick에서 `Position[]·Velocity[]`를 별도 배열로 분리했는데 순차 접근 시 Cache Miss가 예상보다 높게 나왔습니다. 어떤 접근 패턴이 원인이고, SoA(Structure of Arrays)·AoS(Array of Structures) 중 어느 쪽으로 재조정합니까?
- `record struct MessageSnapshot`에 `List<Player>` Field를 포함해 Queue에 Enqueue했는데 Consumer에서 내용이 달라지는 버그가 발생했습니다. 원인과 방어 방법은 무엇입니까?
- `CollectionsMarshal.AsSpan`으로 `List<Position>` 내부를 직접 수정하다 List Add 후 Dangling 접근이 발생했습니다. 안전하게 사용하는 제약 조건과 패턴은 무엇입니까?
- `interface`를 구현한 Struct를 Interface 변수에 대입할 때 Boxing이 발생하는 경로를 Allocation Profiler 없이 코드 레벨에서 탐지하는 방법은 무엇입니까?
- Equality에 포함되는 Mutable Score Field를 가진 Struct를 Dictionary Key로 사용하다 Score 변경 후 조회 실패가 발생했습니다. 원인과 Key 설계 원칙은 무엇입니까?
- 64바이트 `readonly struct`의 Non-readonly Extension Method 호출에서 방어적 Copy 발생 여부를 BenchmarkDotNet으로 확인하는 방법과 `in` 사용이 유리한 Struct 크기 기준은 무엇입니까?
- `Nullable<int>` 타입과 Nullable Reference Annotation `Session?`을 동일하게 취급한 코드에서 Runtime null 검사가 달라지는 구체적 시나리오와 수정 방법은 무엇입니까?

## 19. 30초 모범답변

> Value Type은 대입 시 독립 복사본을 만들고, Reference Type은 같은 객체를 두 변수가 가리킵니다. "Stack/Heap 위치"보다 "복사 의미와 Identity 공유 여부"가 핵심입니다. 게임 서버에서 Position·Velocity는 Struct 배열로 연속 배치해 Tick 당 Cache Miss를 줄이고, Session·Player처럼 여러 System이 동일 Identity를 공유하고 비동기 경계를 넘는 객체는 Class를 씁니다. Struct가 커지면 Copy 비용이 늘어 BenchmarkDotNet으로 Allocation Rate와 Cache Miss를 측정해 결정합니다.

## 20. 1~2분 확장답변

> Value Type 변수는 값 자체를 포함해 대입 시 독립 복사본이 생깁니다. Reference Type 변수는 객체 참조를 담아 대입하면 같은 객체를 두 변수가 공유합니다. Class의 Struct Field는 Managed Heap에 있으므로 "Struct는 항상 Stack"은 부정확하며, 핵심은 복사 의미와 Identity입니다.
>
> Mutable Struct는 복사 시 내부 Reference Field가 공유되어 값처럼 보이면서 부작용이 생깁니다. `readonly struct`로 설계하면 Compiler가 방어적 Copy 없이 Reference를 그대로 씁니다. `in T`를 64바이트 Struct에 쓸 때 Mutable Member 호출이 있으면 오히려 방어적 Copy가 발생하므로, BenchmarkDotNet `[DisassemblyDiagnoser]`로 IL을 확인합니다. 16바이트 이하 Struct는 간접 접근 비용이 Copy 절감보다 클 수 있어 실측이 필요합니다.
>
> 라이브 MMORPG 서버에서 10,000 Entity Tick 처리에 `class[]` 기반 Position을 썼을 때 GC Pause가 p99 기준 20ms를 넘겼는데, `struct[]` 전환 후 Allocation Rate가 0에 가까워지고 GC Pause가 1ms 미만으로 줄어든 경험이 있습니다. Session처럼 비동기 I/O Callback과 여러 System이 동일 Identity를 참조하는 객체는 Struct로 만들면 복사본이 분기되어 상태 불일치가 생기므로 반드시 Class를 씁니다. Message Queue에 Mutable Class 참조를 Enqueue하면 Producer가 이후 수정할 때 Consumer에도 영향을 주는 Race가 발생합니다. `record struct MessageSnapshot`으로 값 Snapshot을 쓰되, 내부에 `List<T>` 같은 Reference Field가 있으면 `ImmutableArray<T>`나 Enqueue 시 Deep Copy로 진짜 격리를 보장합니다.

## 21. 핵심 요약

- Value Type은 대입 시 독립 복사본, Reference Type은 같은 객체를 공유한다.
- "Struct는 Stack, Class는 Heap"은 단순화된 표현이며 핵심은 복사 의미와 Identity다.
- Struct는 작고 불변이며 독립 값을 표현할 때 적합하다.
- Mutable Struct는 복사 혼동과 내부 Reference 공유 위험이 있다.
- `readonly struct`로 불변성을 보장하고 `ref`·`in`으로 불필요한 Copy를 줄인다.
- `List<T>` Indexer로 꺼낸 Struct 수정은 원본에 반영되지 않는다.
- Message Queue에는 Immutable Record나 Struct Snapshot을 사용해 공유 Race를 방지한다.
- `string`은 Reference Type이지만 Immutable이어서 값처럼 동작한다.

## 한 줄 정리

> Value Type은 대입 시 독립 복사본, Reference Type은 같은 객체 공유이며, 선택 기준은 Storage 위치가 아닌 Identity·복사 의미다.
