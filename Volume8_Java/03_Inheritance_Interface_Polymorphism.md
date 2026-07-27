---
difficulty: 2
reading_time: 25분
interview_frequency: 5
importance: 5
---

# 03. 상속·Interface와 다형성

> 게임 서버·백엔드 개발자를 위한 CS 면접 교재

## 학습 목표

- Override(Runtime Dispatch)와 Overload(Compile Time 선택)의 차이를 정확히 설명할 수 있다.
- Interface와 Abstract Class의 선택 기준(계약 조합 vs 공통 상태·구현 공유)을 설명할 수 있다.
- 상속보다 Composition을 우선하는 이유와 적합한 판단 기준(is-a 관계·LSP)을 설명할 수 있다.
- 게임 서버 전투 규칙처럼 변경 축이 분명한 기능을 Interface + Composition으로 분리하는 설계를 적용할 수 있다.

## 1. 개요

Java 다형성은 상위 Type의 Reference로 여러 구현 객체를 다루고 Override된 Method를 실제 객체 Type에 따라 호출하는 성질이다.

## 2. 왜 필요한가

구현 교체와 확장 가능한 경계를 만들면서도 결합도, 객체 수명과 계약 위반을 제어하기 위해 필요하다.

## 3. 핵심 동작 원리

```text
interface CombatRule ← PvpRule / RaidRule → call rule.calculate() → dynamic dispatch
```

이 흐름은 상속·Interface와 다형성의 주요 처리 단계와 책임 경계를 나타낸다. 각 단계의 입력과 출력, 실패 시 복구 위치를 구분해야 한다.

### Class 상속과 is-a 관계

Class 상속은 상태와 구현을 재사용하고 is-a 관계를 표현한다. Java Class는 하나의 Class만 extends할 수 있지만 여러 Interface를 implements할 수 있다. 상속을 단순 코드 재사용 수단으로 쓰면 Base 변경이 Subclass에 예상하지 못한 영향을 준다.

### Override vs Overload와 런타임 Dispatch

Override는 Runtime Dispatch 대상이고 Overload는 Parameter Type을 기준으로 Compile Time에 선택된다. @Override를 사용하면 Signature 실수를 Compiler가 잡을 수 있다. Static Method와 Field는 Instance Method와 같은 방식으로 다형적으로 Override되지 않는다.

### Interface 계약과 Default Method

Interface는 호출자가 의존할 동작 계약을 정의한다. Default Method는 Interface 진화를 돕지만 여러 Interface의 충돌과 계약 복잡성을 고려한다. 구현 세부보다 Capability를 작고 응집된 Interface로 분리한다.

### 추상 Class와 Interface 선택 기준

추상 Class는 공통 상태와 Protected 구현을 제공할 수 있고 Interface는 다중 구현과 느슨한 계약에 유리하다. 모든 구현이 같은 상태와 불변식을 공유할 때 추상 Class가 자연스러울 수 있다. 독립 기능 조합에는 Interface가 적합하다.

### Composition과 상속 대안

Composition은 객체를 상속하는 대신 필요한 기능 객체를 Field로 보유하고 위임한다. Runtime 교체와 Test Double 주입이 쉽고 Base Class 결합을 줄인다. 명확한 is-a와 Liskov Substitution이 성립하지 않으면 Composition을 우선 검토한다.

### 다형성 성능과 JIT 최적화

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

## 4. 쉬운 예시

전투 서버에서 DamageRule Interface를 두고 PvpRule·RaidRule·TutorialRule이 구현을 교체하는 예시다. Composition으로 주입하면 Game Loop에 Mode 조건문을 추가하지 않아도 된다.

```java
// Interface: 호출자가 의존할 계약만 정의
interface DamageRule {
    int calculate(int attackPower, int defense);
}

// 구현체: 각 Mode별 공식
class PvpRule implements DamageRule {
    @Override
    public int calculate(int attackPower, int defense) {
        return Math.max(1, attackPower - defense); // PvP: 방어력 차감
    }
}

class RaidRule implements DamageRule {
    @Override
    public int calculate(int attackPower, int defense) {
        return (int)(attackPower * 1.5 - defense * 0.5); // Raid: 공격력 강화
    }
}

// Composition: Match가 Rule을 Field로 보유하고 위임
class Match {
    private final DamageRule rule; // 상속이 아닌 Composition

    Match(DamageRule rule) { this.rule = rule; } // DI로 주입

    void processCombat(Player attacker, Player defender) {
        int damage = rule.calculate(attacker.power, defender.defense);
        defender.applyDamage(damage);
    }
}

// 사용: Mode에 따라 Rule만 교체, Game Loop는 동일
Match pvpMatch = new Match(new PvpRule());
Match raidMatch = new Match(new RaidRule());

// Override vs Overload 구분
class Animal {
    String speak() { return "..."; }              // Override 대상
    String speak(int times) { return "...x" + times; } // Overload (다른 Parameter)
}
class Dog extends Animal {
    @Override
    String speak() { return "Woof"; }  // Runtime Dispatch → Dog.speak() 호출
    // speak(int times)는 Animal 것 그대로 상속
}
Animal a = new Dog();
a.speak();    // "Woof" ← Runtime Dispatch (Override)
// a.speak(2) → Compile Time에 Animal.speak(int) 선택 (Overload)

// Constructor에서 Override 호출 함정
class Base {
    Base() { init(); }       // ← 위험: Subclass 초기화 전 Override 메서드 호출
    void init() {}
}
class Sub extends Base {
    private final int value; // 아직 초기화되지 않은 상태
    Sub(int v) { super(); this.value = v; } // super() 먼저 실행
    @Override
    void init() { System.out.println(value); } // value = 0 (기본값) 출력!
}
```

## 5. 비슷한 개념과 비교

| 구분 | 상속 (extends) | Abstract Class | Interface | Composition |
|---|---|---|---|---|
| 상태 공유 | 가능 (Field 상속) | 가능 (Protected Field) | 불가 (상수만) | 위임 객체에 캡슐화 |
| 다중 적용 | 불가 (단일 상속) | 불가 | 가능 (다중 implements) | 가능 (여러 Field) |
| Runtime 교체 | 불가 | 불가 | 가능 | 가능 |
| Base 결합도 | 강함 | 강함 | 약함 | 약함 |
| Test Double 주입 | 어려움 | 어려움 | 쉬움 | 쉬움 |
| 적합한 경우 | 명확한 is-a + LSP | 공통 Template + 불변식 | 독립 Capability 조합 | 기능 위임·런타임 교체 |

## 6. 장점과 단점

**Interface + Composition 설계의 장점:**
- 변경 축이 분명한 기능(Mode별 규칙, 전략 패턴)을 독립 교체할 수 있다.
- Base 내부 구현에 결합되지 않아 Test Double 주입이 쉽다.
- 여러 Interface를 동시에 구현할 수 있어 기능 조합이 유연하다.
- Base Class 변경이 모든 Subclass에 파급되는 Fragile Base Class 문제를 피할 수 있다.

**Interface + Composition 설계의 단점:**
- 공통 상태나 Template 메서드가 많을 때 위임 코드가 늘어 구현이 장황해진다.
- 호출 경로가 위임 체인을 따라 길어져 디버깅이 복잡해질 수 있다.
- 단순한 is-a 관계에서도 Composition을 강제하면 오히려 코드 복잡도가 증가한다.

## 7. 게임 서버·백엔드 실무 예시

캐릭터 종류(전사·마법사·궁수)를 상속 계층으로 모델링하다 보면 Mode별 규칙(PvP·Raid)을 Character 클래스에 추가하게 되어 계층이 폭발적으로 늘어난다. DamageRule을 별도 Interface로 분리하고 Match 시작 시 주입하면 새 Mode가 생겨도 Character 계층과 DB 스키마를 건드리지 않는다.

또한 `instanceof`로 타입을 분기하는 코드는 새 구현체가 추가될 때마다 분기를 추가해야 해서 Open-Closed 원칙을 위반한다. Override된 다형 메서드로 분기를 제거하면 새 타입 추가 시 해당 클래스만 구현하면 된다.

## 8. 자주 하는 오해
- 중복 코드가 보이면 is-a 관계 확인 없이 상속한다. 코드 재사용 목적의 상속은 Base 변경이 Subclass에 예상하지 못한 영향을 주는 Fragile Base Class 문제를 만든다. Composition으로 공통 기능을 위임하는 것이 더 안전하다.
- Overload가 Runtime 객체 Type에 따라 선택된다고 생각한다. Overload는 Compile Time에 선언 Type을 기준으로 선택된다. `Animal a = new Dog(); a.speak(2)`는 Dog에 speak(int)가 있어도 Animal.speak(int)가 호출된다.
- Interface는 상태를 가질 수 없으므로 계약도 단순하다고 단정한다. Interface의 Default Method는 구현을 제공할 수 있고, 두 Interface가 같은 이름의 Default Method를 제공하면 구현 클래스가 직접 충돌을 해결해야 한다.
- Constructor에서 Override 가능한 메서드를 호출해도 Subclass 초기화가 완료되었다고 본다. `super()`가 먼저 실행되므로 Subclass 필드가 아직 초기화되지 않은 상태에서 Override된 메서드가 호출된다.
- 다형 호출 비용 때문에 Composition과 상속의 설계를 결정한다. JIT는 Type Profile을 기반으로 Devirtualization·Inlining을 적용할 수 있다. Virtual Dispatch 한 번보다 Allocation, Cache Miss, Algorithm 비용이 훨씬 큰 경우가 많으므로 Profile 결과로 판단한다.
- Static Method도 Override되어 Runtime Dispatch된다고 생각한다. Static Method는 Class에 속하며 Compile Time에 선택된다. Subclass에 같은 이름의 Static Method가 있어도 Override가 아닌 Hiding이다.
- Liskov Substitution은 단순히 "Subclass는 Base를 대체할 수 있어야 한다"는 뜻이라고 생각한다. LSP는 Subclass가 Base의 사전 조건을 강화하거나 사후 조건을 약화해서는 안 된다는 구체적 계약이다. 예를 들어 Base가 음수를 허용하는데 Subclass가 예외를 던지면 LSP 위반이다.

## 9. 면접 질문
### Q1. Override와 Overload의 차이는 무엇인가요?
Override는 Subclass가 상위 클래스의 같은 Signature Instance Method 구현을 바꾸며 Runtime에 실제 객체 타입을 기준으로 Dispatch됩니다. Overload는 같은 이름에 다른 Parameter 목록을 두고 Compile Time의 선언 타입을 기준으로 선택됩니다. `@Override`를 붙이면 Signature 실수를 컴파일러가 잡아줍니다.

### Q2. Interface와 Abstract Class는 어떻게 선택하나요?
독립적인 Capability를 조합하거나 다중 구현이 필요하면 Interface가 적합합니다. 모든 구현체가 공통 상태(Field)와 불변식, Template 메서드를 실제로 공유해야 하면 Abstract Class를 고려합니다. 일반적으로 Interface를 먼저 정의하고 공통 구현이 많아지면 Abstract Class로 부분 구현을 추출합니다.

### Q3. 상속보다 Composition을 선호하는 이유는 무엇인가요?
Composition은 Base 내부 구현에 덜 결합되고, 기능을 Runtime에 교체하거나 조합하기 쉽고, Test Double 주입이 용이합니다. is-a 관계가 명확하고 LSP가 성립하는 경우에만 상속을 선택합니다. 단순 코드 재사용 목적이라면 Composition으로 위임하는 것이 더 안전합니다.

### Q4. Java에서 다중 Class 상속을 지원하지 않는 이유를 설명해 주세요.
여러 Base Class가 같은 이름의 메서드와 상태를 제공할 때 어느 구현을 상속할지, 초기화 순서를 어떻게 할지 해석이 복잡해집니다(다이아몬드 문제). Java는 Class 상속을 하나로 제한하고 여러 Interface 구현으로 계약 조합을 지원합니다. Default Method 충돌은 구현 클래스가 직접 `InterfaceA.super.method()` 형태로 해결합니다.

### Q5. Liskov Substitution 원칙이란 무엇인가요?
Subclass 객체를 Base가 요구되는 곳에 넣어도 기존 계약(사전 조건·사후 조건·불변식)이 유지되어야 한다는 원칙입니다. Subclass가 Base보다 강한 사전 조건을 요구하거나 보장하던 결과를 약화하면 위반입니다. LSP를 위반하면 상위 타입으로 받아도 안전하게 사용할 수 없어 다형성의 신뢰성이 무너집니다.

### Q6. instanceof 분기 대신 다형성을 사용해야 하는 이유는 무엇인가요?
`instanceof` 분기는 새 구현체가 추가될 때마다 분기 코드를 모두 찾아 수정해야 해서 Open-Closed 원칙을 위반합니다. 다형 메서드로 분기를 제거하면 새 타입을 추가할 때 해당 클래스만 구현하면 되고 기존 호출 코드는 변경하지 않아도 됩니다. 단, 타입 자체를 다루는 직렬화·리플렉션 경계에서는 `instanceof`가 불가피하게 필요합니다.

## 10. 예상 꼬리질문
- 추상 클래스와 Interface 중 무엇을 선택하는 기준은 무엇인가요? 둘 다 쓰는 패턴도 있나요?
- 다이아몬드 문제는 무엇이고 Java Interface Default Method 충돌을 어떻게 해결하나요?
- Static Method는 Override가 되나요? Hiding과 Override의 차이는 무엇인가요?
- Constructor에서 Override 가능한 메서드를 호출하면 안 되는 이유를 코드로 설명해 주세요.
- instanceof 대신 다형성을 쓰는 것이 좋은 이유는 무엇이고, instanceof가 불가피한 경우는 언제인가요?
- 게임 캐릭터 계층구조(전사·마법사)에서 상속보다 Composition이 나은 이유를 구체적으로 설명해 주세요.
- Fragile Base Class 문제가 무엇이고 어떻게 방지하나요?

## 11. 30초 모범답변

> Java 다형성은 상위 타입으로 여러 구현을 다루고 Override된 메서드를 실제 객체 타입에 맞게 Runtime에 호출하는 기능입니다. Interface는 독립 계약 조합에, Abstract Class는 공통 상태·구현 공유에 유리합니다. 게임 Mode별 전투 규칙처럼 변경 축이 분명한 기능은 Interface + Composition으로 분리해 Game Loop가 Mode 조건문 없이 동일 계약으로 호출하게 합니다.

## 12. 1~2분 확장답변

> 다형성은 상위 타입의 Reference로 여러 구현을 다루고 Override된 메서드를 Runtime에 실제 객체 타입으로 Dispatch하는 성질입니다. Override는 같은 Signature의 Instance 메서드 구현을 교체하며 Runtime에 선택되고, Overload는 다른 Parameter 목록을 Compile Time의 선언 타입 기준으로 선택합니다. `@Override`로 Signature 실수를 컴파일러가 잡게 합니다.
>
> Interface는 독립적인 Capability 계약과 다중 조합에 유리하고, Abstract Class는 공통 상태와 Template 메서드를 공유해야 할 때 적합합니다. 명확한 is-a 관계와 LSP가 성립하지 않으면 Composition을 우선 선택합니다. Composition은 Base 결합도가 낮고 Runtime 교체와 Test Double 주입이 쉽습니다.
>
> 게임 서버에서 전투 Mode별 규칙을 Character 상속 계층에 넣으면 Mode가 늘어날수록 계층이 폭발합니다. DamageRule Interface를 별도로 두고 Match 시작 시 주입하면 새 Mode가 추가되어도 기존 캐릭터 코드와 DB 스키마를 건드리지 않습니다. `instanceof` 분기 대신 Override된 메서드로 분기를 제거하면 새 타입 추가 시 해당 클래스만 구현하면 됩니다.

## 13. 핵심 요약

- Override vs Overload: Override는 Runtime Dispatch(실제 객체 타입 기준), Overload는 Compile Time 선택(선언 타입 기준) — `@Override`로 Signature 오류 방지.
- Interface 선택 기준: 독립 Capability 조합·다중 구현·느슨한 계약 → Interface, 공통 상태·Template 메서드 공유 → Abstract Class.
- Composition 우선: is-a 관계와 LSP가 성립하지 않으면 Composition으로 기능을 위임 — Runtime 교체·Test Double 주입이 쉽고 Fragile Base Class 문제를 피할 수 있다.
- LSP: Subclass는 Base의 사전 조건을 강화하거나 사후 조건을 약화해서는 안 된다 — 위반 시 다형성의 신뢰성이 무너진다.
- Static Method Hiding: Static Method는 Override가 아닌 Hiding — `Animal a = new Dog(); a.staticMethod()`는 Dog가 아닌 Animal의 메서드 호출.
- Constructor 함정: `super()` 이후 Override 메서드 호출 시 Subclass 필드가 아직 초기화 전 — Constructor에서 Override 가능한 메서드 호출 금지.
- Default Method 충돌: 두 Interface가 같은 Default Method를 제공하면 구현 클래스가 `InterfaceA.super.method()` 형태로 직접 해결해야 한다.
- 게임 서버 적용: DamageRule Interface + Match에 Composition으로 주입 → Mode별 조건문 없이 동일 계약 호출, 새 Mode 추가 시 기존 코드 변경 불필요.

## 한 줄 정리

> 다형성은 상위 타입으로 여러 구현을 Runtime에 교체 가능하게 하며, is-a와 LSP가 성립하지 않으면 상속 대신 Composition을 선택합니다.
