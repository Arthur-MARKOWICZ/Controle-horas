package com.controle_horas.Controle_horas.controller;

import static org.mockito.Mockito.when;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.controle_horas.Controle_horas.dto.DashboardResponse;
import com.controle_horas.Controle_horas.security.JwtAuthenticationFilter;
import com.controle_horas.Controle_horas.service.DashboardService;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalTime;
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
        controllers = DashboardController.class,
        excludeFilters = @ComponentScan.Filter(
                type = FilterType.ASSIGNABLE_TYPE,
                classes = JwtAuthenticationFilter.class))
class DashboardControllerTest {

    @Autowired
    private MockMvc mockMvc;

    @MockitoBean
    private DashboardService dashboardService;

    @Test
    void getToday_shouldRequireAuthentication() throws Exception {
        mockMvc.perform(get("/api/dashboard/today"))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void getToday_shouldReturnApiResponseEnvelope() throws Exception {
        when(dashboardService.getToday("arthur@example.com"))
                .thenReturn(new DashboardResponse(
                        LocalDate.of(2026, 7, 14),
                        530,
                        LocalTime.of(8, 30),
                        LocalTime.of(17, 20),
                        "ENTRY",
                        Instant.parse("2026-07-14T20:20:00Z"),
                        450,
                        -80,
                        -80,
                        List.of()));

        mockMvc.perform(get("/api/dashboard/today")
                        .with(user("arthur@example.com"))
                        .accept(MediaType.APPLICATION_JSON))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.success").value(true))
                .andExpect(jsonPath("$.message").value("Dashboard retrieved successfully"))
                .andExpect(jsonPath("$.data.expectedExitAt").value("2026-07-14T20:20:00Z"))
                .andExpect(jsonPath("$.data.workedMinutesToday").value(450))
                .andExpect(jsonPath("$.data.balanceMinutesToday").value(-80))
                .andExpect(jsonPath("$.data.hourBankMinutes").value(-80));
    }
}
