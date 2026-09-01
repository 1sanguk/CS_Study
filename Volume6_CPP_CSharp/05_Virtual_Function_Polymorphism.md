---
difficulty: 3
reading_time: 20분
interview_frequency: 5
importance: 5
---

# 05. Virtual Function과 Polymorphism


## 학습 목표

- Base Pointer·Reference 호출이 vptr(virtual function pointer)·vtable(virtual function table)을 통해 실제 타입의 Override로 Dispatch되는 경로를 추적하고, `final` 지정과 실제 타입 노출이 Devirtualization을 허용하는 조건을 판단할 수 있다.
- 다형 삭제가 발생하는 Base Class에서 Virtual Destructor가 필요한 경우와 Protected Non-virtual Destructor로 외부 삭제를 제한해야 하는 경우를 구분하여 설계 결정을 내릴 수 있다.
- 타입 집합이 열려 있는지 고정되어 있는지, 새 타입 추가와 새 연산 추가 중 어느 축으로 확장되는지에 따라 Virtual Interface·`variant`+Visitor 중 적합한 설계를 선택할 수 있다.
- Packet Handler Registry에서 Hot Reload 중 실행 중인 Handler의 수명을 Epoch로 보호해야 하는 조건과, Skill Effect Tick에서 Virtual 호출과 분산 Allocation이 Cache Miss를 누적시키는 상황을 진단하고 ECS(Entity Component System)·Type별 배열 전환 시점을 판단할 수 있다.

## 1. 개요

Virtual Function은 Base Pointer·Reference를 통한 호출을 런타임에 실제 객체 타입의 Override로 Dispatch한다. 다형성은 공통 Interface로 서로 다른 구현을 교체 가능하게 다루는 성질이다.

Overload(Compile Time 이름 해결), Template(Compile Time 타입 다형), Virtual(Runtime 타입 Dispatch)은 모두 다른 메커니즘이다. Virtual Function은 호출 시점에 실제 타입을 알 수 없거나 타입이 런타임에 결정될 때 사용한다.

## 2. 왜 필요한가

Packet Command Handler, Skill Effect, Monster AI처럼 확장 가능한 동작이 필요할 때 호출자가 구체 타입을 알지 않아도 공통 Interface로 교체할 수 있게 한다.

```cpp
// 구체 타입마다 분기 → 확장 시 모든 분기에 추가해야 함
void Dispatch(int type, Packet& p)
{
    if (type == 1) HandleLogin(p);
    else if (type == 2) HandleMove(p);
    // ...
}

// Virtual Interface → 새 Handler 추가 시 기존 코드 수정 불필요
struct ICommandHandler
{
    virtual ~ICommandHandler() = default;
    virtual Result Handle(Session&, const Packet&) = 0;
};
```

## 3. 핵심 동작 원리

```text
Entity* ptr = new Player();
ptr->Update(); → ptr의 vptr → Player vtable → Player::Update 호출
```

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

상속은 Derived가 Base의 계약을 만족하는 "is-a" 관계일 때 사용한다. 코드 재사용만을 위한 상속은 Base 변경이 모든 Derived에 전파되고 결합을 높인다.

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

## 9. RTTI(Run-Time Type Information)와 Downcast

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

Skill Effect 다형성은 콘텐츠 확장에 편하지만 Tick마다 매우 많은 Virtual 호출과 개별 Allocation이 발생하면 Type별 Batch 처리도 측정한다. "Virtual 한 번의 ns"만 보지 않고 전체 Memory Layout, Allocation과 p99를 비교한다.

Interface가 Thread-safe인지, Handler가 Session Reference를 저장하는지, Callback 이후 수명이 유효한지도 계약에 포함한다. Virtual Function은 소유권 문제를 해결하지 않는다.

### 대안 선택

Type 집합이 외부 Plugin처럼 계속 확장되고 각 Type별 동작을 추가하는 일이 많다면 Virtual Interface가 Open-closed 설계에 잘 맞는다. 반대로 Type 집합은 고정되어 있고 새로운 연산을 자주 추가한다면 `variant`와 Visitor 또는 Type별 System이 더 명확할 수 있다.

Template·Concept은 Compile-time 다형성으로 Inlining과 Type별 최적화에 유리하지만 Code Size 증가와 구현 노출, Build Time 비용이 있다. Function Pointer·`std::function`은 Callback 조합에 유용하지만 Capture Allocation과 Type Erasure 비용을 확인한다. 한 방식이 항상 우수한 것이 아니라 확장 축과 호출 빈도를 기준으로 선택한다.

### 테스트와 안전성

Base 계약에 대한 공통 Test Suite를 만들어 모든 Derived에 적용하면 대체 가능성을 검증할 수 있다. Destructor가 Virtual인지, Override에 `override`가 있는지, Base Pointer Collection의 Owner가 명확한지 Static Analysis와 Code Review로 확인한다. Sanitizer는 잘못된 다형 삭제와 수명 오류를 발견하는 데 도움을 준다.

## 11. 쉬운 예시: Packet Handler 교체

같은 Handler Registry 코드가 Login, Move, Attack Handler를 구체 타입 없이 동일하게 호출할 수 있다.

```cpp
struct LoginHandler : ICommandHandler
{
    Result Handle(Session& s, const Packet& p) override
    {
        // 로그인 처리
        return Result::Ok;
    }
};

struct MoveHandler : ICommandHandler
{
    Result Handle(Session& s, const Packet& p) override
    {
        // 이동 처리
        return Result::Ok;
    }
};

class HandlerRegistry
{
public:
    void Register(int opcode, std::unique_ptr<ICommandHandler> h)
    {
        handlers_[opcode] = std::move(h);
    }

    Result Dispatch(int opcode, Session& s, const Packet& p)
    {
        auto it = handlers_.find(opcode);
        if (it == handlers_.end()) return Result::NotFound;
        return it->second->Handle(s, p);   // Virtual Dispatch
    }

private:
    std::unordered_map<int, std::unique_ptr<ICommandHandler>> handlers_;
};
```

새 Handler를 추가할 때 `Dispatch` 분기를 수정하지 않아도 된다.

## 12. 비슷한 개념 비교

| 관점 | 동적 다형성(Virtual) | 정적 다형성(Template) | `variant`+Visitor |
|---|---|---|---|
| 호출 결정 | Runtime | Compile Time | Runtime(방문 순서) |
| 확장 | 새 Derived 클래스 추가 | 새 타입 인스턴스화 | `variant` 목록 수정 |
| 성능 비용 | 간접 호출·vptr | Inlining 가능 | Branch·Switch |
| 가장 적합한 경우 | 타입이 런타임에 결정 | 타입이 Compile Time에 확정 | 폐쇄된 타입 집합 |
| 소유 방식 | `unique_ptr<Base>` | 값 또는 Concept | `std::variant` |

## 13. 장점과 단점

### 장점

- 새 Derived를 추가해도 호출 코드를 수정하지 않아 Open-closed 설계를 지원한다.
- 공통 Interface로 여러 구현을 교체 가능하게 만들어 테스트와 Mock이 쉬워진다.
- 런타임에 구현을 교체(Strategy 패턴)하거나 Plugin으로 로드할 수 있다.

### 단점

- 간접 호출, vptr 크기 추가, Inlining 불가로 Hot Tight Loop에서 성능 영향이 있다.
- 객체를 `unique_ptr<Base>`로 관리해야 해 Container 내 Cache 지역성이 낮아진다.
- Virtual Destructor 누락, `override` 미표기, Object Slicing 등 정확성 실수가 발생하기 쉽다.
- Constructor와 Destructor 안에서 Virtual 호출이 예상과 다르게 동작한다.

## 14. 게임 서버·백엔드 실무 예시

### Skill Effect 다형성

Skill Effect는 구체 타입마다 다른 적용 방식이 있다. 콘텐츠 확장 시 새 Effect Class를 추가하는 것만으로 끝난다.

```cpp
struct ISkillEffect
{
    virtual ~ISkillEffect() = default;
    virtual void Apply(Player& target, float power) = 0;
};

struct DamageEffect : ISkillEffect
{
    void Apply(Player& target, float power) override
    { target.TakeDamage(power); }
};

struct HealEffect : ISkillEffect
{
    void Apply(Player& target, float power) override
    { target.Heal(power); }
};
```

수십만 Entity Tick에서 이 구조로 호출이 폭발하면 ECS 방식이나 Type별 배열 처리를 측정해 비교한다.

### AI State Machine

State별 동작을 Virtual Interface로 표현하면 State 전환은 Pointer 교체만으로 구현된다.

```cpp
struct IAIState
{
    virtual ~IAIState() = default;
    virtual void Enter(Monster& monster) {}
    virtual void Update(Monster& monster, float dt) = 0;
    virtual void Exit(Monster& monster) {}
};
```

## 15. 자주 하는 오해

- **`override`를 안 붙여도 Override가 된다**: Signature가 하나라도 다르면 새 Virtual을 만든다. `override`는 이를 Compile-time에 검출한다.
- **Base Class가 Pure Virtual Function만 있는 Interface면 vptr 비용이 없다**: Pure Virtual만 있는 Abstract Class도 vptr가 각 객체에 추가된다. Interface를 `unique_ptr<Base>`로 보관하면 객체마다 포인터 크기의 vptr 비용이 생긴다.
- **Virtual Function은 항상 Overhead가 크다**: 실제 Hot Path 병목은 Cache Miss와 Allocation인 경우가 많다. 추측하지 말고 Profile 먼저다.
- **Constructor에서 Virtual을 호출하면 Derived Override가 실행된다**: Construction 중에는 Derived 부분이 아직 생성되지 않아 Base Override가 실행된다.
- **`dynamic_cast` 실패는 예외가 난다**: Pointer에 대한 `dynamic_cast` 실패는 nullptr를 반환한다. 예외는 Reference에 대한 실패 시 `std::bad_cast`다.
- **다중 상속을 쓰면 Interface 두 개를 쉽게 합칠 수 있다**: Diamond 문제, Layout 복잡성, 호출 Ambiguity가 생긴다. Interface 상속은 상태 없는 Abstract Class에 제한한다.
- **Composition보다 상속이 재사용에 좋다**: 상속은 강한 결합이다. Member로 조합하는 Composition이 변경 영향 범위가 좁다.

## 16. 면접 질문

### Q1. Handler Registry에서 ICommandHandler를 `unique_ptr<Base>`로 보관하고, Hot Reload 중 기존 Handler를 교체할 때 실행 중인 요청의 수명을 어떻게 보호하겠습니까?

Registry가 Handler를 `unique_ptr<ICommandHandler>`로 소유합니다. Hot Reload 시 Registry 전체를 새 버전으로 교체하되, Epoch 카운터나 `shared_ptr` Snapshot으로 진행 중인 Dispatch가 완료될 때까지 기존 Handler가 소멸되지 않도록 보호합니다. Dispatch 시작 전 Epoch를 읽고 완료 후 Epoch 변경을 감지해 재시도하거나, Snapshot을 `shared_ptr`로 유지해 진행 중 요청이 완료된 뒤 자동 소멸시킵니다.

### Q2. 멀티스레드 서버에서 Session을 `Base*`로 Worker에 전달하는 설계에서 Base Destructor가 Non-virtual인 채로 배포됐습니다. 어떤 장애 패턴이 발생하고, 어떻게 진단합니까?

Base Pointer로 delete 시 Derived Destructor가 호출되지 않아 Derived 멤버(소켓, 버퍼 등)가 정리되지 않고 Undefined Behavior가 됩니다. 증상은 자원 누수, Valgrind·ASan의 Invalid Free, 간헐적 크래시입니다. 진단은 `static_assert(std::has_virtual_destructor<Base>::value)`로 Compile Time에 탐지하거나, Sanitizer로 잘못된 Delete를 감지합니다. Base를 외부에서 delete하는 모든 경로를 확인하고 Virtual Destructor를 추가하거나 Protected Non-virtual로 외부 삭제를 막습니다.

### Q3. 배포 후 신규 Packet Handler가 예상 동작을 하지 않는 버그가 발생했습니다. `override` 미표기로 인해 Base Virtual을 재정의하지 않고 새 함수를 만든 경우, 어떻게 탐지하고 재발을 방지합니까?

`override` 미표기 시 Signature 차이(const 누락, Parameter 타입 불일치 등)로 인해 Base의 Virtual을 숨기는 새 함수가 생성됩니다. Base Pointer 호출 시 Base의 기본 구현이나 빈 Pure Virtual이 실행됩니다. 탐지는 `-Wall -Woverride` 또는 Clang의 `-Wsuggest-override`로 경고를 확인합니다. 재발 방지는 모든 Override에 `override`를 필수 표기하도록 Code Review와 Static Analysis(clang-tidy)를 적용합니다.

### Q4. Skill Effect를 수십만 Entity Tick에서 `vector<unique_ptr<ISkillEffect>>`로 Virtual Dispatch하다 p99 지연이 16ms 목표를 초과했습니다. Cache Miss와 Virtual Dispatch 중 어느 것이 병목인지 어떻게 구분하고, 전환 기준은 무엇입니까?

perf stat 또는 VTune으로 cache-misses와 branch-misses를 측정합니다. Cache Miss가 높으면 분산 Allocation이 원인이고, Branch Miss가 높으면 Virtual Dispatch 예측 실패가 원인입니다. Cache Miss가 지배적이면 Type별 Contiguous Array로 전환해 메모리 지역성을 회복합니다. Virtual Dispatch 비용 자체가 크면 `final` 힌트로 Devirtualization을 유도하거나 ECS로 전환합니다. 전환 기준은 실제 p99와 Profiler 데이터이며 추측으로 교체하지 않습니다.

### Q5. 새 Packet 타입이 한 달에 한 번 추가되는 서버와, Enemy AI Type이 기획 확정 후 고정인 시스템이 있습니다. 각각 Virtual Interface와 `variant`+Visitor 중 어느 것을 선택하고 그 근거는 무엇입니까?

Packet Handler는 타입 집합이 계속 확장되므로 새 Derived Class를 추가할 때 기존 코드를 수정하지 않는 Virtual Interface(Open-closed)가 적합합니다. Enemy AI는 타입이 고정이고 새 연산(공격, 추적, 패턴 등)을 자주 추가한다면 `variant`+Visitor가 연산 추가 시 모든 타입을 한곳에서 처리하게 해 누락을 방지합니다. 혼용 시에는 경계가 명확해야 하며, 한 타입이 두 방식으로 처리되면 유지보수가 복잡해집니다.

### Q6. BaseSession Constructor에서 `OnConnect()` Virtual을 호출했는데 DerivedSession의 Override가 실행될 것을 기대했지만 BaseSession::OnConnect가 실행됐습니다. 어떻게 재설계하겠습니까?

Construction 중 vptr는 현재 Class를 가리키므로 Base Constructor에서 Virtual 호출은 Derived Override로 Dispatch되지 않습니다. 재설계 방법은 두 가지입니다. 첫째, Factory 함수나 `Init()` 메서드를 별도로 두어 객체 생성 완료 후 호출합니다. 둘째, Template Method 패턴으로 Base의 비가상 공통 흐름 안에 Derived가 구현할 Hook을 Pure Virtual로 두고, 외부에서 객체 생성 후 명시적으로 호출합니다. Constructor에서 Virtual 호출 패턴은 전부 제거합니다.

## 17. 예상 꼬리질문

- Handler Registry에 등록된 ICommandHandler가 Session Reference를 내부에 캐싱했을 때 Session 종료 후 어떤 수명 버그가 발생하고, 어떻게 설계를 수정합니까?
- Skill Effect 구조를 Virtual Interface에서 ECS Type별 배열로 전환할 때 기존 `override`로 구현된 특수 Effect 10개를 이전하는 순서와 회귀 검증 방법은 무엇입니까?
- 게임 서버 Hot Path에서 `dynamic_cast` Downcast가 매 Frame 수천 번 호출되는 것이 발견됐습니다. Visitor 패턴 또는 Virtual Double Dispatch로 교체할 때 Trade-off는 무엇입니까?
- Monster AI State를 Virtual Interface로 구현하다 State 전환 중 Enter() 또는 Exit() 내에서 또 State를 바꾸는 재진입 버그가 발생했습니다. 어떻게 방어합니까?
- ICommandHandler Base에 새 Pure Virtual을 추가했을 때 Handler 구현이 100개를 넘는 Codebase에서 누락된 Override를 Compile Time에 모두 탐지하는 방법은 무엇입니까?
- `vector<unique_ptr<Entity>>`에서 특정 Entity 타입만 일괄 처리하는 요구가 생겼을 때 `dynamic_cast`로 순회하는 방식과 Type별 별도 Vector를 유지하는 방식 중 어느 상황에서 어느 쪽을 선택합니까?
- 서비스 중 Handler Registry를 Hot Reload로 교체했는데 구 Handler 소멸 후 Worker Thread에서 이미 꺼낸 포인터로 접근해 Segfault가 발생했습니다. 이 버그를 재현하는 최소 시나리오와 Epoch·`shared_ptr` Snapshot 중 어느 방식으로 수정하겠습니까? 각 방식의 동기화 비용 차이는 무엇입니까?

## 18. 30초 모범답변

> Virtual Function은 vptr·vtable 간접 호출로 Base Pointer 요청을 실제 타입의 Override로 Dispatch합니다. Base Pointer로 delete하는 Class는 Virtual Destructor가 없으면 Derived 멤버가 정리되지 않아 ASan에서 Invalid Free로 잡힙니다. Packet Handler처럼 확장이 열려 있으면 Virtual Interface가 맞고, Enemy AI처럼 타입이 고정이면 `variant`+Visitor가 연산 누락을 Compile Time에 잡아줍니다. 수십만 Entity Tick에서 p99가 튀면 Cache Miss인지 Virtual Dispatch인지 perf stat으로 구분하고 Profile 데이터 없이 교체하지 않습니다.

## 19. 1~2분 확장답변

> Virtual Function은 vptr·vtable 간접 호출로 동적 Dispatch를 구현합니다. 실수가 생기는 지점이 세 곳입니다. 첫째, Base Pointer로 delete할 때 Virtual Destructor가 없으면 Derived 멤버(소켓, 버퍼)가 정리되지 않아 Valgrind·ASan에서 Invalid Free로 잡힙니다. 둘째, `override` 미표기 시 Signature 불일치로 새 함수가 생기고 Base의 빈 기본 구현이 실행되는데, `-Wsuggest-override`와 clang-tidy로 Compile Time에 잡습니다. 셋째, Constructor 안에서 Virtual 호출 시 vptr가 Base를 가리키므로 Derived Override가 실행되지 않습니다. Factory나 `Init()` 메서드로 분리합니다.
>
> 설계 선택은 타입 집합의 개방성으로 결정합니다. Packet Handler처럼 타입이 계속 추가되면 Virtual Interface가 Open-closed를 지킵니다. Enemy AI처럼 타입이 고정이고 연산을 자주 추가하면 `variant`+Visitor가 새 연산 추가 시 모든 타입 처리를 한 `visit` 안에서 강제해 누락을 방지합니다.
>
> 성능 측면에서, 수십만 Entity Tick에서 p99가 16ms 목표를 초과하면 perf stat으로 cache-misses와 branch-misses를 측정합니다. Cache Miss가 지배적이면 분산 Heap Allocation이 원인이므로 Type별 Contiguous Array나 ECS로 전환합니다. Virtual Dispatch 예측 실패가 크면 `final`로 Devirtualization을 유도합니다. 추측으로 교체하지 않고 Profile 데이터가 먼저입니다.

## 20. 핵심 요약

- Virtual Function은 vptr·vtable 간접 호출로 실제 타입의 Override를 Runtime에 선택한다.
- Base Pointer로 삭제하는 Class는 반드시 Virtual Destructor가 필요하다.
- `override`를 명시해 Signature 불일치를 Compile Time에 탐지한다.
- Constructor·Destructor 안의 Virtual 호출은 현재 Class Override만 실행된다.
- 상속은 "is-a" 계약에, 재사용은 Composition에 사용한다.
- Virtual은 타입 집합이 열린 확장 설계에, `variant`+Visitor는 폐쇄 타입 집합에 적합하다.
- Hot Tight Loop의 Virtual 비용은 Cache Miss·Allocation이 더 클 수 있으므로 Profile 먼저다.
- Virtual Function은 소유권 문제를 해결하지 않는다.

## 한 줄 정리

> Virtual Function은 vptr·vtable 간접 호출로 Runtime에 실제 타입의 Override를 Dispatch한다. Base Pointer 삭제에는 Virtual Destructor가 필수이며, Hot Loop 비용은 측정 후 판단한다.
