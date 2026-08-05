---
difficulty: 3
reading_time: 25분
interview_frequency: 5
importance: 5
---

# 08. Java Memory Model·synchronized·volatile·Atomic

> 게임 서버·백엔드 개발자를 위한 CS 면접 교재

## 학습 목표
- 게임 서버 킬 카운터를 20개 Worker Thread가 동시 갱신할 때 volatile count++ Lost Update가 발생하는 이유를 JMM Read-Modify-Write 비원자성으로 진단하고 AtomicInteger vs synchronized 선택 기준을 결정할 수 있다.
- HP·alive 두 Field를 동시 갱신해야 하는 복합 불변식에서 개별 AtomicInteger 두 연산 사이의 불일치 구간을 파악하고 AtomicReference<ImmutableState> 교체 vs Lock 사용 중 적합한 방식을 결정할 수 있다.
- SessionManager constructor에서 EventBus.register(this) this escape가 있을 때 final Field가 0으로 보이는 버그를 진단하고 static Factory 메서드로 안전한 공개 구조로 재작성할 수 있다.
- Room 상태를 I/O Thread와 Game Worker가 동시 접근하는 구조에서 synchronized Monitor Wait p99 급등 원인을 확인하고 단일 Worker Owner + volatile RoomSnapshot 교체 패턴으로 전환 여부를 결정할 수 있다.

## 1. 개요
Java Memory Model은 Thread 간 Read·Write가 언제 보이는지 정의하고 synchronized, volatile과 Atomic API는 Happens-before 관계와 원자성을 구성한다.

## 2. 왜 필요한가
멀티코어에서 실행 순서와 Cache 가시성을 명확히 해 Race Condition, Lost Update와 안전하지 않은 객체 공개를 막기 위해 필요하다.

## 3. 핵심 동작 원리
```text
thread A write → synchronization action → happens-before → thread B read
```
이 흐름은 Java Memory Model·synchronized·volatile·Atomic의 상태와 실행 경계를 보여 준다. 정상 처리뿐 아니라 실패와 Resource 정리 위치를 함께 본다.

### 1) synchronized Monitor와 상호 배제·가시성
synchronized는 Monitor 획득과 해제로 임계 구역의 상호 배제와 가시성을 제공한다. 같은 Lock을 일관되게 사용해야 하며 Lock 안에서 느린 I/O를 수행하면 다른 Thread 대기가 길어진다.

### 2) volatile 가시성 보장과 복합 연산 한계
volatile Read·Write는 가시성과 순서 관계를 제공하지만 count++ 같은 Read-Modify-Write 전체를 원자적으로 만들지 않는다. 단순 상태 Flag나 단일 Writer 공개에는 적합할 수 있다.

### 3) AtomicInteger CAS와 복합 불변식 보호 한계
AtomicInteger의 incrementAndGet과 compareAndSet은 단일 값의 원자 갱신에 유용하다. 여러 Field 불변식, check-then-act와 복합 업무 상태는 Lock이나 한 Owner 실행 흐름이 필요하다.

### 4) Happens-before 관계와 안전한 객체 공개
Happens-before가 없으면 한 Thread의 Write를 다른 Thread가 언제 어떤 순서로 볼지 Source 순서만으로 보장할 수 없다. final Field의 안전한 공개 규칙도 Constructor에서 this를 Escape시키면 깨질 수 있다.

### 5) Room State 소유권과 Lock 범위 축소 전략
Room 상태를 한 Worker가 소유하면 대부분의 변경을 Message로 직렬화해 Lock 범위를 줄일 수 있다. 공유 Metrics는 Atomic, Snapshot 교체에는 volatile Reference를 적용할 수 있다.

### 6) 동기화 방식 선택 기준과 Thread-safe Collection 한계
동기화 방식은 경쟁률, 임계 구역 시간과 불변식 범위를 기준으로 선택한다. Thread-safe Collection도 여러 Method를 묶은 업무 연산까지 자동 보호하지 않는다.

### 추가 핵심 내용

Happens-before는 실제 시계 순서가 아니라 한 동작의 결과가 다른 동작에 보이도록 하는 Memory Model 관계다. 같은 Monitor Unlock은 이후 Lock보다, volatile Write는 이후 같은 변수 Read보다 앞선다.

volatile은 복합 불변식을 보호하지 않는다. `count++`는 Read, 계산, Write이므로 두 Thread가 같은 값을 읽어 증가 하나를 잃을 수 있다. Atomic increment나 Lock을 사용한다.

CAS Loop는 충돌 시 재시도하며 높은 경쟁에서는 반복 실패와 CPU 사용이 늘 수 있다. 여러 Field가 함께 바뀌어야 하면 Immutable State를 Atomic Reference로 교체하거나 Lock·Owner 실행 흐름을 사용한다.

안전한 공개 없이 Mutable 객체를 공유하지 않는다. Constructor 중 this를 다른 Thread에 노출하지 않고, final Field·Lock·volatile Reference·Thread-safe Collection이 제공하는 공개 규칙을 활용한다.

## 4. 쉬운 예시

volatile count++ 문제, CAS 패턴, 안전한 공개 위반, Room Owner 패턴을 보여주는 예시다.

```java
// volatile count++가 안전하지 않은 이유
class Counter {
    volatile int count = 0;

    void increment() {
        count++; // ← 3단계: read → +1 → write, 원자적이지 않음
        // Thread A: count 읽음(0) → Thread B: count 읽음(0) →
        // Thread A: 1 씀 → Thread B: 1 씀 → 결과 1 (2가 되어야 함!)
    }
}
// 수정: AtomicInteger
AtomicInteger count = new AtomicInteger(0);
count.incrementAndGet(); // CAS로 원자적 증가

// Atomic의 한계: 복합 불변식은 보호 불가
AtomicInteger hp = new AtomicInteger(100);
AtomicBoolean alive = new AtomicBoolean(true);
// 두 값이 항상 일관되어야 하는 불변식이 있으면 별도 동기화 필요
// hp.get() == 0 이면서 alive.get() == true인 순간이 생길 수 있음
// 수정: Lock 또는 Immutable 상태 교체
record PlayerState(int hp, boolean alive) {}
AtomicReference<PlayerState> state = new AtomicReference<>(new PlayerState(100, true));
state.updateAndGet(s -> s.hp > 0 ? s : new PlayerState(0, false)); // 원자적 교체

// 안전하지 않은 공개: Constructor에서 this escape
class UnsafePublish {
    private int value;
    UnsafePublish() {
        EventBus.register(this); // ← this 탈출! 초기화 전 다른 Thread가 접근 가능
        this.value = 42;         // 다른 Thread가 value = 0을 볼 수 있음
    }
}
// 수정: final Factory 메서드 사용
static UnsafePublish create() {
    UnsafePublish obj = new UnsafePublish(); // 완전 초기화 후
    EventBus.register(obj);                  // 이후 공개
    return obj;
}

// Room Owner 패턴: Lock 없이 단일 Worker가 상태 소유
class Room {
    // 단일 Worker Thread만 접근 → Lock 불필요
    private int playerCount = 0;
    private Map<UUID, Player> players = new HashMap<>();

    // 공유 지표는 Atomic
    static final AtomicLong totalRooms = new AtomicLong(0);

    // Snapshot 교체: volatile Reference로 안전한 공개
    volatile RoomSnapshot latestSnapshot = RoomSnapshot.EMPTY;

    void onTick() {
        // Worker Thread만 실행 → 비동기로부터 안전
        simulate();
        latestSnapshot = buildSnapshot(); // volatile write → 다른 Thread에 보임
    }
}
// I/O Thread에서 읽기
RoomSnapshot snapshot = room.latestSnapshot; // volatile read → 최신 값 보장

// synchronized 올바른 사용: 같은 Lock으로 일관되게
class SharedCounter {
    private int count = 0;
    synchronized void increment() { count++; }      // ← 같은 Lock(this)
    synchronized int get() { return count; }        // ← 같은 Lock(this) → 일관성
    // Lock 안에서 I/O 금지: 다른 Thread 대기 길어짐
}
```

## 5. 비슷한 개념과 비교

| 동기화 방식 | 상호 배제 | 가시성 | 복합 불변식 | 적합 용도 |
|---|---|---|---|---|
| synchronized | 있음 | 있음 (Monitor 경계) | 가능 | 복합 상태, check-then-act |
| volatile | 없음 | 있음 (단일 변수) | 불가 | 상태 Flag, 단일 Writer 공개 |
| AtomicInteger | 없음 | 있음 (CAS 결과) | 단일 Field만 | 카운터, 통계 집계 |
| AtomicReference | 없음 | 있음 | Immutable 교체만 | Snapshot 교체, 상태 버전 |
| ReentrantLock | 있음 | 있음 | 가능 | tryLock·Timeout 필요 시 |
| Room Owner 패턴 | 없음 (단일 Thread) | 없음 (공유 없음) | 완전 | 게임 서버 Room 상태 |

## 6. 장점과 단점

**올바른 동기화 설계의 장점:**
- Happens-before로 Thread 간 가시성을 명확히 보장해 재현 어려운 동시성 버그를 방지한다.
- Room Owner 패턴으로 Lock 없이 상태 일관성을 유지하고 Lock Contention을 제거한다.
- Atomic API의 CAS로 경합이 낮은 카운터에서 Lock 없이 높은 처리량을 낸다.

**잘못된 동기화의 단점:**
- 복합 불변식을 개별 Atomic으로 보호하면 두 Atomic 사이 순간에 불일치 상태가 존재한다.
- synchronized 안에서 I/O 또는 외부 호출을 하면 다른 Thread가 길게 대기한다.
- 다른 Lock 순서로 두 Lock을 획득하면 Deadlock이 발생한다.
- CAS는 경합이 높을수록 Retry가 늘어 오히려 Lock보다 CPU 낭비가 크다.

## 7. 게임 서버·백엔드 실무 예시

게임 서버 Room 상태(플레이어 위치·HP·이벤트)는 단일 Worker Thread가 소유해 Lock 없이 처리한다. 외부 I/O Thread가 상태를 읽어야 할 때는 `volatile RoomSnapshot latestSnapshot`을 Worker가 Tick마다 교체하고 I/O Thread가 volatile read로 최신 Snapshot을 읽는다.

공유 지표(접속자 수, 총 패킷 카운트)는 `AtomicLong`으로 관리한다. synchronized는 여러 필드가 동시에 바뀌어야 일관성이 보장되는 영역(예: Ranking Map + 개인 기록)에 사용하고, 범위를 최소화하고 Lock 안에서 외부 호출을 넣지 않는다.

## 8. 자주 하는 오해
- **volatile이면 count++ 같은 복합 연산도 원자적이라고 생각한다.** `count++`는 Read→계산→Write 세 단계로 원자적이지 않다. 두 Thread가 동시에 같은 값을 읽어 증가 하나를 잃는 Lost Update가 발생한다. AtomicInteger의 `incrementAndGet` 또는 synchronized를 사용한다.
- **synchronized는 가시성만 제공한다고 생각한다.** synchronized는 상호 배제(한 번에 한 Thread만 임계 구역 진입)와 가시성(Monitor Unlock→Lock 사이 Happens-before) 두 가지를 모두 제공한다.
- **여러 Atomic 연산을 연속으로 사용하면 복합 불변식도 안전하다고 생각한다.** 두 Atomic 연산 사이에 다른 Thread가 개입할 수 있다. 복합 불변식은 `AtomicReference<Immutable상태>`로 교체하거나 Lock으로 보호한다.
- **Happens-before는 실제 시계 순서를 의미한다고 생각한다.** Happens-before는 Memory Model의 가시성 관계이며 물리적 시간 순서가 아니다. 같은 Monitor Unlock은 이후 Lock보다, volatile Write는 이후 같은 변수 Read보다 앞서는 관계다.
- **final Field는 항상 다른 Thread에 안전하게 보인다고 생각한다.** final Field의 안전한 공개는 Constructor가 완료된 후 Reference가 공개될 때 보장된다. Constructor 안에서 `this`를 다른 Thread에 노출(this escape)하면 final Field도 0이나 null로 보일 수 있다.
- **CAS(Atomic 연산)는 항상 synchronized보다 빠르다고 생각한다.** CAS는 경합이 낮을 때 빠르지만 경합이 높아지면 Retry가 증가해 CPU 낭비가 커진다. Lock은 경합 시 Thread를 대기시켜 CPU 낭비가 없다. 경합 수준을 측정해 선택한다.
- **ThreadLocal을 사용하면 동시성 문제가 완전히 해결된다고 생각한다.** ThreadLocal은 Thread 간 공유를 없애지만 Thread Pool 환경에서 이전 요청의 값이 남아 있을 수 있다. 요청 처리 후 반드시 `threadLocal.remove()`를 호출해야 한다.

## 9. 면접 질문
### Q1. 게임 서버 접속자 수 카운터를 50개 Thread가 동시 증가시키는데 실제 접속 수보다 낮게 표시됩니다. `volatile int count`를 사용 중입니다. 원인 진단과 수정 방법은 무엇입니까?
원인: `volatile`은 가시성만 보장하고 `count++`의 Read→계산→Write 세 단계를 원자화하지 않습니다. 50개 Thread가 동시에 같은 값을 읽어 각각 +1을 쓰면 Lost Update가 발생합니다. 수정: ① 단순 카운터라면 `AtomicLong.incrementAndGet()` 사용. ② 경합 극심 시 `LongAdder.increment()` + 읽기 시 `sum()` 사용(근사값 허용). ③ 카운터 갱신과 다른 상태가 함께 바뀌어야 하면 `synchronized` 블록으로 묶어 복합 불변식 보호.

### Q2. 플레이어 사망 처리에서 HP 0이 되면 alive=false로 함께 변경해야 하는데 "hp=0이면서 alive=true"인 순간 버그가 발생합니다. `AtomicInteger hp`와 `AtomicBoolean alive`를 각각 사용 중입니다. 근본 원인과 수정 방법은 무엇입니까?
원인: 두 Atomic 연산 사이(hp CAS 후 ~ alive CAS 전)에 다른 Thread가 개입할 수 있습니다. 각 Field의 원자성은 보장되지만 두 Field의 일관성은 보장되지 않습니다. 수정: `AtomicReference<PlayerState>` + `record PlayerState(int hp, boolean alive) {}`로 상태를 Immutable 객체로 묶어 한 번의 CAS로 교체. `state.updateAndGet(s -> s.hp() > 0 ? s : new PlayerState(0, false))` 형태로 적용. 두 Field가 항상 일관된 Snapshot으로 읽힙니다.

### Q3. SessionManager Constructor에서 `EventBus.register(this)`를 호출한 다음 `final int sessionId`를 초기화합니다. 정적 분석 도구(SpotBugs CT_CONSTRUCTOR_INVOKES_OVERRIDABLE_METHOD, SonarQube)가 경고를 냅니다. 실제 버그 발생 시나리오와 수정 방법은 무엇입니까?
시나리오: `EventBus.register(this)` 직후 다른 Thread가 EventBus를 통해 Session을 조회하면 `sessionId`가 아직 할당되지 않아 0으로 보입니다. final Field의 안전한 공개는 Constructor 완료 후 Reference 공개 시 보장되는데 this escape가 그 전에 공개합니다. 수정: ① static Factory 메서드로 변경 — Constructor를 private으로, `SessionManager.create()` 안에서 `new SessionManager()` 완료 후 `EventBus.register(session)` 호출. ② 또는 lazy 등록 — 최초 사용 시 `registerOnce()` 패턴.

### Q4. Room 상태 접근에 `synchronized(this)`를 걸었는데 I/O Thread가 100개로 늘자 async-profiler에서 Monitor Wait이 70%를 차지하고 p99 Latency가 50ms로 급등합니다. 원인 진단과 설계 개선 방법은 무엇입니까?
원인: 100개 I/O Thread가 모두 같은 Room 객체의 Monitor를 획득하려 경합합니다. synchronized는 공정성 없이 대기하므로 특정 Thread는 수십 ms를 기다립니다. 개선: ① **단일 Worker Owner 패턴** — Room 상태를 담당 Worker Thread 하나만 변경. I/O Thread는 상태 변경을 Message Queue로 전달, Worker가 직렬 처리. ② **volatile Snapshot 교체** — Worker가 Tick마다 `volatile RoomSnapshot latestSnapshot`을 교체, I/O Thread는 volatile read만 수행 → Lock 없이 읽기. ③ Snapshot 내부 Collection은 `List.copyOf()`로 Immutable화해 Thread-safe 보장.

### Q5. 세션 통계를 관리하는 코드에서 `ConcurrentHashMap.get(sessionId)` 후 값이 없으면 `put(sessionId, new Stats())`을 호출했는데 Stats 객체가 두 개 생성되는 Race Condition이 발생합니다. Data Race와 Race Condition의 차이와 올바른 수정 방법은 무엇입니까?
Data Race: JMM 차원에서 동기화 없이 두 Thread가 같은 변수에 접근하고 하나가 Write인 경우. ConcurrentHashMap은 Thread-safe하므로 Data Race는 없습니다. Race Condition: 동기화가 있어도 check-then-act 연산 사이 다른 Thread가 개입해 논리적으로 잘못된 결과가 나오는 버그. `get`이 null을 반환한 시점과 `put` 시점 사이에 다른 Thread가 먼저 `put`할 수 있습니다. 수정: `computeIfAbsent(sessionId, k -> new Stats())` 한 번의 원자적 연산으로 교체. `merge(sessionId, delta, Stats::add)`도 갱신에 활용 가능.

### Q6. Game Worker가 매 Tick마다 `volatile RoomSnapshot latestSnapshot`을 새 객체로 교체하고 I/O Thread가 읽는데 Snapshot 내부 `List<PlayerState> players`가 오래된 값으로 보입니다. 원인과 Immutable Snapshot 설계 방법은 무엇입니까?
원인: `volatile`은 Reference 자체의 가시성만 보장합니다. 새 Snapshot 객체를 가리키는 Reference 교체는 I/O Thread에 즉시 보이지만, Snapshot 내부 `players` List가 Mutable이라면 Worker가 List를 수정하는 동안 I/O Thread가 중간 상태를 읽을 수 있습니다. 수정: Snapshot을 완전 Immutable로 설계. `record RoomSnapshot(List<PlayerState> players, long tickId) {}` + `List.copyOf(players)` 사용. Snapshot 객체 생성 완료 후 `latestSnapshot = snapshot` 한 번만 쓰면 내부 필드도 안전하게 공개됩니다(JMM final Field 안전 공개 규칙).

## 10. 예상 꼬리질문
- CAS ABA 문제가 발생하는 게임 서버 시나리오(Session 풀 재사용)와 `AtomicStampedReference`로 Stamp를 같이 교체해 해결하는 방법은 무엇입니까?
- Tick 루프에서 `ReentrantLock.tryLock(0, MILLISECONDS)`으로 Lock 획득 실패 시 어떤 전략을 취하고(스킵 vs 큐 적재), fairness=true 설정이 Throughput에 미치는 영향은 무엇입니까?
- Room 100개를 FixedThreadPool(n=CPU 코어 수) vs ForkJoinPool 중 어떤 기준으로 선택하고 async-profiler `--event cpu` 결과로 어떻게 병목을 검증합니까?
- `volatile RoomSnapshot`을 교체할 때 Snapshot 내부 `List`를 `List.copyOf()`로 Immutable화하는 비용이 크면 CopyOnWriteArrayList vs Epoch-based 읽기 전용 공개 중 어떤 대안을 선택합니까?
- `ThreadLocal<ByteBuffer>`을 Tick마다 재사용하는 서버에서 `clear()` 누락으로 이전 Tick 데이터가 혼입됐을 때 JFR Custom Event 또는 `-XX:+PrintStringDeduplicationStatistics`로 어떻게 탐지합니까?
- `synchronized` 블록 안에서 DB 조회 RPC 호출이 있어 p99 Latency가 200ms를 넘습니다. Deadlock은 없는데 Monitor Wait이 지배적일 때 Lock 범위를 어떻게 축소하고 async-profiler Lock Contention 보고서로 어떻게 검증합니까?
- `AtomicLong` vs `LongAdder` 선택 기준이 되는 경합 임계값을 JMH `@Group`으로 측정하는 방법과 접속자 카운터에서 `LongAdder.sum()`의 근사값을 허용할 수 있는 조건은 무엇입니까?

## 11. 30초 모범답변
> Java Memory Model은 Thread 간 가시성과 순서를 Happens-before로 정의합니다. synchronized는 상호 배제와 가시성을, volatile은 단일 변수 가시성만 제공합니다. volatile count++는 Read-Modify-Write가 원자적이지 않아 Lost Update가 발생하므로 AtomicInteger 또는 synchronized를 사용합니다. 복합 불변식은 Lock 또는 Immutable 상태를 AtomicReference로 교체하는 방식으로 보호합니다.

## 12. 1~2분 확장답변
> 멀티코어에서 Compiler와 CPU는 성능을 위해 명령어를 재배치하고 CPU Cache를 사용합니다. JMM은 synchronized·volatile·final 등으로 Happens-before 관계를 정의해 Thread 간 가시성을 보장합니다.
>
> synchronized는 상호 배제와 가시성 모두를 제공하고, volatile은 단일 변수 Read·Write의 가시성만 제공합니다. `count++`는 원자적이지 않아 AtomicInteger를 사용합니다. 그러나 Atomic 연산을 여러 개 조합해도 복합 불변식은 보호되지 않습니다. 여러 필드가 함께 일관성을 유지해야 하면 `AtomicReference<Immutable상태>`로 원자 교체하거나 Lock을 사용합니다.
>
> 게임 서버에서 Room 상태는 단일 Worker가 소유해 Lock 없이 처리하고, I/O Thread가 읽어야 하는 Snapshot은 `volatile` Reference로 교체합니다. 공유 카운터는 AtomicLong, 복합 상태는 synchronized로 보호하고 Lock 안에서 외부 I/O 호출을 넣지 않습니다.

## 13. 핵심 요약

- JMM Happens-before: synchronized Unlock→Lock, volatile Write→Read, Thread.start()→run() 등으로 가시성 순서 보장 — Source 순서 ≠ 가시성 순서.
- synchronized: 상호 배제 + 가시성 — 복합 불변식·check-then-act에 사용, Lock 안에서 I/O 금지, 같은 Lock으로 일관되게 보호.
- volatile: 가시성만, 상호 배제 없음 — 단순 상태 Flag, 단일 Writer 공개, Snapshot Reference 교체에 적합.
- volatile count++ 문제: Read→계산→Write 세 단계가 원자적이지 않아 Lost Update 발생 → `AtomicInteger.incrementAndGet()` 또는 synchronized.
- Atomic 한계: 단일 값 원자 갱신만 — 복합 불변식은 `AtomicReference<ImmutableState>` 교체 또는 Lock 필요.
- CAS 선택 기준: 경합 낮으면 Lock보다 빠름, 경합 높으면 Retry 증가로 CPU 낭비 — 경합 수준 측정 후 선택.
- 안전한 공개: Constructor 완료 후 Reference 공개, this escape 금지 — final Field + volatile Reference + synchronized가 안전한 공개 수단.
- Room Owner 패턴: 단일 Worker가 Room 상태 소유 → Lock Contention 없음, I/O Thread는 volatile Snapshot만 읽기.

## 한 줄 정리
> JMM은 Happens-before로 Thread 간 가시성을 정의하며, volatile은 단일 변수 가시성, synchronized는 상호 배제+가시성, Atomic은 단일 값 CAS를 제공하고 복합 불변식은 Lock 또는 Immutable 상태 교체로 보호합니다.
