---
difficulty: 3
reading_time: 25분
interview_frequency: 5
importance: 5
---

# 01. JVM·JRE·JDK와 Bytecode·JIT

> 게임 서버·백엔드 개발자를 위한 CS 면접 교재

## 학습 목표

- 배포 직후 CPU가 급등할 때, JIT Compile Thread 부하인지 GC 압박인지 Application 로직 부하인지 JFR과 GC Log로 진단 순서를 결정할 수 있다.
- Plugin 서버에서 같은 이름의 Class를 사용하는데 ClassCastException이 발생했을 때, Class Loader 계층 충돌인지 Static Initializer 예외인지 좁혀 수정 방향을 결정할 수 있다.
- Container 환경에서 JVM이 Host CPU·Memory를 기준으로 동작해 OOM·Thread 과다 문제가 발생했을 때, MaxRAMPercentage·ActiveProcessorCount 설정으로 제한을 명시하는 방법을 결정할 수 있다.
- 장기 실행 게임 서버와 Serverless Function 각각에 JIT 또는 AOT(GraalVM Native Image)를 선택해야 할 때, 시작 지연·최대 처리량·Reflection 의존성 기준으로 적합한 실행 모드를 판단할 수 있다.

## 1. 개요

JVM(Java Virtual Machine)은 Java Bytecode를 실행하는 가상 머신이며 JRE는 실행 환경, JDK는 컴파일러와 개발 도구까지 포함한 개발 키트다.

## 2. 왜 필요한가

Java 프로그램을 운영체제와 CPU 차이에서 분리하고, 관리 메모리·검증·동적 최적화를 공통 실행 환경에서 제공하기 위해 필요하다.

## 3. 핵심 동작 원리

```text
Source(.java) → javac → Bytecode(.class) → Class Loader → JVM Interpreter/JIT → Native Code
```

이 흐름은 JVM·JRE·JDK와 Bytecode·JIT의 주요 처리 단계와 책임 경계를 나타낸다. 각 단계의 입력과 출력, 실패 시 복구 위치를 구분해야 한다.

### JDK·JRE·JVM 구성 차이

JDK에는 javac, debugger, javadoc과 실행 도구가 포함된다. JRE는 JVM과 표준 Library를 묶은 실행 환경이라는 개념이다. 최근 배포에서는 전체 JRE를 별도로 설치하기보다 jlink 등으로 필요한 Runtime Image를 만들 수 있으므로 제품 Version별 실제 구성을 확인한다.

### Bytecode와 플랫폼 독립성

javac은 Source를 특정 CPU 명령이 아니라 Bytecode로 변환한다. 같은 Class File은 호환 JVM이 있는 여러 Platform에서 실행할 수 있다. 이는 모든 운영체제 동작이 완전히 같다는 뜻은 아니며 File System, Native Library와 환경 설정 차이는 남는다.

### Class Loading 단계

Class Loader는 Bootstrap, Platform, Application Loader 같은 계층으로 Class를 찾고 Loading, Linking, Initialization을 수행한다. Linking에는 Bytecode 검증, Static Field 준비와 Symbolic Reference 해석이 포함된다. Class 초기화 시점과 Loader가 다르면 같은 이름도 다른 Type으로 취급될 수 있다.

### Interpreter와 JIT

Interpreter는 Bytecode를 빠르게 실행 시작할 수 있지만 반복 실행 비용이 있다. JIT Compiler는 Hot Method와 Loop를 Native Code로 바꾸고 Inlining, Escape Analysis 같은 최적화를 적용한다. Profile 가정이 깨지면 Deoptimization으로 안전한 실행 경로로 돌아갈 수 있다.

### Warm-up과 성능 측정

Warm-up 전과 후 성능이 다른 이유는 Class Loading, JIT Compile과 Cache가 점진적으로 준비되기 때문이다. 짧은 Benchmark를 한 번 실행해 Java가 느리다고 결론 내리지 않는다. JMH 같은 도구로 Dead Code 제거와 Warm-up을 고려한다.

### 운영 관찰 지표

운영에서는 Java Version, VM Option, Container CPU·Memory 제한과 GC 선택을 함께 기록한다. Thread Dump, Heap Dump, JFR와 GC Log는 각각 실행 정체, 객체 보유와 Runtime Event를 진단하는 증거다.

### 실행 단계별 확인 사항

- **Class Path와 Module Path**: 필요한 Class를 어느 Loader가 찾는지 확인한다. Plugin Server에서는 Loader가 다르면 같은 이름의 Class도 서로 다른 Type이므로 Cast가 실패할 수 있다.
- **초기화 순서**: Static Field 준비와 Static Initializer 실행을 구분한다. Class 초기화 중 다른 Class를 순환 참조하면 초기값 관찰이나 초기화 실패가 발생할 수 있다.
- **JIT 관찰**: Method 호출 횟수만으로 최적화를 단정하지 않는다. Type Profile, Inlining 여부와 Deoptimization Event를 JFR이나 Compiler Log로 확인한다.
- **Benchmark**: Fork와 Warm-up을 두고 결과 소비를 보장한다. GC, Dead Code 제거와 CPU Frequency 변화가 측정을 왜곡하지 않게 JMH 같은 Harness를 사용한다.
- **배포 준비**: Readiness 전에 주요 Class Loading, Connection 준비와 대표 요청을 수행한다. 새 Instance의 Cold p99가 기존 Instance까지 영향을 주지 않게 Traffic을 점진적으로 늘린다.
- **Version 계약**: Compile 대상 Java Version과 실제 Runtime Version을 일치시킨다. 더 새로운 Class File Version을 오래된 JVM이 읽지 못하는 실패를 배포 전에 확인한다.

### 장애 시나리오

ClassNotFoundException과 NoClassDefFoundError는 이름이 비슷하지만 원인 범위가 다르다. Class 탐색 실패, Initialization 실패와 Dependency Version 충돌을 Loader와 Cause Chain으로 구분한다. 새 배포 직후 CPU가 높다면 무조건 JIT 탓으로 보지 않고 Compile Thread, Application 부하와 GC를 같은 시각에 비교한다.

## 4. 쉬운 예시

JIT가 동일 메서드를 반복 호출할수록 최적화를 점진적으로 적용하는 흐름과, Warm-up 없는 Benchmark가 왜 왜곡되는지 보여주는 예시다.

```java
// JMH로 Warm-up 효과 측정
@BenchmarkMode(Mode.AverageTime)
@Warmup(iterations = 5, time = 1)   // 5번 Warm-up: C1 → C2 JIT 유도
@Measurement(iterations = 5)
@Fork(1)
public class JitBenchmark {

    @Benchmark
    public int sumArray(Blackhole bh) {
        int sum = 0;
        for (int i = 0; i < data.length; i++) {
            sum += data[i]; // C2: Loop Unrolling + SIMD 벡터화 적용
        }
        return sum;
        // Warm-up 전: ~800ns (Interpreter)
        // C1 컴파일 후: ~100ns (기본 최적화)
        // C2 컴파일 후: ~10ns  (고도 최적화)
    }
}

// JIT 진단 VM 옵션
// -XX:+PrintCompilation           → 컴파일된 메서드 목록
// -XX:+PrintInlining              → Inlining 내역
// -XX:+TraceDeoptimization        → Deoptimization 발생 시점

// Class Loading 초기화 순서 함정
class Config {
    // Loading 시점이 아니라 처음 접근(사용) 시점에 초기화
    static final int MAX = compute();   // Static Initializer
    static int compute() { return 100; }
}

// ClassNotFoundException vs NoClassDefFoundError 구분
try {
    Class.forName("com.example.Missing");
    // → ClassNotFoundException: 런타임에 Class를 찾지 못함 (탐색 실패)
} catch (ClassNotFoundException e) { ... }

// NoClassDefFoundError: Compile 시에는 있었으나
// 런타임에 찾을 수 없거나 Static Initializer가 실패한 경우
// → Cause Chain에서 ExceptionInInitializerError를 확인
```

## 5. 비슷한 개념과 비교

| 구분 | Interpreter | C1 JIT (Client) | C2 JIT (Server) | AOT (GraalVM Native) |
|---|---|---|---|---|
| 시작 속도 | 빠름 | 중간 | 느림 | 매우 빠름 |
| 최적화 수준 | 없음 | 기본 (Inlining) | 고도 (Escape Analysis·SIMD) | 사전 고정 |
| Deoptimization | 없음 | 가능 | 가능 | 없음 |
| 메모리 사용 | 적음 | 중간 | 많음 | 적음 |
| Reflection 지원 | 완전 | 완전 | 완전 | 설정 필요 |
| 적합 환경 | 단기 실행·스크립트 | 웹 앱 초기 응답 | 장기 실행 서버 | 서버리스·마이크로서비스 |

## 6. 장점과 단점

**JVM 기반 실행 모델의 장점:**
- Bytecode로 플랫폼 독립성을 확보하고 동일 JAR를 여러 OS·CPU에서 실행할 수 있다.
- JIT가 런타임 Profile을 기반으로 실제 사용 패턴에 맞춘 최적화를 적용해 장기 실행 서버에서 네이티브에 근접한 성능을 낸다.
- GC, Bytecode 검증, Escape Analysis 등 자동화된 안전망이 메모리 오류와 보안 취약점을 줄인다.
- Thread Dump, Heap Dump, JFR 같은 표준 진단 도구로 운영 문제를 체계적으로 분석할 수 있다.

**JVM 기반 실행 모델의 단점:**
- Cold Start 시 Class Loading·JIT Compile 비용으로 초기 p99가 높게 나타난다.
- JIT Compile Thread 자체가 CPU를 소비해 배포 직후 순간적인 부하가 증가할 수 있다.
- Heap 기반 GC Stop-the-World가 지연 Spike를 만들어 실시간 게임 서버에서 문제가 될 수 있다.
- AOT와 달리 런타임에서야 최적화 결과가 확정되므로 성능 예측이 어렵다.
- Container 환경에서 JVM이 Host CPU·Memory를 기준으로 동작하면 실제 제한보다 큰 Thread Pool·Heap을 설정하는 문제가 생긴다.

## 7. 게임 서버·백엔드 실무 예시

게임 서버를 새 Region에 배포할 때 같은 JAR를 사용해도 JVM Version과 Option이 다르면 Startup, GC와 JIT 결과가 달라질 수 있다. 배포 Artifact와 Runtime 설정을 함께 Version 관리하고 Traffic 투입 전에 Warm-up과 Readiness를 확인한다.

Container 환경에서는 `-XX:MaxRAMPercentage=75` 등으로 JVM이 Container 메모리 제한을 인식하게 하고, `-XX:ActiveProcessorCount`로 실제 할당 CPU를 명시한다. Readiness Probe는 단순 Process 생존이 아니라 주요 Class Loading·Connection Pool 준비 완료를 확인한다. 새 Instance에 트래픽을 점진적으로 늘려 Cold p99가 기존 Instance에 영향을 주지 않게 한다.

## 8. 자주 하는 오해
- **JRE, JVM과 JDK를 모두 같은 프로그램으로 생각한다.** JDK는 개발 도구(javac·debugger 포함), JRE는 실행 환경(JVM + 표준 Library), JVM은 Bytecode 실행 엔진으로 포함 관계가 다르다.
- **Bytecode가 같으면 모든 Platform에서 동작이 완전히 같다.** File System 경로 구분자, Native Library 유무, 환경 변수 차이는 JVM이 추상화하지 않으므로 Platform별 테스트가 필요하다.
- **Class를 Loading하는 순간 Static Initializer가 즉시 실행된다.** 초기화는 해당 Class를 처음 사용(접근)하는 시점에 발생하며, Loading·Linking 단계와 구분해야 한다.
- **JIT가 컴파일한 Native Code는 실행 중 변경되지 않는다.** Type Profile 가정이 깨지면 Deoptimization으로 Interpreter 경로로 복귀하고 이후 재컴파일될 수 있다.
- **Warm-up 없는 단일 Benchmark 결과로 JVM 전체 성능을 판단한다.** Cold 상태의 결과는 JIT 미완료 상태이므로 JMH와 같은 도구로 Warm-up과 Dead Code 제거를 보장한 뒤 측정해야 한다.
- **Java는 태생적으로 느리다.** C2 JIT의 Inlining, Escape Analysis, Loop 벡터화 등 최적화로 장기 실행 서버에서는 네이티브에 근접한 성능을 낼 수 있다.
- **AOT(GraalVM Native Image)를 사용하면 JIT의 모든 장점을 유지하면서 시작 속도만 빨라진다.** AOT는 런타임 Profile 기반 최적화를 포기하므로 장기 실행 서버에서는 C2 JIT보다 처리량이 낮을 수 있다. Reflection 사용 코드는 설정 파일로 별도 선언해야 한다.
- **ClassNotFoundException과 NoClassDefFoundError가 같은 원인이다.** 전자는 런타임 Class 탐색 실패, 후자는 Compile 시점에는 있었으나 런타임 탐색 실패 또는 Static Initializer 예외로 원인 범위가 다르다.

## 9. 면접 질문

### Q1. 게임 서버 배포 직후 CPU 사용률이 비정상적으로 높습니다. JIT Compile Thread, GC 압박, Application 로직 부하를 어떻게 구분하고 진단하겠습니까?
JFR 녹화에서 JIT Compile 이벤트 비중을 확인합니다. Compile 이벤트가 집중되면 Warm-up 기간이므로 트래픽을 점진적으로 투입하고 Readiness Probe를 Warm-up 완료 후로 조정합니다. GC Log에서 Pause 빈도와 GC Cause를 확인해 Allocation 압박인지 구분합니다. Thread Dump에서 Worker Thread가 BLOCKED·WAITING이면 Lock 경합이나 외부 I/O 지연입니다.

### Q2. Plugin 서버에서 같은 이름의 Class를 사용하는데 ClassCastException이 발생합니다. 원인과 수정 방법은 무엇입니까?
같은 이름이라도 Class Loader가 다르면 JVM은 서로 다른 Type으로 취급합니다. `obj.getClass().getClassLoader()`와 캐스트 대상 Class의 Loader를 비교해 다른지 확인합니다. Plugin과 Core가 공유해야 하는 Class는 Bootstrap 또는 Platform Loader에서 로딩하도록 Loader 위임 정책을 정의합니다. Plugin API 인터페이스를 별도 모듈로 분리하고 Plugin ClassLoader가 해당 모듈을 위임하게 구성합니다.

### Q3. 신규 배포 Instance의 첫 1분간 응답 p99가 기존 Instance 대비 5배 높습니다. Cold Start 문제를 확인하고 완화하는 방법은 무엇입니까?
JFR 또는 `-XX:+PrintCompilation`으로 배포 직후 JIT Compile 이벤트가 집중되는지 확인합니다. Readiness Probe를 Process 생존이 아닌 `/warmup` 엔드포인트로 교체해, 주요 Class 로딩과 대표 요청을 미리 처리한 뒤 Ready 상태로 전환합니다. Load Balancer에서 신규 Instance에 트래픽을 0%에서 시작해 1분에 걸쳐 점진적으로 늘립니다. AOT(GraalVM Native Image)로 전환하면 Warm-up 없이 즉시 최대 속도로 시작하지만 런타임 최적화 수준이 낮아집니다.

### Q4. Container에서 JVM 응답이 극도로 느려지고 GC Pause가 빈번합니다. 어떤 설정 누락이 원인이고 어떻게 수정합니까?
JVM이 Container 메모리 제한을 인식하지 못해 Heap을 Host Memory 기준(예: 32GB)으로 설정하면 실제 Container 한도(예: 4GB)를 초과해 OS OOM Kill 전에 GC가 극도로 빈번해집니다. `-XX:MaxRAMPercentage=75`로 Container 메모리의 75%를 Heap 상한으로 명시합니다. `java -XshowSettings:all`로 인식된 CPU·Heap 값을 확인합니다. ForkJoinPool 등이 Host Core 수로 Thread를 생성하지 않도록 `-XX:ActiveProcessorCount`로 실제 할당 CPU를 명시합니다.

### Q5. JIT Deoptimization이 빈번해 Tick p99가 간헐적으로 급등합니다. 원인과 JFR로 확인하는 방법은 무엇입니까?
JFR에서 `Deoptimization` 이벤트를 필터링해 어떤 Method에서 발생하는지 확인합니다. 주요 원인: 인터페이스 구현체가 두 개로 늘어나 Megamorphic 상태가 되거나, null 체크 가정이 깨지거나, 인라인된 Method가 변경됩니다. `-XX:+TraceDeoptimization`으로 로그를 추가로 확인합니다. Hot Path에서 final 메서드 사용, Type 다형성 최소화, 불필요한 null 역참조 제거로 완화합니다.

### Q6. 장기 실행 게임 서버와 Serverless API 각각에 JIT와 AOT 중 무엇을 선택하고 이유는 무엇입니까?
장기 실행 게임 서버는 JIT(C2)를 선택합니다. 수백 시간 실행 동안 런타임 Profile 기반 Inlining·Escape Analysis·SIMD 최적화로 처리량이 AOT를 초과합니다. Reflection을 별도 설정 없이 자유롭게 사용할 수 있습니다. Serverless API는 AOT(GraalVM Native Image)를 선택합니다. 요청당 인스턴스가 짧게 살아 JIT Warm-up 기회가 없고 수십 ms 수준의 Cold Start가 필요합니다. Hibernate·Spring 등 Reflection 의존 라이브러리는 `-H:ReflectionConfigurationFiles`로 사전 선언이 필요합니다.

## 10. 예상 꼬리질문

- `-XX:+PrintCompilation` 출력에서 `made not entrant`와 `made zombie`가 각각 어떤 상태를 의미하고 운영에서 어떤 영향을 주나요?
- JVM Tiered Compilation에서 특정 Method가 C1에 머무르고 C2로 진행하지 않는 이유와, C2 컴파일을 강제하는 방법 및 부작용은 무엇인가요?
- Reflection을 많이 사용하는 Plugin 프레임워크를 GraalVM Native Image로 전환할 때 `-H:ReflectionConfigurationFiles` 누락으로 발생하는 런타임 오류와 사전 탐지 방법은 무엇인가요?
- 두 Plugin이 각각 다른 ClassLoader로 같은 버전의 Guava를 로딩할 때 발생하는 메모리 중복 비용과 격리 vs 공유 Trade-off를 어떻게 결정하나요?
- JFR Recording에서 JIT Compile 이벤트가 배포 후 5분까지 계속될 때 Warm-up 완료 시점을 어떤 지표로 판단하나요?
- Container CPU Limit이 밀리코어 500(0.5코어)일 때 `-XX:ActiveProcessorCount`를 명시하지 않으면 ForkJoinPool.commonPool() Thread 수가 어떻게 설정되고 어떤 문제가 생기나요?
- Static Initializer에서 DB Connection을 여는 코드가 있는데 DB가 다운된 상태로 Class가 처음 로딩되면 어떤 예외가 발생하고, 이후 같은 Class를 다시 로딩하려 하면 어떤 문제가 생기나요?

## 11. 30초 모범답변

> JVM은 Bytecode 실행과 Runtime 서비스를 제공하고 JRE는 실행에 필요한 JVM과 Library를, JDK는 Compiler와 개발 도구까지 포함합니다. Source는 javac으로 Bytecode가 되고 JVM이 해석하거나 Hot Code를 C1·C2 JIT로 최적화합니다. 배포 시 Warm-up 없이 트래픽을 받으면 Cold p99가 높게 나타나므로 Readiness 전에 대표 요청을 미리 처리해 JIT를 준비합니다.

## 12. 1~2분 확장답변

> JDK는 javac·debugger 등 개발 도구를 포함하고 JRE는 JVM과 표준 Library를 묶은 실행 환경이며 JVM은 Bytecode를 실행하는 가상 머신입니다. 최근에는 jlink로 필요한 모듈만 포함한 커스텀 Runtime Image를 만들어 배포합니다.
>
> Java Source는 javac으로 CPU 독립적인 Bytecode로 컴파일되고 JVM의 Class Loader가 Loading→Linking→Initialization 단계를 거쳐 메모리에 올립니다. 처음에는 Interpreter가 Bytecode를 해석하고, 반복 호출이 많은 Hot Code는 C1(기본 최적화)→C2(고도 최적화) JIT로 점진적으로 Native Code를 생성합니다. Type Profile 가정이 깨지면 Deoptimization으로 Interpreter 경로로 복귀합니다.
>
> AOT(GraalVM Native Image)는 시작 속도·메모리 효율이 장점이지만 런타임 Profile 기반 최적화를 포기하고 Reflection 설정이 필요합니다. 게임 서버처럼 장기 실행 환경에서는 C2 JIT의 처리량이 유리합니다. 운영에서는 Thread Dump로 실행 정체, Heap Dump로 객체 보유, JFR로 런타임 이벤트를 진단하고 배포 시 Readiness 전에 Warm-up을 완료해 Cold p99가 기존 Instance에 영향을 주지 않게 합니다.

## 13. 핵심 요약

- JDK > JRE > JVM 포함 관계: JDK에는 컴파일러·개발 도구, JRE는 JVM + 표준 Library(최근은 jlink 커스텀 이미지), JVM은 Bytecode 실행 엔진이다.
- Bytecode 플랫폼 독립성: javac이 CPU 명령 대신 Bytecode를 생성해 호환 JVM이 있는 모든 플랫폼에서 실행 가능하되 파일시스템·네이티브 라이브러리 차이는 남는다.
- Class Loading 3단계: Loading(바이너리 탐색) → Linking(검증·준비·해석) → Initialization(첫 사용 시 Static Initializer 실행).
- JIT 계층 최적화: Interpreter → C1(빠른 컴파일, 기본 최적화) → C2(느린 컴파일, 고도 최적화 + Escape Analysis·SIMD), Profile 가정 깨지면 Deoptimization.
- Warm-up 필요성: Cold 상태에서는 Class Loading·JIT 미완료로 p99가 높음 → 배포 시 Readiness 전에 대표 요청으로 Warm-up 필요.
- JIT vs AOT: JIT는 런타임 Profile 기반 최적화로 장기 실행 서버에 유리, AOT는 시작 속도·메모리 효율로 서버리스·마이크로서비스에 유리 (Reflection 설정 필요).
- 운영 진단 도구: Thread Dump(실행 정체), Heap Dump(객체 보유), JFR(런타임 이벤트), GC Log(GC 성능) — 각각 다른 문제를 진단한다.
- Container 환경 주의: JVM이 Host 자원을 기준으로 동작하지 않도록 `MaxRAMPercentage`·`ActiveProcessorCount`로 Container 제한을 명시한다.

## 한 줄 정리

> JVM은 Bytecode 실행과 Runtime 서비스를 제공하고 JRE는 실행에 필요한 JVM과 Library를, JDK는 Compiler와 개발 도구까지 포함합니다.
