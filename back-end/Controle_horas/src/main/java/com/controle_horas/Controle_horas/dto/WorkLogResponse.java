package com.controle_horas.Controle_horas.dto;

import java.time.Instant;
import java.util.UUID;

public record WorkLogResponse(
        UUID id,
        Instant entryAt,
        Instant exitAt,
        String closeReason
) {
}
