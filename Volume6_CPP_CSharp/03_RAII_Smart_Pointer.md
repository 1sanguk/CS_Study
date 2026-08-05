---
difficulty: 3
reading_time: 25분
interview_frequency: 5
importance: 5
---

# 03. RAII와 Smart Pointer

> 게임 서버·백엔드 개발자를 위한 CS 면접 교재

## 학습 목표

- 함수에 복수의 종료 경로(Early Return, 예외)가 있을 때, RAII 패턴이 Manual cleanup보다 유리한지 판단할 수 있다.
- 공동 소유가 필요한 비동기 I/O 수명 설계에서 `unique_ptr`, `shared_ptr`, `weak_ptr` 중 어느 것을 어디에 배치할지 결정할 수 있다.
- Party–Player처럼 양방향 참조가 생기는 설계에서 Cycle 누수 위험을 판단하고 `weak_ptr`로 해소할 수 있다.
- `shared_ptr`의 Reference Count가 Thread-safe함에도 객체 접근에 별도 동기화가 필요한 조건을 판단할 수 있다.

## 1. 개요

RAII(Resource Acquisition Is Initialization)는 자원 획득을 객체 초기화와 묶고, 객체가 Scope를 벗어날 때 Destructor에서 자원을 반환하는 C++ 수명 관리 패턴이다. 이름에는 초기화가 들어가지만 핵심은 "자원 수명을 객체 수명으로 표현한다"는 점이다.

Smart Pointer는 RAII를 동적 Memory와 Pointer 소유권에 적용한 표준 도구다. `unique_ptr`는 단독 소유, `shared_ptr`는 참조 계수 기반 공동 소유, `weak_ptr`는 수명 연장 없는 관찰에 사용한다.

```text
자원 획득 → 객체 생성
   ↓
정상 Return · Early Return · Exception
   ↓
객체 소멸 → 자원 해제 (자동)
```

## 2. 왜 필요한가

수동 `new/delete`와 직접 자원 관리는 함수의 모든 종료 경로에서 정리를 반복해야 한다. 조건문, Early Return, 예외, 비동기 Callback이 섞이면 짝이 깨지기 쉽다.

```cpp
void Process()
{
    Buffer* buffer = new Buffer();
    if (!Read(*buffer)) {
        delete buffer;    // 잊기 쉬운 경로
        return;
    }
    if (!Send(*buffer)) {
        delete buffer;    // 또 하나
        return;
    }
    delete buffer;
}
```

RAII를 사용하면 어느 경로로 함수를 빠져나가도 Destructor가 자동으로 호출된다.

```cpp
void Process()
{
    auto buffer = std::make_unique<Buffer>();
    if (!Read(*buffer)) return;    // 자동 정리
    if (!Send(*buffer)) return;    // 자동 정리
}
```

RAII는 Heap Memory에만 적용하지 않는다. Socket, File Descriptor, Mutex Lock, DB Transaction, GPU Handle처럼 획득과 반환의 짝이 있는 모든 자원에 적용한다.

## 3. RAII의 핵심 동작 원리

```text
Scope 진입 → 자원 소유 객체 생성 → 자원 사용
   ↓ 어떤 경로로 Scope 종료하더라도
완전히 생성된 Local 객체의 Destructor 역순 호출
   ↓
자원 해제
```

```cpp
class Socket
{
public:
    explicit Socket(NativeHandle handle) : handle_(handle) {}
    ~Socket() { Close(handle_); }

    Socket(const Socket&) = delete;
    Socket& operator=(const Socket&) = delete;

private:
    NativeHandle handle_;
};
```

함수가 정상 반환하거나 중간 Return·Exception으로 Stack Unwinding이 일어나도 완전히 생성된 Local 객체의 Destructor가 역순으로 호출된다. 각 종료 경로마다 `Close`, `Unlock`, `delete`를 반복하지 않아도 된다.

### Stack Unwinding과 Destructor 주의사항

Constructor가 성공한 Member와 Base만 파괴된다. Destructor는 일반적으로 예외를 밖으로 던지지 않아야 한다. 이미 다른 예외를 처리하며 Stack Unwinding 중인데 Destructor가 또 예외를 던지면 `std::terminate`로 이어질 수 있다. 실패 가능한 정리는 명시적인 `Close`·`Commit` API로 결과를 반환하고, Destructor는 안전한 Fallback 정리를 수행하는 식으로 설계한다.

## 4. unique_ptr

`std::unique_ptr<T>`는 객체 하나의 독점 소유권을 표현한다. Copy할 수 없고 Move로 소유권을 이전한다.

```cpp
auto session = std::make_unique<Session>(id);
StartSession(std::move(session));
// session은 보통 nullptr, 새 Owner가 소유
```

`make_unique`는 객체와 소유 Pointer 생성 과정을 한 표현식으로 묶고 코드가 간결하다. `unique_ptr` 자체가 Scope를 벗어나면 보유 객체를 삭제한다.

함수 Signature로 소유권을 표현할 수 있다.

```cpp
void Observe(const Session& session);        // 빌림, 수명 연장 없음
void Take(std::unique_ptr<Session> session); // 소유권 이전
std::unique_ptr<Session> Create();           // 새 소유권 반환
```

- `get()`: 비소유 Raw Pointer 반환, 소유권 이전 없음
- `release()`: 삭제 없이 소유권 포기, Raw Pointer 반환. 새 Owner가 확실할 때만 사용
- `reset()`: 기존 객체 정리 후 새 객체 소유

### Custom Deleter

`unique_ptr`는 `delete`가 아닌 반환 방식도 Custom Deleter로 표현한다.

```cpp
using FilePtr = std::unique_ptr<FILE, decltype(&std::fclose)>;
FilePtr file(std::fopen(path, "rb"), &std::fclose);
```

Stateless Deleter는 Empty Base Optimization으로 추가 크기가 없을 수 있지만 Deleter Type은 `unique_ptr` Type과 크기에 영향을 줄 수 있다.

## 5. shared_ptr와 Control Block

`std::shared_ptr<T>`는 여러 Owner가 객체 수명을 공동으로 관리한다. 마지막 Strong Reference가 사라질 때 객체가 파괴된다. 일반적으로 Control Block에 Strong Count, Weak Count, Deleter 등의 정보가 있다.

```cpp
auto session = std::make_shared<Session>(id);
auto copy = session; // Strong Count 증가
```

Reference Count 증감은 Thread-safe하게 Control Block을 보호하지만, 가리키는 `Session` 객체의 Member 접근까지 Thread-safe하게 만들지는 않는다.

`make_shared`는 Control Block과 객체를 한 Allocation에 배치할 수 있어 Allocation 수와 Locality에 유리하다. 그러나 Weak Reference가 오래 남으면 객체는 파괴되어도 결합 Allocation의 Memory가 Control Block 종료까지 유지될 수 있다.

`shared_ptr` Copy는 Atomic Reference Count 조작과 Cache Line 경합을 만들 수 있다. 단순 편의를 위해 모든 객체에 사용하지 않고 실제 공유 수명일 때 선택한다.

## 6. weak_ptr와 Cycle

`std::weak_ptr<T>`는 객체를 관찰하지만 Strong Count를 늘리지 않는다. 사용하려면 `lock()`으로 일시적인 `shared_ptr`를 얻는다.

```cpp
if (auto session = weakSession.lock())
    session->Send(packet);
```

이미 객체가 파괴되었다면 빈 `shared_ptr`를 반환한다. `expired()` 확인 후 별도로 사용하면 두 호출 사이에 객체가 사라질 수 있으므로 `lock()` 결과를 사용한다.

양방향 Strong Reference는 Cycle을 만든다.

```text
Player(shared) ──> Party(shared)
   ↑                  │
   └──── shared ──────┘
```

외부 Owner가 모두 사라져도 서로의 Strong Count를 유지해 누수가 된다. 소유 관계의 한쪽, 보통 Parent나 Registry가 소유하고 역방향 Observer는 `weak_ptr`로 둔다. 어떤 방향이 소유인지는 Domain으로 결정해야 한다.

## 7. Smart Pointer 선택 기준

| 관계 | 권장 출발점 | 의미 |
|---|---|---|
| 객체 자체 값 | 값 Member·Container | 가장 단순한 소유 |
| 단독 동적 소유 | `unique_ptr` | 한 Owner, Move 이전 |
| 공동 수명 | `shared_ptr` | 마지막 Owner가 파괴 |
| 공유 객체 관찰 | `weak_ptr` | 수명 연장 없이 확인 |
| 짧은 비소유 접근 | `T&`, `T*` | 호출 범위 빌림 |

Smart Pointer는 "Pointer를 더 안전하게 만든 Wrapper"를 넘어 소유권 의미를 Type에 담는다. 모든 함수 인자에 `shared_ptr const&`를 넘기면 함수가 수명을 공유하는지 단순 관찰하는지 모호해진다. 관찰만 하면 `T&`를 받는 편이 의도가 명확하다.

## 8. Rule of Zero와 소유 객체

Member를 값 Type과 RAII Wrapper로 구성하면 사용자 정의 Destructor, Copy·Move를 작성하지 않아도 Compiler가 올바른 동작을 조합한다. 이를 Rule of Zero라고 한다.

```cpp
class PlayerSession
{
    Socket socket_;
    std::vector<std::byte> buffer_;
    std::unique_ptr<State> state_;
};
```

직접 Raw Handle과 `delete`를 가진 Class보다 예외 안전성과 유지보수가 좋다. Copy를 허용할지 여부는 Member Type에서 자연스럽게 드러난다.

## 9. 쉬운 예시: 네트워크 Buffer 전달

네트워크 Buffer를 함수에 넘길 때 읽기만 하는지, 복사하는지, 소유권을 넘기는지를 Signature로 표현한다.

```cpp
// 읽기만 함, 소유권 변경 없음
void Inspect(const Buffer& buf);

// 파싱 후 결과를 buf에 씀, 소유권 유지
bool Decode(Buffer& buf);

// 소유권을 Queue로 이전, 호출 후 sender는 Buffer를 사용하지 않음
void Enqueue(std::unique_ptr<Buffer> buf);

// 비동기 전송, 전송 완료까지 Buffer 수명 연장
void AsyncSend(std::shared_ptr<Buffer> buf);
```

모호한 Raw Pointer만 전달하면 호출자가 수명과 소유권을 추측하게 된다. Signature 하나가 문서를 대신한다.

## 10. 비슷한 개념 비교

| 관점 | 단독 소유(`unique_ptr`) | 공유 소유(`shared_ptr`) | 비소유(`T&`, `T*`) |
|---|---|---|---|
| 목적 | 명확한 소유권·이전 | 공동 수명 | 빌림·관찰 |
| 비용 | Raw Pointer에 근접 | Control Block·Atomic Count | 없음 |
| 위험 | Move 후 사용 | Cycle·숨은 수명 연장 | Dangling |
| Cycle | 없음 | `weak_ptr`로 해결 | 해당 없음 |

`shared_ptr`를 기본으로 남용하면 소유권 그래프가 모호해지고 Cycle 누수와 예상치 못한 수명 연장이 생긴다. `unique_ptr` 또는 값 소유가 부족할 때 `shared_ptr`를 추가하는 방향이 낫다.

## 11. 장점과 단점

### 장점

- RAII는 정상·예외·Early Return 모든 경로에서 자원을 자동 정리한다.
- `unique_ptr`는 소유권을 Type에 명확히 표현하며 Raw Pointer에 근접한 성능을 제공한다.
- `shared_ptr`는 여러 소유자가 필요한 비동기 수명 설계를 안전하게 표현한다.
- Rule of Zero로 Compiler가 올바른 Copy·Move·Destroy를 자동 생성한다.

### 단점

- `shared_ptr`의 Atomic Reference Count는 고빈도 복사 시 Cache Line 경합을 만들 수 있다.
- `make_shared` 결합 Allocation은 Weak Reference가 남은 동안 객체 Memory를 반환하지 못한다.
- 잘못된 `weak_ptr` 사용(`expired()`·`lock()` 분리)은 Race를 만들 수 있다.
- 순환 참조는 `weak_ptr`로 수동 설계해야 하며 도구가 자동으로 탐지하지 않을 수 있다.

## 12. 실무 수명 설계

게임 서버의 Session이 I/O 작업을 예약할 때 `shared_from_this()`로 자신을 Capture하면 Completion까지 살아 있게 할 수 있다. 그러나 Queue가 밀리면 종료된 Session도 작업 수만큼 오래 유지된다.

```text
Registry(unique owner)
   ↓
Session -- outstanding I/O --> Completion
   ↓ closing 요청
새 I/O 금지 → 기존 완료·취소 → outstanding I/O Count = 0 → 최종 해제
```

명시적 Closing State와 Outstanding I/O Count를 조합해 수명을 통제한다.

World Entity처럼 Tick Thread가 단독 소유하는 객체는 `shared_ptr`보다 ID·Generation Handle이 더 적합할 수 있다. `shared_ptr`는 주소 수명은 지키지만 Entity가 논리적으로 삭제되었다는 의미까지 해결하지 않는다.

## 13. 게임 서버·백엔드 실무 예시

### Session 소유권

Match Server가 Session을 `unique_ptr`로 단독 소유한다. 비동기 I/O Callback은 `shared_from_this()`로 Session 수명을 Completion까지 연장하되, Closing 이후 새 작업이 시작되지 않도록 State를 확인한다.

```cpp
void Session::BeginReceive()
{
    if (state_ == State::Closing) return;

    io_.AsyncRead(buffer_,
        [self = shared_from_this()](std::error_code ec, size_t bytes)
        {
            if (ec) { self->Close(); return; }
            self->OnReceive(bytes);
            self->BeginReceive();
        });
}
```

### Party·Player 상호 참조

Party가 Player를 `shared_ptr`로 소유하고 Player가 Party를 역참조하면 Cycle이 생긴다. Player의 역방향 참조는 `weak_ptr`로 둔다.

```cpp
class Party
{
    std::vector<std::shared_ptr<Player>> members_;
};

class Player
{
    std::weak_ptr<Party> party_; // 소유하지 않음
};
```

### 콘텐츠 Snapshot 교체

새 콘텐츠 Graph를 `unique_ptr` Container로 구성하다 검증이 실패하면 자동 정리된다. 검증 성공 시에만 현재 Snapshot과 Atomic Swap한다.

```cpp
auto next = std::make_unique<ContentGraph>();
if (!next->Validate()) return false;  // 자동 해제
current_ = std::move(next);
```

## 14. 성능과 검증

`unique_ptr`는 보통 Raw Pointer에 가까운 소유 비용을 제공하지만 객체는 여전히 Heap Allocation일 수 있다. `shared_ptr`는 Control Block Allocation, Atomic Count와 간접 접근 비용이 있다. 실제 병목은 Pointer Wrapper보다 개별 Allocation과 Cache Miss일 수 있다.

- AddressSanitizer·LeakSanitizer: Use-after-free, 누수 탐지
- Static Analyzer: 소유 경로 의심 탐지
- Heap Profiler: Type·Call Stack별 Live Byte 추세
- `use_count()`를 동기화 판단에 사용하지 않는다. 관찰 직후 Count가 바뀔 수 있다.

## 15. 자주 하는 오해

- **`enable_shared_from_this`를 상속하지 않아도 `this`로 `shared_ptr`를 만들 수 있다**: `shared_ptr(this)`를 직접 생성하면 기존 Control Block과 무관한 별도 Count가 생겨 Double Free가 발생한다. `enable_shared_from_this`를 상속하고 `shared_from_this()`를 사용해야 한다.
- **`unique_ptr`를 `release()`한 뒤 Raw Pointer로 써도 여전히 RAII 보호를 받는다**: `release()`는 소유권을 포기하고 RAII 보호를 끊는다. 이후 Raw Pointer의 정리는 호출자가 책임진다.
- **`shared_ptr`가 모든 수명 문제의 기본 해법이다**: Cycle과 숨은 수명 연장이 생긴다. `unique_ptr`나 값 소유를 먼저 고려한다.
- **Move가 항상 Memory 복사 0이다**: Move는 소유권 이전을 뜻하며 구현에 따라 실제 복사가 있을 수 있다. 단, 표준 Container·Smart Pointer의 Move는 Pointer 교체 수준이다.
- **`shared_ptr` Reference Count는 객체 접근도 Thread-safe하게 만든다**: Count 증감만 보호하며 객체 Member 접근은 별도 동기화가 필요하다.
- **`weak_ptr::expired()` 확인 후 `get()`을 호출해도 안전하다**: 두 호출 사이에 객체가 사라질 수 있다. `lock()`의 결과를 사용해야 한다.
- **RAII는 Heap Memory에만 적용된다**: Socket·File·Mutex·DB Transaction 등 모든 획득·반환 쌍이 있는 자원에 적용한다.

## 16. 면접 질문

### Q1. 게임 서버에서 Socket을 열었다가 인증 실패로 Early Return해야 하는 함수가 있습니다. Raw Pointer와 RAII Wrapper 중 어느 쪽을 선택하고, 그 이유는 무엇인가요?

RAII Wrapper를 선택합니다. Raw Pointer는 모든 종료 경로마다 Close를 반복해야 하고, 조건문이 늘어날수록 빠뜨리기 쉽습니다. RAII Wrapper는 Scope를 벗어나는 어떤 경로에서도 Destructor가 자동으로 Socket을 닫아줍니다. 인증 성공 후 소유권을 이전해야 한다면 unique_ptr를 사용해 이전 여부를 Type으로 표현합니다.

### Q2. Match Server에서 게임 Session을 생성할 때 `unique_ptr`와 `shared_ptr` 중 어느 것으로 시작하겠습니까? 비동기 I/O Callback이 추가된다면 설계가 어떻게 달라지나요?

우선 unique_ptr로 시작합니다. Registry가 Session을 단독 소유하면 소유권 그래프가 단순하고 의도가 명확합니다. 비동기 I/O Callback이 추가되면 Callback 완료 전에 Session이 해제될 수 있으므로, Session이 enable_shared_from_this를 상속하게 하고 Callback 등록 시 shared_from_this()로 수명을 Completion까지 연장합니다. 단, Closing 이후 새 I/O 시작을 막는 State 확인이 함께 필요합니다.

### Q3. Party와 Player가 서로를 `shared_ptr`로 참조하는 구조를 작성했더니 Party를 Registry에서 제거해도 메모리가 해제되지 않았습니다. 원인은 무엇이고 어떻게 수정하나요?

Party와 Player가 서로 Strong Reference를 보유하면 Cycle이 생겨 외부 Owner가 사라져도 서로의 Count를 유지합니다. Domain 관점에서 소유 방향을 결정합니다. Party가 Player를 shared_ptr로 소유하고, Player가 Party를 역참조할 때는 weak_ptr로 둡니다. Party 탐색이 필요하면 lock()으로 일시적 shared_ptr를 얻고 유효성을 확인합니다.

### Q4. 48시간 연속 운영 테스트에서 게임 서버 RSS가 세션 수에 비례하지 않고 선형으로 증가했습니다. Cycle Leak이 원인인지 확인하려면 어떤 지표를 보고, 코드에서 어디를 먼저 살펴보나요?

먼저 LeakSanitizer나 Heap Profiler로 Type별 Live Byte 추세를 확인합니다. Session·Party·Player처럼 순환 참조가 의심되는 Type의 Count가 세션 종료 후에도 줄지 않으면 Cycle을 의심합니다. 코드에서는 shared_ptr Member를 양방향으로 갖는 클래스를 우선 점검합니다. 해소는 소유 방향을 결정하고 역방향 참조를 weak_ptr로 교체합니다.

### Q5. 클라이언트가 접속을 끊었는데 비동기 I/O Callback이 완료되기 전에 Session이 파괴되어 서버가 Crash했습니다. 어디서 수명 관리가 잘못된 것이고, 어떻게 재설계하나요?

비동기 Callback에서 Session을 Raw Pointer나 해제된 `unique_ptr`로 참조한 것이 원인입니다. Callback 등록 시점에 Session이 살아있어도 Completion 전에 Registry가 Session을 파괴하면 Dangling 접근이 됩니다. 재설계는 Session이 `enable_shared_from_this`를 상속하게 하고, Callback 등록 시 `shared_from_this()`로 수명을 Completion까지 연장합니다. 단, 이것만으로는 Closing 이후에도 Callback이 Session에 새 작업을 추가할 수 있으므로, Closing State를 확인해 새 I/O 시작을 막고 Outstanding I/O Count가 0이 된 시점에 Registry에서 제거해 파괴합니다.

### Q6. 게임 서버의 DB Transaction Wrapper를 RAII로 설계할 때, Destructor에서 Commit이 실패한 경우를 어떻게 처리해야 할까요?

Destructor에서 예외를 던지지 않는 것을 원칙으로 합니다. Stack Unwinding 중 Destructor가 예외를 던지면 std::terminate가 호출됩니다. Commit 성공 여부가 중요한 경우, 명시적 Commit() 메서드로 결과를 반환하고 호출자가 성공 여부를 처리합니다. Destructor는 Commit이 호출되지 않았거나 실패했을 때 Rollback을 시도하고, 실패해도 예외 없이 종료합니다.

## 17. 예상 꼬리질문

- 비동기 Completion에서 `shared_from_this()`로 수명을 연장한 Session이 Closing 이후에도 계속 살아있다면, 어떤 조건을 먼저 확인하나요?
- `weak_ptr`를 오래 보유한 Observer가 많을 때 `make_shared`와 `new + shared_ptr` 방식 중 메모리 관점에서 어느 쪽이 더 나은가요?
- Container 재할당은 RAII Wrapper에 어떤 영향을 주나요?
- `enable_shared_from_this`를 상속하지 않은 클래스에서 `this`로 `shared_ptr`를 두 번 만들면 어떤 문제가 생기나요?
- Rule of Zero를 따를 수 없어 Custom Destructor를 직접 작성할 때, Rule of Five 요구사항 중 가장 자주 빠뜨리는 항목과 그 버그는 무엇인가요?
- `shared_ptr`의 Reference Count는 왜 Thread-safe인데 객체 접근은 아닌가요?
- 게임 서버 Memory Pool에서 `unique_ptr<Packet, PoolDeleter>`를 사용하다 크기가 예상보다 2배로 늘어났습니다. Stateful Deleter가 Empty Base Optimization을 받지 못하는 조건은 무엇인가요?

## 18. 30초 모범답변

> RAII는 자원 수명을 객체 수명에 결합해 정상·예외·Early Return 모든 경로에서 자동 정리합니다. `unique_ptr`는 단독 소유를 표현하며 Raw Pointer에 근접한 비용이고, `shared_ptr`는 Atomic Count로 공동 소유를 관리하지만 Cycle과 숨은 수명 연장 위험이 있습니다. `weak_ptr`로 Cycle을 끊습니다. 단독 소유가 가능하면 `unique_ptr`를 기본으로 사용합니다.

## 19. 1~2분 확장답변

> RAII는 자원을 소유한 객체가 Scope를 벗어날 때 Destructor에서 자동으로 해제하는 패턴입니다. Socket, Lock, File, Memory 등 획득과 반환 쌍이 있는 모든 자원에 적용합니다. Destructor는 예외를 던지지 않도록 설계하고 실패 가능한 정리는 명시적 API로 분리합니다.
>
> Smart Pointer는 Pointer 소유권에 RAII를 적용합니다. `unique_ptr`는 단독 소유와 Move 이전을 표현하며 Raw Pointer에 가까운 성능입니다. `shared_ptr`는 Control Block에 Atomic Reference Count를 유지해 여러 Owner가 수명을 공유하지만, Cycle 참조는 Count가 0이 되지 않아 누수가 됩니다. 소유 한쪽을 `weak_ptr`로 바꾸고 사용 전 `lock()`으로 유효성을 확인합니다. 게임 서버에서는 Session을 `unique_ptr`로 단독 소유하고 비동기 Callback에만 `shared_from_this()`로 수명을 연장합니다. Closing 이후 새 I/O를 막고 Outstanding I/O 완료 후 해제하는 명시적 State Machine이 필요합니다.

## 20. 핵심 요약

- RAII는 자원 수명을 객체 수명과 결합해 모든 종료 경로에서 자동 정리한다.
- `unique_ptr`는 단독 소유, Move 이전, Raw Pointer에 근접한 비용이다.
- `shared_ptr`는 Atomic Count 공동 소유이며 Cycle·숨은 수명 연장 위험이 있다.
- `weak_ptr`는 Strong Count를 늘리지 않고 Cycle을 끊으며 `lock()`으로 사용한다.
- 단독 소유가 가능하면 `unique_ptr`를 기본으로 선택한다.
- Rule of Zero로 Member를 값·RAII Wrapper로 구성하면 Compiler가 올바른 Copy·Move·Destroy를 생성한다.
- RAII는 Heap Memory뿐 아니라 Socket·File·Lock 등 모든 자원에 적용한다.
- Destructor는 예외를 던지지 않아야 하며 실패 정리는 명시적 API로 분리한다.

## 한 줄 정리

> RAII는 자원 수명을 객체 수명에 결합하고, `unique_ptr`를 기본 소유권으로 사용하며 실제 공동 소유가 필요할 때만 `shared_ptr`를 선택한다.
