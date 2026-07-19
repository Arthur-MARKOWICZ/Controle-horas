package com.controle_horas.Controle_horas.dto;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.time.DayOfWeek;
import java.time.LocalTime;
import java.util.Set;
import java.util.UUID;

public record CreateUserRequest(
        @NotBlank(message = "Name is required")
        @Size(max = 120, message = "Name must be at most 120 characters")
        String name,

        @NotBlank(message = "Email is required")
        @Email(message = "Email must be valid")
        String email,

        @NotBlank(message = "Password is required")
        @Size(min = 8, max = 72, message = "Password must be between 8 and 72 characters")
        String password,

        @NotNull(message = "Role is required")
        String role,

        UUID managerId,

        LocalTime standardEntryTime,

        LocalTime standardExitTime,

        Boolean lunchEnabled,

        @Min(value = 0, message = "Lunch duration must be at least 0 minutes")
        @Max(value = 240, message = "Lunch duration must be at most 240 minutes")
        Integer lunchDurationMinutes,

        Set<DayOfWeek> workDays
) {
}
