package com.controle_horas.Controle_horas.dto;

public record CurrentUserResponse(
        java.util.UUID id,
        String name,
        String email,
        String role
) {
}
