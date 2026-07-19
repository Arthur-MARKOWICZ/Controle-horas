package com.controle_horas.Controle_horas.dto;

import java.time.DayOfWeek;
import java.time.LocalTime;
import java.util.Set;
import java.util.UUID;

public record UserResponse(
        UUID id,
        String name,
        String email,
        String role,
        UUID managerId,
        String managerName,
        UUID createdById,
        int dailyWorkloadMinutes,
        LocalTime standardEntryTime,
        LocalTime standardExitTime,
        boolean lunchEnabled,
        int lunchDurationMinutes,
        Set<DayOfWeek> workDays
) {
}
