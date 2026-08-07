---
difficulty: 3
reading_time: 20분
interview_frequency: 4
importance: 4
---

# 02. Linked List


## 학습 목표

- 단일·이중 연결 리스트의 Node 링크 구조, Sentinel Node, 삽입·삭제의 포인터 갱신 절차를 설명할 수 있다.
- "O(1) 삽입·삭제"의 전제 조건(알려진 Iterator·Node)과 탐색 O(N), Cache 지역성 비용을 분리해 설명할 수 있다.
- LRU Cache에서 HashMap과 이중 연결 리스트를 조합해 O(1) 조회·순서 갱신을 달성하는 원리를 설명할 수 있다.
- 게임 서버 Active Session·Object Pool에서 연결 리스트와 배열 중 어떤 상황에서 각각을 선택하는지 판단할 수 있다.

## 1. 개요

연결 리스트는 각 Node가 값과 다음 또는 이전 Node 링크를 저장하는 비연속 구조다.

단일 연결 리스트(Singly Linked List)는 각 노드가 다음 노드를 가리킨다. 이중 연결 리스트(Doubly Linked List)는 이전과 다음 링크를 모두 가진다. 노드는 메모리 어디에 있어도 링크로 논리적 순서를 표현하므로 동적 배열처럼 전체 원소가 하나의 연속 영역에 있을 필요가 없다.

연결 리스트의 대표 장점은 “원하는 위치를 이미 알고 있을 때” 주변 링크 몇 개만 바꿔 삽입·삭제할 수 있다는 점이다. n번째 위치를 먼저 찾는 데 O(N)이 필요하므로 “중간 삽입은 항상 O(1)”이라고 답하면 조건이 빠진다.

## 2. 왜 필요한가
알고 있는 위치에서 재할당과 대량 이동 없이 삽입·삭제한다. 자료구조 선택은 Big-O뿐 아니라 데이터 크기, 접근 패턴, 메모리 배치와 갱신 빈도에서 시작한다.

동적 배열의 중간에 원소를 넣으면 뒤 원소를 모두 이동하고, Capacity가 부족하면 전체 재할당까지 발생한다. 연결 리스트는 삽입 지점의 이전 노드나 Iterator를 알고 있다면 새 노드를 할당하고 링크를 바꾼다. 다른 노드를 이동하지 않아 기존 노드 주소를 상대적으로 안정적으로 유지할 수 있다.

하지만 현대 CPU에서는 순회가 매우 흔하고 캐시 지역성이 중요하다. 노드마다 포인터와 할당 Metadata가 필요하고 메모리에 흩어져 Pointer를 따라가므로 배열보다 느릴 수 있다. 삽입·삭제가 많다는 이유만으로 선택하지 않고 위치 탐색 비용과 전체 순회 비율을 함께 본다.

## 3. 핵심 동작 원리
```text
head→[A|next]→[B|next]→[C|null]
```
단일 리스트는 다음 방향, 이중 리스트는 양방향 이동과 O(1) 제거를 위해 prev도 저장한다. 위치 탐색은 O(n)이고 포인터·할당 비용과 낮은 Cache 지역성이 있다.

평균·최악 복잡도와 함께 할당, Cache 지역성, 순회 비용, 참조 안정성을 봐야 한다.

### 단일 연결 리스트

```text
head
  |
  v
[A | *-]--->[B | *-]--->[C | null]
```

Head에서 시작해 `next`를 따라 한 방향으로만 이동한다. Head 앞 삽입은 새 노드의 next를 기존 Head로 두고 Head를 바꾸므로 O(1)이다. Tail을 별도로 보관하면 끝 삽입도 O(1)이지만 Tail이 없으면 마지막 노드를 찾는 데 O(N)이다.

특정 노드 B를 삭제하려면 이전 노드 A의 `next`를 C로 바꿔야 한다. B만 알고 이전 노드를 모르면 Head부터 찾아야 한다. 다음 노드의 값을 B로 복사하고 다음 노드를 삭제하는 기법도 있지만 Tail 삭제, 객체 정체성·외부 참조와 파괴 의미 때문에 일반적인 답은 아니다.

### 이중 연결 리스트

```text
null <- [A] <-> [B] <-> [C] -> null
         ^                   ^
        head                tail
```

각 노드에 `prev`와 `next`가 있어 양방향 순회가 가능하다. 삭제할 노드 B를 알고 있으면 다음처럼 주변 링크를 연결한다.

```text
B.prev.next = B.next
B.next.prev = B.prev
```

Head·Tail 경계에서는 NULL 분기를 처리하거나 Sentinel Node를 둬 로직을 단순화한다. 포인터 갱신 순서가 잘못되면 리스트 일부를 잃거나 Cycle을 만들 수 있다.

### Sentinel Node

값을 담지 않는 가상 Head·Tail 노드를 항상 두면 빈 리스트와 첫·마지막 삽입을 일반 노드 사이 삽입과 같은 코드로 처리할 수 있다.

```text
[HEAD] <-> [A] <-> [B] <-> [TAIL]
```

원소가 없어도 `HEAD.next == TAIL`, `TAIL.prev == HEAD` 불변식을 유지한다. 메모리 두 노드가 추가되지만 분기와 버그를 줄일 수 있다.

### 삽입 과정

A와 B 사이에 X를 넣는 이중 연결 리스트를 보자.

```text
Before: A <-> B

X.prev = A
X.next = B
A.next = X
B.prev = X

After : A <-> X <-> B
```

작업 중 예외가 날 수 있는 값 생성과 노드 할당은 링크를 바꾸기 전에 끝내야 한다. 표준 컨테이너는 예외 안전 규칙을 제공하지만 직접 구현하면 부분 갱신을 고려한다.

### 삭제와 수명

노드를 리스트에서 분리한 뒤 메모리를 해제한다. 외부가 그 노드 포인터를 계속 사용하면 Use-after-free가 된다. 관리형 언어에서는 참조가 남아 객체가 회수되지 않을 수 있지만 리스트 Membership은 끝났으므로 논리적으로 잘못된 상태를 사용할 수 있다.

삭제된 노드 외 다른 노드는 보통 주소가 이동하지 않는다. 이것이 동적 배열 대비 참조 안정성의 장점이다. 그러나 Container 자체 파괴, Splice·Move와 구현 규칙은 확인한다.

### 탐색과 Index 접근

n번째 원소를 얻으려면 Head부터 n번 링크를 따라가 O(N)이다. 이중 리스트는 Index가 후반이면 Tail에서 역방향으로 시작해 이동 수를 줄일 수 있지만 Big-O는 O(N)이다.

```text
get(4): head → 0 → 1 → 2 → 3 → 4
```

반복문에서 매번 `get(i)`를 호출하는 API가 내부적으로 Head부터 탐색하면 전체가 O(N²)이 될 수 있다. Iterator로 한 번 순회하면 O(N)이다.

### 메모리와 캐시

동적 배열은 원소 본체가 연속일 수 있지만 연결 리스트는 각 노드가 개별 할당될 수 있다.

```text
Array : [A][B][C][D]            다음 원소가 인접
List  : [A|*] → ... [B|*] → ... 메모리 위치가 흩어짐
```

노드마다 하나 또는 두 포인터, 할당자 Metadata와 정렬 Padding이 추가된다. 값이 작은 정수라면 링크 Overhead가 값보다 클 수 있다. Pointer 추적은 다음 주소를 현재 노드를 읽은 뒤에야 알 수 있어 Hardware Prefetch가 어렵고 Cache Miss가 연쇄된다.

Pool Allocator로 노드를 가까이 배치하고 할당 비용을 줄일 수 있지만 Pool 관리, 최대 용량과 수명 복잡성이 생긴다. 노드가 연속에 가깝다면 애초에 Index 기반 배열 리스트가 더 단순할 수 있다.

### 시간 복잡도

| 연산 | 단일 리스트 | 이중 리스트 | 전제 |
|---|---:|---:|---|
| Head 접근·삽입 | O(1) | O(1) | Head 보유 |
| Tail 삽입 | O(1) 또는 O(N) | O(1) | Tail 보유 여부 |
| 값·Index 탐색 | O(N) | O(N) | 정렬 없음 |
| 알고 있는 위치 뒤 삽입 | O(1) | O(1) | 유효 Node·Iterator 보유 |
| 알고 있는 Node 삭제 | 이전 Node 필요 | O(1) | 이중 리스트는 prev 보유 |
| 전체 순회 | O(N) | O(N) | 실제 Cache 비용 큼 |

### Intrusive List

일반 리스트는 별도 노드가 값을 감싸지만 Intrusive List는 객체 내부에 링크 필드를 포함한다.

```cpp
struct Session {
    Session* prev;
    Session* next;
    // session fields...
};
```

별도 노드 할당과 간접 접근을 줄이고 객체를 여러 목록에서 빠르게 연결·분리할 수 있다. 대신 객체가 컨테이너 구조를 알아야 하고 하나의 링크 세트는 동시에 한 리스트 Membership만 표현한다. 수명·중복 삽입과 삭제 후 링크 초기화를 직접 엄격히 관리해야 한다.

### Splice

일부 이중 연결 리스트는 한 리스트의 연속 노드 범위를 복사 없이 다른 리스트로 옮길 수 있다. 경계 링크만 변경하므로 범위 크기와 무관한 O(1)이 가능한 조건이 있지만 Size 계산, Allocator 호환성과 API에 따라 복잡도가 다르다. 실제 표준 컨테이너 계약을 확인한다.

## 4. 쉬운 예시

LRU Cache는 HashMap(O(1) 조회)과 이중 연결 리스트(O(1) 순서 갱신)를 조합한 연결 리스트의 대표 활용 사례다.

```java
// LRU Cache: HashMap + 이중 연결 리스트 (Sentinel Node 패턴)
class LRUCache {
    private static class Node {
        int key, val;
        Node prev, next;
        Node(int key, int val) { this.key = key; this.val = val; }
    }

    private final int capacity;
    private final Map<Integer, Node> map = new HashMap<>();
    private final Node head = new Node(0, 0); // sentinel head
    private final Node tail = new Node(0, 0); // sentinel tail

    LRUCache(int capacity) {
        this.capacity = capacity;
        head.next = tail;
        tail.prev = head;
    }

    int get(int key) {
        Node node = map.get(key);
        if (node == null) return -1;
        moveToHead(node); // 가장 최근 사용으로 갱신: O(1)
        return node.val;
    }

    void put(int key, int val) {
        Node node = map.get(key);
        if (node != null) {
            node.val = val;
            moveToHead(node);
        } else {
            Node newNode = new Node(key, val);
            map.put(key, newNode);
            addToHead(newNode);
            if (map.size() > capacity) {
                Node lru = removeTail(); // 가장 오래된 항목 제거: O(1)
                map.remove(lru.key);
            }
        }
    }

    private void addToHead(Node node) {
        node.prev = head; node.next = head.next;
        head.next.prev = node; head.next = node;
    }

    private void removeNode(Node node) {
        node.prev.next = node.next;
        node.next.prev = node.prev;
    }

    private void moveToHead(Node node) { removeNode(node); addToHead(node); }
    private Node removeTail() { Node n = tail.prev; removeNode(n); return n; }
}
```

Sentinel Node(head·tail)를 두면 빈 리스트와 경계 삽입·삭제를 일반 노드와 동일한 코드로 처리할 수 있다. HashMap 없이 리스트만 쓰면 조회가 O(N), 리스트 없이 Map만 쓰면 순서 갱신이 O(1)이 아니다.

## 5. 비슷한 개념과 비교
| 요구 | 유리한 구조 | 핵심 비용 |
|---|---|---|
| 순차 순회 | 연속 배열 | 중간 이동 |
| Key 조회 | Hash·Tree | Hash 충돌·균형 |
| 순서 제한 | Stack·Queue | 제한된 접근 |

| 구분 | Dynamic Array | Singly List | Doubly List |
|---|---|---|---|
| 임의 접근 | O(1) | O(N) | O(N) |
| 알려진 위치 삽입 | 이동 O(N) | 뒤 삽입 O(1) | 앞·뒤 삽입 O(1) |
| 알려진 노드 삭제 | 이동 O(N) | 이전 노드 필요 | O(1) |
| 원소당 Overhead | Capacity 여유 | next | prev + next |
| 순회 지역성 | 높음 | 낮음 | 낮음 |
| 참조 안정성 | 재할당·이동 시 무효화 | 삭제 노드 외 상대적 안정 | 삭제 노드 외 상대적 안정 |

`std::deque`나 Chunked Sequence는 여러 고정 Block을 사용해 양끝 삽입과 어느 정도의 임의 접근을 제공한다. 연속 배열과 노드 리스트 사이의 절충이다. 특정 언어 컨테이너의 실제 보장과 Iterator 무효화 규칙을 확인한다.

## 6. 장점과 단점

**장점**
- 위치(Node·Iterator)를 알고 있을 때 삽입·삭제에서 다른 원소를 이동하지 않는다.
- 삭제된 노드 외 다른 노드의 주소가 안정적으로 유지된다.
- Splice로 연속 노드 범위를 복사 없이 O(1)에 다른 리스트로 이동할 수 있다.
- LRU 순서 갱신처럼 특정 노드를 Head로 이동하는 패턴에 유리하다.

**단점**
- 값·Index 탐색이 O(N)이다. O(1) 삽입·삭제의 전제가 "위치를 이미 안다"는 것이다.
- 노드마다 포인터(8바이트 × 1~2개)와 할당자 메타데이터 오버헤드가 있다.
- 노드가 메모리에 흩어져 Cache Miss가 빈번하고 Hardware Prefetch가 어렵다.
- 포인터 갱신 순서 오류, Use-after-free, 이중 삭제 등 구현 오류 위험이 높다.

## 7. 게임 서버·백엔드 실무 예시
LRU Cache는 Hash Map과 이중 연결 리스트를 조합해 O(1) 조회·순서 갱신을 만든다. 단순 순회 데이터에는 Dynamic Array가 더 빠를 수 있다.

운영에서는 원소 수 분포, 연산 비율, 할당률, p99 지연을 측정한다. 동시 접근이 있다면 자료구조 자체와 별도로 소유권과 동기화를 설계한다.

### LRU Cache

```text
Hash Map: key → List Node

Most Recent                           Least Recent
HEAD <-> [C] <-> [A] <-> [B] <-> TAIL
```

조회는 Hash Map으로 O(1) 평균에 노드를 찾고 이중 리스트 Head로 O(1) 이동한다. Capacity를 넘으면 Tail 노드를 제거하고 Map에서도 Key를 지운다. 리스트만 쓰면 Key 조회가 O(N), Map만 쓰면 사용 순서를 O(1)로 갱신하기 어렵기 때문에 조합한다.

동시 Cache에서는 Map과 List 변경을 하나의 불변식으로 보호해야 한다. Map에는 있는데 List에는 없거나 두 번 연결된 노드가 생기지 않게 Lock·Shard·Owner Thread를 사용한다.

### Timer·Timeout 목록

만료 순서가 대략 정렬된 세션 Timeout을 리스트로 관리할 수 있지만 임의 만료 추가와 다음 만료 탐색 요구에 따라 Heap이나 Timing Wheel이 더 적합할 수 있다. 리스트 중간 위치를 모르면 삽입이 O(N)이다.

### Active Session

세션을 자주 전체 순회해 Broadcast한다면 연결 리스트보다 연속 Snapshot 배열이 빠를 수 있다. 연결 종료 시 O(1) 삭제가 필요하더라도 순서가 중요하지 않은 동적 배열의 Swap-and-pop이 더 Cache 친화적이다. 삭제 빈도만 보고 리스트를 선택하지 않는다.

### Object Pool과 Intrusive Membership

Network Buffer·Session 객체를 Pool에서 할당하고 Free·Active 목록을 Intrusive List로 관리할 수 있다. 할당을 줄이지만 이중 반환, 아직 I/O가 참조하는 객체 재사용과 ABA 성격 문제가 위험하다. Generation과 소유권을 명시한다.

### 측정

원소 수, 순회 대 삽입·삭제 비율, 위치를 찾는 방법, 노드 할당률·Byte Overhead, Cache Miss와 p99를 본다. 리스트 선택의 이점인 “알려진 Iterator에서 변경”이 실제 코드에서 유지되는지 확인한다.

## 8. 자주 하는 오해

- **"Linked List의 모든 중간 삽입·삭제는 탐색 없이 O(1)이다"**: 삽입·삭제 자체는 링크 변경만이므로 O(1)이지만, 위치를 값이나 Index로 찾는 탐색은 O(N)이다. O(1)은 "유효한 Node·Iterator를 이미 보유한" 경우에만 성립한다.
- **"단일 연결 리스트에서 삭제할 노드만 알면 O(1) 삭제가 된다"**: 단일 리스트에서 노드 B를 삭제하려면 이전 노드 A의 next를 바꿔야 한다. B만 알고 A를 모르면 Head부터 탐색해 O(N)이다. 이중 리스트는 prev가 있어 B만으로 O(1) 삭제가 가능하다.
- **"참조가 안정적이면 삭제된 노드 참조도 안전하다"**: 삭제되지 않은 노드는 주소가 안정적이지만, 삭제 후 메모리를 해제한 노드에 접근하면 Use-after-free가 된다. 관리형 언어에서도 논리적으로 리스트 멤버십이 끝난 노드를 참조하면 잘못된 상태를 사용할 수 있다.
- **"노드가 작으면 Pointer·Allocator Overhead를 무시해도 된다"**: 노드 크기가 작을수록 포인터(8바이트 × 1~2개)와 할당자 메타데이터의 비율이 커진다. 정수 4바이트를 연결 리스트로 저장하면 오버헤드가 값보다 수 배 크다.
- **"삽입·삭제가 많으면 Linked List가 Active Session 관리에 항상 유리하다"**: 세션 삭제가 O(1)이 필요해도 전체 Broadcast 순회가 더 잦다면 Cache 친화적 배열의 Swap-and-pop이 더 빠를 수 있다. 삭제 빈도만 보고 선택하지 않는다.
- **"Pool Allocator를 쓰면 연결 리스트의 Cache Miss 문제가 해결된다"**: Pool은 할당 비용을 줄이고 초기에 노드를 가까이 배치할 수 있지만, 실제 사용 패턴에 따라 비연속 접근이 여전히 발생한다. 연속성이 필요하면 Index 배열이 더 단순하다.
- **"LRU Cache를 HashMap만으로 O(1) 순서 관리가 가능하다"**: HashMap은 Key 조회가 O(1) 평균이지만 가장 오래된 항목을 O(1)로 찾거나 순서를 갱신하기 어렵다. 이중 연결 리스트를 조합해야 순서 갱신과 Eviction이 O(1)이 된다.
- **"이중 연결 리스트의 Splice는 항상 O(1)이다"**: 경계 링크만 바꾸면 이동 범위 크기와 무관하게 O(1)인 구현도 있지만, Size 추적이나 Allocator 호환성에 따라 O(N)이 될 수 있다. 사용하는 표준 컨테이너의 계약을 확인해야 한다.

## 9. 면접 질문

### Q1. 게임 서버에서 세션 객체를 Intrusive List로 관리하다 연결 종료 직후 해당 세션 노드에 Broadcast 패킷을 쓰려 했을 때 어떤 문제가 생기고, 어떻게 방지하나요?

세션 삭제 시 리스트에서 분리한 뒤 메모리를 해제하면 아직 I/O 스레드가 그 포인터를 참조하고 있을 경우 Use-after-free가 발생한다. Intrusive List는 객체 수명과 링크 필드가 분리되지 않아 이중 삭제·ABA 문제도 위험하다. Generation 카운터나 shared_ptr 기반 소유권을 명시해 I/O 완료 콜백 전까지 객체가 해제되지 않게 보장한다.

### Q2. 게임 서버에서 세션 자동 로그아웃을 위해 Timeout 리스트를 이중 연결 리스트로 관리했는데, 특정 서버에서 p99 지연이 크게 튀었습니다. 원인으로 무엇을 먼저 의심하고 어떻게 확인하나요?

Timeout이 균일하지 않아 중간 삽입 위치 탐색에 O(N)이 발생하거나, 노드가 메모리에 흩어져 순회 시 Cache Miss가 연쇄될 수 있다. 먼저 삽입 경로의 탐색 횟수와 Cache Miss 지표를 확인한다. 만료 순서가 대략 정렬된 경우라도 임의 Timeout 추가가 잦다면 Timing Wheel이나 Heap이 더 적합하다.

### Q3. LRU Cache를 게임 서버 아이템 데이터 캐싱에 사용할 때, Cache Hit 시 HashMap O(1) 조회 외에 이중 연결 리스트 Head 이동이 반드시 필요한 이유는 무엇인가요? HashMap만으로는 무엇이 불가능한가요?

HashMap은 Key 조회가 O(1)이지만 접근 순서를 추적하지 않아 Capacity 초과 시 가장 오래된 항목을 O(1)로 찾을 수 없다. 이중 연결 리스트의 Head 이동으로 최근 접근을 O(1)에 반영하고 Tail 제거로 Eviction 대상을 O(1)에 확정한다. Map과 List의 불변식이 깨지면 Map에 Key는 있는데 List에 노드가 없거나 이중 연결 상태가 생기므로 동시 캐시에서는 Lock이나 Owner Thread로 두 연산을 원자적으로 처리해야 한다.

### Q4. 게임 Active Session 관리에서 연결 리스트 대신 배열 Swap-and-pop을 선택하는 이유는 무엇인가요?

연결 리스트의 O(1) 삭제는 매력적이지만 매 틱 전체 세션을 Broadcast하는 순회가 더 빈번하다면 Cache Miss가 많은 연결 리스트보다 연속 배열이 빠르다. Swap-and-pop도 O(1) 삭제가 가능하고 순회에서 Hardware Prefetch를 활용할 수 있다.

### Q5. 동접 5만 규모 게임 서버에서 세션 Broadcast 처리 시 Intrusive List와 연속 배열 Snapshot 중 어떤 것을 선택하겠습니까? 그 판단 근거는 무엇인가요?

Broadcast 순회가 연결 종료 삭제보다 압도적으로 빈번하다면 연속 배열 Snapshot이 유리하다. Intrusive List는 O(1) 삭제가 장점이지만 노드가 메모리에 흩어져 5만 세션 순회 시 Cache Miss가 연쇄된다. 연속 배열은 Hardware Prefetch를 활용하고 SIMD 최적화가 가능하다. 단 Snapshot 생성 시점과 전송 완료 시점 사이 세션 상태 변화를 어떻게 처리할지 소유권 설계가 필요하다. 실제 선택은 순회 대 삭제 비율과 p99 측정으로 결정한다.

### Q6. Object Pool에서 Intrusive List로 Free 목록을 관리할 때, 반환 직후 다른 스레드가 같은 객체를 재할당해 사용하기 시작하는 ABA 문제가 발생했습니다. 어떻게 탐지하고 방지하나요?

ABA 문제는 CAS 기반 Lock-free 구조에서 주로 발생하며, 객체가 반환·재할당된 후 이전 포인터가 유효해 보이는 상태를 가리킨다. 탐지는 객체에 Generation 카운터를 두고 포인터와 함께 비교한다. 방지는 Tagged Pointer(포인터 하위 비트에 Generation 인코딩)나 Hazard Pointer를 사용하거나, 반환 시 I/O·참조 카운트가 0인지 확인한 뒤 Free 목록에 넣는 소유권 프로토콜을 적용한다.

## 10. 예상 꼬리질문
- LRU Cache의 Map과 List 불변식이 깨지면 어떤 증상이 나타나고, 어떻게 디버깅하나요?
- Object Pool의 Free 목록을 Intrusive List로 관리할 때 Pool 크기를 초과하는 요청이 폭발적으로 들어오면 어떻게 처리하나요?
- Active Session 배열에서 Swap-and-pop으로 삭제하면 순서가 바뀌는데, 순서 의존성이 있는 Broadcast에서는 어떻게 처리하나요?
- Sentinel Node를 사용하는 LRU Cache 구현에서 Head·Tail 경계 조건 버그가 발생했을 때 어떻게 재현하고 수정하나요?
- 게임 서버에서 연결 리스트 기반 자료구조의 p99 지연이 갑자기 올라갔을 때 가장 먼저 확인하는 지표는 무엇인가요?
- Intrusive List에서 같은 객체를 두 리스트에 동시에 넣어야 할 때 링크 세트를 어떻게 설계하나요?
- LRU Cache Eviction 대상을 Tail에서 꺼냈는데 해당 Key가 Map에 없는 불일치가 발생했습니다. 원인은 무엇인가요?

## 11. 30초 모범답변
> Linked List는 유효한 Node를 이미 알고 있을 때 삽입·삭제가 O(1)이지만 탐색은 O(N)이고 노드가 흩어져 Cache Miss가 빈번합니다. 게임 서버에서는 LRU Cache처럼 순서 갱신이 핵심인 구조에는 이중 연결 리스트와 HashMap을 조합하고, Active Session Broadcast처럼 순회가 압도적으로 많은 경우는 배열 Swap-and-pop을 선택합니다. 삭제 빈도만 보고 결정하지 않고 순회 대 삽입·삭제 비율과 p99를 먼저 측정합니다.

## 12. 1~2분 확장답변
> Linked List는 유효한 Node를 이미 알고 있을 때 삽입·삭제가 O(1)이지만, 탐색은 O(N)이고 노드가 메모리에 흩어져 Cache Miss가 연쇄됩니다.
>
> 게임 서버에서 선택 기준은 삭제 빈도만 보지 않고 순회 대 삽입·삭제 비율을 먼저 봅니다. 예를 들어 아이템 캐시에서 LRU Eviction이 필요하다면 HashMap과 이중 연결 리스트를 조합해 조회는 O(1), 순서 갱신·Eviction도 O(1)로 만듭니다. 이때 Map과 List의 불변식이 깨지지 않도록 동시 접근 시 같은 Lock으로 두 자료구조를 원자적으로 갱신합니다.
>
> Active Session 관리는 반대 판단입니다. 연결 종료 O(1) 삭제가 필요하더라도 매 틱 5만 세션을 Broadcast하는 순회가 더 빈번하다면 배열 Swap-and-pop이 Cache 친화적이어서 p99가 낮습니다. Object Pool의 Free 목록은 Intrusive List로 할당 비용을 줄이지만 반환 시 I/O가 아직 객체를 참조 중인지 확인하지 않으면 재사용 후 Use-after-free가 발생합니다. Generation 카운터로 이 문제를 방지합니다.
>
> 실제 선택은 원소 수, 순회·삽입·삭제 비율, p99 지연을 측정한 뒤 결정합니다.

## 13. 핵심 요약

- 연결 리스트는 각 Node가 값과 다음(또는 이전) Node 링크를 저장하는 비연속 구조다. 단일 리스트는 한 방향, 이중 리스트는 양방향 이동이 가능하다.
- O(1) 삽입·삭제는 "유효한 Node·Iterator를 이미 보유"한 전제가 있다. 위치 탐색은 O(N)이다.
- 이중 리스트는 prev 링크로 노드 자신만으로 O(1) 삭제가 가능하다. 단일 리스트는 이전 노드를 알아야 한다.
- Sentinel Node를 두면 경계(빈 리스트·첫/마지막 원소) 처리를 일반 노드와 동일한 코드로 단순화할 수 있다.
- LRU Cache는 HashMap(O(1) 조회)과 이중 연결 리스트(O(1) 순서 갱신·Eviction)의 조합으로 두 연산을 모두 O(1)로 만든다.
- 노드가 메모리에 흩어져 Cache Miss가 빈번하다. 순회가 잦은 서버에서는 배열·Handle 구조의 p99를 비교한다.
- 삭제된 노드의 주소는 해제되므로 참조가 안정적인 것은 살아있는 노드에만 적용된다.
- Intrusive List와 Object Pool 조합에서는 이중 반환·ABA 문제를 Generation과 명시적 소유권으로 방지해야 한다.

## 한 줄 정리
> Linked List는 Node 링크로 순서를 표현해 위치를 알고 있을 때 삽입·삭제가 O(1)이지만 탐색은 O(n)이고 Cache 지역성이 낮습니다.
