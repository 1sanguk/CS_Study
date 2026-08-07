---
difficulty: 3
reading_time: 25분
interview_frequency: 5
importance: 5
---

# 02. new, delete, Memory Leak


## 학습 목표

- `new`·`delete` 표현식이 Storage 할당·해제·생성자·소멸자 호출 순서에서 예외 발생 시 어떤 정리가 자동으로 이루어지는지 추론하고, 해당 코드가 안전한지 판단할 수 있다.
- `new/delete`·`new[]/delete[]`·`malloc/free` 세 Allocation Family의 혼용이 발생한 코드를 보고, 어떤 Undefined Behavior가 생기는지 진단할 수 있다.
- 서버에서 Memory Leak·Use-after-free·Double Free 증상이 보고됐을 때, 각 오류의 특징적인 증상 차이를 근거로 원인 후보를 좁힐 수 있다.
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
- **Virtual Destructor가 없어도 delete는 올바르게 동작한다**: Base Pointer로 Derived 객체를 삭제할 때 Base 소멸자가 Non-virtual이면 Derived 소멸자가 호출되지 않아 Undefined Behavior가 된다.
- **RSS가 증가하면 무조건 Memory Leak이다**: Allocator Cache·Pool·Capacity·Fragmentation을 구분한다.
- **Memory Pool은 누수를 없앤다**: 반환 누락과 Pool Retention이 생길 수 있다.
- **shared_ptr를 쓰면 Leak이 없다**: Cycle과 예상치 못한 수명 연장이 가능하다.
- **Leak은 Heap에만 해당한다**: Socket·File·Lock 같은 Resource도 누수될 수 있다.

## 18. 면접 질문

### Q1. 게임 서버에서 Session 객체를 new로 할당하고 정상 종료·Timeout·Protocol Error 세 가지 경로에서 delete를 각각 호출하다가 Double Free 크래시가 발생했습니다. 원인을 어떻게 진단하고 설계를 어떻게 바꾸겠습니까?

Double Free는 같은 Allocation을 두 번 해제할 때 Allocator 내부 데이터가 손상되어 발생합니다. 먼저 AddressSanitizer로 두 번째 delete가 실행되는 Call Stack을 찾습니다. 정상 종료·Timeout·Error 경로가 모두 delete를 독립적으로 호출하는 구조라면 어떤 조합에서도 두 번 실행될 수 있습니다.

설계 해결책은 Session 소유권을 하나의 지점에 집중시키는 것입니다. Owner Container(예: SessionManager의 unique_ptr<Session> 맵)에서 제거하는 순간이 유일한 소멸 시점이 되도록 State Machine을 설계하고, 세 경로는 모두 같은 "정리 요청" 함수를 통해 합류시킵니다. RAII를 사용하면 소유 객체가 Container에서 제거될 때 소멸자가 정확히 한 번 호출됩니다.

### Q2. 레거시 C 라이브러리를 Wrapping한 게임 서버 코드에서 malloc으로 할당한 Packet Buffer에 new로 할당한 Session 객체 주소를 섞어 쓰다가 크래시가 발생했습니다. 어떤 규칙이 깨졌고 어떻게 분리하겠습니까?

malloc/free와 new/delete는 서로 다른 Allocation Family입니다. malloc으로 할당한 포인터를 delete로 해제하거나 new로 할당한 포인터를 free로 해제하면 Undefined Behavior입니다. 근본 원인은 두 Family의 Allocator가 내부적으로 다른 Metadata 구조를 사용하기 때문입니다.

분리 전략은 경계를 명확히 하는 것입니다. C 라이브러리에서 받은 malloc 포인터는 반드시 free로 돌려보내고, C++ 코드에서 생성한 객체는 delete·unique_ptr로 관리합니다. Wrapping 레이어에서 malloc 포인터를 std::unique_ptr<void, decltype(&free)>로 감싸면 RAII로 수명을 관리하면서 Family를 맞출 수 있습니다.

### Q3. 장시간 운영 후 게임 서버 RSS가 계속 증가하는 현상과, 특정 시간대에 간헐적인 크래시가 함께 발생했습니다. 이 두 증상이 같은 원인인지, 아니면 다른 원인인지 어떻게 진단하겠습니까?

RSS 증가와 간헐적 크래시는 서로 다른 오류일 가능성이 높습니다. RSS 증가는 Memory Leak이나 논리적 Retention(불필요 객체가 참조 때문에 해제되지 않음), Allocator Cache·Pool Capacity 유지일 수 있습니다. 간헐적 크래시는 Use-after-free(해제된 객체를 다시 접근), Double Free(같은 Allocation 두 번 해제), Buffer Overflow가 Allocator 메타데이터를 손상시키는 경우에 발생합니다.

진단 순서는 다음과 같습니다. 먼저 AddressSanitizer를 붙여 크래시 재현을 시도합니다. Use-after-free나 Double Free라면 정확한 Call Stack이 나옵니다. RSS 증가는 Heap Profiler로 부하 종료 후에도 Live Object가 계속 누적되는지 확인하고, Type·Call Site별로 Byte 추세를 봅니다. 부하가 끝나면 RSS가 안정되는데 Object 수는 안정되지 않는다면 논리적 Retention을 의심합니다.

### Q4. 코드 리뷰 중 new Enemy[count]로 할당한 배열을 delete enemies(대괄호 없음)로 해제하는 코드를 발견했습니다. 어떤 문제가 생기고 어떻게 수정하겠습니까?

delete[]가 아닌 delete로 배열을 해제하면 Undefined Behavior입니다. 구현에 따라 배열의 첫 번째 원소 소멸자만 호출되거나, 배열 Allocation Metadata를 잘못 읽어 Allocator가 손상될 수 있습니다. 증상이 즉시 나타나지 않고 나중에 다른 Allocation을 할 때 크래시로 폭발하는 경우가 많아 원인 추적이 어렵습니다.

수정 방법은 delete[]로 교체하는 것이지만, 더 근본적인 해결은 배열 new/delete를 직접 쓰지 않는 것입니다. std::vector<Enemy>를 사용하면 원소 수 관리와 소멸이 자동으로 처리되고 짝 불일치 위험이 없습니다. 고정 크기 배열이 필요하다면 std::array, 동적 배열이라면 std::vector가 RAII로 안전합니다.

### Q5. 게임 서버를 12시간 부하 테스트한 뒤 RSS가 1.8 GB에서 3.4 GB로 늘었는데, 재시작하지 않으면 계속 오르는 현상이 있습니다. 영업팀은 Leak이라고 하고 인프라팀은 OS Page Cache라고 합니다. 실제 원인을 어떻게 가려내겠습니까?

RSS 단독으로는 원인을 확정할 수 없습니다. 판단 절차는 다음과 같습니다.

첫째, 부하를 끊고 5분 뒤 RSS가 내려가는지 봅니다. Pool·Allocator Cache는 유지되더라도 Live Object 수가 줄어야 합니다. 내려가지 않으면 실제 누수나 Retention 가능성이 높습니다.

둘째, Heap Profiler(gperftools tcmalloc, jemalloc의 heap_stats, Valgrind Massif)로 Type·Call Site별 Live Byte 추세를 봅니다. 특정 Session·Packet·Event Queue가 부하 비례로 계속 누적되는지 확인합니다.

셋째, /proc/PID/smaps의 Anonymous vs File-backed를 분리합니다. File-backed 증가라면 Page Cache이고 Anonymous 증가라면 Heap 혹은 mmap Allocation입니다.

넷째, Pool In-use 카운터가 부하 종료 후에도 줄지 않는다면 반환 누락입니다. Allocator Fragment는 jemalloc의 stats.retained 혹은 tcmalloc의 tcmalloc.pageheap_unmapped_bytes로 확인합니다.

이 절차를 거쳐 "부하 종료 후에도 특정 Type의 Live Object가 계속 증가한다"는 근거가 나올 때 Leak이라고 판정합니다.

### Q6. 게임 서버의 콘텐츠 Reload 로직에서 새 Graph를 만드는 도중 검증 실패 시 중간에 생성된 노드들이 해제되지 않아 Memory가 누적되는 문제가 발생했습니다. RAII로 어떻게 해결하겠습니까?

현재 구조에서 검증 실패 경로마다 수동으로 delete를 호출해야 하므로, Early Return이나 예외가 발생하면 누락됩니다. RAII로 해결하려면 임시 Graph를 구성하는 노드들을 처음부터 unique_ptr 또는 Container로 소유하게 합니다.

구체적으로는 std::vector<std::unique_ptr<GraphNode>>로 임시 Snapshot을 구성하고, 검증 성공 시에만 현재 Snapshot과 std::swap 또는 std::move로 교체합니다. 검증 실패 시 임시 Snapshot이 Scope를 벗어나면 unique_ptr들의 소멸자가 모든 노드를 자동으로 정리합니다. 이렇게 하면 어떤 실패 경로에서도 누수가 없고, 정상 교체도 원자적으로 이루어집니다.

## 19. 예상 꼬리질문

- 게임 서버 Session 생성 중 DB 연결 예외가 발생했습니다. new Session으로 할당한 Storage는 누가 정리하고, Session이 일부 초기화된 멤버는 어떻게 되나요?
- 게임 서버에서 Base* 컨테이너로 다형 Derived 객체를 관리하다 종료 시 메모리 프로파일러에서 Derived 멤버 해제 누락이 발견됐습니다. 어떤 코드를 먼저 확인하나요?
- Packet Pool에서 고정 크기 Buffer를 미리 할당하고 그 위에 Packet 객체를 직접 생성하려 합니다. Placement New를 쓸 때 소멸과 Storage 반환 책임을 어떻게 설계하나요?
- 게임 서버 아이템 드롭 로직에서 조건에 따라 Pointer가 nullptr일 수 있는 코드에 delete를 호출합니다. 이것이 안전한 이유와 nullptr 가능성을 Type으로 명시하는 방법은 무엇인가요?
- 게임 서버 Packet Pool 운영 중 In-use 카운터는 0인데 RSS가 계속 오릅니다. 어떤 지표를 추가로 봐야 하고 어디를 먼저 의심하나요?
- 비동기 Completion Handler가 실행되기 전 Session이 Timeout으로 종료됐습니다. shared_ptr Capture와 weak_ptr Lock 두 방식 중 이 서버에서 어느 쪽을 선택하겠으며, 그 이유는 무엇인가요?
- AddressSanitizer와 LeakSanitizer가 모두 통과한 코드를 프로덕션에 배포했더니 Memory 관련 크래시가 발생했습니다. 테스트에서 왜 검출되지 않았을지 원인을 두 가지 이상 드세요.

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
