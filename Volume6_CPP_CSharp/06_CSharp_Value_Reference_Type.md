---
difficulty: 3
reading_time: 20분
interview_frequency: 5
importance: 5
---

# 06. C# Value Type과 Reference Type

> 게임 서버·백엔드 개발자를 위한 CS 면접 교재

## 학습 목표
- 타입·메모리·실행 의미를 설명할 수 있다.
- 주요 비용과 유사 개념을 비교할 수 있다.
- C# 게임 서버 성능과 안정성에 적용할 수 있다.

## 1. 개요
Value Type 변수는 값을 직접 포함하는 의미를 갖고 Reference Type 변수는 관리 Heap 객체에 대한 참조를 담는다.

## 2. 왜 필요한가
복사, 변경, Null 가능성, 할당과 GC 비용을 예측해 API를 설계한다. 관리 Runtime도 할당, 스케줄링과 외부 자원 비용을 없애지는 않는다.

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

## 12. 쉬운 예시
C# Value Type과 Reference Type에서는 네트워크 요청을 기다리는 동안 Thread를 점유하지 않는 것과 CPU 계산을 다른 Thread에서 실행하는 것은 다르다. 객체가 GC 대상이어도 Socket은 using 또는 Dispose로 적시에 닫는다.

## 13. 비슷한 개념과 비교
| 관점 | 관리 기능 | 개발자 책임 |
|---|---|---|
| Memory | GC·Type Safety | 할당률·Dispose |
| Async | Task·await | 취소·예외·Blocking 방지 |
| Value | Value·Reference 의미 | 크기·변경·Identity 선택 |

## 14. 장점과 단점
C# Value Type과 Reference Type에서는 관리 Runtime은 생산성과 메모리 안전성을 높이지만 GC Pause, Boxing, State Machine과 ThreadPool 경쟁 비용이 있다. Allocation을 무조건 제거하기보다 Hot Path를 측정한다.

## 15. 게임 서버·백엔드 실무 예시
작은 불변 좌표는 struct가 자연스럽지만 큰 mutable struct는 복사 비용과 수정 혼동을 만든다. 세션과 Entity처럼 Identity가 중요하면 class를 사용한다.

C# Value Type과 Reference Type에서는 부하 시험에서 Allocation Rate, GC Pause, ThreadPool Queue, CPU와 p99를 수집하고 Timeout과 Cancellation을 전파한다.

## 16. 자주 하는 오해
- Value Type은 항상 Stack이라고 본다.
- GC가 모든 외부 자원을 즉시 정리한다고 본다.
- async가 새 Thread를 만든다고 생각한다.
- Task.Run이 모든 성능 문제를 해결한다고 본다.
- Pool을 사용하면 항상 빨라진다고 본다.

### 최종 실무 판단 기준

- **요구 확인**: Value Type 변수는 값을 직접 포함하는 의미를 갖고 Reference Type 변수는 관리 Heap 객체에 대한 참조를 담는다. 이 내용을 적용하기 전에 데이터 규모, 호출 빈도와 허용 지연을 수치로 확인한다. 같은 기술도 요청량과 정확성 요구가 달라지면 적합한 선택이 달라질 수 있다.
- C# Value Type과 Reference Type에서는 **정확성 경계**: 관리 Runtime에도 실제 비용이 있다. 정상 흐름만 설명하지 않고 중복, 역순, 동시 실행과 부분 실패에서 어떤 불변식을 지켜야 하는지 함께 명시한다.
- C# Value Type과 Reference Type에서는 **비용 비교**: GC와 Dispose 역할을 구분한다. 평균 복잡도나 처리량 하나만 보지 않고 Memory, CPU, I/O, Lock 대기와 구현 복잡도까지 비교한다.
- **장애 대응**: C# Value Type과 Reference Type 관련 구성 요소가 느려지거나 중단됐을 때 Timeout, Retry 상한, Backpressure와 복구 순서를 정한다. Retry가 중복 부작용이나 연쇄 부하를 만들지 검증한다.
- **운영 검증**: C# Value Type과 Reference Type에서는 기능 Test와 함께 경계값, Peak 부하와 장애 주입 Test를 수행한다. 처리 시간 p95·p99, 오류율, Queue와 Resource 사용량을 관찰하고 변경 전후 결과를 비교한다.

C# Value Type과 Reference Type 답변에서는 이 기준으로 답하면 개념 정의에 그치지 않고 선택 조건, Trade-off와 실무 검증 방법까지 논리적으로 연결할 수 있다.

## 17. 면접 질문
### Q1. 핵심 개념을 설명해 주세요.
Value Type 변수는 값을 직접 포함하는 의미를 갖고 Reference Type 변수는 관리 Heap 객체에 대한 참조를 담는다.
### Q2. 어떤 비용이 있나요?
Value Type이 항상 Stack에 있고 Reference Type이 항상 Heap에 있다는 설명은 부정확하다. 저장 위치는 포함 관계와 최적화에 따라 달라지며 핵심은 값 의미와 참조 의미다.
### Q3. 게임 서버 적용 사례는 무엇인가요?
작은 불변 좌표는 struct가 자연스럽지만 큰 mutable struct는 복사 비용과 수정 혼동을 만든다. 세션과 Entity처럼 Identity가 중요하면 class를 사용한다.
### Q4. 무엇을 측정하나요?
할당률, GC Pause와 승격, ThreadPool Queue, CPU와 p99 지연을 본다.

## 18. 예상 꼬리질문
- 관리 메모리와 비관리 자원은 어떻게 다른가요?
- 불필요한 Allocation은 어디서 생기나요?
- async 예외는 어떻게 전파되나요?
- Cancellation을 어디까지 전달하나요?
- Pool의 단점은 무엇인가요?

## 19. 30초 모범답변
> Value Type은 값 의미로 복사되고 Reference Type은 객체 참조가 복사됩니다. Stack·Heap 암기보다 Identity, 변경과 복사 비용으로 선택해야 합니다. 작은 불변 좌표는 struct가 자연스럽지만 큰 mutable struct는 복사 비용과 수정 혼동을 만든다.

## 20. 1~2분 확장답변
> Value Type은 값 의미로 복사되고 Reference Type은 객체 참조가 복사됩니다. Stack·Heap 암기보다 Identity, 변경과 복사 비용으로 선택해야 합니다. C# 서버에서는 값·참조 의미와 객체 수명을 먼저 정하고 비관리 자원은 Dispose합니다. I/O는 async로 겹쳐 처리하지만 CPU 작업과 Blocking을 구분합니다. 최적화는 Allocation, GC, ThreadPool과 p99 지표를 근거로 적용합니다.

## 21. 핵심 요약
- Value Type 변수는 값을 직접 포함하는 의미를 갖고 Reference Type 변수는 관리 Heap 객체에 대한 참조를 담는다.
- 관리 Runtime에도 실제 비용이 있다.
- GC와 Dispose 역할을 구분한다.
- I/O 비동기와 CPU 병렬화를 구분한다.
- 지표로 Hot Path를 최적화한다.

## 한 줄 정리
> Value Type은 값 의미로 복사되고 Reference Type은 객체 참조가 복사됩니다. Stack·Heap 암기보다 Identity, 변경과 복사 비용으로 선택해야 합니다.
