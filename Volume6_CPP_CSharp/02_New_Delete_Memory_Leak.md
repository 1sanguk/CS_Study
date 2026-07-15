---
difficulty: 3
reading_time: 25분
interview_frequency: 5
importance: 5
---

# 02. new, delete, Memory Leak

> 게임 서버·백엔드 개발자를 위한 CS 면접 교재

## 학습 목표

- `new`와 `delete`가 객체 생성·파괴와 저장 공간에 수행하는 일을 설명할 수 있다.
- `new/delete`, `new[]/delete[]`, `malloc/free`의 차이를 설명할 수 있다.
- Memory Leak, Dangling, Use-after-free, Double Free를 구분할 수 있다.
- 서버 Memory 증가를 Leak과 Allocator·Pool·Cache 관점에서 진단할 수 있다.

## 1. 개요

C++의 `new T(args...)` 표현식은 객체를 둘 저장 공간을 할당하고 그 공간에 `T`의 생성자를 호출한다. `delete pointer`는 객체의 소멸자를 호출한 뒤 해당 저장 공간을 해제한다.

```cpp
Session* session = new Session(id); // allocate + construct
session->Start();
delete session;                     // destruct + deallocate
```

Memory Leak은 더 이상 필요하지 않은 동적 Memory나 Resource를 반환하지 않아 Process가 계속 보유하는 문제다. 주소를 잃어 해제할 방법이 없는 누수뿐 아니라, 논리적으로 불필요하지만 참조가 남아 수명이 계속 연장되는 경우도 운영상 누수처럼 보일 수 있다.

현대 C++에서는 `new`와 `delete`를 Business Logic에서 직접 짝짓기보다 값 Type, Standard Container, RAII와 Smart Pointer로 소유권을 표현하는 것이 기본이다.

## 2. 저장 공간과 객체 수명

Memory를 확보한 것과 객체가 살아 있는 것은 구분해야 한다.

```text
new T(args)
   ↓
1. operator new로 Raw Storage 확보
   ↓
2. 확보한 Storage에 T 생성자 실행
   ↓
3. T* 반환

delete p
   ↓
1. p가 가리키는 T 소멸자 실행
   ↓
2. operator delete로 Storage 반환
```

생성자가 예외를 던지면 해당 객체는 완전히 생성되지 않았으므로 소멸자는 호출되지 않는다. 그러나 `new` 표현식이 확보한 저장 공간은 대응하는 `operator delete`로 자동 반환된다. 생성이 완료된 Member들은 역순으로 파괴된다.

`operator new`는 보통 Byte 단위 Storage를 제공하는 함수이고, `new` 표현식은 할당과 생성까지 포함하는 언어 기능이다. Placement New는 이미 확보한 주소에 객체를 생성하며 별도의 Memory를 할당하지 않는다. 이때 소멸과 Storage 반환 책임을 직접 관리해야 하므로 일반 Application 코드에서는 신중해야 한다.

## 3. new 실패와 nothrow

일반 `new`가 Memory를 확보하지 못하면 기본적으로 `std::bad_alloc` 예외를 던진다.

```cpp
try
{
    auto* buffer = new Packet[hugeCount];
}
catch (const std::bad_alloc&)
{
    // 정책에 따른 처리
}
```

`new (std::nothrow) T`는 실패 시 `nullptr`를 반환하지만 모든 호출 지점에서 Null 검사가 필요하다. 예외를 피한다는 이유만으로 자동으로 안전해지지 않는다.

OS의 Overcommit 때문에 할당 호출이 성공해도 실제 Page에 접근할 때 Process가 종료될 수 있는 환경도 있다. Server의 Out-of-memory 정책은 언어 예외 하나로 완전히 해결되지 않는다. Memory 상한, Admission Control과 Process 재시작 정책이 필요하다.

## 4. delete의 전제

`delete p`의 `p`는 다음 중 하나여야 한다.

- `nullptr`: 아무 일도 하지 않는다.
- 호환되는 단일 객체 `new` 표현식으로 얻은 Pointer

그 외 주소를 넘기면 Undefined Behavior다.

```cpp
int stackValue = 1;
delete &stackValue; // 잘못됨: new로 얻은 Storage가 아님

int* value = new int(3);
delete value;
delete value;       // Double Free, Undefined Behavior
```

해제 후 Pointer 변수에 `nullptr`를 대입하면 같은 변수의 재사용은 막을 수 있지만 다른 Alias까지 Null이 되지는 않는다.

```text
p1 ──┐
     ├──> Object
p2 ──┘

delete p1; p1=nullptr;
p2는 여전히 해제 주소를 가진 Dangling Pointer
```

## 5. new[]와 delete[]

배열 표현식은 배열 원소 수만큼 객체를 생성하고 `delete[]`는 각 원소 소멸자를 호출한 뒤 배열 Storage를 해제한다.

```cpp
Enemy* enemies = new Enemy[count];
delete[] enemies;
```

`new[]`에 `delete`, 단일 `new`에 `delete[]`를 사용하면 Undefined Behavior다. 구현은 원소 수를 별도 Metadata로 저장할 수 있지만 그 세부 구조에 의존해서는 안 된다.

부분 생성 중 어떤 원소 생성자가 예외를 던지면 이미 생성된 앞 원소들은 역순으로 파괴되고 Storage도 반환된다. 직접 배열 수명을 관리하기보다 `std::vector<T>`나 `std::unique_ptr<T[]>`를 사용하면 짝 불일치 위험을 줄일 수 있다.

## 6. malloc/free와 비교

```cpp
void* raw = std::malloc(sizeof(Session));
std::free(raw);
```

`malloc`은 지정 Byte의 Raw Memory를 반환하며 C++ 객체 생성자를 호출하지 않는다. `free`도 소멸자를 호출하지 않는다. `new/delete`와 `malloc/free`를 섞으면 안 된다.

| 항목 | new/delete | malloc/free |
|---|---|---|
| 반환 Type | 요청한 T* | void* |
| 생성자·소멸자 | 호출 | 호출하지 않음 |
| 실패 | 기본적으로 예외 | nullptr |
| 크기 계산 | Type 기반 | Byte 직접 계산 |
| Customization | operator new/delete | Allocator 구현 |

C Library와 연동하거나 Trivially Copyable Raw Buffer를 다룰 때 `malloc`이 등장할 수 있다. C++ 객체에는 수명 규칙과 Alignment까지 고려해야 한다.

## 7. Memory Leak

가장 단순한 누수는 Owner Pointer를 덮어써 주소를 잃는 경우다.

```cpp
Session* session = new Session();
session = new Session(); // 첫 객체 주소를 잃음
delete session;          // 두 번째만 해제
```

Early Return과 예외도 수동 정리를 건너뛸 수 있다.

```cpp
Buffer* buffer = new Buffer();

if (!Read(*buffer))
    return false; // delete 누락

delete buffer;
```

RAII를 사용하면 Scope를 벗어나는 모든 경로에서 소멸자가 실행된다.

```cpp
auto buffer = std::make_unique<Buffer>();
if (!Read(*buffer))
    return false; // 자동 정리
```

Leak은 Heap Memory만의 문제가 아니다. File Descriptor, Socket, Mutex, DB Transaction 같은 Resource도 반환하지 않으면 누수다. RAII는 이 모든 Resource에 적용되는 수명 Pattern이다.

## 8. Leak과 다른 Memory 오류

| 오류 | 의미 | 대표 결과 |
|---|---|---|
| Memory Leak | 불필요 Memory를 반환하지 않음 | RSS 증가, OOM |
| Dangling Pointer | 수명이 끝난 객체 주소를 보유 | 잘못된 접근 가능 |
| Use-after-free | 해제된 객체를 실제 사용 | 데이터 손상·Crash |
| Double Free | 같은 Allocation을 두 번 해제 | Allocator 손상·Crash |
| Buffer Overflow | 할당 범위 밖 쓰기 | 인접 Memory 손상 |
| Uninitialized Read | 초기화되지 않은 값 읽기 | 비결정 결과 |

Leak은 즉시 Crash하지 않고 장시간 부하 후 문제를 드러내는 경우가 많다. Use-after-free는 테스트에서 우연히 정상처럼 보이다 다른 Allocation이 같은 주소를 재사용할 때 폭발할 수 있다.

## 9. delete this와 다형 삭제

`delete this`는 객체가 반드시 동적으로 할당되었고 이후 어떤 Member에도 접근하지 않으며 다른 Owner가 다시 해제하지 않는다는 매우 강한 조건이 필요하다. 소유권을 숨기므로 일반적으로 피한다.

Base Pointer로 Derived 객체를 삭제하려면 Base 소멸자가 Virtual이어야 한다.

```cpp
struct Base
{
    virtual ~Base() = default;
};

struct Derived : Base
{
    Buffer buffer;
};

Base* p = new Derived();
delete p; // virtual destructor로 Derived까지 파괴
```

Virtual 소멸자가 없는 Base를 통해 Derived를 삭제하면 Undefined Behavior다. 다형적 Base가 삭제 Interface라면 Virtual Destructor를 둔다. 반대로 다형 삭제를 허용하지 않는 Base는 소멸자를 Protected Non-virtual로 두는 설계도 가능하다.

## 10. RAII가 필요한 이유

수동 `new/delete`는 함수의 모든 종료 경로를 사람이 추적해야 한다. 조건문, 예외, Callback이 추가될수록 짝이 깨지기 쉽다.

```text
Resource 획득
   ↓
여러 Return·Exception·Cancellation 경로
   ↓
각 경로마다 수동 해제?  ← 누락 위험
```

RAII는 Resource 수명을 Scope 객체에 묶는다. Constructor에서 획득하고 Destructor에서 해제하므로 Stack Unwinding에서도 정리된다.

- 단독 Heap 객체: `std::unique_ptr<T>`
- 동적 배열: `std::vector<T>`, `std::unique_ptr<T[]>`
- 공유 수명: 필요한 경우 `std::shared_ptr<T>`
- File·Socket: 전용 RAII Wrapper
- Lock: `std::lock_guard`, `std::unique_lock`

다음 문서에서 RAII와 Smart Pointer를 자세히 다룬다.

## 11. RSS가 증가하면 모두 Leak인가

Process의 Resident Set Size가 늘었다고 바로 Leak이라고 단정할 수 없다.

- Allocator가 해제된 Block을 재사용하려고 Process에 보관
- Memory Pool이 Peak Capacity를 유지
- Container의 Size는 줄었지만 Capacity가 남음
- File Page Cache·Memory Mapping
- Fragmentation 때문에 OS로 Page를 반환하지 못함
- 실제 Live Object가 계속 증가

Heap Profiler로 Allocation Stack과 Live Object 수를 확인한다. “해제 호출이 있었는가”뿐 아니라 어떤 Type·Call Site의 Live Byte가 부하 종료 후에도 계속 증가하는지 본다.

```text
부하 증가 → Memory 증가
부하 종료 → Live Object는 감소?
             ├─ yes, RSS만 유지: Cache·Allocator 가능성
             └─ no, 계속 누적: Leak·Retention 조사
```

## 12. Memory Pool과 누수

게임 서버는 고정 크기 Packet·Session 객체를 Pool에서 재사용해 Allocation 지연과 Fragmentation을 줄일 수 있다. Pool은 객체를 OS에 즉시 반환하지 않으므로 RSS가 높아 보일 수 있다.

Pool 자체가 누수를 해결하지는 않는다. 반환되지 않은 Slot, Free List 손상, 객체 Reset 누락이 새로운 문제를 만든다.

관찰할 지표는 다음과 같다.

- Pool Capacity·In-use·Free 수
- 대여 후 최대 보유 시간
- Allocation·Return 횟수 불일치
- High-water Mark
- Fallback Heap Allocation 수
- Generation·Double Return 오류

Pool은 소유권과 반환 계약이 명확할 때 사용한다. 조기 최적화로 Custom Allocator를 만들기보다 실제 Profile을 근거로 한다.

## 13. 비동기와 수명

비동기 작업은 함수 Scope보다 오래 실행될 수 있다.

```cpp
void BeginSend(Session* session)
{
    io.Post([session]
    {
        session->OnComplete(); // 실행 전 session 삭제 가능
    });
}
```

단순 Raw Pointer Capture는 Use-after-free 위험이 있다. 가능한 전략은 다음과 같다.

- I/O Context가 Session을 단일 소유하고 완료 후 파괴
- `shared_ptr` Capture로 작업까지 수명 연장
- `weak_ptr` Lock 성공 시에만 접근
- Stable ID·Generation으로 실행 시 재조회
- Cancellation 완료 후 파괴하는 명시적 State Machine

`shared_ptr`로 무조건 바꾸면 작업 Queue가 Session을 오래 붙잡아 논리적 Retention이 생길 수 있다. 원하는 종료 시점과 참조 Graph를 설계한다.

## 14. 게임 서버·백엔드 실무 예시

### Session 정리 경로

정상 Disconnect, Timeout, Protocol Error, 서버 종료가 모두 같은 정리 State Machine으로 합류해야 한다.

```text
Active
  ├─ Disconnect
  ├─ Timeout
  ├─ Error
  └─ Shutdown
          ↓
Closing: 새 I/O 차단·기존 I/O 취소
          ↓
Closed: Buffer·Socket·Session Owner 해제
```

각 경로가 `delete`를 따로 호출하면 Double Free와 누락이 생기기 쉽다. Owner Container에서 제거하는 한 지점이 최종 수명을 관리하게 한다.

### Packet Buffer

송신 Queue가 Buffer Pointer만 저장하고 호출자가 즉시 Buffer를 해제하면 Use-after-free다. Queue가 Buffer를 소유하도록 Move하거나, Reference-counted Buffer·Completion Callback의 명확한 계약을 사용한다.

### 콘텐츠 Reload

새 콘텐츠 Graph를 만들다 검증 실패하면 중간 Node들이 모두 정리되어야 한다. `unique_ptr`와 Container로 임시 Snapshot을 구성한 뒤 검증 성공 시 현재 Snapshot과 Swap하면 Exception·실패 안전성이 높아진다.

## 15. 탐지 도구와 검증

- AddressSanitizer: Use-after-free, Buffer Overflow 등
- LeakSanitizer: 종료 시 도달 불가 Allocation 탐지
- UndefinedBehaviorSanitizer: 일부 Undefined Behavior
- Valgrind·플랫폼 Heap 도구: Allocation 추적
- Static Analyzer: 소유권·해제 경로 의심 탐지
- Heap Profiler: Type·Call Stack별 Live Byte 추세

Sanitizer Build는 성능·Memory Overhead가 있으므로 개발·테스트 환경에서 사용한다. Long-running 부하, 반복 Connect·Disconnect, Error Injection과 Shutdown Test를 포함한다.

도구가 보고하지 않았다고 안전성이 증명되는 것은 아니다. 실행되지 않은 경로는 검사되지 않는다. Type과 RAII로 오류 가능성을 구조적으로 줄이는 것이 먼저다.

## 16. 장점과 단점

### 직접 동적 할당의 장점

- Runtime에 결정되는 객체 수명과 크기를 표현한다.
- 다형 객체와 안정 주소가 필요한 구조에 유연하다.
- Custom Allocator·Pool과 결합할 수 있다.

### 단점

- 수동 소유권은 Leak·Double Free·Use-after-free 위험이 높다.
- Allocation은 Lock, System Call, Fragmentation과 Tail Latency를 만들 수 있다.
- 개별 Heap 객체는 Pointer 추적으로 Cache 효율이 낮을 수 있다.
- 예외·비동기·취소 경로의 정리가 복잡하다.

## 17. 자주 하는 오해

- **new는 Memory만 할당한다**: Storage 할당 후 생성자까지 호출한다.
- **delete는 Memory만 반환한다**: 소멸자를 먼저 호출한다.
- **free와 delete는 같은 주소에 섞어 써도 된다**: Allocation Family를 맞춰야 한다.
- **delete 후 nullptr로 만들면 모든 Alias가 안전하다**: 다른 Pointer는 Dangling이다.
- **RSS가 증가하면 무조건 Memory Leak이다**: Allocator Cache·Pool·Capacity·Fragmentation을 구분한다.
- **Memory Pool은 누수를 없앤다**: 반환 누락과 Pool Retention이 생길 수 있다.
- **shared_ptr를 쓰면 Leak이 없다**: Cycle과 예상치 못한 수명 연장이 가능하다.
- **Leak은 Heap에만 해당한다**: Socket·File·Lock 같은 Resource도 누수될 수 있다.

## 18. 면접 질문

### Q1. new와 delete가 하는 일을 설명해 주세요.

`new T`는 T를 위한 Storage를 할당하고 생성자를 호출해 객체 수명을 시작한 뒤 Pointer를 반환합니다. `delete`는 소멸자를 호출해 수명을 끝내고 대응 Storage를 해제합니다.

### Q2. new/delete와 malloc/free의 차이는 무엇인가요?

new와 delete는 C++ Type에 맞춰 생성자·소멸자를 호출합니다. malloc과 free는 Raw Byte Memory만 할당·해제하고 객체 수명 함수를 호출하지 않습니다. 두 Family를 섞으면 안 됩니다.

### Q3. Memory Leak, Dangling, Use-after-free를 구분해 주세요.

Leak은 불필요 Resource를 반환하지 않는 것이고, Dangling Pointer는 이미 수명이 끝난 주소를 보유한 상태입니다. 그 Pointer로 실제 접근하면 Use-after-free입니다.

### Q4. new[]와 delete[]를 맞춰야 하는 이유는 무엇인가요?

배열은 여러 원소의 생성·소멸과 배열 Allocation Metadata를 관리할 수 있습니다. 단일 delete와 섞으면 올바른 원소 소멸·해제가 보장되지 않아 Undefined Behavior입니다.

### Q5. RSS 증가를 어떻게 진단하나요?

Live Object와 Allocation Stack 추세를 Heap Profiler로 보고 부하 종료 후 객체 수가 감소하는지 확인합니다. Allocator Cache, Pool Capacity, Container Capacity, Fragmentation과 실제 누수를 구분합니다.

### Q6. 수동 delete보다 RAII가 안전한 이유는 무엇인가요?

Resource를 Scope 객체의 Destructor에 묶어 정상 Return, Early Return과 Exception Stack Unwinding 모두에서 정리합니다. 정리 책임이 Type 하나에 모여 누락과 Double Free 가능성을 줄입니다.

## 19. 예상 꼬리질문

- 생성자가 예외를 던지면 할당한 Memory는 어떻게 되나요?
- Base Pointer로 Derived를 삭제할 때 무엇이 필요한가요?
- Placement New는 일반 new와 무엇이 다른가요?
- delete nullptr은 어떤 동작을 하나요?
- Memory Pool의 누수 여부는 어떤 지표로 확인하나요?
- 비동기 Callback의 객체 수명을 어떻게 보장하나요?
- Sanitizer가 통과하면 Memory 안전성이 증명되나요?

## 20. 30초 모범답변

> `new`는 객체 Storage를 할당하고 생성자를 호출하며, `delete`는 소멸자를 호출한 뒤 Storage를 해제합니다. 단일과 배열 Allocation Family를 맞춰야 합니다. Memory Leak은 불필요 Resource를 반환하지 않는 문제이고 Use-after-free·Double Free와는 다릅니다. 현대 C++에서는 직접 짝짓기보다 RAII, Container와 Smart Pointer로 소유권을 Scope에 묶습니다.

## 21. 1~2분 확장답변

> `new T(args)`는 `operator new`로 Storage를 확보하고 그 위에 T를 생성합니다. `delete`는 T의 소멸자를 호출하고 `operator delete`로 Storage를 반환합니다. `new[]`는 `delete[]`, malloc은 free와 맞춰야 하며 섞으면 Undefined Behavior입니다. Base Pointer로 다형 객체를 삭제한다면 Virtual Destructor도 필요합니다.
>
> Leak은 해제 책임을 잃거나 Early Return·비동기 참조 때문에 불필요 객체가 남는 문제입니다. Dangling은 수명이 끝난 주소를 가진 상태이고 이를 쓰면 Use-after-free입니다. 게임 서버에서는 Session의 정상 종료·Timeout·Error가 한 소유 State Machine을 통해 정리되게 하고 Packet Buffer의 비동기 수명을 명시합니다. RSS 증가만으로 Leak을 단정하지 않고 Live Allocation, Pool In-use, Capacity와 Allocator Cache를 Profile합니다. 구현에서는 RAII와 `unique_ptr`, Container를 우선하고 Sanitizer와 반복 연결·종료 부하로 검증합니다.

## 22. 핵심 요약

- `new`는 Storage 할당과 생성, `delete`는 소멸과 Storage 해제를 수행한다.
- `new/delete`, `new[]/delete[]`, `malloc/free` Family를 맞춰야 한다.
- 해제 후 남은 Alias는 자동으로 Null이 되지 않고 Dangling이 된다.
- Leak, Use-after-free, Double Free와 Buffer Overflow는 서로 다른 오류다.
- Base를 통해 Derived를 삭제하려면 올바른 Virtual Destructor 계약이 필요하다.
- RAII는 모든 Return·Exception 경로의 Resource 정리를 Scope에 묶는다.
- RSS 증가에는 Allocator Cache, Pool, Capacity·Fragmentation도 포함될 수 있다.
- 비동기 Session·Buffer는 작업 완료까지의 수명과 소유권을 명시해야 한다.
- Sanitizer·Heap Profiler와 Long-running 부하를 함께 사용한다.

## 한 줄 정리

> `new/delete`의 핵심 위험은 문법이 아니라 객체 생성부터 모든 실패·비동기 경로를 거쳐 파괴까지 이어지는 소유권 책임이다.
