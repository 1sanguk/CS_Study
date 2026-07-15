---
difficulty: 3
reading_time: 25분
interview_frequency: 5
importance: 5
---

# 08. Java Memory Model·synchronized·volatile·Atomic

> 게임 서버·백엔드 개발자를 위한 CS 면접 교재

## 학습 목표
- Java Memory Model은 Thread 간 Read·Write가 언제 보이는지 정의하고 synchronized, volatile과 Atomic API는 Happens-before 관계와 원자성을 구성한다.
- 핵심 동작과 Trade-off를 설명할 수 있다.
- Java 게임 서버 사례로 면접 답변을 구성할 수 있다.

## 1. 개요
Java Memory Model은 Thread 간 Read·Write가 언제 보이는지 정의하고 synchronized, volatile과 Atomic API는 Happens-before 관계와 원자성을 구성한다.

## 2. 왜 필요한가
멀티코어에서 실행 순서와 Cache 가시성을 명확히 해 Race Condition, Lost Update와 안전하지 않은 객체 공개를 막기 위해 필요하다.

## 3. 핵심 동작 원리
```text
thread A write → synchronization action → happens-before → thread B read
```
이 흐름은 Java Memory Model·synchronized·volatile·Atomic의 상태와 실행 경계를 보여 준다. 정상 처리뿐 아니라 실패와 Resource 정리 위치를 함께 본다.

### 1) 핵심 포인트
synchronized는 Monitor 획득과 해제로 임계 구역의 상호 배제와 가시성을 제공한다. 같은 Lock을 일관되게 사용해야 하며 Lock 안에서 느린 I/O를 수행하면 다른 Thread 대기가 길어진다.

### 2) 핵심 포인트
volatile Read·Write는 가시성과 순서 관계를 제공하지만 count++ 같은 Read-Modify-Write 전체를 원자적으로 만들지 않는다. 단순 상태 Flag나 단일 Writer 공개에는 적합할 수 있다.

### 3) 핵심 포인트
AtomicInteger의 incrementAndGet과 compareAndSet은 단일 값의 원자 갱신에 유용하다. 여러 Field 불변식, check-then-act와 복합 업무 상태는 Lock이나 한 Owner 실행 흐름이 필요하다.

### 4) 핵심 포인트
Happens-before가 없으면 한 Thread의 Write를 다른 Thread가 언제 어떤 순서로 볼지 Source 순서만으로 보장할 수 없다. final Field의 안전한 공개 규칙도 Constructor에서 this를 Escape시키면 깨질 수 있다.

### 5) 핵심 포인트
Room 상태를 한 Worker가 소유하면 대부분의 변경을 Message로 직렬화해 Lock 범위를 줄일 수 있다. 공유 Metrics는 Atomic, Snapshot 교체에는 volatile Reference를 적용할 수 있다.

### 6) 핵심 포인트
동기화 방식은 경쟁률, 임계 구역 시간과 불변식 범위를 기준으로 선택한다. Thread-safe Collection도 여러 Method를 묶은 업무 연산까지 자동 보호하지 않는다.

### 추가 핵심 내용

Happens-before는 실제 시계 순서가 아니라 한 동작의 결과가 다른 동작에 보이도록 하는 Memory Model 관계다. 같은 Monitor Unlock은 이후 Lock보다, volatile Write는 이후 같은 변수 Read보다 앞선다.

volatile은 복합 불변식을 보호하지 않는다. `count++`는 Read, 계산, Write이므로 두 Thread가 같은 값을 읽어 증가 하나를 잃을 수 있다. Atomic increment나 Lock을 사용한다.

CAS Loop는 충돌 시 재시도하며 높은 경쟁에서는 반복 실패와 CPU 사용이 늘 수 있다. 여러 Field가 함께 바뀌어야 하면 Immutable State를 Atomic Reference로 교체하거나 Lock·Owner 실행 흐름을 사용한다.

안전한 공개 없이 Mutable 객체를 공유하지 않는다. Constructor 중 this를 다른 Thread에 노출하지 않고, final Field·Lock·volatile Reference·Thread-safe Collection이 제공하는 공개 규칙을 활용한다.
### 구현·운영 검증 기준

- **입력 계약**: Java Memory Model Synchronized Volatile Atomic에서 입력 계약가 영향을 주는 코드 경계를 실제 Method와 객체 수명으로 표시한다. 정상 Case와 함께 Null, 최대 크기, 동시 호출, 예외와 취소를 재현하고 결과 상태와 Resource가 계약대로 남는지 확인한다. 측정 가능한 지표와 실패 시 대응을 Review 항목에 포함한다.
- **상태 소유권**: Java Memory Model Synchronized Volatile Atomic에서 상태 소유권가 영향을 주는 코드 경계를 실제 Method와 객체 수명으로 표시한다. 정상 Case와 함께 Null, 최대 크기, 동시 호출, 예외와 취소를 재현하고 결과 상태와 Resource가 계약대로 남는지 확인한다. 측정 가능한 지표와 실패 시 대응을 Review 항목에 포함한다.
- **Null 처리**: Java Memory Model Synchronized Volatile Atomic에서 Null 처리가 영향을 주는 코드 경계를 실제 Method와 객체 수명으로 표시한다. 정상 Case와 함께 Null, 최대 크기, 동시 호출, 예외와 취소를 재현하고 결과 상태와 Resource가 계약대로 남는지 확인한다. 측정 가능한 지표와 실패 시 대응을 Review 항목에 포함한다.
- **Type 안전성**: Java Memory Model Synchronized Volatile Atomic에서 Type 안전성가 영향을 주는 코드 경계를 실제 Method와 객체 수명으로 표시한다. 정상 Case와 함께 Null, 최대 크기, 동시 호출, 예외와 취소를 재현하고 결과 상태와 Resource가 계약대로 남는지 확인한다. 측정 가능한 지표와 실패 시 대응을 Review 항목에 포함한다.
- **경계값**: Java Memory Model Synchronized Volatile Atomic에서 경계값가 영향을 주는 코드 경계를 실제 Method와 객체 수명으로 표시한다. 정상 Case와 함께 Null, 최대 크기, 동시 호출, 예외와 취소를 재현하고 결과 상태와 Resource가 계약대로 남는지 확인한다. 측정 가능한 지표와 실패 시 대응을 Review 항목에 포함한다.
- **동시 실행**: Java Memory Model Synchronized Volatile Atomic에서 동시 실행가 영향을 주는 코드 경계를 실제 Method와 객체 수명으로 표시한다. 정상 Case와 함께 Null, 최대 크기, 동시 호출, 예외와 취소를 재현하고 결과 상태와 Resource가 계약대로 남는지 확인한다. 측정 가능한 지표와 실패 시 대응을 Review 항목에 포함한다.
- **예외 전파**: Java Memory Model Synchronized Volatile Atomic에서 예외 전파가 영향을 주는 코드 경계를 실제 Method와 객체 수명으로 표시한다. 정상 Case와 함께 Null, 최대 크기, 동시 호출, 예외와 취소를 재현하고 결과 상태와 Resource가 계약대로 남는지 확인한다. 측정 가능한 지표와 실패 시 대응을 Review 항목에 포함한다.
- **자원 정리**: Java Memory Model Synchronized Volatile Atomic에서 자원 정리가 영향을 주는 코드 경계를 실제 Method와 객체 수명으로 표시한다. 정상 Case와 함께 Null, 최대 크기, 동시 호출, 예외와 취소를 재현하고 결과 상태와 Resource가 계약대로 남는지 확인한다. 측정 가능한 지표와 실패 시 대응을 Review 항목에 포함한다.
- **성능 비용**: Java Memory Model Synchronized Volatile Atomic에서 성능 비용가 영향을 주는 코드 경계를 실제 Method와 객체 수명으로 표시한다. 정상 Case와 함께 Null, 최대 크기, 동시 호출, 예외와 취소를 재현하고 결과 상태와 Resource가 계약대로 남는지 확인한다. 측정 가능한 지표와 실패 시 대응을 Review 항목에 포함한다.
- **Memory 사용**: Java Memory Model Synchronized Volatile Atomic에서 Memory 사용가 영향을 주는 코드 경계를 실제 Method와 객체 수명으로 표시한다. 정상 Case와 함께 Null, 최대 크기, 동시 호출, 예외와 취소를 재현하고 결과 상태와 Resource가 계약대로 남는지 확인한다. 측정 가능한 지표와 실패 시 대응을 Review 항목에 포함한다.
- **Version 호환**: Java Memory Model Synchronized Volatile Atomic에서 Version 호환가 영향을 주는 코드 경계를 실제 Method와 객체 수명으로 표시한다. 정상 Case와 함께 Null, 최대 크기, 동시 호출, 예외와 취소를 재현하고 결과 상태와 Resource가 계약대로 남는지 확인한다. 측정 가능한 지표와 실패 시 대응을 Review 항목에 포함한다.
- **관찰 지표**: Java Memory Model Synchronized Volatile Atomic에서 관찰 지표가 영향을 주는 코드 경계를 실제 Method와 객체 수명으로 표시한다. 정상 Case와 함께 Null, 최대 크기, 동시 호출, 예외와 취소를 재현하고 결과 상태와 Resource가 계약대로 남는지 확인한다. 측정 가능한 지표와 실패 시 대응을 Review 항목에 포함한다.
- **부하 상한**: Java Memory Model Synchronized Volatile Atomic에서 부하 상한가 영향을 주는 코드 경계를 실제 Method와 객체 수명으로 표시한다. 정상 Case와 함께 Null, 최대 크기, 동시 호출, 예외와 취소를 재현하고 결과 상태와 Resource가 계약대로 남는지 확인한다. 측정 가능한 지표와 실패 시 대응을 Review 항목에 포함한다.
- **장애 복구**: Java Memory Model Synchronized Volatile Atomic에서 장애 복구가 영향을 주는 코드 경계를 실제 Method와 객체 수명으로 표시한다. 정상 Case와 함께 Null, 최대 크기, 동시 호출, 예외와 취소를 재현하고 결과 상태와 Resource가 계약대로 남는지 확인한다. 측정 가능한 지표와 실패 시 대응을 Review 항목에 포함한다.
- **Test 전략**: Java Memory Model Synchronized Volatile Atomic에서 Test 전략가 영향을 주는 코드 경계를 실제 Method와 객체 수명으로 표시한다. 정상 Case와 함께 Null, 최대 크기, 동시 호출, 예외와 취소를 재현하고 결과 상태와 Resource가 계약대로 남는지 확인한다. 측정 가능한 지표와 실패 시 대응을 Review 항목에 포함한다.
- **보안 경계**: Java Memory Model Synchronized Volatile Atomic에서 보안 경계가 영향을 주는 코드 경계를 실제 Method와 객체 수명으로 표시한다. 정상 Case와 함께 Null, 최대 크기, 동시 호출, 예외와 취소를 재현하고 결과 상태와 Resource가 계약대로 남는지 확인한다. 측정 가능한 지표와 실패 시 대응을 Review 항목에 포함한다.
- **배포 전환**: Java Memory Model Synchronized Volatile Atomic에서 배포 전환가 영향을 주는 코드 경계를 실제 Method와 객체 수명으로 표시한다. 정상 Case와 함께 Null, 최대 크기, 동시 호출, 예외와 취소를 재현하고 결과 상태와 Resource가 계약대로 남는지 확인한다. 측정 가능한 지표와 실패 시 대응을 Review 항목에 포함한다.
- **면접 설명**: Java Memory Model Synchronized Volatile Atomic에서 면접 설명가 영향을 주는 코드 경계를 실제 Method와 객체 수명으로 표시한다. 정상 Case와 함께 Null, 최대 크기, 동시 호출, 예외와 취소를 재현하고 결과 상태와 Resource가 계약대로 남는지 확인한다. 측정 가능한 지표와 실패 시 대응을 Review 항목에 포함한다.

이 기준은 기능을 무조건 복잡하게 만들기 위한 목록이 아니다. Java Memory Model Synchronized Volatile Atomic의 실제 호출 빈도와 장애 영향을 기준으로 필요한 항목을 선택하고, 변경 전후의 정확성과 p99를 비교한다.

## 4. 쉬운 예시
Room 상태를 한 Worker가 소유하면 대부분의 변경을 Message로 직렬화해 Lock 범위를 줄일 수 있다. 공유 Metrics는 Atomic, Snapshot 교체에는 volatile Reference를 적용할 수 있다.

## 5. 비슷한 개념과 비교
동기화 방식은 경쟁률, 임계 구역 시간과 불변식 범위를 기준으로 선택한다. Thread-safe Collection도 여러 Method를 묶은 업무 연산까지 자동 보호하지 않는다.

## 6. 장점과 단점
Java Memory Model·synchronized·volatile·Atomic은 Type Safety, 실행 구조와 운영 예측성을 높일 수 있다. 반면 추상화, Runtime과 Memory 비용을 추가할 수 있으므로 호출 빈도와 변경 가능성을 측정해 적용한다.

## 7. 게임 서버·백엔드 실무 예시
Room 상태를 한 Worker가 소유하면 대부분의 변경을 Message로 직렬화해 Lock 범위를 줄일 수 있다. 공유 Metrics는 Atomic, Snapshot 교체에는 volatile Reference를 적용할 수 있다. 처리량, p99, 오류율과 Resource 상한을 같은 시간축에서 관찰한다.

## 8. 자주 하는 오해
- Data Race의 Compile Time 보장과 Runtime 동작을 구분하지 않는다.
- Race Condition이 해결하는 문제와 남겨 두는 비용을 함께 설명하지 않는다.
- Happens-before을 사용하면 동시성·Memory 문제가 자동으로 사라진다고 본다.
- Monitor의 Version과 실행 환경 전제를 확인하지 않는다.
- synchronized관련 평균 성능만 보고 경계값과 p99를 측정하지 않는다.
## 9. 면접 질문
### Q1. Java Memory Model은 왜 필요한가요?
Compiler와 CPU 재배치, Cache 때문에 Thread 간 관찰 순서를 Source 순서만으로 판단할 수 없어 가시성과 순서 규칙을 정의합니다.

### Q2. synchronized와 volatile의 차이는 무엇인가요?
synchronized는 상호 배제와 가시성을 제공하고 volatile은 해당 변수 Read·Write의 가시성과 순서를 제공하지만 임계 구역을 만들지 않습니다.

### Q3. volatile count++가 안전하지 않은 이유는 무엇인가요?
Read-Modify-Write의 세 단계가 하나의 원자 연산이 아니어서 Lost Update가 발생할 수 있습니다.

### Q4. CAS의 장단점은 무엇인가요?
Blocking 없이 단일 값을 조건부 갱신할 수 있지만 경쟁이 높으면 Retry가 늘고 여러 값의 불변식 표현이 어렵습니다.

### Q5. 안전한 공개란 무엇인가요?
객체 초기화 결과가 다른 Thread에 올바르게 보이도록 Happens-before 관계를 통해 Reference를 전달하는 것입니다.
## 10. 예상 꼬리질문
- Data Race의 보장과 한계는 무엇인가요?
- Race Condition의 보장과 한계는 무엇인가요?
- Happens-before의 보장과 한계는 무엇인가요?
- Monitor의 보장과 한계는 무엇인가요?
- synchronized의 보장과 한계는 무엇인가요?

## 11. 30초 모범답변
> Java Memory Model은 Thread 간 동작의 가시성과 순서를 정의합니다. synchronized는 상호 배제와 가시성을, volatile은 단일 Read·Write의 가시성과 순서를 제공하지만 복합 연산을 원자화하지는 않습니다. 여러 Field 불변식은 Lock이나 상태 Owner로 보호합니다.

## 12. 1~2분 확장답변
> Java Memory Model은 Thread 간 Read·Write가 언제 보이는지 정의하고 synchronized, volatile과 Atomic API는 Happens-before 관계와 원자성을 구성한다. 멀티코어에서 실행 순서와 Cache 가시성을 명확히 해 Race Condition, Lost Update와 안전하지 않은 객체 공개를 막기 위해 필요하다. synchronized는 Monitor 획득과 해제로 임계 구역의 상호 배제와 가시성을 제공한다. 같은 Lock을 일관되게 사용해야 하며 Lock 안에서 느린 I/O를 수행하면 다른 Thread 대기가 길어진다. AtomicInteger의 incrementAndGet과 compareAndSet은 단일 값의 원자 갱신에 유용하다. 여러 Field 불변식, check-then-act와 복합 업무 상태는 Lock이나 한 Owner 실행 흐름이 필요하다. Room 상태를 한 Worker가 소유하면 대부분의 변경을 Message로 직렬화해 Lock 범위를 줄일 수 있다. 공유 Metrics는 Atomic, Snapshot 교체에는 volatile Reference를 적용할 수 있다.

## 13. 핵심 요약
- Java Memory Model은 Thread 간 Read·Write가 언제 보이는지 정의하고 synchronized, volatile과 Atomic API는 Happens-before 관계와 원자성을 구성한다.
- synchronized는 Monitor 획득과 해제로 임계 구역의 상호 배제와 가시성을 제공한다. 같은 Lock을 일관되게 사용해야 하며 Lock 안에서 느린 I/O를 수행하면 다른 Thread 대기가 길어진다.
- AtomicInteger의 incrementAndGet과 compareAndSet은 단일 값의 원자 갱신에 유용하다. 여러 Field 불변식, check-then-act와 복합 업무 상태는 Lock이나 한 Owner 실행 흐름이 필요하다.
- Room 상태를 한 Worker가 소유하면 대부분의 변경을 Message로 직렬화해 Lock 범위를 줄일 수 있다. 공유 Metrics는 Atomic, Snapshot 교체에는 volatile Reference를 적용할 수 있다.

## 한 줄 정리
> Java Memory Model은 Thread 간 동작의 가시성과 순서를 정의합니다.
