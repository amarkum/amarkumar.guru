# 07 · Configuration Sync Across Devices

## Interview question
Custom team problem: syncing configurations (settings/preferences) across a user's devices (phone, laptop, Echo, Kindle…). Answer design questions on conflicts, offline, and scale.

## Assumptions / clarification
- Config = set of key→value settings per user (e.g. `theme=dark`, `volume=7`), some device-specific, some global.
- Devices may be offline and edit locally; sync when back online.
- Last-writer-wins acceptable for most keys; some keys need merge (lists like "blocked contacts").
- Changes should reach other online devices within seconds (push).
- Millions of users, ~5 devices each, config size small (< 64 KB).

## Functional requirements
1. Device reads full config on start (`GET snapshot`).
2. Device pushes changes (delta) with its known version.
3. Server resolves conflicts and broadcasts to other devices.
4. Device pulls changes since version `v` (catch-up after offline).
5. Scope: global vs device-specific vs device-type keys.
6. History / rollback (optional).

## Non-functional requirements
- Eventual convergence: all devices end in the same state.
- Low latency propagation (< 2 s online).
- Works offline; battery/network friendly (deltas, not full blobs).
- Durable, highly available.

## CAP / consistency
- **AP + eventual consistency** — a device must be able to write while offline. Convergence guaranteed by deterministic conflict resolution (LWW with hybrid logical clock, or CRDT per key type).
- Server per-user sequence number gives a total order of accepted changes → simple catch-up.

## Core entities
`User`, `Device`, `ConfigEntry` (key, value, scope, timestamp HLC, deviceId), `ConfigDocument` (userId, version, entries), `Change` (seq, entry), `ConflictResolver`, `SyncService`, `ChangeLog`, `PushGateway`.

## IS-A / HAS-A
- `LastWriterWinsResolver`, `SetUnionResolver` **IS-A** `ConflictResolver`.
- `WebSocketPush`, `MobilePush` **IS-A** `PushGateway`.
- `ConfigDocument` **HAS-A** map of `ConfigEntry`; `SyncService` **HAS-A** `ChangeLog`, resolvers, `PushGateway`.

## UML diagram
```mermaid
classDiagram
    class Scope {
      <<enumeration>>
      GLOBAL
      DEVICE
    }
    class ConfigEntry {
      <<record>>
      +String key
      +String value
      +Scope scope
      +long hlc
      +String deviceId
      +boolean deleted
    }
    class Change {
      <<record>>
      +long seq
      +ConfigEntry entry
    }
    class SyncResult {
      <<record>>
      +long version
      +List~ConfigEntry~ applied
      +List~ConfigEntry~ overridden
    }
    class ConflictResolver {
      <<interface>>
      +resolve(ConfigEntry, ConfigEntry) ConfigEntry
    }
    class LastWriterWinsResolver {
      <<class>>
      +resolve(ConfigEntry, ConfigEntry) ConfigEntry
    }
    class SetUnionResolver {
      <<class>>
      +resolve(ConfigEntry, ConfigEntry) ConfigEntry
    }
    class PushGateway {
      <<interface>>
      +notify(String, String, List~Change~)
    }
    class ChangeLog {
      <<class>>
      -Map~String,List~ log
      +append(String, ConfigEntry) long
      +since(String, long) List~Change~
    }
    class SyncService {
      <<class>>
      -Map~String,Map~ docs
      -Map~String,Long~ versions
      -ChangeLog changeLog
      -Map~String,ConflictResolver~ resolverByPrefix
      -ConflictResolver defaultResolver
      -PushGateway push
      +snapshot(String) Map~String,ConfigEntry~
      +push(String, String, List~ConfigEntry~) SyncResult
      +pull(String, long) List~Change~
    }
    class ConfigDocument {
      <<class>>
      +String userId
      +long version
      +Map~String,ConfigEntry~ entries
    }
    ConflictResolver <|.. LastWriterWinsResolver
    ConflictResolver <|.. SetUnionResolver
    SyncService --> ChangeLog
    SyncService --> ConflictResolver
    SyncService --> PushGateway
    ConfigDocument *-- ConfigEntry
    ConfigEntry --> Scope
    Change --> ConfigEntry
    SyncResult --> "*" ConfigEntry
    ChangeLog --> "*" Change
    SyncService --> "*" ConfigEntry
```

## APIs
```
GET  /users/{u}/config?deviceId=d                    -> {version, entries}
POST /users/{u}/config/changes {deviceId, baseVersion, entries[]} -> {newVersion, applied[], overridden[]}
GET  /users/{u}/config/changes?since=123             -> [changes]
WS   /sync  (server → device: {version, changes[]})
```

## Design patterns
- **Strategy** – conflict resolution per key type.
- **Observer** – devices subscribe to user channel.
- **Memento / Event sourcing** – change log allows history and rollback.
- **Command** – each change is an immutable command replayable offline (outbox on device).

## SOLID mapping
- **S**: log storage vs resolution vs push delivery.
- **O**: new merge type = new resolver registered for key prefix.
- **D**: `SyncService` depends on `PushGateway` interface (WS/APNs/FCM).

## High-level flow
```mermaid
sequenceDiagram
  participant D as Device
  participant S as SyncService
  participant O as Other devices
  D->>D: Edit offline → local outbox (entry with HLC)
  D->>S: POST changes(baseVersion)
  loop each entry
    S->>S: winner = resolver.resolve(doc[key], incoming)
    S->>S: if incoming wins → append ChangeLog (seq++) → update doc
  end
  S-->>D: new version + server-side winners to apply
  S-)O: push via WebSocket
  O->>S: offline ones pull since=lastSeq on reconnect
```

## Concurrency
- Per-user serialization: all writes for a user go to one partition (DynamoDB key = userId; conditional write on version) or a per-user lock/actor.
- HLC (hybrid logical clock) avoids trusting device wall clocks; tie-break on deviceId → deterministic.
- Idempotency: entry id = deviceId + local counter; server ignores duplicates.

## Edge cases
- Device clock wrong by hours → HLC / server-assigned timestamp on receipt.
- Delete vs update conflict → tombstone entries with timestamps.
- Device offline for months → change log compacted → send full snapshot instead.
- Device-specific keys must not propagate (`Scope.DEVICE`).
- Schema version mismatch (old app) → ignore unknown keys, keep them.
- Large bursts (slider dragging) → debounce on device.

## End-to-end Java implementation
```java
import java.util.*;
import java.util.concurrent.*;

enum Scope { GLOBAL, DEVICE }

record ConfigEntry(String key, String value, Scope scope, long hlc, String deviceId, boolean deleted) {
    static ConfigEntry set(String k, String v, long hlc, String dev) { return new ConfigEntry(k, v, Scope.GLOBAL, hlc, dev, false); }
}
record Change(long seq, ConfigEntry entry) {}
record SyncResult(long version, List<ConfigEntry> applied, List<ConfigEntry> overridden) {}

interface ConflictResolver { ConfigEntry resolve(ConfigEntry current, ConfigEntry incoming); }

final class LastWriterWinsResolver implements ConflictResolver {
    public ConfigEntry resolve(ConfigEntry cur, ConfigEntry in) {
        if (cur == null) return in;
        int cmp = Long.compare(in.hlc(), cur.hlc());
        if (cmp == 0) cmp = in.deviceId().compareTo(cur.deviceId());   // deterministic tie-break
        return cmp > 0 ? in : cur;
    }
}

/** Values are comma-separated sets; merge = union (add-wins). */
final class SetUnionResolver implements ConflictResolver {
    public ConfigEntry resolve(ConfigEntry cur, ConfigEntry in) {
        if (cur == null) return in;
        Set<String> merged = new TreeSet<>(Arrays.asList(cur.value().split(",")));
        merged.addAll(Arrays.asList(in.value().split(",")));
        return new ConfigEntry(in.key(), String.join(",", merged), in.scope(), Math.max(cur.hlc(), in.hlc()), in.deviceId(), false);
    }
}

interface PushGateway { void notify(String userId, String excludeDevice, List<Change> changes); }

final class ChangeLog {
    private final Map<String, List<Change>> log = new ConcurrentHashMap<>();
    long append(String userId, ConfigEntry e) {
        List<Change> l = log.computeIfAbsent(userId, k -> new ArrayList<>());
        long seq = l.size() + 1L; l.add(new Change(seq, e)); return seq;
    }
    List<Change> since(String userId, long seq) {
        List<Change> l = log.getOrDefault(userId, List.of());
        return List.copyOf(l.subList((int) Math.min(seq, l.size()), l.size()));
    }
}

final class SyncService {
    private final Map<String, Map<String, ConfigEntry>> docs = new ConcurrentHashMap<>();
    private final Map<String, Long> versions = new ConcurrentHashMap<>();
    private final ChangeLog changeLog = new ChangeLog();
    private final Map<String, ConflictResolver> resolverByPrefix;
    private final ConflictResolver defaultResolver = new LastWriterWinsResolver();
    private final PushGateway push;

    SyncService(Map<String, ConflictResolver> resolverByPrefix, PushGateway push) {
        this.resolverByPrefix = Map.copyOf(resolverByPrefix); this.push = push;
    }

    Map<String, ConfigEntry> snapshot(String userId) { return Map.copyOf(docs.getOrDefault(userId, Map.of())); }

    SyncResult push(String userId, String deviceId, List<ConfigEntry> incoming) {
        Map<String, ConfigEntry> doc = docs.computeIfAbsent(userId, k -> new HashMap<>());
        List<ConfigEntry> applied = new ArrayList<>(), overridden = new ArrayList<>();
        List<Change> newChanges = new ArrayList<>();
        synchronized (doc) {                                   // per-user serialization
            for (ConfigEntry in : incoming) {
                if (in.scope() == Scope.DEVICE) continue;       // not synced
                ConfigEntry cur = doc.get(in.key());
                ConfigEntry winner = resolverFor(in.key()).resolve(cur, in);
                if (!winner.equals(cur)) {
                    doc.put(in.key(), winner);
                    newChanges.add(new Change(changeLog.append(userId, winner), winner));
                    applied.add(winner);
                } else overridden.add(cur);                     // device must adopt server value
            }
            versions.merge(userId, (long) newChanges.size(), Long::sum);
        }
        if (!newChanges.isEmpty()) push.notify(userId, deviceId, newChanges);
        return new SyncResult(versions.getOrDefault(userId, 0L), applied, overridden);
    }

    List<Change> pull(String userId, long sinceSeq) { return changeLog.since(userId, sinceSeq); }

    private ConflictResolver resolverFor(String key) {
        return resolverByPrefix.entrySet().stream().filter(e -> key.startsWith(e.getKey()))
                .map(Map.Entry::getValue).findFirst().orElse(defaultResolver);
    }
}

public class ConfigSyncDemo {
    public static void main(String[] args) {
        PushGateway ws = (u, ex, ch) -> System.out.println("push to " + u + " devices except " + ex + ": " + ch);
        SyncService svc = new SyncService(Map.of("blocked.", new SetUnionResolver()), ws);

        svc.push("u1", "phone", List.of(ConfigEntry.set("theme", "dark", 100, "phone")));
        // laptop was offline, made an older edit → loses
        SyncResult r = svc.push("u1", "laptop", List.of(ConfigEntry.set("theme", "light", 90, "laptop"),
                                                         ConfigEntry.set("blocked.users", "bob", 95, "laptop")));
        svc.push("u1", "phone", List.of(ConfigEntry.set("blocked.users", "eve", 120, "phone")));
        System.out.println("laptop overridden: " + r.overridden());
        System.out.println("final: " + svc.snapshot("u1"));
        System.out.println("catch-up since 1: " + svc.pull("u1", 1));
    }
}
```

## New requirements → how the class diagram evolves
| New requirement | Change |
|---|---|
| Per device-type config (all Echo devices) | `Scope.DEVICE_TYPE` + targeting in push. |
| Counters (e.g. usage count) | `GCounterResolver` (CRDT). |
| Rollback to yesterday | Rebuild doc from `ChangeLog` up to timestamp (event sourcing). |
| Admin policy overrides user (enterprise) | `PolicyLayer` merged on read — Chain of layers (default < policy < user). |
| E2E encryption | Server stores opaque values; resolution only by HLC. |
| Scale | Partition by userId; DynamoDB (doc) + DynamoDB Streams → push fan-out. |

## Amazon follow-up questions

Tap a question to see a simple answer.

<details class="qa">
<summary><span class="qn">1</span>Two devices change the same key offline — who wins and why is it deterministic?</summary>

Each change carries a hybrid logical clock (HLC) timestamp plus the device id. The newer timestamp wins, and if two are exactly equal the higher device id wins. Every server and device applies the same rule to the same data, so they all pick the same winner, with no randomness.

</details>

<details class="qa">
<summary><span class="qn">2</span>Why not trust device timestamps? What is a hybrid logical clock / vector clock?</summary>

Phone clocks can be wrong by minutes or even days, so 'latest time' could pick an old edit. A **hybrid logical clock** mixes real time with a counter: it never goes backwards and always moves past any time it has seen from others. A **vector clock** keeps a counter per device, so it can tell 'happened after' from 'happened at the same time', which is more accurate but bigger.

</details>

<details class="qa">
<summary><span class="qn">3</span>How does a device that's been offline for 6 months catch up?</summary>

The device sends its last known sequence number. If the change log still has everything since then, the server sends just those changes. If the log was trimmed and it's too old, the server sends a full snapshot of the current settings plus the latest version, and the device replaces its copy.

</details>

<details class="qa">
<summary><span class="qn">4</span>How do you push to 5 devices of 100M users? (Connection service, WebSocket gateway, SNS/FCM/APNs fallback.)</summary>

Each device keeps a WebSocket open to a connection service. A registry maps user → the servers holding their devices' connections. On a change, the sync service looks up that user and pushes to those servers. Devices that aren't connected get a silent push (APNs or FCM) that wakes them to pull.

</details>

<details class="qa">
<summary><span class="qn">5</span>How to handle deletes (tombstones, GC)?</summary>

You can't just remove a deleted key, because an offline device would sync it back. Instead, write a **tombstone** (key = deleted, with a timestamp). It syncs like any other change. After all devices have seen it (or after, say, 30 days), a clean-up job removes the tombstones.

</details>

<details class="qa">
<summary><span class="qn">6</span>When would you use CRDTs vs LWW?</summary>

**Last-writer-wins** is simple and fine for single values like 'theme = dark', where one side losing is OK. **CRDTs** are for data where both edits should be kept, like adding items to a list or set, or counters. They merge automatically with nothing lost, but they're more complex and larger.

</details>
