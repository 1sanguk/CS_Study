---
difficulty: 2
reading_time: 25분
interview_frequency: 5
importance: 5
---

# 02. Primitive·Reference Type과 String·Immutability


## 학습 목표

- 게임 Tick Broadcast 시 Mutable Position 객체를 Snapshot과 공유했을 때 어떤 버그가 발생하는지 파악하고, Immutable DTO(record)로 전환해야 하는 시점을 결정할 수 있다.
- GC(Garbage Collection) 지표에서 단수명 Integer 객체 Allocation이 급증할 때, JFR(Java Flight Recorder) Allocation Profiling으로 Hot Path Autoboxing을 확인하고 Primitive 전용 컬렉션 도입 여부를 판단할 수 있다.
- Immutable 클래스 설계에서 final Field 선언만으로는 불충분한 시나리오를 식별하고, Defensive Copy(생성자)와 Unmodifiable View(Getter)를 적용해야 하는 지점을 결정할 수 있다.
- Integer == 비교가 Cache 범위(-128~127) 밖에서 간헐적 버그를 유발하는 코드를 발견했을 때, 운영 영향 범위를 추정하고 equals 전환 우선순위를 결정할 수 있다.

## 1. 개요

Java Primitive Type은 값 자체를 표현하고 Reference Type 변수는 Heap 객체를 가리키는 참조 값을 보관한다.

## 2. 왜 필요한가

복사·동등성·Null·Memory와 변경 가능성을 정확히 이해해야 객체 상태 오류와 불필요한 Allocation을 줄일 수 있다.

## 3. 핵심 동작 원리

```text
primitive variable → value copy / reference variable → reference copy → shared object
```

이 흐름은 Primitive·Reference Type과 String·Immutability의 주요 처리 단계와 책임 경계를 나타낸다. 각 단계의 입력과 출력, 실패 시 복구 위치를 구분해야 한다.

### Primitive Type 종류와 범위

Java에는 boolean, byte, short, int, long, char, float, double의 Primitive Type이 있다. 크기와 숫자 승격 규칙을 알아야 Overflow와 비교 오류를 피할 수 있다. boolean의 구체적인 Memory 배치는 JVM 구현 대상이므로 Source 수준 규칙과 내부 배치를 구분한다.

### Reference 복사와 Pass-by-value

Reference 변수를 대입하면 객체 전체가 복사되는 것이 아니라 같은 객체를 가리키는 참조 값이 복사된다. 한 경로로 Mutable 객체를 바꾸면 다른 참조에서도 변경이 보인다. Method 인자도 항상 Pass-by-value이며 Reference가 값으로 전달되는 것이다.

### String Immutability와 StringBuilder

String은 Immutable이라 생성 뒤 내부 문자 Sequence가 바뀌지 않는다. 이 특성은 Hash Key 안정성, 공유와 Thread Safety에 유리하다. 문자열 결합이 반복되는 Loop에서는 중간 String이 많이 생길 수 있어 StringBuilder를 고려한다.

### String Pool과 동등성 비교

String Pool은 동일한 Literal을 재사용할 수 있다. new String으로 만든 객체와 Literal은 내용이 같아도 Identity가 다를 수 있다. 문자열 내용은 equals로 비교하고 ==는 같은 객체 참조인지 확인한다.

### Immutable 객체 설계와 Defensive Copy

Immutable 객체는 Field를 final로 두는 것만으로 완성되지 않는다. Constructor에서 Mutable Collection을 그대로 보관하거나 Getter로 내부 List를 반환하면 외부에서 상태를 바꿀 수 있다. Defensive Copy와 불변 Collection을 사용한다.

### Wrapper Type과 Autoboxing 주의점

Wrapper Type은 Collection과 Generic에서 Primitive 값을 객체로 다룰 수 있게 한다. Autoboxing은 편리하지만 Allocation, Null Unboxing과 == Cache 범위 오해를 만든다. Hot Path에서는 Boxing 발생 여부를 Profile한다.

### 값과 객체를 다루는 기준

- **대입과 인자 전달**: Primitive는 값을 복사하고 Reference 변수는 참조 값을 복사한다. Method가 Parameter에 새 객체를 대입해도 호출자의 변수가 바뀌지 않지만 같은 Mutable 객체의 Field를 변경하면 호출자도 본다.
- **동등성**: Identity가 필요한 Entity와 값 동등성이 필요한 Value Object를 구분한다. equals를 Override하면 같은 값에 같은 hashCode가 나오도록 구현하고 Mutable Field를 Hash Key에 사용하지 않는다.
- **String 연산**: 짧은 상수 결합은 Compiler가 최적화할 수 있지만 Runtime Loop 결합은 중간 객체를 만들 수 있다. StringBuilder도 Thread 간 공유보다 요청 Scope에서 사용한다.
- **불변 객체**: Constructor에서 입력을 검증하고 Mutable 인자를 복사한다. Getter는 내부 Collection을 그대로 노출하지 않고 불변 View나 Copy를 반환한다.
- **Wrapper 주의점**: Integer가 Null일 때 int로 Unboxing하면 NullPointerException이 발생한다. Wrapper의 == 결과를 Cache 범위에 기대지 않고 값 비교에는 equals를 사용한다.
- **숫자 안전성**: int 곱셈이 Overflow한 뒤 long에 대입해도 이미 값이 깨졌다. 연산 전에 long으로 승격하고 재화·시간의 최대 범위를 계산한다.

### 게임 서버 점검 예시

PlayerSnapshot이 Mutable Inventory List를 그대로 보유하면 Snapshot 전송 전 원본 변경이 Packet 내용까지 바꿀 수 있다. Snapshot 생성 시 필요한 값만 복사하고 생성 뒤 상태를 변경하지 않는다. Profile에서 Boxing과 문자열 Allocation이 실제 Hot Path인지 확인한 뒤 Primitive 전용 구조나 Buffer API(Application Programming Interface)를 검토한다.

## 4. 쉬운 예시

Mutable 객체를 여러 Session이 공유할 때 발생하는 버그와 Immutable DTO로 수정하는 방법을 보여주는 예시다.

```java
// 문제: Mutable Position을 Snapshot과 공유
class Position { public float x, y; }

Position pos = player.getPosition(); // Mutable 참조 공유
Snapshot snapshot = new Snapshot(pos); // 같은 객체 참조
pos.x = 999f;                          // Tick 갱신
// snapshot.pos.x도 999f → Packet에 잘못된 좌표 전송!

// 수정: Immutable DTO로 값 복사
record PositionDTO(float x, float y) {} // Java 16+, 불변 레코드

PositionDTO dto = new PositionDTO(pos.x, pos.y); // 생성 시 값 복사
Snapshot snapshot = new Snapshot(dto);
pos.x = 999f; // dto는 영향 없음 → Packet 내용 보호

// Pass-by-value 확인
void resetPosition(Position p) {
    p.x = 0; p.y = 0;      // ← Mutable 객체 내부 변경 → 호출자도 본다
    p = new Position();      // ← Parameter 재대입 → 호출자 변수 영향 없음
}

// String 비교 함정
String a = "hello";
String b = new String("hello");
System.out.println(a == b);       // false: 다른 객체 참조
System.out.println(a.equals(b)); // true: 값 동등성

// Integer Cache 범위 함정
Integer x = 127, y = 127;
System.out.println(x == y); // true: Cache 범위(-128~127)
Integer m = 128, n = 128;
System.out.println(m == n); // false: Cache 범위 초과 → 새 객체

// Defensive Copy 없이 Immutable 설계 실패
class ImmutableOrder {
    private final List<Item> items;
    ImmutableOrder(List<Item> items) {
        this.items = items;           // ← 버그: 외부 List 직접 보관
    }
    List<Item> getItems() { return items; } // ← 버그: 내부 노출
}
// 수정: Defensive Copy + Unmodifiable View
ImmutableOrder(List<Item> items) {
    this.items = List.copyOf(items);  // 방어 복사
}
List<Item> getItems() { return Collections.unmodifiableList(items); }

// int Overflow → long 승격 함정
int a = Integer.MAX_VALUE;
long result = a * 2;           // 이미 int 범위에서 Overflow 발생!
long safe = (long) a * 2;     // 올바른 승격: 연산 전에 long으로 캐스트
```

## 5. 비슷한 개념과 비교

| 구분 | Primitive | Wrapper (Integer 등) | String | Immutable Object |
|---|---|---|---|---|
| Null 허용 | 불가 | 가능 | 가능 | 가능 |
| Generic 사용 | 불가 | 가능 | 가능 | 가능 |
| Boxing 비용 | 없음 | 있음 (Autoboxing) | 없음 | 없음 |
| 동등성 비교 | == (값) | equals (값) / ==는 Cache 범위만 | equals (내용) | equals Override 필요 |
| Thread Safety | 해당 없음 | Mutable 상태 없음 | Thread-safe (불변) | 불변 설계 시 Thread-safe |
| Hash Key 안전성 | 안전 | 안전 | 안전 (불변) | 불변 설계 시 안전 |
| 게임 서버 용도 | 좌표·HP 등 Hot Path | Map Key·Optional 값 | 채널명·플레이어 ID | Snapshot DTO·이벤트 |

## 6. 장점과 단점

**Immutable 객체 설계의 장점:**
- 공유 상태 변경으로 인한 버그(Race Condition, Snapshot 오염)를 구조적으로 방지한다.
- equals·hashCode 구현이 안정적이어서 Hash Key로 안전하게 사용할 수 있다.
- Thread Safety를 별도 동기화 없이 확보할 수 있어 동시성 설계가 단순해진다.
- 방어 복사 없이 공유할 수 있어 함수 간 데이터 전달이 명확해진다.

**Immutable 객체 설계의 단점:**
- 상태 변경이 필요할 때마다 새 객체를 생성해 GC 부담이 증가할 수 있다.
- Defensive Copy 비용으로 초기화가 느려질 수 있다.
- 대용량 컬렉션을 불변으로 관리하면 복사 비용이 크다.
- Primitive 배열은 final 선언만으로 불변이 되지 않아 별도 처리가 필요하다.

## 7. 게임 서버·백엔드 실무 예시

게임 서버 Tick에서 Player 위치를 Snapshot에 담아 Broadcast할 때 Mutable 객체를 그대로 참조하면 Tick 갱신이 Packet 내용을 변경하는 버그가 생긴다. `record PositionDTO(float x, float y)` 같은 Immutable 레코드로 전송 DTO를 설계하면 생성 이후 상태 변경이 불가능해 이 문제를 구조적으로 방지한다.

운영 중 GC 지표에서 단수명 객체 Allocation이 많으면 Autoboxing이 Hot Path에서 발생하는지 JFR로 확인한다. `Map<Integer, Player>`처럼 Wrapper를 Key로 쓸 때 Cache 범위를 벗어난 값에 ==를 사용하는 코드가 없는지 검토한다.

## 8. 자주 하는 오해
- **Java가 객체 Reference를 전달하므로 Pass-by-reference다.** Java는 항상 값을 전달하며 객체 인자도 Reference 값의 복사본이 전달된다. Parameter에 새 객체를 대입해도 호출자의 변수는 바뀌지 않는다.
- **String 내용 비교에 ==를 사용한다.** ==는 같은 객체 참조인지 확인하고 String Pool 밖에서 생성된 `new String("...")`과 비교하면 내용이 같아도 false를 반환한다. 값 비교는 반드시 equals를 사용한다.
- **final Field만 선언하면 내부 Collection도 자동으로 불변이다.** `final List<Item> items`는 items 참조 자체의 재대입을 막을 뿐 List 내부 원소 추가·삭제는 가능하다. List.copyOf 또는 Collections.unmodifiableList가 필요하다.
- **Wrapper의 Autoboxing에는 예외 가능성이 없다.** Integer가 null인데 int로 Unboxing하면 NullPointerException이 발생한다. 이는 컴파일 오류 없이 런타임에만 나타나 주의가 필요하다.
- **int 연산 결과를 long에 담으면 Overflow가 자동으로 방지된다.** `long result = a * b`에서 a·b가 int면 곱셈이 int 범위에서 먼저 일어나고 Overflow된 뒤 long으로 대입된다. `(long) a * b`로 연산 전에 승격해야 한다.
- **Integer의 == 비교는 항상 값을 비교한다.** JVM은 -128~127 범위의 Integer를 캐시하므로 이 범위 안에서는 == 비교가 우연히 동작하지만 범위를 벗어나면 false가 된다. 항상 equals를 사용해야 한다.
- **StringBuilder는 Thread-safe하다.** StringBuilder는 동기화가 없어 Thread-safe하지 않다. 멀티스레드 환경에서는 StringBuffer(동기화 있음)를 사용하거나 각 Thread가 독립 StringBuilder를 사용해야 한다.

## 9. 면접 질문

### Q1. Tick에서 Player 위치를 Snapshot에 담아 Broadcast했는데 클라이언트가 수신한 좌표가 직전 Tick이 아닌 현재 Tick의 값을 담고 있습니다. 원인과 수정 방법은 무엇입니까?
Mutable Position 객체를 Snapshot이 Reference로 공유하기 때문입니다. Tick 갱신이 Snapshot 내부의 좌표도 변경합니다. `record PositionDTO(float x, float y)`로 Snapshot 생성 시 값을 복사하면, 이후 Position 갱신이 DTO에 영향을 주지 않습니다.

### Q2. `Map<Integer, Player>` 조회에서 JFR Allocation Profiling 결과 초당 10만 건의 Integer 객체 생성이 Hot Path에서 발생합니다. 원인과 대안은 무엇입니까?
int 키를 `Map.get(intKey)` 에 넘길 때마다 Autoboxing으로 Integer 객체가 Heap에 할당됩니다. GC Gen0 Allocation이 증가해 Pause 빈도가 높아집니다. Eclipse Collections의 `IntObjectHashMap<Player>`로 교체하면 Boxing 없이 int 키로 직접 조회할 수 있습니다.

### Q3. Immutable 클래스를 설계했는데 외부에서 내부 상태가 변경되는 버그가 보고됩니다. 어떤 실수가 있을 수 있고 어떻게 수정합니까?
세 가지 경우를 확인합니다. 1) 생성자에서 `this.items = items`로 Mutable List를 그대로 보관했으면 → `List.copyOf(items)`로 Defensive Copy. 2) Getter가 내부 List를 직접 반환했으면 → `Collections.unmodifiableList(items)` 반환. 3) `final byte[]` 배열을 Getter로 노출했으면 → `Arrays.copyOf`로 복사본 반환.

### Q4. 플레이어 ID를 Integer로 관리하는 코드에 ==로 비교하는 구간이 있고, 로컬에서는 정상인데 운영에서 간헐적으로 불일치가 발생합니다. 원인과 수정 방법은 무엇입니까?
JVM은 Integer -128~127 범위만 동일 객체를 캐시합니다. 로컬 테스트 ID가 작아 우연히 동작하다가, 운영 플레이어 ID가 범위를 초과하면 == 비교가 false를 반환합니다. 코드베이스 전체에서 `Integer` 비교를 `equals()`로 교체하고, SonarQube `JAVA:S4973` 룰로 CI에서 강제합니다.

### Q5. Java가 Pass-by-value임을 모르는 동료가 `resetPosition(Position p) { p = new Position(); }` 호출 후 호출자 변수가 바뀔 것을 기대합니다. 실제 동작을 설명하고 설계를 어떻게 수정해야 합니까?
Java는 항상 Reference 값의 복사본을 전달합니다. Parameter에 새 객체를 대입해도 호출자 변수는 변경되지 않습니다. 반면 `p.x = 0`처럼 Mutable 객체의 Field를 변경하면 동일 Heap 객체를 가리키므로 호출자도 봅니다. `resetPosition`이 새 Position을 반환하도록 설계하거나, 기존 객체의 Field를 직접 초기화하는 방식으로 수정합니다.

### Q6. Logger 구현에서 String 결합이 반복되는 루프 후 GC Gen0 Allocation이 급증했습니다. 원인과 수정 방법은 무엇입니까?
Runtime 분기 안의 String 연산은 컴파일러가 최적화하지 못해 중간 String 객체가 반복 생성됩니다. JFR Allocation Profiling에서 `String[]` 또는 `char[]` 할당이 상위에 나타납니다. StringBuilder로 append 방식으로 전환하거나, 실제 로그 레벨이 활성화된 경우에만 연산하도록 `() -> "msg " + value` Supplier 형태로 전달합니다.

## 10. 예상 꼬리질문

- `String.intern()`을 세션 ID 저장에 사용해 String Pool 중복을 줄이려 했는데, 세션 수가 100만 개 이상일 때 오히려 Metaspace/PermGen 압박이 생기는 이유와 대안은 무엇인가요?
- `final byte[] payload`를 필드로 갖는 Immutable 패킷 클래스에서 Getter가 배열 참조를 그대로 반환할 때 어떤 버그가 생기고, `Arrays.copyOf` vs `ByteBuffer.wrap` 중 어떤 방법으로 방어하나요?
- JFR Allocation Profiling 결과 `Integer[]` 생성이 Top 3에 올라있습니다. IntelliJ/SonarQube에서 Autoboxing 발생 위치를 탐지하는 방법과 `IntObjectHashMap` 전환 시 API 호환성을 유지하는 방법은 무엇인가요?
- 멀티스레드 채팅 서버에서 `StringBuilder`를 static 필드로 선언해 공유했을 때 어떤 증상이 나타나고, Thread Dump에서 어떻게 확인하나요?
- `long playerId = player.getId()`에서 `getId()`가 `Long` 타입을 반환할 때 Unboxing NullPointerException이 발생하는 조건과, Optional 또는 null 체크로 방어하는 패턴은 무엇인가요?
- int 범위를 초과하는 경험치 계산에서 `long exp = baseExp * multiplier`로 선언했는데 Overflow가 여전히 발생합니다. 올바른 승격 방법과 `Math.multiplyExact` 사용 시 ArithmeticException 처리 Trade-off는 무엇인가요?
- `record PositionDTO(float x, float y, List<Buff> buffs)`처럼 record가 Mutable List 필드를 갖는 경우 어떤 불변식 위반이 발생하고, Compact Constructor에서 `List.copyOf`로 완전한 Immutable을 보장하는 방법은 무엇인가요?

## 11. 30초 모범답변

> Java는 Primitive 값과 객체 Reference를 모두 값으로 전달합니다. Reference를 복사하면 같은 Mutable 객체를 가리킬 수 있으므로 공유와 변경 범위를 관리해야 합니다. String은 Immutable이라 Hash Key와 멀티스레드 읽기에 안전하고, 내용 비교에는 equals를 사용합니다. 전송 DTO는 Immutable하게 만들어 Tick 갱신이 Packet 내용을 바꾸는 버그를 방지합니다.

## 12. 1~2분 확장답변

> Primitive 변수는 값을 스택에 직접 저장하고 Reference 변수는 Heap 객체를 가리키는 주소를 저장합니다. Java는 항상 Pass-by-value입니다. 객체 인자도 Reference 값의 복사본이 전달되므로 메서드 내 Parameter 재대입은 호출자 변수에 영향이 없지만 같은 Mutable 객체의 필드를 변경하면 호출자도 볼 수 있습니다.
>
> String은 Immutable이라 생성 후 내부 문자 Sequence가 바뀌지 않습니다. 이 덕분에 String Pool에서 동일 Literal을 재사용하고, HashMap Key로 안전하게 사용하며, 별도 동기화 없이 멀티스레드 읽기가 가능합니다. 내용 비교는 항상 equals를 사용하고 `new String(...)`과 Literal의 == 비교는 false가 나올 수 있습니다.
>
> Immutable 객체 설계에서 `final Field`만으로는 부족합니다. Mutable 컬렉션 인자는 Defensive Copy하고 Getter는 불변 View를 반환해야 외부에서 내부 상태를 변경할 수 없습니다. 게임 서버에서는 전송 DTO를 `record` 같은 Immutable 타입으로 설계해 Tick 갱신이 Snapshot 내용을 오염하는 버그를 방지합니다. Autoboxing이 실제 Hot Path에서 GC 부담을 높이는지 JFR로 확인하고 필요하면 Primitive 전용 컬렉션을 검토합니다.

## 13. 핵심 요약

- Primitive vs Reference: Primitive는 스택에 값 직접 저장, Reference는 Heap 객체 주소 저장 — 복사하면 같은 Mutable 객체를 공유한다.
- Pass-by-value: Java는 항상 값을 전달하며 Reference도 참조 값의 복사본이 전달되므로 Parameter 재대입은 호출자에 영향 없다.
- String Immutability: 생성 후 내용 변경 불가 → String Pool 공유, Hash Key 안정성, 멀티스레드 읽기 Thread Safety 확보.
- String 비교: 내용 비교는 equals, ==는 Identity(같은 객체 참조) 확인 — `new String(...)`과 Literal 비교에서 ==는 false.
- Immutable 설계: `final Field` + Defensive Copy(생성자) + Unmodifiable View(Getter) — `record`가 이 패턴을 간결하게 구현한다.
- Integer Cache 범위: -128~127 범위 Integer는 JVM이 캐시하므로 ==가 우연히 동작하지만 범위 초과 시 false → 항상 equals 사용.
- Autoboxing 비용: int→Integer 변환 시 Heap 할당 발생 → Tick 처리 같은 Hot Path에서 GC 부담 증가 → JFR로 실측 확인 후 최적화.
- int Overflow 방지: `long result = (long) a * b`로 연산 전에 long 승격 — `long result = a * b`는 int 범위에서 Overflow 후 대입.

## 한 줄 정리

> Java는 Primitive 값과 객체 Reference를 모두 값으로 전달하며, Immutable 객체는 Defensive Copy로 설계해 공유 상태 오염을 방지합니다.
