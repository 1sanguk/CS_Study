# CS 면접 교재 — 게임 서버 · 백엔드 개발자를 위한 심층 학습 가이드

> **98개 주제 · 8개 분야 · 면접 실전 대비**
> 웹에서 바로 읽기 → [https://1sanguk.github.io/CS/](https://1sanguk.github.io/CS/)

---

## 이 교재는 누구를 위한 것인가

게임 서버 및 백엔드 개발자 취업·이직 면접을 준비하는 사람을 위해 만들어졌다. 단순한 개념 암기집이 아니라, **면접관 앞에서 실제로 말할 수 있는 답변 능력**을 기르는 것을 목표로 한다.

- 네트워크·OS·DB 기초부터 게임 서버 실전 설계까지 한 권으로 정리하고 싶은 개발자
- 어떤 질문에도 30초·2분짜리 답변을 즉시 뽑아낼 수 있는 말하기 체력을 키우고 싶은 사람
- 꼬리질문·오해 포인트까지 대비해 심층 면접에서 차별화하고 싶은 사람

---

## 무엇을 배우는가

### Volume 1 · Network (14챕터)
OSI 7계층과 TCP/IP 모델에서 시작해 TCP/UDP의 차이, 3-Way Handshake, 흐름 제어·혼잡 제어, TIME_WAIT 상태까지 네트워크 동작 원리를 깊이 다룬다. HTTP/HTTPS, WebSocket, DNS/ARP/ICMP, NAT, 로드 밸런서와 리버스 프록시까지 서버 개발자가 반드시 알아야 할 인프라 레이어를 다룬다.

### Volume 2 · Operating System (13챕터)
프로세스·스레드·컨텍스트 스위치의 차이를 비롯해 Race Condition, Mutex·Semaphore·SpinLock, Deadlock, 가상 메모리·페이징, TLB·CPU 캐시, 시스템 콜·인터럽트까지 운영체제 핵심 개념을 면접 맥락에서 정리한다. Amdahl의 법칙, Atomic 연산 등 실제 서버 성능 논의에 필요한 이론도 포함한다.

### Volume 3 · Database (13챕터)
RDBMS 기초와 정규화부터 B+Tree 인덱스 내부 구조, Clustered·Composite Index, 트랜잭션 ACID, 격리 수준(Isolation Level), DB Lock과 MVCC, Optimistic·Pessimistic Lock까지 깊이 다룬다. Redis 활용법, 캐시 정합성 전략, Replication·Sharding 설계까지 다뤄 현업 DB 질문에 완전히 대응한다.

### Volume 4 · Data Structure (11챕터)
Array·Linked List·Stack·Queue·Hash Table·Tree·AVL·Red-Black Tree·Heap·Trie·Graph·Union-Find를 구조, 시간 복잡도, 실전 사용 맥락 중심으로 정리한다. "왜 이 자료구조를 선택했는가"라는 면접 핵심 질문에 논리적으로 답하는 능력을 기른다.

### Volume 5 · Algorithm (12챕터)
시간·공간 복잡도 분석 방법부터 BFS/DFS, 이진 탐색, 그리디, DP, 백트래킹, Dijkstra, Bellman-Ford, Floyd-Warshall, 위상 정렬, MST(Kruskal·Prim), 투 포인터·슬라이딩 윈도우까지 면접에 자주 출제되는 알고리즘 전반을 다룬다.

### Volume 6 · C++ · C# (10챕터)
포인터·참조, new·delete·메모리 누수, RAII·스마트 포인터, 복사·이동 의미론, 가상 함수·다형성을 C++ 관점에서 다루고, C# Value/Reference Type, 박싱·언박싱, GC·세대 관리, ThreadPool·Task·async/await를 게임 서버 엔진(Unity 서버 사이드 포함) 맥락으로 정리한다.

### Volume 7 · Game Server (15챕터)
게임 서버 면접에 특화된 가장 독보적인 볼륨이다. 서버 아키텍처와 Authoritative Server 개념, Game Loop와 Tick 설계, Session 관리, Packet Framing과 직렬화·Endian, Blocking·Non-blocking I/O, Thread Model과 Work Queue, Object/Buffer Pool, Client Prediction·Reconciliation, Interpolation·Lag Compensation, Heartbeat·Reconnect, 매치메이킹, 로그인·채팅·랭킹 서버 구성까지 실무 게임 서버의 전체 스택을 다룬다.

### Volume 8 · Java (10챕터)
JVM 구조와 Bytecode·JIT, Primitive/Reference Type, 상속·인터페이스·다형성, 예외 처리, Collections Framework, Generics·Type Erasure, JVM 메모리와 GC, Java Memory Model·synchronized·volatile·Atomic, Executor·CompletableFuture·Virtual Thread까지 Java 백엔드 면접에 필요한 전 영역을 다룬다.

---

## 각 챕터의 구성

모든 98개 챕터는 동일한 고밀도 구조로 작성되어 있다.

| 구성 요소 | 내용 |
|-----------|------|
| **학습 목표** | 챕터에서 반드시 설명할 수 있어야 할 핵심 능력 3~5가지 |
| **난이도 · 면접 빈도 · 중요도** | ★☆☆☆☆ ~ ★★★★★ 5점 척도 |
| **개념 설명** | 동작 원리, 비교 표, 코드 예시(Java/C++/C#/SQL/Lua) |
| **흔한 오해** | 7~8가지 실제 면접에서 틀리기 쉬운 포인트 |
| **면접 질문 6개** | 각 질문에 30초 요약 답변 + 1~2분 심화 답변 제공 |
| **꼬리질문** | 질문당 2~4개의 심층 후속 질문과 모범 답변 |
| **핵심 요약** | 챕터 전체를 3~5줄로 압축한 최종 정리 |

---

## 어떻게 공부하는가

1. 챕터를 15~30분 동안 읽으며 개념 흐름을 파악한다.
2. 핵심 요약을 닫고, 면접관에게 설명한다고 가정하며 직접 말해본다.
3. **문제 풀기** 모드에서 면접 질문 6개에 내 답변을 먼저 적은 뒤 모범 답변과 비교한다.
4. 설명하지 못한 꼬리질문을 다시 읽고 보완한다.
5. 다음 챕터로 넘어간다.

읽는 것만으로는 면접을 통과할 수 없다. **내 언어로 말하는 연습**이 이 교재의 핵심 사용법이다.

---

## 이 교재가 다른 이유

- **게임 서버에 특화된 Volume 7**: 시중 CS 교재에서 다루지 않는 Tick 설계, Client Prediction, Lag Compensation, Packet Framing 등 게임 서버 실무 주제를 면접 맥락으로 정리한 챕터가 15개다.
- **오해 포인트 중심 서술**: 개념이 틀리는 이유를 알아야 면접에서 함정에 빠지지 않는다. 각 챕터의 "흔한 오해" 섹션은 실제 면접에서 틀리기 쉬운 포인트만 골라 수록했다.
- **30초 · 2분 이중 답변 구조**: 면접은 질문의 깊이에 따라 짧게도, 길게도 말할 수 있어야 한다. 모든 질문에 두 가지 길이의 모범 답변을 제공한다.
- **사실 검증 완료**: 각 챕터의 수치·알고리즘·동작 원리는 최신 문헌과 공식 문서를 기반으로 검토되었다.

---

## 목차

### Volume 1 · Network

| # | 챕터 |
|---|------|
| 01 | [OSI 7계층](./Volume1_Network/01_OSI_7계층.md) |
| 02 | [TCP/IP 모델](./Volume1_Network/02_TCP_IP_모델.md) |
| 03 | [IP 주소와 라우팅](./Volume1_Network/03_IP_주소와_라우팅.md) |
| 04 | [Port와 Socket](./Volume1_Network/04_Port와_Socket.md) |
| 05 | [TCP와 UDP](./Volume1_Network/05_TCP와_UDP.md) |
| 06 | [TCP 3-Way·4-Way Handshake](./Volume1_Network/06_TCP_3Way_4Way_Handshake.md) |
| 07 | [TCP 신뢰성·흐름 제어·혼잡 제어](./Volume1_Network/07_TCP_신뢰성_흐름제어_혼잡제어.md) |
| 08 | [TIME_WAIT와 CLOSE_WAIT](./Volume1_Network/08_TIME_WAIT_CLOSE_WAIT.md) |
| 09 | [HTTP와 HTTPS](./Volume1_Network/09_HTTP_HTTPS.md) |
| 10 | [WebSocket](./Volume1_Network/10_WebSocket.md) |
| 11 | [DNS·ARP·ICMP](./Volume1_Network/11_DNS_ARP_ICMP.md) |
| 12 | [NAT·Subnet·MTU](./Volume1_Network/12_NAT_Subnet_MTU.md) |
| 13 | [Load Balancer와 Reverse Proxy](./Volume1_Network/13_LoadBalancer_ReverseProxy.md) |
| 14 | [Network 종합면접](./Volume1_Network/14_Network_종합면접.md) |

### Volume 2 · Operating System

| # | 챕터 |
|---|------|
| 01 | [Program·Process·Thread](./Volume2_OperatingSystem/01_Program_Process_Thread.md) |
| 02 | [Process Memory와 PCB](./Volume2_OperatingSystem/02_Process_Memory_PCB.md) |
| 03 | [Context Switch와 CPU Scheduling](./Volume2_OperatingSystem/03_Context_Switch_CPU_Scheduling.md) |
| 04 | [동시성과 병렬성](./Volume2_OperatingSystem/04_동시성과_병렬성.md) |
| 05 | [Race Condition과 Critical Section](./Volume2_OperatingSystem/05_Race_Condition_Critical_Section.md) |
| 06 | [Mutex·Semaphore·SpinLock](./Volume2_OperatingSystem/06_Mutex_Semaphore_SpinLock.md) |
| 07 | [Atomic과 Memory Visibility](./Volume2_OperatingSystem/07_Atomic_Memory_Visibility.md) |
| 08 | [Deadlock·Starvation·Livelock](./Volume2_OperatingSystem/08_Deadlock_Starvation_Livelock.md) |
| 09 | [Stack·Heap·Code·Data·BSS](./Volume2_OperatingSystem/09_Stack_Heap_Code_Data_BSS.md) |
| 10 | [Virtual Memory·Paging·Page Fault](./Volume2_OperatingSystem/10_Virtual_Memory_Paging_PageFault.md) |
| 11 | [TLB와 CPU Cache](./Volume2_OperatingSystem/11_TLB_CPU_Cache.md) |
| 12 | [System Call과 Interrupt](./Volume2_OperatingSystem/12_System_Call_Interrupt.md) |
| 13 | [Operating System 종합면접](./Volume2_OperatingSystem/13_OS_종합면접.md) |

### Volume 3 · Database

| # | 챕터 |
|---|------|
| 01 | [RDBMS와 SQL 기초](./Volume3_Database/01_RDBMS_SQL_기초.md) |
| 02 | [Key와 정규화](./Volume3_Database/02_Key와_정규화.md) |
| 03 | [JOIN](./Volume3_Database/03_JOIN.md) |
| 04 | [Index와 B+Tree](./Volume3_Database/04_Index_BPlusTree.md) |
| 05 | [Clustered Index와 Composite Index](./Volume3_Database/05_Clustered_Composite_Index.md) |
| 06 | [Transaction과 ACID](./Volume3_Database/06_Transaction_ACID.md) |
| 07 | [Isolation Level](./Volume3_Database/07_Isolation_Level.md) |
| 08 | [DB Lock과 MVCC](./Volume3_Database/08_DB_Lock_MVCC.md) |
| 09 | [Optimistic Lock과 Pessimistic Lock](./Volume3_Database/09_Optimistic_Pessimistic_Lock.md) |
| 10 | [Redis](./Volume3_Database/10_Redis.md) |
| 11 | [Cache 전략과 정합성](./Volume3_Database/11_Cache_전략_정합성.md) |
| 12 | [Replication과 Sharding](./Volume3_Database/12_Replication_Sharding.md) |
| 13 | [Database 종합면접](./Volume3_Database/13_Database_종합면접.md) |

### Volume 4 · Data Structure

| # | 챕터 |
|---|------|
| 01 | [Array와 Dynamic Array](./Volume4_DataStructure/01_Array_Dynamic_Array.md) |
| 02 | [Linked List](./Volume4_DataStructure/02_Linked_List.md) |
| 03 | [Stack·Queue·Deque](./Volume4_DataStructure/03_Stack_Queue_Deque.md) |
| 04 | [Hash Table](./Volume4_DataStructure/04_Hash_Table.md) |
| 05 | [Tree와 BST](./Volume4_DataStructure/05_Tree_BST.md) |
| 06 | [AVL Tree와 Red-Black Tree](./Volume4_DataStructure/06_AVL_RedBlackTree.md) |
| 07 | [Heap과 Priority Queue](./Volume4_DataStructure/07_Heap_PriorityQueue.md) |
| 08 | [Trie](./Volume4_DataStructure/08_Trie.md) |
| 09 | [Graph](./Volume4_DataStructure/09_Graph.md) |
| 10 | [Union-Find](./Volume4_DataStructure/10_Union_Find.md) |
| 11 | [Data Structure 종합면접](./Volume4_DataStructure/11_DataStructure_종합면접.md) |

### Volume 5 · Algorithm

| # | 챕터 |
|---|------|
| 01 | [Time·Space Complexity](./Volume5_Algorithm/01_Time_Space_Complexity.md) |
| 02 | [BFS와 DFS](./Volume5_Algorithm/02_BFS_DFS.md) |
| 03 | [Binary Search](./Volume5_Algorithm/03_Binary_Search.md) |
| 04 | [Greedy](./Volume5_Algorithm/04_Greedy.md) |
| 05 | [Dynamic Programming](./Volume5_Algorithm/05_Dynamic_Programming.md) |
| 06 | [Backtracking](./Volume5_Algorithm/06_Backtracking.md) |
| 07 | [Dijkstra](./Volume5_Algorithm/07_Dijkstra.md) |
| 08 | [Bellman-Ford와 Floyd-Warshall](./Volume5_Algorithm/08_BellmanFord_FloydWarshall.md) |
| 09 | [Topological Sort](./Volume5_Algorithm/09_Topological_Sort.md) |
| 10 | [MST·Kruskal·Prim](./Volume5_Algorithm/10_MST_Kruskal_Prim.md) |
| 11 | [Two Pointer와 Sliding Window](./Volume5_Algorithm/11_TwoPointer_SlidingWindow.md) |
| 12 | [Algorithm 종합면접](./Volume5_Algorithm/12_Algorithm_종합면접.md) |

### Volume 6 · C++ · C#

| # | 챕터 |
|---|------|
| 01 | [Pointer와 Reference](./Volume6_CPP_CSharp/01_Pointer_Reference.md) |
| 02 | [new·delete·Memory Leak](./Volume6_CPP_CSharp/02_New_Delete_Memory_Leak.md) |
| 03 | [RAII와 Smart Pointer](./Volume6_CPP_CSharp/03_RAII_Smart_Pointer.md) |
| 04 | [Copy·Move Semantics](./Volume6_CPP_CSharp/04_Copy_Move_Semantics.md) |
| 05 | [Virtual Function과 Polymorphism](./Volume6_CPP_CSharp/05_Virtual_Function_Polymorphism.md) |
| 06 | [C# Value Type과 Reference Type](./Volume6_CPP_CSharp/06_CSharp_Value_Reference_Type.md) |
| 07 | [Boxing과 Unboxing](./Volume6_CPP_CSharp/07_Boxing_Unboxing.md) |
| 08 | [C# GC와 Generation](./Volume6_CPP_CSharp/08_CSharp_GC_Generation.md) |
| 09 | [ThreadPool·Task·async·await](./Volume6_CPP_CSharp/09_ThreadPool_Task_async_await.md) |
| 10 | [C++·C# 종합면접](./Volume6_CPP_CSharp/10_CPP_CSharp_종합면접.md) |

### Volume 7 · Game Server

| # | 챕터 |
|---|------|
| 01 | [Game Server Architecture](./Volume7_GameServer/01_Game_Server_Architecture.md) |
| 02 | [Authoritative Server](./Volume7_GameServer/02_Authoritative_Server.md) |
| 03 | [Game Loop와 Tick](./Volume7_GameServer/03_Game_Loop_Tick.md) |
| 04 | [Session과 Connection](./Volume7_GameServer/04_Session_Connection.md) |
| 05 | [Packet Framing](./Volume7_GameServer/05_Packet_Framing.md) |
| 06 | [Serialization과 Endian](./Volume7_GameServer/06_Serialization_Endian.md) |
| 07 | [Blocking과 Non-blocking I/O](./Volume7_GameServer/07_Blocking_NonBlocking_IO.md) |
| 08 | [Thread Model과 Work Queue](./Volume7_GameServer/08_Thread_Model_Work_Queue.md) |
| 09 | [Object Pool과 Buffer Pool](./Volume7_GameServer/09_Object_Pool_Buffer_Pool.md) |
| 10 | [Client Prediction과 Reconciliation](./Volume7_GameServer/10_Client_Prediction_Reconciliation.md) |
| 11 | [Interpolation과 Lag Compensation](./Volume7_GameServer/11_Interpolation_Lag_Compensation.md) |
| 12 | [Heartbeat와 Reconnect](./Volume7_GameServer/12_Heartbeat_Reconnect.md) |
| 13 | [Matchmaking](./Volume7_GameServer/13_Matchmaking.md) |
| 14 | [Login·Chat·Ranking Server](./Volume7_GameServer/14_Login_Chat_Ranking_Server.md) |
| 15 | [Game Server 종합면접](./Volume7_GameServer/15_GameServer_종합면접.md) |

### Volume 8 · Java

| # | 챕터 |
|---|------|
| 01 | [JVM·JRE·JDK와 Bytecode·JIT](./Volume8_Java/01_JVM_JRE_JDK_Bytecode_JIT.md) |
| 02 | [Primitive·Reference Type과 String·Immutability](./Volume8_Java/02_Primitive_Reference_String_Immutable.md) |
| 03 | [상속·Interface와 다형성](./Volume8_Java/03_Inheritance_Interface_Polymorphism.md) |
| 04 | [Exception·Checked·Unchecked와 try-with-resources](./Volume8_Java/04_Exception_Checked_Unchecked_TryResources.md) |
| 05 | [Collections Framework·List·Set·Map](./Volume8_Java/05_Collections_List_Set_Map.md) |
| 06 | [Generics·Type Erasure와 Wildcard](./Volume8_Java/06_Generics_Type_Erasure_Wildcard.md) |
| 07 | [JVM Memory·GC와 Reference](./Volume8_Java/07_JVM_Memory_GC_Reference.md) |
| 08 | [Java Memory Model·synchronized·volatile·Atomic](./Volume8_Java/08_Java_Memory_Model_Synchronized_Volatile_Atomic.md) |
| 09 | [Executor·CompletableFuture와 Virtual Thread](./Volume8_Java/09_Executor_CompletableFuture_VirtualThread.md) |
| 10 | [Java 종합면접](./Volume8_Java/10_Java_종합면접.md) |
