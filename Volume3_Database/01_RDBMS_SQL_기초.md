---
difficulty: 3
reading_time: 25분
interview_frequency: 5
importance: 5
---

# 01. RDBMS와 SQL 기초


## 학습 목표

- RDBMS의 릴레이션 모델이 무결성 제약 조건으로 불변식을 표현하는 방법을 설명할 수 있다.
- SQL의 논리 처리 순서와 실제 실행 계획의 차이를 설명할 수 있다.
- NULL의 3값 논리가 WHERE, NOT IN, 집계에 미치는 영향을 설명할 수 있다.
- 조건부 UPDATE로 확인과 변경을 원자적으로 묶는 방법과 SELECT 후 UPDATE의 문제를 설명할 수 있다.

## 1. 개요

RDBMS(Relational Database Management System)는 행과 열의 테이블, 관계, 제약 조건으로 데이터를 관리하고 SQL(Structured Query Language)은 이를 정의·조회·변경하는 선언적 언어다.

관계형 데이터베이스 관리 시스템인 RDBMS는 데이터를 릴레이션(Relation)이라는 논리 구조로 표현한다. 실무에서는 릴레이션을 테이블, 튜플(Tuple)을 행, 속성(Attribute)을 열로 대응해 설명한다. 각 열은 허용되는 타입과 제약을 가지고 행은 하나의 사실을 나타낸다.

SQL은 "어떤 반복문으로 데이터를 찾을지"보다 "어떤 결과가 필요한지"를 선언한다. DBMS의 옵티마이저가 인덱스와 통계, 조인 순서를 이용해 물리 실행 계획을 선택한다. SQL이 짧다고 실행 비용도 작은 것은 아니다.

## 2. 왜 필요한가

정형 데이터의 일관성을 제약 조건과 트랜잭션으로 보장하고 다양한 조건의 조회를 지원한다. 데이터베이스 선택은 편의가 아니라 불변식, 조회 패턴, 장애 복구 요구에서 출발한다.

게임 백엔드의 플레이어, 캐릭터, 재화와 아이템은 서로 관계를 가진다. 캐릭터는 존재하는 플레이어에 속해야 하고 닉네임은 중복되면 안 되며 재화는 허용 범위 안에 있어야 한다. 이런 규칙을 애플리케이션 코드에만 흩어 놓으면 여러 서비스와 배치 작업이 서로 다르게 적용할 수 있다. 스키마와 제약 조건은 데이터가 저장되는 마지막 경계에서 공통 불변식을 지킨다.

RDBMS는 임의 조건 필터, 정렬, 집계와 조인을 제공해 접근 패턴이 다양하거나 변하는 업무에 유리하다. 트랜잭션과 복구 로그는 일부 변경만 남는 문제를 줄인다. 반면 모든 데이터가 고정 스키마와 강한 관계를 필요로 하는 것은 아니므로 문서형 저장소, 키-값 저장소와 캐시를 요구에 따라 함께 사용할 수 있다.

## 3. 핵심 동작 원리

```text
SQL parse → optimize plan → execute operators → storage pages → result
```

DDL(Data Definition Language)은 구조, DML(Data Manipulation Language)은 데이터, DCL(Data Control Language)은 권한, TCL은 트랜잭션을 다룬다. 논리 SQL 순서와 실제 실행 계획은 다를 수 있다.

### 관계형 모델의 기본 요소

```text
Player Table
┌───────────┬──────────────┬─────────┐
│ player_id │ nickname     │ balance │  ← Attribute(Column)
├───────────┼──────────────┼─────────┤
│ 101       │ KnightA      │ 1200    │  ← Tuple(Row)
│ 102       │ MageB        │ 800     │
└───────────┴──────────────┴─────────┘
      ↑
 Primary Key로 Row 식별
```

릴레이션은 논리적으로 행 순서를 보장하지 않는다. `ORDER BY`가 없으면 현재 저장 순서나 실행 계획에 따라 결과 순서가 달라질 수 있다.

NULL은 값이 없거나 알 수 없음을 표현하며 0이나 빈 문자열과 다르다. SQL 비교에는 참, 거짓, 알 수 없음의 3값 논리가 적용된다. `column = NULL`이 아니라 `IS NULL`을 사용하고, `NOT IN` 목록에 NULL이 있을 때처럼 예상 밖 결과가 생길 수 있는 표현을 주의한다.

### 주요 무결성 제약

- `PRIMARY KEY`: 행을 고유하게 식별하고 NULL을 허용하지 않는다.
- `UNIQUE`: 지정 열 조합의 중복을 제한한다. NULL 처리 세부는 DBMS별로 확인한다.
- `FOREIGN KEY`: 자식 값이 참조 대상에 존재하도록 참조 무결성을 지킨다.
- `NOT NULL`: 값 부재를 허용하지 않는다.
- `CHECK`: 잔액이 0 이상 같은 행 수준 조건을 검증한다.
- `DEFAULT`: 값을 생략했을 때 기본값을 제공한다.

외래키는 부모 삭제 시 거부, 연쇄 삭제, NULL 설정 같은 동작을 선택할 수 있다. 편리한 연쇄 삭제는 예상보다 넓은 데이터와 많은 행을 잠글 수 있으므로 도메인 수명주기에 맞춘다.

### SELECT의 논리 처리와 실제 실행

```text
FROM·JOIN → WHERE → GROUP BY → HAVING → SELECT → DISTINCT → ORDER BY → LIMIT
```

이 순서는 별칭 사용 가능 위치나 집계 필터 차이를 이해하는 데 도움을 주는 논리 모델이다. 실제 DB 엔진은 결과 의미를 유지하면서 조건을 아래로 밀고 조인 순서를 바꾸며 인덱스를 선택한다. `WHERE`는 그룹화 전 행을 필터하고 `HAVING`은 그룹화 결과를 필터한다.

### SQL 실행 과정

1. Parser가 문법과 객체 이름을 확인하고 내부 표현을 만든다.
2. Optimizer가 가능한 접근 경로와 Join 순서의 비용을 추정한다.
3. Executor가 Scan, Filter, Join, Sort, Aggregate 같은 연산자를 실행한다.
4. Buffer Pool과 Storage Engine이 필요한 Page와 Row를 읽고 Lock·MVCC 규칙을 적용한다.
5. 결과가 Network를 통해 Client로 반환된다.

## 4. 쉬운 예시

```sql
-- BAD: SELECT 후 별도 UPDATE → 두 문장 사이에 다른 요청이 끼어들 수 있음
SELECT balance FROM player WHERE player_id = 101;
-- 여기서 다른 요청이 잔액을 바꿀 수 있음
UPDATE player SET balance = balance - 100 WHERE player_id = 101;

-- GOOD: 조건부 UPDATE로 확인과 차감을 한 문장에 묶기
UPDATE player
SET balance = balance - 100
WHERE player_id = 101
  AND balance >= 100;
-- 영향받은 행 수: 1 = 성공, 0 = 잔액 부족 또는 플레이어 없음
```

```java
// 재화 차감 + 아이템 생성을 트랜잭션으로 묶기
public boolean purchaseItem(Connection conn, long playerId, int price, String itemCode)
        throws SQLException {
    conn.setAutoCommit(false);
    try {
        PreparedStatement deduct = conn.prepareStatement(
            "UPDATE player SET balance = balance - ? " +
            "WHERE player_id = ? AND balance >= ?");
        deduct.setInt(1, price);
        deduct.setLong(2, playerId);
        deduct.setInt(3, price);
        int affected = deduct.executeUpdate();
        if (affected == 0) {
            conn.rollback();
            return false; // 잔액 부족 또는 플레이어 없음
        }
        PreparedStatement addItem = conn.prepareStatement(
            "INSERT INTO inventory (player_id, item_code) VALUES (?, ?)");
        addItem.setLong(1, playerId);
        addItem.setString(2, itemCode);
        addItem.executeUpdate();
        conn.commit();
        return true;
    } catch (SQLException e) {
        conn.rollback();
        throw e;
    }
}
```

```sql
-- NULL 3값 논리 주의: NOT IN 목록에 NULL이 있으면 어떤 행도 반환 안 됨
SELECT * FROM player WHERE nickname NOT IN ('Loa', NULL);
-- NULL 비교는 UNKNOWN → 전체 조건이 UNKNOWN → 행 제외

-- UNIQUE 제약: 동시 INSERT 두 개가 와도 하나만 성공 (애플리케이션 조회만으로는 불충분)
CREATE TABLE player (
    player_id BIGINT PRIMARY KEY,
    nickname  VARCHAR(32) NOT NULL UNIQUE,
    balance   INT NOT NULL DEFAULT 0 CHECK (balance >= 0)
);
```

## 5. 비슷한 개념과 비교

| 구분 | RDBMS | Key-Value Store | Document DB |
|---|---|---|---|
| 기본 모델 | Table·Relation | Key→Value | Document |
| 강점 | Constraint·Join·Transaction·SQL | 단순 Key 접근·확장 | 유연한 중첩 구조 |
| 적합 예 | 재화·결제·인벤토리 원장 | Session·단순 Cache | 구조가 다양한 Content |
| 주의점 | Schema·Join·Write 비용 | 보조 Query 직접 설계 | 중복 Data 정합성 |

| 구분 | WHERE | HAVING |
|---|---|---|
| 적용 시점 | 그룹화 전 행 필터 | 그룹화 후 집계 결과 필터 |
| 집계 함수 사용 | 불가 | 가능 |
| 인덱스 활용 | 가능 | 제한적 |

NoSQL(Not Only SQL)은 SQL을 절대 지원하지 않거나 정합성이 없다는 뜻이 아니다. 제품마다 Query, Transaction과 일관성 수준이 다르다. 저장소 범주보다 실제 보장과 접근 패턴을 확인한다.

## 6. 장점과 단점

**RDBMS의 장점**

- 제약 조건이 저장 경계에서 불변식을 공통으로 보호한다.
- 임의 조건 필터, 정렬, 집계, 조인을 유연하게 지원한다.
- 트랜잭션과 복구 로그로 일부 변경만 남는 문제를 줄인다.
- 옵티마이저가 인덱스와 통계를 바탕으로 실행 계획을 자동 선택한다.

**RDBMS의 단점**

- 인덱스는 읽기를 가속하지만 쓰기 시 모든 인덱스를 함께 갱신해야 한다.
- 대규모 조인과 집계는 CPU(Central Processing Unit)·메모리·I/O(Input/Output)를 소모한다.
- 스키마 변경이 운영 중 대형 테이블에서 오래 걸릴 수 있다.
- 단일 노드 강한 트랜잭션 경계를 여러 샤드로 분산하면 복잡성이 커진다.

**읽기 최적화의 부작용**

- 비정규화와 인덱스를 늘리면 읽기가 빨라지지만 쓰기 비용과 정합성 관리가 늘어난다.
- 읽기 모델을 별도로 비정규화할 때는 갱신 경로와 허용 가능한 지연을 함께 정의한다.

## 7. 게임 서버·백엔드 실무 예시

플레이어, 캐릭터, 아이템을 테이블과 FK로 표현하고 잔액·수량은 CHECK와 트랜잭션으로 보호한다. `SELECT *`를 피하고 실행 계획과 실제 행 수를 확인한다.

운영에서는 처리량만 보지 않고 쿼리 p95·p99, 실행 계획, 읽은 행·페이지, Lock 대기, Deadlock과 Connection Pool을 함께 관찰한다.

플레이어 닉네임 중복은 조회 후 애플리케이션에서만 검사하지 않고 DB에 UNIQUE 제약을 둔다. 동시 요청 둘이 모두 사전 조회에서 "없음"을 보더라도 삽입 시 하나만 성공하게 한다. 애플리케이션은 중복 키 오류를 예상 가능한 비즈니스 결과로 변환한다.

큰 `OFFSET` 페이지네이션은 앞 행을 계속 건너뛰는 비용을 만든다. 정렬 키 기반 Keyset 방식도 고려한다.

## 8. 자주 하는 오해

- **"SELECT 후 UPDATE로 확인과 차감을 분리하면 안전하다"**: SELECT와 UPDATE 사이에 다른 요청이 끼어들어 잔액을 바꿀 수 있다. 조건부 UPDATE 한 문장으로 확인과 변경을 묶거나 트랜잭션과 적절한 락을 사용한다.
- **"인덱스가 많을수록 모든 쿼리가 빨라진다"**: 인덱스는 읽기를 가속하지만 INSERT/UPDATE/DELETE 시 모든 인덱스를 함께 갱신해야 하므로 쓰기 비용이 늘어난다. 실제 쿼리 패턴에 맞게 선택한다.
- **"NULL은 0이나 빈 문자열과 같다"**: NULL은 알 수 없거나 없는 값이다. `NULL = NULL`은 참이 아니며 `IS NULL`을 사용해야 한다. `NOT IN` 목록에 NULL이 있으면 모든 행이 제외될 수 있다.
- **"SQL 한 문장이면 모든 비즈니스 연산이 자동으로 원자적이다"**: SQL 한 문장의 원자성은 그 문장에 한하며, 여러 문장이 관련된 비즈니스 연산은 트랜잭션 경계를 명시해야 한다.
- **"ORDER BY 없이도 행 순서가 보장된다"**: 관계형 모델은 논리적으로 행 순서를 보장하지 않는다. 삽입 순서나 기본 키 순서가 아닐 수 있으므로 필요한 순서는 ORDER BY를 명시한다.
- **"SELECT *를 써도 성능 차이가 없다"**: 불필요한 대형 열까지 읽어 I/O와 네트워크 전송을 늘리고, 커버링 인덱스 활용이 어려워진다. 필요한 열만 선택한다.
- **"논리 SQL 순서가 실제 실행 순서다"**: FROM→WHERE→...의 논리 순서는 이해를 돕는 모델이다. 실제 실행 계획은 옵티마이저가 조인 순서를 바꾸고 조건을 아래로 밀어 최적화한다.

## 9. 면접 질문

### Q1. RDBMS와 NoSQL을 언제 선택하나요?

보호해야 할 불변식, 조회 패턴, 정합성 요구에서 출발한다. 재화·결제처럼 강한 불변식, 다양한 조회, 트랜잭션이 필요하면 RDBMS를 검토한다. 세션·랭킹처럼 단순 키 접근이 주이고 확장이 중요하면 Key-Value 저장소를 검토한다. "NoSQL이 더 빠르다"처럼 범주 단위로 선택하지 않고 실제 보장과 접근 패턴으로 결정한다.

### Q2. SQL이 선언적이라는 뜻은 무엇인가요?

개발자가 원하는 결과와 조건을 표현하고 DBMS가 통계와 인덱스를 바탕으로 Scan·Join 순서 같은 물리 실행 방법을 선택한다는 뜻이다. 같은 SQL도 데이터 분포와 통계에 따라 실행 계획과 비용이 달라질 수 있다. SQL이 짧다고 실행 비용이 작은 것은 아니다.

### Q3. DB 제약 조건이 필요한 이유는 무엇인가요?

여러 애플리케이션과 동시 요청이 데이터를 변경해도 저장 경계에서 공통 불변식을 지키기 위해서다. UNIQUE로 닉네임 중복을 막고 FK로 참조 존재를 확인하며 CHECK로 값 범위를 제한한다. 애플리케이션 조회 후 삽입하는 방식은 동시 요청 사이에 끼어들 수 있어 DB 제약이 이중 방어선 역할을 한다.

### Q4. NULL을 다룰 때 무엇을 주의해야 하나요?

NULL은 0이나 빈 문자열이 아니라 알 수 없거나 없는 값이다. 일반 비교 대신 `IS NULL`을 사용하고 SQL의 3값 논리 때문에 `NOT IN` 목록에 NULL이 있으면 모든 행이 제외될 수 있다. 집계 함수는 NULL을 제외하고 계산한다. 비즈니스상 반드시 필요한 값에는 `NOT NULL`을 적용해 불확실성을 줄인다.

### Q5. SELECT 후 UPDATE로 잔액을 확인·차감하는 것은 왜 위험한가요?

SELECT와 UPDATE 사이에 다른 요청이 끼어들어 잔액을 변경할 수 있다. 두 요청 모두 "잔액 충분"을 확인했지만 둘 다 차감에 성공하면 잔액이 음수가 될 수 있다. 조건부 UPDATE 한 문장으로 확인과 차감을 묶으면 영향받은 행 수로 성공 여부를 알 수 있다.

### Q6. 실행 계획을 언제 확인하나요?

쿼리가 예상보다 느릴 때, 새 인덱스 추가 전후, 데이터 양이 많이 늘었을 때 확인한다. `EXPLAIN` 계열 명령으로 추정 행 수와 실제 행 수의 차이, 인덱스 활용 여부, 읽은 페이지, 정렬과 임시 공간을 본다. 추정 행 수가 실제보다 크게 작으면 옵티마이저가 잘못된 계획을 선택할 수 있다.

## 10. 예상 꼬리질문

- 논리 구조와 물리 구조는 어떻게 다른가요?
  > 논리 구조는 릴레이션, 속성, 제약 조건처럼 데이터의 의미와 관계를 정의하는 개념 층이다. 물리 구조는 실제 페이지 배치, 인덱스 파일, 버퍼 풀처럼 데이터가 저장 장치에 어떻게 배치되는지를 말한다. SQL은 논리 구조로 작성하고 옵티마이저가 물리 구조를 선택한다.
- 인덱스가 쓰기 성능에 미치는 영향은 무엇인가요?
  > INSERT·UPDATE·DELETE 시 변경된 행에 연관된 모든 인덱스를 함께 갱신해야 하므로 쓰기 비용이 증가한다. 인덱스가 많을수록 쓰기마다 갱신해야 할 B+Tree가 많고, Page Split이 발생하면 추가 I/O가 생긴다. 실제 쿼리 패턴에서 필요한 인덱스만 두어야 한다.
- 동시 요청에서 불변식을 어떻게 지키나요?
  > DB의 UNIQUE, FK, CHECK 제약이 최종 방어선 역할을 한다. 애플리케이션에서 사전 조회 후 삽입하는 방식은 두 요청이 동시에 조회에서 "없음"을 보고 모두 삽입을 시도할 수 있으므로, DB 제약이 하나만 성공하게 보장한다. 잔액 차감처럼 조건 확인과 변경이 함께 필요한 경우에는 조건부 UPDATE 한 문장으로 묶는다.
- 실행 계획이 예상과 달라지는 이유는 무엇인가요?
  > 옵티마이저는 테이블 통계를 바탕으로 행 수를 추정해 실행 계획을 선택하는데, 데이터 분포가 달라졌거나 통계가 오래됐으면 추정 행 수가 실제와 크게 다를 수 있다. 파라미터 값에 따라 달라지는 Cardinality나 열 간 상관관계를 옵티마이저가 제대로 반영하지 못하면 비효율적인 계획이 선택된다. EXPLAIN으로 추정·실제 행 수 차이를 확인한다.
- 재시도 시 중복 처리를 어떻게 막나요?
  > 요청 ID를 DB에 UNIQUE하게 저장하고, 같은 ID로 재시도가 오면 기존 결과를 반환하는 멱등 설계를 한다. INSERT ON DUPLICATE KEY 또는 사전 조회로 중복을 감지하고 중복 키 오류를 비즈니스 결과로 변환한다. 재화 차감처럼 의도가 명확한 연산은 조건부 UPDATE의 영향 행 수로 성공 여부를 판단한다.
- `WHERE`와 `HAVING`은 어떻게 다른가요?
  > WHERE는 GROUP BY 이전에 개별 행을 필터하며 집계 함수를 사용할 수 없다. HAVING은 GROUP BY 이후 집계 결과를 필터하며 COUNT, SUM 같은 집계 함수를 조건에 쓸 수 있다. 인덱스를 통한 조기 필터링이 가능한 조건은 WHERE에, 그룹 집계 결과에 대한 조건은 HAVING에 둔다.
- `ORDER BY`가 없을 때 행 순서를 믿을 수 있나요?
  > 믿을 수 없다. 관계형 모델에서 릴레이션은 논리적으로 집합이며 행 순서를 보장하지 않는다. 실행 계획 변경, 인덱스 구조, 병렬 실행 등에 따라 반환 순서가 달라질 수 있다. 결과 순서가 필요한 경우에는 반드시 ORDER BY를 명시해야 한다.

## 11. 30초 모범답변

> RDBMS는 관계와 제약 조건, 트랜잭션으로 정형 데이터를 일관되게 관리하며 SQL은 원하는 결과를 선언하면 옵티마이저가 실행 계획을 선택합니다. 재화 차감처럼 확인과 변경이 함께 있는 연산은 조건부 UPDATE 한 문장으로 묶어야 SELECT와 UPDATE 사이에 다른 요청이 끼어드는 문제를 막을 수 있습니다.

## 12. 1~2분 확장답변

> RDBMS는 관계와 제약 조건, 트랜잭션으로 정형 데이터를 일관되게 관리하며 SQL은 원하는 결과를 선언하면 옵티마이저가 실행 계획을 선택합니다. 설계에서는 UNIQUE, FK, CHECK로 불변식을 표현하고 애플리케이션 조회만으로 의존하지 않습니다. SELECT 후 UPDATE 패턴은 동시 요청 사이에 끼어들 수 있으므로 조건부 UPDATE나 트랜잭션과 락을 사용합니다. NULL은 3값 논리가 적용되어 NOT IN 목록에 NULL이 있으면 모든 행이 제외될 수 있으므로 주의합니다. 실행 계획은 옵티마이저가 선택하므로 데이터 분포 변화로 효율적이지 않은 계획이 선택될 수 있고, EXPLAIN으로 추정 행 수와 실제 행 수 차이를 확인합니다.

## 13. 핵심 요약

- RDBMS는 테이블·관계·제약 조건으로 정형 데이터를 관리하고 SQL은 결과를 선언하면 옵티마이저가 실행 계획을 선택한다.
- PRIMARY KEY, UNIQUE, FK, CHECK는 애플리케이션이 아닌 DB에서 불변식을 최종적으로 검증하는 수단이다.
- SQL의 논리 처리 순서(FROM→WHERE→GROUP BY→HAVING→SELECT→ORDER BY)는 별칭과 집계 필터 위치를 이해하는 모델이다. 실제 실행 계획은 다를 수 있다.
- NULL은 알 수 없거나 없는 값으로 3값 논리가 적용된다. NOT IN 목록에 NULL이 있으면 모든 행이 제외될 수 있다.
- SELECT 후 UPDATE 패턴은 두 문장 사이에 다른 요청이 끼어들 수 있다. 조건부 UPDATE 한 문장으로 확인과 변경을 묶는다.
- 인덱스는 읽기를 가속하지만 INSERT/UPDATE/DELETE 시 함께 갱신해야 하므로 쓰기 비용이 늘어난다. 실제 접근 패턴에 맞게 선택한다.
- ORDER BY가 없으면 행 순서가 보장되지 않는다. 실행 계획 변경이나 데이터 분포에 따라 순서가 달라질 수 있다.
- 실행 계획의 추정 행 수와 실제 행 수, 읽은 페이지, Lock 대기와 꼬리 지연을 함께 확인한다.

## 한 줄 정리

> RDBMS는 관계와 제약 조건, 트랜잭션으로 정형 데이터를 일관되게 관리하며 SQL은 원하는 결과를 선언하면 옵티마이저가 실행 계획을 선택합니다.
