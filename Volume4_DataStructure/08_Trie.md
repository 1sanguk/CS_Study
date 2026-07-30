---
difficulty: 3
reading_time: 25분
interview_frequency: 4
importance: 4
---

# 08. Trie

> 게임 서버·백엔드 개발자를 위한 CS 면접 교재

## 학습 목표

- 자식 표현 방식(고정 배열 vs Hash Map)과 Prefix 공유율을 보고 메모리·속도 트레이드오프를 판단하고 적합한 구조를 선택할 수 있다.
- 자동 완성 후보 수(Subtree 크기)가 Prefix 길이만큼 O(|P|)가 아님을 인식하고, 결과 상한 K를 두어야 하는 이유와 구현 방법을 결정할 수 있다.
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

```java
// 게임 서버: 닉네임 자동완성 Trie
class TrieNode {
    Map<Character, TrieNode> children = new HashMap<>();
    boolean isTerminal = false; // 이 노드에서 Key가 끝나는지 표시
}

class NicknameTrie {
    private final TrieNode root = new TrieNode();

    void insert(String nickname) {
        TrieNode node = root;
        for (char c : nickname.toCharArray()) {
            node.children.computeIfAbsent(c, k -> new TrieNode());
            node = node.children.get(c);
        }
        node.isTerminal = true; // Terminal 표식 필수 — 없으면 경로는 있어도 Key 조회 실패
    }

    boolean search(String nickname) {
        TrieNode node = root;
        for (char c : nickname.toCharArray()) {
            node = node.children.get(c);
            if (node == null) return false;
        }
        return node.isTerminal; // 경로가 있어도 Terminal=false면 검색 실패
    }

    // Prefix로 시작하는 닉네임 최대 K개 반환 (Subtree 순회 비용 = O(K * avgLen))
    List<String> autocomplete(String prefix, int k) {
        TrieNode node = root;
        for (char c : prefix.toCharArray()) {
            node = node.children.get(c);
            if (node == null) return Collections.emptyList();
        }
        List<String> result = new ArrayList<>();
        collectDFS(node, new StringBuilder(prefix), result, k);
        return result;
    }

    private void collectDFS(TrieNode node, StringBuilder sb, List<String> result, int k) {
        if (result.size() >= k) return;
        if (node.isTerminal) result.add(sb.toString());
        for (Map.Entry<Character, TrieNode> entry : node.children.entrySet()) {
            sb.append(entry.getKey());
            collectDFS(entry.getValue(), sb, result, k);
            sb.deleteCharAt(sb.length() - 1);
        }
    }
}
```

자동완성 비용은 O(|Prefix|) + O(Subtree 크기)이므로 결과 상한 K 없이 호출하면 O(전체 Key 수)까지 탐색할 수 있다.

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
- **Trie는 Exact Match 속도가 Hash Table보다 항상 빠르다**: Trie의 검색 비용은 O(|Key|)이며 각 문자마다 포인터 추적과 Hash 조회가 발생한다. 단건 Exact Match만 필요하다면 Hash Table의 O(1) 평균이 Trie보다 빠를 수 있다. Trie는 Prefix 공유와 자동완성이 필요할 때 유리하다.
- **삭제는 Terminal 표식만 끄면 완료된다**: Terminal을 false로 바꿔도 해당 경로의 Node는 메모리에 남는다. 다른 Key가 해당 경로를 공유하지 않는다면 불필요한 Node가 메모리를 점유한다. 완전한 삭제를 위해 공유 여부를 확인하고 미사용 Node를 역방향으로 제거해야 한다.

## 13. 면접 질문

### Q1. 게임 서버에서 닉네임 자동완성 기능을 Hash Table 대신 Trie로 구현하려는 이유와, Trie 선택이 적절하지 않은 상황은 무엇인가?

Hash Table은 완전한 Key의 Exact Match에는 평균 O(1)이지만 Prefix로 시작하는 후보를 직접 열거하지 못합니다. 닉네임 자동완성처럼 "입력한 문자열로 시작하는 닉네임 목록"이 필요하면 Hash Table은 전체 Scan이 필요합니다. Trie는 Prefix 경로를 탐색 구조 자체에 내재해 O(|Prefix|)에 후보 위치를 찾고, 그 아래 Subtree를 순회해 후보를 반환합니다.

Trie가 적절하지 않은 상황은 Exact Match만 필요하거나 Key가 매우 드물고 Prefix 공유가 적은 경우입니다. 이 경우 Node와 자식 Container 할당 비용이 Hash Table보다 크며, Cache Miss도 늘어납니다. 또한 멀티바이트 Unicode 닉네임에 고정 배열 자식을 쓰면 메모리 낭비가 커지므로 Hash Map 자식 또는 압축 구조를 검토해야 합니다.

### Q2. 닉네임 수가 100만 개에서 1000만 개로 증가했을 때 자동완성 Trie의 메모리가 예상보다 빠르게 늘어났다. 원인을 어디서 찾겠는가, 그리고 어떻게 완화하겠는가?

닉네임 수 10배 증가 시 메모리가 단순 10배를 크게 넘는다면 Prefix 공유율이 낮거나 자식 표현이 비효율적인 경우가 많습니다. 먼저 노드 수와 평균 분기 수를 측정합니다. Hash Map 자식은 각 노드마다 Map 객체 자체의 오버헤드가 생기고, 닉네임에 한글·이모지가 포함되면 Code Point 범위가 넓어져 분기가 흩어지고 빈 공간 없이도 노드 수가 급증합니다.

완화 방법은 세 가지를 순서대로 검토합니다. 첫째, 단일 자식만 이어지는 경로(Prefix 공유 없는 긴 고유 닉네임)를 Radix Tree처럼 하나의 Edge 문자열로 압축합니다. 둘째, 조회 빈도가 낮은 닉네임을 Off-Process 검색 엔진(Elasticsearch 등)으로 위임하고 Trie에는 온라인 플레이어만 유지합니다. 셋째, 노드 풀을 Arena Allocator로 관리해 GC 압박과 Pointer 오버헤드를 줄입니다. 측정 없이 구조를 바꾸는 것은 위험하며, 노드 수·메모리·p95 지연을 모두 함께 봐야 합니다.

### Q3. Trie에 Key를 삽입할 때 Terminal 표식을 누락하면 어떤 버그가 생기는가? 실무에서 이 버그를 탐지하는 방법을 설명하라.

Terminal 표식을 누락하면 경로는 존재하지만 `search()`가 항상 false를 반환합니다. 게임 서버에서는 방금 삽입한 닉네임을 즉시 조회했을 때 "존재하지 않음"으로 응답하거나, 중복 닉네임 검사를 통과해 같은 닉네임이 두 계정에 등록되는 버그로 나타납니다.

실무 탐지 방법은 두 가지입니다. 첫째, 삽입 직후 동일 Key로 `search()`를 호출하는 Round-trip 단위 테스트를 작성합니다. 삽입 성공 후 조회 실패를 즉시 잡을 수 있습니다. 둘째, 운영 중이라면 삽입 API의 응답과 이후 조회 API의 응답을 로그로 남겨 "삽입 성공 + 조회 실패" 패턴이 발생하는지 모니터링합니다. Trie 구현체 교체나 리팩토링 직후에는 이 패턴이 특히 자주 나타납니다.

### Q4. 닉네임 자동완성 Trie의 자식 노드를 고정 배열로 구현했다가 Hash Map으로 교체하기로 결정했다면, 어떤 상황이 그 판단을 유도했겠는가? 반대로 Hash Map에서 고정 배열로 돌아가야 하는 상황은 무엇인가?

고정 배열에서 Hash Map으로 교체를 결정하는 신호는 크게 두 가지입니다. 닉네임에 한글·이모지·특수문자가 섞여 실제 사용 Code Point 범위가 Unicode 전체로 퍼진 경우, 고정 배열 크기를 Unicode 범위(0~0x10FFFF)로 잡으면 노드 하나에 수십만 슬롯이 생겨 사실상 사용 불가합니다. 또는 영문만 허용해도 분기가 희소해서(노드당 평균 자식 1~2개 수준) 배열 26개 중 대부분이 null인 상황입니다. 이때 메모리 프로파일러로 null 포인터가 전체 메모리의 60% 이상을 차지하면 교체 근거가 됩니다.

반대로 Hash Map에서 고정 배열로 돌아가야 하는 상황은 문자 집합이 확정적으로 작고 분기가 조밀한 경우입니다. 예를 들어 운영 명령어 자동완성처럼 영문 소문자+숫자만 허용하고, 짧은 명령 집합이라 Prefix 공유율이 높아 노드당 평균 자식이 10개 이상이면 배열의 O(1) 인덱스 접근과 CPU Cache 연속성이 Hash Map의 해시 계산·충돌 처리보다 유리합니다. 실제로 p95 자동완성 지연이 목표치(예: 5ms)를 초과할 때 두 구현을 벤치마킹해 결정합니다.

### Q5. 닉네임 자동완성에 Trie를 도입했는데 서버 배포 후 GC 중단 시간이 급증했다. Trie 구조와 관련 있다고 판단하는 근거는 무엇이고, 첫 번째로 어떤 지표를 확인하겠는가?

GC 중단이 Trie와 연관될 수 있는 근거는 Trie가 문자마다 노드 객체를 힙에 할당하기 때문입니다. 닉네임 100만 개에 평균 길이 8자라면 노드가 최대 수백만 개에 달하고, 자식을 Hash Map으로 구현했다면 Map 객체와 Entry 객체까지 함께 늘어납니다. 힙에 단명 객체(삽입·삭제 중 임시 노드)가 많으면 Minor GC 빈도와 Promotion 압박이 커집니다.

첫 번째로 확인할 지표는 힙 사용량 추이와 GC 로그의 Old Gen Promotion 속도입니다. 닉네임 등록 요청이 많은 시간대에 Old Gen이 빠르게 차면 Trie 노드가 Old Gen으로 Promotion되고 있다는 신호입니다. 그다음으로 Heap Dump를 떠서 `TrieNode` 인스턴스 수와 총 점유 메모리를 확인합니다. 문제 확인 후 완화 경로는 두 가지입니다. 노드 생명주기가 명확하다면 Arena/Object Pool로 GC 압박을 줄이거나, 자주 바뀌지 않는 닉네임은 Off-Heap 구조나 외부 인덱스로 위임하고 Trie에는 온라인 세션 닉네임만 유지합니다.

### Q6. 닉네임 자동완성 Trie에서 읽기(자동완성 조회)와 쓰기(닉네임 등록·삭제)가 동시에 발생할 때 어떤 동시성 전략을 선택하겠는가? 각 전략의 적합 조건을 설명하라.

동시성 전략은 읽기·쓰기 비율과 쓰기 빈도에 따라 세 가지 경로로 나뉩니다.

첫째, 읽기가 압도적으로 많고 쓰기가 드문 경우(예: 운영 명령어 Trie)에는 Immutable Snapshot 교체가 가장 단순합니다. 쓰기 요청이 올 때마다 전체 Trie를 새로 빌드하거나 Deep Copy해서 Atomic Reference를 교체하면, 읽기 스레드는 Lock 없이 이전 Snapshot을 계속 참조합니다. 빌드 비용이 허용 범위인지가 판단 기준입니다.

둘째, 닉네임 등록이 자주 발생하는 경우(로그인마다 Trie 갱신)에는 ReadWriteLock이 현실적입니다. 읽기는 다수가 동시에 가능하고 쓰기만 독점합니다. 단, 쓰기 중 읽기가 블로킹되므로 p99 자동완성 지연에 직접 영향을 줍니다. 쓰기 시간을 최소화하는 것이 핵심입니다.

셋째, 쓰기가 잦고 지연 허용치가 작으면 Copy-on-Write 또는 Lock-free 구조를 검토합니다. 노드 단위 CAS나 구조를 불변 Persistent 자료구조로 관리하면 읽기 지연 영향을 최소화할 수 있지만 구현 복잡도가 높습니다. 실무에서는 먼저 ReadWriteLock으로 구현하고 p99 지연과 Lock 경합을 측정한 후 필요하면 다음 단계로 넘어갑니다.

## 14. 예상 꼬리질문

- 닉네임에 한글·이모지가 포함될 때 Java의 `toCharArray()`로 분리하면 어떤 버그가 생기나요? 올바른 처리 방법은 무엇인가요?
- 자동완성 상위 K개를 반환할 때 인기순(점수순) 정렬이 필요하다면 Trie 구조를 어떻게 바꿔야 하나요? 삽입 비용은 어떻게 달라지나요?
- Radix Tree로 전환을 결정하는 기준은 무엇인가요? 어떤 측정 지표가 임계점을 넘었을 때 전환을 고려하나요?
- 닉네임 변경 요청이 초당 1000건 이상 들어올 때 단일 Trie에서 Lock 경합이 문제가 된다면 어떤 구조 변경을 검토하나요?
- `app`과 `apple`이 함께 저장된 Trie에서 `app`을 삭제할 때 Terminal 표식만 끄는 방식과 노드까지 제거하는 방식의 차이가 실제 서비스에서 언제 문제가 되나요?
- 자동완성 결과 상한 K를 서버에서 강제하지 않으면 어떤 장애 시나리오가 생기나요?
- 닉네임 Trie를 단일 프로세스 메모리에만 두면 서버 재시작 시 어떤 문제가 생기고, 어떻게 복구 전략을 설계하나요?
- 금칙어 필터에 Trie를 쓰는 것과 Aho-Corasick을 쓰는 것의 차이가 실제로 드러나는 상황은 무엇인가요?

## 15. 30초 모범답변

> Trie는 공통 Prefix를 경로로 공유해 자동완성과 Prefix 검색에 유리한 구조입니다. Hash Table이 Prefix 범위를 직접 열거하지 못하는 반면, Trie는 O(|Prefix|)에 후보 위치를 찾습니다. 단, 닉네임에 한글·이모지가 섞이면 자식 표현을 Hash Map으로 바꿔야 하고 노드 수가 빠르게 늘어납니다. 메모리가 기대보다 빠르게 증가하면 단일 자식 경로 압축(Radix Tree 전환)이나 온라인 세션 닉네임만 Trie에 유지하는 범위 제한을 검토합니다.

## 16. 1~2분 확장답변

> Trie는 Root부터 문자나 Token을 하나씩 따라가며 문자열을 저장하고, 같은 Prefix를 가진 Key는 경로를 공유합니다. 모든 문자를 소비했을 때 Terminal 표식을 확인해 완전한 Key와 단순 Prefix를 구분합니다. 검색·삽입·삭제는 문자열 길이 `L`에 비례하지만 자동완성은 Prefix Node 아래 후보를 순회하는 비용이 추가되므로 결과 상한 K를 반드시 설정합니다. K 없이 Subtree를 전부 순회하면 특정 짧은 Prefix에서 O(전체 Key 수)가 될 수 있습니다.
>
> 자식 표현 선택이 핵심 트레이드오프입니다. 영문 소문자 26자처럼 문자 집합이 작고 분기가 조밀하면 고정 배열이 O(1) 인덱스 접근으로 Cache 효율이 좋습니다. 한글·이모지가 포함되면 Code Point 범위가 넓어져 고정 배열이 불가하고 Hash Map을 써야 합니다. 이때 Java의 `toCharArray()`는 char 단위(UTF-16 코드 단위)로 분리하므로 이모지 같은 Surrogate Pair 문자가 두 개로 쪼개지는 버그가 생깁니다. `codePoints()` 스트림이나 ICU4J의 `UCharacterIterator`로 처리해야 합니다.
>
> 동시성은 읽기/쓰기 비율로 전략을 고릅니다. 운영 명령어처럼 쓰기가 드물면 Immutable Snapshot을 빌드해 Atomic Reference로 교체하면 읽기에 Lock이 없습니다. 닉네임처럼 쓰기가 빈번하면 ReadWriteLock으로 시작해 p99 지연과 Lock 경합을 측정한 뒤, 문제가 있으면 Copy-on-Write나 단일 Writer 구조로 이동합니다. 메모리 급증 시에는 노드 수와 평균 분기 수를 먼저 측정하고, 단일 자식 경로가 많으면 Radix Tree 압축, 대부분이 오프라인 계정이면 Trie 대상 범위를 온라인 세션으로 제한하는 순서로 접근합니다.

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
