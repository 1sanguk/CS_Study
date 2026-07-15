---
difficulty: 3
reading_time: 20분
interview_frequency: 5
importance: 5
---

# 05. Virtual Function과 Polymorphism

> 게임 서버·백엔드 개발자를 위한 CS 면접 교재

## 학습 목표
- 정의와 객체 수명 의미를 설명할 수 있다.
- 유사 개념과 비용을 비교할 수 있다.
- 게임 서버의 안전한 코드에 적용할 수 있다.

## 1. 개요
가상 함수는 Base Pointer·Reference를 통한 호출을 실제 객체 타입의 Override로 동적 Dispatch하며 다형성은 공통 Interface로 다른 구현을 다루는 성질이다.

## 2. 왜 필요한가
호출자가 구체 타입에 의존하지 않고 교체 가능한 게임 행동과 서비스 구현을 사용한다. C++에서는 표현뿐 아니라 누가 소유하고 언제 파괴하는지가 API 의미의 일부다.

## 3. 핵심 동작 원리
```text
Base*→virtual table pointer→override function of Derived
```
Override와 Overload를 구분한다. 다형적 Base를 통해 삭제한다면 Virtual Destructor가 필요하다. 동적 Dispatch는 간접 호출 비용과 데이터 지역성 저하를 만들 수 있다.

컴파일러가 생성하는 동작과 Container의 무효화 규칙을 이해해야 예외와 비동기 경로에서도 안전하다.

### 정적 다형성과 동적 다형성

다형성은 같은 Interface로 서로 다른 구현을 사용하는 성질이다. Overload·Template은 Compile Time에 호출이 정해지는 정적 다형성이고, Virtual Function은 객체의 실제 Runtime Type에 따라 호출되는 동적 다형성이다.

```cpp
struct Entity
{
    virtual ~Entity() = default;
    virtual void Update(float deltaTime) = 0;
};

struct Player final : Entity
{
    void Update(float deltaTime) override;
};
```

Base Pointer·Reference를 통한 호출에서 실제 객체의 Override가 실행된다. 값으로 Base를 복사하면 Object Slicing이 생길 수 있다.

### 대표 구현: vptr와 vtable

많은 Compiler는 객체의 vptr가 Virtual Function Table을 가리키게 구현한다.

```text
Entity* → Player Object
            └─ vptr → Player vtable
                         └─ Update → Player::Update
```

호출은 Table의 함수 주소를 통한 간접 호출이 된다. 다만 C++ 표준이 vtable 표현을 강제하지는 않으므로 대표 구현으로 설명한다.

## 4. override, final, Pure Virtual

`override`는 Signature가 실제 Base Virtual을 재정의하는지 Compiler가 검사한다. Const나 Parameter가 달라 우연히 새 Function을 만드는 실수를 막는다.

`final`은 추가 Override 또는 Class 상속을 막는다. Pure Virtual `=0`은 Derived가 구현할 Interface를 표현하고 Class를 Abstract로 만든다.

```cpp
virtual Result Handle(const Packet&) = 0;
```

Abstract Base도 Destructor 구현을 가질 수 있다. Interface의 함수 계약에는 Parameter뿐 아니라 예외, Thread, 수명과 성능 기대도 포함된다.

## 5. Virtual Destructor

Base Pointer로 Derived를 삭제할 수 있다면 Base Destructor가 Virtual이어야 한다.

```cpp
struct Component
{
    virtual ~Component() = default;
};

Component* component = new NetworkComponent();
delete component;
```

그렇지 않으면 Derived 부분이 올바르게 파괴되지 않아 Undefined Behavior다. 다형 삭제를 허용하지 않는 Base는 Protected Non-virtual Destructor로 외부 삭제를 막을 수 있다.

Constructor·Destructor 안의 Virtual 호출은 더 Derived Override로 Dispatch되지 않는다. Derived 부분이 아직 생성되지 않았거나 이미 파괴된 상태이기 때문이다.

## 6. Object Slicing과 Clone

Derived를 Base 값에 대입하면 Base 부분만 복사되어 Derived 상태가 손실된다.

```cpp
Derived derived;
Base base = derived; // Slicing
```

다형 객체는 Base Reference·Pointer 또는 `unique_ptr<Base>`로 다룬다. 다형 복제가 필요하면 Virtual Clone을 사용할 수 있다.

```cpp
virtual std::unique_ptr<Entity> Clone() const = 0;
```

Container도 `vector<Base>`가 아니라 `vector<unique_ptr<Base>>` 같은 소유 구조가 필요하다. Pointer Collection은 개별 Heap Allocation과 Cache Miss 비용을 만든다.

## 7. 상속과 Composition

상속은 Derived가 Base의 계약을 만족하는 “is-a” 관계일 때 사용한다. 코드 재사용만을 위한 상속은 Base 변경이 모든 Derived에 전파되고 결합을 높인다.

```text
Player
 ├─ MovementComponent
 ├─ CombatComponent
 └─ InventoryComponent
```

Composition은 작은 역할을 Member로 조합해 교체와 테스트를 단순화할 수 있다. 여러 Interface 상속은 가능하지만 상태를 가진 다중 상속과 Diamond는 Layout·초기화·Ambiguity가 복잡하다.

Liskov Substitution 관점에서 Derived는 Base를 기대하는 코드에 대체 가능해야 한다. Base보다 강한 입력 조건을 요구하거나 약한 결과 보장을 제공하면 설계가 깨진다.

## 8. Virtual 호출 비용

Virtual Dispatch는 간접 호출, Inlining 제한과 Branch Prediction 비용을 만들 수 있다. 객체별 vptr도 있다. 그러나 실제 Hot Path에서는 흩어진 Heap 객체의 Cache Miss와 호출 내부 작업이 더 클 수 있다.

```text
vector<unique_ptr<Entity>>
 → Pointer 추적
 → 분산된 객체 Memory
 → Virtual Dispatch
 → Update 작업
```

Compiler가 실제 Type을 알거나 `final`을 이용하면 Devirtualization할 수도 있다. 성능을 추측하지 않고 Profile한다.

수십만 Entity의 단순 Tick은 Type별 Contiguous Array, ECS, `variant`와 Data-oriented Design을 비교한다. 확장 가능한 Handler·Strategy처럼 호출 횟수가 제한된 경로에는 Virtual Interface가 생산성에 유리하다.

## 9. RTTI와 Downcast

`dynamic_cast`는 다형 Base에서 Runtime Type을 검사한다. Pointer Downcast 실패는 nullptr, Reference는 `std::bad_cast`다. `static_cast` Downcast는 검사가 없어 실제 Type이 다르면 위험하다.

Downcast가 자주 필요하면 Base Interface가 필요한 동작을 충분히 제공하지 않거나 폐쇄된 Type 집합을 `variant`·Visitor로 표현하는 편이 나을 수 있다.

Override와 Overload도 구분한다. Override는 같은 Virtual Signature를 Derived가 재정의하고, Overload는 같은 Scope에서 이름은 같지만 Parameter가 다른 Function 집합이다. Derived의 같은 이름 Function이 Base Overload를 숨길 수 있어 `using Base::Function`이 필요할 수 있다.

## 10. 게임 서버 실무

Packet Command Handler를 공통 Interface로 등록하면 호출자는 구체 Handler를 몰라도 된다.

```cpp
struct ICommandHandler
{
    virtual ~ICommandHandler() = default;
    virtual Result Handle(Session&, const Packet&) = 0;
};
```

Registry가 Handler를 `unique_ptr`로 소유하고 Dispatch 시 Reference로 빌린다. Hot Reload 중 Registry를 교체하면 실행 중 Handler 수명을 Snapshot·Epoch로 보호한다.

Skill Effect 다형성은 콘텐츠 확장에 편하지만 Tick마다 매우 많은 Virtual 호출과 개별 Allocation이 발생하면 Type별 Batch 처리도 측정한다. “Virtual 한 번의 ns”만 보지 않고 전체 Memory Layout, Allocation과 p99를 비교한다.

Interface가 Thread-safe인지, Handler가 Session Reference를 저장하는지, Callback 이후 수명이 유효한지도 계약에 포함한다. Virtual Function은 소유권 문제를 해결하지 않는다.

### 대안 선택

Type 집합이 외부 Plugin처럼 계속 확장되고 각 Type별 동작을 추가하는 일이 많다면 Virtual Interface가 Open-closed 설계에 잘 맞는다. 반대로 Type 집합은 고정되어 있고 새로운 연산을 자주 추가한다면 `variant`와 Visitor 또는 Type별 System이 더 명확할 수 있다.

Template·Concept은 Compile-time 다형성으로 Inlining과 Type별 최적화에 유리하지만 Code Size 증가와 구현 노출, Build Time 비용이 있다. Function Pointer·`std::function`은 Callback 조합에 유용하지만 Capture Allocation과 Type Erasure 비용을 확인한다. 한 방식이 항상 우수한 것이 아니라 확장 축과 호출 빈도를 기준으로 선택한다.

### 테스트와 안전성

Base 계약에 대한 공통 Test Suite를 만들어 모든 Derived에 적용하면 대체 가능성을 검증할 수 있다. Destructor가 Virtual인지, Override에 `override`가 있는지, Base Pointer Collection의 Owner가 명확한지 Static Analysis와 Code Review로 확인한다. Sanitizer는 잘못된 다형 삭제와 수명 오류를 발견하는 데 도움을 준다.

## 11. 쉬운 예시
네트워크 Buffer를 함수에 넘길 때 읽기만 하는지, 복사하는지, 소유권을 넘기는지 Signature로 표현한다. 모호한 Raw Pointer만 전달하면 호출자가 수명을 추측하게 된다.

## 12. 비슷한 개념과 비교
| 관점 | 값·단독 소유 | 공유·비소유 |
|---|---|---|
| 목적 | 명확한 수명·이동 | 공동 수명·관찰 |
| 장점 | 단순·낮은 비용 | 비동기 연결 용이 |
| 위험 | 이동 후 사용 | Cycle·숨은 수명 연장 |

## 13. 장점과 단점
언어 기능은 추상화와 자원 효율을 제공하지만 잘못된 소유권, 무효화, 간접 호출은 메모리 오류와 지연을 만든다. 가장 단순한 값과 단독 소유를 기본으로 한다.

## 14. 게임 서버·백엔드 실무 예시
Skill Interface의 여러 효과를 다형성으로 구현할 수 있다. Tick마다 수백만 번 호출하는 경로는 Component Data와 분기 방식도 측정 비교한다.

Address Sanitizer, Leak Sanitizer, 정적 분석과 부하 테스트를 사용하고 평균보다 최대 할당·해제 지연을 본다.

## 15. 자주 하는 오해
- Raw Pointer가 소유권을 자동 표현한다고 본다.
- Reference는 절대 Dangling이 되지 않는다고 본다.
- shared_ptr가 모든 수명 문제의 기본 해법이라고 본다.
- Move가 항상 메모리 복사 0이라고 단정한다.
- 가상 함수 비용만 보고 구조 전체 비용을 무시한다.

### 최종 실무 판단 기준

- **요구 확인**: 가상 함수는 Base Pointer·Reference를 통한 호출을 실제 객체 타입의 Override로 동적 Dispatch하며 다형성은 공통 Interface로 다른 구현을 다루는 성질이다. 이 내용을 적용하기 전에 데이터 규모, 호출 빈도와 허용 지연을 수치로 확인한다. 같은 기술도 요청량과 정확성 요구가 달라지면 적합한 선택이 달라질 수 있다.
- **정확성 경계**: 소유권과 수명을 명시한다. 정상 흐름만 설명하지 않고 중복, 역순, 동시 실행과 부분 실패에서 어떤 불변식을 지켜야 하는지 함께 명시한다.
- **비용 비교**: RAII와 값 의미를 우선한다. 평균 복잡도나 처리량 하나만 보지 않고 Memory, CPU, I/O, Lock 대기와 구현 복잡도까지 비교한다.
- **장애 대응**: Virtual Function과 Polymorphism 관련 구성 요소가 느려지거나 중단됐을 때 Timeout, Retry 상한, Backpressure와 복구 순서를 정한다. Retry가 중복 부작용이나 연쇄 부하를 만들지 검증한다.
- **운영 검증**: Virtual Function과 Polymorphism에서는 기능 Test와 함께 경계값, Peak 부하와 장애 주입 Test를 수행한다. 처리 시간 p95·p99, 오류율, Queue와 Resource 사용량을 관찰하고 변경 전후 결과를 비교한다.

Virtual Function과 Polymorphism 답변에서는 이 기준으로 답하면 개념 정의에 그치지 않고 선택 조건, Trade-off와 실무 검증 방법까지 논리적으로 연결할 수 있다.

## 16. 면접 질문
### Q1. 핵심 개념을 설명해 주세요.
가상 함수는 Base Pointer·Reference를 통한 호출을 실제 객체 타입의 Override로 동적 Dispatch하며 다형성은 공통 Interface로 다른 구현을 다루는 성질이다.
### Q2. 어떤 Trade-off가 있나요?
Override와 Overload를 구분한다. 다형적 Base를 통해 삭제한다면 Virtual Destructor가 필요하다. 동적 Dispatch는 간접 호출 비용과 데이터 지역성 저하를 만들 수 있다.
### Q3. 게임 서버 적용 사례는 무엇인가요?
Skill Interface의 여러 효과를 다형성으로 구현할 수 있다. Tick마다 수백만 번 호출하는 경로는 Component Data와 분기 방식도 측정 비교한다.
### Q4. 안전성을 어떻게 검증하나요?
소유권 규칙, Scope 종료, 예외·취소 경로를 확인하고 Sanitizer와 프로파일러를 사용한다.

## 17. 예상 꼬리질문
- 소유권과 수명은 어떻게 다른가요?
- Container 재할당은 참조에 어떤 영향을 주나요?
- 예외가 발생하면 자원은 어떻게 정리되나요?
- 공유 소유의 Cycle을 어떻게 끊나요?
- 값 의미와 다형성을 어떻게 선택하나요?

## 18. 30초 모범답변
> 가상 함수는 Base를 통한 호출을 실제 객체의 Override로 연결합니다. 확장성에 유리하지만 수명, Virtual Destructor와 간접 호출 비용을 고려해야 합니다. Skill Interface의 여러 효과를 다형성으로 구현할 수 있다.

## 19. 1~2분 확장답변
> 가상 함수는 Base를 통한 호출을 실제 객체의 Override로 연결합니다. 확장성에 유리하지만 수명, Virtual Destructor와 간접 호출 비용을 고려해야 합니다. C++ 서버에서는 객체 수명과 소유권을 Type과 Scope로 표현하는 것이 핵심입니다. Raw Pointer는 비소유 관찰에 제한하고 RAII와 Container를 우선합니다. 성능은 추측하지 않고 할당, Cache, 간접 호출과 p99를 프로파일링합니다.

## 20. 핵심 요약
- 가상 함수는 Base Pointer·Reference를 통한 호출을 실제 객체 타입의 Override로 동적 Dispatch하며 다형성은 공통 Interface로 다른 구현을 다루는 성질이다.
- 소유권과 수명을 명시한다.
- RAII와 값 의미를 우선한다.
- 무효화와 예외 경로를 확인한다.
- 도구로 메모리 오류를 검증한다.

## 한 줄 정리
> 가상 함수는 Base를 통한 호출을 실제 객체의 Override로 연결합니다. 확장성에 유리하지만 수명, Virtual Destructor와 간접 호출 비용을 고려해야 합니다.
