---
difficulty: 3
reading_time: 20분
interview_frequency: 5
importance: 5
---

# 10. Virtual Memory, Paging, Page Fault

> 게임 서버·백엔드 개발자를 위한 CS 면접 교재

## 학습 목표

- 가상 메모리가 프로세스 격리와 연속 주소 추상화를 제공하는 원리를 설명할 수 있다.
- TLB Miss와 Page Fault의 차이를 설명할 수 있다.
- Minor Fault와 Major Fault의 차이와 게임 서버에서 각각 미치는 영향을 설명할 수 있다.
- Thrashing의 원인과 게임 서버에서 Working Set을 관리하는 방법을 설명할 수 있다.

## 1. 개요

가상 메모리는 독립 주소 공간을 제공하고 Paging은 Page를 물리 Frame에 매핑하며 Page Fault는 현재 매핑으로 처리할 수 없는 접근이다.

가상 메모리(Virtual Memory)는 프로세스가 사용하는 주소를 실제 RAM 주소와 분리하는 추상화다. 페이징(Paging)은 가상 주소 공간과 물리 메모리를 고정 크기 블록인 페이지(Page)와 프레임(Frame)으로 나눠 매핑한다. 페이지 폴트(Page Fault)는 CPU가 현재 페이지 테이블 상태와 권한만으로 완료할 수 없는 메모리 접근을 감지해 운영체제에 제어를 넘기는 예외다.

페이지 폴트가 곧 오류라는 뜻은 아니다. 아직 물리 페이지가 연결되지 않은 정상적인 첫 접근일 수도 있고, 파일 데이터를 읽어 와야 할 수도 있으며, 접근 권한 위반으로 프로세스를 종료해야 할 수도 있다.

## 2. 왜 필요한가

격리, 연속 주소 추상화와 요구 페이징을 제공한다.

프로세스마다 독립적인 가상 주소 공간을 주면 같은 가상 주소를 사용해도 서로 다른 물리 메모리에 연결할 수 있다. 다른 프로세스의 메모리를 임의로 읽거나 쓰기 어렵게 하고 페이지별 읽기·쓰기·실행 권한을 적용한다.

실행 파일 전체와 예약한 메모리를 즉시 RAM에 올릴 필요도 없다. 실제 접근한 페이지에만 물리 메모리를 연결하는 요구 페이징(Demand Paging)은 시작 시간과 물리 메모리 사용을 줄인다. 파일 매핑, 프로세스 간 공유 메모리, Copy-on-Write도 페이지 매핑을 이용해 구현할 수 있다.

## 3. 핵심 동작 원리

```text
Virtual Address
  ├─ Virtual Page Number ──> TLB ──hit──> Physical Frame Number
  │                           │
  │                           miss
  │                           v
  │                      Page Table Walk
  └─ Offset ───────────────────────────────> Physical Address

Page Table에 현재 처리 가능한 Mapping 없음
                    ↓
               Page Fault
                    ↓
       OS가 Mapping 보완 또는 접근 거부
```

TLB(Translation Lookaside Buffer)는 최근 주소 변환을 캐시한다. TLB Miss는 하드웨어나 운영체제가 페이지 테이블을 탐색해 유효한 매핑을 찾으면 OS 개입 없이 해결된다. 유효한 매핑이 없을 때 Page Fault가 발생한다.

### Page Fault 처리 흐름

```text
1. CPU가 Memory Access 수행
2. Page Table 상태·권한으로 처리 불가 → Fault
3. Kernel이 Fault 주소와 원인을 검사
4-a. 합법적 첫 접근: 0으로 채운 Frame 할당 (Minor)
4-b. File/Swap 데이터 필요: I/O 후 Frame 연결 (Major)
4-c. Copy-on-Write 쓰기: 개인 Frame 복사 후 연결 (Minor)
4-d. 불법 주소·권한: SIGSEGV 전달 또는 프로세스 종료
5. 정상 처리라면 중단된 명령을 다시 실행
```

Minor Fault는 저장장치 I/O 없이 처리된다. Major Fault는 파일이나 Swap에서 데이터를 읽어 지연이 훨씬 클 수 있다. 불법 접근 Fault는 운영체제가 복구하지 않는다.

### Thrashing

Working Set이 물리 메모리보다 크면 필요한 페이지를 들이자마자 다른 필요한 페이지를 내보내는 일이 반복된다.

```text
요청 처리 → Page In → 다른 Page 퇴출 → 곧 다시 필요 → Page In 반복
                         ↑                         |
                         └──── Thrashing ─────────┘
```

CPU보다 Fault와 저장장치 I/O에 시간을 써 처리량과 응답 시간이 크게 나빠진다.

### Copy-on-Write

`fork()` 직후 부모와 자식이 같은 물리 페이지를 읽기 전용으로 공유하고, 쓰기가 발생할 때 Fault를 통해 개인 복사본을 만든다. 복제 직후 전체 메모리를 복사하지 않아도 된다. 하지만 복사를 없애는 것이 아니라 실제 쓰기까지 미룬다. 양쪽이 대부분의 페이지를 수정하면 메모리와 Fault 비용이 결국 발생한다.

## 4. 쉬운 예시

```bash
# RSS, 가상 주소 크기, Swap 확인
cat /proc/<pid>/status | grep -E "VmRSS|VmSize|VmSwap"
# VmSize: 예약된 가상 주소 크기 (물리 메모리 사용량 아님)
# VmRSS: 실제 물리 메모리에 올라온 페이지 크기

# Minor/Major Fault 수 확인
cat /proc/<pid>/stat | awk '{print "minor_faults:", $10, "major_faults:", $12}'

# 1초 간격으로 Swap In/Out 모니터링
vmstat 1 5
# si(swap-in): 높으면 Working Set이 RAM 초과 → Thrashing 위험
# so(swap-out): 페이지 퇴출 중
# 게임 서버에서 p99 틱 지연 급증 시 si 값 확인
```

```bash
# 서버 시작 후 Working Set 워밍업 (Cold Cache 제거)
# 맵 데이터, 설정 파일 등을 미리 읽어 Minor Fault 집중 시점을 준비 단계로 이동
find /data/maps -name "*.bin" -exec cat {} > /dev/null \;
# 이후 readiness probe 통과 → 트래픽 수신 시작
```

## 5. 비슷한 개념과 비교

| 사건 | 찾는 대상 | 일반 처리 | 비용 관점 |
|---|---|---|---|
| CPU Cache Miss | 최근 Data·명령 | 하위 Cache 또는 RAM 접근 | 하드웨어 지연 |
| TLB Miss | 가상→물리 주소 변환 | Page Table Walk | OS 개입 없이 해결 가능 |
| Minor Page Fault | 현재 Mapping 보완 | Frame 연결·COW 등 | Kernel 진입, Disk I/O 없음 |
| Major Page Fault | 저장장치의 Page 필요 | File·Swap Read | 큰 지연 가능 |
| Protection Fault | 허용되지 않은 접근 | SIGSEGV·프로세스 종료 | 정상 Paging과 구분 |

| 구분 | 페이징 | 세그멘테이션 |
|---|---|---|
| 단위 | 고정 크기 (예: 4KB) | 가변 크기 논리 구간 |
| 단편화 | 내부 단편화 가능 | 외부 단편화 가능 |
| 현대 시스템 | 중심 방식 | 페이징과 혼합 또는 제한적 사용 |

## 6. 장점과 단점

**가상 메모리·페이징의 장점**

- 프로세스 격리와 페이지별 보호로 안정성을 높인다.
- 요구 페이징으로 시작 시간과 물리 메모리 사용을 줄인다.
- 파일 매핑, COW, 공유 메모리를 효율적으로 구현할 수 있다.

**가상 메모리·페이징의 단점**

- 페이지 테이블 메모리, TLB Miss, Fault 처리 비용이 있다.
- 메모리 압박 시 Major Fault와 Thrashing으로 예측하기 어려운 지연이 생긴다.
- 가상 주소 공간이 넓다는 사실이 물리 메모리가 무한하다는 뜻은 아니다.

## 7. 게임 서버·백엔드 실무 예시

RSS, Fault, Swap과 Working Set을 관찰하고 무제한 캐시를 막는다. p99 틱 지연이 급증할 때 같은 시간의 Major Fault, Swap In/Out, 메모리 압박과 디스크 지연을 확인한다.

서버 시작 후 처음 맵 데이터를 순회할 때 Fault가 집중되어 첫 매치만 느릴 수 있다. 준비 단계에서 필요한 데이터를 미리 읽어 Working Set을 데우거나, 실제 트래픽을 받기 전 readiness probe로 준비 상태를 확인할 수 있다.

운영 서버는 활발한 Working Set이 RAM 안에 머물도록 용량을 계획한다. Swap을 끄면 Major Fault가 줄어들지만 물리 메모리 부족 시 OOM 킬러가 프로세스를 종료한다. 지연에 민감한 틱 스레드가 Major Fault를 만나지 않도록 메모리 상한과 과부하 거절을 함께 설계한다. 컨테이너에서는 cgroup 제한, OOM 종료 이벤트와 메모리 압박 지표를 확인한다.

## 8. 자주 하는 오해

- **"Page Fault는 모두 디스크 I/O다"**: Minor Fault는 디스크 I/O 없이 처리된다. 요구 페이징의 첫 접근(0 페이지 할당)도 Minor Fault이고 Copy-on-Write 복사도 Minor Fault다.
- **"TLB Miss가 곧 Page Fault다"**: TLB Miss는 유효한 매핑을 페이지 테이블에서 찾으면 OS 개입 없이 해결된다. Page Fault는 유효한 매핑 자체가 없거나 권한 문제로 OS에 제어를 넘기는 것이다.
- **"가상 주소를 예약하면 같은 크기의 물리 메모리를 즉시 사용한다"**: 요구 페이징으로 실제 접근한 페이지에만 물리 프레임이 연결된다. VmSize가 크고 RSS가 작은 이유다.
- **"Copy-on-Write는 복사 비용을 영원히 없앤다"**: 쓰기가 발생할 때 Page Fault가 일어나 복사가 이뤄진다. fork() 후 양쪽이 대부분의 페이지를 수정하면 복사 비용이 결국 발생한다.
- **"가상 메모리는 RAM 부족분을 Swap으로 보완하는 기능만이다"**: 프로세스 격리, 페이지별 보호, 요구 페이징, 파일 매핑, COW 등 더 넓은 목적이 있다. Swap은 가상 메모리의 한 기능일 뿐이다.
- **"Page Fault는 항상 운영체제가 복구할 수 있다"**: 불법 포인터 접근이나 권한 위반 Fault는 SIGSEGV 같은 오류가 전달되고 복구되지 않는다. "Page Fault = 정상 기능"은 합법적 접근에만 해당한다.
- **"Swap을 끄면 메모리 문제가 해결된다"**: Swap을 끄면 Major Fault는 줄지만 물리 메모리가 부족하면 OOM 킬러가 프로세스를 종료한다. 근본 해결은 Working Set이 RAM에 맞도록 용량을 계획하는 것이다.

## 9. 면접 질문

### Q1. 가상 메모리와 페이징이란 무엇인가요?

가상 메모리는 프로세스가 사용하는 주소를 실제 RAM 주소와 분리하는 추상화다. 페이징은 가상 주소 공간과 물리 메모리를 고정 크기 페이지·프레임으로 나눠 페이지 테이블로 매핑한다. 프로세스 격리, 페이지별 보호, 요구 페이징, 파일 매핑 등을 구현하는 기반이다.

### Q2. TLB Miss와 Page Fault는 어떻게 다른가요?

TLB Miss는 최근 주소 변환 캐시에 없어 페이지 테이블을 탐색하는 것이다. 유효한 매핑이 있으면 OS 개입 없이 해결된다. Page Fault는 유효한 매핑 자체가 없거나 권한 문제로 OS에 제어를 넘기는 예외다.

### Q3. Copy-on-Write는 언제 실제 복사가 발생하나요?

쓰기가 발생할 때 Page Fault가 일어나 그 시점에 개인 복사본이 만들어진다. fork() 직후 전체를 복사하지 않고 실제 쓰기까지 미루는 방식이다. 양쪽이 대부분의 페이지를 수정하면 복사 비용이 결국 발생한다.

### Q4. Page Fault 처리 과정을 설명해 주세요.

CPU가 현재 매핑이나 권한으로 접근을 완료할 수 없으면 커널에 제어를 넘긴다. 커널은 합법적인 요구 할당, 파일 읽기, Copy-on-Write라면 페이지를 준비하고 명령을 재실행한다. 불법 주소나 권한 위반이면 프로세스에 SIGSEGV 같은 오류를 전달한다.

### Q5. Minor Fault와 Major Fault의 차이는 무엇인가요?

Minor Fault는 저장장치 읽기 없이 메모리 매핑을 보완할 수 있는 경우다. 요구 페이징의 첫 접근(0 페이지 할당)이나 COW 복사가 해당한다. Major Fault는 파일이나 Swap에서 페이지를 읽어야 해 큰 I/O 지연이 발생할 수 있다.

### Q6. Thrashing은 무엇이며 어떻게 방지하나요?

활발히 사용하는 Working Set이 물리 메모리에 맞지 않아 필요한 페이지를 계속 들이고 곧 필요한 다른 페이지를 내보내는 현상이다. CPU보다 Fault와 Swap I/O에 시간을 써 처리량이 급감한다. Working Set이 RAM에 머물도록 용량을 계획하고, 과부하 시 새 요청을 거절해 기존 요청의 Working Set을 보호한다.

## 10. 예상 꼬리질문

- 가상 주소와 물리 주소의 차이는 무엇인가요?
- 데이터 지역성이 Page Fault에 어떤 영향을 주나요?
- Huge Page의 장단점은 무엇인가요?
- 서버 시작 시 Cold Cache를 어떻게 다루나요?
- 컨테이너에서 메모리 제한과 OOM 킬러는 어떻게 동작하나요?
- Working Set을 어떤 지표로 모니터링하나요?
- 메모리 매핑 파일의 Fault는 언제 발생하나요?

## 11. 30초 모범답변

> 가상 메모리는 프로세스마다 독립 주소 공간을 제공하고 페이징으로 가상 페이지를 물리 프레임에 매핑합니다. Page Fault는 매핑이 없거나 권한 문제일 때 OS에 제어를 넘기며, Minor Fault는 디스크 없이 처리되지만 Major Fault는 Swap I/O로 큰 지연이 생깁니다. Working Set이 RAM에 맞지 않으면 Thrashing이 발생해 처리량이 급감합니다.

## 12. 1~2분 확장답변

> 가상 메모리는 주소를 물리 메모리와 분리해 격리와 요구 페이징을 제공합니다. TLB Miss는 페이지 테이블에서 유효한 매핑을 찾으면 OS 없이 해결되지만, Page Fault는 OS가 개입해 프레임을 할당하거나 Swap I/O를 수행하거나 불법 접근을 거부합니다. Copy-on-Write는 쓰기가 발생할 때 복사하므로 fork() 후 양쪽이 대부분을 수정하면 복사 비용이 결국 발생합니다. 게임 서버에서 p99 틱 지연 급증 시 Major Fault와 Swap In/Out을 확인하고, Working Set이 RAM에 머물도록 용량을 계획합니다.

## 13. 핵심 요약

- 가상 메모리는 프로세스마다 독립 주소 공간을 제공하고 페이지별 읽기·쓰기·실행 권한을 관리한다.
- TLB Miss는 유효한 매핑을 찾으면 OS 개입 없이 해결된다. Page Fault는 매핑이 없거나 권한 문제로 OS에 제어를 넘긴다.
- Minor Fault는 디스크 I/O 없이 처리된다. Major Fault는 파일이나 Swap에서 페이지를 읽어 큰 지연이 발생할 수 있다.
- 가상 주소 예약이 물리 메모리 즉시 사용을 의미하지 않는다. 요구 페이징으로 실제 접근한 페이지에만 프레임이 연결된다.
- Copy-on-Write는 쓰기가 발생할 때 복사가 이뤄진다. fork() 후 양쪽이 대부분을 수정하면 복사 비용이 결국 발생한다.
- Thrashing은 Working Set이 물리 메모리에 맞지 않아 Fault와 Swap I/O를 반복하는 현상이다. Working Set이 RAM에 머물도록 용량을 계획한다.
- 불법 포인터 접근 Fault는 운영체제가 복구하지 않는다. SIGSEGV 같은 오류가 전달되고 정상 Fault와 구분해야 한다.
- 게임 서버에서 p99 틱 지연 급증 시 Major Fault, Swap In/Out을 확인하고 과부하 거절로 기존 Working Set을 보호한다.

## 한 줄 정리

> 가상 메모리는 주소를 물리 메모리와 분리하고 Page Fault 때 운영체제가 매핑을 보완하거나 불법 접근을 거부합니다.
