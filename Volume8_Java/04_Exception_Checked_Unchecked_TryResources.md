---
difficulty: 2
reading_time: 25분
interview_frequency: 5
importance: 5
---

# 04. Exception·Checked·Unchecked와 try-with-resources


## 학습 목표

- Match 결과 저장 Timeout 예외 이후 즉시 재시도할지, Idempotency Key로 멱등성을 확인한 뒤 재시도 큐로 지연 처리할지 판단하는 기준을 결정할 수 있다.
- Service 계층에 `DataAccessException`이 직접 노출된 코드를 발견했을 때, Exception Translation과 Cause Chain 보존이 필요한 경계를 식별하고 커스텀 예외로 Wrap하는 방법을 결정할 수 있다.
- `finally`로 자원을 닫는 레거시 코드에서 close 예외가 본문 예외를 덮어 원래 실패가 사라지는 문제를 식별하고, try-with-resources로 수정해 Suppressed Exception이 보존되도록 결정할 수 있다.
- Checked Exception이 중간 계층에 `throws`로 기계적으로 전파되는 코드에서, Unchecked로 Wrap해야 하는 시점과 API(Application Programming Interface) 계약에 노출할 가치가 있는 경우를 구분할 수 있다.

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

Throwable 아래에는 Error와 Exception이 있다. Error는 일반적으로 Application이 정상 복구하기 어려운 JVM(Java Virtual Machine) 수준 문제를 나타내고 Exception은 업무·환경 실패를 표현한다. 모든 Throwable을 한 번에 잡아 계속 실행하면 상태 손상을 숨길 수 있다.

### Checked와 Unchecked Exception 선택

Checked Exception은 Compile Time에 catch 또는 throws를 요구한다. 호출자가 합리적으로 복구할 수 있는 실패를 계약에 드러낼 수 있지만 계층 전체에 기계적인 전달 코드를 만들 수 있다. Unchecked는 Programming Error와 복구 지점이 먼 실패에 쓰이지만 문서화 책임은 남는다.

### 예외 전파와 finally 동작

예외가 발생하면 Stack을 거슬러 적절한 catch를 찾는다. finally는 정상·예외 경로의 정리에 사용되지만 return과 새 Exception으로 원래 실패를 덮지 않게 한다. catch는 구체적인 Type부터 배치한다.

### try-with-resources와 자원 정리

try-with-resources는 AutoCloseable 자원을 선언 역순으로 닫는다. 본문과 close가 모두 실패하면 본문 Exception이 주 예외가 되고 Close 실패는 Suppressed Exception으로 보존될 수 있다. DB Connection과 Stream은 GC(Garbage Collection)가 아니라 명시적 Scope에서 닫는다.

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
- **Checked Exception이면 언제나 호출자가 복구할 수 있다고 단정한다.** Checked Exception은 "복구를 시도해야 한다"는 API 계약의 표현이며 실제 복구 가능 여부는 Context에 따라 다르다. 복구 불가능하면 Unchecked로 Wrap해서 전달하는 것이 더 명확할 수 있다.
- **catch한 Exception을 무시하면 Server 가용성이 높아진다고 본다.** 빈 catch 블록은 실패를 숨겨 상태 손상이 계속 누적된다. 최소한 로그를 남기고 적절한 복구 또는 상위 전달을 해야 한다.
- **finally가 강제 Process 종료나 `System.exit()`에서도 반드시 실행된다고 생각한다.** JVM 강제 종료, Process Crash, 전원 장애처럼 정상 Stack Unwinding이 불가능하면 실행이 보장되지 않는다.
- **try-with-resources에서 close 예외는 항상 사라진다고 본다.** 본문 예외가 주 예외가 되고 close 예외는 Suppressed Exception으로 보존된다. `e.getSuppressed()`로 확인할 수 있다.
- **동일 Exception을 모든 계층에서 반복 Log한다.** 복구하거나 최종 처리하는 경계에서 한 번만 Correlation ID와 함께 기록한다. 중간 계층에서 Log만 하고 다시 던지면 같은 오류가 여러 줄로 중복된다.
- **Timeout 예외 후 즉시 재시도하면 항상 안전하다고 생각한다.** Timeout은 성공 여부가 불확실한 상태다. DB 쓰기·결제처럼 멱등하지 않은 연산은 Idempotency Key와 결과 조회 없이 재시도하면 중복 처리가 발생한다.
- **예외 메시지에 상세 정보를 많이 넣을수록 디버깅이 쉬워진다고 생각한다.** SQL Parameter에 개인정보(이메일·주민번호·카드 번호)가 포함되면 예외 메시지가 로그에 노출된다. matchId·요청 ID 같은 추적 키만 메시지에 넣고 민감 정보는 제외한다.

## 9. 면접 질문
### Q1. 랭킹 서버에서 Match 결과 저장 요청이 500ms Timeout으로 실패했습니다. 운영팀이 즉시 재시도를 지시했는데 왜 위험하고, 어떤 절차로 처리합니까?
Timeout은 서버가 성공했는지 불확실한 상태입니다. 즉시 재시도하면 이미 커밋된 matchId에 중복 보상이 지급될 수 있습니다. 처리 절차: ① matchId를 DB Unique Key로 설정해 중복 Insert 시 예외 발생으로 원천 방지 → ② 재시도 큐에 넣어 지연 처리 시 기존 결과를 먼저 조회 후 미처리된 경우만 재실행 → ③ Timeout 원인(DB 과부하·쿼리 느림)을 Slow Query Log·Connection Pool 지표로 별도 분석.

### Q2. DB 저장 중 `DataAccessException`이 Service 계층까지 직접 노출되어 Service가 DB 세부 구현에 결합되어 있습니다. Exception Translation과 Cause Chain 보존을 어떻게 적용합니까?
Service 계층에서 `DataAccessException`을 `catch`하고 업무 의미가 있는 `RankingSaveException`으로 Wrap합니다. 원인은 `new RankingSaveException("Failed for matchId=" + matchId, e)` 형태로 cause 보존. Message에는 matchId 같은 추적 키만 넣고 SQL Parameter·개인정보는 제외합니다. 이후 DB를 JPA에서 JDBC로 교체해도 Service 코드 변경이 없습니다.

### Q3. 레거시 코드에서 `finally`로 Connection을 닫는데, DB 연결 장애 시 close에서도 예외가 발생해 원래 SQL 오류가 사라집니다. 어떻게 수정하고, try-with-resources와 어떤 차이가 있습니까?
`finally`에서 close 예외가 발생하면 원래 본문 예외가 덮입니다. try-with-resources로 교체하면 본문 예외가 주 예외, close 예외는 `e.getSuppressed()[0]`으로 보존됩니다. 복수 AutoCloseable은 선언 역순(ps → conn)으로 닫힙니다. `finally` 유지가 불가피하면 close 예외를 try-catch로 잡아 `primaryException.addSuppressed(closeEx)` 형태로 수동 보존하지만 가독성이 낮습니다.

### Q4. Checked Exception `IOException`이 Repository → Service → Controller까지 `throws IOException`으로 기계적으로 전파되고 있습니다. 이 구조의 문제점과 개선 방법은 무엇입니까?
IOException이 API 계약의 일부로 굳어지고 하위 라이브러리 변경 시 전체 계층이 영향받습니다. 복구 의도가 없는 중간 계층에서는 Unchecked Exception(`RuntimeException` 계열)으로 Wrap해 전달합니다. 최종 처리 경계(Controller 또는 Global ExceptionHandler)에서 Correlation ID와 함께 한 번만 Log. Lombok `@SneakyThrows`는 Throws 선언 없이 Checked를 던질 수 있지만 호출자가 catch를 누락하기 쉬워 Library 공개 API에는 사용을 피합니다.

### Q5. 여러 계층에서 같은 예외를 잡아 Log하고 다시 던지는 코드가 있습니다. 운영 로그에서 동일한 예외가 5~6줄 중복으로 나타나는 이유와 수정 방법은 무엇입니까?
각 계층에서 `catch → log.error → rethrow`를 반복하면 Stack Trace가 여러 번 출력됩니다. 수정: 복구하거나 최종 처리하는 경계(Global ExceptionHandler, Tick Thread 상단)에서만 Correlation ID·matchId와 함께 한 번 Log합니다. 중간 계층은 `log.debug("matchId={} forwarding exception", matchId)` 정도만 남기거나 Log 없이 전달. Datadog·Splunk에서 Correlation ID로 필터링하면 원 예외 한 개만 추적됩니다.

### Q6. 게임 서버 Tick 루프에서 잘못된 패킷 타입이 들어올 때마다 Exception을 던지도록 구현되어 있습니다. p99 Latency가 예상보다 높고 GC Gen0가 증가했을 때, 예외 남용을 의심하고 개선하는 방법은 무엇입니까?
JFR(Java Flight Recorder) Exception Event 또는 `-XX:+TraceExceptions`로 예외 발생 빈도를 확인합니다. Tick당 예외가 10건 이상이면 정상 흐름 분기를 조건문으로 교체합니다. `fillInStackTrace()`를 Override해 Stack Trace 생성을 억제하거나, `static final` 예외 인스턴스를 재사용하면 Allocation 비용이 줄어드나 Stack Trace 정보가 사라집니다. Metric으로 exception_count vs tick_count 비율을 관찰해 임계값 초과 시 알람을 설정합니다.

## 10. 예상 꼬리질문
- try-with-resources에서 Connection과 PreparedStatement 두 자원을 선언했을 때, PreparedStatement.close()에서 예외가 발생하면 getSuppressed()로 확인되는지 아니면 주 예외가 되는지 JDK(Java Development Kit) 소스 수준에서 설명하세요.
- Checked Exception을 Unchecked로 Wrap하는 패턴에서 Lombok @SneakyThrows와의 차이, 그리고 두 방법 모두 적합하지 않은 경우는 언제인가요?
- Match 결과 저장 Timeout 후 재시도 큐에 100만 건이 쌓였을 때 처리량 부족으로 중복 보상이 발생할 수 있는 시나리오와 방지 방법은 무엇인가요?
- JFR `-XX:+TraceExceptions`로 Tick 루프에서 초당 5,000건 예외를 탐지했습니다. Stack Trace 생성 비용을 측정하는 방법과 `static final` 예외 재사용 시 Stack Trace가 비어있는 경우 운영 영향은 무엇인가요?
- Exception Translation 시 cause로 `DataAccessException`을 보존했는데, 외부 API Response에 cause의 getMessage()가 노출되는 코드가 있습니다. 이 정보 누출을 탐지하는 방법과 안전한 External Response 설계는 무엇인가요?
- `finally` 블록에서 `return`을 사용하면 메서드에서 던진 예외가 어떻게 처리되는지 바이트코드 수준에서 설명하고, SpotBugs에서 이 패턴을 탐지하는 룰 ID는 무엇인가요?
- `OutOfMemoryError`가 발생했을 때 `catch(Error e)`로 잡아 자원을 정리하려는 코드가 있습니다. OOM(OutOfMemoryError) 상황에서 catch 블록이 실행된다는 보장이 있는지, 그리고 OOM 이후 JVM 상태를 안전하게 처리하는 운영 패턴은 무엇인가요?

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
