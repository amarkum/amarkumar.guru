# LLD / System Design Practice — Amazon

Every problem is one self-contained `.md` file in the same format:

1. Interview question
2. Assumptions / clarification
3. Functional requirements
4. Non-functional requirements
5. CAP / consistency
6. Core entities
7. IS-A / HAS-A
8. UML diagram
9. APIs
10. Design patterns
11. SOLID mapping
12. High-level flow
13. Concurrency
14. Edge cases
15. End-to-end Java implementation
16. New requirements → how the class diagram evolves
17. Amazon follow-up questions

## What the interviewer scores

- Did you apply design patterns (and say *why*)?
- Did you apply Effective Java ideas (immutability, builders, static factories, enums over ints, `Optional`, program to interfaces, composition over inheritance, defensive copies)?
- Did you handle follow-ups and extend the design without rewriting it?
- Is the code readable, compilable, and close to defect-free?
- Did you gather requirements first and explain the class structure before coding?

> Lesson from a real round: after the basic parking design, the follow-up was **peak vs non-peak pricing**. Always leave a `PricingStrategy` seam — pricing, matching, routing and filtering are the four things Amazon loves to change mid-interview.

## Problems

| # | Problem | Type | Key idea |
|---|---------|------|----------|
| 01 | [Rate Limiter](01-rate-limiter.md) | LLD + distributed | Strategy, token bucket, Redis Lua |
| 02 | [Parking Lot / Ticketing & Receipt](02-parking-lot.md) | LLD | Strategy (spot + pricing), peak pricing |
| 03 | [Unix File Search](03-file-search.md) | LLD | Specification / Composite filters |
| 04 | [Pub-Sub](04-pub-sub.md) | LLD | Observer, per-topic executors |
| 05 | [Inventory Management](05-inventory-management.md) | LLD + concurrency | Reservation, CAS / optimistic locking |
| 06 | [Return Drop Store Booking](06-return-drop-store.md) | LLD + geo | Geohash, slot booking |
| 07 | [Config Sync Across Devices](07-config-sync.md) | LLD + HLD | Versioning, vector clocks, LWW |
| 08 | [Artifact Repository (JFrog)](08-artifact-repository.md) | HLD | Content-addressed storage, scan pipeline |
| 09 | [First Unique Character (String + Stream)](09-first-unique-char.md) | DSA + design | LinkedHashMap / DLL |
| 10 | [Task Scheduler](10-task-scheduler.md) | LLD + concurrency | DelayQueue, Command |
| 11 | [DJ + Recommendation Playlist Mixer](11-playlist-mixer.md) | LLD | Iterator, Strategy, filter chain |
| 12 | [Attendance for Hourly Employees](12-attendance-system.md) | HLD + LLD | Event sourcing, idempotency |
| 13 | [Music Streaming (Spotify)](13-music-streaming.md) | HLD | CDN, HLS, Elasticsearch |
| 14 | [News Feed (Facebook)](14-news-feed.md) | HLD | Fan-out hybrid, sharded counters |
| 15 | [Meeting Room Scheduler](15-meeting-room-scheduler.md) | LLD | Interval tree, locking per room |
| 16 | [Notification System + Router](16-notification-system.md) | LLD | Strategy, Chain, Factory |
| 17 | [Google Docs](17-google-docs.md) | HLD | OT vs CRDT, snapshot + ops |
| 18 | [Uber](18-uber.md) | LLD + HLD | State machine, geohash, surge |
| 19 | [Amazon Locker](19-amazon-locker.md) | LLD + HLD | Allocation strategy, OTP, expiry |
| 20 | [Shipping Cost Calculator](20-shipping-cost-calculator.md) | LLD | Decorator / rule chain |
| 21 | [Food Delivery (Zomato)](21-food-delivery.md) | HLD | Order saga, dispatch |
| 22 | [Backup System (full/diff/log)](22-backup-system.md) | LLD | Template Method, restore chain |
| 23 | [Logging Framework](23-logging-framework.md) | LLD | Chain of Responsibility, appenders |
| 24 | [Elevator](24-elevator.md) | LLD | State, SCAN/LOOK scheduling |
| 25 | [Movie Ticket Booking](25-movie-ticket-booking.md) | LLD | Seat hold with TTL |
| 26 | [Library Management](26-library-management.md) | LLD | Fine strategy, reservations |

## 45-minute round template

| Minutes | Do |
|---|---|
| 0–5 | Clarify, write FR/NFR, state assumptions out loud |
| 5–10 | Entities + class diagram + interfaces (the "seams") |
| 10–35 | Code: models → interfaces → services → one happy-path `main` |
| 35–45 | Follow-ups: add a new Strategy/Decorator, talk concurrency, scale |
