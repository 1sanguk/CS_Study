---
difficulty: 3
reading_time: 20분
interview_frequency: 5
importance: 5
---

# 09. ThreadPool, Task, async와 await

> 게임 서버·백엔드 개발자를 위한 CS 면접 교재

## 학습 목표
- 타입·메모리·실행 의미를 설명할 수 있다.
- 주요 비용과 유사 개념을 비교할 수 있다.
- C# 게임 서버 성능과 안정성에 적용할 수 있다.

## 1. 개요
ThreadPool은 Worker Thread를 재사용하고 Task는 비동기 작업과 결과를 표현하며 async/await는 완료 Continuation을 읽기 쉬운 형태로 작성하게 한다.

## 2. 왜 필요한가
요청마다 Thread를 만들지 않고 I/O 대기 중 Thread를 반환해 많은 동시 작업을 처리한다. 관리 Runtime도 할당, 스케줄링과 외부 자원 비용을 없애지는 않는다.

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

## 14. 쉬운 예시
ThreadPool, Task, async와 await에서는 네트워크 요청을 기다리는 동안 Thread를 점유하지 않는 것과 CPU 계산을 다른 Thread에서 실행하는 것은 다르다. 객체가 GC 대상이어도 Socket은 using 또는 Dispose로 적시에 닫는다.

## 15. 비슷한 개념과 비교
| 관점 | 관리 기능 | 개발자 책임 |
|---|---|---|
| Memory | GC·Type Safety | 할당률·Dispose |
| Async | Task·await | 취소·예외·Blocking 방지 |
| Value | Value·Reference 의미 | 크기·변경·Identity 선택 |

## 16. 장점과 단점
ThreadPool, Task, async와 await에서는 관리 Runtime은 생산성과 메모리 안전성을 높이지만 GC Pause, Boxing, State Machine과 ThreadPool 경쟁 비용이 있다. Allocation을 무조건 제거하기보다 Hot Path를 측정한다.

## 17. 게임 서버·백엔드 실무 예시
DB·HTTP I/O는 비동기로 기다리되 게임 Tick의 CPU 작업을 무작정 Task.Run으로 분산하지 않는다. Queue 길이, ThreadPool Starvation과 Timeout을 관찰한다.

ThreadPool, Task, async와 await에서는 부하 시험에서 Allocation Rate, GC Pause, ThreadPool Queue, CPU와 p99를 수집하고 Timeout과 Cancellation을 전파한다.

## 18. 자주 하는 오해
- Value Type은 항상 Stack이라고 본다.
- GC가 모든 외부 자원을 즉시 정리한다고 본다.
- async가 새 Thread를 만든다고 생각한다.
- Task.Run이 모든 성능 문제를 해결한다고 본다.
- Pool을 사용하면 항상 빨라진다고 본다.

### 최종 실무 판단 기준

- **요구 확인**: ThreadPool은 Worker Thread를 재사용하고 Task는 비동기 작업과 결과를 표현하며 async/await는 완료 Continuation을 읽기 쉬운 형태로 작성하게 한다. 이 내용을 적용하기 전에 데이터 규모, 호출 빈도와 허용 지연을 수치로 확인한다. 같은 기술도 요청량과 정확성 요구가 달라지면 적합한 선택이 달라질 수 있다.
- ThreadPool, Task, async와 await에서는 **정확성 경계**: 관리 Runtime에도 실제 비용이 있다. 정상 흐름만 설명하지 않고 중복, 역순, 동시 실행과 부분 실패에서 어떤 불변식을 지켜야 하는지 함께 명시한다.
- ThreadPool, Task, async와 await에서는 **비용 비교**: GC와 Dispose 역할을 구분한다. 평균 복잡도나 처리량 하나만 보지 않고 Memory, CPU, I/O, Lock 대기와 구현 복잡도까지 비교한다.
- **장애 대응**: ThreadPool, Task, async와 await 관련 구성 요소가 느려지거나 중단됐을 때 Timeout, Retry 상한, Backpressure와 복구 순서를 정한다. Retry가 중복 부작용이나 연쇄 부하를 만들지 검증한다.
- **운영 검증**: ThreadPool, Task, async와 await에서는 기능 Test와 함께 경계값, Peak 부하와 장애 주입 Test를 수행한다. 처리 시간 p95·p99, 오류율, Queue와 Resource 사용량을 관찰하고 변경 전후 결과를 비교한다.

ThreadPool, Task, async와 await 답변에서는 이 기준으로 답하면 개념 정의에 그치지 않고 선택 조건, Trade-off와 실무 검증 방법까지 논리적으로 연결할 수 있다.

## 19. 면접 질문
### Q1. 핵심 개념을 설명해 주세요.
ThreadPool은 Worker Thread를 재사용하고 Task는 비동기 작업과 결과를 표현하며 async/await는 완료 Continuation을 읽기 쉬운 형태로 작성하게 한다.
### Q2. 어떤 비용이 있나요?
async는 새 Thread 생성을 뜻하지 않는다. CPU 작업은 여전히 CPU 시간을 쓰고 ThreadPool에 장시간 Blocking 작업이 쌓이면 Starvation이 생긴다. Cancellation과 예외 관찰이 필요하다.
### Q3. 게임 서버 적용 사례는 무엇인가요?
DB·HTTP I/O는 비동기로 기다리되 게임 Tick의 CPU 작업을 무작정 Task.Run으로 분산하지 않는다. Queue 길이, ThreadPool Starvation과 Timeout을 관찰한다.
### Q4. 무엇을 측정하나요?
할당률, GC Pause와 승격, ThreadPool Queue, CPU와 p99 지연을 본다.

## 20. 예상 꼬리질문
- 관리 메모리와 비관리 자원은 어떻게 다른가요?
- 불필요한 Allocation은 어디서 생기나요?
- async 예외는 어떻게 전파되나요?
- Cancellation을 어디까지 전달하나요?
- Pool의 단점은 무엇인가요?

## 21. 30초 모범답변
> Task는 비동기 완료를 표현하고 await는 완료 전 Thread를 붙잡지 않게 할 수 있습니다. I/O 비동기와 CPU 병렬화를 구분하고 Blocking과 예외·취소를 관리해야 합니다. DB·HTTP I/O는 비동기로 기다리되 게임 Tick의 CPU 작업을 무작정 Task.Run으로 분산하지 않는다.

## 22. 1~2분 확장답변
> Task는 비동기 완료를 표현하고 await는 완료 전 Thread를 붙잡지 않게 할 수 있습니다. I/O 비동기와 CPU 병렬화를 구분하고 Blocking과 예외·취소를 관리해야 합니다. C# 서버에서는 값·참조 의미와 객체 수명을 먼저 정하고 비관리 자원은 Dispose합니다. I/O는 async로 겹쳐 처리하지만 CPU 작업과 Blocking을 구분합니다. 최적화는 Allocation, GC, ThreadPool과 p99 지표를 근거로 적용합니다.

## 23. 핵심 요약
- ThreadPool은 Worker Thread를 재사용하고 Task는 비동기 작업과 결과를 표현하며 async/await는 완료 Continuation을 읽기 쉬운 형태로 작성하게 한다.
- 관리 Runtime에도 실제 비용이 있다.
- GC와 Dispose 역할을 구분한다.
- I/O 비동기와 CPU 병렬화를 구분한다.
- 지표로 Hot Path를 최적화한다.

## 한 줄 정리
> Task는 비동기 완료를 표현하고 await는 완료 전 Thread를 붙잡지 않게 할 수 있습니다. I/O 비동기와 CPU 병렬화를 구분하고 Blocking과 예외·취소를 관리해야 합니다.
