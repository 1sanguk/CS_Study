---
difficulty: 3
reading_time: 25분
interview_frequency: 5
importance: 5
---

# 09. Executor·CompletableFuture와 Virtual Thread

> 게임 서버·백엔드 개발자를 위한 CS 면접 교재

## 학습 목표
- Executor는 Task 제출과 Thread 실행 정책을 분리하고 CompletableFuture는 비동기 결과의 조합을, Virtual Thread는 많은 Blocking Task를 가벼운 Thread로 표현한다.
- 핵심 동작과 Trade-off를 설명할 수 있다.
- Java 게임 서버 사례로 면접 답변을 구성할 수 있다.

## 1. 개요
Executor는 Task 제출과 Thread 실행 정책을 분리하고 CompletableFuture는 비동기 결과의 조합을, Virtual Thread는 많은 Blocking Task를 가벼운 Thread로 표현한다.

## 2. 왜 필요한가
Thread 생성·Queue·취소·예외와 Backpressure를 일관되게 관리하고 I/O 대기가 많은 Server의 구조를 단순하게 만들기 위해 필요하다.

## 3. 핵심 동작 원리
```text
task → bounded executor or virtual thread → run/wait → completion → compose/result
```
이 흐름은 Executor·CompletableFuture와 Virtual Thread의 상태와 실행 경계를 보여 준다. 정상 처리뿐 아니라 실패와 Resource 정리 위치를 함께 본다.

### 1) 핵심 포인트
ExecutorService는 Worker 수, Queue와 거절 정책을 소유한다. 무제한 Queue는 Memory와 지연을 키우므로 CPU-bound와 Blocking 작업을 분리하고 Shutdown에서 새 Task 수락, Drain과 강제 종료 순서를 정한다.

### 2) 핵심 포인트
CompletableFuture의 thenApply는 값을 변환하고 thenCompose는 비동기 단계를 평탄화한다. 실행 Thread는 async 접미사와 지정 Executor 여부에 따라 달라질 수 있으므로 Common Pool을 무심코 Blocking하지 않는다.

### 3) 핵심 포인트
join과 get은 결과를 기다리며 Exception 포장 방식이 다르다. Timeout, Cancellation과 예외 처리 Stage를 전체 Chain에 전파하고 Fire-and-forget Future의 실패를 잃지 않는다.

### 4) 핵심 포인트
Virtual Thread는 JDK가 제공하는 경량 Thread이며 JDK 21에서 정식 기능이 됐다. 많은 I/O 대기 Task를 Thread-per-request Style로 표현하기 쉽지만 CPU 처리량을 Core 이상으로 늘리거나 외부 DB Capacity를 확장하지는 않는다.

### 5) 핵심 포인트
로그인 외부 API 호출을 Virtual Thread로 단순화해도 DB Connection Pool에는 상한이 필요하다. CPU Pathfinding은 제한된 Platform Thread Pool로 격리하고 요청 Deadline을 전달한다.

### 6) 핵심 포인트
ThreadLocal 대량 사용, Pinning 가능 구간과 관찰 도구 지원은 사용하는 JDK Version에서 확인한다. Virtual Thread 수 자체보다 외부 Resource, Queue와 업무 동시성에 상한을 둔다.

### 추가 핵심 내용

ThreadPoolExecutor는 Core·Maximum Thread, KeepAlive, Queue와 Rejection Policy를 하나의 용량 계약으로 본다. 무제한 Queue에서는 Maximum Thread 설정이 기대대로 작동하지 않을 수 있고 오래된 Task 지연이 커진다.

thenApply는 동기 값 변환, thenCompose는 Future를 반환하는 비동기 단계를 평탄화한다. `Async` Variant는 기본 또는 지정 Executor에서 실행된다. Blocking Stage를 Common Pool에 섞지 않는다.

Cancellation은 이미 외부 시스템에 전달된 부작용을 되돌리지 않는다. Deadline을 하위 호출로 전달하고 완료 Callback이 취소 뒤 상태를 Commit하지 않게 요청 Version을 확인한다.

Virtual Thread는 JDK 21 정식 기능으로 I/O 대기 중심 Thread-per-task 코드를 확장하기 쉽게 한다. CPU 작업을 빠르게 만들지는 않으며 DB Connection, Rate Limit과 Memory 같은 자원에는 별도 상한이 필요하다.
### 구현·운영 검증 기준

- **입력 계약**: Executor CompletableFuture VirtualThread에서 입력 계약가 영향을 주는 코드 경계를 실제 Method와 객체 수명으로 표시한다. 정상 Case와 함께 Null, 최대 크기, 동시 호출, 예외와 취소를 재현하고 결과 상태와 Resource가 계약대로 남는지 확인한다. 측정 가능한 지표와 실패 시 대응을 Review 항목에 포함한다.
- **상태 소유권**: Executor CompletableFuture VirtualThread에서 상태 소유권가 영향을 주는 코드 경계를 실제 Method와 객체 수명으로 표시한다. 정상 Case와 함께 Null, 최대 크기, 동시 호출, 예외와 취소를 재현하고 결과 상태와 Resource가 계약대로 남는지 확인한다. 측정 가능한 지표와 실패 시 대응을 Review 항목에 포함한다.
- **Null 처리**: Executor CompletableFuture VirtualThread에서 Null 처리가 영향을 주는 코드 경계를 실제 Method와 객체 수명으로 표시한다. 정상 Case와 함께 Null, 최대 크기, 동시 호출, 예외와 취소를 재현하고 결과 상태와 Resource가 계약대로 남는지 확인한다. 측정 가능한 지표와 실패 시 대응을 Review 항목에 포함한다.
- **Type 안전성**: Executor CompletableFuture VirtualThread에서 Type 안전성가 영향을 주는 코드 경계를 실제 Method와 객체 수명으로 표시한다. 정상 Case와 함께 Null, 최대 크기, 동시 호출, 예외와 취소를 재현하고 결과 상태와 Resource가 계약대로 남는지 확인한다. 측정 가능한 지표와 실패 시 대응을 Review 항목에 포함한다.
- **경계값**: Executor CompletableFuture VirtualThread에서 경계값가 영향을 주는 코드 경계를 실제 Method와 객체 수명으로 표시한다. 정상 Case와 함께 Null, 최대 크기, 동시 호출, 예외와 취소를 재현하고 결과 상태와 Resource가 계약대로 남는지 확인한다. 측정 가능한 지표와 실패 시 대응을 Review 항목에 포함한다.
- **동시 실행**: Executor CompletableFuture VirtualThread에서 동시 실행가 영향을 주는 코드 경계를 실제 Method와 객체 수명으로 표시한다. 정상 Case와 함께 Null, 최대 크기, 동시 호출, 예외와 취소를 재현하고 결과 상태와 Resource가 계약대로 남는지 확인한다. 측정 가능한 지표와 실패 시 대응을 Review 항목에 포함한다.
- **예외 전파**: Executor CompletableFuture VirtualThread에서 예외 전파가 영향을 주는 코드 경계를 실제 Method와 객체 수명으로 표시한다. 정상 Case와 함께 Null, 최대 크기, 동시 호출, 예외와 취소를 재현하고 결과 상태와 Resource가 계약대로 남는지 확인한다. 측정 가능한 지표와 실패 시 대응을 Review 항목에 포함한다.
- **자원 정리**: Executor CompletableFuture VirtualThread에서 자원 정리가 영향을 주는 코드 경계를 실제 Method와 객체 수명으로 표시한다. 정상 Case와 함께 Null, 최대 크기, 동시 호출, 예외와 취소를 재현하고 결과 상태와 Resource가 계약대로 남는지 확인한다. 측정 가능한 지표와 실패 시 대응을 Review 항목에 포함한다.
- **성능 비용**: Executor CompletableFuture VirtualThread에서 성능 비용가 영향을 주는 코드 경계를 실제 Method와 객체 수명으로 표시한다. 정상 Case와 함께 Null, 최대 크기, 동시 호출, 예외와 취소를 재현하고 결과 상태와 Resource가 계약대로 남는지 확인한다. 측정 가능한 지표와 실패 시 대응을 Review 항목에 포함한다.
- **Memory 사용**: Executor CompletableFuture VirtualThread에서 Memory 사용가 영향을 주는 코드 경계를 실제 Method와 객체 수명으로 표시한다. 정상 Case와 함께 Null, 최대 크기, 동시 호출, 예외와 취소를 재현하고 결과 상태와 Resource가 계약대로 남는지 확인한다. 측정 가능한 지표와 실패 시 대응을 Review 항목에 포함한다.
- **Version 호환**: Executor CompletableFuture VirtualThread에서 Version 호환가 영향을 주는 코드 경계를 실제 Method와 객체 수명으로 표시한다. 정상 Case와 함께 Null, 최대 크기, 동시 호출, 예외와 취소를 재현하고 결과 상태와 Resource가 계약대로 남는지 확인한다. 측정 가능한 지표와 실패 시 대응을 Review 항목에 포함한다.
- **관찰 지표**: Executor CompletableFuture VirtualThread에서 관찰 지표가 영향을 주는 코드 경계를 실제 Method와 객체 수명으로 표시한다. 정상 Case와 함께 Null, 최대 크기, 동시 호출, 예외와 취소를 재현하고 결과 상태와 Resource가 계약대로 남는지 확인한다. 측정 가능한 지표와 실패 시 대응을 Review 항목에 포함한다.
- **부하 상한**: Executor CompletableFuture VirtualThread에서 부하 상한가 영향을 주는 코드 경계를 실제 Method와 객체 수명으로 표시한다. 정상 Case와 함께 Null, 최대 크기, 동시 호출, 예외와 취소를 재현하고 결과 상태와 Resource가 계약대로 남는지 확인한다. 측정 가능한 지표와 실패 시 대응을 Review 항목에 포함한다.
- **장애 복구**: Executor CompletableFuture VirtualThread에서 장애 복구가 영향을 주는 코드 경계를 실제 Method와 객체 수명으로 표시한다. 정상 Case와 함께 Null, 최대 크기, 동시 호출, 예외와 취소를 재현하고 결과 상태와 Resource가 계약대로 남는지 확인한다. 측정 가능한 지표와 실패 시 대응을 Review 항목에 포함한다.
- **Test 전략**: Executor CompletableFuture VirtualThread에서 Test 전략가 영향을 주는 코드 경계를 실제 Method와 객체 수명으로 표시한다. 정상 Case와 함께 Null, 최대 크기, 동시 호출, 예외와 취소를 재현하고 결과 상태와 Resource가 계약대로 남는지 확인한다. 측정 가능한 지표와 실패 시 대응을 Review 항목에 포함한다.
- **보안 경계**: Executor CompletableFuture VirtualThread에서 보안 경계가 영향을 주는 코드 경계를 실제 Method와 객체 수명으로 표시한다. 정상 Case와 함께 Null, 최대 크기, 동시 호출, 예외와 취소를 재현하고 결과 상태와 Resource가 계약대로 남는지 확인한다. 측정 가능한 지표와 실패 시 대응을 Review 항목에 포함한다.
- **배포 전환**: Executor CompletableFuture VirtualThread에서 배포 전환가 영향을 주는 코드 경계를 실제 Method와 객체 수명으로 표시한다. 정상 Case와 함께 Null, 최대 크기, 동시 호출, 예외와 취소를 재현하고 결과 상태와 Resource가 계약대로 남는지 확인한다. 측정 가능한 지표와 실패 시 대응을 Review 항목에 포함한다.
- **면접 설명**: Executor CompletableFuture VirtualThread에서 면접 설명가 영향을 주는 코드 경계를 실제 Method와 객체 수명으로 표시한다. 정상 Case와 함께 Null, 최대 크기, 동시 호출, 예외와 취소를 재현하고 결과 상태와 Resource가 계약대로 남는지 확인한다. 측정 가능한 지표와 실패 시 대응을 Review 항목에 포함한다.

이 기준은 기능을 무조건 복잡하게 만들기 위한 목록이 아니다. Executor CompletableFuture VirtualThread의 실제 호출 빈도와 장애 영향을 기준으로 필요한 항목을 선택하고, 변경 전후의 정확성과 p99를 비교한다.

## 4. 쉬운 예시
로그인 외부 API 호출을 Virtual Thread로 단순화해도 DB Connection Pool에는 상한이 필요하다. CPU Pathfinding은 제한된 Platform Thread Pool로 격리하고 요청 Deadline을 전달한다.

## 5. 비슷한 개념과 비교
ThreadLocal 대량 사용, Pinning 가능 구간과 관찰 도구 지원은 사용하는 JDK Version에서 확인한다. Virtual Thread 수 자체보다 외부 Resource, Queue와 업무 동시성에 상한을 둔다.

## 6. 장점과 단점
Executor·CompletableFuture와 Virtual Thread는 실행 구조와 운영 예측성을 높일 수 있다. 반면 추상화, Runtime과 Memory 비용을 추가할 수 있으므로 호출 빈도와 변경 가능성을 측정해 적용한다.

## 7. 게임 서버·백엔드 실무 예시
로그인 외부 API 호출을 Virtual Thread로 단순화해도 DB Connection Pool에는 상한이 필요하다. CPU Pathfinding은 제한된 Platform Thread Pool로 격리하고 요청 Deadline을 전달한다. 처리량, p99, 오류율과 Resource 상한을 같은 시간축에서 관찰한다.

## 8. 자주 하는 오해
- ExecutorService의 Compile Time 보장과 Runtime 동작을 구분하지 않는다.
- Thread Pool이 해결하는 문제와 남겨 두는 비용을 함께 설명하지 않는다.
- Bounded Queue을 사용하면 동시성·Memory 문제가 자동으로 사라진다고 본다.
- RejectedExecution의 Version과 실행 환경 전제를 확인하지 않는다.
- Future관련 평균 성능만 보고 경계값과 p99를 측정하지 않는다.
## 9. 면접 질문
### Q1. Executor를 직접 Thread 생성보다 선호하는 이유는 무엇인가요?
Task 제출과 Thread 생성, Queue, 종료와 거절 정책을 분리해 실행 Resource를 중앙에서 제한할 수 있기 때문입니다.

### Q2. thenApply와 thenCompose의 차이는 무엇인가요?
thenApply는 결과를 다른 값으로 바꾸고 thenCompose는 CompletableFuture를 반환하는 단계를 중첩 없이 연결합니다.

### Q3. CompletableFuture 예외는 어떻게 처리하나요?
exceptionally, handle, whenComplete 등의 의미를 구분하고 최종 Stage를 관찰해 Fire-and-forget 실패를 잃지 않습니다.

### Q4. Virtual Thread의 장점과 한계는 무엇인가요?
Blocking I/O 코드를 단순한 Thread-per-task 형태로 확장하기 쉽지만 CPU 처리량과 외부 자원 용량은 늘리지 않습니다.

### Q5. 동시성 상한이 왜 필요한가요?
Virtual Thread 수가 많아도 DB Connection과 외부 API Capacity는 유한하므로 Semaphore, Pool과 Admission Control로 보호해야 합니다.
## 10. 예상 꼬리질문
- ExecutorService의 보장과 한계는 무엇인가요?
- Thread Pool의 보장과 한계는 무엇인가요?
- Bounded Queue의 보장과 한계는 무엇인가요?
- RejectedExecution의 보장과 한계는 무엇인가요?
- Future의 보장과 한계는 무엇인가요?

## 11. 30초 모범답변
> Executor는 Task와 실행 정책을 분리하고 CompletableFuture는 비동기 결과를 조합합니다. Virtual Thread는 JDK 21에서 정식 도입되어 I/O 대기가 많은 Thread-per-request 코드를 가볍게 표현하지만 CPU와 DB 용량을 늘리지는 않습니다. Queue, Deadline, Cancellation과 외부 Resource 상한은 여전히 필요합니다.

## 12. 1~2분 확장답변
> Executor는 Task 제출과 Thread 실행 정책을 분리하고 CompletableFuture는 비동기 결과의 조합을, Virtual Thread는 많은 Blocking Task를 가벼운 Thread로 표현한다. Thread 생성·Queue·취소·예외와 Backpressure를 일관되게 관리하고 I/O 대기가 많은 Server의 구조를 단순하게 만들기 위해 필요하다. ExecutorService는 Worker 수, Queue와 거절 정책을 소유한다. 무제한 Queue는 Memory와 지연을 키우므로 CPU-bound와 Blocking 작업을 분리하고 Shutdown에서 새 Task 수락, Drain과 강제 종료 순서를 정한다. join과 get은 결과를 기다리며 Exception 포장 방식이 다르다. Timeout, Cancellation과 예외 처리 Stage를 전체 Chain에 전파하고 Fire-and-forget Future의 실패를 잃지 않는다. 로그인 외부 API 호출을 Virtual Thread로 단순화해도 DB Connection Pool에는 상한이 필요하다. CPU Pathfinding은 제한된 Platform Thread Pool로 격리하고 요청 Deadline을 전달한다.

## 13. 핵심 요약
- Executor는 Task 제출과 Thread 실행 정책을 분리하고 CompletableFuture는 비동기 결과의 조합을, Virtual Thread는 많은 Blocking Task를 가벼운 Thread로 표현한다.
- ExecutorService는 Worker 수, Queue와 거절 정책을 소유한다. 무제한 Queue는 Memory와 지연을 키우므로 CPU-bound와 Blocking 작업을 분리하고 Shutdown에서 새 Task 수락, Drain과 강제 종료 순서를 정한다.
- join과 get은 결과를 기다리며 Exception 포장 방식이 다르다. Timeout, Cancellation과 예외 처리 Stage를 전체 Chain에 전파하고 Fire-and-forget Future의 실패를 잃지 않는다.
- 로그인 외부 API 호출을 Virtual Thread로 단순화해도 DB Connection Pool에는 상한이 필요하다. CPU Pathfinding은 제한된 Platform Thread Pool로 격리하고 요청 Deadline을 전달한다.

## 한 줄 정리
> Executor는 Task와 실행 정책을 분리하고 CompletableFuture는 비동기 결과를 조합합니다.
