package com.controle_horas.Controle_horas.controller;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.when;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.controle_horas.Controle_horas.dto.HistoryDayResponse;
import com.controle_horas.Controle_horas.dto.HistoryResponse;
import com.controle_horas.Controle_horas.security.AuthRateLimitFilter;
import com.controle_horas.Controle_horas.security.JwtAuthenticationFilter;
import com.controle_horas.Controle_horas.service.HistoryExportService;
import com.controle_horas.Controle_horas.service.HistoryService;
import java.time.LocalDate;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest;
import org.springframework.context.annotation.ComponentScan;
import org.springframework.context.annotation.FilterType;
import org.springframework.http.MediaType;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

@WebMvcTest(
        controllers = HistoryController.class,
        excludeFilters = @ComponentScan.Filter(
                type = FilterType.ASSIGNABLE_TYPE,
                classes = {JwtAuthenticationFilter.class, AuthRateLimitFilter.class}))
class HistoryControllerTest {

    @Autowired
    private MockMvc mockMvc;

    @MockitoBean
    private HistoryService historyService;

    @MockitoBean
    private HistoryExportService historyExportService;

    @Test
    void getHistory_shouldRequireAuthentication() throws Exception {
        mockMvc.perform(get("/api/history")
                        .param("startDate", "2026-07-01")
                        .param("endDate", "2026-07-31"))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void getHistory_shouldReturnApiResponseEnvelope() throws Exception {
        when(historyService.getHistory(eq("arthur@example.com"), any(), any()))
                .thenReturn(new HistoryResponse(
                        LocalDate.of(2026, 7, 1),
                        LocalDate.of(2026, 7, 31),
                        530,
                        0,
                        0,
                        List.of(new HistoryDayResponse(
                                LocalDate.of(2026, 7, 14),
                                null,
                                null,
                                530,
                                0,
                                0,
                                true,
                                List.of()))));

        mockMvc.perform(get("/api/history")
                        .with(user("arthur@example.com"))
                        .param("startDate", "2026-07-01")
                        .param("endDate", "2026-07-31")
                        .accept(MediaType.APPLICATION_JSON))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.success").value(true))
                .andExpect(jsonPath("$.message").value("History retrieved successfully"))
                .andExpect(jsonPath("$.data.startDate").value("2026-07-01"))
                .andExpect(jsonPath("$.data.endDate").value("2026-07-31"))
                .andExpect(jsonPath("$.data.totalWorkedMinutes").value(530));
    }

    @Test
    void getHistory_shouldValidateInvalidPeriod() throws Exception {
        when(historyService.getHistory(eq("arthur@example.com"), any(), any()))
                .thenThrow(new IllegalArgumentException("startDate must be less than or equal to endDate."));

        mockMvc.perform(get("/api/history")
                        .with(user("arthur@example.com"))
                        .param("startDate", "2026-07-31")
                        .param("endDate", "2026-07-01")
                        .accept(MediaType.APPLICATION_JSON))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.success").value(false))
                .andExpect(jsonPath("$.message").value("startDate must be less than or equal to endDate."))
                .andExpect(jsonPath("$.data").doesNotExist());
    }
}
