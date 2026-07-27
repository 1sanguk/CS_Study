---
difficulty: 3
reading_time: 25분
interview_frequency: 5
importance: 5
---

# 03. JOIN

> 게임 서버·백엔드 개발자를 위한 CS 면접 교재

## 학습 목표

- INNER/OUTER JOIN의 행 포함 기준과 OUTER JOIN에서 ON/WHERE 조건의 위치 차이를 설명할 수 있다.
- Nested Loop, Hash, Merge 조인 알고리즘의 유리한 상황을 설명할 수 있다.
- 일대다 조인에서 행이 곱으로 늘어나는 원인과 N+1 문제를 설명할 수 있다.
- 게임 서버에서 랭킹 표시 조인 최적화와 N+1 회피 전략을 설명할 수 있다.

## 1. 개요

JOIN은 공통 조건을 기준으로 여러 테이블의 행을 하나의 결과로 결합하는 연산이다.

조인은 정규화된 관계 사이를 조회 시점에 다시 연결한다. `Player.guild_id = Guild.guild_id`처럼 조인 조건을 만족하는 행 조합을 만들며, 어떤 행을 결과에 남길지는 INNER·OUTER 같은 논리 조인 종류가 정한다. DBMS가 그 결과를 계산하는 실제 방법은 Nested Loop·Hash·Merge 같은 물리 조인 알고리즘이다.

논리 조인과 물리 알고리즘을 구분해야 한다. `LEFT JOIN`이라고 해서 특정 알고리즘을 쓰는 것이 아니며 같은 SQL도 데이터 크기, 필터 선택도, 인덱스와 메모리에 따라 다른 실행 계획을 사용할 수 있다.

## 2. 왜 필요한가

정규화로 나눈 플레이어, 길드, 아이템 데이터를 필요한 조회에서 다시 연결해야 한다.

플레이어 이름과 길드 이름을 길드원 행마다 중복 저장하면 이름 변경 때 여러 행을 갱신해야 한다. Player, Guild, Membership으로 분리하면 사실의 원본은 명확해지지만 랭킹 화면에서는 세 테이블 정보를 한 결과로 조합해야 한다. JOIN은 이 읽기 요구를 관계 조건으로 표현한다.

애플리케이션이 각 플레이어마다 별도 길드 조회를 반복할 수도 있지만 네트워크 왕복과 쿼리 파싱·실행이 늘어난다. 적절한 JOIN이나 일괄 조회는 DB가 전체 데이터 집합과 인덱스를 보고 한 번에 처리하도록 한다.

## 3. 핵심 동작 원리

```text
예시 데이터
Player                         Guild
┌────┬──────┬──────────┐      ┌──────────┬─────────┐
│ id │ name │ guild_id │      │ guild_id │ name    │
├────┼──────┼──────────┤      ├──────────┼─────────┤
│ 1  │ A    │ 10       │      │ 10       │ Knights │
│ 2  │ B    │ NULL     │      │ 20       │ Mages   │
│ 3  │ C    │ 30       │      └──────────┴─────────┘
└────┴──────┴──────────┘
```

INNER는 양쪽 일치 행만 반환한다. LEFT는 왼쪽 전체를 유지하고 오른쪽 일치가 없으면 NULL로 채운다. OUTER JOIN에서 WHERE 조건 위치가 결과 의미를 바꿀 수 있다.

### ON과 WHERE 조건 위치

```text
INNER: 교집합 (Player 1만)
LEFT : 왼쪽 전체 + 일치 오른쪽 (Player 1,2,3 / 2,3은 guild_name = NULL)
RIGHT: 오른쪽 전체 + 일치 왼쪽
FULL : 양쪽 전체
```

OUTER JOIN에서 오른쪽 열 필터를 WHERE에 두면 불일치 행의 오른쪽 열이 NULL이므로 조건이 UNKNOWN이 되어 행이 제거된다. 모든 왼쪽 행을 유지하려면 필터를 ON에 두어야 한다.

### Semi Join과 Anti Join

왼쪽 행에 대응하는 오른쪽 행의 존재만 확인하려면 `EXISTS`, 존재하지 않음은 `NOT EXISTS`를 사용한다. JOIN 후 DISTINCT로 중복을 제거하는 것보다 의도를 정확히 표현하고 불필요한 행 생성을 피할 수 있다. `NOT IN`은 하위 결과에 NULL이 있을 때 3값 논리 때문에 예상과 다를 수 있어 NULL 가능성을 확인한다.

### Nested Loop Join

한 입력의 각 행마다 다른 입력에서 일치 행을 찾는다. 바깥 입력이 작고 안쪽 조인 키에 효율적인 인덱스가 있으면 좋다. 바깥쪽이 수백만 행인데 안쪽을 매번 전체 스캔하면 비용이 매우 커진다.

### Hash Join

작은 입력의 조인 키로 해시 테이블을 만들고 다른 입력을 스캔하며 일치 버킷을 찾는다. 정렬되지 않은 대량 동등 조인에 유리하다. 해시 테이블이 메모리에 맞지 않으면 Spill이 발생해 느려진다.

### Merge Join

두 입력이 조인 키로 정렬되어 있으면 앞에서부터 비교하며 일치 구간을 병합한다. 이미 인덱스 순서를 활용하면 별도 정렬을 피할 수 있다. 정렬이 필요하면 그 CPU·메모리·임시 디스크 비용을 포함해야 한다.

### Optimizer와 Join 순서

옵티마이저는 통계로 각 조건의 행 수를 추정한다. 데이터 편향이나 열 간 상관관계를 제대로 추정하지 못하면 비효율적인 계획을 선택할 수 있다. 실행 계획에서 추정 행 수와 실제 행 수의 차이를 확인한다.

## 4. 쉬운 예시

```sql
-- INNER JOIN: 길드에 속한 플레이어만 (길드 없는 Player 2 제외)
SELECT p.id, p.name, g.name AS guild_name
FROM player p
JOIN guild g ON g.guild_id = p.guild_id;

-- LEFT JOIN: 길드 없는 플레이어도 포함 (guild_name = NULL)
SELECT p.id, p.name, g.name AS guild_name
FROM player p
LEFT JOIN guild g ON g.guild_id = p.guild_id;
```

```sql
-- OUTER JOIN 조건 위치 함정
-- 아래는 LEFT JOIN이지만 WHERE 조건이 불일치 행을 제거해 INNER처럼 동작
SELECT p.id, g.name
FROM player p
LEFT JOIN guild g ON g.guild_id = p.guild_id
WHERE g.level >= 10;  -- 불일치 행: g.level = NULL → UNKNOWN → 제거됨

-- 올바른 방법: 모든 플레이어 유지하면서 조건은 ON에
SELECT p.id, g.name
FROM player p
LEFT JOIN guild g ON g.guild_id = p.guild_id AND g.level >= 10;
```

```java
// BAD: N+1 문제 - 각 플레이어마다 길드를 별도 조회
List<Player> players = playerRepository.findTop100ByRanking();
for (Player p : players) {
    Guild guild = guildRepository.findById(p.getGuildId()); // 100번 추가 쿼리
    display.add(p.getName() + " / " + (guild != null ? guild.getName() : "-"));
}

// GOOD: JOIN으로 한 번에 조회
// SELECT p.id, p.name, g.name
// FROM ranking r
// JOIN player p ON p.id = r.player_id
// LEFT JOIN guild g ON g.guild_id = p.guild_id
// ORDER BY r.rank LIMIT 100
List<PlayerGuildDto> result = playerRepository.findTop100WithGuild();
```

```sql
-- Semi Join: 아이템 보유 플레이어만 (결과 중복 없음)
SELECT p.id
FROM player p
WHERE EXISTS (SELECT 1 FROM inventory_item i WHERE i.player_id = p.id);
-- JOIN 후 DISTINCT보다 의도가 명확하고 중간 행 생성을 피할 수 있음
```

## 5. 비슷한 개념과 비교

| 물리 알고리즘 | 유리한 상황 | 주요 조건·비용 |
|---|---|---|
| Nested Loop | 작은 Outer + Indexed Inner | Outer 행 수 × Inner 접근 비용 |
| Hash Join | 대량 동등 조건 | Build Memory, Spill 가능성 |
| Merge Join | 정렬된 대량 입력·범위 | 정렬 비용 또는 정렬 Index |

| 구분 | 설명 | 행 수 변화 |
|---|---|---|
| INNER JOIN | 양쪽 일치 행만 | 줄거나 같음 |
| LEFT JOIN | 왼쪽 전체 유지 | 오른쪽 다대일 시 늘 수 있음 |
| CROSS JOIN | 조건 없음, 카티션 곱 | A × B |
| Semi Join (EXISTS) | 존재 여부만 | 왼쪽과 동일 |
| Anti Join (NOT EXISTS) | 비존재 확인 | 왼쪽 일부 |

JOIN과 UNION도 구분한다. JOIN은 열 방향으로 관련 행을 결합하고 UNION은 호환되는 열 구조의 결과를 행 방향으로 이어 붙인다. `UNION`은 중복 제거 비용이 있고 `UNION ALL`은 중복을 유지한다.

## 6. 장점과 단점

**JOIN의 장점**

- 중복 저장 없이 정규화된 데이터를 조회 시점에 유연하게 결합할 수 있다.
- DB가 집합 단위 최적화와 인덱스를 활용해 애플리케이션 반복 조회보다 효율적일 수 있다.
- 다양한 조회 요구를 스키마 변경 없이 SQL로 표현할 수 있다.

**JOIN의 단점**

- 많은 테이블, 낮은 선택도, 큰 중간 결과와 정렬·해시 Spill은 CPU·메모리·I/O를 크게 사용한다.
- 일대다 관계를 여러 개 동시에 조인하면 행이 곱으로 늘어 중복 결과가 생길 수 있다.
- 서로 다른 샤드나 서비스 DB 사이의 조인은 지원하지 않거나 별도 구현이 필요하다.

**N+1 문제**

- 목록의 각 항목마다 추가 쿼리를 반복하면 네트워크 왕복과 쿼리 오버헤드가 행 수에 비례해 늘어난다.
- ORM의 Lazy Loading은 루프 안에서 N+1을 만들기 쉬우므로 요청당 쿼리 수를 관찰한다.

## 7. 게임 서버·백엔드 실무 예시

랭킹에 플레이어 표시 이름을 붙일 때 JOIN한다. N+1 쿼리를 피하고 조인 키 인덱스, 선택도, 예상·실제 행 수와 실행 계획을 확인한다.

일대다 관계를 여러 개 동시에 조인하면 행이 곱으로 늘 수 있다. Player 1명에 Item 100개와 Quest 50개를 동시에 단순 조인하면 최대 5,000개 조합이 생긴다. 각각 집계하거나 별도 일괄 조회하고 애플리케이션에서 조립하는 편이 나을 수 있다.

ORM의 Eager Loading이 자동으로 좋은 JOIN을 만든다고 가정하지 않는다. 생성 SQL, 선택 열, 결과 행 수와 객체 Materialization 비용을 확인한다.

조인 키 양쪽의 타입·Collation이 호환되는지 확인한다. 열에 함수나 암시적 형 변환이 적용되면 인덱스 탐색을 방해할 수 있다.

## 8. 자주 하는 오해

- **"LEFT JOIN이면 WHERE 조건과 무관하게 왼쪽 행이 모두 남는다"**: 오른쪽 열에 필터를 WHERE에 두면 불일치 행의 오른쪽 열이 NULL이므로 조건이 UNKNOWN이 되어 행이 제거된다. 모든 왼쪽 행을 유지하려면 필터를 ON에 두어야 한다.
- **"JOIN 결과 행 수는 항상 입력 중 큰 테이블과 같다"**: 조인 키가 오른쪽에서 유일하지 않으면 왼쪽 한 행이 여러 결과 행으로 늘어난다. 일대다 관계를 여러 개 동시에 조인하면 곱으로 증가할 수 있다.
- **"FK가 있으면 조인이 자동으로 빨라진다"**: FK는 참조 무결성 논리 규칙이고 인덱스는 별도다. FK 열에 자동 인덱스가 생기는지는 제품별로 다르므로 실행 계획으로 확인한다.
- **"Hash Join은 항상 Nested Loop보다 빠르다"**: 바깥이 작고 안쪽에 인덱스가 있으면 Nested Loop가 더 좋을 수 있다. Hash Join은 Build 테이블이 메모리를 초과하면 Spill이 생겨 느려진다.
- **"N+1은 JOIN 하나로 바꾸면 항상 해결된다"**: 일대다 관계를 여러 개 JOIN하면 행이 곱으로 늘어 중복 결과가 생길 수 있다. 일괄 IN 조회나 DataLoader 방식이 더 적합할 수 있다.
- **"조인 조건에 함수를 써도 인덱스가 활용된다"**: 열에 함수나 암시적 형 변환이 적용되면 일반적으로 인덱스 탐색을 방해한다. 조건을 상수 쪽에 적용하거나 함수 기반 인덱스를 사용한다.
- **"CROSS JOIN은 실수로는 생기지 않는다"**: 조인 조건을 누락하면 의도치 않은 카티션 곱이 발생한다. A가 1,000행, B가 1,000행이면 최대 100만 조합이 생겨 성능 문제로 이어진다.

## 9. 면접 질문

### Q1. INNER JOIN과 LEFT JOIN의 차이를 설명해 주세요.

INNER JOIN은 조인 조건이 일치하는 양쪽 행만 반환한다. LEFT JOIN은 왼쪽 행을 모두 유지하고 오른쪽에 일치가 없으면 오른쪽 열을 NULL로 채운다. LEFT JOIN에서 오른쪽 열 필터를 WHERE에 두면 불일치 행이 제거되어 INNER JOIN처럼 보일 수 있다.

### Q2. Nested Loop, Hash, Merge Join을 비교해 주세요.

Nested Loop는 작은 바깥 입력과 인덱스가 있는 안쪽 탐색에 유리하다. Hash Join은 정렬되지 않은 대량 동등 조인에 적합하지만 Build 메모리와 Spill을 고려한다. Merge Join은 정렬된 대량 입력이나 범위 조건에 유리하며 정렬이 없다면 정렬 비용이 든다.

### Q3. JOIN 후 행이 예상보다 늘어나는 이유는 무엇인가요?

조인 키가 한쪽 또는 양쪽에서 유일하지 않으면 일치 조합마다 결과 행이 생긴다. 예를 들어 한 플레이어에 아이템이 100개이면 그 플레이어 행이 100개로 늘어난다. 일대다 관계를 여러 개 동시에 조인하면 곱으로 증가한다.

### Q4. OUTER JOIN에서 ON과 WHERE 조건 위치는 어떻게 다른가요?

ON에 두면 조인 중에 조건을 적용해 일치하지 않는 행은 NULL로 채워 유지된다. WHERE에 두면 조인 결과에서 필터링하므로 오른쪽 열이 NULL인 행이 제거될 수 있다. 모든 왼쪽 행을 유지하면서 오른쪽 조건을 제한하려면 ON에 조건을 두어야 한다.

### Q5. N+1 문제란 무엇이고 어떻게 해결하나요?

목록 N개를 조회한 후 각각에 대해 추가 쿼리를 반복하면 총 N+1번 쿼리가 발생하는 문제다. JOIN으로 한 번에 조회하거나, 필요한 ID 목록으로 일괄 IN 조회하거나, DataLoader 방식으로 배치 처리할 수 있다. 일대다 JOIN이 행을 곱으로 늘리는 경우라면 일괄 조회 후 애플리케이션에서 조립하는 방식이 적합할 수 있다.

### Q6. Semi Join과 Anti Join은 언제 사용하나요?

존재 여부만 확인하고 오른쪽 열을 결과에 포함하지 않을 때 사용한다. EXISTS는 왼쪽 행에 대응하는 오른쪽 행이 있으면 포함하고, NOT EXISTS는 없으면 포함한다. JOIN 후 DISTINCT보다 의도가 명확하고 불필요한 중간 행 생성을 피할 수 있다.

## 10. 예상 꼬리질문

- OUTER JOIN의 조건을 ON과 WHERE 중 어디에 두나요?
- CROSS JOIN은 언제 사용하나요?
- 추정 행 수와 실제 행 수의 차이가 나면 어떻게 하나요?
- ORM에서 N+1을 어떻게 발견하나요?
- SELF JOIN은 어떤 상황에서 사용하나요?
- UNION과 UNION ALL의 차이는 무엇인가요?
- 여러 일대다 JOIN을 한 번에 하면 왜 안 되나요?

## 11. 30초 모범답변

> JOIN은 관계 조건으로 테이블을 결합합니다. INNER JOIN은 양쪽 일치 행만, LEFT JOIN은 왼쪽 전체를 유지합니다. OUTER JOIN에서 WHERE에 오른쪽 열 필터를 두면 불일치 행이 제거될 수 있으므로 ON에 두어야 모든 왼쪽 행이 유지됩니다. 조인 알고리즘은 데이터 크기와 인덱스에 따라 Nested Loop, Hash, Merge 중 옵티마이저가 선택합니다.

## 12. 1~2분 확장답변

> JOIN은 정규화된 테이블을 조회 시점에 관계 조건으로 결합합니다. 논리 JOIN 종류와 물리 알고리즘을 구분해야 하며, LEFT JOIN에서 WHERE에 오른쪽 조건을 두면 INNER처럼 동작하는 함정이 있습니다. 조인 키가 오른쪽에서 유일하지 않으면 행이 곱으로 늘어날 수 있고, 일대다를 여러 개 동시에 조인하면 중복 결과가 생깁니다. N+1 문제는 목록의 각 항목마다 추가 쿼리를 반복하는 것으로, JOIN, 일괄 IN 조회, DataLoader 방식 중 상황에 맞게 선택합니다. 실행 계획에서 추정 행 수와 실제 행 수, Hash Spill, 정렬 임시 공간을 확인해 조인 비용을 진단합니다.

## 13. 핵심 요약

- JOIN은 관계 조건으로 테이블을 결합하는 연산이다. 논리 JOIN 종류와 물리 알고리즘을 구분해야 한다.
- INNER JOIN은 양쪽 일치 행만, LEFT JOIN은 왼쪽 전체를 유지하고 오른쪽 불일치는 NULL로 채운다.
- OUTER JOIN에서 오른쪽 열 필터를 WHERE에 두면 불일치 행이 제거된다. 모든 왼쪽 행을 유지하려면 필터를 ON에 두어야 한다.
- 조인 키가 오른쪽에서 유일하지 않으면 왼쪽 한 행이 여러 결과 행으로 늘어난다. 일대다를 여러 개 동시에 조인하면 행이 곱으로 증가한다.
- Nested Loop는 작은 외부+인덱스에, Hash Join은 대량 동등 조인에, Merge Join은 정렬된 대량 입력에 유리하다.
- N+1 문제는 목록의 각 항목마다 추가 쿼리를 반복하는 것이다. JOIN, 일괄 IN 조회, DataLoader 방식 중 상황에 맞게 선택한다.
- 조인 키에 함수나 암시적 형 변환이 적용되면 인덱스 탐색을 방해한다. 조인 키 양쪽의 타입과 Collation을 확인한다.
- 실행 계획에서 추정 행 수와 실제 행 수의 차이, Hash Spill, 정렬 임시 공간을 확인해 조인 비용을 진단한다.

## 한 줄 정리

> JOIN은 관계 조건으로 테이블을 결합합니다. 논리 JOIN 종류와 물리 Nested Loop·Hash·Merge 알고리즘을 구분하고 실행 계획과 인덱스를 함께 봐야 합니다.
