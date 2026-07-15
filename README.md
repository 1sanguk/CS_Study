# Game Server CS Interview Guide

게임 서버 및 백엔드 개발자 면접을 위한 CS 학습 교재 프로젝트다.

## Codex 실행 방법

VS Code에서 이 폴더를 열고 Codex에 다음과 같이 입력한다.

```text
프로젝트를 계속 진행해.
```

Codex는 자동으로 다음 파일을 읽는다.

1. `AGENTS.md`
2. `목차.md`
3. `TEMPLATE.md`
4. `STYLE_GUIDE.md`

그 후 `목차.md`에서 첫 번째 미작성 문서 `[ ]` 하나를 찾아 작성한다.

작업 완료 후 다음 파일을 자동 갱신한다.

- `목차.md`
- `README.md`
- `CHANGELOG.md`

기본 요청에서는 문서 하나만 작성한다. 사용자가 특정 권이나 범위를 지정하면 해당 범위까지 순차적으로 작성한다.

---

## 학습 방법

1. 완료된 문서를 15~30분 동안 읽는다.
2. 핵심 요약을 보지 않고 직접 설명한다.
3. ChatGPT와 해당 주제로 모의면접을 진행한다.
4. 답변하지 못한 부분을 문서에 보완한다.
5. 다음 문서로 넘어간다.

---

## 현재 진행률

- 전체: 98 / 98 (100%)
- Network: 14 / 14 (100%)
- Operating System: 13 / 13 (100%)
- Database: 13 / 13 (100%)
- Data Structure: 11 / 11 (100%)
- Algorithm: 12 / 12 (100%)
- C++ / C#: 10 / 10 (100%)
- Game Server: 15 / 15 (100%)
- Java: 10 / 10 (100%)

### 완료 문서

- [01. OSI 7계층](./Volume1_Network/01_OSI_7계층.md)
- [02. TCP/IP 모델](./Volume1_Network/02_TCP_IP_모델.md)
- [03. IP 주소와 라우팅](./Volume1_Network/03_IP_주소와_라우팅.md)
- [04. Port와 Socket](./Volume1_Network/04_Port와_Socket.md)
- [05. TCP와 UDP](./Volume1_Network/05_TCP와_UDP.md)
- [06. TCP 3-Way·4-Way Handshake](./Volume1_Network/06_TCP_3Way_4Way_Handshake.md)
- [07. TCP 신뢰성·흐름 제어·혼잡 제어](./Volume1_Network/07_TCP_신뢰성_흐름제어_혼잡제어.md)
- [08. TIME_WAIT와 CLOSE_WAIT](./Volume1_Network/08_TIME_WAIT_CLOSE_WAIT.md)
- [09. HTTP와 HTTPS](./Volume1_Network/09_HTTP_HTTPS.md)
- [10. WebSocket](./Volume1_Network/10_WebSocket.md)
- [11. DNS·ARP·ICMP](./Volume1_Network/11_DNS_ARP_ICMP.md)
- [12. NAT·Subnet·MTU](./Volume1_Network/12_NAT_Subnet_MTU.md)
- [13. Load Balancer와 Reverse Proxy](./Volume1_Network/13_LoadBalancer_ReverseProxy.md)
- [14. Network 종합면접](./Volume1_Network/14_Network_종합면접.md)
- [OS 01. Program·Process·Thread](./Volume2_OperatingSystem/01_Program_Process_Thread.md)
- [OS 02. Process Memory와 PCB](./Volume2_OperatingSystem/02_Process_Memory_PCB.md)
- [OS 03. Context Switch와 CPU Scheduling](./Volume2_OperatingSystem/03_Context_Switch_CPU_Scheduling.md)
- [OS 04. 동시성과 병렬성](./Volume2_OperatingSystem/04_동시성과_병렬성.md)
- [OS 05. Race Condition과 Critical Section](./Volume2_OperatingSystem/05_Race_Condition_Critical_Section.md)
- [OS 06. Mutex·Semaphore·SpinLock](./Volume2_OperatingSystem/06_Mutex_Semaphore_SpinLock.md)
- [OS 07. Atomic과 Memory Visibility](./Volume2_OperatingSystem/07_Atomic_Memory_Visibility.md)
- [OS 08. Deadlock·Starvation·Livelock](./Volume2_OperatingSystem/08_Deadlock_Starvation_Livelock.md)
- [OS 09. Stack·Heap·Code·Data·BSS](./Volume2_OperatingSystem/09_Stack_Heap_Code_Data_BSS.md)
- [OS 10. Virtual Memory·Paging·Page Fault](./Volume2_OperatingSystem/10_Virtual_Memory_Paging_PageFault.md)
- [OS 11. TLB와 CPU Cache](./Volume2_OperatingSystem/11_TLB_CPU_Cache.md)
- [OS 12. System Call과 Interrupt](./Volume2_OperatingSystem/12_System_Call_Interrupt.md)
- [OS 13. Operating System 종합면접](./Volume2_OperatingSystem/13_OS_종합면접.md)
- [DB 01. RDBMS와 SQL 기초](./Volume3_Database/01_RDBMS_SQL_기초.md)
- [DB 02. Key와 정규화](./Volume3_Database/02_Key와_정규화.md)
- [DB 03. JOIN](./Volume3_Database/03_JOIN.md)
- [DB 04. Index와 B+Tree](./Volume3_Database/04_Index_BPlusTree.md)
- [DB 05. Clustered Index와 Composite Index](./Volume3_Database/05_Clustered_Composite_Index.md)
- [DB 06. Transaction과 ACID](./Volume3_Database/06_Transaction_ACID.md)
- [DB 07. Isolation Level](./Volume3_Database/07_Isolation_Level.md)
- [DB 08. DB Lock과 MVCC](./Volume3_Database/08_DB_Lock_MVCC.md)
- [DB 09. Optimistic Lock과 Pessimistic Lock](./Volume3_Database/09_Optimistic_Pessimistic_Lock.md)
- [DB 10. Redis](./Volume3_Database/10_Redis.md)
- [DB 11. Cache 전략과 정합성](./Volume3_Database/11_Cache_전략_정합성.md)
- [DB 12. Replication과 Sharding](./Volume3_Database/12_Replication_Sharding.md)
- [DB 13. Database 종합면접](./Volume3_Database/13_Database_종합면접.md)
- [DS 01. Array와 Dynamic Array](./Volume4_DataStructure/01_Array_Dynamic_Array.md)
- [DS 02. Linked List](./Volume4_DataStructure/02_Linked_List.md)
- [DS 03. Stack·Queue·Deque](./Volume4_DataStructure/03_Stack_Queue_Deque.md)
- [DS 04. Hash Table](./Volume4_DataStructure/04_Hash_Table.md)
- [DS 05. Tree와 BST](./Volume4_DataStructure/05_Tree_BST.md)
- [DS 06. AVL Tree와 Red-Black Tree](./Volume4_DataStructure/06_AVL_RedBlackTree.md)
- [DS 07. Heap과 Priority Queue](./Volume4_DataStructure/07_Heap_PriorityQueue.md)
- [DS 08. Trie](./Volume4_DataStructure/08_Trie.md)
- [DS 09. Graph](./Volume4_DataStructure/09_Graph.md)
- [DS 10. Union-Find](./Volume4_DataStructure/10_Union_Find.md)
- [DS 11. Data Structure 종합면접](./Volume4_DataStructure/11_DataStructure_종합면접.md)
- [Algorithm 01. Time·Space Complexity](./Volume5_Algorithm/01_Time_Space_Complexity.md)
- [Algorithm 02. BFS와 DFS](./Volume5_Algorithm/02_BFS_DFS.md)
- [Algorithm 03. Binary Search](./Volume5_Algorithm/03_Binary_Search.md)
- [Algorithm 04. Greedy](./Volume5_Algorithm/04_Greedy.md)
- [Algorithm 05. Dynamic Programming](./Volume5_Algorithm/05_Dynamic_Programming.md)
- [Algorithm 06. Backtracking](./Volume5_Algorithm/06_Backtracking.md)
- [Algorithm 07. Dijkstra](./Volume5_Algorithm/07_Dijkstra.md)
- [Algorithm 08. Bellman-Ford와 Floyd-Warshall](./Volume5_Algorithm/08_BellmanFord_FloydWarshall.md)
- [Algorithm 09. Topological Sort](./Volume5_Algorithm/09_Topological_Sort.md)
- [Algorithm 10. MST·Kruskal·Prim](./Volume5_Algorithm/10_MST_Kruskal_Prim.md)
- [Algorithm 11. Two Pointer와 Sliding Window](./Volume5_Algorithm/11_TwoPointer_SlidingWindow.md)
- [Algorithm 12. Algorithm 종합면접](./Volume5_Algorithm/12_Algorithm_종합면접.md)
- [C++·C# 01. Pointer와 Reference](./Volume6_CPP_CSharp/01_Pointer_Reference.md)
- [C++·C# 02. new·delete·Memory Leak](./Volume6_CPP_CSharp/02_New_Delete_Memory_Leak.md)
- [C++·C# 03. RAII와 Smart Pointer](./Volume6_CPP_CSharp/03_RAII_Smart_Pointer.md)
- [C++·C# 04. Copy·Move Semantics](./Volume6_CPP_CSharp/04_Copy_Move_Semantics.md)
- [C++·C# 05. Virtual Function과 Polymorphism](./Volume6_CPP_CSharp/05_Virtual_Function_Polymorphism.md)
- [C++·C# 06. C# Value Type과 Reference Type](./Volume6_CPP_CSharp/06_CSharp_Value_Reference_Type.md)
- [C++·C# 07. Boxing과 Unboxing](./Volume6_CPP_CSharp/07_Boxing_Unboxing.md)
- [C++·C# 08. C# GC와 Generation](./Volume6_CPP_CSharp/08_CSharp_GC_Generation.md)
- [C++·C# 09. ThreadPool·Task·async·await](./Volume6_CPP_CSharp/09_ThreadPool_Task_async_await.md)
- [C++·C# 10. C++·C# 종합면접](./Volume6_CPP_CSharp/10_CPP_CSharp_종합면접.md)
- [Game Server 01. Game Server Architecture](./Volume7_GameServer/01_Game_Server_Architecture.md)
- [Game Server 02. Authoritative Server](./Volume7_GameServer/02_Authoritative_Server.md)
- [Game Server 03. Game Loop와 Tick](./Volume7_GameServer/03_Game_Loop_Tick.md)
- [Game Server 04. Session과 Connection](./Volume7_GameServer/04_Session_Connection.md)
- [Game Server 05. Packet Framing](./Volume7_GameServer/05_Packet_Framing.md)
- [Game Server 06. Serialization과 Endian](./Volume7_GameServer/06_Serialization_Endian.md)
- [Game Server 07. Blocking과 Non-blocking I/O](./Volume7_GameServer/07_Blocking_NonBlocking_IO.md)
- [Game Server 08. Thread Model과 Work Queue](./Volume7_GameServer/08_Thread_Model_Work_Queue.md)
- [Game Server 09. Object Pool과 Buffer Pool](./Volume7_GameServer/09_Object_Pool_Buffer_Pool.md)
- [Game Server 10. Client Prediction과 Reconciliation](./Volume7_GameServer/10_Client_Prediction_Reconciliation.md)
- [Game Server 11. Interpolation과 Lag Compensation](./Volume7_GameServer/11_Interpolation_Lag_Compensation.md)
- [Game Server 12. Heartbeat와 Reconnect](./Volume7_GameServer/12_Heartbeat_Reconnect.md)
- [Game Server 13. Matchmaking](./Volume7_GameServer/13_Matchmaking.md)
- [Game Server 14. Login·Chat·Ranking Server](./Volume7_GameServer/14_Login_Chat_Ranking_Server.md)
- [Game Server 15. Game Server 종합면접](./Volume7_GameServer/15_GameServer_종합면접.md)
- [Java 01. JVM·JRE·JDK와 Bytecode·JIT](./Volume8_Java/01_JVM_JRE_JDK_Bytecode_JIT.md)
- [Java 02. Primitive·Reference Type과 String·Immutability](./Volume8_Java/02_Primitive_Reference_String_Immutable.md)
- [Java 03. 상속·Interface와 다형성](./Volume8_Java/03_Inheritance_Interface_Polymorphism.md)
- [Java 04. Exception·Checked·Unchecked와 try-with-resources](./Volume8_Java/04_Exception_Checked_Unchecked_TryResources.md)
- [Java 05. Collections Framework·List·Set·Map](./Volume8_Java/05_Collections_List_Set_Map.md)
- [Java 06. Generics·Type Erasure와 Wildcard](./Volume8_Java/06_Generics_Type_Erasure_Wildcard.md)
- [Java 07. JVM Memory·GC와 Reference](./Volume8_Java/07_JVM_Memory_GC_Reference.md)
- [Java 08. Java Memory Model·synchronized·volatile·Atomic](./Volume8_Java/08_Java_Memory_Model_Synchronized_Volatile_Atomic.md)
- [Java 09. Executor·CompletableFuture와 Virtual Thread](./Volume8_Java/09_Executor_CompletableFuture_VirtualThread.md)
- [Java 10. Java 종합면접](./Volume8_Java/10_Java_종합면접.md)

진행 상태의 기준 파일은 [목차.md](./목차.md)다.

---

## 관리 파일

- [AGENTS.md](./AGENTS.md): Codex 작업 규칙
- [목차.md](./목차.md): 전체 목차와 진행 상태
- [TEMPLATE.md](./TEMPLATE.md): 문서 템플릿
- [STYLE_GUIDE.md](./STYLE_GUIDE.md): 문체와 용어 규칙
- [CHANGELOG.md](./CHANGELOG.md): 작업 기록
