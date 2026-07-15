---
difficulty: 3
reading_time: 25분
interview_frequency: 5
importance: 5
---

# 07. JVM Memory·GC와 Reference

> 게임 서버·백엔드 개발자를 위한 CS 면접 교재

## 학습 목표
- JVM은 Heap, Thread Stack, Method Area 성격의 Metadata 영역과 Native Memory를 사용하며 GC는 도달할 수 없는 Heap 객체를 회수한다.
- 핵심 동작과 Trade-off를 설명할 수 있다.
- Java 게임 서버 사례로 면접 답변을 구성할 수 있다.

## 1. 개요
JVM은 Heap, Thread Stack, Method Area 성격의 Metadata 영역과 Native Memory를 사용하며 GC는 도달할 수 없는 Heap 객체를 회수한다.

## 2. 왜 필요한가
객체 Lifetime과 Allocation Rate가 Server 지연, Memory 상한과 장애 복구에 직접 영향을 주므로 Root, 세대와 외부 Resource를 구분해야 한다.

## 3. 핵심 동작 원리
```text
allocation → Eden/Heap → reachable from GC Roots? → retain or reclaim → compact/region reuse
```
이 흐름은 JVM Memory·GC와 Reference의 상태와 실행 경계를 보여 준다. 정상 처리뿐 아니라 실패와 Resource 정리 위치를 함께 본다.

### 1) 핵심 포인트
Local Variable과 Operand Stack은 Thread별 Frame에 있고 객체는 일반적으로 Heap에 생성된다. Class Metadata, JIT Code Cache, Direct Buffer 같은 Memory는 Java Heap 밖에도 있어 Heap 사용량만으로 RSS를 설명할 수 없다.

### 2) 핵심 포인트
GC Root에는 실행 Thread의 Reference, Static Field와 JNI Reference 등이 포함될 수 있다. Root에서 강한 참조 Chain으로 도달 가능한 객체는 사용하지 않아도 회수되지 않으므로 Collection과 Listener 정리를 확인한다.

### 3) 핵심 포인트
세대 가설은 많은 객체가 짧게 산다는 관찰을 이용한다. Minor Collection과 Old 영역 정리는 Collector에 따라 세부 동작이 다르므로 이름보다 Pause, Throughput와 Heap 목표를 본다.

### 4) 핵심 포인트
Soft, Weak와 Phantom Reference는 강한 참조와 다른 도달 가능성 정책을 제공하지만 일반 Cache의 만능 해법은 아니다. 외부 Resource는 GC가 아니라 AutoCloseable Scope에서 닫는다.

### 5) 핵심 포인트
Match별 임시 Event가 끝난 뒤 Global Map에 남으면 Old 영역이 증가한다. Heap Dump Dominator와 Allocation Profile로 보유 경로를 찾고 Session 종료 시 Registry를 해제한다.

### 6) 핵심 포인트
큰 Heap은 Collection 빈도를 줄일 수 있지만 회수 작업과 장애 시 Dump 비용을 키울 수 있다. Container Limit, Native Memory와 Headroom을 포함해 용량을 잡는다.

### 추가 핵심 내용

Heap만 줄인다고 Process Memory가 모두 줄지는 않는다. Thread Stack, Metaspace, Code Cache, Direct Buffer와 Native Library Allocation을 함께 본다. Container OOM이면 Heap Dump뿐 아니라 Native Memory Tracking과 Thread 수를 확인한다.

Heap Dump에서는 큰 객체 하나보다 GC Root에서 객체를 붙잡는 Retained Size와 Dominator를 본다. 종료된 Session이 Listener, Scheduled Task나 ThreadLocal에 남았는지 확인한다. Allocation Profile은 누가 많이 만드는지, Heap Dump는 누가 오래 보유하는지를 보여 준다.

Weak Reference는 Key가 다른 곳에서 강하게 참조되지 않을 때 회수될 수 있지만 회수 시점은 업무 Cache 계약이 아니다. Cache에는 명시적 Size, TTL과 Hit Ratio를 두는 편이 예측 가능하다.

Collector 선택은 이름보다 Pause 목표, Throughput, Heap 크기와 사용하는 JDK의 지원 범위로 판단한다. GC Log에서 Allocation Rate, Pause 원인, Old 영역 증가와 Promotion 실패 징후를 시간축으로 비교한다.
### 구현·운영 검증 기준

- **입력 계약**: JVM Memory GC Reference에서 입력 계약가 영향을 주는 코드 경계를 실제 Method와 객체 수명으로 표시한다. 정상 Case와 함께 Null, 최대 크기, 동시 호출, 예외와 취소를 재현하고 결과 상태와 Resource가 계약대로 남는지 확인한다. 측정 가능한 지표와 실패 시 대응을 Review 항목에 포함한다.
- **상태 소유권**: JVM Memory GC Reference에서 상태 소유권가 영향을 주는 코드 경계를 실제 Method와 객체 수명으로 표시한다. 정상 Case와 함께 Null, 최대 크기, 동시 호출, 예외와 취소를 재현하고 결과 상태와 Resource가 계약대로 남는지 확인한다. 측정 가능한 지표와 실패 시 대응을 Review 항목에 포함한다.
- **Null 처리**: JVM Memory GC Reference에서 Null 처리가 영향을 주는 코드 경계를 실제 Method와 객체 수명으로 표시한다. 정상 Case와 함께 Null, 최대 크기, 동시 호출, 예외와 취소를 재현하고 결과 상태와 Resource가 계약대로 남는지 확인한다. 측정 가능한 지표와 실패 시 대응을 Review 항목에 포함한다.
- **Type 안전성**: JVM Memory GC Reference에서 Type 안전성가 영향을 주는 코드 경계를 실제 Method와 객체 수명으로 표시한다. 정상 Case와 함께 Null, 최대 크기, 동시 호출, 예외와 취소를 재현하고 결과 상태와 Resource가 계약대로 남는지 확인한다. 측정 가능한 지표와 실패 시 대응을 Review 항목에 포함한다.
- **경계값**: JVM Memory GC Reference에서 경계값가 영향을 주는 코드 경계를 실제 Method와 객체 수명으로 표시한다. 정상 Case와 함께 Null, 최대 크기, 동시 호출, 예외와 취소를 재현하고 결과 상태와 Resource가 계약대로 남는지 확인한다. 측정 가능한 지표와 실패 시 대응을 Review 항목에 포함한다.
- **동시 실행**: JVM Memory GC Reference에서 동시 실행가 영향을 주는 코드 경계를 실제 Method와 객체 수명으로 표시한다. 정상 Case와 함께 Null, 최대 크기, 동시 호출, 예외와 취소를 재현하고 결과 상태와 Resource가 계약대로 남는지 확인한다. 측정 가능한 지표와 실패 시 대응을 Review 항목에 포함한다.
- **예외 전파**: JVM Memory GC Reference에서 예외 전파가 영향을 주는 코드 경계를 실제 Method와 객체 수명으로 표시한다. 정상 Case와 함께 Null, 최대 크기, 동시 호출, 예외와 취소를 재현하고 결과 상태와 Resource가 계약대로 남는지 확인한다. 측정 가능한 지표와 실패 시 대응을 Review 항목에 포함한다.
- **자원 정리**: JVM Memory GC Reference에서 자원 정리가 영향을 주는 코드 경계를 실제 Method와 객체 수명으로 표시한다. 정상 Case와 함께 Null, 최대 크기, 동시 호출, 예외와 취소를 재현하고 결과 상태와 Resource가 계약대로 남는지 확인한다. 측정 가능한 지표와 실패 시 대응을 Review 항목에 포함한다.
- **성능 비용**: JVM Memory GC Reference에서 성능 비용가 영향을 주는 코드 경계를 실제 Method와 객체 수명으로 표시한다. 정상 Case와 함께 Null, 최대 크기, 동시 호출, 예외와 취소를 재현하고 결과 상태와 Resource가 계약대로 남는지 확인한다. 측정 가능한 지표와 실패 시 대응을 Review 항목에 포함한다.
- **Memory 사용**: JVM Memory GC Reference에서 Memory 사용가 영향을 주는 코드 경계를 실제 Method와 객체 수명으로 표시한다. 정상 Case와 함께 Null, 최대 크기, 동시 호출, 예외와 취소를 재현하고 결과 상태와 Resource가 계약대로 남는지 확인한다. 측정 가능한 지표와 실패 시 대응을 Review 항목에 포함한다.
- **Version 호환**: JVM Memory GC Reference에서 Version 호환가 영향을 주는 코드 경계를 실제 Method와 객체 수명으로 표시한다. 정상 Case와 함께 Null, 최대 크기, 동시 호출, 예외와 취소를 재현하고 결과 상태와 Resource가 계약대로 남는지 확인한다. 측정 가능한 지표와 실패 시 대응을 Review 항목에 포함한다.
- **관찰 지표**: JVM Memory GC Reference에서 관찰 지표가 영향을 주는 코드 경계를 실제 Method와 객체 수명으로 표시한다. 정상 Case와 함께 Null, 최대 크기, 동시 호출, 예외와 취소를 재현하고 결과 상태와 Resource가 계약대로 남는지 확인한다. 측정 가능한 지표와 실패 시 대응을 Review 항목에 포함한다.
- **부하 상한**: JVM Memory GC Reference에서 부하 상한가 영향을 주는 코드 경계를 실제 Method와 객체 수명으로 표시한다. 정상 Case와 함께 Null, 최대 크기, 동시 호출, 예외와 취소를 재현하고 결과 상태와 Resource가 계약대로 남는지 확인한다. 측정 가능한 지표와 실패 시 대응을 Review 항목에 포함한다.
- **장애 복구**: JVM Memory GC Reference에서 장애 복구가 영향을 주는 코드 경계를 실제 Method와 객체 수명으로 표시한다. 정상 Case와 함께 Null, 최대 크기, 동시 호출, 예외와 취소를 재현하고 결과 상태와 Resource가 계약대로 남는지 확인한다. 측정 가능한 지표와 실패 시 대응을 Review 항목에 포함한다.
- **Test 전략**: JVM Memory GC Reference에서 Test 전략가 영향을 주는 코드 경계를 실제 Method와 객체 수명으로 표시한다. 정상 Case와 함께 Null, 최대 크기, 동시 호출, 예외와 취소를 재현하고 결과 상태와 Resource가 계약대로 남는지 확인한다. 측정 가능한 지표와 실패 시 대응을 Review 항목에 포함한다.
- **보안 경계**: JVM Memory GC Reference에서 보안 경계가 영향을 주는 코드 경계를 실제 Method와 객체 수명으로 표시한다. 정상 Case와 함께 Null, 최대 크기, 동시 호출, 예외와 취소를 재현하고 결과 상태와 Resource가 계약대로 남는지 확인한다. 측정 가능한 지표와 실패 시 대응을 Review 항목에 포함한다.
- **배포 전환**: JVM Memory GC Reference에서 배포 전환가 영향을 주는 코드 경계를 실제 Method와 객체 수명으로 표시한다. 정상 Case와 함께 Null, 최대 크기, 동시 호출, 예외와 취소를 재현하고 결과 상태와 Resource가 계약대로 남는지 확인한다. 측정 가능한 지표와 실패 시 대응을 Review 항목에 포함한다.
- **면접 설명**: JVM Memory GC Reference에서 면접 설명가 영향을 주는 코드 경계를 실제 Method와 객체 수명으로 표시한다. 정상 Case와 함께 Null, 최대 크기, 동시 호출, 예외와 취소를 재현하고 결과 상태와 Resource가 계약대로 남는지 확인한다. 측정 가능한 지표와 실패 시 대응을 Review 항목에 포함한다.

이 기준은 기능을 무조건 복잡하게 만들기 위한 목록이 아니다. JVM Memory GC Reference의 실제 호출 빈도와 장애 영향을 기준으로 필요한 항목을 선택하고, 변경 전후의 정확성과 p99를 비교한다.

## 4. 쉬운 예시
Match별 임시 Event가 끝난 뒤 Global Map에 남으면 Old 영역이 증가한다. Heap Dump Dominator와 Allocation Profile로 보유 경로를 찾고 Session 종료 시 Registry를 해제한다.

## 5. 비슷한 개념과 비교
큰 Heap은 Collection 빈도를 줄일 수 있지만 회수 작업과 장애 시 Dump 비용을 키울 수 있다. Container Limit, Native Memory와 Headroom을 포함해 용량을 잡는다.

## 6. 장점과 단점
JVM Memory·GC와 Reference은 Type Safety, 실행 구조와 운영 예측성을 높일 수 있다. 반면 추상화, Runtime과 Memory 비용을 추가할 수 있으므로 호출 빈도와 변경 가능성을 측정해 적용한다.

## 7. 게임 서버·백엔드 실무 예시
Match별 임시 Event가 끝난 뒤 Global Map에 남으면 Old 영역이 증가한다. Heap Dump Dominator와 Allocation Profile로 보유 경로를 찾고 Session 종료 시 Registry를 해제한다. 처리량, p99, 오류율과 Resource 상한을 같은 시간축에서 관찰한다.

## 8. 자주 하는 오해
- Heap의 Compile Time 보장과 Runtime 동작을 구분하지 않는다.
- Thread Stack이 해결하는 문제와 남겨 두는 비용을 함께 설명하지 않는다.
- Metaspace을 사용하면 동시성·Memory 문제가 자동으로 사라진다고 본다.
- Code Cache의 Version과 실행 환경 전제를 확인하지 않는다.
- Native Memory관련 평균 성능만 보고 경계값과 p99를 측정하지 않는다.
## 9. 면접 질문
### Q1. JVM Memory 영역을 설명해 주세요.
Heap, Thread별 Stack, Class Metadata 영역, Code Cache와 Native Memory가 있습니다. Process RSS는 Heap 하나보다 클 수 있습니다.

### Q2. GC Root와 Reachability는 무엇인가요?
실행 Thread, Static Field와 JNI Reference 같은 Root에서 강한 참조로 도달 가능한 객체는 GC 대상이 아닙니다.

### Q3. Java에서도 Memory Leak이 발생하나요?
사용하지 않는 객체를 Global Map, Listener나 ThreadLocal이 계속 참조하면 GC가 회수하지 못하는 논리적 Leak이 발생합니다.

### Q4. Young·Old Generation의 목적은 무엇인가요?
많은 객체가 짧게 산다는 관찰을 이용해 새 객체를 자주 효율적으로 회수하고 오래 생존한 객체를 별도로 관리합니다.

### Q5. Heap과 RSS가 다른 이유는 무엇인가요?
RSS에는 Heap 외에도 Thread Stack, Metaspace, JIT Code, Direct Buffer와 Native Allocation이 포함됩니다.
## 10. 예상 꼬리질문
- Heap의 보장과 한계는 무엇인가요?
- Thread Stack의 보장과 한계는 무엇인가요?
- Metaspace의 보장과 한계는 무엇인가요?
- Code Cache의 보장과 한계는 무엇인가요?
- Native Memory의 보장과 한계는 무엇인가요?

## 11. 30초 모범답변
> JVM GC는 Reference Count가 아니라 GC Root에서의 도달 가능성을 기준으로 Heap 객체를 회수합니다. Java에서도 Global Collection이나 Listener가 객체를 계속 참조하면 논리적 Leak이 생깁니다. 운영에서는 Heap뿐 아니라 Metaspace, Direct Buffer와 Native Memory를 함께 관찰합니다.

## 12. 1~2분 확장답변
> JVM은 Heap, Thread Stack, Method Area 성격의 Metadata 영역과 Native Memory를 사용하며 GC는 도달할 수 없는 Heap 객체를 회수한다. 객체 Lifetime과 Allocation Rate가 Server 지연, Memory 상한과 장애 복구에 직접 영향을 주므로 Root, 세대와 외부 Resource를 구분해야 한다. Local Variable과 Operand Stack은 Thread별 Frame에 있고 객체는 일반적으로 Heap에 생성된다. Class Metadata, JIT Code Cache, Direct Buffer 같은 Memory는 Java Heap 밖에도 있어 Heap 사용량만으로 RSS를 설명할 수 없다. 세대 가설은 많은 객체가 짧게 산다는 관찰을 이용한다. Minor Collection과 Old 영역 정리는 Collector에 따라 세부 동작이 다르므로 이름보다 Pause, Throughput와 Heap 목표를 본다. Match별 임시 Event가 끝난 뒤 Global Map에 남으면 Old 영역이 증가한다. Heap Dump Dominator와 Allocation Profile로 보유 경로를 찾고 Session 종료 시 Registry를 해제한다.

## 13. 핵심 요약
- JVM은 Heap, Thread Stack, Method Area 성격의 Metadata 영역과 Native Memory를 사용하며 GC는 도달할 수 없는 Heap 객체를 회수한다.
- Local Variable과 Operand Stack은 Thread별 Frame에 있고 객체는 일반적으로 Heap에 생성된다. Class Metadata, JIT Code Cache, Direct Buffer 같은 Memory는 Java Heap 밖에도 있어 Heap 사용량만으로 RSS를 설명할 수 없다.
- 세대 가설은 많은 객체가 짧게 산다는 관찰을 이용한다. Minor Collection과 Old 영역 정리는 Collector에 따라 세부 동작이 다르므로 이름보다 Pause, Throughput와 Heap 목표를 본다.
- Match별 임시 Event가 끝난 뒤 Global Map에 남으면 Old 영역이 증가한다. Heap Dump Dominator와 Allocation Profile로 보유 경로를 찾고 Session 종료 시 Registry를 해제한다.

## 한 줄 정리
> JVM GC는 Reference Count가 아니라 GC Root에서의 도달 가능성을 기준으로 Heap 객체를 회수합니다.
