package com.controle_horas.Controle_horas.dto;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import java.time.DayOfWeek;
import java.time.LocalTime;
import java.util.Set;

public record DailyWorkloadRequest(
        @NotNull(message = "Standard entry time is required")
        LocalTime standardEntryTime,

        @NotNull(message = "Standard exit time is required")
        LocalTime standardExitTime,

        @NotNull(message = "Lunch enabled flag is required")
        Boolean lunchEnabled,

        @NotNull(message = "Lunch duration is required")
        @Min(value = 0, message = "Lunch duration must be at least 0 minutes")
        @Max(value = 240, message = "Lunch duration must be at most 240 minutes")
        Integer lunchDurationMinutes,

        @NotEmpty(message = "At least one work day must be selected")
        Set<DayOfWeek> workDays
) {}
