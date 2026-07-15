---
difficulty: 2
reading_time: 25분
interview_frequency: 5
importance: 5
---

# 03. 상속·Interface와 다형성

> 게임 서버·백엔드 개발자를 위한 CS 면접 교재

## 학습 목표

- Java 다형성은 상위 Type의 Reference로 여러 구현 객체를 다루고 Override된 Method를 실제 객체 Type에 따라 호출하는 성질이다.
- 등장 이유와 핵심 동작을 설명할 수 있다.
- 게임 서버·백엔드 사례와 Trade-off를 면접 답변으로 연결할 수 있다.

## 1. 개요

Java 다형성은 상위 Type의 Reference로 여러 구현 객체를 다루고 Override된 Method를 실제 객체 Type에 따라 호출하는 성질이다.

## 2. 왜 필요한가

구현 교체와 확장 가능한 경계를 만들면서도 결합도, 객체 수명과 계약 위반을 제어하기 위해 필요하다.

## 3. 핵심 동작 원리

```text
interface CombatRule ← PvpRule / RaidRule → call rule.calculate() → dynamic dispatch
```

이 흐름은 상속·Interface와 다형성의 주요 처리 단계와 책임 경계를 나타낸다. 각 단계의 입력과 출력, 실패 시 복구 위치를 구분해야 한다.

### 1) 핵심 포인트

Class 상속은 상태와 구현을 재사용하고 is-a 관계를 표현한다. Java Class는 하나의 Class만 extends할 수 있지만 여러 Interface를 implements할 수 있다. 상속을 단순 코드 재사용 수단으로 쓰면 Base 변경이 Subclass에 예상하지 못한 영향을 준다.

### 2) 핵심 포인트

Override는 Runtime Dispatch 대상이고 Overload는 Parameter Type을 기준으로 Compile Time에 선택된다. @Override를 사용하면 Signature 실수를 Compiler가 잡을 수 있다. Static Method와 Field는 Instance Method와 같은 방식으로 다형적으로 Override되지 않는다.

### 3) 핵심 포인트

Interface는 호출자가 의존할 동작 계약을 정의한다. Default Method는 Interface 진화를 돕지만 여러 Interface의 충돌과 계약 복잡성을 고려한다. 구현 세부보다 Capability를 작고 응집된 Interface로 분리한다.

### 4) 핵심 포인트

추상 Class는 공통 상태와 Protected 구현을 제공할 수 있고 Interface는 다중 구현과 느슨한 계약에 유리하다. 모든 구현이 같은 상태와 불변식을 공유할 때 추상 Class가 자연스러울 수 있다. 독립 기능 조합에는 Interface가 적합하다.

### 5) 핵심 포인트

Composition은 객체를 상속하는 대신 필요한 기능 객체를 Field로 보유하고 위임한다. Runtime 교체와 Test Double 주입이 쉽고 Base Class 결합을 줄인다. 명확한 is-a와 Liskov Substitution이 성립하지 않으면 Composition을 우선 검토한다.

### 6) 핵심 포인트

다형 호출 비용만 보고 설계를 결정하지 않는다. 실제 Hot Path에서는 JIT가 Type Profile을 바탕으로 Devirtualization과 Inlining을 할 수 있다. 먼저 Architecture의 변경 축을 정하고 Profile에서 병목이 확인되면 구체적으로 최적화한다.

### 확장 경계를 정하는 방법

- **계약 우선**: Interface Method가 허용하는 입력, 반환과 예외를 문서화한다. 구현체가 호출자의 전제보다 강한 사전 조건을 요구하면 대체 가능성이 깨진다.
- **상태 공유**: Abstract Class의 Protected Mutable State는 Subclass 결합을 키운다. 공통 불변식을 Base가 완전히 지킬 수 있는지 확인하고 아니면 별도 Component로 위임한다.
- **Default Method**: 기존 구현을 깨지 않고 Method를 추가하는 데 유용하지만 두 Interface가 같은 Default를 제공하면 구현체가 충돌을 해결해야 한다.
- **Override 안전성**: equals, hashCode와 toString 외에도 Constructor에서 Override 가능한 Method를 호출하지 않는다. Subclass 상태가 초기화되기 전에 Dispatch될 수 있다.
- **Dependency Injection**: Interface를 모든 Class에 기계적으로 붙이지 않는다. 외부 I/O, 정책 교체와 Test Double이 필요한 경계에 적용한다.
- **성능 판단**: Virtual Dispatch 한 번보다 Allocation, Cache Miss와 Algorithm 비용이 큰 경우가 많다. JIT Inlining 여부와 실제 호출 빈도를 Profile한다.

### 게임 서버 설계 예시

DamageRule은 계산 계약만 제공하고 PvpRule과 RaidRule이 Mode별 공식을 구현한다. Match는 시작 시 하나의 Rule을 받아 Game Loop 중에는 안정적으로 사용한다. Character 상속 계층에 Mode 규칙을 넣는 것보다 독립 정책 객체로 구성하면 새 Mode가 기존 Entity 수명과 저장 Schema를 흔들지 않는다.
### 구현·운영 검증 기준

- **입력 계약**: Inheritance Interface Polymorphism에서 입력 계약가 영향을 주는 코드 경계를 실제 Method와 객체 수명으로 표시한다. 정상 Case와 함께 Null, 최대 크기, 동시 호출, 예외와 취소를 재현하고 결과 상태와 Resource가 계약대로 남는지 확인한다. 측정 가능한 지표와 실패 시 대응을 Review 항목에 포함한다.
- **상태 소유권**: Inheritance Interface Polymorphism에서 상태 소유권가 영향을 주는 코드 경계를 실제 Method와 객체 수명으로 표시한다. 정상 Case와 함께 Null, 최대 크기, 동시 호출, 예외와 취소를 재현하고 결과 상태와 Resource가 계약대로 남는지 확인한다. 측정 가능한 지표와 실패 시 대응을 Review 항목에 포함한다.
- **Null 처리**: Inheritance Interface Polymorphism에서 Null 처리가 영향을 주는 코드 경계를 실제 Method와 객체 수명으로 표시한다. 정상 Case와 함께 Null, 최대 크기, 동시 호출, 예외와 취소를 재현하고 결과 상태와 Resource가 계약대로 남는지 확인한다. 측정 가능한 지표와 실패 시 대응을 Review 항목에 포함한다.
- **Type 안전성**: Inheritance Interface Polymorphism에서 Type 안전성가 영향을 주는 코드 경계를 실제 Method와 객체 수명으로 표시한다. 정상 Case와 함께 Null, 최대 크기, 동시 호출, 예외와 취소를 재현하고 결과 상태와 Resource가 계약대로 남는지 확인한다. 측정 가능한 지표와 실패 시 대응을 Review 항목에 포함한다.
- **경계값**: Inheritance Interface Polymorphism에서 경계값가 영향을 주는 코드 경계를 실제 Method와 객체 수명으로 표시한다. 정상 Case와 함께 Null, 최대 크기, 동시 호출, 예외와 취소를 재현하고 결과 상태와 Resource가 계약대로 남는지 확인한다. 측정 가능한 지표와 실패 시 대응을 Review 항목에 포함한다.
- **동시 실행**: Inheritance Interface Polymorphism에서 동시 실행가 영향을 주는 코드 경계를 실제 Method와 객체 수명으로 표시한다. 정상 Case와 함께 Null, 최대 크기, 동시 호출, 예외와 취소를 재현하고 결과 상태와 Resource가 계약대로 남는지 확인한다. 측정 가능한 지표와 실패 시 대응을 Review 항목에 포함한다.
- **예외 전파**: Inheritance Interface Polymorphism에서 예외 전파가 영향을 주는 코드 경계를 실제 Method와 객체 수명으로 표시한다. 정상 Case와 함께 Null, 최대 크기, 동시 호출, 예외와 취소를 재현하고 결과 상태와 Resource가 계약대로 남는지 확인한다. 측정 가능한 지표와 실패 시 대응을 Review 항목에 포함한다.
- **자원 정리**: Inheritance Interface Polymorphism에서 자원 정리가 영향을 주는 코드 경계를 실제 Method와 객체 수명으로 표시한다. 정상 Case와 함께 Null, 최대 크기, 동시 호출, 예외와 취소를 재현하고 결과 상태와 Resource가 계약대로 남는지 확인한다. 측정 가능한 지표와 실패 시 대응을 Review 항목에 포함한다.
- **성능 비용**: Inheritance Interface Polymorphism에서 성능 비용가 영향을 주는 코드 경계를 실제 Method와 객체 수명으로 표시한다. 정상 Case와 함께 Null, 최대 크기, 동시 호출, 예외와 취소를 재현하고 결과 상태와 Resource가 계약대로 남는지 확인한다. 측정 가능한 지표와 실패 시 대응을 Review 항목에 포함한다.
- **Memory 사용**: Inheritance Interface Polymorphism에서 Memory 사용가 영향을 주는 코드 경계를 실제 Method와 객체 수명으로 표시한다. 정상 Case와 함께 Null, 최대 크기, 동시 호출, 예외와 취소를 재현하고 결과 상태와 Resource가 계약대로 남는지 확인한다. 측정 가능한 지표와 실패 시 대응을 Review 항목에 포함한다.
- **Version 호환**: Inheritance Interface Polymorphism에서 Version 호환가 영향을 주는 코드 경계를 실제 Method와 객체 수명으로 표시한다. 정상 Case와 함께 Null, 최대 크기, 동시 호출, 예외와 취소를 재현하고 결과 상태와 Resource가 계약대로 남는지 확인한다. 측정 가능한 지표와 실패 시 대응을 Review 항목에 포함한다.
- **관찰 지표**: Inheritance Interface Polymorphism에서 관찰 지표가 영향을 주는 코드 경계를 실제 Method와 객체 수명으로 표시한다. 정상 Case와 함께 Null, 최대 크기, 동시 호출, 예외와 취소를 재현하고 결과 상태와 Resource가 계약대로 남는지 확인한다. 측정 가능한 지표와 실패 시 대응을 Review 항목에 포함한다.
- **부하 상한**: Inheritance Interface Polymorphism에서 부하 상한가 영향을 주는 코드 경계를 실제 Method와 객체 수명으로 표시한다. 정상 Case와 함께 Null, 최대 크기, 동시 호출, 예외와 취소를 재현하고 결과 상태와 Resource가 계약대로 남는지 확인한다. 측정 가능한 지표와 실패 시 대응을 Review 항목에 포함한다.
- **장애 복구**: Inheritance Interface Polymorphism에서 장애 복구가 영향을 주는 코드 경계를 실제 Method와 객체 수명으로 표시한다. 정상 Case와 함께 Null, 최대 크기, 동시 호출, 예외와 취소를 재현하고 결과 상태와 Resource가 계약대로 남는지 확인한다. 측정 가능한 지표와 실패 시 대응을 Review 항목에 포함한다.
- **Test 전략**: Inheritance Interface Polymorphism에서 Test 전략가 영향을 주는 코드 경계를 실제 Method와 객체 수명으로 표시한다. 정상 Case와 함께 Null, 최대 크기, 동시 호출, 예외와 취소를 재현하고 결과 상태와 Resource가 계약대로 남는지 확인한다. 측정 가능한 지표와 실패 시 대응을 Review 항목에 포함한다.
- **보안 경계**: Inheritance Interface Polymorphism에서 보안 경계가 영향을 주는 코드 경계를 실제 Method와 객체 수명으로 표시한다. 정상 Case와 함께 Null, 최대 크기, 동시 호출, 예외와 취소를 재현하고 결과 상태와 Resource가 계약대로 남는지 확인한다. 측정 가능한 지표와 실패 시 대응을 Review 항목에 포함한다.
- **배포 전환**: Inheritance Interface Polymorphism에서 배포 전환가 영향을 주는 코드 경계를 실제 Method와 객체 수명으로 표시한다. 정상 Case와 함께 Null, 최대 크기, 동시 호출, 예외와 취소를 재현하고 결과 상태와 Resource가 계약대로 남는지 확인한다. 측정 가능한 지표와 실패 시 대응을 Review 항목에 포함한다.
- **면접 설명**: Inheritance Interface Polymorphism에서 면접 설명가 영향을 주는 코드 경계를 실제 Method와 객체 수명으로 표시한다. 정상 Case와 함께 Null, 최대 크기, 동시 호출, 예외와 취소를 재현하고 결과 상태와 Resource가 계약대로 남는지 확인한다. 측정 가능한 지표와 실패 시 대응을 Review 항목에 포함한다.

이 기준은 기능을 무조건 복잡하게 만들기 위한 목록이 아니다. Inheritance Interface Polymorphism의 실제 호출 빈도와 장애 영향을 기준으로 필요한 항목을 선택하고, 변경 전후의 정확성과 p99를 비교한다.

## 4. 쉬운 예시

전투 서버에서 DamageRule Interface를 두고 PVP, Raid와 Tutorial 구현을 교체할 수 있다. Match가 시작될 때 Rule을 주입하면 Game Loop가 Mode 조건문을 계속 늘리지 않고 동일 계약으로 호출한다.

## 5. 비슷한 개념과 비교

상속은 공통 상태와 Template을 공유하기 쉽지만 Base 결합이 강하다. Composition은 객체 수와 위임 코드가 늘어도 기능 조합, Test와 Runtime 교체가 쉽다.

## 6. 장점과 단점

상속·Interface와 다형성을 올바르게 적용하면 코드 계약과 상태 흐름이 명확해지고 변경과 장애 진단이 쉬워진다. 반면 잘못된 추상화, 불필요한 객체와 Runtime 비용을 만들 수 있다. 실제 호출 빈도와 변경 축을 측정해 필요한 범위만 사용한다.

## 7. 게임 서버·백엔드 실무 예시

전투 서버에서 DamageRule Interface를 두고 PVP, Raid와 Tutorial 구현을 교체할 수 있다. Match가 시작될 때 Rule을 주입하면 Game Loop가 Mode 조건문을 계속 늘리지 않고 동일 계약으로 호출한다. 운영에서는 처리량, 지연 p99, 오류율, Memory와 Thread 상태를 같은 시간축에서 관찰한다.

## 8. 자주 하는 오해
- 중복 코드가 보이면 is-a 관계 확인 없이 상속한다.
- Overload가 Runtime 객체 Type에 따라 선택된다고 생각한다.
- Interface는 상태를 가질 수 없으므로 계약도 단순하다고 단정한다.
- Constructor에서 Override Method를 호출해도 Subclass 초기화가 끝났다고 본다.
- 다형 호출 비용만으로 Composition과 상속을 결정한다.
## 9. 면접 질문
### Q1. Override와 Overload의 차이는 무엇인가요?
Override는 Subclass가 같은 Signature의 Instance Method 구현을 바꾸며 Runtime Dispatch 대상입니다. Overload는 같은 이름에 다른 Parameter 목록을 두고 Compile Time의 선언 Type을 기준으로 선택됩니다.

### Q2. Interface와 Abstract Class는 어떻게 선택하나요?
독립적인 Capability 조합과 느슨한 계약에는 Interface가 적합합니다. 공통 상태와 불변식, Template 구현을 실제로 공유해야 하면 Abstract Class를 고려합니다.

### Q3. 상속보다 Composition을 선호하는 이유는 무엇인가요?
Composition은 Base 내부 구현에 덜 결합되고 기능을 Runtime에 교체하거나 조합하기 쉽습니다. 명확한 is-a와 대체 가능성이 있을 때만 상속을 선택합니다.

### Q4. Java에서 다중 Class 상속을 지원하지 않는 이유를 설명해 주세요.
여러 Base Class의 상태와 동일 Method 구현을 함께 상속하면 초기화와 충돌 해석이 복잡해집니다. Java는 Class 상속을 하나로 제한하고 여러 Interface 구현으로 계약 조합을 지원합니다.

### Q5. Liskov Substitution은 무엇인가요?
Subclass 객체를 Base가 요구되는 곳에 넣어도 기존 계약과 올바른 동작이 유지돼야 한다는 원칙입니다. 입력 조건을 더 엄격하게 하거나 보장하던 결과를 약화하면 위반할 수 있습니다.
## 10. 예상 꼬리질문

- is-a 관계의 핵심 계약과 실패 조건은 무엇인가요?
- extends 제한의 핵심 계약과 실패 조건은 무엇인가요?
- implements의 핵심 계약과 실패 조건은 무엇인가요?
- Override의 핵심 계약과 실패 조건은 무엇인가요?
- Overload의 핵심 계약과 실패 조건은 무엇인가요?

## 11. 30초 모범답변

> Java 다형성은 상위 Type으로 여러 구현을 다루고 Override Method를 실제 객체에 맞게 호출하는 기능입니다. Interface는 독립 계약과 조합에, 추상 Class는 공통 상태와 구현 공유에 유리합니다. 게임 Mode별 규칙처럼 변경 축이 분명한 기능은 작은 Interface와 Composition으로 분리합니다.

## 12. 1~2분 확장답변

> Java 다형성은 상위 Type의 Reference로 여러 구현 객체를 다루고 Override된 Method를 실제 객체 Type에 따라 호출하는 성질이다. 구현 교체와 확장 가능한 경계를 만들면서도 결합도, 객체 수명과 계약 위반을 제어하기 위해 필요하다. Override는 Runtime Dispatch 대상이고 Overload는 Parameter Type을 기준으로 Compile Time에 선택된다. @Override를 사용하면 Signature 실수를 Compiler가 잡을 수 있다. Static Method와 Field는 Instance Method와 같은 방식으로 다형적으로 Override되지 않는다. 상속은 공통 상태와 Template을 공유하기 쉽지만 Base 결합이 강하다. Composition은 객체 수와 위임 코드가 늘어도 기능 조합, Test와 Runtime 교체가 쉽다. 전투 서버에서 DamageRule Interface를 두고 PVP, Raid와 Tutorial 구현을 교체할 수 있다. Match가 시작될 때 Rule을 주입하면 Game Loop가 Mode 조건문을 계속 늘리지 않고 동일 계약으로 호출한다.

## 13. 핵심 요약

- Java 다형성은 상위 Type의 Reference로 여러 구현 객체를 다루고 Override된 Method를 실제 객체 Type에 따라 호출하는 성질이다.
- Class 상속은 상태와 구현을 재사용하고 is-a 관계를 표현한다. Java Class는 하나의 Class만 extends할 수 있지만 여러 Interface를 implements할 수 있다. 상속을 단순 코드 재사용 수단으로 쓰면 Base 변경이 Subclass에 예상하지 못한 영향을 준다.
- 상속은 공통 상태와 Template을 공유하기 쉽지만 Base 결합이 강하다. Composition은 객체 수와 위임 코드가 늘어도 기능 조합, Test와 Runtime 교체가 쉽다.
- 전투 서버에서 DamageRule Interface를 두고 PVP, Raid와 Tutorial 구현을 교체할 수 있다. Match가 시작될 때 Rule을 주입하면 Game Loop가 Mode 조건문을 계속 늘리지 않고 동일 계약으로 호출한다.

## 한 줄 정리

> Java 다형성은 상위 Type으로 여러 구현을 다루고 Override Method를 실제 객체에 맞게 호출하는 기능입니다.
