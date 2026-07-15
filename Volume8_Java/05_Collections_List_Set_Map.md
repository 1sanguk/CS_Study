---
difficulty: 2
reading_time: 25분
interview_frequency: 5
importance: 5
---

# 05. Collections Framework·List·Set·Map

> 게임 서버·백엔드 개발자를 위한 CS 면접 교재

## 학습 목표

- Java Collections Framework는 여러 객체를 저장·조회·순회하기 위한 Interface와 구현체의 공통 계약을 제공한다.
- 등장 이유와 핵심 동작을 설명할 수 있다.
- 게임 서버·백엔드 사례와 Trade-off를 면접 답변으로 연결할 수 있다.

## 1. 개요

Java Collections Framework는 여러 객체를 저장·조회·순회하기 위한 Interface와 구현체의 공통 계약을 제공한다.

## 2. 왜 필요한가

접근 순서, 중복, 정렬, 동시성 요구에 맞는 자료구조를 선택해 정확성과 예측 가능한 성능을 얻기 위해 필요하다.

## 3. 핵심 동작 원리

```text
requirement → List/Set/Map interface → ArrayList/HashSet/HashMap/TreeMap implementation
```

이 흐름은 Collections Framework·List·Set·Map의 주요 처리 단계와 책임 경계를 나타낸다. 각 단계의 입력과 출력, 실패 시 복구 위치를 구분해야 한다.

### 1) 핵심 포인트

List는 순서와 중복을 허용하고 Set은 중복 없는 원소 집합, Map은 Key와 Value 관계를 표현한다. 구현 선택 전에 필요한 연산이 Index 접근, Membership, Key 조회, 정렬 또는 순서 유지인지 정한다.

### 2) 핵심 포인트

ArrayList는 연속 Reference 배열을 사용해 Index 조회와 순회 Locality가 좋다. 중간 삽입·삭제는 원소 이동이 필요하고 Capacity가 부족하면 더 큰 배열로 복사한다. LinkedList는 위치를 이미 알아도 Node 할당과 Cache Miss 비용이 있어 실제 요구를 측정한다.

### 3) 핵심 포인트

HashMap은 hashCode로 Bucket을 찾고 equals로 정확한 Key를 확인한다. Key가 Map 안에서 hashCode에 영향을 주는 상태를 바꾸면 다시 찾지 못할 수 있다. equals가 같으면 hashCode도 같아야 한다는 계약을 지킨다.

### 4) 핵심 포인트

HashSet은 내부적으로 Hash 기반 Key 저장을 사용해 중복을 판단한다. TreeSet과 TreeMap은 정렬 순서와 범위 Query를 제공하지만 비교 결과가 equals와 모순되면 예상하지 못한 중복 판정이 생길 수 있다.

### 5) 핵심 포인트

HashMap은 일반적으로 삽입 순서를 계약하지 않는다. LinkedHashMap은 삽입 또는 접근 순서를 유지해 간단한 LRU 구성에 쓸 수 있고 TreeMap은 Comparator 순서로 정렬한다. 필요한 계약보다 강한 구현은 추가 Memory와 갱신 비용을 만든다.

### 6) 핵심 포인트

일반 Collection은 동시 변경에 자동으로 안전하지 않다. ConcurrentHashMap도 단일 Method는 Thread-safe하지만 get 후 put 같은 복합 불변식을 자동 보장하지 않는다. compute, 명시적 Lock 또는 상태 Owner를 사용한다.

### Collection 선택과 계약

- **주요 연산**: 자료 수보다 조회·삽입·삭제·순회의 비율을 먼저 본다. 작은 Collection에서는 Big-O보다 연속 Memory와 단순성이 더 중요할 수 있다.
- **Capacity**: ArrayList와 HashMap의 예상 크기를 알면 적절한 초기 Capacity로 재할당을 줄일 수 있다. 지나치게 크게 잡으면 Memory와 Cache Footprint가 늘어난다.
- **Key 안정성**: HashMap에 넣은 Key의 equals·hashCode 관련 Field를 변경하지 않는다. Player ID처럼 불변 식별자를 Key로 사용한다.
- **순회 변경**: 일반 Iterator 순회 중 구조를 직접 바꾸지 않는다. Iterator remove, 별도 수집 후 변경 또는 목적에 맞는 Concurrent Collection을 사용한다.
- **정렬 계약**: Comparator는 반사성·추이성과 일관된 순서를 제공해야 한다. 점수 동점 규칙까지 넣어 재시작 후에도 결정적인 결과를 만든다.
- **복합 원자성**: ConcurrentHashMap의 compute 계열을 사용할 때 Mapping Function을 짧게 유지한다. 외부 I/O나 같은 Map의 복잡한 재진입을 피한다.

### 게임 서버 사례

Session 조회는 playerId HashMap, Tick 입력 순서는 Queue, Timer 만료는 PriorityQueue처럼 요구별 구조를 나눈다. Top Ranking과 전체 원본 저장도 같은 구조로 해결하지 않는다. 부하 Test에서는 평균 시간 외에 Rehash 순간, GC Allocation과 Hot Key 경쟁을 관찰한다.
### 구현·운영 검증 기준

- **입력 계약**: Collections List Set Map에서 입력 계약가 영향을 주는 코드 경계를 실제 Method와 객체 수명으로 표시한다. 정상 Case와 함께 Null, 최대 크기, 동시 호출, 예외와 취소를 재현하고 결과 상태와 Resource가 계약대로 남는지 확인한다. 측정 가능한 지표와 실패 시 대응을 Review 항목에 포함한다.
- **상태 소유권**: Collections List Set Map에서 상태 소유권가 영향을 주는 코드 경계를 실제 Method와 객체 수명으로 표시한다. 정상 Case와 함께 Null, 최대 크기, 동시 호출, 예외와 취소를 재현하고 결과 상태와 Resource가 계약대로 남는지 확인한다. 측정 가능한 지표와 실패 시 대응을 Review 항목에 포함한다.
- **Null 처리**: Collections List Set Map에서 Null 처리가 영향을 주는 코드 경계를 실제 Method와 객체 수명으로 표시한다. 정상 Case와 함께 Null, 최대 크기, 동시 호출, 예외와 취소를 재현하고 결과 상태와 Resource가 계약대로 남는지 확인한다. 측정 가능한 지표와 실패 시 대응을 Review 항목에 포함한다.
- **Type 안전성**: Collections List Set Map에서 Type 안전성가 영향을 주는 코드 경계를 실제 Method와 객체 수명으로 표시한다. 정상 Case와 함께 Null, 최대 크기, 동시 호출, 예외와 취소를 재현하고 결과 상태와 Resource가 계약대로 남는지 확인한다. 측정 가능한 지표와 실패 시 대응을 Review 항목에 포함한다.
- **경계값**: Collections List Set Map에서 경계값가 영향을 주는 코드 경계를 실제 Method와 객체 수명으로 표시한다. 정상 Case와 함께 Null, 최대 크기, 동시 호출, 예외와 취소를 재현하고 결과 상태와 Resource가 계약대로 남는지 확인한다. 측정 가능한 지표와 실패 시 대응을 Review 항목에 포함한다.
- **동시 실행**: Collections List Set Map에서 동시 실행가 영향을 주는 코드 경계를 실제 Method와 객체 수명으로 표시한다. 정상 Case와 함께 Null, 최대 크기, 동시 호출, 예외와 취소를 재현하고 결과 상태와 Resource가 계약대로 남는지 확인한다. 측정 가능한 지표와 실패 시 대응을 Review 항목에 포함한다.
- **예외 전파**: Collections List Set Map에서 예외 전파가 영향을 주는 코드 경계를 실제 Method와 객체 수명으로 표시한다. 정상 Case와 함께 Null, 최대 크기, 동시 호출, 예외와 취소를 재현하고 결과 상태와 Resource가 계약대로 남는지 확인한다. 측정 가능한 지표와 실패 시 대응을 Review 항목에 포함한다.
- **자원 정리**: Collections List Set Map에서 자원 정리가 영향을 주는 코드 경계를 실제 Method와 객체 수명으로 표시한다. 정상 Case와 함께 Null, 최대 크기, 동시 호출, 예외와 취소를 재현하고 결과 상태와 Resource가 계약대로 남는지 확인한다. 측정 가능한 지표와 실패 시 대응을 Review 항목에 포함한다.
- **성능 비용**: Collections List Set Map에서 성능 비용가 영향을 주는 코드 경계를 실제 Method와 객체 수명으로 표시한다. 정상 Case와 함께 Null, 최대 크기, 동시 호출, 예외와 취소를 재현하고 결과 상태와 Resource가 계약대로 남는지 확인한다. 측정 가능한 지표와 실패 시 대응을 Review 항목에 포함한다.
- **Memory 사용**: Collections List Set Map에서 Memory 사용가 영향을 주는 코드 경계를 실제 Method와 객체 수명으로 표시한다. 정상 Case와 함께 Null, 최대 크기, 동시 호출, 예외와 취소를 재현하고 결과 상태와 Resource가 계약대로 남는지 확인한다. 측정 가능한 지표와 실패 시 대응을 Review 항목에 포함한다.
- **Version 호환**: Collections List Set Map에서 Version 호환가 영향을 주는 코드 경계를 실제 Method와 객체 수명으로 표시한다. 정상 Case와 함께 Null, 최대 크기, 동시 호출, 예외와 취소를 재현하고 결과 상태와 Resource가 계약대로 남는지 확인한다. 측정 가능한 지표와 실패 시 대응을 Review 항목에 포함한다.
- **관찰 지표**: Collections List Set Map에서 관찰 지표가 영향을 주는 코드 경계를 실제 Method와 객체 수명으로 표시한다. 정상 Case와 함께 Null, 최대 크기, 동시 호출, 예외와 취소를 재현하고 결과 상태와 Resource가 계약대로 남는지 확인한다. 측정 가능한 지표와 실패 시 대응을 Review 항목에 포함한다.
- **부하 상한**: Collections List Set Map에서 부하 상한가 영향을 주는 코드 경계를 실제 Method와 객체 수명으로 표시한다. 정상 Case와 함께 Null, 최대 크기, 동시 호출, 예외와 취소를 재현하고 결과 상태와 Resource가 계약대로 남는지 확인한다. 측정 가능한 지표와 실패 시 대응을 Review 항목에 포함한다.
- **장애 복구**: Collections List Set Map에서 장애 복구가 영향을 주는 코드 경계를 실제 Method와 객체 수명으로 표시한다. 정상 Case와 함께 Null, 최대 크기, 동시 호출, 예외와 취소를 재현하고 결과 상태와 Resource가 계약대로 남는지 확인한다. 측정 가능한 지표와 실패 시 대응을 Review 항목에 포함한다.
- **Test 전략**: Collections List Set Map에서 Test 전략가 영향을 주는 코드 경계를 실제 Method와 객체 수명으로 표시한다. 정상 Case와 함께 Null, 최대 크기, 동시 호출, 예외와 취소를 재현하고 결과 상태와 Resource가 계약대로 남는지 확인한다. 측정 가능한 지표와 실패 시 대응을 Review 항목에 포함한다.
- **보안 경계**: Collections List Set Map에서 보안 경계가 영향을 주는 코드 경계를 실제 Method와 객체 수명으로 표시한다. 정상 Case와 함께 Null, 최대 크기, 동시 호출, 예외와 취소를 재현하고 결과 상태와 Resource가 계약대로 남는지 확인한다. 측정 가능한 지표와 실패 시 대응을 Review 항목에 포함한다.
- **배포 전환**: Collections List Set Map에서 배포 전환가 영향을 주는 코드 경계를 실제 Method와 객체 수명으로 표시한다. 정상 Case와 함께 Null, 최대 크기, 동시 호출, 예외와 취소를 재현하고 결과 상태와 Resource가 계약대로 남는지 확인한다. 측정 가능한 지표와 실패 시 대응을 Review 항목에 포함한다.
- **면접 설명**: Collections List Set Map에서 면접 설명가 영향을 주는 코드 경계를 실제 Method와 객체 수명으로 표시한다. 정상 Case와 함께 Null, 최대 크기, 동시 호출, 예외와 취소를 재현하고 결과 상태와 Resource가 계약대로 남는지 확인한다. 측정 가능한 지표와 실패 시 대응을 Review 항목에 포함한다.

이 기준은 기능을 무조건 복잡하게 만들기 위한 목록이 아니다. Collections List Set Map의 실제 호출 빈도와 장애 영향을 기준으로 필요한 항목을 선택하고, 변경 전후의 정확성과 p99를 비교한다.

## 4. 쉬운 예시

접속 중인 Player를 playerId로 찾는 구조는 HashMap이 자연스럽고 입장 순서 처리는 Queue가 적합하다. 랭킹 Top N에는 정렬 구조가 필요하다. 하나의 Collection으로 모든 요구를 해결하지 않는다.

## 5. 비슷한 개념과 비교

ArrayList는 Index와 순회에 유리하고 LinkedList는 Node 위치를 이미 가진 변경에 유리할 수 있다. HashMap은 평균 Key 조회가 빠르고 TreeMap은 정렬·범위 연산과 로그 시간 상한을 제공한다.

## 6. 장점과 단점

Collections Framework·List·Set·Map을 올바르게 적용하면 코드 계약과 상태 흐름이 명확해지고 변경과 장애 진단이 쉬워진다. 반면 잘못된 추상화, 불필요한 객체와 Runtime 비용을 만들 수 있다. 실제 호출 빈도와 변경 축을 측정해 필요한 범위만 사용한다.

## 7. 게임 서버·백엔드 실무 예시

접속 중인 Player를 playerId로 찾는 구조는 HashMap이 자연스럽고 입장 순서 처리는 Queue가 적합하다. 랭킹 Top N에는 정렬 구조가 필요하다. 하나의 Collection으로 모든 요구를 해결하지 않는다. 운영에서는 처리량, 지연 p99, 오류율, Memory와 Thread 상태를 같은 시간축에서 관찰한다.

## 8. 자주 하는 오해
- LinkedList는 모든 삽입·삭제에서 ArrayList보다 빠르다고 본다.
- HashMap이 삽입 순서를 유지한다고 의존한다.
- equals만 Override해도 Hash Collection 계약이 완성된다고 생각한다.
- ConcurrentHashMap이면 여러 Method의 업무 불변식도 자동 원자적이라고 본다.
- TreeMap Comparator가 동점 값을 모두 별도 Key로 보존한다고 단정한다.
## 9. 면접 질문
### Q1. List, Set과 Map의 차이는 무엇인가요?
List는 순서와 중복을, Set은 중복 없는 원소를, Map은 Key와 Value 관계를 표현합니다. 구현을 고르기 전에 필요한 연산과 순서 계약을 정합니다.

### Q2. ArrayList와 LinkedList는 어떻게 선택하나요?
ArrayList는 Index 접근과 순회 Locality가 좋고 LinkedList는 Node 위치를 이미 아는 연결 변경에 유리할 수 있습니다. 실제 데이터 크기와 접근 Pattern을 측정해야 합니다.

### Q3. HashMap의 equals·hashCode 계약은 무엇인가요?
equals가 true인 두 Key는 같은 hashCode를 반환해야 합니다. hashCode가 같아도 equals는 false일 수 있어 Bucket 탐색 뒤 equals로 정확한 Key를 확인합니다.

### Q4. HashMap Key가 Mutable하면 어떤 문제가 있나요?
삽입 후 hashCode에 영향을 주는 값이 바뀌면 원래 Bucket에서 Key를 찾지 못할 수 있습니다. 불변 Key나 안정적인 식별자를 사용합니다.

### Q5. ConcurrentHashMap의 복합 연산은 어떻게 처리하나요?
get 후 put을 분리하면 사이에 다른 Thread가 개입할 수 있습니다. compute, merge, putIfAbsent 같은 원자 API나 더 큰 불변식을 보호하는 Lock·Owner를 사용합니다.
## 10. 예상 꼬리질문

- Collection Interface의 핵심 계약과 실패 조건은 무엇인가요?
- List의 핵심 계약과 실패 조건은 무엇인가요?
- Set의 핵심 계약과 실패 조건은 무엇인가요?
- Map의 핵심 계약과 실패 조건은 무엇인가요?
- ArrayList의 핵심 계약과 실패 조건은 무엇인가요?

## 11. 30초 모범답변

> List는 순서와 중복, Set은 중복 제거, Map은 Key 조회를 표현합니다. 구현은 이름보다 필요한 연산과 데이터 크기로 선택해야 합니다. 게임 서버에서는 Player ID 조회는 HashMap, 순서 처리는 Queue처럼 요구별 구조를 조합합니다.

## 12. 1~2분 확장답변

> Java Collections Framework는 여러 객체를 저장·조회·순회하기 위한 Interface와 구현체의 공통 계약을 제공한다. 접근 순서, 중복, 정렬, 동시성 요구에 맞는 자료구조를 선택해 정확성과 예측 가능한 성능을 얻기 위해 필요하다. ArrayList는 연속 Reference 배열을 사용해 Index 조회와 순회 Locality가 좋다. 중간 삽입·삭제는 원소 이동이 필요하고 Capacity가 부족하면 더 큰 배열로 복사한다. LinkedList는 위치를 이미 알아도 Node 할당과 Cache Miss 비용이 있어 실제 요구를 측정한다. ArrayList는 Index와 순회에 유리하고 LinkedList는 Node 위치를 이미 가진 변경에 유리할 수 있다. HashMap은 평균 Key 조회가 빠르고 TreeMap은 정렬·범위 연산과 로그 시간 상한을 제공한다. 접속 중인 Player를 playerId로 찾는 구조는 HashMap이 자연스럽고 입장 순서 처리는 Queue가 적합하다. 랭킹 Top N에는 정렬 구조가 필요하다. 하나의 Collection으로 모든 요구를 해결하지 않는다.

## 13. 핵심 요약

- Java Collections Framework는 여러 객체를 저장·조회·순회하기 위한 Interface와 구현체의 공통 계약을 제공한다.
- List는 순서와 중복을 허용하고 Set은 중복 없는 원소 집합, Map은 Key와 Value 관계를 표현한다. 구현 선택 전에 필요한 연산이 Index 접근, Membership, Key 조회, 정렬 또는 순서 유지인지 정한다.
- ArrayList는 Index와 순회에 유리하고 LinkedList는 Node 위치를 이미 가진 변경에 유리할 수 있다. HashMap은 평균 Key 조회가 빠르고 TreeMap은 정렬·범위 연산과 로그 시간 상한을 제공한다.
- 접속 중인 Player를 playerId로 찾는 구조는 HashMap이 자연스럽고 입장 순서 처리는 Queue가 적합하다. 랭킹 Top N에는 정렬 구조가 필요하다. 하나의 Collection으로 모든 요구를 해결하지 않는다.

## 한 줄 정리

> List는 순서와 중복, Set은 중복 제거, Map은 Key 조회를 표현합니다.
