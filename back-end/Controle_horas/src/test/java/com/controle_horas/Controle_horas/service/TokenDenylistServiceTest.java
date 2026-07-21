package com.controle_horas.Controle_horas.service;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

class TokenDenylistServiceTest {

    private static final Instant START = Instant.parse("2026-07-19T12:00:00Z");

    private MutableClock clock;
    private TokenDenylistService tokenDenylistService;

    @BeforeEach
    void setUp() {
        clock = new MutableClock(START);
        tokenDenylistService = new TokenDenylistService(clock);
    }

    @Test
    void revoke_shouldMarkTokenAsRevokedUntilExpiration() {
        tokenDenylistService.revoke("jti-1", START.plusSeconds(3600));

        assertThat(tokenDenylistService.isRevoked("jti-1")).isTrue();

        clock.advanceSeconds(3601);

        assertThat(tokenDenylistService.isRevoked("jti-1")).isFalse();
    }

    private static final class MutableClock extends Clock {

        private Instant instant;

        private MutableClock(Instant instant) {
            this.instant = instant;
        }

        private void advanceSeconds(long seconds) {
            instant = instant.plusSeconds(seconds);
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
