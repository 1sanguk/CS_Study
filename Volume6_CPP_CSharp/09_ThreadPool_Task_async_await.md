---
difficulty: 3
reading_time: 20분
interview_frequency: 5
importance: 5
---

# 09. ThreadPool, Task, async와 await

> 게임 서버·백엔드 개발자를 위한 CS 면접 교재

## 학습 목표

- ThreadPool·Task·async/await의 역할과 동작 원리를 설명할 수 있다.
- I/O-bound 비동기와 CPU-bound 병렬 작업의 차이를 설명할 수 있다.
- Sync-over-async Deadlock, ThreadPool Starvation, `async void` 위험을 설명할 수 있다.
- 게임 서버의 Tick State 보호와 I/O Completion 수명 설계를 설명할 수 있다.

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

ThreadPool Worker가 동기 I/O, Lock, `Thread.Sleep`, `.Result`로 오래 Blocking되면 Queue를 처리할 Thread가 부족해지는 Starvation이 발생한다. Runtime이 새 Thread를 추가하는 동안 Tail Latency가 커질 수 있다.

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

CancellationToken은 강제 Thread 종료가 아니라 협력적 취소 신호다. API는 Token을 하위 I/O와 반복 계산에 전파하고 안전한 지점에서 중단한다.

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

### Q1. `async`/`await`의 동작 원리를 설명해 주세요.

`async` Method는 Compiler가 State Machine으로 변환합니다. `await` 대상이 미완료이면 현재 상태를 저장하고 Thread를 반환합니다. I/O 완료 시 Continuation이 ThreadPool에 예약되어 나머지 코드가 실행됩니다. `async` 자체는 Thread를 만들지 않습니다.

### Q2. ThreadPool Starvation은 어떻게 발생하나요?

ThreadPool Worker가 `.Result`·`.Wait()`·동기 I/O·`Thread.Sleep`으로 장시간 Blocking되면 새 작업을 처리할 Thread가 부족해집니다. Runtime이 Thread를 추가하는 동안 Tail Latency가 급등합니다. 해결은 Blocking 제거와 `async all the way`입니다.

### Q3. I/O-bound와 CPU-bound 비동기의 차이는 무엇인가요?

I/O-bound는 `await`로 대기 중 Thread를 반환해 소수 Thread로 많은 동시 작업을 처리합니다. CPU-bound는 `await`를 붙여도 CPU 사용이 줄지 않습니다. CPU 계산은 `Task.Run`으로 Worker에 이동하되 전체 CPU 비용은 그대로이며 Core 수를 초과하면 경쟁이 생깁니다.

### Q4. `async void`는 왜 위험한가요?

호출자가 반환 Task를 받을 수 없어 완료·예외를 관찰할 수 없습니다. 예외가 나면 `UnobservedTaskException`으로 Application이 종료될 수 있습니다. Event Handler 이외에는 항상 `async Task`를 사용합니다.

### Q5. Sync-over-async Deadlock은 어떻게 생기나요?

단일 Thread Context에서 `await`가 Continuation을 원래 Thread로 돌려보내야 하는데 그 Thread가 `.Result`로 대기 중이면 서로 진행하지 못합니다. `ConfigureAwait(false)`로 Context Capture를 피하거나 호출 Chain 전체를 `async`로 바꿔 해결합니다.

### Q6. 게임 서버에서 `async`와 Game Tick을 어떻게 설계하나요?

DB·HTTP I/O는 `async`로 처리하되 Tick State는 단일 Game Thread가 소유합니다. I/O Completion Handler는 Bounded Queue에 메시지를 넣고 Game Thread가 Tick 경계에서 Queue를 소비해 상태를 변경합니다. Task에서 직접 State를 수정하면 동기화 없이 Race가 생깁니다.

## 20. 예상 꼬리질문

- `ConfigureAwait(false)`는 언제 필요하고 언제 불필요한가요?
- `ValueTask`와 `Task`의 차이와 선택 기준은 무엇인가요?
- `CancellationToken.ThrowIfCancellationRequested()`는 어느 빈도로 호출하나요?
- `Task.WhenAny`로 Timeout을 구현할 때 생기는 문제는 무엇인가요?
- `Channel<T>`를 사용하는 이유는 무엇인가요?
- `SemaphoreSlim`으로 병렬도를 제한하는 패턴을 설명해 주세요.
- Session 종료 시 Outstanding Task를 어떻게 정리하나요?

## 21. 30초 모범답변

> `async`/`await`는 I/O 대기 중 Thread를 반환하고 완료 시 Continuation을 예약해 소수 Thread로 많은 동시 연결을 처리합니다. `.Result`·`.Wait()`로 async를 동기 대기하면 Deadlock이나 ThreadPool Starvation이 생기므로 호출 Chain 전체를 async로 전파합니다. 게임 서버에서 I/O Completion은 Bounded Queue에 메시지를 넣고 Game Thread가 Tick 경계에서 State를 변경합니다.

## 22. 1~2분 확장답변

> `async`/`await`는 Compiler가 State Machine으로 변환해 `await` 대상이 미완료이면 상태를 저장하고 Thread를 반환합니다. I/O 완료 시 Continuation이 ThreadPool에 예약됩니다. `async`는 새 Thread를 만들지 않으며 CPU 작업에는 CPU 비용이 그대로 있습니다.
>
> `.Result`·`.Wait()`로 동기 대기하면 단일 Thread Context에서 Deadlock이나 ThreadPool Starvation이 생깁니다. `async void`는 예외 관찰이 불가능해 Event Handler 외에는 쓰지 않습니다. `Task.WhenAll`에 무제한 Task를 넣으면 Resource가 소진되므로 `SemaphoreSlim`으로 병렬도를 제한합니다.
>
> 게임 서버에서 DB·HTTP I/O는 async로 처리하되 Tick State는 단일 Game Thread가 소유합니다. I/O Completion이 Bounded Queue에 메시지를 넣으면 Game Thread가 Tick 경계에서 소비합니다. Session 종료 시 `CancellationToken`으로 취소를 전파하고 Outstanding Task를 `WhenAll`로 관찰한 뒤 정리합니다.

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
