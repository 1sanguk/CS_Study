---
difficulty: 3
reading_time: 25분
interview_frequency: 5
importance: 5
---

# 01. JVM·JRE·JDK와 Bytecode·JIT

> 게임 서버·백엔드 개발자를 위한 CS 면접 교재

## 학습 목표

- JVM(Java Virtual Machine)은 Java Bytecode를 실행하는 가상 머신이며 JRE는 실행 환경, JDK는 컴파일러와 개발 도구까지 포함한 개발 키트다.
- 등장 이유와 핵심 동작을 설명할 수 있다.
- 게임 서버·백엔드 사례와 Trade-off를 면접 답변으로 연결할 수 있다.

## 1. 개요

JVM(Java Virtual Machine)은 Java Bytecode를 실행하는 가상 머신이며 JRE는 실행 환경, JDK는 컴파일러와 개발 도구까지 포함한 개발 키트다.

## 2. 왜 필요한가

Java 프로그램을 운영체제와 CPU 차이에서 분리하고, 관리 메모리·검증·동적 최적화를 공통 실행 환경에서 제공하기 위해 필요하다.

## 3. 핵심 동작 원리

```text
Source(.java) → javac → Bytecode(.class) → Class Loader → JVM Interpreter/JIT → Native Code
```

이 흐름은 JVM·JRE·JDK와 Bytecode·JIT의 주요 처리 단계와 책임 경계를 나타낸다. 각 단계의 입력과 출력, 실패 시 복구 위치를 구분해야 한다.

### 1) 핵심 포인트

JDK에는 javac, debugger, javadoc과 실행 도구가 포함된다. JRE는 JVM과 표준 Library를 묶은 실행 환경이라는 개념이다. 최근 배포에서는 전체 JRE를 별도로 설치하기보다 jlink 등으로 필요한 Runtime Image를 만들 수 있으므로 제품 Version별 실제 구성을 확인한다.

### 2) 핵심 포인트

javac은 Source를 특정 CPU 명령이 아니라 Bytecode로 변환한다. 같은 Class File은 호환 JVM이 있는 여러 Platform에서 실행할 수 있다. 이는 모든 운영체제 동작이 완전히 같다는 뜻은 아니며 File System, Native Library와 환경 설정 차이는 남는다.

### 3) 핵심 포인트

Class Loader는 Bootstrap, Platform, Application Loader 같은 계층으로 Class를 찾고 Loading, Linking, Initialization을 수행한다. Linking에는 Bytecode 검증, Static Field 준비와 Symbolic Reference 해석이 포함된다. Class 초기화 시점과 Loader가 다르면 같은 이름도 다른 Type으로 취급될 수 있다.

### 4) 핵심 포인트

Interpreter는 Bytecode를 빠르게 실행 시작할 수 있지만 반복 실행 비용이 있다. JIT Compiler는 Hot Method와 Loop를 Native Code로 바꾸고 Inlining, Escape Analysis 같은 최적화를 적용한다. Profile 가정이 깨지면 Deoptimization으로 안전한 실행 경로로 돌아갈 수 있다.

### 5) 핵심 포인트

Warm-up 전과 후 성능이 다른 이유는 Class Loading, JIT Compile과 Cache가 점진적으로 준비되기 때문이다. 짧은 Benchmark를 한 번 실행해 Java가 느리다고 결론 내리지 않는다. JMH 같은 도구로 Dead Code 제거와 Warm-up을 고려한다.

### 6) 핵심 포인트

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
### 구현·운영 검증 기준

- **입력 계약**: JVM JRE JDK Bytecode JIT에서 입력 계약가 영향을 주는 코드 경계를 실제 Method와 객체 수명으로 표시한다. 정상 Case와 함께 Null, 최대 크기, 동시 호출, 예외와 취소를 재현하고 결과 상태와 Resource가 계약대로 남는지 확인한다. 측정 가능한 지표와 실패 시 대응을 Review 항목에 포함한다.
- **상태 소유권**: JVM JRE JDK Bytecode JIT에서 상태 소유권가 영향을 주는 코드 경계를 실제 Method와 객체 수명으로 표시한다. 정상 Case와 함께 Null, 최대 크기, 동시 호출, 예외와 취소를 재현하고 결과 상태와 Resource가 계약대로 남는지 확인한다. 측정 가능한 지표와 실패 시 대응을 Review 항목에 포함한다.
- **Null 처리**: JVM JRE JDK Bytecode JIT에서 Null 처리가 영향을 주는 코드 경계를 실제 Method와 객체 수명으로 표시한다. 정상 Case와 함께 Null, 최대 크기, 동시 호출, 예외와 취소를 재현하고 결과 상태와 Resource가 계약대로 남는지 확인한다. 측정 가능한 지표와 실패 시 대응을 Review 항목에 포함한다.
- **Type 안전성**: JVM JRE JDK Bytecode JIT에서 Type 안전성가 영향을 주는 코드 경계를 실제 Method와 객체 수명으로 표시한다. 정상 Case와 함께 Null, 최대 크기, 동시 호출, 예외와 취소를 재현하고 결과 상태와 Resource가 계약대로 남는지 확인한다. 측정 가능한 지표와 실패 시 대응을 Review 항목에 포함한다.
- **경계값**: JVM JRE JDK Bytecode JIT에서 경계값가 영향을 주는 코드 경계를 실제 Method와 객체 수명으로 표시한다. 정상 Case와 함께 Null, 최대 크기, 동시 호출, 예외와 취소를 재현하고 결과 상태와 Resource가 계약대로 남는지 확인한다. 측정 가능한 지표와 실패 시 대응을 Review 항목에 포함한다.
- **동시 실행**: JVM JRE JDK Bytecode JIT에서 동시 실행가 영향을 주는 코드 경계를 실제 Method와 객체 수명으로 표시한다. 정상 Case와 함께 Null, 최대 크기, 동시 호출, 예외와 취소를 재현하고 결과 상태와 Resource가 계약대로 남는지 확인한다. 측정 가능한 지표와 실패 시 대응을 Review 항목에 포함한다.
- **예외 전파**: JVM JRE JDK Bytecode JIT에서 예외 전파가 영향을 주는 코드 경계를 실제 Method와 객체 수명으로 표시한다. 정상 Case와 함께 Null, 최대 크기, 동시 호출, 예외와 취소를 재현하고 결과 상태와 Resource가 계약대로 남는지 확인한다. 측정 가능한 지표와 실패 시 대응을 Review 항목에 포함한다.
- **자원 정리**: JVM JRE JDK Bytecode JIT에서 자원 정리가 영향을 주는 코드 경계를 실제 Method와 객체 수명으로 표시한다. 정상 Case와 함께 Null, 최대 크기, 동시 호출, 예외와 취소를 재현하고 결과 상태와 Resource가 계약대로 남는지 확인한다. 측정 가능한 지표와 실패 시 대응을 Review 항목에 포함한다.
- **성능 비용**: JVM JRE JDK Bytecode JIT에서 성능 비용가 영향을 주는 코드 경계를 실제 Method와 객체 수명으로 표시한다. 정상 Case와 함께 Null, 최대 크기, 동시 호출, 예외와 취소를 재현하고 결과 상태와 Resource가 계약대로 남는지 확인한다. 측정 가능한 지표와 실패 시 대응을 Review 항목에 포함한다.
- **Memory 사용**: JVM JRE JDK Bytecode JIT에서 Memory 사용가 영향을 주는 코드 경계를 실제 Method와 객체 수명으로 표시한다. 정상 Case와 함께 Null, 최대 크기, 동시 호출, 예외와 취소를 재현하고 결과 상태와 Resource가 계약대로 남는지 확인한다. 측정 가능한 지표와 실패 시 대응을 Review 항목에 포함한다.
- **Version 호환**: JVM JRE JDK Bytecode JIT에서 Version 호환가 영향을 주는 코드 경계를 실제 Method와 객체 수명으로 표시한다. 정상 Case와 함께 Null, 최대 크기, 동시 호출, 예외와 취소를 재현하고 결과 상태와 Resource가 계약대로 남는지 확인한다. 측정 가능한 지표와 실패 시 대응을 Review 항목에 포함한다.
- **관찰 지표**: JVM JRE JDK Bytecode JIT에서 관찰 지표가 영향을 주는 코드 경계를 실제 Method와 객체 수명으로 표시한다. 정상 Case와 함께 Null, 최대 크기, 동시 호출, 예외와 취소를 재현하고 결과 상태와 Resource가 계약대로 남는지 확인한다. 측정 가능한 지표와 실패 시 대응을 Review 항목에 포함한다.
- **부하 상한**: JVM JRE JDK Bytecode JIT에서 부하 상한가 영향을 주는 코드 경계를 실제 Method와 객체 수명으로 표시한다. 정상 Case와 함께 Null, 최대 크기, 동시 호출, 예외와 취소를 재현하고 결과 상태와 Resource가 계약대로 남는지 확인한다. 측정 가능한 지표와 실패 시 대응을 Review 항목에 포함한다.
- **장애 복구**: JVM JRE JDK Bytecode JIT에서 장애 복구가 영향을 주는 코드 경계를 실제 Method와 객체 수명으로 표시한다. 정상 Case와 함께 Null, 최대 크기, 동시 호출, 예외와 취소를 재현하고 결과 상태와 Resource가 계약대로 남는지 확인한다. 측정 가능한 지표와 실패 시 대응을 Review 항목에 포함한다.
- **Test 전략**: JVM JRE JDK Bytecode JIT에서 Test 전략가 영향을 주는 코드 경계를 실제 Method와 객체 수명으로 표시한다. 정상 Case와 함께 Null, 최대 크기, 동시 호출, 예외와 취소를 재현하고 결과 상태와 Resource가 계약대로 남는지 확인한다. 측정 가능한 지표와 실패 시 대응을 Review 항목에 포함한다.
- **보안 경계**: JVM JRE JDK Bytecode JIT에서 보안 경계가 영향을 주는 코드 경계를 실제 Method와 객체 수명으로 표시한다. 정상 Case와 함께 Null, 최대 크기, 동시 호출, 예외와 취소를 재현하고 결과 상태와 Resource가 계약대로 남는지 확인한다. 측정 가능한 지표와 실패 시 대응을 Review 항목에 포함한다.
- **배포 전환**: JVM JRE JDK Bytecode JIT에서 배포 전환가 영향을 주는 코드 경계를 실제 Method와 객체 수명으로 표시한다. 정상 Case와 함께 Null, 최대 크기, 동시 호출, 예외와 취소를 재현하고 결과 상태와 Resource가 계약대로 남는지 확인한다. 측정 가능한 지표와 실패 시 대응을 Review 항목에 포함한다.
- **면접 설명**: JVM JRE JDK Bytecode JIT에서 면접 설명가 영향을 주는 코드 경계를 실제 Method와 객체 수명으로 표시한다. 정상 Case와 함께 Null, 최대 크기, 동시 호출, 예외와 취소를 재현하고 결과 상태와 Resource가 계약대로 남는지 확인한다. 측정 가능한 지표와 실패 시 대응을 Review 항목에 포함한다.

이 기준은 기능을 무조건 복잡하게 만들기 위한 목록이 아니다. JVM JRE JDK Bytecode JIT의 실제 호출 빈도와 장애 영향을 기준으로 필요한 항목을 선택하고, 변경 전후의 정확성과 p99를 비교한다.

## 4. 쉬운 예시

게임 서버를 새 Region에 배포할 때 같은 JAR를 사용해도 JVM Version과 Option이 다르면 Startup, GC와 JIT 결과가 달라질 수 있다. 배포 Artifact와 Runtime 설정을 함께 Version 관리하고 Traffic 투입 전에 Warm-up과 Readiness를 확인한다.

## 5. 비슷한 개념과 비교

AOT는 배포 전에 Native Code를 만들어 Startup과 예측성을 높이기 좋고 JIT는 실제 실행 Profile에 맞춘 최적화가 강점이다. AOT도 Reflection 설정과 Platform별 Build 비용이 있으며 어느 한쪽이 항상 우수하지 않다.

## 6. 장점과 단점

JVM·JRE·JDK와 Bytecode·JIT을 올바르게 적용하면 코드 계약과 상태 흐름이 명확해지고 변경과 장애 진단이 쉬워진다. 반면 잘못된 추상화, 불필요한 객체와 Runtime 비용을 만들 수 있다. 실제 호출 빈도와 변경 축을 측정해 필요한 범위만 사용한다.

## 7. 게임 서버·백엔드 실무 예시

게임 서버를 새 Region에 배포할 때 같은 JAR를 사용해도 JVM Version과 Option이 다르면 Startup, GC와 JIT 결과가 달라질 수 있다. 배포 Artifact와 Runtime 설정을 함께 Version 관리하고 Traffic 투입 전에 Warm-up과 Readiness를 확인한다. 운영에서는 처리량, 지연 p99, 오류율, Memory와 Thread 상태를 같은 시간축에서 관찰한다.

## 8. 자주 하는 오해
- JRE, JVM과 JDK를 모두 같은 프로그램 이름으로 사용한다.
- Bytecode만 같으면 Native Library와 File System 차이도 사라진다고 생각한다.
- Class를 Loading하는 순간 Static Initializer가 언제나 즉시 실행된다고 본다.
- JIT가 만든 Native Code는 실행 중 다시 바뀌지 않는다고 생각한다.
- Warm-up 없는 단일 Benchmark 결과로 JVM 성능을 결론 낸다.
## 9. 면접 질문
### Q1. JVM, JRE와 JDK의 차이는 무엇인가요?
JVM은 Bytecode 실행, Memory 관리와 Runtime 서비스를 담당합니다. JRE는 실행에 필요한 JVM과 표준 Library를 묶은 개념이고 JDK는 javac, debugger 같은 개발 도구까지 포함합니다.

### Q2. Java Source가 실행되기까지 과정을 설명해 주세요.
javac이 Source를 Class File의 Bytecode로 Compile합니다. JVM은 Class를 Loading·Linking·Initialization한 뒤 Bytecode를 해석하고 반복되는 Hot Code를 JIT로 Native Code로 바꿀 수 있습니다.

### Q3. Interpreter와 JIT는 어떻게 다른가요?
Interpreter는 빠르게 실행을 시작하지만 명령 해석 비용이 반복됩니다. JIT는 실행 Profile을 이용해 Hot Code를 최적화하지만 Compile과 Warm-up 비용이 있고 가정이 깨지면 Deoptimization할 수 있습니다.

### Q4. Class Loading의 주요 단계는 무엇인가요?
Loading은 Class Binary를 찾고, Linking은 검증·준비·해석을 수행하며, Initialization은 Static Initializer와 명시적 Static Field 초기화를 실행합니다.

### Q5. Warm-up이 필요한 이유는 무엇인가요?
초기에는 Class Loading, JIT Compile과 Cache 준비가 진행됩니다. 운영 지연과 Benchmark는 Cold 상태와 충분히 Warm-up된 Steady State를 구분해야 합니다.
## 10. 예상 꼬리질문

- JDK와 Runtime 경계의 핵심 계약과 실패 조건은 무엇인가요?
- Bytecode 호환성의 핵심 계약과 실패 조건은 무엇인가요?
- Class Loading의 핵심 계약과 실패 조건은 무엇인가요?
- Loading·Linking·Initialization의 핵심 계약과 실패 조건은 무엇인가요?
- Class Loader 격리의 핵심 계약과 실패 조건은 무엇인가요?

## 11. 30초 모범답변

> JVM은 Bytecode 실행과 Runtime 서비스를 제공하고 JRE는 실행에 필요한 JVM과 Library를, JDK는 Compiler와 개발 도구까지 포함합니다. Source는 javac으로 Bytecode가 되고 JVM이 해석하거나 Hot Code를 JIT Compile합니다. 운영에서는 Java Version과 Runtime Option, Warm-up 상태까지 함께 관리합니다.

## 12. 1~2분 확장답변

> JVM(Java Virtual Machine)은 Java Bytecode를 실행하는 가상 머신이며 JRE는 실행 환경, JDK는 컴파일러와 개발 도구까지 포함한 개발 키트다. Java 프로그램을 운영체제와 CPU 차이에서 분리하고, 관리 메모리·검증·동적 최적화를 공통 실행 환경에서 제공하기 위해 필요하다. javac은 Source를 특정 CPU 명령이 아니라 Bytecode로 변환한다. 같은 Class File은 호환 JVM이 있는 여러 Platform에서 실행할 수 있다. 이는 모든 운영체제 동작이 완전히 같다는 뜻은 아니며 File System, Native Library와 환경 설정 차이는 남는다. AOT는 배포 전에 Native Code를 만들어 Startup과 예측성을 높이기 좋고 JIT는 실제 실행 Profile에 맞춘 최적화가 강점이다. AOT도 Reflection 설정과 Platform별 Build 비용이 있으며 어느 한쪽이 항상 우수하지 않다. 게임 서버를 새 Region에 배포할 때 같은 JAR를 사용해도 JVM Version과 Option이 다르면 Startup, GC와 JIT 결과가 달라질 수 있다. 배포 Artifact와 Runtime 설정을 함께 Version 관리하고 Traffic 투입 전에 Warm-up과 Readiness를 확인한다.

## 13. 핵심 요약

- JVM(Java Virtual Machine)은 Java Bytecode를 실행하는 가상 머신이며 JRE는 실행 환경, JDK는 컴파일러와 개발 도구까지 포함한 개발 키트다.
- JDK에는 javac, debugger, javadoc과 실행 도구가 포함된다. JRE는 JVM과 표준 Library를 묶은 실행 환경이라는 개념이다. 최근 배포에서는 전체 JRE를 별도로 설치하기보다 jlink 등으로 필요한 Runtime Image를 만들 수 있으므로 제품 Version별 실제 구성을 확인한다.
- AOT는 배포 전에 Native Code를 만들어 Startup과 예측성을 높이기 좋고 JIT는 실제 실행 Profile에 맞춘 최적화가 강점이다. AOT도 Reflection 설정과 Platform별 Build 비용이 있으며 어느 한쪽이 항상 우수하지 않다.
- 게임 서버를 새 Region에 배포할 때 같은 JAR를 사용해도 JVM Version과 Option이 다르면 Startup, GC와 JIT 결과가 달라질 수 있다. 배포 Artifact와 Runtime 설정을 함께 Version 관리하고 Traffic 투입 전에 Warm-up과 Readiness를 확인한다.

## 한 줄 정리

> JVM은 Bytecode 실행과 Runtime 서비스를 제공하고 JRE는 실행에 필요한 JVM과 Library를, JDK는 Compiler와 개발 도구까지 포함합니다.
