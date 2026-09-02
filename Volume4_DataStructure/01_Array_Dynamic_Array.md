---
difficulty: 3
reading_time: 20분
interview_frequency: 4
importance: 4
---

# 01. Array와 Dynamic Array


## 학습 목표

- 고정 배열과 동적 배열의 연속 메모리 구조, Size·Capacity 분리, O(1) 인덱스 접근 원리를 설명할 수 있다.
- 재할당의 분할 상환 O(1) 근거와 Capacity 기하급수 성장이 실시간 게임 틱 p99에 미치는 영향을 설명할 수 있다.
- 참조 무효화가 발생하는 조건과 Handle·Generation 기반 안전한 참조 유지 방법을 설명할 수 있다.
- 게임 서버 Entity 시스템에서 Swap-and-pop 삭제, Handle→Index Map 갱신, Reserve 전략을 선택할 수 있다.

## 1. 개요

배열은 같은 타입 원소를 연속 메모리에 저장하고 Dynamic Array는 용량이 부족할 때 더 큰 배열로 재할당하는 구조다.

고정 배열(Array)은 생성할 때 길이가 정해지고 각 원소가 연속된 위치에 놓인다. 동적 배열(Dynamic Array)은 내부적으로 연속 배열을 사용하되 현재 원소 수 `size`와 확보한 공간 `capacity`를 별도로 관리한다. 공간이 부족하면 더 큰 연속 영역을 할당하고 기존 원소를 복사·이동한다.

C++의 `std::vector<T>`, C#의 `List<T>`, Java의 `ArrayList<T>`가 대표적인 동적 배열이다. 이름과 성장 배수, 메모리·참조 무효화 세부는 구현마다 다르지만 연속 저장과 재할당이라는 핵심은 같다.

## 2. 왜 필요한가
인덱스로 O(1) 접근하고 Cache 지역성을 활용하면서 원소 수 변화도 지원한다. 자료구조 선택은 Big-O뿐 아니라 데이터 크기, 접근 패턴, 메모리 배치와 갱신 빈도에서 시작한다.

원소 크기를 알면 시작 주소에 `index × 원소 크기`를 더해 원하는 위치를 바로 계산할 수 있다. 앞 원소부터 따라갈 필요가 없어 임의 접근이 O(1)이다. 연속 배치는 CPU(Central Processing Unit)가 캐시 라인 단위로 이웃 원소를 미리 가져오기 쉬워 전체 순회에도 유리하다.

고정 배열은 최대 크기를 알 때 단순하고 예측 가능하지만 원소 수가 변하면 공간을 과도하게 잡거나 부족할 수 있다. 동적 배열은 필요한 만큼 논리 크기를 늘리면서 매 삽입마다 재할당하지 않도록 여유 Capacity를 둔다.

## 3. 핵심 동작 원리
```text
[capacity 4: A B C _]→append D→full→allocate 8→copy/move→append E
```
고정 배열은 크기가 정해지고 Dynamic Array는 size와 capacity를 구분한다. 끝 삽입은 평균 O(1)이지만 재할당 순간 O(n), 중간 삽입·삭제는 O(n)이다.

평균·최악 복잡도와 함께 할당, Cache 지역성, 순회 비용, 참조 안정성을 봐야 한다.

### 주소 계산과 O(1) 접근

```text
base address = 1000, element size = 4 bytes

index 0 → 1000
index 1 → 1004
index 2 → 1008
index i → base + i × 4
```

인덱스 계산 자체는 입력 크기와 무관해 O(1)이다. 그러나 O(1)이 항상 CPU 한 명령이나 같은 실제 지연을 뜻하지 않는다. 인덱스가 Cache에 없는 멀리 떨어진 Page라면 Cache Miss와 Page Fault가 발생할 수 있다. 범위를 벗어난 인덱스 검사는 언어와 API에 따라 제공 여부가 다르다.

### Size와 Capacity

```text
size = 3, capacity = 5
[ A ][ B ][ C ][ _ ][ _ ]
 0    1    2
```

`size`는 생성되어 유효한 원소 수이고 `capacity`는 재할당 없이 담을 수 있는 원소 수다. Capacity 안에서 끝에 추가하면 새 원소를 다음 위치에 생성하고 Size만 늘린다. 여유 공간은 메모리를 사용하지만 삽입마다 전체 복사를 피한다.

### 성장과 재할당

Capacity가 가득 차면 보통 현재보다 일정 비율 큰 배열을 잡는다. 정확히 두 배인지 1.5배인지는 구현 세부다.

```text
Old [A B C D] capacity 4
          │ allocate larger block
          v
New [A B C D _ _ _ _] capacity 8
     copy/move all elements
     destroy old elements and release old block
```

한 번의 재할당은 N개 원소를 옮겨 O(N)이다. 그러나 Capacity를 기하급수적으로 늘리면 여러 번의 `push_back` 전체에서 원소 하나가 옮겨지는 횟수가 제한된다. 그래서 끝 삽입의 분할 상환(Amortized) 시간은 O(1)로 설명한다.

### 분할 상환 분석

Capacity가 1, 2, 4, 8로 두 배씩 증가한다고 가정하고 8개를 넣으면 재할당 복사 수는 대략 `1 + 2 + 4 = 7`이다. 새 원소 8개 생성과 합쳐도 전체 작업은 N에 비례한다. N번 삽입의 총 O(N)을 한 삽입당 평균 내면 분할 상환 O(1)이다.

이는 확률적 평균과 다르다. 입력 분포를 가정한 평균이 아니라 비싼 연산 비용을 일련의 연산에 나눠 계산한 보장이다. 특정 한 번의 삽입은 여전히 O(N)이고 게임 틱의 p99에 나타날 수 있다.

### 중간 삽입과 삭제

```text
Insert X at index 1
[A B C D _]
   └────────> B,C,D를 오른쪽 이동
[A X B C D]

Erase index 1
[A X B C D]
     <────── B,C,D를 왼쪽 이동
[A B C D _]
```

중간 삽입·삭제는 뒤 원소를 이동해야 하므로 O(N)이다. 삭제 순서가 중요하지 않다면 마지막 원소를 삭제 위치로 옮긴 뒤 끝을 제거하는 Swap-and-pop을 사용해 O(1)로 만들 수 있다.

```text
[A B C D E], remove B
[A E C D _]  // E를 B 위치로 이동, size 감소
```

순서가 바뀌고 이동된 원소의 Index가 달라지므로 별도 ID→Index Map이 있다면 함께 갱신해야 한다.

### 참조와 Iterator 무효화

재할당하면 모든 원소가 새 주소로 이동하므로 이전 원소 포인터·참조·Iterator는 일반적으로 무효가 된다. 재할당이 없어도 중간 삽입·삭제는 이동된 위치 이후의 참조를 무효화할 수 있다. 언어·컨테이너별 정확한 규칙을 확인한다.

```cpp
std::vector<Player> players;
players.push_back(Player{});
Player* first = &players[0];
players.push_back(Player{}); // reallocation 가능
// first를 계속 쓰면 위험할 수 있다.
```

장기 참조가 필요하면 객체를 별도 안정 저장소에 두고 배열에는 Handle·ID를 저장하거나 충분히 `reserve`하되 최대치를 넘을 가능성을 처리한다. `reserve`도 호출 순간 재할당할 수 있다.

### Reserve와 Resize

`reserve(n)`은 일반적으로 Capacity를 최소 n으로 늘리지만 유효 원소 수는 바꾸지 않는다. `resize(n)`은 Size를 바꾸고 늘어난 구간에 원소를 생성한다. 둘을 혼동하면 아직 존재하지 않는 원소에 접근하거나 불필요한 초기화를 할 수 있다.

예상 최대 원소 수가 정확하면 미리 Reserve해 Hot Path의 재할당을 줄인다. 지나치게 크게 Reserve하면 사용하지 않는 주소·메모리가 남는다. 실제 원소 수 분포로 정한다.

### 메모리 지역성

```text
Array:       [P0][P1][P2][P3]  연속 Cache Line 활용
Linked Node: [P0]→far→[P1]→far→[P2]  Pointer 추적
```

배열 순회는 다음 원소 주소가 규칙적이라 Hardware Prefetch가 유리하다. 같은 Big-O O(N) 순회라도 연결 리스트보다 빠른 경우가 많은 이유다. 원소가 큰 객체이고 실제 데이터가 다시 힙 포인터 뒤에 있으면 배열에는 참조만 연속이므로 이점이 줄 수 있다.

### 값 저장과 참조 저장

`vector<Player>`처럼 값을 직접 저장하면 Player들이 연속하지만 재할당 시 이동 비용이 크다. `vector<unique_ptr<Player>>`는 포인터만 연속이고 Player 주소는 안정적일 수 있지만 개별 할당, 포인터 추적과 Cache Miss가 늘어난다. Handle 기반 Pool은 안정성과 지역성을 절충할 수 있다.

관리형 언어의 `List<Player>`가 참조 형식 객체를 담으면 연속인 것은 객체 자체가 아니라 참조 배열일 수 있다. 값 형식이면 내부 배열에 값이 포함될 수 있다. 언어의 메모리 표현을 확인한다.

### 시간 복잡도 정리

| 연산 | 고정·동적 배열 | 비고 |
|---|---:|---|
| Index 접근 | O(1) | Bounds Check·Cache 비용 별도 |
| 순차 탐색 | O(N) | 정렬 상태면 이진 탐색 가능 |
| 끝 삽입 | 분할 상환 O(1), 최악 O(N) | 재할당 시 전체 이동 |
| 끝 삭제 | O(1) | 원소 파괴 비용 포함 가능 |
| 중간 삽입·삭제 | O(N) | 뒤 원소 이동 |
| 정렬 배열 이진 탐색 | O(log N) | 삽입은 O(N) |

## 4. 쉬운 예시

게임 서버 Entity 시스템에서 동적 배열을 어떻게 쓰는지 보여준다.

```java
// 게임 Entity: Handle → Index Map + Swap-and-pop 삭제
class EntityPool {
    private Entity[] entities = new Entity[1024];
    private int[] handleToIndex = new int[1024];
    private int[] indexToHandle = new int[1024];
    private int size = 0;

    int add(Entity e) {
        int handle = e.handle;
        handleToIndex[handle] = size;
        indexToHandle[size] = handle;
        entities[size++] = e;
        return handle;
    }

    void remove(int handle) {
        int idx = handleToIndex[handle];
        int lastHandle = indexToHandle[size - 1];

        // Swap-and-pop: 마지막 원소를 삭제 위치로 이동
        entities[idx] = entities[size - 1];
        handleToIndex[lastHandle] = idx;  // Map 갱신 필수
        indexToHandle[idx] = lastHandle;
        size--;
    }

    // 매 틱 전체 순회: 연속 배열이므로 Cache 친화적
    void updateAll(float dt) {
        for (int i = 0; i < size; i++) {
            entities[i].update(dt);
        }
    }
}
```

```java
// 동적 배열 재할당 시점 관찰
ArrayList<Packet> packets = new ArrayList<>(64); // capacity=64로 미리 reserve
// capacity 초과 시: 64 → 128 → 256 ... O(N) 복사 발생
// Hot Path에서 재할당을 피하려면 과거 p99 크기로 초기 capacity를 설정한다
```

핵심: Swap-and-pop 삭제는 Handle→Index Map을 반드시 갱신해야 한다. `reserve()`로 재할당 지점을 핫 패스 밖으로 밀어낸다.

## 5. 비슷한 개념과 비교
| 요구 | 유리한 구조 | 핵심 비용 |
|---|---|---|
| 순차 순회 | 연속 배열 | 중간 이동 |
| Key 조회 | Hash·Tree | Hash 충돌·균형 |
| 순서 제한 | Stack·Queue | 제한된 접근 |

| 구분 | 고정 Array | Dynamic Array | Linked List |
|---|---|---|---|
| 크기 | 생성 시 고정 | Size·Capacity로 증가 | Node별 증가 |
| Index 접근 | O(1) | O(1) | O(N) |
| 끝 삽입 | 공간 있으면 O(1) | 분할 상환 O(1) | Tail 있으면 O(1) |
| 중간 삽입 | O(N) 이동 | O(N) 이동 | 위치를 알면 연결 변경 O(1) |
| 지역성 | 좋음 | 좋음 | 대체로 낮음 |
| 참조 안정성 | 배열 수명 동안 상대적 안정 | 재할당·이동 시 무효화 | 삭제 Node 외 안정적일 수 있음 |

정렬 배열과 Hash Table도 선택 기준이 다르다. 작은 정렬 배열은 O(log N) 검색과 좋은 지역성, 낮은 Overhead가 있어 Hash O(1) 평균보다 실제로 빠를 수 있다. 데이터 크기와 업데이트 빈도를 측정한다.

## 6. 장점과 단점

**고정 배열 장점**
- 원소당 메모리 오버헤드가 없다.
- O(1) 인덱스 접근과 Cache 친화적 순회가 가능하다.
- 크기가 고정이라 예측 가능한 메모리를 사용한다.

**고정 배열 단점**
- 크기를 초과하면 공간을 확장할 수 없다.
- 미리 최대 크기를 잡으면 사용하지 않는 메모리가 남는다.

**동적 배열 추가 장점**
- 원소 수 변화에 맞춰 크기를 늘릴 수 있다.
- 끝 삽입이 분할 상환 O(1)이다.
- `reserve()`로 재할당 시점을 핫 패스 밖으로 미리 밀어낼 수 있다.

**동적 배열 추가 단점**
- Capacity 초과 시 재할당·전체 복사로 O(N) 지연이 발생한다.
- 재할당 시 모든 포인터·참조·Iterator가 무효화된다.
- Capacity 여유분이 사용되지 않은 메모리를 차지한다.
- 연속 대용량 공간이 필요해 메모리 단편화 환경에서 할당 실패 가능성이 있다.

## 7. 게임 서버·백엔드 실무 예시
게임 월드의 Entity를 연속 배열로 순회하면 Cache 친화적이다. 포인터·참조 무효화와 최대 크기, reserve를 고려한다.

운영에서는 원소 수 분포, 연산 비율, 할당률, p99 지연을 측정한다. 동시 접근이 있다면 자료구조 자체와 별도로 소유권과 동기화를 설계한다.

### Entity 순회

매 틱 모든 위치와 속도를 갱신하면 연속 배열이 적합하다. 자주 함께 쓰는 Component만 연속 배치하면 Cache에 불필요한 이름·장비 데이터를 싣지 않을 수 있다. Entity 삭제는 순서가 중요하지 않다면 Swap-and-pop을 쓰고 Handle→Index Map을 갱신한다.

```text
handle 42 → index 1
Entities [A][B][C][D]
remove B: [A][D][C]
handle D → index 1로 Update
handle B → generation 증가로 Invalid
```

Index를 외부에 그대로 노출하면 삭제 후 같은 Index가 다른 Entity를 가리킬 수 있다. Generation이 포함된 Handle로 오래된 참조를 검증한다.

### Packet Batch

한 틱의 송신 Packet 목록은 동적 배열에 모아 순차 직렬화하기 좋다. 과거 원소 수의 상위 분위수를 기준으로 Reserve해 Tick 중 재할당을 줄인다. 최대치 없는 입력을 그대로 Reserve하지 않고 연결별·틱별 상한을 둔다.

### Thread 안전성

동적 배열을 한 스레드가 순회하는 동안 다른 스레드가 추가해 재할당하면 Data Race와 무효 참조가 생긴다. Mutex로 전체 연산을 보호하거나 소유 스레드 Queue로 변경을 전달하고 Tick 경계에서 반영한다. Capacity를 미리 잡는 것만으로 동시 접근이 안전해지는 것은 아니다.

### 측정

원소 수 평균·p99·최대, Capacity 대비 Size, 재할당 횟수와 이동 Byte, 삽입·삭제 위치, Cache Miss, 할당과 Tick p99를 본다. 데이터가 작다면 복잡한 Pool과 Handle 시스템을 추가하기 전에 단순 Vector가 충분한지 확인한다.

## 8. 자주 하는 오해

- **"Big-O가 같으면 실제 성능도 같다"**: 같은 O(1)이라도 Cache Hit와 Miss 사이에 수십~수백 배 실제 지연 차이가 있다. 연결 리스트의 O(1) 중간 삽입이 동적 배열의 O(N) 이동보다 느릴 수 있는 이유다.
- **"분할 상환 O(1)은 단일 삽입도 O(1)이다"**: 분할 상환은 N번 연산 전체의 평균 비용이다. 재할당이 발생하는 그 순간의 삽입은 O(N)이고, 게임 틱의 p99 스파이크로 나타날 수 있다.
- **"reserve()로 Capacity를 잡으면 Iterator가 영구 안전하다"**: reserve() 이후 Capacity 범위 안에서는 재할당이 없지만, Capacity를 초과하는 순간 다시 재할당이 발생해 모든 참조가 무효화된다.
- **"reserve()와 resize()는 같은 동작이다"**: `reserve(n)`은 Capacity만 늘리고 size는 그대로다. `resize(n)`은 size를 바꾸고 새 원소를 생성한다. 혼동하면 존재하지 않는 원소에 접근하거나 불필요한 초기화가 생긴다.
- **"관리형 언어에서 List<T>에 객체를 담으면 객체 본체가 연속 배치된다"**: 참조 형식(class) 객체를 담으면 연속인 것은 참조(포인터) 배열이고 객체 본체는 힙에 흩어진다. Cache 지역성 이점이 크게 줄어든다. 값 형식(struct)이면 다르다.
- **"동적 배열은 멀티스레드 환경에서 자동으로 안전하다"**: 표준 동적 배열은 스레드 안전을 보장하지 않는다. 한 스레드가 순회하는 동안 다른 스레드가 삽입해 재할당이 발생하면 Data Race와 무효 참조가 생긴다.
- **"원소 수가 작으면 자료구조 선택이 성능에 영향을 주지 않는다"**: 원소 수가 적을 때 Cache 지역성 이점이 가장 두드러진다. 단순 배열의 선형 탐색이 Hash Table보다 빠른 경우가 흔하며, 복잡한 구조의 오버헤드가 상대적으로 커진다.

## 9. 면접 질문

### Q1. 동적 배열에서 끝 삽입이 분할 상환 O(1)인 이유는 무엇인가요? 게임 틱 p99에 영향이 생기는 경우는 언제인가요?

재할당 한 번은 O(N)이지만 Capacity를 기하급수적으로 늘리면 N번 삽입 동안 원소 하나가 옮겨지는 횟수가 제한된다. 전체 비용을 N으로 나누면 삽입당 분할 상환 O(1)이다. 단, 재할당이 발생하는 그 틱의 삽입은 O(N)이며 게임 틱 p99 스파이크로 나타날 수 있다. `reserve()`로 예상 최대 크기를 미리 확보해 핫 패스의 재할당을 방지한다.

### Q2. 재할당이 발생하면 어떤 문제가 생기고, 게임 서버에서 어떻게 방지하나요?

더 큰 연속 메모리를 할당하고 기존 원소를 모두 복사·이동해 O(N) 지연이 생긴다. 기존 포인터·참조·Iterator가 모두 무효화된다. 게임 서버에서는 과거 틱 p95~p99 원소 수를 기준으로 초기 Capacity를 `reserve()`하고, 최대 연결 수·틱당 Packet 상한처럼 측정 가능한 상한으로 설정한다.

### Q3. 게임 Entity 시스템에서 중간 삭제를 O(1)로 처리하려면 어떤 방법을 쓰나요?

순서가 중요하지 않으면 Swap-and-pop을 사용한다. 삭제 위치에 마지막 원소를 복사하고 size를 줄이면 O(1)이다. 단, 이동된 원소의 Handle→Index Map을 반드시 갱신해야 한다. 외부에서 Index를 직접 들고 있으면 Generation이 포함된 Handle로 오래된 참조를 검증한다.

### Q4. 게임 서버에서 네트워크 스레드가 패킷을 수신하면서 게임 로직 스레드가 동시에 같은 동적 배열을 순회할 때 어떤 위험이 있고, 어떻게 구조를 짜나요?

표준 동적 배열은 스레드 안전을 보장하지 않는다. 네트워크 스레드의 삽입이 재할당을 트리거하면 로직 스레드가 순회 중인 포인터가 무효화되어 Data Race가 발생한다. 실무에서는 네트워크 스레드가 수신 Packet을 Lock-free Queue나 별도 버퍼에 쌓고, 로직 스레드가 틱 시작 시점에 한꺼번에 가져와 자신의 배열에 반영하는 방식으로 소유권을 분리한다. Mutex로 전체 연산을 잠그는 방법은 틱 예산을 소진할 수 있어 핫 패스에서는 피한다.

### Q5. 게임 서버 틱마다 Packet 배열을 초기화할 때 `reserve()`와 `resize()`를 혼용하면 어떤 문제가 생기고, 실무에서 어느 것을 어떤 상황에 씁니까?

`reserve(n)`은 Capacity만 늘리고 size는 바꾸지 않는다. `resize(n)`은 size를 바꾸고 새 원소를 생성한다. 틱마다 초기화 패턴으로 `resize(0)` 후 인덱스 직접 접근을 하면 Undefined Behavior가 발생한다. 실무에서는 틱 시작 시 `clear()`로 size만 0으로 만들고 기존 Capacity를 재사용해 재할당을 막는다. `resize()`는 미리 원소를 생성해야 할 때, 예컨대 ECS Component 배열을 최대 Entity 수로 초기화하는 경우에 쓴다.

### Q6. 연결 리스트가 O(1) 중간 삽입임에도 게임 서버에서 동적 배열보다 느린 이유는 무엇인가요?

Big-O는 같아도 메모리 배치가 다르다. 연결 리스트는 각 노드가 힙에 흩어져 있어 포인터 추적마다 Cache Miss가 발생한다. 동적 배열은 원소가 연속 배치되어 Hardware Prefetch가 유리하다. 원소 수가 수천 개 이하이면 O(N) 이동을 하는 동적 배열이 Cache Miss가 많은 연결 리스트보다 빠른 경우가 흔하다.

## 10. 예상 꼬리질문
- 재할당이 게임 틱 p99에 실제로 나타나는지 어떻게 확인하나요?
  > 재할당이 발생하는 시점을 로그나 메트릭으로 기록하고 틱 처리 시간 p99 시계열과 대조한다. 프로파일러로 메모리 할당 이벤트를 추적하거나 Allocation Rate 메트릭을 틱 단위로 수집해 스파이크가 재할당과 겹치는지 확인한다.
- Swap-and-pop으로 삭제했을 때 Handle→Index Map 갱신을 빠뜨리면 어떤 버그가 생기나요?
  > 이동된 마지막 원소의 Handle이 이전 Index를 가리키게 되어 해당 Handle로 접근하면 잘못된 Entity를 참조하는 Stale Reference 버그가 발생한다. 삭제된 Entity의 Handle이 새 Entity를 가리키는 ABA 성격의 문제도 생길 수 있어 Generation 카운터로 검증해야 한다.
- `reserve()` 이후에도 재할당이 발생할 수 있는 경우는 어떤 경우인가요?
  > `reserve(n)` 호출 이후 삽입 횟수가 n을 초과하면 다시 재할당이 발생한다. 예측보다 많은 원소가 추가되거나 Capacity 상한을 잘못 산정하면 Hot Path에서 재할당이 재발한다. Reserve 기준을 실측 p99 값보다 여유 있게 잡고 실제 Capacity를 모니터링해야 한다.
- 네트워크 스레드와 로직 스레드 사이에 Lock-free Queue를 쓸 때 ABA 문제는 어떻게 처리하나요?
  > ABA 문제는 CAS 연산이 포인터 값만 비교할 때 주소가 같아도 다른 객체가 재사용된 경우를 구분하지 못해 발생한다. Tagged Pointer(포인터 하위 비트에 Generation 인코딩), Hazard Pointer, 또는 Epoch-based Memory Reclamation으로 해제된 노드가 재사용되기 전에 안전하게 제거한다.
- `vector<Player>`와 `vector<unique_ptr<Player>>` 중 Entity 시스템에서 어느 쪽이 Cache 관점에서 유리하고 언제 바꾸나요?
  > `vector<Player>`는 Player 본체가 연속 배치되어 순회 시 Cache 친화적이나 재할당 시 이동 비용이 크고 참조가 무효화된다. `vector<unique_ptr<Player>>`는 포인터만 연속이고 Player 주소가 안정적이지만 포인터 추적마다 Cache Miss가 발생한다. 외부 참조 안정성이 필수이거나 이동 비용이 크면 `unique_ptr`, 순회 성능이 우선이면 값 저장을 선택하고 실측으로 결정한다.
- ECS에서 Component를 별도 배열로 분리하면 Swap-and-pop 삭제 시 어떤 추가 작업이 필요한가요?
  > Entity가 여러 Component 배열(Position, Velocity 등)에 각각 Index를 가지므로 Swap-and-pop 삭제 시 모든 Component 배열에서 해당 Entity의 Index를 동기적으로 갱신해야 한다. 하나라도 빠뜨리면 다른 Component에서 잘못된 Entity 데이터를 참조하는 불일치 버그가 발생한다.
- 최대 연결 수를 알 수 없는 채팅 서버에서 Packet 배열의 Reserve 기준을 어떻게 잡나요?
  > 과거 운영 데이터에서 동시 연결 수와 틱당 수신 Packet 수의 p95~p99를 측정해 초기 Reserve 기준으로 삼는다. 연결별·틱별 상한(예: 연결당 최대 Packet 수 × 최대 연결 수)을 설정해 Reserve가 무제한으로 커지지 않게 한다. Capacity 대비 실제 Size 비율을 모니터링해 기준을 주기적으로 재조정한다.

## 11. 30초 모범답변
> Array는 연속 메모리 덕분에 O(1) 인덱스 접근과 Hardware Prefetch 이점이 있고, Dynamic Array는 Capacity가 가득 차면 더 큰 블록으로 재할당해 끝 삽입을 분할 상환 O(1)로 제공합니다. 게임 서버에서 실무 포인트는 두 가지입니다. 재할당이 발생하는 순간 삽입은 O(N)으로 틱 p99 스파이크가 날 수 있어서 과거 p99 원소 수로 미리 `reserve()`합니다. 그리고 재할당이 일어나면 기존 포인터·참조가 모두 무효화되기 때문에 Entity 시스템에서는 직접 포인터 대신 Handle과 Generation으로 참조를 검증합니다.

## 12. 1~2분 확장답변
> Array는 연속 메모리 덕분에 O(1) 인덱스 접근과 Hardware Prefetch 이점이 있고, Dynamic Array는 Capacity가 가득 차면 더 큰 블록으로 재할당해 끝 삽입을 분할 상환 O(1)로 제공합니다.
>
> 게임 서버에서 가장 자주 쓰는 패턴은 두 가지입니다.
>
> 첫째, Entity 시스템입니다. 매 틱 수천~수만 개의 Entity를 갱신할 때 연속 배열을 쓰면 Hardware Prefetch가 유리해 같은 O(N)이라도 연결 리스트 대비 순회가 빠릅니다. 삭제는 순서가 중요하지 않으므로 Swap-and-pop으로 O(1)로 처리하는데, 이때 이동된 원소의 Handle→Index Map을 빠뜨리면 dangling reference 버그가 생깁니다. 외부에 Index를 직접 노출하지 않고 Generation이 포함된 Handle로 오래된 참조를 검증하는 이유입니다.
>
> 둘째, Packet 배열입니다. 한 틱에 수신된 Packet을 동적 배열에 모아 순차 처리하는데, 틱마다 `clear()`로 size만 0으로 만들어 Capacity를 재사용합니다. 초기 Capacity는 과거 p95~p99 수신량으로 잡아 틱 중 재할당을 방지합니다.
>
> 주의할 점은 `reserve()`로 Capacity를 잡아도 이후 삽입이 그 한도를 넘으면 다시 재할당이 발생한다는 것입니다. 멀티스레드 환경에서는 배열 소유권을 스레드 하나에 고정하고 변경은 틱 경계에서 반영하는 방식으로 Data Race를 피합니다.

## 13. 핵심 요약

- 고정 배열은 연속 메모리에 원소를 저장해 O(1) 인덱스 접근을 제공하고, 동적 배열은 Capacity가 가득 차면 더 큰 배열로 재할당해 크기를 늘린다.
- 분할 상환 O(1)은 단일 삽입의 최악이 O(1)이라는 뜻이 아니다. 재할당이 발생하는 순간은 O(N)이며 게임 틱 p99 스파이크로 나타날 수 있다.
- `reserve()`로 핫 패스의 재할당을 사전에 방지한다. 과거 p95~p99 원소 수를 기준으로 설정한다.
- 재할당이 발생하면 모든 포인터·참조·Iterator가 무효화된다. Handle과 Generation으로 오래된 참조를 검증한다.
- 연속 배치는 Hardware Prefetch에 유리해 같은 O(N)이라도 연결 리스트보다 순회가 빠른 경우가 많다.
- 동적 배열은 멀티스레드에서 자동으로 안전하지 않다. 변경을 소유 스레드에 전달하고 틱 경계에서 반영한다.
- 게임 Entity 시스템에서 Swap-and-pop으로 O(1) 삭제를 구현하고 Handle→Index Map을 갱신한다.
- 원소 수가 적으면 단순 배열의 선형 탐색이 Hash Table보다 빠를 수 있다. 측정 전에 복잡한 구조를 추가하지 않는다.

## 한 줄 정리
> Array는 연속 메모리로 O(1) 인덱스 접근을 제공하고 Dynamic Array는 재할당으로 크기를 늘려 끝 삽입을 분할 상환 O(1)로 제공합니다.
