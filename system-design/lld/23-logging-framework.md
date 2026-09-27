# 23 · Logging Framework (like Log4j / SLF4J+Logback)

## Interview question
Design a logging framework. **No explicit requirements given** — you must drive requirement gathering.

## Assumptions / clarification (ask these)
- Log levels: TRACE < DEBUG < INFO < WARN < ERROR < FATAL; messages below configured level are dropped.
- Multiple destinations (appenders): console, file (with rotation), remote (Kafka/CloudWatch).
- Per-logger level (hierarchical names `com.amazon.cart` inherits from `com.amazon`).
- Formats: plain text pattern, JSON.
- Thread-safe; async option so logging doesn't slow the app.
- Context (requestId/traceId) via MDC.
- Config from file, changeable at runtime.

## Functional requirements
1. `Logger log = LoggerFactory.getLogger(MyClass.class)`; `log.info("msg {}", arg)`.
2. Level filtering (global + per logger).
3. Multiple appenders per logger; each with its own formatter & min level.
4. Log rotation by size/time.
5. MDC context fields.
6. Async logging with bounded buffer.

## Non-functional requirements
- Very low overhead when level disabled (no string building).
- Thread safe; no interleaved lines.
- Never crash the app if an appender fails.
- Extensible appenders/formatters.

## CAP / consistency
Local library. For centralized logging (ELK/CloudWatch), shipping is **AP** — best-effort, buffered; ordering per host by timestamp + sequence.

## Core entities
`LogLevel`, `LogEvent` (timestamp, level, loggerName, thread, message, args, throwable, mdc), `Logger`, `LoggerFactory` / `LoggerRegistry`, `Appender`, `Formatter`, `Filter`, `LoggerConfig`, `AsyncAppender`, `MDC`.

## IS-A / HAS-A
- `ConsoleAppender`, `FileAppender`, `RollingFileAppender`, `AsyncAppender` **IS-A** `Appender`.
- `PatternFormatter`, `JsonFormatter` **IS-A** `Formatter`.
- `Logger` **HAS-A** list of `Appender`s, parent `Logger`; `Appender` **HAS-A** `Formatter`; `AsyncAppender` **HAS-A** delegate `Appender` + queue.

## UML diagram
```mermaid
classDiagram
    class LogLevel {
      <<enumeration>>
      TRACE
      DEBUG
      INFO
      WARN
      ERROR
      FATAL
    }
    class LogEvent {
      <<record>>
      +Instant ts
      +LogLevel level
      +String logger
      +String thread
      +String message
      +Throwable error
      +Map~String,String~ mdc
    }
    class MDC {
      <<class>>
      +put(String, String)$
      +clear()$
      +copy()$ Map~String,String~
    }
    class Formatter {
      <<interface>>
      +format(LogEvent) String
    }
    class PatternFormatter {
      <<class>>
      +format(LogEvent) String
    }
    class JsonFormatter {
      <<class>>
      +format(LogEvent) String
    }
    class Appender {
      <<interface>>
      +append(LogEvent)
      +close()
    }
    class ConsoleAppender {
      <<class>>
      -Formatter f
      -LogLevel threshold
      +append(LogEvent)
    }
    class RollingFileAppender {
      <<class>>
      -Path file
      -long maxBytes
      -int maxFiles
      -Formatter f
      -Writer out
      -long written
      +RollingFileAppender(Path file,long maxBytes,int maxFiles,Formatter f) throws IOException
      +append(LogEvent)
      +close()
    }
    class AsyncAppender {
      <<class>>
      -BlockingQueue~LogEvent~ queue
      -Appender delegate
      -Thread worker
      -AtomicLong dropped
      -boolean running
      +append(LogEvent)
      +close()
    }
    class Logger {
      <<class>>
      -String name
      -Logger parent
      -LogLevel level
      -List~Appender~ appenders
      -boolean additive
      +setLevel(LogLevel)
      +addAppender(Appender)
      +setAdditive(boolean)
      +effectiveLevel() LogLevel
      +isEnabled(LogLevel) boolean
      +trace(String, Object[])
      +debug(String, Object[])
    }
    class LoggerFactory {
      <<class>>
      +root()$ Logger
      +getLogger(Class~?~)$ Logger
      +getLogger(String)$ Logger
    }
    Logger --> Logger : parent
    Logger o-- Appender
    Appender <|.. ConsoleAppender
    Appender <|.. RollingFileAppender
    Appender <|.. AsyncAppender
    AsyncAppender --> Appender : delegate
    ConsoleAppender --> Formatter
    RollingFileAppender --> Formatter
    Formatter <|.. PatternFormatter
    Formatter <|.. JsonFormatter
    LoggerFactory ..> Logger
    LogEvent --> LogLevel
    ConsoleAppender --> LogLevel
    AsyncAppender --> "*" LogEvent
    Logger --> LogLevel
```

## APIs
```java
Logger log = LoggerFactory.getLogger("com.amazon.cart");
log.info("Order {} placed by {}", orderId, userId);
log.error("Payment failed", exception);
MDC.put("requestId", rid);
LoggerFactory.configure(config);   // levels, appenders
```

## Design patterns
- **Chain of Responsibility** – event goes up logger hierarchy (additivity) / through filters.
- **Strategy** – formatters, rolling policies.
- **Observer** – appenders are subscribers of a logger.
- **Decorator** – `AsyncAppender` wraps any appender.
- **Singleton / Flyweight** – `LoggerFactory` caches one logger per name.
- **Factory** – appender creation from config.
- **Builder** – `LogEvent`.

## SOLID mapping
- **S**: logger filters & dispatches, appender writes, formatter formats.
- **O**: new `KafkaAppender` or `XmlFormatter` without changes.
- **L**: any appender swappable.
- **I**: `Appender` minimal.
- **D**: logger depends on `Appender` interface.

## High-level flow
```mermaid
flowchart TD
  L["log.info(fmt, args)"] --> E{"isEnabled(INFO)?<br/>effective level"}
  E -->|no| X[drop]
  E -->|yes| B[build LogEvent<br/>+MDC, thread, time]
  B --> H[logger + ancestors<br/>while additive]
  H --> AP[each appender<br/>threshold / filter]
  AP --> AA[AsyncAppender enqueue] --> WT[worker thread] --> FM[formatter.format] --> OUT[console / file / network]
```

## Concurrency
- Logger registry: `ConcurrentHashMap.computeIfAbsent`.
- Appenders: `synchronized append` or single writer thread (async) → no interleaved lines.
- Async queue bounded: policy when full — block, drop DEBUG/INFO, or discard oldest; count dropped events.
- MDC via `ThreadLocal` (copy into event at creation; propagate across executors explicitly).
- Level changes at runtime: `volatile` fields.

## Edge cases
- Appender throws (disk full) → catch, report to internal status logger, continue.
- `null` message/args; fewer args than `{}`.
- Exception as last arg → print stack trace.
- Shutdown → flush async queue (shutdown hook).
- Log rotation while writing → under the appender's lock.
- Expensive toString in args → only formatted if enabled.

## End-to-end Java implementation
```java
import java.io.*;
import java.nio.file.*;
import java.time.Instant;
import java.util.*;
import java.util.concurrent.*;
import java.util.concurrent.atomic.AtomicLong;

enum LogLevel { TRACE, DEBUG, INFO, WARN, ERROR, FATAL }

record LogEvent(Instant ts, LogLevel level, String logger, String thread, String message, Throwable error, Map<String, String> mdc) {}

final class MDC {
    private static final ThreadLocal<Map<String, String>> CTX = ThreadLocal.withInitial(HashMap::new);
    private MDC() {}
    static void put(String k, String v) { CTX.get().put(k, v); }
    static void clear() { CTX.get().clear(); }
    static Map<String, String> copy() { return Map.copyOf(CTX.get()); }
}

interface Formatter { String format(LogEvent e); }

final class PatternFormatter implements Formatter {
    public String format(LogEvent e) {
        StringBuilder sb = new StringBuilder().append(e.ts()).append(' ').append(String.format("%-5s", e.level()))
                .append(" [").append(e.thread()).append("] ").append(e.logger());
        if (!e.mdc().isEmpty()) sb.append(' ').append(e.mdc());
        sb.append(" - ").append(e.message());
        if (e.error() != null) { StringWriter sw = new StringWriter(); e.error().printStackTrace(new PrintWriter(sw)); sb.append('\n').append(sw); }
        return sb.toString();
    }
}

final class JsonFormatter implements Formatter {
    public String format(LogEvent e) {
        return String.format("{\"ts\":\"%s\",\"level\":\"%s\",\"logger\":\"%s\",\"thread\":\"%s\",\"msg\":\"%s\",\"mdc\":%s%s}",
                e.ts(), e.level(), e.logger(), e.thread(), esc(e.message()), mdcJson(e.mdc()),
                e.error() == null ? "" : ",\"error\":\"" + esc(e.error().toString()) + "\"");
    }
    private static String esc(String s) { return s.replace("\\", "\\\\").replace("\"", "\\\""); }
    private static String mdcJson(Map<String, String> m) {
        StringJoiner j = new StringJoiner(",", "{", "}");
        m.forEach((k, v) -> j.add("\"" + esc(k) + "\":\"" + esc(v) + "\""));
        return j.toString();
    }
}

interface Appender extends AutoCloseable {
    void append(LogEvent e);
    default void close() {}
}

final class ConsoleAppender implements Appender {
    private final Formatter f; private final LogLevel threshold;
    ConsoleAppender(Formatter f, LogLevel threshold) { this.f = f; this.threshold = threshold; }
    public synchronized void append(LogEvent e) {
        if (e.level().compareTo(threshold) < 0) return;
        (e.level().compareTo(LogLevel.WARN) >= 0 ? System.err : System.out).println(f.format(e));
    }
}

final class RollingFileAppender implements Appender {
    private final Path file; private final long maxBytes; private final int maxFiles; private final Formatter f;
    private Writer out; private long written;
    RollingFileAppender(Path file, long maxBytes, int maxFiles, Formatter f) throws IOException {
        this.file = file; this.maxBytes = maxBytes; this.maxFiles = maxFiles; this.f = f; open();
    }
    private void open() throws IOException {
        out = Files.newBufferedWriter(file, StandardOpenOption.CREATE, StandardOpenOption.APPEND);
        written = Files.size(file);
    }
    public synchronized void append(LogEvent e) {
        try {
            String line = f.format(e) + System.lineSeparator();
            if (written + line.length() > maxBytes) roll();
            out.write(line); out.flush(); written += line.length();
        } catch (IOException ex) { System.err.println("[logging] file appender failed: " + ex); }   // never throw to app
    }
    private void roll() throws IOException {
        out.close();
        for (int i = maxFiles - 1; i >= 1; i--) {
            Path src = Paths.get(file + "." + i), dst = Paths.get(file + "." + (i + 1));
            if (Files.exists(src)) Files.move(src, dst, StandardCopyOption.REPLACE_EXISTING);
        }
        Files.move(file, Paths.get(file + ".1"), StandardCopyOption.REPLACE_EXISTING);
        open();
    }
    public synchronized void close() { try { out.close(); } catch (IOException ignored) {} }
}

/** Decorator: moves I/O off the caller thread. Drops TRACE..INFO when full, blocks for WARN+. */
final class AsyncAppender implements Appender {
    private final BlockingQueue<LogEvent> queue; private final Appender delegate; private final Thread worker;
    private final AtomicLong dropped = new AtomicLong(); private volatile boolean running = true;
    AsyncAppender(Appender delegate, int capacity) {
        this.delegate = delegate; this.queue = new ArrayBlockingQueue<>(capacity);
        worker = new Thread(this::drain, "async-log"); worker.setDaemon(true); worker.start();
    }
    public void append(LogEvent e) {
        if (e.level().compareTo(LogLevel.WARN) >= 0) {
            try { queue.put(e); } catch (InterruptedException ie) { Thread.currentThread().interrupt(); }
        } else if (!queue.offer(e)) dropped.incrementAndGet();
    }
    private void drain() {
        while (running || !queue.isEmpty()) {
            try { LogEvent e = queue.poll(100, TimeUnit.MILLISECONDS); if (e != null) delegate.append(e); }
            catch (InterruptedException ie) { running = false; }
            catch (RuntimeException ex) { System.err.println("[logging] appender error " + ex); }
        }
    }
    public void close() {
        running = false;
        try { worker.join(2000); } catch (InterruptedException e) { Thread.currentThread().interrupt(); }
        delegate.close();
    }
    long dropped() { return dropped.get(); }
}

final class Logger {
    private final String name; private final Logger parent;
    private volatile LogLevel level;                      // null = inherit
    private final List<Appender> appenders = new CopyOnWriteArrayList<>();
    private volatile boolean additive = true;

    Logger(String name, Logger parent) { this.name = name; this.parent = parent; }

    void setLevel(LogLevel l) { level = l; }
    void addAppender(Appender a) { appenders.add(a); }
    void setAdditive(boolean a) { additive = a; }

    LogLevel effectiveLevel() { for (Logger l = this; l != null; l = l.parent) if (l.level != null) return l.level; return LogLevel.INFO; }
    boolean isEnabled(LogLevel l) { return l.compareTo(effectiveLevel()) >= 0; }

    void trace(String m, Object... a) { log(LogLevel.TRACE, m, a); }
    void debug(String m, Object... a) { log(LogLevel.DEBUG, m, a); }
    void info(String m, Object... a)  { log(LogLevel.INFO, m, a); }
    void warn(String m, Object... a)  { log(LogLevel.WARN, m, a); }
    void error(String m, Object... a) { log(LogLevel.ERROR, m, a); }

    private void log(LogLevel lvl, String msg, Object... args) {
        if (!isEnabled(lvl)) return;                                         // cheap path: no formatting
        Throwable t = (args.length > 0 && args[args.length - 1] instanceof Throwable th) ? th : null;
        LogEvent e = new LogEvent(Instant.now(), lvl, name, Thread.currentThread().getName(), interpolate(msg, args), t, MDC.copy());
        for (Logger l = this; l != null; l = l.additive ? l.parent : null)
            for (Appender a : l.appenders) {
                try { a.append(e); } catch (RuntimeException ex) { System.err.println("[logging] " + ex); }
            }
    }

    private static String interpolate(String msg, Object[] args) {
        if (msg == null) return "null";
        StringBuilder sb = new StringBuilder(); int argIdx = 0, i = 0;
        while (i < msg.length()) {
            int j = msg.indexOf("{}", i);
            if (j < 0 || argIdx >= args.length || args[argIdx] instanceof Throwable) { sb.append(msg, i, msg.length()); break; }
            sb.append(msg, i, j).append(args[argIdx++]); i = j + 2;
        }
        return sb.toString();
    }
}

final class LoggerFactory {
    private static final Map<String, Logger> LOGGERS = new ConcurrentHashMap<>();
    private static final Logger ROOT = new Logger("ROOT", null);
    static { ROOT.setLevel(LogLevel.INFO); }
    private LoggerFactory() {}
    static Logger root() { return ROOT; }
    static Logger getLogger(Class<?> c) { return getLogger(c.getName()); }
    static Logger getLogger(String name) {
        return LOGGERS.computeIfAbsent(name, n -> {
            int dot = n.lastIndexOf('.');
            Logger parent = dot < 0 ? ROOT : getLogger(n.substring(0, dot));
            return new Logger(n, parent);
        });
    }
}

public class LoggingDemo {
    public static void main(String[] args) throws Exception {
        Path file = Files.createTempFile("app", ".log");
        AsyncAppender asyncFile = new AsyncAppender(new RollingFileAppender(file, 10_000, 3, new JsonFormatter()), 1024);
        LoggerFactory.root().addAppender(new ConsoleAppender(new PatternFormatter(), LogLevel.TRACE));
        LoggerFactory.root().addAppender(asyncFile);
        LoggerFactory.getLogger("com.amazon.cart").setLevel(LogLevel.DEBUG);

        Logger log = LoggerFactory.getLogger("com.amazon.cart.CheckoutService");
        MDC.put("requestId", "req-42");
        log.debug("Cart has {} items", 3);                 // enabled via parent com.amazon.cart
        log.info("Order {} placed by {}", "O-1", "amar");
        log.error("Payment failed for {}", "O-1", new IllegalStateException("card declined"));
        LoggerFactory.getLogger("com.amazon.search").debug("hidden (root is INFO)");

        asyncFile.close();
        System.out.println("--- file ---\n" + Files.readString(file));
    }
}
```

## New requirements → how the class diagram evolves
| New requirement | Change |
|---|---|
| Ship to Kafka/CloudWatch | `KafkaAppender` (batching, retries) wrapped by `AsyncAppender`. |
| Filter by marker/regex | `Filter` interface (ACCEPT/DENY/NEUTRAL) chain on appender. |
| Time-based rotation + gzip | `RollingPolicy` strategy (`SizeBased`, `TimeBased`, `Composite`). |
| Runtime config reload | `ConfigWatcher` re-applies levels (volatile fields). |
| Sampling (log 1% of DEBUG) | `SamplingFilter`. |
| PII masking | `MaskingFormatter` decorator. |

## Amazon follow-up questions

Tap a question to see a simple answer.

<details class="qa">
<summary><span class="qn">1</span>How do you avoid cost when DEBUG is disabled? (Level check before building; <code>{}</code> placeholders; suppliers.)</summary>

Check the level first: `if (!isDebugEnabled()) return;` costs almost nothing. Use `{}` placeholders so the message string is only built when the log is actually written, and for expensive values pass a supplier (`() -> dumpState()`) that's only called if needed.

</details>

<details class="qa">
<summary><span class="qn">2</span>How do you guarantee lines don't interleave across threads?</summary>

Each log line is built fully into one string first, then written in one call. The writer is either synchronized, or a single background thread does all writing from a queue, so lines never mix.

</details>

<details class="qa">
<summary><span class="qn">3</span>What happens when the async queue is full? Trade-offs.</summary>

Choose: **block** the app until there's space (safe but slows the app), **drop** new messages, maybe keeping only WARN and ERROR, or **drop the oldest**. Most systems drop low-level logs and count how many were dropped, because slowing the app for logs is usually worse.

</details>

<details class="qa">
<summary><span class="qn">4</span>How does logger hierarchy / additivity work?</summary>

Logger names form a tree: `com.shop.order` is a child of `com.shop`, which is a child of root. If a logger has no level set, it uses its parent's. With *additivity* on, a message is also sent to the parents' appenders, so root's console appender prints everything unless you turn that off.

</details>

<details class="qa">
<summary><span class="qn">5</span>How do you propagate requestId across thread pools? (MDC copy into tasks.)</summary>

The MDC stores values like `requestId` per thread. When you hand work to a thread pool, the new thread doesn't have it. So wrap each task: copy the MDC map when submitting, set it at the start of the task, and clear it at the end.

</details>

<details class="qa">
<summary><span class="qn">6</span>What if the disk is full — should the app crash?</summary>

No: logging should never take down the app. Catch the write error, stop writing to that file, print a warning to stderr once, and keep counting dropped logs. Also alarm on disk space, and use log rotation with size limits so it rarely happens.

</details>

<details class="qa">
<summary><span class="qn">7</span>How would you build centralized logging for 10k hosts? (Agent → Kafka → ES/S3; sampling; retention tiers.)</summary>

Each host runs a small agent (like Fluent Bit) that reads log files and ships them to Kafka. From Kafka, logs go to Elasticsearch for recent searching (a few days) and to S3 for cheap long-term storage. Sample noisy DEBUG logs, and keep ERROR logs longer than INFO.

</details>
