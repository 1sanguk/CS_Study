---
difficulty: 3
reading_time: 25분
interview_frequency: 5
importance: 5
---

# 09. Executor·CompletableFuture와 Virtual Thread

> 게임 서버·백엔드 개발자를 위한 CS 면접 교재

## 학습 목표
- ThreadPoolExecutor의 Core/Max Thread·Queue·Rejection Policy 설계 원칙과 Shutdown 순서를 설명할 수 있다.
- CompletableFuture의 thenApply·thenCompose 차이, 실행 Thread 선택, 예외 전파·Cancellation 처리를 설명할 수 있다.
- Virtual Thread(JDK 21)가 해결하는 문제와 CPU-bound·외부 자원(DB Connection Pool, Rate Limit) 한계를 설명할 수 있다.
- 게임 서버에서 I/O-bound 작업(로그인 외부 API)과 CPU-bound 작업(Pathfinding)을 분리하는 설계를 설명할 수 있다.

## 1. 개요
Java에서 동시성 코드를 작성할 때 `new Thread()`를 직접 호출하면 생성·종료·예외·자원 상한을 각자 관리해야 한다. Executor는 Task 제출과 Thread 실행 정책을 분리하고, CompletableFuture는 비동기 결과의 조합·예외 전파를 체계화한다. Virtual Thread(JDK 21)는 I/O 대기가 많은 Thread-per-request 코드를 Platform Thread 수천 개 없이 구현하게 해 준다.

## 2. 왜 필요한가
Thread를 직접 생성하면 개수 상한·Queue·거절 정책·Graceful Shutdown이 없어 OOM·요청 유실이 발생한다. CompletableFuture 없이는 콜백 지옥이나 Blocking join 남용이 생긴다. Virtual Thread 이전에는 Blocking I/O 하나당 Platform Thread 하나가 필요해 수천 개 동시 연결에서 Thread가 고갈됐다.

## 3. 핵심 동작 원리

```text
Task → [bounded Queue] → ThreadPoolExecutor → run
                              │
                              └─ Virtual Thread Executor → JVM scheduler → mount/unmount
                                        │
                              CompletableFuture.supplyAsync()
                                        │
                              .thenApply()  →  .thenCompose()
                                        │
                              .exceptionally() / .handle()
                                        │
                                    결과 / 예외
```

### 1) ThreadPoolExecutor 용량 설계와 Shutdown 순서
`corePoolSize` 이하에서는 Queue가 채워지기 전까지 새 Thread를 만들지 않는다. Queue가 가득 차야 `maximumPoolSize`까지 Thread가 늘어난다. **무제한 LinkedBlockingQueue**를 쓰면 Queue가 항상 여유 있어 maximumPoolSize가 의미 없어지고 Task 지연이 무한히 누적된다. Shutdown은 ① 새 Task 거절(`shutdown`) → ② 대기 Task drain → ③ 응답 없는 Task 강제 중단(`shutdownNow`) 순서가 표준이다.

### 2) thenApply·thenCompose와 실행 Thread 선택
- `thenApply(fn)` : 이전 결과를 동기 변환 (같은 Thread 또는 Common Pool)
- `thenCompose(fn)` : `fn`이 `CompletableFuture<U>`를 반환할 때 중첩을 평탄화
- `thenApplyAsync(fn, executor)` : 지정 Executor에서 실행 → **Blocking 작업은 반드시 별도 Executor 사용**

### 3) join·get 예외 포장과 Cancellation 전파
- `get()` : `ExecutionException`(Checked)으로 포장
- `join()` : `CompletionException`(Unchecked)으로 포장
- `exceptionally(fn)` : 예외만 처리, 정상은 통과
- `handle(fn)` : 정상·예외 모두 처리
- `cancel(true)` : downstream Stage에 `CancellationException` 전파. 이미 외부에 전달된 부작용은 되돌리지 않는다.

### 4) Virtual Thread 특성과 제약
JDK 21에서 정식 도입된 Virtual Thread는 JVM이 관리하는 경량 Thread다. I/O 대기 중 JVM이 Platform Thread에서 **unmount**해 다른 Virtual Thread를 올린다. 따라서 Thread-per-request 코드가 수만 개 동시 실행 가능하다. 단, **CPU-bound 작업**은 빠르게 되지 않으며 **DB Connection Pool** 상한은 별도로 설정해야 한다.

### 5) Pinning 주의사항
`synchronized` 블록 내부 또는 native method 실행 중에는 Virtual Thread가 Platform Thread에 **Pinned**(고정)돼 unmount되지 않는다. 핫 경로의 `synchronized`를 `ReentrantLock`으로 교체하면 Pinning을 줄일 수 있다. JDK 21+에서는 `-Djdk.tracePinnedThreads=full`로 Pinning 구간을 확인한다.

## 4. 쉬운 예시

### 직접 Thread 생성의 문제와 Executor 해결

```java
// BAD: 무제한 Thread 생성 → OOM 위험
for (LoginRequest req : requests) {
    new Thread(() -> callExternalAuth(req)).start(); // 요청마다 Thread 생성
}

// GOOD: 제한된 Pool + bounded Queue
ThreadPoolExecutor ioPool = new ThreadPoolExecutor(
    10,                                // corePoolSize
    50,                                // maximumPoolSize
    60L, TimeUnit.SECONDS,            // keepAliveTime
    new ArrayBlockingQueue<>(200),    // bounded Queue → 가득 차면 Rejection
    new ThreadPoolExecutor.CallerRunsPolicy() // Rejection: 호출자 Thread에서 직접 실행
);
```

### CompletableFuture 체인 — 로그인 처리 예시

```java
ExecutorService ioExecutor = Executors.newVirtualThreadPerTaskExecutor(); // JDK 21
ExecutorService cpuExecutor = Executors.newFixedThreadPool(
    Runtime.getRuntime().availableProcessors()
);

public CompletableFuture<LoginResult> login(LoginRequest req) {
    return CompletableFuture
        // 1) 외부 Auth API 호출 (I/O-bound → Virtual Thread)
        .supplyAsync(() -> authApi.verify(req.token()), ioExecutor)
        // 2) 검증 결과를 DB 조회로 연결 (thenCompose: Future 반환하므로)
        .thenComposeAsync(authResult -> loadPlayerData(authResult.userId()), ioExecutor)
        // 3) 동기 변환 (thenApply: 값 반환하므로)
        .thenApply(playerData -> new LoginResult(playerData, System.currentTimeMillis()))
        // 4) 예외 처리
        .exceptionally(ex -> {
            log.warn("Login failed: {}", ex.getMessage());
            return LoginResult.failed();
        });
}
```

### Virtual Thread + Semaphore로 DB 연결 상한 보호

```java
// Virtual Thread가 많아도 DB Connection은 유한 → Semaphore로 제한
Semaphore dbPermits = new Semaphore(30); // DB Connection Pool 크기와 맞춤

ExecutorService vt = Executors.newVirtualThreadPerTaskExecutor();

CompletableFuture.supplyAsync(() -> {
    dbPermits.acquire(); // 초과 시 대기 (Virtual Thread이므로 Pinning 없이 unmount)
    try {
        return db.query("SELECT ...");
    } finally {
        dbPermits.release();
    }
}, vt);
```

### CPU-bound Pathfinding 격리

```java
// Pathfinding은 CPU 점유 → Platform Thread Pool로 격리
ExecutorService pathPool = Executors.newFixedThreadPool(4); // CPU 코어 수 기준

public CompletableFuture<Path> findPath(Position from, Position to, Instant deadline) {
    return CompletableFuture.supplyAsync(() -> {
        if (Instant.now().isAfter(deadline)) throw new DeadlineExceededException();
        return pathfinder.compute(from, to);
    }, pathPool);
}
```

### Graceful Shutdown 순서

```java
void shutdown(ExecutorService pool) throws InterruptedException {
    pool.shutdown(); // 새 Task 거절, 기존 Task 완료 대기
    if (!pool.awaitTermination(10, TimeUnit.SECONDS)) {
        List<Runnable> dropped = pool.shutdownNow(); // 대기 중인 Task 강제 제거
        log.warn("Dropped {} tasks", dropped.size());
    }
}
```

## 5. 비슷한 개념과 비교

| 구분 | Thread 직접 생성 | ThreadPoolExecutor | Virtual Thread Executor | CompletableFuture |
|------|------------------|-------------------|------------------------|-------------------|
| **Thread 수 상한** | 없음 (OOM 위험) | corePoolSize ~ max | JVM 관리 (수만 개) | N/A (실행 주체 아님) |
| **Queue** | 없음 | Bounded/Unbounded 선택 | 없음 (Task당 VT) | N/A |
| **I/O 대기 효율** | Thread 낭비 | Thread 낭비 | unmount → 효율적 | N/A |
| **CPU-bound** | 적합 (코어 수 고정 시) | 적합 | 이득 없음 | N/A |
| **비동기 조합** | 불가 | 불가 | 불가 | thenApply/Compose |
| **예외 전파** | 수동 | 수동 | 수동 | exceptionally/handle |
| **Pinning 위험** | 없음 | 없음 | synchronized 내부 | N/A |

| CompletableFuture 메서드 | 용도 | 실행 Thread |
|--------------------------|------|-------------|
| `thenApply(fn)` | 동기 변환 | 이전 Stage Thread 또는 Common Pool |
| `thenApplyAsync(fn, ex)` | 비동기 변환 | 지정 Executor |
| `thenCompose(fn)` | Future 반환 단계 평탄화 | 이전 Stage Thread 또는 Common Pool |
| `exceptionally(fn)` | 예외만 처리 | 이전 Stage Thread |
| `handle(fn)` | 정상·예외 모두 처리 | 이전 Stage Thread 또는 Common Pool |
| `whenComplete(fn)` | 사이드이펙트, 결과 통과 | 이전 Stage Thread |

## 6. 장점과 단점

**Executor 장점**
- Task·실행 정책 분리 → 테스트에서 다른 Executor 주입 가능
- Thread 수·Queue·Rejection 중앙 관리
- Graceful Shutdown 체계화

**Executor 단점**
- corePoolSize·maximumPoolSize·Queue 크기 설정이 어렵고 측정 없이 튜닝하면 역효과
- Thread 수는 제한되지만 Queue에 Task가 쌓이면 OOM은 여전히 가능

**CompletableFuture 장점**
- 비동기 결과 조합이 선언적
- 예외 전파·타임아웃을 Chain에 통합

**CompletableFuture 단점**
- 실행 Thread 선택(Async 접미사 유무) 실수 시 Common Pool Blocking
- Stack trace가 분산돼 디버깅 어려움
- `cancel()`이 외부 부작용을 롤백하지 않음

**Virtual Thread 장점**
- Thread-per-request 코드 그대로 유지하면서 수만 개 동시 실행
- I/O 대기 중 Platform Thread 반환 → Platform Thread 수 대폭 감소

**Virtual Thread 단점**
- `synchronized` 내 Pinning → `ReentrantLock`으로 교체 필요
- CPU-bound 작업에는 이득 없음
- DB·외부 API 같은 외부 자원 한계는 Semaphore·Pool로 별도 보호 필요
- ThreadLocal 대량 사용 시 메모리 증가 (Virtual Thread마다 복사본)

## 7. 게임 서버·백엔드 실무 예시

**로그인 파이프라인**: `External Auth API(VT)` → `DB 조회(VT + Semaphore)` → `Session 발급` → CompletableFuture 체인으로 연결, 각 단계에 Deadline 전달.

**Pathfinding 격리**: CPU-bound이므로 `newFixedThreadPool(cores)` 별도 Pool. Virtual Thread Pool과 혼용하지 않아 CPU 포화 시 다른 요청에 영향 없음.

**Fire-and-forget 실패 방지**: 로그 저장 등 완료를 기다리지 않는 Future는 `whenComplete`로 예외를 반드시 로깅. 예외가 조용히 삼켜지면 운영 중 원인 추적 불가.

**부하 테스트 항목**: 처리량(TPS)·p99 지연·VT 수·Semaphore 대기 수·Platform Thread Pinning 발생 횟수를 동일 시간축에서 관찰.

## 8. 자주 하는 오해

- **"Virtual Thread면 Thread 수 제한이 필요 없다"**: Virtual Thread 수는 늘릴 수 있지만 DB Connection Pool, 외부 API Rate Limit 같은 외부 자원 상한은 그대로다. Semaphore나 Connection Pool로 별도 보호해야 한다.
- **"maximumPoolSize를 크게 설정하면 동시 처리가 늘어난다"**: 기본 `LinkedBlockingQueue` 사용 시 Queue가 항상 여유 있어 maximumPoolSize까지 Thread가 올라가지 않는다. Bounded Queue를 써야 maximumPoolSize가 작동한다.
- **"thenApply는 항상 별도 Thread에서 실행된다"**: `thenApply`(Async 접미사 없음)는 이전 Stage가 완료된 Thread에서 직접 실행될 수 있다. I/O나 Blocking 작업을 `thenApply`에 넣으면 Common Pool이나 호출 Thread를 막는다.
- **"CompletableFuture.cancel()이 진행 중인 HTTP 요청도 취소한다"**: `cancel()`은 Future 내부 상태만 변경한다. 이미 전송된 외부 요청·DB 쿼리는 취소되지 않으며 Downstream Callback이 취소 후 상태를 Commit하지 않도록 버전 확인이 필요하다.
- **"Virtual Thread는 synchronized에서 문제없다"**: `synchronized` 블록 내 I/O 대기 중에는 Virtual Thread가 Platform Thread에 Pinned돼 unmount 안 된다. 핫 경로는 `ReentrantLock`으로 교체해야 Pinning을 피할 수 있다.
- **"Fire-and-forget CompletableFuture는 예외가 자동 로깅된다"**: 결과를 소비하지 않으면 예외가 조용히 사라진다. `whenComplete((r, ex) -> { if (ex != null) log.error(...); })`로 반드시 관찰해야 한다.
- **"Virtual Thread를 쓰면 ThreadLocal 비용이 없다"**: Virtual Thread마다 ThreadLocal 복사본이 생성된다. 수만 개 Virtual Thread에 대용량 ThreadLocal이 있으면 메모리 사용이 급증한다. `ScopedValue`(JDK 21 Preview)로 대체를 검토한다.

## 9. 면접 질문

### Q1. Executor를 직접 Thread 생성보다 선호하는 이유는 무엇인가요?
Task 제출과 Thread 실행 정책(수·Queue·Rejection·Shutdown)을 분리해 자원을 중앙에서 제한할 수 있기 때문입니다. `new Thread()` 직접 호출은 개수 상한·Graceful Shutdown이 없어 OOM·요청 유실 위험이 있습니다.

### Q2. thenApply와 thenCompose의 차이는 무엇인가요?
`thenApply(fn)`은 결과를 동기 변환해 `CompletableFuture<U>`를 반환하고, `thenCompose(fn)`은 fn 자체가 `CompletableFuture<U>`를 반환할 때 중첩 없이 평탄화합니다. DB 조회처럼 다음 단계도 비동기라면 `thenCompose`를 써야 `CompletableFuture<CompletableFuture<U>>`가 생기지 않습니다.

### Q3. CompletableFuture 예외는 어떻게 처리하나요?
`exceptionally(fn)`은 예외가 발생한 경우에만 처리하고 정상 결과는 통과시킵니다. `handle(fn)`은 정상·예외 모두 받아 분기 처리할 수 있습니다. `whenComplete`는 사이드이펙트용이며 결과를 그대로 통과시킵니다. Fire-and-forget Future는 `whenComplete`로 예외를 반드시 로깅해야 합니다.

### Q4. Virtual Thread의 장점과 한계는 무엇인가요?
JDK 21에서 I/O 대기 중 Platform Thread에서 unmount해 수만 개 동시 Task를 적은 Platform Thread로 처리합니다. 단, CPU-bound 작업 속도는 빨라지지 않으며, DB Connection Pool·외부 API Capacity 같은 외부 자원 한계는 Semaphore나 Pool로 별도 보호해야 합니다.

### Q5. 게임 서버에서 I/O-bound와 CPU-bound 작업을 어떻게 분리하나요?
외부 API 호출·DB 조회 같은 I/O-bound는 `Executors.newVirtualThreadPerTaskExecutor()`로 처리하고, Pathfinding·물리 연산 같은 CPU-bound는 `newFixedThreadPool(cores)`로 격리합니다. 두 Pool을 분리하면 CPU 포화가 I/O 대기 Task에 영향을 주지 않습니다.

### Q6. ThreadPoolExecutor에서 maximumPoolSize가 제대로 작동하지 않는 경우는 언제인가요?
기본 `LinkedBlockingQueue`는 용량 제한이 없어 Queue가 항상 비어 있는 것처럼 보이기 때문입니다. `ThreadPoolExecutor`는 Queue가 **가득 찼을 때**만 maximumPoolSize까지 Thread를 추가합니다. 따라서 무제한 Queue에서는 Thread 수가 corePoolSize에서 늘어나지 않습니다. `ArrayBlockingQueue(n)`처럼 Bounded Queue를 사용해야 maximumPoolSize가 의도대로 작동합니다.

## 10. 예상 꼬리질문

- `CallerRunsPolicy`와 `AbortPolicy`·`DiscardPolicy` 중 어떤 기준으로 선택하나요?
- Common Fork/Join Pool을 Blocking 작업에 쓰면 어떤 문제가 생기나요?
- `CompletableFuture.allOf`와 `anyOf`의 예외 동작 차이는 무엇인가요?
- Virtual Thread에서 `synchronized`로 Pinning이 발생하면 어떻게 진단하나요?
- `get(timeout)`과 `orTimeout()`의 차이는 무엇인가요?
- Semaphore로 DB 연결을 제한할 때 Virtual Thread에서 `acquire()`가 Blocking되면 Platform Thread를 잡나요?
- `ThreadLocal`을 Virtual Thread에서 쓸 때 메모리 문제가 생기는 이유와 대안은 무엇인가요?

## 11. 30초 모범답변
> Executor는 Task와 실행 정책을 분리해 Thread 수·Queue·Rejection을 중앙 관리합니다. CompletableFuture는 비동기 결과 조합·예외 전파를 체인으로 표현합니다. Virtual Thread는 JDK 21에서 도입돼 I/O 대기 중 Platform Thread를 반환하므로 수만 개 동시 연결을 적은 자원으로 처리할 수 있습니다. 단, CPU-bound와 외부 자원(DB Connection, Rate Limit) 상한은 별도로 관리해야 합니다.

## 12. 1~2분 확장답변
> `new Thread()` 직접 생성은 개수 상한과 Graceful Shutdown이 없어 OOM·요청 유실 위험이 있습니다. ThreadPoolExecutor는 corePoolSize·maximumPoolSize·Bounded Queue·Rejection Policy로 자원을 제한하고, 이 설계가 제대로 작동하려면 무제한 LinkedBlockingQueue 대신 ArrayBlockingQueue를 써야 maximumPoolSize가 의미 있습니다.
>
> CompletableFuture에서 `thenApply`는 동기 변환, `thenCompose`는 다음 단계도 비동기일 때 평탄화에 씁니다. Blocking 작업을 `thenApplyAsync(fn, ioExecutor)`처럼 별도 Executor를 명시하지 않으면 Common Pool을 막습니다. Fire-and-forget Future는 `whenComplete`로 예외를 반드시 관찰해야 합니다.
>
> Virtual Thread는 I/O 대기 중 Platform Thread에서 unmount해 수만 개 동시 Task를 소수의 Platform Thread로 처리합니다. 게임 서버에서는 로그인 외부 API·DB 조회를 Virtual Thread Pool에서 처리하고, Pathfinding처럼 CPU를 오래 쓰는 작업은 `fixedThreadPool(cores)`로 격리합니다. Virtual Thread가 많아도 DB Connection은 유한하므로 Semaphore나 Connection Pool로 상한을 두어야 합니다. `synchronized` 내부에서 I/O 대기가 발생하면 Pinning이 생기므로 핫 경로는 `ReentrantLock`으로 교체합니다.

## 13. 핵심 요약
- ThreadPoolExecutor는 corePoolSize·maximumPoolSize·Queue·RejectionPolicy로 Thread 수와 부하를 제어한다.
- 무제한 `LinkedBlockingQueue`를 쓰면 Queue가 항상 여유 있어 maximumPoolSize가 작동하지 않는다. `ArrayBlockingQueue`(Bounded)를 써야 한다.
- `thenApply`는 동기 변환, `thenCompose`는 다음 단계도 `CompletableFuture`를 반환할 때 중첩 제거용이다.
- Blocking 작업은 반드시 `thenApplyAsync(fn, executor)`처럼 별도 Executor를 지정해 Common Pool을 보호한다.
- Fire-and-forget `CompletableFuture`는 `whenComplete`로 예외를 관찰하지 않으면 실패가 조용히 사라진다.
- Virtual Thread는 I/O 대기 중 Platform Thread를 반환해 수만 개 동시 Task를 적은 자원으로 처리하지만, CPU-bound 속도나 외부 자원 용량을 늘리지는 않는다.
- DB Connection·외부 API 같은 외부 자원은 Virtual Thread가 많아도 Semaphore·Connection Pool로 별도 상한을 둬야 한다.
- `synchronized` 내 I/O 대기는 Virtual Thread를 Platform Thread에 Pinning시킨다. 핫 경로는 `ReentrantLock`으로 교체한다.

## 한 줄 정리
> Executor는 Task와 실행 정책을 분리하고, CompletableFuture는 비동기 결과를 조합하며, Virtual Thread는 I/O 대기를 경량화하지만 외부 자원 상한은 별도로 보호해야 한다.
