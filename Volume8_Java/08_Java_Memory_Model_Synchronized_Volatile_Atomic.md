---
difficulty: 3
reading_time: 25분
interview_frequency: 5
importance: 5
---

# 08. Java Memory Model·synchronized·volatile·Atomic

> 게임 서버·백엔드 개발자를 위한 CS 면접 교재

## 학습 목표
- Java Memory Model(JMM)의 Happens-before 관계와 멀티코어에서 가시성 보장이 필요한 이유를 설명할 수 있다.
- synchronized(상호 배제+가시성), volatile(가시성만), Atomic(CAS 원자 연산)의 차이와 한계를 설명할 수 있다.
- volatile count++가 안전하지 않은 이유와 복합 불변식 보호에 적합한 동기화 방법을 선택할 수 있다.
- 게임 서버 Room 상태 소유권 패턴으로 Lock 범위를 최소화하는 설계를 적용할 수 있다.

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
- volatile이면 count++ 같은 복합 연산도 원자적이라고 생각한다. `count++`는 Read→계산→Write 세 단계로 원자적이지 않다. 두 Thread가 동시에 같은 값을 읽어 증가 하나를 잃는 Lost Update가 발생한다. AtomicInteger의 `incrementAndGet` 또는 synchronized를 사용한다.
- synchronized는 가시성만 제공한다고 생각한다. synchronized는 상호 배제(한 번에 한 Thread만 임계 구역 진입)와 가시성(Monitor Unlock→Lock 사이 Happens-before) 두 가지를 모두 제공한다.
- 여러 Atomic 연산을 연속으로 사용하면 복합 불변식도 안전하다고 생각한다. 두 Atomic 연산 사이에 다른 Thread가 개입할 수 있다. 복합 불변식은 `AtomicReference<Immutable상태>`로 교체하거나 Lock으로 보호한다.
- Happens-before는 실제 시계 순서를 의미한다고 생각한다. Happens-before는 Memory Model의 가시성 관계이며 물리적 시간 순서가 아니다. 같은 Monitor Unlock은 이후 Lock보다, volatile Write는 이후 같은 변수 Read보다 앞서는 관계다.
- final Field는 항상 다른 Thread에 안전하게 보인다고 생각한다. final Field의 안전한 공개는 Constructor가 완료된 후 Reference가 공개될 때 보장된다. Constructor 안에서 `this`를 다른 Thread에 노출(this escape)하면 final Field도 0이나 null로 보일 수 있다.
- CAS(Atomic 연산)는 항상 synchronized보다 빠르다고 생각한다. CAS는 경합이 낮을 때 빠르지만 경합이 높아지면 Retry가 증가해 CPU 낭비가 커진다. Lock은 경합 시 Thread를 대기시켜 CPU 낭비가 없다. 경합 수준을 측정해 선택한다.
- ThreadLocal을 사용하면 동시성 문제가 완전히 해결된다고 생각한다. ThreadLocal은 Thread 간 공유를 없애지만 Thread Pool 환경에서 이전 요청의 값이 남아 있을 수 있다. 요청 처리 후 반드시 `threadLocal.remove()`를 호출해야 한다.

## 9. 면접 질문
### Q1. Java Memory Model은 왜 필요한가요?
멀티코어 환경에서 Compiler와 CPU가 성능 최적화를 위해 명령어를 재배치하거나 CPU Cache를 사용하기 때문에 Thread 간 관찰 순서를 Source 코드 순서만으로 판단할 수 없습니다. JMM은 `synchronized`, `volatile`, `final` 등을 통해 Happens-before 관계를 정의해 가시성과 순서를 보장합니다.

### Q2. synchronized와 volatile의 차이는 무엇인가요?
synchronized는 Monitor로 임계 구역에 한 번에 한 Thread만 진입하는 상호 배제와 가시성을 동시에 제공합니다. volatile은 임계 구역 없이 해당 변수의 Read·Write에만 가시성과 순서를 보장하고 상호 배제가 없어 복합 연산을 원자화하지 않습니다.

### Q3. volatile count++가 안전하지 않은 이유는 무엇인가요?
`count++`는 Read→+1 계산→Write 세 단계로 이루어져 원자적이지 않습니다. 두 Thread가 같은 값을 동시에 읽고 각각 +1을 써서 결과적으로 증가 하나가 사라지는 Lost Update가 발생합니다. `AtomicInteger.incrementAndGet()`(CAS) 또는 synchronized를 사용합니다.

### Q4. CAS의 장단점은 무엇인가요?
CAS(Compare-And-Swap)는 현재 값이 기대값과 같을 때만 새 값으로 교체하는 하드웨어 원자 명령입니다. Blocking 없이 단일 값을 조건부로 갱신할 수 있어 경합이 낮을 때 Lock보다 빠릅니다. 그러나 경합이 높으면 Retry가 증가해 CPU 낭비가 커지고, 여러 필드를 함께 갱신하는 복합 불변식 표현이 어렵습니다.

### Q5. 안전한 객체 공개(Safe Publication)란 무엇인가요?
객체의 초기화 결과가 다른 Thread에 올바르게 보이도록 Happens-before를 통해 Reference를 전달하는 것입니다. final Field를 사용하거나 volatile Reference에 저장하거나 synchronized 블록을 통해 공개합니다. Constructor에서 `this`를 다른 Thread에 노출(this escape)하면 초기화가 완료되기 전에 다른 Thread가 접근할 수 있어 안전하지 않습니다.

### Q6. Data Race와 Race Condition의 차이는 무엇인가요?
Data Race는 동기화 없이 두 Thread가 같은 변수에 접근하고 그 중 하나가 Write일 때 발생하는 JMM 위반입니다. Race Condition은 동기화가 있어도 연산 순서에 따라 잘못된 결과가 나오는 논리적 버그입니다. 예를 들어 ConcurrentHashMap의 `get`→`put`은 Data Race는 없지만 Race Condition(check-then-act 문제)이 발생할 수 있습니다.

## 10. 예상 꼬리질문
- Happens-before가 성립하지 않으면 어떤 현상이 발생할 수 있나요? (Stale Read, 재배치)
- AtomicReference와 synchronized의 차이는 어떤 상황에서 나타나나요?
- ReentrantLock을 synchronized 대신 사용하는 이유는 무엇인가요? (tryLock, Timeout, fairness)
- Deadlock 발생 조건은 무엇이고 어떻게 방지하나요?
- ThreadLocal을 Thread Pool에서 사용할 때 주의해야 할 점은 무엇인가요?
- CAS의 ABA 문제란 무엇이고 어떻게 해결하나요?
- volatile Reference로 Snapshot을 교체할 때 Snapshot 내부 필드의 가시성은 어떻게 보장되나요?

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
