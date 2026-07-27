---
difficulty: 2
reading_time: 25분
interview_frequency: 5
importance: 5
---

# 04. Exception·Checked·Unchecked와 try-with-resources

> 게임 서버·백엔드 개발자를 위한 CS 면접 교재

## 학습 목표

- Checked/Unchecked Exception의 차이와 각 선택 기준(복구 가능성·API 계약 노출)을 설명할 수 있다.
- Exception 전파·Translation·Cause Chain 보존의 원칙을 설명할 수 있다.
- try-with-resources의 동작(역순 close, Suppressed Exception)과 finally와의 차이를 설명할 수 있다.
- 게임 서버의 Timeout/멱등성 상황에서 재시도 안전성을 고려한 예외 처리를 설계할 수 있다.

## 1. 개요

Java Exception은 정상 흐름과 분리해 실패를 전파하는 객체이며 Checked Exception은 호출자가 처리나 선언을 해야 하고 Unchecked Exception은 RuntimeException 계열이다.

## 2. 왜 필요한가

실패의 복구 가능성, 자원 정리와 API 계약을 명확히 해 오류를 숨기거나 중복 처리하지 않기 위해 필요하다.

## 3. 핵심 동작 원리

```text
operation → throw → stack unwinding → matching catch → finally/resource close
```

이 흐름은 Exception·Checked·Unchecked와 try-with-resources의 주요 처리 단계와 책임 경계를 나타낸다. 각 단계의 입력과 출력, 실패 시 복구 위치를 구분해야 한다.

### Throwable 계층과 Error·Exception 구분

Throwable 아래에는 Error와 Exception이 있다. Error는 일반적으로 Application이 정상 복구하기 어려운 JVM 수준 문제를 나타내고 Exception은 업무·환경 실패를 표현한다. 모든 Throwable을 한 번에 잡아 계속 실행하면 상태 손상을 숨길 수 있다.

### Checked와 Unchecked Exception 선택

Checked Exception은 Compile Time에 catch 또는 throws를 요구한다. 호출자가 합리적으로 복구할 수 있는 실패를 계약에 드러낼 수 있지만 계층 전체에 기계적인 전달 코드를 만들 수 있다. Unchecked는 Programming Error와 복구 지점이 먼 실패에 쓰이지만 문서화 책임은 남는다.

### 예외 전파와 finally 동작

예외가 발생하면 Stack을 거슬러 적절한 catch를 찾는다. finally는 정상·예외 경로의 정리에 사용되지만 return과 새 Exception으로 원래 실패를 덮지 않게 한다. catch는 구체적인 Type부터 배치한다.

### try-with-resources와 자원 정리

try-with-resources는 AutoCloseable 자원을 선언 역순으로 닫는다. 본문과 close가 모두 실패하면 본문 Exception이 주 예외가 되고 Close 실패는 Suppressed Exception으로 보존될 수 있다. DB Connection과 Stream은 GC가 아니라 명시적 Scope에서 닫는다.

### 예외 처리 경계와 Log 전략

예외를 Log한 뒤 같은 계층에서 그대로 던지고 상위에서 다시 Log하면 중복 Noise가 생긴다. 복구하거나 의미 있는 Context를 추가하는 경계에서 처리하고, 원인 Exception을 cause로 보존한다. 인증 Token과 개인정보는 Message에 넣지 않는다.

### 예외 빈도와 성능 비용

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

## 4. 쉬운 예시

try-with-resources의 Suppressed Exception 동작, Exception Translation의 Cause Chain 보존, Timeout 재시도 멱등성을 보여주는 예시다.

```java
// try-with-resources: 역순 close + Suppressed Exception
try (Connection conn = ds.getConnection();       // 1번째 선언
     PreparedStatement ps = conn.prepareStatement(sql)) { // 2번째 선언
    ps.execute();
} // 닫힘 순서: ps.close() → conn.close() (선언 역순)
// 본문에서 예외 발생 + close에서도 예외 발생 시:
// → 본문 예외가 주 예외, close 예외는 Suppressed로 보존
// e.getSuppressed() 로 확인 가능

// Exception Translation: Cause Chain 보존
class RankingRepository {
    void saveResult(MatchResult result) {
        try {
            // JDBC 또는 ORM 호출
            jdbcTemplate.update(sql, result.matchId(), result.score());
        } catch (DataAccessException e) {
            // ↓ 하위 DB 세부 타입을 업무 예외로 변환, cause 보존
            throw new RankingSaveException(
                "Failed to save ranking for matchId=" + result.matchId(), e);
            // Message에 matchId는 OK, 하지만 개인정보(email·주민번호 등)는 제외
        }
    }
}

// 복구 위치: 상위 UseCase에서 멱등성 판단 후 재시도 결정
class MatchResultUseCase {
    void process(MatchResult result) {
        try {
            rankingRepo.saveResult(result);
        } catch (RankingSaveException e) {
            if (isRetryable(e)) {
                // Idempotency Key = matchId → 중복 저장 방지
                retryQueue.enqueue(result); // 즉시 재시도 X → 큐로 지연
            } else {
                log.error("Non-retryable failure, matchId={}", result.matchId(), e);
                // 최종 처리 경계에서 한 번만 Log
            }
        }
    }
}

// finally vs try-with-resources 비교
// ← 구식: close 예외가 본문 예외를 덮어 원래 실패가 사라질 수 있음
Connection conn = null;
try {
    conn = ds.getConnection();
    conn.prepareStatement(sql).execute();
} finally {
    if (conn != null) conn.close(); // close 예외 발생 시 본문 예외 소실!
}

// ← 권장: try-with-resources가 본문 예외를 우선 보존
try (Connection conn = ds.getConnection()) {
    conn.prepareStatement(sql).execute();
}

// 예외를 정상 흐름 제어에 쓰면 안 되는 이유
// ← 잘못된 패턴: 정상적인 상황에서 예외를 던지면 Stack Trace 비용 발생
for (String token : tokens) {
    try {
        processToken(token); // 내부에서 "END" 토큰에 StopException 던짐
    } catch (StopException e) { break; } // 예외를 Loop 종료 제어에 사용 - 나쁜 패턴
}
```

## 5. 비슷한 개념과 비교

| 구분 | Checked Exception | Unchecked Exception | Error | Result Type (Optional 등) |
|---|---|---|---|---|
| Compile Time 강제 | 있음 (catch/throws) | 없음 | 없음 | 없음 |
| 중간 계층 선언 | 필요 (throws 전파) | 불필요 | 불필요 | 불필요 |
| 복구 의도 | 호출자가 복구 가능 | 프로그래밍 오류·불가 | JVM 수준 문제 | 예상된 성공/실패 표현 |
| 대표 예시 | IOException·SQLException | NPE·IllegalArgument | OutOfMemoryError | Optional·Result<T,E> |
| API 노출 여부 | 계약에 명시 | 문서화 책임 | 일반적으로 처리 안 함 | 반환 타입에 포함 |
| 적합 상황 | 외부 자원 실패·복구 가능 | 버그·전제 위반 | JVM 복구 불가 | 빈번한 실패·분기 처리 |

## 6. 장점과 단점

**명시적 예외 처리의 장점:**
- Checked Exception으로 호출자가 반드시 실패를 처리하게 강제해 API 계약이 명확해진다.
- try-with-resources로 자원 누수 없이 닫힘을 보장하고 Suppressed Exception으로 close 실패도 기록할 수 있다.
- Exception Translation으로 하위 라이브러리 세부 타입을 업무 계층에 노출하지 않고 Cause Chain으로 원인을 추적한다.

**명시적 예외 처리의 단점:**
- Checked Exception이 중간 계층에 throws 전파 코드를 기계적으로 추가하게 만들어 코드가 장황해진다.
- 예외를 정상 흐름 분기에 사용하면 Stack Trace 생성 비용과 가독성 문제가 생긴다.
- 모든 계층에서 중복 Log하면 Noise가 증가해 실제 원인을 찾기 어려워진다.
- Timeout 예외 후 무조건 재시도하면 멱등하지 않은 연산이 두 번 실행될 수 있다.

## 7. 게임 서버·백엔드 실무 예시

랭킹 DB 저장이 Timeout될 때 `SQLException`을 모든 계층에 그대로 노출하면 Service 계층이 DB 세부 구현에 결합된다. `RankingSaveException`으로 Translation하고 `matchId`를 Cause Chain에 보존하면 Service 계층은 재시도 가능 여부만 판단한다.

Match 결과 저장 후 바로 재시도하면 성공한 저장이 중복될 수 있다. `matchId`를 Unique Key로 두거나 Idempotency Key를 포함한 재시도 큐로 넘겨 지연 처리하면 중복 보상 지급을 방지한다. 예외율·원인 타입·재시도 횟수를 Metric으로 집계하되, 잘못된 입력(패킷 파싱 오류 등) 을 고비용 Stack Trace 예외로 남발하지 않는다.

## 8. 자주 하는 오해
- Checked Exception이면 언제나 호출자가 복구할 수 있다고 단정한다. Checked Exception은 "복구를 시도해야 한다"는 API 계약의 표현이며 실제 복구 가능 여부는 Context에 따라 다르다. 복구 불가능하면 Unchecked로 Wrap해서 전달하는 것이 더 명확할 수 있다.
- catch한 Exception을 무시하면 Server 가용성이 높아진다고 본다. 빈 catch 블록은 실패를 숨겨 상태 손상이 계속 누적된다. 최소한 로그를 남기고 적절한 복구 또는 상위 전달을 해야 한다.
- finally가 강제 Process 종료나 `System.exit()`에서도 반드시 실행된다고 생각한다. JVM 강제 종료, Process Crash, 전원 장애처럼 정상 Stack Unwinding이 불가능하면 실행이 보장되지 않는다.
- try-with-resources에서 close 예외는 항상 사라진다고 본다. 본문 예외가 주 예외가 되고 close 예외는 Suppressed Exception으로 보존된다. `e.getSuppressed()`로 확인할 수 있다.
- 동일 Exception을 모든 계층에서 반복 Log한다. 복구하거나 최종 처리하는 경계에서 한 번만 Correlation ID와 함께 기록한다. 중간 계층에서 Log만 하고 다시 던지면 같은 오류가 여러 줄로 중복된다.
- Timeout 예외 후 즉시 재시도하면 항상 안전하다고 생각한다. Timeout은 성공 여부가 불확실한 상태다. DB 쓰기·결제처럼 멱등하지 않은 연산은 Idempotency Key와 결과 조회 없이 재시도하면 중복 처리가 발생한다.
- 예외 메시지에 상세 정보를 많이 넣을수록 디버깅이 쉬워진다고 생각한다. SQL Parameter에 개인정보(이메일·주민번호·카드 번호)가 포함되면 예외 메시지가 로그에 노출된다. matchId·요청 ID 같은 추적 키만 메시지에 넣고 민감 정보는 제외한다.

## 9. 면접 질문
### Q1. Checked와 Unchecked Exception의 차이는 무엇인가요?
Checked Exception은 `catch` 또는 `throws`로 선언해야 Compile이 통과하는 Exception으로, 호출자가 복구를 시도해야 한다는 계약을 API에 드러낼 때 사용합니다. Unchecked Exception은 `RuntimeException` 계열로 Compile Time 강제가 없고, 프로그래밍 오류나 복구 지점이 먼 실패에 사용합니다. 선택 기준은 호출자가 합리적으로 복구할 수 있는지와 API 계약에 노출할 가치가 있는지입니다.

### Q2. try-with-resources는 어떻게 동작하나요?
`AutoCloseable`을 구현한 자원을 `try (...)` 블록에 선언하면 블록 종료 시 선언의 역순으로 `close()`가 호출됩니다. 본문과 `close()` 모두 예외가 발생하면 본문 예외가 주 예외가 되고 `close()` 예외는 Suppressed Exception으로 주 예외에 첨부됩니다. 기존 `finally` 방식은 `close()` 예외가 본문 예외를 덮어 원래 실패가 사라지는 문제가 있었습니다.

### Q3. finally가 실행되지 않을 수 있나요?
`System.exit()` 호출, JVM 강제 종료(kill -9), Process Crash, 전원 장애처럼 정상 Stack Unwinding이 불가능한 상황에서는 실행이 보장되지 않습니다. 또한 `finally` 내에서 새 예외를 던지거나 `return`을 쓰면 원래 예외가 억제됩니다. 중요한 자원 정리는 try-with-resources로 관리하는 것이 더 안전합니다.

### Q4. Exception Translation은 왜 사용하나요?
하위 라이브러리의 세부 Exception 타입(예: `SQLException`)을 상위 업무 계층에 직접 노출하면 계층 간 결합도가 높아지고 라이브러리 교체가 어려워집니다. Translation으로 업무 의미가 있는 예외(예: `RankingSaveException`)로 바꾸되 원래 원인은 `cause`로 보존해 Stack Trace 추적이 가능하게 합니다.

### Q5. 예외를 어디에서 Log해야 하나요?
복구하거나 요청 실패를 최종 확정하는 경계에서 Correlation ID·matchId 같은 추적 키와 함께 한 번만 기록합니다. 단순히 예외를 상위로 전달하는 중간 계층에서 Log하면 같은 오류가 여러 줄로 중복되어 원인 파악이 어려워집니다. 민감 정보(개인정보·인증 토큰)는 메시지에 포함하지 않습니다.

### Q6. 예외 처리에서 멱등성이 왜 중요한가요?
Timeout 예외는 서버가 실제로 처리를 완료했는지 불확실한 상태입니다. DB 쓰기·결제처럼 부작용이 있는 연산을 Idempotency Key 없이 즉시 재시도하면 중복 보상 지급이나 중복 결제가 발생합니다. `matchId`를 Unique Key로 설정하거나 재시도 큐에 넣어 지연 처리하면 결과 조회 후 중복 여부를 확인할 수 있습니다.

## 10. 예상 꼬리질문
- Checked Exception과 Unchecked Exception 중 무엇을 사용할지 어떻게 결정하나요? 두 가지를 혼합해서 쓰는 패턴도 있나요?
- try-with-resources에서 Suppressed Exception은 어떻게 확인하나요?
- Exception을 catch만 하고 아무 처리를 안 하면 어떤 문제가 생기나요?
- 게임 서버에서 Cause Chain을 유지하는 것이 왜 중요하고, Translation 시 원인을 잃으면 어떤 문제가 생기나요?
- `RuntimeException`을 extends해서 커스텀 예외를 만드는 기준은 무엇인가요?
- 예외를 정상적인 Loop 종료나 조건 분기에 사용하면 안 되는 이유는 무엇인가요?
- Exception이 Hot Path에서 반복 발생할 때 성능에 어떤 영향을 주나요?

## 11. 30초 모범답변

> Checked Exception은 처리나 선언이 Compile Time에 요구되고 Unchecked는 RuntimeException 계열입니다. 복구 가능한 경계에서 처리하고 그렇지 않으면 원인(Cause Chain)을 보존해 의미 있는 예외로 Translation합니다. DB Connection 같은 자원은 try-with-resources로 역순 close를 보장하고 Timeout 재시도 시 Idempotency Key로 중복 처리를 방지합니다.

## 12. 1~2분 확장답변

> Checked Exception은 호출자가 복구를 시도해야 한다는 계약을 API에 드러내며 Compile Time에 처리를 강제합니다. Unchecked Exception은 RuntimeException 계열로 프로그래밍 오류나 복구 지점이 먼 실패에 사용합니다. 선택 기준은 호출자가 합리적으로 복구할 수 있는지와 API 계약에 노출할 가치가 있는지입니다.
>
> 자원 정리에는 try-with-resources를 사용합니다. 선언 역순으로 close를 호출하고, 본문과 close 모두 예외가 발생하면 본문 예외가 주 예외가 되고 close 예외는 Suppressed로 보존됩니다. 기존 finally는 close 예외가 본문 예외를 덮어 원래 실패가 사라지는 문제가 있었습니다.
>
> Exception Translation은 하위 라이브러리 세부 타입을 상위 업무 예외로 변환하되 cause로 원인을 보존합니다. 로그는 최종 처리 경계에서 Correlation ID와 함께 한 번만 기록하고, 메시지에 개인정보는 포함하지 않습니다. Timeout 후 재시도는 Idempotency Key로 중복 여부를 확인해야 하고, matchId를 Unique Key로 두거나 재시도 큐로 지연 처리합니다.

## 13. 핵심 요약

- Checked vs Unchecked: Checked는 Compile Time 처리 강제·호출자 복구 가능 표현, Unchecked는 프로그래밍 오류·복구 지점 먼 실패 — 호출자 복구 가능성으로 선택.
- Throwable 계층: Error(JVM 복구 불가) → Exception(업무·환경 실패) → RuntimeException(Unchecked) — 모든 Throwable을 무조건 catch해 계속 실행하면 상태 손상 누적.
- try-with-resources 동작: 역순 close + 본문 예외가 주 예외 + close 예외는 Suppressed 보존 → `e.getSuppressed()`로 확인.
- finally 한계: `System.exit()`·JVM 강제 종료·Process Crash에서는 실행 불보장 — 중요 자원 정리는 try-with-resources가 더 안전.
- Exception Translation: 하위 라이브러리 세부 타입을 업무 예외로 Wrap + cause 보존 → 계층 결합도 감소 + 원인 추적 가능.
- 로그 전략: 최종 처리 경계에서 Correlation ID와 함께 한 번만 — 중간 계층 중복 Log는 Noise 증가 + 원인 파악 어려움.
- 멱등성과 재시도: Timeout 예외는 성공 여부 불확실 → Idempotency Key 없이 재시도하면 중복 처리 발생 → matchId Unique Key 또는 재시도 큐로 지연 처리.
- 예외 남용 금지: 정상 흐름 분기나 Loop 종료에 예외를 사용하면 Stack Trace 생성 비용 + 가독성 저하 — 예외율·재시도 횟수를 Metric으로 관찰.

## 한 줄 정리

> Checked Exception은 Compile Time 처리를 강제하고 Unchecked는 자유롭게 전파되며, 자원은 try-with-resources로 닫고 Timeout 재시도는 Idempotency Key로 멱등성을 보장합니다.
