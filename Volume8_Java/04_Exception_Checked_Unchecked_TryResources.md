---
difficulty: 2
reading_time: 25분
interview_frequency: 5
importance: 5
---

# 04. Exception·Checked·Unchecked와 try-with-resources

> 게임 서버·백엔드 개발자를 위한 CS 면접 교재

## 학습 목표

- Java Exception은 정상 흐름과 분리해 실패를 전파하는 객체이며 Checked Exception은 호출자가 처리나 선언을 해야 하고 Unchecked Exception은 RuntimeException 계열이다.
- 등장 이유와 핵심 동작을 설명할 수 있다.
- 게임 서버·백엔드 사례와 Trade-off를 면접 답변으로 연결할 수 있다.

## 1. 개요

Java Exception은 정상 흐름과 분리해 실패를 전파하는 객체이며 Checked Exception은 호출자가 처리나 선언을 해야 하고 Unchecked Exception은 RuntimeException 계열이다.

## 2. 왜 필요한가

실패의 복구 가능성, 자원 정리와 API 계약을 명확히 해 오류를 숨기거나 중복 처리하지 않기 위해 필요하다.

## 3. 핵심 동작 원리

```text
operation → throw → stack unwinding → matching catch → finally/resource close
```

이 흐름은 Exception·Checked·Unchecked와 try-with-resources의 주요 처리 단계와 책임 경계를 나타낸다. 각 단계의 입력과 출력, 실패 시 복구 위치를 구분해야 한다.

### 1) 핵심 포인트

Throwable 아래에는 Error와 Exception이 있다. Error는 일반적으로 Application이 정상 복구하기 어려운 JVM 수준 문제를 나타내고 Exception은 업무·환경 실패를 표현한다. 모든 Throwable을 한 번에 잡아 계속 실행하면 상태 손상을 숨길 수 있다.

### 2) 핵심 포인트

Checked Exception은 Compile Time에 catch 또는 throws를 요구한다. 호출자가 합리적으로 복구할 수 있는 실패를 계약에 드러낼 수 있지만 계층 전체에 기계적인 전달 코드를 만들 수 있다. Unchecked는 Programming Error와 복구 지점이 먼 실패에 쓰이지만 문서화 책임은 남는다.

### 3) 핵심 포인트

예외가 발생하면 Stack을 거슬러 적절한 catch를 찾는다. finally는 정상·예외 경로의 정리에 사용되지만 return과 새 Exception으로 원래 실패를 덮지 않게 한다. catch는 구체적인 Type부터 배치한다.

### 4) 핵심 포인트

try-with-resources는 AutoCloseable 자원을 선언 역순으로 닫는다. 본문과 close가 모두 실패하면 본문 Exception이 주 예외가 되고 Close 실패는 Suppressed Exception으로 보존될 수 있다. DB Connection과 Stream은 GC가 아니라 명시적 Scope에서 닫는다.

### 5) 핵심 포인트

예외를 Log한 뒤 같은 계층에서 그대로 던지고 상위에서 다시 Log하면 중복 Noise가 생긴다. 복구하거나 의미 있는 Context를 추가하는 경계에서 처리하고, 원인 Exception을 cause로 보존한다. 인증 Token과 개인정보는 Message에 넣지 않는다.

### 6) 핵심 포인트

예외는 드문 실패 경로에 사용한다. 정상적인 Packet Type 분기나 Loop 종료에 반복적으로 던지면 Stack Trace 생성과 가독성 비용이 커진다. Hot Path 오류율과 예외 수를 Metric으로 관찰한다.

### 예외 설계 원칙

- **복구 위치**: 낮은 계층은 실패 원인과 Context를 보존하고 업무 결정을 아는 계층이 Retry, 대체 결과 또는 사용자 오류를 선택한다.
- **Checked 선택**: 호출자가 즉시 다른 동작을 선택할 수 있고 API 계약에 드러낼 가치가 있을 때 사용한다. 모든 구현 세부 예외를 그대로 throws에 노출하지 않는다.
- **Translation**: SQLException을 StorageException으로 바꿀 때 원인을 cause로 포함한다. Message에는 Query 목적과 요청 ID를 넣되 SQL Parameter의 개인정보는 제외한다.
- **Resource 정리**: 여러 AutoCloseable은 선언의 역순으로 닫힌다. 본문 Exception과 close Exception이 함께 발생하면 Suppressed 목록까지 확인한다.
- **중복 Log 방지**: 복구하지 않고 그대로 전달하는 계층마다 Log하지 않는다. 최종 처리 경계에서 Correlation ID와 Stack Trace를 한 번 기록한다.
- **Retry 안전성**: Timeout은 실패와 성공 여부가 불확실할 수 있다. DB 쓰기나 결제는 Idempotency Key와 결과 조회 없이 무조건 재실행하지 않는다.

### 서버 장애 예시

Match 결과 저장이 Timeout되면 같은 보상 지급을 즉시 반복하지 않는다. Match ID를 Unique Key로 저장하고 기존 결과를 조회해 Commit 여부를 확정한다. 예외율, 원인 Type과 Retry 횟수를 Metric으로 집계하되 예상 가능한 잘못된 입력을 고비용 Stack Trace 예외로 남발하지 않는다.
### 구현·운영 검증 기준

- **입력 계약**: Exception Checked Unchecked TryResources에서 입력 계약가 영향을 주는 코드 경계를 실제 Method와 객체 수명으로 표시한다. 정상 Case와 함께 Null, 최대 크기, 동시 호출, 예외와 취소를 재현하고 결과 상태와 Resource가 계약대로 남는지 확인한다. 측정 가능한 지표와 실패 시 대응을 Review 항목에 포함한다.
- **상태 소유권**: Exception Checked Unchecked TryResources에서 상태 소유권가 영향을 주는 코드 경계를 실제 Method와 객체 수명으로 표시한다. 정상 Case와 함께 Null, 최대 크기, 동시 호출, 예외와 취소를 재현하고 결과 상태와 Resource가 계약대로 남는지 확인한다. 측정 가능한 지표와 실패 시 대응을 Review 항목에 포함한다.
- **Null 처리**: Exception Checked Unchecked TryResources에서 Null 처리가 영향을 주는 코드 경계를 실제 Method와 객체 수명으로 표시한다. 정상 Case와 함께 Null, 최대 크기, 동시 호출, 예외와 취소를 재현하고 결과 상태와 Resource가 계약대로 남는지 확인한다. 측정 가능한 지표와 실패 시 대응을 Review 항목에 포함한다.
- **Type 안전성**: Exception Checked Unchecked TryResources에서 Type 안전성가 영향을 주는 코드 경계를 실제 Method와 객체 수명으로 표시한다. 정상 Case와 함께 Null, 최대 크기, 동시 호출, 예외와 취소를 재현하고 결과 상태와 Resource가 계약대로 남는지 확인한다. 측정 가능한 지표와 실패 시 대응을 Review 항목에 포함한다.
- **경계값**: Exception Checked Unchecked TryResources에서 경계값가 영향을 주는 코드 경계를 실제 Method와 객체 수명으로 표시한다. 정상 Case와 함께 Null, 최대 크기, 동시 호출, 예외와 취소를 재현하고 결과 상태와 Resource가 계약대로 남는지 확인한다. 측정 가능한 지표와 실패 시 대응을 Review 항목에 포함한다.
- **동시 실행**: Exception Checked Unchecked TryResources에서 동시 실행가 영향을 주는 코드 경계를 실제 Method와 객체 수명으로 표시한다. 정상 Case와 함께 Null, 최대 크기, 동시 호출, 예외와 취소를 재현하고 결과 상태와 Resource가 계약대로 남는지 확인한다. 측정 가능한 지표와 실패 시 대응을 Review 항목에 포함한다.
- **예외 전파**: Exception Checked Unchecked TryResources에서 예외 전파가 영향을 주는 코드 경계를 실제 Method와 객체 수명으로 표시한다. 정상 Case와 함께 Null, 최대 크기, 동시 호출, 예외와 취소를 재현하고 결과 상태와 Resource가 계약대로 남는지 확인한다. 측정 가능한 지표와 실패 시 대응을 Review 항목에 포함한다.
- **자원 정리**: Exception Checked Unchecked TryResources에서 자원 정리가 영향을 주는 코드 경계를 실제 Method와 객체 수명으로 표시한다. 정상 Case와 함께 Null, 최대 크기, 동시 호출, 예외와 취소를 재현하고 결과 상태와 Resource가 계약대로 남는지 확인한다. 측정 가능한 지표와 실패 시 대응을 Review 항목에 포함한다.
- **성능 비용**: Exception Checked Unchecked TryResources에서 성능 비용가 영향을 주는 코드 경계를 실제 Method와 객체 수명으로 표시한다. 정상 Case와 함께 Null, 최대 크기, 동시 호출, 예외와 취소를 재현하고 결과 상태와 Resource가 계약대로 남는지 확인한다. 측정 가능한 지표와 실패 시 대응을 Review 항목에 포함한다.
- **Memory 사용**: Exception Checked Unchecked TryResources에서 Memory 사용가 영향을 주는 코드 경계를 실제 Method와 객체 수명으로 표시한다. 정상 Case와 함께 Null, 최대 크기, 동시 호출, 예외와 취소를 재현하고 결과 상태와 Resource가 계약대로 남는지 확인한다. 측정 가능한 지표와 실패 시 대응을 Review 항목에 포함한다.
- **Version 호환**: Exception Checked Unchecked TryResources에서 Version 호환가 영향을 주는 코드 경계를 실제 Method와 객체 수명으로 표시한다. 정상 Case와 함께 Null, 최대 크기, 동시 호출, 예외와 취소를 재현하고 결과 상태와 Resource가 계약대로 남는지 확인한다. 측정 가능한 지표와 실패 시 대응을 Review 항목에 포함한다.
- **관찰 지표**: Exception Checked Unchecked TryResources에서 관찰 지표가 영향을 주는 코드 경계를 실제 Method와 객체 수명으로 표시한다. 정상 Case와 함께 Null, 최대 크기, 동시 호출, 예외와 취소를 재현하고 결과 상태와 Resource가 계약대로 남는지 확인한다. 측정 가능한 지표와 실패 시 대응을 Review 항목에 포함한다.
- **부하 상한**: Exception Checked Unchecked TryResources에서 부하 상한가 영향을 주는 코드 경계를 실제 Method와 객체 수명으로 표시한다. 정상 Case와 함께 Null, 최대 크기, 동시 호출, 예외와 취소를 재현하고 결과 상태와 Resource가 계약대로 남는지 확인한다. 측정 가능한 지표와 실패 시 대응을 Review 항목에 포함한다.
- **장애 복구**: Exception Checked Unchecked TryResources에서 장애 복구가 영향을 주는 코드 경계를 실제 Method와 객체 수명으로 표시한다. 정상 Case와 함께 Null, 최대 크기, 동시 호출, 예외와 취소를 재현하고 결과 상태와 Resource가 계약대로 남는지 확인한다. 측정 가능한 지표와 실패 시 대응을 Review 항목에 포함한다.
- **Test 전략**: Exception Checked Unchecked TryResources에서 Test 전략가 영향을 주는 코드 경계를 실제 Method와 객체 수명으로 표시한다. 정상 Case와 함께 Null, 최대 크기, 동시 호출, 예외와 취소를 재현하고 결과 상태와 Resource가 계약대로 남는지 확인한다. 측정 가능한 지표와 실패 시 대응을 Review 항목에 포함한다.
- **보안 경계**: Exception Checked Unchecked TryResources에서 보안 경계가 영향을 주는 코드 경계를 실제 Method와 객체 수명으로 표시한다. 정상 Case와 함께 Null, 최대 크기, 동시 호출, 예외와 취소를 재현하고 결과 상태와 Resource가 계약대로 남는지 확인한다. 측정 가능한 지표와 실패 시 대응을 Review 항목에 포함한다.
- **배포 전환**: Exception Checked Unchecked TryResources에서 배포 전환가 영향을 주는 코드 경계를 실제 Method와 객체 수명으로 표시한다. 정상 Case와 함께 Null, 최대 크기, 동시 호출, 예외와 취소를 재현하고 결과 상태와 Resource가 계약대로 남는지 확인한다. 측정 가능한 지표와 실패 시 대응을 Review 항목에 포함한다.
- **면접 설명**: Exception Checked Unchecked TryResources에서 면접 설명가 영향을 주는 코드 경계를 실제 Method와 객체 수명으로 표시한다. 정상 Case와 함께 Null, 최대 크기, 동시 호출, 예외와 취소를 재현하고 결과 상태와 Resource가 계약대로 남는지 확인한다. 측정 가능한 지표와 실패 시 대응을 Review 항목에 포함한다.

이 기준은 기능을 무조건 복잡하게 만들기 위한 목록이 아니다. Exception Checked Unchecked TryResources의 실제 호출 빈도와 장애 영향을 기준으로 필요한 항목을 선택하고, 변경 전후의 정확성과 p99를 비교한다.

## 4. 쉬운 예시

랭킹 DB 저장이 Timeout되면 Repository는 Driver Exception을 그대로 모든 계층에 노출하기보다 Retry 가능한 저장 실패로 변환할 수 있다. 요청 ID를 유지하고 상위 Use Case가 멱등성 여부에 따라 재시도나 실패 응답을 결정한다.

## 5. 비슷한 개념과 비교

Result Type은 예상 가능한 성공·실패를 값으로 다루기 쉽고 Exception은 여러 Stack Frame을 가로질러 실패를 전파하기 쉽다. 빈도, 복구 위치와 API 스타일을 기준으로 선택한다.

## 6. 장점과 단점

Exception·Checked·Unchecked와 try-with-resources을 올바르게 적용하면 코드 계약과 상태 흐름이 명확해지고 변경과 장애 진단이 쉬워진다. 반면 잘못된 추상화, 불필요한 객체와 Runtime 비용을 만들 수 있다. 실제 호출 빈도와 변경 축을 측정해 필요한 범위만 사용한다.

## 7. 게임 서버·백엔드 실무 예시

랭킹 DB 저장이 Timeout되면 Repository는 Driver Exception을 그대로 모든 계층에 노출하기보다 Retry 가능한 저장 실패로 변환할 수 있다. 요청 ID를 유지하고 상위 Use Case가 멱등성 여부에 따라 재시도나 실패 응답을 결정한다. 운영에서는 처리량, 지연 p99, 오류율, Memory와 Thread 상태를 같은 시간축에서 관찰한다.

## 8. 자주 하는 오해
- Checked Exception이면 언제나 호출자가 복구할 수 있다고 단정한다.
- catch한 Exception을 무시하면 Server 가용성이 높아진다고 본다.
- finally가 강제 Process 종료에서도 반드시 실행된다고 생각한다.
- try-with-resources에서 close 실패는 항상 사라진다고 본다.
- 동일 Exception을 모든 계층에서 반복 Log한다.
## 9. 면접 질문
### Q1. Checked와 Unchecked Exception의 차이는 무엇인가요?
Checked Exception은 catch하거나 throws로 선언해야 하고 Unchecked Exception은 RuntimeException 계열이라 Compile Time 강제가 없습니다. 선택은 호출자의 복구 가능성과 API 계약을 기준으로 합니다.

### Q2. try-with-resources는 어떻게 동작하나요?
AutoCloseable Resource를 Scope 종료 시 선언의 역순으로 닫습니다. 본문과 close가 모두 실패하면 본문 예외가 주 예외가 되고 close 실패는 Suppressed Exception으로 남을 수 있습니다.

### Q3. finally가 실행되지 않을 수 있나요?
JVM 강제 종료, Process Crash나 전원 장애처럼 정상 Stack Unwinding이 불가능하면 실행을 보장할 수 없습니다. 중요한 상태는 finally 하나에만 의존하지 않습니다.

### Q4. Exception Translation은 왜 사용하나요?
하위 Library 세부 Type을 상위 업무 계층에 노출하지 않고 의미 있는 실패 계약으로 바꾸기 위해 사용합니다. 원래 원인은 cause로 보존해야 합니다.

### Q5. 예외를 어디에서 Log해야 하나요?
복구하거나 요청 실패를 최종 확정하는 경계에서 필요한 Context와 함께 기록합니다. 같은 예외를 전달만 하는 모든 계층에서 중복 Log하지 않습니다.
## 10. 예상 꼬리질문

- Throwable 계층의 핵심 계약과 실패 조건은 무엇인가요?
- Error의 핵심 계약과 실패 조건은 무엇인가요?
- Checked Exception의 핵심 계약과 실패 조건은 무엇인가요?
- Unchecked Exception의 핵심 계약과 실패 조건은 무엇인가요?
- throws 계약의 핵심 계약과 실패 조건은 무엇인가요?

## 11. 30초 모범답변

> Checked Exception은 처리나 선언이 Compile Time에 요구되고 Unchecked는 RuntimeException 계열입니다. 복구 가능한 경계에서 처리하고 그렇지 않으면 원인을 보존해 의미 있는 예외로 전달합니다. DB Connection 같은 자원은 try-with-resources로 Scope 종료 시 명시적으로 닫습니다.

## 12. 1~2분 확장답변

> Java Exception은 정상 흐름과 분리해 실패를 전파하는 객체이며 Checked Exception은 호출자가 처리나 선언을 해야 하고 Unchecked Exception은 RuntimeException 계열이다. 실패의 복구 가능성, 자원 정리와 API 계약을 명확히 해 오류를 숨기거나 중복 처리하지 않기 위해 필요하다. Checked Exception은 Compile Time에 catch 또는 throws를 요구한다. 호출자가 합리적으로 복구할 수 있는 실패를 계약에 드러낼 수 있지만 계층 전체에 기계적인 전달 코드를 만들 수 있다. Unchecked는 Programming Error와 복구 지점이 먼 실패에 쓰이지만 문서화 책임은 남는다. Result Type은 예상 가능한 성공·실패를 값으로 다루기 쉽고 Exception은 여러 Stack Frame을 가로질러 실패를 전파하기 쉽다. 빈도, 복구 위치와 API 스타일을 기준으로 선택한다. 랭킹 DB 저장이 Timeout되면 Repository는 Driver Exception을 그대로 모든 계층에 노출하기보다 Retry 가능한 저장 실패로 변환할 수 있다. 요청 ID를 유지하고 상위 Use Case가 멱등성 여부에 따라 재시도나 실패 응답을 결정한다.

## 13. 핵심 요약

- Java Exception은 정상 흐름과 분리해 실패를 전파하는 객체이며 Checked Exception은 호출자가 처리나 선언을 해야 하고 Unchecked Exception은 RuntimeException 계열이다.
- Throwable 아래에는 Error와 Exception이 있다. Error는 일반적으로 Application이 정상 복구하기 어려운 JVM 수준 문제를 나타내고 Exception은 업무·환경 실패를 표현한다. 모든 Throwable을 한 번에 잡아 계속 실행하면 상태 손상을 숨길 수 있다.
- Result Type은 예상 가능한 성공·실패를 값으로 다루기 쉽고 Exception은 여러 Stack Frame을 가로질러 실패를 전파하기 쉽다. 빈도, 복구 위치와 API 스타일을 기준으로 선택한다.
- 랭킹 DB 저장이 Timeout되면 Repository는 Driver Exception을 그대로 모든 계층에 노출하기보다 Retry 가능한 저장 실패로 변환할 수 있다. 요청 ID를 유지하고 상위 Use Case가 멱등성 여부에 따라 재시도나 실패 응답을 결정한다.

## 한 줄 정리

> Checked Exception은 처리나 선언이 Compile Time에 요구되고 Unchecked는 RuntimeException 계열입니다.
