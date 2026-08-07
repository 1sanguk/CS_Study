---
difficulty: 4
reading_time: 25분
interview_frequency: 5
importance: 5
---

# 09. Object Pool과 Buffer Pool


## 학습 목표

- Tick p99 지연이 GC Pause·Allocator 경쟁에서 기인하는지 Profile로 확인하고, Object Pool 도입 여부와 Size Class 기준을 결정할 수 있다.
- 비동기 Send 완료 전에 Buffer가 반환돼 데이터 오염이 발생했을 때, RAII Handle 소유권 이전 누락인지 Double Return인지 진단하고 수정 방향을 결정할 수 있다.
- Pool이 고갈됐을 때 필수 Packet 추가 할당·비핵심 Drop·요청 거부 중 메시지 종류와 실시간 경로 여부를 기준으로 정책을 결정할 수 있다.
- Thread-local Pool에서 객체가 특정 Thread에 몰려 다른 Thread가 Shared Fallback을 반복 호출하는 상황을 진단하고, Local-cache 크기 조정 또는 Pool 분리 방향을 결정할 수 있다.

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

### Q1. 게임 서버 Tick p99가 배포 후 10ms→45ms로 급등했습니다. Object Pool 도입 여부를 어떤 순서로 판단하나요?
먼저 `perf record` 또는 Allocation Profiler(jemalloc jeprof, dotnet-trace 등)로 Hot Allocation 경로를 확인합니다. Packet 할당이 전체 CPU의 15% 이상을 차지하거나 GC Pause가 p99 기여의 30% 이상이면 Pool 도입을 검토합니다. Allocation이 병목이 아니라면 DB 동기 호출이나 Lock Contention을 먼저 해결합니다. Pool 도입 후 Tick p99와 GC Pause 지표를 A/B 비교해 효과를 검증합니다.

### Q2. 비동기 Send 중 Buffer 내용이 오염돼 클라이언트가 잘못된 Packet을 받았습니다. 어떻게 진단하나요?
SendPacket 함수에서 Buffer를 Pool에서 Rent한 뒤 AsyncSend 콜백에 전달하기 전에 반환한 경우를 먼저 의심합니다. RAII Handle이 람다에 복사(copy)가 아닌 이동(move)으로 전달됐는지 확인합니다. Debug 빌드에서 반환 직후 Buffer를 0xDD로 채우면 오염 패턴이 0xDD로 나타나 Use-after-return임을 확인할 수 있습니다. Double Return은 Pool 내부 Free Stack에서 같은 포인터가 두 번 나타나는 Assert로 탐지합니다.

### Q3. 서버에 초당 50만 건 Packet이 유입되는데 Pool Miss가 3%에 달합니다. Pool 크기를 즉시 늘리지 않고 다른 원인을 먼저 진단한다면 어디를 확인하나요?
Pool Miss 발생 시각과 특정 Worker의 처리 지연 시각이 겹치는지 확인합니다. 특정 Size Class(예: 4KB Bucket)에서만 Miss가 집중되면 해당 Bucket 크기를 늘리거나 Oversize 임계값을 조정합니다. Worker별 Concurrent Rent 수를 측정해 한 Worker가 Buffer를 오래 보유하는 경우(비동기 완료 지연)를 확인합니다. 비동기 Send Completion 지연이 원인이면 Pool 크기가 아닌 Completion Thread 수나 Send Queue 상한을 조정합니다.

### Q4. Thread-local Pool에서 특정 Worker Thread의 Pool은 가득 찼는데 다른 Worker의 Pool은 거의 비어 있습니다. 어떻게 처리하나요?
Thread-local Pool이 특정 Thread에 객체를 대여하고 다른 Thread에서 반환하는 패턴(이른바 producer-consumer 불균형)이 원인입니다. Thread-local Cache 상한(예: 64개)을 두고 초과하면 Shared Pool로 반환하도록 설계합니다. Shared Pool은 Lock 경쟁이 생기지만 Load Balance 효과로 특정 Thread 고갈을 방지합니다. Pool Hit/Miss를 Thread ID별로 분리 집계해 불균형 비율이 10% 이상이면 Local Cache 크기를 절반으로 줄이는 것을 검토합니다.

### Q5. 10만 CCU 서버에서 Pool이 고갈됐을 때 로그인·위치 갱신·결제 완료를 서로 다르게 처리하는 설계를 설명하세요.
Pool 고갈 시 결제 완료·아이템 지급처럼 손실 불가한 Packet은 일반 할당으로 폴백해 처리합니다. 신규 로그인 Packet은 Pool Full 시 거부하고 클라이언트에게 429를 반환해 재시도를 유도합니다. 위치 갱신·Broadcast처럼 최신 값만 의미 있는 Packet은 Drop합니다. Pool Miss Rate가 5%를 초과하면 알람을 발생시켜 Warm-up 또는 Pool 크기 조정을 트리거합니다.

### Q6. 게임 서버에서 인증 Buffer를 Pool에 반환했는데 다음 Rent 사용자에게 이전 Session의 Token이 그대로 노출됐습니다. 재발 방지 설계를 설명하세요.
Return() 함수 내에서 반환 전에 `memset(h.ptr, 0, BUCKET_SIZES[idx])`를 실행해 민감 데이터를 초기화합니다. Return 호출 경로가 여러 곳이라면 RAII Handle의 소멸자에서만 Return이 호출되도록 설계해 초기화 누락을 방지합니다. CI에서 인증 Buffer Rent 후 반환하지 않고 다시 Rent했을 때 내용이 0인지 검증하는 Fixture Test를 추가합니다. Debug 빌드에서는 Rent 시 0xCC, Return 시 0xDD 패턴으로 채워 메모리 오염 위치를 즉시 파악할 수 있게 합니다.

## 10. 예상 꼬리질문

- Lua나 C 환경에서 RAII를 사용할 수 없을 때, 반환 누락으로 Pool이 서서히 고갈되는 문제를 어떻게 탐지하고 방지하나요?
- Pool Trim 주기를 5분으로 설정했는데 트래픽 부하 후 메모리가 즉시 줄지 않고 5분간 유지됩니다. Peak 재발 예측이 가능한 경우와 그렇지 않은 경우에 Trim 기준을 어떻게 다르게 잡나요?
- Pool Miss Rate를 Prometheus로 수집하는데, 해당 수치가 1%에서 8%로 증가했을 때 Pool 크기를 늘리기 전에 먼저 확인해야 하는 지표 두 가지는 무엇인가요?
- Buffer를 여러 비동기 Stage를 거쳐 전달할 때 각 Stage 경계에서 소유권 이전이 명확하지 않으면 어떤 버그가 생기나요? Reference Counting과 std::move 중 어떤 방식을 권장하나요?
- C# ArrayPool<T>를 사용하는 코드에서 try/finally 없이 Rent한 Buffer가 예외 경로에서 반환되지 않아 Pool이 고갈됐습니다. 재발 방지를 위해 ArrayPool 래핑 패턴을 어떻게 설계하나요?
- Bullet·Effect처럼 수명이 100~200ms인 단명 객체 100만 개/초가 생성되는 경우, Pool과 Arena Allocator 중 어떤 기준으로 선택하나요?
- Pool 객체에 이전 Session의 오래된 Callback이 남아 있어 반환 후 재사용된 객체에서 Callback이 실행됐습니다. Reset 계약에 Callback 목록 초기화를 포함하는 것만으로 충분한가요?

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
