---
difficulty: 3
reading_time: 20분
interview_frequency: 5
importance: 5
---

# 09. ThreadPool, Task, async와 await


## 학습 목표

- Tick p99 Spike가 ThreadPool Starvation에서 비롯된 것인지, Blocking I/O(Input/Output) 호출인지 Profiler 지표(ThreadPool Queue Length·Thread Count·Wait Time)로 구분하고, Starvation을 유발한 코드 경로를 특정할 수 있다.
- I/O-bound 작업에서 `await`가 Thread를 반환하는 조건과, CPU(Central Processing Unit)-bound 작업에 `await`·`Task.Run`을 잘못 적용했을 때 Thread 낭비가 발생하는 패턴을 진단하고, 게임 서버 I/O·Tick 분리 설계에서 적합한 방식을 결정할 수 있다.
- 단일 Thread Context에서 Sync-over-async가 Deadlock을 유발하는 정확한 조건과, ThreadPool Thread가 Blocking으로 소진되어 Starvation이 발생하는 경로를 코드 수준에서 진단하고, `async all the way` 전파 경계를 판단할 수 있다.
- Session 종료 시 Outstanding Task·Capture된 Closure·CancellationToken 전파가 연결되지 않아 자원이 유지되는 패턴을 진단하고, 종료 순서와 정리 불변식을 설계 결정할 수 있다.

## 1. 개요

ThreadPool은 Worker Thread를 미리 만들어 재사용하고, Task는 비동기 작업의 미래 완료·결과·예외·취소를 표현하는 객체다. `async`/`await`는 Compiler가 State Machine으로 변환해 `await` 대상이 완료될 때까지 Thread를 붙잡지 않고 Continuation을 예약한다.

세 개념은 함께 사용되지만 역할이 다르다. ThreadPool은 실행 인프라, Task는 비동기 결과의 표현, async/await는 Continuation 작성 편의다.

## 2. 왜 필요한가

요청마다 새 Thread를 만들면 수천 개의 동시 연결을 처리할 때 Thread 수, Stack 메모리, Context Switch 비용이 폭증한다. `async`/`await`는 I/O를 기다리는 동안 Thread를 Pool에 반환해 소수의 Thread로 많은 동시 I/O 작업을 처리할 수 있다.

```text
Thread-per-connection: 10,000 연결 → 10,000 Thread 필요
async I/O: 10,000 연결 → N개 Thread (I/O 완료 시만 실행)
```

단, async는 CPU 사용을 줄이지 않는다. I/O 대기 중 Thread를 반환하는 것이지, CPU 계산 비용을 없애지는 않는다.

## 3. 핵심 동작 원리
```text
async call→start I/O→await incomplete→return thread→I/O complete→schedule continuation
```
async는 새 Thread 생성을 뜻하지 않는다. CPU 작업은 여전히 CPU 시간을 쓰고 ThreadPool에 장시간 Blocking 작업이 쌓이면 Starvation이 생긴다. Cancellation과 예외 관찰이 필요하다.

ThreadPool, Task, async와 await에서는 값 복사, 객체 도달 가능성, Continuation 실행 위치와 자원 Scope를 구분해야 한다.

### ThreadPool

Thread 생성·종료는 Stack과 OS Scheduling 자원이 필요하다. ThreadPool은 Worker Thread를 재사용하고 Queue의 작업을 실행한다. Runtime은 부하에 따라 Thread 수를 조절하지만 무한정 즉시 늘리지는 않는다.

```text
Work Items → ThreadPool Queue → Worker Threads → Execute
```

ThreadPool Worker가 동기 I/O, Lock, `Thread.Sleep`, `.Result`로 오래 Blocking되면 Queue를 처리할 Thread가 부족해지는 Starvation이 발생한다. Runtime은 Hill Climbing 알고리즘으로 Thread 수를 조절하며 새 Thread를 초당 약 1~2개 속도로 추가한다. 따라서 Starvation 발생 직후 수 초 동안 Tail Latency가 급격히 커질 수 있다.

CPU-bound 작업을 ThreadPool에 너무 많이 넣어도 Core 수보다 많은 작업이 경쟁해 Context Switch와 Cache 효율이 나빠진다. Queue 상한과 병렬도 제한이 필요하다.

## 4. Task의 의미

`Task`는 Thread 자체가 아니라 미래의 완료, 성공 결과, 예외 또는 취소를 표현하는 객체다. 이미 완료된 결과일 수도 있고 I/O Completion을 나타낼 수도 있으며 ThreadPool Work와 연결될 수도 있다.

```csharp
Task<Player> LoadPlayerAsync(int id, CancellationToken token);
```

`Task<T>`가 성공하면 T 결과를 제공한다. Faulted Task는 예외를 저장하고, Canceled Task는 취소 완료를 표현한다. Task를 시작한 후 관찰하지 않는 Fire-and-forget은 예외·수명·종료 순서를 잃기 쉽다.

## 5. async와 State Machine

`async` Method는 Compiler가 State Machine으로 변환한다. `await` 대상이 아직 완료되지 않았으면 현재 Method 상태와 필요한 Local을 저장하고 호출자에게 미완료 Task를 반환한다. 작업 완료 후 Continuation이 예약되어 나머지를 실행한다.

```text
호출
 ↓
동기 구간 실행
 ↓ await incomplete
State 저장 + Thread 반환
 ↓ I/O 완료
Continuation 예약
 ↓
나머지 실행
```

Await 대상이 이미 완료되었으면 Method가 동기적으로 계속 실행될 수 있다. `async`가 항상 비동기 전환이나 새 Thread를 만든다는 뜻이 아니다.

State Machine, Task, Closure가 Allocation을 만들 수 있지만 Runtime은 완료 Task Cache, Struct Awaiter 등으로 일부를 줄인다. Hot Path에서는 Profiler로 확인한다.

## 6. I/O-bound와 CPU-bound

비동기 Socket·DB 호출은 OS에 I/O를 등록하고 완료를 기다리는 동안 Worker Thread를 점유하지 않을 수 있다. 동시 연결이 많은 서버에 적합하다.

CPU 계산은 `await`만 붙여도 CPU 사용이 줄지 않는다. `Task.Run`은 계산을 ThreadPool로 이동할 뿐 전체 CPU 비용을 줄이지 않는다.

```csharp
// I/O-bound
await socket.ReceiveAsync(buffer, token);

// CPU-bound: 필요하면 제한된 Worker Scheduler에서 실행
await Task.Run(() => Compress(data), token);
```

ASP.NET 같은 Server Request에서 CPU 작업을 `Task.Run`으로 감싸면 같은 ThreadPool 안에서 Queue만 추가할 수 있다. Dedicated Worker, Channel과 병렬도 제한을 검토한다.

## 7. SynchronizationContext와 Continuation

UI App은 `SynchronizationContext`가 Continuation을 원래 UI Thread로 돌려보낼 수 있다. 일반적인 ASP.NET Core Server에는 전통적인 Request SynchronizationContext가 없지만 실행 환경을 확인한다.

Library Code의 `ConfigureAwait(false)`는 Context Capture를 피하는 데 사용되어 왔다. 최신 Runtime·Application 종류에 따라 효과와 필요성이 다르므로 “항상 붙인다”는 규칙보다 Context 계약을 이해한다.

Continuation이 같은 Thread에서 실행된다는 보장은 없다. Thread-static 상태, Lock Ownership과 Thread Affinity를 await 경계 너머에 가정하지 않는다.

## 8. Sync-over-async와 Deadlock

비동기 Task를 `.Result`, `.Wait()`로 동기 대기하면 Thread를 Blocking한다. 단일-thread Context를 Capture한 Continuation이 원래 Thread로 돌아와야 하는데 그 Thread가 Wait 중이면 Deadlock이 생길 수 있다.

```text
UI Thread: async 호출 → .Result로 Blocking
Task 완료 → Continuation을 UI Thread에 예약
UI Thread는 .Result 대기 중 → 서로 진행 못 함
```

Server에서도 Deadlock이 없더라도 ThreadPool Starvation과 Latency를 만든다. 호출 Chain 전체를 Async로 전파하는 Async All the Way가 기본이다.

## 9. 예외 전파

`async Task` Method의 예외는 반환 Task에 저장되고 `await`할 때 원래 예외가 다시 던져진다.

```csharp
try
{
    await ProcessAsync();
}
catch (ProtocolException ex)
{
    // 처리
}
```

`async void`는 호출자가 완료·예외를 Task로 관찰할 수 없어 Event Handler 외에는 피한다. 병렬 Task 여러 개는 `Task.WhenAll`로 기다리고 각 Task의 Fault를 진단한다. 첫 예외만 보고 다른 실패를 놓치지 않도록 Logging 정책을 둔다.

## 10. Cancellation과 Timeout

CancellationToken은 강제 Thread 종료가 아니라 협력적 취소 신호다. API(Application Programming Interface)는 Token을 하위 I/O와 반복 계산에 전파하고 안전한 지점에서 중단한다.

```csharp
await database.QueryAsync(query, token);
token.ThrowIfCancellationRequested();
```

호출자 취소, Server Shutdown, 자체 Timeout을 Linked Token으로 결합할 수 있다. `Task.WhenAny`로 Timeout만 반환하고 원래 작업을 방치하면 Background에서 계속 Resource를 사용할 수 있으므로 실제 취소·정리를 연결한다.

취소가 Partial Side Effect 뒤 발생할 수 있다. 결제·DB 변경은 Idempotency, Transaction과 결과 상태를 설계한다.

## 11. Task.WhenAll과 병렬도

```csharp
await Task.WhenAll(ids.Select(LoadAsync));
```

입력 수가 크면 모든 I/O를 한꺼번에 시작해 DB Connection·Socket·Memory를 소진할 수 있다. `SemaphoreSlim`, Channel Consumer 수, `Parallel.ForEachAsync` 등의 제한으로 동시성을 제어한다.

```text
Input 100,000개
 → 무제한 Task 시작 X
 → Bounded Channel
 → Worker N개
```

Backpressure를 통해 Producer가 Consumer 처리 능력을 넘지 않게 한다.

## 12. ValueTask

`ValueTask<T>`는 결과가 자주 동기 완료되는 Hot API에서 Task Allocation을 줄일 수 있다. 그러나 한 번만 await해야 하는 등 사용 제약이 있고, 여러 번 Await·Caching·WhenAll 조합이 복잡하다.

일반 API는 `Task<T>`가 단순하다. Profile에서 Task Allocation이 병목이고 동기 완료 비율이 높을 때 ValueTask를 검토한다.

## 13. 게임 서버 실무

DB·HTTP·Socket I/O는 비동기로 기다리되 Game Tick State는 단일 Thread가 소유하게 할 수 있다. I/O Completion은 World를 직접 수정하지 않고 Message Queue에 결과를 넣는다.

```text
I/O async Worker
   ↓ completion message
Bounded Queue
   ↓ Tick boundary
Game Thread applies state
```

Session 종료 시 새 작업을 막고 Cancellation을 전파한 뒤 Outstanding Task를 관찰한다. Task가 Session을 Capture하면 종료 후에도 수명이 연장될 수 있으므로 Closure Retention을 확인한다.

관찰 지표는 ThreadPool Thread 수, Queue Length, Completed Work Rate, Starvation Event, Active Task, I/O Latency, Timeout·Cancellation, Allocation과 p99다.

부하 시험에서는 정상 요청뿐 아니라 느린 DB, 절반만 응답한 Socket, Shutdown과 취소 폭증을 주입한다. Queue가 줄어드는지, 모든 Task 예외가 관찰되는지, Session과 Buffer가 완료 후 해제되는지 확인한다. Async 설계의 성공 기준은 Thread 수가 아니라 제한된 Resource로 SLA와 정리 불변식을 지키는 것이다.

## 14. 쉬운 예시: DB 조회 비교

Thread를 Blocking하는 방식과 async 방식의 차이를 동시 10,000 연결에서 비교한다.

```csharp
// Blocking: 쿼리 완료까지 Thread 점유
Player LoadPlayer(int id)
{
    return db.Query<Player>(id); // 50ms 대기 동안 Thread 묶임
}

// async: 쿼리 대기 중 Thread를 Pool에 반환
async Task<Player> LoadPlayerAsync(int id, CancellationToken token)
{
    return await db.QueryAsync<Player>(id, token); // Thread 해제 후 완료 시 Continuation
}
```

Blocking 방식에서 동시 10,000 요청이 들어오면 10,000개 Thread가 필요하지만, async 방식에서는 I/O 완료 처리를 위한 소수의 Thread만 필요하다.

## 15. 비슷한 개념 비교

| 관점 | `async`/`await` | `Task.Run` | `Parallel.For` |
|---|---|---|---|
| 용도 | I/O-bound 비동기 | CPU 작업을 Thread로 이동 | Data 병렬 처리 |
| Thread 점유 | 대기 중 반환 | Worker 점유 | Worker 점유 |
| Cancellation | `CancellationToken` 전파 | Token 전달 | `ParallelOptions` |
| 적합 경우 | Socket·DB·HTTP | 무거운 CPU 계산 | 독립 데이터 배열 처리 |
| 주요 위험 | `.Result` Deadlock | ThreadPool Starvation | Exception 관찰 |

## 16. 장점과 단점

### 장점

- async I/O로 소수의 Thread로 수천 개 동시 연결을 처리할 수 있다.
- ThreadPool 재사용으로 Thread 생성·종료 비용을 줄인다.
- `CancellationToken`으로 취소를 호출 체인 전체에 전파할 수 있다.
- `Task.WhenAll`로 여러 I/O를 병렬로 기다리고 결과를 모을 수 있다.

### 단점

- `.Result`·`.Wait()`로 async를 동기 대기하면 Deadlock이나 ThreadPool Starvation이 생긴다.
- `async void`는 예외가 관찰되지 않아 Application을 종료시킬 수 있다.
- await 경계 너머 Thread Affinity·Thread-static 상태를 가정하면 버그가 된다.
- State Machine·Closure Allocation이 고빈도 Hot Path에서 누적될 수 있다.

## 17. 게임 서버·백엔드 실무 예시

### I/O와 Game Tick 분리

DB·HTTP는 async로 기다리되 Tick State는 단일 Game Thread가 소유한다. I/O Completion이 World State를 직접 수정하지 않고 Bounded Queue에 메시지를 넣는다.

```csharp
async Task HandleLoginAsync(int playerId, CancellationToken token)
{
    var data = await db.LoadPlayerAsync(playerId, token); // Worker에서 실행
    _gameQueue.Post(new PlayerLoginMessage(data));         // Game Thread에 메시지
}

// Game Thread Tick
void Tick()
{
    while (_gameQueue.TryDequeue(out var msg))
        Apply(msg); // 상태 변경은 Tick 경계에서만
}
```

### Session 종료 시 Task 정리

Session이 닫힐 때 새 Task 시작을 막고 `CancellationTokenSource`로 Outstanding Task에 취소를 전파한 뒤 완료를 관찰한다.

```csharp
async Task CloseAsync()
{
    _cts.Cancel();
    await Task.WhenAll(_outstandingTasks);
    _state = SessionState.Closed;
}
```

### 무제한 Task.WhenAll 위험

```csharp
// 위험: 10만 개 DB 쿼리를 동시에 시작
await Task.WhenAll(ids.Select(id => db.QueryAsync(id)));

// 개선: 병렬도 제한
using var semaphore = new SemaphoreSlim(32);
var tasks = ids.Select(async id =>
{
    await semaphore.WaitAsync();
    try { return await db.QueryAsync(id); }
    finally { semaphore.Release(); }
});
await Task.WhenAll(tasks);
```

## 18. 자주 하는 오해

- **`async`는 새 Thread를 만든다**: `async`/`await`는 Thread를 만들지 않는다. I/O 대기 중 Thread를 반환하고 완료 시 Continuation을 ThreadPool에 예약한다.
- **`Task.Run`이 I/O를 빠르게 만든다**: `Task.Run`은 CPU 작업을 ThreadPool로 이동할 뿐이며 I/O 자체의 속도를 바꾸지 않는다. I/O에는 `await socket.ReceiveAsync()`처럼 비동기 I/O API를 써야 한다.
- **`.Result`로 기다려도 Deadlock은 드물다**: 단일 Thread SynchronizationContext에서 `.Result`로 대기하면 Continuation이 같은 Thread를 기다려 Deadlock이 생긴다. `async all the way`가 기본이다.
- **`async void`를 Event Handler 외에도 써도 된다**: `async void`의 예외는 관찰할 방법이 없어 Application을 종료시킬 수 있다. `async Task`를 사용하고 Caller가 결과를 await한다.
- **await 이후에도 같은 Thread에서 실행된다**: Continuation 실행 Thread는 보장되지 않는다. Thread-static 상태나 Lock Ownership을 await 경계 너머에 가정하면 버그가 된다.
- **`CancellationToken`은 강제 종료다**: Token은 협력적 신호다. 코드가 안전한 지점에서 Token을 확인하고 중단해야 한다. Token을 무시하면 취소 요청이 와도 계속 실행된다.
- **`Task.WhenAll`은 항상 안전하다**: 입력 수가 크면 DB Connection·소켓·메모리를 소진할 수 있다. `SemaphoreSlim`으로 병렬도를 제한한다.

## 19. 면접 질문

### Q1. 게임 서버 Tick p99가 정상 5ms에서 특정 구간에서만 200ms로 급등하는 현상이 있습니다. dotnet-counters로 ThreadPool Thread Count가 100개를 넘고 Queue Length가 쌓이는 것을 확인했습니다. ThreadPool Starvation이 원인임을 확정하는 절차와 Starvation을 유발한 Blocking 코드 경로를 특정하는 방법을 설명하십시오.

ThreadPool Starvation은 Worker Thread가 `.Result`·동기 I/O·`Thread.Sleep`으로 Blocking되어 새 Work Item을 처리할 Thread가 부족해진 상태입니다. dotnet-counters에서 Thread Count 급증과 Queue Length 누적이 동시에 나타나면 Starvation을 의심합니다. PerfView의 ThreadPool 이벤트나 dotnet-trace의 Thread Wait Stack에서 어떤 코드가 Thread를 잡고 있는지 Call Stack을 확인합니다. Blocking 호출을 async로 교체하거나 제거하는 것이 근본 해결입니다.

### Q2. DB에서 Player 데이터를 로드한 I/O Completion Handler가 `_players[id] = data;`로 Tick State를 직접 수정하고 있습니다. 현재 어떤 Race Condition이 발생하고, Bounded Queue를 통해 Tick 경계에서 State를 적용하도록 재설계할 때 Game Thread와 I/O Worker Thread 간 데이터 흐름을 어떻게 설계합니까?

I/O Worker가 Tick State를 직접 수정하면 Game Thread와 Data Race가 발생합니다. Player가 반만 초기화된 상태에서 Tick이 읽을 수 있습니다. I/O Completion은 Bounded Channel이나 Queue에 메시지를 넣고, Game Thread가 Tick 경계에서 Queue를 소비해 State를 변경하면 Lock 없이 단일 소유권을 유지할 수 있습니다.

### Q3. 내부 Library가 `.GetAwaiter().GetResult()`로 async Task를 동기 대기하는 코드가 ASP.NET Core 서버 Request Handler async 체인에 포함되어 간헐적으로 Deadlock이 발생했습니다. Deadlock이 발생하지 않는 환경과 발생하는 환경의 차이와, `ConfigureAwait(false)` 추가 vs 호출 체인 전체를 async로 전환 중 어느 것이 근본 해결인지 판단하십시오.

Deadlock은 Continuation이 특정 Thread로 돌아와야 하는데 그 Thread가 `.GetResult()`로 대기 중일 때 발생합니다. ASP.NET Core는 기본 SynchronizationContext가 없어 Deadlock이 드물지만, Custom Middleware나 일부 환경에서 Context가 있으면 발생합니다. `ConfigureAwait(false)`는 Context Capture를 막지만 Library 코드의 모든 await에 적용해야 하는 취약한 해결입니다. 근본 해결은 Sync-over-async 자체를 제거하고 async all the way로 전환하는 것입니다.

### Q4. 100만 개 Player ID를 DB에서 일괄 로드하는 `await Task.WhenAll(ids.Select(LoadAsync))` 코드가 실행 중 DB Connection Pool 고갈로 TimeoutException이 발생했습니다. `SemaphoreSlim`으로 병렬도를 제한할 때 최적 동시 수를 결정하는 기준과 일부 Task Timeout 시 나머지를 계속할지 중단할지의 Fallback 설계를 설명하십시오.

병렬도는 DB Connection Pool 크기와 서버 Core 수 중 작은 값을 기준으로 여유를 두고 설정합니다. SemaphoreSlim(32)처럼 시작해 BenchmarkDotNet이나 부하 테스트로 실측하고 조정합니다. Timeout 시 Fallback은 partial success를 허용할지 전체 중단할지를 비즈니스 요구에 따라 결정합니다. partial success라면 실패 ID를 수집해 재시도 큐에 넣고, 전체 중단이라면 CancellationTokenSource.Cancel()로 나머지 Task에 취소 신호를 전파합니다.

### Q5. Session 종료 후에도 Session 객체가 60초 이상 Memory에 유지되는 것을 dotnet-dump로 발견했습니다. async Task가 Session을 Closure로 Capture하고 있는 것이 원인임을 Dump에서 확인하는 방법과, `CancellationTokenSource`로 취소를 전파하고 `WhenAll`로 Outstanding Task를 관찰하는 정리 패턴을 설명하십시오.

dotnet-dump에서 gcroot <Session 주소>로 Retention Path를 추적하면 async State Machine이 Session을 캡처한 경로가 나옵니다. 정리 패턴은 Session 종료 시 `_cts.Cancel()`로 취소를 전파하고 `await Task.WhenAll(_outstandingTasks)`로 모든 Task가 완료될 때까지 기다린 뒤 자원을 해제합니다. Task 목록은 시작 시 등록하고 완료 시 제거하는 방식으로 관리합니다.

### Q6. `async void` Event Handler에서 던진 예외가 `UnhandledExceptionEventArgs.IsTerminating = true`로 프로세스를 종료시키는 장애가 발생했습니다. `async void` 위험을 Roslyn Analyzer로 사전에 탐지하는 방법과, Event 구독 패턴에서 `async Task`로 교체하기 어려운 경우의 예외 처리 래퍼 설계를 설명하십시오.

`async void`의 예외는 SynchronizationContext.Post로 던져져 UnhandledException으로 처리됩니다. Roslyn Analyzer `AsyncFixer` 또는 `Microsoft.VisualStudio.Threading.Analyzers`로 `async void` 사용을 빌드 시 탐지할 수 있습니다. Event Handler 패턴에서 교체가 어렵다면 래퍼로 try/catch 후 예외를 로깅하거나 Fault Channel에 전달하는 방식으로 프로세스 종료를 막습니다.

## 20. 예상 꼬리질문

- ThreadPool Starvation 발생 시 `ThreadPool.SetMinThreads`로 최솟값을 높이면 Spike가 줄어들지만 Blocking 원인이 남아 있는 경우 어떤 부작용이 생기고, 근본 원인 특정을 위해 우선 확인하는 지표와 도구는 무엇입니까?
  > MinThreads를 높이면 Thread가 즉시 증가해 단기 Spike는 완화되지만 Blocking 원인이 남아 있으면 더 많은 Thread가 Blocking되어 메모리(Thread Stack 기본 1MB)와 Context Switch 비용이 더 빠르게 증가합니다. 결국 더 높은 Thread 수에서 동일한 Starvation이 재발합니다. 근본 원인 특정을 위해 dotnet-trace로 Thread Wait Stack을 수집해 어떤 메서드가 가장 오래 Thread를 점유하는지 Call Stack을 확인하고, PerfView의 Thread Time 뷰에서 `.Result`·`Thread.Sleep`·동기 DB 호출을 탐지합니다.
- `Task.WhenAny(workTask, Task.Delay(5000))`로 Timeout을 구현했을 때 Delay가 먼저 완료되면 workTask가 Background에서 계속 실행됩니다. Resource 누수를 방지하는 실제 취소 연결 패턴과 workTask가 취소를 무시하는 경우의 처리 방법을 설명하십시오.
  > `CancellationTokenSource cts = new(TimeSpan.FromSeconds(5));`로 Timeout 연결 Token을 만들고 `workTask = DoWorkAsync(cts.Token)`으로 전달합니다. `Task.WhenAny` 후 Delay가 먼저 완료됐으면 `cts.Cancel()`로 취소 신호를 보냅니다. workTask가 Token을 무시하는 경우에는 `Task.WhenAny` 이후 일정 시간 대기(`Task.Delay(gracePeriod)`) 후에도 workTask가 완료되지 않으면 로그를 남기고 계속 진행합니다. 취소 불가능한 코드 경로는 별도 Process나 Thread로 격리해 강제 종료 가능하게 설계하는 것이 근본 해결입니다.
- `ValueTask<T>`를 Cache·`Task.WhenAll`·여러 번 await에 사용하면 어떤 버그가 생기고, Hot Path에서 `Task<T>` 대신 `ValueTask<T>`를 채택하는 실측 기준(동기 완료 비율·Allocation 감소폭)은 무엇입니까?
  > `ValueTask<T>`는 한 번만 await할 수 있다는 계약이 있습니다. 두 번 await하거나 `Task.WhenAll`에 넣으면 결과가 이미 소비된 상태에서 재접근해 정의되지 않은 동작이 발생합니다. Cache에 보관해 여러 번 재사용하는 것도 같은 이유로 금지됩니다. 채택 기준은 BenchmarkDotNet으로 동기 완료 비율이 80% 이상이고 `Task<T>` 대비 Allocation이 50% 이상 줄어들 때입니다. 그 미만이면 복잡도 증가 대비 효과가 미미하므로 `Task<T>`를 유지합니다.
- Bounded `Channel<T>`에서 Producer 속도가 Consumer를 초과할 때 `BoundedChannelFullMode.Wait`·`DropOldest`·`DropNewest` 중 게임 서버 실시간 위치 갱신 메시지에 어느 것을 선택하고, 선택 기준과 Drop 시 모니터링 지표는 무엇입니까?
  > `DropOldest`를 선택합니다. 위치 갱신은 최신 상태가 중요하고 오래된 위치 정보는 이미 무의미합니다. `Wait`는 Producer를 block해 I/O Thread를 점유하고 연쇄 지연을 만들며, `DropNewest`는 방금 들어온 최신 위치를 버려 정보의 최신성이 떨어집니다. 모니터링 지표는 Drop Count/sec, Channel Length의 p99, Consumer 처리 지연입니다. Drop Rate가 지속적으로 높으면 Consumer 수를 늘리거나 처리 로직을 최적화해야 합니다.
- CPU-bound 압축 Task를 `Task.Run`으로 ThreadPool에 넣었는데 Core 수 대비 Task가 과도해 Context Switch가 급증했습니다. `Parallel.ForEachAsync(DegreeOfParallelism)`·Dedicated Thread Pool·`SemaphoreSlim` 중 어느 방식으로 병렬도를 제한하고, 각 방식이 적합한 조건은 무엇입니까?
  > 입력 데이터 컬렉션이 있고 각 항목을 독립적으로 처리하는 경우 `Parallel.ForEachAsync(source, new ParallelOptions { MaxDegreeOfParallelism = coreCount }, ...)`가 가장 단순합니다. 압축 요청이 외부에서 지속적으로 유입되는 경우 `SemaphoreSlim(coreCount)`로 동시 Task 수를 제한하면 기존 async 코드 구조를 유지하면서 병렬도를 제어합니다. Dedicated Thread Pool은 Game Logic ThreadPool과 압축 작업의 영향을 완전히 분리해야 할 때 적합하지만 관리 복잡도가 증가합니다.
- Graceful Shutdown 중 `CancellationToken`을 전파했는데 일부 Task가 취소를 무시하고 계속 실행됩니다. `token.ThrowIfCancellationRequested()` 누락 외에 취소 신호를 무시하는 패턴은 무엇이고, Shutdown Timeout 초과 시 강제 종료 설계는 어떻게 합니까?
  > Token을 받아 전달받았지만 하위 I/O API에 넘기지 않는 경우, 외부 Library가 Token을 지원하지 않는 경우, 무한 루프 안에 `ThrowIfCancellationRequested()`가 없는 경우가 대표적입니다. Shutdown Timeout 초과 시 설계는 `CancellationTokenSource`에 `CancelAfter(TimeSpan.FromSeconds(30))`를 설정하고, `await Task.WhenAll(outstandingTasks).WaitAsync(TimeSpan.FromSeconds(30))`으로 대기합니다. 타임아웃 후에도 완료되지 않은 Task는 경고 로그를 남기고 `Environment.Exit(1)`로 프로세스를 강제 종료합니다.
- `Task.WhenAll`로 여러 DB 쿼리를 병렬 실행 중 하나가 Exception을 던졌을 때 `AggregateException.InnerExceptions`가 아닌 첫 번째 예외만 보는 코드에서 나머지 Task 실패가 숨겨지는 이유와, 모든 Task 예외를 관찰하는 패턴을 설명하십시오.
  > `await Task.WhenAll(tasks)`에서 예외가 발생할 때 `await`는 `AggregateException`을 언래핑해 첫 번째 Inner Exception만 다시 던집니다. 나머지 Task의 예외는 Task 객체에 Faulted 상태로 남아 있지만 관찰되지 않습니다. 모든 예외를 관찰하는 패턴은 `Task whenAll = Task.WhenAll(tasks);` 선언 후 `try { await whenAll; } catch { foreach (var t in tasks.Where(t => t.IsFaulted)) LogError(t.Exception); throw; }` 형태로 모든 Task를 순회해 예외를 로깅합니다. 또는 각 Task를 `Task.ContinueWith(t => { if (t.IsFaulted) Log(t.Exception); }, TaskContinuationOptions.OnlyOnFaulted)`로 감싸는 방법도 있습니다.

## 21. 30초 모범답변

**Q1 — ThreadPool Starvation 진단**
> ThreadPool Starvation은 Worker Thread가 `.Result`·동기 I/O·`Thread.Sleep`으로 Blocking되어 새 Work Item을 처리할 Thread가 부족해진 상태입니다. dotnet-counters에서 Thread Count 급증과 Queue Length 누적이 동시에 나타나면 Starvation을 의심합니다. PerfView의 ThreadPool 이벤트나 dotnet-trace의 Thread Wait Stack에서 어떤 코드가 Thread를 잡고 있는지 Call Stack을 확인합니다. Blocking 호출을 async로 교체하거나 제거하는 것이 근본 해결입니다.

**Q2 — Tick State Race Condition 재설계**
> I/O Worker가 Tick State를 직접 수정하면 Game Thread와 Data Race가 발생합니다. Player가 반만 초기화된 상태에서 Tick이 읽을 수 있습니다. I/O Completion은 Bounded Channel이나 Queue에 메시지를 넣고, Game Thread가 Tick 경계에서 Queue를 소비해 State를 변경하면 Lock 없이 단일 소유권을 유지할 수 있습니다.

**Q3 — Sync-over-async Deadlock 근본 해결**
> Deadlock은 Continuation이 특정 Thread로 돌아와야 하는데 그 Thread가 `.GetResult()`로 대기 중일 때 발생합니다. ASP.NET Core는 기본 SynchronizationContext가 없어 Deadlock이 드물지만, Custom Middleware나 일부 환경에서 Context가 있으면 발생합니다. `ConfigureAwait(false)`는 Context Capture를 막지만 Library 코드의 모든 await에 적용해야 하는 취약한 해결입니다. 근본 해결은 Sync-over-async 자체를 제거하고 async all the way로 전환하는 것입니다.

**Q4 — SemaphoreSlim 병렬도 제한과 Fallback**
> 병렬도는 DB Connection Pool 크기와 서버 Core 수 중 작은 값을 기준으로 여유를 두고 설정합니다. SemaphoreSlim(32)처럼 시작해 BenchmarkDotNet이나 부하 테스트로 실측하고 조정합니다. Timeout 시 Fallback은 partial success를 허용할지 전체 중단할지를 비즈니스 요구에 따라 결정합니다. partial success라면 실패 ID를 수집해 재시도 큐에 넣고, 전체 중단이라면 CancellationTokenSource.Cancel()로 나머지 Task에 취소 신호를 전파합니다.

**Q5 — Session Closure Capture 진단 및 정리 패턴**
> dotnet-dump에서 gcroot <Session 주소>로 Retention Path를 추적하면 async State Machine이 Session을 캡처한 경로가 나옵니다. 정리 패턴은 Session 종료 시 `_cts.Cancel()`로 취소를 전파하고 `await Task.WhenAll(_outstandingTasks)`로 모든 Task가 완료될 때까지 기다린 뒤 자원을 해제합니다. Task 목록은 시작 시 등록하고 완료 시 제거하는 방식으로 관리합니다.

**Q6 — async void 탐지 및 래퍼 설계**
> `async void`의 예외는 SynchronizationContext.Post로 던져져 UnhandledException으로 처리됩니다. Roslyn Analyzer `AsyncFixer` 또는 `Microsoft.VisualStudio.Threading.Analyzers`로 `async void` 사용을 빌드 시 탐지할 수 있습니다. Event Handler 패턴에서 교체가 어렵다면 래퍼로 try/catch 후 예외를 로깅하거나 Fault Channel에 전달하는 방식으로 프로세스 종료를 막습니다.

## 22. 1~2분 확장답변

**Q1 — ThreadPool Starvation 진단**
> 먼저 dotnet-counters의 `ThreadPool Thread Count`와 `ThreadPool Queue Length`를 실시간으로 모니터링합니다. Thread Count가 CPU Core 수 대비 과도하게 많고 Queue Length가 계속 쌓이면 Starvation입니다. Runtime이 Thread를 추가하지만 500ms 간격으로 하나씩 늘리므로 Latency Spike가 이 시간 동안 지속됩니다. PerfView의 Thread Time Stack 뷰 또는 dotnet-trace CPU Sampling에서 어떤 Method가 Thread를 점유하는지 확인합니다. `.Result`·`.GetAwaiter().GetResult()`·`Thread.Sleep`·동기 DB Driver 호출이 원인인 경우가 많습니다. Library 코드에 숨어 있는 경우 dotnet-trace 이벤트로 Thread Wait 이유를 추적합니다. 해결은 Blocking 호출을 async API로 교체하고 외부 Library의 비동기 오버로드를 사용하는 것입니다. 근본 해결 전 임시 조치로 `ThreadPool.SetMinThreads`로 최솟값을 높이면 Thread 추가 지연을 줄일 수 있지만 Blocking 원인을 제거해야 합니다.

**Q2 — Tick State Race Condition 재설계**
> I/O Worker Thread가 `_players[id] = data;`를 직접 쓰면 Game Thread의 읽기와 Data Race가 됩니다. Dictionary는 Thread-safe하지 않아 내부 구조가 손상될 수 있고, 손상되지 않더라도 Player 객체의 여러 필드를 순서대로 초기화하는 중에 Game Thread가 읽으면 반쯤 초기화된 상태를 보게 됩니다. 해결 설계는 I/O Completion에서 `PlayerLoginMessage` 같은 불변 DTO를 `Channel<IGameMessage>.Writer.TryWrite(msg)`로 넣고, Game Thread Tick에서 `Channel.Reader.TryRead(out var msg)`로 소비해 `Apply(msg)`를 실행하는 것입니다. Channel은 `BoundedChannel`로 크기 상한을 두어 생산 속도가 소비를 초과할 때 Backpressure를 적용합니다. 이 설계는 Tick State 소유권이 Game Thread에만 있어 Lock이 필요 없고, I/O Worker는 Channel 쓰기만 담당하므로 역할이 분리됩니다.

**Q3 — Sync-over-async Deadlock 근본 해결**
> Deadlock 조건은 두 가지입니다. 첫째, Continuation이 특정 SynchronizationContext로 Post되어야 한다. 둘째, 그 Context가 점유 중(`.GetResult()` 대기)이다. ASP.NET Core는 기본 RequestContext가 없어 Deadlock이 발생하지 않는 경우가 많지만, 일부 Custom SynchronizationContext나 테스트 환경에서는 발생합니다. `ConfigureAwait(false)`를 Library의 모든 await에 추가하면 Context를 Capture하지 않아 Deadlock을 피할 수 있지만, 하나라도 누락되면 문제가 재발합니다. 근본 해결은 Library API를 async로 바꾸고 호출 체인 전체가 `async/await`로 이어지게 하는 것입니다. 이미 배포된 Library라면 `ConfigureAwait(false)` 적용이 단기 해결이지만, 자체 코드는 Sync-over-async를 없애는 것이 장기 목표입니다. 진단은 Visual Studio 병렬 스택 뷰나 WinDbg의 !Threads·!SyncBlock으로 Thread가 어디에서 Wait 중인지 확인합니다.

**Q4 — SemaphoreSlim 병렬도 제한과 Fallback**
> 병렬도 결정 기준은 DB Connection Pool 크기, 서버 Core 수, 허용 메모리입니다. Connection Pool이 100개라면 동시 DB 쿼리는 100개를 넘으면 안 됩니다. 실제로는 Pool 여유를 남기고 50~80 정도로 시작하며 BenchmarkDotNet이나 k6 부하 테스트로 Throughput이 최대가 되는 병렬도를 찾습니다. `SemaphoreSlim(N)`을 await 전에 WaitAsync, finally에서 Release하는 패턴으로 구현합니다. Timeout·Exception Fallback은 두 가지입니다. 1) Partial Success: 실패한 ID를 `ConcurrentBag`으로 수집하고 성공 데이터로 진행, 실패 목록은 재시도 Channel에 넣습니다. 2) 전체 중단: 첫 실패 시 `CancellationTokenSource.CancelAfter(0)`로 나머지 Task에 즉시 취소 신호를 보내고 `Task.WhenAll`의 AggregateException에서 모든 실패를 로깅합니다. 비즈니스 요구가 모든 데이터가 있어야 처리 가능하다면 전체 중단, 일부 없어도 처리 가능하면 Partial Success입니다.

**Q5 — Session Closure Capture 진단 및 정리 패턴**
> dotnet-dump analyze에서 `dumpheap -type Session`으로 인스턴스 수와 주소를 확인합니다. `gcroot <address>`를 실행하면 Retention Path가 나타납니다. `async State Machine`의 필드로 Session Reference가 저장된 경로가 보이면 Closure Capture가 원인입니다. async Task가 완료되기 전까지 State Machine이 살아 있고 State Machine이 Session을 참조하면 GC가 수집하지 못합니다. 정리 패턴: Session에 `CancellationTokenSource _cts`와 `List<Task> _tasks`를 두고, async 작업 시작 시 Task를 `_tasks`에 추가합니다. 종료 시 `_cts.Cancel()`로 취소를 전파하고 `await Task.WhenAll(_tasks)`로 모든 Task 완료를 기다린 뒤 `_state = Closed`로 변경합니다. `Task.WhenAll` 자체에 Timeout을 두어 오래 걸리는 Task는 강제로 진행하고 로깅합니다. `CancellationToken`을 실제로 확인하지 않는 Task는 취소가 안 되므로 `token.ThrowIfCancellationRequested()`를 반복 지점에 삽입했는지 확인합니다.

**Q6 — async void 탐지 및 래퍼 설계**
> `async void`의 예외는 await 시점에 Faulted로 Task에 저장되지 않고 현재 SynchronizationContext.UnhandledException으로 직접 전파됩니다. ASP.NET Core에서는 ThreadPool의 Unhandled Exception Handler가 받아 프로세스를 종료시킬 수 있습니다. 사전 탐지는 Roslyn Analyzer를 사용합니다. `AsyncFixer` NuGet 패키지의 `AsyncFixer01` 규칙, 또는 `Microsoft.VisualStudio.Threading.Analyzers`의 `VSTHRD100` 규칙이 async void를 경고합니다. `.editorconfig`에서 이 규칙을 Error로 설정하면 빌드 시 실패로 막을 수 있습니다. Event Handler 패턴에서 `async void`가 불가피한 경우 래퍼를 사용합니다. 이벤트 구독을 `sender.Event += (s, e) => AsyncHelper.FireAndForget(HandleAsync(e));` 형태로 래핑하고, `FireAndForget`은 Task를 await해 예외를 catch 후 `ILogger`로 로깅하거나 Fault Channel에 넣습니다. 이렇게 하면 예외가 프로세스를 종료시키지 않으면서 관찰 가능한 형태로 처리됩니다.

## 23. 핵심 요약

- `async`/`await`는 Thread를 만들지 않으며 I/O 대기 중 Thread를 반환하고 Continuation을 예약한다.
- ThreadPool Worker를 Blocking하면 Starvation과 Tail Latency가 발생한다.
- I/O-bound에는 `await` async API, CPU-bound에는 `Task.Run`을 쓰되 전체 CPU 비용은 줄지 않는다.
- `async void`는 예외 관찰 불가능, Event Handler 외에는 `async Task`를 사용한다.
- `.Result`·`.Wait()` Sync-over-async는 Deadlock과 Starvation을 만든다.
- `CancellationToken`은 협력적 취소 신호이며 하위 I/O와 반복 계산에 전파한다.
- `Task.WhenAll`은 병렬도를 `SemaphoreSlim`으로 제한해 Resource 소진을 방지한다.
- await 경계 너머 Thread Affinity를 가정하지 않는다.

## 한 줄 정리

> `async`/`await`는 I/O 대기 중 Thread를 반환해 소수 Thread로 많은 동시 연결을 처리하며, `async all the way`와 `CancellationToken` 전파가 설계의 기본이다.
