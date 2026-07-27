---
difficulty: 4
reading_time: 25분
interview_frequency: 5
importance: 5
---

# 09. Object Pool과 Buffer Pool

> 게임 서버·백엔드 개발자를 위한 CS 면접 교재

## 학습 목표

- Object Pool과 Buffer Pool의 목적과 언제 도입해야 하는지 판단할 수 있다.
- Use-after-return·Double Return 위험과 RAII를 이용한 소유권 방어를 설명할 수 있다.
- Buffer Pool에서 Size Class를 나누는 이유와 Shared vs Thread-local Pool의 Trade-off를 설명할 수 있다.
- Pool 고갈 시 정책과 민감 데이터 초기화 필요성을 설명할 수 있다.

## 1. 개요
Pool은 반복 생성·해제되는 객체나 Buffer를 재사용해 할당 비용과 지연 변동을 줄이는 방식이다.

## 2. 왜 필요한가
Packet과 임시 객체의 높은 할당률이 GC Pause, Allocator 경쟁과 메모리 단편화를 만들 수 있다. 사용자 경험을 개선하더라도 서버 권위와 복구 가능성을 훼손하지 않아야 한다.

## 3. 핵심 동작 원리
```text
rent→initialize→use→clear sensitive state→return→reuse
```
Pool은 할당을 줄이지만 Peak 크기 메모리 유지, 오래된 상태, Double Return과 Use-after-return 위험이 있다. 작은·드문 객체에는 복잡도만 늘 수 있다.

Object Pool과 Buffer Pool 관점에서는 Sequence, Timestamp, Session Generation과 상태 Version으로 오래되거나 중복된 Message를 식별한다.
### Pool의 목적과 비용

고빈도 Packet 객체는 Allocator 경쟁, Heap Fragmentation이나 GC 압력을 만들 수 있다. Pool은 반환 객체를 재사용해 Allocation과 지연 변동을 줄인다. 평균 속도보다 Tick 중 갑자기 발생하는 GC Pause를 줄이는 목적이 중요하다.

Pool도 동기화, 초기화, 최대 크기와 Lifetime 관리가 필요하다. 사용량보다 큰 Memory를 오래 잡을 수 있으므로 Profile에서 Allocation이 병목일 때 도입한다.

### 수명 주기와 Reset

```text
Rent → initialize → use → reset → Return
       실패 경로에서도 반드시 Return
```

반환 객체에는 이전 Player ID, Collection, Callback과 민감 데이터가 남을 수 있다. Reset 계약을 명확히 한다. C++에서는 RAII Handle, C#에서는 `try/finally`나 `IDisposable`로 반환 누락을 막는다. 반환 뒤 참조를 보관하면 다른 요청이 재사용한 객체를 수정하는 Use-after-return이 생긴다.

비동기 Callback까지 객체가 필요하면 Lifetime을 연장하거나 안전하게 Copy한다. Pool 객체가 넓은 범위로 Escape하지 않게 한다.

### Buffer 크기 등급

모든 Packet에 최대 Buffer를 주면 낭비가 크다. 256B, 1KB, 4KB 같은 Size Class를 두고 필요한 가장 작은 등급을 빌린다.

```text
700B 요청 → 1KB bucket
3KB 요청  → 4KB bucket
oversize  → 별도 할당 또는 거부
```

Receive Buffer는 읽은 영역과 미처리 영역을 Offset으로 관리한다. 매번 남은 Byte를 앞으로 Copy하는 대신 Ring Buffer나 Segment Chain을 쓸 수 있지만 복잡성이 Copy 비용보다 큰지 측정한다.

### Shared와 Thread-local

전역 Pool은 재사용률이 높지만 Lock과 Cache Line 경쟁이 생긴다. Thread-local Pool은 빠르고 Locality가 좋지만 한 Thread에 유휴 객체가 몰린다. 작은 Local Cache와 Shared Fallback을 조합할 수 있다. 설계의 핵심은 누가 빌리고 누가 반환하는지 명확히 하는 것이다.

### 고갈과 Memory 상한

모두 대여 중일 때 새로 할당할지, 기다릴지, 요청을 거절할지 정한다. 실시간 경로의 무기한 대기는 Tick을 지연시킨다. 필수 Packet에는 제한적 추가 할당, 비핵심 Broadcast에는 Drop을 적용할 수 있다. 부하 후 큰 Buffer를 계속 보유하지 않도록 상한과 Trim 정책을 둔다. 너무 공격적으로 줄이면 다음 Peak에서 재할당 폭풍이 생긴다.

### Zero-copy와 검증

Buffer Slice는 Copy를 줄이지만 원본 반환 시점을 늦춘다. Queue, 비동기 Send와 Log 가운데 마지막 Owner를 정한다. 작은 제어 Packet은 Copy가 더 단순할 수 있다.

Pool Hit·Miss, 신규 할당, 동시 대여, 보유 Byte, Oversize와 반환 누락을 측정한다. Debug에서는 Rent ID와 반환 여부를 추적한다. 민감한 인증 Buffer는 반환 전에 지운다. 비교 Test는 처리량뿐 아니라 GC Pause, Tick p99와 Peak Memory를 본다.

### 실무 설계 검토 체크리스트

- **Rent 계약**: Rent 계약의 입력이 어디서 생성되고 어느 실행 흐름이 상태를 소유하는지 먼저 정한다. 다른 구성 요소는 상태를 직접 고치지 않고 명시된 경계를 통해 요청한다.
- **Return 계약**: Return 계약의 정상 처리 순서를 Diagram으로 확인한다. 중간 단계가 실패했을 때 이미 반영된 상태와 다시 수행해도 되는 작업을 구분한다.
- **Reset**: Reset에 적용할 최대 개수, Byte 또는 시간 한도를 정한다. 한도를 넘으면 대기, 거절, Drop 가운데 업무 의미에 맞는 정책을 사용한다.
- **민감 데이터**: 민감 데이터 관련 Message에는 중복과 역순을 식별할 Sequence나 Version이 필요한지 판단한다. 오래된 작업이 새 Session 상태를 덮지 않게 한다.
- **Double Return**: Double Return가 느려질 때 상위 Queue와 호출자까지 지연이 전파되는 경로를 확인한다. Timeout과 Backpressure가 연쇄 Retry를 만들지 않게 한다.
- **Use-after-return**: Use-after-return의 평균 처리량만으로 용량을 결정하지 않는다. Peak 부하에서 p95·p99 지연, Memory와 Queue 깊이가 허용 범위인지 측정한다.
- **Size Class**: Size Class를 Client가 주장할 수 있다면 Server가 다시 계산하거나 검증할 항목을 정한다. 허용 오차와 반복 위반 처리 기준도 기록한다.
- **Oversize**: Oversize 변경은 이전 Client나 Server와 동시에 존재할 수 있다. Version 협상, 기본값과 단계적 배포로 전후 호환성을 확인한다.
- **Thread-local**: Thread-local 장애를 재현하는 Test를 만든다. Timeout, 연결 종료, 중복 Callback과 Process 재시작 뒤에도 자원과 상태가 한 번만 정리되는지 확인한다.
- **Shared Pool**: Shared Pool 관련 Log에는 Match·Session·Sequence 같은 추적 Key를 남긴다. 민감 정보는 제외하고 원인 판별에 필요한 지표와 함께 조회한다.
- **Pool 고갈**: Pool 고갈 최적화는 실제 Profile 결과를 근거로 적용한다. CPU를 줄이는 대신 Memory, 복사 감소 대신 Lifetime 복잡도가 늘 수 있음을 비교한다.
- **Trim**: Trim의 Owner를 배포 중 교체할 때 새 요청 차단, 진행 작업 Drain과 상태 이전 순서를 정의한다. 구 Version Callback은 식별 후 폐기한다.
- **Zero-copy**: Zero-copy 결과가 영속 데이터나 외부 서비스에 반영되면 성공 응답의 기준을 정한다. 불확실한 결과는 조회와 Reconciliation으로 확정한다.
- **RAII Wrapper**: RAII Wrapper 기능을 독립 Service나 Thread로 분리할지는 확장과 장애 격리 이득으로 판단한다. Network·Queue 이동과 운영 비용도 함께 계산한다.
- **Pool 지표**: Pool 지표 정책은 정상 사용자 경험과 악용 방지를 함께 고려한다. 너무 넓은 허용 범위와 지나치게 엄격한 오탐 사이를 실제 분포로 조정한다.

이 항목은 Object Pool과 Buffer Pool 설계 Review에서 실제 요구와 실패 조건을 빠뜨리지 않기 위한 기준이다. 모든 장치를 일괄 적용하지 않고 측정된 위험과 운영 목표에 필요한 항목만 선택한다.
### 장애 시나리오 연습

Object Pool과 Buffer Pool은 정상 경로만 구현해서는 운영 준비가 끝나지 않는다. 다음 상황을 부하·Network Simulator와 장애 주입 Test로 재현한다.

- **Rent 계약**: Rent 계약 요청이 정상 처리됐지만 응답만 손실된 상황을 가정한다. 호출자가 재시도해도 같은 상태 변경이 두 번 발생하지 않도록 Sequence, Version 또는 Idempotency Key를 둔다.
- **Return 계약**: Return 계약 처리 시간이 평소의 열 배로 증가한 상황을 재현한다. 제한 Queue, Timeout과 Admission Control이 다른 Session과 Tick까지 지연을 퍼뜨리지 않는지 확인한다.
- **Reset**: Reset Owner가 배포나 장애로 사라진 상황을 Test한다. 새 Owner 선택, 진행 중 작업 처리와 구 Callback 폐기 순서가 명확해야 한다.
- **민감 데이터**: 민감 데이터 입력이 최대 크기, 빈 값, 오래된 Timestamp와 잘못된 Enum을 포함하는 경우를 검증한다. 실패한 입력이 부분 상태를 남기거나 Process를 종료시키면 안 된다.
- **Double Return**: Double Return 관련 Message가 중복·역순·지연 도착하는 Network 조건을 주입한다. 최종 상태가 순서 정책과 허용 Window에 맞는지 Replay로 비교한다.
- **Use-after-return**: Use-after-return Capacity가 모두 사용된 Peak 상황에서 대기 시간을 무제한 늘리지 않는다. 업무 중요도에 따른 거절·Drop과 Client 재시도 안내가 함께 동작해야 한다.
- **Size Class**: Size Class 복구 뒤 상태가 맞는지 원본 Event, Snapshot 또는 DB와 대조한다. 자동 복구가 불가능한 차이는 경고와 수동 Reconciliation 대상으로 남긴다.

Object Pool과 Buffer Pool에서는 각 Test는 성공 여부만 기록하지 않는다. 처리 시간 분포, Queue 최대치, Drop·Retry 수와 복구 소요 시간을 남겨 다음 배포의 기준값으로 사용한다.

## 4. 쉬운 예시

아래는 C++ RAII Handle로 Buffer Pool 소유권을 자동으로 관리하는 예시다.

```cpp
class BufferPool {
    static constexpr size_t BUCKET_SIZES[] = {256, 1024, 4096};
    std::stack<uint8_t*> buckets_[3];
    std::mutex mu_[3];

    int BucketIndex(size_t size) {
        for (int i = 0; i < 3; i++)
            if (size <= BUCKET_SIZES[i]) return i;
        return -1;  // Oversize → 별도 할당
    }

public:
    // RAII Handle: 스코프를 벗어나면 자동 반환
    struct Handle {
        uint8_t* ptr = nullptr;
        size_t   size = 0;
        int      bucketIdx = -1;
        BufferPool* pool = nullptr;

        Handle() = default;
        Handle(const Handle&) = delete;
        Handle(Handle&& o) noexcept
            : ptr(o.ptr), size(o.size), bucketIdx(o.bucketIdx), pool(o.pool)
        { o.ptr = nullptr; }

        ~Handle() { if (ptr && pool) pool->Return(*this); }
    };

    Handle Rent(size_t size) {
        int idx = BucketIndex(size);
        Handle h;
        if (idx < 0) {
            h.ptr = new uint8_t[size];   // Oversize: 일반 할당
        } else {
            std::lock_guard lk(mu_[idx]);
            if (!buckets_[idx].empty()) {
                h.ptr = buckets_[idx].top();
                buckets_[idx].pop();
            } else {
                h.ptr = new uint8_t[BUCKET_SIZES[idx]];
            }
        }
        h.size = size;
        h.bucketIdx = idx;
        h.pool = this;
        return h;
    }

    void Return(Handle& h) {
        if (h.bucketIdx >= 0) {
            memset(h.ptr, 0, BUCKET_SIZES[h.bucketIdx]);   // 민감 데이터 초기화
            std::lock_guard lk(mu_[h.bucketIdx]);
            buckets_[h.bucketIdx].push(h.ptr);
        } else {
            delete[] h.ptr;
        }
        h.ptr = nullptr;
    }
};

// 사용 예시
void SendPacket(Session& session, const Payload& payload) {
    auto buf = g_bufPool.Rent(payload.size + 8);  // RAII: 함수 종료 시 자동 반환
    SerializeHeader(buf.ptr, payload);
    session.AsyncSend(buf.ptr, buf.size,
        // 비동기 완료 전까지 buf를 살려야 한다 → std::move로 소유권 이전
        [b = std::move(buf)](bool ok) { /* b는 이 람다가 끝날 때 반환 */ });
}
```

- `memset(0)` 초기화로 이전 Session의 인증 Token 등 민감 데이터 노출을 막는다.
- 비동기 Send 완료 전에 Buffer를 반환하면 다른 Packet이 내용을 덮는다. 람다에 `std::move`로 소유권을 이전한다.

## 5. 비슷한 개념과 비교

| 방식 | Allocation 비용 | Lock | 메모리 효율 | 복잡도 | 적합한 상황 |
|------|---------------|------|-----------|-------|-----------|
| **일반 malloc/new** | 매번 발생 | Allocator 내부 | 높음 (필요 시만 할당) | 낮음 | 드문 할당, 작은 객체 |
| **Shared Pool** | 최초 1회 | Pool Lock 필요 | 중간 (Peak 유지) | 중간 | 다수 Thread 공유 |
| **Thread-local Pool** | 최초 1회 | 불필요 | 낮음 (Thread별 유휴) | 중간 | 단일 Thread 고빈도 |
| **Local + Shared fallback** | 최초 1회 | Shared만 | 중간 | 높음 | 균형 필요 시 |
| **Size-class Pool** | 최초 1회 | Bucket별 Lock | 중간 (Bucket 낭비) | 높음 | 가변 크기 Buffer |

## 6. 장점과 단점

**장점**
- 반복 할당·해제가 없어 Tick 중 GC Pause나 Allocator 경쟁이 줄어든다.
- Size Class로 가장 작은 Bucket을 사용해 메모리 낭비를 줄인다.
- RAII Handle로 반환 누락을 컴파일러가 도와 방지한다.
- Profile로 병목을 확인한 뒤 도입하면 복잡도 대비 명확한 이득이 있다.

**단점**
- Pool은 Peak 크기 메모리를 오래 보유해 사용량보다 큰 Memory를 유지한다.
- Use-after-return, Double Return 버그는 Crash가 즉시 나지 않아 디버깅이 어렵다.
- 작고 드문 객체에 Pool을 도입하면 복잡도만 늘어난다.
- Thread-local Pool은 한 Thread에 객체가 몰리면 다른 Thread에서 Shared Pool을 자주 호출한다.

## 7. 게임 서버·백엔드 실무 예시

Network 수신 Buffer는 256B·1KB·4KB Bucket으로 나눠 Pooling한다. 반환 시 `memset(0)`으로 인증 Token 등 민감 데이터를 초기화한다. 비동기 Send 완료 전까지 Buffer 소유권을 Callback이 보유하도록 `std::move`나 `shared_ptr`로 이전한다.

Pool Hit·Miss·신규 할당 수·동시 대여 수·보유 Byte·Oversize 빈도를 지표로 수집한다. Allocation이 Profile 병목이 아닌 상황에서는 Pool 도입을 보류한다.

## 8. 자주 하는 오해

- **Rent한 객체는 반환 전까지 언제나 사용할 수 있다.** 비동기 경계를 넘길 때 소유권을 명시적으로 이전하지 않으면, Callback 실행 전에 Pool로 반환되어 다른 Packet이 내용을 덮을 수 있다.
- **Pool에서 꺼낸 객체는 초기화 없이 바로 쓸 수 있다.** 이전 사용자의 이동 좌표, 인증 Token이 남아 있을 수 있다. Rent 후 반드시 Reset 또는 초기화한다.
- **Pool을 쓰면 메모리 누수가 자동으로 방지된다.** 반환하지 않으면 Pool이 고갈되어 Rent가 실패하거나 무한 대기가 발생한다. Pool 고갈은 메모리 누수와 유사한 결과를 낸다.
- **Pool에 있는 객체에는 민감 데이터가 없다.** 반환 전에 초기화하지 않으면 이전 Session의 Token이 다음 Session에 노출된다. 특히 인증 Buffer는 반환 시 반드시 지운다.
- **Double Return은 Pool이 자동으로 처리한다.** Double Return은 Pool 내부 Free Stack 상태를 손상시키고 같은 Buffer를 두 사용자에게 주는 치명적 버그가 된다. RAII Handle의 `ptr = nullptr` 패턴으로 방어한다.
- **Pool은 항상 유리하다.** 작고 드문 할당에는 복잡도만 늘고 이득이 없다. Profile에서 Allocation이 실제 병목임을 확인한 뒤 도입한다.
- **Thread-local Pool은 Lock이 없어 항상 빠르다.** 한 Thread에 객체가 몰리면 다른 Thread에서 Pool이 고갈되어 Shared Fallback을 자주 호출하고 Lock Contention이 발생한다.

## 9. 면접 질문

### Q1. Object Pool의 목적과 언제 도입하는 것이 적절한가요?
Packet과 임시 객체의 고빈도 할당이 GC Pause, Allocator 경쟁, Tick 지연 변동을 만들 때 Pool로 재사용해 개선합니다. Allocation이 Profile 병목임을 확인한 뒤 도입합니다. 작고 드문 객체에는 복잡도만 늘고 이득이 없습니다.

### Q2. Use-after-return 위험과 방어 방법은 무엇인가요?
Pool에 반환한 Buffer를 다른 코드가 참조하면, 재사용된 Buffer에 덮어쓰기가 발생합니다. C++에서는 RAII Handle에 `ptr = nullptr`을 설정해 반환 후 접근을 막고, `std::move`로 소유권을 이전해 비동기 완료까지 Buffer를 살립니다.

### Q3. Buffer Pool에서 Size Class를 나누는 이유는 무엇인가요?
모든 Buffer를 최대 크기로 주면 메모리 낭비가 큽니다. 256B·1KB·4KB처럼 Bucket을 나눠 필요한 가장 작은 Bucket을 사용합니다. Oversize 요청만 별도 할당하거나 거부하면 Pool의 메모리 낭비를 줄일 수 있습니다.

### Q4. Shared Pool과 Thread-local Pool의 Trade-off는 무엇인가요?
Shared Pool은 재사용률이 높지만 Lock과 Cache Line 경쟁이 있습니다. Thread-local Pool은 Lock이 없고 Cache Locality가 좋지만 한 Thread에 유휴 객체가 몰립니다. 작은 Thread-local Cache와 Shared Fallback을 조합하면 두 장점을 균형 있게 취할 수 있습니다.

### Q5. Pool이 고갈됐을 때 어떻게 처리하나요?
정책 선택지는 세 가지입니다. 새로 할당(Pool 없이 동작)은 부하 흡수에 유리하지만 Pool 도입 목적이 흐려집니다. 대기는 실시간 경로에서 Tick을 지연시킵니다. 거부는 빠른 응답이지만 클라이언트에 오류를 반환합니다. 필수 Packet은 제한적 추가 할당, 비핵심 Broadcast는 Drop을 적용합니다.

### Q6. 민감 데이터가 포함된 Buffer를 반환할 때 무엇을 해야 하나요?
반환 전에 `memset(0)` 등으로 Buffer 내용을 지워야 합니다. 초기화하지 않으면 이전 Session의 인증 Token이나 좌표 데이터가 다음 Rent에서 노출됩니다. Debug 빌드에서는 반환 Buffer를 특정 패턴(예: 0xDD)으로 채워 Use-after-return을 쉽게 감지합니다.

## 10. 예상 꼬리질문

- RAII Handle이 아닌 환경(C, Lua 등)에서 반환 누락을 어떻게 방지하나요?
- C# `ArrayPool<T>`와 직접 구현 Object Pool의 차이는 무엇인가요?
- Pool 객체가 비동기 Queue를 넘어갈 때 Lifetime을 어떻게 추적하나요?
- Reference-counted Pool Segment와 일반 Pool Handle 중 어떤 것이 적합한 상황은?
- Pool의 Trim(유휴 객체 해제) 시점을 어떻게 결정하나요?
- Pool이 Thread-safe하지 않은 상태에서 Multi-thread 접근이 발생하면 어떤 버그가 나타나나요?
- 게임 서버에서 Bullet이나 Effect 같은 단명 객체에 Pool을 적용하는 게 항상 유리한가요?

## 11. 30초 모범답변

> Object·Buffer Pool은 Tick 중 GC Pause와 Allocator 경쟁을 줄이기 위해 반복 할당 대신 재사용을 씁니다. 핵심 위험은 Use-after-return과 민감 데이터 잔류입니다. RAII Handle로 소유권을 자동 관리하고 반환 시 초기화해야 합니다. Allocation이 Profile 병목임을 확인한 뒤 도입합니다.

## 12. 1~2분 확장답변

> 고빈도 Packet 할당이 GC Pause나 Allocator Lock 경쟁을 일으키면 Tick 지연 변동이 커집니다. Pool은 객체를 재사용해 이 문제를 줄이지만, 도입 전 Profile로 Allocation이 실제 병목임을 확인해야 합니다.
>
> Buffer Pool은 256B·1KB·4KB Bucket으로 나눠 가장 작은 Bucket을 사용합니다. 반환 시 `memset(0)`으로 민감 데이터를 초기화하고, RAII Handle로 반환 누락과 Double Return을 방지합니다. 비동기 Send 완료 전까지 Buffer를 반환하면 Use-after-return이 발생하므로 `std::move`로 소유권을 이전합니다.
>
> Shared Pool은 Lock 경쟁이 있고 Thread-local Pool은 유휴 객체가 몰릴 수 있습니다. Pool 고갈 시 필수 Packet은 추가 할당, 비핵심 Broadcast는 Drop합니다. Pool Hit·Miss·보유 Byte·Oversize 빈도를 지표로 수집합니다.

## 13. 핵심 요약

- Object Pool은 고빈도 할당으로 인한 GC Pause와 Allocator 경쟁을 재사용으로 줄인다.
- Allocation이 Profile 병목임을 확인한 뒤 도입하고, 작고 드문 객체에는 적용하지 않는다.
- Buffer Pool은 Size Class(256B·1KB·4KB)로 나눠 가장 작은 Bucket을 사용한다.
- RAII Handle로 반환 누락과 Double Return을 방지한다.
- 비동기 완료 전에 Buffer를 반환하면 Use-after-return이 발생한다. 소유권을 명시적으로 이전한다.
- 반환 시 `memset(0)`으로 인증 Token 등 민감 데이터를 초기화한다.
- Pool 고갈 시 필수 Packet은 추가 할당, 비핵심 메시지는 Drop한다.
- Pool Hit·Miss·보유 Byte·Oversize 빈도를 지표로 수집해 Pool 효율을 감시한다.

## 한 줄 정리

> Object·Buffer Pool은 고빈도 할당 대신 재사용으로 GC Pause와 Tick 지연 변동을 줄이며, RAII Handle로 소유권을 자동 관리하고 반환 시 민감 데이터를 초기화해야 한다.
