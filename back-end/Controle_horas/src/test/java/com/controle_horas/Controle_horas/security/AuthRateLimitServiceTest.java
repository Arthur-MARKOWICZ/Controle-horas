package com.controle_horas.Controle_horas.security;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

class AuthRateLimitServiceTest {

    private static final Instant START = Instant.parse("2026-07-19T12:00:00Z");

    private MutableClock clock;
    private AuthRateLimitService authRateLimitService;

    @BeforeEach
    void setUp() {
        clock = new MutableClock(START);
        authRateLimitService = new AuthRateLimitService(clock);
    }

    @Test
    void tryConsume_shouldAllowUpToMaxAttempts() {
        String key = "127.0.0.1|/api/auth/login|user@example.com";

        for (int attempt = 1; attempt <= AuthRateLimitService.MAX_ATTEMPTS; attempt++) {
            assertThat(authRateLimitService.tryConsume(key)).isTrue();
        }

        assertThat(authRateLimitService.tryConsume(key)).isFalse();
        assertThat(authRateLimitService.currentCount(key)).isEqualTo(AuthRateLimitService.MAX_ATTEMPTS + 1);
    }

    @Test
    void tryConsume_shouldResetAfterWindowExpires() {
        String key = "127.0.0.1|/api/auth/register";

        for (int attempt = 1; attempt <= AuthRateLimitService.MAX_ATTEMPTS; attempt++) {
            assertThat(authRateLimitService.tryConsume(key)).isTrue();
        }
        assertThat(authRateLimitService.tryConsume(key)).isFalse();

        clock.advance(AuthRateLimitService.WINDOW.plusSeconds(1));

        assertThat(authRateLimitService.tryConsume(key)).isTrue();
        assertThat(authRateLimitService.currentCount(key)).isEqualTo(1);
    }

    private static final class MutableClock extends Clock {

        private Instant instant;

        private MutableClock(Instant instant) {
            this.instant = instant;
        }

        private void advance(java.time.Duration duration) {
            instant = instant.plus(duration);
        }

        @Override
        public ZoneOffset getZone() {
            return ZoneOffset.UTC;
        }

        @Override
        public Clock withZone(java.time.ZoneId zone) {
            return Clock.fixed(instant, zone);
        }

        @Override
        public Instant instant() {
            return instant;
        }
    }
}
