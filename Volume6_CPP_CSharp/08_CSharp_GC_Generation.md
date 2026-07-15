---
difficulty: 3
reading_time: 20분
interview_frequency: 5
importance: 5
---

# 08. C# GC와 Generation

> 게임 서버·백엔드 개발자를 위한 CS 면접 교재

## 학습 목표
- 타입·메모리·실행 의미를 설명할 수 있다.
- 주요 비용과 유사 개념을 비교할 수 있다.
- C# 게임 서버 성능과 안정성에 적용할 수 있다.

## 1. 개요
C# GC는 도달 가능한 객체를 추적해 사용하지 않는 관리 객체의 메모리를 회수하며 세대는 객체 생존 기간에 따라 수집 비용을 나누는 방식이다.

## 2. 왜 필요한가
수동 해제 오류를 줄이면서 짧은 수명의 많은 객체를 효율적으로 처리한다. 관리 Runtime도 할당, 스케줄링과 외부 자원 비용을 없애지는 않는다.

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

## 13. 쉬운 예시
C# GC와 Generation에서는 네트워크 요청을 기다리는 동안 Thread를 점유하지 않는 것과 CPU 계산을 다른 Thread에서 실행하는 것은 다르다. 객체가 GC 대상이어도 Socket은 using 또는 Dispose로 적시에 닫는다.

## 14. 비슷한 개념과 비교
| 관점 | 관리 기능 | 개발자 책임 |
|---|---|---|
| Memory | GC·Type Safety | 할당률·Dispose |
| Async | Task·await | 취소·예외·Blocking 방지 |
| Value | Value·Reference 의미 | 크기·변경·Identity 선택 |

## 15. 장점과 단점
C# GC와 Generation에서는 관리 Runtime은 생산성과 메모리 안전성을 높이지만 GC Pause, Boxing, State Machine과 ThreadPool 경쟁 비용이 있다. Allocation을 무조건 제거하기보다 Hot Path를 측정한다.

## 16. 게임 서버·백엔드 실무 예시
Packet 파싱의 임시 배열과 Closure Allocation을 줄이고 Pool은 측정 후 사용한다. GC pause, allocation rate, promoted bytes와 p99 Tick을 같은 시간축에서 본다.

C# GC와 Generation에서는 부하 시험에서 Allocation Rate, GC Pause, ThreadPool Queue, CPU와 p99를 수집하고 Timeout과 Cancellation을 전파한다.

## 17. 자주 하는 오해
- Value Type은 항상 Stack이라고 본다.
- GC가 모든 외부 자원을 즉시 정리한다고 본다.
- async가 새 Thread를 만든다고 생각한다.
- Task.Run이 모든 성능 문제를 해결한다고 본다.
- Pool을 사용하면 항상 빨라진다고 본다.

### 최종 실무 판단 기준

- **요구 확인**: C# GC는 도달 가능한 객체를 추적해 사용하지 않는 관리 객체의 메모리를 회수하며 세대는 객체 생존 기간에 따라 수집 비용을 나누는 방식이다. 이 내용을 적용하기 전에 데이터 규모, 호출 빈도와 허용 지연을 수치로 확인한다. 같은 기술도 요청량과 정확성 요구가 달라지면 적합한 선택이 달라질 수 있다.
- C# GC와 Generation에서는 **정확성 경계**: 관리 Runtime에도 실제 비용이 있다. 정상 흐름만 설명하지 않고 중복, 역순, 동시 실행과 부분 실패에서 어떤 불변식을 지켜야 하는지 함께 명시한다.
- C# GC와 Generation에서는 **비용 비교**: GC와 Dispose 역할을 구분한다. 평균 복잡도나 처리량 하나만 보지 않고 Memory, CPU, I/O, Lock 대기와 구현 복잡도까지 비교한다.
- **장애 대응**: C# GC와 Generation 관련 구성 요소가 느려지거나 중단됐을 때 Timeout, Retry 상한, Backpressure와 복구 순서를 정한다. Retry가 중복 부작용이나 연쇄 부하를 만들지 검증한다.
- **운영 검증**: C# GC와 Generation에서는 기능 Test와 함께 경계값, Peak 부하와 장애 주입 Test를 수행한다. 처리 시간 p95·p99, 오류율, Queue와 Resource 사용량을 관찰하고 변경 전후 결과를 비교한다.

C# GC와 Generation 답변에서는 이 기준으로 답하면 개념 정의에 그치지 않고 선택 조건, Trade-off와 실무 검증 방법까지 논리적으로 연결할 수 있다.

## 18. 면접 질문
### Q1. 핵심 개념을 설명해 주세요.
C# GC는 도달 가능한 객체를 추적해 사용하지 않는 관리 객체의 메모리를 회수하며 세대는 객체 생존 기간에 따라 수집 비용을 나누는 방식이다.
### Q2. 어떤 비용이 있나요?
Gen 0은 새 객체, 생존 객체는 상위 세대로 승격된다. 큰 객체는 별도 영역의 영향을 받을 수 있다. GC는 관리 메모리를 회수하지만 Socket 같은 자원의 적시 해제는 Dispose가 필요하다.
### Q3. 게임 서버 적용 사례는 무엇인가요?
Packet 파싱의 임시 배열과 Closure Allocation을 줄이고 Pool은 측정 후 사용한다. GC pause, allocation rate, promoted bytes와 p99 Tick을 같은 시간축에서 본다.
### Q4. 무엇을 측정하나요?
할당률, GC Pause와 승격, ThreadPool Queue, CPU와 p99 지연을 본다.

## 19. 예상 꼬리질문
- 관리 메모리와 비관리 자원은 어떻게 다른가요?
- 불필요한 Allocation은 어디서 생기나요?
- async 예외는 어떻게 전파되나요?
- Cancellation을 어디까지 전달하나요?
- Pool의 단점은 무엇인가요?

## 20. 30초 모범답변
> GC는 도달 가능성으로 관리 객체를 회수하고 세대로 짧은 수명 객체를 자주 처리합니다. 비관리 자원은 Dispose하고 할당률과 Pause를 측정해야 합니다. Packet 파싱의 임시 배열과 Closure Allocation을 줄이고 Pool은 측정 후 사용한다.

## 21. 1~2분 확장답변
> GC는 도달 가능성으로 관리 객체를 회수하고 세대로 짧은 수명 객체를 자주 처리합니다. 비관리 자원은 Dispose하고 할당률과 Pause를 측정해야 합니다. C# 서버에서는 값·참조 의미와 객체 수명을 먼저 정하고 비관리 자원은 Dispose합니다. I/O는 async로 겹쳐 처리하지만 CPU 작업과 Blocking을 구분합니다. 최적화는 Allocation, GC, ThreadPool과 p99 지표를 근거로 적용합니다.

## 22. 핵심 요약
- C# GC는 도달 가능한 객체를 추적해 사용하지 않는 관리 객체의 메모리를 회수하며 세대는 객체 생존 기간에 따라 수집 비용을 나누는 방식이다.
- 관리 Runtime에도 실제 비용이 있다.
- GC와 Dispose 역할을 구분한다.
- I/O 비동기와 CPU 병렬화를 구분한다.
- 지표로 Hot Path를 최적화한다.

## 한 줄 정리
> GC는 도달 가능성으로 관리 객체를 회수하고 세대로 짧은 수명 객체를 자주 처리합니다. 비관리 자원은 Dispose하고 할당률과 Pause를 측정해야 합니다.
