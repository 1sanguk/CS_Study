---
difficulty: 3
reading_time: 25분
interview_frequency: 5
importance: 5
---

# 01. Pointer와 Reference


## 학습 목표

- 함수 인자로 값·Pointer·Reference 중 어느 것을 선택할지, Null 허용 여부·수정 여부·복사 비용 조건을 분석하여 판단할 수 있다.
- Dangling Pointer·Reference가 발생하는 조건(Scope 종료·delete 후 사용·Container 재할당)을 파악하고, 코드에서 수명 오류 가능성을 진단할 수 있다.
- `const int*`·`int* const`·`const int* const` 등 Const 조합이 코드에서 어떤 수정 제한을 나타내는지 판별하고, 잘못된 Const 사용이 있을 때 의도를 복원할 수 있다.
- Vector·List 등 Container 수정 후 기존 Pointer·Iterator 무효화 여부를 판단하고, 게임 Entity를 안전하게 참조하기 위한 Handle 설계 방식을 선택할 수 있다.

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
- 선택적 객체, Callback과 C API(Application Programming Interface) 연동

두 기능은 소유권을 자동 결정하지 않는다. Raw Pointer가 가리키는 객체를 누가 파괴해야 하는지, Reference가 대상보다 오래 남지 않는지는 별도 계약이다. 현대 C++에서는 소유 자원은 RAII(Resource Acquisition Is Initialization)·Smart Pointer·Container로 표현하고 Raw Pointer·Reference는 주로 비소유 접근에 사용한다.

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

Network Callback이 Session Raw Pointer를 Capture했는데 Callback 실행 전에 Session이 종료되면 Use-after-free가 난다. 공유 소유가 필요한지, 단일 I/O(Input/Output) Thread가 소유할지, `weak_ptr`로 존재 여부를 확인할지 설계한다.

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

### Q1. 게임 서버 Tick 루프에서 World가 std::vector<Entity>로 엔티티를 관리하는데, 다른 System이 Entity* 포인터를 한 프레임 이상 보관하다가 크래시가 발생했습니다. 원인을 어떻게 진단하고 장기적으로 안전한 참조 방식으로 바꾸겠습니까?

가장 먼저 Vector에 push_back이나 erase가 발생했는지 확인합니다. push_back이 Capacity를 초과하면 전체 원소를 새 메모리로 이동해 기존 포인터가 무효화됩니다. erase는 삭제 위치 이후 원소를 이동해 그 주소도 바뀝니다. AddressSanitizer를 사용하면 Use-after-free 시점을 정확히 찾을 수 있습니다.

장기 해결책으로는 Raw Pointer 대신 (slotIndex, generation) Handle을 저장합니다. Entity를 삭제하거나 Slot을 재사용할 때 Generation을 증가시키면 오래된 Handle이 새 Entity를 참조하는 ABA 오류를 차단합니다. 한 Tick 안에서만 사용하는 짧은 접근이라면 Tick 시작 시 Handle로 Entity*를 조회해 지역 변수로 두고 Tick이 끝나면 버립니다. 이렇게 하면 수명이 명확하고 Vector 재할당에 안전합니다.

### Q2. Packet 처리 함수가 대형 Buffer 객체를 값으로 받아 복사 비용이 문제가 됐습니다. const T&로 바꾸면 해결되는지, 아니면 다른 방식이 필요한지 어떻게 판단하겠습니까?

읽기만 하고 수정이 없다면 const T& 변경으로 복사를 제거할 수 있습니다. 단, Packet 처리가 동기 함수라면 대상 수명이 호출 기간 동안 보장되므로 안전합니다. 비동기로 처리를 Worker에 넘긴다면 함수 반환 후에도 Buffer를 사용하게 되어 Dangling Reference가 됩니다. 이 경우 값 복사, shared_ptr, 또는 명시적 수명 관리가 필요합니다.

Buffer 일부 구간만 읽는다면 std::span<const std::byte>로 Pointer와 길이를 함께 전달하는 방식이 좋습니다. Span 자체는 소유하지 않으므로 원본 Buffer가 살아 있어야 하고, 비동기 전송이 Span을 저장한다면 전송 완료 콜백까지 Buffer 수명을 명시적으로 관리해야 합니다.

### Q3. 비동기 Network Callback이 Session Raw Pointer를 Capture했는데 Callback 실행 전에 Session이 종료되어 Use-after-free가 발생했습니다. 어떤 설계로 이 문제를 해결하겠습니까?

세 가지 전략을 검토합니다. 첫째, shared_ptr<Session>을 Callback에 Capture합니다. Session이 살아 있는 동안은 안전하지만, 작업 Queue가 Session을 예상보다 오래 살려 메모리가 증가할 수 있습니다. 둘째, weak_ptr<Session>을 저장하고 실행 시점에 lock()으로 유효성을 확인합니다. 이미 종료된 Session이면 작업을 조용히 취소합니다. 셋째, Session 소유권을 단일 I/O Thread에 고정하고 Callback도 같은 Thread에서 실행합니다. 소유권이 명확하고 Data Race도 없지만 Thread 확장성이 제한됩니다.

실무에서는 Session 수명 관리 정책을 먼저 결정한 뒤 적합한 방식을 선택합니다. weak_ptr는 "이미 종료됐으면 무시한다"는 의도를 코드로 명확하게 표현한다는 장점이 있습니다.

### Q4. 코드 리뷰 중 Buffer 읽기 함수의 인자가 int* const p로 선언되어 있는데, 팀원이 "이미 const가 붙어 있으니 안전하다"고 했습니다. 실제로 이 선언이 Buffer 내용을 보호하는지 판단하고, 의도에 맞는 선언으로 수정하겠습니까?

int* const p는 Pointer 자체를 재지정할 수 없다는 제한이지, Buffer 내용을 수정하지 않겠다는 보장이 아닙니다. *p = 0처럼 대상 값은 자유롭게 바꿀 수 있어 "읽기 전용"이라는 의도를 전혀 표현하지 않습니다. 반면 const uint8_t* p는 이 Pointer로 Buffer를 수정할 수 없다고 컴파일러가 강제합니다.

Buffer 읽기 함수가 인자를 내부에서 이동할 필요도 없다면 const uint8_t* const p로 두 제한을 모두 적용합니다. 이렇게 하면 함수 안에서 실수로 Buffer를 덮어쓰거나 Pointer를 엉뚱한 주소로 재지정하는 버그를 컴파일 타임에 차단할 수 있습니다. 호출자에게도 "이 함수는 Buffer를 읽기만 한다"는 계약이 Type Signature에 명시됩니다.

### Q5. 게임 서버에서 std::vector<Entity>에 Entity를 추가하다가 특정 프레임에서 p99 지연이 급등하는 현상이 반복됩니다. 이 문제의 원인을 어떻게 진단하고, 포인터 무효화 위험 없이 해결하겠습니까?

p99 급등이 특정 프레임에 몰린다면 Vector Capacity 초과로 인한 재할당이 원인일 가능성이 높습니다. push_back 시 Capacity를 초과하면 더 큰 연속 메모리를 새로 할당하고 모든 원소를 이동합니다. 이 비용이 해당 Tick에 집중됩니다.

진단은 Vector capacity()와 size()를 Tick마다 로그로 남겨 재할당 시점을 특정합니다. 해결책은 서버 시작 시 최대 예상 Entity 수를 reserve()로 사전 할당하는 것입니다. 이렇게 하면 이후 push_back에서 재할당이 발생하지 않습니다. 포인터 무효화 위험도 제거됩니다. 최대 Entity 수를 알 수 없다면 Pool Allocator나 Handle 기반 설계로 전환해 재할당 영향 자체를 차단하는 방법도 검토합니다.

### Q6. 게임 서버에서 Entity Slot을 재사용하기 시작한 이후, 삭제된 Entity를 참조하던 오래된 Handle이 신규 Entity를 잘못 참조하는 버그가 발생했습니다. 이 문제를 어떻게 설계로 방지하겠습니까?

이 문제는 ABA 성격의 오류입니다. 동일 Slot을 재사용할 때 기존 Handle이 새 Entity를 가리키는 상황입니다. (slotIndex, generation) 쌍으로 Handle을 구성하고, Slot을 재사용할 때마다 generation 카운터를 증가시키면 오래된 Handle의 generation이 현재 Slot의 generation과 달라져 유효성 검사에서 탈락합니다.

구현 시 generation이 overflow되는 경우도 고려해야 합니다. 64-bit 카운터를 쓰거나, overflow 시 같은 Slot을 즉시 재사용하지 않는 정책을 추가합니다. Entity 조회 함수는 "Handle이 유효하면 Entity*를 반환하고, 아니면 nullptr를 반환"하는 계약으로 설계해 호출자가 유효성을 항상 확인하도록 강제합니다.

## 18. 예상 꼬리질문

- 게임 서버 Entity Pool에서 unique_ptr와 Raw Pointer Observer를 함께 쓸 때 Observer가 먼저 소멸한 Owner의 객체에 접근하는 버그를 어떻게 탐지하나요?
  > AddressSanitizer(ASan)를 빌드에 활성화하면 Use-after-free 시점의 정확한 Call Stack을 출력한다. Observer가 Raw Pointer를 저장하는 코드를 찾아 해당 포인터의 수명 범위를 Owner의 unique_ptr Scope와 대조한다. 장기적으로는 Observer를 (slotIndex, generation) Handle로 교체하고 접근 시 유효성을 검사하는 구조로 전환해 컴파일 타임에 수명 위반을 방지한다.
- C API를 Wrapping한 함수에서 Pointer Null 체크를 빠뜨려 서버 크래시가 발생했습니다. Null 허용 여부를 API 계약으로 표현하는 방법은 무엇인가요?
  > Null을 허용하지 않는 인자는 Reference로 받거나 `[[nodiscard]]` + `gsl::not_null<T*>`로 표현해 컴파일러가 경고를 내도록 한다. Null을 허용하는 선택적 인자는 `T*` 또는 `std::optional<T>`로 명시한다. Wrapper 함수 진입 시 Precondition을 `assert` 또는 계약 라이브러리로 명시하고, 문서에 Null 가능 여부를 기록한다. 내부 C 함수 호출 전에 방어적 Null 검사를 추가해 Undefined Behavior를 차단한다.
- Packet Buffer를 순회하는 코드에서 범위를 벗어난 Pointer 산술로 Undefined Behavior가 발생했습니다. std::span이나 Iterator Pair로 교체할 때 어떤 경계 조건을 확인해야 하나요?
  > std::span으로 교체 시 size()가 0인 빈 Buffer, 읽을 바이트가 남은 크기보다 큰 경우, 가변 길이 필드에서 선언된 크기가 실제 남은 Buffer를 초과하는 경우를 확인한다. 파싱 루프에서 매 Field 읽기 전 `offset + fieldSize <= span.size()`를 검사하고 실패 시 오류를 반환한다. UBSan(UndefinedBehaviorSanitizer)을 활성화해 테스트 환경에서 경계 위반을 즉시 탐지한다.
- 함수가 const std::string&을 반환했는데 호출자에서 값이 깨지는 버그가 발생했습니다. 원인이 무엇이고 어떻게 수정하나요?
  > 함수 내부 Local std::string을 const Reference로 반환한 것이 원인이다. 함수가 반환되면 Local 객체가 소멸해 Dangling Reference가 된다. 수정 방법은 std::string을 값으로 반환하는 것이다. Return Value Optimization(RVO)으로 불필요한 복사가 제거되어 성능 손실이 없다. 반환 값이 외부 객체의 Reference여야 한다면 그 객체가 함수 호출 이후에도 살아있는지 확인한다.
- 비동기 전송 함수에 std::span<const std::byte>를 넘겼더니 전송 완료 전에 원본 Buffer가 해제되어 손상된 데이터가 전송됐습니다. 어떻게 수명을 보장하겠습니까?
  > std::span은 소유하지 않으므로 원본 Buffer의 수명을 전송 완료 시점까지 직접 연장해야 한다. 세 가지 방법이 있다. 첫째, Buffer를 shared_ptr로 소유하고 Callback Closure에 Capture해 완료까지 수명을 연장한다. 둘째, Buffer를 전송 큐가 값으로 소유하게 이동(std::move)한다. 셋째, 완료 Callback에서 Buffer 해제를 수행하는 명시적 수명 관리 구조로 설계한다. 비동기 함수 API에 "Buffer 수명은 Completion Callback까지 유지되어야 한다"는 Precondition을 문서화한다.
- 게임 서버에서 Callback Queue에 캡처된 shared_ptr<Session>이 쌓여 메모리가 계속 증가하는 현상이 발생했습니다. weak_ptr로 교체할 때 어떤 실행 분기가 달라지나요?
  > shared_ptr Capture는 Callback이 실행될 때까지 Session을 살려두므로 Queue가 밀리면 이미 논리적으로 종료된 Session도 유지된다. weak_ptr로 교체하면 Callback 실행 시점에 `lock()`을 호출하고, 이미 Session이 종료되었다면 빈 shared_ptr를 반환받아 해당 Callback을 조용히 건너뛴다. 즉, 추가 분기는 "Session이 아직 살아있는 경우에만 처리, 이미 종료됐으면 무시"이다. 종료 후 미처리 Callback 로그를 남기면 디버깅에 도움이 된다.
- 멀티스레드 게임 서버에서 유효한 Entity*를 통해 컴포넌트를 읽는데 간헐적으로 값이 깨집니다. 포인터 유효성 외에 무엇을 추가로 확인해야 하나요?
  > 포인터가 유효해도 Data Race가 발생할 수 있다. 다른 Thread가 같은 시간에 Entity의 컴포넌트를 수정 중이라면 읽는 Thread는 반쯤 쓰인 값을 읽을 수 있다. 확인 항목은 (1) 컴포넌트 접근을 보호하는 Mutex나 RWLock이 있는지, (2) 컴포넌트 필드가 std::atomic으로 선언되어 있는지, (3) 게임 루프에서 읽기와 쓰기가 같은 Tick Thread에서만 이루어지도록 설계되어 있는지다. ThreadSanitizer(TSan)를 활성화해 Data Race를 재현 가능하게 탐지한다.

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
