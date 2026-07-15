---
difficulty: 3
reading_time: 20분
interview_frequency: 5
importance: 5
---

# 04. Copy와 Move Semantics

> 게임 서버·백엔드 개발자를 위한 CS 면접 교재

## 학습 목표
- 정의와 객체 수명 의미를 설명할 수 있다.
- 유사 개념과 비용을 비교할 수 있다.
- 게임 서버의 안전한 코드에 적용할 수 있다.

## 1. 개요
Copy는 원본과 독립된 새 값을 만들고 Move는 원본 자원을 새 객체로 이전해 비싼 할당·복사를 줄인다.

## 2. 왜 필요한가
컨테이너 반환과 재할당에서 값 의미를 유지하면서 Buffer 같은 자원을 효율적으로 전달한다. C++에서는 표현뿐 아니라 누가 소유하고 언제 파괴하는지가 API 의미의 일부다.

## 3. 핵심 동작 원리
```text
copy: allocate B→duplicate A / move: B takes A resource→A valid but unspecified
```
Move 후 원본은 파괴·재할당 가능한 유효 상태여야 하지만 이전 값은 가정하지 않는다. noexcept Move는 표준 Container 재배치 선택에 중요할 수 있다. Rule of Zero를 우선한다.

컴파일러가 생성하는 동작과 Container의 무효화 규칙을 이해해야 예외와 비동기 경로에서도 안전하다.

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

Lvalue는 식 이후에도 식별 가능한 객체를 나타내고, Rvalue는 Temporary나 이동 가능한 값 범주에 해당한다. 단순히 “왼쪽에 올 수 있으면 Lvalue”라는 설명만으로 현대 C++ 값 범주 전체를 설명하기는 부족하지만 면접에서는 수명과 Overload 선택을 중심으로 이해한다.

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

Large Buffer Move가 Pointer 몇 개 교체로 끝날 수 있지만 Small String Optimization처럼 객체 내부 Storage를 쓰는 구현은 일부 Byte를 옮길 수 있다. “Move는 항상 O(1), 0 Copy”라고 단정하지 않고 Type 계약을 확인한다.

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

## 14. 쉬운 예시
네트워크 Buffer를 함수에 넘길 때 읽기만 하는지, 복사하는지, 소유권을 넘기는지 Signature로 표현한다. 모호한 Raw Pointer만 전달하면 호출자가 수명을 추측하게 된다.

## 15. 비슷한 개념과 비교
| 관점 | 값·단독 소유 | 공유·비소유 |
|---|---|---|
| 목적 | 명확한 수명·이동 | 공동 수명·관찰 |
| 장점 | 단순·낮은 비용 | 비동기 연결 용이 |
| 위험 | 이동 후 사용 | Cycle·숨은 수명 연장 |

## 16. 장점과 단점
언어 기능은 추상화와 자원 효율을 제공하지만 잘못된 소유권, 무효화, 간접 호출은 메모리 오류와 지연을 만든다. 가장 단순한 값과 단독 소유를 기본으로 한다.

## 17. 게임 서버·백엔드 실무 예시
대형 Packet Buffer를 작업 Queue에 넘길 때 Move로 데이터 복사를 줄인다. 하지만 수명과 소유권 이동 후 원본을 다시 읽지 않도록 API를 명확히 한다.

Address Sanitizer, Leak Sanitizer, 정적 분석과 부하 테스트를 사용하고 평균보다 최대 할당·해제 지연을 본다.

## 18. 자주 하는 오해
- Raw Pointer가 소유권을 자동 표현한다고 본다.
- Reference는 절대 Dangling이 되지 않는다고 본다.
- shared_ptr가 모든 수명 문제의 기본 해법이라고 본다.
- Move가 항상 메모리 복사 0이라고 단정한다.
- 가상 함수 비용만 보고 구조 전체 비용을 무시한다.

### 최종 실무 판단 기준

- **요구 확인**: Copy는 원본과 독립된 새 값을 만들고 Move는 원본 자원을 새 객체로 이전해 비싼 할당·복사를 줄인다. 이 내용을 적용하기 전에 데이터 규모, 호출 빈도와 허용 지연을 수치로 확인한다. 같은 기술도 요청량과 정확성 요구가 달라지면 적합한 선택이 달라질 수 있다.
- **정확성 경계**: 소유권과 수명을 명시한다. 정상 흐름만 설명하지 않고 중복, 역순, 동시 실행과 부분 실패에서 어떤 불변식을 지켜야 하는지 함께 명시한다.
- **비용 비교**: RAII와 값 의미를 우선한다. 평균 복잡도나 처리량 하나만 보지 않고 Memory, CPU, I/O, Lock 대기와 구현 복잡도까지 비교한다.
- **장애 대응**: Copy와 Move Semantics 관련 구성 요소가 느려지거나 중단됐을 때 Timeout, Retry 상한, Backpressure와 복구 순서를 정한다. Retry가 중복 부작용이나 연쇄 부하를 만들지 검증한다.
- **운영 검증**: Copy와 Move Semantics에서는 기능 Test와 함께 경계값, Peak 부하와 장애 주입 Test를 수행한다. 처리 시간 p95·p99, 오류율, Queue와 Resource 사용량을 관찰하고 변경 전후 결과를 비교한다.

Copy와 Move Semantics 답변에서는 이 기준으로 답하면 개념 정의에 그치지 않고 선택 조건, Trade-off와 실무 검증 방법까지 논리적으로 연결할 수 있다.

## 19. 면접 질문
### Q1. 핵심 개념을 설명해 주세요.
Copy는 원본과 독립된 새 값을 만들고 Move는 원본 자원을 새 객체로 이전해 비싼 할당·복사를 줄인다.
### Q2. 어떤 Trade-off가 있나요?
Move 후 원본은 파괴·재할당 가능한 유효 상태여야 하지만 이전 값은 가정하지 않는다. noexcept Move는 표준 Container 재배치 선택에 중요할 수 있다. Rule of Zero를 우선한다.
### Q3. 게임 서버 적용 사례는 무엇인가요?
대형 Packet Buffer를 작업 Queue에 넘길 때 Move로 데이터 복사를 줄인다. 하지만 수명과 소유권 이동 후 원본을 다시 읽지 않도록 API를 명확히 한다.
### Q4. 안전성을 어떻게 검증하나요?
소유권 규칙, Scope 종료, 예외·취소 경로를 확인하고 Sanitizer와 프로파일러를 사용한다.

## 20. 예상 꼬리질문
- 소유권과 수명은 어떻게 다른가요?
- Container 재할당은 참조에 어떤 영향을 주나요?
- 예외가 발생하면 자원은 어떻게 정리되나요?
- 공유 소유의 Cycle을 어떻게 끊나요?
- 값 의미와 다형성을 어떻게 선택하나요?

## 21. 30초 모범답변
> Copy는 독립 값을 복제하고 Move는 자원 소유권을 이전합니다. Move 후 원본은 유효하지만 값은 가정하지 않으며 가능하면 Rule of Zero를 따릅니다. 대형 Packet Buffer를 작업 Queue에 넘길 때 Move로 데이터 복사를 줄인다.

## 22. 1~2분 확장답변
> Copy는 독립 값을 복제하고 Move는 자원 소유권을 이전합니다. Move 후 원본은 유효하지만 값은 가정하지 않으며 가능하면 Rule of Zero를 따릅니다. C++ 서버에서는 객체 수명과 소유권을 Type과 Scope로 표현하는 것이 핵심입니다. Raw Pointer는 비소유 관찰에 제한하고 RAII와 Container를 우선합니다. 성능은 추측하지 않고 할당, Cache, 간접 호출과 p99를 프로파일링합니다.

## 23. 핵심 요약
- Copy는 원본과 독립된 새 값을 만들고 Move는 원본 자원을 새 객체로 이전해 비싼 할당·복사를 줄인다.
- 소유권과 수명을 명시한다.
- RAII와 값 의미를 우선한다.
- 무효화와 예외 경로를 확인한다.
- 도구로 메모리 오류를 검증한다.

## 한 줄 정리
> Copy는 독립 값을 복제하고 Move는 자원 소유권을 이전합니다. Move 후 원본은 유효하지만 값은 가정하지 않으며 가능하면 Rule of Zero를 따릅니다.
