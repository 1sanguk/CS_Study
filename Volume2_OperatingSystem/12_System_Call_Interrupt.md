---
difficulty: 3
reading_time: 20분
interview_frequency: 5
importance: 5
---

# 12. System Call과 Interrupt


## 학습 목표

- System Call이 권한 경계를 넘는 방식과 일반 함수 호출과의 차이를 설명할 수 있다.
- System Call이 반드시 Context Switch를 발생시키지 않는 이유를 설명할 수 있다.
- Hardware Interrupt와 Exception(동기 예외)의 차이를 설명할 수 있다.
- 게임 서버에서 System Call 횟수를 줄이기 위한 배치·버퍼링과 비동기 I/O를 설명할 수 있다.

## 1. 개요

System Call은 사용자 코드가 커널 서비스를 요청하는 진입이고 Interrupt는 장치·예외 사건을 커널에 알린다.

시스템 콜(System Call)은 사용자 프로그램이 파일, 소켓, 프로세스, 메모리처럼 권한이 필요한 운영체제 서비스를 요청하는 공식 인터페이스다. 인터럽트(Interrupt)는 CPU(Central Processing Unit)의 정상 명령 흐름을 잠시 중단하고 정해진 처리 루틴으로 제어를 넘기는 사건이다.

둘은 모두 커널 코드 실행으로 이어질 수 있지만 시작 주체와 목적이 다르다. 시스템 콜은 현재 사용자 코드가 의도적으로 요청한다. 네트워크 카드 완료 같은 하드웨어 인터럽트는 현재 실행 중인 명령과 비동기적으로 발생한다.

## 2. 왜 필요한가

권한을 보호하면서 파일, 네트워크와 장치를 사용하게 한다.

사용자 프로그램이 장치 레지스터와 페이지 테이블을 직접 바꾸거나 다른 프로세스의 파일 자원을 조작할 수 있다면 격리와 안정성을 유지하기 어렵다. CPU는 사용자 모드와 커널 모드 같은 권한 수준을 제공하고, 제한된 진입점에서 인자를 검증한 뒤 커널이 작업을 대신 수행한다.

장치는 CPU보다 느리고 완료 시점을 예측하기 어렵다. 장치가 완료나 입력 도착을 인터럽트로 알리면 CPU는 그동안 다른 작업을 할 수 있다. 다만 매우 높은 이벤트율에서는 인터럽트 자체가 과부하가 될 수 있어 폴링과 배치 처리를 섞기도 한다.

## 3. 핵심 동작 원리

```text
User Code
   │ system call instruction
   v
CPU가 Kernel 진입점으로 전환
   │ 인자·권한 검증
   │ Kernel 작업 수행 또는 I/O 등록
   v
결과 반환 / Thread 대기

Device ── interrupt ──> Interrupt Handler ──> 완료 Queue·대기 Thread 깨움
```

일반 함수 호출과 달리 권한 경계를 넘는다. Interrupt가 항상 Context Switch를 뜻하지는 않는다.

### Mode Switch와 Context Switch

시스템 콜은 사용자 모드에서 커널 모드로 권한을 전환하지만 같은 스레드의 요청을 처리하고 바로 복귀할 수 있다.

```text
send() 즉시 Buffer에 기록 가능
User → Kernel → 같은 Thread로 Return
          Mode Switch, 반드시 Context Switch는 아님

read() Data 없음, Blocking Mode
User → Kernel → Thread Waiting → 다른 Thread 실행
          Mode Switch + Context Switch 가능
```

### Interrupt와 Exception

하드웨어 인터럽트는 네트워크 패킷 수신, 타이머, 장치 I/O 완료처럼 현재 명령과 비동기적으로 도착할 수 있다. 예외(Exception)는 0으로 나누기, 페이지 폴트, 잘못된 명령처럼 현재 명령 실행과 동기적으로 발생한다. 용어 분류는 아키텍처와 문헌에 따라 조금 다를 수 있다.

CPU는 사건 종류에 맞는 처리기 주소를 찾아 커널 코드로 이동한다. 짧은 처리 후 원래 실행을 이어가거나 스케줄러가 다른 작업을 실행할 수 있다.

### 네트워크 I/O 예시

네트워크 카드가 패킷을 DMA(Direct Memory Access)로 메모리 버퍼에 옮기면 장치는 인터럽트로 수신을 알리고 커널 네트워크 스택이 패킷을 처리해 소켓 수신 큐에 놓는다. 패킷이 매우 많을 때 패킷마다 인터럽트를 발생시키면 CPU가 인터럽트 처리에 묶일 수 있다. 여러 완료를 묶어 알리는 Interrupt Coalescing을 사용하거나 커널이 일정량을 Polling으로 처리할 수 있다.

### System Call 비용

시스템 콜 비용에는 권한 전환 자체뿐 아니라 인자 검증, 사용자·커널 메모리 사이 복사, 락, 장치 큐와 스케줄링 대기가 포함될 수 있다. 현재 시간처럼 일부 조회는 공유된 사용자 매핑을 이용해 실제 커널 진입을 피하는 vDSO 최적화도 있다. 호출 종류에 따라 비용 차이가 크다.

## 4. 쉬운 예시

```java
// BAD: 작은 메시지마다 즉시 send → 시스템 콜 반복
for (String msg : chatMessages) {
    ByteBuffer buf = ByteBuffer.wrap(msg.getBytes());
    channel.write(buf); // 각 메시지마다 시스템 콜 — 100개 = 100번 커널 진입
}
```

```java
// GOOD: 버퍼에 모아 배치 전송
public class PacketBatcher {
    private final ByteBuffer buffer = ByteBuffer.allocateDirect(8192);
    private long lastFlushNano = System.nanoTime();
    private static final long MAX_DELAY_NS = 1_000_000L; // 최대 1ms 대기

    public void enqueue(byte[] data) throws IOException {
        if (buffer.remaining() < data.length) flush();
        buffer.put(data);
        long now = System.nanoTime();
        if (now - lastFlushNano >= MAX_DELAY_NS || buffer.remaining() < 256) {
            flush();
        }
    }

    public void flush() throws IOException {
        buffer.flip();
        channel.write(buffer); // 시스템 콜 1회 → 최대 1ms 동안 쌓인 데이터 일괄 전송
        buffer.clear();
        lastFlushNano = System.nanoTime();
    }
    // 주의: 배치 지연 상한을 크게 설정하면 채팅 실시간성 저하
}
```

```java
// 비동기 I/O: Selector(내부적으로 epoll 사용) — 시스템 콜은 여전히 있음
Selector selector = Selector.open();              // 시스템 콜: epoll_create
channel.register(selector, SelectionKey.OP_READ); // 시스템 콜: epoll_ctl

while (true) {
    selector.select(); // 시스템 콜: epoll_wait — 준비된 채널이 생길 때까지 대기
    for (SelectionKey key : selector.selectedKeys()) {
        if (key.isReadable()) {
            ((SocketChannel) key.channel()).read(buffer); // 시스템 콜: read
        }
    }
}
// 비동기 I/O도 시스템 콜을 사용한다
// 차이: 완료까지 스레드를 블로킹하지 않고 준비된 I/O만 처리
```

## 5. 비슷한 개념과 비교

| 구분 | 발생 주체 | 현재 명령과 관계 | 대표 예 |
|---|---|---|---|
| System Call | 사용자 프로그램 | 의도적인 동기 진입 | `read`, `send`, `mmap` |
| Hardware Interrupt | 외부 장치·Timer | 비동기 | Packet 수신, I/O 완료 |
| Exception/Fault | 현재 명령·CPU | 동기 | Page Fault, 0 나누기 |
| Context Switch | Scheduler | 실행 주체 변경 | Thread A → Thread B |
| 일반 함수 호출 | 사용자 코드 | 같은 권한 내 흐름 | Parsing 함수 호출 |

| System Call 종류 | 비용 수준 | 이유 |
|---|---|---|
| 현재 시간 조회 (vDSO) | 매우 낮음 | 커널 진입 없이 공유 메모리 접근 |
| 즉시 send (버퍼 여유) | 낮음 | Mode Switch + 데이터 복사 |
| Blocking read (데이터 없음) | 높음 | Context Switch + I/O 대기 |
| mmap 새 영역 | 중간~높음 | 페이지 테이블 수정 |

## 6. 장점과 단점

**System Call의 장점**

- 안정적인 권한 경계와 장치 추상화를 제공한다.
- 사용자 프로그램이 하드웨어를 직접 조작하지 않아도 된다.

**System Call의 단점**

- 호출과 검증·복사·대기 비용이 있다.
- 호출 빈도가 높으면 시스템 CPU 사용률을 높인다.

**Interrupt의 장점**

- CPU가 장치 완료를 계속 확인하지 않아도 된다.
- 장치가 준비되면 즉시 알려 지연을 줄인다.

**Interrupt의 단점**

- 이벤트율이 높으면 인터럽트 처리 오버헤드와 캐시 교란이 커진다.
- 긴 인터럽트 처리는 다른 사건의 지연을 만든다.

## 7. 게임 서버·백엔드 실무 예시

작은 send를 반복하기보다 버퍼링·배치하고 비동기 I/O로 대기를 겹친다. 초당 시스템 콜 횟수, 호출당 바이트, 시스템 CPU와 사용자 CPU 비율을 구분해 System Call 비용이 병목인지 확인한다.

이벤트 루프가 읽기 준비 알림을 받았지만 한 연결만 끝까지 처리하면 다른 연결이 굶을 수 있다. 한 번에 처리할 패킷이나 바이트 예산을 두고 다시 큐에 넣어 공정성을 유지한다. 에지 트리거 방식에서는 알림을 충분히 소비하지 않으면 추가 통지를 놓친 것처럼 보일 수 있으므로 API(Application Programming Interface) 계약을 따른다.

서버 틱 지연이 특정 NIC 인터럽트 코어와 겹친다면 코어별 CPU, Soft IRQ 처리량, 패킷 드롭과 Receive Queue를 확인한다.

## 8. 자주 하는 오해

- **"모든 라이브러리 함수가 시스템 콜이다"**: 문자열 길이 계산, 수학 연산은 사용자 모드에서만 실행된다. read, write, send 같은 I/O 함수만 커널 진입이 필요하다.
- **"System Call과 Context Switch는 같다"**: System Call은 권한 전환(Mode Switch)이다. 처리 후 같은 스레드로 바로 복귀하면 Context Switch가 없다. Blocking I/O 대기 시 스케줄러가 다른 스레드를 선택하면 추가된다.
- **"Interrupt가 발생하면 반드시 다른 프로세스로 전환된다"**: 짧은 인터럽트 처리 후 원래 실행 중이던 코드로 복귀할 수 있다. Context Switch는 인터럽트 처리 후 스케줄러가 실행할 스레드를 바꿀 때 발생한다.
- **"비동기 I/O는 시스템 콜이 전혀 없다"**: 작업 등록(epoll_ctl), 완료 대기(epoll_wait), 실제 읽기(read) 등 시스템 콜을 여전히 사용한다. 스레드를 블로킹하지 않고 여러 I/O를 겹쳐 처리한다는 의미다.
- **"System Call 횟수를 줄이면 지연도 항상 줄어든다"**: 배치를 늘리면 시스템 콜 횟수는 줄지만 각 메시지의 전송 지연이 늘어난다. 처리량과 p99 지연을 함께 측정해야 한다.
- **"Hardware Interrupt와 Exception은 같다"**: 하드웨어 인터럽트는 현재 명령과 비동기적으로 발생하고, Exception(Page Fault, 0 나누기)은 현재 명령과 동기적으로 발생한다. 둘 다 커널 처리기로 제어를 넘기지만 발생 타이밍이 다르다.
- **"System Call은 항상 느리다"**: 현재 시간 조회 같은 일부 System Call은 vDSO를 통해 커널 진입 없이 처리한다. 호출 종류에 따라 비용 차이가 크므로 실제 병목을 측정해야 한다.

## 9. 면접 질문

### Q1. System Call이란 무엇이며 일반 함수 호출과 어떻게 다른가요?

System Call은 사용자 프로그램이 검증된 진입점을 통해 커널 권한으로 전환해 보호된 자원을 요청하는 인터페이스다. 일반 함수 호출은 같은 권한 수준에서 호출 규약에 따라 이동하고 검증이 없다. System Call은 권한 전환, 인자·권한 검증, 커널 작업 수행, 결과 반환을 거친다.

### Q2. System Call은 항상 Context Switch를 일으키나요?

아니다. 커널이 요청을 처리한 뒤 같은 스레드로 바로 돌아올 수 있다. Blocking I/O처럼 현재 스레드가 대기 상태가 되면 스케줄러가 다른 스레드를 선택해 Context Switch가 추가될 수 있다. System Call의 Mode Switch와 스레드 전환 Context Switch는 다른 사건이다.

### Q3. Hardware Interrupt와 Exception은 어떻게 다른가요?

Hardware Interrupt는 네트워크 패킷 수신, 타이머처럼 현재 명령과 비동기적으로 발생한다. Exception(Page Fault, 0 나누기)은 현재 명령 실행과 동기적으로 발생한다. 둘 다 커널 처리기로 제어를 넘기지만 발생 타이밍과 원인이 다르다.

### Q4. System Call의 비용은 어디서 생기나요?

권한 전환(Mode Switch) 자체뿐 아니라 인자와 권한 검증, 사용자·커널 메모리 사이 데이터 복사, 커널 내부 락, 장치 큐 등록과 스케줄링 대기가 포함될 수 있다. 현재 시간 조회 같은 일부 System Call은 vDSO를 통해 커널 진입을 피해 비용이 매우 낮다. 호출 종류에 따라 비용 차이가 크다.

### Q5. 비동기 I/O도 System Call을 사용하나요?

그렇다. 작업 등록(epoll_ctl), 완료 대기(epoll_wait), 실제 읽기(read)에 System Call을 사용한다. 비동기 I/O의 의미는 각 I/O 완료까지 스레드를 블로킹하지 않고 여러 요청을 겹쳐 처리한다는 것이다. System Call 자체를 없애는 것이 아니다.

### Q6. System Call 횟수를 줄이는 방법은 무엇인가요?

작은 I/O를 시간·크기 상한으로 배치하고 Scatter/Gather I/O나 비동기 완료 묶음을 활용할 수 있다. 단 배치 크기를 늘리면 개별 메시지 지연이 늘어나므로 처리량과 p99 지연을 함께 측정한다. 예를 들어 최대 1ms 또는 일정 바이트가 모일 때 전송하는 식으로 균형을 잡는다.

## 10. 예상 꼬리질문

- 준비 통지 모델(epoll)과 완료 통지 모델(IOCP)은 어떻게 다른가요?
  > epoll은 I/O가 준비된 파일 디스크립터를 알려주며 애플리케이션이 직접 read/write를 호출해야 한다. IOCP는 운영체제가 I/O 작업을 완료한 뒤 결과 버퍼까지 준비된 상태로 완료 큐에 통보한다. epoll은 Linux에서, IOCP는 Windows에서 사용하며, IOCP가 커널이 더 많은 작업을 대신하지만 플랫폼 의존성이 높다.
- Interrupt Coalescing의 장단점은 무엇인가요?
  > Interrupt Coalescing은 장치가 이벤트마다 즉시 인터럽트를 발생시키지 않고 일정 개수나 시간이 쌓일 때까지 기다렸다 한 번에 알리는 기법이다. 장점은 CPU가 인터럽트 처리에 묶이는 빈도를 줄여 높은 패킷 처리량에서 효율적이다. 단점은 낮은 부하에서 이벤트 처리 지연이 늘어 실시간성이 떨어질 수 있다.
- Blocking `read`에서 데이터가 없으면 어떤 흐름이 생기나요?
  > 커널이 소켓 수신 버퍼를 확인하고 데이터가 없으면 호출 스레드를 대기 상태로 바꾸고 준비 큐에서 제거한다. 스케줄러는 다른 스레드를 실행하며, 네트워크 카드가 패킷을 수신하면 인터럽트를 통해 커널이 소켓 대기 큐에 있는 스레드를 깨워 준비 상태로 돌린다. 이 흐름에서 Mode Switch와 Context Switch가 모두 발생한다.
- vDSO는 어떻게 커널 진입을 피하나요?
  > vDSO(virtual Dynamic Shared Object)는 커널이 일부 데이터를 사용자 주소 공간에 매핑된 읽기 전용 페이지에 주기적으로 갱신한다. 현재 시각 조회 같은 시스템 콜은 이 공유 메모리를 직접 읽어 특권 명령 없이 결과를 얻는다. 커널 진입 자체가 없으므로 Mode Switch 비용이 사라지고 매우 빠르게 처리된다.
- 에지 트리거와 레벨 트리거의 차이는 무엇인가요?
  > 레벨 트리거는 조건이 참인 동안(예: 읽을 데이터가 남아 있는 동안) 계속 이벤트를 발생시킨다. 에지 트리거는 상태가 변하는 순간(예: 새 데이터가 도착하는 시점)에만 한 번 이벤트를 발생시킨다. 에지 트리거에서는 알림을 받은 뒤 데이터를 모두 소비하지 않으면 다음 도착 전까지 알림을 다시 받지 못해 EAGAIN까지 반복 read해야 한다.
- 시스템 CPU 사용률이 높으면 어떻게 원인을 찾나요?
  > `vmstat`의 sy 값이 높으면 커널 시간 비중이 크다는 신호다. `strace -c -p <pid>`로 어떤 시스템 콜이 가장 많이 호출되고 시간이 걸리는지 확인한다. 네트워크 처리에서 sys가 높으면 패킷당 시스템 콜 횟수와 Interrupt Coalescing 설정을 확인하고, 잠금 경쟁이 원인이면 `perf`로 커널 심볼 수준 Hot Path를 분석한다.
- DMA란 무엇이고 왜 사용하나요?
  > DMA(Direct Memory Access)는 장치 컨트롤러가 CPU 개입 없이 직접 메모리 버퍼에 데이터를 전송하는 기법이다. CPU가 데이터를 바이트 단위로 복사하는 대신 전송을 장치에 위임하고, 완료되면 인터럽트로 알린다. 네트워크 카드가 수신 패킷을 직접 메모리에 올리는 것이 대표 사례로, CPU 사이클을 절약하고 높은 I/O 처리량을 지원한다.

## 11. 30초 모범답변

> System Call은 사용자 코드가 검증된 진입점을 통해 커널 권한으로 전환해 파일·네트워크·메모리를 요청하는 인터페이스입니다. 일반 함수 호출과 달리 권한 전환과 인자 검증이 있습니다. System Call이 반드시 Context Switch를 발생시키지는 않고, Blocking I/O 대기 시에만 스케줄러가 다른 스레드를 선택할 수 있습니다. 게임 서버에서는 작은 send를 배치해 시스템 콜 횟수를 줄이되 지연 상한을 함께 설정합니다.

## 12. 1~2분 확장답변

> System Call은 커널 서비스를 안전하게 요청하고 Interrupt는 하드웨어와 예외 사건을 커널에 알립니다. System Call은 권한 전환이지 Context Switch가 아니며, Blocking I/O 대기 시에만 스케줄러가 개입합니다. 비동기 I/O도 epoll_ctl, epoll_wait 같은 시스템 콜을 사용하며, 스레드를 블로킹하지 않고 여러 I/O를 겹쳐 처리한다는 의미입니다. 게임 서버에서 작은 send를 배치하면 시스템 콜 횟수를 줄이지만 배치 지연 상한을 설정해야 실시간성을 유지합니다. 시스템 CPU 비율이 높으면 System Call, 인터럽트 처리, 커널 락이 병목인지 확인합니다.

## 13. 핵심 요약

- System Call은 사용자 프로그램이 검증된 진입점을 통해 커널 권한으로 전환해 보호된 자원을 요청하는 인터페이스다.
- 일반 함수 호출과 달리 System Call은 권한 전환, 인자·권한 검증, 커널 작업 수행을 거친다.
- System Call이 반드시 Context Switch를 발생시키지는 않는다. Blocking I/O 대기 시 스케줄러가 다른 스레드를 선택하면 추가될 수 있다.
- Hardware Interrupt는 현재 명령과 비동기적으로 발생하고, Exception(Page Fault, 0 나누기)은 동기적으로 발생한다.
- 비동기 I/O도 시스템 콜을 사용한다. 스레드를 블로킹하지 않고 여러 I/O를 겹쳐 처리한다는 의미다.
- 모든 라이브러리 함수가 시스템 콜은 아니다. 문자열·수학 연산은 사용자 모드에서만 실행된다.
- 작은 send를 배치하면 시스템 콜 횟수를 줄이지만 배치 지연 상한을 설정해야 실시간성이 유지된다.
- 시스템 CPU 비율이 높으면 System Call 횟수, 인터럽트 처리, 커널 락이 병목인지 확인한다.

## 한 줄 정리

> System Call은 커널 서비스를 안전하게 요청하고 Interrupt는 하드웨어와 예외 사건을 커널에 알립니다.
