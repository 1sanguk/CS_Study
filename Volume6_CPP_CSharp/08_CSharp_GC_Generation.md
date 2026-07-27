---
difficulty: 3
reading_time: 20분
interview_frequency: 5
importance: 5
---

# 08. C# GC와 Generation

> 게임 서버·백엔드 개발자를 위한 CS 면접 교재

## 학습 목표

- .NET GC의 도달 가능성 기반 수집과 세대 분리 원리를 설명할 수 있다.
- GC가 막지 못하는 Managed Memory Retention(논리적 Leak) 패턴을 식별할 수 있다.
- Finalizer·`IDisposable`·`using`의 역할과 차이를 설명할 수 있다.
- 게임 서버의 Tick Spike와 GC Pause 연관성을 진단 지표로 설명할 수 있다.

## 1. 개요

.NET Garbage Collector는 Root에서 도달 가능한 객체를 추적해 더 이상 도달할 수 없는 관리 객체의 메모리를 자동으로 회수한다. 세대(Generation) 분리는 대부분의 객체가 짧게 살고 일부만 오래 산다는 가설을 이용해 짧은 수명 객체를 자주·빠르게 처리한다.

GC는 관리 메모리 회수를 담당하지만 Socket·File·Native Handle 같은 외부 자원의 적시 반환은 담당하지 않는다. 이는 `IDisposable`·`using`의 역할이다.

## 2. 왜 필요한가

수동 `delete`/`free`는 해제 누락, Double Free, Use-after-free 등 오류가 잦다. GC는 이를 방지하고 개발자가 비즈니스 로직에 집중하게 한다.

단, GC도 비용이 있다. Allocation이 많으면 Collection 빈도가 높아지고 Stop-the-world Pause가 Tick이나 응답 지연에 영향을 준다. "GC가 모든 메모리 문제를 해결한다"는 생각은 논리적 Leak, Pause, 외부 자원 미해제로 이어진다.

## 3. 핵심 동작 원리
```text
roots→mark reachable→collect/compact generation→promote survivors
```
Gen 0은 새 객체, 생존 객체는 상위 세대로 승격된다. 큰 객체는 별도 영역의 영향을 받을 수 있다. GC는 관리 메모리를 회수하지만 Socket 같은 자원의 적시 해제는 Dispose가 필요하다.

C# GC와 Generation에서는 값 복사, 객체 도달 가능성, Continuation 실행 위치와 자원 Scope를 구분해야 한다.

### 도달 가능성 기반 수집

.NET GC는 Reference Count가 아니라 Root에서 도달 가능한 객체를 추적한다. Root에는 실행 중 Thread Stack의 Reference, Static Field, Handle, JIT가 살아 있다고 판단한 Local 등이 포함된다.

```text
GC Roots
 ├─ Stack References
 ├─ Static Fields
 └─ Runtime Handles
        ↓ traverse
Reachable Object Graph → 생존
Unreachable Objects    → 회수 가능
```

객체끼리 Cycle을 만들어도 Root에서 도달할 수 없다면 수집된다. 반대로 논리적으로 필요 없는 객체라도 Static Dictionary·Event Handler에서 Reference가 이어지면 GC는 살아 있다고 판단한다. 이를 Managed Memory Retention 또는 논리적 Leak으로 볼 수 있다.

## 4. 세대 가설

대부분의 객체는 짧게 살고 일부는 오래 산다는 세대 가설을 이용한다.

- Gen 0: 새로 할당된 짧은 수명 객체
- Gen 1: Gen 0과 Gen 2 사이 Buffer 역할
- Gen 2: 여러 Collection을 생존한 장수 객체

Young Generation만 자주 수집하면 전체 Heap을 매번 조사하는 것보다 효율적이다. 수집에서 살아남은 객체는 상위 세대로 승격될 수 있다. 세대 번호를 객체의 정확한 나이나 소유권처럼 사용하지 않는다.

할당은 Managed Heap의 현재 Pointer를 이동하는 방식이라 빠른 경우가 많지만, Zero Initialization과 이후 GC 비용이 사라지는 것은 아니다.

## 5. Mark, Compact와 Pause

개념적으로 GC는 Root부터 살아 있는 객체를 표시하고 죽은 객체 공간을 회수한다. Compacting Collection에서는 생존 객체를 모아 Fragmentation을 줄이고 Reference를 갱신한다.

객체 이동 때문에 Native Code에 주소를 넘길 때 Pinning이 필요하다. Pin된 객체는 이동할 수 없어 주변 빈 공간과 Fragmentation을 만들 수 있다. Pinning Scope를 짧게 유지한다.

GC의 일부 단계는 Application Thread를 멈추는 Stop-the-world Pause를 포함할 수 있다. Server GC·Workstation GC, Background GC와 Runtime Version에 따라 동작이 다르므로 구체 수치를 단정하지 않고 실제 환경을 측정한다.

## 6. LOH와 POH

큰 객체는 Large Object Heap에 할당된다. 일반적으로 약 85,000 Byte 이상이 대표 기준이지만 객체 종류·Runtime에 따른 세부사항을 문서로 확인한다. 큰 배열을 반복 할당하면 Allocation Throughput, Gen 2 수집과 Fragmentation에 부담을 줄 수 있다.

Pinned Object Heap은 장기 Pinning 객체를 별도 영역에 배치하도록 돕는다. 별도 Heap이 있다는 사실이 Pinning 비용을 없애는 것은 아니다.

대형 Packet Buffer는 `ArrayPool<byte>`로 재사용할 수 있지만 반환 누락, 실제 데이터 길이와 배열 길이 혼동, 민감 데이터 잔존을 관리한다. Pool은 GC Pressure를 줄일 수 있지만 Peak Memory를 유지한다.

## 7. Finalizer와 Dispose

GC는 Managed Memory를 회수하지만 Socket, File Descriptor, Native Handle을 원하는 시점에 닫아 주는 수명 API가 아니다. `IDisposable`과 `using`으로 결정적으로 반환한다.

```csharp
using Socket socket = CreateSocket();
// Scope 종료 시 Dispose
```

Finalizer가 있는 객체는 수집 시 Finalization Queue를 거쳐 더 오래 살아남고 비용이 증가할 수 있다. Native Handle은 `SafeHandle`을 사용해 Critical Finalization과 소유권 구현을 재사용한다.

Dispose Pattern에서 명시적 정리 후 `GC.SuppressFinalize(this)`로 불필요한 Finalizer 실행을 막을 수 있다. Finalizer에서 다른 Managed 객체가 정상이라고 가정하거나 Blocking 작업을 하지 않는다.

## 8. GC가 Leak을 막지 못하는 경우

```csharp
static readonly Dictionary<int, Session> Sessions = new();
```

Disconnect된 Session을 Dictionary에서 제거하지 않으면 Root에서 계속 도달 가능해 수집되지 않는다. Event Publisher가 Subscriber Delegate를 보유하거나 Timer·Task·Closure가 객체를 Capture하는 경우도 같다.

WeakReference는 Cache·Observer의 특정 요구에 쓸 수 있지만 수집 시점이 비결정적이고 값이 언제든 사라질 수 있다. 명시적인 Remove·Dispose·TTL을 우선한다.

## 9. Allocation이 생기는 흔한 경로

- 매 Packet의 새 배열·문자열
- Boxing과 `params object[]`
- Capture Lambda의 Closure
- Iterator·LINQ·Async State Machine의 일부 경로
- 문자열 결합·Formatting
- Reflection·Serialization Metadata
- `Task`와 Exception 객체

최신 Runtime과 Compiler는 일부 Allocation을 제거하거나 Cache하므로 문법만 보고 단정하지 않는다. Allocation Profiler에서 Byte·Count·Call Stack을 확인한다.

## 10. Server GC와 Latency

Server GC는 Multi-core Server Throughput에 맞춰 여러 Heap과 GC Thread를 사용할 수 있다. Workstation GC는 Client·낮은 Latency 시나리오에 다른 Trade-off를 가진다. Container CPU 제한, Heap 수와 Memory Budget에 영향을 받을 수 있다.

Latency Mode나 No-GC Region 같은 기능은 강한 Memory Budget과 종료 처리가 필요하다. GC를 잠시 미루면 Allocation이 사라지는 것이 아니라 나중으로 이동하거나 Region 실패를 만들 수 있다. Profile과 운영 안전장치 없이 사용하지 않는다.

## 11. 게임 서버 실무

매 Tick 임시 `List`, LINQ 결과와 문자열 로그를 생성하면 Allocation Rate가 높아진다. Tick 시간이 GC Pause와 겹치는지 같은 Timeline으로 본다.

```text
Packet/sec 증가
  ↓ Temporary Allocation 증가
Gen 0 빈도 증가
  ↓ 일부 객체 승격
Gen 2·Pause와 p99 Tick 영향
```

Buffer는 Span으로 Slice하고 Pool을 측정 후 사용한다. Pool 객체는 반환 전 상태를 Reset하고 Ownership을 명확히 한다. Thread-local Cache·Pool은 Thread 수만큼 Peak Memory가 늘 수 있다.

Session·Cache처럼 장수 객체가 단수명 객체를 참조하면 후자가 함께 승격될 수 있다. 장수 Collection에 임시 객체를 넣었다 즉시 빼는 Pattern도 생존 시점에 따라 승격을 만들 수 있다.

## 12. 측정과 진단

- Allocation Rate와 할당 Call Stack
- Gen 0·1·2 Collection Count
- Pause Duration·Pause Percentage
- Promoted Byte와 Heap Size
- LOH Size·Fragmentation
- Pinned Object 수·시간
- Finalization Queue 길이
- Process Working Set과 Native Memory

Memory Dump의 Dominator·Retention Path로 어떤 Root가 객체를 붙잡는지 찾는다. Managed Heap이 작지만 RSS가 크면 Native Library, Thread Stack, JIT Code, Memory Mapping과 Pool을 조사한다.

`GC.Collect()`를 임의 호출해 문제를 숨기지 않는다. Full Collection은 비싸고 객체 수명 Pattern을 왜곡할 수 있다. 매우 제한된 Phase 전환 등 근거가 있는 경우에도 측정한다.

GC 지표는 Traffic과 함께 해석한다. Collection Count만 증가해도 Pause가 짧고 SLA를 만족하면 문제가 아닐 수 있고, 횟수는 적어도 Gen 2 한 번이 긴 Tick Spike를 만들 수 있다. Allocation을 무조건 0으로 만드는 것보다 허용 Budget과 Tail Latency를 기준으로 개선한다.

## 13. 쉬운 예시: Tick Spike와 GC

서버 Tick이 33ms(30fps) 기준인데 어떤 프레임에서만 60ms가 걸린다면 GC Gen 2 Collection이 원인일 수 있다.

```text
정상 Tick: 5ms 로직 처리
GC Spike  : 5ms 로직 + 50ms Gen 2 Pause → p99 급등
```

Profiler 타임라인에서 GC 이벤트와 Tick 시간이 겹치는지 확인한다. 원인이 높은 Allocation Rate로 Gen 0에서 살아남은 객체가 Gen 2까지 승격된 것이라면, Tick마다 새로 만들던 임시 Buffer를 Pool로 교체하거나 `Span<byte>`로 Stack 기반 처리를 고려한다.

## 14. 비슷한 개념 비교

| 관점 | .NET GC | Finalizer | `IDisposable`·`using` |
|---|---|---|---|
| 역할 | Managed Memory 회수 | 안전망 정리 | 결정적 자원 반환 |
| 시점 | 비결정적 | 더 비결정적 | 명시적 Scope 종료 |
| 대상 | 관리 객체 | 비관리 Handle | Socket·File·Lock 등 |
| 비용 | Collection Pause | Finalization Queue 지연 | 없음 (정상 경로) |
| 권장 | 자동으로 동작 | `SafeHandle`로 위임 | 외부 자원 반드시 사용 |

## 15. 장점과 단점

### GC의 장점

- 수동 해제 오류(Double Free, Use-after-free)를 방지한다.
- 짧은 수명 객체를 Gen 0에서 빠르게 처리해 Allocation Throughput이 높다.
- Compaction으로 Heap Fragmentation을 줄인다.

### GC의 단점

- Stop-the-world Pause가 Tick과 겹치면 p99 지연 Spike가 발생한다.
- 외부 자원은 GC가 회수하지 않아 별도 Dispose가 필요하다.
- Logical Leak(도달 가능하지만 논리적으로 불필요)은 GC가 탐지하지 못한다.
- LOH 큰 객체 반복 할당은 Gen 2 수집 빈도를 높인다.

## 16. 게임 서버·백엔드 실무 예시

### 매 Tick 임시 Allocation

```csharp
// 매 Tick List 새 생성 → Gen 0 빈도 증가
void Tick()
{
    var nearby = new List<Entity>();
    // ... 근처 Entity 수집
}

// 개선: Thread-local List 재사용 또는 Span<Entity>
[ThreadStatic]
private static List<Entity>? _nearbyBuffer;

void Tick()
{
    var nearby = _nearbyBuffer ??= new List<Entity>();
    nearby.Clear();
    // ...
}
```

### Static Dictionary Leak

```csharp
// Disconnect해도 Remove를 빠뜨리면 Session이 회수되지 않음
static readonly Dictionary<int, Session> _sessions = new();

void OnDisconnect(int id)
{
    _sessions.Remove(id); // 반드시 명시적 제거
}
```

### Packet Buffer Pool

대형 Packet Buffer를 `ArrayPool<byte>`로 대여하고 처리 후 반환한다.

```csharp
var buffer = ArrayPool<byte>.Shared.Rent(4096);
try { Process(buffer); }
finally { ArrayPool<byte>.Shared.Return(buffer); }
```

반환 누락, 실제 길이와 배열 길이 혼동, 민감 데이터 잔존에 주의한다.

## 17. 자주 하는 오해

- **GC가 모든 외부 자원을 즉시 정리한다**: GC는 관리 메모리만 회수한다. Socket·File·Lock은 `using`과 `IDisposable`로 명시적으로 닫아야 한다.
- **도달 불가 객체는 즉시 수집된다**: GC는 필요할 때(Allocation이 임계를 넘거나 명시적 요청)에 수집한다. 비결정적 시점이다.
- **Reference Count로 수집한다**: .NET GC는 Reference Count가 아니라 도달 가능성 탐색이다. Cycle을 만들어도 Root에서 도달할 수 없으면 수집된다.
- **GC Collect()를 호출하면 성능이 좋아진다**: Full Collection은 비싸고 객체 수명 패턴을 왜곡할 수 있다. 임의 호출로 문제를 숨기지 않는다.
- **Allocation을 0으로 만들어야 한다**: 목적은 허용 Pause Budget과 Tail Latency다. Gen 0 수집 횟수가 많아도 Pause가 짧으면 문제가 아닐 수 있다.
- **Pool을 사용하면 항상 빨라진다**: Pool은 Allocation을 줄이지만 Peak Memory 유지, 반환 누락, 상태 Reset 비용이 있다. 측정 후 적용한다.
- **Static Dictionary에 넣은 객체는 문제없다**: Static Dictionary는 Root이므로 논리적으로 불필요해도 GC가 수집하지 않는다. 명시적 Remove가 필요하다.

## 18. 면접 질문

### Q1. .NET GC의 동작 원리를 설명해 주세요.

GC는 Stack Reference, Static Field, Runtime Handle 등 Root부터 도달 가능한 객체를 Mark하고, 도달할 수 없는 객체의 메모리를 회수합니다. Compacting 수집에서는 생존 객체를 모아 Fragmentation을 줄입니다.

### Q2. 세대 분리(Generation)는 왜 유용한가요?

대부분의 객체가 짧게 살고 일부만 오래 사는 세대 가설에 기반합니다. Gen 0만 자주 수집하면 전체 Heap을 매번 조사하는 것보다 효율적입니다. 살아남은 객체는 상위 세대로 승격되어 덜 자주 수집됩니다.

### Q3. GC와 `IDisposable`의 차이는 무엇인가요?

GC는 관리 메모리를 비결정적 시점에 회수합니다. `IDisposable`·`using`은 Socket·File·Lock 같은 외부 자원을 Scope 종료 시 결정적으로 반환합니다. 두 메커니즘은 역할이 다르며 외부 자원은 항상 `using`을 써야 합니다.

### Q4. Managed Memory Leak이 발생하는 경우는 언제인가요?

Static Dictionary에서 항목을 Remove하지 않거나, Event에 Subscriber를 Unsubscribe하지 않거나, Timer·Task·Closure가 객체를 Capture한 채 오래 살면 Root에서 도달 가능한 상태가 유지되어 GC가 수집하지 않습니다.

### Q5. 게임 서버 Tick에서 GC Spike를 어떻게 진단하나요?

Profiler 타임라인에서 GC 이벤트와 Tick 처리 시간을 같은 축에 놓고 겹치는 지점을 찾습니다. Allocation Rate·Promoted Bytes·Gen Collection Count를 Traffic과 함께 봅니다. Gen 0 수집이 잦아 Gen 2 승격이 누적된 게 원인이면 Hot Path Allocation을 줄이거나 Pool을 도입합니다.

### Q6. Finalizer의 문제점은 무엇인가요?

Finalizer가 있는 객체는 수집 시 Finalization Queue를 거쳐 더 오래 살아 비용이 늘어납니다. 시점이 비결정적이고 다른 Managed 객체 상태가 보장되지 않습니다. Native Handle은 `SafeHandle`로 Finalizer를 Runtime에 위임하고, 명시적 정리 후 `GC.SuppressFinalize(this)`로 Finalizer를 건너뜁니다.

## 19. 예상 꼬리질문

- Reference Count GC와 추적 기반 GC의 차이는 무엇인가요?
- LOH에 할당되는 기준은 무엇이고 어떤 문제가 생기나요?
- Server GC와 Workstation GC의 Trade-off는 무엇인가요?
- `GC.Collect()`를 호출해도 되는 상황은 언제인가요?
- `ArrayPool<byte>` 반환 누락이 미치는 영향은 무엇인가요?
- WeakReference는 어떤 용도로 쓰이나요?
- `No-GC Region`을 사용할 때 주의할 점은 무엇인가요?

## 20. 30초 모범답변

> .NET GC는 Root에서 도달 가능한 객체를 Mark하고 도달 불가 객체의 메모리를 회수합니다. 세대 분리로 짧은 수명 객체를 자주 효율적으로 처리합니다. 비관리 자원은 GC가 담당하지 않으므로 `using`·`IDisposable`로 결정적으로 반환해야 합니다. Static Collection에서 Remove를 빠뜨리면 GC가 수집하지 못하는 논리적 Leak이 됩니다.

## 21. 1~2분 확장답변

> .NET GC는 Reference Count가 아닌 도달 가능성 탐색으로 관리 메모리를 회수합니다. Cycle이 있어도 Root에서 도달 불가하면 수집됩니다. Gen 0은 새 짧은 수명 객체, 살아남으면 Gen 2까지 승격되어 덜 자주 수집됩니다.
>
> GC는 관리 메모리만 담당하므로 Socket·File·Lock은 `using`·`IDisposable`로 명시적으로 닫아야 합니다. Static Dictionary에 항목을 제거하지 않으면 도달 가능 상태가 유지되어 GC가 수집하지 못하는 논리적 Leak이 됩니다.
>
> 게임 서버에서 매 Tick 임시 List나 Buffer를 새로 할당하면 Allocation Rate가 높아지고 Gen 2까지 승격된 객체가 Full Collection Pause를 만들어 Tick Spike가 생깁니다. Profiler로 GC 이벤트와 Tick 타임라인을 겹쳐 보고 Hot Path Allocation을 줄이거나 `ArrayPool<byte>`를 사용합니다. `GC.Collect()`를 임의 호출하면 문제를 숨기고 수명 패턴을 왜곡하므로 근거 없이 쓰지 않습니다.

## 22. 핵심 요약

- .NET GC는 도달 가능성 탐색으로 관리 메모리를 회수하며 Cycle도 Root에서 도달 불가하면 수집된다.
- Gen 0·1·2 세대 분리로 짧은 수명 객체를 자주 효율적으로 처리한다.
- GC는 관리 메모리만 담당하며 Socket·File은 `using`·`IDisposable`로 결정적 반환이 필요하다.
- Static Collection·Event 미제거, Timer·Closure Capture는 논리적 Leak이다.
- LOH 큰 객체 반복 할당은 Gen 2 수집 빈도와 Fragmentation을 높인다.
- Finalizer 있는 객체는 Finalization Queue로 더 오래 살아 비용이 증가한다.
- `GC.Collect()` 임의 호출은 문제를 숨기고 수명 패턴을 왜곡할 수 있다.
- 측정 기준: Allocation Rate·Promoted Bytes·Gen Count·Pause Duration·p99를 Traffic과 함께 본다.

## 한 줄 정리

> .NET GC는 도달 가능성으로 관리 메모리를 회수하고 세대 분리로 효율을 높이지만, 외부 자원·논리적 Leak·GC Pause는 개발자가 직접 관리해야 한다.
