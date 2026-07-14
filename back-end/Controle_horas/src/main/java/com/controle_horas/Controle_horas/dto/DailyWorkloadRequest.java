package com.controle_horas.Controle_horas.dto;

import jakarta.validation.constraints.NotNull;
import java.time.LocalTime;

public record DailyWorkloadRequest(
        @NotNull(message = "Standard entry time is required")
        LocalTime standardEntryTime,

        @NotNull(message = "Standard exit time is required")
        LocalTime standardExitTime
) {}
