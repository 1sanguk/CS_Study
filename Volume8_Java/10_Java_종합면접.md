---
difficulty: 3
reading_time: 25분
interview_frequency: 5
importance: 5
---

# 10. Java 종합면접

> 게임 서버·백엔드 개발자를 위한 CS 면접 교재

## 학습 목표
- 로그인 요청 처리에서 JIT Warm-up 전 지연·HashMap hashCode 계약 위반·volatile Snapshot 가시성 문제가 각각 어느 계층에서 발생하는지 판단하고 진단 도구를 결정할 수 있다.
- 게임 서버 p99 Latency 급등 시 GC Pause·Thread Dump·Executor Queue·외부 I/O·JFR CPU Profile 중 증상에 따른 확인 우선순위를 결정할 수 있다.
- Room 상태 공유 설계에서 복합 불변식 보호 필요성과 Lock Contention 비용을 기준으로 synchronized·AtomicReference·Room Owner 패턴 중 적합한 방식을 결정할 수 있다.
- 운영 중 Heap이 지속 증가할 때 MAT Dominator Tree에서 GC Root 참조 경로를 역추적하고 전역 Map remove 누락·static Listener·ThreadLocal 미해제 중 원인을 결정할 수 있다.

## 1. 개요
Java 면접의 핵심은 문법 암기가 아니라 Source → JVM 실행 → 객체·Type → Collection → GC → 동시성·비동기 처리를 **하나의 서버 요청 흐름**으로 연결하는 것이다. 각 계층에서 어떤 비용이 발생하고, 어디서 정확성이 깨질 수 있으며, 장애 시 무엇을 측정해야 하는지 설명할 수 있어야 한다.

## 2. 왜 필요한가
개별 개념을 아는 것과 "실제 서버에서 어떻게 연결되는가"를 설명하는 것은 다르다. 면접관은 JVM 동작·Collection 설계·동기화 선택·GC 진단을 분리된 암기 항목이 아니라, 하나의 시스템 설계 판단력으로 연결할 수 있는지를 본다.

## 3. 핵심 동작 원리

```text
[요청 수신]
    │
    ▼
[Class Loading + JIT Warm-up]  ← Hot Path는 C2 최적화
    │
    ▼
[역직렬화 → Immutable DTO(record)]  ← Pass-by-value, equals/hashCode
    │
    ▼
[Service Logic]
    ├─ Collection (HashMap/ConcurrentHashMap/PriorityQueue)
    ├─ Generic API (PECS, Type Erasure 주의)
    ├─ Exception 경계 (Checked→Unchecked 변환, try-with-resources)
    └─ 공유 상태 (synchronized / Atomic / Room Owner 패턴)
    │
    ▼
[외부 I/O] ← Virtual Thread or CompletableFuture chain
    ├─ DB (Connection Pool + Semaphore 상한)
    └─ 외부 API (thenCompose, Deadline 전파)
    │
    ▼
[응답 직렬화 + GC]
    ├─ Young GC (짧은 Pause)
    ├─ Old GC / Full GC (p99 영향)
    └─ Metaspace / Native Memory 추세 관찰
```

### 1) Class Loading과 JIT 최적화
클래스는 최초 사용 시 로드되며 `static` 초기화 블록이 실행된다. Hot Method는 C1(클라이언트)→C2(서버) JIT으로 점진 최적화된다. 서버 시작 직후 응답이 느린 이유가 JIT Warm-up 때문임을 알아야 한다.

### 2) 정확성 계약 — equals·hashCode·Generic·Exception
- `HashMap` Key로 쓰는 객체는 `equals`·`hashCode` 계약을 지켜야 하고 삽입 후 Hash에 영향을 주는 필드를 변경하면 안 된다.
- Generic `List<T>` → `List`(Raw Type) 변환 시 Heap Pollution이 생긴다.
- `Checked Exception`은 복구 가능한 경계에서, `Unchecked`는 프로그래밍 오류에 사용하며 계층 경계를 넘을 때 Exception Translation을 적용한다.

### 3) 공유 상태 동기화
- `volatile`: 가시성만 보장, 복합 연산 불가
- `AtomicInteger`: 단일 값 CAS, 복합 불변식 불가
- `synchronized`: 복합 불변식 보호, 성능 비용
- Room Owner: 하나의 Thread가 상태 소유, Lock 없이 단순화

### 4) 비동기 실행 선택
- I/O-bound: `Executors.newVirtualThreadPerTaskExecutor()` (JDK 21)
- CPU-bound: `newFixedThreadPool(cores)`
- 단계 조합: `CompletableFuture.thenCompose` + 별도 Executor 지정
- 외부 자원 상한: `Semaphore` 또는 Connection Pool

### 5) GC와 운영 진단
- p99 증가 시: GC Pause → Thread Dump → Executor Queue → 외부 I/O 순서로 확인
- Heap 증가 지속: GC Root 참조 유지(Global Registry Leak), Heap Dump Dominator 분석
- Metaspace 증가: 동적 Class 생성 과다 (Reflection, Proxy, 직렬화 라이브러리)

## 4. 쉬운 예시

### 게임 서버 로그인 요청 처리 — 전체 흐름 코드

```java
// 1) Immutable DTO (Pass-by-value, equals/hashCode 자동 생성)
public record LoginRequest(String token, String clientVersion) {}

// 2) Exception 경계 정의
public class AuthException extends RuntimeException {  // Unchecked
    public AuthException(String msg, Throwable cause) { super(msg, cause); }
}

// 3) Service — Collection, Generic, 비동기 조합
@Service
public class LoginService {
    private final ConcurrentHashMap<String, Session> sessions = new ConcurrentHashMap<>();
    private final Semaphore dbPermits = new Semaphore(30); // DB Pool 상한
    private final ExecutorService vtExecutor =
        Executors.newVirtualThreadPerTaskExecutor(); // JDK 21

    public CompletableFuture<LoginResult> login(LoginRequest req) {
        return CompletableFuture
            // I/O: 외부 Auth API (Virtual Thread)
            .supplyAsync(() -> verifyToken(req.token()), vtExecutor)
            // I/O: DB 조회 (Virtual Thread + Semaphore)
            .thenComposeAsync(userId -> loadPlayer(userId), vtExecutor)
            // 동기 변환
            .thenApply(player -> {
                // HashMap 복합 연산 → compute로 원자적 처리
                sessions.compute(player.id(), (k, existing) ->
                    existing != null ? existing.refresh() : new Session(player)
                );
                return new LoginResult(player);
            })
            // Exception Translation
            .exceptionally(ex -> {
                throw new AuthException("Login failed", ex);
            });
    }

    private PlayerData loadPlayer(String userId) {
        dbPermits.acquireUninterruptibly();
        try {
            return db.findPlayer(userId); // try-with-resources 내부에서 Connection 관리
        } finally {
            dbPermits.release();
        }
    }
}
```

### 공유 Room 상태 — Room Owner 패턴

```java
// 하나의 Worker Thread가 Room 소유 → synchronized 없이 안전
public class GameRoom {
    private final BlockingQueue<PlayerAction> inbox = new LinkedBlockingQueue<>();
    private volatile RoomSnapshot snapshot; // 읽기 전용 공유용

    // Room Owner Thread만 실행 (단일 Thread → 복합 불변식 안전)
    public void tick() {
        PlayerAction action;
        while ((action = inbox.poll()) != null) {
            applyAction(action);
        }
        // 다른 Thread가 읽을 상태는 Immutable Snapshot으로 노출
        snapshot = new RoomSnapshot(players, scores);
    }

    // 다른 Thread에서 호출: Thread-safe (volatile 읽기)
    public RoomSnapshot getSnapshot() { return snapshot; }

    // 다른 Thread에서 호출: BlockingQueue는 Thread-safe
    public void submit(PlayerAction action) { inbox.offer(action); }
}
```

### Memory Leak 패턴과 수정

```java
// BAD: 전역 Map에 Session 추가만 하고 제거 안 함 → Leak
static Map<String, Session> sessions = new HashMap<>();
sessions.put(playerId, new Session()); // 로그아웃 시 remove() 없음

// GOOD: 명시적 제거 또는 WeakHashMap
static Map<String, Session> sessions = new ConcurrentHashMap<>();

public void logout(String playerId) {
    sessions.remove(playerId); // 반드시 제거
}

// 또는: Key가 GC되면 자동 제거 (Session이 다른 곳에서 참조 안 될 때)
Map<String, Session> cache = new WeakHashMap<>();
```

## 5. 비슷한 개념과 비교

### 동기화 방법 선택

| 방법 | 보장 | 복합 불변식 | 성능 | 게임 서버 적합 사례 |
|------|------|------------|------|-------------------|
| `volatile` | 가시성만 | 불가 | 매우 빠름 | Snapshot 공유 읽기 |
| `AtomicInteger` | 단일 값 CAS | 불가 | 빠름 | 연결 수·카운터 |
| `AtomicReference` | 참조 교체 CAS | Immutable 전체 교체 | 빠름 | Room 상태 Snapshot |
| `synchronized` | 복합 불변식 | 가능 | Lock 경합 시 느림 | 짧은 임계 구역 |
| Room Owner | 소유권 격리 | Thread 내 자유 | 높음 | GameRoom Tick |

### 실행 전략 선택

| 방법 | 적합한 작업 | Thread 수 | 외부 자원 상한 |
|------|-----------|-----------|--------------|
| `newFixedThreadPool(n)` | CPU-bound | CPU 코어 수 | N/A |
| `newVirtualThreadPerTaskExecutor` | I/O-bound | JVM 관리 | Semaphore 필수 |
| `CompletableFuture` | 비동기 조합 | Executor에 위임 | 각 단계별 |

### GC Collector 선택

| GC | Pause | 처리량 | 적합 사례 |
|----|-------|--------|---------|
| Serial | 길다 | 낮음 | 단일 코어 |
| G1GC | 중간 (기본) | 중간 | 일반 서버 |
| ZGC | 매우 짧음 | 중간 | p99 민감 서버 |
| Shenandoah | 매우 짧음 | 중간 | OpenJDK 중심 배포 |

## 6. 장점과 단점

**Java의 장점**
- 강한 정적 타입 + Generic으로 Compile Time 오류 조기 발견
- GC가 메모리 해제를 자동화해 Leak 경로를 줄임
- JVM 생태계(JFR, JMC, jmap, jstack)로 운영 진단 표준화
- Virtual Thread(JDK 21)로 Thread-per-request 단순성 유지

**Java의 단점**
- JIT Warm-up 전 초기 응답 지연
- GC Pause가 p99에 영향 (특히 Full GC)
- Boxing(Autoboxing) 비용 — Hot Path에서 Primitive 배열 대신 `Integer[]` 사용 시 GC 부담
- Virtual Thread의 `synchronized` Pinning — `ReentrantLock` 교체 필요

**설계 Trade-off**
- 추상화(Interface·Generic)는 유연성 ↑, 런타임 복잡도 ↑
- Immutable DTO는 안전성 ↑, 잦은 복사 비용
- Bounded Queue는 안정성 ↑, Backpressure 설계 필요

## 7. 게임 서버·백엔드 실무 예시

**로그인 파이프라인**: Token 검증(외부 API, Virtual Thread) → Player 조회(DB, Semaphore 30) → Session 등록(ConcurrentHashMap.compute) → LoginResult 반환. 각 단계에 Deadline(`orTimeout`) 적용.

**Room Tick**: GameRoom이 inbox(BlockingQueue)에서 Action을 소비, 내부 상태를 Mutable하게 변경, Tick 종료 후 Immutable Snapshot을 `volatile`로 노출. 읽기 Thread는 Lock 없이 Snapshot 사용.

**Pathfinding**: CPU-bound이므로 `newFixedThreadPool(4)` 격리. Virtual Thread Pool과 혼용 시 CPU 포화가 I/O 처리에 영향.

**운영 진단 순서**: p99 증가 → GC Pause 확인 → Thread Dump(Lock 경합·Queue 적체) → Executor Queue 길이 → 외부 I/O 응답 시간 → CPU Profile(JFR).

## 8. 자주 하는 오해

- **"Java는 Pass-by-reference라 객체가 공유된다"**: Java는 항상 Pass-by-value다. 참조(주소값)를 복사해 전달하므로, 메서드 내에서 참조를 다른 객체로 교체해도 호출자의 변수는 바뀌지 않는다.
- **"synchronized를 쓰면 가시성과 원자성이 모두 해결된다"**: 맞지만, 다른 Thread가 같은 Lock으로 synchronized하지 않으면 보호되지 않는다. Lock 객체가 달라지면 의미 없다.
- **"GC가 있으면 Memory Leak이 없다"**: GC는 GC Root에서 도달 가능한 객체를 해제하지 않는다. 전역 Map에서 remove하지 않은 Session, static 필드의 리스너 등은 Leak이다.
- **"Virtual Thread를 쓰면 DB 연결 문제가 자동 해결된다"**: Virtual Thread 수는 늘릴 수 있지만 DB Connection Pool은 유한하다. Semaphore나 Pool로 상한을 두지 않으면 DB 연결 고갈이 발생한다.
- **"HashMap은 Thread-safe하지 않으니 항상 ConcurrentHashMap을 써야 한다"**: 읽기·쓰기가 단일 Thread에서만 일어나는 경우(예: Room Owner 내부 상태)에는 HashMap이 더 빠르다. ConcurrentHashMap도 복합 연산(`get` 후 `put`)은 원자적이지 않다.
- **"Checked Exception을 모두 Unchecked로 바꾸면 코드가 깔끔해진다"**: 복구 가능한 오류(DB 연결 실패, 파일 없음)를 Unchecked로 바꾸면 호출자가 처리 의무를 잊게 된다. 경계에서 의미 있는 Exception Translation이 중요하다.
- **"thenApply Async 접미사 없이도 별도 Thread에서 실행된다"**: `thenApply`는 이전 Stage를 완료한 Thread에서 직접 실행될 수 있다. Blocking 작업을 `thenApply`에 넣으면 Common Pool Thread를 막는다. 반드시 `thenApplyAsync(fn, ioExecutor)` 형태로 Executor를 명시한다.

## 9. 면접 질문

### Q1. 게임 서버 새 배포 직후 5분간 p99 Latency가 평소의 5배이다가 자연스럽게 정상화됩니다. JIT Warm-up 이외에 어떤 원인이 있을 수 있고 어떻게 단축합니까?
JIT 외 원인: ① Class Loading 폭발(최초 요청 시 수천 개 Class 로드). ② JVM Young GC 초기화(Heap 세팅 전 Full GC). ③ Connection Pool 초기화(DB·외부 API Cold Connection). ④ CPU Profile 수집이 활성화된 경우 Profiler 오버헤드. 단축 방법: ① `-XX:+TieredCompilation -XX:ReservedCodeCacheSize=256m`으로 JIT Cache 확보. ② `java -Xshare:on` + AppCDS로 Class Loading 캐시. ③ Warmup 전용 요청(로그인 더미 흐름 5회)을 배포 후 자동 실행하는 Readiness Probe 설계. ④ Connection Pool `minimumIdle` 설정으로 배포 전 연결 미리 준비.

### Q2. 로그인 세션 Map에서 플레이어 UUID를 Key로 쓰는데 relogin 시 세션 조회가 null을 반환합니다. Session 객체를 equals·hashCode를 Override해서 Map Key로 쓰다가 Mutable Field(닉네임)를 변경한 상황입니다. 원인과 수정 방법은 무엇입니까?
원인: `hashCode`가 닉네임 Field 기반이면 닉네임 변경 후 Hash Bucket이 바뀝니다. `get(session)`은 바뀐 Hash로 새 Bucket을 탐색하지만 객체는 이전 Bucket에 있어 null을 반환합니다. 수정: ① Session Key를 Immutable UUID(String)로 교체 — `sessions.get(session.getUUID())`. ② `record SessionKey(UUID id) {}`처럼 불변 Key 객체를 별도 정의. ③ Session의 `hashCode`를 `UUID` 기반으로만 구현 + 닉네임을 Key 계산에서 제외. CI 방지: SpotBugs `HE_INHERITS_EQUALS_USE_HASHCODE`·SonarQube `S2061` 룰 활성화.

### Q3. 게임 서버 Heap 사용량이 48시간 동안 1GB/일 속도로 증가하고 Full GC 후에도 회수가 안 됩니다. 진단 순서와 먼저 의심해야 할 패턴은 무엇입니까?
진단 순서: ① GC Log에서 Old 영역 증가 추세 확인. ② `jcmd <pid> VM.native_memory`로 Heap·Metaspace·Thread Stack 각 항목 추세. ③ `jmap -dump:format=b,file=heap.hprof <pid>` Heap Dump 수집. ④ Eclipse MAT Dominator Tree에서 Retained Heap 상위 5개 객체와 Root 참조 Chain 확인. 의심 패턴 순서: ① Static Map에 `sessions.put()` 후 `remove()` 누락. ② EventBus·Listener에 unregister 없는 Handler 누적. ③ Thread Pool ThreadLocal에 `remove()` 없는 누적. ④ Metaspace 증가 시 ClassLoader Leak(동적 Class 생성).

### Q4. GameRoom Tick p99 Latency가 특정 Room에서만 50ms로 급등합니다. async-profiler 결과 `synchronized(room)` Monitor Wait이 80%를 차지합니다. 원인 분석과 Room Owner 패턴으로 전환 설계는 무엇입니까?
원인: 다수 I/O Thread가 동일 Room의 `synchronized` Monitor를 경합합니다. 특히 DB 조회나 외부 API 호출이 `synchronized` 블록 안에 있으면 Lock 보유 시간이 길어져 대기가 폭증합니다. Room Owner 전환 설계: ① Room마다 `BlockingQueue<PlayerAction> inbox` 추가. ② 단일 Worker Thread(`ScheduledExecutorService`)가 Tick마다 `inbox.drainTo(batch)`로 Action을 일괄 소비. ③ I/O Thread는 `inbox.offer(action)`으로만 접근(Thread-safe). ④ 읽기 전용 상태는 `volatile RoomSnapshot`으로 노출 — I/O Thread가 Lock 없이 읽기. `synchronized` 완전 제거 후 async-profiler 재측정으로 Monitor Wait 0% 확인.

### Q5. 로그인 파이프라인 `Auth(500ms) → DB(200ms) → Session 등록` thenCompose 체인에서 DB 단계가 간헐적으로 완료되지 않고 스레드가 무한 대기합니다. 원인 진단과 전체 체인에 Deadline을 전파하는 방법은 무엇입니까?
원인 의심: ① DB Connection Pool 고갈(Semaphore 없는 Virtual Thread 수만 개). ② DB Connection Timeout 미설정으로 무한 대기. ③ `thenComposeAsync` 실행 Executor Thread 고갈. 진단: `jstack`에서 BLOCKED 상태 Thread·DB Driver Stack 확인. `jcmd VM.native_memory`에서 Thread 수 확인. Deadline 전파: `CompletableFuture.supplyAsync(() -> auth(req), vtExecutor).orTimeout(500, MILLISECONDS).thenComposeAsync(userId -> loadPlayer(userId), vtExecutor).orTimeout(700, MILLISECONDS)` — 각 단계별 누적 Deadline 설정. 또는 `Instant deadline`을 파라미터로 전달해 각 단계 시작 전 `if (Instant.now().isAfter(deadline)) throw new DeadlineExceededException()` 검사.

### Q6. 운영 장애 발생 후 5분 안에 GC·Thread·Queue·외부 I/O 관점에서 어떤 지표를 어떤 도구로 먼저 확인합니까?
1단계(30초): `kubectl top pod` → CPU·메모리 급등 여부. Prometheus `http_request_duration_seconds_p99` → 어느 엔드포인트에서 급등 시작. 2단계(1분): GC Log `Xlog:gc*` → Old 영역 Full GC Pause 시각이 p99 급등과 일치 여부. 3단계(2분): `jstack <pid>` → BLOCKED/WAITING Thread 수·Lock 보유 Thread 스택 확인. 4단계(3분): Executor Queue 길이 Metric(`executor.queue.size`) → Task 누적 추세. 5단계(4분): DB 응답 시간 Metric·외부 API p99. 6단계(5분): JFR `cpu` + `lock` 이벤트 1분 수집 후 JMC로 Hot Method·Lock Contention 분석. 진단 결론을 Slack 채널에 5분 내 초안 공유.

## 10. 예상 꼬리질문

- JIT Warm-up 단축을 위해 CDS(Class Data Sharing)와 AppCDS를 적용하는 절차와 GraalVM AOT 대비 Trade-off는 무엇입니까?
- `ConcurrentHashMap.compute`가 `get` 후 `put`보다 안전한 이유와 compute 내부에서 DB I/O가 있을 때 발생하는 문제는 무엇입니까?
- `try-with-resources`에서 `close()` 도중 예외가 발생하면 원래 예외와 close 예외가 어떻게 처리되고 `getSuppressed()`로 어떻게 꺼냅니까?
- G1GC Full GC 500ms가 발생하는 상황에서 ZGC로 전환하기 전 `G1HeapRegionSize` 조정과 `InitiatingHeapOccupancyPercent` 낮추기를 먼저 시도하는 이유는 무엇입니까?
- Room Owner 패턴에서 inbox `ArrayBlockingQueue`가 가득 찰 때 Action Drop vs Sender 대기 중 어떤 기준으로 선택하고 Drop 발생 시 Prometheus Alert 임계값은 어떻게 설정합니까?
- Virtual Thread Pinning과 synchronized Monitor Wait을 동시에 진단할 때 JFR `jdk.VirtualThreadPinned`와 `jdk.JavaMonitorWait` 이벤트를 함께 분석하는 방법은 무엇입니까?
- 동시성 버그를 CI에서 사전 탐지하기 위해 SpotBugs `@GuardedBy`·Error Prone `@Immutable`·ThreadSafe Annotation 중 어떤 조합을 적용하고 각각의 탐지 범위와 False Positive 비율은 어떻습니까?

## 11. 30초 모범답변
> Java 서버는 JVM에서 Bytecode를 실행하고 Hot Path를 JIT 최적화하며 GC로 객체를 회수합니다. 정확성은 equals·hashCode·Generic·Exception·Happens-before 계약에서 나오고, 공유 상태는 synchronized·Atomic·Room Owner 패턴으로 보호합니다. 외부 I/O는 Virtual Thread나 CompletableFuture로 처리하되 DB 연결 같은 외부 자원은 Semaphore로 상한을 둡니다. 운영에서는 GC Pause·Thread·Queue·외부 I/O를 동일 시간축에서 관찰합니다.

## 12. 1~2분 확장답변
> 요청이 들어오면 Class Loading과 JIT Warm-up을 거쳐 Immutable DTO로 역직렬화됩니다. Service 계층에서 Collection 선택(HashMap vs ConcurrentHashMap vs PriorityQueue)과 Generic API의 Type Erasure 한계를 이해하고, Checked·Unchecked Exception을 복구 경계에 맞게 구분하며 try-with-resources로 자원을 닫습니다.
>
> 공유 상태는 volatile(가시성만)·AtomicInteger(단일 CAS)·synchronized(복합 불변식)를 목적에 맞게 구분하고, GameRoom처럼 복잡한 상태는 Room Owner 패턴으로 소유권을 격리합니다.
>
> 외부 I/O는 Virtual Thread(`newVirtualThreadPerTaskExecutor`)로 단순하게 처리하되, DB Connection은 유한하므로 Semaphore로 30개 상한을 둡니다. CPU-bound Pathfinding은 `fixedThreadPool(cores)`로 격리해 I/O 처리에 영향을 주지 않습니다. CompletableFuture 체인에서 Blocking 단계는 반드시 별도 Executor를 지정하고 Fire-and-forget Future는 `whenComplete`로 예외를 관찰합니다.
>
> 운영에서 p99가 증가하면 GC Pause → Thread Dump → Executor Queue → 외부 I/O → JFR CPU Profile 순서로 확인합니다. Heap이 지속 증가하면 Heap Dump Dominator Tree로 GC Root 참조 경로를 역추적합니다.

## 13. 핵심 요약
- Java 서버 설명은 `요청 수신 → Class Loading → JIT → 역직렬화 → Service → 외부 I/O → GC → 응답` 흐름으로 시작한다.
- equals·hashCode 계약 위반은 HashMap 조회 실패로 이어지고, Raw Type 혼용은 Runtime ClassCastException(Heap Pollution)을 유발한다.
- Checked Exception은 복구 가능 경계에, Unchecked는 프로그래밍 오류에 쓰며 계층 경계에서 Exception Translation을 적용한다.
- `volatile`은 가시성만, `AtomicInteger`는 단일 CAS, `synchronized`는 복합 불변식, Room Owner는 소유권 격리로 구분한다.
- Blocking 작업을 `thenApply`에 넣으면 Common Pool이 막힌다. `thenApplyAsync(fn, ioExecutor)`로 Executor를 명시한다.
- Virtual Thread는 I/O-bound에 적합하고 CPU-bound는 `fixedThreadPool(cores)` 격리, 외부 자원은 Semaphore·Pool로 상한을 둔다.
- GC는 GC Root에서 도달 가능한 객체를 해제하지 않는다. 전역 Map에서 `remove`를 빠뜨리면 Leak이다.
- p99 증가 진단 순서: GC Pause → Thread Dump(Lock 경합) → Executor Queue → 외부 I/O → JFR CPU Profile.

## 한 줄 정리
> Java 서버 면접은 JVM 실행·Collection·동기화·GC를 분리된 암기 항목이 아니라 하나의 요청 처리 흐름으로 연결해 설명하는 능력을 본다.
