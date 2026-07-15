---
difficulty: 3
reading_time: 25분
interview_frequency: 4
importance: 4
---

# 08. Trie

> 게임 서버·백엔드 개발자를 위한 CS 면접 교재

## 학습 목표

- Trie가 문자열 Key의 Prefix를 공유하는 원리를 설명할 수 있다.
- 검색·삽입·삭제·자동 완성의 동작과 복잡도를 설명할 수 있다.
- 자식 저장 방식과 압축 Trie의 메모리 Trade-off를 비교할 수 있다.
- 닉네임 검색, 명령 자동 완성, IP Routing 사례에 적합성을 판단할 수 있다.

## 1. 개요

Trie는 문자열이나 Token Sequence를 한 단위씩 Edge로 나눠 저장하는 Tree다. 같은 Prefix를 가진 Key는 Root부터 같은 경로를 공유한다. 이름은 Retrieval에서 유래했으며 보통 “트라이”라고 읽는다.

`game`, `gate`, `go`를 저장하면 다음과 같다.

```text
            root
              |
              g
            /   \
           a     o*
         /   \
        m     t
        |     |
        e*    e*

* = 단어 종료 표시
```

`ga` 경로는 `game`과 `gate`가 공유한다. `go`의 마지막 노드는 단어 종료 표시를 가진다. 종료 표식이 없으면 어떤 경로가 완전한 Key인지 알 수 없다. 예를 들어 `app`과 `apple`을 함께 저장할 때 `app`의 마지막 `p`는 자식이 있으면서 동시에 종료 노드다.

## 2. 왜 필요한가

Hash Table은 완전한 문자열의 정확한 조회에는 평균적으로 효율적이지만 “`ga`로 시작하는 모든 Key”를 직접 제공하지 않는다. 정렬 배열이나 균형 Tree도 Prefix의 시작 위치를 찾아 범위를 순회할 수 있지만, Trie는 Prefix 자체를 탐색 경로로 표현한다.

Trie의 대표 강점은 다음과 같다.

- 저장된 Key 수보다 입력 문자열 길이에 비례해 경로를 찾는다.
- Prefix 존재 여부와 자동 완성 후보 위치를 바로 찾는다.
- 공통 Prefix를 구조적으로 공유한다.
- 사전순 순회, Longest Prefix Match 같은 연산을 자연스럽게 지원한다.

반면 노드가 문자마다 생성될 수 있고 각 노드가 자식 Container를 가져 메모리 비용이 크다. Exact Match만 필요하거나 데이터가 작다면 Hash Set이나 정렬 배열이 더 단순할 수 있다.

## 3. 핵심 구조

Trie Node는 보통 다음 정보를 가진다.

- 다음 문자에서 이동할 자식 참조
- 현재 경로가 완전한 Key인지 나타내는 `isTerminal`
- 필요하면 해당 Key의 값, 출현 횟수, 추천 점수

문자는 Node에 저장할 수도, Edge 의미로 볼 수도 있다. 핵심은 Root부터 내려가는 경로가 Prefix를 나타낸다는 점이다.

```text
class TrieNode
    children: character -> TrieNode
    isTerminal: bool
    value: optional
```

문자 집합이 영문 소문자 26개로 제한되면 고정 배열 `children[26]`을 사용할 수 있다. 자식 접근이 빠르고 단순하지만 대부분의 칸이 비면 메모리를 낭비한다. Unicode나 넓은 문자 집합에는 Hash Map 또는 정렬된 작은 Vector를 사용할 수 있다.

## 4. 검색과 삽입

### Exact Search

Root에서 입력의 각 문자를 읽고 해당 자식으로 이동한다. 경로가 없으면 실패한다. 모든 문자를 소비한 뒤 마지막 노드의 종료 표식이 참이어야 Exact Match다.

```text
search("game")
root → g → a → m → e
모든 경로 존재 + e가 Terminal → 성공

search("gam")
경로는 존재하지만 m이 Terminal 아님 → Exact Match 실패
```

Prefix 검색은 마지막 종료 표식을 요구하지 않는다. `startsWith("gam")`은 경로만 존재하면 성공이다. 두 동작을 혼동하면 완전한 닉네임 검증에서 존재하지 않는 Prefix를 실제 닉네임으로 판단할 수 있다.

### Insert

각 문자를 따라가며 자식이 없으면 새 Node를 만든다. 마지막 Node에 종료 표식을 설정하고 값을 저장한다. 문자열 길이를 `L`이라 하면 검색과 삽입은 자식 조회 비용을 제외하고 `O(L)`이다.

고정 배열 자식 조회는 `O(1)`이고 Hash Map은 평균 `O(1)`이다. 정렬 Map이면 문자마다 `O(log σ)`가 들 수 있다. 여기서 `σ`는 가능한 자식 수다. 따라서 `O(L)`이라는 설명에는 자식 접근이 상수 시간이라는 전제가 있다.

## 5. 삭제

삭제는 종료 표식만 끄는 것으로 논리적으로 완료할 수 있다. 하지만 더 이상 어떤 Key에도 쓰이지 않는 Node를 정리하지 않으면 메모리가 남는다.

```text
저장 Key: game, gate
game 삭제

root-g-a
       ├─m-e*  ← 다른 Key가 사용하지 않으므로 제거 가능
       └─t-e*  ← gate가 사용하므로 유지
```

재귀적으로 마지막 문자까지 내려가 종료 표식을 끈 뒤 돌아오면서 다음 조건을 모두 만족하는 Node만 제거한다.

1. 자식이 없다.
2. 다른 Key의 종료 Node가 아니다.
3. 삭제 대상 외 다른 Key가 공유하지 않는다.

`app`과 `apple` 중 `app`을 삭제할 때 `app`의 Node를 제거하면 `apple` 경로도 사라진다. 이 경우 종료 표식만 끄고 Node는 유지해야 한다. 삭제도 최대 `L`개 Node를 방문하므로 `O(L)`이다.

## 6. 자동 완성과 결과 비용

Prefix `P`의 Node까지 `O(|P|)`에 이동한 뒤 그 아래 Subtree를 순회해 Terminal Node를 모으면 자동 완성 후보가 된다. 후보 생성까지 포함한 비용은 단순히 `O(|P|)`가 아니다.

```text
Prefix Node 찾기: O(|P|)
후보 탐색: 방문한 Subtree Node 수
결과 반환: 최소 O(K), K는 반환 Key 수
```

후보가 매우 많으면 전체 순회가 비싸다. 상위 `K`개만 필요하다면 Node마다 인기 후보, 최대 점수, 상위 결과 Cache 같은 보조 정보를 둘 수 있다. 조회는 빨라지지만 Key 삽입·삭제나 점수 변경 때 조상 Node의 Cache를 갱신해야 한다.

사전순 결과가 필요하면 자식을 문자순으로 방문한다. Hash Map 자식은 순서를 보장하지 않으므로 매번 정렬하거나 정렬 Container를 사용해야 한다. 요구하는 출력 순서까지 자료구조 설계에 포함해야 한다.

## 7. 메모리 사용과 압축

Trie의 시간 복잡도는 Key 개수 `N`보다 길이 `L`에 좌우되지만 공간은 저장된 모든 문자의 합에 비례할 수 있다. Prefix 공유가 적고 문자열이 길면 Node 수가 커진다. Node마다 큰 고정 자식 배열을 두면 실제 문자보다 빈 Pointer가 메모리 대부분을 차지할 수 있다.

자식 표현은 데이터 특성에 맞춰 선택한다.

| 자식 표현 | 장점 | 단점 | 적합한 상황 |
|---|---|---|---|
| 고정 배열 | 빠른 Index 접근 | 빈 칸 메모리 낭비 | 작은 고정 Alphabet, 조밀한 분기 |
| Hash Map | 희소 분기 절약, 평균 빠른 조회 | Hash·할당 비용, 순서 없음 | 넓은 문자 집합 |
| 정렬 Vector | 작은 분기에서 Compact·Cache 유리 | 검색·삽입 비용 | 읽기 위주, 자식 수가 작음 |
| 균형 Tree | 정렬 순회, 최악 시간 | Pointer·비교 비용 | 자식 정렬과 동적 갱신 |

Radix Tree 또는 Patricia Trie는 자식이 하나뿐인 연속 경로를 하나의 문자열 Edge로 압축한다.

```text
일반 Trie:   root → c → o → m → p → u → t → e*
압축 Trie:   root ──"compute"──> *
```

Node와 Pointer 수는 줄지만 Edge 문자열 안에서 공통 Prefix를 비교하고 삽입 시 Edge를 분할해야 한다. IP Routing의 Longest Prefix Match에는 Bit 단위 Patricia Trie가 사용될 수 있다.

## 8. Unicode와 정규화

사용자가 보는 한 글자와 내부 Code Point 또는 Byte가 항상 같지는 않다. UTF-8 Byte 단위 Trie, Unicode Code Point 단위 Trie, 사용자 인식 문자 단위 Trie는 구조와 길이 의미가 다르다.

같아 보이는 문자열이 서로 다른 Unicode 조합으로 표현될 수도 있다. 닉네임 검색에서 대소문자 무시, Unicode 정규화, Locale 규칙을 적용한다면 삽입과 검색 전에 동일한 Canonicalization Pipeline을 거쳐야 한다. 그렇지 않으면 화면상 같은 이름이 다른 경로에 저장된다.

정규화 방식은 제품 정책이며 원본 표시 문자열을 별도로 보관할 수 있다. 보안이 중요한 닉네임에는 유사 문자, 금지 Script 조합 같은 별도 정책도 필요하다. Trie 자체가 문자열 보안 문제를 해결해 주지는 않는다.

## 9. 비슷한 구조와 비교

| 요구 | Trie | Hash Table | 정렬 배열·균형 Tree |
|---|---|---|---|
| Exact Match | O(L) | 평균 O(L), Hash 계산 포함 | 비교 횟수 × 문자열 비교 |
| Prefix 존재 | 직접 지원 | 직접 지원 안 함 | 경계 검색으로 가능 |
| 자동 완성 | Prefix Subtree 순회 | 전체 Scan 필요 | Prefix 범위 순회 |
| 사전순 | 자식 순서에 따라 자연스러움 | 보장 없음 | 자연스러움 |
| 메모리 | Node·자식 구조가 큼 | Entry 중심 | Key와 Tree·배열 비용 |

Trie가 Exact Search에서 “무조건 Hash보다 빠르다”고 할 수 없다. 둘 다 문자열을 읽어야 하며, Trie는 많은 Pointer 추적과 Node 할당으로 Cache Miss가 늘 수 있다. 실제 Key 길이, Prefix 공유율, 문자 집합과 조회 패턴으로 측정한다.

금칙어 여러 개를 긴 채팅에서 찾는 문제는 각 시작 위치마다 단순 Trie를 다시 탐색하면 비효율적이다. Aho-Corasick은 Trie에 실패 링크를 추가해 여러 Pattern을 한 번의 Streaming 탐색으로 찾는다. Prefix 자동 완성과 다중 부분 문자열 검색은 다른 요구다.

## 10. 장점과 단점

### 장점

- 문자열 길이에 비례해 Exact·Prefix 경로를 찾는다.
- 공통 Prefix를 공유하며 자동 완성과 Longest Prefix Match를 직접 표현한다.
- Hash 충돌과 무관하게 경로 기반 탐색이 가능하다.
- 자식 순서를 유지하면 사전순 열거가 자연스럽다.

### 단점

- 문자마다 Node가 생겨 Pointer와 Allocator 비용이 클 수 있다.
- 넓은 문자 집합에서 고정 자식 배열은 메모리를 크게 낭비한다.
- Pointer 추적으로 Cache 지역성이 나쁠 수 있다.
- 결과가 많은 Prefix Query는 Subtree 순회 비용이 크다.
- Unicode 정규화와 동시성은 별도로 설계해야 한다.

## 11. 게임 서버·백엔드 실무 예시

### 운영 명령 자동 완성

게임 운영 Console에 `player ban`, `player inspect`, `party reset` 같은 명령을 Trie에 저장할 수 있다. 입력 Token 또는 문자 Prefix의 Node까지 이동하고 그 아래 Terminal을 제한된 개수만 반환한다. 명령 목록이 배포 시에만 바뀐다면 Immutable Trie를 만들어 Lock 없이 읽는 방식도 가능하다.

### 닉네임 Prefix 검색

온라인 플레이어 닉네임 자동 완성에 Trie를 쓸 수 있다. 다만 전체 계정 수가 매우 크고 서버가 여러 Shard에 나뉘면 단일 Process 메모리 Trie만으로 끝나지 않는다. 검색 전용 Index, 결과 상한, 인기순 정책, 개인정보 노출 범위를 함께 설계해야 한다.

닉네임 변경이 있으면 이전 Key를 삭제하고 정규화된 새 Key를 삽입한다. 조회 Thread와 갱신 Thread가 동시에 Node를 수정하면 잘못된 Pointer나 중간 상태를 볼 수 있으므로 Lock, Copy-on-Write, Snapshot 교체, 단일 Writer 등 소유권 정책이 필요하다.

### 금칙어와 Routing

입력 문자열이 특정 금칙어로 시작하는지만 확인하면 Trie로 충분하다. 채팅 어느 위치에든 포함된 다수 금칙어를 찾으려면 Aho-Corasick을 고려한다. IP Routing에서는 주소 Bit를 따라가며 가장 마지막으로 만난 Terminal Prefix를 기억해 Longest Prefix Match를 수행할 수 있다.

운영에서는 Node 수, 평균 분기 수, 메모리, Prefix별 후보 수, p95·p99 검색 지연과 갱신 비용을 측정한다. 이 지표 없이 Big-O만으로 자식 표현을 정하지 않는다.

## 12. 자주 하는 오해

- **경로가 존재하면 완전한 Key도 존재한다**: 마지막 Node의 Terminal 표식을 확인해야 한다.
- **Trie 검색은 Key 개수와 완전히 무관하다**: 경로 길이는 L이지만 결과 열거와 메모리는 데이터 양의 영향을 받는다.
- **모든 Node에 Alphabet 크기 배열을 두는 것이 가장 빠르다**: 희소하거나 Unicode라면 메모리와 Cache 비용이 더 클 수 있다.
- **Trie는 전체 문자열에서 다중 Pattern을 자동으로 찾는다**: 단순 Trie와 Aho-Corasick의 요구를 구분해야 한다.
- **Unicode 문자열은 화면의 글자 단위로 자동 분리된다**: 저장 단위와 정규화 정책을 명시해야 한다.
- **자동 완성 비용은 항상 O(Prefix 길이)다**: 후보 Subtree 탐색과 K개 반환 비용이 추가된다.

## 13. 면접 질문

### Q1. Trie를 설명해 주세요.

Trie는 문자열의 문자 또는 Token을 Edge로 저장하고 같은 Prefix의 경로를 공유하는 Tree입니다. Root부터 문자열 길이만큼 이동해 Exact Match와 Prefix 검색을 수행하며, 완전한 Key는 Terminal 표식으로 구분합니다.

### Q2. 검색·삽입·삭제 복잡도는 얼마인가요?

문자열 길이를 `L`이라 하면 자식 조회가 상수 시간일 때 각각 `O(L)`입니다. 자동 완성은 Prefix Node 탐색 외에 후보 Subtree 방문과 결과 `K`개 반환 비용이 추가됩니다.

### Q3. Exact Search와 Prefix Search의 차이는 무엇인가요?

둘 다 입력 경로가 존재해야 합니다. Exact Search는 마지막 Node가 Terminal이어야 하고 Prefix Search는 경로 존재만 확인합니다. `apple`만 저장된 Trie에서 `app`은 Prefix지만 Exact Key는 아닐 수 있습니다.

### Q4. Trie의 메모리 사용을 줄이는 방법은 무엇인가요?

고정 자식 배열 대신 Hash Map이나 작은 정렬 Vector를 사용하고, 자식이 하나인 연속 경로는 Radix Tree처럼 하나의 Edge로 압축할 수 있습니다. Arena Allocation이나 Compact Index 표현도 Pointer·할당 비용을 줄일 수 있습니다.

### Q5. Trie와 Hash Table을 어떻게 선택하나요?

Exact Match만 중요하면 Hash Table이 더 단순하고 메모리 효율적일 수 있습니다. Prefix 존재, 자동 완성, 사전순 열거, Longest Prefix Match가 핵심이면 Trie가 적합합니다. 실제 Key 분포와 메모리를 측정해 결정합니다.

### Q6. Trie 삭제에서 주의할 점은 무엇인가요?

종료 표식을 끈 뒤 자식이 없고 다른 Key의 Terminal도 아닌 Node만 역방향으로 제거해야 합니다. 공유 Prefix Node를 지우면 다른 Key까지 손상됩니다.

## 14. 예상 꼬리질문

- 고정 배열과 Hash Map 자식 표현의 Trade-off는 무엇인가요?
- Radix Tree는 일반 Trie와 어떻게 다른가요?
- 자동 완성 상위 K개를 빠르게 반환하려면 무엇을 추가할 수 있나요?
- 같은 Prefix를 가진 Key 삭제 시 어떤 Node를 남겨야 하나요?
- Unicode 닉네임 저장 전에 어떤 정규화가 필요한가요?
- Aho-Corasick은 단순 Trie에 무엇을 추가하나요?
- 동시 읽기와 갱신은 어떻게 보호할 수 있나요?

## 15. 30초 모범답변

> Trie는 문자열을 문자별 경로로 저장해 같은 Prefix를 공유하는 Tree입니다. 자식 조회가 상수 시간이라면 길이 `L`의 Key를 `O(L)`에 검색·삽입하며 Prefix 검색과 자동 완성에 유리합니다. 다만 문자마다 Node와 자식 구조가 필요해 메모리 비용이 크므로 희소 Map이나 압축 Trie를 고려합니다. 게임 서버에서는 명령이나 닉네임 자동 완성에 활용할 수 있습니다.

## 16. 1~2분 확장답변

> Trie는 Root부터 문자나 Token을 하나씩 따라가며 문자열을 저장하고, 같은 Prefix를 가진 Key는 경로를 공유합니다. 모든 문자를 소비했을 때 Terminal 표식을 확인해 완전한 Key와 단순 Prefix를 구분합니다. 검색·삽입·삭제는 문자열 길이 `L`에 비례하지만 자동 완성은 Prefix Node 아래의 후보를 순회하는 비용이 추가됩니다.
>
> 가장 큰 Trade-off는 메모리입니다. 작은 고정 Alphabet은 자식 배열이 빠르지만 빈 Pointer를 낭비하고, Unicode처럼 범위가 넓으면 Hash Map이나 작은 Vector가 적합할 수 있습니다. 한 자식만 이어지는 경로는 Radix Tree로 압축할 수 있습니다. Exact Match만 필요하면 Hash Table이 단순하지만 Prefix 자동 완성, 사전순 열거, Longest Prefix Match가 중요하면 Trie가 강점이 있습니다. 실무에서는 정규화, 결과 상한, 갱신 동시성과 실제 Node 수까지 함께 설계합니다.

## 17. 핵심 요약

- Trie는 문자·Token별 경로를 만들고 공통 Prefix를 공유한다.
- 완전한 Key는 Terminal 표식으로 단순 Prefix와 구분한다.
- 자식 조회가 상수 시간일 때 검색·삽입·삭제는 Key 길이 `O(L)`이다.
- 자동 완성에는 Prefix 탐색 외에 Subtree 방문과 결과 반환 비용이 든다.
- 고정 배열은 빠르지만 희소 데이터에서 메모리를 낭비하며 Map·Vector와 Trade-off가 있다.
- Radix Tree는 한 자식 경로를 압축해 Node 수를 줄인다.
- Exact Match 중심은 Hash, Prefix·자동 완성 중심은 Trie를 우선 검토한다.
- Unicode 정규화, 결과 상한, 동시성은 Trie 외부의 필수 설계다.

## 한 줄 정리

> Trie는 공통 Prefix를 경로로 공유해 문자열 길이에 비례한 검색을 제공하지만, 그 대가로 Node와 자식 표현의 메모리 비용을 지불한다.
