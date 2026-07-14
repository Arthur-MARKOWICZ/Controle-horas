package com.controle_horas.Controle_horas.dto;

import java.util.UUID;

public record AuthResponse(
        String token,
        UUID userId,
        String name,
        String email
) {
}
