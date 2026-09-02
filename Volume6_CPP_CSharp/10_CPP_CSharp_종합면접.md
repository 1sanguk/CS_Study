---
difficulty: 3
reading_time: 20분
interview_frequency: 5
importance: 5
---

# 10. C++·C# 종합면접


## 학습 목표

- C++ 서버에서 RSS(Resident Set Size)가 지속 증가할 때 Heap Profiler와 Sanitizer가 탐지하지 못하는 Dangling·Use-after-free 패턴과 탐지 가능한 패턴을 구분하고, 어떤 도구 조합(AddressSanitizer·LeakSanitizer·Heap Profiler)과 코드 경로 검토 순서를 선택할지 판단할 수 있다.
- C# 서버에서 세션 종료 후 RSS가 줄지 않을 때 GC(Garbage Collection) Retention(Static·Event·Closure)과 Native 자원 미해제 중 어느 쪽인지 Memory Dump의 Root Path·Allocation Rate·Finalizer Queue 지표로 구분하고, 적합한 해제 패턴(명시적 Unsubscribe·WeakReference·IDisposable)을 결정할 수 있다.
- 비동기 경계에서 C++의 Buffer Move RAII(Resource Acquisition Is Initialization)와 C#의 ArrayPool try/finally 패턴 중 Task 취소·예외 발생 시 자원이 누출되는 조건을 코드 경로 수준에서 진단하고, 수명 보장 설계(IMemoryOwner<byte>·Span 경계 제한·RAII Move Scope)를 결정할 수 있다.
- 게임 서버 Tick p99 Spike가 이벤트 패치 후 발생했을 때, C++ 서버(dynamic_cast 추가·new 빈번)와 C# 서버(LINQ 체인·Gen 0 빈도 증가) 각각에서 어떤 진단 지표(VTune Cache Miss·dotnet-counters Allocation Rate·GC Pause)로 병목을 확인하고 조치 우선순위를 판단할 수 있다.

## 1. 개요
언어 면접의 핵심은 C++의 명시적 수명·소유권과 C#의 관리 메모리·비동기 실행 모델을 비용까지 연결해 설명하는 것이다.

## 2. 왜 필요한가
게임 서버는 메모리 안전성, 할당 지연, 객체 수명, 동시 I/O를 언어 Runtime 특성에 맞게 설계해야 한다. 관리 Runtime도 할당, 스케줄링과 외부 자원 비용을 없애지는 않는다.

## 3. 핵심 동작 원리
```text
input→buffer ownership→parse objects→work scheduling→state update→dispose/destruct
```
C++은 RAII와 Move로 결정적 자원 수명을 표현하고 C#은 GC로 관리 메모리를 회수한다. 두 언어 모두 Socket과 Lock 같은 자원 Scope와 동시성은 개발자가 설계한다.

C++·C# 종합면접에서는 값 복사, 객체 도달 가능성, Continuation 실행 위치와 자원 Scope를 구분해야 한다.

### 언어 기능을 설명하는 Frame

언어 면접 답변은 다음 순서로 구성한다.

```text
1. 값·객체의 의미
2. 소유권과 수명
3. Copy·Allocation·Dispatch 비용
4. 예외·비동기·동시성 경계
5. 게임 서버 사례와 측정 지표
```

“C++은 빠르고 C#은 느리다” 같은 결론보다 어떤 비용을 누가 관리하고 어떤 Runtime 지원을 받는지 설명해야 한다.

## 4. C++ 객체 수명과 소유권

C++ Pointer는 주소, Reference는 별칭이다. 둘 다 소유권을 자동 표현하지 않으며 대상보다 오래 남으면 Dangling이다. Raw Pointer를 장기 Owner로 사용하면 Leak·Double Free·Use-after-free 위험이 있다.

RAII는 Resource를 객체 Scope에 묶어 모든 Return·Exception 경로에서 Destructor가 정리하게 한다.

| 관계 | C++ 표현 |
|---|---|
| 값 소유 | 값 Member·Container |
| 단독 동적 소유 | `unique_ptr<T>` |
| 공동 수명 | `shared_ptr<T>` |
| 공유 객체 관찰 | `weak_ptr<T>` |
| 짧은 비소유 | `T&`, `T*` |

`shared_ptr`는 모든 수명 문제의 기본 해법이 아니다. Atomic Count, Control Block, Cycle과 숨은 수명 연장이 있다. 단독 소유와 값 의미를 우선한다.

## 5. Copy·Move와 다형성

Copy는 독립 값, Move는 곧 파괴될 객체의 Resource 이전을 표현한다. `std::move`는 이동을 실행하지 않고 Rvalue Cast를 제공한다. Moved-from 객체는 유효하지만 상태가 지정되지 않을 수 있다.

Rule of Zero를 따라 `vector`, `string`, Smart Pointer Member로 구성하면 Special Member Function을 직접 작성하지 않는다. Vector 재할당이 Move를 활용하려면 실제로 던지지 않는 Move에 `noexcept`가 중요할 수 있다.

Virtual Function은 Base Pointer·Reference 호출을 Runtime Type의 Override로 Dispatch한다. 다형 삭제에는 Virtual Destructor가 필요하고 값 Copy는 Slicing을 만든다. 비용은 간접 호출만 아니라 Heap 객체 배치와 Cache Locality까지 측정한다.

## 6. C# 값·참조와 Boxing

C# Struct는 값 Copy 의미, Class는 객체 Identity와 Reference Copy 의미를 가진다. 저장 위치를 단순 Stack·Heap으로 구분하지 않는다.

Value Type을 object·Interface로 변환하면 Boxing Allocation과 Copy가 생길 수 있다. Unboxing은 정확한 원래 Type이 필요하다. Generic Collection과 Typed API로 고빈도 Boxing을 줄인다.

작고 불변이며 값 하나를 표현하면 Struct가 자연스럽다. 큰 Mutable Struct는 Copy와 수정 대상 혼동이 있고, 내부 Reference Field는 Copy 후에도 공유될 수 있다. Session처럼 Identity·공유 수명이 중요하면 Class를 사용한다.

## 7. C# GC와 Resource

GC는 Root에서 도달할 수 없는 Managed 객체 Memory를 회수한다. Gen 0·1·2로 짧은 수명 객체를 자주 수집하고 생존 객체를 승격한다. GC가 있다고 Allocation 비용이 없어지는 것은 아니다.

Socket·File·Native Handle은 `IDisposable`, `using`, `SafeHandle`로 적시에 반환한다. Finalizer는 비결정적이고 객체 수명을 늘릴 수 있어 Fallback이다.

Static Collection, Event Handler, Timer·Task Closure가 Reference를 유지하면 논리적으로 불필요한 객체도 수집되지 않는다. Memory Dump의 Retention Path와 Allocation Profile을 사용한다.

## 8. 결정적 파괴와 GC 비교

| 관점 | C++ RAII | C# GC·Dispose |
|---|---|---|
| 객체 Memory | Scope·Owner 종료에 결정적 | 도달 불가 후 GC가 비결정 회수 |
| 외부 Resource | Destructor Wrapper | Dispose·using·SafeHandle |
| 주요 위험 | UAF·Double Free·Dangling | Allocation·Pause·Retention |
| 수명 표현 | 값·Smart Pointer Type | Reference Graph·Dispose Scope |

C#에서도 Dispose는 RAII와 비슷한 Scope Pattern을 제공하고, C++에서도 `shared_ptr`처럼 마지막 Owner 시점이 동적으로 결정될 수 있다. 언어를 이분법으로 단순화하지 않는다.

## 9. 비동기 실행 모델

Task는 Thread가 아니라 완료·결과·예외·취소를 표현한다. `async/await`는 미완료 I/O를 기다리는 동안 Thread를 반환하고 Completion 후 Continuation을 실행할 수 있다.

CPU-bound 작업은 await로 싸게 되지 않는다. Task.Run은 ThreadPool Queue로 옮길 뿐 CPU를 줄이지 않는다. Blocking `.Result`, 동기 I/O와 긴 Lock은 ThreadPool Starvation을 만들 수 있다.

CancellationToken을 하위 I/O까지 전달하고 Timeout 후 원래 작업을 방치하지 않는다. Fire-and-forget Task의 예외와 Shutdown 완료도 관찰한다.

C++도 Coroutine·Asio 같은 비동기 Model을 사용할 수 있다. 언어 Keyword보다 Completion이 어느 Executor에서 실행되는지, Buffer와 Session 수명이 언제까지인지가 핵심이다.

## 10. 게임 서버 공통 Pipeline

```text
Socket Read
   ↓ Buffer ownership
Parse Message
   ↓ Typed value
Queue to Game Thread
   ↓ bounded + backpressure
Update World
   ↓
Encode·Async Send
   ↓ Completion 후 Buffer 반환
```

C++에서는 Buffer Owner Move와 RAII, C#에서는 Pool Lease·Dispose·Task Lifetime을 명시한다. 어느 언어든 Pointer·Reference 또는 Span은 소유하지 않으므로 비동기 경계에서 원본 수명을 보장해야 한다.

World State를 단일 Tick Thread가 소유하면 Lock 복잡도를 줄인다. I/O Completion은 직접 World를 수정하지 않고 Message Queue로 전달한다. Queue에는 Capacity와 Drop·Disconnect·Backpressure 정책이 필요하다.

## 11. 성능 진단 비교

### C++

- Allocation Count·Size·Call Stack
- Fragmentation·Pool In-use
- Cache Miss·Branch·Virtual Dispatch
- Leak·UAF·Overflow Sanitizer
- Lock Wait와 p99 Tick

### C#

- Allocation Rate·Boxing·Closure
- Gen별 Collection·Pause·Promotion
- LOH·Pinned·Finalizer Queue
- ThreadPool Thread·Queue·Starvation
- Task·I/O Latency와 p99

평균만 보지 않고 Traffic Timeline에 GC·Allocation·Queue·Tick Spike를 함께 놓는다. Pool과 Unsafe 최적화는 Profile에서 병목이 확인된 후 적용한다.

## 12. API 설계 비교

C++에서는 `const T&`가 읽기 빌림, `unique_ptr<T>`가 소유권 이전을 표현한다. C#에서는 Immutable Value·Class, `ReadOnlySpan<T>`, `Task<T>`와 CancellationToken이 의미를 담는다.

두 언어 모두 Signature에서 다음을 드러낸다.

- Null·실패 가능성
- 누가 결과를 소유하는가
- 입력을 변경하는가
- 호출 이후 Reference를 저장하는가
- 동기 완료인가 비동기 완료인가
- 취소와 Timeout이 가능한가

모호한 `void*`, `object`, 전역 상태는 Type Safety와 최적화 기회를 잃는다.

## 13. 대표 실무 선택

Position·Damage Event는 작은 값 Type이 자연스럽다. Session·Player는 Identity와 긴 수명이 있어 Owner Registry와 Handle을 사용한다. Packet Buffer는 연속 Memory와 Pool을 활용할 수 있지만 대여·반환과 비동기 완료가 짝을 이뤄야 한다.

C++ Entity 주소를 Vector 변경 뒤 보관하거나 C# Span을 await 너머로 보관하는 것은 모두 수명 계약 위반이다. Stable ID·Generation, Snapshot과 짧은 Borrow Scope로 해결한다.

Hot Reload는 새 Snapshot을 완성·검증한 뒤 원자 교체한다. 기존 요청이 이전 Snapshot을 읽는 동안 파괴하지 않도록 C++ Shared Ownership·Epoch 또는 C# Reference Snapshot을 사용할 수 있다.

## 14. 자주 연결되는 면접 쟁점

- Memory Leak과 RSS·GC Heap 증가는 같은가?
- Move와 얕은 Copy는 무엇이 다른가?
- Reference Count의 Thread-safety가 객체 Thread-safety를 보장하는가?
- GC가 Socket도 즉시 닫는가?
- async가 새 Thread를 만드는가?
- Struct를 쓰면 Allocation이 모두 없어지는가?
- Pool이 항상 성능을 높이는가?

답변은 “아니다”에서 끝내지 말고 어떤 조건과 비용이 실제 결과를 결정하는지 연결한다.

## 15. 쉬운 예시: Session Packet 처리 비교

동일한 문제를 두 언어로 표현하면 소유권·수명 설계의 차이가 드러난다.

```cpp
// C++: unique_ptr로 소유권 이전
std::unique_ptr<Packet> packet = Parse(buffer);
gameQueue.Push(std::move(packet)); // 이후 packet 사용 금지

// C#: ArrayPool로 Buffer를 대여하고 완료 후 반환
byte[] buffer = ArrayPool<byte>.Shared.Rent(4096);
try
{
    var packet = Parse(buffer, length);
    await gameQueue.WriteAsync(packet, token);
}
finally { ArrayPool<byte>.Shared.Return(buffer); }
```

C++은 소유권이 Type에, C#은 `try/finally`·`using`에 표현된다. 어느 언어든 비동기 경계에서 수명을 명시해야 한다는 원칙은 동일하다.

## 16. 비슷한 개념 비교: C++ vs C# 핵심 기능

| 측면 | C++ | C# |
|---|---|---|
| 메모리 회수 | RAII·Destructor (결정적) | GC (비결정적) |
| 외부 자원 | Destructor RAII | `IDisposable`·`using` |
| 수명 표현 | `unique_ptr`·`shared_ptr`·값 | Reference Graph·Dispose Scope |
| 값 Type | `struct`·기본 타입 (값 의미) | `struct` (값 의미), Boxing 위험 |
| 비동기 | Coroutine·ASIO (C++20~) | `Task`·`async`/`await` |
| 다형성 | Virtual Function (수동 소유) | Virtual (GC 관리) |
| 주요 위험 | Dangling·Leak·Double Free | GC Pause·Retention·Boxing |

## 17. 장점과 단점

### C++의 강점과 약점

- 결정적 수명 제어와 Zero-overhead Abstraction이 Real-time 게임 서버에 유리하다.
- 메모리 오류(UAF, Double Free, Dangling)가 런타임까지 숨어 있어 디버깅이 어렵다.

### C#의 강점과 약점

- GC와 관리 Runtime으로 메모리 안전성이 높고 생산성이 좋다.
- GC Pause, Boxing, ThreadPool Starvation이 Latency에 영향을 줄 수 있다.

두 언어 모두 Socket·File은 개발자가 적시에 닫아야 하며, 비동기 수명과 취소는 설계 책임이다.

## 18. 게임 서버·백엔드 실무 예시

### 언어별 Packet Pipeline 핵심 설계

C++ 게임 서버는 Buffer를 `unique_ptr<byte[]>`로 소유하고 Parser에 Move해 이중 해제를 막는다. RAII 기반 Session 객체는 Outstanding I/O Count가 0이 될 때 결정적으로 파괴된다.

C# 게임 서버는 Packet Buffer를 `ArrayPool<byte>`로 대여·반환하고 Session을 `class`로 GC 추적한다. `IAsyncDisposable`·`using await`로 Socket을 명시적으로 닫고, `CancellationTokenSource`로 Shutdown 신호를 전파한다.

### 성능 진단 기준 비교

C++ 서버: AddressSanitizer·LeakSanitizer, Heap Profiler (Allocation Size·Call Stack), Perf/VTune (Cache Miss·Lock Contention), p99 Tick.

C# 서버: Allocation Rate·Boxing 경로, Gen별 GC Pause·Promoted Bytes, ThreadPool Thread 수·Queue Length·Starvation, p99 Latency.

두 언어 모두 평균이 아닌 p99·p99.9를 Traffic과 함께 봐야 Tick Spike와 Tail Latency를 놓치지 않는다.

## 19. 자주 하는 오해

- **C++은 빠르고 C#은 느리다**: 잘못된 C++ 코드(Allocation 과다, Lock 경합, Cache Miss)는 잘 설계된 C# 코드보다 느릴 수 있다. 언어보다 설계와 측정이 성능을 결정한다.
- **GC가 있으면 메모리를 신경 쓰지 않아도 된다**: GC는 관리 메모리만 회수한다. Socket 미해제, Static Retention, Allocation Rate 폭증은 GC가 해결하지 않는다.
- **`async`/`await`는 성능을 자동으로 개선한다**: I/O 대기 중 Thread를 반환할 뿐이며 CPU 비용·Lock 경합·잘못된 소유권은 그대로다.
- **C++은 RAII만 있으면 메모리가 안전하다**: RAII를 올바르게 구현해도 잘못된 포인터 산술, Thread간 공유, Lifetime Extension이 있다. Sanitizer로 검증한다.
- **두 언어의 비동기 Continuation 실행 위치는 항상 같다**: C++ Coroutine은 기본 Executor가 없어 Caller 문맥에서 Resume되고, C#의 `async`/`await`는 `SynchronizationContext`·`ConfigureAwait`에 따라 Completion 실행 Thread가 결정된다. 두 모델은 다르다.
- **C# `using`을 쓰면 GC가 즉시 Managed Memory를 회수한다**: `using`은 `Dispose`를 호출할 뿐이다. Managed Memory 회수는 GC 스케줄에 따라 비결정적으로 일어난다. Socket·Buffer 반환과 GC는 별개다.
- **두 언어의 Exception 비용은 정상 경로에서도 동일하다**: C++은 Zero-cost Exception 모델로 throw가 없으면 추가 비용이 거의 없다. C#은 try/catch 블록 자체의 JIT 비용이 있고 Exception 생성 시 Stack Trace 캡처 비용이 발생한다. 정상 경로 비용도 다르다.

## 20. 면접 질문

### Q1. C++ 게임 서버 배포 후 30분 내 RSS가 500MB → 2GB로 급증했습니다. Heap Profiler에서 Session 객체 수는 정상이지만 Chunk Pool In-use 블록이 지속 증가합니다. 어떤 패턴을 먼저 의심하고, AddressSanitizer가 탐지하지 못하는 조건은 무엇인가요?

Pool에서 대여한 블록을 반환하지 않는 누수 패턴을 먼저 의심합니다. 비동기 I/O 완료 전에 소유 객체가 파괴되거나 예외 경로에서 반환이 누락되는 경우가 흔합니다. AddressSanitizer는 이미 반환된 메모리를 재접근하는 UAF를 잡지만, Pool 내부에서 논리적으로 보유 중인 블록은 OS 관점에서 여전히 유효한 주소라 탐지되지 않습니다. 확인 절차: Pool In-use 카운터와 반환 콜백 경로의 콜스택을 로그하고, Valgrind Massif 또는 TCMalloc Heap Profiler로 할당 호출 경로를 추적합니다. 반환 누락이 확정되면 RAII Guard(unique_ptr + Custom Deleter 또는 RAII Scope 래퍼)로 모든 경로에서 반환을 보장합니다.

### Q2. C# 서버에서 세션이 종료된 지 10분 뒤에도 해당 Session 객체가 GC 수집되지 않아 dotnet-dump로 확인하니 Timer Callback과 Event Handler가 Session Reference를 유지하고 있습니다. WeakReference와 명시적 Unsubscribe 중 어느 쪽을 적용하고, 각각의 한계는 무엇인가요?

명시적 Unsubscribe를 우선합니다. Timer를 `IDisposable`로 래핑하고 세션 종료 시점에 `Cancel()`·`Dispose()`로 제거하며, Event는 종료 시 `-=`로 구독 해제합니다. `WeakReference<Session>`은 Subscribe·Unsubscribe 없이 구독자 측에서 약한 참조만 유지하면 자동으로 수집됩니다. 단 Callback 호출 시 `TryGetTarget` 실패 시 처리 경로가 필요합니다. Timer Callback이 여전히 CPU를 소비하므로 Timer 자체 취소는 WeakReference로는 해결되지 않습니다. 종료 순서 보장이 필요하면 명시적 Unsubscribe + `CancellationToken` 전파 조합이 안전합니다. 확인 도구: dotnet-dump `gcroot <address>`로 Root Path 추적, dotnet-counters `gc-heap-size`·`gen-2-gc-count` 모니터링.

### Q3. C++ 비동기 서버에서 `std::unique_ptr<Buffer>` Scope 종료로 Buffer가 해제됐는데 완료 핸들러가 해당 주소를 읽어 간헐적 데이터 손상이 발생합니다. AddressSanitizer가 이를 탐지 못하는 조건은 무엇이고, 수명을 보장하는 수정 방법은 무엇인가요?

비동기 I/O가 완료되기 전에 소유 `unique_ptr`가 파괴된 Use-after-free 패턴입니다. AddressSanitizer는 해당 주소가 Pool에서 재사용된 경우 UAF를 탐지하지만, 메모리가 아직 OS에 반환되지 않아 접근 권한이 유효하면 탐지에 실패합니다. 수정 방법: (1) Buffer를 `shared_ptr<Buffer>`로 소유하고 완료 핸들러 람다가 `shared_ptr` 사본을 Capture하도록 변경해 수명을 완료까지 연장합니다. (2) 또는 Proactor 패턴에서 완료 핸들러가 반환할 때까지 Buffer 소유권이 이전된 상태(Move)를 유지하는 RAII Scope를 설계합니다. 코드에 `span<byte>`를 비동기 경계 너머로 전달하지 않는 규칙을 Clang Tidy 또는 코드리뷰 체크리스트에 추가합니다.

### Q4. C# Packet 파이프라인에서 `ArrayPool<byte>.Shared.Rent()`로 대여한 Buffer를 `await` 이후에도 `Span<byte>`로 참조하다 다른 Task가 같은 Buffer를 대여받아 데이터가 오염됐습니다. `try/finally` 반환과 `IMemoryOwner<byte>` 중 어느 쪽을 선택하고, `Span<T>`를 `await` 경계에서 사용 금지해야 하는 이유는 무엇인가요?

`IMemoryOwner<byte>`를 `using`으로 관리하는 방식을 선택합니다. `try/finally`로 반환 시점을 명시해도 `await` 이후에 `Span`을 다시 얻어 사용하는 것을 막지 못합니다. `IMemoryOwner<byte>`를 `using`으로 래핑하면 Scope 종료 시 단 한 번 반환되고, `Memory<byte>`로 `await` 경계를 넘깁니다. `Span<T>`는 `ref struct`이므로 컴파일러가 `async` 메서드 내 사용을 금지합니다. `Memory<T>`는 힙에 위치 가능하므로 `await` 전후에 안전하게 전달됩니다. 민감 데이터가 있다면 `Return(clearArray: true)`로 반환 전 Zero-fill합니다. Roslyn Analyzer나 코드리뷰에서 `ArrayPool.Rent` 후 `await` 경계 전에 `Return` 누락 패턴을 탐지합니다.

### Q5. 게임 서버에서 Tick State 보호를 두 언어에서 어떻게 다르게 접근하나요?

C++에서는 World를 `unique_ptr`·값으로 Tick Thread가 소유하고 다른 Thread가 직접 접근하지 않도록 Message Queue를 씁니다. C#에서는 World를 `class`로 단일 Thread가 읽고 I/O Completion Handler는 `Channel<T>`·`ConcurrentQueue`에 메시지를 넣습니다. 양쪽 모두 Tick 경계에서만 State를 변경한다는 원칙은 동일합니다.

### Q6. C++ RAII 기반 Buffer 소유권 설계를 C# `ArrayPool` + `IAsyncDisposable`로 마이그레이션할 때, 비동기 완료 전 반환 실수를 설계 수준에서 방지하는 방법을 제안하세요.

핵심은 "Buffer 수명이 Task 수명과 결합"되도록 강제하는 것입니다. (1) `IMemoryOwner<byte>`를 `IAsyncDisposable` Session 객체가 소유하고 `await using` Scope 안에서만 Memory 접근을 허용합니다. (2) Buffer를 직접 노출하지 않고 `ReadOnlyMemory<byte>` 또는 Parsed Message 구조체만 상위 레이어에 전달해 원본 Buffer Reference를 외부에서 보유하지 못하게 합니다. (3) `CancellationToken` 취소 시 `try/finally`에서 `IMemoryOwner.Dispose()`가 호출되도록 구조화합니다. (4) C++ 마이그레이션 검증: C++에서 `unique_ptr` Move로 소유권 이전이 명확했던 경계마다 C# 쪽에서 `IMemoryOwner` 전달 또는 Dispose 위임 지점이 대응되는지 코드 리뷰 체크리스트를 만들어 확인합니다.

## 21. 예상 꼬리질문

- C++ 서버에서 Session·Player 간 `shared_ptr` Cycle이 있어 Session 종료 후에도 수집되지 않습니다. Cycle을 Memory Dump 없이 확인하는 방법과, `weak_ptr`로 전환할 때 어느 쪽 참조를 `weak`로 바꾸는 기준은 무엇인가요?
  > Memory Dump 없이 확인하는 방법은 Valgrind Massif나 AddressSanitizer Leak Sanitizer로 빌드해 프로세스 종료 시 여전히 살아 있는 `shared_ptr` 블록과 참조 카운트를 출력하거나, 소멸자 로그를 찍어 Session 종료 후 Player·Session 소멸자가 호출되지 않는 것을 확인합니다. `weak_ptr`로 전환할 때 기준은 수명이 더 짧은 쪽 또는 종속적인 쪽의 참조를 `weak`로 바꿉니다. Session이 Player를 소유하고 Player가 Session을 참조 역방향으로 가리키는 경우, Player의 Session 참조를 `weak_ptr<Session>`으로 바꿉니다.
- C# 서버 운영 중 `GC.Collect(2)`를 명시 호출하는 코드를 발견했습니다. 이 호출이 p99를 줄이는 조건과 오히려 Full GC Pause를 악화시키는 조건을 각각 설명하고, dotnet-counters로 판단하는 방법을 말씀해 주세요.
  > p99를 줄이는 조건은 Combat 종료·Phase 전환처럼 예측 가능한 Low Traffic 구간에서 Gen 2 Heap에 불필요한 장수 객체가 쌓인 상태일 때, 미리 수집해 이후 Spike를 방지하는 경우입니다. 악화시키는 조건은 Heap에 장수 객체가 충분히 쌓이지 않은 상태에서 호출하면 Full GC 비용만 지불하고 회수할 메모리가 적어 Pause 대비 효과가 없으며, 이후 GC 스케줄도 왜곡됩니다. dotnet-counters에서 `gen-2-size`가 Baseline 대비 2배 이상이고 `gen-2-gc-count`가 낮아 자연 수집이 드문 상황에서 호출하면 효과적입니다.
- C++ 서버에서 `std::vector<Packet>` Move 후 동일 Vector에 `push_back`을 호출하면 어떤 결과가 나오고, 이 버그를 런타임 전에 탐지하는 설계 방법은 무엇인가요?
  > Move된 `std::vector`는 표준에서 유효하지만 상태가 지정되지 않은(Valid but unspecified state) 상태입니다. 대부분의 구현에서 빈 벡터(size=0, capacity=0)가 되므로 `push_back`은 새 Allocation을 유발하며 Packet 데이터는 이미 이전된 상태라 논리적으로 의미 없는 데이터가 쌓입니다. 런타임 전 탐지 방법은 Clang Static Analyzer나 Clang Tidy의 `bugprone-use-after-move` 검사를 CI에 추가하면 Move된 객체 사용 패턴을 빌드 시 경고합니다.
- C# 서버에서 `IAsyncDisposable` 구현의 `DisposeAsync` 중 예외가 발생했을 때 `await using` Scope에서 자원이 어떻게 처리되는지, 그리고 Dispose 전 예외와 Dispose 중 예외 각각에서 자원 정리가 보장되는 조건을 설명해 주세요.
  > `await using` Scope 내부에서 예외가 발생하면 `DisposeAsync()`가 호출되지만 `DisposeAsync()` 중 예외가 다시 발생하면 두 예외가 충돌합니다. .NET은 원래 예외를 전파하고 `DisposeAsync` 예외는 무시합니다. Dispose 전 예외에서 자원 정리는 `await using`이 자동으로 `DisposeAsync()`를 호출하므로 보장됩니다. Dispose 중 예외는 `DisposeAsync()` 내부에서 모든 자원 정리 경로를 try/catch로 감싸 부분 실패 시에도 나머지 자원이 정리되도록 구현해야 보장됩니다.
- C++ 게임 서버에서 64B 미만 소형 객체 Allocation이 초당 100만 회 발생할 때 `jemalloc` 교체와 Custom Pool 설계 중 어느 쪽을 먼저 검토하는 판단 기준과, 효과를 perf/VTune으로 측정하는 방법을 말씀해 주세요.
  > `jemalloc` 교체를 먼저 검토합니다. 구현 변경 없이 Allocator 교체만으로 소형 객체 단편화와 Lock 경합을 줄일 수 있어 위험이 낮습니다. jemalloc은 Thread-local Cache(tcache)로 소형 객체를 처리해 Lock 없이 빠른 할당·해제를 제공합니다. 교체 후에도 개선이 미흡하면 생명주기가 명확한 객체 타입에 한해 Custom Pool을 설계합니다. 효과 측정은 perf stat으로 교체 전후 `malloc`/`free` 함수의 CPU Cycle을 비교하고, VTune Memory Access 분석으로 Fragmentation과 Cache Miss 감소 여부를 확인합니다.
- C# 서버에서 32코어 환경에 Server GC를 적용했는데 GC Heap 수가 CPU 코어 수와 동일하게 늘어 메모리가 급증했습니다. Container CPU Limit에 따라 GC Heap 수를 제한하는 설정과, `GCHeapHardLimit` 도입 기준을 설명해 주세요.
  > `DOTNET_GCHeapCount` 환경변수나 `runtimeconfig.json`의 `System.GC.HeapCount`로 GC Heap 수를 명시적으로 제한합니다. Container CPU Limit이 8코어면 `HeapCount=8`로 설정합니다. `GCHeapHardLimit`은 GC가 사용할 수 있는 총 메모리 상한을 바이트로 지정하며, Container Memory Limit의 75~80%로 설정하면 OOM Killer를 방지합니다. 도입 기준은 Container Memory Limit이 있는데 .NET이 이를 인식하지 못해 Limit을 초과하는 상황, 또는 GC Heap이 전체 메모리를 점진적으로 소비해 다른 프로세스와 메모리 경쟁이 발생하는 경우입니다.
- C++과 C# 서버 각각에서 핸들러 Hot Reload(패치 없이 설정·로직 교체) 구현 시, 진행 중인 요청이 이전 핸들러를 참조하는 동안 파괴되지 않도록 수명을 보장하는 방법을 언어별로 비교해 주세요. (C++: `shared_ptr` Snapshot·Epoch, C#: Reference Snapshot·`Interlocked.Exchange`)
  > C++에서는 새 핸들러를 `std::shared_ptr<Handler>`로 빌드하고 `std::atomic_store(&currentHandler, newHandler)`로 원자적으로 교체합니다. 진행 중인 요청은 교체 전 `shared_ptr` 사본을 보유하므로 새 핸들러가 배포돼도 이전 핸들러의 참조 카운트가 0이 될 때까지 파괴되지 않습니다. Epoch 방식은 RCU(Read-Copy-Update) 패턴으로 Reader가 Epoch를 기록해 현재 Epoch에 접근 중인 Reader가 없어질 때 이전 핸들러를 해제합니다. C#에서는 `Interlocked.Exchange(ref _handler, newHandler)`로 원자적으로 교체하고 이전 참조를 반환받습니다. GC가 이전 핸들러를 자동으로 관리하므로 진행 중인 요청이 참조를 놓을 때까지 수집되지 않습니다. 두 방식 모두 교체 중 읽기는 Lock 없이 가능하고 쓰기는 단일 원자 연산으로 처리하는 것이 핵심입니다.

## 22. 30초 모범답변

**Q1 (C++ Pool 누수 진단):**
> Pool In-use 블록 급증은 반환 누락 패턴이 가장 흔합니다. 비동기 완료 전 소유 객체 파괴 또는 예외 경로 반환 누락을 먼저 의심합니다. RAII Custom Deleter로 모든 경로 반환을 강제하고, Valgrind Massif·Heap Profiler로 할당 콜스택을 확인합니다. AddressSanitizer는 Pool 내부 유효 주소 재사용을 탐지하지 못합니다.

**Q2 (C# GC Retention 원인 구분):**
> dotnet-dump `gcroot`로 Root Path를 확인합니다. Timer·Event의 경우 명시적 Unsubscribe + `CancellationToken` 전파를 우선하고, `WeakReference`는 Timer 취소 없이 Callback만 무력화할 때 보조로 씁니다. dotnet-counters `gc-heap-size` 추이와 함께 봅니다.

**Q3 (C++ Buffer 수명 UAF):**
> `Span<byte>`를 비동기 경계 너머로 전달한 UAF입니다. `shared_ptr<Buffer>`로 완료 핸들러가 수명을 연장하거나, Proactor 패턴으로 완료 시점까지 Buffer 소유권 이전(Move)을 유지합니다. AddressSanitizer는 Pool 미반환 주소 재접근을 탐지 못합니다.

**Q4 (C# ArrayPool await 경계):**
> `IMemoryOwner<byte>`를 `await using`으로 관리하고, `Memory<T>`로 `await` 경계를 넘깁니다. `Span<T>`는 `ref struct`라 컴파일러가 `async` 메서드 내 `await` 이후 사용을 차단합니다. 민감 데이터는 `Return(clearArray: true)`로 Zero-fill합니다.

**Q5 (Tick State 보호):**
> C++은 `unique_ptr`·값으로 Tick Thread 단독 소유, C#은 `class`로 단일 Thread 읽기. 양쪽 모두 I/O Completion은 `Channel<T>`·Message Queue로 전달하고 Tick 경계에서만 State를 변경합니다.

**Q6 (C# 마이그레이션 설계):**
> `IMemoryOwner<byte>`를 `IAsyncDisposable` Session이 소유하고 `await using` Scope 안에서만 접근합니다. 상위 레이어에는 `ReadOnlyMemory<byte>` 또는 Parsed 구조체만 전달해 Buffer Reference 누출을 막습니다.

## 23. 1~2분 확장답변

> C++은 RAII Destructor로 자원이 Scope 종료 시 결정적으로 해제됩니다. `unique_ptr`는 단독 소유, `shared_ptr`는 공동 수명을 표현하며 Move로 Deep Copy 비용을 피합니다. Sanitizer와 Profiler가 필수 검증 도구입니다.
>
> C#은 GC가 도달 불가 Managed 객체를 비결정적으로 회수합니다. 세대 분리로 짧은 수명 객체를 효율적으로 처리하지만 GC Pause와 Boxing이 Latency에 영향을 줍니다. Socket·File은 `IDisposable`·`using`으로 결정적으로 닫습니다. Static Retention과 Event 미해제는 GC가 해결하지 못하는 논리적 Leak입니다.
>
> 게임 서버에서 두 언어 모두 Tick State를 단일 Thread가 소유하고 I/O Completion은 Message Queue로 전달하는 패턴을 씁니다. 비동기 경계에서 Buffer 수명을 보장하고 취소를 하위 작업까지 전파하는 원칙도 동일합니다. 성능은 언어가 아니라 설계와 실측 지표가 결정합니다.
>
> C++ 진단에서는 AddressSanitizer + LeakSanitizer 조합으로 UAF·Leak을 잡고, Valgrind Massif·Heap Profiler로 할당 콜스택을 추적하며, VTune·perf로 Cache Miss·Lock Contention과 p99 Tick을 함께 봅니다.
>
> C# 진단에서는 dotnet-counters로 Allocation Rate·GC Pause·ThreadPool Queue를 실시간 모니터링하고, PerfView·dotnet-trace로 CPU·GC 이벤트를 기록하며, dotnet-dump `gcroot`로 Retention Root를 확인합니다. BenchmarkDotNet으로 Hot Path 개선 효과를 측정합니다.

## 24. 핵심 요약

- C++은 RAII·Smart Pointer로 결정적 수명, C#은 GC·Dispose로 관리 Memory를 다룬다.
- 두 언어 모두 Socket·File·Lock 같은 외부 자원은 개발자가 명시적으로 반환한다.
- C++의 주요 위험은 Dangling·Leak·UAF, C#은 GC Pause·Boxing·Managed Retention이다.
- Move(C++)와 Value Copy(C#)는 의미와 비용이 다르다.
- 두 언어 모두 비동기 경계에서 Buffer 수명과 취소 전파를 명시해야 한다.
- 성능은 "언어 선택"이 아닌 Allocation·Cache·Lock 설계와 측정이 결정한다.
- C++ 진단: Sanitizer·Profiler·Cache Miss·Lock Contention·p99.
- C# 진단: Allocation Rate·GC Pause·ThreadPool·Boxing·p99.

## 한 줄 정리

> C++은 결정적 RAII 수명, C#은 GC 자동 관리이며 두 언어 모두 외부 자원 반환·비동기 수명·취소는 개발자 책임이고 성능은 Profiler로 측정해 결정한다.
