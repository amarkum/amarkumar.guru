# 01 · Rate Limiter

## Interview question
Design a rate limiter. Discuss Fixed Window, Sliding Window, Token Bucket; then make it work across multiple application instances (Redis, locks, consistency).

## Assumptions / clarification
- Limit per **key** (userId / API key / IP) and optionally per API route.
- Rules are configurable: e.g. `100 req / 60s` for free tier, `1000 / 60s` for premium.
- Rejected requests return HTTP `429` with `Retry-After`.
- Starts in-process (single JVM), then extended to distributed.
- Slight over-admission (a few %) is acceptable under partition; availability of the API matters more than exactness.

## Functional requirements
1. `allow(key)` → true/false.
2. Pluggable algorithms: fixed window, sliding window log, sliding window counter, token bucket, leaky bucket.
3. Per-client / per-route rules.
4. Expose remaining quota + reset time (headers `X-RateLimit-Remaining`).

## Non-functional requirements
- Sub-millisecond decision in-process; < 2 ms with Redis.
- Thread safe under high concurrency.
- Memory bounded (evict idle keys).
- Fail-open if the limiter store is down (configurable).

## CAP / consistency
- Distributed limiter picks **AP**: if Redis shard is unreachable, fail open (or fall back to a local limiter with `limit / N instances`).
- Counter updates must be **atomic** per key → Redis Lua script (single-threaded execution on the shard) instead of GET-then-SET.
- Cross-region: keep counters regional; accept eventual consistency globally.

## Core entities
`RateLimiter`, `RateLimitRule`, `RateLimitAlgorithm` (TokenBucket, FixedWindow, SlidingWindowLog, SlidingWindowCounter), `Bucket/WindowState`, `RuleProvider`, `Clock`, `RateLimitResult`.

## IS-A / HAS-A
- `TokenBucketLimiter` **IS-A** `RateLimitAlgorithm`; `FixedWindowLimiter` **IS-A** `RateLimitAlgorithm`; `RedisTokenBucketLimiter` **IS-A** `RateLimitAlgorithm`.
- `RateLimiterService` **HAS-A** `RuleProvider`, **HAS-A** map of `RateLimitAlgorithm`.
- `TokenBucketLimiter` **HAS-A** `ConcurrentHashMap<String, Bucket>` and a `Clock`.

## UML diagram
```mermaid
classDiagram
    class AlgorithmType {
      <<enumeration>>
      TOKEN_BUCKET
      FIXED_WINDOW
      SLIDING_LOG
    }
    class RateLimitRule {
      <<record>>
      +int capacity
      +Duration window
      +AlgorithmType type
    }
    class RateLimitResult {
      <<record>>
      +boolean allowed
      +long remaining
      +long retryAfterMs
    }
    class RateLimitAlgorithm {
      <<interface>>
      +tryAcquire(String, RateLimitRule) RateLimitResult
    }
    class RuleProvider {
      <<interface>>
      +ruleFor(String, String) RateLimitRule
    }
    class TokenBucketLimiter {
      <<class>>
      -Map~String,Bucket~ buckets
      -java.util.function.LongSupplier nanoClock
      +tryAcquire(String, RateLimitRule) RateLimitResult
    }
    class Bucket {
      <<class>>
      +double tokens
      +long lastRefillNanos
    }
    class FixedWindowLimiter {
      <<class>>
      -Map~String,Window~ windows
      -Clock clock
      +tryAcquire(String, RateLimitRule) RateLimitResult
    }
    class Window {
      <<record>>
      +long windowStart
      +int count
    }
    class SlidingWindowLogLimiter {
      <<class>>
      -Map~String,java.util.ArrayDeque~ logs
      -Clock clock
      +tryAcquire(String, RateLimitRule) RateLimitResult
    }
    class AlgorithmFactory {
      <<class>>
      -Map~AlgorithmType,RateLimitAlgorithm~ registry
      +get(AlgorithmType) RateLimitAlgorithm
    }
    class RateLimiterService {
      <<class>>
      -RuleProvider rules
      -AlgorithmFactory factory
      +allow(String, String) RateLimitResult
    }
    class RedisTokenBucketLimiter {
      <<class>>
      -RedisClient redis
      -String scriptSha
      +tryAcquire(String, RateLimitRule) RateLimitResult
    }
    class RedisClient {
      <<interface>>
      +evalSha(String, String, Object[]) long[]
      +timeMs() long
    }
    RateLimitAlgorithm <|.. TokenBucketLimiter
    RateLimitAlgorithm <|.. FixedWindowLimiter
    RateLimitAlgorithm <|.. SlidingWindowLogLimiter
    RateLimitAlgorithm <|.. RedisTokenBucketLimiter
    RateLimiterService --> RuleProvider
    RateLimiterService --> RateLimitAlgorithm
    RateLimiterService ..> RateLimitResult
    RateLimitRule --> AlgorithmType
    TokenBucketLimiter --> "*" Bucket
    FixedWindowLimiter --> "*" Window
    AlgorithmFactory --> "*" AlgorithmType
    AlgorithmFactory --> "*" RateLimitAlgorithm
    RateLimiterService --> AlgorithmFactory
    RedisTokenBucketLimiter --> RedisClient
```

## APIs
```
RateLimitResult allow(String clientId, String route)
PUT  /v1/rules/{clientId}      { capacity, windowSec, algorithm }
GET  /v1/rules/{clientId}
Response headers: X-RateLimit-Limit, X-RateLimit-Remaining, Retry-After
```

## Design patterns
- **Strategy** – each algorithm is swappable.
- **Factory** – `AlgorithmFactory` picks the strategy from `AlgorithmType`.
- **Proxy / Decorator** – limiter sits in front of the real handler (API-gateway filter).
- **Singleton (via DI)** – one service instance per JVM.

## SOLID mapping
- **S**: rules lookup (`RuleProvider`) vs algorithm vs HTTP filter are separate.
- **O**: new algorithm = new class, service unchanged.
- **L**: any `RateLimitAlgorithm` works where another is used.
- **I**: small `RateLimitAlgorithm` interface (one method).
- **D**: service depends on `RuleProvider`/`RateLimitAlgorithm` interfaces, `Clock` injected for tests.

## High-level flow
```mermaid
flowchart TD
  C[Client] --> G[API Gateway] --> F[RateLimitFilter] --> S[RateLimiterService]
  S --> R[RuleProvider<br/>cached rules]
  R --> A["Algorithm.tryAcquire(key)"]
  A --> L[(Local map)]
  A --> RD[(Redis<br/>Lua, atomic)]
  A -->|allowed| B[Backend service]
  A -->|rejected| X[429 + Retry-After]
```

## Algorithm trade-offs
| Algorithm | Memory | Accuracy | Burst | Notes |
|---|---|---|---|---|
| Fixed window | O(1)/key | Boundary burst 2× | Yes at edge | Simplest, `INCR`+`EXPIRE` |
| Sliding log | O(limit)/key | Exact | No | Redis ZSET of timestamps |
| Sliding counter | O(1)/key | ~approx | Smoothed | `prev*(overlap%) + curr` |
| Token bucket | O(1)/key | Good | Controlled bursts | Amazon API GW uses this |
| Leaky bucket | queue | Smooth output | No | Good for shaping outbound |

## Concurrency
- In-process: `ConcurrentHashMap.computeIfAbsent` for bucket creation, `synchronized` on the bucket (per-key lock, no global lock) or `AtomicLong` + CAS.
- Distributed: Redis Lua script = atomic read-modify-write on one shard; keys sharded by `clientId` (consistent hashing / Redis Cluster slots).
- Avoid distributed locks (Redlock) in the hot path — too slow; Lua atomicity is enough.
- Optimisation: local token pre-fetch (take 10 tokens from Redis at once) → fewer round trips, tiny accuracy loss.

## Edge cases
- Clock skew between app servers → use Redis `TIME` inside Lua.
- Unknown client → default rule.
- Rule changed mid-window → apply on next refill.
- Idle keys → TTL on Redis keys / Caffeine eviction locally.
- Redis down → fail open + alert, or local fallback limit.
- Very large `n` requests (batch) → `tryAcquire(key, permits)`.

## End-to-end Java implementation
```java
import java.time.Clock;
import java.time.Duration;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

enum AlgorithmType { TOKEN_BUCKET, FIXED_WINDOW, SLIDING_LOG }

record RateLimitRule(int capacity, Duration window, AlgorithmType type) {
    RateLimitRule {
        if (capacity <= 0) throw new IllegalArgumentException("capacity must be > 0");
    }
}

record RateLimitResult(boolean allowed, long remaining, long retryAfterMs) {
    static RateLimitResult allow(long remaining) { return new RateLimitResult(true, remaining, 0); }
    static RateLimitResult deny(long retryAfterMs) { return new RateLimitResult(false, 0, retryAfterMs); }
}

interface RateLimitAlgorithm {
    RateLimitResult tryAcquire(String key, RateLimitRule rule);
}

interface RuleProvider {
    RateLimitRule ruleFor(String clientId, String route);
}

final class TokenBucketLimiter implements RateLimitAlgorithm {
    private static final class Bucket {
        double tokens;
        long lastRefillNanos;
        Bucket(double tokens, long now) { this.tokens = tokens; this.lastRefillNanos = now; }
    }

    private final Map<String, Bucket> buckets = new ConcurrentHashMap<>();
    private final java.util.function.LongSupplier nanoClock;

    TokenBucketLimiter(java.util.function.LongSupplier nanoClock) { this.nanoClock = nanoClock; }

    @Override
    public RateLimitResult tryAcquire(String key, RateLimitRule rule) {
        long now = nanoClock.getAsLong();
        Bucket bucket = buckets.computeIfAbsent(key, k -> new Bucket(rule.capacity(), now));
        double ratePerNano = (double) rule.capacity() / rule.window().toNanos();
        synchronized (bucket) {                       // per-key lock only
            bucket.tokens = Math.min(rule.capacity(),
                    bucket.tokens + (now - bucket.lastRefillNanos) * ratePerNano);
            bucket.lastRefillNanos = now;
            if (bucket.tokens >= 1) {
                bucket.tokens -= 1;
                return RateLimitResult.allow((long) bucket.tokens);
            }
            long waitNanos = (long) ((1 - bucket.tokens) / ratePerNano);
            return RateLimitResult.deny(Duration.ofNanos(waitNanos).toMillis());
        }
    }
}

final class FixedWindowLimiter implements RateLimitAlgorithm {
    private record Window(long windowStart, int count) {}
    private final Map<String, Window> windows = new ConcurrentHashMap<>();
    private final Clock clock;

    FixedWindowLimiter(Clock clock) { this.clock = clock; }

    @Override
    public RateLimitResult tryAcquire(String key, RateLimitRule rule) {
        long now = clock.millis();
        long size = rule.window().toMillis();
        long start = now - (now % size);
        Window w = windows.compute(key, (k, old) ->
                (old == null || old.windowStart() != start) ? new Window(start, 1)
                                                             : new Window(start, old.count() + 1));
        return w.count() <= rule.capacity()
                ? RateLimitResult.allow(rule.capacity() - w.count())
                : RateLimitResult.deny(start + size - now);
    }
}

final class SlidingWindowLogLimiter implements RateLimitAlgorithm {
    private final Map<String, java.util.ArrayDeque<Long>> logs = new ConcurrentHashMap<>();
    private final Clock clock;

    SlidingWindowLogLimiter(Clock clock) { this.clock = clock; }

    @Override
    public RateLimitResult tryAcquire(String key, RateLimitRule rule) {
        long now = clock.millis();
        var log = logs.computeIfAbsent(key, k -> new java.util.ArrayDeque<>());
        synchronized (log) {
            while (!log.isEmpty() && log.peekFirst() <= now - rule.window().toMillis()) log.pollFirst();
            if (log.size() < rule.capacity()) {
                log.addLast(now);
                return RateLimitResult.allow(rule.capacity() - log.size());
            }
            return RateLimitResult.deny(log.peekFirst() + rule.window().toMillis() - now);
        }
    }
}

final class AlgorithmFactory {
    private final Map<AlgorithmType, RateLimitAlgorithm> registry;
    AlgorithmFactory(Clock clock) {
        registry = Map.of(
            AlgorithmType.TOKEN_BUCKET, new TokenBucketLimiter(System::nanoTime),
            AlgorithmType.FIXED_WINDOW, new FixedWindowLimiter(clock),
            AlgorithmType.SLIDING_LOG, new SlidingWindowLogLimiter(clock));
    }
    RateLimitAlgorithm get(AlgorithmType type) { return registry.get(type); }
}

final class RateLimiterService {
    private final RuleProvider rules;
    private final AlgorithmFactory factory;

    RateLimiterService(RuleProvider rules, AlgorithmFactory factory) {
        this.rules = rules; this.factory = factory;
    }

    RateLimitResult allow(String clientId, String route) {
        RateLimitRule rule = rules.ruleFor(clientId, route);
        return factory.get(rule.type()).tryAcquire(clientId + ":" + route, rule);
    }
}

public class RateLimiterDemo {
    public static void main(String[] args) {
        RuleProvider rules = (c, r) -> c.startsWith("premium")
                ? new RateLimitRule(10, Duration.ofSeconds(1), AlgorithmType.TOKEN_BUCKET)
                : new RateLimitRule(3, Duration.ofSeconds(1), AlgorithmType.FIXED_WINDOW);
        var service = new RateLimiterService(rules, new AlgorithmFactory(Clock.systemUTC()));
        for (int i = 0; i < 5; i++) System.out.println("free  " + service.allow("free-1", "/orders"));
        for (int i = 0; i < 5; i++) System.out.println("prem  " + service.allow("premium-1", "/orders"));
    }
}
```

### Distributed token bucket (Redis Lua)
```lua
-- KEYS[1]=bucket key, ARGV: capacity, refillPerMs, nowMs, permits
local b = redis.call('HMGET', KEYS[1], 'tokens', 'ts')
local tokens = tonumber(b[1]) or tonumber(ARGV[1])
local ts = tonumber(b[2]) or tonumber(ARGV[3])
tokens = math.min(tonumber(ARGV[1]), tokens + (tonumber(ARGV[3]) - ts) * tonumber(ARGV[2]))
local allowed = tokens >= tonumber(ARGV[4])
if allowed then tokens = tokens - tonumber(ARGV[4]) end
redis.call('HSET', KEYS[1], 'tokens', tokens, 'ts', ARGV[3])
redis.call('PEXPIRE', KEYS[1], 120000)
return { allowed and 1 or 0, math.floor(tokens) }
```
```java
final class RedisTokenBucketLimiter implements RateLimitAlgorithm {
    private final RedisClient redis;   // wrapper over Jedis/Lettuce EVALSHA
    private final String scriptSha;
    RedisTokenBucketLimiter(RedisClient redis, String scriptSha) { this.redis = redis; this.scriptSha = scriptSha; }
    public RateLimitResult tryAcquire(String key, RateLimitRule rule) {
        try {
            double refillPerMs = (double) rule.capacity() / rule.window().toMillis();
            long[] r = redis.evalSha(scriptSha, "rl:" + key, rule.capacity(), refillPerMs, redis.timeMs(), 1);
            return r[0] == 1 ? RateLimitResult.allow(r[1]) : RateLimitResult.deny((long) (1 / refillPerMs));
        } catch (RuntimeException e) {
            return RateLimitResult.allow(-1); // fail-open, emit metric
        }
    }
}
interface RedisClient { long[] evalSha(String sha, String key, Object... args); long timeMs(); }
```

## New requirements → how the class diagram evolves
| New requirement | Change |
|---|---|
| Multiple instances | Add `RedisTokenBucketLimiter` (new Strategy). Nothing else changes. |
| Tiered plans (free/premium) | `RuleProvider` backed by DB + cache; `RateLimitRule` gets `tier`. |
| Multiple limits at once (10/s AND 1000/day) | `CompositeLimiter implements RateLimitAlgorithm` holding a list — **Composite**. |
| Weighted requests (bulk API costs 5) | `tryAcquire(key, rule, permits)`. |
| Queue instead of reject | `LeakyBucketLimiter` with bounded queue. |
| Observability | `MetricsLimiterDecorator` wrapping any algorithm — **Decorator**. |

```mermaid
classDiagram
    RateLimitAlgorithm <|.. CompositeLimiter
    RateLimitAlgorithm <|.. MetricsLimiterDecorator
    CompositeLimiter o-- RateLimitAlgorithm
    MetricsLimiterDecorator o-- RateLimitAlgorithm
    class CompositeLimiter {
      <<class>>
    }
    class RateLimitAlgorithm {
      <<interface>>
    }
    class MetricsLimiterDecorator {
      <<class>>
    }
```

## Amazon follow-up questions

Tap a question to see a simple answer.

<details class="qa">
<summary><span class="qn">1</span>Why does fixed window allow 2× bursts at the boundary? How does sliding window counter fix it?</summary>

A fixed window resets its counter on the clock edge. With a limit of 100 per minute, a client can send 100 at 0:59 and 100 more at 1:00, so 200 requests land in about two seconds. A sliding window counter blends the two windows: it counts `previous × (how much of it still overlaps) + current`. The old burst still counts against you, so the edge trick stops working.

</details>

<details class="qa">
<summary><span class="qn">2</span>How do you rate-limit across 50 app instances? What if Redis is the bottleneck? (shard by key, local pre-fetch of tokens, sticky routing)</summary>

Keep the counters in one shared place, usually Redis, so every instance sees the same count. If Redis becomes the bottleneck, split keys across Redis shards (by client id). You can also let each instance grab a small batch of tokens at a time and spend them locally, or route the same client to the same instance so most checks stay local.

</details>

<details class="qa">
<summary><span class="qn">3</span>Redis is down — fail open or closed? Justify per use case (login = closed, catalog read = open).</summary>

It depends on what you're protecting. For login or payments, fail **closed** (reject) because letting attackers through is worse than a short outage. For reading the product catalog, fail **open** (allow) because blocking real customers costs more than a brief lack of limiting. Either way, alarm on it and use a small local limiter as a backup.

</details>

<details class="qa">
<summary><span class="qn">4</span>Why Lua script instead of <code>WATCH/MULTI</code>? Why not Redlock?</summary>

A Lua script runs inside Redis as one atomic step: read the bucket, refill it, take a token, save it. No other command can sneak in between. `WATCH/MULTI` is optimistic and retries when there's contention, which means extra round trips exactly when traffic is hottest. Redlock is a distributed lock. It's slow, has known safety issues, and is unnecessary when one atomic script already does the job.

</details>

<details class="qa">
<summary><span class="qn">5</span>How to handle a hot key (one huge customer)? (local bucket with share of the quota, split key)</summary>

One giant customer can overload the single Redis key that holds their counter. Fix: split their key into N sub-keys (`client:1..N`), each holding 1/N of the quota, and pick one at random. Or give each app instance a local share of that customer's quota so most requests never touch Redis.

</details>

<details class="qa">
<summary><span class="qn">6</span>Where does the limiter live — client SDK, gateway, sidecar, service? Trade-offs.</summary>

**Gateway**: one place, protects everything, but can't see business details. **Sidecar**: close to each service, no code changes, but more moving parts. **Inside the service**: can use business rules (for example per-seller limits), but every team re-implements it. **Client SDK**: polite clients slow themselves down, but you can't trust clients. The usual answer is a coarse limit at the gateway and fine-grained limits in the service.

</details>

<details class="qa">
<summary><span class="qn">7</span>How do you test it? (inject <code>Clock</code>, deterministic time.)</summary>

Pass a `Clock` (or time supplier) in rather than calling `System.nanoTime()` directly. In tests, use a fake clock you move forward by hand: send 10 requests, check the 11th is rejected, advance time by 1 second, check it's allowed again. No `sleep`, no flaky tests.

</details>

<details class="qa">
<summary><span class="qn">8</span>Consistency across regions?</summary>

Keeping counters perfectly in sync across regions needs cross-region calls on every request, which is too slow. Instead, give each region its own share of the limit (for example 60% US, 40% EU) and enforce it locally. Optionally sync the usage numbers in the background every few seconds and adjust the shares. You accept a little over-admission in exchange for speed.

</details>
