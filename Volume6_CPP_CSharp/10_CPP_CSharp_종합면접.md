---
difficulty: 3
reading_time: 20분
interview_frequency: 5
importance: 5
---

# 10. C++·C# 종합면접

> 게임 서버·백엔드 개발자를 위한 CS 면접 교재

## 학습 목표
- 타입·메모리·실행 의미를 설명할 수 있다.
- 주요 비용과 유사 개념을 비교할 수 있다.
- C# 게임 서버 성능과 안정성에 적용할 수 있다.

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

## 15. 쉬운 예시
C++·C# 종합면접에서는 네트워크 요청을 기다리는 동안 Thread를 점유하지 않는 것과 CPU 계산을 다른 Thread에서 실행하는 것은 다르다. 객체가 GC 대상이어도 Socket은 using 또는 Dispose로 적시에 닫는다.

## 16. 비슷한 개념과 비교
| 관점 | 관리 기능 | 개발자 책임 |
|---|---|---|
| Memory | GC·Type Safety | 할당률·Dispose |
| Async | Task·await | 취소·예외·Blocking 방지 |
| Value | Value·Reference 의미 | 크기·변경·Identity 선택 |

## 17. 장점과 단점
C++·C# 종합면접에서는 관리 Runtime은 생산성과 메모리 안전성을 높이지만 GC Pause, Boxing, State Machine과 ThreadPool 경쟁 비용이 있다. Allocation을 무조건 제거하기보다 Hot Path를 측정한다.

## 18. 게임 서버·백엔드 실무 예시
C++ 서버는 Sanitizer와 Allocation Profile, C# 서버는 Allocation Rate와 GC Pause·ThreadPool 지표를 관찰한다. 어느 언어든 p99와 소유권을 기준으로 최적화한다.

C++·C# 종합면접에서는 부하 시험에서 Allocation Rate, GC Pause, ThreadPool Queue, CPU와 p99를 수집하고 Timeout과 Cancellation을 전파한다.

## 19. 자주 하는 오해
- Value Type은 항상 Stack이라고 본다.
- GC가 모든 외부 자원을 즉시 정리한다고 본다.
- async가 새 Thread를 만든다고 생각한다.
- Task.Run이 모든 성능 문제를 해결한다고 본다.
- Pool을 사용하면 항상 빨라진다고 본다.

### 최종 실무 판단 기준

- **요구 확인**: 언어 면접의 핵심은 C++의 명시적 수명·소유권과 C#의 관리 메모리·비동기 실행 모델을 비용까지 연결해 설명하는 것이다. 이 내용을 적용하기 전에 데이터 규모, 호출 빈도와 허용 지연을 수치로 확인한다. 같은 기술도 요청량과 정확성 요구가 달라지면 적합한 선택이 달라질 수 있다.
- C++·C# 종합면접에서는 **정확성 경계**: 관리 Runtime에도 실제 비용이 있다. 정상 흐름만 설명하지 않고 중복, 역순, 동시 실행과 부분 실패에서 어떤 불변식을 지켜야 하는지 함께 명시한다.
- C++·C# 종합면접에서는 **비용 비교**: GC와 Dispose 역할을 구분한다. 평균 복잡도나 처리량 하나만 보지 않고 Memory, CPU, I/O, Lock 대기와 구현 복잡도까지 비교한다.
- **장애 대응**: C++·C# 종합면접 관련 구성 요소가 느려지거나 중단됐을 때 Timeout, Retry 상한, Backpressure와 복구 순서를 정한다. Retry가 중복 부작용이나 연쇄 부하를 만들지 검증한다.
- **운영 검증**: C++·C# 종합면접에서는 기능 Test와 함께 경계값, Peak 부하와 장애 주입 Test를 수행한다. 처리 시간 p95·p99, 오류율, Queue와 Resource 사용량을 관찰하고 변경 전후 결과를 비교한다.

C++·C# 종합면접 답변에서는 이 기준으로 답하면 개념 정의에 그치지 않고 선택 조건, Trade-off와 실무 검증 방법까지 논리적으로 연결할 수 있다.

## 20. 면접 질문
### Q1. 핵심 개념을 설명해 주세요.
언어 면접의 핵심은 C++의 명시적 수명·소유권과 C#의 관리 메모리·비동기 실행 모델을 비용까지 연결해 설명하는 것이다.
### Q2. 어떤 비용이 있나요?
C++은 RAII와 Move로 결정적 자원 수명을 표현하고 C#은 GC로 관리 메모리를 회수한다. 두 언어 모두 Socket과 Lock 같은 자원 Scope와 동시성은 개발자가 설계한다.
### Q3. 게임 서버 적용 사례는 무엇인가요?
C++ 서버는 Sanitizer와 Allocation Profile, C# 서버는 Allocation Rate와 GC Pause·ThreadPool 지표를 관찰한다. 어느 언어든 p99와 소유권을 기준으로 최적화한다.
### Q4. 무엇을 측정하나요?
할당률, GC Pause와 승격, ThreadPool Queue, CPU와 p99 지연을 본다.

## 21. 예상 꼬리질문
- 관리 메모리와 비관리 자원은 어떻게 다른가요?
- 불필요한 Allocation은 어디서 생기나요?
- async 예외는 어떻게 전파되나요?
- Cancellation을 어디까지 전달하나요?
- Pool의 단점은 무엇인가요?

## 22. 30초 모범답변
> C++은 RAII로 수명을 명시하고 C#은 GC와 Task 기반 실행을 제공하지만 두 언어 모두 자원 소유권, 비동기 취소와 실제 할당 비용을 설계해야 합니다. C++·C# 종합면접을 선택하거나 적용할 때는 정확성, 성능과 구현 복잡도의 균형을 함께 봐야 합니다. C++ 서버는 Sanitizer와 Allocation Profile, C# 서버는 Allocation Rate와 GC Pause·ThreadPool 지표를 관찰한다.

## 23. 1~2분 확장답변
> C++은 RAII로 수명을 명시하고 C#은 GC와 Task 기반 실행을 제공하지만 두 언어 모두 자원 소유권, 비동기 취소와 실제 할당 비용을 설계해야 합니다. C# 서버에서는 값·참조 의미와 객체 수명을 먼저 정하고 비관리 자원은 Dispose합니다. I/O는 async로 겹쳐 처리하지만 CPU 작업과 Blocking을 구분합니다. 최적화는 Allocation, GC, ThreadPool과 p99 지표를 근거로 적용합니다.

## 24. 핵심 요약
- 언어 면접의 핵심은 C++의 명시적 수명·소유권과 C#의 관리 메모리·비동기 실행 모델을 비용까지 연결해 설명하는 것이다.
- 관리 Runtime에도 실제 비용이 있다.
- GC와 Dispose 역할을 구분한다.
- I/O 비동기와 CPU 병렬화를 구분한다.
- 지표로 Hot Path를 최적화한다.

## 한 줄 정리
> C++은 RAII로 수명을 명시하고 C#은 GC와 Task 기반 실행을 제공하지만 두 언어 모두 자원 소유권, 비동기 취소와 실제 할당 비용을 설계해야 합니다.
