---
difficulty: 3
reading_time: 20분
interview_frequency: 5
importance: 5
---

# 04. Copy와 Move Semantics

> 게임 서버·백엔드 개발자를 위한 CS 면접 교재

## 학습 목표

- Copy와 Move의 값 의미와 소유권 이전 차이를 설명할 수 있다.
- Rule of Zero·Three·Five의 의도와 적용 기준을 설명할 수 있다.
- `noexcept`, Copy Elision, Perfect Forwarding의 역할을 설명할 수 있다.
- Packet Queue·Entity Container 등 게임 서버 수명 설계에 적용할 수 있다.

## 1. 개요

Copy는 원본과 독립된 새 값을 만들어 두 객체가 각자의 수명을 갖게 한다. Move는 원본 자원을 새 객체로 이전해 비싼 Allocation·복사를 피한다. 두 의미 모두 단순한 성능 최적화가 아니라 소유권이 어디에 있는지를 타입 Signature에 표현하는 언어 설계의 일부다.

## 2. 왜 필요한가

C++에서 컨테이너 반환이나 Queue 전달처럼 값이 이동하는 시점마다 항상 Deep Copy를 수행하면 Payload가 큰 Packet이나 Buffer를 다룰 때 불필요한 비용이 생긴다.

```cpp
// C++03 스타일: 반환 시 복사
Packet BuildPacket() { Packet p; /* ... */ return p; }

// Move Semantics 이후: 소유권 이전 또는 Copy Elision
Packet packet = BuildPacket(); // NRVO 또는 Move
queue.Push(std::move(packet)); // 소유권 이전
```

반환과 전달에서 불필요한 복사를 줄이는 것이 첫 번째 목적이다. 두 번째는 소유권 의도를 코드에 드러내는 것이다. `std::move`가 있으면 "이후 원본을 쓰지 않겠다"는 신호가 된다.

## 3. 핵심 동작 원리

```text
Copy: 새 객체 생성 → 원본 각 Member 복제 (소유 자원이면 Deep Copy 필요)
Move: 새 객체가 원본 자원 포인터를 획득 → 원본 포인터를 null로 교체
```

### 값 의미와 객체 복사

Copy Semantics는 원본과 독립적으로 사용할 수 있는 새 객체를 만든다는 값 의미를 표현한다. 단순 Member는 Member별로 Copy되지만 Raw Pointer Member의 기본 Copy는 주소만 복사하는 Shallow Copy다.

```cpp
class Buffer
{
    std::size_t size_;
    std::byte* data_;
};
```

Compiler가 생성한 Copy를 사용하면 두 Buffer가 같은 `data_`를 가리키고 양쪽 Destructor가 같은 주소를 해제할 수 있다. 소유 Raw Pointer가 있다면 Deep Copy, Copy 금지 또는 RAII Member로 교체해야 한다.

### Copy Constructor와 Copy Assignment

```cpp
Buffer a(1024);
Buffer b = a; // Copy Constructor

Buffer c(16);
c = a;        // Copy Assignment
```

Constructor는 아직 살아 있지 않은 새 객체를 초기화한다. Assignment는 이미 자원을 가진 기존 객체를 새 값으로 바꾸므로 자기 대입과 기존 자원 정리가 필요하다.

Copy-and-swap은 인자를 값으로 받아 안전한 Temporary를 만든 뒤 Member를 Swap한다.

```cpp
Buffer& operator=(Buffer other)
{
    swap(*this, other);
    return *this;
}
```

Copy가 실패하면 원본과 대상이 그대로 남는 Strong Exception Guarantee를 제공하기 쉽지만 불필요한 Allocation이 생길 수 있다.

## 4. Move Semantics

Move는 곧 파괴될 Rvalue 객체의 자원을 새 객체로 이전해 비싼 Deep Copy를 피한다.

```cpp
Buffer::Buffer(Buffer&& other) noexcept
    : size_(std::exchange(other.size_, 0)),
      data_(std::exchange(other.data_, nullptr))
{
}
```

Moved-from 객체는 유효하지만 상태가 지정되지 않을 수 있다. Destructor 호출과 Assignment는 가능해야 하지만 원래 내용이 남아 있다고 가정해서는 안 된다. Class가 명시한 더 강한 계약이 있으면 그 계약을 따른다.

`std::move` 자체는 데이터를 이동하지 않는다. 표현식을 Rvalue로 Cast해 Move Overload가 선택될 수 있게 한다.

```cpp
Buffer b = std::move(a); // Move Constructor 호출 가능
```

Type에 Move Constructor가 없거나 `const` 객체라면 Copy가 선택될 수 있다. 일반 Move Constructor는 Source를 수정해야 하므로 `const T&&`에서 자원을 훔치기 어렵다.

## 5. lvalue, rvalue와 Reference

Lvalue는 식 이후에도 식별 가능한 객체를 나타내고, Rvalue는 Temporary나 이동 가능한 값 범주에 해당한다. 단순히 "왼쪽에 올 수 있으면 Lvalue"라는 설명만으로 현대 C++ 값 범주 전체를 설명하기는 부족하지만 면접에서는 수명과 Overload 선택을 중심으로 이해한다.

```cpp
void Use(const Buffer&); // Lvalue·Rvalue 읽기 가능
void Use(Buffer&&);      // Rvalue, 자원 소비 가능
```

Named Rvalue Reference 변수는 이름이 있으므로 표현식에서 Lvalue다.

```cpp
void Forward(Buffer&& buffer)
{
    Consume(std::move(buffer)); // 다시 Move 의도를 표시
}
```

## 6. Rule of Three, Five, Zero

### Rule of Three

Destructor, Copy Constructor, Copy Assignment 중 하나를 직접 정의해야 한다면 나머지도 필요할 가능성이 높다. 소유 Raw Resource를 관리한다는 신호이기 때문이다.

### Rule of Five

C++11 이후 Move Constructor와 Move Assignment까지 포함한다. 사용자 선언 Destructor나 Copy Operation은 암시적 Move 생성에 영향을 줄 수 있으므로 Compiler 생성 규칙을 확인한다.

### Rule of Zero

가장 권장되는 방식이다. `std::vector`, `std::string`, `unique_ptr` 같은 RAII Member로 구성해 다섯 Special Member Function을 직접 작성하지 않는다.

```cpp
class Packet
{
    std::vector<std::byte> bytes_;
}; // Copy·Move·Destroy를 Member가 올바르게 제공
```

## 7. noexcept와 Container

`std::vector`가 재할당할 때 기존 원소를 새 Storage로 옮긴다. Move Constructor가 예외를 던질 수 있고 Copy가 가능하면 Strong Exception Guarantee를 지키기 위해 Copy를 선택할 수 있다.

```cpp
Widget(Widget&&) noexcept;
```

실제로 예외를 던지지 않는 Move에는 `noexcept`를 표시해야 Container가 효율적인 Move를 선택할 수 있다. 거짓으로 `noexcept`를 선언하고 예외가 나오면 `std::terminate`되므로 보장할 수 있을 때만 사용한다.

## 8. Move Assignment

Move Assignment는 대상이 이미 가진 자원을 먼저 안전하게 처리한 뒤 Source 자원을 받는다.

```cpp
Buffer& Buffer::operator=(Buffer&& other) noexcept
{
    if (this == &other)
        return *this;

    delete[] data_;
    data_ = std::exchange(other.data_, nullptr);
    size_ = std::exchange(other.size_, 0);
    return *this;
}
```

자기 Move Assignment는 일반 코드에서 드물지만 Generic Algorithm과 Alias로 발생할 수 있다. Type이 어떤 보장을 제공하는지 정한다. RAII Member와 Swap으로 구현하면 오류를 줄일 수 있다.

## 9. Perfect Forwarding

Template의 `T&&`가 Type Deduction과 함께 사용되면 Forwarding Reference가 될 수 있다. `std::forward<T>`는 호출자가 넘긴 Lvalue·Rvalue 성질을 보존한다.

```cpp
template <typename T>
void Add(T&& value)
{
    container.emplace_back(std::forward<T>(value));
}
```

항상 `std::move(value)`를 쓰면 호출자가 넘긴 Lvalue까지 예상치 않게 이동할 수 있다. `std::forward`는 Generic Wrapper에서만 필요한 복잡한 도구이며 일반 함수에서는 명확한 Overload나 값 전달이 더 읽기 쉽다.

## 10. Copy Elision

함수에서 값을 반환해도 반드시 Copy·Move가 발생하는 것은 아니다.

```cpp
Packet CreatePacket()
{
    return Packet(1024);
}
```

C++17의 일부 경우에는 Copy Elision이 보장된다. Named Return Value Optimization은 조건에 따라 Compiler가 반환 객체를 호출자 Storage에 직접 생성할 수 있다. 반환 Local에 `std::move`를 붙이면 NRVO를 방해할 수 있으므로 일반적으로 값 그대로 Return한다.

## 11. Slicing과 다형 객체

Derived를 Base 값으로 Copy하면 Derived 부분이 잘리는 Object Slicing이 발생한다.

```cpp
Derived derived;
Base base = derived; // Derived Member 손실
```

다형 객체는 Base Reference·Pointer와 `unique_ptr<Base>`로 다룬다. 복제해야 한다면 Virtual `clone()`이 `unique_ptr<Base>`를 반환하는 Pattern을 사용할 수 있다.

## 12. 게임 서버 실무

Packet·Message를 Queue에 넣을 때 Copy하면 Payload 전체를 복제할 수 있다. Producer가 더 이상 사용하지 않는다면 Move로 Ownership을 Queue에 넘긴다.

```cpp
Packet packet = BuildPacket();
queue.Push(std::move(packet));
```

Moved-from Packet을 다시 송신하거나 Size가 유지된다고 가정하면 Bug다. 변수 이름을 좁은 Scope에 두고 Move 후 사용하지 않는다.

Entity Container 재할당은 원소 Move를 유발하고 기존 Pointer·Reference를 무효화할 수 있다. Move가 싸다는 사실과 주소 안정성은 다른 문제다. Stable Handle이나 `reserve`를 설계한다.

Large Buffer Move가 Pointer 몇 개 교체로 끝날 수 있지만 Small String Optimization처럼 객체 내부 Storage를 쓰는 구현은 일부 Byte를 옮길 수 있다. "Move는 항상 O(1), 0 Copy"라고 단정하지 않고 Type 계약을 확인한다.

## 13. API 선택 기준

- 작은 값·소유 Copy: 값 전달
- 읽기만 하는 큰 객체: `const T&`
- 호출자가 수정할 객체: `T&`
- 함수가 소유권을 가져감: 값 또는 `unique_ptr<T>`
- 반환: 값 반환을 우선하고 Elision 활용
- Generic 전달: 필요한 곳에서 Forwarding Reference

값으로 받아 내부 Member로 Move하는 Sink Parameter Pattern은 Copy·Move Overload를 줄인다.

```cpp
Session(std::string name) : name_(std::move(name)) {}
```

Lvalue 호출은 Copy 한 번+Move, Rvalue 호출은 Move들로 처리된다. 성능과 API 단순성의 Trade-off를 본다.

## 14. 쉬운 예시: 네트워크 Buffer 전달

Buffer를 함수에 넘길 때 읽기, 수정, 소유권 이전 세 목적은 각자 다른 Signature로 표현한다.

```cpp
// 읽기만 함
void Inspect(const Buffer& buf);

// 수신된 데이터를 buf에 채움
bool Decode(Buffer& buf);

// 소유권을 작업 Queue로 이전, 호출 후 sender는 사용하지 않음
void Enqueue(Buffer&& buf);

// 반환값: 새 Buffer 생성, 소유권이 호출자로 이전
Buffer CreateResponseBuffer();
```

모호한 Raw Pointer를 전달하면 호출자가 소유권을 추측하게 된다. 함수 Signature 하나가 문서를 대신한다.

## 15. 비슷한 개념 비교

| 관점 | Copy | Move | 비소유 `T&`/`T*` |
|---|---|---|---|
| 결과 | 독립된 두 객체 | 소유권이 한 쪽으로 이전 | 원본은 그대로, 참조만 |
| 비용 | 자원 크기에 비례 | Pointer 교체 수준 | 없음 |
| 주요 위험 | Shallow Copy | Move 후 원본 재사용 | Dangling |
| 사용 시점 | 독립 복제 필요 | 원본이 더 이상 불필요 | 잠깐 빌림 |

Copy와 Move가 필요한지보다 소유권 의미가 먼저다. 소유권이 명확하면 어느 쪽을 쓸지가 자연스럽게 결정된다.

## 16. 장점과 단점

### 장점

- Move로 대형 Buffer나 Container 전달 비용을 크게 줄일 수 있다.
- Signature에 소유권 의도가 드러나 코드 리뷰와 유지보수가 쉬워진다.
- Rule of Zero로 Compiler가 올바른 Copy·Move·Destroy를 자동 생성한다.
- Copy Elision으로 반환값에 추가 복사 없이 효율적인 코드가 생성된다.

### 단점

- Move 후 원본을 실수로 재사용하면 Unspecified State Bug가 발생한다.
- `noexcept` 선언을 빠뜨리면 `vector` 재할당 시 비효율적인 Copy가 선택될 수 있다.
- Forwarding Reference(`T&&`)와 Rvalue Reference(`T&&`)가 동일한 문법이어서 혼동하기 쉽다.
- Rule of Five를 불완전하게 구현하면 한쪽은 Move되고 다른 쪽은 Copy되는 비대칭 동작이 생긴다.

## 17. 게임 서버·백엔드 실무 예시

### Packet 작업 Queue

Dispatch Thread가 Packet을 빌드한 뒤 Worker에게 소유권을 이전한다. Copy 대신 Move를 사용해 Payload 복제를 피한다.

```cpp
auto packet = BuildPacket(client_id, data);
// Move 후 packet은 사용 금지
work_queue_.Push(std::move(packet));
```

### Entity Container 무효화

`vector<Enemy>`에 `push_back`이 재할당을 일으키면 기존 `Enemy*` Pointer가 Dangling이 된다.

```cpp
std::vector<Enemy> enemies;
enemies.reserve(1024); // 미리 예약으로 재할당 방지
Enemy* current = &enemies[0];
enemies.push_back(Enemy{}); // reserve 없으면 current 무효
```

재할당을 허용한다면 Pointer 대신 Index 기반 Handle을 쓴다.

### Snapshot 교체

빌드 중 실패하면 Move하지 않으므로 기존 State가 그대로 유지된다.

```cpp
auto next = BuildNextState();
if (!next.Validate()) return; // 실패 시 자동 정리
current_state_ = std::move(next); // 성공 시만 교체
```

## 18. 자주 하는 오해

- **`std::move`가 실제로 데이터를 이동한다**: `std::move`는 Cast이다. 표현식을 Rvalue로 바꿔 Move Overload가 선택될 수 있게 할 뿐이며 데이터를 직접 옮기지 않는다.
- **Move 후 원본은 사용할 수 없다**: 파괴 가능하고 Assignment 가능한 유효 상태여야 하지만 내용은 보장되지 않는다. "사용 불가"가 아니라 "값을 가정하지 말아야 한다"이다.
- **Move는 항상 O(1)이고 복사가 전혀 없다**: `std::string`의 Small String Optimization처럼 내부 Buffer를 쓰는 구현은 일부 Byte를 실제로 복사할 수 있다.
- **반환 값에 `std::move`를 붙여야 Move가 된다**: 반환 Local에 `std::move`를 붙이면 NRVO를 방해할 수 있다. 값 그대로 반환하면 Compiler가 가장 효율적인 처리를 선택한다.
- **Copy와 Move가 없어도 Rule of Zero를 따르는 것이다**: Rule of Zero는 RAII Member로 구성해 다섯 Special Member를 작성하지 않는다는 의미다. 직접 작성하지 않아도 Compiler가 올바른 동작을 생성한다.
- **`T&&` 인자는 항상 Rvalue Reference다**: Template에서 Type Deduction이 일어나면 Forwarding Reference가 된다. Lvalue를 받을 수 있다.
- **Derived를 Base 값으로 담아도 다형 동작이 유지된다**: Object Slicing으로 Derived 부분이 잘려 잘못된 동작이 발생한다. 다형 객체는 `unique_ptr<Base>`로 다뤄야 한다.

## 19. 면접 질문

### Q1. Copy와 Move의 차이를 설명해 주세요.

Copy는 원본과 독립된 새 값을 만듭니다. Move는 원본의 자원을 새 객체로 이전하고 원본을 유효하지만 Unspecified 상태로 만듭니다. Move는 대형 Buffer나 Container를 전달할 때 Deep Copy 비용을 피할 수 있습니다.

### Q2. Rule of Zero, Three, Five를 설명해 주세요.

Rule of Zero는 RAII Member로 구성해 Destructor, Copy, Move를 직접 작성하지 않는 방식입니다. 소유 Raw Pointer가 있어 하나를 작성해야 하면 나머지도 필요한 Rule of Three/Five로 확장됩니다. Rule of Zero를 우선하고 부족할 때만 직접 작성합니다.

### Q3. Move Constructor에 `noexcept`를 붙이는 이유는 무엇인가요?

`std::vector`가 재할당할 때 Move Constructor가 예외를 던질 수 있으면 Strong Exception Guarantee를 지키기 위해 Copy를 선택합니다. `noexcept`를 선언해야 Container가 효율적인 Move를 선택할 수 있습니다.

### Q4. 게임 서버에서 Move를 언제 쓰나요?

Packet Builder가 만든 Buffer를 Worker Queue에 넘길 때 `std::move`로 소유권을 이전해 Payload 복제를 피합니다. Move 후 원본 Packet을 다시 사용하지 않도록 Scope를 좁혀 실수를 방지합니다.

### Q5. Forwarding Reference와 Rvalue Reference의 차이는 무엇인가요?

`T&&` 형태가 Template 인자 Deduction과 함께 나오면 Forwarding Reference로, Lvalue Reference와 Rvalue Reference 모두 받을 수 있습니다. 구체 Type에 `&&`가 붙으면 Rvalue Reference만 받습니다. `std::forward<T>`로 원래 값 범주를 보존하며 전달합니다.

### Q6. Object Slicing이란 무엇인가요?

Derived 객체를 Base 값 타입으로 Copy하면 Derived 부분이 잘려 나가는 현상입니다. 다형 객체는 Base Reference·Pointer나 `unique_ptr<Base>`로 다뤄야 합니다. 복제가 필요하면 Virtual `clone()`이 `unique_ptr<Base>`를 반환하는 Pattern을 씁니다.

## 20. 예상 꼬리질문

- `std::move`가 실제로 하는 일은 무엇인가요?
- Container 재할당은 기존 Pointer에 어떤 영향을 주나요?
- Copy-and-swap Idiom의 장단점은 무엇인가요?
- NRVO는 언제 적용되지 않을 수 있나요?
- Sink Parameter Pattern이란 무엇인가요?
- Move 후 원본 상태는 어떻게 정의되나요?
- 예외가 발생하면 Move와 Copy 중 무엇이 선택되나요?

## 21. 30초 모범답변

> Copy는 원본과 독립된 새 값을 만들고, Move는 자원 소유권을 이전해 대형 Buffer 복제 비용을 피합니다. Move 후 원본은 유효하지만 값을 가정해서는 안 됩니다. `noexcept` Move를 선언해야 `vector` 재할당 시 효율적인 Move가 선택됩니다. 가능하면 Rule of Zero로 RAII Member가 올바른 Copy·Move를 자동 제공하게 합니다.

## 22. 1~2분 확장답변

> Copy는 원본과 독립된 새 값을 만듭니다. Raw Pointer Member가 있는 Class는 Shallow Copy가 기본이므로 Deep Copy, Copy 금지, 또는 RAII Member 교체가 필요합니다. Move는 Rvalue의 자원을 새 객체로 이전하며 `std::move`는 Cast이지 데이터 이동이 아닙니다.
>
> `noexcept` Move를 선언하면 `std::vector` 재할당 시 Copy 대신 Move가 선택됩니다. Rule of Zero는 `vector`, `string`, `unique_ptr`처럼 이미 올바른 RAII Member로 구성해 다섯 Special Member Function을 작성하지 않는 방식입니다.
>
> 게임 서버에서 Packet Buffer를 Queue에 넘길 때 `std::move`로 소유권을 이전해 Payload 복제를 피합니다. Move 후 원본을 재사용하면 Unspecified State Bug가 됩니다. Entity `vector`에 원소를 추가할 때 재할당이 일어나면 기존 Pointer가 Dangling이 되므로 `reserve`나 Handle 기반 설계로 대응합니다.

## 23. 핵심 요약

- Copy는 독립 복제, Move는 소유권 이전이며 Move 후 원본 값은 가정하지 않는다.
- `std::move`는 Cast이며 실제 데이터를 이동하지 않는다.
- Move Constructor에 `noexcept`를 붙여야 Container 재할당 시 효율적인 Move가 선택된다.
- Rule of Zero를 우선하고 소유 Raw Resource가 있을 때만 Rule of Five로 직접 작성한다.
- 반환 Local에 `std::move`를 붙이면 NRVO를 방해할 수 있으므로 값 그대로 반환한다.
- `vector` 재할당은 기존 Pointer·Reference를 무효화한다. Move가 싸다는 것과 주소 안정성은 다르다.
- Forwarding Reference(`T&&` + Deduction)와 Rvalue Reference(`T&&`)를 구분한다.
- Object Slicing을 피하려면 다형 객체는 `unique_ptr<Base>`로 다룬다.

## 한 줄 정리

> Copy는 독립 복제, Move는 소유권 이전이며 가능하면 Rule of Zero로 Compiler에게 올바른 Copy·Move를 맡긴다.
