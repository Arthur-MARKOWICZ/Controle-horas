package com.controle_horas.Controle_horas.service;

import java.time.Clock;
import java.time.Instant;
import java.util.Iterator;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import org.springframework.stereotype.Service;

@Service
public class TokenDenylistService {

    private final ConcurrentHashMap<String, Instant> denylist = new ConcurrentHashMap<>();
    private final Clock clock;

    public TokenDenylistService(Clock clock) {
        this.clock = clock;
    }

    public void revoke(String tokenId, Instant expiresAt) {
        if (tokenId == null || tokenId.isBlank() || expiresAt == null) {
            return;
        }
        Instant now = clock.instant();
        cleanupExpired(now);
        if (expiresAt.isAfter(now)) {
            denylist.put(tokenId, expiresAt);
        }
    }

    public boolean isRevoked(String tokenId) {
        if (tokenId == null || tokenId.isBlank()) {
            return false;
        }
        Instant now = clock.instant();
        cleanupExpired(now);
        Instant expiresAt = denylist.get(tokenId);
        return expiresAt != null && expiresAt.isAfter(now);
    }

    private void cleanupExpired(Instant now) {
        Iterator<Map.Entry<String, Instant>> iterator = denylist.entrySet().iterator();
        while (iterator.hasNext()) {
            Map.Entry<String, Instant> entry = iterator.next();
            if (!entry.getValue().isAfter(now)) {
                iterator.remove();
            }
        }
    }
}
