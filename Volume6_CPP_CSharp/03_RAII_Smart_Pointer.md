---
difficulty: 3
reading_time: 20분
interview_frequency: 5
importance: 5
---

# 03. RAII와 Smart Pointer

> 게임 서버·백엔드 개발자를 위한 CS 면접 교재

## 학습 목표
- 정의와 객체 수명 의미를 설명할 수 있다.
- 유사 개념과 비용을 비교할 수 있다.
- 게임 서버의 안전한 코드에 적용할 수 있다.

## 1. 개요
RAII는 자원 획득을 객체 생성과, 해제를 소멸과 결합하고 Smart Pointer는 Pointer 소유권을 객체 수명으로 표현한다.

## 2. 왜 필요한가
정상 반환과 예외 등 모든 제어 흐름에서 Lock, Memory, File, Socket을 자동 정리한다. C++에서는 표현뿐 아니라 누가 소유하고 언제 파괴하는지가 API 의미의 일부다.

## 3. 핵심 동작 원리
```text
scope enter→resource owner construct→use→scope exit→destructor release
```
unique_ptr는 단독 소유와 Move, shared_ptr는 참조 계수 공동 소유, weak_ptr는 비소유 관찰과 Cycle 해제에 사용한다. shared_ptr는 원자 참조 계수 비용과 Cycle 위험이 있다.

컴파일러가 생성하는 동작과 Container의 무효화 규칙을 이해해야 예외와 비동기 경로에서도 안전하다.

### RAII의 본질

RAII(Resource Acquisition Is Initialization)는 자원 획득을 객체 초기화와 묶고, 객체가 Scope를 벗어날 때 Destructor에서 반환하는 C++ 수명 관리 방식이다. 이름에는 초기화가 들어가지만 핵심은 “자원 수명을 객체 수명으로 표현한다”는 점이다.

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

함수가 정상 반환하거나 중간 Return·Exception으로 빠져도 Stack Unwinding 과정에서 완전히 생성된 Local 객체의 Destructor가 역순으로 호출된다. 따라서 각 종료 경로에 `Close`, `Unlock`, `delete`를 반복하지 않아도 된다.

RAII는 Heap Memory에만 적용하지 않는다. Socket, File, Mutex Lock, DB Transaction, GPU Handle처럼 획득과 반환의 짝이 있는 모든 자원에 적용할 수 있다.

### Stack Unwinding과 Destructor

Constructor가 성공한 Member와 Base만 파괴된다. Destructor는 일반적으로 예외를 밖으로 던지지 않아야 한다. 이미 다른 예외를 처리하며 Stack Unwinding 중인데 Destructor가 또 예외를 던지면 `std::terminate`로 이어질 수 있다. 실패 가능한 정리는 명시적인 `Close`·`Commit` API로 결과를 반환하고 Destructor는 안전한 Fallback 정리를 수행하는 식으로 설계한다.

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
void Observe(const Session& session);       // 빌림
void Take(std::unique_ptr<Session> session); // 소유권 이전
std::unique_ptr<Session> Create();           // 새 소유권 반환
```

`get()`은 비소유 Raw Pointer를 반환하지만 소유권을 넘기지 않는다. `release()`는 삭제 없이 소유권을 포기하고 Raw Pointer를 반환하므로 새 Owner가 확실할 때만 사용한다. `reset()`은 기존 객체를 정리하고 새 객체를 소유한다.

### Custom Deleter

`unique_ptr`는 `delete`가 아닌 반환 방식도 Custom Deleter로 표현한다.

```cpp
using FilePtr = std::unique_ptr<FILE, decltype(&std::fclose)>;
FilePtr file(std::fopen(path, "rb"), &std::fclose);
```

Deleter Type은 `unique_ptr` Type과 크기에 영향을 줄 수 있다. Stateless Deleter는 Empty Base Optimization으로 추가 크기가 없을 수 있지만 구현과 Type을 확인한다.

## 5. shared_ptr와 Control Block

`std::shared_ptr<T>`는 여러 Owner가 객체 수명을 공동으로 관리한다. 마지막 Strong Reference가 사라질 때 객체가 파괴된다. 일반적으로 Control Block에 Strong Count, Weak Count, Deleter 등의 정보가 있다.

```cpp
auto session = std::make_shared<Session>(id);
auto copy = session; // Strong Count 증가
```

Reference Count 증감은 Thread-safe하게 Control Block을 보호하지만, 가리키는 `Session` 객체의 Member 접근까지 Thread-safe하게 만들지는 않는다.

`make_shared`는 Control Block과 객체를 한 Allocation에 배치할 수 있어 Allocation 수와 Locality에 유리하다. 그러나 Weak Reference가 오래 남으면 객체는 파괴되어도 결합 Allocation의 Memory가 Control Block 종료까지 유지될 수 있다. Custom Deleter·Allocator나 객체 Memory 조기 반환 요구에서는 별도 생성이 필요할 수 있다.

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

외부 Owner가 모두 사라져도 서로의 Strong Count를 유지한다. 소유 관계의 한쪽, 보통 Parent나 Registry가 소유하고 역방향 Observer는 `weak_ptr`로 둔다. 어떤 방향이 소유인지 Domain으로 결정해야 한다.

## 7. Smart Pointer 선택 기준

| 관계 | 권장 출발점 | 의미 |
|---|---|---|
| 객체 자체 값 | 값 Member·Container | 가장 단순한 소유 |
| 단독 동적 소유 | `unique_ptr` | 한 Owner, Move 이전 |
| 공동 수명 | `shared_ptr` | 마지막 Owner가 파괴 |
| 공유 객체 관찰 | `weak_ptr` | 수명 연장 없이 확인 |
| 짧은 비소유 접근 | `T&`, `T*` | 호출 범위 빌림 |

Smart Pointer는 “Pointer를 더 안전하게 만든 Wrapper”를 넘어 소유권 의미를 Type에 담는다. 모든 함수 인자에 `shared_ptr const&`를 넘기면 함수가 수명을 공유하는지 단순 관찰하는지 모호해진다. 관찰만 하면 `T&`를 받는 편이 의도가 명확하다.

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

## 9. 실무 수명 설계

게임 서버의 Session이 I/O 작업을 예약할 때 `shared_from_this()`로 자신을 Capture하면 Completion까지 살아 있게 할 수 있다. 그러나 Queue가 밀리면 종료된 Session도 작업 수만큼 오래 유지된다. 명시적 Closing State, Cancellation, Outstanding I/O Count와 함께 사용한다.

```text
Registry(unique owner 또는 shared owner)
   ↓
Session -- outstanding I/O --> Completion
   ↓ closing
새 I/O 금지 → 기존 완료·취소 → 최종 Owner 해제
```

World Entity처럼 Tick Thread가 단독 소유하는 객체는 공유 Pointer보다 ID·Generation Handle이 더 적합할 수 있다. `shared_ptr`는 주소 수명은 지키지만 Entity가 논리적으로 삭제되었다는 의미까지 해결하지 않는다.

## 10. 성능과 검증

`unique_ptr`는 보통 Raw Pointer에 가까운 소유 비용을 제공하지만 객체는 여전히 Heap Allocation일 수 있다. `shared_ptr`는 Control Block Allocation, Atomic Count와 간접 접근 비용이 있다. 실제 병목은 Pointer Wrapper보다 개별 Allocation과 Cache Miss일 수 있다.

AddressSanitizer·LeakSanitizer, Static Analyzer를 사용하고 소유 Graph를 Code Review한다. `use_count()`를 동기화 판단에 사용하지 않는다. 관찰 직후 Count가 바뀔 수 있고 소유 설계가 Count 숫자에 의존하면 Race가 생긴다.

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
Session의 명확한 소유자는 unique_ptr로 두고 비동기 Callback의 수명 연장이 정말 필요할 때 shared_ptr를 쓴다. 상호 참조 한쪽은 weak_ptr로 Cycle을 끊는다.

Address Sanitizer, Leak Sanitizer, 정적 분석과 부하 테스트를 사용하고 평균보다 최대 할당·해제 지연을 본다.

## 15. 자주 하는 오해
- Raw Pointer가 소유권을 자동 표현한다고 본다.
- Reference는 절대 Dangling이 되지 않는다고 본다.
- shared_ptr가 모든 수명 문제의 기본 해법이라고 본다.
- Move가 항상 메모리 복사 0이라고 단정한다.
- 가상 함수 비용만 보고 구조 전체 비용을 무시한다.

### 최종 실무 판단 기준

- **요구 확인**: RAII는 자원 획득을 객체 생성과, 해제를 소멸과 결합하고 Smart Pointer는 Pointer 소유권을 객체 수명으로 표현한다. 이 내용을 적용하기 전에 데이터 규모, 호출 빈도와 허용 지연을 수치로 확인한다. 같은 기술도 요청량과 정확성 요구가 달라지면 적합한 선택이 달라질 수 있다.
- **정확성 경계**: 소유권과 수명을 명시한다. 정상 흐름만 설명하지 않고 중복, 역순, 동시 실행과 부분 실패에서 어떤 불변식을 지켜야 하는지 함께 명시한다.
- **비용 비교**: RAII와 값 의미를 우선한다. 평균 복잡도나 처리량 하나만 보지 않고 Memory, CPU, I/O, Lock 대기와 구현 복잡도까지 비교한다.
- **장애 대응**: RAII와 Smart Pointer 관련 구성 요소가 느려지거나 중단됐을 때 Timeout, Retry 상한, Backpressure와 복구 순서를 정한다. Retry가 중복 부작용이나 연쇄 부하를 만들지 검증한다.
- **운영 검증**: RAII와 Smart Pointer에서는 기능 Test와 함께 경계값, Peak 부하와 장애 주입 Test를 수행한다. 처리 시간 p95·p99, 오류율, Queue와 Resource 사용량을 관찰하고 변경 전후 결과를 비교한다.

RAII와 Smart Pointer 답변에서는 이 기준으로 답하면 개념 정의에 그치지 않고 선택 조건, Trade-off와 실무 검증 방법까지 논리적으로 연결할 수 있다.

## 16. 면접 질문
### Q1. 핵심 개념을 설명해 주세요.
RAII는 자원 획득을 객체 생성과, 해제를 소멸과 결합하고 Smart Pointer는 Pointer 소유권을 객체 수명으로 표현한다.
### Q2. 어떤 Trade-off가 있나요?
unique_ptr는 단독 소유와 Move, shared_ptr는 참조 계수 공동 소유, weak_ptr는 비소유 관찰과 Cycle 해제에 사용한다. shared_ptr는 원자 참조 계수 비용과 Cycle 위험이 있다.
### Q3. 게임 서버 적용 사례는 무엇인가요?
Session의 명확한 소유자는 unique_ptr로 두고 비동기 Callback의 수명 연장이 정말 필요할 때 shared_ptr를 쓴다. 상호 참조 한쪽은 weak_ptr로 Cycle을 끊는다.
### Q4. 안전성을 어떻게 검증하나요?
소유권 규칙, Scope 종료, 예외·취소 경로를 확인하고 Sanitizer와 프로파일러를 사용한다.

## 17. 예상 꼬리질문
- 소유권과 수명은 어떻게 다른가요?
- Container 재할당은 참조에 어떤 영향을 주나요?
- 예외가 발생하면 자원은 어떻게 정리되나요?
- 공유 소유의 Cycle을 어떻게 끊나요?
- 값 의미와 다형성을 어떻게 선택하나요?

## 18. 30초 모범답변
> RAII는 자원 수명을 객체 수명에 결합합니다. unique_ptr를 기본 소유권으로 사용하고 shared_ptr는 실제 공동 소유일 때만 선택합니다. Session의 명확한 소유자는 unique_ptr로 두고 비동기 Callback의 수명 연장이 정말 필요할 때 shared_ptr를 쓴다.

## 19. 1~2분 확장답변
> RAII는 자원 수명을 객체 수명에 결합합니다. unique_ptr를 기본 소유권으로 사용하고 shared_ptr는 실제 공동 소유일 때만 선택합니다. C++ 서버에서는 객체 수명과 소유권을 Type과 Scope로 표현하는 것이 핵심입니다. Raw Pointer는 비소유 관찰에 제한하고 RAII와 Container를 우선합니다. 성능은 추측하지 않고 할당, Cache, 간접 호출과 p99를 프로파일링합니다.

## 20. 핵심 요약
- RAII는 자원 획득을 객체 생성과, 해제를 소멸과 결합하고 Smart Pointer는 Pointer 소유권을 객체 수명으로 표현한다.
- 소유권과 수명을 명시한다.
- RAII와 값 의미를 우선한다.
- 무효화와 예외 경로를 확인한다.
- 도구로 메모리 오류를 검증한다.

## 한 줄 정리
> RAII는 자원 수명을 객체 수명에 결합합니다. unique_ptr를 기본 소유권으로 사용하고 shared_ptr는 실제 공동 소유일 때만 선택합니다.
