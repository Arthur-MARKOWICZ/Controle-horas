package com.controle_horas.Controle_horas.security;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.Iterator;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicInteger;
import org.springframework.stereotype.Component;

@Component
public class AuthRateLimitService {

    static final int MAX_ATTEMPTS = 10;
    static final Duration WINDOW = Duration.ofMinutes(15);

    private final ConcurrentHashMap<String, WindowCounter> attempts = new ConcurrentHashMap<>();
    private final Clock clock;

    public AuthRateLimitService() {
        this(Clock.systemUTC());
    }

    AuthRateLimitService(Clock clock) {
        this.clock = clock;
    }

    public boolean tryConsume(String key) {
        Instant now = clock.instant();
        cleanupExpired(now);

        WindowCounter counter = attempts.compute(key, (ignored, existing) -> {
            if (existing == null || !existing.isActive(now)) {
                return new WindowCounter(now);
            }
            return existing;
        });

        return counter.count.incrementAndGet() <= MAX_ATTEMPTS;
    }

    int currentCount(String key) {
        WindowCounter counter = attempts.get(key);
        if (counter == null || !counter.isActive(clock.instant())) {
            return 0;
        }
        return counter.count.get();
    }

    private void cleanupExpired(Instant now) {
        Iterator<Map.Entry<String, WindowCounter>> iterator = attempts.entrySet().iterator();
        while (iterator.hasNext()) {
            Map.Entry<String, WindowCounter> entry = iterator.next();
            if (!entry.getValue().isActive(now)) {
                iterator.remove();
            }
        }
    }

    private static final class WindowCounter {
        private final Instant windowStart;
        private final AtomicInteger count = new AtomicInteger(0);

        private WindowCounter(Instant windowStart) {
            this.windowStart = windowStart;
        }

        private boolean isActive(Instant now) {
            return windowStart.plus(WINDOW).isAfter(now);
        }
    }
}
