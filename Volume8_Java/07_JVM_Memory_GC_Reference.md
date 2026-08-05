---
difficulty: 3
reading_time: 25분
interview_frequency: 5
importance: 5
---

# 07. JVM Memory·GC와 Reference

> 게임 서버·백엔드 개발자를 위한 CS 면접 교재

## 학습 목표
- 게임 서버 Heap이 24시간 동안 100MB/시간씩 증가하는 현상을 JFR Allocation Profile과 Heap Dump Dominator Tree로 진단하고, Global Map·Listener·ThreadLocal 미해제 중 어느 원인인지 수정 순서를 결정할 수 있다.
- Container(4GB 제한)가 OOM으로 종료됐는데 Heap이 2GB만 사용 중일 때, Thread Stack·Metaspace·Direct Buffer·Code Cache 관점에서 RSS 초과 원인을 진단하고 JVM 설정을 결정할 수 있다.
- WeakHashMap으로 세션 캐시를 구현했는데 Cache Miss Rate가 40%를 넘을 때, Weak Reference 회수 시점의 비결정성이 원인임을 파악하고 Caffeine 같은 명시적 크기·TTL 캐시로 교체하는 판단 기준을 결정할 수 있다.
- 게임 서버 p99 Latency 스파이크가 G1GC Full GC Pause(500ms)와 일치할 때, GC Log에서 Humongous Allocation·Promotion Failure를 분석하고 Heap 조정 대 ZGC 전환이 적합한 시점을 결정할 수 있다.

## 1. 개요
JVM은 Heap, Thread Stack, Method Area 성격의 Metadata 영역과 Native Memory를 사용하며 GC는 도달할 수 없는 Heap 객체를 회수한다.

## 2. 왜 필요한가
객체 Lifetime과 Allocation Rate가 Server 지연, Memory 상한과 장애 복구에 직접 영향을 주므로 Root, 세대와 외부 Resource를 구분해야 한다.

## 3. 핵심 동작 원리
```text
allocation → Eden/Heap → reachable from GC Roots? → retain or reclaim → compact/region reuse
```
이 흐름은 JVM Memory·GC와 Reference의 상태와 실행 경계를 보여 준다. 정상 처리뿐 아니라 실패와 Resource 정리 위치를 함께 본다.

### 1) Thread Stack·Heap·Off-Heap 메모리 구조
Local Variable과 Operand Stack은 Thread별 Frame에 있고 객체는 일반적으로 Heap에 생성된다. Class Metadata, JIT Code Cache, Direct Buffer 같은 Memory는 Java Heap 밖에도 있어 Heap 사용량만으로 RSS를 설명할 수 없다.

### 2) GC Root와 Reachability 기반 회수
GC Root에는 실행 Thread의 Reference, Static Field와 JNI Reference 등이 포함될 수 있다. Root에서 강한 참조 Chain으로 도달 가능한 객체는 사용하지 않아도 회수되지 않으므로 Collection과 Listener 정리를 확인한다.

### 3) 세대 가설과 GC 목표 기준
세대 가설은 많은 객체가 짧게 산다는 관찰을 이용한다. Minor Collection과 Old 영역 정리는 Collector에 따라 세부 동작이 다르므로 이름보다 Pause, Throughput와 Heap 목표를 본다.

### 4) 참조 타입(Soft·Weak·Phantom)과 외부 Resource 정리
Soft, Weak와 Phantom Reference는 강한 참조와 다른 도달 가능성 정책을 제공하지만 일반 Cache의 만능 해법은 아니다. 외부 Resource는 GC가 아니라 AutoCloseable Scope에서 닫는다.

### 5) 게임 서버 Memory 누수 진단과 Registry 해제
Match별 임시 Event가 끝난 뒤 Global Map에 남으면 Old 영역이 증가한다. Heap Dump Dominator와 Allocation Profile로 보유 경로를 찾고 Session 종료 시 Registry를 해제한다.

### 6) Heap 크기와 Native Memory 용량 설계 Trade-off
큰 Heap은 Collection 빈도를 줄일 수 있지만 회수 작업과 장애 시 Dump 비용을 키울 수 있다. Container Limit, Native Memory와 Headroom을 포함해 용량을 잡는다.

### 추가 핵심 내용

Heap만 줄인다고 Process Memory가 모두 줄지는 않는다. Thread Stack, Metaspace, Code Cache, Direct Buffer와 Native Library Allocation을 함께 본다. Container OOM이면 Heap Dump뿐 아니라 Native Memory Tracking과 Thread 수를 확인한다.

Heap Dump에서는 큰 객체 하나보다 GC Root에서 객체를 붙잡는 Retained Size와 Dominator를 본다. 종료된 Session이 Listener, Scheduled Task나 ThreadLocal에 남았는지 확인한다. Allocation Profile은 누가 많이 만드는지, Heap Dump는 누가 오래 보유하는지를 보여 준다.

Weak Reference는 Key가 다른 곳에서 강하게 참조되지 않을 때 회수될 수 있지만 회수 시점은 업무 Cache 계약이 아니다. Cache에는 명시적 Size, TTL과 Hit Ratio를 두는 편이 예측 가능하다.

Collector 선택은 이름보다 Pause 목표, Throughput, Heap 크기와 사용하는 JDK의 지원 범위로 판단한다. GC Log에서 Allocation Rate, Pause 원인, Old 영역 증가와 Promotion 실패 징후를 시간축으로 비교한다.

## 4. 쉬운 예시

Memory Leak 패턴과 Weak Reference, 외부 자원 명시적 해제를 보여주는 예시다.

```java
// Memory Leak 예시: Session 종료 후 Global Map에 남은 리스너
class EventBus {
    static Map<UUID, List<EventListener>> listeners = new HashMap<>();

    static void subscribe(UUID sessionId, EventListener l) {
        listeners.computeIfAbsent(sessionId, k -> new ArrayList<>()).add(l);
    }
    // 문제: Session 종료 시 listeners.remove(sessionId)를 호출하지 않으면
    // → 종료된 Session 참조가 Old 영역에 계속 누적 → Memory Leak
}

// 수정: Session 종료 시 명시적 해제
class Session {
    void close() {
        EventBus.listeners.remove(this.id); // 반드시 해제
        threadLocal.remove();              // ThreadLocal도 반드시 제거
    }
}

// WeakHashMap: Key에 강한 참조가 없을 때 자동 제거 (캐시 용도)
Map<Session, Metadata> cache = new WeakHashMap<>();
// Session 객체가 다른 곳에서 참조되지 않으면 GC 후 자동 제거
// 주의: GC 시점이 비결정적이어서 명시적 TTL 캐시보다 예측이 어려움

// Soft Reference: 메모리 부족 시 회수 (메모리 감응 캐시)
SoftReference<byte[]> cache = new SoftReference<>(loadSnapshot());
byte[] snapshot = cache.get(); // null이면 재로드
if (snapshot == null) snapshot = loadSnapshot();

// 외부 자원은 GC가 아니라 AutoCloseable로 명시적 닫기
// ← 나쁜 패턴: finalize()나 GC를 믿고 DB Connection을 닫지 않음
// ← 올바른 패턴:
try (Connection conn = dataSource.getConnection();
     PreparedStatement ps = conn.prepareStatement(sql)) {
    ps.execute();
} // Scope 종료 시 자동 close → GC와 무관

// Heap Dump로 Memory Leak 진단
// 1. jmap -dump:format=b,file=heap.hprof <pid>
// 2. Eclipse MAT에서 Dominator Tree 확인
//    → Retained Heap이 큰 객체가 어디서 참조되는지 Root Chain 추적
// 3. Allocation Profile (JFR or async-profiler)
//    → 누가 많이 생성하는지 확인 (Leak은 Heap Dump, 생성 비용은 Profile)

// GC Root 예시
static Map<UUID, Session> sessions = new HashMap<>(); // Static Field → GC Root
// sessions에 참조가 있는 한 Session은 절대 회수되지 않음
```

## 5. 비슷한 개념과 비교

| 참조 종류 | GC 회수 시점 | get() 반환 | 대표 용도 |
|---|---|---|---|
| Strong Reference | Root Chain 끊길 때 | 항상 객체 | 일반 모든 참조 |
| Soft Reference | 메모리 부족(OOM 직전) | 회수 전까지 객체, 이후 null | 메모리 감응 캐시 |
| Weak Reference | 강한 참조 없을 때 (다음 GC) | 살아있으면 객체, 이후 null | WeakHashMap, 이벤트 리스너 |
| Phantom Reference | Finalize 완료 후 | 항상 null | 자원 정리 후처리, Cleaner API |

| GC Collector | Pause 특성 | 적합 환경 |
|---|---|---|
| Serial GC | Full Stop-the-World | 단일 코어·소형 힙 |
| G1GC (Java 9+ 기본) | 예측 가능한 짧은 Pause | 대용량 힙·범용 서버 |
| ZGC | 수 ms 이하 Pause | 지연 민감 대용량 힙 |
| Shenandoah | ZGC 유사 저지연 | 저지연 대용량 힙 |

## 6. 장점과 단점

**GC 기반 자동 메모리 관리의 장점:**
- 명시적 free 없이 대부분의 객체 수명을 자동으로 관리해 use-after-free·이중 해제 버그를 방지한다.
- 세대 가설 기반 Minor GC로 단수명 객체를 효율적으로 회수해 처리량을 높인다.
- GC Root 기반 도달 가능성으로 Reference Count의 순환 참조 문제를 회피한다.

**GC 기반 자동 메모리 관리의 단점:**
- Stop-the-World Pause가 실시간 게임 서버에서 지연 Spike를 만든다.
- 큰 Heap은 GC 회수 비용이 증가하고 장애 시 Heap Dump 크기가 커진다.
- Global Map·Listener·ThreadLocal을 명시적으로 해제하지 않으면 논리적 Memory Leak이 발생한다.
- Heap 크기만 제한해도 RSS는 Metaspace·Code Cache·Direct Buffer 등으로 더 클 수 있다.

## 7. 게임 서버·백엔드 실무 예시

매치 종료 후 리스너와 Session 객체를 Global Map에서 해제하지 않으면 Old 영역이 점진적으로 증가하다 Full GC를 유발한다. Session 종료 핸들러에서 `listeners.remove(sessionId)`와 `threadLocal.remove()`를 반드시 호출한다.

Memory 사용량이 예상보다 높을 때 Heap만 확인하지 않는다. `jcmd <pid> VM.native_memory`로 Native Memory Tracking을 확인하고 Thread 수 × Stack Size가 큰 비중을 차지하는지 확인한다. Container OOM은 Heap Dump와 함께 `-Xss` 설정과 Thread 수도 점검한다.

## 8. 자주 하는 오해
- **Heap 크기를 줄이면 Process RSS가 비례해 줄어든다고 생각한다.** RSS에는 Thread Stack, Metaspace, JIT Code Cache, Direct Buffer, Native Library Allocation이 포함된다. Heap만 줄여도 나머지 영역이 크면 RSS는 크게 감소하지 않는다.
- **GC가 사용하지 않는 모든 객체를 자동으로 회수한다고 생각한다.** GC는 참조 도달 가능성 기준으로 회수한다. Global Map·Static Field·Listener·ThreadLocal이 객체를 계속 참조하면 논리적으로 불필요해도 회수되지 않는다(논리적 Memory Leak).
- **WeakReference가 일반 캐시의 좋은 대체제라고 생각한다.** Weak Reference는 GC 시점이 비결정적이어서 캐시 크기와 TTL을 제어할 수 없다. 명시적 크기 제한과 TTL이 있는 캐시(Guava Cache, Caffeine 등)가 예측 가능하다.
- **Young Generation에서 살아남으면 즉시 Old로 이동한다고 생각한다.** 생존 횟수(Tenuring Threshold, 기본 15회)를 초과해야 Old로 Promote된다. 중간에 Survivor Space를 오가며 단수명 객체인지 판별한다.
- **큰 Heap이 항상 성능에 유리하다고 생각한다.** Heap이 클수록 GC 회수 대상이 많아 Pause가 길어질 수 있고, 장애 시 Heap Dump 크기가 커져 진단이 어려워진다. Container 메모리 제한, Native Memory Headroom을 포함해 적절히 설정한다.
- **`System.gc()`를 호출하면 즉시 GC가 실행된다고 생각한다.** `System.gc()`는 JVM에 GC를 권고할 뿐 즉시 실행을 보장하지 않는다. `-XX:+DisableExplicitGC`로 무시할 수도 있다.
- **Metaspace는 무제한으로 늘어나므로 OOM이 발생하지 않는다고 생각한다.** Metaspace는 Native Memory를 사용하지만 `-XX:MaxMetaspaceSize`로 상한을 지정하지 않으면 Native Memory를 소진할 수 있다. 동적 Class Loading이 많은 환경(플러그인 서버 등)에서는 Class 언로드와 상한을 확인한다.

## 9. 면접 질문
### Q1. 게임 서버를 24시간 운영하니 Heap 사용량이 100MB/시간씩 증가하고 Full GC 후에도 완전히 회수되지 않습니다. 어떤 순서로 진단합니까?
1단계: GC Log(`-Xlog:gc*`)에서 Old 영역 증가 추세를 시간축으로 확인. 2단계: `jmap -dump:format=b,file=heap.hprof <pid>` 또는 JFR으로 Heap Dump 수집. 3단계: Eclipse MAT Dominator Tree에서 Retained Heap이 큰 객체의 Root 참조 Chain 추적. 4단계: 종료된 Session 객체가 EventBus·Global Map·ThreadLocal에 남아 있는지 확인. 5단계: Session 종료 핸들러에 `listeners.remove(sessionId)`, `threadLocal.remove()` 추가하고 Allocation Profile(JFR)으로 누가 많이 생성하는지 추가 확인.

### Q2. Container(4GB 제한)가 OOM으로 kill됐는데 Heap은 2GB만 사용 중입니다. RSS가 제한에 근접한 이유와 진단 방법은 무엇입니까?
RSS = Heap + Thread Stack(`-Xss` × Thread 수) + Metaspace + Code Cache + Direct Buffer + Native Library. 진단: `jcmd <pid> VM.native_memory` → 각 영역별 사용량 확인. Thread 수 500개, `-Xss1m` 기본값이면 Thread Stack만 500MB. Direct Buffer를 대량 사용하면 추가 수 GB 가능. 조치: `-Xss256k`로 Stack 감소, `-XX:MaxMetaspaceSize=256m`, `-XX:MaxDirectMemorySize=512m` 설정, Container 설정은 Heap + Native 합산 + Headroom 200m으로 결정.

### Q3. Heap Dump Dominator Tree 분석 결과 `SessionEventHandler` 인스턴스 5만 개가 Old 영역에 누적되어 GC가 회수하지 못합니다. 어떤 구조가 붙잡고 있을지 의심할 수 있는 패턴과 해제 방법은 무엇입니까?
의심 패턴: ① Static `EventBus.listeners` Map에 sessionId → Handler 매핑 잔류. ② `ScheduledExecutorService` Runnable이 Handler 참조를 보유. ③ Thread Pool ThreadLocal에 Handler 참조 누적. Eclipse MAT에서 해당 인스턴스의 Incoming References를 따라 GC Root까지 Chain 확인. 해제: Session 종료 시 `EventBus.unsubscribe(sessionId)`, `future.cancel(false)`, `threadLocal.remove()` 호출. 재발 방지: Session 종료 이벤트에 cleanup callback 등록.

### Q4. 게임 서버 p99 Latency 스파이크가 GC Log 분석 결과 G1GC Full GC Pause(500ms)와 정확히 일치합니다. Full GC 원인 진단과 단기·장기 조치 방법은 무엇입니까?
원인 확인: GC Log에서 `GC(Full) cause` 항목 확인. Humongous Allocation(Region Size의 50% 초과 객체)이면 `-XX:G1HeapRegionSize` 2배 증가로 기준 상향. Promotion Failure(Old 공간 부족)이면 Heap 증설(-Xmx 확대) 또는 Allocation Rate 감소(Object Pool). Concurrent Mark 실패이면 `-XX:InitiatingHeapOccupancyPercent` 낮춰 GC 조기 시작. 장기: JFR으로 Humongous Object 생성 위치 확인 후 재사용 가능하면 Pool 적용. Full GC가 여전하면 ZGC 전환 검토(p99 수 ms).

### Q5. WeakHashMap으로 세션 메타데이터를 캐시했는데 GC 후 캐시가 자주 비워져 Cache Miss Rate가 40%를 넘습니다. 문제 원인과 대안은 무엇입니까?
WeakHashMap Key에 대한 강한 참조가 끊어지면 다음 Minor GC에서 즉시 회수됩니다. 게임 서버에서 Session 객체가 Tick 처리 중에만 Stack에 참조되고 이후 사라지면 WeakHashMap 캐시도 즉시 무효화됩니다. 대안: ① Caffeine `maximumSize(10_000).expireAfterAccess(10, MINUTES)` → 크기·TTL 명시적 제어. ② Session 종료 시 `cache.invalidate(sessionId)` 호출하는 일반 Map. ③ Cache Miss Rate를 Metric으로 수집해 임계값 초과 시 알람 설정.

### Q6. Metaspace 크기가 점진적으로 증가하다 `-XX:MaxMetaspaceSize` 없이 서버가 OOM으로 종료됩니다. 원인과 방지 방법은 무엇입니까?
원인: 동적 Class Loading이 많고 ClassLoader가 회수되지 않음. 게임 Plugin 시스템, 스크립팅 엔진(Groovy), CGLIB·Mockito 같은 바이트코드 생성 라이브러리가 대표적 원인. 진단: `jcmd <pid> VM.native_memory` Metaspace 항목 추세 확인, MAT에서 ClassLoader 인스턴스가 GC Root에서 참조되는 Chain 추적. 방지: `-XX:MaxMetaspaceSize=512m` 설정 후 OOM 알람. ClassLoader Leak 제거: Plugin ClassLoader를 Plugin 비활성화 시 명시적 해제, 강한 참조 제거 후 WeakReference로 보유.

## 10. 예상 꼬리질문
- G1GC Humongous Object가 반복 생성될 때 `G1HeapRegionSize` 조정과 Object Pool 중 어떤 기준으로 선택합니까? (Allocation Rate, 객체 생명주기)
- 게임 Tick마다 1MB짜리 `byte[]` 배열을 생성하면 GC 세대 이동에 어떤 영향을 주고 JFR Allocation Profile로 어떻게 탐지합니까?
- Thread Pool에서 `ThreadLocal.remove()` 없이 Thread를 반환하면 어떤 Memory Leak이 발생하고, Spring `RequestScope`는 어떻게 안전하게 관리합니까?
- `Phantom Reference`·`Cleaner` API와 try-with-resources 중 Native 자원(Direct Buffer, File Handle) 정리에 어떤 것을 선택하고 그 이유는 무엇입니까?
- ZGC로 전환 후 p99 Latency가 5ms 이하가 되었지만 Throughput이 10~15% 감소했습니다. 이 Trade-off를 수용할 기준은 무엇입니까?
- Custom ClassLoader가 Metaspace Leak을 일으킬 때 Eclipse MAT에서 ClassLoader 인스턴스를 추적하는 방법과 회수 조건은 무엇입니까?
- `jcmd VM.native_memory`에서 Reserved와 Committed의 차이는 무엇이고, RSS와 어느 쪽을 비교해야 합니까?

## 11. 30초 모범답변
> JVM GC는 Reference Count가 아니라 GC Root에서의 도달 가능성을 기준으로 Heap 객체를 회수합니다. GC가 있어도 Global Map·Listener·ThreadLocal이 객체를 계속 참조하면 논리적 Memory Leak이 발생합니다. Process RSS는 Heap 외에 Thread Stack, Metaspace, Code Cache, Direct Buffer까지 포함하므로 Heap만 줄여도 RSS는 크게 감소하지 않을 수 있습니다.

## 12. 1~2분 확장답변
> JVM Memory는 GC가 관리하는 Heap 외에 Thread별 Stack, Class Metadata를 저장하는 Metaspace, JIT Code Cache, Direct Buffer 등으로 구성됩니다. Process RSS는 이 모든 영역의 합이므로 Container 메모리 제한 설정 시 Heap만 고려하면 OOM이 발생할 수 있습니다.
>
> GC는 Reference Count가 아니라 GC Root(실행 Thread Stack, Static Field, JNI Reference)에서 강한 참조로 도달 가능한 객체를 살리고 나머지를 회수합니다. 세대 가설(대부분 객체는 짧게 산다)을 기반으로 Young 영역에서 Minor GC로 단수명 객체를 자주 효율적으로 회수하고, Tenuring Threshold를 넘긴 객체를 Old로 Promote합니다.
>
> Java에서도 논리적 Memory Leak이 발생합니다. 종료된 Session 객체를 Global Map·EventBus·ThreadLocal이 계속 참조하면 GC가 회수하지 못합니다. Heap Dump의 Dominator Tree로 Retained Heap이 큰 객체의 Root 참조 Chain을 추적하고, Session 종료 핸들러에서 반드시 `remove()`를 호출합니다. Collector는 이름이 아니라 Pause 목표와 Heap 크기로 선택합니다.

## 13. 핵심 요약

- JVM Memory 영역: Heap(GC 관리) + Thread Stack + Metaspace(Class Metadata) + Code Cache(JIT) + Direct Buffer + Native — RSS는 이 모두의 합.
- GC Root 기반 회수: Root(Thread Stack·Static Field·JNI)에서 강한 참조로 도달 가능한 객체만 보존 → 논리적으로 불필요해도 참조 있으면 회수 불가.
- 세대별 GC: Young(Eden→Survivor→Promote) Minor GC 빠름, Old Major GC 느림 — Tenuring Threshold 초과 시 Old로 이동.
- 논리적 Memory Leak: Global Map·Listener·ThreadLocal의 미해제 참조 → Heap Dump Dominator Tree로 진단, Session 종료 시 명시적 remove.
- Heap vs RSS: Heap 줄여도 Thread Stack×N + Metaspace + Code Cache + Direct Buffer가 크면 RSS 감소 미미 — Container 설정 시 Headroom 포함.
- 참조 종류: Strong(항상 보존) → Soft(메모리 부족 시 회수) → Weak(강한 참조 없을 때 회수) → Phantom(Finalize 후 회수).
- Weak Reference 캐시 주의: GC 시점 비결정적 → 크기·TTL 제어 불가 → Caffeine·Guava Cache처럼 명시적 상한 있는 캐시가 예측 가능.
- Collector 선택: 이름이 아니라 Pause 목표·Throughput·Heap 크기로 선택 — G1GC(범용)·ZGC(극저지연)·Shenandoah(저지연).

## 한 줄 정리
> JVM GC는 GC Root 도달 가능성으로 Heap을 회수하지만, Global Map·Listener·ThreadLocal 미해제는 논리적 Leak을 만들고 RSS는 Heap 외 Metaspace·Stack·Direct Buffer까지 포함합니다.
