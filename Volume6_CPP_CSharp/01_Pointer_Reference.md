---
difficulty: 3
reading_time: 25분
interview_frequency: 5
importance: 5
---

# 01. Pointer와 Reference

> 게임 서버·백엔드 개발자를 위한 CS 면접 교재

## 학습 목표

- Pointer의 주소 저장·역참조와 Reference의 별칭 의미를 설명할 수 있다.
- Null, Dangling, Pointer 산술과 객체 수명 문제를 설명할 수 있다.
- 값·Pointer·Reference 함수 인자의 의미와 Const 조합을 비교할 수 있다.
- Container 무효화와 게임 Entity Handle 설계에 적용할 수 있다.

## 1. 개요

C++ Pointer는 객체나 함수의 Memory 주소를 값으로 저장하는 객체다. `&`로 주소를 얻고 `*`로 가리키는 객체에 간접 접근한다. Reference는 이미 존재하는 객체의 별칭이다. 선언 시 대상에 결합하고 일반적인 Reference는 이후 다른 객체에 다시 결합할 수 없다.

```cpp
int value = 10;

int* pointer = &value; // value의 주소 저장
int& reference = value; // value의 별칭

*pointer = 20;
reference = 30;

// value는 최종 30
```

Pointer와 Reference는 복사를 피하고 같은 객체를 여러 코드 위치에서 다루게 한다. 그만큼 대상 객체가 언제까지 살아 있는지, 접근 중 이동·삭제되지 않는지가 안전성의 핵심이 된다.

## 2. 왜 필요한가

Pointer와 Reference는 다음 상황에 사용한다.

- 큰 객체를 복사하지 않고 함수에 전달
- 호출자가 가진 값을 함수에서 수정
- 동적 다형성과 Runtime 객체 선택
- Linked List·Tree·Graph 같은 연결 구조
- 연속 Memory의 배열·Buffer 순회
- 선택적 객체, Callback과 C API 연동

두 기능은 소유권을 자동 결정하지 않는다. Raw Pointer가 가리키는 객체를 누가 파괴해야 하는지, Reference가 대상보다 오래 남지 않는지는 별도 계약이다. 현대 C++에서는 소유 자원은 RAII·Smart Pointer·Container로 표현하고 Raw Pointer·Reference는 주로 비소유 접근에 사용한다.

## 3. Pointer의 핵심 동작

### 주소와 역참조

```cpp
int x = 42;
int* p = &x;

std::cout << p;  // 주소 값
std::cout << *p; // 주소의 int 객체, 42
```

`p` 자체도 Stack 등에 저장된 하나의 객체이며 주소 값을 가진다. `*p`는 그 주소에 유효한 `int` 객체가 존재한다는 전제 아래 대상에 접근한다.

잘못된 주소, 이미 파괴된 객체, 잘못 정렬된 주소를 역참조하면 Undefined Behavior다. 예외가 안정적으로 발생한다고 기대할 수 없고 데이터 손상·Crash·보안 문제가 될 수 있다.

### Null Pointer

Pointer는 아무 객체도 가리키지 않는 `nullptr` 상태를 표현할 수 있다.

```cpp
Player* FindPlayer(PlayerId id)
{
    // 없으면 nullptr
}

if (Player* player = FindPlayer(id))
    player->Send(message);
```

`nullptr`를 역참조하면 Undefined Behavior다. 반환 Pointer가 Null일 수 있는지는 API 이름, Type 또는 문서로 분명히 한다. 반드시 존재해야 한다면 Reference 반환, `std::reference_wrapper`, 결과 Type 등 다른 표현을 고려한다.

`NULL`이나 정수 `0`보다 Type-safe한 `nullptr`를 사용한다. Overload Resolution에서도 Pointer Null임이 명확하다.

### 재지정

```cpp
int a = 1;
int b = 2;
int* p = &a;
p = &b;       // 이제 b를 가리킴
```

Pointer는 다른 주소로 재지정할 수 있다. `*p = value`는 대상 값을 바꾸고, `p = other`는 Pointer 자체가 가리키는 대상을 바꾼다.

## 4. Reference의 핵심 동작

```cpp
int a = 1;
int b = 2;

int& r = a;
r = b;
```

마지막 줄은 `r`을 b에 다시 결합하는 것이 아니라 b의 값 2를 a에 대입한다. r은 계속 a의 별칭이다.

Reference는 선언 시 유효한 객체로 초기화해야 하고 정상적인 언어 사용에서 Null 상태를 표현하지 않는다. 그러나 이것이 Reference가 항상 안전하다는 뜻은 아니다. 대상이 먼저 파괴되면 Dangling Reference가 된다.

```cpp
const std::string& Bad()
{
    std::string local = "temporary";
    return local; // 함수 종료 후 local 파괴, Dangling
}
```

Reference가 구현상 Pointer와 비슷하게 전달되는 경우가 많아도 언어 의미는 별칭이다. 크기나 내부 표현을 표준이 동일하게 강제한다고 단정하지 않는다.

## 5. Pointer와 Reference 비교

| 항목 | Pointer | Reference |
|---|---|---|
| Null 표현 | `nullptr` 가능 | 정상적으로 불가 |
| 선언 후 대상 변경 | 가능 | 재결합 불가 |
| 접근 문법 | `*p`, `p->member` | 일반 객체처럼 `r.member` |
| 산술 | 배열 범위 내 가능 | 불가 |
| 초기화 | 나중 대입 가능 | 선언 시 필요 |
| 소유권 | 자체적으로 표현 안 함 | 자체적으로 표현 안 함 |
| Dangling 가능 | 가능 | 가능 |

선택적 비소유 대상에는 Pointer가 자연스럽다. 반드시 존재하는 비소유 대상에는 Reference가 의도를 더 명확히 나타낸다. 배열 구간은 시작 Pointer 하나보다 `std::span<T>`처럼 Pointer와 길이를 함께 표현하는 Type이 안전하다.

## 6. 함수 인자와 반환

### 값 전달

```cpp
void Process(Packet packet);
```

함수가 독립 Copy를 소유한다. 작은 값 Type이나 Copy·Move가 필요한 경우 명확하다. 호출자가 Rvalue를 넘기면 Move를 활용할 수 있다.

### Const Reference

```cpp
void Inspect(const Packet& packet);
```

복사 없이 읽는다. 함수는 이 Reference를 통해 Packet을 수정하지 않겠다고 표현한다. 작은 `int`, Pointer 같은 Type은 값 전달이 더 단순하고 빠를 수 있다.

### Mutable Reference

```cpp
bool Decode(Buffer& output);
```

호출자 객체를 수정하는 필수 Output·In-out 인자다. 변경 사실이 함수 이름과 Signature에서 충분히 명확한지 본다. 반환값으로 결과를 표현하면 더 읽기 쉬운 경우도 많다.

### Pointer 인자

```cpp
void SetTarget(Entity* target); // nullptr 허용 가능
```

선택적 대상이나 C API와의 연동에 자연스럽다. Null을 허용하지 않는다면 계약을 명시하거나 Reference를 검토한다.

### 반환 Reference·Pointer

반환 대상은 호출 이후에도 살아 있어야 한다. Local 변수 Reference를 반환하면 안 된다. Container 내부 원소의 Reference는 Container 수정으로 무효화될 수 있으므로 API 사용자가 알아야 한다.

## 7. Const와 Pointer 조합

Const가 어느 대상에 붙는지 오른쪽에서 왼쪽으로 읽으면 이해하기 쉽다.

```cpp
const int* p1;       // Pointer to const int
int const* p2;       // 위와 같음
int* const p3 = &x;  // const Pointer to int
const int* const p4 = &x; // 둘 다 const
```

- `const int*`: Pointer는 다른 곳을 가리킬 수 있지만 이 Pointer로 대상 값을 수정할 수 없다.
- `int* const`: Pointer 주소는 바꿀 수 없지만 대상 값은 수정할 수 있다.
- `const int* const`: 대상 수정과 Pointer 재지정 모두 불가다.

Const는 해당 접근 경로의 수정 제한이다. 같은 객체를 가리키는 다른 Mutable Alias가 있으면 객체 전체가 절대 변하지 않는다는 뜻은 아니다. Thread-safety도 자동으로 보장하지 않는다.

## 8. Pointer 산술과 배열

Pointer 산술은 같은 배열 객체와 끝 바로 다음 위치 범위 안에서 의미가 있다.

```cpp
int values[4] = {10, 20, 30, 40};
int* p = values;

*(p + 2); // 30
```

`p+1`은 Byte 하나가 아니라 가리키는 Type `sizeof(int)`만큼 다음 원소를 가리킨다. 배열 범위를 벗어난 Pointer를 역참조하거나 서로 관련 없는 배열 Pointer를 뺄 수 없다.

끝 바로 다음 Pointer는 반복 종료 비교에는 사용할 수 있지만 역참조할 수 없다.

```text
begin                         end
  ↓                            ↓
[10][20][30][40] [one-past-end]
```

Buffer API는 Pointer만 전달하지 말고 길이를 함께 전달한다. `std::span`, Iterator Pair, Container Reference가 범위 계약을 더 잘 표현한다.

## 9. 소유권과 수명의 구분

소유권은 누가 객체 파괴 책임을 갖는지에 대한 규칙이다. 수명은 객체가 실제로 존재하는 기간이다. Pointer·Reference는 객체를 가리킬 뿐 소유권을 자동으로 만들지 않는다.

```text
Owner(unique_ptr<Entity>) ── owns ──> Entity
Observer(Entity*)         ─ observes ─> Entity
```

Owner가 Entity를 파괴하면 Observer는 자동으로 Null이 되지 않는다. 여전히 같은 주소 값을 가진 Dangling Pointer다.

함수 안에서 잠깐 빌리는 Reference는 대상 수명이 호출보다 길어 보통 단순하다. 비동기 작업이 Pointer를 저장하면 호출이 끝난 뒤에도 사용하므로 소유권·Cancellation·수명 동기화가 필요하다.

## 10. Dangling과 주요 원인

### Scope 종료

Local 객체 주소를 밖에 저장한다.

### 동적 객체 해제 후 사용

```cpp
Entity* p = new Entity();
delete p;
p->Update(); // Use-after-free
```

`delete` 후 `p=nullptr`로 만들어도 다른 Alias는 그대로 Dangling일 수 있다. Null 대입은 전체 소유권 설계를 대신하지 않는다.

### Container 재할당·삭제

```cpp
std::vector<Entity> entities;
entities.push_back(Entity{});
Entity* first = &entities[0];

entities.push_back(Entity{}); // Capacity 증가 시 재할당 가능
first->Update();              // 무효화 가능
```

Vector 재할당은 모든 원소를 새 Memory로 이동해 기존 Pointer·Reference·Iterator를 무효화한다. 재할당이 없어도 Erase는 해당 위치 이후의 원소 이동을 일으킬 수 있다. Container별 무효화 규칙을 확인해야 한다.

## 11. Temporary와 Reference 수명 연장

`const` Lvalue Reference가 Temporary에 직접 결합하면 특정 Scope까지 Temporary 수명이 연장되는 경우가 있다.

```cpp
const std::string& text = std::string("hello");
// text의 Scope까지 Temporary 수명 연장
```

하지만 모든 간접 반환·멤버 접근·함수 인자에서 원하는 만큼 연장되는 것은 아니다. 복잡한 Lifetime Extension 규칙에 의존해 장기 저장하기보다 값으로 소유하는 편이 안전하다.

Rvalue Reference `T&&`는 Move Semantics와 Perfect Forwarding에 사용되지만 Reference라는 사실만으로 대상 수명을 무한히 연장하지 않는다. 별도 문서에서 자세히 다룬다.

## 12. Pointer-to-Pointer와 Reference-to-Pointer

호출자가 가진 Pointer 자체를 바꾸려면 Pointer를 Reference로 받을 수 있다.

```cpp
void Reset(Entity*& pointer)
{
    pointer = nullptr;
}
```

C API에서는 출력 Pointer를 `T**`로 받는 경우가 있다.

```cpp
bool CreateEntity(Entity** output);
```

C++ API라면 Smart Pointer 반환이나 값 반환이 소유권과 실패를 더 명확히 표현할 수 있다. 이중 Pointer 문법이 필요하다고 곧바로 소유권이 명확해지는 것은 아니다.

## 13. 게임 서버·백엔드 실무 예시

### Entity Pointer와 Stable Handle

World가 `std::vector<Entity>`에 Entity를 저장하고 다른 System이 Raw Pointer를 오래 보관하면 재할당·Erase로 무효화될 수 있다.

```text
Entity Handle = (slotIndex, generation)

Handle 요청
   ↓
slot이 사용 중인가?
generation이 일치하는가?
   ↓ yes
현재 Entity Reference를 짧게 빌림
```

Slot을 재사용할 때 Generation을 증가시키면 오래된 Handle이 새 Entity를 가리키는 ABA 성격의 오류를 막는다. ID→객체 Lookup의 비용과 한 Tick 내 Reference 유효 범위를 정한다.

### Session과 비동기 Callback

Network Callback이 Session Raw Pointer를 Capture했는데 Callback 실행 전에 Session이 종료되면 Use-after-free가 난다. 공유 소유가 필요한지, 단일 I/O Thread가 소유할지, `weak_ptr`로 존재 여부를 확인할지 설계한다.

`shared_ptr` Capture는 안전해 보여도 작업 Queue가 Session을 예상보다 오래 살려 Memory를 증가시킬 수 있다. 수명 연장도 운영 비용이다.

### Packet Buffer

함수가 Buffer 일부를 읽기만 한다면 `std::span<const std::byte>`로 Pointer와 길이를 함께 전달할 수 있다. 비동기 전송이 Span을 저장한다면 원본 Buffer 수명이 전송 완료까지 유지되어야 한다. Span은 소유하지 않는다.

### 동시성

Pointer가 유효하다는 것과 동시 접근이 안전하다는 것은 별개다. 객체가 살아 있어도 다른 Thread와 비동기 수정하면 Data Race가 발생한다. 소유 Thread, Lock, Immutable Snapshot과 Memory Visibility 정책이 필요하다.

## 14. 안전한 설계 원칙

- 소유 자원은 RAII와 값·`unique_ptr`을 기본으로 한다.
- Raw Pointer·Reference는 짧은 비소유 접근에 제한한다.
- Null 가능성은 Pointer·Optional 결과로 명시한다.
- Buffer는 Pointer와 길이를 하나의 Range Type으로 전달한다.
- 장기 참조 대신 Stable ID·Handle을 검토한다.
- 비동기 Capture는 실행 시점까지의 수명을 증명한다.
- Container 수정 전 Pointer·Iterator 무효화 규칙을 확인한다.
- AddressSanitizer, UndefinedBehaviorSanitizer와 정적 분석을 사용한다.

## 15. 장점과 단점

### Pointer 장점

- Null과 재지정, 배열·C API를 표현한다.
- 선택적 비소유 관계와 동적 다형성에 유연하다.

### Pointer 단점

- Null·Wild·Dangling과 범위 밖 접근 위험이 있다.
- 소유권이 Type에 드러나지 않는 Raw Pointer는 계약이 모호하다.

### Reference 장점

- 반드시 존재하는 객체의 별칭을 간결하게 표현한다.
- 일반 객체 문법을 사용하고 재결합되지 않는다.

### Reference 단점

- 대상 수명보다 오래 남으면 Dangling이다.
- 선택적 관계를 직접 표현하기 어렵고 소유권을 제공하지 않는다.

## 16. 자주 하는 오해

- **Reference는 Null이 아니므로 절대 안전하다**: 대상 파괴 후 Dangling이 될 수 있다.
- **Raw Pointer는 소유자를 의미한다**: 언어 자체는 소유·비소유를 구분하지 않는다.
- **delete 후 Pointer를 Null로 만들면 문제 해결이다**: 다른 Alias는 Dangling이고 이중 소유 설계는 남는다.
- **Const Reference 객체는 어디에서도 바뀌지 않는다**: 해당 접근 경로의 수정만 제한한다.
- **Vector 원소 Pointer는 Vector가 살아 있는 동안 유효하다**: 재할당·Erase로 무효화될 수 있다.
- **Reference는 구현상 항상 Pointer다**: 언어 의미는 별칭이고 표현을 단정하지 않는다.
- **Pointer 산술은 임의 주소에서 가능하다**: 같은 배열 범위에서만 정의된다.
- **객체가 살아 있으면 여러 Thread 접근도 안전하다**: Data Race는 별도 문제다.

## 17. 면접 질문

### Q1. Pointer와 Reference의 차이를 설명해 주세요.

Pointer는 주소를 저장하는 객체라 Null과 재지정, 제한적인 산술이 가능합니다. Reference는 기존 객체의 별칭으로 선언 시 결합하고 재결합할 수 없습니다. 둘 다 대상 수명이나 소유권을 자동 보장하지 않아 Dangling이 될 수 있습니다.

### Q2. Pointer와 Reference 함수 인자는 언제 선택하나요?

필수 비소유 객체를 복사 없이 읽으면 `const T&`, 수정하면 `T&`를 고려합니다. 대상이 없을 수 있으면 `T*`가 자연스럽습니다. 작은 값 Type은 값 전달이 더 단순할 수 있습니다.

### Q3. Dangling Pointer는 언제 발생하나요?

대상 Scope 종료, delete 후 접근, Container 재할당·Erase, Temporary 수명 종료 뒤 주소나 Reference를 보관할 때 발생합니다. Pointer 주소 값이 남아 있어도 객체 수명은 끝난 상태입니다.

### Q4. `const int*`와 `int* const`의 차이는 무엇인가요?

`const int*`는 Pointer를 바꿀 수 있지만 그 Pointer로 int를 수정할 수 없습니다. `int* const`는 Pointer가 다른 대상을 가리킬 수 없지만 현재 int 값은 수정할 수 있습니다.

### Q5. Vector 원소 Pointer가 무효화되는 이유는 무엇인가요?

Capacity 증가 시 더 큰 연속 공간을 할당하고 원소를 이동하므로 기존 주소가 바뀝니다. Erase도 이후 원소를 이동할 수 있습니다. Container의 구체적인 무효화 규칙을 확인해야 합니다.

### Q6. 게임 Entity를 안전하게 참조하는 방법은 무엇인가요?

장기 Raw Pointer 대신 ID나 Slot Index와 Generation으로 구성한 Handle을 저장합니다. 사용할 때 World에서 유효성을 확인해 짧은 Reference를 얻고, 삭제·Slot 재사용 후 오래된 Handle을 거부합니다.

## 18. 예상 꼬리질문

- 소유권과 객체 수명은 어떻게 다른가요?
- `nullptr`와 `NULL`의 차이는 무엇인가요?
- One-past-end Pointer는 어디까지 사용할 수 있나요?
- Temporary의 Reference Lifetime Extension은 언제 적용되나요?
- Span이 Buffer 수명을 보장하지 않는 이유는 무엇인가요?
- 비동기 Callback의 대상 수명은 어떻게 관리하나요?
- 유효한 Pointer를 통한 접근에도 Data Race가 생길 수 있나요?

## 19. 30초 모범답변

> Pointer는 주소를 저장하는 객체라 Null·재지정·배열 범위의 산술이 가능하고, Reference는 기존 객체의 별칭으로 선언 시 결합한 뒤 재결합할 수 없습니다. 둘 다 소유권과 수명을 자동 보장하지 않아 대상이 먼저 파괴되면 Dangling이 됩니다. 현대 C++에서는 소유는 RAII·Smart Pointer로 표현하고 Raw Pointer와 Reference는 짧은 비소유 접근에 사용합니다.

## 20. 1~2분 확장답변

> Pointer는 `&`로 얻은 주소를 저장하고 `*`나 `->`로 간접 접근합니다. `nullptr`와 재지정이 가능하며 Pointer 산술은 같은 배열 범위에서만 정의됩니다. Reference는 객체의 별칭이라 선언 시 초기화하고 다른 객체에 재결합하지 않습니다. 하지만 Reference도 대상 Scope가 끝나거나 Container가 원소를 이동하면 Dangling이 될 수 있습니다.
>
> 함수 Signature에서는 읽기 전용 필수 객체에 `const T&`, 수정할 필수 객체에 `T&`, 선택적 객체에 `T*`를 고려합니다. Raw Pointer 자체는 소유권을 나타내지 않으므로 소유 자원은 값·RAII·`unique_ptr`로 표현합니다. 게임 서버에서는 Vector Entity의 주소를 장기 저장하면 재할당과 삭제에 취약하므로 `(slot,generation)` Handle로 유효성을 검사해 짧게 빌립니다. 비동기 Callback은 실행 시점까지 객체와 Buffer가 살아 있는지, 동시 접근이 안전한지도 별도로 설계합니다.

## 21. 핵심 요약

- Pointer는 주소 값 객체이고 Reference는 기존 객체의 별칭이다.
- Pointer는 Null·재지정이 가능하며 Reference는 선언 시 결합하고 재결합하지 않는다.
- 주소가 남아 있어도 대상 객체 수명이 끝나면 Pointer·Reference는 Dangling이다.
- Raw Pointer와 Reference는 소유권을 자동으로 표현하지 않는다.
- Const 위치에 따라 대상 수정과 Pointer 재지정 제한이 달라진다.
- Pointer 산술은 같은 배열과 One-past-end 범위 안에서만 정의된다.
- Vector 재할당·Erase 등 Container 수정은 주소를 무효화할 수 있다.
- 장기 Entity 참조는 Stable ID·Generation Handle을 검토한다.
- 객체 수명, Buffer 범위와 Thread-safety는 각각 별도로 증명해야 한다.

## 한 줄 정리

> Pointer와 Reference를 안전하게 쓰는 핵심은 문법보다 대상 객체의 소유자, 수명과 주소 무효화 시점을 명확히 하는 것이다.
