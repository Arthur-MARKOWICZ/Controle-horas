package com.controle_horas.Controle_horas.dto;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

@Schema(description = "Dados para autenticação de usuário")
public record LoginRequest(
        @Schema(description = "E-mail cadastrado do usuário", example = "usuario@empresa.com")
        @NotBlank(message = "Email is required")
        @Email(message = "Email must be valid")
        String email,

        @Schema(description = "Senha de acesso", example = "Senha123!")
        @NotBlank(message = "Password is required")
        @Size(max = 72, message = "Password must have at most 72 characters")
        String password
) {
}
