---
difficulty: 3
reading_time: 20분
interview_frequency: 5
importance: 5
---

# 08. C# GC와 Generation


## 학습 목표

- 게임 서버 Tick p99가 특정 Tick에서만 급등하는 Spike에서 GC(Garbage Collection) Gen 0·Gen 2 Collection·LOH(Large Object Heap) Allocation 중 어느 것이 원인인지 Profiler 지표(Allocation Rate·Promoted Bytes·Pause Duration)로 구분하고, 조치 우선순위를 판단할 수 있다.
- Static Dictionary·Event Handler·Timer Closure에서 Root 도달 가능성이 유지되어 논리적 Leak이 발생하는 패턴을 코드 수준에서 진단하고, 명시적 Remove·Unsubscribe·TTL·WeakReference 중 적합한 해결을 선택할 수 있다.
- Socket·File·Handle처럼 비관리 자원을 보유하는 객체에서 Finalizer·`IDisposable`·`SafeHandle` 중 목적에 맞는 조합을 판단하고, `GC.SuppressFinalize` 누락이나 반환 누락이 발생하는 조건을 진단할 수 있다.
- 매 Tick 임시 Allocation이 Gen 0 빈도를 높이고 장수 객체 참조가 단수명 객체를 함께 승격시키는 패턴을 진단하고, `ArrayPool<byte>`·`Span<T>`·ThreadStatic Cache 중 Tick Budget과 Peak Memory 기준에 맞는 방식을 결정할 수 있다.

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

큰 객체는 LOH(Large Object Heap)에 할당된다. 일반적으로 약 85,000 Byte 이상이 대표 기준이지만 객체 종류·Runtime에 따른 세부사항을 문서로 확인한다. 큰 배열을 반복 할당하면 Allocation Throughput, Gen 2 수집과 Fragmentation에 부담을 줄 수 있다.

POH(Pinned Object Heap)는 장기 Pinning 객체를 별도 영역에 배치하도록 돕는다. 별도 Heap이 있다는 사실이 Pinning 비용을 없애는 것은 아니다.

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

```csharp
// 매 Tick 임시 List 생성 → Gen 0 빈도 증가 → 일부 Gen 2 승격 → Spike
void Tick_Before()
{
    var nearby = new List<Entity>(); // 매 Tick new
    FindNearbyEntities(nearby);
    ProcessEntities(nearby);
} // GC 대상

// 개선: ThreadStatic으로 재사용 → Allocation 0
[ThreadStatic]
private static List<Entity>? _nearbyBuffer;

void Tick_After()
{
    var nearby = _nearbyBuffer ??= new List<Entity>();
    nearby.Clear();
    FindNearbyEntities(nearby);
    ProcessEntities(nearby);
}
```

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

### Q1. 서버 Tick p99가 평소 5ms에서 특정 Tick에서만 55ms로 급등하는 Spike가 주기적으로 발생합니다. GC Gen 2 Full Collection이 원인임을 확인하는 절차와 네트워크 지연·락 경합 같은 다른 원인과 구분하는 지표를 설명하십시오.

**30초 답변:** Profiler 타임라인에서 GC 이벤트와 Tick 처리 시간을 같은 축에 놓고 겹치는 지점을 찾습니다. Gen 2 Collection Pause Duration이 Spike 구간에서 수십ms인지 확인합니다. 락 경합이라면 Thread Contention 지표가, 네트워크라면 Queue Depth가 함께 오릅니다. GC Pause는 ETW(Event Tracing for Windows)/PerfView로 GC 이벤트 타임스탬프를 Tick 로그와 대조하면 분리됩니다.

**1~2분 답변:** 먼저 dotnet-counters로 실시간으로 Gen 0·1·2 Collection Count, Allocation Rate, Pause Duration을 확인합니다. Spike가 GC와 겹치면 PerfView GC 탐색 뷰에서 Gen 2 Pause Duration이 해당 구간에 몇ms인지 확인합니다. Gen 2 Pause가 40~50ms라면 Allocation Rate가 지나치게 높아 Gen 0 객체가 Gen 1→Gen 2까지 승격된 누적이 원인일 가능성이 큽니다. 락 경합은 Thread Wait 시간, 네트워크는 Send/Recv Queue Depth와 Spike 타이밍이 겹치는지 비교합니다. 세 가지가 동시에 Spike와 겹치면 GC Pause가 Worker Thread를 멈춰 Packet 처리가 밀린 복합 증상일 수 있습니다. 근본 원인은 Hot Path Allocation을 Profiler의 Allocation Call Stack으로 찾아 Pool·Span으로 교체합니다.

### Q2. MMORPG 서버에서 매 Tick `new List<Entity>()`를 생성해 근처 Entity를 담는 코드의 Gen 0 Collection 빈도가 초당 150회를 초과했습니다. ThreadStatic List 재사용, `ObjectPool<List<T>>`, `Span<Entity>` 중 어느 방식을 선택하고, 방식별 Peak Memory와 Thread 안전성 Trade-off를 어떻게 판단합니까?

**30초 답변:** ThreadStatic List는 Thread마다 인스턴스를 하나 유지해 Allocation을 없애고 Thread 간 경합도 없습니다. Thread 수가 32개라면 Peak Memory는 고정 32개 List입니다. Span은 크기가 고정인 Stack 배열에만 가능합니다. ObjectPool은 Thread 공유 비용이 있습니다. Tick 루프처럼 Thread가 고정되고 크기 상한이 있다면 ThreadStatic이 가장 단순합니다.

**1~2분 답변:** 선택 기준은 Thread 모델과 최대 크기입니다. Tick 루프가 Thread마다 독립적이라면 ThreadStatic List를 Clear()해 재사용하면 Allocation이 0입니다. Thread 수 × 최대 크기만큼 Peak Memory가 유지되지만 Lock·반환 누락 위험이 없습니다. ObjectPool은 Rent/Return 비용과 Thread-safe Queue Overhead가 있어 Tick처럼 호출 빈도가 높으면 오히려 느릴 수 있습니다. Span<Entity>는 stackalloc 가능한 소규모 고정 크기 배열에만 안전합니다. 실제 수치를 BenchmarkDotNet으로 측정하고, Gen 0 Collection 빈도가 개선 후 10분의 1 이하로 줄고 p99가 Tick Budget 안에 들어오면 채택합니다.

### Q3. Static Dictionary `_sessions`에서 Disconnect 시 Remove를 빠뜨려 Session 객체가 60만 건 누적된 논리적 Leak이 발생했습니다. Memory Dump에서 어떤 Retention Path로 원인을 확인하고, 명시적 Remove 외에 재발을 방지하는 설계 변경은 무엇입니까?

**30초 답변:** dotnet-dump로 Heap을 덤프하고 dumpheap -type Session으로 인스턴스 수를 확인합니다. gcroot <address>로 특정 Session이 어떤 Root에서 붙잡히는지 Retention Path를 추적하면 Static Dictionary Field가 나타납니다. 재발 방지는 Session 생명주기를 단일 책임 클래스로 묶어 Disconnect 핸들러에서 Remove를 강제하거나, ConcurrentDictionary에 TTL 검사를 추가하는 방법이 있습니다.

**1~2분 답변:** Memory Dump 분석은 dotnet-dump analyze에서 dumpheap -stat으로 Session 인스턴스가 수십만 개인지 확인하고, 대표 주소 하나를 dumpobj로 상태 확인 후 gcroot로 Retention Path를 추적합니다. _sessions Static Field → Dictionary 내부 Bucket → Session 참조 경로가 나오면 원인이 확정됩니다. 운영 중에는 dotnet-counters의 GC Heap Size 추이가 천천히 우상향하는 패턴으로 조기 포착할 수 있습니다. 재발 방지로는 Session Manager 클래스가 Connect·Disconnect를 쌍으로 캡슐화해 Remove를 빠뜨릴 수 없게 하고, Integration Test에서 Disconnect 후 Dictionary Count가 0인지 검증하는 케이스를 추가합니다. TTL 기반 만료 스캔을 주기적으로 실행하는 방어 레이어도 고려합니다.

### Q4. `NetworkConnection` 클래스가 내부에 Socket을 래핑하고 있는데 `Dispose`를 호출하지 않은 채 Reference를 잃은 경우, Socket은 언제 닫힙니까? Finalizer와 `IDisposable` 중 어느 것을 선택해야 하고, `GC.SuppressFinalize`를 호출하지 않으면 어떤 비용이 발생합니까?

**30초 답변:** `Dispose`를 호출하지 않으면 GC가 수집할 때 Finalizer가 실행되어 Socket이 닫히지만 시점이 비결정적입니다. 외부 자원은 `IDisposable`로 결정적으로 닫고 Finalizer는 안전망으로만 둡니다. Dispose에서 `GC.SuppressFinalize(this)`를 호출하지 않으면 이미 정리된 객체가 Finalization Queue를 다시 통과해 불필요한 비용이 생깁니다.

**1~2분 답변:** `Dispose`를 호출하지 않으면 GC가 해당 객체를 수집할 때 Finalizer Thread가 Socket.Close를 실행합니다. 그러나 GC 수집 시점이 비결정적이므로 수십초 혹은 수분이 지나야 Socket이 닫힐 수 있고 그 사이 Connection 고갈이 발생할 수 있습니다. `IDisposable`+`using`으로 Scope 종료 시 즉시 닫는 것이 정석입니다. Finalizer는 `using` 없이 Reference를 잃은 예외 경로의 안전망으로만 두고, 명시적 `Dispose`에서 `GC.SuppressFinalize(this)`를 호출해 이미 정리된 객체가 Finalization Queue를 거치지 않도록 합니다. `GC.SuppressFinalize` 누락 시 Finalization Queue가 쌓여 GC Pause 증가와 객체 수명 연장이 발생합니다. Native Handle처럼 Finalizer 순서 보장이 중요한 경우는 `SafeHandle`을 사용하면 Runtime이 Critical Finalization을 관리합니다.

### Q5. 서버 Process RSS가 주 단위로 지속 증가하는데 dotnet-dump로 확인한 Managed Heap Size는 안정적입니다. 어떤 원인을 먼저 의심하고, 원인별 확인 도구와 지표를 설명하십시오.

**30초 답변:** Managed Heap이 안정적이면 Native Memory가 증가하고 있다는 뜻입니다. Native Library 할당 누락, Thread Stack 증가, JIT Code 캐시, ArrayPool·NativeMemory 반환 누락, Memory Mapping 파일을 의심합니다. Linux에서는 /proc/PID/smaps로 영역별 RSS 분포를, dotnet-trace의 NativeMemory 이벤트로 할당 경로를 확인합니다.

**1~2분 답변:** Managed Heap이 안정적이면 범위를 Native Memory로 좁힙니다. 첫째, ArrayPool을 Rent하고 Return하지 않은 누수입니다. dotnet-counters의 `.NET Threadpool Queue`와 Process Working Set 추이를 보고, NativeMemory 또는 MemoryPool Allocation 이벤트를 dotnet-trace로 수집합니다. 둘째, Thread 수 증가입니다. 각 Thread Stack이 기본 1MB이므로 Thread가 수백 개 생성되면 RSS가 수백MB 증가합니다. dotnet-counters Thread Count와 PerfView Thread Stack으로 확인합니다. 셋째, Native Library의 내부 버퍼 누수입니다. Heap Profiler로 P/Invoke 경계를 추적하거나 valgrind/AddressSanitizer로 Native 쪽을 분석합니다. 넷째, JIT Code 캐시가 계속 증가하는 Dynamic Code 생성 패턴입니다. Process.GetCurrentProcess().VirtualMemorySize64와 GC.GetGCMemoryInfo() 비교로 Managed·Native 차이를 정량화합니다.

### Q6. 대형 Packet Buffer 처리를 `new byte[65536]` 반복 할당에서 `ArrayPool<byte>.Shared`로 교체한 후 Gen 2 Collection이 줄었는데 Process Peak Memory가 2배로 증가했습니다. 원인과 Pool Size 설정이 Peak Memory에 미치는 영향을 판단하는 방법을 설명하십시오.

**30초 답변:** `ArrayPool<byte>.Shared`는 반환된 배열을 Pool에 유지하므로 GC가 회수하지 않아 Peak Memory가 높아질 수 있습니다. 각 Thread의 TLS 버킷과 Shared Pool의 최대 보관 수가 Peak를 결정합니다. 실제 동시 대여 수가 적다면 Pool 상한을 낮추거나 `ArrayPool<byte>.Create(maxArrayLength, maxArraysPerBucket)` 커스텀 Pool을 사용해 보관 수를 조절합니다.

**1~2분 답변:** `ArrayPool<byte>.Shared`의 Peak Memory는 반환은 됐지만 GC 회수 없이 Pool에 유지되는 배열 수에 비례합니다. DefaultArrayPool의 Thread-local 버킷은 Thread마다 최대 2개 배열을 유지하고, 공유 Heap도 크기 별로 여러 버킷을 보관합니다. 32 Worker Thread × 2개 × 65536B = 4MB가 TLS에 상시 유지되는 것처럼, Burst 시 반환된 배열이 Pool에 쌓이면 Peak가 급증합니다. 원인 진단은 dotnet-counters의 `GC Heap Size` 안정 + Process Working Set 증가 차이를 보고, dotnet-dump에서 `byte[]`의 총 Retained Bytes를 확인합니다. Peak를 줄이는 방법은 1) ArrayPool.Create에서 maxArraysPerBucket을 줄여 Pool 상한을 제한하거나, 2) 동시 처리 수 상한으로 Rent 수를 제한하거나, 3) 사이즈가 작아도 되는 경우 더 작은 크기로 요청해 큰 배열 낭비를 줄이는 것입니다. GC Pressure 감소 효과와 Peak Memory 증가를 실측 수치로 비교해 Tick Budget 기준으로 채택 여부를 결정합니다.

## 19. 예상 꼬리질문

- Gen 0 Collection이 초당 200회를 넘는 서버에서 각 Pause가 0.3ms 이하일 때 즉시 조치가 필요합니까? Gen 0 빈도가 Gen 2 승격을 유발하는 조건과 Promoted Bytes·Gen 2 Count로 확인하는 방법을 설명하십시오.
- Event Handler 미해제로 Subscriber가 Leak되는 패턴에서 Memory Dump의 어떤 Root Path로 보유 객체를 확인합니까? `WeakReference<T>`로 교체할 때 수집 시점 비결정성이 문제가 되는 시나리오와 처리 방법을 설명하십시오.
- LOH에 85KB 이상 Packet Buffer를 반복 할당하는 코드를 `ArrayPool<byte>`로 교체할 때 try/finally로 반환 누락을 방지하는 패턴과 민감 데이터 잔존 위험을 처리하는 방법을 설명하십시오.
- Server GC와 Workstation GC 중 32코어 게임 서버에서 어느 것을 선택하고, Container에 CPU Limit을 설정했을 때 GC Heap 수와 Memory 예산이 어떻게 달라지는지 확인하는 방법을 설명하십시오.
- Finalizer에서 다른 Managed 객체를 참조하면 어떤 문제가 생깁니까? `SafeHandle`이 Critical Finalization과 Ownership으로 이 문제를 해결하는 원리를 Finalizer 순서 보장 측면에서 설명하십시오.
- `GC.TryStartNoGCRegion`으로 Combat Critical Section 동안 GC를 차단하려는데 Memory Budget 부족으로 Region 진입에 실패했습니다. 실패 Fallback 처리와 Budget을 결정하는 기준을 설명하십시오.
- 장수 `Player` 객체가 매 Tick 생성되는 임시 `DamageEvent`를 Field에 저장하는 설계에서 `DamageEvent`가 Gen 2로 승격되는 메커니즘과 승격을 방지하는 설계 변경 방법을 설명하십시오.

## 20. 30초 모범답변

> .NET GC는 Root 도달 가능성 기반으로 관리 메모리를 회수하고 Gen 0~2 세대 분리로 짧은 수명 객체를 효율적으로 처리합니다. 비관리 자원은 `using`·`IDisposable`로 즉시 반환해야 하며 GC에 의존하면 Socket 고갈이 발생합니다. 게임 서버에서 매 Tick 임시 List 생성이 누적되면 Gen 2 Full Collection Pause가 40~50ms를 만들어 p99 Spike로 나타납니다. dotnet-counters로 Allocation Rate·Promoted Bytes·Pause Duration을 확인하고 Hot Path를 ThreadStatic 재사용·ArrayPool로 교체합니다.

## 21. 1~2분 확장답변

> .NET GC는 Reference Count가 아닌 도달 가능성 탐색으로 관리 메모리를 회수합니다. Cycle이 있어도 Root에서 도달 불가하면 수집됩니다. Gen 0은 새 짧은 수명 객체, Gen 2는 여러 Collection을 생존한 장수 객체이며 Gen 2 Full Collection은 수십ms Pause를 만들어 게임 서버 Tick Spike의 주원인이 됩니다.
>
> GC는 관리 메모리만 담당하므로 Socket·File·Lock은 `using`·`IDisposable`로 명시적으로 닫아야 합니다. Finalizer는 비결정적이고 Finalization Queue 지연이 추가되므로 안전망으로만 둡니다. Static Dictionary에서 Disconnect 후 Remove를 빠뜨리면 Root에서 계속 도달 가능해 논리적 Leak이 됩니다. dotnet-dump의 gcroot 명령으로 어떤 경로가 Session을 붙잡는지 확인합니다.
>
> 게임 서버에서 매 Tick 임시 List·Buffer를 new로 할당하면 Allocation Rate가 높아지고 Gen 0 빈도가 초당 100회를 넘으면 일부가 Gen 2까지 승격되어 Full Collection Pause를 유발합니다. PerfView GC 뷰로 Pause가 Tick과 겹치는 구간을 찾고, Hot Path는 ThreadStatic 재사용·`ArrayPool<byte>`·`Span<T>`로 교체합니다. ArrayPool 도입 후 Peak Memory가 늘었다면 maxArraysPerBucket을 제한하거나 Custom Pool을 사용합니다. `GC.Collect()`를 임의 호출하면 문제를 숨기고 수명 패턴을 왜곡하므로 근거 없이 쓰지 않습니다.

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
